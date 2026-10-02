// FAIL-first local check: run the SAME iterator logic as src/worker.js on the
// CPU (different path from the edge isolate) and print expected chain_tail.
// The cloud run must reproduce this exactly, or the port is at fault.

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
    const c = str.charCodeAt(i);
    h1 ^= c; h2 ^= 0;
    const l1 = h1, l2 = h2;
    h1 = Math.imul(l1, 0x1b3) >>> 0;
    h2 = (Math.imul(l2, 0x1b3) + Math.imul(l1, 0x100) + Math.floor(Math.imul(l1, 0x1b3) / 0x100000000)) >>> 0;
    h2 = (h2 + ((l2 * 0x10000000) >>> 0)) >>> 0;
  }
  const pad = (x) => x.toString(16).padStart(8, "0");
  return pad(h2) + pad(h1);
}
function stateDigest(state) {
  let s = "";
  for (let i = 0; i < state.length; i++) s += state[i] ? "1" : "0";
  return fnv1a64(s);
}
function step(state, rule, width) {
  const next = new Uint8Array(width);
  for (let i = 0; i < width; i++) {
    const l = state[(i - 1 + width) % width], c = state[i], r = state[(i + 1) % width];
    next[i] = (rule >> ((l << 2) | (c << 1) | r)) & 1;
  }
  return next;
}
const p = { rule: 30, seed: 42, ticks: 1000, width: 128 };
const rng = mulberry32(p.seed);
let state = new Uint8Array(p.width);
for (let i = 0; i < p.width; i++) state[i] = rng() < 0.5 ? 1 : 0;
let prev = fnv1a64("GENESIS_QUILT_EDGE_LAB");
for (let t = 1; t <= p.ticks; t++) {
  state = step(state, p.rule, p.width);
  prev = fnv1a64(`${prev}|${t}|${stateDigest(state)}`);
}
console.log(JSON.stringify({ ...p, expected_chain_tail: prev, node: process.version }));
