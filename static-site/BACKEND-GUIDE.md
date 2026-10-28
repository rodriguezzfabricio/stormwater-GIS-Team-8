# Back-end guide

Sign-in, Save and history are **already wired** into this site. After `git pull` you start the server and they work. You do not need to copy any code.

This guide covers how it works, how to test it, and what not to touch. You do not have to read any SQL.

## 1. Start it

1. In a terminal: `cd static-site` then `python3 -m http.server 5500`.
2. Open http://localhost:5500/ . Use `localhost`, not `127.0.0.1`. The port must be 5500, and keep the trailing `/`. These exact addresses are registered with Google, Supabase and ArcGIS.
3. One-time access, done by others (you can't do these yourself):
   - **Google test user.** Ask Fabricio to add your Google account. The Google app is in Testing mode, so Google says "Access blocked" to everyone else.
   - **ArcGIS group.** Ask the owner of the "Stormwater ArcGIS Map" group to add your ArcGIS account. Without it the map has no BMPs.
4. Always sign in with your `@umbc.edu` Google account.

## 2. How it works

### Two sign-ins, each with its own job

| Sign-in | Why | Where |
|---|---|---|
| Google, `@umbc.edu` only (Supabase) | Saving inspections and seeing your own history. The database ties each record to you. | `login.html` |
| UMBC ArcGIS | The BMP layer is shared only with the "Stormwater ArcGIS Map" group. | The dashboard's ArcGIS gate (`map.js`) |

### The sign-in path

1. You open `http://localhost:5500/`. `map.js` loads the drop-in and checks for a Supabase session **first**. With none, it sends you to `login.html` before any ArcGIS redirect.
2. `login.html` shows one "Sign in with Google" button. Google sends you back to `login.html`, which shows "Finishing sign-in…".
3. `login.js` sets the one-time ArcGIS intent flag (`umbc-stormwater.arcgis.signin` in sessionStorage) and goes to `./`.
4. `map.js` runs Tai's ArcGIS gate, unchanged. ArcGIS returns to `http://localhost:5500/?code=…`. That `code` belongs to ArcGIS only: the drop-in reads `?code=` only on its sign-in pages (`signInPages` in `supabase-config.js`: `login.html` and `backend-check.html`).
5. The dashboard appears. The top bar shows your email and "Sign out".

A non-`@umbc.edu` account is signed out at once and sent to `login.html` with "Only @umbc.edu accounts can use this app." If the session ends while the dashboard is open, the top bar says "Signed out" and your form stays as it is.

### Saving

- **Draft.** Each inspection has a draft ID made in the browser. Pressing Save again with the same draft can never create a second record.
  - Selecting the same BMP again keeps the draft and what you typed.
  - A different BMP, or a confirmed save, starts a new draft.
- **Required.** Only the inspection type and Pass/Fail. From a loaded map that's four controls: the BMP, the type, the result, and Save.
- **While saving.** "Saving…" shows. Save, the eight saved fields, Restore and Clear are disabled. Map clicks and the BMP list are ignored until the reply arrives.
- **Confirmed.** "Saved at …" shows only after the database returns a record ID. Then type, result and observations clear, the next draft starts, and history refreshes.
- **Not confirmed (no reply).** The fields stay locked so a retry sends the same values. Press Save again: it never duplicates. Selecting a different BMP unlocks and clears the form. That inspection may or may not have been saved: reselect the first BMP and check its history.
- **Signed out at Save.** Everything you typed stays. Use the link to sign in in a new tab, come back, and press Save again.
- **What is saved:**
  - the type, the result, and the observations (as notes)
  - a snapshot: `{ "arcgis": <every attribute of the BMP>, "form": <the five editable form fields> }`
  - The five fields are verified location, nearby address, lookup source, condition and last inspection, each cut to 500 characters.

### History

"Your past inspections of this BMP", below the form:
- It shows only your own inspections of the selected BMP, newest first, at most 50.
- Each row opens to show the notes and the saved form fields.

### Which file does what

| File | Owner | What it does |
|---|---|---|
| `login.html`, `login.js` | team | The Google button and the return from Google. |
| `map.js` | team | Supabase check first, then the ArcGIS gate, then the map. Passes the drop-in to `facility-ui.mjs` with `connectInspectionBackend()`. Top-bar email and Sign out. |
| `facility-ui.mjs` | team | BMP selection, the form, Save, locking, drafts and history. Never calls Supabase directly. |
| `index.html` | team | Markup: the top-bar account area, the Save button (`#save-inspection`), the status line (`#save-status`), the history section. |
| `inspection-backend.mjs`, `inspection-backend-core.mjs`, `supabase-config.js` | Fabricio | The drop-in: sign-in, saving, history, error messages. `test-inspection-backend.mjs` checks its rules. |
| `backend-check.html` | Fabricio | Self-test page with no map. **Saves real records** on the BMP whose object ID you type. They show in your own history. |

## 3. How to test

The database change must be applied first (see `supabase/README.md`, "Applying the pending migration"). Until then, every save says "This feature is not from the BMP layer the database accepts."

### Quick check (2 minutes)

1. Run `node static-site/test-inspection-backend.mjs`. Expect `PASS: …`.
2. Open http://localhost:5500/backend-check.html , sign in, press Save twice. Expect "Saved at …", then "Already saved".

### Full browser check (about 20 minutes)

There is one step per browser check in `docs/spec/v1.md`. Use a desktop browser with DevTools open.
- **Offline** and **Slow 3G** are in DevTools → Network → throttling.
- **Request blocking** is in DevTools → Network request blocking.

**Sign-in**

| # | Check | Do | Expect |
|---|---|---|---|
| 1 | AC1 | In a private window, open http://localhost:5500/ | Lands on `login.html`, with no ArcGIS sign-in page first. "Verifying your ArcGIS session" may flash. |
| 2 | AC2 | Look at `login.html` | One "Sign in with Google" button, no email or password fields, no demo-password text. |
| 3 | AC3 | Press "Sign in with Google" | Google's account picker. Its failure message can't be triggered by hand. |
| 4 | AC4 | Pick your `@umbc.edu` account | "Finishing sign-in…" with the button disabled, then `http://localhost:5500/` and the ArcGIS sign-in. |
| 5 | AC7 | Finish the ArcGIS sign-in | Top bar: your email and "Sign out". |
| 6 | AC9 | On that page, Network tab filtered to `supabase.co` | No `auth/v1/token` request. The top bar still shows your email. |
| 7 | AC6 | Open http://localhost:5500/login.html while signed in | Your email, "Continue" and "Sign out". No Google button. "Continue" opens the dashboard. |
| 8 | AC5 | Open `http://localhost:5500/login.html?error=access_denied&error_description=Test+error` | "Test error" in red. The page stays put. Signed in: email, Continue and Sign out. |
| 9 | AC36 | Fill the form. In a second tab press "Sign out" on `login.html`, then switch back | Top bar: "Signed out" and a sign-in link. The form still has your values. Sign in again in the second tab, switch back: your email returns. |
| 10 | AC8 | Press "Sign out" in the top bar | `login.html` with the Google button. |
| 11 | AC35 | While signed out, open `http://localhost:5500/login.html?code=not-real` | "Sign-in did not complete. Try again." |
| 12 | AC33 | Block `cdn.jsdelivr.net`, reload `login.html`, then reload `/` | Both show "Sign-in could not load. Check your connection and reload." Unblock afterwards. |
| — | AC29 | Not by hand | The sign-up hook keeps non-UMBC accounts out. The rule is checked by `test-inspection-backend.mjs`. |

**Save**

| # | Check | Do | Expect |
|---|---|---|---|
| 13 | AC10 | Look at the inspection form | Result offers only Pass and Fail. No photos input. "Save inspection" is enabled. No "not saved or submitted", "Preview controls only" or "No inspection data is submitted". |
| 14 | AC39 | Before selecting a BMP, press "Save inspection" | "No BMP is selected. Click a BMP on the map first." Nothing in the Network tab. |
| 15 | AC32 | Before selecting a BMP, look below the form | "Your past inspections of this BMP" with "Select a BMP to see your past inspections." |
| 16 | AC22, AC11 | Click a BMP, pick a type, pick Pass, press Save | "Saved at …" after the reply. Four controls, nothing else required. |
| 17 | AC14 | Right after 16 | Type, result and observations are empty and enabled. The new row is in the history. |
| 18 | AC12, AC30 | Slow 3G. Fill type and result, double-click Save, then click the map and the BMP list | "Saving…". Save, the fields, Restore and Clear are disabled. The map click and the list do nothing. One `create_inspection` request. |
| 19 | AC13, AC31 | Offline. Fill type and result, press Save | "No reply from the server, so the save is not confirmed…". Type, result, observations, the five form fields, Restore and Clear are disabled. |
| 20 | AC38 | Still unconfirmed: click the same BMP on the map, then pick it in the list | Nothing you typed changes, including the nearby address. |
| 21 | AC13 | Back online, press Save | "Saved at …". The history shows **one** new row, not two. |
| 22 | AC15 | Fill type and observations, click the same BMP again | Your values stay. |
| 23 | AC16 | Fill type, result, observations and verified location, click a different BMP | All four are cleared. |
| 24 | AC37 | Fill type, result and observations, press "Clear inspection & restore fields" | All three are cleared. No error in the Console. |
| 25 | AC20 | Pick a result but no type, press Save | "Choose an inspection type (120 characters at most)." Your other values stay. |
| 26 | AC19 | Fill the form. Sign out in another tab, come back, press Save | "You are signed out. Sign in again in a new tab, then press Save again here." plus a link. Values stay. Sign in through the link, come back, press Save: "Saved at …". |
| 27 | AC18 | Open the new history row | The five form fields show the values from Save. The full shape is checked by `test-inspection-backend.mjs`. |
| — | AC17 | Not by hand | The WebMap shows only the accepted layer. A BMP from another layer would show "This feature is from …, not the BMP layer the database accepts" in the selection message and history, and send nothing. |

**History**

| # | Check | Do | Expect |
|---|---|---|---|
| 28 | AC23, AC24 | Select a BMP you never inspected, then one you did | "Loading…", then "You have not inspected this BMP yet." For the other: rows newest first, each with date and time, type, and Pass or Fail. |
| 29 | AC26 | Open a row | Observations, or "No notes", and the saved form fields under the form's own labels. A record saved by another tool shows "No extra fields saved". |
| 30 | AC27 | Reload, sign in to ArcGIS if asked, select the same BMP | The saved inspection is listed. |
| 31 | AC25 | Offline, select a BMP | "Could not load past inspections. Check your connection and try again." and an empty list. |
| 32 | AC28 | Slow 3G, click BMP A then quickly BMP B | Only B's history shows. |
| 33 | AC34 | Inspect `#save-status`, `#history-status`, `#login-message` and the top-bar email | Each has `aria-live="polite"`, or `role="status"`. |

Not checked by hand: the case where a reply is lost after the save reached the database ("Your earlier save did go through…").

## 4. If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| After Google, you land on `localhost:3000`, or "requested path is invalid" | Our redirect URL is not allowed in Supabase | Ask Fabricio to run `supabase/scripts/configure-auth.sh redirects` |
| Google says "Access blocked" | Your Google account is not a test user | Ask Fabricio to add it. Use your `@umbc.edu` account |
| "Only @umbc.edu accounts can sign up." or "…can use this app." | You picked a non-UMBC account | Sign in again with your `@umbc.edu` account |
| The map shows no BMPs | Your ArcGIS account is not in the "Stormwater ArcGIS Map" group | Ask the group owner to add you |
| "This feature is not from the BMP layer the database accepts." on every save | The database change is not applied yet | Ask Fabricio (`supabase/README.md`, "Applying the pending migration") |
| `This feature is from "..." (item ..., layer ...)` | The selected feature is from another layer | Send Fabricio the whole message text. Do not change the code |
| "Sign-in could not load." | The supabase-js CDN or `supabase-config.js` did not load | Check your connection and reload |
| "No reply from the server, so the save is not confirmed." | Network problem. It may or may not be saved | Press Save again. It never duplicates |
| "The server refused this save (code …). Nothing was saved." | The database rejected the request for a reason the page doesn't recognise | Send Fabricio the code. The form stays editable |
| "You are signed out. Sign in again in a new tab…" | The session ended | Use the link, sign in, come back, press Save again |

## 5. What not to touch

- **The drop-in.** Do not edit `inspection-backend.mjs`, `inspection-backend-core.mjs` or `supabase-config.js`. Ask Fabricio. They change only together with `supabase/`.
- **Keys and logging.**
  - Only the publishable key in `supabase-config.js` may appear in code. Never add another key, secret or token.
  - Do not log, print or store tokens, sessions, or raw sign-in errors.
- **Showing text.** Show messages with `textContent` only. Never `innerHTML`.
- **No direct Supabase calls.** Do not call Supabase tables or `rpc` yourself. Use the drop-in's functions through `facility-ui.mjs`.
- **These names must stay as they are:**
  - the form's input names (`inspection_type`, `inspection_result`, `observations`, and the five saved fields `verified_campus_location`, `nearby_address`, `address_kind`, `condition_status`, `last_inspection`)
  - the IDs `save-inspection`, `clear-inspection`, `save-status`, `history-status`, `history-list`, `account-email`, `account-sign-in`, `account-sign-out`
  - If you rename one, the drop-in or `facility-ui.mjs` must change with it.
- **Sign-in order.** Keep the Supabase check before the ArcGIS gate in `map.js`. Keep `login.html` as the page Google returns to.
