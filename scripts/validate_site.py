#!/usr/bin/env python3
"""Sanity checks for the static site. Exit code 1 on any problem.

  * every HTML page parses, with balanced <picture> elements
  * every <picture> holds <source>s then exactly one fallback <img> with alt
  * every local image referenced (src, srcset, preload, CSS url()) exists
  * og:image / twitter:image stay JPG
  * vercel.json is valid JSON and keeps its redirects
"""
import glob
import json
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors = []


def err(msg):
    errors.append(msg)


def check_local(page_dir, url, where):
    if not url or re.match(r'^(https?:|data:|mailto:|tel:|#)', url):
        return
    url = url.split('#')[0].split('?')[0]
    path = os.path.join(ROOT, url.lstrip('/')) if url.startswith('/') else os.path.normpath(os.path.join(page_dir, url))
    if not os.path.isfile(path):
        err(f'{where}: missing file {url}')


class Page(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}

    def __init__(self, name):
        super().__init__(convert_charrefs=True)
        self.name, self.dir = name, os.path.dirname(os.path.join(ROOT, name))
        self.picture = None   # list of child tags inside the open <picture>
        self.pictures = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'picture':
            if self.picture is not None:
                err(f'{self.name}: nested <picture>')
            self.picture = []
            self.pictures += 1
        elif self.picture is not None:
            self.picture.append((tag, a))
        if tag == 'img':
            check_local(self.dir, a.get('src'), f'{self.name} <img>')
            if 'alt' not in a:
                err(f'{self.name}: <img src={a.get("src")}> has no alt')
        if tag in ('img', 'source') and a.get('srcset'):
            for c in a['srcset'].split(','):
                if c.strip():
                    check_local(self.dir, c.strip().split()[0], f'{self.name} <{tag} srcset>')
        if tag == 'link' and a.get('rel') in ('preload', 'stylesheet', 'icon', 'apple-touch-icon'):
            check_local(self.dir, a.get('href'), f'{self.name} <link {a.get("rel")}>')
        if tag == 'meta' and a.get('property', a.get('name')) in ('og:image', 'twitter:image'):
            if not re.search(r'\.jpe?g$', a.get('content', ''), re.I):
                err(f'{self.name}: {a.get("property", a.get("name"))} is not a JPG')

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == 'picture':
            kids = self.picture or []
            tags = [t for t, _ in kids]
            if tags.count('img') != 1 or tags[-1] != 'img' or any(t != 'source' for t in tags[:-1]):
                err(f'{self.name}: <picture> children are {tags}')
            elif 'alt' not in kids[-1][1]:
                err(f'{self.name}: <picture> fallback <img> has no alt')
            if not any(t == 'source' for t in tags):
                err(f'{self.name}: <picture> has no <source>')
            self.picture = None


def main():
    pages = sorted(os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True)
                   if not os.path.relpath(p, ROOT).startswith(('scripts', '.git')))
    n_pic = 0
    for name in pages:
        html = open(os.path.join(ROOT, name), encoding='utf-8').read()
        p = Page(name)
        try:
            p.feed(html)
            p.close()
        except Exception as e:  # noqa: BLE001
            err(f'{name}: parse error {e}')
        if p.picture is not None:
            err(f'{name}: unclosed <picture>')
        if html.count('<picture') != html.count('</picture>'):
            err(f'{name}: <picture> open/close count differs')
        for m in re.finditer(r'url\(["\']?([^"\')]+)', html):
            check_local(os.path.dirname(os.path.join(ROOT, name)), m.group(1), f'{name} inline url()')
        n_pic += p.pictures
    css = open(os.path.join(ROOT, 'styles.css'), encoding='utf-8').read()
    for m in re.finditer(r'url\(["\']?([^"\')]+)', css):
        check_local(ROOT, m.group(1), 'styles.css url()')
    try:
        v = json.load(open(os.path.join(ROOT, 'vercel.json')))
        if not v.get('redirects'):
            err('vercel.json: redirects missing')
    except Exception as e:  # noqa: BLE001
        err(f'vercel.json: {e}')
    print(f'{len(pages)} pages, {n_pic} <picture> elements checked')
    for e in errors:
        print('ERROR', e)
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
