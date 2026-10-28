# Inspection Database and UMBC Sign-In

*   **Author:** rodriguezzfabricio
*   **Status:** Proposed
*   **Date:** 2026-10-27

--------------------------------------------------------------------------------

## Overview

The BMP inspection demo needs a working back end. An inspector must sign in, save an inspection against a real campus stormwater feature, reload the page, and see that inspection again.

This design covers the back-end half, built in the team's shared Supabase project (`fsrsldketzmcjyvjueki`):

*   Sign-in with Google, limited to `@umbc.edu` accounts.
*   Two tables: one for feature references and one for inspections.
*   Database rules that decide who can read and write what.
*   Two database functions that the frontend calls: one to save an inspection and one to list the inspector's past inspections for a feature.
*   A written contract (`CONTRACT.md`) that tells the frontend teammate exactly how to call these functions and what comes back.

The frontend is built separately by a teammate on their own machine. This design does not depend on seeing that code. It depends on both sides following `CONTRACT.md`.

## The Problem

The static prototype in `stormwater/index.html` shows an inspection form, but it says "UI only · not saved". Nothing is stored, and nothing ties a form to a map feature or to a person. The approved spec (`app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md`) requires real saves, real sign-in, and history that survives a reload. The demo is not complete without them.

Three conditions make this harder than "create a table":

1.  **The frontend teammate cannot see this work.** If the two halves disagree on field names, error shapes, or how retries work, the demo breaks during integration, tonight, with no time to fix it. The contract has to be written before the frontend wires its save button.
2.  **The browser talks to the database directly.** There is no server code between them in this build. Every rule (who can save, what values are valid, no editing old records) has to be enforced inside the database, because anything enforced only in the browser can be skipped by calling the API by hand.
3.  **The static HTML and the spec disagree.** The HTML offers a "Needs verification" result, hand-typed asset tags, and photo upload. The spec allows only pass/fail, takes facility details from the selected map feature, and excludes photos. This design follows the spec. The frontend teammate must drop the conflicting fields.

The proposed solution is to put the rules in the database: tables whose default permissions are removed, row rules that show each inspector only their own records, and one save function that is the only way to create an inspection. Sign-in uses Google with UMBC accounts, which was tested on 2026-10-27 and works.

## Goals

1.  **A UMBC user can sign in with Google.** Accounts outside `@umbc.edu` cannot create a user. Accounts that already exist but are outside `@umbc.edu` cannot save or read inspections.
2.  **An inspection save is confirmed by the database or not at all.** The save function returns the record ID and the server time only after the row is committed.
3.  **A retry never creates a duplicate.** Sending the same draft ID twice with the same content returns the original record. Sending the same draft ID with different content returns a conflict error.
4.  **Each inspector sees only their own inspections.** User B cannot read user A's records, through the frontend or by calling the API directly.
5.  **Saved inspections cannot be changed or deleted** by any signed-in or signed-out user.
6.  **Only the real BMP layer can be referenced:** source item `cc6a7a27c267435c8f7ed95a59eb5f24`, layer 3. A caller cannot invent other assets.
7.  **The frontend teammate can integrate without reading SQL.** `CONTRACT.md` and generated TypeScript types give them every call, field, example, and error code they need.
8.  **The setup can be repeated.** Every database change exists as a migration file in the repo, applied by one person (rodriguezzfabricio) in a fixed order.

Success means two separate test accounts can each save, reload, and see only their own history, with every check above passing in a recorded test run.

## Non-Goals

*   **Checking the facility snapshot against ArcGIS on the server.** The snapshot of feature details shown on screen is stored as the browser sent it and labeled `displayed_snapshot`. It is not verified. This is a known gap against spec line 53 and will be shown as remaining work.
*   **Server-side request handlers.** The spec planned server code between the browser and the database. This build calls the database directly and moves all checks into the database.
*   **A Next.js sign-in kit.** The teammate's app is not visible, so sign-in UI code would be untested. `CONTRACT.md` links Supabase's official Next.js guide instead.
*   Photos, a "Needs verification" outcome, email, PDF export, and offline use.
*   Admin roles, reviewer approval, and viewing other inspectors' records.
*   Editing GIS data or changing ArcGIS sharing.

## Open Questions

*   **Question 1**: Does the frontend teammate plan to use Supabase at all? If their app talks to a different back end, none of this connects. This needs a yes from them before `CONTRACT.md` is final.
*   **Question 2**: Do all stakeholders have `@umbc.edu` Google accounts? Anyone outside UMBC (for example, a county reviewer) will be locked out by design.
*   **Question 3**: Does the WebMap in `stormwater/arcgis-config.js` (`d59cb5cc…`) contain the BMP layer from item `cc6a7a27…`? If not, the frontend will send a source item the save function rejects.

## Critical User Journeys (CUJs)

### CUJ 1: Sign in with a UMBC Google account

*   **Given**: Google sign-in is enabled in Supabase and the `@umbc.edu` sign-up block is on.
*   **When**: A user clicks "Sign in with Google" and picks their `@umbc.edu` account.
*   **Then**: They return to the app signed in. A user who picks a non-UMBC account gets an error and no user is created.

### CUJ 2: Save an inspection and see it after reload

*   **Given**: A signed-in UMBC user has selected a BMP feature on the map.
*   **When**: They fill in an inspection type and pass or fail, optionally add notes, and press Save.
*   **Then**: The app shows the record ID and server time only after the database confirms the save. After a page reload, "My inspections" for that feature lists the record, newest first.

### CUJ 3: Retry after a lost response

*   **Given**: The save reached the database, but the network dropped before the app got the reply.
*   **When**: The user presses Retry, and the app resends the same draft ID and content.
*   **Then**: The app shows the original record as saved. No second record exists.

### CUJ 4: Another user's records stay private

*   **Given**: User A has saved inspections on feature X.
*   **When**: User B signs in and opens "My inspections" on feature X, or calls the API directly for A's records.
*   **Then**: User B sees none of A's records.

