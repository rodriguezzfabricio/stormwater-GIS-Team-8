# Supabase back end: maintainer notes

For whoever maintains the inspection database and sign-in. The frontend teammate reads [`CONTRACT.md`](./CONTRACT.md) instead. The full design is in [`docs/designs/inspection-database-and-umbc-sign-in.md`](../docs/designs/inspection-database-and-umbc-sign-in.md).

Contract-Version: 2 (same number in `CONTRACT.md` and `database.types.ts`)
Last verified: 2026-10-27

> **Applied 2026-10-28:** `migrations/20261028070220_bmp_source_import_layer.sql` points both functions at the layer the map shows (item `5d70e438bb6045d6b3af05aee061e3cd`, layer 0). Rule tests passed; advisors showed only the three known warnings (see below).

## Folder layout

| Path | What it is |
|---|---|
| `migrations/` | The four applied migrations, named with the versions Supabase recorded. The source of truth for the schema. Never edit one after it is applied. |
| `tests/inspection_rules.sql` | Rule tests. One transaction that ends in `ROLLBACK`, so nothing is left behind. |
| `rollback/inspection_down.sql` | Manual rollback. Deletes every saved inspection. Never applied as a migration. |
| `scripts/configure-auth.sh` | Changes Auth settings (Google, redirect URLs, sign-up hook) through the Supabase Management API. |
| `database.types.ts` | Generated TypeScript types for the frontend. Never edit by hand. |
| `CONTRACT.md` | The agreement with the frontend: calls, errors, examples. |
| `README.md` | This file. |
| `.temp/` | Scratch left by the Supabase CLI. Not part of the back end; git-ignored. |

Related files outside this folder:

- `static-site/inspection-backend.mjs`, `static-site/inspection-backend-core.mjs` and `static-site/supabase-config.js`: the drop-in the dashboard uses for sign-in, saving and history. How it is wired and tested: `static-site/BACKEND-GUIDE.md`.
- `static-site/backend-check.html`: a self-test page for the drop-in that needs no map. It saves real records.
- `stormwater/auth-test.html` and `stormwater/auth-test.js`: a standalone page that exercises sign-in and both functions directly.
- `stormwater/supabase-config.js`: the project URL and publishable key for that page.

## Project and history

| Item | Value |
|---|---|
| Project ref | `fsrsldketzmcjyvjueki` |
| URL | `https://fsrsldketzmcjyvjueki.supabase.co` |
| Publishable key | `sb_publishable_CHlreM6iIfKeSCvdjVuBJw_-M0hGv8J` (public by design; safe to commit) |
| Frontend env vars | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

**Starting state (2026-10-27):** the `public` schema was empty, no migrations had been applied, and there was 1 user in `auth.users`.

### Applied migrations

These are the versions Supabase recorded. The local file names match them, so a later `supabase db push` will not apply them twice.

| Version | File | What it adds |
|---|---|---|
| `20261028024530` | `20261028024530_inspection_schema.sql` | Schema `private` and `private.is_umbc_user()`. Tables `public.assets` and `public.inspections`. History index. Row rules. Removes the default table privileges for `anon` and `authenticated` and grants back `SELECT` only. |
| `20261028024553` | `20261028024553_inspection_functions.sql` | `public.create_inspection(...)` (the only write path) and `public.my_inspections(...)`. Execute rights for `authenticated` only. |
| `20261028024605` | `20261028024605_umbc_signup_hook.sql` | `public.hook_restrict_umbc_signup(event jsonb)`, callable only by `supabase_auth_admin`. Switched on 2026-10-27 (see "Auth settings applied"). |

| `20261028070220` | `20261028070220_bmp_source_import_layer.sql` | `create_inspection` accepts only item `5d70e438bb6045d6b3af05aee061e3cd` (`UMBC_BMP_ArcGIS_Import`), layer 0. `my_inspections` becomes plpgsql and raises `unknown_source` for any other source. Rows saved against the old layer (item `cc6a7a27…`, layer 3) are kept unchanged and are no longer returned. Contract-Version 2. Applied 2026-10-28 by rodriguezzfabricio. |

Latest applied migration: `20261028070220_bmp_source_import_layer`.

Advisors after it (2026-10-28), all known and accepted: `create_inspection` is a SECURITY DEFINER function callable by `authenticated` (by design: it is the only write path and checks everything itself); leaked-password protection is off (email fallback only); `inspections.asset_id` has no index of its own (the history index starts with `inspector_id`; fine at demo scale).

Between step 1 and the merge, `stormwater/auth-test.html` on `main` can't save: it still sends the old layer.

### Auth settings applied

