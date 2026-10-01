// test/interop.pins.mjs — FAIL-first pins for the lane2 interop PoC.
// Written BEFORE interop.mjs exists (culture rule 3); first run must fail.
// P1 envelope conforms to the schema fields cited in ../NOTES.md
// P2 chain + sig verification passes (reference impl accepts it)
// P3 a TAMPERED artifact (one flipped tail char) is rejected LOUDLY at both
//    layers: the wrapper's tail-pin gate, and the store's fork rejection
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wrapArtifact, loadArtifact, artifactPath, POC_KEY, EXPECTED_CHAIN_TAIL, NODE } from "../interop.mjs";
import { seal, verifyChain, verifySig, canonical, sha256 } from "../vendor/edge-ledger/src/envelope.mjs";
import { EnvelopeStore } from "../vendor/edge-ledger/src/store.mjs";

test("P1 envelope conforms to schema fields cited in NOTES.md", () => {
  const artifact = loadArtifact(artifactPath());
  const env = wrapArtifact(artifact);

  // schema field — schema/fleet-state.v1.md:22
  assert.equal(env.schema, "fleet-state@v1");
  // node field — :23; one chain per node (rule 1 :41-43)
  assert.equal(env.node, NODE);
  assert.typeOf(env.node, "string");
  // seq field — :24; genesis is 1 (rule 2 :44-46, store.mjs:40)
  assert.equal(env.seq, 1);
  // prev field — :25; null for genesis (rule 1 :41-43)
  assert.equal(env.prev, null);
  // tip field — :26; the local ledger tip hash at seal time = cell chain_tail
  assert.equal(env.tip, "21c225f9e7320974");
  assert.equal(env.tip, artifact.body.chain_tail);
  // kind field — :27; state-delta row :36; heartbeat MUST NOT carry result (:38)
  assert.equal(env.kind, "state-delta");
  // payload field — :28,:36; state-delta preimage {op, addr, result}
  assert.deepEqual(Object.keys(env.payload).sort(), ["addr", "op", "result"]);
  assert.typeOf(env.payload.op, "string");
  assert.typeOf(env.payload.addr, "string");
  assert.deepEqual(env.payload.result, artifact.body, "artifact body rides verbatim");
  assert.equal(env.payload.addr, artifact.key);
  // sig field — :29, rule 5 :55-60; hmac-sha256:<64hex> over canonical core
  assert.match(env.sig, /^hmac-sha256:[0-9a-f]{64}$/);
  // bounded size — rule 7 :64-66
  assert.ok(canonical(env).length <= 64 * 1024, `canonical ${canonical(env).length}B <= 64KiB`);

  // the emitted envelope.json on disk IS the sealed envelope (interop.mjs writes it)
  const onDisk = JSON.parse(readFileSync(new URL("../envelope.json", import.meta.url), "utf8"));
  assert.deepEqual(onDisk, env, "envelope.json equals the deterministically re-sealed envelope");
});

test("P2 chain + sig verification passes via the reference implementation", () => {
  const env = wrapArtifact(loadArtifact());

  // sig round-trip — src/envelope.mjs:52-58
  assert.deepEqual(verifySig(env, POC_KEY), { ok: true, mode: "signed" });
  assert.equal(verifySig(env, "wrong-key").ok, false, "wrong key must not verify");

  // per-node chain — src/envelope.mjs:61-71
  const v = verifyChain([env]);
  assert.equal(v.ok, true);
  assert.equal(v.len, 1);
  assert.equal(v.tip, sha256(canonical(env)));

  // full store interop: ingest, idempotent redelivery, verifyAll — src/store.mjs:28-72
  const store = new EnvelopeStore();
  assert.equal(store.ingest(env, { key: POC_KEY }).ok, true);
  const again = store.ingest(env, { key: POC_KEY });
  assert.equal(again.ok, true);
  assert.equal(again.dedup, true, "exact redelivery is an acked no-op");
  assert.deepEqual(store.verifyAll(), { ok: true, nodes: 1 });

  // the promotion witness stays reachable: embedded tail is the pinned one
  assert.equal(env.payload.result.chain_tail, EXPECTED_CHAIN_TAIL);
});

test("P3 tampered artifact (one flipped tail char) is rejected loudly", () => {
  const artifact = loadArtifact();

  // layer 1 — wrapper tail-pin gate: refuses to seal a tail that is not the pinned promotion
  const tampered = structuredClone(artifact);
  const tail = tampered.body.chain_tail;
  tampered.body.chain_tail = tail.slice(0, -1) + (tail.endsWith("4") ? "5" : "4"); // flip ONE char
  assert.notEqual(tampered.body.chain_tail, artifact.body.chain_tail, "tamper actually flipped a char");
  assert.throws(() => wrapArtifact(tampered), (err) => {
    assert.match(err.message, /FORK/);
    assert.match(err.message, /21c225f9e7320974/, "expected tail quoted");
    assert.match(err.message, new RegExp(tampered.body.chain_tail), "offending tail quoted");
    return true;
  }, "wrapper must reject loudly, quoting both tails");

  // layer 2 — store fork rejection: same (node, seq), different hash — src/store.mjs:31-37
  const good = wrapArtifact(artifact);
  const forged = seal({
    node: NODE, seq: 1, kind: "state-delta",
    payload: { op: good.payload.op, addr: good.payload.addr, result: tampered.body },
    signer: { key: POC_KEY },
  }); // sealed as if the tampered artifact were legit — the store must still catch it
  const store = new EnvelopeStore();
  assert.equal(store.ingest(good, { key: POC_KEY }).ok, true);
  const r = store.ingest(forged, { key: POC_KEY });
  assert.equal(r.ok, false);
  assert.match(r.why, new RegExp(`FORK at ${NODE}#1`));
  assert.match(r.why, /stored [0-9a-f]{12} vs offered [0-9a-f]{12}/, "hashes quoted");
});
