#!/usr/bin/env python3
"""In-place, idempotent UI terminology update. Run from the static-site folder.

Changes only user-visible wording; never changes ArcGIS identifiers,
map functionality, OAuth configuration, or source data.
"""
from pathlib import Path
import re
import shutil
import sys

DIR = Path.cwd()
HTML_FILE = DIR / 'index.html'
JS_FILE = DIR / 'facility-ui.mjs'

if not HTML_FILE.is_file() or not JS_FILE.is_file():
    print('ERROR: Run this script inside the static-site folder containing index.html and facility-ui.mjs.')
    sys.exit(1)

# Match only complete English words, not identifiers or 'drainage'.
WORD = re.compile(r'(?<![\w-])drains?(?![\w-])', re.IGNORECASE)


def rename_words(s):
    def replace(m):
        return 'BMPs' if m.group(0).lower() == 'drains' else 'BMP'
    return WORD.sub(replace, s)


def update_html(s):
    # Remove ONLY the yellow inspection-preview status badge, not the truthful
    # form description that inspections are not persisted yet.
    s, count = re.subn(
        r'<span\b[^>]*\bclass=[\"\']preview-pill[\"\'][^>]*>\s*'
        r'(?:<span\b[^>]*>\s*</span>\s*)?'
        r'UI\s+ONLY\s*[·•\-]\s*NOT\s+SAVED\s*</span>',
        '', s, flags=re.IGNORECASE
    )

    # Transform visible text nodes + assistive UI attributes, preserving source
    # code IDs, class names, links, scripts, data keys, and HTML formatting.
    tokens = re.split(r'(<[^>]*>)', s)
    out = []
    inline_code = None
    attr = re.compile(r'\b(aria-label|aria-description|title|placeholder|alt)=("[^"]*"|\'[^\']*\')', re.IGNORECASE)
    for token in tokens:
        if token.startswith('<') and token.endswith('>'):
            tag = token.lstrip('<!/ ').split(None, 1)[0].strip('/> ').lower()
            if tag in ('script', 'style'):
                if token.startswith('</'):
                    inline_code = None
                elif not token.endswith('/>'):
                    inline_code = tag
            def attribute_replacer(m):
                return m.group(1) + '=' + m.group(2)[0] + rename_words(m.group(2)[1:-1]) + m.group(2)[-1]
            token = attr.sub(attribute_replacer, token)
            out.append(token)
        elif inline_code:
            out.append(token)
        else:
            out.append(rename_words(token))
    s = ''.join(out)
    # User explicitly requested the exact singular label (not 'BMPs').
    s = s.replace('All available BMPs', 'All available BMP')
    return s, count


def update_js(s):
    # Change only known interface text. Local variable names, exports and
    # ArcGIS feature retrieval remain identical to the working version.
    replacements = {
        'Select a drain to pre-fill the form. Selecting another drain starts a new draft.':
            'Select a BMP to pre-fill the form. Selecting another BMP starts a new draft.',
        'Core facility fields are locked to ArcGIS values. Other inspection fields can be edited. Selecting another drain starts a new draft.':
            'Core facility fields are locked to ArcGIS values. Other inspection fields can be edited. Selecting another BMP starts a new draft.',
        'Loading available drains…': 'Loading available BMPs…',
        'Select a campus drain…': 'Select a campus BMP…',
        'Drain list unavailable': 'BMP list unavailable',
        'Unable to load the drain list from ArcGIS. Map-marker selection is still available.':
            'Unable to load the BMP list from ArcGIS. Map-marker selection is still available.',
        'No BMP feature was found at this point. Select a drain by name or click a blue BMP marker.':
            'No BMP feature was found at this point. Select a BMP by name or click a blue BMP marker.',
        'const noun = drains.length === 1 ? "drain" : "drains";':
            'const noun = drains.length === 1 ? "BMP" : "BMPs";',
    }
    for old, new in replacements.items():
        s = s.replace(old, new)
    return s


def write_if_changed(path, before, after):
    if before == after:
        print(f'{path.name}: already updated / no change needed')
        return False
    backup = path.with_name(path.name + '.before-bmp-terminology.bak')
    if not backup.exists():
        shutil.copy2(path, backup)
    path.write_text(after, encoding='utf-8')
    print(f'{path.name}: updated (backup: {backup.name})')
    return True

html_before = HTML_FILE.read_text(encoding='utf-8')
js_before = JS_FILE.read_text(encoding='utf-8')
html_after, badge_count = update_html(html_before)
js_after = update_js(js_before)
write_if_changed(HTML_FILE, html_before, html_after)
write_if_changed(JS_FILE, js_before, js_after)
print(f'Removed {badge_count} UI-only status badge(s).')
print('Map selection IDs, ArcGIS authentication, coordinates, and drainage-area fields are preserved.')
