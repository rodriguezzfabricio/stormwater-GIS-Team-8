#!/usr/bin/env python3
"""Apply one-login ArcGIS OAuth flow to current static-site without replacing map.js."""
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parent
payload = root / "payload"
map_file = root / "map.js"
if not map_file.is_file():
    print("ERROR: Run this in the static-site folder containing map.js and index.html.", file=sys.stderr)
    sys.exit(1)
if not (root / "index.html").is_file():
    print("ERROR: index.html is missing; no files were changed.", file=sys.stderr)
    sys.exit(1)

text = map_file.read_text(encoding="utf-8")
anchor = "    try {\n      await identityManager.checkSignInStatus(sharingUrl);\n      await showMap();"
marker = "// START SINGLE UMBC/ARCGIS SIGN-IN HANDOFF"
if marker not in text and text.count(anchor) != 1:
    print("ERROR: map.js has changed. Could not find the expected ArcGIS login flow. No files were changed.", file=sys.stderr)
    sys.exit(1)

handoff = """    // START SINGLE UMBC/ARCGIS SIGN-IN HANDOFF
    // login.html stores a one-time login *intent* and navigates to /.
    // This page owns OAuth, so the registered callback remains http://localhost:5500/.
    const loginIntentKey = "umbc-stormwater.arcgis.signin";
    if (sessionStorage.getItem(loginIntentKey) === "1") {
      sessionStorage.removeItem(loginIntentKey); // Never loop after an OAuth redirect.
      try {
        // Reuse an existing ArcGIS session when already signed in.
        await identityManager.checkSignInStatus(sharingUrl);
      } catch {
        showStatus("Signing in with UMBC / ArcGIS", "Opening your organization's secure sign-in page…");
        try {
          // OAuth (PKCE) is handled by Esri; no password or token passes through our form.
          // The SDK may navigate away to ArcGIS and return to this same root URL.
          await identityManager.getCredential(sharingUrl);
        } catch {
          showStatus("Sign-in was not completed", "Use the ArcGIS sign-in option to try again.");
          signInButton.hidden = false;
          accessDescription.textContent = "ArcGIS sign-in was canceled or could not complete.";
          return;
        }
      }
    }
    // END SINGLE UMBC/ARCGIS SIGN-IN HANDOFF

"""
if marker not in text:
    text = text.replace(anchor, handoff + anchor)

# Back up existing files before applying changes; never touch arcgis-config.js.
for name in ("map.js", "login.html", "login.js", "login.css"):
    path=root/name
    if path.is_file():
        backup=path.with_suffix(path.suffix+".before-one-login.bak")
        if not backup.exists():
            shutil.copy2(path, backup)
map_file.write_text(text, encoding="utf-8")
for name in ("login.html", "login.js", "login.css"):
    shutil.copy2(payload / name, root / name)
logo = root / "assets" / "stormwater-logo.png"
if not logo.exists():
    logo.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(payload / "stormwater-logo.png", logo)

print("SUCCESS: Login now uses the existing ArcGIS OAuth sign-in.")
print("No changes to arcgis-config.js or your WebMap/BMP code.")
print("Start the server here and open http://localhost:5500/login.html")
