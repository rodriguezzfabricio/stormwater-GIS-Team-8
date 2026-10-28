// Standalone Supabase back-end check for the static site. No ArcGIS SDK, no iframe.
// Exercises Google sign-in, create_inspection and my_inspections the way the frontend contract describes.
// supabase-js owns the session; this page never reads, prints or logs token values, session
// objects or raw auth errors (same rule as map.js), and it makes no console calls at all.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";

const settings = window.STORMWATER_SUPABASE || {};
const SOURCE_ITEM = "5d70e438bb6045d6b3af05aee061e3cd";  // The only BMP source item the database accepts.
const LAYER_ID = 0;  // UMBC_BMP_ArcGIS_Import layer.
const REDIRECT_URL = "http://localhost:5500/auth-test.html";  // Must be in the Supabase redirect allowlist.

const authStatus = document.getElementById("auth-status");
const authMessage = document.getElementById("auth-message");
const signInButton = document.getElementById("sign-in");
const signOutButton = document.getElementById("sign-out");
const form = document.getElementById("inspection-form");
const objectIdInput = document.getElementById("object-id");
const typeInput = document.getElementById("inspection-type");
const outcomeGroup = document.getElementById("outcome-group");
const notesInput = document.getElementById("notes");
const draftInput = document.getElementById("draft-id");
const newDraftButton = document.getElementById("new-draft");
const saveButton = document.getElementById("save");
const retryButton = document.getElementById("retry");
const resultBadge = document.getElementById("result-badge");
const resultSummary = document.getElementById("result-summary");
const resultList = document.getElementById("result-list");
const refreshButton = document.getElementById("refresh");
const historyStatus = document.getElementById("history-status");
const historyList = document.getElementById("history-list");

// What to tell the user for each row of the Error contract table.
const ACTIONS = {
  signed_out: "You are signed out. Sign in, then press Retry. The draft ID is kept.",
  session_expired: "Your session expired. Sign in again, then press Retry with the same draft ID.",
  forbidden_domain: "UMBC accounts only. Sign out, then sign in with a confirmed @umbc.edu Google account.",
  invalid_input: "A field value was rejected. Fix the highlighted field and press Save. All inputs are kept.",
  unknown_source: "The database rejected the source item or layer. Re-select the feature (it is fixed on this page).",
  draft_conflict: "This draft ID was already used with different content. Press New draft, then Save again.",
  network: "No confirmed reply. Press Retry to resend the same draft ID; if the first call did arrive, you get the original record back.",
  unknown: "Unexpected error, so the save is not confirmed. Retry resends the same draft ID."
};
// With these the request may still have reached the database, so say "not confirmed", not "not saved".
const UNCERTAIN_KINDS = new Set(["network", "unknown"]);
// invalid_input:<field> names map to the input to highlight.
const FIELD_ELEMENTS = {
  object_id: objectIdInput,
  inspection_type: typeInput,
  outcome: outcomeGroup,
  notes: notesInput
};

let client = null;
let signedInEmail = "";  // Only the email is kept for display; the session stays inside supabase-js.
let draftId = crypto.randomUUID();
// Exact body of the latest save, so Retry can resend it unchanged. Retry stays available after a
// confirmed save too: resending it must return replayed: true without creating a second record.
let lastRequest = null;
let busy = false;
let historyToken = 0;  // Lets a newer history load win over a slower older one.

function renderButtons() {
  signInButton.disabled = !client;
  saveButton.disabled = busy || !client;
  retryButton.disabled = busy || !client || !lastRequest;
  newDraftButton.disabled = busy;
  refreshButton.disabled = busy || !client;
}

function renderAuth() {
  const signedIn = Boolean(signedInEmail);
  authStatus.textContent = signedIn ? `Signed in as ${signedInEmail}` : "Not signed in";
  signInButton.hidden = signedIn;
  signOutButton.hidden = !signedIn;
  renderButtons();
}

function showDraft() {
  draftInput.value = draftId;
}

