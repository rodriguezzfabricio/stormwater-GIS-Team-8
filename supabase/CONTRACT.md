# Back-end contract for the BMP inspection frontend

Contract-Version: 2
Date: 2026-10-28
Latest migration: `20261028120000_bmp_source_import_layer` (written, not yet applied; the file is renamed to the version Supabase records when it is applied)
Types: [`database.types.ts`](./database.types.ts) (carries the same `Contract-Version`; if the two differ, ask for a fresh copy)

> **Building in `static-site/`? You don't need this file.** The dashboard is already wired to the back end through the drop-in module `static-site/inspection-backend.mjs`; [`static-site/BACKEND-GUIDE.md`](../static-site/BACKEND-GUIDE.md) explains how it works and how to test it. This contract is the low-level reference behind it.

> **What changed in version 2 (2026-10-28):**
>
> - The accepted BMP layer is now `UMBC_BMP_ArcGIS_Import`: item `5d70e438bb6045d6b3af05aee061e3cd`, layer `0`, the layer the dashboard's WebMap actually shows. Item `cc6a7a27c267435c8f7ed95a59eb5f24` layer `3` is no longer accepted (sections 2 and 3).
> - `my_inspections` now returns `unknown_source` for any other item or layer, like `create_inspection` (sections 5 and 7). Inspections saved against the old layer are kept in the database but no call returns them.
> - The drop-in saves `displayed_snapshot` as `{ "arcgis": …, "form": … }` (section 9).

This file is the whole agreement between the back end and your app. You do not need to read any SQL.

You get:

- Sign-in with Google, limited to `@umbc.edu` accounts.
- Two functions you call with supabase-js v2: `create_inspection` (save) and `my_inspections` (history for one map feature).
- A fixed set of error codes.

A working example of every call is in [`stormwater/auth-test.js`](../stormwater/auth-test.js). Run `stormwater/start-local.sh` and open `http://localhost:5500/auth-test.html` to see it work.

> **Differs from the approved spec** (`app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md`)
>
> - **Sign-in (spec line 25):** Google sign-in for `@umbc.edu` accounts, not only pre-made email + password accounts. Email + password stays on as a fallback for teammates.
> - **No server handlers (spec line 17):** the browser calls database functions directly. All checks run inside the database.
> - **Snapshot is not verified (spec line 53):** `displayed_snapshot` is stored exactly as your app sends it. The back end does not check it against ArcGIS.
> - **Feature rows (spec line 55):** a feature gets a database row the first time it is inspected. Only item `5d70e438bb6045d6b3af05aee061e3cd`, layer 0 is accepted.
> - **Outcome is `pass` or `fail` only.** This matches the spec. The dashboard's form offers only Pass and Fail.
> - **Snapshot contents (spec line 43):** the drop-in saves every attribute of the feature plus five editable form fields, not only the displayed subset (section 9).

---

## 1. Setup

### Environment variables

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fsrsldketzmcjyvjueki.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_CHlreM6iIfKeSCvdjVuBJw_-M0hGv8J` |

Both values are public by design and safe to commit. Row rules and function checks protect the data, not the key. Never put a service role key, a Google client secret or a sign-in token in frontend code or in the repo.

Supabase project ref: `fsrsldketzmcjyvjueki`.

### Client

```ts
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../supabase/database.types' // copy the file into your app; adjust the path

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)
```

In a Next.js App Router app, create the client with the `@supabase/ssr` helpers instead, as Supabase's guide shows: <https://supabase.com/docs/guides/auth/server-side/nextjs>. The `.rpc(...)` calls below are the same either way. The test page pins supabase-js 2.117.3.

Copy [`database.types.ts`](./database.types.ts) into your app. Ignore `hook_restrict_umbc_signup` in it: your app cannot call that function.

### Allowed redirect URLs

| Kind | Value |
|---|---|
| Site URL | `http://localhost:3000` |
| Allowed redirect | `http://localhost:3000/**` |
| Allowed redirect | `http://localhost:5500/auth-test.html` (the back end's test page) |
| Allowed redirect | `http://localhost:5500/**` (the `static-site/` pages) |

Any path under `http://localhost:3000/` works. If your `redirectTo` is not on the list, Supabase sends the user to the Site URL instead. A deployed URL is not on the list yet; ask rodriguezzfabricio to add it.

### Sign in with Google

```ts
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`, // any path under http://localhost:3000/
    queryParams: { hd: 'umbc.edu' },                       // account-picker hint only, not security
  },
})
// On success the browser leaves for Google and returns to redirectTo with ?code=...
// `error` is set only when sign-in could not start.
```

`hd=umbc.edu` only narrows the Google account picker. The real checks are in Supabase and the database. In Next.js, the callback route that exchanges `?code=` for a session is described in the guide linked above.

Session helpers:

```ts
const { data: { session } } = await supabase.auth.getSession()