| Setting | Value | Status |
|---|---|---|
| Google provider | enabled, client `448117214298-qcni…` (truncated on purpose) | Applied 2026-10-27. Sign-in with `frodrig3@umbc.edu` succeeded. |
| Site URL | `http://localhost:3000` | Applied 2026-10-27 |
| Redirect URLs | `http://localhost:3000/**` and `http://localhost:5500/auth-test.html` | Applied 2026-10-27 |
| Redirect URL for `static-site/` | `http://localhost:5500/**` | Applied 2026-10-27 by rodriguezzfabricio (`configure-auth.sh redirects`). |
| Before-user-created hook | URI `pg-functions://postgres/public/hook_restrict_umbc_signup` | Turned on 2026-10-27 by rodriguezzfabricio (`configure-auth.sh hook`). Verified through the API: email sign-ups for `hook-test@example.com` and `hook-test@evilumbc.edu` returned HTTP 403 "Only @umbc.edu accounts can sign up." and no user was created. |
| Email + password | left on as a fallback, per the design | Supabase's built-in email service only sends to members of the Supabase organization, so it works only for teammates added there. |
| Leaked-password protection | not enabled | Applies only to the email + password fallback. May require the Pro plan. |

If the hook is ever turned off, any Google account can create a user and appear in the user list. The database still blocks those users: `create_inspection` returns `forbidden_domain` and `my_inspections` returns nothing.

### What the database enforces

- `anon` (signed out) has no access to either table and cannot run either function.
- `authenticated` can `SELECT` the tables and run the two functions. Row rules limit `inspections` to the caller's own rows and require a confirmed, non-anonymous `@umbc.edu` account (`private.is_umbc_user()`).
- No role can `INSERT`, `UPDATE`, `DELETE` or `TRUNCATE` the tables directly. Saves go through `create_inspection`, which runs with the owner's rights, checks everything itself and accepts only item `5d70e438bb6045d6b3af05aee061e3cd`, layer 0.
- A repeated draft ID with identical content returns the original record. Different content, or another user's draft ID, raises `draft_conflict`.
- Deleting a user who has inspections fails (foreign key). To clean up demo accounts, delete their inspections first as the database owner, using SQL. The API cannot delete them.

## Rules for changes

1. Only rodriguezzfabricio applies migrations to the shared project.
2. Write the migration file first, under `migrations/`.
3. Apply that exact text through the Supabase MCP (`apply_migration`).
4. Supabase records its own version number. List the migrations (MCP `list_migrations`) and rename the local file to match.
5. Never edit an applied migration. A fix is a new migration.
6. After every migration: run the tests, run both advisors, regenerate `database.types.ts`.
7. If a function signature, error code, message start or returned column changes, bump `Contract-Version` in `CONTRACT.md` and in the header of `database.types.ts`, and tell the frontend teammate.
8. Inspect the existing tables before migrating. This is a shared project.

## Commands and steps

### Run the tests

`tests/inspection_rules.sql` creates temporary users and data inside one transaction and rolls it all back. It prints `ALL TESTS PASSED` if every case passes. A failing case raises `TEST FAILED: <case>`.

Two ways to run it:

- Supabase MCP: pass the file's contents to `execute_sql`. No local database password is set up, so this is the usual route.
- `psql`, with a connection string for the project:

  ```sh
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/inspection_rules.sql
  ```

Check that nothing was left behind by running this before and after. The numbers must match:

```sql
select
  (select count(*) from public.assets)      as assets,
  (select count(*) from public.inspections) as inspections,
  (select count(*) from auth.users)         as users;
```

Result on 2026-10-27: the test file passed (via the MCP). Counts before and after: assets 0 and 0, inspections 0 and 0, `auth.users` 1 and 1.

