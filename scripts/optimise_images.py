#!/usr/bin/env python3
"""Generate AVIF/WebP (plus responsive widths) for every JPG/PNG used in an
<img>, then wrap each <img> in a <picture> with AVIF/WebP <source>s. The
original <img> stays as the fallback with every attribute kept, apart from
loading priority (see below).

Loading priority, from scripts/image-sizes.json (measure_image_sizes.py):
  * the LCP image on mobile/desktop   -> fetchpriority="high", never lazy
  * other images in the first screen  -> decoding="async", loading untouched (not lazy)
  * everything else                   -> loading="lazy" decoding="async"

`sizes` for the new <source>s comes from the measured rendered widths, rounded
UP, so the browser never picks a smaller file than the space it is drawn in.

Run order (from the repo root, on the original markup):
    python3 scripts/measure_image_sizes.py
    python3 scripts/optimise_images.py
Re-running is safe: existing variants are reused and <img>s already inside a
<picture> are left alone.
"""
import glob
import json
import math
import os
import re
import sys
from concurrent.futures import ProcessPoolExecutor

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPT_DIR = 'img/opt'
WIDTHS = [400, 640, 800, 1080, 1280, 1600]
SMALL = 480           # at or below this natural width, one candidate only
WEBP_Q = 80
AVIF_Q = 55
BUCKETS = [360, 480, 600, 700, 768, 900, 960, 1100, 1280, 1440, 1920]

IMG_RE = re.compile(r'<img\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>', re.I)
ATTR_RE = lambda name: re.compile(r'\s' + name + r'\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)', re.I)


def attr(tag, name):
    m = ATTR_RE(name).search(tag)
    return m.group(1).strip('"\'') if m else None


def set_attr(tag, name, value):
    """Set/replace an attribute on an <img ...> tag string (value None removes it)."""
    rx = ATTR_RE(name)
    if rx.search(tag):
        return rx.sub('' if value is None else f' {name}="{value}"', tag, count=1)
    if value is None:
        return tag
    end = -2 if tag.endswith('/>') else -1
    return tag[:end].rstrip() + f' {name}="{value}"' + tag[end:]


def local(path):
    """'../img/x.jpg' -> ('../', 'img/x.jpg')"""
    m = re.match(r'^((?:\.\./|\./|/)*)(img/.+)$', path)
    return (m.group(1), m.group(2)) if m else (None, None)


def variants_for(master):
    """List of (width, avif_path, webp_path) to produce for a master file."""
    with Image.open(os.path.join(ROOT, master)) as im:
        nat, nh = im.size
    # Only widths whose height comes out as an exact whole number, so every
    # variant keeps exactly the original aspect ratio (height:auto images then
    # lay out to the same sub-pixel height whichever file the browser picks).
    step = nat // math.gcd(nat, nh)
    ws = set()
    if nat > SMALL:
        for t in WIDTHS:
            c = round(t / step) * step
            if 0 < c < nat and abs(c - t) / t <= 0.1:
                ws.add(c)
    ws = sorted(ws) + [nat]
    stem = os.path.splitext(os.path.basename(master))[0]
    return nat, [(w, f'{OPT_DIR}/{stem}-{w}.avif', f'{OPT_DIR}/{stem}-{w}.webp') for w in ws]


