import {connectBmpSelection, connectInspectionBackend} from "./facility-ui.mjs";

// ArcGIS Maps SDK (CDN) integration for the static site. No iframe.
// The SDK owns OAuth and tokens; this app never reads or logs token values.
// The Supabase drop-in (inspection-backend.mjs) owns the inspector's sign-in:
// it is checked first, so signed-out visitors go to login.html before any
// ArcGIS redirect. This page is not one of the drop-in's signInPages, so
// ArcGIS's ?code= here never reaches Supabase.
const settings = window.STORMWATER_CONFIG || {};
const surface = document.getElementById("map-surface");
const placeholder = document.getElementById("map-placeholder");
const title = document.getElementById("map-status-title");
const description = document.getElementById("map-status-body");
const help = document.getElementById("map-status-help");
const signInButton = document.getElementById("arcgis-sign-in");
const accessDescription = document.getElementById("map-access-description");

// STORMWATER AUTH-FIRST GATE: require ArcGIS credentials before showing dashboard.
const authGate = document.getElementById("stormwater-auth-gate");
const authGateTitle = document.getElementById("stormwater-auth-title");
const authGateMessage = document.getElementById("stormwater-auth-message");
const LOGIN_INTENT_KEY = "umbc-stormwater.arcgis.signin";
const BACKEND_LOAD_FAILED = "Sign-in could not load. Check your connection and reload.";

// Top bar: who is signed in to save inspections (Supabase, not ArcGIS).
const accountEmail = document.getElementById("account-email");
const accountSignIn = document.getElementById("account-sign-in");
const accountSignOut = document.getElementById("account-sign-out");
let backend = null;

function setAuthGate(heading, message) {
  authGateTitle.textContent = heading;
  authGateMessage.textContent = message;
}
function failAuthGate(message) {
  authGate.classList.add("auth-failed");
  setAuthGate("Sign-in could not be completed", message);
}
function verifiedArcgisSession() {
  // Call only after checkSignInStatus(sharingUrl) resolves successfully.
  document.documentElement.classList.add("arcgis-authenticated");
  authGate.hidden = true;
}
function hasLoginIntent() {
  try { return sessionStorage.getItem(LOGIN_INTENT_KEY) === "1"; }
  catch { return false; }
}
function clearLoginIntent() {
  try { sessionStorage.removeItem(LOGIN_INTENT_KEY); } catch { /* Storage unavailable. */ }
}


/** Loads the drop-in and returns the signed-in @umbc.edu user. Anyone else is
 *  sent to login.html (the drop-in signs out non-UMBC accounts first). */
async function requireInspector() {
  const config = window.STORMWATER_SUPABASE;
  try {
    if (!config?.url || !config?.publishableKey) throw new Error("supabase-config.js is missing");
    backend = await import("./inspection-backend.mjs");
  } catch {
    failAuthGate(BACKEND_LOAD_FAILED);
    return null;
  }
  return backend.requireUser();
}

/** A session that ends here or in another tab only changes this text; the page and form stay. */
function showAccount(user) {
  accountEmail.textContent = user ? user.email : "Signed out";
  accountSignOut.hidden = !user;
  accountSignIn.hidden = Boolean(user);
}

function connectAccountBar(user) {
  showAccount(user);
  backend.onUserChange(showAccount);
  // Catches a sign-in finished in another tab.
  window.addEventListener("focus", async () => showAccount(await backend.getUser()));
  accountSignOut.addEventListener("click", async () => {
    accountSignOut.disabled = true;
    await backend.signOut();
    window.location.assign(new URL("./login.html", window.location.href).href);
  });
}

function showStatus(heading, message, hint = "You can expand this map within the website using the Full map control.") {
  title.textContent = heading;
  description.textContent = message;
  help.textContent = hint;
  placeholder.hidden = false;
}

