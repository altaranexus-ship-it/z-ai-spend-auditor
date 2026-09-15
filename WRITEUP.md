# z-ai-spend-auditor — a TEE-resident AI-spend auditor for T3N ADK

Submission for the Superteam Earn bounty "Try out new docs to build a trusted agent with T3N that we can distribute / host"
Submitted 2026-09-15 (UTC) — Email: altaranexus@gmail.com — DID: did:t3n:17c5904fd6337be3dfde0ddf5f4530e5ff45360f
GitHub repo: https://github.com/altaranexus-ship-it/z-ai-spend-auditor

## 1. One-liner

TEE-resident AI-spend auditor for T3N: records per-call usage events, aggregates monthly spend per provider, raises budget/spike alerts, and seals SHA-256 audit receipts — base tenant world only, zero outbound HTTP, zero third-party keys.

## 2. What it does

Teams can't honestly answer "what did AI cost us this month?" — no dashboard reconciles across providers, and usage logs live outside any trust boundary. z-ai-spend-auditor turns usage events into an append-only, tenant-private ledger inside the enclave, with per-provider monthly totals, budget + spend-spike alerts as queryable data, and receipts folded into the transaction claims digest (offline-verifiable against the host Merkle receipt).

Contract surface (4 functions, all JSON): record-usage, month-report, set-budget, list-alerts. Costs are integer micro-USD (no float drift in an audit trail). A single event over 1/4 of the monthly budget raises a spend-spike alert; crossing budget raises over-budget. Alerts are data — the write path never fails because of policy.

## 3. How it uses T3N ADK

- Quickstart auth flow: T3nClient + handshake (TEE quote verification against the signed trust manifest) + authenticate → tenant DID read back from the session.
- TenantClient: contract registration and four private KV maps with explicit contract-only ACLs (writers = readers = the contract).
- Control-plane map-entry-set for the budget seed; executeAndDecode for all calls.
- Capability envelope comes from the WIT world itself: kv-store + logging + tenant-context — nothing else. No http imports, no secrets to rotate, the WIT world IS the capability manifest.
- ERC-8004 agent card hosting via the t3n CLI (agent identity is a separate key — never reuse the tenant key).

## 4. Live verification on testnet (2026-09-15)

Built and executed LIVE against testnet (cn-api.sg.testnet.t3n.terminal3.io). Full end-to-end demo pass at 09:19Z, contract id 1025 v0.1.3:

Connected as: did:t3n:17c5904fd6337be3dfde0ddf5f4530e5ff45360f
maps ready: usage | agg | alerts | budget (all private, contract-only)
budget seeded: $25.00 for 2026-09
recorded openai/gpt-4.1-mini cost=$0.002940 → month_total=$0.002940 receipt=b5a5cd9b4c93…
recorded openai/gpt-4.1 cost=$0.041250 → month_total=$0.044190 receipt=5652613e8671…
recorded anthropic/claude-sonnet cost=$0.096300 → month_total=$0.140490 receipt=0c45fe1dcf0b…
recorded openai/text-embedding-3-small cost=$0.012800 → month_total=$0.153290 receipt=58a1f63fa9be…
MONTH REPORT 2026-09: openai calls=3 $0.056990 | anthropic calls=1 $0.096300 | TOTAL $0.153290 (0.61% of budget)

- Trust manifest: handshake verified live against manifest v1789451641 (signed 2026-09-15T05:54:01Z) — re-probed at 14:58Z the same day.
- Evidence files (verbatim logs) are committed in the repo: evidence/live_demo_2026-09-15T09xxZ.txt, evidence/credit_state_2026-09-15.txt, evidence/probe_state_2026-09-15.txt.
- Honest accounting: the sandbox's 20k test credits were consumed during the 2026-09-15 platform outage window (watchdog polling + version bumps during DKG reprovisioning). The 09:19Z demo ran while credits were positive. A fresh claim-page key restores credits; all scripts are resume-capable via T3N_CONTRACT_ID so nothing needs re-registration.

## 5. Usefulness & maintainability

- Providers are data, not code: onboarding a new AI vendor is zero contract changes.
- All business logic in one file (src/ledger.rs); pure helpers unit-tested (cargo test 4/4 PASS incl. doc-test); wasm builds clean for wasm32-wasip2 (~191 KB component).
- Idempotent bootstrap: maps.create tolerates MapAlreadyExists; T3N_CONTRACT_ID skips credit-burning re-registration.
- ABI-checked against the real SDK (@terminal3/t3n-sdk@5.2.0): npx tsc --noEmit exit 0.
- Fixed map set, month rollover is a key prefix — no per-month setup step to forget.
- README covers design rationale, API table, 10-minute run guide, limitations.

## 6. Bugs faced during the build (all verified live, documented in repo)

1. kv_store::set_claims_digest takes the RAW 32-byte digest; passing a 64-byte hex string fails at tx time ("claims digest must be exactly 32 bytes"). Native cargo test cannot catch host-boundary type errors — only a live execute did. Fixed in ledger.rs, re-published.
2. Contract register is monotonic per tail: same-version re-register fails; every version bump allocates a NEW numeric contract id (0.1.3→1025, 0.1.5→1029) — and map ACLs still point at the old id after re-publish, so executes fail access-denied until re-granted (both writers AND readers).
3. There is no RPC to read a contract's numeric id back — persist it at register time or burn a version to rediscover it.
4. The obfuscated SDK prints ~2.4 MB of stderr around real errors; PIPE capture truncates at exactly 65536 bytes and loses the error line — stderr must go to a file.
5. maps.delete is async and slow (>5 min): poll map-get-status before re-create.
6. Platform: DKG reprovisioning with an un-republished trust manifest breaks handshake on every SDK version (0/3 quotes valid). We watched it happen and watched the platform heal (manifest republished 04:23Z, v1789446184→v1789451641).

## 7. Bugs submitted against the docs (repro commands in repo BUG_REPORTS.md)

- BUG 1 (major): invoke-contract walkthrough snippet does not compile — duplicate `fetchTrustedManifest` import (TS2300 ×2) and duplicate `trustAnchor` key (TS1117); deleting exactly 3 lines gives a clean compile.
- BUG 2 (minor): llms.txt links /terminal-3-openapi.yml → HTTP 404 (all plausible alternates also 404).
- BUG 3 (minor): dead link in SDK & API Reference (/api-reference → 404).
- BUG 4 (minor): dead internal link in Smart VCs intro (leftover from previous docs tree).

## 8. Continue running it?

YES — we want to continue running it: keep the tenant deployed on testnet, honor member-delegation requests, and maintain the contract for 6+ months. Handover is trivial: single-contract repo, one file of business logic, idempotent bootstrap, resume via T3N_CONTRACT_ID.

## 9. Links

- Repo: https://github.com/altaranexus-ship-it/z-ai-spend-auditor
- Writeup (this doc): (this document)
- T3N docs: https://docs.terminal3.io/developers/adk/get-started/quickstart
- Listing: earn.superteam.fun/listing/t3n-agent-build-challenge

Build quality notes: zero capital outlay (testnet only); no private keys or seed phrases anywhere in the repo or this document (all key references are placeholders).
