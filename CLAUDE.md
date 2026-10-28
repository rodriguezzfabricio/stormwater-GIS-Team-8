# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## State of the repo

This is a CMSC447 (UMBC) project: a Stormwater BMP digital inspection system. What lives here:

- `static-site/` — the team's working frontend (owned by the frontend teammates): Google sign-in (`login.html`), ArcGIS map with BMP selection, inspection form with Save and the inspector's own history. Node tests run as `node static-site/test-*.mjs`. The backend connection is the drop-in `inspection-backend.mjs` + `inspection-backend-core.mjs` + `supabase-config.js`, documented for teammates in `BACKEND-GUIDE.md`; change those only together with `supabase/`.
- `stormwater/` — the original static prototype that embeds UMBC's secured ArcGIS WebMap, plus the Supabase test page. No build step, no package.json, no linter.
- `supabase/` — the back end in the shared Supabase project `fsrsldketzmcjyvjueki`:
  - `migrations/` — applied to the shared project. Never edit an applied one; a fix is a new migration. Only rodriguezzfabricio applies them. Write the file first, apply the same text via the Supabase MCP, then rename the file to the version Supabase recorded.
  - `tests/` — rule tests in one transaction ending in ROLLBACK.
  - `rollback/` — manual down script. Turn the sign-up hook off first.
  - `scripts/configure-auth.sh` — Auth settings via the Management API.
  - `database.types.ts` — generated. Do not edit by hand.
  - `CONTRACT.md` — the agreement with the frontend teammate. Source of truth for function names, fields and error codes.
  - `README.md` — maintenance notes for the back end.
- Planning docs — `ASTRA-DEMO-PLAN.md`, `RECON.md`, `DEMO-PLANNING-CHECKLIST.md`, and `app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md`. The `app/` directory is a placeholder (README only) for the planned Next.js app, which **does not exist yet**. Do not assume its code, schema, or dependencies exist. `app/.git.nested-backup/` is a leftover; ignore it.
- `goldfish-reviews/` — external review notes on the spec (not code).

## Running the prototype

```bash
cd stormwater && ./start-local.sh      # = python3 -m http.server 5500
```

Open `http://localhost:5500/` — the port and trailing slash matter: this exact origin is registered as the ArcGIS OAuth redirect URL, and `localhost` ≠ `127.0.0.1`. If you change the port, the new URL must be registered in ArcGIS first. The ArcGIS SDK (v5.1) loads from the `js.arcgis.com` CDN, so it needs internet access. The prototype has no tests; verification is manual in the browser. Database rules are tested with `supabase/tests/inspection_rules.sql` (see `supabase/README.md`).

## Prototype architecture (`stormwater/`)

- `arcgis-config.js` sets `window.STORMWATER_CONFIG` (OAuth `arcgisClientId`, `portalUrl`, `webMapId`). It must load before `map.js`. Only the public client ID belongs here — never a client secret or token.
- `map.js` (ES module) registers `OAuthInfo` with `popup: false` **before** creating the `<arcgis-map item-id=...>` element. The full-page redirect is deliberate: the previous iframe/popup approach left a white map after UMBC sign-in. Flow: `checkSignInStatus` on load → `showMap()` if signed in, otherwise show a sign-in button → `getCredential`. It uses `$arcgis.import(...)` for SDK modules. SDK errors are intentionally not logged (auth redirects can expose tokens) — keep it that way.
- `index.html` has the page markup, including mock UI: the facility details panel and inspection form are static and not wired to map features or storage.
- `auth-test.html` / `auth-test.js` / `supabase-config.js`: standalone Supabase test page with no ArcGIS. PKCE Google sign-in returns to `http://localhost:5500/auth-test.html`. `supabase-config.js` holds only the public URL and publishable key. Like `map.js`, it never logs tokens or raw auth errors.

## Planned app (from the approved spec)

Read `app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md` before building anything under `app/`. Key constraints:

- Stack: Next.js + TypeScript (App Router), a client-only ArcGIS map component, Supabase Auth + Postgres with row-level security. Scope is a 2D map and an authenticated inspection form, with the inspector's own history after reload.
- GIS data is read-only reference geometry. Inspection records are app-owned and stored separately (append-only, with a snapshot of the verified attributes).
- BMP layer (changed 2026-10-28, spec `docs/spec/v1.md` A1): `UMBC_BMP_ArcGIS_Import`, item `5d70e438bb6045d6b3af05aee061e3cd`, layer 0 (116 rows, shared only with the "Stormwater ArcGIS Map" group). Its object-ID field has not been written down; code reads `layer.objectIdField`. It replaces item `cc6a7a27c267435c8f7ed95a59eb5f24` layer 3 (`BMP_Database`), whose saved rows stay in the database but are no longer returned. Attributes such as `ms4_bmp_id` can repeat across features, so never use them alone as keys. The provisional unique reference is source item + layer + object ID, mapped to an app UUID.
- Inspection create uses a client-generated draft UUID as the retry/idempotency key. Success is shown only after the backend confirms the save.
- ArcGIS identity and Supabase identity are separate. Don't reuse another browser's tokens, change ArcGIS sharing, or enable service editing/attachments to unblock development.

## Supabase MCP

`.mcp.json` (untracked) points at Supabase project `fsrsldketzmcjyvjueki`, and `.claude/settings.local.json` enables it. Treat database changes as real changes to a shared project and inspect existing tables before migrating. The project now holds the inspection schema: `public.assets`, `public.inspections`, `public.create_inspection`, `public.my_inspections`, `public.hook_restrict_umbc_signup` and `private.is_umbc_user`. Read `supabase/README.md` before changing it.
