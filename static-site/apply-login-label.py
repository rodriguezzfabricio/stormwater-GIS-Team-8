#!/usr/bin/env python3
"""Simplify the stormwater sign-in labels; preserve current authentication logic."""
from pathlib import Path
import re
import shutil

html_path = Path(__file__).resolve().parent / 'login.html'
if not html_path.exists():
    raise SystemExit('ERROR: login.html not found. Extract this patch into your static-site folder.')
original = html_path.read_text(encoding='utf-8')
updated = original

# The demonstration label should look exactly like the UMBC email label.
updated, replaced = re.subn(
    r'<label\b[^>]*\bfor\s*=\s*["\']password["\'][^>]*>\s*Password\s*(?:<span\b[^>]*>\s*\(demo\)\s*</span>)?\s*</label>',
    '<label class="password-label" for="password">Password</label>',
    updated,
    flags=re.IGNORECASE,
)
if replaced != 1:
    raise SystemExit('ERROR: Cannot identify the single password label. No file was modified.')

# Remove only the email demo note between the fields; keep the general
# warning further down the page not to enter a real UMBC password.
updated = re.sub(
    r'^[ \t]*<p\b[^>]*class\s*=\s*["\'][^"\']*\binput-hint\b[^"\']*["\'][^>]*>\s*Your email is checked for format only\.\s*</p>\s*\n',
    '',
    updated,
    flags=re.IGNORECASE | re.MULTILINE,
)

if updated != original:
    backup_path = html_path.with_name('login.html.before-password-label.bak')
    shutil.copy2(html_path, backup_path)
    html_path.write_text(updated, encoding='utf-8')
    print('Updated login.html: Password label matches UMBC email; removed email-format hint.')
    print('Backup:', backup_path.name)
else:
    print('Already updated; no changes needed.')
print('Login authentication logic was not changed.')
