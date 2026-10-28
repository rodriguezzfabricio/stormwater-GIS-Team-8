# Intake: wire the back end into static-site
Date: 2026-10-27 · Tier: 1 · Research: docs/research/2026-10-27-wire-backend-into-static-site.md · Round: 1

## Summary
Connect the Supabase back end (Google UMBC sign-in, Save, history) to the team's real pages: `login.html`/`login.js`, `index.html`, `map.js` and `facility-ui.mjs`. After a `git pull`, the pages then work with no copy-paste.
Job: when an inspector finishes checking a BMP, they save the inspection and later see it in their own history.
Umbrella: yes (Google, ArcGIS and Supabase are outside dependencies). The walking skeleton is sign in → pick a BMP → Save → history after a reload.
The history detail is included, following the approved spec. Photos and "Needs verification" are removed, following the design.
Three questions.

## Register conflicts
- No `docs/decisions.md` exists. The approved spec and design act as the user's decisions:
  - Spec:29 includes history detail (the saved snapshot). Resolution: kept, unasked.
  - Design:53 lists photos and "Needs verification" as non-goals. Resolution: kept, and they are removed from the form.
  - Design:139 and :733 keep email + password on as a fallback. The request doesn't name it. Resolution: kept at the auth level (the provider stays enabled). Whether the login page shows it is question Q3.

## Framing
**Job story:** When I finish checking a BMP on campus, I want to save my inspection against that exact BMP, so my record is stored under my UMBC account and I can see it again after a reload.

**Day after launch:**
1. A teammate runs `git pull`, starts `python3 -m http.server 5500` in `static-site/` and opens `http://localhost:5500/`.
2. They are sent to the login page, press "Sign in with Google", pick their `@umbc.edu` account and land on the map. They do the ArcGIS sign-in if asked.
3. They click a BMP, choose a type and Pass/Fail, and press "Save inspection".
4. They see "Saved at …" and the new row in "Your past inspections of this BMP".
5. After a reload the row is still there. Clicking it shows what was saved.

**Top 3 reasons it could fail:**
1. The WebMap's BMP layer is not item `cc6a7a27…` layer 3, so every save is refused (not checked; `checkFeature` reports it).
2. A merge conflict with the teammate's unmerged `feature/stormwater-frontend` work in the same two files.
3. A teammate's Google account is not a test user, so Google blocks sign-in before the demo.

**Story map:**
1. Open the site.
   - Signed in: go straight to the map.
   - Signed out: go to `login.html`.
2. Sign in with Google.
   - A `@umbc.edu` account is accepted.
   - Any other account gets "Only @umbc.edu accounts can sign up."
   - A non-test-user Google account is blocked by Google.
3. ArcGIS sign-in. Already done: skipped. Otherwise: redirect and come back.
4. Select a BMP. By map click or by the dropdown.
   - Right layer: a new draft starts.
   - Wrong layer: a clear message.
   - Same BMP again: the draft is kept.
5. Fill in and Save.
   - Saved.
   - Not confirmed: press Save again.
   - Invalid field: a message names it.
   - Signed out or expired: sign in again, and the form text stays.
   - Already saved.
6. View history. Empty state, a list, a row's detail, or an error.
7. Sign out. Back to the login page.

**Umbrella:** yes. Signals: three outside-dependent activities (Google, ArcGIS, Supabase).
- **Walking skeleton:** activities 1, 2, 4, 5 and 6 on the happy path (list only).
- **Slices after it, in story-map order:**
  - history detail
  - the inspector-entered fields (Q2)
  - sign out with the email in the top bar

**First-value budget (Taste):** from the map with a BMP list loaded to "Saved at …" in at most 4 clicks: select a BMP, choose a type, choose Pass/Fail, press Save. Sign-ins are excluded because they are one-time.

