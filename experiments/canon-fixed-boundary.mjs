#!/usr/bin/env node
// experiments/canon-fixed-boundary.mjs — W3.1 control arm: C-ROT under FIXED
// (non-periodic) boundaries. Pre-registration sealed in this docstring BEFORE
// any run (PR opened with this file unexecuted; pins FAIL-first first).
//
// Why this arm exists (sealed wave-2 boundary note, receipts/wave2-canon-
// invariance/BOUNDARY.md): on a ring, shift-by-k IS rotate-by-k, so the wave-2
// translation control was degenerate with the rotation arm (tails bit-identical,
// verified). A non-independent control requires boundaries where translation is
// NOT a rotation — fixed zero-flush (Dirichlet) edges.
//
// Under fixed boundaries rotation is NOT a symmetry of the rule-30 dynamics, so
// the predictions are the OPPOSITE of wave-2's H2, and that is the point:
//   H1-F  naive chain diverges under rotated genesis, fixed boundaries
//         (origin-sensitivity survives; expected t=1, every seed/rotation)
//   H2-F  canon (lex-min-rotation) chain ALSO diverges under rotated genesis,
//         fixed boundaries — EXPECTED. The rotated genesis is now a genuinely
//         different physical initial condition (the edges are privileged
//         positions), not a re-indexing of the same one. If canon stayed
//         INVARIANT here, C-ROT would be erasing real dynamical signal = the
//         canon rule OVERCLAIMS. Divergence here is the honest boundary of
//         C-ROT: invariance holds only where rotation is a true symmetry of
//         the dynamics. (Not a REFUTATION of wave-2 H2 — different dynamical
//         system; wave-2 periodic result untouched.)
//   C-F   dynamical control: fixed-boundary trajectories are NOT rotation-
//         equivariant (exists t where rotated-run state != rotated base state)
//         AND the digest-time translation content is no longer bit-identical
//         to the rotated-run chain (degeneracy breaker). Both must fire, else
//         the boundary change is a no-op and the arm is INCONCLUSIVE.
//   ND    non-degeneracy guard as wave-2 (>=2 distinct raw states per run;
//         seeds not clones of each other).
//
// Arms per seed: naive/canon chains over base trajectory vs independently
// re-run CA from rotated-by-r genesis (r in {1,17,63}), fixed boundaries;
// plus digest-time translation control (shift, no re-sort, no 2nd run).
// Chain convention: src/worker.js lineage (file untouched), rows
// `${prev}|${t}|${sd}` fnv1a-64 from head fnv1a64("GENESIS_QUILT_EDGE_LAB"),
// rows t=1..500 — genesis materializes only the chain head, earliest possible
// divergence t=1. CA primitives byte-identical to wave-2 (mulberry32,
// fnv1a64, bitString, rotLeft*, minRotation) — only `step` changes (edges
// read constant 0 instead of wrapping).
// Output: /tmp/zlanes/lane3/results-fixed.json (+ human table on stdout).
// Prior wave-2 output /tmp/zlanes/lane3/results.json is a sealed receipt and
// is NOT touched by this arm.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const RULE = 30;
const WIDTH = 128;
const TICKS = 500;
const SEEDS = [42, 7, 2026, 31337];
const ROTATIONS = [1, 17, 63];
const OUT = "/tmp/zlanes/lane3/results-fixed.json";

// --- seeded primitives (lineage: src/worker.js, byte-identical to wave-2 arm) ---
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
    h1 ^= str.charCodeAt(i); h2 ^= 0;
    const l1 = h1, l2 = h2;
    h1 = Math.imul(l1, 0x1b3) >>> 0;
    h2 = (Math.imul(l2, 0x1b3) + Math.imul(l1, 0x100) + Math.floor(Math.imul(l1, 0x1b3) / 0x100000000)) >>> 0;
    h2 = (h2 + ((l2 * 0x10000000) >>> 0)) >>> 0;
  }
  const pad = (x) => x.toString(16).padStart(8, "0");
  return pad(h2) + pad(h1);
}
// THE ONLY DELTA vs wave-2: fixed zero-flush (Dirichlet) boundaries — the
// edges are privileged positions, rotation is not a dynamical symmetry.
function stepFixed(state, rule, width) {
  const next = new Uint8Array(width);
  for (let i = 0; i < width; i++) {
    const l = i > 0 ? state[i - 1] : 0;
    const c = state[i];
    const r = i < width - 1 ? state[i + 1] : 0;
    next[i] = (rule >> ((l << 2) | (c << 1) | r)) & 1;
  }
  return next;
}

