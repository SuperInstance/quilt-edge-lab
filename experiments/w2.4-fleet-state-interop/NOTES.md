# NOTES — lane2: quilt-edge-lab artifact → fleet-state@v1 interop study

Study repo: `edge-ledger` @ main, shallow clone 2026-10-02, commit
`516533b0f9cc4bc054cbae91c28545888422125f` (2026-09-30). All `file:line`
cites are relative to that clone.

## Envelope field map (fleet-state@v1)

Envelope shape is defined in `edge-ledger/schema/fleet-state.v1.md:20-31`; the
reference sealer/verifier is `edge-ledger/src/envelope.mjs`.

| field | definition (cite) | impl (cite) | our value from the quilt artifact |
|---|---|---|---|
| `schema` | literal `"fleet-state@v1"` — `schema/fleet-state.v1.md:22` | `SCHEMA` const `src/envelope.mjs:8`; checked by `verifyChain` `src/envelope.mjs:65` and by ingest `src/store.mjs:29` | `"fleet-state@v1"` |
| `node` | node identity, one chain per node — `schema/fleet-state.v1.md:23`, rule 1 `:41-43` | chain key in store `src/store.mjs:11,17` | `"quilt-edge-lab"` (the worker IS the node whose truth travels) |
| `seq` | monotonic per node, `seq = prev.seq + 1`; gaps/regressions rejected loudly — `schema/fleet-state.v1.md:24`, rule 2 `:44-46` | `seal` gap check `src/envelope.mjs:42`; `verifyChain` `:66`; store genesis/gap checks `src/store.mjs:39-40` | `1` (genesis; `prev: null`) |
| `prev` | sha256-64hex of the canonical previous envelope, `null` for genesis — `schema/fleet-state.v1.md:25`, rule 1 `:41-43` | computed in `seal` `src/envelope.mjs:43`; linkage checked `src/envelope.mjs:67`, `src/store.mjs:41` | `null` (first envelope from this node) |
| `tip` | receipt_id of the node's **local ledger tip at seal time** — `schema/fleet-state.v1.md:26` | carried verbatim; surfaced by `verifyChain` result `src/envelope.mjs:70` | artifact `body.chain_tail` = `21c225f9e7320974` — the cell-state hash |
| `kind` | `state-delta \| receipt-batch \| lane-heartbeat` — `schema/fleet-state.v1.md:27`, kinds table `:33-38` | `KINDS` `src/envelope.mjs:9`; unknown kind throws `:41` | `"state-delta"` — the artifact is a single ledger-grade mutation (`:36`). NOT `lane-heartbeat`: heartbeats MUST NOT carry result-shaped fields (`:38`), and this artifact is nothing but result |
| `payload` | kind-specific; for `state-delta`: `{ "op", "addr", "result" }`, same preimage as a fabric receipt — `schema/fleet-state.v1.md:28,36` | opaque to `seal`, gated by kind at ingest (`src/store.mjs:44-53`) | `{ op: "PROMOTE", addr: artifact.key (the saved-run KV path), result: artifact.body (promoted_from, colo, chain_tail, ticks, rule, seed) }` — body rides verbatim |
| `sig` | `null \| "hmac-sha256:<64hex over canonical(schema|node|seq|prev|tip|kind|payload)>"` — `schema/fleet-state.v1.md:29`, rule 5 `:55-60` | `seal` `src/envelope.mjs:47-48`; `verifySig` strips `sig` and recomputes `:52-58` | HMAC under a **throwaway** PoC key (see interop.mjs header); production keys live outside the agent context via `EDGE_LEDGER_HMAC_KEY` / `EDGE_LEDGER_KEYFILE` (`src/envelope.mjs:21-36`, `README.md:11-12,37`) |

Cross-cutting rules used:

- **Canonical form** — recursively key-sorted JSON, no whitespace, UTF-8; sha256
  over those bytes (`schema/fleet-state.v1.md:68-70`; `src/envelope.mjs:12-19`).
  The signed text never mentions the signature (`src/envelope.mjs:44,55`).
- **Idempotent delivery + fork rejection** — same `(node, seq)` + same hash =
  acked no-op; same seq different hash = FORK, rejected with both hashes quoted
  (`schema/fleet-state.v1.md:47-49`; `src/store.mjs:31-37`, fork message `:36`;
  demo fork attempt `demo.mjs:27-30`).
- **Bounded size** — max 64 KiB canonical (`schema/fleet-state.v1.md:64-66`;
  `src/envelope.mjs:10,46`). Our envelope is ~400 bytes.
- **Projections never write back** (`schema/fleet-state.v1.md:61-63`,
  `README.md:47`) — the PoC only seals/verifies, no board.

Artifact field note: the fetched sample carries `key`, `size`, `body`. `key` →
`payload.addr`; `body` → `payload.result` verbatim + `tip` from its
`chain_tail`. `size` is KV-listing metadata, not cell state — dropped (the
envelope's own canonical bytes are the size truth).

## Interop thesis (5 lines)

1. A quilt-edge-lab **saved artifact is one node update**: a single ledger-grade
   promotion mutation, so it travels as `kind: "state-delta"` with
   `{op: "PROMOTE", addr: <saved key>, result: <artifact body>}` — exactly the
   state-delta preimage at `schema/fleet-state.v1.md:36`.
2. The artifact's **`chain_tail` is the cell state hash**, and the envelope's
   `tip` field is defined as the local ledger tip's hash at seal time
   (`schema/fleet-state.v1.md:26`) — same concept one level up: tail of the
   cell chain rides as the tip of the fleet chain.
3. The **promotion witness = the envelope witness**: the saved artifact
   (evidence that run 30/42/1000 was promoted at colo SIN) becomes
   tamper-evident in transit through the envelope's `prev` hash chain plus the
   HMAC `sig` — "the chain rule is public; the signature is the difference
   between evidence and testimony" (`README.md:45`).
4. Kind choice is load-bearing: a heartbeat that carried this body would violate
   "heartbeats MUST NOT carry result-shaped fields" (`schema/fleet-state.v1.md:38`)
   — the schema itself forces promotions into state-delta.
5. A re-delivered promotion with one flipped tail char is the **double-spend
   shape**: same `(node, seq)`, different hash → FORK, rejected loudly with
   hashes quoted (`src/store.mjs:31-37`) — quilt tail-pinning and fleet fork
   rejection are the same culture, so the PoC gates on both.