// rows is a list of [label, value] pairs. textContent only: nothing from the server is parsed as HTML.
function showResult(tone, badge, summary, rows = []) {
  resultBadge.textContent = badge;
  resultBadge.className = tone === "ok" ? "soon-label badge-ok" : tone === "error" ? "soon-label badge-error" : "soon-label";
  resultSummary.textContent = summary;
  resultList.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    return row;
  }));
}

function clearFlags() {
  form.querySelectorAll("[aria-invalid]").forEach((element) => element.removeAttribute("aria-invalid"));
}

function flagField(element) {
  element.setAttribute("aria-invalid", "true");
}

function focusField(element) {
  (element.matches("input, textarea, select") ? element : element.querySelector("input")).focus();
}

function clearHistory() {
  historyToken += 1;
  historyList.replaceChildren();
  historyStatus.textContent = "Type an object ID, then press Refresh.";
}

// Text before the first space, except the two Postgres/PostgREST messages the Error contract names in full.
function messagePrefix(message) {
  for (const known of ["permission denied", "JWT expired"]) {
    if (message.startsWith(known)) return known;
  }
  return message.split(/\s/, 1)[0].slice(0, 80);
}

// supabase-js returns { data, error, status } for API errors and does not throw. Network failures
// arrive as an error with no code, or as a thrown TypeError. Both end up here.
function classifyError(error, status = 0) {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  const prefix = messagePrefix(message);
  let kind = "unknown";
  let field = "";
  if (prefix.startsWith("invalid_input:")) {
    kind = "invalid_input";
    field = prefix.slice("invalid_input:".length);
  } else if (prefix === "forbidden_domain") {
    kind = "forbidden_domain";
  } else if (prefix === "not_authenticated") {
    kind = "signed_out";
  } else if (prefix === "unknown_source") {
    kind = "unknown_source";
  } else if (prefix === "draft_conflict") {
    kind = "draft_conflict";
  } else if (code === "PGRST301" || code === "PGRST303" || prefix === "JWT expired") {
    kind = "session_expired";
  } else if (code === "42501" && prefix === "permission denied") {
    kind = "signed_out";
  } else if (!code || status === 0 || status >= 500) {
    kind = "network";
  }
  return { kind, code, prefix, field, status };
}

async function callRpc(name, args) {
  try {
    const { data, error, status } = await client.rpc(name, args);
    return error ? { failure: classifyError(error, status) } : { data };
  } catch (thrown) {
    return { failure: classifyError(thrown) };
  }
}

function showFailure(failure, request) {
  if (Object.hasOwn(FIELD_ELEMENTS, failure.field)) {
    // draft_id and displayed_snapshot have no input, so only the four typed fields are highlighted.
    flagField(FIELD_ELEMENTS[failure.field]);
    focusField(FIELD_ELEMENTS[failure.field]);
  }
  const rows = [
    ["Error code", failure.code || "none"],
    ["Message prefix", failure.prefix || "none"]
  ];
  if (failure.status) rows.push(["HTTP status", String(failure.status)]);
  rows.push(["Draft ID kept", request.p_draft_id], ["Signed in as", signedInEmail || "not signed in"]);
  showResult("error", UNCERTAIN_KINDS.has(failure.kind) ? "NOT CONFIRMED" : "NOT SAVED", ACTIONS[failure.kind], rows);
}