// --- state helpers (byte-identical to wave-2 arm) ---
function bitString(state) {
  let s = "";
  for (let i = 0; i < state.length; i++) s += state[i] ? "1" : "0";
  return s;
}
function rotLeftStr(s, r) {
  const n = s.length;
  r = ((r % n) + n) % n;
  return s.slice(r) + s.slice(0, r);
}
function rotLeftState(state, r) {
  const n = state.length;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = state[(i + r) % n];
  return out;
}
function minRotation(s) {
  const n = s.length;
  let best = 0;
  for (let r = 1; r < n; r++) {
    let smaller = false;
    for (let i = 0; i < n; i++) {
      const a = s.charCodeAt((best + i) % n);
      const b = s.charCodeAt((r + i) % n);
      if (b !== a) { smaller = b < a; break; }
    }
    if (smaller) best = r;
  }
  let out = "";
  for (let i = 0; i < n; i++) out += s[(best + i) % n];
  return out;
}

// tool self-checks (hand-verified, same set as wave-2 plus a fixed-boundary
// spot check: cell 0 with neighbors (0,1,0) under rule 30 must differ from
// the periodic wrap case when state[width-1] != 0)
assert.equal(rotLeftStr("abcd", 1), "bcda");
assert.equal(minRotation("1001"), "0011");
assert.equal(minRotation("0110"), "0011");
assert.equal(minRotation("1111"), "1111");
assert.equal(minRotation("0"), "0");
{
  const s = new Uint8Array(4); s[3] = 1; s[1] = 1; // ..01 with left neighbor = edge 0
  const n = stepFixed(s, 30, 4);
  const wrapped = new Uint8Array(4); // periodic would read l=state[3]=1 at i=0
  for (let i = 0; i < 4; i++) {
    const l = s[(i - 1 + 4) % 4], c = s[i], r = s[(i + 1) % 4];
    wrapped[i] = (30 >> ((l << 2) | (c << 1) | r)) & 1;
  }
  assert.notDeepEqual([...n], [...wrapped], "stepFixed equals periodic step — boundary change is a no-op");
}

function genesis(seed) {
  const rng = mulberry32(seed);
  const g = new Uint8Array(WIDTH);
  for (let i = 0; i < WIDTH; i++) g[i] = rng() < 0.5 ? 1 : 0;
  return g;
}
function runCAFixed(state0, ticks) {
  const states = [state0];
  let s = state0;
  for (let t = 0; t < ticks; t++) { s = stepFixed(s, RULE, WIDTH); states.push(s); }
  return states;
}
const naiveSd = (st) => fnv1a64(bitString(st));
const canonSd = (st) => fnv1a64(minRotation(bitString(st)));
function chainRows(states, sd) {
  let prev = fnv1a64("GENESIS_QUILT_EDGE_LAB");
  const rows = [];
  for (let t = 1; t < states.length; t++) {
    prev = fnv1a64(`${prev}|${t}|${sd(states[t])}`);
    rows.push(prev);
  }
  return rows;
}
function compareChains(a, b) {
  let first = null, divergent = 0;
  for (let t = 0; t < a.length; t++) {
    if (a[t] !== b[t]) { if (first === null) first = t + 1; divergent++; }
  }
  return { first_divergence_tick: first, divergent_rows: divergent, rows_compared: a.length };
}

// --- the experiment ---
const out = {
  experiment: "canon-fixed-boundary (W3.1 control arm for C-ROT)",
  device: `local node ${process.version}, CPU (pure node per task — no deploy)`,
  generated_at: new Date().toISOString(),
  params: { rule: RULE, width: WIDTH, ticks: TICKS, seeds: SEEDS, rotations: ROTATIONS,
    boundary: "fixed zero-flush (Dirichlet): step reads constant 0 outside the lane; edges are privileged positions; rotation is NOT a dynamical symmetry",
    chain: "fnv1a-64 rows `${prev}|${t}|${sd}` from head fnv1a64(GENESIS_QUILT_EDGE_LAB), rows t=1..T (src/worker.js lineage, file untouched)",
    canon: "lexicographic minimum rotation of the state bit-string (Booth-equivalent scan)",
    wave2_receipt_untouched: "/tmp/zlanes/lane3/results.json (sealed wave-2 receipt, not written by this arm)" },
  predictions: {
    H1F: "naive chain diverges under rotated genesis (origin-sensitive), t>=1 every seed/rotation",
    H2F: "canon chain ALSO diverges under rotated genesis — EXPECTED: rotated genesis is a genuinely different initial condition under fixed boundaries; canon-invariant would mean C-ROT erases real signal (overclaim)",
    CF: "fixed-boundary dynamics NOT rotation-equivariant AND translation content != rotated-run chain (degeneracy broken)",
    ND: ">=2 distinct raw states per run; seeds not clones" },
  seeds: {},
  cross_seed_identical_states: null,
};

