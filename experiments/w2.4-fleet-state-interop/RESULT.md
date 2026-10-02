# RESULT — lane2: fleet-state@v1 interop PoC (W2.4)

**Verdict: SEALED FAIL on Task 3 (pins).** The two-failure budget rule fired on
the "make pins pass" step (two distinct test-code bugs, both chai-isms that do
not exist in `node:assert`). Per rule, the FAIL is sealed verbatim below and no
third fix attempt was made. Everything else completed with receipts; the seal
is scoped to P1 only — P2 and P3 pass.

## Claims table (receipts over claims)

| # | claim | command | output / file | status |
|---|---|---|---|---|
| 1 | Study repo cloned shallow at pinned commit | `git clone --depth 1 https://github.com/SuperInstance/edge-ledger edge-ledger` then `git -C edge-ledger log -1 --format='%H %ci'` | `edge-ledger/`, commit `516533b0f9cc4bc054cbae91c28545888422125f` (2026-09-30) | ✅ |
| 2 | Promoted E-CF-1 artifact fetched; `chain_tail` = task pin | `curl -fsSL 'https://quilt-edge-lab.casey-digennaro.workers.dev/saved/saved/run_30_42_1000_b1cc25c0.json' -o artifacts/run_30_42_1000_b1cc25c0.json` | `artifacts/run_30_42_1000_b1cc25c0.json` — `body.chain_tail: "21c225f9e7320974"` | ✅ |
| 3 | Envelope field map + 5-line interop thesis, every field `file:line`-cited | (written) | `NOTES.md` | ✅ |
| 4 | FAIL-first honored: pins written and run BEFORE `interop.mjs` existed | `node --test test/interop.pins.mjs` (red run) | `ERR_MODULE_NOT_FOUND: file:///tmp/zlanes/lane2/interop.mjs` — tests 3, pass 0, fail 1 (module-level). Mandated red state (culture rule 3), not counted against the budget | ✅ |
| 5 | Artifact wrapped into a schema-conformant `fleet-state@v1` envelope; emitted | `node interop.mjs` | `envelope.json` (404B canonical ≤ 64KiB), node `quilt-edge-lab`, seq 1 genesis, kind `state-delta`, tip `21c225f9e7320974`, sig `hmac-sha256:…`, canonical-chain tip `34063cb079f31c4d…` | ✅ |
| 6 | Local verification: parses, chain verifies, sig verifies, embedded tail = pin, store ingests + `verifyAll` ok, tamper rejected loudly | `node interop.mjs` (same run, self-checks 1–6) | same run stdout — `INTEROP OK: 6/6 checks passed` | ✅ (self-check receipt; independent pin = claim 8) |
| 7 | Study repo unmodified by lane2 work (regression) | `node --test edge-ledger/test/edge.pins.mjs` | tests 8, pass 8, fail 0 | ✅ |
| 8 | Pins P1–P3 pass | `node --test test/interop.pins.mjs` | `receipts-pins-fail.txt`, exit 1 — **P2 ✔ P3 ✔ P1 ✖** | ❌ SEALED |

Honest scoping of the seal: P1 aborted at its 4th assertion (`assert.typeOf`),
so P1's later assertions (tip/kind/payload shape, sig regex, 64KiB,
`envelope.json` deep-equal) were **not exercised by the pin** — they are only
covered by interop.mjs's self-check (claim 6). P2 (chain + sig + store
idempotency via the reference implementation) and P3 (tampered tail rejected
loudly at BOTH layers — wrapper gate quotes both tails; store rejects
`FORK at quilt-edge-lab#1: stored … vs offered …`) are green receipts.

## Sealed FAIL (verbatim, `receipts-pins-fail.txt`)

Failure 1 of 2 on the step (first green attempt; key lines from the run tail —
full output not captured to a file before the fix edit):

```
✖ P3 tampered artifact (one flipped tail char) is rejected loudly
  code: 'ERR_INVALID_ARG_TYPE'
      at internalMatch (node:assert:855:11)
      at strict.match (node:assert:897:3)
      at Object.<anonymous> (file:///tmp/zlanes/lane2/test/interop.pins.mjs:84:12)
```

cause: `assert.match(err.message, tampered.body.chain_tail)` — second argument
must be a RegExp; fixed with `new RegExp(...)` (edit applied).

