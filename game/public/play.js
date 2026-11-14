// Phone page: join with a nickname, lock in a guess, see how you did.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (x) => (x == null ? '–' : Number.isInteger(x) ? String(x) : Number(x).toFixed(1).replace(/\.0$/, ''));

  // A player id that survives reloads (falls back to this page's memory).
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  let pid = store.get('gbgl-pid');
  if (!pid) {
    pid = 'p' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    store.set('gbgl-pid', pid);
  }

  let state = null;
  let editingName = false;
  let lastKey = '';
  let celebrated = store.get('gbgl-celebrated') || '';

  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
    return j;
  }

  /* ---------------------------------------------------------------- join */

  const QUIPS = [
    [/ohio\s*state|^osu$|buckeye/i, 'Ohio State? We’ll allow it. Unlike our football team, our server doesn’t lose to you.'],
    [/michigan state|^msu$|spartan/i, 'Welcome, Spartan. Little brother is always welcome at the table.'],
    [/^(u-?m|umich|michigan|university of michigan|um ann arbor)$/i, 'Go Blue! Your guess still has to be better than our play-calling.'],
    [/notre dame/i, 'Notre Dame: still not in a conference, still welcome here.'],
    [/harvard|yale|princeton|stanford|mit\b/i, 'Fancy. Please try not to say zero just because a textbook told you to.'],
    [/chicago/i, 'A Chicago economist! We’ll assume you’re perfectly rational. Prove it.'],
    [/.+/, null],
  ];
  $('school').addEventListener('input', () => {
    const v = $('school').value.trim();
    const hit = v && QUIPS.find(([re]) => re.test(v));
    const q = hit && hit[1];
    $('school-quip').hidden = !q;
    $('school-quip').textContent = q || '';
  });

  $('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('join-err').textContent = '';
    try {
      const j = await api('POST', 'api/join', { pid, name: $('name').value, school: $('school').value });
      store.set('gbgl-name', j.name);
      store.set('gbgl-school', j.school || '');
      editingName = false;
      lastKey = '';
      await poll();
    } catch (err) {
      $('join-err').textContent = err.message;
    }
  });
  $('rename').addEventListener('click', () => {
    editingName = true;
    $('name').value = (state && state.name) || '';
    $('school').value = (state && state.school) || '';
    lastKey = '';
    render();
  });

  /* --------------------------------------------------------------- guess */

  const guessIn = $('guess');
  const slider = $('slider');
  slider.addEventListener('input', () => { guessIn.value = slider.value; $('guess-err').textContent = ''; });
  guessIn.addEventListener('input', () => {
    const v = Number(guessIn.value.replace(',', '.'));
    if (Number.isFinite(v) && v >= 0 && v <= 100) slider.value = Math.round(v);
    $('guess-err').textContent = '';
  });

  $('guess-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = guessIn.value.trim();
    $('guess-err').textContent = '';
    if (!raw) { $('guess-err').textContent = 'Type a number or drag the slider.'; return; }
    $('lock').disabled = true;
    try {
      const j = await api('POST', 'api/guess', { pid, guess: raw });
      state.guess = j.guess;
      guessIn.blur();
      lastKey = '';
      render();
      try { navigator.vibrate && navigator.vibrate(40); } catch (e) {}
    } catch (err) {
      $('guess-err').textContent = err.message;
    } finally {
      $('lock').disabled = false;
    }
  });

  /* -------------------------------------------------------------- render */

  const LEVEL_TEXT = {
    dom: ['Dominated!', 'Anything above 66.7 can never win: even if everyone says 100, the target is only 66.7. Bold, like a fake punt on fourth-and-25. Also like a fake punt on fourth-and-25, it didn’t work.'],
    L0: ['Level 0', 'You picked as if the room were random. Lots of people start here. It’s fine. Our offensive coordinator does too.'],
    L1: ['Level 1', 'You figured others would pick at random (average 50) and best-responded: ⅔ × 50 ≈ 33.'],
    L2: ['Level 2', 'You figured others were Level 1 and would say 33, so you said ⅔ × 33 ≈ 22. Two steps ahead!'],
    L3: ['Level 3', 'You thought about what they think about what they think: ⅔ × 22 ≈ 15. Very deep. Possibly too deep for the Big Ten.'],
    'L4+': ['Level 4 or more', 'Four or more rounds of “but what will they think?” That way lies Nash equilibrium.'],
    nash: ['Nash equilibrium', 'You played the equilibrium: (nearly) zero. Correct if everyone is perfectly rational and knows everyone else is too. In a room of humans? Watch the big screen.'],
  };

  function show(id, on) { $(id).hidden = !on; }

  function render() {
    if (!state) return;
    const joined = state.joined && !editingName;
    const key = JSON.stringify([joined, state.phase, state.round, state.guess, state.name, state.mine && state.mine.rank, !!state.result]);
    if (key === lastKey) return;
    lastKey = key;

    show('s-join', !joined);
    show('s-play', joined);
    if (!joined) {
      if (!$('name').value) $('name').value = store.get('gbgl-name') || '';
      if (!$('school').value) $('school').value = store.get('gbgl-school') || '';
      return;
    }
    $('me-name').textContent = state.name;

    const b = $('banner');
    const ph = state.phase;
    const has = state.guess != null;
    if (ph === 'lobby') {
      b.className = 'banner wait';
      b.innerHTML = `You’re in! Waiting for kickoff…<small>The professor will open guessing in a moment. Use the time to think about what everyone else is thinking.</small>`;
    } else if (ph === 'open') {
      b.className = 'banner';
      b.innerHTML = `<span class="dot"></span>Guessing is open!<small>${has ? 'You can change your guess until the whistle.' : 'Pick a number from 0 to 100.'}</small>`;
    } else if (ph === 'closed') {
      b.className = 'banner wait';
      b.innerHTML = `📣 Whistle! Guessing is closed.<small>${has ? `Your guess: <b>${fmt(state.guess)}</b>. Eyes on the big screen.` : 'You didn’t get a guess in this round. Like our QB, you held the ball too long.'}</small>`;
    } else {
      b.className = 'banner wait';
      b.innerHTML = `The results are in!<small>Round ${state.round}</small>`;
    }

    show('guess-card', ph === 'open');
    if (ph === 'open') {
      if (has) {
        $('locked').hidden = false;
        $('locked').innerHTML = `Locked in: <span class="num">${fmt(state.guess)}</span><br><small>Changed your mind? Pick again and tap Change my guess.</small>`;
        $('lock').textContent = 'Change my guess';
        if (document.activeElement !== guessIn) { guessIn.value = fmt(state.guess); slider.value = Math.round(state.guess); }
      } else {
        $('locked').hidden = true;
        $('lock').textContent = 'Lock it in';
      }
    }

    const rc = $('result-card');
    if (ph === 'revealed' && state.result) {
      rc.hidden = false;
      const R = state.result;
      const m = state.mine;
      const wnames = R.winners.map((w) => `<b>${esc(w.name)}</b> (${fmt(w.guess)})`).join(', ');
      if (m) {
        const [lvl, why] = LEVEL_TEXT[m.level] || ['', ''];
        const headline = m.won ? (R.winners.length > 1 ? 'Hail to the Victors! You tied for the win!' : 'Hail to the Victor! You won!') : m.rank <= 3 ? `So close! #${m.rank} of ${R.n}` : m.rank <= R.n / 3 ? `Not bad: #${m.rank} of ${R.n}` : `#${m.rank} of ${R.n}`;
        const sub = m.won ? 'Go Blue! Take a bow. (Michigan football: take notes.)' : m.rank > R.n * 0.8 ? 'Don’t worry, Michigan’s been finishing near the bottom all season too.' : `Off by ${fmt(m.dist)}.`;
        rc.className = 'card result' + (m.won ? ' won' : '');
        rc.innerHTML = `
          <p class="headline">${headline}</p>
          <p class="sub">${sub}</p>
          <div class="row">
            <div class="stat"><span class="num">${fmt(m.guess)}</span><span>Your guess</span></div>
            <div class="stat hot"><span class="num">${fmt(R.target)}</span><span>⅔ × average</span></div>
            <div class="stat"><span class="num">${fmt(R.mean)}</span><span>Average</span></div>
          </div>
          <div class="level"><b>Your reasoning: ${lvl}.</b> ${why}</div>
          <div class="winners">${R.winners.length > 1 ? 'Winners' : 'Winner'}: ${wnames}</div>`;
        const tag = `${state.round}`;
        if (m.won && celebrated !== tag) { celebrated = tag; store.set('gbgl-celebrated', tag); window.confetti && confetti(4500); try { navigator.vibrate && navigator.vibrate([80, 60, 80, 60, 200]); } catch (e) {} }
      } else {
        rc.className = 'card result';
        rc.innerHTML = `
          <p class="headline">⅔ of the average was ${fmt(R.target)}</p>
          <p class="sub">Average guess: ${fmt(R.mean)} from ${R.n} players. You sat this one out.</p>
          <div class="winners">${R.winners.length > 1 ? 'Winners' : 'Winner'}: ${wnames}</div>`;
      }
    } else {
      rc.hidden = true;
    }
  }

  /* ---------------------------------------------------------------- poll */

  let timer = null;
  async function poll() {
    clearTimeout(timer);
    try {
      state = await api('GET', `api/me?pid=${encodeURIComponent(pid)}`);
      render();
    } catch (e) { /* network blip; try again */ }
    timer = setTimeout(poll, document.hidden ? 5000 : 2000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  poll();
})();