const stateSets = [];
for (const seed of SEEDS) {
  const g = genesis(seed);
  const baseTraj = runCAFixed(g, TICKS);
  const naiveBase = chainRows(baseTraj, naiveSd);
  const canonBase = chainRows(baseTraj, canonSd);
  const rawStrings = baseTraj.map(bitString);
  stateSets.push(new Set(rawStrings));

  const rec = {
    genesis_popcount: g.reduce((a, b) => a + b, 0),
    distinct_raw_states: new Set(rawStrings).size,
    naive_rotation: {},
    canon_rotation: {},
    translation_control: {},
    observations: { fixed_boundary_breaks_rotation_equivariance: true, translation_equals_rotation_run: true },
  };

  for (const r of ROTATIONS) {
    const rotTraj = runCAFixed(rotLeftState(g, r), TICKS); // independent re-run, not a re-index
    const naiveRot = chainRows(rotTraj, naiveSd);
    const canonRot = chainRows(rotTraj, canonSd);
    rec.naive_rotation[r] = { ...compareChains(naiveBase, naiveRot),
      tail_base: naiveBase[naiveBase.length - 1], tail_rot: naiveRot[naiveRot.length - 1] };

    rec.canon_rotation[r] = { ...compareChains(canonBase, canonRot),
      tail_base: canonBase[canonBase.length - 1], tail_rot: canonRot[canonRot.length - 1] };

    const transChain = chainRows(baseTraj.map((st) => rotLeftState(st, r)), naiveSd);
    rec.translation_control[r] = { ...compareChains(naiveBase, transChain),
      tail_base: naiveBase[naiveBase.length - 1], tail_shift: transChain[transChain.length - 1] };

    let equivMismatch = 0;
    for (let t = 0; t <= TICKS; t++) if (bitString(rotTraj[t]) !== rotLeftStr(rawStrings[t], r)) equivMismatch++;
    rec.observations.fixed_boundary_breaks_rotation_equivariance = equivMismatch > 0;
    rec.observations.equivariance_mismatch_rows = equivMismatch; // of T+1 trajectory rows

    if (!transChain.every((h, t) => h === naiveRot[t])) {
      rec.observations.translation_equals_rotation_run = false;
    }
  }
  out.seeds[seed] = rec;
}

const fingerprints = stateSets.map((set) => [...set].sort().join("|"));
out.cross_seed_identical_states = fingerprints.every((f) => f === fingerprints[0]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

const fmt = (d) => (d.first_divergence_tick === null ? "INVARIANT" : `t=${d.first_divergence_tick} (${d.divergent_rows}/${d.rows_compared} rows)`);
console.log(`canon-fixed-boundary · rule ${RULE} · width ${WIDTH} · ticks ${TICKS} · ${out.device}`);
for (const seed of SEEDS) {
  const s = out.seeds[seed];
  console.log(`seed ${seed}: popcount=${s.genesis_popcount} distinctRaw=${s.distinct_raw_states} equivBroken=${s.observations.fixed_boundary_breaks_rotation_equivariance} (mismatch ${s.observations.equivariance_mismatch_rows}/${TICKS + 1}) trans==rotRun:${s.observations.translation_equals_rotation_run}`);
  for (const r of ROTATIONS) {
    console.log(`  r=${String(r).padStart(2)}  naive[${fmt(s.naive_rotation[r])}]  canon[${fmt(s.canon_rotation[r])}]  trans[${fmt(s.translation_control[r])}]`);
  }
}
console.log(`cross_seed_identical_states=${out.cross_seed_identical_states}`);
console.log(`wrote ${OUT}`);
