#!/usr/bin/env node
// tools/pin_promote.mjs — regression pin for quilt-edge-lab POST /promote
//
//   node tools/pin_promote.mjs                 -> "PIN-PASS"        (exit 0) when the FIXED worker
//                                                  returns quality_score === 0.5 for an omitted field
//   node tools/pin_promote.mjs --against-buggy  -> "BUG-REPRODUCED"  (exit 0) when the PRE-FIX
//                                                  `+x ?? y` logic yields quality_score === null
//                                                  exit 1 if it does NOT fail
//
// env overrides:
//   EDGE_LAB_WORKER        path to the fixed worker   (default: ../edge-lab/src/worker.js)
//   EDGE_LAB_WORKER_BUGGY  path to the pre-fix worker (optional; else the `+x ?? y` expression is re-run)
//   PIN_BUGGY=1            same as --against-buggy
//
// node v22, ESM, zero deps (node: stdlib only).

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN_ID = "8f31c0de-0000-4000-8000-000000000001";

const argv = process.argv.slice(2);
const againstBuggy = argv.includes("--against-buggy") || process.env.PIN_BUGGY === "1";

const FIXED_WORKER = process.env.EDGE_LAB_WORKER
  ? path.resolve(process.env.EDGE_LAB_WORKER)
  : path.resolve(HERE, "..", "edge-lab", "src", "worker.js");

const BUGGY_WORKER = process.env.EDGE_LAB_WORKER_BUGGY
  ? path.resolve(process.env.EDGE_LAB_WORKER_BUGGY)
  : null;

// ---------------------------------------------------------------- env mock
function makeEnv() {
  const kv = new Map([
    [`run:${RUN_ID}`, {
      run_id: RUN_ID,
      colo: "SIN",
      chain_tail: "21c225f9e7320974",
      ticks: 1000,
      rule: 30,
      seed: 42,
    }],
  ]);

  const puts = [];   // R2 put() recorder
  const runs = [];   // D1 run() recorder

  const stmt = (sql) => ({
    bind: (...args) => ({
      run: async () => { runs.push({ sql, args }); return { success: true, results: [{ id: runs.length }], meta: { last_row_id: runs.length, changes: 1 } }; },
      first: async () => ({ id: runs.length }),
      all: async () => ({ results: [{ id: runs.length }] }),
    }),
    run: async () => { runs.push({ sql, args: [] }); return { success: true, results: [{ id: runs.length }], meta: { last_row_id: runs.length, changes: 1 } }; },
    first: async () => ({ id: runs.length }),
    all: async () => ({ results: [{ id: runs.length }] }),
  });

  return {
    puts, runs,
    RECEIPTS: {
      get: async (key, type) => {
        const v = kv.get(key);
        if (v === undefined) return null;
        return type === "json" ? v : JSON.stringify(v);
      },
    },
    SAVES: {
      put: async (key, value) => { puts.push({ key, value }); return true; },
    },
    DB: { prepare: stmt },
  };
}

const CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
};

// ---------------------------------------------------------------- runner
async function loadWorker(file) {
  const mod = await import(pathToFileURL(file).href);
  const handler = mod.default?.fetch ?? mod.fetch ?? mod.default;
  if (typeof handler !== "function") {
    throw new Error(`no fetch handler exported by ${file}`);
  }
  return handler;
}

async function postPromote(handler, env) {
  const request = new Request("https://quilt-edge-lab.test/promote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // NOTE: quality_score intentionally OMITTED — this is the repro.
    body: JSON.stringify({ run_id: RUN_ID }),
  });
  const res = await handler(request, env, CTX);
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { __unparsable: text }; }
  return { status: res.status, parsed };
}

// The pre-fix expression, re-run verbatim against the same omitted body.
function simulateBuggyExpression(body) {
  const quality = +body.quality_score ?? 0.5; // eslint-disable-line no-sequences
  return JSON.parse(JSON.stringify({ quality_score: quality })).quality_score;
}

// ---------------------------------------------------------------- main
async function main() {
  if (!againstBuggy) {
    // ---- FIXED path: assert quality_score === 0.5
    const env = makeEnv();
    const handler = await loadWorker(FIXED_WORKER);
    const { status, parsed } = await postPromote(handler, env);

    const ok =
      status === 200 &&
      Number.isFinite(parsed.quality_score) &&
      parsed.quality_score === 0.5;

    if (ok) {
      console.log("PIN-PASS");
      console.log(`  worker=${FIXED_WORKER}`);
      console.log(`  status=${status} quality_score=${parsed.quality_score} saved=${parsed.saved} key=${parsed.key}`);
      process.exit(0);
    }
    console.error("PIN-FAIL");
    console.error(`  worker=${FIXED_WORKER}`);
    console.error(`  status=${status} quality_score=${JSON.stringify(parsed.quality_score)} (expected 0.5)`);
    console.error(`  body=${JSON.stringify(parsed)}`);
    process.exit(1);
  }

  // ---- BUGGY path: the assertion MUST fail, and specifically with null.
  let quality;
  if (BUGGY_WORKER) {
    const env = makeEnv();
    const handler = await loadWorker(BUGGY_WORKER);
    const { parsed } = await postPromote(handler, env);
    quality = parsed.quality_score;
  } else {
    quality = simulateBuggyExpression({ run_id: RUN_ID }); // quality_score omitted
  }

  const assertionHolds =
    Number.isFinite(quality) && quality === 0.5; // the PIN assertion

  if (assertionHolds) {
    // The bug did NOT reproduce -> the pin is worthless / bug already gone.
    console.error("PIN-FAIL: assertion unexpectedly held against buggy logic");
    console.error(`  quality_score=${JSON.stringify(quality)} (expected null)`);
    process.exit(1);
  }

  if (quality === null) {
    console.log("BUG-REPRODUCED");
    console.log(`  source=${BUGGY_WORKER ?? "in-file expression: +body.quality_score ?? 0.5"}`);
    console.log(`  quality_score=null (NaN -> JSON null); assertion correctly fails`);
    process.exit(0);
  }

  console.error("PIN-FAIL: buggy logic failed the assertion but not with null");
  console.error(`  quality_score=${JSON.stringify(quality)} (expected null)`);
  process.exit(1);
}

main().catch((err) => {
  console.error("PIN-ERROR:", err && err.stack ? err.stack : err);
  process.exit(2);
});