def encode(job):
    master, w, avif, webp = job
    src = os.path.join(ROOT, master)
    is_png = master.lower().endswith('.png')
    out = {}
    done = [os.path.join(ROOT, webp)] + ([] if is_png else [os.path.join(ROOT, avif)])
    if all(os.path.exists(p) for p in done):
        out['webp'] = os.path.getsize(done[0])
        if not is_png:
            out['avif'] = os.path.getsize(done[1])
        return job, out
    with Image.open(src) as im:
        im.load()
        icc = im.info.get('icc_profile')
        if im.mode not in ('RGB', 'RGBA'):
            im = im.convert('RGBA' if 'A' in im.mode or 'transparency' in im.info else 'RGB')
        if w != im.size[0]:
            h = im.size[1] * w // im.size[0]
            assert h * im.size[0] == im.size[1] * w, (master, w)
            im = im.resize((w, h), Image.LANCZOS)
        kw = {'icc_profile': icc} if icc else {}
        p = os.path.join(ROOT, webp)
        if not os.path.exists(p):
            if is_png:   # logos: lossless so edges stay pixel-identical
                im.save(p, 'WEBP', lossless=True, method=6, **kw)
            else:
                im.save(p, 'WEBP', quality=WEBP_Q, method=6, **kw)
        out['webp'] = os.path.getsize(p)
        if not is_png:   # lossy AVIF would soften logo edges; WebP lossless covers PNGs
            p = os.path.join(ROOT, avif)
            if not os.path.exists(p):
                im.save(p, 'AVIF', quality=AVIF_Q, speed=6, **kw)
            out['avif'] = os.path.getsize(p)
    return job, out


def sizes_from_samples(samples):
    """Build a conservative `sizes` string from {viewport: needed_css_px}."""
    pts = sorted((int(v), w) for v, w in samples.items())
    vis = [(v, w) for v, w in pts if w > 0]
    if not vis:
        return '100vw'
    allmax = max(w / v for v, w in vis)
    parts, lo = [], 0
    edges = BUCKETS + [10 ** 6]
    for hi in edges:
        rs = [w / v for v, w in vis if lo < v <= hi]
        r = max(rs) if rs else allmax
        n = min(100, math.ceil(r * 102 + 0.5))   # +2% headroom
        parts.append((hi, n))
        lo = hi
    merged = []
    for hi, n in parts:
        if merged and merged[-1][1] == n:
            merged[-1] = (hi, n)
        else:
            merged.append((hi, n))
    out = [f'(max-width: {hi}px) {n}vw' for hi, n in merged[:-1]]
    out.append(f'{merged[-1][1]}vw')
    return ', '.join(out)


def master_for(tag, prefix_check):
    """Largest local file among src + srcset candidates."""
    cands = [attr(tag, 'src')]
    ss = attr(tag, 'srcset')
    if ss:
        cands += [c.strip().split()[0] for c in ss.split(',') if c.strip()]
    best, bestw, prefix = None, -1, None
    for c in cands:
        pre, rel = local(c or '')
        if not rel or not re.search(r'\.(jpe?g|png)$', rel, re.I) or not os.path.exists(os.path.join(ROOT, rel)):
            continue
        with Image.open(os.path.join(ROOT, rel)) as im:
            w = im.size[0]
        if w > bestw:
            best, bestw, prefix = rel, w, pre
    return best, prefix


def pages():
    return sorted(os.path.relpath(p, ROOT).replace(os.sep, '/')
                  for p in glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True)
                  if not os.path.relpath(p, ROOT).startswith(('scripts', '.git')))


