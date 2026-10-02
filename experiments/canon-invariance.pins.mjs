// experiments/canon-invariance.pins.mjs — FAIL-first pins, sealed BEFORE the run.
// Arm: W2.3 deterministic (canon-permutation invariance of receipt chains).
// Prereg: PREREG.md §W2.3-DET (sealed with this file, before any measured run).
// Chain rows are t=1..500 (worker lineage: the genesis state materializes only
// the chain head), so the earliest possible divergence tick is 1; prereg's
// "nonzero first-divergence tick exists" means: exists AND >= 1.
// First execution of this file must FAIL (results.json does not exist until the
// experiment runs) — receipt: receipts/wave2-canon-invariance/pins-failfirst.log
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const R = JSON.parse(readFileSync("/tmp/zlanes/lane3/results.json", "utf8"));
const SEEDS = ["42", "7", "2026", "31337"];
const ROTS = ["1", "17", "63"];

test("P1 · naive chain diverges under rotated genesis (H1: origin-sensitive)", () => {
  for (const s of SEEDS) {
    for (const r of ROTS) {
      const d = R.seeds[s].naive_rotation[r];
      assert.ok(
        d.first_divergence_tick !== null,
        `seed ${s} rot ${r}: naive chains never diverged — H1 would be REFUTED`
      );
      assert.ok(
        Number.isInteger(d.first_divergence_tick) && d.first_divergence_tick >= 1,
        `seed ${s} rot ${r}: first_divergence_tick=${d.first_divergence_tick} is not a nonzero chain tick`
      );
      assert.notEqual(
        d.tail_base,
        d.tail_rot,
        `seed ${s} rot ${r}: tails equal despite row divergence — hash collision or comparator fault`
      );
    }
  }
});

test("P2 · canon-sorted chain invariant under rotation (H2: zero divergence at every t)", () => {
  for (const s of SEEDS) {
    for (const r of ROTS) {
      const d = R.seeds[s].canon_rotation[r];
      assert.equal(
        d.first_divergence_tick,
        null,
        `seed ${s} rot ${r}: canon chain diverged at t=${d.first_divergence_tick} — H2 would be REFUTED`
      );
      assert.equal(d.divergent_rows, 0, `seed ${s} rot ${r}: ${d.divergent_rows} divergent rows`);
      assert.equal(
        d.rows_compared,
        R.params.ticks,
        `seed ${s} rot ${r}: compared ${d.rows_compared} rows, expected ${R.params.ticks}`
      );
      assert.equal(d.tail_base, d.tail_rot, `seed ${s} rot ${r}: canon tails differ`);
    }
  }
});

test("P3 · translation control diverges (fault-detection control, different path)", () => {
  for (const s of SEEDS) {
    for (const k of ROTS) {
      const d = R.seeds[s].translation_control[k];
      assert.ok(
        d.first_divergence_tick !== null && d.first_divergence_tick >= 1,
        `seed ${s} shift ${k}: control failed to detect the un-sorted shift — detector broken, arm INCONCLUSIVE`
      );
      assert.notEqual(d.tail_base, d.tail_shift, `seed ${s} shift ${k}: control tails equal`);
    }
  }
});

test("P4 · non-degeneracy (INCONCLUSIVE guard: >=2 distinct states per run; seeds not clones)", () => {
  for (const s of SEEDS) {
    assert.ok(
      R.seeds[s].distinct_raw_states >= 2,
      `seed ${s}: degenerate attractor (${R.seeds[s].distinct_raw_states} distinct states) → arm INCONCLUSIVE per prereg`
    );
  }
  assert.equal(
    R.cross_seed_identical_states,
    false,
    "all seeds give identical pre-sort states → arm INCONCLUSIVE per prereg, never PASSED"
  );
});
