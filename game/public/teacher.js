/* The 2/3 Game: projector deck. */
(function () {
  'use strict';

  const { BLOCK_M, FRAC, esc, fixed, num, pct, countUp, store, confetti } = TT;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  $$('[data-blockm]').forEach((el) => { el.innerHTML = BLOCK_M; });
  $$('[data-frac]').forEach((el) => { el.outerHTML = FRAC; });

  /* ------------------------------------------------------------ scaling */

  const stage = $('#stage');
  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  addEventListener('resize', fit);
  fit();

  /* ------------------------------------------------------- teacher key */

  let key = null;
  let isTeacher = false;
  (function readKey() {
    const u = new URL(location.href);
    const k = u.searchParams.get('key');
    if (k) {
      store.set('tt_key', k);
      u.searchParams.delete('key'); // keep it off the projector
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
    key = k || store.get('tt_key');
  })();

  let issued = 0;
  let applied = 0;
  async function request(path, opts = {}) {
    const ticket = ++issued;
    const usedKey = key;
    const headers = { 'content-type': 'application/json' };
    if (usedKey) headers['x-teacher-key'] = usedKey;
    const res = await fetch(path, { ...opts, headers, cache: 'no-store' });
    let data = null;
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Server said ${res.status}`);
      err.status = res.status;
      throw err;
    }
    if (ticket >= applied) { // ignore a slow poll that lands after a newer answer
      applied = ticket;
      apply(data, usedKey);
    }
    return data;
  }

  async function admin(action, body) {
    if (!isTeacher) {
      toast('View only. Use the teacher link (…/teacher?key=…) to take control.');
      return null;
    }
    try {
      return await request('/api/admin/' + action, { method: 'POST', body: JSON.stringify(body || {}) });
    } catch (e) {
      if (e.status === 401) {
        store.del('tt_key');
        key = null;
        isTeacher = false;
        document.body.classList.remove('teacher');
        toast("That teacher key didn't work. View only.");
      } else {
        toast(e.message);
      }
      return null;
    }
  }

  /* ----------------------------------------------------------- polling */

  let state = null;
  let failures = 0;
  async function poll() {
    try {
      await request('/api/deck');
      failures = 0;
      $('#net').classList.remove('down');
    } catch (e) {
      failures += 1;
      if (failures > 1) $('#net').classList.add('down');
    } finally {
      setTimeout(poll, 1500);
    }
  }

  let warnedKey = false;
  function apply(s, usedKey) {
    const prevCount = state ? state.count : 0;
    state = s;
    isTeacher = !!s.isTeacher;
    document.body.classList.toggle('teacher', isTeacher);
    if (usedKey && usedKey === key && !isTeacher && !warnedKey) {
      warnedKey = true;
      store.del('tt_key');
      key = null;
      toast("That teacher key didn't work. View only.");
    }
    renderAll(prevCount);
  }

  /* -------------------------------------------------------- navigation */

  const slides = $$('.slide');
  const names = slides.map((s) => s.dataset.slide);
  const idx = (name) => names.indexOf(name);
  const STEPS = { levelk: 7, nash: 7 };
  const steps = { levelk: 0, nash: 0 };
  let cur = -1;

  function go(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    const dir = cur < 0 ? 0 : Math.sign(i - cur);
    cur = i;
    const name = names[cur];
    if (STEPS[name] != null) {
      if (dir > 0) steps[name] = 0;
      if (dir < 0) steps[name] = STEPS[name];
    }
    slides.forEach((s, j) => {
      s.classList.toggle('active', j === cur);
      s.classList.toggle('past', j < cur);
    });
    stage.dataset.slide = name;
    saveHash();
    renderSlide(name, false);
    renderDock();
  }

  // #results, or #nash.3 for a step inside a slide, so a refresh lands in the same place.
  function saveHash() {
    const n = names[cur];
    try { history.replaceState(null, '', '#' + n + (STEPS[n] != null ? '.' + steps[n] : '')); } catch (e) { /* ignore */ }
  }

  function next() {
    const n = names[cur];
    if (STEPS[n] != null && steps[n] < STEPS[n]) {
      steps[n] += 1;
      saveHash();
      renderSlide(n, true);
      return;
    }
    go(cur + 1);
  }

  function prev() {
    const n = names[cur];
    if (STEPS[n] != null && steps[n] > 0) {
      steps[n] -= 1;
      saveHash();
      renderSlide(n, false);
      return;
    }
    go(cur - 1);
  }

  /* ------------------------------------------------------------ render */

  const STATUS_TEXT = { waiting: 'Waiting', open: 'Open', closed: 'Closed', revealed: 'Revealed' };

  function renderAll(prevCount) {
    if (!state) return;
    const s = state;
    $('#chRound').textContent = `Round ${s.round}`;
    const ch = $('#chStatus');
    ch.className = 'chip status ' + s.status;
    ch.textContent = s.status === 'open' || s.status === 'closed' ? `${STATUS_TEXT[s.status]} · ${s.count}` : STATUS_TEXT[s.status];
    renderJoin(prevCount);
    renderDock();
    const name = names[cur];
    if (['results', 'levelk', 'theory', 'again'].includes(name)) renderSlide(name, false);
  }

  function renderSlide(name, stepping) {
    if (name === 'nash') { renderNash(stepping); return; } // pure theory, no data needed
    if (!state) return;
    if (name === 'join') renderJoin(state.count);
    else if (name === 'results') renderResults();
    else if (name === 'levelk') renderLevelK();
    else if (name === 'nash') renderNash(stepping);
    else if (name === 'theory') renderTheory();
    else if (name === 'again') renderAgain();
  }

  function btn(act, label, cls = '') {
    return `<button class="btn ${cls}" data-act="${act}">${label}</button>`;
  }

  /* ---------------------------------------------------------- join */

  let tickIds = '';
  const seen = new Set();
  function renderJoin(prevCount) {
    const s = state;
    $('#joinUrl').textContent = s.join.short;

    const pill = $('#joinStatus');
    pill.className = 'status-pill ' + s.status;
    pill.textContent = {
      waiting: 'Not open yet',
      open: 'Open: guess now',
      closed: 'Guessing closed',
      revealed: 'Results are in',
    }[s.status];

    const countEl = $('#joinCount');
    if (countEl.textContent !== String(s.count)) {
      countEl.textContent = s.count;
      if (s.count > prevCount) {
        countEl.classList.remove('bump');
        void countEl.offsetWidth;
        countEl.classList.add('bump');
      }
    }
    $('#joinCountLabel').textContent = s.count === 1 ? 'guess in' : 'guesses in';
    const share = (s.count / 107601) * 100;
    $('#joinCapacity').textContent = `The Big House seats 107,601. We're at ${s.count ? share.toFixed(share < 0.1 ? 3 : 2) : 0}%.`;

    const acts = {
      waiting: btn('open', '▶ Open guessing'),
      open: btn('close', '■ Close guessing'),
      closed: btn('reveal', 'Reveal results →') + btn('open', 'Reopen', 'ghost'),
      revealed: btn('goResults', 'See results →') + btn('newround', 'New round', 'ghost'),
    }[s.status];
    const box = $('#joinActions');
    if (box.dataset.status !== s.status) {
      box.innerHTML = acts;
      box.dataset.status = s.status;
    }

    const ids = s.recent.map((t) => t.id).join(',');
    if (ids !== tickIds) {
      const fresh = tickIds !== '';
      tickIds = ids;
      $('#ticker').innerHTML = s.recent.length
        ? s.recent.slice(0, 6).map((t) => {
          const isNew = fresh && !seen.has(t.id);
          return `<span class="tick${isNew ? ' new' : ''}">${esc(t.name)}${t.bot ? ' 🤖' : ''}${t.school && !t.bot ? `<small>${esc(t.school)}</small>` : ''}</span>`;
        }).join('')
        : '<span class="tick" style="opacity:.55">Nobody yet. Be the first!</span>';
      s.recent.forEach((t) => seen.add(t.id));
    }
  }

  /* ------------------------------------------------------- the field */

  const EZ = 70;
  function geom(w, h, top) {
    const x0 = EZ;
    const x1 = w - EZ;
    const base = h - 50;
    return { w, h, x0, x1, base, top, X: (v) => x0 + (v / 100) * (x1 - x0) };
  }

  function defs(g, id) {
    return `<defs>
      <clipPath id="clip-${id}"><rect x="0" y="0" width="${g.w}" height="${g.h}" rx="16"/></clipPath>
      <clipPath id="play-${id}"><rect x="0" y="0" width="${g.x1}" height="${g.base}"/></clipPath>
      <pattern id="hatch-${id}" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="22" height="22" fill="rgba(0,10,22,0.74)"/><rect width="8" height="22" fill="rgba(255,255,255,0.10)"/>
      </pattern>
    </defs>`;
  }

  function fieldBase(g) {
    let s = `<rect class="band" x="0" y="0" width="${g.w}" height="${g.h}"/>`;
    const ten = g.X(10) - g.X(0);
    for (let i = 0; i < 10; i++) s += `<rect class="${i % 2 ? 'mow-b' : 'mow-a'}" x="${g.X(i * 10)}" y="0" width="${ten}" height="${g.base}"/>`;
    s += `<rect class="ez ez-l" x="0" y="0" width="${g.x0}" height="${g.base}"/>`;
    s += `<rect class="ez ez-r" x="${g.x1}" y="0" width="${g.w - g.x1}" height="${g.base}"/>`;
    s += `<text class="ez-t" transform="translate(${g.x0 / 2} ${g.base / 2}) rotate(-90)">NASH</text>`;
    s += `<text class="ez-t" transform="translate(${(g.x1 + g.w) / 2} ${g.base / 2}) rotate(90)">GO BLUE</text>`;
    for (let v = 5; v < 100; v += 5) s += `<line class="${v % 10 ? 'yl5' : 'yl'}" x1="${g.X(v)}" x2="${g.X(v)}" y1="0" y2="${g.base}"/>`;
    for (let v = 1; v < 100; v++) {
      if (v % 5 === 0) continue;
      const x = g.X(v);
      s += `<line class="hash" x1="${x}" x2="${x}" y1="${g.base - 14}" y2="${g.base}"/><line class="hash" x1="${x}" x2="${x}" y1="0" y2="12"/>`;
    }
    s += `<line class="goal" x1="${g.x0}" x2="${g.x0}" y1="0" y2="${g.base}"/><line class="goal" x1="${g.x1}" x2="${g.x1}" y1="0" y2="${g.base}"/>`;
    for (let v = 0; v <= 100; v += 10) s += `<text class="yn" x="${g.X(v)}" y="${g.h - 15}">${v}</text>`;
    return s;
  }

  const binOf = (v, bw) => Math.min(Math.round(100 / bw) - 1, Math.floor(v / bw + 1e-9));

  function barsSVG(g, guesses, bw, winBins) {
    const nb = Math.round(100 / bw);
    const counts = new Array(nb).fill(0);
    guesses.forEach((v) => { counts[binOf(v, bw)] += 1; });
    const max = Math.max(1, ...counts);
    const room = g.base - g.top;
    const step = g.X(bw) - g.X(0);
    let bars = '';
    let labels = '';
    let trophies = '';
    counts.forEach((c, i) => {
      if (!c) return;
      const hpx = Math.max(6, (c / max) * room);
      const wpx = Math.max(2, step - 3);
      const x = g.X(i * bw) + 1.5;
      const y = g.base - hpx;
      const win = winBins && winBins.has(i);
      const labeled = bw >= 2 && c >= Math.max(2, max * 0.3);
      bars += `<rect class="bar${win ? ' win' : ''}" x="${x}" y="${y}" width="${wpx}" height="${hpx}" rx="3" style="transition-delay:${((i / nb) * 0.7).toFixed(2)}s"/>`;
      if (labeled) labels += `<text class="bar-n" x="${x + wpx / 2}" y="${y - 10}">${c}</text>`;
      // Inside the bar when it's tall enough, so it never collides with the target tag.
      if (win) trophies += `<text class="trophy" x="${x + wpx / 2}" y="${hpx >= 56 ? y + 44 : y - (labeled ? 42 : 12)}">🏆</text>`;
    });
    return `<g class="bars">${bars}</g>${labels}${trophies}`;
  }

  // A vertical marker with a tag on top. It is drawn at `at` and can slide later.
  function markerSVG(g, cls, label, row, v, at) {
    const cy = row === 0 ? 26 : 72;
    const tw = Math.round(label.length * 15.5 + 34);
    const x = g.X(v);
    const cx = Math.min(Math.max(x, tw / 2 + 4), g.w - tw / 2 - 4);
    return `<g class="marker ${cls}" style="transform:translate(${g.X(at == null ? v : at)}px,0)" data-x="${x}">` +
      `<line x1="0" x2="0" y1="${cy + 20}" y2="${g.base}"/>` +
      `<g class="tag" transform="translate(${cx - x} 0)"><rect x="${-tw / 2}" y="${cy - 20}" width="${tw}" height="40" rx="8"/><text x="0" y="${cy + 1}">${label}</text></g></g>`;
  }

  function slideMarker(svg, sel) {
    const m = svg.querySelector(sel);
    if (!m) return;
    m.style.transform = `translate(${m.dataset.x}px,0)`;
    m.classList.add('on');
  }

  /* ------------------------------------------------------- results */

  let resKey = null;
  let animatedRound = null;
  let resTimers = [];

  function resultForRound() {
    const s = state;
    return s && s.latest && s.latest.round === s.round ? s.latest : null;
  }

  function renderResults() {
    const s = state;
    const r = resultForRound();
    $('#resKicker').textContent = `Round ${s.round} · The results`;
    $('#resLocked').hidden = !!r;
    $('#resBody').hidden = !r;
    $('#resPress').hidden = !!r;
    if (!r) {
      resKey = null;
      const n = s.count;
      $('#resLockedText').textContent = n
        ? `${n} ${n === 1 ? 'guess' : 'guesses'} in. ${s.status === 'open' ? 'Guessing is still open.' : 'Guessing is closed.'}`
        : 'No guesses yet.';
      const box = $('#resActions');
      const want = s.status === 'open' ? 'open' : 'other';
      if (box.dataset.mode !== want) {
        box.dataset.mode = want;
        box.innerHTML = s.status === 'open' ? btn('reveal', 'Close &amp; reveal →') : btn('reveal', 'Reveal results →');
      }
      return;
    }
    const k = `${r.round}:${r.n}`;
    if (names[cur] === 'results' && animatedRound !== r.round) {
      animatedRound = r.round;
      resKey = k;
      buildResults(r, true);
    } else if (k !== resKey) {
      resKey = k;
      buildResults(r, false);
    }
  }

  function winningText(r) {
    const w = r.winningGuesses || [];
    if (!w.length) return '–';
    return w.slice(0, 2).map((v) => num(v, 2)).join(' & ') + (w.length > 2 ? '…' : '');
  }

  function winnerQuip(r) {
    if (!r.winners.length) return '';
    if (r.winnersTotal > 1) return 'Victors, plural. For once.';
    const w = r.winners[0];
    const school = (w.school || '').trim().toLowerCase();
    if (w.bot) return "A robot won. Don't feel bad: Michigan has been out-thought by worse this season.";
    if (/ohio state|\bosu\b|buckeye/.test(school)) return "Of course it's a Buckeye. Of course it is.";
    if (/michigan state|\bmsu\b|spartan/.test(school)) return 'A Spartan wins in Ann Arbor. Somewhere, a Michigan fan just felt a disturbance.';
    if (/^(the )?(university of )?michigan(,? ann arbor)?$|^u-?m$|^umich$|wolverine/.test(school)) return "A Michigan win! Savor it. They've been rare this fall.";
    if (w.guess < 1) return 'A game theorist actually won. Alert the textbook authors.';
    return 'Finally, a victory we can all agree on.';
  }

  function winnerHTML(r) {
    const many = r.winnersTotal > 1;
    const people = r.winners.map((w) =>
      `<span class="w-name">${esc(w.name)}${w.bot ? ' 🤖' : ''}${w.school && !w.bot ? ` <span class="w-school">(${esc(w.school)})</span>` : ''}</span>`
    ).join('');
    const more = r.winnersTotal > r.winners.length ? `<span class="w-more">+${r.winnersTotal - r.winners.length} more</span>` : '';
    return `<div class="w-trophy">🏆</div>
      <div class="w-main"><div class="w-title">Hail to the Victor${many ? 's' : ''}!</div><div class="w-names">${people}${more}</div></div>
      <div class="w-quip">${esc(winnerQuip(r))}</div>`;
  }

  function buildResults(r, animate) {
    resTimers.forEach(clearTimeout);
    resTimers = [];
    const sbN = $('#sbN');
    const sbAvg = $('#sbAvg');
    const sbTarget = $('#sbTarget');
    const sbWin = $('#sbWin');
    const win = $('#winner');
    const g = geom(1720, 440, 128);

    if (!r.n) {
      $('#resField').innerHTML = `<svg class="field grown instant" viewBox="0 0 ${g.w} ${g.h}">${defs(g, 'res')}<g clip-path="url(#clip-res)">${fieldBase(g)}</g></svg>`;
      sbN.textContent = '0';
      sbAvg.textContent = sbTarget.textContent = sbWin.textContent = '–';
      win.className = 'winner empty on';
      win.innerHTML = '<div class="w-trophy">🫥</div><div class="w-main"><div class="w-title">No guesses this round</div><div class="w-names">Zero guesses, zero points. The Michigan offense knows the feeling.</div></div>';
      return;
    }

    const bw = r.n >= 120 ? 1 : 2;
    const winBins = new Set(r.winningGuesses.map((v) => binOf(v, bw)));
    const from = animate ? 50 : null;
    $('#resField').innerHTML =
      `<svg class="field${animate ? '' : ' grown show-win instant'}" viewBox="0 0 ${g.w} ${g.h}">${defs(g, 'res')}<g clip-path="url(#clip-res)">` +
      fieldBase(g) +
      barsSVG(g, r.guesses, bw, winBins) +
      markerSVG(g, 'avg', `AVERAGE ${fixed(r.avg, 2)}`, 1, r.avg, from) +
      markerSVG(g, 'target', `TARGET ${fixed(r.target, 2)}`, 0, r.target, from) +
      '</g></svg>';
    const svg = $('#resField svg');
    win.className = 'winner';
    win.innerHTML = winnerHTML(r);

    if (!animate) {
      $$('.marker', svg).forEach((m) => m.classList.add('on'));
      sbN.textContent = r.n;
      sbAvg.textContent = fixed(r.avg, 2);
      sbTarget.textContent = fixed(r.target, 2);
      sbWin.textContent = winningText(r);
      win.classList.add('on');
      return;
    }

    sbN.textContent = sbAvg.textContent = sbTarget.textContent = sbWin.textContent = '–';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      svg.classList.add('grown');
      countUp(sbN, r.n, 0, 800);
    }));
    resTimers.push(setTimeout(() => { slideMarker(svg, '.marker.avg'); countUp(sbAvg, r.avg, 2); }, 1400));
    resTimers.push(setTimeout(() => { slideMarker(svg, '.marker.target'); countUp(sbTarget, r.target, 2); }, 2700));
    resTimers.push(setTimeout(() => {
      svg.classList.add('show-win');
      sbWin.textContent = winningText(r);
      win.classList.add('on');
      confetti();
    }, 4000));
  }

  /* -------------------------------------------------------- level-k */

  // Left to right, the way they sit on the field. `step` is when each appears.
  const LK = [
    { key: 'inf', name: 'Level ∞', v: 0, show: '0', d: 'Nash: reasons all the way down.', q: 'Read the textbook. Skipped the tailgate.', cls: 'inf', step: 6, row: 1, tag: 'L∞ · 0' },
    { key: 'L4', name: 'Level 4+', v: 800 / 81, show: '9.9', d: 'Keeps going: 9.9, 6.6, 4.4…', step: 5, row: 0, tag: 'L4 · 9.9' },
    { key: 'L3', name: 'Level 3', v: 400 / 27, show: '14.8', d: 'Best response to Level 2.', step: 4, row: 1, tag: 'L3 · 14.8' },
    { key: 'L2', name: 'Level 2', v: 200 / 9, show: '22.2', d: 'Best response to Level 1.', step: 3, row: 0, tag: 'L2 · 22.2' },
    { key: 'L1', name: 'Level 1', v: 100 / 3, show: '33.3', d: 'Best response to Level 0.', step: 2, row: 1, tag: 'L1 · 33.3' },
    { key: 'L0', name: 'Level 0', v: 50, show: '50', d: 'Picks at random. Averages 50.', q: 'See also: our play-calling.', step: 1, row: 0, tag: 'L0 · 50' },
    { key: 'dom', name: 'Over 66.7', v: null, show: '>66.7', d: 'Dominated: can never win.', q: 'Michigan fans in August.', cls: 'dom', step: 7 },
  ];

  // Each guess goes to the nearest level (cut-offs halfway between levels).
  function bandOf(g) {
    if (g > 200 / 3) return 'dom';
    if (g >= 125 / 3) return 'L0';
    if (g >= 250 / 9) return 'L1';
    if (g >= 500 / 27) return 'L2';
    if (g >= 1000 / 81) return 'L3';
    if (g >= 1) return 'L4';
    return 'inf';
  }

  let lkKey = null;
  function renderLevelK() {
    const r = state.latest;
    const has = r && r.n > 0;
    const k = has ? `${r.round}:${r.n}` : 'none';
    if (k !== lkKey) {
      lkKey = k;
      const g = geom(1720, 310, 112);
      const markers = LK.filter((l) => l.v != null).map((l) => markerSVG(g, `lvl lv-${l.key}${l.cls ? ' ' + l.cls : ''}`, l.tag, l.row, l.v)).join('');
      const domX = g.X(200 / 3);
      $('#lkField').innerHTML =
        `<svg class="field grown instant" viewBox="0 0 ${g.w} ${g.h}">${defs(g, 'lk')}<g clip-path="url(#clip-lk)">` +
        fieldBase(g) +
        `<g class="dom"><rect x="${domX}" y="0" width="${g.x1 - domX}" height="${g.base}" fill="url(#hatch-lk)"/><text class="dom-t" x="${(domX + g.x1) / 2}" y="${g.base / 2 + 12}">DOMINATED</text></g>` +
        (has ? barsSVG(g, r.guesses, r.n >= 120 ? 1 : 2, null) : '') +
        markers +
        '</g></svg>';

      const counts = {};
      if (has) r.guesses.forEach((v) => { const b = bandOf(v); counts[b] = (counts[b] || 0) + 1; });
      $('#lkChips').innerHTML = LK.map((l) => {
        const c = counts[l.key] || 0;
        const share = has ? c / r.n : 0;
        return `<div class="lk ${l.cls || ''}" data-step="${l.step}">
          <div class="lk-name">${l.name}</div>
          <div class="lk-v">${l.show}</div>
          <div class="lk-d">${l.d}${l.q ? `<em>${l.q}</em>` : ''}</div>
          <div class="lk-share"><div class="lk-bar"><i style="width:${(share * 100).toFixed(1)}%"></i></div>
          <div class="lk-p">${has ? pct(share) : '–'} <small>${has ? `${c} ${c === 1 ? 'guess' : 'guesses'}` : 'of the room'}</small></div></div>
        </div>`;
      }).join('');
      $('#lkTake').innerHTML = lkTakeaway(r);
    }

    const st = steps.levelk;
    const svg = $('#lkField svg');
    LK.forEach((l) => {
      const m = l.v != null ? $(`.lv-${l.key}`, svg) : null;
      if (m) m.classList.toggle('on', st >= l.step);
    });
    $('.dom', svg).classList.toggle('on', st >= 7);
    $$('#lkChips .lk').forEach((el) => el.classList.toggle('off', st < +el.dataset.step));
    $('#lkTake').classList.toggle('off', st < 7);
  }

  function lkTakeaway(r) {
    if (!r || !r.n) return "Play a round and this slide fills in with your room's guesses.";
    const a = r.avg;
    if (a >= 50) return `This room averaged <b>${num(a, 1)}</b>: shallower than Level 0. Bold strategy.`;
    if (a < 0.5) return `This room averaged <b>${num(a, 1)}</b>. Everyone went all the way to Nash. Are you all game theorists?`;
    const k = Math.log(a / 50) / Math.log(2 / 3);
    return `This room averaged <b>${num(a, 1)}</b>, as if the typical player thought <b>${k.toFixed(1)} steps</b> ahead. ` +
      `To win, you had to go one step further (about <b>Level ${(k + 1).toFixed(1)}</b>), not all the way to Level ∞.`;
  }

  /* ----------------------------------------------------------- Nash */

  const B = [100, 200 / 3, 400 / 9, 800 / 27, 1600 / 81, 3200 / 243];
  const NASH = [
    'Any number from 0 to 100 is allowed. Let’s reason it through, one step at a time.',
    `<b>Step 1.</b> Even if everyone picks 100, the target is ${FRAC} × 100 = <b>66.7</b>. A guess above 66.7 can never win: it’s <em>dominated</em>.`,
    `<b>Step 2.</b> If no one picks above 66.7, the target can’t top ${FRAC} × 66.7 = <b>44.4</b>. Cross off everything above it.`,
    '<b>Step 3.</b> And if no one picks above 44.4, the target can’t top <b>29.6</b>.',
    '<b>Step 4.</b> …which rules out anything above <b>19.8</b>.',
    '<b>Step 5.</b> …and anything above <b>13.2</b>.',
    'Each step knocks off another third. Keep going: 8.8, 5.9, 3.9, 2.6, 1.7… <b>forever</b>.',
    '<b>Touchdown.</b> Only <b>0</b> survives. If everyone picks 0, the target is 0, and nobody can do better by switching. That’s the <b>Nash equilibrium</b>.',
  ];
  const NASH_NOTE = 'Level-k reasoning starts from a belief about others (Level 0 averages 50). Iterated dominance starts from the worst case (100). Both march to 0. The real question is how many steps people actually take.';
  const CHAIN = ['100', '66.7', '44.4', '29.6', '19.8', '13.2', '…', '0'];

  let nashTimers = [];
  let nashG = null;
  function buildNash() {
    const g = geom(1720, 320, 0);
    nashG = g;
    $('#nashField').innerHTML =
      `<svg class="field" viewBox="0 0 ${g.w} ${g.h}">${defs(g, 'nash')}<g clip-path="url(#clip-nash)">` +
      fieldBase(g) +
      `<g clip-path="url(#play-nash)"><g class="elim" style="transform:translate(${g.x1}px,0)">` +
      `<rect x="0" y="0" width="${g.w}" height="${g.base}" fill="url(#hatch-nash)"/>` +
      `<text class="elim-t" x="34" y="${g.base / 2 + 13}">ELIMINATED</text></g></g>` +
      `<text class="td-t" x="${g.w / 2}" y="${g.base / 2 + 22}">TOUCHDOWN!</text>` +
      `<g class="ball" style="transform:translate(${g.x1}px,0)">` +
      `<line x1="0" x2="0" y1="0" y2="${g.base}" stroke="#fff" stroke-width="5"/>` +
      `<text class="ball-t" x="0" y="${g.base / 2 - 30}">🏈</text>` +
      `<text class="ball-v" x="0" y="${g.base / 2 + 52}" style="paint-order:stroke;stroke:#00274C;stroke-width:10px">100</text></g>` +
      '</g></svg>';
    $('#nashChain').innerHTML = CHAIN.map((c, i) =>
      (i ? '<span class="a">→</span>' : '') + `<span class="c${c === '0' ? ' zero' : ''}" data-i="${i}">${c}</span>`
    ).join('');
  }

  function setBound(b) {
    const svg = $('#nashField svg');
    const x = nashG.X(b);
    $('.elim', svg).style.transform = `translate(${x}px,0)`;
    $('.ball', svg).style.transform = `translate(${x}px,0)`;
    $('.ball-v', svg).textContent = num(b, 1);
  }

  function renderNash(animate) {
    if (!nashG) buildNash();
    nashTimers.forEach(clearTimeout);
    nashTimers = [];
    const s = steps.nash;
    const svg = $('#nashField svg');
    svg.classList.remove('fast');
    $$('#nashChain .c').forEach((el) => el.classList.toggle('on', +el.dataset.i <= s));
    $('#nashText').innerHTML = NASH[s];
    const note = $('#nashNote');
    note.textContent = NASH_NOTE;
    note.style.opacity = s === 7 ? 1 : 0;
    $('#nashPress').style.opacity = s === 7 ? 0 : 1; // the note takes its place

    const ez = $('.ez-l', svg);
    ez.classList.remove('td');
    svg.classList.toggle('td', s === 7);
    $('.td-t', svg).classList.toggle('on', s === 7);

    if (s === 6) {
      let b = B[5];
      if (animate) {
        svg.classList.add('fast');
        for (let i = 1; i <= 12; i++) nashTimers.push(setTimeout(() => { b *= 2 / 3; setBound(b); }, i * 240));
      } else {
        setBound(B[5] * Math.pow(2 / 3, 12));
      }
    } else {
      setBound(s === 7 ? 0 : B[s]);
    }
    if (s === 7 && animate) {
      void ez.getBoundingClientRect();
      ez.classList.add('td');
      confetti({ count: 140, duration: 3500 });
    }
  }

  /* --------------------------------------------------------- theory */

  let thKey = null;
  function renderTheory() {
    const r = state.latest;
    const has = r && r.n > 0;
    const k = has ? `${r.round}:${r.n}` : 'none';
    if (k === thKey) return;
    thKey = k;
    $('#thTitle').innerHTML = has
      ? `Nash said 0. This room said <span class="maize">${num(r.avg, 1)}</span>.`
      : 'Nash said 0. What will this room say?';

    const papers = [
      { l: 'Expansión', s: 'Spanish business daily', v: 25.47 },
      { l: 'Spektrum der Wissenschaft', s: 'German science magazine', v: 22.08 },
      { l: 'Financial Times', s: 'British business daily', v: 18.91 },
    ];
    const room = { l: 'This room', s: has ? `${r.n} players, round ${r.round}` : 'play a round first', v: has ? r.avg : null, cls: 'me' };
    const rows = papers.slice();
    const at = has ? rows.findIndex((p) => p.v < room.v) : 0;
    rows.splice(at < 0 ? rows.length : at, 0, room);
    rows.push({ l: 'Nash equilibrium', s: 'everyone fully rational', v: 0, cls: 'nash' });

    const max = Math.max(50, has ? r.avg : 0);
    $('#thBars').innerHTML = rows.map((row) => {
      const w = row.v == null ? 0 : (row.v / max) * 100;
      const out = row.cls !== 'nash' && w < 14;
      return `<div class="hb ${row.cls || ''}"><div class="hb-l">${esc(row.l)}<small>${esc(row.s)}</small></div>` +
        `<div class="hb-track"><div class="hb-fill${out ? ' out' : ''}" style="width:${w.toFixed(1)}%"><span>${row.v == null ? '?' : num(row.v, 1)}</span></div></div></div>`;
    }).join('');

    $('#thZeros').textContent = has
      ? `In this room, ${pct(r.zeros / r.n)} picked 0 (or close). ` +
        (r.winningGuesses[0] < 1 ? 'And they won! This room is alarmingly rational.' : 'Right in theory, wrong in practice.')
      : '';
  }

  /* ---------------------------------------------------------- again */

  let agKey = null;
  function renderAgain() {
    const s = state;
    const hist = (s.history || []).slice(-5);
    const revealed = s.status === 'revealed';
    const nextN = revealed ? s.round + 1 : s.round;
    const k = JSON.stringify([hist, s.status, s.round, isTeacher]);
    if (k === agKey) return;
    agKey = k;

    $('#agKicker').textContent = `Round ${nextN}`;
    const max = Math.max(50, ...hist.map((h) => h.avg || 0));
    const H = 440;
    const hpx = (v) => (v == null ? 0 : Math.max(6, (v / max) * H));
    let cols = hist.map((h) =>
      `<div class="ag-col"><div class="ag-b avg" style="height:${hpx(h.avg)}px"><span>${num(h.avg, 1)}</span></div>` +
      `<div class="ag-b tgt" style="height:${hpx(h.target)}px"><span>${num(h.target, 1)}</span></div>` +
      `<div class="ag-name">Round ${h.round}</div></div>`
    ).join('');
    if (!hist.some((h) => h.round === nextN)) {
      cols += `<div class="ag-col"><div class="ag-b q" style="height:${H * 0.5}px"><span>?</span></div>` +
        `<div class="ag-b q" style="height:${H * 0.33}px"><span>?</span></div><div class="ag-name">Round ${nextN}</div></div>`;
    }
    $('#agChart').innerHTML =
      `<h3>Average and target, by round</h3><div class="ag-cols">${cols}</div>` +
      `<div class="ag-legend"><span><i style="background:var(--sky)"></i>Average guess</span><span><i style="background:var(--maize)"></i>Target (${FRAC} × average)</span></div>`;

    $('#agActions').innerHTML = {
      revealed: btn('startNext', `Start round ${nextN} →`),
      waiting: btn('startNext', `Open round ${nextN} →`),
      open: btn('goJoin', `Back to round ${nextN} →`),
      closed: btn('reveal', `Reveal round ${nextN} →`),
    }[s.status];
  }

  /* ----------------------------------------------------------- dock */

  const LABELS = { title: 'Title', rules: 'Rules', join: 'Join', results: 'Results', levelk: 'Level-k', nash: 'Nash', theory: 'Theory vs. room', again: 'Play again', steal: 'Steal this' };
  $('#dots').innerHTML = names.map((n, i) => `<button data-go="${i}" title="${i + 1}. ${LABELS[n] || n}"></button>`).join('');

  function renderDock() {
    $$('#dots button').forEach((b, i) => b.classList.toggle('on', i === cur));
    if (!state) return;
    const s = state;
    $('#dockStatus').textContent = `Round ${s.round} · ${STATUS_TEXT[s.status]} · ${s.count}`;
    const set = (act, disabled, primary) => {
      const b = $(`#dock [data-act="${act}"]`);
      if (!b) return;
      b.disabled = disabled;
      b.classList.toggle('primary', !!primary);
    };
    set('open', s.status === 'open' || s.status === 'revealed', s.status === 'waiting');
    set('close', s.status !== 'open', s.status === 'open');
    set('reveal', s.status === 'revealed', s.status === 'closed');
    set('newround', false, s.status === 'revealed');
    set('bots', s.status === 'revealed');
  }

  /* -------------------------------------------------------- actions */

  const ACT = {
    prev,
    next,
    goResults: () => go(idx('results')),
    goJoin: () => go(idx('join')),
    open: () => admin('open'),
    close: () => admin('close'),
    async reveal() {
      if (state && state.status === 'revealed') {
        if (names[cur] === 'results') { animatedRound = null; renderResults(); } // replay
        else go(idx('results'));
        return;
      }
      if (await admin('reveal')) go(idx('results'));
    },
    async newround() {
      if (state && state.status !== 'revealed' && state.count > 0 &&
        !confirm(`Round ${state.round} hasn't been revealed. Start a new round anyway?`)) return;
      if (await admin('newround')) go(idx('join'));
    },
    async startNext() {
      if (!state) return;
      let ok = true;
      if (state.status === 'revealed') ok = !!(await admin('newround', { open: true }));
      else if (state.status === 'waiting' || state.status === 'closed') ok = !!(await admin('open'));
      if (ok) go(idx('join'));
    },
    async bots() {
      if (await admin('bots', { n: 25 })) toast('25 robots are on their way 🤖');
    },
    async reset() {
      if (!confirm('Reset everything? This clears every round and every guess.')) return;
      if (await admin('reset')) {
        animatedRound = resKey = lkKey = thKey = agKey = null;
        seen.clear();
        tickIds = '';
        toast('Fresh start. Round 1 is ready.');
      }
    },
    key() {
      const k = prompt('Teacher key:');
      if (!k) return;
      key = k.trim();
      store.set('tt_key', key);
      warnedKey = false;
      request('/api/deck').then((s) => toast(s && s.isTeacher ? 'You have the controls. Go Blue!' : "That key didn't work.")).catch(() => {});
    },
    full() {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      else document.exitFullscreen && document.exitFullscreen();
    },
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act], [data-go]');
    if (!b) return;
    if (b.dataset.go != null) go(+b.dataset.go);
    else if (ACT[b.dataset.act]) ACT[b.dataset.act]();
    b.blur(); // so the space bar keeps advancing slides
  });

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'ArrowDown') { e.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp' || k === 'Backspace') { e.preventDefault(); prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(slides.length - 1);
    else if (/^[1-9]$/.test(k)) go(+k - 1);
    else if (k === 'o' || k === 'O') ACT.open();
    else if (k === 'c' || k === 'C') ACT.close();
    else if (k === 'r' || k === 'R') ACT.reveal();
    else if (k === 'n' || k === 'N') ACT.newround();
    else if (k === 'f' || k === 'F') ACT.full();
  });

  /* --------------------------------------------------------- wake/toast */

  let idle;
  function wake() {
    document.body.classList.add('awake');
    clearTimeout(idle);
    idle = setTimeout(() => document.body.classList.remove('awake'), 2500);
  }
  addEventListener('mousemove', wake);
  wake();

  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 3200);
  }

  /* ----------------------------------------------------------- start */

  const [startName, startStep] = location.hash.slice(1).split('.');
  if (STEPS[startName] != null && startStep) steps[startName] = Math.max(0, Math.min(STEPS[startName], parseInt(startStep, 10) || 0));
  go(Math.max(0, idx(startName)));
  poll();
})();
