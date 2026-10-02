# RESULT — W2.3 deterministic arm: canon-permutation invariance of receipt chains

Sealed 2026-10-02 · device: `local node v24.16.0, CPU` (pure node, no deploy) ·
prereg: `PREREG.md §W2.3-DET` (sealed before any run) · pins:
`experiments/canon-invariance.pins.mjs` (written and executed FAIL-first — see
receipts) · experiment: `experiments/canon-invariance.mjs` (rule 30, width 128,
500 ticks, seeds {42,7,2026,31337} via mulberry32, rotations {1,17,63}).

## Verdicts

| Hypothesis | Verdict | Evidence |
|---|---|---|
| H1 — naive chain diverges under rotated genesis (origin-sensitive) | **CONFIRMED** | 12/12 pairs diverge; first-divergence tick = 1 in every pair; 6000/6000 chain rows divergent (no re-convergence, no collision) |
| H2 — canon-sorted chain invariant under rotation | **CONFIRMED** | 12/12 pairs identical at EVERY tick; 0/6000 divergent rows; canon tails equal in every pair |
| Control — translation (shift, no re-sort) diverges | **CONFIRMED** | 12/12 pairs diverge, t=1, different code path (digest-time shift, no second CA run); control content bit-identical to the rotation arm — rule-30 rotation equivariance verified observationally on every trajectory |
| INCONCLUSIVE guard (degenerate attractor) | **not triggered** | 501 distinct raw states per seed over the 501-state trajectory; the four seeds' state sets are not identical (`cross_seed_identical_states=false`) |

The arm is therefore **PASSED (not INCONCLUSIVE)** on both hypotheses.

## Divergence-tick table (first tick at which the two chains' rows differ; chain rows are t=1..500, worker lineage — genesis materializes only the chain head)

| seed | popcount | rot-sym genesis? | distinct raw states | naive r=1 | naive r=17 | naive r=63 | canon r=1 | canon r=17 | canon r=63 | trans k=1 | trans k=17 | trans k=63 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 42    | 64 | no | 501 | **t=1** (500/500) | **t=1** (500/500) | **t=1** (500/500) | INVARIANT (0/500) | INVARIANT | INVARIANT | **t=1** | **t=1** | **t=1** |
| 7     | 50 | no | 501 | **t=1** (500/500) | **t=1** (500/500) | **t=1** (500/500) | INVARIANT (0/500) | INVARIANT | INVARIANT | **t=1** | **t=1** | **t=1** |
| 2026  | 63 | no | 501 | **t=1** (500/500) | **t=1** (500/500) | **t=1** (500/500) | INVARIANT (0/500) | INVARIANT | INVARIANT | **t=1** | **t=1** | **t=1** |
| 31337 | 52 | no | 501 | **t=1** (500/500) | **t=1** (500/500) | **t=1** (500/500) | INVARIANT (0/500) | INVARIANT | INVARIANT | **t=1** | **t=1** | **t=1** |

Example tails (seed 42): naive base `db5fbcc2e085adfd` vs canon base `7cdf4bd259d0ed69`;
all four canon tails per seed agree pairwise with their rotated twins, all naive tails differ.

## Why it holds (mechanism, not just counts)

Rule 30 with periodic boundaries commutes with rotation — observed directly:
the trajectory from a rotated genesis equals the base trajectory rotated, at
every tick, for all seeds and rotations. The naive chain digests position
order, so the rotation survives into every row (H1). Reducing each state to
its rotation-class representative (lexicographic minimum rotation) before
digesting erases the origin exactly — not statistically — so the chains
coincide row-for-row (H2). std==0 on same-seed same-path runs is expected and
is not the evidence; the evidence is the structural reduction plus the
different-path control (translation detector fires; naive arms never
re-converge across 6000 rows).

## Canon-rule candidate (for fleet canon review, GPU-EXPERIMENTS §0 style)

CANON-RULE C-ROT (origin-invariance for ring lanes): a receipt chain that
digests a ring-lane state must digest the state's rotation-class
representative — the lexicographic minimum rotation of the serialized state —
never the presented rotation. A chain so constructed is invariant under any
re-indexing of the ring origin (0/6000 divergent rows across 4 seeds × 3
rotations × 500 ticks, rule 30, width 128; 6000/6000 divergent without the
rule) while remaining fully divergence-sensitive to any non-rotation content
change (sealed by the translation control). The reduction is exact, not
sampling-based: min-rotation is a function of the orbit, independent of which
member is presented; ties in degenerate orbits (periodic states) resolve to
the same representative by construction. Cost at width 128 is O(n²) naive
(≈0.5 ms per 500-tick chain locally) or O(n) with Booth's algorithm — noise
next to the chain hash. Boundary: C-ROT covers the rotation symmetry of a
presentation order only; general permutation classes (the W2.3-semantic
embedding sort) require their own representative function of the same shape —
reduce to the orbit representative, then digest. Adoption condition for the
fleet: re-run these pins (P1–P4 shape) on the adopting substrate before any
cross-lane receipt-equality claim rests on C-ROT.

## Receipts (commands named)

1. FAIL-first, before any run: `node --test /tmp/zlanes/lane3/wt/experiments/canon-invariance.pins.mjs`
   → exit 1, ENOENT `/tmp/zlanes/lane3/results.json` (receipt
   `receipts/wave2-canon-invariance/pins-failfirst.log`).
2. `node /tmp/zlanes/lane3/wt/experiments/canon-invariance.mjs` → wrote
   `/tmp/zlanes/lane3/results.json` (0.469 s real).
3. `node --test /tmp/zlanes/lane3/wt/experiments/canon-invariance.pins.mjs`
   → 4/4 pass, exit 0 (receipt `receipts/wave2-canon-invariance/pins-final.log`).
4. Raw numbers: `receipts/wave2-canon-invariance/results.json` (this file is
   the verbatim experiment output; RESULT.md is its reading).

Failures on the way: none (0 retries; the single FAIL-first pin execution is
the pre-registered ritual, not an instrument failure). `src/worker.js`
untouched per task rules.
