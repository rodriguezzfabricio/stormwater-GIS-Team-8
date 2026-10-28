# Research: wire the back end into static-site
Date: 2026-10-27 · Tier: 1 · Web: none
Sources: none

Request: "build 1": put the Supabase drop-in (`static-site/inspection-backend.mjs`) into the team's real pages. After a `git pull`, Google UMBC sign-in, Save and history should work with no copy-paste by a teammate.

No product research: no new kind of screen (login, map and form pages exist). No spike: the auth and storage capability is already built and live (PR #2). This work only connects it.

## Fixed constraints
- Photos and a "Needs verification" outcome are out of scope (source: docs/designs/inspection-database-and-umbc-sign-in.md:53, :31; app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md:9)
- The database accepts outcome `pass` or `fail` only (source: supabase/migrations/20261028024530_inspection_schema.sql:61)
- The snapshot must be a JSON object of at most 16384 bytes, described as "as displayed in the browser at submission" (source: supabase/migrations/20261028024530_inspection_schema.sql:66-73)
- Each inspection uses one client draft UUID; a retry reuses it. Success shows only after the back end confirms (source: CLAUDE.md, "Planned app" section)
- When a session expires, keep the unsaved draft in tab memory and ask the inspector to sign in again (source: app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md:25)
- History shows the signed-in inspector's records for the selected feature, newest first, with an empty state. A reload fetches from the back end (source: app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md:29)
- Only sign-in pages read `?code=`. `index.html` also gets ArcGIS's own `?code=` (source: static-site/inspection-backend.mjs:17-22; static-site/supabase-config.js `signInPages`)
- The ArcGIS OAuth redirect is exactly `http://localhost:5500/` (source: static-site/arcgis-config.js:2; CLAUDE.md "Running the prototype")
- Never log SDK errors, tokens or sessions (source: CLAUDE.md; static-site/inspection-backend.mjs:5; static-site/map.js:74)
- Change the drop-in files only together with `supabase/` (source: CLAUDE.md, `static-site/` bullet)
- `static-site/` is owned by the frontend teammates (source: CLAUDE.md)
- Use `textContent`, never `innerHTML`. Never call Supabase tables or `rpc` outside the drop-in (source: static-site/BACKEND-GUIDE.md:251, :292)
- Never commit a token, service-role key, DB password, `client_secret*.json` or `.mcp.json` (source: supabase/README.md; earlier session rules)

## Conflicts for intake
- **Tai's unmerged work vs this change.**
  - `origin/feature/stormwater-frontend` is 7 commits ahead of main (last push 2026-10-27, about 17 minutes before this research). It changes:
    - `facility-ui.mjs`: 157 lines, adding locked fields and edit tracking
    - `index.html`: 46 lines
    - `login.html`: logo image
  - These are the same files this change must edit. No open PR exists.
  - Source: `git log origin/main..origin/feature/stormwater-frontend`
- **Email + password fallback vs a Google-only login page.**
  - The design keeps email + password as a fallback for teammates (source: docs/designs/inspection-database-and-umbc-sign-in.md:139, :360, :733; supabase/CONTRACT.md:22).
  - The guide replaces Kyle's form with a single Google button (source: static-site/BACKEND-GUIDE.md:23).
  - Kyle's current form checks nothing: it redirects anyone (source: origin/main static-site/login.js:26-27).
- **Editable form fields the database does not store.**
  - The fields are `verified_campus_location`, `nearby_address`, `address_kind`, `condition_status` and `last_inspection`.
  - The inspector can type in all of them (Tai's branch locks only the IDs and coordinates).
  - `create_inspection` stores only type, outcome, notes and snapshot (source: static-site/inspection-backend-core.mjs:58-75).
  - Today the snapshot is the ArcGIS attributes only, so anything typed into these fields is silently lost.
- **History "detail" scope.**
  - The spec says detail shows the saved snapshot, outcome, type, notes and submission info (source: app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md:29).
  - The guide's history is a one-line list (source: static-site/BACKEND-GUIDE.md:226-243).

## Challenges
- None.

## Product questions raised
- **Which code to build on, given Tai's unmerged branch?** Why it matters: a merge conflict in `facility-ui.mjs` and `index.html` either way.
  - **Default:** ask Tai to open a PR and merge it first. Meanwhile build on Tai's branch tip (891b332) and rebase onto main after the merge. Reason: the change targets Tai's newest form, and nobody has to resolve the conflict by hand.
  - **Alternatives:**
    - Build on main now; Tai then resolves the conflicts.
    - Wait to start until Tai merges.
- **Login page: Google only, or Google plus email + password?** Default: Google only.
  - Reasons:
    - No email + password accounts exist.
    - The drop-in has no password function.
    - Kyle's fields would look like they work when they don't.
  - Alternative: add a small "Teammate sign-in" email + password form. That means a new drop-in function, CONTRACT.md updates and hand-made accounts.
- **What happens to the editable fields the database doesn't store?**
  - **Default:** save them in the snapshot under a `form` key, next to the ArcGIS attributes. Reason: nothing typed is lost, no migration is needed, and it matches the column's meaning ("as displayed in the browser"). It needs a small drop-in change plus a CONTRACT.md note.
  - **Alternatives:**
    - Fold them into the notes text.
    - Leave them unsaved and label them "not saved".
- **History: list only, or list plus a detail view?** Default: each row shows date and time, type, Pass/Fail and notes (a one-screen list), and there is no snapshot detail view. Reason: demo scope; the snapshot is stored for later.
  - Alternative: click a row to see its saved snapshot. About 1 more hour of work.

## Engineering decisions
- **Gate the map page.** `map.js` calls `requireUser()` before `start()`. A signed-out visitor goes to `login.html`. Supabase never reads ArcGIS's `?code=` on `index.html`.
  - Rationale: the guide's Step 2.
  - Alternatives: gate in an inline script.
  - Class: Mechanical. Reverse: easy.
- **Keep the draft on reselect.** When the same BMP (same item, layer and object ID) is selected again before a confirmed save, keep its draft.
  - Rationale: re-clicking after a "not confirmed" save must not create a duplicate on retry.
  - Alternatives: always start a new draft (the guide's Step 3), which allows a duplicate.
  - Class: Mechanical. Reverse: easy.
- **Show the user in the top bar.** The signed-in email and a Sign out button go on the right of `.topbar`.
  - Rationale: the design asks for the signed-in email and sign-out (docs/designs/inspection-database-and-umbc-sign-in.md:688, :706-708).
  - Alternatives: put them in the sidebar.
  - Class: Taste. Depends on it: the topbar layout. Reverse: easy.
- **Update the "not saved" copy.** Replace "UI only / not saved / no data is submitted / coming later" with true copy. Remove the photos input, the "Needs verification" option and the photos reset line.
  - Rationale: these are fixed constraints, and false copy would mislead.
  - Class: Mechanical. Reverse: easy.
- **Load the drop-in with a static import.** Import it statically from `map.js` and `facility-ui.mjs`. If jsdelivr is down, the page fails just as it does when the js.arcgis.com CDN is down.
  - Alternatives: a dynamic import with an error message.
  - Class: Mechanical. Reverse: easy.
- **Tests stay in Node.** Any new pure logic (for example the form part of the snapshot) goes in `inspection-backend-core.mjs`, with checks in `test-inspection-backend.mjs`. Browser wiring is verified by hand with the existing check list (static-site/BACKEND-GUIDE.md:253-269).
  - Class: Mechanical.
- **Update the guide.** Once the wiring is in the pages, BACKEND-GUIDE.md changes from "paste these steps" to "already wired: how it works, how to test, what not to touch".
  - Class: Mechanical.

## Not checked
- **Is the BMP layer in the map?** Whether WebMap `d59cb5cc77914e6c96631b856c667129` contains item `cc6a7a27…` layer 3.
  - Why not: it needs a signed-in browser.
  - Assumed: yes. `checkFeature()` shows a clear message on the first BMP click if it doesn't.
- **Are Kyle and Tai Google test users?**
  - Why not: this lives in the Google Cloud console, outside the repo.
  - Assumed: Fabricio adds them.
- **Does Tai's branch change the failing tests?** `test-facility.mjs` and `test-selection.mjs` already fail on main, and Tai's branch does not touch `test-*` files.
  - Assumed: they still fail. They are out of scope here.

## Addendum 2026-10-28: browser check of the live ArcGIS items
Checked by hand in the user's signed-in browser, read-only. Nothing was changed. Text reading was blocked on arcgis.com, so the facts below come from screenshots and link targets.

- **The WebMap.** `d59cb5cc77914e6c96631b856c667129` is titled "Stormwater Icon".
  - It has one operational layer: `UMBC_BMP_ArcGIS_Import`, a feature layer, item `5d70e438bb6045d6b3af05aee061e3cd`, sublayer 0.
  - Its basemap is "Terrain with Labels".
  - Sharing: Owner + one group, "Stormwater ArcGIS Map".
- **The layer item** `5d70e438bb6045d6b3af05aee061e3cd`.
  - Sharing: Owner + one group, "Stormwater ArcGIS Map". It is not public.
  - Data tab: total 116 rows, data updated 2026-10-26.
  - Visible fields: `bmp_sequence`, `bmp_name`, `bmp_type`, `Latitude`, `Longitude`, `ms4_bmp_id`.
- **Not read:**
  - the layer's service URL (the copy button didn't reach the clipboard)
  - the layer's object-ID field name
  - whether the old item `cc6a7a27…` is in any WebMap the site uses (it is not in `d59cb5cc…`)
- **Effect:** every save from the current map would be refused, because the database and drop-in accept only item `cc6a7a27…` layer 3 (static-site/inspection-backend-core.mjs:8-12; supabase/migrations/20261028024553_inspection_functions.sql:22-23).