## Assumptions
- **The layer is right.** The WebMap BMP layer is item `cc6a7a27…` layer 3. Confidence: medium. Source: design, not checked in a browser.
- **The redirect is allowed.** The Supabase redirect `http://localhost:5500/**` is applied and covers `login.html`. Confidence: high. Source: an earlier session run of `configure-auth.sh redirects`.
- **History detail is in scope.** It shows the saved snapshot plus type, outcome, notes and time. Confidence: high. Source: app/docs/superpowers/specs/2026-10-26-bmp-inspection-demo-design.md:29.
- **Photos and "Needs verification" are removed** from the form. Confidence: high. Source: docs/designs/inspection-database-and-umbc-sign-in.md:53.
- **False "not saved" copy is replaced** with true copy. This covers "UI only", "Inspection entries are not saved", "Preview controls only", "No inspection data is submitted" and "coming later". Confidence: high. Source: inference from the request.
- **The signed-in email and a Sign out button go in the top bar.** Confidence: medium. Source: design:688, :706-708.
- **The failing tests stay out of scope.** The pre-existing failures in `test-facility.mjs` and `test-selection.mjs` are not fixed here. Confidence: high. Source: research, "Not checked".
- **Teammates get added as Google test users** by the project owner. Confidence: medium. Source: inference.

## Questions
### Q1 (scope): Your teammate's unmerged branch rewrites the same two files. Which code should this build on?
Why it matters: unless the order is agreed, someone resolves a merge conflict in `facility-ui.mjs` and `index.html` by hand.

Default: build on that branch's tip now. You ask the teammate to open and merge their PR. After it merges, I rebase onto main and open the PR.
- Reason: this targets the newest form, and nobody resolves conflicts by hand.

Alternatives:
- Build on main now; the teammate resolves conflicts when they merge.
- Wait to start until their branch is merged.

Answer: "defaults for #1 tai said this \" i already pushed everything\" so check that" · by: user (answerSeq 4)

### Q2 (scope): What should happen on Save to the form fields the database doesn't store?
The fields are verified campus location, nearby address, address source, condition/status and last inspection.

Why it matters: today anything typed in them is silently lost after Save.

Default: save them inside the inspection's snapshot, in a `form` section next to the ArcGIS attributes, and show them in the history detail.
- Reason: nothing typed is lost and no database change is needed. The column already means "as displayed in the browser at submission".

Alternatives:
- Add them to the notes text.
- Don't save them, and label those fields "not saved".

Answer: default · by: default accepted

### Q3 (ux): Should the login page show only "Sign in with Google", or also an email + password form?
Why it matters: today's login page shows email + password but checks nothing, so anyone gets in.

Default: Google only. Email + password stays enabled in Supabase as the design's fallback, but no page shows it.
- Reason: no password accounts exist, and the form would look like it works for people it rejects.

Alternatives:
- Google plus a small email + password form for teammates.

Answer: default · by: default accepted

## After the round (steer notes, not yet recorded as user decisions)
These came in session messages after round 1 closed. The spec confirmation is where they get recorded.

