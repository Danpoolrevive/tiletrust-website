/* TileTrust tile calculator. Pure maths in TTCalc; UI binds only on calculator.html. */
(function (root) {
  'use strict';
  var ADH_BAG = 20, GROUT_BAG = 5, DENSITY = { cement: 1.6, epoxy: 1.5 };
  var WASTE = { straight: 10, brick: 12, diagonal: 15, herringbone: 20 };

  // Round up, ignoring float noise (22.0000000001 stays 22).
  function up(x) { return Math.ceil(x - 1e-9); }
  function num(v) {
    if (typeof v === 'number') return v;
    v = String(v == null ? '' : v).trim().replace(',', '.');
    return v === '' ? NaN : Number(v);
  }
  function blank(v) { return v == null || String(v).trim() === ''; }

  // Net area of one row in m², or an error message.
  function rowArea(r) {
    var wall = r.type === 'wall', label = r.name || (wall ? 'Wall' : 'Floor');
    var la = wall ? 'width' : 'length', lb = wall ? 'height' : 'width';
    var a = num(r.a), b = num(r.b), d = blank(r.ded) ? 0 : num(r.ded);
    if (!(a > 0) || a > 1000) return { error: label + ': enter the ' + la + ' in metres (more than 0).' };
    if (!(b > 0) || b > 1000) return { error: label + ': enter the ' + lb + ' in metres (more than 0).' };
    if (!(d >= 0)) return { error: label + ': deductions must be 0 or more m².' };
    var gross = a * b;
    if (d >= gross) return { error: label + ': deductions (' + d + ' m²) are as big as the area itself.' };
    return { gross: gross, net: gross - d };
  }

  function adhesiveRate(a, b, override) {
    var o = num(override);
    if (o > 0) return o;
    var l = Math.max(a, b);
    return l <= 300 ? 3 : l <= 600 ? 4.5 : 6;
  }

  // kg/m² = ((A + B) / (A × B)) × joint × thickness × density, all in mm.
  function groutRate(a, b, joint, thick, density) {
    return ((a + b) / (a * b)) * joint * thick * density;
  }

  // Check a tile spec; returns list of plain-English problems.
  function checkSpec(s, label) {
    var e = [], p = label ? label + ' tiles: ' : '';
    if (!(s.a >= 10 && s.a <= 3600) || !(s.b >= 10 && s.b <= 3600)) e.push(p + 'enter the tile size in mm (10 to 3600).');
    if (!(s.joint >= 0 && s.joint <= 30)) e.push(p + 'grout joint should be 0 to 30 mm.');
    if (!(s.thick >= 2 && s.thick <= 50)) e.push(p + 'tile thickness should be 2 to 50 mm.');
    if (!(s.waste >= 0 && s.waste <= 60)) e.push(p + 'wastage should be 0 to 60%.');
    if (!blank(s.perBox) && !(num(s.perBox) > 0)) e.push(p + 'per box must be more than 0, or leave it blank.');
    return e;
  }

  // Quantities for a net area using one tile spec. Assumes spec already checked.
  function group(net, s, grout) {
    var waste = net * (1 + s.waste / 100);
    var face = ((s.a + s.joint) * (s.b + s.joint)) / 1e6;
    var tiles = net > 0 ? up(waste / face) : 0, pb = num(s.perBox), boxes = null;
    if (pb > 0) boxes = s.boxUnit === 'tiles' ? up(tiles / pb) : up(waste / pb);
    var rate = adhesiveRate(s.a, s.b, s.adh);
    var adhKg = net * rate;
    var gRate = groutRate(s.a, s.b, s.joint, s.thick, DENSITY[grout] || DENSITY.cement);
    var groutKg = net * gRate * (1 + s.waste / 100);
    return {
      net: net, waste: waste, tiles: tiles, boxes: boxes, adhRate: rate, adhKg: adhKg,
      adhBags: up(adhKg / ADH_BAG), groutRate: gRate, groutKg: groutKg, groutBags: up(groutKg / GROUT_BAG)
    };
  }

  /* job = { rows:[{name,type,a,b,ded}], floor:spec, wall:spec|null (null = same as floor), grout:'cement'|'epoxy' }
     spec = { a,b,joint,thick,waste (numbers), perBox, boxUnit:'m2'|'tiles', adh:'auto'|kg } */
  function calculate(job) {
    var errors = [], fNet = 0, wNet = 0, used = 0, same = !job.wall;
    var fs = job.floor, ws = job.wall || job.floor;
    (job.rows || []).forEach(function (r) {
      if (blank(r.a) && blank(r.b) && blank(r.ded)) return; // untouched row
      var res = rowArea(r);
      if (res.error) return errors.push(res.error);
      used++;
      if (r.type === 'wall') wNet += res.net; else fNet += res.net;
    });
    errors = errors.concat(checkSpec(fs, same ? '' : 'Floor'));
    if (!same) errors = errors.concat(checkSpec(ws, 'Wall'));
    var out = { errors: errors, count: used, same: same };
    if (errors.length || !used) return out;
    var g = job.grout;
    out.floor = group(fNet, fs, g);
    out.wall = group(wNet, ws, g);
    if (same) out.total = group(fNet + wNet, fs, g);
    else {
      var t = {}, f = out.floor, w = out.wall;
      ['net', 'waste', 'adhKg', 'groutKg'].forEach(function (k) { t[k] = f[k] + w[k]; });
      t.tiles = t.boxes = null;
      t.adhBags = up(t.adhKg / ADH_BAG); t.groutBags = up(t.groutKg / GROUT_BAG);
      out.total = t;
    }
    return out;
  }

  var api = { num: num, up: up, rowArea: rowArea, adhesiveRate: adhesiveRate, groutRate: groutRate,
    checkSpec: checkSpec, group: group, calculate: calculate, WASTE: WASTE, DENSITY: DENSITY };
  root.TTCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ---------------- UI ---------------- */
  if (typeof document === 'undefined') return;
  var form = document.getElementById('calc');
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var list = $('c-rows'), tpl = $('c-row-tpl'), n = 0;
  var r1 = function (x) { return (Math.round(x * 100) / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 }); };
  var r0 = function (x) { return x == null ? '–' : x.toLocaleString('en-GB'); };

  function addRow(type) {
    var el = tpl.content.firstElementChild.cloneNode(true), id = 'r' + (++n);
    el.querySelectorAll('[data-k]').forEach(function (i) {
      var lab = el.querySelector('label[data-for="' + i.dataset.k + '"]');
      i.id = id + i.dataset.k; if (lab) lab.htmlFor = i.id;
    });
    el.querySelector('[data-k=type]').value = type;
    list.appendChild(el); labels(el);
    return el;
  }
  function labels(el) {
    var wall = el.querySelector('[data-k=type]').value === 'wall';
    el.querySelector('label[data-for=a]').textContent = (wall ? 'Width' : 'Length') + ' (m)';
    el.querySelector('label[data-for=b]').textContent = (wall ? 'Height' : 'Width') + ' (m)';
    el.querySelector('label[data-for=ded]').textContent = wall ? 'Doors, windows (m²)' : 'Fixed units (m²)';
  }

  function spec(p) {
    var size = $(p + 'size').value, ab = size === 'custom' ? [$(p + 'ca').value, $(p + 'cb').value] : size.split('x');
    $(p + 'custom').hidden = size !== 'custom';
    $(p + 'mosaic').hidden = size !== '100x100';
    return { a: num(ab[0]), b: num(ab[1]), joint: num($(p + 'joint').value), thick: num($(p + 'thick').value),
      waste: num($(p + 'waste').value), perBox: $(p + 'box').value, boxUnit: $(p + 'unit').value, adh: $(p + 'adh').value };
  }

  var last = null;
  function run() {
    var rows = [].map.call(list.children, function (el, i) {
      var v = function (k) { return el.querySelector('[data-k=' + k + ']').value; };
      return { name: v('name').trim() || 'Area ' + (i + 1), type: v('type'), a: v('a'), b: v('b'), ded: v('ded') };
    });
    var same = $('c-same').checked;
    $('w-spec').hidden = same;
    $('f-h').textContent = same ? 'Your tiles' : 'Floor tiles';
    var res = calculate({ rows: rows, floor: spec('f-'), wall: same ? null : spec('w-'), grout: $('c-grout').value });
    var err = $('c-err');
    err.innerHTML = '';
    res.errors.forEach(function (m) { var li = document.createElement('li'); li.textContent = m; err.appendChild(li); });
    err.hidden = !res.errors.length;
    var ok = !res.errors.length && res.count > 0;
    $('c-out').hidden = !ok; $('c-empty').hidden = ok;
    if (!res.errors.length && !res.count) $('c-empty').textContent = 'Enter at least one length and width to see your quantities.';
    else if (!ok) $('c-empty').textContent = 'Fix the points above to see your quantities.';
    last = ok ? res : null;
    if (!ok) return;
    var g = res.grout = $('c-grout').value === 'epoxy' ? 'epoxy' : 'cement';
    $('k-area').textContent = r1(res.total.net);
    $('k-tiles').textContent = res.same ? r0(res.total.tiles) : r0(res.floor.tiles + res.wall.tiles);
    $('k-adh').textContent = r0(res.total.adhBags);
    $('k-grout').textContent = r0(res.total.groutBags);
    $('k-gt').textContent = g;
    var cols = ['floor', 'wall', 'total'], lines = [
      ['Net area (m²)', function (x) { return r1(x.net); }],
      ['Area inc. wastage (m²)', function (x) { return r1(x.waste); }],
      ['Tiles', function (x) { return r0(x.tiles); }],
      ['Boxes', function (x) { return x.boxes == null ? '–' : r0(x.boxes); }],
      ['Adhesive rate (kg/m²)', function (x) { return x.adhRate ? r1(x.adhRate) : '–'; }],
      ['Adhesive (kg)', function (x) { return r1(x.adhKg); }],
      ['Adhesive (20 kg bags)', function (x) { return r0(x.adhBags); }],
      ['Grout (kg)', function (x) { return r1(x.groutKg); }],
      ['Grout (5 kg units)', function (x) { return r0(x.groutBags); }]
    ];
    $('c-tbody').innerHTML = '';
    lines.forEach(function (l) {
      var tr = document.createElement('tr'), th = document.createElement('th');
      th.scope = 'row'; th.textContent = l[0]; tr.appendChild(th);
      cols.forEach(function (c) {
        var td = document.createElement('td'), x = res[c];
        td.dataset.h = c === 'total' ? 'Combined' : c === 'floor' ? 'Floors' : 'Walls';
        td.textContent = c !== 'total' && !x.net ? '–' : l[1](x);
        tr.appendChild(td);
      });
      $('c-tbody').appendChild(tr);
    });
    res.lines = lines;
  }

  function summary() {
    if (!last) return '';
    var t = ['TileTrust tile calculator (estimate only)'];
    [].forEach.call(list.children, function (el) {
      var v = function (k) { return el.querySelector('[data-k=' + k + ']').value; };
      if (v('a') || v('b')) t.push('- ' + (v('name') || v('type')) + ' (' + v('type') + '): ' + v('a') + ' x ' + v('b') + ' m' + (v('ded') ? ', less ' + v('ded') + ' m²' : ''));
    });
    last.lines.forEach(function (l) {
      t.push(l[0] + ': floors ' + (last.floor.net ? l[1](last.floor) : '–') + ', walls ' + (last.wall.net ? l[1](last.wall) : '–') + ', combined ' + l[1](last.total));
    });
    t.push('Grout type: ' + last.grout + '. Measure on site before ordering. www.tiletrustltd.co.uk/calculator.html');
    return t.join('\n');
  }

  form.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.k === 'type') labels(t.closest('.c-row'));
    if (/-pattern$/.test(t.id)) $(t.id.replace('pattern', 'waste')).value = WASTE[t.value];
    run();
  });
  form.addEventListener('change', run);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.add) { addRow(b.dataset.add).querySelector('[data-k=name]').focus(); run(); }
    if (b.classList.contains('c-del')) { b.closest('.c-row').remove(); if (!list.children.length) addRow('floor'); run(); }
    if (b.id === 'c-copy') {
      var s = summary(), m = $('c-copied');
      var done = function () { m.textContent = 'Copied.'; setTimeout(function () { m.textContent = ''; }, 2500); };
      var fail = function () { m.textContent = 'Copy failed. Select the table instead.'; };
      if (navigator.clipboard) navigator.clipboard.writeText(s).then(done, fail); else fail();
    }
  });
  addRow('floor'); addRow('wall'); run();
})(typeof window !== 'undefined' ? window : globalThis);