def main():
    meta = json.load(open(os.path.join(ROOT, 'scripts', 'image-sizes.json')))
    os.makedirs(os.path.join(ROOT, OPT_DIR), exist_ok=True)

    # 1. collect masters (img tags + the two CSS background images)
    masters = set()
    for page in pages():
        for tag in IMG_RE.findall(open(os.path.join(ROOT, page)).read()):
            m, _ = master_for(tag, None)
            if m:
                masters.add(m)
    masters |= {'img/work-pool-leisure.jpg', 'img/tiletrust-sign.jpg'}
    plan = {m: variants_for(m) for m in sorted(masters)}
    jobs = [(m, w, a, wb) for m, (nat, vs) in plan.items() for (w, a, wb) in vs]
    print(f'{len(masters)} masters, {len(jobs)} width variants', flush=True)
    sizes = {}
    with ProcessPoolExecutor() as ex:
        for i, (job, out) in enumerate(ex.map(encode, jobs, chunksize=4)):
            sizes[(job[0], job[1])] = out
            if i % 100 == 0:
                print('  encoded', i, flush=True)

    # which formats are worth offering per master (judged at natural width)
    formats = {}
    for m, (nat, vs) in plan.items():
        orig = os.path.getsize(os.path.join(ROOT, m))
        s = sizes[(m, nat)]
        f = []
        if 'avif' in s and s['avif'] < min(orig, s.get('webp', orig)):
            f.append('avif')
        if s['webp'] < orig:
            f.append('webp')
        formats[m] = f
    json.dump({m: {'formats': formats[m], 'widths': [w for w, _, _ in plan[m][1]]} for m in plan},
              open(os.path.join(ROOT, 'scripts', 'image-variants.json'), 'w'), indent=0)

    # 2. rewrite pages
    total = 0
    for page in pages():
        path = os.path.join(ROOT, page)
        html = open(path).read()
        info = meta.get(page)
        tags = list(IMG_RE.finditer(html))
        if info is None or len(tags) != len(info['src']):
            sys.exit(f'{page}: image count mismatch with image-sizes.json ({len(tags)} vs {info and len(info["src"])})')
        lcp = {info['lcp_m'], info['lcp_d']} - {-1}
        out, pos = [], 0
        for i, mt in enumerate(tags):
            tag = mt.group(0)
            if attr(tag, 'src') != info['src'][i]:
                sys.exit(f'{page}: img #{i} src mismatch {attr(tag, "src")} vs {info["src"][i]}')
            before = html[max(0, mt.start() - 300):mt.start()]
            already = before.rfind('<picture') > before.rfind('</picture>')
            new = tag
            # loading priority
            if i in lcp:
                new = set_attr(new, 'loading', None)
                new = set_attr(new, 'decoding', None)
                new = set_attr(new, 'fetchpriority', 'high')
            elif info['fold_m'][i] or info['fold_d'][i]:
                if attr(new, 'loading') == 'lazy':
                    new = set_attr(new, 'loading', None)
                new = set_attr(new, 'decoding', 'async')
            else:
                new = set_attr(new, 'loading', 'lazy')
                new = set_attr(new, 'decoding', 'async')
            master, prefix = master_for(tag, None)
            if already or not master or not formats.get(master):
                out.append(html[pos:mt.start()] + new)
                pos = mt.end()
                continue
            nat, vs = plan[master]
            srcs = []
            for fmt in formats[master]:
                mime = 'image/' + fmt
                if len(vs) == 1:
                    w, a, wb = vs[0]
                    srcs.append(f'<source type="{mime}" srcset="{prefix}{a if fmt == "avif" else wb}">')
                else:
                    ss = ', '.join(f'{prefix}{a if fmt == "avif" else wb} {w}w' for w, a, wb in vs)
                    sz = sizes_from_samples(info['samples'] and {v: s[i] for v, s in info['samples'].items()})
                    srcs.append(f'<source type="{mime}" srcset="{ss}" sizes="{sz}">')
            out.append(html[pos:mt.start()] + '<picture>' + ''.join(srcs) + new + '</picture>')
            pos = mt.end()
            total += 1
        out.append(html[pos:])
        new_html = ''.join(out)
        if new_html != html:
            open(path, 'w').write(new_html)
    print('wrapped', total, 'images in <picture>')

    # 3. drop variants nothing references (formats not worth offering, unused background widths)
    text = ''.join(open(os.path.join(ROOT, p)).read() for p in pages() + ['styles.css'])
    refs = set(re.findall(OPT_DIR + r'/[A-Za-z0-9._-]+', text))
    for f in os.listdir(os.path.join(ROOT, OPT_DIR)):
        if f'{OPT_DIR}/{f}' not in refs:
            os.remove(os.path.join(ROOT, OPT_DIR, f))


if __name__ == '__main__':
    main()
