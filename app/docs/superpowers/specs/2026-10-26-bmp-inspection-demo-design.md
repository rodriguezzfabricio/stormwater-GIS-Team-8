# BMP inspection demo — approved scope specification

Status: scope approved by Fabricio; detailed specification awaiting review.

## Outcome and boundaries

An authenticated inspector selects a real mapped UMBC BMP feature, records an inspection, and retrieves it after reloading. This is an online Sprint 2 prototype. The completed-feature claim requires real backend persistence and correct feature association.

Included: 2D campus map, polygon selection, actual feature attributes, inspection form, authenticated save, own-inspection history/detail, loading and error states. Excluded: photos, email, PDF export, administrative workflows, cross-inspector history, offline sync, GIS edits, and 3D features.

The repo now has the static prototype in stormwater/ and the Supabase back end in supabase/ (migrations, tests, contract); the Next.js app in app/ is still not built. There is no existing application to preserve. Prior reconnaissance and Astra's planning document in the parent workspace provide the evidence for this design.

## Architecture and responsibilities

Use Next.js with TypeScript and the App Router. Use a client-only ArcGIS JavaScript SDK map component; isolate map initialization and cleanup from form state. Select compatible dependency versions during implementation and commit the lockfile. Do not infer that a browser session in the existing ArcGIS viewer authorizes this application.

Use Supabase Auth for a provisioned demo inspector and PostgreSQL for app-owned data. The browser receives only the public application configuration. Server-side request handlers validate the Supabase session and use that user's authorization context, with database row-level security enforced. No privileged database key is needed in the browser or normal inspection path.

The GIS adapter supplies normalized source references and attributes. The map handles rendering and selection. The inspection module handles draft state and validation. The persistence module creates records and retrieves history. These modules share typed contracts rather than accessing each other's internal state.

Run locally first. Vercel hosting is optional after local acceptance passes. No paid services or source-sharing changes are part of this scope.

## Screens and interactions

1. Login: a provisioned inspector signs in with email and password. No public registration or role administration is required. On expiration, preserve the unsaved draft in current tab memory and ask the inspector to sign in again. Do not claim drafts survive refresh.
2. Map and details: a 2D campus map shows real BMP polygons. Selecting one highlights it and opens its attributes, source reference, Start inspection, and My inspections. Missing data displays Not provided. Selection failures show an actionable error. A reset-view control returns to campus extent.
3. Form: the selected feature summary remains visible. Require a trimmed inspection type of 1–120 characters and an explicit Pass or Fail choice; neither outcome is preselected. Notes are optional, up to 4,000 characters. These are prototype fields, not a stakeholder-approved regulatory checklist. Changing feature or cancelling a nonempty draft requires discard confirmation. While saving, lock feature changes and duplicate submission.
4. Save result: show success only after the backend confirms persistence. Show record ID, source feature, server timestamp, and inspector identity. A failed or ambiguous save preserves inputs and offers retry with the same draft ID. Starting another inspection generates a new ID.
5. History and detail: fetch the signed-in inspector's records for the selected feature, newest first, with a deterministic ID tie-breaker. Show an empty state when appropriate. Detail displays the saved snapshot, outcome, type, notes, and submission information. Reload must fetch from the backend rather than presenting stale in-memory success.

Use a map plus side panel on wide screens and stacked/full-width panel behavior on narrow screens. Controls must work with keyboard navigation and have readable labels, visible focus, and comfortable touch targets. Test responsive layout; claim real iPad compatibility only after testing on a device.

## GIS access and identity

Source item: cc6a7a27c267435c8f7ed95a59eb5f24.

Source layer: https://services1.arcgis.com/diQbEFavWah0WAHd/arcgis/rest/services/UMBC_SWM_Tracking_test/FeatureServer/3

Reconnaissance observed polygon layer BMP_Database, 121 feature rows, and OBJECTID_1 as its object-ID field. Confirm these through the application's authorized access path before integration. The count does not establish 121 distinct real-world facilities. MDE_SF_Num and UMBC_PRF repeat and must never be used alone as keys.

Use source item + layer + object ID as a provisional unique reference, mapped to an application UUID. The application does not reconcile source republishing or recycled object IDs. An authorized snapshot, if used, must have an explicit dataset version and visible date; it must not silently share the live dataset namespace.

Map attributes into neutral, verified labels. Facility_T can supply facility type after confirming metadata and sample values. Confirm name and reference-field semantics rather than inventing an official tag or address. Save only the displayed, verified attribute subset, not entire unreviewed source records.

GIS data remains read-only. If organizational authorization is required, use an approved application authorization flow. Do not extract another browser's tokens, change source permissions, or publish private data to unblock development. ArcGIS identity and Supabase inspector identity are separate authorization concerns.

## Data model and write contract