The file covers: signed-out access, non-UMBC, unconfirmed and anonymous users, first save, replay, draft conflicts (including another user's draft ID), history isolation between users, input validation and its limits, blocked direct writes, the hook function, and a check of every table and function privilege.

### Regenerate the types

Run this after any schema change:

- MCP: `generate_typescript_types`, or
- CLI (needs `supabase login`):

  ```sh
  supabase gen types typescript --project-id fsrsldketzmcjyvjueki > supabase/database.types.ts
  ```

Then put the header comment back at the top of the file (the generator overwrites it). Update the date and the migration version:

```ts
// Contract-Version: 2
// Generated <date> from Supabase project fsrsldketzmcjyvjueki after migration <the version Supabase recorded for bmp_source_import_layer>.
// Generated output: never edit by hand; regenerate after any schema change (see supabase/README.md).
// Known generator quirk: my_inspections Returns.notes is typed string but can be null. See CONTRACT.md.
// Ignore hook_restrict_umbc_signup: the frontend cannot call it.
```

### Turn the sign-up hook on (done 2026-10-27)

Re-run only if the hook was turned off. Do not run it if the function is ever dropped: a hook that points at a missing function blocks every sign-up.

```sh
export SUPABASE_ACCESS_TOKEN=...   # or run `supabase login` once
supabase/scripts/configure-auth.sh hook
```

The script needs `bash`, `curl` and `jq`. It prints the non-secret Auth settings before and after, and never prints the token. The "After" block should show `hook_before_user_created_enabled: true`.

Then check it: sign in on `auth-test.html` with a non-UMBC Google account. Sign-in should fail and no new user should appear in the Auth user list. Update the "Auth settings applied" table when done.

Other script modes:

- `configure-auth.sh google <client.json>`: enables Google from a Google OAuth client JSON, sets the Site URL, and adds the redirect URLs listed in the script's `REDIRECTS` array while keeping existing ones. To allow a new URL (for example a deployed frontend), add it to `REDIRECTS` and re-run. Keep the client JSON out of the repo; `client_secret*.json` is already in `.gitignore`.
- `configure-auth.sh redirects`: adds the `REDIRECTS` list to the allowed redirect URLs, keeping existing ones. No client JSON needed.
- `configure-auth.sh hook-off`: turns the hook off (rollback).

### Frontend connection (`static-site/`)

The team's frontend connects through `static-site/inspection-backend.mjs` (browser module) and `static-site/inspection-backend-core.mjs` (pure rules, unit-tested by `node static-site/test-inspection-backend.mjs`). Teammates follow `static-site/BACKEND-GUIDE.md`; `static-site/backend-check.html` is a 2-minute self-test. If a function signature or error changes here, update `inspection-backend-core.mjs` and its test in the same PR.

### Roll back

1. Turn the hook off first: `supabase/scripts/configure-auth.sh hook-off`.
2. Confirm with the team that every saved inspection can be thrown away.
3. Run `rollback/inspection_down.sql` by hand (MCP `execute_sql` or `psql`). It drops the hook function, both functions, both tables and the `private` schema in one transaction.
4. Google sign-in has no script mode. To turn it off, set `external_google_enabled` to `false` in the Auth provider settings.
5. Record the rollback in this file. The script does not touch Supabase's migration history, so re-applying means a new migration file, not an edit to the old ones.

## Verification status

| Check | Status |
|---|---|
| Rule tests (`tests/inspection_rules.sql`) | Passed 2026-10-27 through the Supabase MCP. |
| Security and performance advisors | Run after the last migration. The findings are listed below. |
| Types generated from the live schema | Done 2026-10-27, after `20261028024605`. |
| Sign-up hook turned on | Done 2026-10-27. Email sign-up path verified through the API (403, no user created). Google path with a non-UMBC account: not yet tried in a browser. |
| Browser walk-through with two UMBC accounts (save, reload, retry, second account sees nothing) | Not recorded in this file. Add the result here when done. |
| Frontend teammate confirms `CONTRACT.md` is enough to integrate | Not recorded. |

## Advisor findings

Run after the last migration. These are the accepted or known items.

**Security**

| Finding | Where | Status |
|---|---|---|
| WARN `authenticated_security_definer_function_executable` | `public.create_inspection` | **Intentional.** It is the only write path. It does every check inside itself: caller identity, UMBC account, input rules, allowed source, ownership of the draft ID. Signed-out callers cannot run it. |
| WARN `auth_leaked_password_protection` | Auth setting | Already present before our work. It applies only to the email + password fallback. Leaked-password protection may require the Pro plan. Not enabled. |

**Performance**

| Finding | Where | Status |
|---|---|---|
| INFO `unindexed_foreign_keys` | `inspections.asset_id` | **Accepted.** About 121 features, and assets are never deleted. The history index leads with `inspector_id`, which is what the queries filter on. |

## Security notes

- **Leaked session (pending):** a session leaked into a chat log during setup on 2026-10-27 (session `eab71ab3-…`). Revoke it before the demo; for example, sign that user out of all sessions (`supabase.auth.signOut({ scope: 'global' })`). Status: pending.
- The publishable key and project URL are public and committed. The service role key, Google client secret, Management API token and any sign-in token must never be committed. `.gitignore` covers `client_secret*.json` and `.env*` (except `.env.example`).
- `hd=umbc.edu` in the sign-in call only filters the Google account picker. The real limits are the hook (when on) and `private.is_umbc_user()` in the database.

## Known gaps and open questions

- **Snapshot not verified:** `displayed_snapshot` is stored as the browser sent it and is not checked against ArcGIS (spec line 53). Fixing it needs server code that can read the GIS layer. A server handler could later call the same `create_inspection`.
- **Answered 2026-10-28:** WebMap `d59cb5cc77914e6c96631b856c667129` does not show item `cc6a7a27…`. Its BMP layer is `UMBC_BMP_ArcGIS_Import` (item `5d70e438bb6045d6b3af05aee061e3cd`, layer 0), shared only with the "Stormwater ArcGIS Map" group. Migration `20261028070220_bmp_source_import_layer` switched to it. Evidence: `docs/research/2026-10-27-wire-backend-into-static-site.md`, "Addendum 2026-10-28".
- **Open question:** whether object IDs survive a re-import of `UMBC_BMP_ArcGIS_Import`. Records point at object IDs, so a re-import could attach old records to the wrong BMP. Check before any re-import.
- **Answered 2026-10-28:** the `static-site/` dashboard uses Supabase through the drop-in (spec `docs/spec/v1.md`).
- **Open question:** accounts outside `@umbc.edu` (for example a county reviewer) are locked out by design.
- Google sign-in with a non-UMBC account has not been tried in a browser yet. The email sign-up path was verified through the API on 2026-10-27.
