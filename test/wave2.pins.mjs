// Wave-2 pins (W2.5 auto-promotion + W2.1-prep colo aggregation + rule 150).
// These import the REAL src/worker.js and drive its fetch() against an
// in-memory mock env (D1 generated columns recomputed per schema.sql, KV and
// R2 as Maps) — no cloud dependency, no copied worker code.
//
// Culture notes:
// - P4's reference computes rule 150 by boolean algebra (l XOR c XOR r), a
//   DIFFERENT path from the worker's bit-table lookup; the digest/chaining
//   helpers are verbatim copies of tools/local-check.mjs (same algorithm by
//   design — the independence under test is the rule table, not the hash).
// - std==0 over identical seeds is expected, never PASS evidence; every pin
//   here checks a structural/behavioral property, not zero variance.

import { test } from "node:test";
import assert from "node:assert/strict";

const worker = (await import("../src/worker.js")).default;

// ---------- mock env: D1 (schema.sql arithmetic) + KV + R2 ----------

function makeEnv({ kv = {} } = {}) {
  const rows = [];
  const kvMap = new Map(Object.entries(kv));
  const r2Map = new Map();
  let autoId = 0;

  // generated columns, recomputed exactly per schema.sql
  const derive = (r) => {
    const gamma = (r.tokens_in ?? 0) + (r.tokens_out ?? 0) + ((r.wall_clock_seconds ?? 0) * 10) + ((r.api_calls ?? 1) * 50);
    const eta = ((r.items_completed ?? 0) * 100) + ((r.quality_score ?? 0) * 500) + ((r.lessons_extracted ?? 0) * 200);
    const done = (r.items_completed ?? 0), failed = (r.items_failed ?? 0);
    return {
      gamma, eta,
      efficiency: gamma > 0 ? (eta * 1.0) / gamma : 0,
      success_rate: done + failed > 0 ? (done * 1.0) / (done + failed) : 0,
    };
  };

  const DB = {
    prepare(sql) {
      const stmt = {
        params: [],
        bind(...params) { stmt.params = params; return stmt; },
        async run() {
          if (/^INSERT INTO experiments/i.test(sql)) {
            const [experiment_id, timestamp, category, description, hypothesis, model,
              batch_size, concurrent_agents, provider, tokens_in, tokens_out,
              wall_clock_seconds, api_calls, items_completed, items_failed,
              quality_score, lessons_extracted, notes, tags] = stmt.params;
            const r = { id: ++autoId, experiment_id, timestamp, category, description, hypothesis, model, batch_size, concurrent_agents, provider, tokens_in, tokens_out, wall_clock_seconds, api_calls, items_completed, items_failed, quality_score, lessons_extracted, notes, tags };
            Object.assign(r, derive(r));
            rows.push(r);
            return {};
          }
          if (/^UPDATE experiments SET notes/i.test(sql)) {
            const [notes, experiment_id] = stmt.params;
            const r = rows.find((x) => x.experiment_id === experiment_id);
            if (r) r.notes = notes;
            return {};
          }
          throw new Error("mock D1: unsupported run(): " + sql);
        },
        async all() {
          if (/^SELECT/i.test(sql) && /WHERE experiment_id = \?/.test(sql)) {
            const cols = sql.match(/SELECT (.+?) FROM/i)[1].split(",").map((s) => s.trim());
            const r = rows.find((x) => x.experiment_id === stmt.params[0]);
            return { results: r ? [Object.fromEntries(cols.map((c) => [c, r[c]]))] : [] };
          }
          if (/ORDER BY id DESC LIMIT 10/i.test(sql)) {
            return { results: [...rows].sort((a, b) => b.id - a.id).slice(0, 10) };
          }
          throw new Error("mock D1: unsupported all(): " + sql);
        },
      };
      return stmt;
    },
  };

  const RECEIPTS = {
    async get(key, type) {
      const v = kvMap.get(key);
      if (v === undefined) return null;
      return type === "json" ? (typeof v === "string" ? JSON.parse(v) : v) : v;
    },
    async put(key, val) { kvMap.set(key, val); },
    async list({ prefix = "", cursor } = {}) {
      return { keys: [...kvMap.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
    },
  };
  const SAVES = {
    async put(key, val) { r2Map.set(key, val); },
    async get(key) { return r2Map.has(key) ? { text: async () => r2Map.get(key) } : null; },
  };

  return { DB, RECEIPTS, SAVES, __rows: rows, __kv: kvMap, __r2: r2Map };
}

async function call(env, path, init) {
  const res = await worker.fetch(new Request(`https://lab.test${path}`, init), env, {});
  return { status: res.status, body: await res.json() };
}

// ---------- shared synthetic fixtures ----------

const RUN_ID = "run_150_42_300_w2pin";
const RUN_TAIL = "w2pintail000001"; // arbitrary; only equality matters
function envWithRun() {
  return makeEnv({
    kv: { [`run:${RUN_ID}`]: JSON.stringify({ colo: "SIN", chain_tail: RUN_TAIL, ticks: 300, rule: 150, seed: 42 }) },
  });
}

// Synthetic row engineered to derived efficiency EXACTLY 20 (hand arithmetic:
// gamma = 0+0+0*10+1*50 = 50; eta = 5*100 + 1.0*500 + 0*200 = 1000; 1000/50 = 20)
const EFF20_ROW = {
  category: "wave2-pin", description: "P2 synthetic efficiency-20 row", hypothesis: "",
  model: "pin", run_id: RUN_ID, batch_size: 1, concurrent_agents: 1,
  tokens_in: 0, tokens_out: 0, wall_clock_seconds: 0, api_calls: 1,
  items_completed: 5, items_failed: 0, quality_score: 1.0, lessons_extracted: 0,
  notes: "", tags: "wave2,pin",
};
const post = (body) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// ---------- pins ----------

test("P1 — AUTO_PROMOTE off by default: same row, no ?auto=1 → no R2 write, no promotion row", async () => {
  const env = envWithRun();
  const { status, body } = await call(env, "/ledger/append", post(EFF20_ROW));
  assert.equal(status, 200);
  assert.equal(body.derived.efficiency, 20); // row DOES clear both bars …
  assert.equal(body.auto_promote, null); // … but opt-in flag absent → nothing fired
  assert.equal(env.__r2.size, 0); // no R2 key written
  assert.equal(env.__rows.length, 1); // only the appended row, no promotion witness row
  assert.ok(!env.__rows[0].notes.includes("AUTO_PROMOTE"));
});

test("P2 — auto=1 on the efficiency-20 row fires: R2 key written + witness ledger row + notes updated", async () => {
  const env = envWithRun();
  const { status, body } = await call(env, "/ledger/append?auto=1", post(EFF20_ROW));
  assert.equal(status, 200);
  assert.equal(body.derived.efficiency, 20);
  assert.equal(body.derived.quality_score, 1.0);

  const ap = body.auto_promote;
  assert.equal(ap.fired, true);
  assert.equal(ap.saved, true);
  assert.equal(ap.key, `saved/${RUN_ID}.json`);
  assert.match(ap.witness, /^exp_/);

  const artifact = JSON.parse(env.__r2.get(ap.key));
  assert.equal(artifact.chain_tail, RUN_TAIL); // same artifact body as /promote
  assert.equal(artifact.promoted_from, RUN_ID);
  assert.equal(artifact.colo, "SIN");

  const appended = env.__rows.find((r) => r.experiment_id === body.inserted);
  assert.ok(appended.notes.includes(`AUTO_PROMOTE witness=${ap.witness}`), `notes carry witness: ${appended.notes}`);

  const promoRow = env.__rows.find((r) => r.experiment_id === ap.witness);
  assert.equal(promoRow.category, "promotion");
  assert.ok(promoRow.tags.split(",").includes("auto"));
});

test("P5 — thresholds are AND (both must clear): auto=1 does not fire on near-misses", async () => {
  // efficiency 15.0 >= 15 but quality 0.5 < 0.8 (eta = 500+250 = 750, 750/50 = 15)
  const lowQ = { ...EFF20_ROW, quality_score: 0.5 };
  const envA = envWithRun();
  const a = await call(envA, "/ledger/append?auto=1", post(lowQ));
  assert.equal(a.body.derived.efficiency, 15);
  assert.equal(a.body.auto_promote.fired, false);
  assert.match(a.body.auto_promote.reasons.join("; "), /quality_score 0\.5 < 0\.8/);
  assert.equal(envA.__r2.size, 0);

  // quality 0.9 >= 0.8 but efficiency 11 < 15 (eta = 100+450 = 550, 550/50 = 11)
  const lowE = { ...EFF20_ROW, items_completed: 1, quality_score: 0.9 };
  const envB = envWithRun();
  const b = await call(envB, "/ledger/append?auto=1", post(lowE));
  assert.equal(b.body.derived.efficiency, 11);
  assert.equal(b.body.auto_promote.fired, false);
  assert.match(b.body.auto_promote.reasons.join("; "), /efficiency 11 < 15/);
  assert.equal(envB.__r2.size, 0);
});

test("P3 — /colo-report aggregates run:* receipts per colo (count + nunique tails)", async () => {
  const run = (colo, tail) => JSON.stringify({ colo, chain_tail: tail, ticks: 10, rule: 30, seed: 1 });
  const env = makeEnv({
    kv: {
      "run:a": run("SIN", "t1"),
      "run:b": run("SIN", "t1"), // same colo, same tail → tails stays 1
      "run:c": run("SIN", "t2"),
      "run:d": run("SJC", "t3"),
      "other:x": run("XXX", "t9"), // not run:* — must be ignored by the prefix scan
    },
  });
  const { status, body } = await call(env, "/colo-report");
  assert.equal(status, 200);
  assert.deepEqual(body.colo, {
    SIN: { count: 3, tails: 2 },
    SJC: { count: 1, tails: 1 },
  });
  assert.equal(body.keys_scanned, 4);
});

// ---------- P4 reference: digest/chaining copied from tools/local-check.mjs ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fnv1a64(str) {
  let h1 = 0x811c9dc5, h2 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c; h2 ^= 0;
    const l1 = h1, l2 = h2;
    h1 = Math.imul(l1, 0x1b3) >>> 0;
    h2 = (Math.imul(l2, 0x1b3) + Math.imul(l1, 0x100) + Math.floor(Math.imul(l1, 0x1b3) / 0x100000000)) >>> 0;
    h2 = (h2 + ((l2 * 0x10000000) >>> 0)) >>> 0;
  }
  const pad = (x) => x.toString(16).padStart(8, "0");
  return pad(h2) + pad(h1);
}
function stateDigest(state) {
  let s = "";
  for (let i = 0; i < state.length; i++) s += state[i] ? "1" : "0";
  return fnv1a64(s);
}
// rule 150 by boolean algebra: new cell = left XOR center XOR right.
// (Wolfram class III; DIFFERENT path from the worker's `(150 >> idx) & 1` table.)
function xor150(state, width) {
  const next = new Uint8Array(width);
  for (let i = 0; i < width; i++) {
    next[i] = state[(i - 1 + width) % width] ^ state[i] ^ state[(i + 1) % width];
  }
  return next;
}

