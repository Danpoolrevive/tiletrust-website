#!/usr/bin/env python3
"""Stamp styles.css, chat.js and calc.js references in every page with a short
content hash (?v=xxxxxxxx), so browsers fetch the new file as soon as it
changes. Run after editing any of those files."""
import glob, hashlib, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
ASSETS = ['styles.css', 'chat.js', 'calc.js']
h = {a: hashlib.md5(open(a, 'rb').read()).hexdigest()[:8] for a in ASSETS if os.path.exists(a)}
changed = 0
for f in glob.glob('**/*.html', recursive=True):
    s = open(f).read(); o = s
    for a, v in h.items():
        s = re.sub(r'((?:src|href)="(?:\.\./|/)*' + re.escape(a) + r')(?:\?v=[0-9a-f]+)?"', r'\1?v=' + v + '"', s)
    if s != o:
        open(f, 'w').write(s); changed += 1
print(h, f'{changed} pages updated')