supabase.auth.onAuthStateChange((_event, session) => {
  // Update your UI state here.
  // Do not await another Supabase call inside this callback; supabase-js can deadlock.
})

await supabase.auth.signOut()
```

### Who can use it

| Account | Result |
|---|---|
| Confirmed `@umbc.edu` Google account | Can save and read their own inspections. |
| Any other account, including accounts created before the sign-up block existed | `create_inspection` fails with `forbidden_domain`. `my_inspections` returns `[]` (it does not raise `forbidden_domain`). |

The sign-up block (a Supabase Auth hook that stops non-UMBC accounts from being created at all) is **on** since 2026-10-27. A non-UMBC sign-up gets HTTP 403 with the message "Only @umbc.edu accounts can sign up." and no user is created (verified for email sign-up). With Google, picking a non-UMBC account should send the user back to your redirect URL with `error` and `error_description` in the URL. Show a short message and do not parse the text. The Google path has not been tried in a browser yet.

---

## 2. Glossary

| Name | Type | Example | Meaning |
|---|---|---|---|
| `source_item` | string | `"5d70e438bb6045d6b3af05aee061e3cd"` | ArcGIS item ID of the BMP feature service (`UMBC_BMP_ArcGIS_Import`). 32 lowercase hex characters, not a URL. Must match exactly. |
| `layer_id` | number | `0` | Layer number of `UMBC_BMP_ArcGIS_Import` inside that item. Always `0`. |
| `object_id` | string | `"42"` | The feature's ArcGIS object ID, as digits in a string. No leading zero, 1 to 19 digits. The field name is the layer's `objectIdField`; read it at runtime, it has not been written down for this layer. |
| `draft_id` | string (UUID) | `"0b6f0a3e-6a5e-4c1e-9f55-0c1b8d2f7a11"` | You make it with `crypto.randomUUID()`. It becomes the inspection's record ID and is the retry key. See section 6. |
| `inspection_type` | string | `"Routine"` | The dropdown label as text. 1 to 120 characters. |
| `outcome` | string | `"pass"` | `"pass"` or `"fail"`. Send lowercase. |
| `notes` | string or empty | `"Outlet clear, no standing water."` | Optional, up to 4,000 characters. Blank is stored as null. |
| `displayed_snapshot` | JSON object | `{ "arcgis": { … }, "form": { … } }` | The feature's attributes and the form fields when the user saved. See section 9. |
| `id` (in results) | string (UUID) | same as `draft_id` | The saved record's ID. |
| `asset_id` (in results) | string (UUID) | `"5d1c7e52-…"` | The database's own ID for the feature. You never send it. |
| `submitted_at` | string (ISO 8601) | `"2026-10-28T02:51:07.482913+00:00"` | Server time of the save. Never sent by you. |
| `replayed` | boolean | `false` | `true` when the database recognised a retry and returned the earlier record. |

You never send who the inspector is. The database takes it from the sign-in token.

---

## 3. Reading the feature from ArcGIS

Three of the arguments come from the selected map feature.

```ts
// `layer` is the BMP FeatureLayer. `graphic` is the selected feature (hit test or click).
const feature = {
  p_source_item: layer.portalItem!.id,                          // "5d70e438bb6045d6b3af05aee061e3cd"
  p_layer_id: layer.layerId,                                    // 0  (not layer.id, which is an SDK-internal string)
  p_object_id: String(graphic.attributes[layer.objectIdField]), // "42"
}
```

- Make sure the object ID field is in the query's `outFields`. If it is missing, `String(undefined)` gives `"undefined"` and the save fails with `invalid_input:object_id`.
- Check these three values once in development before wiring the Save button. Expected: item `5d70e438bb6045d6b3af05aee061e3cd`, layer `0`, and an object ID from the layer's `objectIdField`.
- The WebMap in `stormwater/arcgis-config.js` (`d59cb5cc77914e6c96631b856c667129`) shows this layer (checked in the browser on 2026-10-28; see `docs/research/2026-10-27-wire-backend-into-static-site.md`, "Addendum 2026-10-28"). If `layer.portalItem` is null or has another ID in your app, every save fails with `unknown_source`. Tell rodriguezzfabricio.
- **Open question:** whether object IDs survive a re-import of `UMBC_BMP_ArcGIS_Import`. Records point at object IDs, so check before any re-import.

Attributes such as `ms4_bmp_id` can repeat across features. Never use an attribute to identify a feature; use item + layer + object ID.

---

## 4. `create_inspection`: save an inspection

The only way to save. It is one call, and the database confirms it or returns an error.

### Arguments

| Argument | Required | Rule |
|---|---|---|
| `p_draft_id` | yes | UUID. |
| `p_source_item` | yes | Exactly `5d70e438bb6045d6b3af05aee061e3cd`. Not trimmed or lowercased by the server. |
| `p_layer_id` | yes | Exactly `3`, sent as a number. |
| `p_object_id` | yes | Digits only, no leading zero, 1 to 19 digits. |
| `p_inspection_type` | yes | 1 to 120 characters after trimming. |
| `p_outcome` | yes | `pass` or `fail`. |
| `p_notes` | no | Up to 4,000 characters after trimming. To send none, omit it or send an empty string. |
| `p_displayed_snapshot` | no | JSON object (not an array), about 16 KB at most. Default `{}`. |

The generated type for `p_notes` is `string | undefined`, so omit it rather than passing `null`.

### What the server cleans up

- Trims spaces, tabs and line breaks around `inspection_type`, `outcome`, `notes` and `object_id`.
- Lowercases `outcome`, so `"Pass"` is accepted. Send lowercase anyway.
- Turns blank `notes` into null.
- Treats a missing snapshot as `{}`.

### Order of checks

If several fields are wrong, you get only the first error. Checks run in this order: signed in, UMBC account, `draft_id`, `inspection_type`, `outcome`, `notes`, `displayed_snapshot`, `object_id`, then `unknown_source`.

### Call

```ts
import type { Database } from '../supabase/database.types'