## Technical Plan (Architecture)

### How the pieces connect

```text
 Teammate's Next.js app              stormwater/auth-test.html
 (or any browser client)             (our standalone test page, port 5500)
          |                                     |
          |  supabase-js, publishable key, user's sign-in token
          v                                     v
 +------------------------------------------------------------------+
 | Supabase project fsrsldketzmcjyvjueki                            |
 |                                                                  |
 |  Auth (Google, @umbc.edu) ---> before-user-created hook          |
 |      |                          public.hook_restrict_umbc_signup |
 |      | issues sign-in token (JWT) with user id + email           |
 |                                                                  |
 |  REST API (PostgREST) -- only exposes schema "public"            |
 |      |                                                           |
 |      +--> rpc/create_inspection  (runs as owner, checks all rules)|
 |      |        |-- private.is_umbc_user()                         |
 |      |        |-- upsert public.assets                           |
 |      |        '-- insert public.inspections                      |
 |      |                                                           |
 |      +--> rpc/my_inspections     (runs as caller, row rules apply)|
 |               '-- read public.inspections JOIN public.assets     |
 +------------------------------------------------------------------+

 ArcGIS map (read-only) --> browser reads feature attributes
                         --> sent as displayed_snapshot (not verified)
```

The browser never writes to a table directly. Its only write is a call to `create_inspection`. Its only read of inspections is `my_inspections`, plus plain `select` calls that the row rules limit to the caller's own rows.

### Sign-in

*   **Already applied (2026-10-27):**
    *   Google provider enabled with client `448117214298-qcni…`.
    *   Site URL `http://localhost:3000`.
    *   Allowed redirect URLs `http://localhost:3000/**` and `http://localhost:5500/auth-test.html`.
    *   A sign-in with `frodrig3@umbc.edu` succeeded.
*   **Sign-up block:** a Postgres function, `public.hook_restrict_umbc_signup(event)`, runs before Supabase Auth creates any user.
    *   It lowercases `event.user.email`. If the email ends in `@umbc.edu`, it returns an empty object, which allows the sign-up.
    *   Otherwise it returns an error with HTTP 403 and the message "Only @umbc.edu accounts can sign up."
    *   Only the `supabase_auth_admin` role can run it. Signed-in and signed-out users cannot call it through the API.
    *   It is turned on through the same Management API script used for Google, with settings `hook_before_user_created_enabled = true` and `hook_before_user_created_uri = pg-functions://postgres/public/hook_restrict_umbc_signup`.
    *   To roll it back, set the enabled flag to false.
*   **The hook is not enough on its own.** Users created before the hook was turned on skip it, and so would every user if someone disabled it. So the database checks the caller again on every read and write, through `private.is_umbc_user()`.
    *   That function looks up the caller's row in `auth.users` and returns true only if the email ends in `@umbc.edu`, the email is confirmed, and the account is not anonymous.
    *   It lives in a `private` schema that the REST API does not expose.
*   **Email + password stays on as the fallback.**
    *   The hook blocks non-UMBC addresses there too.
    *   Supabase's built-in email service only sends confirmation emails to members of the Supabase organization, so the fallback only works for teammates added to the org.
    *   An unconfirmed email account fails `is_umbc_user()`, so a typed-in `fake@umbc.edu` cannot save or read anything.
*   **`hd=umbc.edu`** is passed to Google only to pre-filter the account picker. It is not a security control.

### Data model

**`public.assets`**: one row per GIS feature that has at least one inspection. Rows are created the first time a feature is inspected, not loaded in advance.

| Column | Type | Rule |
|---|---|---|
| `id` | uuid | Primary key, generated by the database |
| `source_item` | text | 32 lowercase hex characters |
| `layer_id` | integer | Zero or more |
| `source_object_id` | text | Digits only, no leading zero (the `OBJECTID_1` value as text) |
| `dataset_version` | text | Not null, default `live` |
| `created_at` | timestamptz | Default now |

*   **Uniqueness:** a feature is unique by (`source_item`, `layer_id`, `source_object_id`, `dataset_version`).
*   **No empty values:** `dataset_version` is never null. Otherwise two rows for the same feature with a missing version would both be allowed.
*   **No inspection results here:** `assets` stores no outcome.
*   **Which features are allowed:** the allowlist (item `cc6a7a27c267435c8f7ed95a59eb5f24`, layer 3, version `live`) is enforced inside `create_inspection`, the only code that inserts assets.

**`public.inspections`**: append-only.

| Column | Type | Rule |
|---|---|---|
| `id` | uuid | Primary key. Generated by the client as the draft ID; no database default |
| `asset_id` | uuid | References `assets.id`; the asset cannot be deleted while inspections point to it |
| `inspector_id` | uuid | References `auth.users.id`; set from the sign-in token, never from input |
| `submitted_at` | timestamptz | Not null, set by the database at insert |
| `inspection_type` | text | 1–120 characters, stored without surrounding whitespace |
| `outcome` | text | `pass` or `fail` only |
| `notes` | text | Null, or 1–4,000 characters; empty input is stored as null |
| `displayed_snapshot` | jsonb | Must be a JSON object, at most 16 KB, default `{}` |

*   **History index:** an index on (`inspector_id`, `asset_id`, `submitted_at` newest first, `id` newest first) matches the history query exactly.
*   **Deleting users:** deleting a user who has inspections fails because of the foreign key. This keeps records intact, but it means demo accounts cannot be cleaned up from the dashboard without removing their inspections first.

### Permissions

By default, Supabase gives the `anon` (signed-out) and `authenticated` (signed-in) roles every privilege on new tables in `public`, including TRUNCATE, which row rules do not cover. New functions can be run by anyone. The migration removes all of that and grants back only what is listed here.

