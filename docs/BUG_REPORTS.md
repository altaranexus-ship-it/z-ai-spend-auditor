# T3N Docs Bug Report — CLAW-48 submission (agent: Crypto Acquisition)

Audited 2026-09-14 against the live docs (docs.terminal3.io, llms.txt served 14:09Z)
and the SDK the docs pin: `@terminal3/t3n-sdk@5.2.0` (testnet-v1.0.9).
Every finding below is verified, not speculative. Repro commands included.

## BUG 1 (major): invoke-contract walkthrough snippet does not compile

Page: /developers/adk/get-started/walkthrough/invoke-contract (linked directly from the bounty's step 2)

The first TypeScript sample has two copy-paste artifacts:

a) `fetchTrustedManifest` is imported **twice** in the same import statement
   (line 4 and line 10 of the snippet) → TS2300: Duplicate identifier.

b) Both client configs (`agentClient` and `userClient`) pass `trustAnchor`
   **twice**: once inline (`trustAnchor: await fetchTrustedManifest("testnet"),`)
   and once via the const shorthand (`trustAnchor,`) that the comment says
   should be "reused below for every client in this file" → TS1117: An object
   literal cannot have multiple properties with the same name. The inline
   re-fetch also contradicts the snippet's own comment.

Compile-proof (tsc 5.x, strict, against the SDK's own dist/index.d.ts):
- as-served snippet: 3 errors (TS2300 ×2, TS1117)
- after deleting exactly 3 lines (the dup import line + the two inline
  re-fetch lines): **0 errors**, clean compile

Minimal fix: in the import block delete the second `fetchTrustedManifest,`;
in each `new T3nClient({...})` delete the line
`  trustAnchor: await fetchTrustedManifest("testnet"),` (keep `trustAnchor,`).

## BUG 2 (minor): llms.txt OpenAPI link is a 404

Page: https://docs.terminal3.io/llms.txt (the machine-readable index that the
"AI Coding Assistants" workflow depends on)

Line 54: `- [terminal-3-openapi](/terminal-3-openapi.yml)`
`curl -i https://docs.terminal3.io/terminal-3-openapi.yml` → HTTP 404.
Also 404 at plausible alternates: /openapi.yml, /developers/terminal-3-openapi.yml,
/terminal3-openapi.yml, /developers/adk/terminal-3-openapi.yml.
Impact: AI coding assistants following the documented discovery flow hit a dead
entry point; the spec is effectively unreachable.

## BUG 3 (minor): dead internal link in SDK & API Reference

Page: /developers/adk/reference
Link `[API reference](/api-reference)` → HTTP 404 (live-verified 2026-09-14).

## BUG 4 (minor): dead internal link in Smart VCs intro page

Page: /intro/components/vc
Link to `/documentation/preliminaries/web-standards/dids` → HTTP 404
(live-verified). Looks like a leftover from a previous docs tree.

## Checked and CLEAN (for the maintainers' confidence)

- All 14 distinct SDK symbols imported across all doc pages resolve in the
  installed 5.2.0 type declarations.
- All 20 SDK methods/APIs claimed in the changelog and reference (incl. the
  four `exportActivityLog` family methods, the full member-delegation rename
  table, `tenant.maps` entrySet/entryGet/getStatus, `unsafe_trust_server`)
  are present in 5.2.0.
- All 12 CLI subcommands documented on the agent-registration pages exist in
  the 5.2.0 CLI (`t3n --help` diff-checked).
- Remaining internal links across all 48 pages resolve (200).
- `npm install @terminal3/t3n-sdk@5.2.0` instructions are consistent everywhere
  they appear; changelog honestly scopes its claims to testnet-v1.0.9.

## Repro

```bash
curl -s https://docs.terminal3.io/llms.txt | grep openapi   # BUG 2
curl -sI https://docs.terminal3.io/terminal-3-openapi.yml | head -1   # 404
curl -s https://docs.terminal3.io/developers/adk/get-started/walkthrough/invoke-contract.md \
  | sed -n '16,40p'   # BUG 1 verbatim snippet
```
TypeScript repro available in this repo: t3n_docs_bug_evidence/ (ORIG vs FIXED).

## BUG 5 (blocker, live-verified 2026-09-15 03:3xZ): testnet fleet RTMR3 zeroed — handshake impossible on SDK 5.2.0; manifest rejected as malformed by SDK 5.4.0–5.15.2

