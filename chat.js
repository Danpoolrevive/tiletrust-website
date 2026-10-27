/* TileTrust enquiry chat: a short guided chat that sends a quote request to info@tiletrustltd.co.uk.
   No AI. Every step can be skipped or changed, "Email us instead" is always available,
   photos and drawings can be attached, and progress is remembered if the chat is closed. */
(function () {
  'use strict';
  var EMAIL = 'info@tiletrustltd.co.uk';
  var STORE = 'tt-chat-v2';
  var MAX_FILES = 6, MAX_BYTES = 3 * 1024 * 1024;

  var SECTORS = {
    'Hotel or hospitality': ['Guest bathrooms and en-suites', 'Lobby, reception and corridors', 'Restaurant or bar', 'Commercial kitchen', 'Spa, pool or changing rooms', 'Back of house and staff areas'],
    'Shopfitting or retail': ['Shop floor', 'Shopfit walls and feature areas', 'Supermarket floors', 'Customer or staff toilets', 'Back of house, stores or kitchen', 'Car showroom'],
    'Offices or commercial units': ['Entrance and reception', 'Toilets and washrooms', 'Kitchens and break areas', 'Floors throughout'],
    'School, college or university': ['Toilets and washrooms', 'Changing rooms and showers', 'Kitchens and canteens', 'Corridors and halls', 'Swimming pool'],
    'Healthcare or care': ['Wards and corridors', 'Bathrooms, showers and wet rooms', 'Clinical or treatment rooms', 'Kitchens', 'Vets, kennels or animal care'],
    'Leisure, sports or pools': ['Changing rooms and showers', 'Pool surround or swimming pool', 'Toilets and washrooms', 'Reception and corridors'],
    'Public buildings or transport': ['Concourse and public floors', 'Toilets and washrooms', 'Walls and feature areas', 'Kitchens and staff areas'],
    'Factory or industrial': ['Production or food prep floors', 'Toilets, showers and welfare', 'Kitchens and canteens', 'Anti-slip flooring'],
    'Apartments or new-build housing': ['Bathrooms and en-suites', 'Kitchens', 'Communal areas and entrances', 'Floors throughout'],
    'Home': ['Bathroom or en-suite', 'Wet room or shower', 'Kitchen', 'Floors', 'Repairs or regrouting'],
    'Something else': []
  };
  var GENERAL = ['Floor tiling', 'Wall tiling', 'Bathrooms or wet rooms', 'Anti-slip flooring', 'Floor preparation or self-levelling', 'Epoxy grouting', 'Tile repairs or regrouting', 'Something else'];

  var STEPS = ['sector', 'work', 'who', 'where', 'scope', 'timescale', 'files', 'contact'];
  var LABELS = { sector: 'Project type', work: 'Work needed', units: 'Rooms or units', role: 'Enquiry from', stage: 'Project stage', location: 'Location', size: 'Size', measurements: 'Measurements', existing: 'Old tiles to remove', supply: 'Tiles and materials', timescale: 'Timescale', notes: 'Other notes' };
  var STEP_KEYS = { sector: ['sector'], work: ['work', 'units'], who: ['role', 'stage'], where: ['location', 'size', 'measurements'], scope: ['existing', 'supply'], timescale: ['timescale'], files: ['notes'], contact: [] };

  var S = { a: {}, step: -1, hist: [] }, files = [];
  var panel, body, progress, backBtn, opener, lastFocus;

  function save() { try { sessionStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }
  function load() { try { var v = JSON.parse(sessionStorage.getItem(STORE) || 'null'); if (v && v.a) S = v; } catch (e) {} }
  function reset() { S = { a: {}, step: -1, hist: [] }; files = []; try { sessionStorage.removeItem(STORE); } catch (e) {} }

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (text != null) e.textContent = text;
    return e;
  }
  function say(text, who) { var m = el('div', { 'class': 'tc-msg ' + (who || 'bot') }, text); var open = body.querySelector('.tc-controls'); if (open) body.insertBefore(m, open); else body.appendChild(m); body.scrollTop = body.scrollHeight; return m; }
  function controls() { var c = el('div', { 'class': 'tc-controls' }); body.appendChild(c); return c; }
  function clearControls() { var o = body.querySelectorAll('.tc-controls'); for (var i = 0; i < o.length; i++) o[i].remove(); }
  function label(t, c) { c.appendChild(el('div', { 'class': 'tc-label' }, t)); }

  function lines() { var out = []; for (var k in LABELS) if (S.a[k]) out.push(LABELS[k] + ': ' + S.a[k]); return out; }
  function mailtoHref() {
    var l = lines();
    var b = 'Hi TileTrust,\n\n' + (l.length ? 'Here are the details so far:\n' + l.join('\n') + '\n\n' : '') + 'My name:\nMy phone:\n\nAny photos or drawings are attached.';
    return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Quote request' + (S.a.sector ? ' – ' + S.a.sector : '')) + '&body=' + encodeURIComponent(b);
  }

  function setProgress() {
    if (S.step < 0) { progress.textContent = ''; backBtn.hidden = true; return; }
    if (S.step >= STEPS.length) { progress.textContent = 'Sent'; backBtn.hidden = true; return; }
    progress.textContent = 'Step ' + (S.step + 1) + ' of ' + STEPS.length;
    backBtn.hidden = S.step === 0;
  }
  function go(i) { S.hist.push(S.step); S.step = i; save(); show(); }
  function next() { go(S.step + 1); }
  function skip(c) {
    var s = el('button', { type: 'button', 'class': 'tc-skip' }, 'Skip');
    s.addEventListener('click', function () { say('Skipped', 'me'); next(); });
    c.appendChild(s);
  }
  function echo() {
    var t = STEP_KEYS[STEPS[S.step]].map(function (k) { return S.a[k]; }).filter(Boolean).join(' · ');
    say(t || 'Skipped', 'me');
  }

  /* tap-to-pick buttons; multi = several can be picked */
  function pickGroup(c, opts, key, multi) {
    var g = el('div', { 'class': 'tc-choices', role: 'group' });
    var chosen = (S.a[key] || '').split('; ').filter(Boolean);
    opts.forEach(function (o) {
      var b = el('button', { type: 'button', 'class': 'tc-choice', 'aria-pressed': chosen.indexOf(o) > -1 ? 'true' : 'false' }, o);
      b.addEventListener('click', function () {
        if (multi) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
        else { var all = g.querySelectorAll('.tc-choice'); for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', 'false'); b.setAttribute('aria-pressed', 'true'); }
        var on = [], sel = g.querySelectorAll('.tc-choice[aria-pressed=true]'); for (var j = 0; j < sel.length; j++) on.push(sel[j].textContent);
        S.a[key] = on.join('; '); save();
        if (g._onpick) g._onpick(o);
      });
      g.appendChild(b);
    });
    c.appendChild(g);
    return g;
  }
  function textInput(c, key, ph, aria, long) {
    var i = long ? el('textarea', { rows: '3', placeholder: ph, 'aria-label': aria }) : el('input', { type: 'text', placeholder: ph, 'aria-label': aria, 'class': 'tc-text' });
    if (S.a[key]) i.value = S.a[key];
    i.addEventListener('input', function () { S.a[key] = i.value.trim().slice(0, 1500); save(); });
    c.appendChild(i); return i;
  }
  function nextBtn(c, fn) {
    var b = el('button', { type: 'button', 'class': 'tc-go' }, 'Next');
    b.addEventListener('click', fn || function () { echo(); next(); });
    c.appendChild(b); return b;
  }

  var RENDER = {
    sector: function (c) {
      say('First, what kind of project is it?');
      var g = pickGroup(c, Object.keys(SECTORS), 'sector', false);
      g._onpick = function (o) {
        echo();
        if (o === 'Leisure, sports or pools') say('Pools are our speciality. We also trade as PoolRevive for pool projects, so you are in the right place.');
        next();
      };
      skip(c);
    },
    work: function (c) {
      var specific = SECTORS[S.a.sector] || [];
      var opts = specific.concat(GENERAL.filter(function (x) { return specific.indexOf(x) < 0; }));
      say('What work is needed? Tick as many as apply.');
      pickGroup(c, opts, 'work', true);
      if (/Hotel|Apartments|Healthcare/.test(S.a.sector || '')) textInput(c, 'units', 'How many rooms or units? (optional)', 'How many rooms or units');
      nextBtn(c); skip(c);
    },
    who: function (c) {
      if (S.a.sector === 'Home') { S.a.role = 'Homeowner'; save(); say('Is this ready to go ahead, or are you getting prices for now?'); }
      else {
        say('Who are we speaking to, and what stage is the project at?');
        label('You are', c);
        pickGroup(c, ['Client or building owner', 'Main contractor', 'Architect or designer', 'Facilities or estates manager', 'Other'], 'role', false);
        label('Project stage', c);
      }
      pickGroup(c, ['Early budget or pricing', 'Out to tender', 'Contract awarded', 'Ready to start'], 'stage', false);
      nextBtn(c); skip(c);
    },
    where: function (c) {
      say('Where is the site, and roughly how big is the area?');
      label('Town or postcode', c); textInput(c, 'location', 'e.g. Warrington or WA1', 'Town or postcode');
      label('Rough size', c); pickGroup(c, ['Under 20 m²', '20 to 100 m²', '100 to 500 m²', 'Over 500 m²', 'Not sure yet'], 'size', false);
      textInput(c, 'measurements', 'Measurements or room sizes (optional)', 'Measurements');
      nextBtn(c); skip(c);
    },
    scope: function (c) {
      say('A couple of quick ones about the job.');
      label('Are there old tiles to remove first?', c);
      pickGroup(c, ['Yes', 'No, new or bare surface', 'Not sure'], 'existing', false);
      label('Who will supply the tiles and materials (adhesive, grout and so on)?', c);
      pickGroup(c, ['TileTrust to supply tiles and materials', 'I supply tiles, TileTrust supplies materials', 'I supply tiles and materials', 'Not sure yet'], 'supply', false);
      nextBtn(c); skip(c);
    },
    timescale: function (c) {
      say('When would you like the work done?');
      var g = pickGroup(c, ['As soon as possible', 'Within a month', 'In 1 to 3 months', 'In more than 3 months', 'Not sure yet'], 'timescale', false);
      g._onpick = function () { echo(); next(); };
      skip(c);
    },
    files: function (c) {
      say('If you have drawings, a specification or photos, add them here. They help us price accurately. You can also add any other notes.');
      var drop = el('label', { 'class': 'tc-drop' });
      var inp = el('input', { type: 'file', multiple: '', accept: 'image/*,.pdf', 'class': 'tc-file', 'aria-label': 'Add photos or PDFs' });
      drop.appendChild(inp); drop.appendChild(el('span', null, '+ Add photos or PDFs'));
      c.appendChild(drop);
      var list = el('ul', { 'class': 'tc-files' }); c.appendChild(list);
      var warn = el('p', { 'class': 'tc-err', role: 'alert' }); c.appendChild(warn);
      function draw() {
        list.innerHTML = '';
        files.forEach(function (f, i) {
          var li = el('li', null, f.name + ' (' + Math.ceil(f.size / 1024) + ' KB)');
          var x = el('button', { type: 'button', 'aria-label': 'Remove ' + f.name }, '×');
          x.addEventListener('click', function () { files.splice(i, 1); draw(); });
          li.appendChild(x); list.appendChild(li);
        });
      }
      draw();
      inp.addEventListener('change', function () {
        warn.textContent = '';
        var picked = Array.prototype.slice.call(inp.files); inp.value = '';
        Promise.all(picked.map(prepare)).then(function (ready) {
          ready.forEach(function (f) {
            if (!f) { warn.textContent = 'One file could not be added. Please use photos or PDFs.'; return; }
            var total = files.reduce(function (s, x) { return s + x.size; }, 0);
            if (files.length >= MAX_FILES || total + f.size > MAX_BYTES) { warn.textContent = 'That is the most we can take here. Please email any larger files to ' + EMAIL + '.'; return; }
            files.push(f);
          });
          draw();
        });
      });
      label('Anything else that would help? (optional)', c);
      textInput(c, 'notes', 'For example access, working hours, finishes or deadlines', 'Other notes', true);
      nextBtn(c, function () {
        var parts = []; if (files.length) parts.push(files.length + ' file' + (files.length > 1 ? 's' : '') + ' added'); if (S.a.notes) parts.push(S.a.notes);
        say(parts.join(' · ') || 'Skipped', 'me'); next();
      });
      skip(c);
    },
    contact: function (c) {
      say('Last step. Please check your answers, then tell us how to reach you.');
      var sum = el('div', { 'class': 'tc-summary' });
      sum.appendChild(el('strong', null, 'Your answers'));
      var ul = el('ul'), l = lines();
      (l.length ? l : ['Nothing added yet']).forEach(function (t) { ul.appendChild(el('li', null, t)); });
      if (files.length) ul.appendChild(el('li', null, 'Files: ' + files.map(function (f) { return f.name; }).join(', ')));
      sum.appendChild(ul);
      var ch = el('button', { type: 'button', 'class': 'tc-skip' }, 'Change something');
      ch.addEventListener('click', function () {
        clearControls(); say('Which part would you like to change?');
        var c2 = controls(), g = el('div', { 'class': 'tc-choices' });
        [['Project and work', 0], ['Who and stage', 2], ['Location and size', 3], ['Old tiles and materials', 4], ['Timescale', 5], ['Files and notes', 6]].forEach(function (p) {
          var b = el('button', { type: 'button', 'class': 'tc-choice' }, p[0]);
          b.addEventListener('click', function () { go(p[1]); }); g.appendChild(b);
        });
        c2.appendChild(g);
      });
      sum.appendChild(ch); c.appendChild(sum);
      contactForm(c);
    }
  };

  /* shrink large photos so they fit in an email; PDFs and small files pass straight through */
  function prepare(file) {
    return new Promise(function (resolve) {
      var canShrink = /^image\/(jpeg|png|webp)$/.test(file.type);
      var ok = /^image\//.test(file.type) || file.type === 'application/pdf' || /\.(pdf|heic|heif|jpe?g|png)$/i.test(file.name);
      if (!ok) return resolve(null);
      var asIs = function () { var r = new FileReader(); r.onload = function () { resolve({ name: file.name, size: file.size, b64: String(r.result).split(',')[1] }); }; r.onerror = function () { resolve(null); }; r.readAsDataURL(file); };
      if (!canShrink || file.size < 400 * 1024) return asIs();
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        var b64 = cv.toDataURL('image/jpeg', 0.78).split(',')[1];
        resolve({ name: file.name.replace(/\.[^.]+$/, '') + '.jpg', size: Math.round(b64.length * 0.75), b64: b64 });
      };
      img.onerror = function () { URL.revokeObjectURL(url); asIs(); };
      img.src = url;
    });
  }

  function contactForm(c) {
    var f = el('form', { 'class': 'tc-form tc-contact', novalidate: '' });
    function field(id, lab, type, ac, req, key) {
      var w = el('label', { 'class': 'tc-field', 'for': id }); w.appendChild(el('span', null, lab + (req ? '' : ' (optional)')));
      var i = el('input', { id: id, type: type, autocomplete: ac }); if (S.a[key]) i.value = S.a[key];
      i.addEventListener('input', function () { S.a[key] = i.value.trim(); save(); });
      w.appendChild(i); f.appendChild(w); return i;
    }
    var nm = field('tc-name', 'Name', 'text', 'name', true, '_name');
    var co = field('tc-company', 'Company', 'text', 'organization', false, '_company');
    var em = field('tc-email', 'Email', 'email', 'email', true, '_email');
    var ph = field('tc-phone', 'Phone', 'tel', 'tel', false, '_phone');
    var pref = el('div', { 'class': 'tc-pref', role: 'radiogroup', 'aria-label': 'Best way to reach you' });
    pref.appendChild(el('span', null, 'Best way to reach you'));
    ['Email', 'Phone call', 'Either'].forEach(function (p) {
      var l = el('label'), r = el('input', { type: 'radio', name: 'tc-pref', value: p }); if ((S.a._pref || 'Either') === p) r.checked = true;
      r.addEventListener('change', function () { S.a._pref = p; save(); });
      l.appendChild(r); l.appendChild(document.createTextNode(' ' + p)); pref.appendChild(l);
    });
    f.appendChild(pref);
    var hp = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', 'class': 'tc-hp' }); f.appendChild(hp);
    var cl = el('label', { 'class': 'tc-consent' }), cb = el('input', { type: 'checkbox' }); cl.appendChild(cb);
    var t = el('span'); t.innerHTML = 'I agree to TileTrust Ltd using these details to reply to my enquiry, as set out in the <a href="/privacy.html" target="_blank" rel="noopener">privacy notice</a>.'; cl.appendChild(t); f.appendChild(cl);
    var err = el('p', { 'class': 'tc-err', role: 'alert' });
    var send = el('button', { type: 'submit', 'class': 'tc-go tc-send' }, 'Send enquiry');
    f.appendChild(err); f.appendChild(send); c.appendChild(f);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var prefV = S.a._pref || 'Either', phone = ph.value.trim();
      if (!nm.value.trim() || !/^\S+@\S+\.\S+$/.test(em.value.trim())) { err.textContent = 'Please add your name and a valid email so we can reply.'; return; }
      if (prefV === 'Phone call' && !phone) { err.textContent = 'Please add a phone number so we can call you, or choose email.'; return; }
      if (!cb.checked) { err.textContent = 'Please tick the box so we can use your details to reply.'; return; }
      err.textContent = ''; send.disabled = true; send.textContent = 'Sending…';
      var details = lines().join('\n') + '\nPreferred contact: ' + prefV + '\n\nSent from the website chat.';
      var payload = { name: nm.value.trim(), company: co.value.trim(), phone: phone, email: em.value.trim(), sector: S.a.sector || '', location: S.a.location || '', details: details, consent: true, tt_hp: hp.value, source: 'chat',
        attachments: files.map(function (x) { return { filename: x.name, content: x.b64 }; }) };
      fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { if (r.ok) done(payload.name, prefV); else fail(); })
        .catch(fail);
      function fail() {
        send.disabled = false; send.textContent = 'Send enquiry';
        clearControls();
        say('Sorry, that did not send. Your email app will open with your details ready to send to ' + EMAIL + ' instead' + (files.length ? '. Please attach your files to that email.' : '.'));
        var c2 = controls(); c2.appendChild(el('a', { 'class': 'tc-go', href: mailtoHref() }, 'Open email'));
        window.location.href = mailtoHref();
      }
    });
    nm.focus();
  }

  function done(name, prefV) {
    clearControls();
    reset(); S.step = STEPS.length; setProgress();
    var how = prefV === 'Phone call' ? 'by phone' : prefV === 'Email' ? 'by email' : 'by email or phone';
    say('Thanks ' + name.split(' ')[0] + ', that has been sent. Dan or Jay will get back to you as soon as possible ' + how + '.');
    say('We have also emailed you a copy. If you think of anything else, just reply to it.');
    var c = controls(), b = el('button', { type: 'button', 'class': 'tc-go' }, 'Close');
    b.addEventListener('click', close); c.appendChild(b); b.focus();
  }

  function show() {
    clearControls(); setProgress();
    if (S.step < 0) return intro();
    if (S.step >= STEPS.length) return;
    RENDER[STEPS[S.step]](controls());
    var f = body.querySelector('.tc-controls button, .tc-controls input, .tc-controls textarea');
    if (f && STEPS[S.step] !== 'contact') f.focus();
    body.scrollTop = body.scrollHeight;
  }
  function back() {
    if (!S.hist.length) return;
    S.step = S.hist.pop(); save(); say('Going back', 'me'); show();
  }
  function intro() {
    say('Hi, thanks for getting in touch with TileTrust.');
    say('A few quick questions will help us understand your project. Just tap to answer, skip anything you\u2019re not sure about, and add photos or drawings if you have them.');
    say('The more you can tell us, the quicker and more accurate your quote. Dan or Jay will then get back to you personally by email or phone.');
    var c = controls(), b = el('button', { type: 'button', 'class': 'tc-go' }, 'Start \u2013 about 2 minutes');
    b.addEventListener('click', function () { S.hist = []; go(0); });
    c.appendChild(b); b.focus();
  }
  function open() {
    lastFocus = document.activeElement;
    panel.hidden = false; opener.setAttribute('aria-expanded', 'true');
    if (!body.childNodes.length) {
      if (S.step > 0 && S.step < STEPS.length) say('Welcome back. Carrying on from where you left off.');
      if (S.step >= STEPS.length) reset();
      show();
    } else { var f = body.querySelector('.tc-controls button, .tc-controls input, .tc-controls textarea'); if (f) f.focus(); }
  }
  function close() {
    panel.hidden = true; opener.setAttribute('aria-expanded', 'false');
    if (S.step >= STEPS.length) { body.innerHTML = ''; reset(); }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function build() {
    opener = document.querySelector('.tc-open');
    if (!opener) return;
    load();
    panel = el('div', { 'class': 'tc-panel', role: 'dialog', 'aria-label': 'TileTrust enquiry chat', hidden: '' });
    var head = el('div', { 'class': 'tc-head' });
    backBtn = el('button', { type: 'button', 'class': 'tc-back', 'aria-label': 'Back' }, '‹ Back'); backBtn.addEventListener('click', back);
    var title = el('div', { 'class': 'tc-title' }); title.appendChild(el('strong', null, 'TileTrust enquiries'));
    progress = el('span', { 'class': 'tc-progress' }); title.appendChild(progress);
    var x = el('button', { type: 'button', 'class': 'tc-x', 'aria-label': 'Close chat' }, '×'); x.addEventListener('click', close);
    head.appendChild(backBtn); head.appendChild(title); head.appendChild(x);
    body = el('div', { 'class': 'tc-body', 'aria-live': 'polite' });
    var foot = el('div', { 'class': 'tc-foot' });
    var mail = el('a', { href: '#' }, 'Email us instead');
    mail.addEventListener('click', function (e) { e.preventDefault(); window.location.href = mailtoHref(); });
    foot.appendChild(mail); foot.appendChild(document.createTextNode(' · ')); foot.appendChild(el('a', { href: 'tel:+447434005958' }, 'Call 07434 005958'));
    panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot);
    document.body.appendChild(panel);
    opener.addEventListener('click', function () { if (panel.hidden) open(); else close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
