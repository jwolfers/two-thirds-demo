// The phone page: join, guess, wait, find out.
(function () {
  'use strict';
  const { LEVELS, JOKES, fmt, esc, confetti } = window.TT;
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');

  /* ------------------------------------------------------------- identity */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: fine */ } },
  };
  let pid = store.get('tt-pid');
  if (!pid) {
    pid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '');
    store.set('tt-pid', pid);
  }

  /* ---------------------------------------------------------------- state */
  let S = null; // latest /api/me
  let view = '';
  let celebrated = store.get('tt-celebrated') || '';
  let jokeIdx = Math.floor(Math.random() * JOKES.length);

  async function api(url, body) {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Fumble. Try again.');
    return j;
  }

  async function poll() {
    try {
      S = await api(`api/me?pid=${encodeURIComponent(pid)}`);
      render();
    } catch (e) { /* network hiccup: try again next tick */ }
    setTimeout(poll, document.hidden ? 4000 : 1500);
  }

  const STATUS_TEXT = { lobby: 'Pregame', open: 'Guessing open', closed: 'Whistle', revealed: 'Final' };

  function render() {
    const st = $('#status');
    st.className = `pill ${S.status}`;
    st.lastElementChild.textContent = STATUS_TEXT[S.status];
    $('#who').textContent = S.joined ? `· Playing as ${S.name}${S.round > 1 ? ` · Round ${S.round}` : ''}` : '';

    let v;
    if (!S.joined) v = 'join';
    else if (S.status === 'lobby') v = 'wait';
    else if (S.status === 'open') v = 'guess';
    else if (S.status === 'revealed' && S.result) v = 'results';
    else v = 'closed';
    const key = `${v}:${S.round}`;
    if (key !== view) { view = key; mount(v); }
    update(v);
  }

  function mount(v) {
    app.replaceChildren($(`#t-${v}`).content.cloneNode(true));
    jokeIdx = (jokeIdx + 1) % JOKES.length;
    const joke = $('[data-joke]', app);
    if (joke) joke.textContent = JOKES[jokeIdx];

    if (v === 'join') {
      $('#name').value = store.get('tt-name') || '';
      $('#school').value = store.get('tt-school') || '';
      $('#join-form').addEventListener('submit', onJoin);
    }
    if (v === 'guess') {
      const box = $('#guess'), slider = $('#slider');
      if (S.guess != null) { box.value = S.guess; slider.value = Math.round(S.guess); }
      box.addEventListener('input', () => {
        box.value = box.value.replace(/[^0-9.,]/g, '');
        const n = Number(box.value.replace(',', '.'));
        if (Number.isFinite(n)) slider.value = Math.round(Math.min(100, Math.max(0, n)));
      });
      slider.addEventListener('input', () => { box.value = slider.value; });
      $('#guess-form').addEventListener('submit', onGuess);
    }
    if (v === 'results') showResults();
  }

  function update(v) {
    const nameEl = $('[data-name]', app);
    if (nameEl) nameEl.textContent = S.name;
    if (v === 'guess') {
      const locked = $('#locked');
      locked.hidden = S.guess == null;
      if (S.guess != null) $('[data-guess]', locked).textContent = fmt(S.guess, 2);
      $('[data-count]', locked).textContent = S.count > 1 ? `${S.count} people have locked in so far.` : '';
      $('#lock').textContent = S.guess == null ? 'Lock it in' : 'Change my guess';
    }
    if (v === 'closed') {
      $('[data-mine]', app).textContent = S.guess == null
        ? 'You didn’t lock in a guess this round. Bold strategy: you can’t lose if you don’t play.'
        : `You guessed ${fmt(S.guess, 2)}. No take-backs now.`;
    }
  }

  async function onJoin(e) {
    e.preventDefault();
    const name = $('#name').value.trim(), school = $('#school').value.trim();
    const btn = e.submitter || $('#join-form .big');
    btn.disabled = true;
    try {
      await api('api/join', { pid, name, school });
      store.set('tt-name', name); store.set('tt-school', school);
      S = await api(`api/me?pid=${encodeURIComponent(pid)}`);
      render();
    } catch (err) {
      $('#join-err').textContent = err.message;
      btn.disabled = false;
    }
  }

  async function onGuess(e) {
    e.preventDefault();
    const box = $('#guess'), err = $('#guess-err');
    err.textContent = '';
    const raw = box.value.trim().replace(',', '.');
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n < 0 || n > 100) {
      err.textContent = n > 100 ? 'Whoa. 0 to 100, please. This isn’t the score of the Ohio State game.' : 'Pick a number from 0 to 100.';
      return;
    }
    box.blur();
    try {
      const r = await api('api/guess', { pid, guess: raw });
      S.guess = r.guess;
      if (navigator.vibrate) navigator.vibrate(40);
      update('guess');
    } catch (e2) { err.textContent = e2.message; }
  }

  function showResults() {
    const R = S.result, me = R.me;
    const card = $('.result', app);
    $('[data-mean]', card).textContent = fmt(R.mean, 2);
    $('[data-target]', card).textContent = fmt(R.target, 2);
    $('[data-guess]', card).textContent = me ? fmt(me.guess, 2) : '–';
    $('[data-rank]', card).textContent = me ? `${ordinal(me.rank)} of ${R.n}` : '–';

    const names = R.winners.map((w) => `<b>${esc(w.name)}</b>${w.school ? ` (${esc(w.school)})` : ''}`);
    $('[data-winners]', card).innerHTML = `${R.winners.length > 1 ? 'Co-winners' : 'Winner'}: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}, with ${fmt(R.winners[0].guess, 2)}.`;

    const banner = $('[data-banner]', card);
    if (!me) {
      banner.innerHTML = '<span class="big-word">Final whistle</span><small>You sat this one out. Next round, get in the game.</small>';
    } else if (me.won) {
      card.classList.add('won');
      banner.innerHTML = `<span class="big-word">You won!</span><small>${R.winners.length > 1 ? 'Shared glory, but glory nonetheless.' : 'Hail to the Victor.'} Off by just ${fmt(me.dist, 2)}.</small>`;
      const tag = `${S.round}`;
      if (celebrated !== tag) { celebrated = tag; store.set('tt-celebrated', tag); confetti(); }
    } else {
      const pct = (me.rank - 1) / Math.max(1, R.n - 1);
      const quip = pct < 0.1 ? 'So close. Top 10%, which is better than our conference standing.'
        : pct < 0.5 ? 'Top half of the room. A winning record, which puts you ahead of some teams we could name.'
        : me.guess > 66.67 ? 'Your guess could never have won. You are, in a sense, the Michigan offense.'
        : 'Not your day. Wait ’til next year: it’s what we keep telling ourselves.';
      banner.innerHTML = `<span class="big-word">Off by ${fmt(me.dist, 2)}</span><small>${quip}</small>`;
    }

    const lv = me ? LEVELS[me.level] : null;
    $('[data-level]', card).textContent = lv ? `Your reasoning: ${lv.label}` : 'Level-k thinking';
    $('[data-level-blurb]', card).textContent = lv ? lv.blurb : LEVELS.L1.blurb;
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  poll();
})();
