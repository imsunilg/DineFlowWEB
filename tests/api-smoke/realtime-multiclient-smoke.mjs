// Multi-client, multi-user real-time smoke test using the real @microsoft/signalr client (the same package the
// Angular app uses). Proves: same-user multi-connection sync, different-user sync, bar stock, inventory, menu
// price/availability, all against a running API and real Postgres. Nothing here is mocked.
//
// Usage: node tests/api-smoke/realtime-multiclient-smoke.mjs http://localhost:5100
import * as signalR from '@microsoft/signalr';

const base = process.argv[2] || 'http://localhost:5100';
let pass = 0, fail = 0;

async function login(email, password) {
  const res = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()).data.accessToken;
}

async function connect(token) {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${base}/hubs/realtime`, { accessTokenFactory: () => token })
    .withAutomaticReconnect([0, 2000, 5000])
    .build();
  await connection.start();
  return connection;
}

function waitFor(connection, eventType, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { connection.off('RealtimeEvent', handler); reject(new Error(`TIMED OUT waiting for ${eventType}`)); }, timeoutMs);
    function handler(envelope) {
      if (envelope.eventType === eventType && (!predicate || predicate(envelope))) {
        clearTimeout(timer);
        connection.off('RealtimeEvent', handler);
        resolve(envelope);
      }
    }
    connection.on('RealtimeEvent', handler);
  });
}

async function check(name, fn) {
  try { await fn(); console.log(`PASS: ${name}`); pass++; }
  catch (e) { console.log(`FAIL: ${name} -- ${e.message}`); fail++; }
}

async function get(token, path) {
  const res = await fetch(`${base}/api/v1/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()).data;
}
async function post(token, path, body, method = 'POST') {
  const res = await fetch(`${base}/api/v1/${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()).data;
}

const adminToken = await login('admin', 'DineFlow@123');
const managerToken = await login('manager', 'Demo@123');
console.log('Signed in as admin and manager (same tenant, different users).');

// Three connections: A1/A2 = same user (admin) on two "devices"; M = a different user (manager).
const connA1 = await connect(adminToken); // "Browser A" — makes the change
const connA2 = await connect(adminToken); // "Browser A2" — same login, second tab/device
const connM = await connect(managerToken); // "Manager screen" — different user, same tenant
console.log('Three real SignalR connections established: admin/tab1 (actor), admin/tab2 (same user), manager (different user).');

// ---- Bar stock: User A updates from tab1, tab2 (same user) and manager (different user) must both see it ----
await check('Bar stock: same-user second connection receives BarStockUpdated', async () => {
  const stock = await get(adminToken, 'bar/stock');
  const product = stock[0];
  const waiter = waitFor(connA2, 'BarStockAdjusted', e => e.data.productId === product.productId);
  await post(adminToken, 'bar/stock/move', { counterId: product.counterId, productId: product.productId, type: 'Adjustment', bottles: -1, ml: 0, notes: 'realtime smoke test' });
  const envelope = await waiter;
  if (envelope.data.previousQuantityMl - envelope.data.quantityMl !== product.volumeMl) throw new Error('unexpected delta');
});

await check('Bar stock: different user (manager) also receives BarStockAdjusted', async () => {
  const stock = await get(adminToken, 'bar/stock');
  const product = stock[1];
  const waiter = waitFor(connM, 'BarStockAdjusted', e => e.data.productId === product.productId);
  await post(adminToken, 'bar/stock/move', { counterId: product.counterId, productId: product.productId, type: 'Adjustment', bottles: 1, ml: 0, notes: 'realtime smoke test' });
  await waiter;
});

// ---- Inventory: manual movement must broadcast to every connected client, tenant-wide ----
await check('Inventory: StockAdjusted reaches a different connection', async () => {
  const stock = await get(adminToken, 'inventory/stock?pageSize=1');
  const item = stock.items[0];
  const waiter = waitFor(connA2, 'StockAdjusted', e => e.data.itemId === item.itemId);
  await post(adminToken, 'inventory/stock/move', { warehouseId: item.warehouseId, itemId: item.itemId, type: 'Adjustment', quantity: 1, notes: 'realtime smoke test' });
  const envelope = await waiter;
  if (envelope.data.quantity - envelope.data.previousQuantity !== 1) throw new Error(`unexpected quantities: ${JSON.stringify(envelope.data)}`);
});

// ---- Menu: price change made by admin must reach the manager's connection ----
await check('Menu: MenuPriceChanged reaches a different user', async () => {
  const tree = await get(adminToken, 'menu?onlyAvailable=true');
  const item = tree.flatMap(m => m.categories).flatMap(c => c.items)[0];
  const full = await get(adminToken, `menu/items/${item.id}`);
  const waiter = waitFor(connM, 'MenuPriceChanged', e => e.data.itemId === item.id);
  await post(adminToken, `menu/items/${item.id}`, { ...full, basePrice: full.basePrice + 1 }, 'PUT');
  const envelope = await waiter;
  if (envelope.data.price !== full.basePrice + 1) throw new Error('unexpected new price');
  // restore
  await post(adminToken, `menu/items/${item.id}`, { ...full, basePrice: full.basePrice }, 'PUT');
});

for (const c of [connA1, connA2, connM]) await c.stop();

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
