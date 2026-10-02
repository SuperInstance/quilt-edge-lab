# RESULT — W3.1 control arm: C-ROT canon rule under FIXED boundaries

Sealed 2026-10-02 · device: `local node v24.16.0, CPU` (pure node, no deploy) ·
prereg: sealed predictions block in `experiments/canon-fixed-boundary.mjs`
(committed BEFORE any run, with the FAIL-first pins) · pins:
`experiments/canon-fixed-boundary.pins.mjs` · experiment:
`experiments/canon-fixed-boundary.mjs` (rule 30, width 128, **fixed zero-flush
(Dirichlet) boundaries — the only delta vs the wave-2 arm**, 500 ticks, seeds
{42,7,2026,31337} via mulberry32, rotations {1,17,63}).

Purpose: the wave-2 translation control was degenerate with the rotation arm
under periodic boundaries (on a ring, shift-by-k IS rotate-by-k; tails
bit-identical, sealed in `receipts/wave2-canon-invariance/BOUNDARY.md`). This
arm supplies the non-independent control: boundaries where translation is not
a rotation and rotation is not a dynamical symmetry.

## Verdicts

| Prediction | Verdict | Evidence |
|---|---|---|
| H1-F — naive chain diverges under rotated genesis (fixed boundaries) | **CONFIRMED** | 12/12 pairs, first divergence t=1 in every pair, 6000/6000 rows divergent |
| H2-F — canon chain ALSO diverges under rotated genesis (fixed boundaries) | **CONFIRMED (expected direction)** | 12/12 pairs divergent; first divergence t=1 in 9/12, t=2 in 3/12 (canon form of the t=1 states coincided across the two different trajectories — the reduction is a projection, it can DELAY detection, never erase it); all tails differ |
| C-F — degeneracy broken: dynamics NOT rotation-equivariant AND translation content ≠ rotated-run chain | **CONFIRMED** | equivariance mismatch 500/501 trajectory rows (seeds 42/7/2026), 499/501 (31337 — two rows agree: a tick where the boundary influence had not yet reached the rotated-comparison window); `translation_equals_rotation_run=false` for every seed |
| ND — non-degeneracy guard | **not triggered** | 293-363 distinct raw states per seed; cross-seed clones: false |

## Reading — the honest boundary of C-ROT

Under fixed boundaries a rotated genesis is a **genuinely different physical
initial condition** (the edges are privileged positions), not a re-indexing of
the same one. C-ROT therefore cannot — and per this control does not — restore
invariance there: the canon chain diverges from the base chain exactly like
the naive chain (same tails apart, every pair). This is the required result.
Had the canon chain stayed INVARIANT under fixed boundaries, the lex-min-rotation
reduction would be erasing real dynamical signal and the C-ROT canon-rule
candidate would fail its boundary test. It passes: **C-ROT invariance is tied
to rotation being a true symmetry of the digested dynamics — exact where the
symmetry holds (wave 2: periodic, 0/6000 rows), absent where it does not
(wave 3: fixed, 6000/6000 rows).** The rule's claim is now bounded on both
sides. This does NOT refute wave-2 H2 — different dynamical system; the sealed
periodic result (`receipts/wave2-canon-invariance/results.json`) is untouched
and re-verified by pin F5 every run.

Secondary observation (reported, not speculated on): in 3/12 pairs the canon
first-divergence is t=2, not t=1 — the canon forms of two genuinely different
t=1 states can collide. The projection delays detection by a tick; no pair
survives to t=3 undetected, and every tail differs. Magnitude note for
adopters: a canon collision at a tick is a real (rare) event, not hash luck —
chains still diverge at the next content difference.

## Receipts (commands named)

1. FAIL-first, before any run: `node --test /tmp/zlanes/lane3/wt/experiments/canon-fixed-boundary.pins.mjs`
   → exit 1, ENOENT `/tmp/zlanes/lane3/results-fixed.json` (receipt
   `receipts/wave3-canon-fixed-boundary/pins-failfirst.log`).
2. `node /tmp/zlanes/lane3/wt/experiments/canon-fixed-boundary.mjs` → wrote
   `/tmp/zlanes/lane3/results-fixed.json` (copied verbatim to
   `receipts/wave3-canon-fixed-boundary/results.json`).
3. `node --test /tmp/zlanes/lane3/wt/experiments/canon-fixed-boundary.pins.mjs`
   → 5/5 pass, exit 0 (receipt `receipts/wave3-canon-fixed-boundary/pins-final.log`).
4. Wave-2 hygiene: pin F5 re-reads the sealed wave-2 `results.json` and
   re-verifies its 12 canon-invariant (0-divergent) rows — green, receipt
   uncontaminated.

Failures on the way: none (single FAIL-first execution is the pre-registered
ritual). `src/worker.js` untouched per task rules; CA primitives byte-identical
to the wave-2 arm — only `step` changed (edges read constant 0).
