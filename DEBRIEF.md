# DEBRIEF — quilt-edge-lab wave 1 (2026-10-02)

Substrate: one Cloudflare Worker (`quilt-edge-lab`, colo SIN throughout),
D1 ledger `quilt-edge-lab` (schema mirrors the fleet's harness-experiments
conservation ledger), KV `RECEIPTS`, R2 `quilt-edge-lab-saves`.
Culture: receipts over claims; prereg sealed before runs (PREREG.md); FAIL-first
local pin before any cloud number was believed.

## What happened (honest, including the failures)

1. **E-CF-1 PASS.** 3× /run → identical tails, equal to the local node pin
   `21c225f9e7320974`. Determinism confirmed across TWO runtimes (edge isolate
   and local node v24). Cross-colo stays INCONCLUSIVE — all runs landed SIN;
   per the prereg's own escape hatch, same-path repetition cannot audit absence.
   Next probe for cross-colo: Workers cannot choose colo client-side, but a
   second worker deployed to a different region route (smart routing /
   workers.dev vs custom domain) or a Queues consumer in another region can
   force the diversity. That is wave-2 item W2.1.

2. **E-CF-2 failed three times before it passed — this is the finding.**
   - v1: `Date.now()` read 0ms wall on a 10k-tick run.
   - v2: `performance.now()` read 0 on 100k ticks (25.6M cell-ops <1μs is
     physically impossible → the clock, not the compute, is broken).
   - v3: accumulated 20×10k repeats still 0ms total → **clocks are frozen per
     request in the isolate** (Spectre-class clamp). Named, sealed, done.
   - v4 PASS via different path: client clock. 200×10k ticks e2e 37.348s and
     37.355s across two different rules/seeds — reproducible to ±0.006s.
     Baseline e2e 0.505–0.658s → upper bound ≈ **18.4μs/tick @ width 128**
     (≈7ns/cell-update). Practical note: >30s e2e loses the response body
     (subrequest wall limit) — cap future bench arms at ~120 repeats.

3. **E-CF-3 PASS.** The γ/η/efficiency generated columns match hand arithmetic
   exactly (950/50=19; 950/520=1.8269…). The conservation ledger schema — the
   quilt-dba cost/value culture — computes correctly at the edge in OUR D1,
   zero collision with the fleet's harness-experiments rows.

4. **E-CF-4 PASS — the loop Kimi asked for closes.** A run receipt promoted
   from ephemeral KV to durable R2 (`saved/run_….json`), read back,
   chain_tail hash-intact (`21c225f9e7320974`), ledger witness sealed
   (`exp_1790880109015_k84870`). This is the save-when-useful mechanism:
   every promoted artifact carries its own receipt chain head in-body.

5. **E-CF-5 BLOCKED, unblocks named.** Workers AI: `10001 Unable to
   authenticate` — token needs `account:ai` scope (or account AI entitlement).
   External providers: none provisioned to this worker. Fleet precedent exists:
   the harness-experiments ledger records `deepinfra/bytedance/seed-2.0-mini`
   runs, so a provider-key path is proven in-fleet — the lab needs a secret
   provisioned (never committed; `wrangler secret put`).

## Roadmap — wave 2 (in order)

- **W2.1 Cross-colo determinism.** Deploy the same worker to a second route
  (or drive via a Queue consumer pinned to another region). Claim under test:
  tails identical across colos. (E-CF-1 residual.)
- **W2.2 Model iterator (needs one secret).** With a provider key as a worker
  secret: `/iterate` = prompt-template × N seeds × backend model, each
  iteration receipt-chained (prompt hash + response hash), ledger rows with
  real tokens_in/out (γ then measures actual spend — the conservation law
  becomes a COST LAW). Candidates: deepinfra seed-2.0-mini (fleet precedent),
  or Workers AI if the token gains `account:ai`.
- **W2.3 Semantic canon sort.** Use embeddings ( Workers AI `@cf/baai/…` or
  external) to canon-sort cell states before chaining → a receipt chain that
  is invariant to presentation order. Directly imports kit.mjs canon culture;
  NULL result would itself mint a canon-rule candidate (same shape as the
  Determinism Lab NULL branch).
- **W2.4 Quilt runtime interop.** quilt-cloudflare (the fleet's D1 cell
  runtime) already persists cells; wire /promote to also emit a
  `quilt/cell-receipt@v1` envelope per edge-ledger's fleet-state@v1 travel
  shape → our saved artifacts become fleet-syncable nodes.
- **W2.5 Auto-promotion rule.** Replace manual /promote with a threshold rule
  (efficiency ≥ k AND quality ≥ q on the ledger row) inside the worker —
  "saved when found useful" becomes self-acting. Receipt: the rule firing on
  E-CF-1's own row.

## Wheel-spinning protocol (standing)
Every wave: prereg → runs → receipts/waveN-receipts.json → DEBRIEF entry →
roadmap re-rank → push. Failure receipts ride the repo forever (R8 lineage).
