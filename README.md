# z-ai-spend-auditor — a TEE-resident AI-spend auditor for T3N

**Ship your AI bill inside the enclave.** z-ai-spend-auditor is an enterprise
agent for the [Terminal 3 Network (T3N)](https://docs.terminal3.io) ADK that
answers the question every AI team asks and no dashboard answers honestly:
*what did we actually spend, on which provider, and did we blow the budget?*

Usage events go in, aggregates and alerts come out, and every write is sealed
into the transaction's claims digest — so the ledger is append-only,
per-tenant private, and offline-verifiable. The contract dials **no** external
API: its entire capability surface is `kv-store` + `logging` +
`tenant-context` (the base tenant world), which is exactly the right trust
envelope for an auditor.

## What it does

| Function | Input (JSON) | Output (JSON) |
|---|---|---|
| `record-usage` | `{ provider, model, tokens_in, tokens_out, cost_micros, ref? , month? }` | `{ entry_id, seq, month, receipt_sha256, month_total_cost_micros, budget_micros, over_budget }` |
| `month-report` | `{ month, provider? }` | `{ month, per_provider[], total_cost_micros, total_calls, budget_micros, over_budget, pct_of_budget_bps }` |
| `set-budget` | `{ month, budget_micros }` (0 = clear) | `{ month, budget_micros, set, receipt_sha256 }` |
| `list-alerts` | `{ month }` | `{ month, alerts[] }` — kinds: `over-budget`, `spend-spike` |

Costs use **micro-USD** (integer fixed point, 1e-6 USD) so there is no float
drift in an audit trail. A single event more than ¼ of the monthly budget
raises a `spend-spike` alert; crossing the budget raises `over-budget`.
Alerts are recorded as data — the write path never fails because of policy.

## Why T3N (and why this design)

- **Auditor-grade isolation.** All state lives in tenant-scoped KV maps under
  `z:<tenant-did>:` inside the TEE. No ACL to misconfigure: the host enforces
  the namespace on every read/write.
- **Append-only by construction.** Entry keys embed the host's monotonic tx
  sequence (`tenant_context::seq_no()`), so a retried transaction cannot
  overwrite history.
- **Verifiable receipts.** Every mutation folds a length-prefixed,
  domain-separated SHA-256 (`domain ‖ entry_key ‖ body`) into
  `kv_store::set-claims-digest`, which lands in the host's Merkle receipt —
  audit your month offline against receipts the enclave minted.
- **Smallest capability surface.** No `http`, no `http-with-placeholders`
  import — nothing to grant, nothing to leak. The WIT world *is* the
  capability manifest.
- **Zero external dependencies to rotate.** No Duffel/OpenAI/Stripe keys in
  `secrets` — the auditor audits; it doesn't call anyone.

## Repository layout

```
z-ai-spend-auditor/
├── wit/
│   ├── world.wit              ← contracts interface + the 3 host imports
│   └── deps/                  ← vendored host packages (host-interfaces-2.1.0, host-tenant-1.0.0)
├── src/
│   ├── lib.rs                 ← wit-bindgen entry + 4-function dispatch
│   ├── ledger.rs              ← all ledger/aggregation/alert logic (+ unit tests)
│   └── types.rs               ← serde request/response shapes
├── agent/                     ← tenant-side Node/TypeScript app (SDK v5.2.0)
│   └── scripts/
│       ├── session.ts         ← auth → TenantClient → register → maps → budget
│       ├── demo.ts            ← end-to-end: record 4 events → report → alerts
│       └── register-agent.ts  ← give the agent its own DID + hosted agent card
└── Cargo.toml                 ← cdylib + lib, wasm32-wasip2 component target
```

## Run it (10 minutes, testnet, no capital)

Prereqs: Node ≥ 18, Rust with `rustup target add wasm32-wasip2`, and an API
key with test credits from the T3N claim page (self-serve — shown once, copy
it immediately).

```bash
# 1. build the TEE contract (WASM component)
cargo build --target wasm32-wasip2 --release
#    → target/wasm32-wasip2/release/z_ai_spend_auditor.wasm (~185 KB)

# 2. unit-test the ledger logic natively
cargo test

# 3. tenant-side setup + demo
cd agent && npm install
export T3N_API_KEY="0x…"          # tenant key from the claim page
npm run setup                      # auth → register contract → create 4 maps → seed $25 budget
npm run demo                       # record usage → month report → alerts, receipts printed
#    later runs: export T3N_CONTRACT_ID=<id from setup> to skip re-registration

# 4. (optional) give the agent its own identity
export AGENT_KEY="0x…"             # a SECOND key from the claim page — never reuse the tenant key
npm run register-agent             # → did:t3n:<40 hex> + T3N-hosted ERC-8004 card
```

Expected demo tail: four `recorded …` lines with running month totals and
receipt hashes, a per-provider report, and `over-budget` / `spend-spike`
alerts triggered by the seeded $25 budget.

## Maintenance notes (the "trivially maintainable" part)

- **One file of business logic.** `src/ledger.rs` holds every operation; the
  pure helpers (calendar math, month validation, receipt folding) are covered
  by `cargo test` and run identically native and in-WASM.
- **Fixed map set.** Four maps (`usage`, `agg`, `alerts`, `budget`) created
  once at bootstrap — month rollover is just a new key prefix, so there is no
  per-month setup step to forget.
- **Idempotent bootstrap.** `maps.create` tolerates `MapAlreadyExists`;
  `T3N_CONTRACT_ID` skips credit-burning re-registration on re-runs.
- **ABI-checked against the real SDK.** `npx tsc` passes against
  `@terminal3/t3n-sdk@5.2.0` types (numeric contract ids in ACLs, borrowed
  byte slices in WIT).
- **Adding a provider is a no-op.** Providers are data (`provider` string in
  the event), not code — onboarding a new AI vendor requires zero contract
  changes.

## Known limitations

- `list-alerts` scans one month at a time (500-entry one-shot cap per the
  host ABI); paginate by month if you generate >500 alerts/month.
- `member-delegation` demo (agent-scoped grants) is documented but left as an
  exercise — the walkthrough's `updateMemberDelegation` read-merge-write
  helper applies unchanged to this contract's functions.
- Testnet-only today; flip `setEnvironment("production")` + `--env` flags for
  a production cluster (deliberate one-line change per T3N guidance).

## Docs this build follows

- Quickstart: docs.terminal3.io/developers/adk/get-started/quickstart
- Walkthrough (write/register/invoke contract): docs.terminal3.io/developers/adk/get-started/walkthrough/*
- Agent onboarding: docs.terminal3.io/developers/agents/register-agent
- Member delegation: docs.terminal3.io/developers/adk/get-started/member-delegation
- Tips (KV maps, seeding secrets, capability-from-WIT, common errors)

Built for the T3N ADK agent-build challenge (Sept 2026).

## Re-publish / re-grant runbook

The contract register is **monotonic per tail**: publishing a bumped version
mints a **new numeric contract id**, and you cannot re-take a consumed version
(`version X is not higher than current version X`). Plan every re-publish
around three consequences:

1. **Re-point BOTH grant sides.** Maps created earlier still point at the old
   id — re-assert `writers` AND `readers` of all four audit maps
   (`usage`, `agg`, `alerts`, `budget`) at the new id:
   `cd agent && GRANT_CONTRACT_ID=<new-id> node scripts/safe-tsx.mjs scripts/verify_grants.ts`
   (re-points both sides idempotently and prints the returned ACL config;
   `grant_maps.ts` / `grant_readers.ts` do one side each.)
2. **Map deletions are async** — after `maps.delete`, a same-tail create can
   briefly 409/404 until the deletion settles. Wait-and-retry, don't race it.
3. **Keep repo labels in lock-step with the published version** (Cargo.toml,
   `CONTRACT_VERSION` in `src/lib.rs`, `wit/world.wit` package version,
   `agent/package.json`). Drift between repo labels and the live registry is
   what this repo hit in Sept 2026 — labels said 0.1.0 while 0.1.5 was live.
