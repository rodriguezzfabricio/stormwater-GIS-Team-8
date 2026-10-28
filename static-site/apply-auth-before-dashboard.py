#!/usr/bin/env python3
"""Patch the existing static-site to require a verified ArcGIS session before showing the dashboard."""
from pathlib import Path
import re, shutil, sys

page = Path('index.html')
map_file = Path('map.js')
if not page.is_file() or not map_file.is_file():
    sys.exit('ERROR: Run this inside static-site/ (index.html and map.js must be present).')
html = page.read_text(encoding='utf-8')
js = map_file.read_text(encoding='utf-8')
HTML_MARKER = 'id="stormwater-auth-gate"'
JS_MARKER = '// STORMWATER AUTH-FIRST GATE'
if HTML_MARKER in html or JS_MARKER in js:
    if HTML_MARKER in html and JS_MARKER in js:
        print('Already installed; no changes required.')
        sys.exit(0)
    sys.exit('ERROR: Only one auth gate marker exists; refusing partial update.')
if not all(x in html.lower() for x in ('</head>', '<body')):
    sys.exit('ERROR: Unexpected index.html structure; no changes made.')
if ('    signInButton.addEventListener("click"' not in js
    or '\n  } catch {\n    showStatus("Could not initialize ArcGIS"' not in js
    or 'const accessDescription = document.getElementById("map-access-description");' not in js):
    sys.exit('ERROR: map.js login flow differs from the expected existing version. Nothing modified.')

css = """<style id="stormwater-auth-gate-style">
  /* Load before app scripts. Keep dashboard invisible until verified. */
  html:not(.arcgis-authenticated) body > :not(#stormwater-auth-gate) { display: none !important; }
  #stormwater-auth-gate[hidden] { display: none !important; }
  #stormwater-auth-gate { min-height: 100vh; display: flex; flex-direction: column;
    justify-content: center; align-items: center; gap: 14px; text-align: center;
    padding: 28px; background: #f3f6fb; color: #142b48;
    font-family: Arial, Helvetica, sans-serif; }
  #stormwater-auth-gate .auth-badge { width: 62px; height: 62px; border-radius: 18px;
    background: #e4effb; display: grid; place-items: center; overflow: hidden; }
  #stormwater-auth-gate .auth-badge img { width: 52px; height: 52px; object-fit: contain; }
  #stormwater-auth-gate .auth-spinner { width: 26px; height: 26px;
    border: 3px solid #cad6e3; border-top-color: #2678bc; border-radius: 50%;
    animation: stormwater-spin .85s linear infinite; }
  #stormwater-auth-gate.auth-failed .auth-spinner { display: none; }
  #stormwater-auth-gate h1 { margin: 0; font-size: 23px; }
  #stormwater-auth-gate p { margin: 0; max-width: 440px; line-height: 1.55; color: #5c7186; }
  #stormwater-auth-gate a { margin-top: 14px; font-size: 14px; font-weight: 700; color: #1764a3; }
  @keyframes stormwater-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { #stormwater-auth-gate .auth-spinner { animation: none; } }
</style>"""

panel = """
  <!-- ArcGIS authentication gate: only shown while the dashboard is locked. -->
  <div id="stormwater-auth-gate" role="status" aria-live="polite">
    <div class="auth-badge"><img src="assets/stormwater-logo.png" alt="" aria-hidden="true"></div>
    <div class="auth-spinner" aria-hidden="true"></div>
    <h1 id="stormwater-auth-title">Verifying your ArcGIS session</h1>
    <p id="stormwater-auth-message">Your campus dashboard will appear after UMBC / ArcGIS authentication completes.</p>
    <a href="login.html">Back to sign-in</a>
  </div>
"""
html, n1 = re.subn(r'</head>', css + '\n</head>', html, count=1, flags=re.I)
html, n2 = re.subn(r'(<body(?:\s[^>]*)?>)', lambda m: m.group(1) + panel, html, count=1, flags=re.I)
if n1 != 1 or n2 != 1:
    sys.exit('ERROR: Could not install auth-gate HTML; no files changed.')

helpers = '''
// STORMWATER AUTH-FIRST GATE: require ArcGIS credentials before showing dashboard.
const authGate = document.getElementById("stormwater-auth-gate");
const authGateTitle = document.getElementById("stormwater-auth-title");
const authGateMessage = document.getElementById("stormwater-auth-message");
const LOGIN_INTENT_KEY = "umbc-stormwater.arcgis.signin";

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
'''
js = js.replace('const accessDescription = document.getElementById("map-access-description");',
                'const accessDescription = document.getElementById("map-access-description");\n' + helpers, 1)
js = js.replace('  if (!clientId) {',
                '  if (!clientId) {\n    failAuthGate("ArcGIS OAuth Client ID missing. Check arcgis-config.js.");', 1)
start = js.index('    signInButton.addEventListener("click"')
end = js.index('\n  } catch {\n    showStatus("Could not initialize ArcGIS"', start)
replacement = '''    // The login page stores a one-time sign-in intent, not a password.
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
    await showMap();'''
js = js[:start] + replacement + js[end:]
js = js.replace('  } catch {\n    showStatus("Could not initialize ArcGIS",',
                '  } catch {\n    failAuthGate("ArcGIS could not initialize. Check your internet connection and retry.");\n    showStatus("Could not initialize ArcGIS",', 1)

for file in (page, map_file):
    backup = file.with_name(file.name + '.before-auth-first.bak')
    if not backup.exists():
        shutil.copy2(file, backup)
page.write_text(html, encoding='utf-8')
map_file.write_text(js, encoding='utf-8')
print('SUCCESS: Dashboard remains hidden until ArcGIS authentication is verified.')
print('Changed index.html and map.js only. Login page, OAuth configuration and map features remain untouched.')
