import {
  T3nClient, TenantClient, setEnvironment, getNodeUrl, loadWasmComponent,
  fetchTrustedManifest, eth_get_address, metamask_sign, createEthAuthInput,
} from "@terminal3/t3n-sdk";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
const tenantId = did.slice("did:t3n:".length);
const month = new Date().toISOString().slice(0, 7);

// wait for budget map deletion to finish
const start = Date.now();
while (Date.now() - start < 400000) {
  try {
    const st = String((await tenant.maps.getStatus("budget")) as unknown).toLowerCase();
    if (!st.includes("delet")) break;
  } catch { break; } // not found -> free
  await sleep(5000);
}
// recreate with both grants (idempotent-ish)
let created = false;
for (let i = 0; i < 10 && !created; i++) {
  try {
    await tenant.maps.create({ tail: "budget", visibility: "private",
      writers: { only: [CID] }, readers: { only: [CID] } });
    created = true;
  } catch (e: unknown) {
    const s = String(e).toLowerCase();
    if (s.includes("already exists")) { created = true; break; }
    if (s.includes("delet")) { await sleep(5000); continue; }
    throw e;
  }
}
if (!created) throw new Error("budget: create failed after retries");
console.log("budget recreated with grants", CID);
for (let i = 0; i < 5; i++) {
  try {
    await tenant.executeControl("map-entry-set", {
      map_name: `z:${tenantId}:budget`, key: month, value: "25000000" });
    break;
  } catch (e: unknown) { if (i === 4) throw e; await sleep(3000); }
}
console.log(`budget seeded: $25.00 for ${month}`);
