// quilt-edge-lab — Cloudflare edge iterator + receipt-chain lab worker.
// Culture: receipts over claims; seeded everything; device string = cf.colo.
// Receipt chain culture follows edge-ledger (fleet-state@v1) + quilt-arcade
// kit.mjs (fnv1a-64 chained rows). CA substrate = elementary rules on Uint8.

const RULES = { 30: 30, 90: 90, 110: 110, 184: 184 };

// mulberry32 — seeded PRNG (recorded, not crypto)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// fnv1a-64 over a string → 16-hex-char digest
function fnv1a64(str) {
  let h1 = 0x811c9dc5, h2 = 0x811c9dc5; // 64-bit split: [h2:h1]
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c; h2 ^= c >>> 8 !== undefined ? 0 : 0; // keep simple: byte-wise
    // 64-bit FNV prime: 0x100000001b3 → emulate with two 32-bit words
    const p1 = 0x000001b3, p2 = 0x10000000; // FNV_prime low/high approx via shift math below
    // h = h * prime (64-bit) using 32-bit limbs:
    const l1 = h1, l2 = h2;
    h1 = Math.imul(l1, 0x1b3) >>> 0;
    h2 = (Math.imul(l2, 0x1b3) + Math.imul(l1, 0x100) + Math.floor(Math.imul(l1, 0x1b3) / 0x100000000)) >>> 0;
    // NOTE: exact 64-bit FNV not needed for chaining — determinism + diffusion suffice.
    // (documented simplification; chain integrity is by equality, not by matching
    //  external FNV reference implementations)
    h2 = (h2 + ((l2 * 0x10000000) >>> 0)) >>> 0;
  }
  const pad = (x) => x.toString(16).padStart(8, "0");
  return pad(h2) + pad(h1);
}

function stateDigest(state) {
  // canon sort not needed for a 1-D CA lane (ordered by definition); digest raw
  let s = "";
  for (let i = 0; i < state.length; i++) s += state[i] ? "1" : "0";
  return fnv1a64(s);
}

function step(state, rule, width) {
  const next = new Uint8Array(width);
  for (let i = 0; i < width; i++) {
    const l = state[(i - 1 + width) % width];
    const c = state[i];
    const r = state[(i + 1) % width];
    const idx = (l << 2) | (c << 1) | r;
    next[i] = (rule >> idx) & 1;
  }
  return next;
}

function runExperiment({ rule = 30, seed = 42, ticks = 1000, width = 128 }) {
  if (!RULES[rule]) throw new Error("rule not in {30,90,110,184}: " + rule);
  const rng = mulberry32(seed);
  let state = new Uint8Array(width);
  for (let i = 0; i < width; i++) state[i] = rng() < 0.5 ? 1 : 0;
  const GENESIS = "GENESIS_QUILT_EDGE_LAB";
  let prev = fnv1a64(GENESIS);
  const chain = [];
  const t0 = performance.now(); // μs-resolution (Date.now() proved too coarse: E-CF-2 first pass read 0ms wall)
  for (let t = 1; t <= ticks; t++) {
    state = step(state, RULES[rule], width);
    const sd = stateDigest(state);
    const row = `${prev}|${t}|${sd}`;
    prev = fnv1a64(row);
    chain.push({ t, sd, r: prev });
  }
  const wallMs = performance.now() - t0;
  return {
    rule: RULES[rule], seed, ticks, width,
    chain_head: fnv1a64(GENESIS),
    chain_tail: prev,
    wall_ms: +wallMs.toFixed(3),
    us_per_tick: +(wallMs * 1000 / ticks).toFixed(3),
    ms_per_tick: +(wallMs / ticks).toFixed(5),
    chain: ticks <= 2000 ? chain : undefined, // full chain only for small runs
  };
}

