/**
 * reset_maps.ts — one-shot: delete + recreate the four audit maps with BOTH
 * writer and reader grants on the canonical contract id, then seed the budget.
 * Map deletion on testnet is ASYNC: poll getStatus until the name is free
 * ("map is being deleted ... poll map-get-status and retry" — live-verified).
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
const tenantId = did.slice("did:t3n:".length);
const month = new Date().toISOString().slice(0, 7);

async function waitFree(tail: string, timeoutMs = 300000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const st = (await tenant.maps.getStatus(tail)) as unknown as string;
      const s = String(st).toLowerCase();
      if (!s.includes("delet")) return; // active/disabled -> not deleting
    } catch {
      return; // 'not found' -> name is free
    }
    await sleep(1500);
  }
  throw new Error(`${tail}: still deleting after ${timeoutMs}ms`);
}

for (const tail of ["usage", "agg", "alerts", "budget"]) {
  let deleted = false;
  try {
    await tenant.maps.delete(tail);
    deleted = true;
    console.log(`${tail}: delete issued`);
  } catch (e: unknown) {
    const s = String(e).toLowerCase();
    if (s.includes("not found")) {
      console.log(`${tail}: absent, skipping delete`);
    } else if (s.includes("deleting")) {
      // 'map is already in Deleting state' — deletion already in flight
      deleted = true;
      console.log(`${tail}: deletion already in flight, waiting`);
    } else throw e;
  }
  if (deleted) await waitFree(tail);
  let created = false;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      await tenant.maps.create({
        tail,
        visibility: "private",
        writers: { only: [CONTRACT_ID] },
        readers: { only: [CONTRACT_ID] },
      });
      created = true;
    } catch (e: unknown) {
      const s = String(e).toLowerCase();
      if (s.includes("already exists")) { created = true; break; }
      if (s.includes("being deleted")) { await sleep(2000); continue; }
      throw e;
    }
  }
  if (!created) throw new Error(`${tail}: could not create after retries`);
  console.log(`${tail}: recreated, writers+readers [${CONTRACT_ID}]`);
}

for (let attempt = 0; attempt < 5; attempt++) {
  try {
    await tenant.executeControl("map-entry-set", {
      map_name: `z:${tenantId}:budget`,
      key: month,
      value: "25000000", // $25.00 in micro-USD
    });
    break;
  } catch (e: unknown) {
    if (attempt === 4) throw e;
    await sleep(2000);
  }
}
console.log(`budget seeded: $25.00 for ${month}. Maps reset complete.`);
