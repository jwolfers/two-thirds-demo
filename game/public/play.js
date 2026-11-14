/* The 2/3 Game: phone page. */
(function () {
  'use strict';

  const { BLOCK_M, FRAC, esc, fixed, num, store, makeId, confetti } = TT;
  const $ = (s) => document.querySelector(s);

  document.querySelectorAll('[data-blockm]').forEach((el) => { el.innerHTML = BLOCK_M; });
  document.querySelectorAll('[data-frac]').forEach((el) => { el.outerHTML = FRAC; });

  // One ID per phone, kept across rounds.
  let pid = store.get('tt_pid');
  if (!pid || !/^[A-Za-z0-9_-]{8,64}$/.test(pid)) {
    pid = makeId();
    store.set('tt_pid', pid);
  }

  const guessEl = $('#guess');
  const nameEl = $('#name');
  const schoolEl = $('#school');
  const submitBtn = $('#submitBtn');
  nameEl.value = store.get('tt_name') || '';
  schoolEl.value = store.get('tt_school') || '';

  let state = null;
  let current = 'loading';
  let editing = false;
  let busy = false;
  let failures = 0;
  let celebrated = null;
  let pollT = null;

  const SCREENS = ['loading', 'waiting', 'form', 'locked', 'closed', 'results'];
  function show(name) {
    if (name === current) return;
    SCREENS.forEach((s) => { $('#s-' + s).hidden = s !== name; });
    current = name;
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------ polling */

  async function poll() {
    try {
      const res = await fetch('/api/state?pid=' + encodeURIComponent(pid), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setState(await res.json());
      failures = 0;
      $('#net').hidden = true;
    } catch (e) {
      failures += 1;
      if (failures >= 2) $('#net').hidden = false;
    } finally {
      clearTimeout(pollT);
      pollT = setTimeout(poll, document.hidden ? 6000 : 2000 + Math.random() * 600);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clearTimeout(pollT);
      poll();
    }
  });

  function setState(s) {
    const prevRound = state && state.round;
    state = s;
    if (prevRound != null && prevRound !== s.round) {
      editing = false;
      guessEl.value = '';
      setMsg('');
    }
    render();
  }

  /* ------------------------------------------------------------- render */

  function render() {
    const s = state;
    if (!s) return show('loading');
    const chip = $('#roundChip');
    chip.hidden = false;
    chip.textContent = 'Round ' + s.round;

    if (s.status === 'waiting') {
      $('#waitTitle').textContent = s.round > 1 ? `Round ${s.round} is warming up` : 'Warming up';
      show('waiting');
    } else if (s.status === 'open') {
      if (s.me && !editing) {
        renderLocked();
        show('locked');
      } else {
        submitBtn.textContent = btnLabel();
        show('form');
      }
    } else if (s.status === 'closed') {
      editing = false;
      renderClosed();
      show('closed');
    } else {
      editing = false;
      renderResults();
      show('results');
    }
  }

  function btnLabel() {
    return state && state.me ? 'Update my guess' : 'Lock it in';
  }

  function renderLocked() {
    const s = state;
    $('#lockedGuess').textContent = num(s.me.guess);
    $('#playingAs').innerHTML = `Playing as <b>${esc(s.me.name)}</b>${s.me.school ? ` (${esc(s.me.school)})` : ''}.`;
    $('#countLocked').textContent = s.count;
    $('#countLockedLabel').textContent = s.count === 1 ? 'guess' : 'guesses';
  }

  function renderClosed() {
    const me = state.me;
    $('#closedMine').innerHTML = me
      ? `<div class="mine"><span class="muted small">Your guess</span><b>${num(me.guess)}</b></div>`
      : "<p>You didn't get a guess in this round. The next one's yours.</p>";
  }

  function yours(you) {
    return `<div class="yours">
      <div><span>You guessed</span><b>${num(you.guess)}</b></div>
      <div><span>Off by</span><b>${fixed(you.distance, 2)}</b></div>
      <div><span>Rank</span><b>#${you.rank}</b></div>
    </div>`;
  }

  function renderResults() {
    const r = state.result;
    if (!r) return;
    $('#rAvg').textContent = fixed(r.avg, 2);
    $('#rTarget').textContent = fixed(r.target, 2);
    $('#rWin').textContent = r.winningGuesses.length ? r.winningGuesses.slice(0, 2).map((v) => num(v)).join(' & ') : '–';
    $('#rN').textContent = r.n;

    const card = $('#resultCard');
    const you = r.you;
    const key = `${state.round}:${r.n}:${you ? you.rank : '-'}`;
    if (card.dataset.key === key) return;
    card.dataset.key = key;

    if (!r.n) {
      card.className = 'card center';
      card.innerHTML = '<div class="big-emoji">🫥</div><div class="result-title">No guesses</div><p>Zero guesses, zero points. Feels like home.</p>';
      return;
    }
    if (!you) {
      const who = r.winners.map(esc).join(', ') + (r.winnersTotal > r.winners.length ? ` and ${r.winnersTotal - r.winners.length} more` : '');
      card.className = 'card center';
      card.innerHTML = `<div class="big-emoji">👀</div><div class="result-title">You sat this one out</div>
        <p>${r.winnersTotal > 1 ? 'Winners' : 'Winner'}: <b>${who}</b>. Next round, you're in.</p>`;
      return;
    }
    if (you.won) {
      card.className = 'card center won';
      card.innerHTML = `<div class="big-emoji">🏆</div><div class="result-title">You won!</div>
        <p>${r.winnersTotal > 1 ? `Hail to the Victors: you're one of ${r.winnersTotal} winners.` : "Hail to the Victor. Hold your phone up high: you've earned it."}</p>
        ${yours(you)}
        <p class="small">Michigan Athletics would like a word about your winning strategy.</p>`;
      if (celebrated !== state.round) {
        celebrated = state.round;
        confetti();
        if (navigator.vibrate) navigator.vibrate([60, 40, 140]);
      }
      return;
    }
    const close = you.rank <= 3;
    const quip = you.guess > 200 / 3
      ? "Anything above 66.7 can never win. You're the kind of optimist Michigan Athletics loves."
      : you.guess < 1
        ? 'You picked the Nash equilibrium. Right in theory, wrong in practice. Welcome to economics.'
        : 'Look on the bright side: you still had a better week than the Michigan offense.';
    card.className = 'card center';
    card.innerHTML = `<div class="big-emoji">${close ? '🎯' : '🏈'}</div>
      <div class="result-title">${close ? 'So close!' : 'Not this time'}</div>
      <p>You finished <b>#${you.rank}</b> of ${r.n}.</p>
      ${yours(you)}
      <p class="small muted">${quip}</p>`;
  }

  /* --------------------------------------------------------------- form */

  function parse(v) {
    const s = String(v).trim().replace(',', '.');
    if (!s || !/^\d{0,3}(\.\d*)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }

  function setMsg(text, ok) {
    const m = $('#formMsg');
    m.textContent = text;
    m.classList.toggle('ok', !!ok);
  }

  guessEl.addEventListener('input', () => {
    const clean = guessEl.value.replace(/[^0-9.,]/g, '');
    if (clean !== guessEl.value) guessEl.value = clean;
    guessEl.classList.toggle('bad', clean !== '' && parse(clean) === null);
    setMsg(clean !== '' && parse(clean) === null ? 'Between 0 and 100, please.' : '');
  });

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const n = parse(guessEl.value);
    if (n === null) {
      setMsg('Pick a number from 0 to 100.');
      guessEl.classList.add('bad');
      guessEl.focus();
      return;
    }
    const name = nameEl.value.trim();
    const school = schoolEl.value.trim();
    store.set('tt_name', name);
    store.set('tt_school', school);

    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Locking it in…';
    try {
      const res = await fetch('/api/guess', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pid, guess: n, name, school }),
      });
      let data = {};
      try { data = await res.json(); } catch (err) { /* not JSON */ }
      if (!res.ok) {
        setMsg(data.error || 'Something went wrong. Try again.');
        if (res.status === 409) poll();
        return;
      }
      editing = false;
      setMsg('');
      guessEl.blur();
      state = { ...state, me: data.me, count: data.count };
      render();
      const big = $('#lockedGuess');
      big.classList.remove('pop');
      void big.offsetWidth;
      big.classList.add('pop');
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (err) {
      setMsg("Fumble! Couldn't reach the server. Check your connection and try again.");
    } finally {
      busy = false;
      submitBtn.disabled = false;
      submitBtn.textContent = btnLabel();
    }
  });

  $('#changeBtn').addEventListener('click', () => {
    editing = true;
    if (state && state.me) guessEl.value = num(state.me.guess);
    render();
    guessEl.focus();
    guessEl.select();
  });

  poll();
})();
