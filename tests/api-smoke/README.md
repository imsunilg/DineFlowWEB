# Real-time smoke test

`signalr-smoke.mjs` connects to the API's `/hubs/realtime` hub with the real `@microsoft/signalr` client (the same
package the app uses), creates a Takeaway order over REST, and confirms the `OrderCreated` event arrives live over
the WebSocket. Requires a running API and the dev seed.

```bash
node tests/api-smoke/signalr-smoke.mjs http://localhost:5100 admin DineFlow@123
```
