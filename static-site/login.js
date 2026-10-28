// Sign-in page: Google (UMBC accounts only) through the Supabase drop-in, then
// the dashboard at ./, where map.js runs the ArcGIS check. Google returns here
// (login.html is the drop-in's sign-in page), never to the dashboard, so the
// dashboard's ?code= always belongs to ArcGIS.
// Never log sessions, tokens or raw auth errors.
const LOGIN_INTENT_KEY = "umbc-stormwater.arcgis.signin";
const LOAD_FAILED = "Sign-in could not load. Check your connection and reload.";
const NOT_COMPLETED = "Sign-in did not complete. Try again.";

const byId = id => document.getElementById(id);
const message = byId("login-message");
const googleButton = byId("google-sign-in");
const signedIn = byId("signed-in");
const signedInEmail = byId("signed-in-email");
const continueButton = byId("continue");
const signOutButton = byId("sign-out");

function say(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("login-error", isError);
}

function showSignedOut() {
  signedIn.hidden = true;
  googleButton.hidden = false;
  googleButton.disabled = false;
}

function showSignedIn(user) {
  signedInEmail.textContent = user.email;
  signedIn.hidden = false;
  googleButton.hidden = true;
}

function goToDashboard() {
  try {
    // Only a one-time flag: map.js reads it and starts the ArcGIS sign-in.
    sessionStorage.setItem(LOGIN_INTENT_KEY, "1");
  } catch {
    say("Couldn't continue. Enable session storage and try again.", true);
    return;
  }
  // http://localhost:5500/ is the registered ArcGIS OAuth redirect URL.
  window.location.assign(new URL("./", window.location.href).href);
}

async function start() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const returning = query.has("code");
  const failed = ["error", "error_description"].some(name => query.has(name) || hash.has(name));
  // Read before finishSignIn() removes it from the address bar.
  const failure = (query.get("error_description") || hash.get("error_description") || NOT_COMPLETED).slice(0, 200);
  if (returning && !failed) say("Finishing sign-in…");

  let backend;
  try {
    if (!window.STORMWATER_SUPABASE) throw new Error("supabase-config.js is missing");
    backend = await import("./inspection-backend.mjs");
  } catch {
    say(LOAD_FAILED, true);
    return;
  }

  googleButton.addEventListener("click", async () => {
    googleButton.disabled = true;
    say("Opening Google sign-in…");
    const started = await backend.signInWithGoogle();  // leaves for Google, then returns here
    if (!started.ok) {
      say(started.message, true);
      googleButton.disabled = false;
    }
  });
  continueButton.addEventListener("click", goToDashboard);
  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    await backend.signOut();
    signOutButton.disabled = false;
    say("Signed out.");
    showSignedOut();
  });

  const done = await backend.finishSignIn();
  // A reason left by another page, such as a non-UMBC account that was signed out.
  const notice = backend.takeSignInMessage();
  if (failed) {
    say(failure, true);
    if (done.user) showSignedIn(done.user);
    else showSignedOut();
    return;
  }
  if (notice) {
    say(notice, true);
    showSignedOut();
    return;
  }
  if (returning) {
    if (done.user) goToDashboard();  // "Finishing sign-in…" stays up while the page changes.
    else {
      say(NOT_COMPLETED, true);
      showSignedOut();
    }
    return;
  }
  if (done.user) showSignedIn(done.user);
  else showSignedOut();
}

start();
