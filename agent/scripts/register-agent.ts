/**
 * register-agent.ts — gives THIS agent its own T3N identity (DID + hosted
 * ERC-8004 agent card) using the documented `t3n` CLI that ships with the SDK.
 *
 * Per T3N docs, an agent needs its OWN key + credits (separate from the
 * tenant's): claim one on the claim page, then:
 *   export AGENT_KEY=0x…
 *   npm run register-agent
 *
 * Steps (docs: /developers/agents/register-agent):
 *   1. t3n whoami --env testnet          → read the agent DID back
 *   2. t3n agent create-card --did …     → scaffold agent-card.json
 *   3. t3n agent host-card               → T3N hosts it world-readable
 *   4. verify: GET the hosted card URL
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const CLI = ["npx", "--yes", "@terminal3/t3n-sdk"];

function t3n(args: string[]): string {
  return execFileSync(CLI[0], [...CLI.slice(1), ...args], {
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, T3N_API_KEY: process.env.AGENT_KEY },
    encoding: "utf8",
  }).trim();
}

if (!process.env.AGENT_KEY) {
  console.error(
    "Missing AGENT_KEY — claim a dedicated agent key (with credits) on the claim page, then `export AGENT_KEY=0x…`. Never reuse the tenant key.",
  );
  process.exit(1);
}

console.log("1) whoami…");
const agentDid = t3n(["whoami", "--env", "testnet"]);
if (!/^did:t3n:[0-9a-f]{40}$/.test(agentDid)) {
  console.error(`unexpected DID shape: ${agentDid}`);
  process.exit(1);
}
console.log("   agent DID:", agentDid);

console.log("2) scaffold agent card…");
t3n([
  "agent", "create-card",
  "--did", agentDid,
  "--name", "z-ai-spend-auditor",
  "--description",
  "TEE-resident AI-spend auditor: records per-call usage events, aggregates monthly spend per provider, raises budget/spike alerts, and seals SHA-256 audit receipts — all inside the T3N enclave. Zero outbound HTTP; base tenant world only.",
  "--force",
]);
const card = JSON.parse(readFileSync("agent-card.json", "utf8"));
const didService = card.services?.find((s: { name: string }) => s.name === "DID");
if (didService) didService.endpoint = agentDid;
// No public A2A/MCP endpoint for this build — drop those services rather than
// advertise placeholders. DID-only card, kept under the 16 KiB hosting cap.
card.services = didService ? [didService] : card.services;
writeFileSync("agent-card.json", JSON.stringify(card, null, 2));
console.log("   card scaffolded (DID service only):", JSON.stringify(card.services));

console.log("3) host card on T3N…");
t3n(["agent", "host-card", "--env", "testnet", "--file", "agent-card.json"]);
console.log(`   hosted at the world-readable endpoint for ${agentDid}`);
console.log("\nDone. Paste this DID into the Earn submission:", agentDid);
