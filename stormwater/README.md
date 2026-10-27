# UMBC Stormwater GIS — static ArcGIS SDK authentication edition

The original iframe fails in Chrome after UMBC sign-in: an ArcGIS OAuth callback
popup opens but the embedded map stays white. This edition **removes the iframe**
and loads UMBC's actual WebMap through the official ArcGIS Maps SDK for JavaScript
v5.1 using OAuth user authentication. It is **still HTML + CSS + vanilla JS**.

## Quick start (Kali Linux / WSL)

1. Extract this ZIP to a **new folder** first so your existing project remains safe.
2. From that folder:

   ```bash
   python3 -m http.server 5500
   ```

   If the port is busy, choose a free port and register the matching redirect URL.
3. Go to http://localhost:5500/
4. The website loads and explains that one-time OAuth setup is needed.
   The **Open full map** button remains usable before setup.

## Required one-time OAuth configuration

Ask a UMBC ArcGIS organization administrator (or authorized team member) to
create **OAuth 2.0 credentials for user authentication** in the ArcGIS Online
organization. You need permission to create such credentials.

- Add redirect URL: `http://localhost:5500/` (exact origin, port, and trailing slash).
- Copy the public **Client ID / Application ID** (NOT client secret).
- Open `arcgis-config.js` and set `arcgisClientId: "YOUR_ID"`.
- Reload and choose **Sign in to ArcGIS**. Authentication redirects the **top-level
  page** to ArcGIS and back to localhost; no iframe OAuth callback is used.
- Sign in with your UMBC ArcGIS account. The SDK loads the exact WebMap item
  `d59cb5cc77914e6c96631b856c667129` using the permitted user access.
- If redirect URI errors appear, make sure the full site URL is registered and
  that the URL in the address bar matches it (127.0.0.1 and localhost differ).
- If the map loads but individual layers do not, have the administrator verify
  *each layer's* group/organization sharing rules as well as the map's.

**Security:** Never put passwords, client secrets or access tokens in any static
file, source-control commit, or screenshot. The OAuth client ID is intended to be
public. ArcGIS IdentityManager handles tokens internally.

Esri reference:
https://developers.arcgis.com/javascript/latest/sample-code/identity-oauth-component/

OAuth registration:
https://doc.arcgis.com/en/arcgis-online/manage-data/add-app-url.htm

## Files

- `index.html`: page markup and SDK-map container, no iframe
- `styles.css`: original responsive design plus map states
- `arcgis-config.js`: client ID, ArcGIS portal, existing WebMap item ID
- `map.js`: SDK OAuth registration, sign-in, map loading and error handling
- `start-local.sh` / `start-local.bat`: optional local launchers

## Not yet part of this static proof-of-concept

The facility details panel and inspection form are still mock UI; selecting a
real map feature does not yet update the panel, and records are not stored.

## Verification scope

Static files, JavaScript syntax, and local HTTP response are checked before
packaging. Actual secured ArcGIS login and WebMap rendering cannot be tested
without an approved Client ID and authorized UMBC sign-in.