type SaveArgs = Database['public']['Functions']['create_inspection']['Args']

export type SaveResult =
  | { ok: true; row: { id: string; asset_id: string; submitted_at: string; replayed: boolean } }
  | { ok: false; error: { code?: string; message?: string; details?: string | null } | null; status: number }

export async function saveInspection(args: SaveArgs): Promise<SaveResult> {
  try {
    const { data, error, status } = await supabase.rpc('create_inspection', args)
    if (error) return { ok: false, error, status }
    const row = data?.[0] // RETURNS TABLE: an array holding one row
    if (!row) return { ok: false, error: null, status } // no confirmation, so treat as not saved
    return { ok: true, row }
  } catch {
    return { ok: false, error: null, status: 0 } // network failure that threw
  }
}
```

Show success only when `ok` is true. The row is committed by then.

### Response: new save

`data` is an array with one row.

```json
[
  {
    "id": "0b6f0a3e-6a5e-4c1e-9f55-0c1b8d2f7a11",
    "asset_id": "5d1c7e52-3c0e-4a4b-8f0a-2f1f6a9b7c33",
    "submitted_at": "2026-10-28T02:51:07.482913+00:00",
    "replayed": false
  }
]
```

### Response: replay (retry of a save that already went through)

Same draft ID, same feature, same type, outcome and notes (after cleanup), same user. You get the **original** row, including the original `submitted_at`. No second record exists. Treat it as a success.

```json
[
  {
    "id": "0b6f0a3e-6a5e-4c1e-9f55-0c1b8d2f7a11",
    "asset_id": "5d1c7e52-3c0e-4a4b-8f0a-2f1f6a9b7c33",
    "submitted_at": "2026-10-28T02:51:07.482913+00:00",
    "replayed": true
  }
]
```

The snapshot is not compared on a retry. A re-rendered map can give slightly different attribute values for the same feature, and that must not count as a conflict.

### Error: draft ID reused with different content

Also returned if the draft ID belongs to another user. The error is the same either way. In supabase-js this arrives as `error`, with `data` null:

```json
{
  "code": "23505",
  "details": "This draft ID was already used for a different inspection. Start a new draft.",
  "hint": null,
  "message": "draft_conflict"
}
```

### Error: invalid field

The part after the colon names the field: `draft_id`, `object_id`, `inspection_type`, `outcome`, `notes` or `displayed_snapshot`.

```json
{
  "code": "P0001",
  "details": null,
  "hint": null,
  "message": "invalid_input:outcome"
}
```

### Error: not a UMBC account

```json
{
  "code": "42501",
  "details": "Only confirmed @umbc.edu accounts can save inspections.",
  "hint": null,
  "message": "forbidden_domain"
}
```

---

## 5. `my_inspections`: the signed-in user's history for one feature

Returns only the caller's own inspections for the one feature, newest first (`submitted_at` descending, then `id` descending), at most 50. There is no call for "all my inspections" and no paging.

| Argument | Required | Rule |
|---|---|---|
| `p_source_item` | yes | Same value as above. Any other value returns `unknown_source`. |
| `p_layer_id` | yes | Same value as above. Any other value returns `unknown_source`. |
| `p_object_id` | yes | The feature's object ID as a string. |
| `p_limit` | no | Default 50. Clamped to 1 to 50. |

```ts
type HistoryRow = Omit<
  Database['public']['Functions']['my_inspections']['Returns'][number],
  'notes'
