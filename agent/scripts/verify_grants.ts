/**
 * verify_grants.ts — idempotent re-assert + readback of the canonical grant
 * state. Re-points BOTH sides (writers + readers of all four audit maps)
 * at GRANT_CONTRACT_ID, then prints the returned ACL config.
 *
 * `maps.update` is an upsert, so re-asserting an already-correct grant set
 * is a no-op — safe to re-run for verification, or to heal ACLs after a
 * version-bump re-publish allocates a new contract id (re-point BOTH sides).
 *
 * Env: T3N_API_KEY (required), GRANT_CONTRACT_ID (required, e.g. 1029)
 * Run: cd agent && T3N_API_KEY=... GRANT_CONTRACT_ID=1029 \
 *        node scripts/safe-tsx.mjs scripts/verify_grants.ts
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

const show = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

for (const tail of ["usage", "agg", "alerts", "budget"]) {
  const w = await tenant.maps.update(tail, { writers: { only: [CONTRACT_ID] } });
  const r = await tenant.maps.update(tail, { readers: { only: [CONTRACT_ID] } });
  console.log(`${tail}: writers=${show(w)} readers=${show(r)}`);
}
console.log(`verify_grants: both sides asserted at contract ${CONTRACT_ID}.`);
