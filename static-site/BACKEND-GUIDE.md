# Back-end guide

This is the only guide you need. You do not have to read any SQL or other docs.

## 1. What you get

- Sign in with Google. Only `@umbc.edu` accounts get in.
- Save an inspection for the selected BMP.
- Show the signed-in inspector's own past inspections of that BMP.

Every function returns an object with a `message` you can show as it is. None of them throw.
Files you use but never edit: `supabase-config.js`, `inspection-backend.mjs`, `inspection-backend-core.mjs`.

## 2. Before you start (one time)

1. In a terminal: `cd static-site` then `python3 -m http.server 5500`.
2. Open http://localhost:5500/ . Use `localhost`, not `127.0.0.1`. The port must be 5500.
3. Ask Fabricio to add your Google account as a test user. Google blocks everyone else for now.
4. Always sign in with your `@umbc.edu` Google account.

## 3. Step 1: Login page

Why one Google button: email + password only works for people in our Supabase org.

Replace `login.html` with this:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UMBC Stormwater GIS - Login</title>
    <link rel="stylesheet" href="login.css">
</head>
<body>
    <main class="login-page">
        <section class="login-card">
            <div class="login-header">
                <div class="logo-box"><span>💧</span></div>
                <div><h1>UMBC</h1><p>STORMWATER GIS</p></div>
            </div>
            <div class="login-content">
                <h2>Sign in</h2>
                <p class="subtitle">Sign in with your UMBC Google account to access the Stormwater GIS.</p>
                <p id="login-error" role="alert"></p>
                <button type="button" id="google-sign-in">Sign in with Google</button>
            </div>
        </section>
    </main>
    <script src="supabase-config.js"></script>
    <script type="module" src="login.js"></script>
</body>
</html>
```

Replace `login.js` with this:

```js
import { finishSignIn, signInWithGoogle } from "./inspection-backend.mjs";

const button = document.getElementById("google-sign-in");
const errorLine = document.getElementById("login-error");

button.addEventListener("click", async () => {
  button.disabled = true;
  errorLine.textContent = "";
  const started = await signInWithGoogle();   // leaves for Google, comes back to this page
  if (!started.ok) errorLine.textContent = started.message;
  button.disabled = false;
});

// Runs when Google sends the user back to this page.
const done = await finishSignIn();
if (done.ok) {
  location.replace("index.html");
} else {
  errorLine.textContent = done.message;       // empty on a normal first visit
}
```

## 4. Step 2: Protect the map page

In `index.html`, add one line before the module scripts:

```html
  <script src="arcgis-config.js"></script>
  <script src="supabase-config.js"></script>
  <script type="module" src="https://js.arcgis.com/5.1/"></script>
  <script type="module" src="map.js"></script>
```

In `map.js` (it is a module, so top-level `await` is fine):

```js
// top of the file, under the existing import
import {requireUser} from "./inspection-backend.mjs";
const user = await requireUser();   // signed-out visitors are sent to login.html

// very last line of the file: change  start();  to
if (user) start();
```

ArcGIS also puts `?code=` in the `index.html` address. That is fine. Only `login.html` reads `?code=` for Supabase.

Optional sign-out button. In `index.html`, inside `<header class="topbar">`, add
`<button class="btn btn-muted" type="button" id="sign-out">Sign out</button>`. In `map.js`:

```js
import {requireUser, signOut} from "./inspection-backend.mjs";   // add signOut here

document.getElementById("sign-out")?.addEventListener("click", async () => {
  await signOut();
  location.replace("login.html");
});
```

## 5. Step 3: Remember the selected BMP

All edits are in `facility-ui.mjs`.

a) Add the import under the other imports, and the two `let` lines next to `let selectedFacility = null;`:

```js
import {startInspection, checkFeature, myInspections as loadHistory} from "./inspection-backend.mjs";

// next to the other module-level lets
let selectedGraphic = null;   // the BMP the user picked
let currentDraft = null;      // one draft = one inspection
```

b) Anywhere at module level (for example right after `showFacility`), add:

```js
function rememberGraphic(graphic) {
  selectedGraphic = graphic;
  currentDraft = startInspection(graphic);      // new BMP = new inspection
  const check = checkFeature(graphic);
  if (!check.ok) selectionMessage.textContent = check.message;   // wrong layer, no object ID, ...
}
```

c) Call it right after `showFacility`, in two places. In `handleClick`:

```js
      // before
      lastClickedFeature = match;
      showFacility(extractFacility(match, event.detail.mapPoint));
      // after
      lastClickedFeature = match;
      showFacility(extractFacility(match, event.detail.mapPoint));
      rememberGraphic(match);
```

In `selectFromDropdown`:

```js
      // before
      showFacility(extractFacility(feature));
      // after
      showFacility(extractFacility(feature));
      rememberGraphic(feature);