| Object | anon (signed out) | authenticated (signed in) |
|---|---|---|
| `assets` table | Nothing | SELECT, limited to UMBC users by row rule |
| `inspections` table | Nothing | SELECT, limited to own rows and UMBC users by row rule |
| `create_inspection` | Cannot run | Can run |
| `my_inspections` | Cannot run | Can run |
| `hook_restrict_umbc_signup` | Cannot run | Cannot run (only `supabase_auth_admin`) |
| `private.is_umbc_user` | Cannot run | Can run (row rules need it); not reachable over the API |

Row rules:

*   `inspections` SELECT: `inspector_id` equals the caller's user ID **and** `is_umbc_user()` is true.
*   `assets` SELECT: `is_umbc_user()` is true.
*   There is no INSERT, UPDATE or DELETE rule. With row rules turned on and no permission granted, those operations are denied.

Every function sets an empty search path and names each table with its schema. This stops a caller from swapping in a look-alike table.

### `create_inspection`: the only way to save

**Inputs:**

*   `p_draft_id` (uuid)
*   `p_source_item` (text)
*   `p_layer_id` (integer)
*   `p_object_id` (text)
*   `p_inspection_type` (text)
*   `p_outcome` (text)
*   `p_notes` (text, optional)
*   `p_displayed_snapshot` (json object, optional)

**Output:** one row with `id`, `asset_id`, `submitted_at` and `replayed` (true when this call matched an earlier save).

It runs with the owner's rights so it can insert past the "no direct writes" rule. Every check happens inside it, in this order:

1.  **Who is calling.** No user ID in the token → `not_authenticated`. `is_umbc_user()` false → `forbidden_domain`.
2.  **Clean up the inputs.**
    *   Trim the type, outcome and notes.
    *   Lowercase the outcome.
    *   Turn empty notes into null.
    *   Treat a missing snapshot as `{}`.
3.  **Validate.** Each failure names its field as `invalid_input:<field>`:
    *   the draft ID is present
    *   the type is 1–120 characters
    *   the outcome is `pass` or `fail`
    *   the notes are at most 4,000 characters
    *   the snapshot is a JSON object of at most 16 KB
    *   the object ID is digits only
4.  **Check the feature source.** The source item must be `cc6a7a27c267435c8f7ed95a59eb5f24` and the layer must be `3`. Anything else → `unknown_source`.
5.  **Find or create the asset row.** An "insert, or on duplicate return the existing row" statement does this, so two people inspecting a new feature at the same moment get the same asset.
6.  **Insert the inspection.** The inspector ID comes from the token and the timestamp from the database. If the draft ID already exists, the insert does nothing instead of failing.
7.  **If the insert went through:** return the new row with `replayed = false`.
8.  **If the draft ID already existed:**
    *   Load that row.
    *   If it belongs to another user, or its asset, type, outcome or notes differ from this request → `draft_conflict`. The error is the same whether the row is someone else's or yours with different content, so it reveals nothing about other users.
    *   If everything matches, return the stored row with `replayed = true`.

The snapshot is **not** compared on replay. A re-rendered map can produce slightly different attribute values for the same feature, and the snapshot is not authoritative anyway. Two calls racing with the same draft ID are safe: the second insert waits for the first to commit, then takes step 8.

### `my_inspections`: history for one feature

*   **Inputs:**
    *   `p_source_item`
    *   `p_layer_id`
    *   `p_object_id`
    *   `p_limit` (default 50, clamped to 1–50)
*   **Output:** rows with `id`, `asset_id`, `submitted_at`, `inspection_type`, `outcome`, `notes` and `displayed_snapshot`, ordered newest first, with ID as the tie-breaker.
*   **How it reads:** it runs with the caller's own rights, so the row rules apply. It also filters on `inspector_id = caller` explicitly so the index is used.
*   **Unknown features:** a feature that has never been inspected returns an empty list, not an error.
*   **Why it takes the feature fields:** the frontend knows the feature's source item, layer and object ID, not the internal asset UUID.

### Error contract

supabase-js does not throw. It returns `{ data, error }`, and the frontend branches on `error.code` and `error.message`.

| Situation | Postgres code | HTTP | Message starts with | What the UI does |
|---|---|---|---|---|
| Signed out | 42501 | 401 | permission denied | Ask the user to sign in; keep the draft |
| Session expired | PGRST301 / PGRST303 | 401 | JWT expired | Sign in again; keep the draft; retry with the same draft ID |
| Non-UMBC or unconfirmed account | 42501 | 403 | `forbidden_domain` | Show "UMBC accounts only" |
| Bad field value | P0001 | 400 | `invalid_input:<field>` | Highlight the field; keep all inputs |
| Wrong layer or item | P0001 | 400 | `unknown_source` | Ask the user to re-select the feature |
| Draft ID reused with different content | 23505 | 409 | `draft_conflict` | Start a new inspection with a new draft ID |
| Network failure or 5xx | none | none or 5xx | none | Offer Retry with the **same** draft ID |

### Draft ID lifecycle

*   **Create:** the frontend generates the draft ID with `crypto.randomUUID()` when the user opens "Start inspection".
*   **Keep:** it stays the same across retries, timeouts and re-sign-ins.
*   **Replace:** a new one is made only after a confirmed save, a discarded draft, or a switch to a different feature.

The database cannot enforce this; it is a frontend rule stated in `CONTRACT.md`.

### Handoff to the frontend teammate

Everything the teammate needs goes in one folder, `supabase/`:

*   **`CONTRACT.md`** contains:
    *   a version line
    *   a "differs from spec" box
    *   a glossary with example values
    *   both function signatures, each with a sample request and response, plus a conflict sample
    *   the error table above
    *   the draft ID lifecycle
    *   the mapping from the HTML form to the new fields
    *   how to read `source_item`, `layer_id` and `object_id` from an ArcGIS layer: `layer.portalItem.id`, `layer.layerId`, `attributes[layer.objectIdField]`
    *   the suggested snapshot keys
    *   the environment variable names
    *   the redirect URLs