> & { notes: string | null } // the generated type says string; the value can be null

export async function loadHistory(feature: {
  p_source_item: string
  p_layer_id: number
  p_object_id: string
}) {
  const { data, error, status } = await supabase.rpc('my_inspections', { ...feature, p_limit: 50 })
  if (error) return { ok: false as const, error, status }
  return { ok: true as const, rows: (data ?? []) as HistoryRow[] }
}
```

Treat `notes` as nullable. The generated type is wrong on this one field (a generator quirk). Keep the override above if you copy in a regenerated types file.

For the "Last inspection" line in the facility panel, call it with `p_limit: 1`. It shows the signed-in inspector's own last inspection, not anyone else's.

### Response

```json
[
  {
    "id": "9c2d41aa-1b0e-4e0a-8a3a-5b7e6f0d2c10",
    "asset_id": "5d1c7e52-3c0e-4a4b-8f0a-2f1f6a9b7c33",
    "submitted_at": "2026-10-28T03:12:44.101532+00:00",
    "inspection_type": "Follow-up",
    "outcome": "fail",
    "notes": null,
    "displayed_snapshot": { "arcgis": { "bmp_name": "…", "bmp_type": "…" }, "form": { "condition_status": "…" } }
  },
  {
    "id": "0b6f0a3e-6a5e-4c1e-9f55-0c1b8d2f7a11",
    "asset_id": "5d1c7e52-3c0e-4a4b-8f0a-2f1f6a9b7c33",
    "submitted_at": "2026-10-28T02:51:07.482913+00:00",
    "inspection_type": "Routine",
    "outcome": "pass",
    "notes": "Outlet clear, no standing water.",
    "displayed_snapshot": { "arcgis": { "bmp_name": "…", "bmp_type": "…" }, "form": { "condition_status": "…" } }
  }
]
```

- A feature that has never been inspected, or one inspected only by other people, returns `[]`. That is not an error.
- A non-UMBC account also gets `[]`.
- A signed-out caller gets the "signed out" error in the table below.
- Any item or layer other than the accepted one gets `unknown_source`. Inspections saved against the old layer (item `cc6a7a27…`, layer 3) stay in the database but are never returned.
- Rows from other users never appear.

---

## 6. Draft ID lifecycle

The draft ID is what makes a retry safe. The database cannot enforce this part; your app must.

| Moment | Rule |
|---|---|
| **Create** | Make `crypto.randomUUID()` when the user opens "Start inspection". |
| **Keep** | Use the same draft ID for every attempt on that inspection: retries, timeouts and re-sign-ins. |
| **Replace** | Make a new one only after a confirmed save, after the user discards the draft, or when the user switches to a different feature. |

Rules for Retry:

- Keep the exact `args` object from the first attempt and resend that same object. Do not rebuild it from the form.
- If the first attempt reached the database, Retry returns `replayed: true` with the original record. If it did not, Retry saves it. Either way the user ends up with exactly one record.
- If the user edits the form after a "not confirmed" result, do not resend the same draft ID with new values. If the first attempt did arrive, that returns `draft_conflict`. Either offer Retry with the old values, or start a new draft. Before starting a new draft, call `my_inspections` to check that the first attempt was not saved.
- Resending a draft ID after a confirmed save is harmless (`replayed: true`).
- The draft ID lives in tab memory. A page reload loses it. The spec says not to claim drafts survive a refresh.

```ts
type Feature = { p_source_item: string; p_layer_id: number; p_object_id: string }
// unconfirmed: the last attempt got no reply (network/unknown), so it may already be saved.
type Draft = { id: string; feature: Feature; args: SaveArgs | null; unconfirmed: boolean }