Environment: SDK @terminal3/t3n-sdk (docs-pinned 5.2.0; also bisected 5.4.0/5.6.0/5.8.0/5.9.0/5.10.0/5.12.0/5.14.0/5.15.2), Node 24.15.0, macOS arm64, env testnet (https://cn-api.sg.testnet.t3n.terminal3.io).

Two failure layers, both platform-side:

1) On the docs-pinned SDK 5.2.0: `T3nClient.handshake()` → `assertNodeTrusted` fails for ALL 3 peers:
   `DKG attestation verification failed ... 0/3 quotes valid (peer QmPk4Atb...: RTMR3 not in allowlist, RTMR3 AAAAAAAAAAAA…; peer QmQBh7yAK...: same; peer QmSGy7LgD...: same). Pinned RTMR3 allow-list: [+XO6nLsfqnTk…] from trust manifest v1787800421 signed at 2026-08-27T03:13:41Z. Refusing to encapsulate to an unverified ML-KEM key.`
   Every peer reports RTMR3 = all-zero — the DKG nodes' TEE quotes are either misreported or the fleet was reprovisioned without updating measured boot.

2) On any SDK ≥ 5.4.0 (incl. latest 5.15.2): `fetchTrustedManifest("testnet")` throws
   `Error: Trust manifest at https://cn-api.sg.testnet.t3n.terminal3.io/api/trust-manifest is malformed.`
   The live endpoint returns `{"version":1787800421,"cluster":"testnet","peer_ids":[3 peers],"rtmr3_allowlist":["+XO6nLsfqnTk…"],"signature":<128B>,"signed_at":"2026-08-27T03:13:41Z"}` — i.e. NEWER SDKs enforce a manifest schema the node no longer serves (or vice versa), so there is NO SDK version that can currently complete setup: old SDK parses manifest but refuses zeroed quotes; new SDKs refuse the manifest itself.

Impact: the challenge's step-3 handshake (`npm run setup`) cannot succeed for ANY participant on any SDK version right now. This is a fleet/trust-anchor incident on the T3N side, not a client misconfiguration: key + DID authenticate fine, WASM loads, transport reaches the cluster.

Repro:
```bash
npm i @terminal3/t3n-sdk@5.2.0
T3N_API_KEY=0x… node -e "…"   # T3nClient handshake → 0/3 quotes valid (RTMR3 zeros)
npm i @terminal3/t3n-sdk@5.15.2
node -e "import('@terminal3/t3n-sdk').then(async m=>{await m.fetchTrustedManifest('testnet')})"  # → malformed
curl -s https://cn-api.sg.testnet.t3n.terminal3.io/api/trust-manifest | jq '.version, .rtmr3_allowlist'
```

Suggested fix (T3N side): reprovision/repair DKG peers so RTMR3 matches the signed allowlist, or publish a fresh signed manifest (bump `version`) matching the current fleet — plus align the SDK manifest schema so 5.x and current releases both accept it.

Submission status for this bounty: agent-side build verified earlier (cargo tests, wasm component); blockage is exclusively this platform incident. Will complete setup→demo→register the moment the cluster serves a consistent manifest/quote set (re-run: `T3N_API_KEY=… T3N_DID=… bash agent/scripts/run-finish.sh --with-agent-did`).

### RE-VERIFIED 2026-09-15 04:05Z (authenticated live probe, owner key+DID)

Full finish chain re-fired with the real handoff credentials: key + DID authenticate cleanly (client constructs, transport reaches the cluster), then `T3nClient.handshake()` fails at `assertNodeTrusted` with the IDENTICAL signature — 0/3 quotes valid, all three peers (QmPk4Atb…, QmQBh7yAK…, QmSGy7LgD…) still report RTMR3 = all-zero; pinned allowlist still `+XO6nLsfqnTk…` from manifest v1787800421 (signed_at unchanged 2026-08-27T03:13:41Z; live endpoint byte-identical). Trust-manifest endpoint re-checked 04:04Z: no version bump. Failure is deterministic, not transient. No client-side workaround exists (docs-pinned 5.2.0 refuses zeroed quotes; ≥5.4.0 bisect by CEO 03:3xZ already showed manifest-schema rejection through 5.15.2, and the manifest has not changed since).

## BUG 6 (fixed client-side, live-verified 2026-09-15 09:1xZ): set_claims_digest contract violation after fleet heal
Platform republished the trust manifest (v1789446184, 04:23Z) accepting the zeroed fleet; handshake then succeeded. First-ever live contract execution exposed: seal_receipt passed the 64-char hex STRING (64 bytes) to kv_store::set_claims_digest, which requires the raw 32-byte digest → "claims digest must be exactly 32 bytes". Fixed: hex::decode before sealing (src/ledger.rs). cargo test 4/4 PASS; fixed wasm re-published as version 0.1.3. Note for maintainers: the TEE host rejects non-32-byte claims digests at tx granularity — worth documenting in the ADK kv-store reference. Also live-verified this run: (a) map ACL error strings are lowercase on the node ("map already exists") while docs show camelCase (MapAlreadyExists); (b) map deletion is async and slow (>5 min observed); (c) version-bump re-publish of the same tail allocates a NEW numeric contract id, so map writer/reader grants must be re-pointed after any re-publish (grant_maps.ts / grant_readers.ts in agent/scripts/).
