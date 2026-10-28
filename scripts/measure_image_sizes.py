#!/usr/bin/env python3
"""Measure how wide every <img> actually renders on every page, so the
responsive `sizes` attribute written by optimise_images.py matches the real
layout (never smaller than what is drawn, so nothing gets blurrier).

Also records which image is the Largest Contentful Paint element and which
images sit in the first screen, on mobile (412x915) and desktop (1440x900).

Run against the ORIGINAL markup (before <picture> rewriting):
    python3 scripts/measure_image_sizes.py            # writes scripts/image-sizes.json

Needs Playwright with Chromium. Serves the site locally on 127.0.0.1.
"""
import glob
import json
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'scripts', 'image-sizes.json')
PORT = 8799
# dense viewport sampling so fluid layouts between breakpoints are covered:
# every 10px, both sides of every CSS breakpoint and of every `sizes` bucket edge
CSS_BREAKPOINTS = [460, 480, 520, 560, 600, 700, 760, 800, 860, 900, 940, 960, 980, 1000, 1200]
SIZES_BUCKETS = [360, 480, 600, 700, 768, 900, 960, 1100, 1280, 1440, 1920]
WIDTHS = sorted(set(range(320, 1921, 10)) | {b + d for b in CSS_BREAKPOINTS + SIZES_BUCKETS for d in (0, 1)}
                | {2240, 2560})
HEIGHTS = [700, 1200]   # take the larger need, in case anything is sized from the viewport height

MEASURE = """() => [...document.images].map(i => {
  const r = i.getBoundingClientRect(), cs = getComputedStyle(i);
  let w = r.width;
  if (cs.objectFit === 'cover' && i.naturalWidth && i.naturalHeight && r.height)
    w = Math.max(w, r.height * i.naturalWidth / i.naturalHeight);
  return Math.ceil(w);
})"""

FOLD = """(vh) => [...document.images].map(i => {
  const r = i.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top < vh && r.bottom > 0;
})"""

LCP = """() => new Promise(res => {
  let el = null;
  new PerformanceObserver(l => { const e = l.getEntries(); if (e.length) el = e[e.length-1].element; })
    .observe({type: 'largest-contentful-paint', buffered: true});
  setTimeout(() => res(el && el.tagName === 'IMG' ? [...document.images].indexOf(el) : -1), 600);
})"""


def pages():
    out = []
    for p in glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True):
        rel = os.path.relpath(p, ROOT)
        if rel.startswith(('scripts', 'node_modules', '.git')):
            continue
        out.append(rel.replace(os.sep, '/'))
    return sorted(out)


def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
                           cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    result = {}
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            block = lambda r: r.abort() if ('fonts.g' in r.request.url or '/api/' in r.request.url) else r.continue_()
            for page in pages():
                url = f'http://127.0.0.1:{PORT}/{page}'
                info = {}
                # first-screen + LCP, page as shipped
                for key, (w, h) in {'m': (412, 915), 'd': (1440, 900)}.items():
                    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1)
                    ctx.route('**/*', block)
                    pg = ctx.new_page()
                    pg.goto(url, wait_until='load')
                    info['fold_' + key] = pg.evaluate(FOLD, h)
                    info['lcp_' + key] = pg.evaluate(LCP)
                    ctx.close()
                # rendered widths across viewports, with all images loaded and hidden gallery items shown
                ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
                ctx.route('**/*', block)
                pg = ctx.new_page()
                pg.goto(url, wait_until='load')
                pg.evaluate("() => { document.querySelectorAll('.more-item').forEach(e => e.classList.remove('more-item'));"
                            " document.querySelectorAll('img').forEach(i => i.loading = 'eager'); }")
                pg.wait_for_function("() => [...document.images].every(i => i.complete)", timeout=120000)
                info['src'] = pg.evaluate("() => [...document.images].map(i => i.getAttribute('src'))")
                info['natural'] = pg.evaluate("() => [...document.images].map(i => i.naturalWidth)")
                samples = {}
                for vw in WIDTHS:
                    best = None
                    for vh in HEIGHTS:
                        pg.set_viewport_size({'width': vw, 'height': vh})
                        pg.wait_for_timeout(20)
                        cur = pg.evaluate(MEASURE)
                        best = cur if best is None else [max(a, b) for a, b in zip(best, cur)]
                    samples[vw] = best
                info['samples'] = samples
                ctx.close()
                result[page] = info
                print(page, len(info['src']), 'imgs; lcp m/d', info['lcp_m'], info['lcp_d'], flush=True)
            b.close()
    finally:
        srv.terminate()
    with open(OUT, 'w') as f:
        json.dump(result, f, separators=(',', ':'))
    print('wrote', OUT)


if __name__ == '__main__':
    main()
