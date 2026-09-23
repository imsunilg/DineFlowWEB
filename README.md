# DineFlowWEB

Angular 22 web app (standalone components, signals, Angular Material + Tailwind CSS 4) for the DineFlow bar & restaurant platform: dashboard with charts, POS,
kitchen display, bar, inventory and purchasing, CRM and loyalty, reservations, finance, reports with export, staff, and administration.
It contains no business rules; every price, tax and total comes from the API ([DineFlowAPI](../DineFlowAPI)).
Companions: [DineFlowDB](../DineFlowDB), [DineFlowMOBILE](../DineFlowMOBILE). Platform docs: [DineFlowAPI/docs](../DineFlowAPI/docs).

## Prerequisites

Node 22, npm 11, and a running DineFlowAPI (default `http://localhost:5100`).

## Installation

```bash
npm ci
```

## Running Angular

```bash
npm start           # http://localhost:4100 (all interfaces) ; /api and /health are proxied to :5100 (proxy.conf.json)
npm run build       # production bundle in dist/dineflow-web/browser
npm test            # unit tests (Vitest)
```

Development sign-in (from the API's dev seed): `admin@dineflow.local` / `DineFlow@123`, or use the **Demo Login** buttons on the
sign-in screen (login ID `admin` / `manager`) — see [DineFlowAPI/README.md](../DineFlowAPI/README.md#dineflow-demo-credentials--development--demo-only).
Demo Login is DEVELOPMENT/DEMO ONLY and is controlled by `features.demoLogin` in `public/config.json`; it must be `false`
(the container default) for any production deployment.

## Database setup, running the API and Flutter

The web app needs the schema and the API; see [DineFlowDB](../DineFlowDB/README.md) and [DineFlowAPI](../DineFlowAPI/README.md).
The mobile app is documented in [DineFlowMOBILE](../DineFlowMOBILE/README.md).

## Configuration and environment variables

Runtime configuration is `public/config.json`, fetched at start-up, so one build serves every environment:

```json
{ "apiBaseUrl": "/api/v1", "defaultTenantCode": "DINEFLOW" }
```

In the container these are set from environment variables at start:

| Variable | Meaning | Default |
| --- | --- | --- |
| `API_BASE_URL` | Where the browser sends API calls | `/api/v1` (same origin; nginx proxies to the API) |
| `DEFAULT_TENANT_CODE` | Tenant whose branding shows before sign-in | empty |
| `API_UPSTREAM` | nginx upstream for `/api/` | `http://api:8080` |

**White label.** No business name, colour, currency or menu category is hard-coded. `BrandingService` loads `GET /api/v1/config/branding`, applies the colours as CSS
variables, sets the title and favicon, and provides `money()` and `isEnabled(feature)`. CI fails if `dineflow` or `agentjack` appears under `src/app`. See
[WHITE_LABEL.md](../DineFlowAPI/docs/WHITE_LABEL.md).

## Seed data

Comes from the database and the API's development seed; the web app has none of its own.

## Authentication

Sign in with email and password. The access token (15 minutes) is attached by an interceptor; a `401` triggers one shared refresh (refresh tokens rotate) and a retry;
if the refresh fails the user is signed out. Routes are guarded by **permission** and by the tenant's **feature flags**; the API enforces both again. The session is kept in `localStorage`
(token lifetimes are short and the refresh token rotates, but treat the browser profile as sensitive on shared machines).

## Real-time

`core/services/signalr.service.ts` holds one [SignalR](https://learn.microsoft.com/aspnet/core/signalr) connection for the session: it connects on
sign-in, disconnects on sign-out, and reconnects automatically. Orders, tables, bills, reservations and notifications update on screen as they
happen — the shell header shows **● Live** / **Reconnecting…** / **Offline**. The hub URL is derived from `apiBaseUrl` in `public/config.json`,
so LAN development needs no separate setting; see the API's [docs/ARCHITECTURE.md](../DineFlowAPI/docs/ARCHITECTURE.md#real-time-signalr) for the event list.

## Structure

```text
src/app/
  core/        api client, auth, branding, interceptors, guards, models
  layout/      shell (role-aware navigation, notification bell)
  shared/      drawer, modal, confirm, pager, empty/error/skeleton, charts (SVG), config-driven CRUD
  auth/ dashboard/ pos/ kitchen/ bar/ menu/ restaurant/ inventory/ purchase/ crm/ reservation/ finance/ reports/ staff/ admin/
```

All routes are lazy-loaded. Master-data screens are described declaratively and rendered by one `ConfigCrudComponent`, which keeps validation, paging and drawer forms consistent.
Charts are hand-written SVG components (no chart dependency).

## API documentation

[DineFlowAPI/docs/API.md](../DineFlowAPI/docs/API.md) (or Swagger on a Development API).

## Deployment

```bash
docker build -t dineflow-web .
docker run -p 8081:80 -e API_UPSTREAM=http://api:8080 -e DEFAULT_TENANT_CODE=DINEFLOW dineflow-web
```

nginx serves the SPA with a strict CSP and security headers, caches hashed assets for a year, never caches `index.html` or `config.json`, and proxies `/api/` to the API so
no CORS is needed. The full stack (database, migration, API, web) is `docker compose up --build` in DineFlowAPI. Guidance: [DEPLOYMENT.md](../DineFlowAPI/docs/DEPLOYMENT.md).

## Migration

Nothing to migrate: the app is stateless. New API fields are ignored by older builds and missing ones are tolerated by the models.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Blank page, console shows failed `/config.json` | The file is missing or invalid JSON; the app falls back to `/api/v1` and no default tenant. |
| API calls 404 in `npm start` | The API is not on `:5100`; edit `proxy.conf.json`. |
| Sign-in page shows no branding | `defaultTenantCode` is empty or unknown; set it, or sign in and the tenant is read from the token. |
| A menu entry is missing | The role lacks the permission, or the tenant switched the module off (*Administration → Business settings*). |
| Amounts show the wrong currency | The tenant's currency symbol in Business settings; the app never chooses one itself. |
| Google Fonts blocked | The CSP allows `fonts.googleapis.com` / `fonts.gstatic.com`; self-host the fonts if your network blocks them. |
| `npm test` cannot find `vitest` | Run `npm ci` (dev dependencies). |