async function start() {
  const inspector = await requireInspector();
  if (!inspector) return;  // Redirecting to login.html, or the gate shows why sign-in could not load.
  connectAccountBar(inspector);
  connectInspectionBackend(backend);  // Save and history in the inspection form.

  const clientId = String(settings.arcgisClientId || "").trim();
  if (!clientId) {
    failAuthGate("ArcGIS OAuth Client ID missing. Check arcgis-config.js.");
    showStatus(
      "One-time ArcGIS setup required",
      "The map is restricted to authorized users. Ask your UMBC ArcGIS administrator for an OAuth application Client ID, then add it to arcgis-config.js.",
      "Register http://localhost:5500/ as an approved redirect URL. Never add a client secret or access token."
    );
    accessDescription.textContent = "The in-page map needs a registered OAuth Client ID; fullscreen uses this same map.";
    return;
  }

  showStatus("Initializing ArcGIS", "Connecting to the ArcGIS Maps SDK…");
  try {
    // Register OAuth before creating the map component so the first
    // request to the secured WebMap uses the supported user-auth flow.
    const [esriConfig, identityManager, OAuthInfo] = await $arcgis.import([
      "@arcgis/core/config.js",
      "@arcgis/core/identity/IdentityManager.js",
      "@arcgis/core/identity/OAuthInfo.js"
    ]);
    esriConfig.portalUrl = settings.portalUrl || "https://www.arcgis.com";
    const oauth = new OAuthInfo({
      appId: clientId,
      portalUrl: esriConfig.portalUrl,
      popup: false,  // Full-page redirect avoids the iframe popup callback failure.
      flowType: "auto"  // ArcGIS Online uses authorization-code + PKCE.
    });
    identityManager.registerOAuthInfos([oauth]);
    const sharingUrl = `${oauth.portalUrl}/sharing`;

    async function showMap() {
      signInButton.hidden = true;
      showStatus("Loading campus map", "Loading UMBC's original WebMap and its saved layers…");
      const mapElement = document.createElement("arcgis-map");
      mapElement.setAttribute("item-id", settings.webMapId);
      mapElement.setAttribute("popup-disabled", ""); // The details sidebar replaces automatic map popups.
      mapElement.addEventListener("arcgisViewReadyError", () => {
        showStatus("ArcGIS map could not finish loading", "The map or an underlying layer may require more access. Confirm ArcGIS item and layer sharing permissions.");
      });
      const search = document.createElement("arcgis-search");
      search.slot = "top-right";
      // Search stays available. We intentionally omit the ArcGIS legend: the
      // bottom-left layer-name card is visual clutter, not a map facility.
      mapElement.append(search);
      surface.append(mapElement);
      try {
        await mapElement.viewOnReady();
        // Enable the website's details panel only after the SDK map is initialized.
        connectBmpSelection(mapElement, settings);
        placeholder.hidden = true;
        accessDescription.textContent = "Map connected. Click a BMP tag to fill facility details and the inspection form.";
      } catch (error) {
        // Do not log SDK errors indiscriminately: auth redirects could expose tokens.
        showStatus("Unable to display the secured map", "Check the registered OAuth redirect URL, UMBC sharing permissions, and browser developer console.");
      }
    }

    // The login page stores a one-time sign-in intent, not a password.
    const requestedByLoginPage = hasLoginIntent();
    setAuthGate("Verifying your ArcGIS session", "Checking your authorized UMBC / ArcGIS account…");
    try {
      await identityManager.checkSignInStatus(sharingUrl);
    } catch {
      if (!requestedByLoginPage) {
        // Direct navigation without a valid session returns to the login page.
        window.location.replace(new URL("./login.html", window.location.href).href);
        return;
      }
      clearLoginIntent();
      setAuthGate("Opening secure UMBC sign-in", "Authenticate with ArcGIS, then return to the website.");
      try {
        // OAuthInfo already specifies popup:false; the SDK manages this redirect.
        await identityManager.getCredential(sharingUrl);
        // A successful redirect alone is insufficient: verify the ArcGIS credential.
        await identityManager.checkSignInStatus(sharingUrl);
      } catch {
        failAuthGate("ArcGIS sign-in was canceled or failed. Return to login and try again.");
        return;
      }
    }
    clearLoginIntent();
    verifiedArcgisSession();
    await showMap();
  } catch {
    failAuthGate("ArcGIS could not initialize. Check your internet connection and retry.");
    showStatus("Could not initialize ArcGIS", "Verify your internet connection and that the ArcGIS SDK CDN can load. Check the ArcGIS connection or sign-in settings and reload this page.");
  }
}

start();
