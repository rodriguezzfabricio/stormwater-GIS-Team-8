#!/usr/bin/env python3
"""Idempotent layout-only spacing patch for the UMBC Stormwater login form."""
from pathlib import Path
import re
import shutil

root = Path(__file__).resolve().parent
css_path = root / "login.css"
html_path = root / "login.html"
if not css_path.is_file() or not html_path.is_file():
    raise SystemExit("ERROR: Put this script inside static-site with login.css and login.html.")
html = html_path.read_text(encoding="utf-8")
for input_id in ("email", "password"):
    if not re.search(rf'<input\b[^>]*\bid\s*=\s*["\']{input_id}["\']', html, re.I | re.S):
        # Input may be split across multiple lines; generic regex still matches.
        raise SystemExit(f"ERROR: login.html is missing the {input_id} field. Not modifying CSS.")

start = "/* BEGIN UMBC LOGIN FIELD SPACING */"
end = "/* END UMBC LOGIN FIELD SPACING */"
addition = f"""{start}
/* Keep both form fields aligned and separate each label from the previous input. */
#login-form label[for="email"],
#login-form label[for="password"] {{
    display: block;
    margin-bottom: 8px;
    line-height: 1.35;
}}

#login-form label[for="password"] {{
    margin-top: 24px;
}}

#login-form input#email,
#login-form input#password {{
    display: block;
    width: 100%;
    margin-top: 0;
}}
{end}"""
css = css_path.read_text(encoding="utf-8")
if start in css or end in css:
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    if not pattern.search(css):
        raise SystemExit("ERROR: Partial spacing patch found in CSS; please inspect it manually.")
    updated = pattern.sub(lambda _: addition, css)
else:
    updated = css.rstrip() + "\n\n" + addition + "\n"
if updated != css:
    backup = root / "login.css.before-spacing.bak"
    if not backup.exists():
        shutil.copy2(css_path, backup)
    css_path.write_text(updated, encoding="utf-8")
    print("SUCCESS: Updated login.css with consistent email/password spacing.")
    print("Backup:", backup.name)
else:
    print("Already up to date; no CSS changes needed.")
print("No HTML, JavaScript, login, or ArcGIS authentication behavior changed.")
