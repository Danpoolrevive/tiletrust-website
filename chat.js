/* TileTrust enquiry chat: a short guided chat that sends a quote request to info@tiletrustltd.co.uk.
   No AI: set questions, every step can be skipped, and "Email us instead" is always available. */
(function () {
  'use strict';
  var EMAIL = 'info@tiletrustltd.co.uk';

  var STEPS = [
    { key: 'work', q: 'What kind of work is it?', type: 'choice', options: ['Floor tiling', 'Wall tiling', 'Floors and walls', 'Bathroom or wet room', 'Kitchen (commercial or domestic)', 'Changing rooms or wet areas', 'Tile repairs or regrouting', 'Swimming pool', 'Something else'] },
    { key: 'site', q: 'What type of site is it?', type: 'choice', options: ['Commercial or retail', 'Hotel or hospitality', 'School or college', 'Healthcare', 'Leisure or sports', 'Home', 'Other'] },
    { key: 'location', q: 'Where is the site? A town or postcode is fine.', type: 'text', placeholder: 'e.g. Warrington or WA1' },
    { key: 'size', q: 'Roughly how big is the area?', type: 'choice', options: ['Under 20 m²', '20 to 100 m²', '100 to 500 m²', 'Over 500 m²', 'Not sure yet'], extra: 'Add measurements or room sizes (optional)' },
    { key: 'existing', q: 'Are there old tiles to remove first?', type: 'choice', options: ['Yes, old tiles to remove', 'No, new or bare surface', 'Not sure'] },
    { key: 'supply', q: 'Who will supply the tiles and materials (adhesive, grout and so on)?', type: 'choice', options: ['TileTrust to supply tiles and materials', 'I supply tiles, TileTrust supplies materials', 'I supply tiles and materials', 'Not sure yet'] },
    { key: 'timescale', q: 'When would you like the work done?', type: 'choice', options: ['As soon as possible', 'Within a month', 'In 1 to 3 months', 'In more than 3 months', 'Just pricing or tendering for now'] },
    { key: 'docs', q: 'Do you have drawings, a specification or photos?', type: 'choice', options: ['Yes, I can email them', 'No, not yet'] },
    { key: 'notes', q: 'Anything else that would help? For example access, working hours, or anything about the job.', type: 'long', placeholder: 'Optional' },
    { key: 'contact', q: 'Last step: how can we reach you?', type: 'contact' }
  ];
  var LABELS = { work: 'Work', site: 'Site type', location: 'Location', size: 'Size', existing: 'Old tiles to remove', supply: 'Tiles and materials', timescale: 'Timescale', docs: 'Drawings or photos', notes: 'Other notes' };

  var answers = {}, step = -1, history = [], panel, body, progress, backBtn, opener, lastFocus;

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (text != null) e.textContent = text;
    return e;
  }

  function summaryLines() {
    var out = [];
    STEPS.forEach(function (s) { if (LABELS[s.key] && answers[s.key]) out.push(LABELS[s.key] + ': ' + answers[s.key]); });
    return out;
  }

  function mailtoHref() {
    var lines = summaryLines();
    var b = 'Hi TileTrust,\n\n' + (lines.length ? 'Here are the details so far:\n' + lines.join('\n') + '\n\n' : '') + 'My name:\nMy phone:\n\nAny photos or drawings are attached.';
    return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Quote request' + (answers.work ? ' – ' + answers.work : '')) + '&body=' + encodeURIComponent(b);
  }

  function say(text, who) {
    var m = el('div', { 'class': 'tc-msg ' + (who || 'bot') }, text);
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
    return m;
  }

  function controls() {
    var c = el('div', { 'class': 'tc-controls' });
    body.appendChild(c);
    return c;
  }

  function clearControls() {
    var old = body.querySelectorAll('.tc-controls');
    for (var i = 0; i < old.length; i++) old[i].remove();
  }

  function setProgress() {
    if (step < 0) { progress.textContent = ''; backBtn.hidden = true; return; }
    progress.textContent = 'Step ' + (step + 1) + ' of ' + STEPS.length;
    backBtn.hidden = step === 0;
  }

  function skipBtn(c) {
    var s = el('button', { type: 'button', 'class': 'tc-skip' }, 'Skip');
    s.addEventListener('click', function () { say('Skipped', 'me'); next(); });
    c.appendChild(s);
  }

  function next() { history.push(step); show(step + 1); }

  function render() {
    var s = STEPS[step];
    say(s.q);
    var c = controls();
    if (s.type === 'choice') {
      var g = el('div', { 'class': 'tc-choices' });
      s.options.forEach(function (o) {
        var b = el('button', { type: 'button', 'class': 'tc-choice' }, o);
        b.addEventListener('click', function () {
          var extra = c.querySelector('.tc-extra');
          answers[s.key] = o + (extra && extra.value.trim() ? ' (' + extra.value.trim() + ')' : '');
          say(answers[s.key], 'me');
          if (s.key === 'docs' && o.indexOf('Yes') === 0) say('Great. Once you have sent this, email them to ' + EMAIL + ' with your name in the subject and we will match them up.');
          if (s.key === 'work' && o === 'Swimming pool') say('Pools are our speciality. We also trade as PoolRevive for pool projects, so you are in the right place.');
          next();
        });
        g.appendChild(b);
      });
      c.appendChild(g);
      if (s.extra) { var x = el('input', { 'class': 'tc-extra', type: 'text', placeholder: s.extra, 'aria-label': s.extra }); c.insertBefore(x, g); }
      skipBtn(c);
      var first = g.querySelector('button'); if (first) first.focus();
    } else if (s.type === 'text' || s.type === 'long') {
      var f = el('form', { 'class': 'tc-form' });
      var inp = s.type === 'long' ? el('textarea', { rows: '3', placeholder: s.placeholder || '', 'aria-label': s.q }) : el('input', { type: 'text', placeholder: s.placeholder || '', 'aria-label': s.q });
      if (answers[s.key]) inp.value = answers[s.key];
      var go = el('button', { type: 'submit', 'class': 'tc-go' }, 'Next');
      f.appendChild(inp); f.appendChild(go); c.appendChild(f);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = inp.value.trim();
        if (!v) { say('Skipped', 'me'); next(); return; }
        answers[s.key] = v.slice(0, 1500); say(answers[s.key], 'me'); next();
      });
      skipBtn(c);
      inp.focus();
    } else if (s.type === 'contact') {
      renderContact(c);
    }
  }

  function renderContact(c) {
    var f = el('form', { 'class': 'tc-form tc-contact', novalidate: '' });
    function field(id, label, type, ac, req) {
      var w = el('label', { 'class': 'tc-field', 'for': id });
      w.appendChild(el('span', null, label + (req ? '' : ' (optional)')));
      var i = el('input', { id: id, type: type, autocomplete: ac });
      w.appendChild(i); f.appendChild(w); return i;
    }
    var nm = field('tc-name', 'Name', 'text', 'name', true);
    var co = field('tc-company', 'Company', 'text', 'organization', false);
    var em = field('tc-email', 'Email', 'email', 'email', true);
    var ph = field('tc-phone', 'Phone', 'tel', 'tel', false);
    var pref = el('div', { 'class': 'tc-pref', role: 'radiogroup', 'aria-label': 'How should we contact you?' });
    pref.appendChild(el('span', null, 'Best way to reach you'));
    ['Email', 'Phone call', 'Either'].forEach(function (p, i) {
      var l = el('label'); var r = el('input', { type: 'radio', name: 'tc-pref', value: p }); if (i === 2) r.checked = true;
      l.appendChild(r); l.appendChild(document.createTextNode(' ' + p)); pref.appendChild(l);
    });
    f.appendChild(pref);
    var hp = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', 'class': 'tc-hp' });
    f.appendChild(hp);
    var cl = el('label', { 'class': 'tc-consent' });
    var cb = el('input', { type: 'checkbox' });
    cl.appendChild(cb);
    var t = el('span'); t.innerHTML = 'I agree to TileTrust Ltd using these details to reply to my enquiry, as set out in the <a href="/privacy.html" target="_blank" rel="noopener">privacy notice</a>.';
    cl.appendChild(t); f.appendChild(cl);
    var err = el('p', { 'class': 'tc-err', role: 'alert' });
    var send = el('button', { type: 'submit', 'class': 'tc-go tc-send' }, 'Send enquiry');
    f.appendChild(err); f.appendChild(send); c.appendChild(f);
    nm.focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var p = f.querySelector('input[name=tc-pref]:checked');
      var phone = ph.value.trim();
      if (!nm.value.trim() || !/^\S+@\S+\.\S+$/.test(em.value.trim())) { err.textContent = 'Please add your name and a valid email so we can reply.'; return; }
      if (p && p.value === 'Phone call' && !phone) { err.textContent = 'Please add a phone number so we can call you, or choose email.'; return; }
      if (!cb.checked) { err.textContent = 'Please tick the box so we can use your details to reply.'; return; }
      err.textContent = ''; send.disabled = true; send.textContent = 'Sending…';
      answers.pref = p ? p.value : 'Either';
      var details = summaryLines().join('\n') + '\nPreferred contact: ' + answers.pref + '\n\nSent from the website chat.';
      var payload = { name: nm.value.trim(), company: co.value.trim(), phone: phone, email: em.value.trim(), sector: [answers.work, answers.site].filter(Boolean).join(' – '), location: answers.location || '', details: details, consent: true, tt_hp: hp.value };
      fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { if (r.ok) done(payload); else fail(); })
        .catch(fail);
      function fail() {
        send.disabled = false; send.textContent = 'Send enquiry';
        clearControls();
        say('Sorry, that did not send. Your email app will open with your details ready to send to ' + EMAIL + ' instead.');
        var c2 = controls(); var a = el('a', { 'class': 'tc-go', href: mailtoHref() }, 'Open email');
        c2.appendChild(a); window.location.href = mailtoHref();
      }
    });
  }

  function done(p) {
    clearControls();
    progress.textContent = 'Sent'; backBtn.hidden = true;
    var how = answers.pref === 'Phone call' ? 'by phone' : answers.pref === 'Email' ? 'by email' : 'by email or phone';
    say('Thanks ' + p.name.split(' ')[0] + ', that has been sent. Dan or Jay will get back to you as soon as possible ' + how + '.');
    if (answers.docs && answers.docs.indexOf('Yes') === 0) say('Remember to email any drawings or photos to ' + EMAIL + '.');
    var c = controls(); var b = el('button', { type: 'button', 'class': 'tc-go' }, 'Close');
    b.addEventListener('click', close); c.appendChild(b); b.focus();
    answers = {}; history = []; step = STEPS.length;
  }

  function show(i) {
    clearControls();
    step = i; setProgress();
    if (i < STEPS.length) render();
  }

  function back() {
    if (!history.length) return;
    var prev = history.pop();
    clearControls();
    say('Going back', 'me');
    step = prev; setProgress(); if (step >= 0) render();
  }

  function start() {
    body.innerHTML = '';
    answers = {}; history = []; step = -1; setProgress();
    say('Hi, thanks for getting in touch with TileTrust.');
    say('A few quick questions help us understand your job. It takes about a minute, and you can skip anything. The more you can tell us, the quicker and more accurate your quote will be.');
    say('For anything specific, you will always get the best answers from Dan and Jay directly, so we will follow up by email or phone.');
    var c = controls();
    var go = el('button', { type: 'button', 'class': 'tc-go' }, 'Start');
    go.addEventListener('click', function () { history = []; show(0); });
    c.appendChild(go); go.focus();
  }

  function open() {
    lastFocus = document.activeElement;
    panel.hidden = false; opener.setAttribute('aria-expanded', 'true');
    if (step < 0 || step >= STEPS.length || !body.childNodes.length) start();
    else { var f = body.querySelector('.tc-controls button, .tc-controls input, .tc-controls textarea'); if (f) f.focus(); }
  }

  function close() {
    panel.hidden = true; opener.setAttribute('aria-expanded', 'false');
    if (step >= STEPS.length) step = -1;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function build() {
    opener = document.querySelector('.tc-open');
    if (!opener) return;
    panel = el('div', { 'class': 'tc-panel', role: 'dialog', 'aria-label': 'TileTrust enquiry chat', 'aria-modal': 'false', hidden: '' });
    var head = el('div', { 'class': 'tc-head' });
    backBtn = el('button', { type: 'button', 'class': 'tc-back', 'aria-label': 'Back' }, '‹ Back');
    backBtn.addEventListener('click', back);
    var title = el('div', { 'class': 'tc-title' });
    title.appendChild(el('strong', null, 'TileTrust enquiries'));
    progress = el('span', { 'class': 'tc-progress' });
    title.appendChild(progress);
    var x = el('button', { type: 'button', 'class': 'tc-x', 'aria-label': 'Close chat' }, '×');
    x.addEventListener('click', close);
    head.appendChild(backBtn); head.appendChild(title); head.appendChild(x);
    body = el('div', { 'class': 'tc-body', 'aria-live': 'polite' });
    var foot = el('div', { 'class': 'tc-foot' });
    var mail = el('a', { href: '#' }, 'Email us instead');
    mail.addEventListener('click', function (e) { e.preventDefault(); window.location.href = mailtoHref(); });
    foot.appendChild(mail);
    foot.appendChild(document.createTextNode(' · '));
    foot.appendChild(el('a', { href: 'tel:+447434005958' }, 'Call 07434 005958'));
    panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot);
    document.body.appendChild(panel);
    opener.addEventListener('click', function () { if (panel.hidden) open(); else close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
