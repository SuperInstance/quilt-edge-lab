#!/usr/bin/env node
// experiments/canon-invariance.mjs — W2.3 deterministic arm (lane-3 task).
// Question (pre-registered, PREREG.md §W2.3-DET): the receipt chain digests the
// CA lane in position order; a ring state has no privileged origin. Does the
// chain notice rotation? Arms per seed:
//   naive    : chain over the raw trajectory (position-order digest)         → H1
//   rotated  : independently re-run the CA from a rotated-by-r genesis       → H1
//   canon    : same chains, but each state reduced to its lexicographic
//              minimum rotation before digest                               → H2
//   control  : translation — shift each state by k at digest time, NO
//              re-sort, no second CA run (different path)                   → control
// Chain convention copied from src/worker.js runExperiment (file NOT modified,
// same copy-pattern as tools/local-check.mjs): rows `${prev}|${t}|${sd}` chained
// by fnv1a-64 from head fnv1a64("GENESIS_QUILT_EDGE_LAB"); rows t=1..T — the
// genesis state itself materializes only the head, so the earliest possible
// divergence tick between two runs is t=1.
// Output: /tmp/zlanes/lane3/results.json (+ human table on stdout).
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const RULE = 30;
const WIDTH = 128;
const TICKS = 500;
const SEEDS = [42, 7, 2026, 31337];
const ROTATIONS = [1, 17, 63];
const OUT = "/tmp/zlanes/lane3/results.json";

// --- seeded primitives (lineage: src/worker.js) ---
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
function step(state, rule, width) {
  const next = new Uint8Array(width);
  for (let i = 0; i < width; i++) {
    const l = state[(i - 1 + width) % width], c = state[i], r = state[(i + 1) % width];
    next[i] = (rule >> ((l << 2) | (c << 1) | r)) & 1;
  }
  return next;
}

// --- state helpers ---
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
// lexicographic minimum rotation — the canon form for a ring under rotation
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

// tool self-checks (hand-verified): a broken canon tool must not produce receipts
assert.equal(rotLeftStr("abcd", 1), "bcda");
assert.equal(minRotation("1001"), "0011"); // orbit {1001,0011,0110,1100}
assert.equal(minRotation("0110"), "0011");
assert.equal(minRotation("1111"), "1111"); // degenerate orbit: canon still unique
assert.equal(minRotation("0"), "0");

function genesis(seed) {
  const rng = mulberry32(seed);
  const g = new Uint8Array(WIDTH);
  for (let i = 0; i < WIDTH; i++) g[i] = rng() < 0.5 ? 1 : 0;
  return g;
}
function runCA(state0, ticks) {
  const states = [state0];
  let s = state0;
  for (let t = 0; t < ticks; t++) { s = step(s, RULE, WIDTH); states.push(s); }
  return states; // [s_0 .. s_ticks]
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
  experiment: "canon-invariance",
  arm: "W2.3-deterministic (semantic sort stands in for embedding sort)",
  device: `local node ${process.version}, CPU (pure node per task — no deploy)`,
  generated_at: new Date().toISOString(),
  params: { rule: RULE, width: WIDTH, ticks: TICKS, seeds: SEEDS, rotations: ROTATIONS,
    chain: "fnv1a-64 rows `${prev}|${t}|${sd}` from head fnv1a64(GENESIS_QUILT_EDGE_LAB), rows t=1..T (src/worker.js lineage, file untouched)",
    canon: "lexicographic minimum rotation of the state bit-string (Booth-equivalent scan)" },
  seeds: {},
  cross_seed_identical_states: null,
};

const stateSets = [];
for (const seed of SEEDS) {
  const g = genesis(seed);
  const gStr = bitString(g);
  const baseTraj = runCA(g, TICKS);
  const naiveBase = chainRows(baseTraj, naiveSd);
  const canonBase = chainRows(baseTraj, canonSd);
  const rawStrings = baseTraj.map(bitString);
  const canonStrings = rawStrings.map(minRotation);
  stateSets.push(new Set(rawStrings));

  let genesisRotSymmetric = false;
  for (let r = 1; r < WIDTH; r++) if (gStr === rotLeftStr(gStr, r)) { genesisRotSymmetric = true; break; }

  const rec = {
    genesis_popcount: g.reduce((a, b) => a + b, 0),
    genesis_rotation_symmetric: genesisRotSymmetric,
    distinct_raw_states: new Set(rawStrings).size,
    distinct_canon_states: new Set(canonStrings).size,
    naive_rotation: {},
    canon_rotation: {},
    translation_control: {},
    observations: { rule30_rotation_equivariant: true, translation_content_equals_rotation_run: true },
  };

  for (const r of ROTATIONS) {
    const rotTraj = runCA(rotLeftState(g, r), TICKS); // independent re-run, not a re-index of baseTraj
    const naiveRot = chainRows(rotTraj, naiveSd);
    const canonRot = chainRows(rotTraj, canonSd);
    rec.naive_rotation[r] = { ...compareChains(naiveBase, naiveRot),
      tail_base: naiveBase[naiveBase.length - 1], tail_rot: naiveRot[naiveRot.length - 1] };

    rec.canon_rotation[r] = { ...compareChains(canonBase, canonRot),
      tail_base: canonBase[canonBase.length - 1], tail_rot: canonRot[canonRot.length - 1] };

    // translation control: shift the ring at digest time, no re-sort, no 2nd CA run
    const transChain = chainRows(baseTraj.map((st) => rotLeftState(st, r)), naiveSd);
    rec.translation_control[r] = { ...compareChains(naiveBase, transChain),
      tail_base: naiveBase[naiveBase.length - 1], tail_shift: transChain[transChain.length - 1] };

    if (!rotTraj.every((st, t) => bitString(st) === rotLeftStr(rawStrings[t], r))) {
      rec.observations.rule30_rotation_equivariant = false;
    }
    if (!transChain.every((h, t) => h === naiveRot[t])) {
      rec.observations.translation_content_equals_rotation_run = false;
    }
  }
  out.seeds[seed] = rec;
}

const fingerprints = stateSets.map((set) => [...set].sort().join("|"));
out.cross_seed_identical_states = fingerprints.every((f) => f === fingerprints[0]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

// human table
const fmt = (d) => (d.first_divergence_tick === null ? "INVARIANT" : `t=${d.first_divergence_tick} (${d.divergent_rows}/${d.rows_compared} rows)`);
console.log(`canon-invariance · rule ${RULE} · width ${WIDTH} · ticks ${TICKS} · ${out.device}`);
for (const seed of SEEDS) {
  const s = out.seeds[seed];
  console.log(`seed ${seed}: popcount=${s.genesis_popcount} rotSym=${s.genesis_rotation_symmetric} distinctRaw=${s.distinct_raw_states}`);
  for (const r of ROTATIONS) {
    console.log(`  r=${String(r).padStart(2)}  naive[${fmt(s.naive_rotation[r])}]  canon[${fmt(s.canon_rotation[r])}]  trans[${fmt(s.translation_control[r])}]`);
  }
}
console.log(`cross_seed_identical_states=${out.cross_seed_identical_states}`);
console.log(`wrote ${OUT}`);