async function loadHistory(objectId) {
  historyToken += 1;
  const token = historyToken;
  historyList.replaceChildren();
  if (!objectId) {
    historyStatus.textContent = "Type an object ID, then press Refresh.";
    return;
  }
  historyStatus.textContent = `Loading inspections for object ${objectId}…`;
  const { data, failure } = await callRpc("my_inspections", {
    p_source_item: SOURCE_ITEM,
    p_layer_id: LAYER_ID,
    p_object_id: objectId,
    p_limit: 50
  });
  if (token !== historyToken) return;  // A newer load or a sign-out replaced this one.
  if (failure) {
    historyStatus.textContent = `Could not load history. Error code: ${failure.code || "none"}. Message prefix: ${failure.prefix || "none"}. Press Refresh to try again, or sign in again if your session expired.`;
    return;
  }
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    historyStatus.textContent = "No inspections yet for this feature.";
    return;
  }
  historyStatus.textContent = `${rows.length} inspection${rows.length === 1 ? "" : "s"} for object ${objectId}, newest first.`;
  historyList.replaceChildren(...rows.map((row) => {
    const item = document.createElement("li");
    const heading = document.createElement("strong");
    const when = document.createElement("div");
    const meta = document.createElement("div");
    heading.textContent = `${String(row.outcome ?? "").toUpperCase()} · ${row.inspection_type ?? ""}`;
    when.textContent = String(row.submitted_at ?? "");
    meta.className = "history-meta mono";
    meta.textContent = `record ${row.id}`;
    item.append(heading, when);
    if (row.notes) {
      const notes = document.createElement("div");
      notes.className = "history-notes";
      notes.textContent = row.notes;
      item.append(notes);
    }
    item.append(meta);
    return item;
  }));
}

// Sends one create_inspection request. The draft ID is replaced only after the database confirms it.
async function sendRequest(request) {
  busy = true;
  renderButtons();
  showResult("info", "SAVING…", "Waiting for the database to confirm the save…");
  try {
    const { data, failure } = await callRpc("create_inspection", request);
    // create_inspection RETURNS TABLE, so supabase-js hands back an array holding one row.
    const row = Array.isArray(data) ? data[0] : data;
    if (failure || !row?.id) {
      showFailure(failure || { kind: "unknown", code: "", prefix: "empty_response", field: "", status: 0 }, request);
      return;
    }
    if (request.p_draft_id === draftId) {
      // Confirmed, so this draft is done. A Retry of an older request leaves the current draft alone.
      draftId = crypto.randomUUID();
      showDraft();
    }
    showResult(
      "ok",
      row.replayed ? "SAVED · REPLAYED" : "SAVED",
      row.replayed
        ? "The database already held this draft ID with the same content and returned the original record. No second record was created. A new draft ID is ready."
        : "The database committed the record and confirmed it. A new draft ID is ready for the next inspection.",
      [
        ["Record ID", String(row.id)],
        ["Asset ID", String(row.asset_id ?? "")],
        ["Server time", String(row.submitted_at ?? "")],
        ["Replayed", String(row.replayed)],
        ["Signed in as", signedInEmail || "not signed in"]
      ]
    );
    await loadHistory(request.p_object_id);
  } finally {
    busy = false;
    renderButtons();
  }
}

// Called for the first session check and again from onAuthStateChange. Keep it synchronous:
// supabase-js can deadlock if another Supabase call is awaited inside that callback.
function applySession(session) {
  const email = typeof session?.user?.email === "string" ? session.user.email : "";
  const changed = email !== signedInEmail;
  signedInEmail = email;
  if (changed) {
    clearHistory();
    authMessage.textContent = email
      ? "Signed in with Google through Supabase. The session stays in this browser until you sign out."
      : "Pick your @umbc.edu Google account when asked.";
  }
  renderAuth();
  if (session) stripAuthParams();
}

// Failed OAuth redirects come back with error_description in the query or hash. It is a plain
// message (for example the sign-up block text), not a token, so it is safe to show on the page.
function readAuthRedirectError() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const description = query.get("error_description") || hash.get("error_description");
  const failed = description || query.get("error") || hash.get("error");
  return failed ? String(description || "Sign-in did not complete.").slice(0, 200) : "";
}

// Remove ?code= (or an error redirect) so a reload does not try to reuse a spent PKCE code.
function stripAuthParams() {
  const url = new URL(window.location.href);
  const hasParams = ["code", "error", "error_description"].some((name) => url.searchParams.has(name));
  if (hasParams || url.hash) history.replaceState(history.state, "", url.pathname);
}

