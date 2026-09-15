# CLAW-48 Submission Kit — z-ai-spend-auditor

Prepared 2026-09-14 by Crypto Acquisition run 9176aa9f (build phase complete, pre-key).
Bounty: "Try out new docs to build a trusted agent with T3N" — earn.superteam.fun/listing/t3n-agent-build-challenge.
Rewards: 290 USDC total — 1st 100 / 2nd–3rd 50 / 4th–6th 30 (6 paid places).
Judging: time-to-submit, build quality/usefulness + maintainability, docs quality, bug submissions; bonus for X post tagging @terminal3io.
Deadline: 2026-09-16 15:59 UTC. Commitment date 09-23.

## Verified build facts (this workspace, live this session)

- `cargo test` → 3/3 unit tests + 1/1 doc-test PASS (calendar math, month validation, receipt folding)
- `cargo build --target wasm32-wasip2 --release` → OK in 37.7s
- Artifact: `target/wasm32-wasip2/release/z_ai_spend_auditor.wasm` — 189,315 bytes, verified WASM component
  (`wasm-tools component wit` shows exports `z:ai-spend-auditor/contracts@0.1.0`; imports = tenant-context, logging, kv-store only)
- `npx tsc --noEmit` (agent/, against @terminal3/t3n-sdk@5.2.0 real types) → exit 0
- Env-gate smoke: demo + register-agent scripts fail fast with friendly messages when keys absent (verified)
- Capability surface: tenant-base world only — zero outbound HTTP imports, zero third-party API keys

## Local artifacts

- Kit root: ~/Dolly/paperclip/claw48_z-ai-spend-auditor/
- README.md (docs-quality deliverable): design rationale, API table, 10-minute run guide, maintenance notes, limitations
- agent/scripts/: session.ts (bootstrap), demo.ts (end-to-end), register-agent.ts (DID + ERC-8004 card via t3n CLI)
- Reference repo used for WIT ABI: ~/Dolly/paperclip/claw48_ref_z-tenant-flight/ (Terminal-3/z-tenant-flight)

## RUNBOOK (post-key, ONE command — run 0d1c1eeb)

**PITFALL FIXED 09-14 (run 0d1c1eeb):** tsx IPC crashes under Paperclip run TMPDIRs
(unix socket path > macOS 104-char limit: "listen ... .pipe"). scripts/run-finish.sh
pins TMPDIR=/tmp/tsx48 — verified: stub-key session.ts + demo.ts execute cleanly to
the SDK layer and fail only at wallet derivation on the fake key (secret-safe).
**On key handoff: `T3N_API_KEY=0x… T3N_DID=did:t3n:… ./agent/scripts/run-finish.sh [--with-agent-did]`** — then copy "Connected as:" DID into the ⟪…⟫ fields above and submit on Earn.

## Earn submission form (pre-filled; placeholder fields marked ⟪…⟫)

- Email: altaranexus@gmail.com
- DID: ⟪did:t3n:<paste tenant DID from `npm run setup` output "Connected as:">⟧
  (agent DID optional if `npm run register-agent` is run: ⟪did:t3n:…⟧)
- Project name: z-ai-spend-auditor
- One-liner: TEE-resident AI-spend auditor for T3N: records per-call usage events, aggregates monthly spend per provider, raises budget/spike alerts, and seals SHA-256 audit receipts — base tenant world only, zero outbound HTTP, zero third-party keys.
- What it does (short): Teams can't answer "what did AI cost us this month?" honestly. This contract turns usage events into an append-only, tenant-private ledger inside the enclave, with per-provider monthly totals, budget + spike alerts as queryable data, and receipts folded into the tx claims digest (offline-verifiable via the host Merkle receipt).
- How it uses T3N ADK: quickstart auth flow (T3nClient + handshake + authenticate → tenantDid read back from session); TenantClient for contract registration and four private KV maps with explicit contract-only ACLs; control-plane map-entry-set for the budget seed; executeAndDecode for all calls; ERC-8004 agent card hosting via the t3n CLI. Capabilities come from the WIT world: kv-store + logging + tenant-context, nothing else.
- Usefulness: works for any AI provider day one (providers are data, not code); micro-USD integer math (no float drift); month rollover is a key prefix, no setup step to forget.
- Maintainability: all business logic in one file (src/ledger.rs), pure helpers unit-tested (cargo test), idempotent bootstrap, T3N_CONTRACT_ID skip for re-runs, tsc-clean against real SDK types.
- Continue running it: YES — keep the tenant deployed on testnet, honor delegation requests, and maintain for 6+ months.
- Bug submissions: deferred (none filed this round).

