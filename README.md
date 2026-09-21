# DineFlowWEB

Angular web app (standalone components, signals, Angular Material + Tailwind CSS) for the DineFlow Bar & Restaurant CRM.

## Prerequisites
Node 20+, npm, the DineFlowAPI running on `http://localhost:5080`.

## Run
```bash
npm install
npm start        # http://localhost:4200, /api is proxied to the API (proxy.conf.json)
npm run build
```

## Configuration
Runtime config lives in `public/config.json` (`apiBaseUrl`, `defaultTenantCode`) and can be edited per deployment without rebuilding.
There are no hard-coded business names, colours or currency: name, logo, colours, currency and feature flags come from `GET /api/v1/config/branding`
and are applied as CSS variables by `BrandingService`. Sign in with a different tenant's user and the whole UI re-brands.

## Development login
`admin@dineflow.local` / `DineFlow@Dev1` (development seed only; see DineFlowAPI README).

## Structure
`src/app/core` (api, auth, branding, interceptors, guards), `layout` (shell), `shared` (drawer, confirm, empty/error/skeleton, pager),
feature folders: `auth`, `dashboard`, `restaurant`, `menu`, `crm`. Routes are lazy-loaded and guarded by permission and tenant feature flags.