signInButton.addEventListener("click", async () => {
  if (!client) return;
  signInButton.disabled = true;
  authMessage.textContent = "Opening Google sign-in…";
  try {
    // The browser leaves for Google on success; only a failure to start comes back here.
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: REDIRECT_URL, queryParams: { hd: "umbc.edu" } }  // hd only pre-filters the account picker.
    });
    if (error) authMessage.textContent = "Sign-in could not start. Check the Supabase redirect URL list and your connection.";
  } catch {
    authMessage.textContent = "Sign-in could not start. Check the Supabase redirect URL list and your connection.";
  } finally {
    signInButton.disabled = false;
  }
});

signOutButton.addEventListener("click", async () => {
  if (!client) return;
  signOutButton.disabled = true;
  try {
    // Local scope ends this browser's session only. onAuthStateChange re-renders the page.
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) authMessage.textContent = "Sign-out did not finish. Check your connection and try again.";
  } catch {
    authMessage.textContent = "Sign-out did not finish. Check your connection and try again.";
  } finally {
    signOutButton.disabled = false;
  }
});

newDraftButton.addEventListener("click", () => {
  draftId = crypto.randomUUID();
  showDraft();
  lastRequest = null;  // The old request belongs to the old draft ID, so it can no longer be retried.
  clearFlags();
  showResult("info", "NEW DRAFT", "A new draft ID was created. Save sends it with the current field values.");
  renderButtons();
});

form.addEventListener("input", clearFlags);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || busy) return;
  clearFlags();
  const objectId = objectIdInput.value.trim();
  const outcome = form.elements.outcome.value;  // "" while neither radio button is selected.
  // Required-field checks only; the database owns every other rule and its errors are shown as-is.
  const missing = [];
  if (!objectId) missing.push([objectIdInput, "object ID"]);
  if (!typeInput.value) missing.push([typeInput, "inspection type"]);
  if (!outcome) missing.push([outcomeGroup, "outcome"]);
  if (missing.length) {
    missing.forEach(([element]) => flagField(element));
    focusField(missing[0][0]);
    showResult("error", "NOT SENT", `Fill in: ${missing.map(([, label]) => label).join(", ")}. Nothing was sent.`);
    return;
  }
  const request = {
    p_draft_id: draftId,
    p_source_item: SOURCE_ITEM,
    p_layer_id: LAYER_ID,
    p_object_id: objectId,
    p_inspection_type: typeInput.value,
    p_outcome: outcome,
    p_notes: notesInput.value,
    p_displayed_snapshot: { source: "auth-test page" }
  };
  lastRequest = structuredClone(request);
  await sendRequest(request);
});

retryButton.addEventListener("click", async () => {
  if (!client || busy || !lastRequest) return;
  clearFlags();
  await sendRequest(structuredClone(lastRequest));  // Same body, same draft ID, whatever the form shows now.
});

refreshButton.addEventListener("click", async () => {
  if (!client || busy) return;
  busy = true;
  renderButtons();
  try {
    await loadHistory(objectIdInput.value.trim());
  } finally {
    busy = false;
    renderButtons();
  }
});

async function start() {
  showDraft();
  showResult("info", "NO REQUEST YET", "Save an inspection to see the database reply here.");
  const url = String(settings.url || "").trim();
  const publishableKey = String(settings.publishableKey || "").trim();
  if (!url || !publishableKey) {
    authStatus.textContent = "Supabase setup required";
    authMessage.textContent = "Add the project URL and publishable key to supabase-config.js. Never add a service role key or a token.";
    renderButtons();
    return;
  }

  // Read any redirect error before supabase-js handles the URL.
  const redirectError = readAuthRedirectError();
  client = createClient(url, publishableKey, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true }
  });
  client.auth.onAuthStateChange((_event, session) => applySession(session));

  try {
    // Resolves after supabase-js has finished exchanging any ?code= from the redirect.
    const { data } = await client.auth.getSession();
    applySession(data.session);
  } catch {
    authStatus.textContent = "Not signed in";
    authMessage.textContent = "Could not restore the saved session. Sign in again.";
    renderButtons();
  }
  if (redirectError) {
    authMessage.textContent = redirectError;
    stripAuthParams();
  }
}

start();
