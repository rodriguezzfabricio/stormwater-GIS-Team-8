/** Drop-in connection to the Supabase back end: Google sign-in (UMBC only),
 *  saving inspections, and the signed-in inspector's history.
 *  How to use it: static-site/BACKEND-GUIDE.md. Every function returns a
 *  result with a ready-to-show English `message`; none of them throw.
 *  supabase-js owns the session; this file never reads, prints or logs tokens.
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";
import {
  featureRef, snapshotOf, readFields, buildSaveArgs, checkFields, explainError, savedResult, historyRow
} from "./inspection-backend-core.mjs";

const settings = window.STORMWATER_SUPABASE || {};
const signInPages = settings.signInPages || ["login.html"];
const currentPage = location.pathname.split("/").pop() || "index.html";
const onSignInPage = signInPages.includes(currentPage);

// Only sign-in pages read ?code= from the URL. index.html also receives
// ArcGIS's own ?code=, which must never reach Supabase (and vice versa).
const client = settings.url && settings.publishableKey
  ? createClient(settings.url, settings.publishableKey, {
    auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: onSignInPage }
  })
  : null;
const NOT_CONFIGURED = "The back end is not set up on this page: load supabase-config.js before inspection-backend.mjs.";

function pageUrl(page) {
  return new URL(page, location.href).href.split(/[?#]/)[0];
}

/** The signed-in user as { email }, or null. */
export async function getUser() {
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    const email = data.session?.user?.email;
    return email ? { email } : null;
  } catch {
    return null;
  }
}

/** Sends the browser to Google. It comes back to the sign-in page. */
export async function signInWithGoogle() {
  if (!client) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      // hd only pre-filters Google's account picker; the database does the real check.
      options: { redirectTo: pageUrl(onSignInPage ? currentPage : signInPages[0]), queryParams: { hd: "umbc.edu" } }
    });
    if (!error) return { ok: true, message: "Opening Google sign-in…" };
  } catch {
    // Fall through to the message below.
  }
  return { ok: false, message: "Could not open Google sign-in. Check your connection and try again." };
}

/** Call once when the sign-in page loads. Finishes the return from Google. */
export async function finishSignIn() {
  if (!client) return { ok: false, user: null, message: NOT_CONFIGURED };
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  // A rejected sign-up comes back as text such as "Only @umbc.edu accounts can sign up."
  const failed = query.get("error_description") || hash.get("error_description") ||
    (query.get("error") || hash.get("error") ? "Sign-in did not complete. Try again." : "");
  const user = await getUser();
  if (query.has("code") || failed || location.hash) window.history.replaceState(window.history.state, "", location.pathname);
  if (user) return { ok: true, user, message: `Signed in as ${user.email}.` };
  return { ok: false, user: null, message: failed.slice(0, 200) };
}

/** Call at the top of a protected page. Signed-out visitors go to the sign-in page. */
export async function requireUser() {
  const user = await getUser();
  // Without config, stay put: redirecting would loop, and the page shows NOT_CONFIGURED on use.
  if (!user && client) location.replace(pageUrl(signInPages[0]));
  return user;
}

export async function signOut() {
  if (!client) return { ok: true, message: "Signed out." };
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // The local session is cleared either way.
  }
  return { ok: true, message: "Signed out." };
}

/** Runs callback(user or null) whenever sign-in state changes. Returns a stop function. */
export function onUserChange(callback) {
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    const email = session?.user?.email;
    // Deferred: awaiting another Supabase call inside this callback can deadlock supabase-js.
    setTimeout(() => callback(email ? { email } : null), 0);
  });
  return () => data.subscription.unsubscribe();
}

/** Start one inspection for the selected ArcGIS graphic. Call it again for each new
 *  inspection or newly selected BMP. Then call draft.save(form) from the Save button.
 *  Pressing Save again after "not confirmed" is the retry: it never makes a duplicate.
 */
export function startInspection(graphic) {
  const ref = featureRef(graphic);
  const snapshot = snapshotOf(graphic);
  const id = crypto.randomUUID();
  let inFlight = null;
  let confirmed = null;
  let unconfirmed = false;  // The last attempt got no reply; it may already be saved.

  async function send(args) {
    let data = null;
    let error = null;
    let status = 0;
    try {
      ({ data, error, status } = await client.rpc("create_inspection", args));
    } catch {
      // Network failure: handled as "not confirmed" below.
    }
    const row = Array.isArray(data) ? data[0] : null;
    if (!error && row?.id) {
      unconfirmed = false;
      confirmed = savedResult(row, row.replayed === true);
      return confirmed;
    }
    const result = explainError(error, status, "save");
    if (result.kind === "draft_conflict" && unconfirmed) {
      // The earlier "not confirmed" attempt did arrive, with the values from that time.
      confirmed = { ok: true, recordId: id, savedAt: "", alreadySaved: true,
        message: "Your earlier save did go through, with the values you had then. To record changes, start a new inspection." };
      unconfirmed = false;
      return confirmed;
    }
    unconfirmed = unconfirmed || result.maybeSaved;
    return result;
  }

  return {
    id,
    feature: ref.ok ? { sourceItem: ref.sourceItem, layerId: ref.layerId, objectId: ref.objectId } : null,
    /** input: the inspection <form>, or { inspectionType, outcome, notes }. */
    save(input) {
      if (confirmed) {
        return Promise.resolve({ ...confirmed, alreadySaved: true,
          message: `Already saved (record ${confirmed.recordId}). Start a new inspection to record another one.` });
      }
      if (inFlight) return inFlight;  // Double clicks send one request.
      if (!client) return Promise.resolve({ ok: false, kind: "not_configured", field: "", maybeSaved: false, message: NOT_CONFIGURED });
      if (!ref.ok) return Promise.resolve({ ok: false, kind: "unknown_source", field: "", maybeSaved: false, message: ref.message });
      const args = buildSaveArgs(id, ref, readFields(input), snapshot);
      const problem = checkFields(args);
      if (problem) return Promise.resolve(problem);
      inFlight = send(args).finally(() => { inFlight = null; });
      return inFlight;
    }
  };
}

/** The signed-in inspector's own inspections of one BMP, newest first.
 *  (Not named "history": that would hide window.history inside this module.) */
export async function myInspections(graphic, limit = 50) {
  const ref = featureRef(graphic);
  if (!client) return { ok: false, rows: [], message: NOT_CONFIGURED };
  if (!ref.ok) return { ok: false, rows: [], message: ref.message };
  try {
    const { data, error, status } = await client.rpc("my_inspections", {
      p_source_item: ref.sourceItem, p_layer_id: ref.layerId, p_object_id: ref.objectId, p_limit: limit
    });
    if (error) return { ok: false, rows: [], message: explainError(error, status, "load").message };
    const rows = (Array.isArray(data) ? data : []).map(historyRow);
    return { ok: true, rows, message: rows.length ? "" : "You have not inspected this BMP yet." };
  } catch {
    return { ok: false, rows: [], message: explainError(null, 0, "load").message };
  }
}

/** Is the selected graphic one the database accepts? { ok, message } with no network call. */
export function checkFeature(graphic) {
  const ref = featureRef(graphic);
  return ref.ok ? { ok: true, message: `BMP object ${ref.objectId} can be inspected.` } : { ok: false, message: ref.message };
}
