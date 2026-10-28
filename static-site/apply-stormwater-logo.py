#!/usr/bin/env python3
"""Apply the user's blue stormwater logo to the current static-site in place."""
from pathlib import Path
import re
import shutil
import sys

site = Path.cwd()
index = site / "index.html"
asset = site / "assets/stormwater-logo.png"
css = site / "brand-logo.css"
if not index.is_file() or not asset.is_file() or not css.is_file():
    sys.exit("ERROR: Run from your static-site folder after extracting the ZIP here.")

html = index.read_text(encoding="utf-8")
new_brand = ('<span class="brand-mark" aria-hidden="true">'
             '<img class="brand-logo-image" src="assets/stormwater-logo.png" '
             'alt="" width="50" height="50"></span>')
if 'class="brand-logo-image"' not in html:
    html, count = re.subn(
        r'<span\s+class="brand-mark"[^>]*>\s*<svg\b[^>]*>\s*<use\b[^>]*href="#i-drop"[^>]*>\s*</use>\s*</svg>\s*</span>',
        new_brand, html, count=1,
        flags=re.IGNORECASE,
    )
    if count != 1:
        sys.exit("ERROR: Sidebar brand markup is different. No files changed.")

if '<link rel="stylesheet" href="brand-logo.css">' not in html:
    if '</head>' not in html:
        sys.exit("ERROR: Could not locate </head>. No files changed.")
    html = html.replace('</head>', '  <link rel="stylesheet" href="brand-logo.css">\n</head>', 1)

if html != index.read_text(encoding="utf-8"):
    backup = site / 'index.html.before-logo'
    if not backup.exists():
        shutil.copy2(index, backup)
    index.write_text(html, encoding="utf-8")
    print("Logo installed. Original index.html backed up as index.html.before-logo")
else:
    print("Logo was already installed; no changes needed.")
print("Refresh http://localhost:5500/ using Ctrl+Shift+R")
