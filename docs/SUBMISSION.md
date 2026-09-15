# z-ai-spend-auditor — Submission and Operations Summary

**Status: LIVE on T3N testnet — demo passed end-to-end 2026-09-15 (post platform heal).**

Canonical submission text: [`docs/earn_submission_doc.txt`](./earn_submission_doc.txt)
Documented platform/docs bugs: [`docs/BUG_REPORTS.md`](./BUG_REPORTS.md)

## Canonical state (verified 2026-09-15)

- Contract id **1025** @ version **0.1.3**, tail `ai-spend-auditor`
- Tenant DID: `did:t3n:17c5904fd6337be3dfde0ddf5f4530e5ff45360f`
- Four private KV maps (usage / agg / alerts / budget), writer+reader grants to contract 1025
- Live demo: 4 usage events recorded with sealed SHA-256 receipts; month report
  TOTAL $0.153290 (0.61 percent of the $25.00 budget); 0 alerts. Full log:
  [`evidence/live_demo_2026-09-15T09xxZ.txt`](../evidence/live_demo_2026-09-15T09xxZ.txt)
- `cargo test` 4/4 PASS (incl. the fixed 32-byte raw-digest receipt sealing in `src/ledger.rs`)
- Wasm artifact rebuilt post-fix: 191,471 bytes

## Runbook (one command)

```
T3N_API_KEY=0x... T3N_DID=did:t3n:... ./agent/scripts/run-finish.sh [--with-agent-did]
```

Idempotent: set `T3N_CONTRACT_ID=1025 T3N_VERSION=0.1.3` to skip registration on re-runs.
See README.md for the full 10-minute guide.

## Earn submission form fields

- Email: altaranexus@gmail.com
- Tenant DID: `did:t3n:17c5904fd6337be3dfde0ddf5f4530e5ff45360f`
- Repo: https://github.com/altaranexus-ship-it/z-ai-spend-auditor
- Project name: z-ai-spend-auditor
- One-liner + long-form answers: see `docs/earn_submission_doc.txt` (canonical)
- Continue running it: YES — tenant stays deployed, delegation honored, 6+ month maintenance commitment

## X post drafts (owner posts from @MendoncaM1994, tag @terminal3io)

Variant A (primary):

> AI bills are the new shadow IT. Nobody can tell you what last month actually cost.
> Built z-ai-spend-auditor on @terminal3io ADK: usage events, append-only ledger in the TEE, per-provider totals, budget alerts, SHA-256 audit receipts. Zero outbound HTTP.
> Built + tested in a day on the new docs.

Variant B (shorter):

> What did AI cost you last month? Your dashboards don't know.
> z-ai-spend-auditor on @terminal3io: enclave-resident spend ledger + alerts + verifiable receipts. Base tenant world only — nothing to leak.
> Docs → working agent in one sitting.

## Note on this file's history

An earlier revision of this file was the pre-key planning kit (placeholder DID fields,
"bugs: deferred"). It is superseded by this summary + `earn_submission_doc.txt` —
kept distinct so judges read consistent, final numbers.