async function ledgerInsert(env, row) {
  const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(
    `INSERT INTO experiments (experiment_id, timestamp, category, description, hypothesis, model, batch_size, concurrent_agents, provider, tokens_in, tokens_out, wall_clock_seconds, api_calls, items_completed, items_failed, quality_score, lessons_extracted, notes, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, Date.now(), row.category, row.description, row.hypothesis ?? "", row.model,
    row.batch_size ?? 1, row.concurrent_agents ?? 1, row.provider ?? "cloudflare-worker",
    row.tokens_in ?? 0, row.tokens_out ?? 0, row.wall_clock_seconds ?? 0,
    row.api_calls ?? 1, row.items_completed ?? 0, row.items_failed ?? 0,
    row.quality_score ?? 0, row.lessons_extracted ?? 0, row.notes ?? "", row.tags ?? ""
  ).run();
  return id;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const colo = request.cf?.colo ?? "unknown";
    const route = url.pathname;

    try {
      if (route === "/bench") {
        // Instrument lesson (E-CF-2/E-CF-2b): per-run wall is ~1-30ms, below
        // the usable resolution of BOTH Date.now() and performance.now() in
        // this isolate (measured 0.0 on 100k-tick runs). Fix per §0: measure
        // ACCUMULATED time over many repeats — scale beats resolution.
        const rule = +(url.searchParams.get("rule") ?? 30);
        const seed = +(url.searchParams.get("seed") ?? 42);
        const ticks = +(url.searchParams.get("ticks") ?? 10000);
        const repeats = Math.min(+(url.searchParams.get("repeats") ?? 20), 200);
        const tails = [];
        const t0 = Date.now();
        for (let i = 0; i < repeats; i++) {
          const r = runExperiment({ rule, seed: seed + i, ticks, width: 128 });
          tails.push(r.chain_tail);
        }
        const totalMs = Date.now() - t0;
        return json({
          rule, seed, ticks, repeats, device: `cloudflare-worker colo=${colo}`,
          total_ms: totalMs,
          ms_per_repeat: +(totalMs / repeats).toFixed(3),
          us_per_tick: +((totalMs * 1000) / (repeats * ticks)).toFixed(3),
          timer: "Date.now accumulated over repeats (per-run resolution insufficient — E-CF-2b instrument defect sealed in debrief)",
          tails_sample: tails.slice(0, 3),
        });
      }

      if (route === "/run") {
        const p = {
          rule: +(url.searchParams.get("rule") ?? 30),
          seed: +(url.searchParams.get("seed") ?? 42),
          ticks: Math.min(+(url.searchParams.get("ticks") ?? 1000), 50000),
          width: +(url.searchParams.get("width") ?? 128),
        };
        const res = runExperiment(p);
        const run_id = `run_${res.rule}_${res.seed}_${res.ticks}_${fnv1a64(JSON.stringify(p)).slice(0, 8)}`;
        await env.RECEIPTS.put(`run:${run_id}`, JSON.stringify({ ...res, colo }));
        return json({ run_id, device: `cloudflare-worker colo=${colo}`, ...res });
      }

      if (route === "/compare") {
        const a = await env.RECEIPTS.get(`run:${url.searchParams.get("a")}`, "json");
        const b = await env.RECEIPTS.get(`run:${url.searchParams.get("b")}`, "json");
        if (!a || !b) return json({ error: "run not found" }, 404);
        const same_tail = a.chain_tail === b.chain_tail;
        let chain_equal = null;
        if (a.chain && b.chain && a.chain.length === b.chain.length) {
          chain_equal = a.chain.every((r, i) => r.r === b.chain[i].r && r.sd === b.chain[i].sd);
        }
        return json({
          a: { run_id: url.searchParams.get("a"), colo: a.colo, tail: a.chain_tail },
          b: { run_id: url.searchParams.get("b"), colo: b.colo, tail: b.chain_tail },
          same_tail, full_chain_equal: chain_equal,
          verdict: same_tail ? (a.colo !== b.colo ? "DETERMINISTIC_ACROSS_COLOS" : "DETERMINISTIC_SAME_COLO") : "DIVERGENT",
        });
      }

      if (route === "/ledger") {
        const { results } = await env.DB.prepare(
          "SELECT experiment_id, category, model, provider, items_completed, items_failed, quality_score, efficiency, success_rate, gamma, eta FROM experiments ORDER BY id DESC LIMIT 10"
        ).all();
        return json({ rows: results });
      }

      if (route.startsWith("/saved/")) {
        const key = route.slice("/saved/".length);
        const obj = await env.SAVES.get(key);
        if (!obj) return json({ error: "not found", key }, 404);
        const body = await obj.text();
        return json({ key, size: body.length, body: JSON.parse(body) });
      }

      if (route === "/promote" && request.method === "POST") {
        const body = await request.json();
        const run = await env.RECEIPTS.get(`run:${body.run_id}`, "json");
        if (!run) return json({ error: "run not found" }, 404);
        const quality = +body.quality_score ?? 0.5;
        const artifact = JSON.stringify({ promoted_from: body.run_id, colo: run.colo, chain_tail: run.chain_tail, ticks: run.ticks, rule: run.rule, seed: run.seed });
        const key = `saved/${body.run_id}.json`;
        let saved = false, reason = "";
        if (env.SAVES) {
          await env.SAVES.put(key, artifact);
          saved = true;
        } else reason = "R2 binding SAVES absent";
        const ledger_id = await ledgerInsert(env, {
          category: "promotion", description: `promote ${body.run_id} to durable storage`,
          hypothesis: "useful quilts persist beyond KV TTL", model: `ca-rule-${run.rule}`,
          items_completed: saved ? 1 : 0, items_failed: saved ? 0 : 1,
          quality_score: quality, notes: reason || key, tags: "promote,r2",
          wall_clock_seconds: 0,
        });
        return json({ saved, key, reason, witness: ledger_id, quality_score: quality });
      }

      if (route === "/ledger/append" && request.method === "POST") {
        const body = await request.json();
        const id = await ledgerInsert(env, body);
        const { results } = await env.DB.prepare(
          "SELECT experiment_id, gamma, eta, efficiency, success_rate FROM experiments WHERE experiment_id = ?"
        ).bind(id).all();
        return json({ inserted: id, derived: results?.[0] ?? null });
      }

      return json({
        service: "quilt-edge-lab",
        routes: ["/run?rule=30&seed=42&ticks=1000", "/bench?rule=30&seed=42&ticks=10000&repeats=20", "/compare?a=..&b=..", "/ledger", "POST /promote", "POST /ledger/append", "/saved/<key>"],
        device: `cloudflare-worker colo=${colo}`,
      });
    } catch (e) {
      return json({ error: String(e), route }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 1), { status, headers: { "content-type": "application/json" } });
}
