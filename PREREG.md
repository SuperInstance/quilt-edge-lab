# PREREG — quilt-edge-lab wave 1 (sealed 2026-10-02 before any measured run)

Culture: predictions sealed BEFORE runs; receipts over claims; device string on
every number (here: `cloudflare-worker colo=<IATA>`); a zero-variance claim
without different-path confirmation is INCONCLUSIVE, never PASSED.

## E-CF-1 · edge-determinism (the headline)
- **Question**: does a seeded elementary-CA iterator produce a bit-identical
  receipt chain across DIFFERENT edge colos?
- **Protocol**: `GET /run?rule=30&seed=42&ticks=1000&width=128` invoked ≥3
  times (distinct invocations, likely distinct colos; colo recorded per run).
  Compare via `/compare`.
- **H1**: all chain_tails equal AND (where full chains stored) every row equal
  → DETERMINISTIC_ACROSS_COLOS.
- **H2 (the honest escape hatch)**: if a run lands on the same colo every time,
  result is DETERMINISTIC_SAME_COLO = INCONCLUSIVE for the cross-colo claim
  (rule: same-path control can only confirm a fault, not audit absence).
- Prediction: H1 holds. Pure JS isolate + integer CA + explicit seed → no
  fp, no time dependence, no atomics in the chain path.

## E-CF-2 · tick-throughput
- **Question**: wall-clock per tick at the edge, per colo.
- **Protocol**: ticks=10000, rule 30, width 128, seeds {42, 7, 2026}; report
  ms_per_tick distribution by colo.
- Prediction: sub-0.05 ms/tick median; spread across colos < 2×.

## E-CF-3 · ledger-append + conservation readback
- **Question**: do the γ/η/efficiency generated columns compute as designed
  (schema mirrors the fleet's harness-experiments ledger)?
- **Protocol**: append E-CF-1/E-CF-2 result rows via `/ledger/append`; read
  back derived columns; verify efficiency = η/γ and success_rate arithmetic
  on the returned row (compute expected by hand, compare).
- Prediction: exact match (generated columns are SQLite arithmetic).

## E-CF-4 · promote-the-useful-quilt
- **Question**: can a run artifact be promoted from ephemeral KV receipt to
  durable R2 with a ledger witness, and read back hash-intact?
- **Protocol**: `/promote` the best E-CF-1 run (quality 1.0); fetch the R2
  object back; verify chain_tail in the artifact equals the run's chain_tail.
- Prediction: PASS if R2 PUT/GET permissions exist on the token; otherwise a
  sealed FAIL naming the missing capability (R2:Edit) — either is a result.

## E-CF-5 · model-backed iterator — pre-declared BLOCKED
- Workers AI auth returns 10001 on this token (verified 2026-10-02). External
  provider keys (deepinfra precedent exists in the fleet's harness ledger) are
  not provisioned to this lab worker. This wave runs the deterministic arm
  only; E-CF-5's unblock conditions are named in the wave-1 debrief roadmap.

## Global rules adopted (GPU-EXPERIMENTS §0, substrate-agnostic)
std==0 over same-seed same-path → expected, never evidence; controls vary by a
different path; seed everything; device string with every number; FAIL-first:
the worker's /run was exercised with a known parameter set and its chain_tail
recomputed locally (tools/local-check.mjs) before any cloud receipt was sealed.
