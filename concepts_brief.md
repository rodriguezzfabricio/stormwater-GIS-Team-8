# Database and Sign-In for the BMP Inspection Demo

* **Author:** rodriguezzfabricio
* **Date:** 2026-10-27

## Overview

"Implementing the database" for the CMSC447 demo means four things in the shared Supabase project (`fsrsldketzmcjyvjueki`, currently empty):

1. A place to store inspections, tied to a real GIS feature and to the signed-in inspector.
2. Database rules so that each inspector can only read their own records and nobody can edit or delete records.
3. One database function the frontend calls to save an inspection. Calling it twice with the same draft ID saves only once.
4. Sign-in limited to `@umbc.edu` accounts (team, professor, stakeholders).

The frontend teammate cannot see this code, so the written contract (`CONTRACT.md`) is as important as the tables. It says exactly which calls to make, what to send, and what errors come back.

Where the static HTML form (`stormwater/index.html`) and the approved spec disagree, the spec wins: outcome is pass/fail only, inspection type is free text, facility attributes come from the selected map feature, no photos.

## Analysis

Six reviewers checked the plan. Findings, most serious first.

### Blockers

1. **Google sign-in conflicts with the spec and is the riskiest piece.** The spec says a pre-created inspector signs in with email and password, with no public sign-up. Google sign-in depends on outside steps that cannot be tested ahead of time: the Google consent screen, a possible UMBC block on student-made apps, enabling the sign-up hook in the dashboard, and redirect settings. A broken hook blocks every new sign-up.
   *Fix:* make email + password the main path, using 2–3 `@umbc.edu` users created in the dashboard. Two are needed to prove one user cannot read another's records. Add Google only after a save works end to end, with a 45-minute limit. If Google shows "Access blocked", stop and keep the password path.
2. **Supabase's default permissions undo "no direct writes".** New tables let signed-in and anonymous users insert, update, delete and even truncate. Row rules do not stop truncate. New functions can be called by anyone.
   *Fix:* revoke all table permissions, then grant read only. Revoke function access from everyone and grant it back one function at a time. The sign-up hook is callable only by Supabase Auth. Each function sets an empty search path. Run Supabase's security check afterwards.
3. **The facility snapshot comes from the browser, and the spec says not to trust that.** This is acceptable tonight only if it is stated openly.
   *Fix:* name the column `displayed_snapshot`, require it to be a JSON object under 16 KB, and store the feature identifiers in their own columns, not from inside the snapshot. List this as a known gap in the spec, in CONTRACT.md, and on the "remaining work" slide.
4. **Without a limit, any signed-in user could create fake assets.**
   *Fix:* only accept source item `cc6a7a27c267435c8f7ed95a59eb5f24`, layer `3`, and dataset `live`. Store the object ID as text made only of digits. The dataset column is never empty, because empty values would break the "one row per feature" rule.
5. **ArcGIS sign-in and Supabase sign-in both return to `localhost:5500` with a `?code=` in the URL.** They would interfere with each other.
   *Fix:* put the Supabase test page on its own file, `stormwater/auth-test.html`, with no ArcGIS code, and redirect back to that exact page. Use the PKCE sign-in flow explicitly.

### Major

1. **Duplicate-save handling needs exact rules.** Insert the row. If the draft ID already exists, load it. If it belongs to someone else or its content differs, return a conflict. If it matches, return the saved row with `replayed: true`. The check compares feature, trimmed type, outcome and notes, but not the snapshot, since a re-drawn map can change it slightly.
2. **The email check must not depend on the hook alone.** Accounts created before the hook was turned on skip it. The save function itself checks that the email ends in `@umbc.edu` and is confirmed.
3. **Errors need fixed codes the teammate can rely on.** `not_authenticated` and `forbidden_domain` are 403, `invalid_input:<field>` and `unknown_source` are 400, and `draft_conflict` is 409. CONTRACT.md maps each to a UI action. Network failure means retry with the same draft ID. Conflict means start a new inspection. Expired session means sign in again and keep the draft.
4. **The teammate is blocked until they have a URL, a key and a test login.** Send these, plus the function signatures, within the first 15 minutes. Send the generated TypeScript types after the final migration.
5. **CONTRACT.md must stand on its own.** It needs:
   * a glossary with example values
   * when to create and when to replace the draft ID
   * how each HTML form field maps to the new fields
   * how to read the feature identifiers from the ArcGIS layer
   * one sample request and response per function
   * the environment variable names and redirect URLs
   * a version line
6. **Cut the Next.js sign-in kit.** It cannot be run or tested without the teammate's app, and it could collide with their project scaffold. Link the official Supabase Next.js guide instead.
7. **Changes applied only through the Supabase tool cannot be reproduced.** Write each migration as a file under `supabase/migrations/` first, then apply that exact text. Record the dashboard settings in `supabase/README.md`.
8. **Tests must not leave junk in the shared project.** Run each SQL test inside a transaction that is rolled back. Then prove the real path in a browser: sign in, save, reload, see the record, then sign in as a second user and confirm it is not visible.

### Smaller points

* The history function takes the feature identifiers, because the frontend does not know the internal asset ID. It returns newest first, at most 50 rows.
* The browser calls the database functions directly instead of going through server code, as the spec planned. Record this as a change from the spec.
* Update `CLAUDE.md` and the spec status line after the build.
* Screen-record one working run as a backup.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * `assets` and `inspections` tables with constraints
  * permission revokes and row rules
  * the `create_inspection` and `my_inspections` functions
  * 2–3 password users on `@umbc.edu`
  * rolled-back SQL tests and the `auth-test.html` browser check
  * migration files in the repo
  * CONTRACT.md and the TypeScript types
  * a dated "changes from spec" note
* **Google sign-in (proven 2026-10-27):** Google provider enabled in Supabase. A `@umbc.edu` account signed in successfully (Google marked the email verified, `hd: umbc.edu`), so UMBC does not block the app. Still to build: the `@umbc.edu` sign-up hook and the matching database check.
* **Out-of-Scope Non-Goals:**
  * the Next.js sign-in kit
  * photos, a "needs verification" outcome, admin roles, viewing other inspectors' records
  * server code that re-checks the GIS snapshot
  * email, PDF, offline use

## Key Decisions & Staging for Next Steps

1. The spec beats the static HTML wherever they disagree.
2. Order of work:
   1. Users plus credentials to the teammate (0:00–0:15).
   2. Migrations (0:15–1:00).
   3. CONTRACT.md plus types (1:00–1:30).
   4. Browser test page plus SQL tests (1:30–2:00).
   5. Integration help.
   6. Google sign-in, if time allows.
3. The snapshot is stored as "displayed at submission" and called unverified everywhere.
4. Google sign-in is the main sign-in path, now that it works with UMBC accounts. Email + password is the fallback. Settings applied: Site URL `http://localhost:3000`, redirect URLs `http://localhost:3000/**` and `http://localhost:5500/auth-test.html`.
