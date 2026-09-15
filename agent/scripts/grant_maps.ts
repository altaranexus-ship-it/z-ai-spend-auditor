/**
 * grant_maps.ts — one-shot ACL repair: point all four audit maps' writer sets
 * at the canonical contract id (a version-bump re-publish allocates a NEW
 * numeric id; the maps created earlier still point at the old one).
 * Env: T3N_API_KEY (required), GRANT_CONTRACT_ID (required)
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

setEnvironment("testnet");
const KEY = process.env.T3N_API_KEY;
const CONTRACT_ID = Number(process.env.GRANT_CONTRACT_ID);
if (!KEY || !CONTRACT_ID) {
  console.error("Missing T3N_API_KEY or GRANT_CONTRACT_ID");
  process.exit(1);
}

const wasmComponent = await loadWasmComponent();
const address = eth_get_address(KEY);
const t3n: T3nClient = new T3nClient({
  trustAnchor: await fetchTrustedManifest("testnet"),
  wasmComponent,
  handlers: { EthSign: metamask_sign(address, undefined, KEY) },
});
await t3n.handshake();
const did = (await t3n.authenticate(createEthAuthInput(address))).value;
const tenant = new TenantClient({ t3n, baseUrl: getNodeUrl(), tenantDid: did });
await tenant.tenant.me();

for (const tail of ["usage", "agg", "alerts", "budget"]) {
  const res = await tenant.maps.update(tail, { writers: { only: [CONTRACT_ID] } });
  console.log(
    `granted ${tail} -> writers [${CONTRACT_ID}]:`,
    JSON.stringify(res, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}
console.log("ACL repair complete.");
