/**
 * Recovery probe: authenticate and dump the tenant's contract inventory RAW
 * (wire fields included) plus any map descriptors, to recover the numeric
 * contract id from the interrupted 04:34Z registration.
 * Env: T3N_API_KEY (required)
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
if (!KEY) {
  console.error("Missing T3N_API_KEY");
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
console.log("Connected as:", did);

const tenant = new TenantClient({ t3n, baseUrl: getNodeUrl(), tenantDid: did });
await tenant.tenant.me();

const names = await tenant.contracts.list();
console.log("contract names:", JSON.stringify(names));
const page = await tenant.contracts.listDetailed();
console.log("contracts detailed (raw wire):", JSON.stringify(page, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