*   **`database.types.ts`**, generated from the live schema after the last migration, so the types match what is actually there.
*   **Contract version.** Both files carry the same contract version, so a mismatch is visible.

### Test page

`stormwater/auth-test.html` is a standalone page with no ArcGIS code. Keeping it separate avoids a clash: both ArcGIS and Supabase sign-in return to port 5500 with `?code=` in the URL, and `index.html` runs the ArcGIS flow.

*   **What it loads:** a pinned supabase-js version from a CDN. It uses the public project URL and the publishable key, which are safe to ship to browsers.
*   **Sign-in:** the PKCE flow, returning to `http://localhost:5500/auth-test.html`.
*   **What it does:**
    *   signs in with Google
    *   takes a typed object ID, type, outcome and notes
    *   saves with a visible draft ID
    *   offers Retry with the same ID
    *   lists "My inspections"
*   **Its job:** prove that the real browser → API → database path works, which a dashboard insert cannot. It is not the product UI.

### How changes reach the shared project

1.  Each change is written first as a file under `supabase/migrations/`.
2.  That exact text is applied through the Supabase MCP.
3.  Supabase records its own version number for each applied migration. The local file is then renamed to match it, so a later `supabase db push` does not try to apply it twice.
4.  Applied migrations are never edited. A fix is a new migration.

Only rodriguezzfabricio applies migrations.

### How the rules are tested

