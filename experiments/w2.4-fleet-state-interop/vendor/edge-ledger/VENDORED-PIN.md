# Vendored: SuperInstance/edge-ledger (reference implementation)

Source files vendored verbatim from a shallow clone of
`https://github.com/SuperInstance/edge-ledger` at pinned commit
`516533b0f9cc4bc054cbae91c28545888422125f` (2026-09-30, clone log
`-1 --format='%H %ci'` verified at PoC time).

Purpose: `interop.mjs` and `test/interop.pins.mjs` import the fleet-state@v1
reference implementation (`src/envelope.mjs`, `src/store.mjs`) so P2's chain /
sig verification runs through the REAL verifier, not a re-implementation.
Vendoring keeps this experiment rerunnable without network access; nothing in
`vendor/` was modified — pin P0 of the upstream `test/edge.pins.mjs` (8/8 at
vendored HEAD) is the drift tripwire.
