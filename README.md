# quilt-edge-lab

**Cloudflare-based quilt experiments at the edge — iterators, receipt chains,
a conservation ledger, and save-when-useful promotion.**

Born 2026-10-02 from the directive: *cloudflare workers as iterators over
various backend models; quilts saved when found useful; debriefs on all
experiments, success or not; iterative roadmaps; keep the wheel spinning.*

Fleet culture applies unchanged: receipts over claims, prereg before runs,
seed everything, device string with every number, FAIL receipts ride forever.

## Live

Worker: https://quilt-edge-lab.casey-digennaro.workers.dev
Bindings: D1 `quilt-edge-lab` (ledger), KV `RECEIPTS`, R2 `quilt-edge-lab-saves`.

## Endpoints

| route | what |
|---|---|
| `GET /run?rule=30&seed=42&ticks=1000&width=128` | seeded elementary-CA iterator; chained row receipts; stores in KV |
| `GET /bench?rule=30&seed=42&ticks=10000&repeats=20` | throughput via ACCUMULATED repeats (per-request clocks are frozen — see DEBRIEF E-CF-2) |
| `GET /compare?a=<run_id>&b=<run_id>` | tail equality + full-chain equality + colo verdict |
| `GET /ledger` | last 10 ledger rows with derived γ/η/efficiency |
| `POST /ledger/append` | append experiment row; returns derived columns |
| `POST /promote {run_id, quality_score}` | KV receipt → durable R2 + ledger witness |
| `GET /saved/<key>` | read back a promoted artifact (hash-verify against its run) |

Rules implemented: 30, 90, 110, 184. CA lane is 1-D periodic; the receipt row
is `fnv1a64(prev | t | stateDigest)` — chain culture follows kit.mjs /
edge-ledger, digest is by-equality (documented simplification of 64-bit FNV).

## Status (wave 1 sealed 2026-10-02)

E-CF-1 determinism **PASS** · E-CF-2 throughput **PASS after 3 sealed
instrument FAILs (frozen isolate clocks — use the external clock)** ·
E-CF-3 ledger conservation **PASS** · E-CF-4 promote-to-R2 **PASS** ·
E-CF-5 model arm **BLOCKED** (token lacks AI scope; provider secret unprovisioned).

Read [PREREG.md](PREREG.md) then [DEBRIEF.md](DEBRIEF.md) then
[receipts/wave1-receipts.json](receipts/wave1-receipts.json). Wave-2 roadmap in
the debrief.

## Deploy

```bash
export CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=…
wrangler d1 execute quilt-edge-lab --remote --file=schema.sql
wrangler deploy
node tools/local-check.mjs   # FAIL-first pin; /run must reproduce this tail
```

Related fleet repos: [quilt-cloudflare] (Quilt reactive runtime on Workers),
[edge-ledger] (fleet-state@v1 receipt travel shape), harness-experiments D1
ledger (γ/η schema source).