*   **Database checks, without leaving junk in the shared project:** the tests run in one transaction that ends in ROLLBACK. Inside it, each case switches to the `authenticated` or `anon` role and sets a fake sign-in token for a user created in the same transaction. A case raises an error if its result is wrong. The full case list is under file #7 in the Detailed Implementation Plan.
*   **Supabase security check:** the security advisor runs after each migration.
*   **Browser proof:** on `auth-test.html`:
    1.  Sign in, save, reload, and see the record.
    2.  Press Retry and confirm the count does not change.
    3.  Sign in as a second UMBC account (a teammate's) and confirm the first account's record is not visible.

## Alternatives Considered

### Alternative A: Let the browser insert into `inspections` directly, guarded by row rules

*   **Pros:**
    *   No function to write.
    *   supabase-js `insert` is the most familiar call for the frontend teammate.
*   **Cons:**
    *   A row rule can check that `inspector_id` matches the caller. It cannot create the asset row in the same step, enforce the BMP layer allowlist on a separate table, or return the existing row when a draft ID is retried. The frontend would need two calls (create asset, then insert inspection), and the asset table would need an open insert rule, letting any user invent assets. That breaks spec line 55.
    *   A caller could also send their own `submitted_at` unless extra triggers block it.
*   **Reason for rejection:** it spreads the rules across row rules, triggers and frontend code, and still cannot make the save a single step. One owner-rights function puts every check in one place, and that place can be tested.

### Alternative B: Trusted server code between the browser and the database (the spec's plan)

*   **Pros:**
    *   This is what spec line 17 describes.
    *   Server code could re-check the facility snapshot against ArcGIS before saving, which closes the known gap.
    *   Database credentials never leave the server.
*   **Cons:**
    *   The server would live inside the teammate's Next.js app, which does not exist in the repo and cannot be run or tested here tonight.
    *   Re-checking against ArcGIS needs authorized server-side access to the GIS layer, which nobody has set up.
    *   It adds a second place where rules live.
*   **Reason for rejection:** it cannot be built or verified before the demo. The database-function design does not block adding it later. A server handler can call the same `create_inspection` function, and only the snapshot check moves.

### Alternative C: Email + password with accounts created in advance only (spec line 25)

*   **Pros:**
    *   Matches the spec word for word.
    *   No Google setup.
    *   Public sign-up can be turned off completely.
*   **Cons:**
    *   Every professor and stakeholder account would have to be created by hand.
    *   Passwords have to be shared with them somehow.
    *   Confirmation emails only reach Supabase organization members unless a custom email server is set up.
*   **Reason for rejection:** Google sign-in was tested on 2026-10-27 and works with UMBC accounts, so anyone with a UMBC account can sign in without a hand-made account or a shared password. Email + password stays on as a fallback for teammates.

### Alternative D: Only one `@umbc.edu` check (just the hook, or just the database check)

*   **Pros:** less code and one place to look.
*   **Cons:**
    *   With only the hook, users created before the hook (including the existing `frodrig3@umbc.edu` user) skip it, and turning the hook off in the dashboard silently opens everything.
    *   With only the database check, any Google user can still create an account. They cannot see or save data, but they show up in the user list.
*   **Reason for rejection:** each check covers a failure the other misses. The second check is one short function.

### Alternative E: Load all 121 BMP features into `assets` ahead of time

*   **Pros:**
    *   History and saves could use the asset UUID directly.
    *   The feature list could be shown without ArcGIS.
*   **Cons:**
    *   It needs an authorized export of the GIS layer into the shared database.
    *   The spec (line 41) requires any copied snapshot to carry an explicit dataset version and visible date.
    *   It duplicates data that ArcGIS already serves, and it goes stale when the layer changes.
*   **Reason for rejection:** creating the asset row on first inspection, limited by the allowlist, needs no export and stores only features that actually have inspections.

### Alternative F: Follow the static HTML form fields

*   **Pros:** the teammate's current UI already has these fields: "Needs verification", hand-typed asset tag, BMP type, location, and photos.
*   **Cons:**
    *   Hand-typed asset tags cannot identify a feature, because `MDE_SF_Num` and `UMBC_PRF` repeat across features.
    *   A third outcome and photos are out of scope in the approved spec.
    *   Photos add a separate upload-and-record problem.
*   **Reason for rejection:** the spec is the approved scope. The teammate removes one dropdown option and the manual fields. Facility details come from the selected feature instead.

### Alternative G: Compare the snapshot when a draft ID is retried

*   **Pros:** catches a retry whose displayed feature details changed.
*   **Cons:**
    *   The same feature can render with slightly different attribute values (field order, number formatting, a layer refresh), which would turn a valid retry into a false conflict.
    *   The snapshot is not verified, so a match proves nothing.
*   **Reason for rejection:** the retry check compares only what the inspector entered and which feature they chose.

### Alternative H: Test against a local Supabase stack or a Supabase branch first

*   **Pros:** mistakes cannot touch the shared project.
*   **Cons:**
    *   A local stack needs Docker and the Supabase CLI stack running, plus time to set up.
    *   Branching may need a paid plan.
    *   Neither one runs Google sign-in against the real project settings.
*   **Reason for rejection:** not enough time tonight. The shared project is empty, migrations are kept as files, and every test rolls back. That keeps the risk to the shared project low. If someone else starts using the project, this should be revisited.

### Alternative I: Write a Next.js sign-in kit for the teammate to copy

*   **Pros:** saves the teammate from reading the Supabase guide.
*   **Cons:**
    *   It cannot be run or tested without their app.
    *   It may clash with their project setup or Next.js version.
*   **Reason for rejection:** untested copy-in code is more likely to cost time than save it. `CONTRACT.md` links Supabase's official Next.js guide and states the exact redirect URLs.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security and privacy:**
    *   **Publishable key is committed.** The project URL and the publishable key are public by design and go into the repo, the same way the ArcGIS client ID already does. Row rules and function checks protect the data, not the key.
    *   **Secrets stay out of the repo.** That covers the Google client secret, the service role key, and any sign-in token. `.gitignore` gains patterns for Google client JSON files and `.env` files.
    *   **The test page never logs tokens or raw auth errors**, following the existing rule in `stormwater/map.js`.
    *   **A session leaked into a chat log during setup** on 2026-10-27 (session `eab71ab3-…`). Revoke it before the demo.
*   **Rollback:**
    *   The sign-up hook is turned off by setting `hook_before_user_created_enabled = false`, which takes effect at once.
    *   The schema is removed by running `supabase/rollback/inspection_down.sql` by hand. It is never run automatically.
    *   Google sign-in is turned off with `external_google_enabled = false`.
*   **Performance:**
    *   There are about 121 features and a handful of users.
    *   History returns at most 50 rows through an index that matches the query.
    *   No load concerns.

--------------------------------------------------------------------------------

### Additional Resources

*   `app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md`: the approved scope (lines 17, 25, 41, 53, 55 and 85 are referenced above).
*   `concepts_brief.md`: brainstorm output and reviewer findings.
*   `ASTRA-DEMO-PLAN.md`, `RECON.md`, `goldfish-reviews/design.md`, `goldfish-reviews/codebase.md`.
*   Supabase docs: "Before User Created Hook", "Send emails with custom SMTP" (the built-in email service only sends to organization members), and "Row Level Security".

### Future Improvements

*   **Verify the snapshot on the server.** Add a server handler that fetches the feature from ArcGIS and passes the verified attributes to `create_inspection`.
*   **Reviewer or admin role** with read access across inspectors.
*   **Photos** through Supabase Storage, with one upload linked to one inspection.
*   **Custom email server** (Resend or Brevo), so the email fallback works for anyone.
*   **Google audience "Internal"**, if the Google Cloud project can be moved under UMBC's organization. Google would then block non-UMBC accounts before Supabase sees them.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Order of work (about 2 hours 45 minutes)

| # | Step | Who | Time |
|---|---|---|---|
| 1 | Add `.gitignore` entries. Revoke the leaked session. | Claude (revoke on approval) | 5 min |
| 2 | Write the three migrations and the rollback file. Apply the schema migration, run the advisor, then do the same for the functions and the hook. Rename the files to the versions Supabase recorded. | Claude | 40 min |
| 3 | Turn on the sign-up hook with `configure-auth.sh hook`. This must come after step 2: a hook pointing at a missing function blocks every sign-up. | rodriguezzfabricio runs it | 5 min |
| 4 | Write and run the rule tests. Fix any failure with a new migration. | Claude | 30 min |
| 5 | Generate the types, write `CONTRACT.md`, and send the teammate the URL, the key and the contract. | Claude writes it; rodriguezzfabricio sends it | 40 min |
| 6 | Build the test page. Do the browser walk-through with two UMBC accounts and record it. | Claude builds it; both accounts sign in | 30 min |
| 7 | Update the READMEs, the spec deviations and `CLAUDE.md`. | Claude | 15 min |

**If time runs out**, stop in this order. Each point still leaves a working demo:

*   After step 4, the database is proven.
*   After step 5, the teammate can integrate.
*   After step 6, the full path is proven in a browser.

### Target Files to Create/Modify

Files not listed here do not change. In particular, `stormwater/index.html`, `stormwater/map.js`, `stormwater/arcgis-config.js` and `stormwater/styles.css` stay as they are.

#### 1. `.gitignore` (Modify)

*   **Type / Scope:** repository configuration.
*   **Proposed Changes:**
    *   Add `client_secret*.json`, `.env` and `.env.*`, with an exception for `.env.example`.
*   **Why:** the Google client secret was downloaded as a JSON file. One `git add .` from the wrong folder would commit it.

#### 2. `supabase/migrations/<version>_inspection_schema.sql` (Create)

*   **Type / Scope:** Postgres migration, applied through the Supabase MCP.
*   **Proposed Changes:**
    *   **Private schema:** create schema `private`. Remove default access to it. Give the `authenticated` role usage only. The REST API does not expose this schema.
    *   **`private.is_umbc_user()`**, which returns a boolean:
        *   It is a read-only SQL function that runs with owner rights and an empty search path.
        *   It returns true only when the `auth.users` row for `auth.uid()` exists, its lowercased email ends in `@umbc.edu`, `email_confirmed_at` is set, and `is_anonymous` is false.
        *   Only `authenticated` can run it. It is revoked from `public` and `anon`.
    *   **Tables:** create `public.assets` and `public.inspections` with the columns, rules, uniqueness and foreign keys from the Technical Plan. Every check constraint gets a name, for example `inspections_outcome_check`, so failures can be recognized.
    *   **Comment on `displayed_snapshot`:** "As displayed in the browser at submission. Not verified against ArcGIS."
    *   **History index:** on `inspections` (`inspector_id`, `asset_id`, `submitted_at desc`, `id desc`).
    *   **Row rules:** turn them on for both tables.
    *   **Permissions:** revoke all privileges on both tables from `anon` and `authenticated`, then grant SELECT to `authenticated`.
    *   **Policy `inspections_select_own`:** for SELECT by `authenticated`, the user ID matches the caller's and `is_umbc_user()` is true. Both function calls are wrapped as sub-selects so they run once per query.
    *   **Policy `assets_select_umbc`:** for SELECT by `authenticated`, `is_umbc_user()` is true.
*   **Why:** this holds the data and the read rules. The defaults are removed explicitly because Supabase grants every table privilege, including TRUNCATE, to `anon` and `authenticated` by default.

#### 3. `supabase/migrations/<version>_inspection_functions.sql` (Create)

*   **Type / Scope:** Postgres migration.
*   **Proposed Changes:**
    *   **`public.create_inspection(...)`**
        *   Signature: `p_draft_id uuid`, `p_source_item text`, `p_layer_id integer`, `p_object_id text`, `p_inspection_type text`, `p_outcome text`, `p_notes text default null`, `p_displayed_snapshot jsonb default '{}'`.
        *   Returns one row: `id uuid`, `asset_id uuid`, `submitted_at timestamptz`, `replayed boolean`.
        *   PL/pgSQL, running with owner rights and an empty search path. Output column names that clash with table column names are resolved explicitly.
        *   Its steps are the eight steps listed under "create_inspection" in the Technical Plan.
        *   The allowed item `cc6a7a27c267435c8f7ed95a59eb5f24`, the allowed layer `3` and the dataset version `live` are constants inside the function.
        *   **Errors** are raised with fixed codes and message prefixes:
            *   `not_authenticated` and `forbidden_domain`: code 42501
            *   `invalid_input:<field>` and `unknown_source`: code P0001
            *   `draft_conflict`: code 23505
        *   **`<field>` names** match the parameter names without `p_`:
            *   `draft_id`
            *   `object_id`
            *   `inspection_type`
            *   `outcome`
            *   `notes`
            *   `displayed_snapshot`
    *   **`public.my_inspections(...)`**
        *   Signature: `p_source_item text`, `p_layer_id integer`, `p_object_id text`, `p_limit integer default 50`.
        *   Returns a set of rows: `id`, `asset_id`, `submitted_at`, `inspection_type`, `outcome`, `notes`, `displayed_snapshot`.
        *   Read-only SQL, running with the caller's rights and an empty search path.
        *   Joins `inspections` to `assets` on the feature's source item, layer, object ID and version `live`, and filters on `inspector_id = auth.uid()`.
        *   Orders by `submitted_at desc, id desc`. The limit is clamped to 1–50.
    *   **Permissions:** remove the right to run both functions from `public` and `anon`, and grant it to `authenticated`.
*   **Why:** these are the only write path and the main read path. Keeping them in their own migration lets the function logic be replaced later without touching the tables.

#### 4. `supabase/migrations/<version>_umbc_signup_hook.sql` (Create)

*   **Type / Scope:** Postgres migration.
*   **Proposed Changes:**
    *   **`public.hook_restrict_umbc_signup(event jsonb)`**, which returns jsonb:
        *   It reads `event -> 'user' ->> 'email'`, lowercases and trims it, and checks whether it ends with `@umbc.edu`.
        *   If it does, the function returns `{}`.
        *   Otherwise it returns `{"error": {"http_code": 403, "message": "Only @umbc.edu accounts can sign up."}}`.
        *   It reads only the payload and touches no tables.
    *   **Permissions:**
        *   Grant schema usage and the right to run it to `supabase_auth_admin`.
        *   Revoke the right to run it from `public`, `anon` and `authenticated`.
*   **Why:** blocks non-UMBC accounts when they are created. It gets its own migration so it can be rolled back separately and turned off without touching the data.

#### 5. `supabase/rollback/inspection_down.sql` (Create)

*   **Type / Scope:** manual rollback script. Never applied as a migration.
*   **Proposed Changes:**
    *   Drop, in this order:
        1.  the hook function
        2.  `my_inspections`
        3.  `create_inspection`
        4.  `inspections`
        5.  `assets`
        6.  `private.is_umbc_user`
        7.  the `private` schema
    *   Run it only after turning the hook off.
    *   The header warns that it deletes every saved inspection.
*   **Why:** the reviewers asked for a written way back. Without the file, a rollback would mean writing SQL under pressure against the shared project.

#### 6. `supabase/scripts/configure-auth.sh` (Create)

*   **Type / Scope:** shell script run by rodriguezzfabricio. It changes Auth settings through the Supabase Management API.
*   **Proposed Changes:**
    *   **Two modes:**
        *   `google <path-to-client-json>`: turns on Google with the client ID and secret from the JSON file. Sets the Site URL to `http://localhost:3000`. Adds the redirect URLs and keeps any existing ones.
        *   `hook`: turns on the before-user-created hook with URI `pg-functions://postgres/public/hook_restrict_umbc_signup`.
    *   **Token:** read from `SUPABASE_ACCESS_TOKEN` if set, otherwise from the Supabase CLI's keychain login.
    *   **Output:** prints the non-secret settings before and after. Prints the HTTP status and message on failure.
    *   **Never** prints the token or the client secret.
*   **Why:** the Auth settings applied tonight would otherwise exist only in the dashboard, and the spec requires setup that can be repeated. This replaces the one-off script in the session scratchpad.

#### 7. `supabase/tests/inspection_rules.sql` (Create)

*   **Type / Scope:** SQL test script, run through the Supabase MCP or `psql`.
*   **Proposed Changes:**
    *   **Structure:** one transaction that starts with BEGIN and ends with ROLLBACK, so nothing remains in the shared project.
    *   **Setup:** insert four temporary users into `auth.users`:
        *   UMBC user A, confirmed
        *   UMBC user B, confirmed
        *   Gmail user C, confirmed
        *   UMBC user D, unconfirmed
    *   **Switching identity:** each case sets the local role to `authenticated` or `anon` and sets `request.jwt.claims` to that user's ID and email. It resets the role afterwards.
    *   **On failure:** a case raises `TEST FAILED: <case>`. No error means every case passed.
    *   **Cases:**
        1.  Signed out (`anon`) cannot run `create_inspection` or read `inspections`.
        2.  Gmail user C gets `forbidden_domain` and reads zero rows.
        3.  Unconfirmed user D gets `forbidden_domain`.
        4.  User A saves on feature 101. Returns `replayed = false` with A as the inspector and the time set by the server.
        5.  User A repeats the same call. Returns `replayed = true`, and the row count is still 1.
        6.  User A reuses the draft ID with a different outcome and gets `draft_conflict`.
        7.  User B reuses A's draft ID with the same content and gets `draft_conflict`.
        8.  User B's `my_inspections` on feature 101 and B's direct select on `inspections` both return zero of A's rows.
        9.  User A saves a second inspection on feature 101 and one on feature 102. History for 101 returns 2 rows, newest first. History for 102 returns 1 row.
        10. Invalid input each returns the expected prefix:
            *   outcome `needs verification`
            *   empty type
            *   121-character type
            *   4,001-character notes
            *   an array as the snapshot
            *   object ID `abc`
            *   the wrong source item
            *   layer 2
        11. User A's direct INSERT, UPDATE, DELETE and TRUNCATE on both tables are denied.
        12. Called with sample payloads, the hook function accepts `x@umbc.edu` and `X@UMBC.EDU`, and rejects `x@gmail.com` and `x@evilumbc.edu`.
    *   **After the rollback:** a query confirms that the row counts in `assets`, `inspections` and `auth.users` match the counts from before the run.
*   **Why:** this proves every goal in this document without leaving test data in a project the whole team uses.

#### 8. `supabase/database.types.ts` (Create, generated)

*   **Type / Scope:** TypeScript types generated by the Supabase MCP after the last migration.
*   **Proposed Changes:**
    *   Generated output, with a header comment added: `Contract-Version: 1`, plus the date and the latest migration version.
    *   Regenerate after any schema change. Never edit by hand.
*   **Why:** gives the teammate exact types for both function calls and their results.

#### 9. `supabase/CONTRACT.md` (Create)

*   **Type / Scope:** documentation for the frontend teammate.
*   **Proposed Changes:**
    *   **Header:** `Contract-Version: 1`, the date and the latest migration version.
    *   **"Differs from spec" box:**
        *   Google sign-in instead of email-only accounts.
        *   The browser calls database functions directly instead of going through server code.
        *   The snapshot is stored as displayed and is not verified.
        *   Pass and fail are the only outcomes.
    *   **Setup:**
        *   Environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, with their values.
        *   Allowed redirect URLs.
        *   A link to Supabase's official Next.js sign-in guide.
        *   The sign-in call: Google provider, `redirectTo`, and `hd=umbc.edu` as a hint.
    *   **Glossary with examples:**
        *   `source_item`: 32-character hex, not a URL
        *   `layer_id`: the integer `3`
        *   `object_id`: a decimal string such as `"42"`, taken from `attributes[layer.objectIdField]`
        *   `draft_id`
        *   `displayed_snapshot`
    *   **Reading the source fields from ArcGIS:** `layer.portalItem.id` and `layer.layerId`, not `layer.id`. Note that nobody has yet confirmed that WebMap `d59cb5cc…` contains item `cc6a7a27…`.
    *   **Suggested snapshot keys:** the raw ArcGIS field names as shown, for example `Facility_T`, `Facility_N`, `MDE_SF_Num` and `UMBC_PRF`, with null for missing values. Using the raw names avoids inventing labels whose meaning nobody has confirmed (spec line 43).
    *   **`create_inspection`:** a sample request and response, a replay response, and a conflict response.
    *   **`my_inspections`:** a sample request and response.
    *   **Reference tables:**
        *   the full error table, with the UI action for each error
        *   the draft ID lifecycle rules
    *   **Mapping from the HTML form:**
        *   Drop "Needs verification".
        *   Send the outcome as lowercase `pass` or `fail`.
        *   Send the dropdown label as `inspection_type`.
        *   Observations → `notes`.
        *   Show the asset tag, BMP type and location read-only from the snapshot instead of as inputs.
        *   Remove photos.
    *   **Note:** ignore `hook_restrict_umbc_signup` in the generated types; the frontend cannot call it.
*   **Why:** the teammate cannot read the SQL. This file is the only agreement between the two halves.

#### 10. `supabase/README.md` (Create)

*   **Type / Scope:** documentation for whoever maintains the back end.
*   **Proposed Changes:**
    *   **Project and history:**
        *   project ref `fsrsldketzmcjyvjueki`
        *   a list of applied migrations with the versions Supabase recorded
        *   the Auth settings applied: Google, Site URL, redirect URLs, the hook
        *   the starting state (empty `public` schema on 2026-10-27)
    *   **Rules for changes:**
        *   Only rodriguezzfabricio applies migrations.
        *   Write the file first.
        *   Never edit an applied migration.
    *   **Commands and steps:**
        *   how to run the tests
        *   how to regenerate types
        *   how to roll back: the hook first, then the down script
    *   **Links:** a link to `CONTRACT.md`.
*   **Why:** records what exists in the shared project and how it got there, which the spec's deliverables require (line 85).

#### 11. `stormwater/supabase-config.js` (Create)

*   **Type / Scope:** browser configuration, in the same style as `arcgis-config.js`.
*   **Proposed Changes:**
    *   Sets a frozen `window.STORMWATER_SUPABASE` object with `url` (`https://fsrsldketzmcjyvjueki.supabase.co`) and `publishableKey`, the value fetched through the MCP.
    *   Has a header comment saying that only the publishable key belongs here, never the service role key or a token.
*   **Why:** keeps public configuration out of the page logic, matching how the prototype already handles the ArcGIS client ID.

#### 12. `stormwater/auth-test.html` (Create)

*   **Type / Scope:** static test page.
*   **Proposed Changes:**
    *   **Markup** reuses the existing `styles.css` classes:
        *   sign-in and sign-out buttons, plus the signed-in email
        *   a fixed source line showing item `cc6a7a27…` and layer 3
        *   inputs for object ID, inspection type, pass/fail radio buttons with neither selected, and notes
        *   a read-only draft ID with a "New draft" button
        *   Save and Retry buttons
        *   a result panel
        *   a "My inspections" list for the typed object ID
    *   **Scripts:** loads `supabase-config.js`, then `auth-test.js`.
    *   **No ArcGIS.** It loads no ArcGIS SDK.
*   **Why:** proves the browser → API → database path with a real Google session before the teammate's app exists, without clashing with the ArcGIS sign-in on `index.html`.

#### 13. `stormwater/auth-test.js` (Create)

*   **Type / Scope:** ES module, in the same style as `map.js`.
*   **Proposed Changes:**
    *   **Client setup:**
        *   Imports `createClient` from an exact, pinned supabase-js 2.x version on jsDelivr. The version is checked to exist and to be at least two weeks old at build time.
        *   Creates the client with the PKCE flow, session detection from the URL, and a stored session.
    *   **Sign-in and sign-out:**
        *   Sign-in calls the Google provider with `redirectTo` `http://localhost:5500/auth-test.html` and the `hd=umbc.edu` hint.
        *   Sign-out clears the session.
        *   The page re-renders when the auth state changes.
    *   **Saving:**
        *   The draft ID comes from `crypto.randomUUID()`. It is replaced only by "New draft" or after a confirmed save.
        *   Save calls `create_inspection` with the fixed source, the typed fields and a snapshot of `{"source": "auth-test page"}`.
        *   Retry resends the last request exactly.
        *   The result panel shows the record ID, server time, `replayed`, and the signed-in email.
    *   **Errors:** the error code and message prefix are shown on the page. Nothing is written to the console.
    *   **History:** after a save and on demand, calls `my_inspections` for the typed object ID.
*   **Why:** the logic for the test page lives here. It also serves as a working example of every contract call for the teammate.

#### 14. `stormwater/README.md` (Modify)

*   **Type / Scope:** documentation.
*   **Proposed Changes:**
    *   Add `auth-test.html`, `auth-test.js` and `supabase-config.js` to "Files".
    *   Add a short "Supabase test page" section: open `http://localhost:5500/auth-test.html` and sign in with a UMBC Google account.
    *   Update "Not yet part of this static proof-of-concept" to say that saving works on the test page only, not on `index.html`.
*   **Why:** the README would otherwise say records are not stored anywhere.

#### 15. `app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md` (Modify)

*   **Type / Scope:** the approved spec.
*   **Proposed Changes:**
    *   Append a "Deviations (2026-10-27)" section covering four changes:
        *   Google sign-in limited to `@umbc.edu`, with email + password as a fallback (line 25).
        *   The browser calls database functions, with no server handlers (line 17).
        *   The snapshot is stored as displayed and is not verified (line 53).
        *   Assets are created on first inspection and limited by an allowlist (line 55).
    *   Replace the stale repository statement on line 11.
    *   Make no other wording changes.
*   **Why:** the spec is the approved reference. Deviations that are not written down look like missed requirements at the demo.

#### 16. `CLAUDE.md` (Modify)

*   **Type / Scope:** project instructions.
*   **Proposed Changes:**
    *   Replace "stormwater/ is the only runnable code" with a description of `supabase/`: what each subfolder holds and the migration rules.
    *   Add the test page to the prototype section.
    *   Point to `supabase/CONTRACT.md` as the frontend agreement.
*   **Why:** future sessions would otherwise assume no back end exists.

### Verification Plan

*   **Build:** none. The prototype is static files, and the back end is SQL.
*   **JavaScript syntax:** `node --check stormwater/auth-test.js` passes.
*   **Rule tests:**
    *   `supabase/tests/inspection_rules.sql` runs through the MCP without any `TEST FAILED` error.
    *   The row counts after the run match the counts before it.
*   **Privilege check:**
    *   A query of `has_table_privilege` and `has_function_privilege` for `anon` and `authenticated` matches the Permissions table in the Technical Plan exactly.
    *   For example, `authenticated` has no INSERT and no TRUNCATE on either table.
*   **Static analysis:**
    *   The Supabase security and performance advisors report no ERROR items.
    *   Every WARN item is either fixed or listed in `supabase/README.md` with a reason.
*   **End to end:** the three-step browser walk-through from the Technical Plan with two real UMBC accounts, recorded on screen as a backup for the demo.
*   **Coverage requirement:** every goal maps to at least one check (case numbers refer to file #7):

    | Goal | Covered by |
    |---|---|
    | 1 | Cases 2, 3, 12 |
    | 2 | Case 4 |
    | 3 | Cases 5–7 |
    | 4 | Case 8 |
    | 5 | Case 11 |
    | 6 | Case 10 |
    | 7 | The teammate reads `CONTRACT.md` and confirms it is enough to integrate |
    | 8 | The migration list in `supabase/README.md` |

--------------------------------------------------------------------------------

*Drafted with EGM*