```

Click a BMP on the real map and read the selection message. If it says the layer is wrong, see section 9.

## 6. Step 4: Save button

In `index.html`, find the `form-actions` line at the bottom of the form and change two things.

```html
<!-- before -->
<span><svg class="icon"><use href="#i-info"></use></svg> No inspection data is submitted.</span>
<button class="btn btn-disabled" type="button" disabled title="Backend submission will be added later">Submit inspection · coming later</button>
<!-- after -->
<span id="save-message" aria-live="polite">Select a BMP, then press Save.</span>
<button class="btn btn-primary" type="button" id="save-inspection">Save inspection</button>
```

Also delete these (the database does not accept them):

- `<option>Needs verification</option>` in the result select.
- The whole `<label class="full-span">Supporting photos ...</label>` (photos are out of scope).
- In `facility-ui.mjs`, the reset handler line `form.elements.namedItem("photos").value = "";`. If you keep it, "Clear" crashes.

Keep the `form.addEventListener("submit", event => event.preventDefault())` line. The new button is `type="button"`, so it never submits the form.

At the bottom of `facility-ui.mjs`, add:

```js
const saveButton = byId("save-inspection");
const saveMessage = byId("save-message");

saveButton.addEventListener("click", async () => {
  if (!currentDraft) {
    saveMessage.textContent = "Select a BMP first.";
    return;
  }
  saveButton.disabled = true;                        // no double clicks
  saveMessage.textContent = "Saving…";
  const result = await currentDraft.save(form);      // reads the form fields by name
  saveMessage.textContent = result.message;
  saveButton.disabled = false;
  if (result.ok) {
    currentDraft = startInspection(selectedGraphic); // the next Save is a new inspection
  }
});
```

If you see "not confirmed", press Save again. Do not call `startInspection` again. Save again never makes a duplicate.

## 7. Step 5: Show history

In `index.html`, right after `</form>` (still inside `.form-shell`), add:

```html
<section aria-labelledby="history-title">
  <h3 id="history-title">Your past inspections of this BMP</h3>
  <p id="history-message"></p>
  <ul id="inspection-history"></ul>
</section>
```

In `facility-ui.mjs`, at module level, add:

```js
const historyMessage = byId("history-message");
const historyList = byId("inspection-history");

async function showHistory() {
  if (!selectedGraphic) return;
  const graphic = selectedGraphic;
  const { rows, message } = await loadHistory(graphic);   // newest first, at most 50
  if (graphic !== selectedGraphic) return;                // user picked another BMP meanwhile
  historyMessage.textContent = message;                   // "You have not inspected this BMP yet." or an error
  historyList.replaceChildren();
  for (const row of rows) {
    const item = document.createElement("li");
    item.title = row.recordId;
    item.textContent = `${row.savedAtText} · ${row.inspectionType} · ${row.outcome}` + (row.notes ? ` · ${row.notes}` : "");
    historyList.append(item);
  }
}
```

Then call it in two places:

- As the last line inside `rememberGraphic`: `void showHistory();`
- In the Save handler from Step 4, right after the `currentDraft = startInspection(selectedGraphic);` line: `void showHistory();`

Use `textContent` only. Never `innerHTML`.

## 8. Check it works

First, open http://localhost:5500/backend-check.html . It uses a fake BMP and no map.

1. Press "Sign in with Google". You come back to the same page and it says "Signed in as ...".
2. Press Save. It says "Saved at ...".
3. Press Save again. It says "Already saved". Still one record.
4. Press "New inspection", then Save. It saves a second record.
5. Reload the page. The history list still shows both.

Then the real page:

1. Open http://localhost:5500/ . You are sent to the login page. Sign in.
2. Do the ArcGIS sign-in on the map page.
3. Click a BMP. The selection message should not say the layer is wrong.
4. Fill the form and press Save. Wait for "Saved at ...".
5. Reload, select the same BMP. History shows your inspection.

## 9. If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| After Google, you land on `localhost:3000`, or "requested path is invalid" | Our redirect URL is not allowed in Supabase yet | Ask Fabricio to run `supabase/scripts/configure-auth.sh redirects` |
| Google says "Access blocked" | Your Google account is not a test user | Ask Fabricio to add it. Use your `@umbc.edu` account |
| "Only @umbc.edu accounts can sign up." | You picked a non-UMBC Google account | Sign in again with your `@umbc.edu` account |
| `This feature is from "..." (item ..., layer ...), not the BMP layer the database accepts` | The map's layer is not the one the database accepts | Send Fabricio the whole message text. Do not change the code |
| "No BMP is selected. Click a BMP on the map first." | `startInspection` got no graphic | Click a BMP, then try again |
| "No reply from the server, so the save is not confirmed." | Network problem. It may or may not be saved | Press Save again. It never duplicates |
| "Already saved (record ...). Start a new inspection..." | That draft is already saved | Call `startInspection(selectedGraphic)` again (Step 4 does this after a save) |
| "This inspection was already saved with different values." | Same draft, changed form values | Same fix: start a new inspection |
| "Choose Pass or Fail..." | Result is empty or "Needs verification" | Delete that option (Step 4) |
| "You are signed out" or "Your sign-in expired" | Session ended | Go to `login.html` and sign in. Your form text stays |

## 10. Rules

- Only the publishable key in `supabase-config.js` may appear in code. Never add another key, secret or token.
- Do not edit `inspection-backend.mjs`, `inspection-backend-core.mjs` or `supabase-config.js`. Ask Fabricio.
- Do not log, print or store tokens or session objects.
- Call `startInspection()` once per inspection: for each newly selected BMP and after each saved inspection.
- Do not call Supabase tables or `rpc` yourself. Use only the functions in this guide.