## X post draft (owner posts from @MendoncaM1994, tag @terminal3io)

Variant A (primary):
  AI bills are the new shadow IT. Nobody can tell you what last month actually cost.
  Built z-ai-spend-auditor on @terminal3io ADK: usage events → append-only ledger in the TEE → per-provider totals, budget alerts, SHA-256 audit receipts. Zero outbound HTTP.
  Built + tested in a day on the new docs. 🧵

Variant B (shorter):
  What did AI cost you last month? Your dashboards don't know.
  z-ai-spend-auditor on @terminal3io: enclave-resident spend ledger + alerts + verifiable receipts. Base tenant world only — nothing to leak.
  Docs → working agent in one sitting.

(Both < 280 chars counting URLs as 23.)

## Owner ask (the one human step) — LIVE GATE: request_confirmation card 1892a4d9 on CLAW-48
(ask_user_questions class abandoned — v1 card f56ba642 expired in ~19 min and was supersede-killed by a later comment. The live card is request_confirmation, wake_assignee_on_accept, supersedeOnUserComment=false explicit — it survives comments; do not post throwaway comments after it.)

1. Open https://go.terminal3.io/adk-community and click "Sign in with Google" (session altaranexus@gmail.com).
2. Copy the API key (shown ONCE) and the DID from the claim page.
3. Paste both back on the CLAW-48 card (key as ENV-style line; DID as plain text).
4. Optional second key for the agent identity (register-agent step) — claim page issues one per visit.

Sandbox: 20,000 test credits, no capital involved. On paste-back, agent runs `npm run setup` + `npm run demo`, captures live output as submission evidence, then submits on Earn before 09-16 15:59Z.

## Watch log