test("P4 — rule 150 evolution matches an inline XOR-based reference, full chain", async () => {
  const p = { seed: 42, ticks: 300, width: 64 };
  const { status, body } = await call(makeEnv(), `/run?rule=150&seed=${p.seed}&ticks=${p.ticks}&width=${p.width}`);
  assert.equal(status, 200);
  assert.equal(body.rule, 150);
  assert.equal(body.chain.length, p.ticks);

  // reference evolution (independent rule path, same digest/chaining algorithm)
  const rng = mulberry32(p.seed);
  let ref = new Uint8Array(p.width);
  for (let i = 0; i < p.width; i++) ref[i] = rng() < 0.5 ? 1 : 0;
  let prev = fnv1a64("GENESIS_QUILT_EDGE_LAB");
  for (let t = 1; t <= p.ticks; t++) {
    ref = xor150(ref, p.width);
    const sd = stateDigest(ref);
    const row = body.chain[t - 1];
    assert.equal(row.t, t);
    assert.equal(row.sd, sd, `state digest diverged at t=${t}`);
    prev = fnv1a64(`${prev}|${t}|${sd}`);
    assert.equal(row.r, prev, `chain hash diverged at t=${t}`);
  }
  assert.equal(body.chain_tail, prev);
});

test("P6 — regression: rule 30 sealed wave-1 pin still reproduces locally", async () => {
  const { status, body } = await call(makeEnv(), "/run?rule=30&seed=42&ticks=1000&width=128");
  assert.equal(status, 200);
  assert.equal(body.chain_tail, "21c225f9e7320974"); // sealed local pin (tools/local-check.mjs, E-CF-1)
});
