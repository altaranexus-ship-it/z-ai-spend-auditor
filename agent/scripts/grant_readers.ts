import {
  T3nClient, TenantClient, setEnvironment, getNodeUrl, loadWasmComponent,
  fetchTrustedManifest, eth_get_address, metamask_sign, createEthAuthInput,
} from "@terminal3/t3n-sdk";
setEnvironment("testnet");
const KEY = process.env.T3N_API_KEY!;
const CID = Number(process.env.GRANT_CONTRACT_ID);
const wasmComponent = await loadWasmComponent();
const address = eth_get_address(KEY);
const t3n = new T3nClient({
  trustAnchor: await fetchTrustedManifest("testnet"),
  wasmComponent,
  handlers: { EthSign: metamask_sign(address, undefined, KEY) },
});
await t3n.handshake();
const did = (await t3n.authenticate(createEthAuthInput(address))).value;
const tenant = new TenantClient({ t3n, baseUrl: getNodeUrl(), tenantDid: did });
await tenant.tenant.me();
for (const tail of ["usage", "agg", "alerts", "budget"]) {
  const res = await tenant.maps.update(tail, { readers: { only: [CID] } });
  console.log(`readers ${tail} -> [${CID}]:`, JSON.stringify(res).slice(0, 120));
}
console.log("reader grants done");
