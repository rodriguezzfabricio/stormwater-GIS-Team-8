# UMBC Stormwater — One-login ArcGIS OAuth patch

This replaces the old fake local email/password check with a single button to start the **same ArcGIS OAuth flow already used by your GIS map**.

## Install in Kali WSL

```bash
cd ~/stormwater/stormwater-GIS-Team-8/static-site
unzip -o /mnt/c/Users/taivu/Downloads/umbc-stormwater-one-login-patch.zip -d .
python3 apply-one-login.py
```

Ensure the Python server is running from this folder at **http://localhost:5500/**. Visit **http://localhost:5500/login.html** and click **Continue with UMBC / ArcGIS**.

1. `login.js` sets a one-time **boolean** login intent in sessionStorage and navigates to the registered root URL `/`.
2. `map.js` registers ArcGIS OAuth, detects the intent, and calls `IdentityManager.getCredential()` only if there is not already a valid session.
3. ArcGIS/UMBC handles credentials and redirects to `http://localhost:5500/`, where the existing `checkSignInStatus()` loads the map without a second login.

Only the root redirect URI `http://localhost:5500/` is required (the one you have already registered). `arcgis-config.js` remains unchanged. All map and inspection features are retained.

## Limitations

- The ArcGIS OAuth account must be authorized to see the private WebMap and layers.
- This patch provides ArcGIS single sign-on for the GIS view. It does **not** implement server-enforced authorization for the static HTML dashboard or establish a Supabase session. A backend/server guard is needed to protect inspection records and roles in production.
- Do not enter your real UMBC password into a form served by this local application. Sign in through the real ArcGIS/UMBC identity-provider screen only.
- Sign-in can recur when sessions expire or after browser privacy settings clear site data.
- Live institutional OAuth can only be verified with your own authorized browser session.

For GitHub: stage `login.html`, `login.css`, `login.js`, `map.js`, and possibly `assets/stormwater-logo.png` if new. Avoid adding `*.bak`, the installer, or its `payload` directory unless desired. Remove temporary installer files after application if preferred.
