// Manual smoke test for the real @microsoft/signalr client against a running API.
// Usage: node tests/api-smoke/signalr-smoke.mjs http://localhost:5100 admin DineFlow@123
import * as signalR from '@microsoft/signalr';

const base = process.argv[2] || 'http://localhost:5100';
const email = process.argv[3] || 'admin';
const password = process.argv[4] || 'DineFlow@123';

const loginRes = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
if (!loginRes.ok) { console.error('Login failed', loginRes.status, await loginRes.text()); process.exit(1); }
const { data } = await loginRes.json();
const token = data.accessToken;
console.log('Signed in.');

const connection = new signalR.HubConnectionBuilder()
  .withUrl(`${base}/hubs/realtime`, { accessTokenFactory: () => token })
  .withAutomaticReconnect([0, 2000, 5000])
  .build();

const got = new Promise((resolve, reject) => {
  connection.on('RealtimeEvent', envelope => { console.log('RECEIVED:', JSON.stringify(envelope)); resolve(envelope); });
  setTimeout(() => reject(new Error('TIMED OUT waiting for RealtimeEvent')), 10000);
});

await connection.start();
console.log('Connected:', connection.state);

const created = await fetch(`${base}/api/v1/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ orderType: 'Takeaway' }) });
console.log('Order create status:', created.status);

const envelope = await got;
if (envelope.eventType !== 'OrderCreated') { console.error('Unexpected event type', envelope.eventType); process.exit(2); }

await connection.stop();
console.log('OK: the real @microsoft/signalr client received a live OrderCreated event from the running API.');