- **The map uses a different BMP layer than the database accepts.** Checked 2026-10-28 in the browser, read-only.
  - WebMap `d59cb5cc77914e6c96631b856c667129` ("Stormwater Icon") has one operational layer: `UMBC_BMP_ArcGIS_Import`, item `5d70e438bb6045d6b3af05aee061e3cd`, sublayer 0, with 116 rows.
  - Both items are shared only with the group "Stormwater ArcGIS Map". Neither is public.
  - The database and drop-in accept only item `cc6a7a27…` layer 3 (CLAUDE.md "Planned app"; static-site/inspection-backend-core.mjs:8-12; supabase/migrations/20261028024553_inspection_functions.sql:22-23).
  - User, after reading this: "Gotcha I agree" (with pointing the database at the map's layer).
- **The teammate's branch now gates the dashboard behind ArcGIS sign-in** (map.js `stormwater-auth-gate`). Its login form is demo-only and checks no password (login.js:1-3 on that branch).
  - Plan the user agreed to: login page = real Google sign-in, then the teammate's ArcGIS check, then the dashboard.
- **Q1 follow-up.** The teammate was unavailable to open a PR.
  - The user said "go" to opening it on their behalf: PR #4, created 2026-10-28.
  - Merging is a GitHub action that goes through the broker. The user does it.

## Engineering decisions
- **Gate the map page.** `map.js` awaits `requireUser()` before `start()`. Supabase never reads ArcGIS's `?code=` on `index.html`.
  - Rationale: this is the guide's Step 2 and keeps the two `?code=` flows apart.
  - Alternatives: gate in an inline script.
  - Class: Mechanical. Reverse: easy.
- **Keep the draft on reselect.** When the same BMP (same item, layer and object ID) is selected again before a confirmed save, keep its draft.
  - Rationale: a re-click after "not confirmed" must not create a duplicate on retry.
  - Alternatives: always start a new draft.
  - Class: Mechanical. Reverse: easy.
- **Start a new draft after a confirmed save and refresh history.**
  - Rationale: one draft is one inspection.
  - Class: Mechanical. Reverse: easy.
- **Show the user in the top bar.** The signed-in email and Sign out go on the right side of `.topbar`.
  - Rationale: the design asks for the email and sign-out.
  - Alternatives: put them in the sidebar.
  - Class: Taste. Depends on it: the topbar layout. Reverse: easy.
- **Pass the snapshot to history.** `historyRow` also returns the saved snapshot, so the detail view can show it. This is a drop-in change, made together with a `supabase/CONTRACT.md` note.
  - Rationale: spec:29.
  - Alternatives: a second RPC.
  - Class: Mechanical. Reverse: easy.
- **Use a native `<details>` for history detail.** Each history row is a `<details>` element: the summary line shows time, type and result, and the body shows the notes and the saved fields.
  - Rationale: native, keyboard-accessible and no new code paths.
  - Alternatives: a modal.
  - Class: Taste. Depends on it: the history markup. Reverse: easy.
- **Load the drop-in with a static import** from `map.js` and `facility-ui.mjs`.
  - Rationale: the same failure mode as the ArcGIS CDN.
  - Alternatives: a dynamic import with a message.
  - Class: Mechanical. Reverse: easy.
- **Put new pure logic in the core.** It goes in `inspection-backend-core.mjs`, with checks in `test-inspection-backend.mjs`. The browser wiring is verified by hand with the guide's check list.
  - Class: Mechanical. Reverse: easy.
- **Rewrite the guide.** BACKEND-GUIDE.md changes from "paste these steps" to "already wired: how it works, how to test, what not to touch".
  - Class: Mechanical. Reverse: easy.

## Spec check v1
### Pass 1 (fresh reader, 2026-10-28): 4 blocking, 14 nonblocking
Blocking findings and what was done:
1. **Migration written vs applied.** The order was undefined. Fixed: A2 sets the order (apply → rename → tests → advisors → regenerate types at Contract-Version 2 → README "applied" → check AC11/AC21), all done before the PR merges.
2. **Google test users were missing.** Fixed: A15 (precondition), a non-goal (no consent-screen publishing), and a qualified Goal.
3. **PR #4 status and D1 meaning were unclear.** Fixed: PR #4 merged (e0c0635). A6 updated, and D14 states what D1 means for the build.
4. **The redirect went to `index.html`, not `./`.** Fixed: AC4 and AC6 go to `./` (the registered ArcGIS redirect URL).

Nonblocking findings:
- **Fixed:**
  - "Returning from Google" is now defined by `code`/`error` in the URL (AC4–AC6). An error takes precedence (AC5).
  - map.js's change is stated (A4). The gate text may show during the AC1 check.
  - Non-UMBC session (AC29, D19).
  - Re-sign-in in a new tab (AC19, D16).
  - Lock while saving and after an unconfirmed save (AC30, AC31, D17).
  - 500-character form values (AC18, D18).
  - CDN failure: dynamic import plus a message (AC33, D15 supersedes D8).
  - Login loading state and a Google start failure (AC3, AC4).
  - History area named, and its empty-selection state (AC32). AC17 now shows in history too.
  - Old service-URL matching removed (A1).
  - `my_inspections` rejects other sources (A2, A3, AC21).
  - A1's file list completed.
  - Evidence cited for sharing, failing tests and field names (A1, A17, A14).
  - backend-check.html writes real records (A16, D20).
  - PRODUCT.md budget wording.
  - aria-live (AC34).
  - Clear button keeps working (AC10).
- **Not changed:** "Kyle" in the request quote was replaced with "a teammate". "Jarvis" stays as the decision maker's name in the register.

### Pass 2 (fresh reader, 2026-10-28): 4 new blocking, 11 nonblocking
Blocking findings and what was done:
1. **The base didn't hold the drop-in files.** They are uncommitted. Fixed: A6 names the base (this checkout) and the branch, adds those files as the first commit, and lists what ships and what never does (D24).
2. **The AC31 lock could be overwritten.** Fixed:
   - AC31 uses `disabled` and also locks Restore and Clear.
   - New AC38: reselection and late lookups leave values unchanged.
   - AC15: facility-ui uses `featureRef` identity (D21).
3. **The rule tests used absolute row counts.** Fixed: AC21 and A2 make the counts relative to an in-transaction baseline (D22).
4. **Nobody checked the browser criteria.** Fixed: A19 says the build checks Node rules only, the owner checks the browser criteria after applying, and the merge waits for that (D23).

Nonblocking findings, all fixed:
- Evidence moved to a research addendum. The object-ID field is unnamed, so docs say "`objectIdField`" (A1).
- Sign-out in another tab (AC36). The signed-out texts change (A13).
- Failed code exchange (AC35).
- AC26 empty states and labels.
- Ok replays count as confirmed (AC14).
- Trade-off made visible (A20, D25).
- A4 reworded.
- Terms defined, and [delegated] explained.
- `database.types.ts` is left to the owner. The temporary migration name is given.
- Redirect allow-list (A18).
- AC10 lists the stale strings, plus login copy (AC2).
- Prefilled values are cut to 500 characters (AC18).
- A14 includes `form`.
- Dropdown identity (A21).
- Clear is split out as AC37.

### Pass 3 (fresh reader, 2026-10-28): 1 new blocking, 14 nonblocking. The loop stops here (3-pass limit).
- **Blocking [inflight-edit-loss]:** fields could still be edited during a save. Fixed: AC12 now disables the same eight fields plus Restore and Clear while a request is in flight (D26).
  - This mirrors AC31. No fourth reader was run, because the spec skill caps the loop at 3 passes.
- **Nonblocking, fixed:**
  - Save with no BMP (AC39), and the pre-check covered by AC20.
  - AC29 message passed through sessionStorage. A19 notes it can't be reached in the browser.
  - Unchecked lost-reply path listed (A19). Guide gets one step per AC.
  - ArcGIS group precondition (A22).
  - Login controls per state (AC5, AC6).
  - CONTRACT sections plus the app-spec line-43 deviation, and historical root docs left alone (A1).
  - Rule-test object IDs 900001+ (A2).
  - Separate history signed-out text, and config script tags (A13).
  - Missing config covered (AC33).
  - Same-tab expiry and re-sign-in shown in the top bar (AC36).
  - Labels: A6 and A19 are delegated; A2 and A3 follow from A1; A12 cites spec:29; A20 marked Taste.
  - The runner opens the PR through the broker (A6).
  - README hook line (A1).
- **Not changed:** D1's cell keeps the user's exact words, as the register rules require. D14 states what it means.
- **Status:** no known blocking gap. 3 passes run.

### Confirmation (round 2)
Answer: "yes" · by: user (answerSeq 13). Spec v1 status: confirmed. Recorded as D27.