Failure 2 of 2 on the step (second green attempt = final, sealed; complete and
verbatim, `receipts-pins-fail.txt`):

```
✖ P1 envelope conforms to schema fields cited in NOTES.md (6.343296ms)
✔ P2 chain + sig verification passes via the reference implementation (7.26244ms)
✔ P3 tampered artifact (one flipped tail char) is rejected loudly (9.267858ms)
ℹ tests 3
ℹ suites 0
ℹ pass 2
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 304.492636

✖ failing tests:

test at test/interop.pins.mjs:14:1
✖ P1 envelope conforms to schema fields cited in NOTES.md (6.343296ms)
  TypeError: assert.typeOf is not a function
      at TestContext.<anonymous> (file:///tmp/zlanes/lane2/test/interop.pins.mjs:22:10)
      at Test.runInAsyncScope (node:internal/test_runner/test_runner:227:14)
```

cause (diagnosed, not fixed): `assert.typeOf` is chai, not `node:assert` —
pin lines 22 and ~29 need `typeof env.node === "string"` style checks. One-line
fix deliberately left unapplied: the budget sealed the step after failure 2.

## The exact follow-up that makes this production-shaped

1. **Who signs:** the quilt-edge-lab Cloudflare Worker itself, at promotion
   time. The `/saved` PUT that promotes a run IS the ledger-grade mutation, so
   the worker seals the `state-delta` envelope in the same request that writes
   the KV entry — promotion witness = envelope witness, one transaction. The
   agent never signs (doctrine: key outside the agent's writable context,
   `README.md:10-12`).
2. **Where the key lives:** never in code or agent-writable storage. On the
   worker: a Cloudflare Secret binding `EDGE_LEDGER_HMAC_KEY`
   (`wrangler secret put`), minted and rotated by the fleet key custodian
   (captain/snowball identity plane — same doctrine as
   `quilt-canvas-tui/bridge/signing.mjs`). On bare-metal nodes: a 0400 keyfile
   via `EDGE_LEDGER_KEYFILE` — `loadKey` already refuses group/other-writable
   files (`src/envelope.mjs:27-31`). Verifiers (the DRAWN EmDash ingest plugin)
   hold the verify key in their manifest-gated Dynamic Worker config; sort
   emdash-cms/emdash#449 (MCP Bearer 500) before machine auth.
3. **Seq continuity:** the PoC's genesis `seq: 1` becomes "current seq + 1",
   with the node's tip and chain persisted per the D1/KV mapping
   (`README.md:38`: one D1 table per node, KV tip per node for fast boot).
4. **Un-seal P1:** replace the two chai-isms with `node:assert` natives and
   re-run `node --test test/interop.pins.mjs` — the assertions' substance is
   already covered green by claims 5–7; only the pin's own API misuse blocks
   the receipt.

## Files

```
/tmp/zlanes/lane2/
  NOTES.md                       field map (file:line) + 5-line thesis
  interop.mjs                    wrapper + local verifier (no deps, node ≥ 18)
  envelope.json                  the sealed fleet-state@v1 envelope
  artifacts/run_30_42_1000_b1cc25c0.json   fetched promotion witness
  test/interop.pins.mjs          P1–P3 (P2/P3 green; P1 sealed)
  receipts-pins-fail.txt         verbatim sealed-fail output
  edge-ledger/                   shallow study clone @ 516533b0
```

## Harvest verification (2026-10-02 ~03:05, snowball pulse)

PoC relocated from /tmp/zlanes/lane2 into this repo with edge-ledger vendored
under `vendor/edge-ledger/` (pinned 516533b0, VENDORED-PIN.md). All named
commands RERUN in the new location by an independent pass:

- `node interop.mjs` → INTEROP OK: 6/6 checks passed
- `node --test vendor/edge-ledger/test/edge.pins.mjs` → 8/8 pass (vendored tree unmodified)
- `node --test test/interop.pins.mjs` → P2 ✔ P3 ✔ P1 ✖ — sealed FAIL reproduced
  verbatim (chai `assert.typeOf` in pin lines 22/29; un-seal = one-line
  `typeof` fix per the follow-up list, deliberately left sealed)

Envelope and artifact byte-identical to the lane originals (`sha256sum`
checked at copy time).
