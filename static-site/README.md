# UMBC Stormwater GIS — Login form spacing patch

This layout-only patch fixes the Password label appearing immediately below the UMBC email input. It adds **24px** of spacing before the Password label, standardizes **8px** label-to-input spacing, and makes both inputs align at 100% width. No HTML or authentication code is modified.

## Install in WSL Kali

1. Download the ZIP in Windows.
2. From the `static-site` directory, extract and apply:

```bash
cd ~/stormwater/stormwater-GIS-Team-8/static-site
unzip -o /mnt/c/Users/taivu/Downloads/umbc-stormwater-login-spacing-patch.zip -d .
python3 apply-login-spacing.py
```

3. Open `http://localhost:5500/login.html?v=spacing1` in your Windows browser, or use `Ctrl+Shift+R` to force a reload.

The script saves the original CSS as `login.css.before-spacing.bak` the first time it runs. It can safely be run again.

## Commit if tested

```bash
git add login.css
git commit -m "Fix spacing and alignment of login fields"
git push
```

Do not commit the `.bak` backup or the one-off script unless your team wants to keep them. No changes to `login.html`, `login.js`, or ArcGIS configuration are needed.