let draft: Draft | null = null

// "Start inspection" for the selected feature.
function startDraft(feature: Feature) {
  draft = { id: crypto.randomUUID(), feature, args: null, unconfirmed: false }
}

async function send(d: Draft, args: SaveArgs) {
  const result = await saveInspection(args)
  if (result.ok) {
    draft = null // confirmed: the next "Start inspection" makes a new draft ID
    return result
  }
  const { kind } = classify(result.error, result.status)
  d.unconfirmed = kind === 'network' || kind === 'unknown'
  return result
}

// Save button. Builds the request from the form, so a fixed invalid_input field is picked up.
// While the last attempt is unconfirmed, lock the form and offer only Retry (or a new draft).
async function onSave(form: { type: string; outcome: 'pass' | 'fail'; notes: string; snapshot: SaveArgs['p_displayed_snapshot'] }) {
  if (!draft || draft.unconfirmed) return
  draft.args = {
    ...draft.feature,
    p_draft_id: draft.id,
    p_inspection_type: form.type,
    p_outcome: form.outcome,
    p_notes: form.notes,
    p_displayed_snapshot: form.snapshot,
  }
  return send(draft, draft.args)
}

// Retry button: the exact same object, same draft ID.
async function onRetry() {
  if (draft?.args) return send(draft, draft.args)
}
```

---

## 7. Errors

supabase-js does not throw for API errors. It returns `{ data, error, status }`. Branch on `error.code`, then on how `error.message` starts. `error.details` holds a plain sentence for `forbidden_domain` and `draft_conflict`. The HTTP status is `status` on the result, not inside `error`.

| Situation | `error.code` | `status` | `error.message` starts with | What the UI does |
|---|---|---|---|---|
| Signed out | `42501` | 401 | `permission denied` (full text: `permission denied for function create_inspection`) | Ask the user to sign in. Keep the draft. |
| No user ID in the token | `42501` | 403 | `not_authenticated` | Same as signed out. Only reachable with a token that has no user ID, so you should rarely see it. |
| Session expired | `PGRST301` or `PGRST303` | 401 | `JWT expired` | Sign in again. Keep the draft. Retry with the same draft ID. supabase-js usually refreshes the session first, so this is rare. |
| Not a confirmed UMBC account | `42501` | 403 | `forbidden_domain` | Show "UMBC accounts only". |
| Bad field value | `P0001` | 400 | `invalid_input:<field>` | Highlight that field. Keep all inputs. `draft_id` and `displayed_snapshot` have no input; treat those two as an app bug and show a general error. |
| Wrong item or layer (`create_inspection` and `my_inspections`) | `P0001` | 400 | `unknown_source` | Ask the user to re-select the feature. If it happens for every feature, check the three values in section 3. |
| Draft ID reused with different content, or someone else's draft ID | `23505` | 409 | `draft_conflict` | Start a new inspection with a new draft ID. |
| Network failure or server error | none or empty | 0, or 5xx | none | Say "not confirmed" (it may have been saved). Offer Retry with the **same** draft ID. |

`my_inspections` can return only the signed-out, expired-session and `unknown_source` rows above. It does not return `forbidden_domain`.

Other errors you may meet while building, which our tests do not exercise: `22P02` (HTTP 400) for a malformed UUID or a non-integer `p_layer_id`, and `PGRST202` (HTTP 404) when an argument name is misspelled or missing. These mean a bug in the call, not a user problem.

42501 and P0001 each cover several situations, so match the message start as well as the code:

```ts
type Kind =
  | 'signed_out' | 'session_expired' | 'forbidden_domain' | 'invalid_input'
  | 'unknown_source' | 'draft_conflict' | 'network' | 'unknown'

