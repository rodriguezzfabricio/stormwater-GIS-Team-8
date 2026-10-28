#!/usr/bin/env python3
"""Remove only the decorative ArcGIS map card header from static-site/index.html."""
from pathlib import Path
import re
import shutil
import sys

page = Path.cwd() / "index.html"
if not page.is_file():
    sys.exit("ERROR: Run this from the static-site directory (index.html not found).")

before = page.read_text(encoding="utf-8")
# This matches exactly the map's decorative header, not the fullscreen toolbar
# or functional map/feature controls. A single-line match deliberately avoids
# crossing into any other HTML sections.
pattern = re.compile(
    r'(?m)^[ \t]*<div\s+class=["\']map-card-header["\']>\s*'
    r'<div\s+class=["\']map-card-title["\']>[^\r\n]*?'
    r'UMBC Stormwater Facilities[^\r\n]*?'
    r'<span\s+class=["\']map-tag["\']>LIVE ARCGIS DATA</span>\s*</div>[ \t]*\r?\n',
    re.IGNORECASE,
)
after, count = pattern.subn("", before)
if count == 0:
    if 'UMBC Stormwater Facilities' not in before and 'LIVE ARCGIS DATA' not in before:
        print("No change: the map header is already removed.")
        sys.exit(0)
    sys.exit("ERROR: Couldn't match the expected header. No changes made; please inspect index.html.")
if count != 1:
    sys.exit(f"ERROR: Found {count} header matches; expected exactly one. No changes made.")

backup = page.with_name("index.html.before-map-header-removal.bak")
if not backup.exists():
    shutil.copy2(page, backup)
page.write_text(after, encoding="utf-8")
print("Removed map card title/icon and LIVE ARCGIS DATA badge from index.html.")
print(f"Backup: {backup.name}")