Asset reference: UUID primary key; source item; layer ID; source object ID stored in a stable canonical representation; dataset namespace/version; unique constraint across those source identifiers. Assets contain no inspection outcome.

Inspection: client-generated UUID primary key serving as the draft retry key; asset UUID foreign key; inspector UUID from authenticated identity; database-generated submission timestamp; inspection type; outcome constrained to pass/fail; optional notes; snapshot of verified displayed source attributes and identifiers. Records are append-only in this increment; expose no update/delete operation.

Create input contains the draft UUID, selected source reference, inspection type, outcome, and notes. The write handler checks authentication and validates lengths, outcome, and the selected reference. Resolve the source reference and snapshot against the authorized GIS adapter or approved server-side dataset; do not accept client labels as authoritative. Create or resolve the app asset reference and insert the inspection atomically through a narrowly scoped database function or equivalent transaction.

The authenticated user ID is authoritative, never an editable name field. Database policies permit an inspector to insert only their own inspections and read only their own inspections. Asset reference lookup must support the selected authorized dataset without giving clients unrestricted arbitrary asset creation. Restrict write functions and configure their search path explicitly if elevated execution is necessary.

On a repeated draft UUID, retrieve the existing record only if it belongs to that inspector. Return it as the same success only when its submitted content and feature match; otherwise return a conflict. Do not overwrite an existing inspection. This handles a lost response without creating duplicates.

History requests filter by both selected app asset and authenticated inspector. Database policies remain effective even if a caller bypasses the UI. Server errors return useful user messages without credentials or raw sensitive service responses.

## Failure behavior

Treat basemap failure, feature-layer failure, login failure, validation failure, and persistence failure separately. Do not show an empty successful map when the layer request failed. Preserve form state after save failures, including expired sessions. A stale source reference fails clearly rather than saving against a guessed asset. Network recovery uses explicit retry; automatic write retries cannot generate a new draft UUID.

## Build sequence and scope gates

First investigate service access and backend readiness, capped at 90 working minutes: repository/runtime setup, legitimate GIS query and polygon selection, authenticated database create/read, and shared typed contracts. This is an investigation budget, not a provisioning guarantee.

Next build the smallest working path from selection through a confirmed save and fresh history fetch. Add validation, session/error handling, duplicate protection, and responsive behavior before optional convenience features. Finish with acceptance checks, launch instructions, and a recording script for the same build.

If source access blocks progress, an authorized, dated snapshot is an acceptable explicitly labeled fallback. Synthetic fixtures may support development and tests but cannot be represented as integrated campus data. If no authorized data path exists, report that integration blocker. If persistence/authentication cannot be made functional, deliver only the explorer and explicitly unsaved form; do not mark saved inspections complete. A local verified build is sufficient if deployment is blocked.

## Acceptance evidence

Use an isolated demo/test account and record baseline counts; do not delete existing records to create a clean demonstration.

- Select two distinct features, preferably sharing a permit/reference value. Save two distinguishable inspections for A and one for B; verify increments of two and one with distinct record IDs.
- Refresh or use a fresh authenticated tab. Retrieve the same records from the backend and confirm feature isolation and preserved snapshots.
- Attempt missing/invalid values through the UI and direct write path. Verify zero new records. A repeated draft request creates only one inspection; conflicting reuse fails.
- Simulate a failed/ambiguous save and an expired session. Verify no false success and retained inputs. Test that signed-out writes and another user's record reads are denied.
- Run type checking, production build, focused database/integration tests, and a browser walkthrough including narrow layout and keyboard operation. Document untested device or service behavior explicitly.

## End product

Deliver committed application source, schema/policy setup files, an environment-variable template containing no secrets, reproducible setup and launch instructions, acceptance results, and a six-minute demo script. Applied database changes or deployment require an identified authorized target; authoring setup files alone is not proof that infrastructure exists. The presentation must distinguish actual implemented features from remaining requirements.

## Self-review

Reviewed for placeholders, contradictory access claims, unique-feature identity, retry behavior, scope expansion, and acceptance ambiguity. Remaining external dependencies are explicit gates: authorized ArcGIS application access, a Supabase project/demo account, and the exact presentation slot. None is represented as already provisioned or verified.

## Deviations (2026-10-27)

- Line 25: Google sign-in limited to @umbc.edu (before-user-created hook + a database check on every read/write), with email + password kept as a fallback.
- Line 17: the browser calls database functions (create_inspection, my_inspections) directly; no server request handlers.
- Line 53: the facility snapshot is stored as displayed (displayed_snapshot) and is not verified against ArcGIS.
- Line 55: asset rows are created on first inspection, limited to an allowlist (item cc6a7a27c267435c8f7ed95a59eb5f24, layer 3, version live) inside create_inspection.

See docs/designs/inspection-database-and-umbc-sign-in.md and supabase/CONTRACT.md for the full design and the frontend contract.