export function classify(
  error: { code?: string; message?: string } | null,
  status = 0,
): { kind: Kind; field?: string } {
  const code = error?.code ?? ''
  const message = (error?.message ?? '').trim()

  if (message.startsWith('invalid_input:')) return { kind: 'invalid_input', field: message.slice('invalid_input:'.length) }
  if (message.startsWith('forbidden_domain')) return { kind: 'forbidden_domain' }
  if (message.startsWith('unknown_source')) return { kind: 'unknown_source' }
  if (message.startsWith('draft_conflict')) return { kind: 'draft_conflict' }
  if (message.startsWith('not_authenticated')) return { kind: 'signed_out' }
  if (code === 'PGRST301' || code === 'PGRST303' || message.startsWith('JWT expired')) return { kind: 'session_expired' }
  if (code === '42501' && message.startsWith('permission denied')) return { kind: 'signed_out' }
  if (!code || status === 0 || status >= 500) return { kind: 'network' }
  return { kind: 'unknown' }
}
```

`classifyError` in [`stormwater/auth-test.js`](../stormwater/auth-test.js) does the same thing and has a UI message for each kind.

For `network` and `unknown`, say "not confirmed", not "not saved". The request may have reached the database.

---

## 8. HTML form to function arguments

Source: the inspection form in the original prototype, `stormwater/index.html`. The field names in the table (`Facility_T`, `MDE_SF_Num` and so on) belong to the old layer. The `static-site/` dashboard is already wired; see `static-site/BACKEND-GUIDE.md`.

| `index.html` field | What to do | Sent as |
|---|---|---|
| (no field; the selected map feature) | Read it from the layer (section 3). | `p_source_item`, `p_layer_id`, `p_object_id` |
| (no field; made by your app) | Section 6. | `p_draft_id` |
| Inspection type (`inspection_type` select: Routine, Follow-up, Post-storm, Other) | Required. Send the option text as it is. | `p_inspection_type` |
| Inspection result (`inspection_result` select) | Required. Delete the "Needs verification" option. Map Pass to `pass` and Fail to `fail`. | `p_outcome` |
| Observations (`observations` textarea) | Optional. Send the text as it is. | `p_notes` |
| Asset tag (`asset_tag` input) | Remove the input. Show `MDE_SF_Num` and `UMBC_PRF` read-only from the selected feature, labelled with those field names. Do not call either one an "asset tag" until someone confirms what it means (spec line 43). They repeat across features, so they cannot identify a feature. | Inside `p_displayed_snapshot` |
| BMP type (`bmp_type` select) | Remove the select. Show `Facility_T` read-only. The spec says to confirm its metadata before treating it as a facility type. | Inside `p_displayed_snapshot` |
| Campus location (`location` input) | Remove the input. No field is confirmed as a location. Show `Facility_N` read-only if you want something there. Do not invent an address. | Inside `p_displayed_snapshot` |
| Supporting photos (`photos` file input) | Remove. Photos are out of scope. | Not sent |

---

## 9. Snapshot shape

`displayed_snapshot` records what the inspector saw and entered when they pressed Save. The drop-in (`static-site/inspection-backend-core.mjs`, `snapshotOf`) sends this shape:

```ts
const displayed_snapshot = {
  arcgis: { ...graphic.attributes },   // every attribute of the feature, raw ArcGIS field names, JSON-safe
  form: {                              // the five editable form fields as shown at Save, each at most 500 characters
    verified_campus_location: "…",
    nearby_address: "…",
    address_kind: "…",
    condition_status: "…",
    last_inspection: "…",
  },
}
```

Example stored value (made-up values):

```json
{ "arcgis": { "bmp_name": "Example name", "bmp_type": "Example type", "ms4_bmp_id": null },
  "form": { "verified_campus_location": "North side of lot 9", "nearby_address": "", "address_kind": "", "condition_status": "Good", "last_inspection": "" } }
