/**
 * Shared session setup: authenticate the tenant, build the TenantClient,
 * register the contract, create the four fixed maps, seed the demo budget.
 * Exports the pieces demo.ts reuses.
 *
 * Env: T3N_API_KEY (required), T3N_CONTRACT_ID (optional fallback), T3N_MONTH.
 */
import {
  T3nClient,
  TenantClient,
  setEnvironment,
  getNodeUrl,
  loadWasmComponent,
  fetchTrustedManifest,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
} from "@terminal3/t3n-sdk";
import { readFile, writeFile } from "fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRACT_TAIL = "ai-spend-auditor";
export const CONTRACT_VERSION = "0.1.0";
// Effective version after a recover-or-bump re-publish (see step 3). demo.ts
// inherits this via call(); always invoke through this variable.
export let contractVersion = CONTRACT_VERSION;
export const MONTH_LABEL =
  process.env.T3N_MONTH ?? new Date().toISOString().slice(0, 7);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_PATH = path.join(
  __dirname,
  "../../target/wasm32-wasip2/release/z_ai_spend_auditor.wasm",
);

const T3N_API_KEY = process.env.T3N_API_KEY;
if (!T3N_API_KEY) {
  console.error(
    "Missing T3N_API_KEY — get one (with 20k test credits) from the claim page, then `export T3N_API_KEY=0x…`",
  );
  process.exit(1);
}

setEnvironment("testnet");

// ---------- 1. authenticate the tenant (quickstart flow) ----------
export const wasmComponent = await loadWasmComponent();
const address = eth_get_address(T3N_API_KEY);
export const t3n: T3nClient = new T3nClient({
  trustAnchor: await fetchTrustedManifest("testnet"),
  wasmComponent,
  handlers: { EthSign: metamask_sign(address, undefined, T3N_API_KEY) },
});
await t3n.handshake();
const did = await t3n.authenticate(createEthAuthInput(address));
export const tenantDid: string = did.value;
console.log("Connected as:", tenantDid);

// ---------- 2. TenantClient ----------
export const tenant: TenantClient = new TenantClient({
  t3n,
  baseUrl: getNodeUrl(),
  tenantDid,
});
await tenant.tenant.me();
console.log("TenantClient ready.");

// ---------- 3. register the contract (skipped when already bootstrapped) ----------
// Registration consumes credits and a same-version re-register errors out.
// Set T3N_CONTRACT_ID (from the first successful `npm run setup`) to skip
// straight to the contract calls.
let contractId: number | undefined;
if (process.env.T3N_CONTRACT_ID) {
  contractId = Number(process.env.T3N_CONTRACT_ID);
  contractVersion = process.env.T3N_VERSION ?? CONTRACT_VERSION;
  console.log("setup skipped, using contract id", contractId, "version", contractVersion);
} else {
  const wasmBytes = await readFile(WASM_PATH);
  const base = `${CONTRACT_TAIL}@${CONTRACT_VERSION}`;
  try {
    const result = await tenant.contracts.register({
      tail: CONTRACT_TAIL,
      version: CONTRACT_VERSION,
      wasm: wasmBytes,
    });
    contractId = result.contract_id;
    console.log(
      `registered z:<tid>:${CONTRACT_TAIL}@${CONTRACT_VERSION} as contract id ${contractId}`,
    );
  } catch (e: unknown) {
    // Re-run after a crash between register and map-creation: same-tail
    // same-version re-register is refused ("version 0.1.0 is not higher than
    // current version 0.1.0"). The contract exists — bump one patch version,
    // which re-publishes the same WASM and returns the SAME stable contract id.
    const msg = String(e);
    const m = msg.match(/not higher than current version (\d+\.\d+\.\d+)/);
    if (!m) throw e;
    const [maj, min, patch] = m[1].split(".").map(Number);
    const bumped = `${maj}.${min}.${patch + 1}`;
    console.log(
      `${base} already registered (interrupted earlier run?) — re-publishing as ${bumped} (same contract id)`,
    );
    const result = await tenant.contracts.register({
      tail: CONTRACT_TAIL,
      version: bumped,
      wasm: wasmBytes,
    });
    contractId = result.contract_id;
    contractVersion = bumped;
    console.log(`re-registered at ${bumped} as contract id ${contractId}`);
  }
}
export const registeredContractId: number = contractId;

// ---------- 3.5 persist resolved contract state ----------
// First publish (or version-bump recovery) writes ~/.t3n_state so every later
// run — and every future re-run on a fresh shell — skips registration entirely
// (no accidental credit-spending version churn).
if (!process.env.T3N_CONTRACT_ID) {
  const statePath = path.join(__dirname, "../../../.t3n_state");
  const stateJson = JSON.stringify({
    contract_id: contractId,
    version: contractVersion,
    tenant_did: tenantDid,
  });
  await writeFile(statePath, stateJson, "utf8");
  console.log(`contract state saved -> ${statePath}: ${stateJson}`);
}

export const tenantId = tenantDid.slice("did:t3n:".length);
export const contractName = `z:${tenantId}:${CONTRACT_TAIL}`;

// ---------- 4. create the four fixed maps (idempotent) ----------
for (const tail of ["usage", "agg", "alerts", "budget"]) {
  await tenant.maps
    .create({
      tail,
      visibility: "private",
      writers: { only: [contractId] },
      readers: { only: [contractId] },
    })
    .catch((e: unknown) => {
      // Node error text varies by SDK/proxy version: camelCase in older docs,
      // lowercase 'map already exists' on the live testnet (verified 09-15).
      const s = String(e).toLowerCase();
      if (!(s.includes("mapalreadyexists") || s.includes("map already exists"))) throw e;
    });
}
console.log("maps ready: usage | agg | alerts | budget (all private, contract-only)");

// ---------- 5. seed the demo budget (control-plane write) ----------
await tenant.executeControl("map-entry-set", {
  map_name: `z:${tenantId}:budget`,
  key: MONTH_LABEL,
  value: "25000000", // $25.00 in micro-USD
});
console.log(`budget seeded: $25.00 for ${MONTH_LABEL}`);

// ---------- helper: invoke a contract function + decode ----------
export async function call<T>(functionName: string, input: unknown): Promise<T> {
  return (await t3n.executeAndDecode({
    contract_id: contractName,
    contract_version: contractVersion,
    function_name: functionName,
    input,
  })) as T;
}
