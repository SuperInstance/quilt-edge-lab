#!/usr/bin/env node
// interop.mjs — wrap the promoted quilt-edge-lab artifact into ONE
// fleet-state@v1 envelope, emit envelope.json, verify locally.
// No deps, node >= 18. Lane2 PoC (W2.4). Field cites: schema/fleet-state.v1.md
// in the shallow-cloned edge-ledger, mapped in ./NOTES.md.
//
// SIGNING DOCTRINE (README.md:10-12,37; schema rule 5, :55-60): production HMAC
// keys live OUTSIDE the agent's writable context, injected by the launcher via
// EDGE_LEDGER_HMAC_KEY / EDGE_LEDGER_KEYFILE (src/envelope.mjs:21-36). This PoC
// uses a THROWAWAY key only to exercise the hmac-sha256 sig shape — nothing
// sealed here is production testimony.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { seal, verifySig, verifyChain, canonical, sha256 } from "./vendor/edge-ledger/src/envelope.mjs";
import { EnvelopeStore } from "./vendor/edge-ledger/src/store.mjs";

export const NODE = "quilt-edge-lab";
export const ARTIFACT_URL =
  "https://quilt-edge-lab.casey-digennaro.workers.dev/saved/saved/run_30_42_1000_b1cc25c0.json";
export const EXPECTED_CHAIN_TAIL = "21c225f9e7320974"; // the promoted E-CF-1 run's cell state hash
export const POC_KEY =
  process.env.EDGE_LEDGER_HMAC_KEY ?? "lane2-poc-throwaway-key-NOT-production";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
export const artifactPath = () => here("./artifacts/run_30_42_1000_b1cc25c0.json");
export const envelopePath = () => here("./envelope.json");

export function loadArtifact(path = artifactPath()) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// One saved quilt artifact = one node update (NOTES.md thesis L1): a
// state-delta envelope (:36) whose tip is the cell chain_tail (:26) and whose
// result carries the artifact body verbatim.
export function wrapArtifact(artifact, { seq = 1, prevEnv = null, signer = { key: POC_KEY } } = {}) {
  const tail = artifact?.body?.chain_tail;
  if (typeof tail !== "string" || !/^[0-9a-f]{16}$/.test(tail))
    throw new Error(`refusing to seal: body.chain_tail missing/malformed (${JSON.stringify(tail)})`);
  // tail-pin gate: the promotion registry pinned this run's cell state hash; a
  // different tail under the same saved key is the double-spend shape —
  // rejected loudly, never repaired silently (rule 3, :47-49; store.mjs:36).
  if (tail !== EXPECTED_CHAIN_TAIL)
    throw new Error(
      `FORK/tamper: artifact ${artifact.key} offers chain_tail ${tail}, pinned promotion is ${EXPECTED_CHAIN_TAIL} — refusing to seal`
    );
  return seal({
    node: NODE,
    seq,
    prevEnv,
    tip: tail,
    kind: "state-delta",
    payload: { op: "PROMOTE", addr: artifact.key, result: artifact.body },
    signer,
  });
}

function main() {
  const artifact = loadArtifact();
  console.log(`artifact: ${artifact.key} (fetched from ${ARTIFACT_URL})`);
  console.log(`  chain_tail=${artifact.body.chain_tail} colo=${artifact.body.colo} rule=${artifact.body.rule} seed=${artifact.body.seed} ticks=${artifact.body.ticks}`);

  const env = wrapArtifact(artifact);
  writeFileSync(envelopePath(), JSON.stringify(env, null, 2) + "\n");
  console.log(`\nsealed -> ${envelopePath()} (${canonical(env).length}B canonical, cap 64KiB :64-66)`);

  const results = [];
  const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`[${ok ? "ok" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`); };

  // 1. emitted envelope parses
  let parsed;
  try { parsed = JSON.parse(readFileSync(envelopePath(), "utf8")); check("envelope.json parses", true); }
  catch (e) { check("envelope.json parses", false, e.message); }

  // 2. sig verifies (src/envelope.mjs:52-58)
  const sig = verifySig(env, POC_KEY);
  check("sig verifies (HMAC over canonical core)", sig.ok, `mode=${sig.mode}`);

  // 3. chain verifies (src/envelope.mjs:61-71)
  const chain = verifyChain([env]);
  check("chain verifies (genesis, prev=null)", chain.ok, `len=${chain.len} tip=${String(chain.tip).slice(0, 16)}…`);

  // 4. embedded cell state hash equals the pinned promotion tail
  check(`tip === pinned chain_tail ${EXPECTED_CHAIN_TAIL}`, env.tip === EXPECTED_CHAIN_TAIL);

  // 5. full store interop: ingest + re-verify (src/store.mjs:28-72)
  const store = new EnvelopeStore();
  const ing = store.ingest(env, { key: POC_KEY });
  const va = store.verifyAll();
  check("store ingest + verifyAll", ing.ok && va.ok, JSON.stringify(va));

  // 6. tamper self-check: flip ONE tail char -> wrapper must refuse loudly
  const tampered = structuredClone(artifact);
  tampered.body.chain_tail = EXPECTED_CHAIN_TAIL.slice(0, -1) + (EXPECTED_CHAIN_TAIL.endsWith("4") ? "5" : "4");
  let loud = null;
  try { wrapArtifact(tampered); } catch (e) { loud = e; }
  check("tampered artifact rejected loudly", !!loud, loud ? loud.message : "NOT REJECTED (BUG)");

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? "INTEROP FAIL" : "INTEROP OK"}: ${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