- 2026-09-14 ~12:30Z: build phase complete + verified (see "Verified build facts"). Blocked only on SSO key handoff. Stray SUBMISSION_STATUS.md from a parallel/earlier run contained unverified claims (wrong error list, CLAW-20 reference) — superseded by this file; treat THIS file as the single source of truth for CLAW-48 submission state.
- 2026-09-14 ~10:1xZ (run 2716a18e): owner card still PENDING (1892a4d9, no response). Full green re-verification: cargo test 3/3 + 1/1 PASS, wasm component 189,315 B intact, agent tsc exit 0; Earn listing re-fetched live — OPEN, 290 USDC, deadline 2026-09-16T15:59Z unchanged. Doc drift fixed: owner-ask section now names the live request_confirmation card (was: stale ask_user_questions reference).
- 2026-09-14 ~10:05Z (run 494dfe4b, wake issue_blockers_resolved): wake fired on the board's withdrawal of the wrong CLAW-20 checkbox card f787ba8f (~09:55Z) — no new owner input arrived. Re-verified: gate 1892a4d9 STILL PENDING (human_only, wake_assignee_on_accept, supersedeOnUserComment=false); wasm 189,315 B mtime Sep 14 12:19; all runbook scripts present; run-finish.sh bash -n clean. Zero agent-side work remains pre-key. Lane stays in_progress per board directive — card acceptance is the continuation path.
- 2026-09-14 20:14Z (run 1ed44df3, wake process_lost_retry, unassigned): external re-check. Earn listing re-fetched LIVE: status OPEN, rewardAmount 290 USDC, deadline 2026-09-16T15:59:59.999Z unchanged (~44h remain). Build evidence re-verified on disk: wasm 189,315 B (mtime Sep 14 12:19), agent/scripts/ complete, run-finish.sh bash -n OK. No T3N secret in agent secret store (agents/me/secrets empty) and no company secrets in catalog — owner handoff NOT yet delivered. Gate card 1892a4d9 still PENDING since 09:38Z (~10.6h). Board comment attempted? No — unassigned runs lack comment rights (known 403); this watch-log line is the run's evidence. Single remaining action is unchanged: owner SSO → key handoff on card 1892a4d9 → accept → run-finish chain → Earn submit.
- 2026-09-14 20:20Z (run d4610414, wake issue_commented on local-board re-check 32bdf5e2): acknowledged; independently re-verified the same state first-hand — gate 1892a4d9 PENDING via API (created 09:38Z, ~10.7h), wasm 189,315 B mtime 12:19Z intact, run-finish.sh bash -n OK, agent/scripts complete, agent secret store EMPTY (company catalog empty per 20:15Z board-level check). Zero new agent-side work pre-key. No card churn (no withdraw/recreate — pending age preserved); lane held in_progress with the gate card as sole continuation path.
- 2026-09-14 20:19Z (run 7341c9ff, unassigned): board comment DID land via MCP channel (comment e319609a on CLAW-48) — supersedes the "attempted? No" note above. Watch-log summary posted: gate still pending ~10.7h, T3N at 173 subs (competitive), tsc/wasm re-verified, no new agent-eligible bounties (23 open, 1 AGENT_ALLOWED). CLAW-36 pipeline doc refreshed (rev 497ad0d8).
- 2026-09-15 01:23Z (run ebbd2d26, wake issue_commented CEO sweep eb8e826b at 01:19Z): acknowledged, independently re-verified same state first-hand. Gate 1892a4d9 PENDING 15.7h — supersedeOnUserComment=false preserved (no card churn). Build art intact (wasm 189,315 B). Opened Chrome tab to https://terminal3.io/products/agent-developer-kit — owner can click "Sign in with Google" the moment they're back at the machine; altaranexus@gmail.com session is already live (Gmail tabs 240/344/345 open). Discovered: `go.terminal3.io/adk-community` Short.io 302-redirects to the product page (no separate SSO URL); the SSO button lives on the product page itself and loads Google's GSI client script inline. Agent-side action complete: zero further pre-key work; everything hinges on the one owner click. T-38.6h to deadline, escalation threshold T-20h (Sep 15 20:00Z).
- 2026-09-15 04:05Z (run c6e2ae9a, wake issue_commented CEO 04:00Z handoff/RCA): key handoff comment located on CLAW-63 (02:22:21Z, author_type=user) — keys pulled to protected env, not persisted. Finish chain re-fired with REAL credentials at 04:05Z: key+DID authenticate; handshake fails with identical BUG 5 signature (0/3 quotes valid, RTMR3 all-zero on all 3 peers, manifest v1787800421 unchanged since 08-27). Blocker re-confirmed deterministic and platform-side; no client-side workaround. Build artifacts intact. T-35.9h to deadline. Single remaining action unchanged: T3N repairs DKG fleet/republishes manifest → re-run run-finish.sh → Earn submit. Escalation threshold T-20h (Sep 15 20:00Z) unchanged.
- 2026-09-15 04:34–09:19Z (run c6e2ae9a, watch-and-fire): PLATFORM HEALED — T3N republished trust manifest v1789446184 at 04:23Z accepting the zeroed fleet; watchdog caught it in 11 min and auto-fired. Post-heal recovery sequence: (1) authenticated probe confirmed contract registered (tail ai-spend-auditor, status active); (2) version-bump re-publishes carried the FIXED wasm (latent bug: seal_receipt fed 64-byte hex digest to set_claims_digest which demands raw 32 bytes — fixed in ledger.rs, cargo test 4/4 PASS, wasm rebuilt 191,471 B); (3) map ACLs re-granted (usage/agg/alerts/budget writers+readers → id 1025; budget recreated after async delete); (4) FULL END-TO-END DEMO PASS exit 0: 4 events recorded with sealed receipts, month report TOTAL $0.153290 (0.61% of $25 budget), alerts clean. CANONICAL STATE: contract id 1025 @ 0.1.3, tenant DID did:t3n:17c5904fd6337be3dfde0ddf5f4530e5ff45360f — saved in .t3n_state. Evidence: evidence/live_demo_2026-09-15T09xxZ.txt. Watchdog cron 02a16e7a953d PAUSED (mission complete). Remaining: fill DID in Earn form + submit, X post draft ready.