```

- If the whole object would pass about 15,000 bytes, `arcgis` keeps only the identifying fields `bmp_name`, `bmp_sequence`, `ms4_bmp_id` and `bmp_type`.
- This saves more than the spec's displayed subset (spec line 43): every attribute plus the form section.
- Use `null` for a missing attribute. `undefined` is dropped when the object becomes JSON, so the key would be missing.
- Convert dates and other non-JSON values to strings or numbers first. Do not send geometry.
- It must be a JSON object, not an array. The limit is about 16 KB. Postgres measures its own rendering of the JSON, which is slightly longer than `JSON.stringify` output.
- Rows saved by other callers, such as `stormwater/auth-test.html`, have no `form` key; the dashboard shows "No extra fields saved" for them.
- **It is not verified.** Nothing checks it against ArcGIS. This is a known gap against spec line 53. Do not describe it as verified in the UI.

---

## 10. Before you wire the Save button

1. Install the environment variables and copy `database.types.ts` into your app.
2. Sign in with Google using a `@umbc.edu` account, and see a session.
3. Print the three feature values for one selected BMP (section 3) and compare them with the glossary.
4. Call `create_inspection` once. Expect a one-element array with `replayed: false`.
5. Send the same object again. Expect `replayed: true` and the same `submitted_at`.
6. Call `my_inspections` for that feature. Expect one row, with `notes` possibly null.
7. Reload the page and call it again. The row should still be there.

## What this back end does not do

- No editing or deleting of saved inspections, for anyone.
- No list of all of a user's inspections across features, and no paging.
- No photos, no "Needs verification" outcome, no reviewer or admin view of other people's records.
- No check of `displayed_snapshot` against ArcGIS.
- No change to GIS data or ArcGIS sharing.

## Changing this contract

`Contract-Version` goes up when a function signature, an error code or message start, or a returned column changes. The same number goes in the header of `database.types.ts`. Back-end details are in [`README.md`](./README.md); the full design is in [`docs/designs/inspection-database-and-umbc-sign-in.md`](../docs/designs/inspection-database-and-umbc-sign-in.md).
