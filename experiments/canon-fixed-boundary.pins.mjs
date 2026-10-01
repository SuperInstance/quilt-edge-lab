// experiments/canon-fixed-boundary.pins.mjs — FAIL-first pins, sealed BEFORE
// the run (committed with the experiment, first execution must FAIL with
// ENOENT on results-fixed.json — receipt: receipts/wave3-canon-fixed-boundary/
// pins-failfirst.log). Arm: W3.1 control — C-ROT under FIXED boundaries.
// Prereg = the sealed predictions block in canon-fixed-boundary.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const R = JSON.parse(readFileSync("/tmp/zlanes/lane3/results-fixed.json", "utf8"));
const SEEDS = ["42", "7", "2026", "31337"];
const ROTS = ["1", "17", "63"];

test("F1 · H1-F: naive chain diverges under rotated genesis, fixed boundaries (t>=1)", () => {
  for (const s of SEEDS) {
    for (const r of ROTS) {
      const d = R.seeds[s].naive_rotation[r];
      assert.ok(
        d.first_divergence_tick !== null && d.first_divergence_tick >= 1,
        `seed ${s} rot ${r}: naive chains did not diverge — H1-F REFUTED (or boundary change a no-op)`
      );
      assert.notEqual(d.tail_base, d.tail_rot, `seed ${s} rot ${r}: tails equal despite row divergence`);
    }
  }
});

test("F2 · H2-F: canon chain ALSO diverges under rotated genesis, fixed boundaries (honest boundary of C-ROT)", () => {
  for (const s of SEEDS) {
    for (const r of ROTS) {
      const d = R.seeds[s].canon_rotation[r];
      assert.ok(
        d.first_divergence_tick !== null && d.first_divergence_tick >= 1,
        `seed ${s} rot ${r}: canon chain stayed INVARIANT under fixed boundaries — C-ROT erases real dynamical signal (OVERCLAIM — wave-2 canon-rule candidate fails its boundary test)`
      );
      assert.notEqual(d.tail_base, d.tail_rot, `seed ${s} rot ${r}: canon tails equal`);
    }
  }
});

test("F3 · C-F: degeneracy broken — fixed-boundary dynamics NOT rotation-equivariant AND translation content != rotated-run chain", () => {
  for (const s of SEEDS) {
    assert.equal(
      R.seeds[s].observations.fixed_boundary_breaks_rotation_equivariance,
      true,
      `seed ${s}: rotated run still equals rotated base trajectory — boundary change is a no-op, arm INCONCLUSIVE`
    );
    assert.equal(
      R.seeds[s].observations.translation_equals_rotation_run,
      false,
      `seed ${s}: digest-time translation still bit-identical to rotated run — wave-2 degeneracy not broken, control INCONCLUSIVE`
    );
  }
});

test("F4 · ND: non-degeneracy (>=2 distinct raw states per run; seeds not clones)", () => {
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

test("F5 · receipt hygiene: wave-2 sealed receipt untouched, params recorded", () => {
  assert.equal(R.params.boundary.includes("fixed zero-flush"), true, "boundary param not recorded");
  assert.equal(R.params.rule, 30);
  assert.equal(R.params.width, 128);
  assert.equal(R.params.ticks, 500);
  // wave-2 results.json must still parse and still carry the wave-2 invariant
  // result (0 divergent canon rows) — the new arm must not contaminate it
  const W2 = JSON.parse(readFileSync("/tmp/zlanes/lane3/results.json", "utf8"));
  for (const s of SEEDS) {
    for (const r of ROTS) {
      assert.equal(
        W2.seeds[s].canon_rotation[r].divergent_rows,
        0,
        `wave-2 canon receipt for seed ${s} rot ${r} was contaminated (divergent_rows!=0)`
      );
    }
  }
});
