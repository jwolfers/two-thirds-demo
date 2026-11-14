// The phone page: join, wait, guess, see how you did.
(function () {
  'use strict';
  const B = window.Brand;
  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------ identity */
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* private mode */ }
    return null;
  }
  let pid = store('t3-pid');
  if (!pid || !/^[A-Za-z0-9_-]{8,64}$/.test(pid)) {
    pid = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    store('t3-pid', pid);
  }

  $('mark').innerHTML = B.blockM(46);

  let S = null; // last server state
  let renaming = false;
  let editing = false; // the guess box has focus or was just changed
  let lastRound = null;
  let celebrated = null;
  let jokeFor = {};

  // One joke per screen per round, so it doesn't flicker on every poll.
  function joke(kind) {
    const key = kind + ':' + (S ? S.round : 0);
    if (!jokeFor[key]) jokeFor[key] = B.pick(B.JOKES[kind]);
    return jokeFor[key];
  }

  /* ------------------------------------------------------------- network */
  async function api(path, body) {
    const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    const r = await fetch(path, { cache: 'no-store', ...opts });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
    return j;
  }

  let pollTimer = null;
  async function poll() {
    clearTimeout(pollTimer);
    try {
      S = await api('api/state?pid=' + encodeURIComponent(pid));
      render();
    } catch (e) {
      $('pill').textContent = 'Reconnecting…';
      $('pill').className = 'pill';
    }
    pollTimer = setTimeout(poll, document.hidden ? 6000 : 2000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  /* -------------------------------------------------------------- render */
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  }

  function render() {
    if (!S) return;
    const pill = $('pill');
    const labels = { lobby: 'Pregame', open: 'Open', closed: 'Closed', revealed: 'Final' };
    pill.textContent = `Round ${S.round} · ${labels[S.status] || ''}`;
    pill.className = 'pill ' + (S.status === 'open' ? 'open' : S.status === 'closed' ? 'closed' : '');

    if (lastRound !== null && S.round !== lastRound) {
      $('guess').value = '';
      $('slider').value = 50;
      editing = false;
    }
    lastRound = S.round;

    if (!S.me || renaming) {
      if (S.me && !$('name').value) { $('name').value = S.me.name; $('school').value = S.me.school || ''; }
      return show('s-join');
    }

    if (S.status === 'lobby') {
      $('lobby-name').textContent = S.me.name;
      $('lobby-n').textContent = S.n;
      $('lobby-joke').textContent = joke('waiting');
      return show('s-lobby');
    }

    if (S.status === 'open') {
      const g = S.me.guess;
      $('guess-n').textContent = S.locked;
      $('guess-tot').textContent = S.n;
      if (g != null) {
        $('locked').hidden = false;
        $('locked-n').textContent = `Your guess: ${B.fmtGuess(g)}`;
        $('locked-joke').textContent = joke('locked');
        $('lock').textContent = 'Change my guess';
        $('guess-h').textContent = 'Locked in. Second thoughts?';
        if (!editing && document.activeElement !== $('guess')) {
          $('guess').value = B.fmtGuess(g);
          $('slider').value = Math.round(g);
        }
      } else {
        $('locked').hidden = true;
        $('lock').textContent = 'Lock it in';
        $('guess-h').textContent = 'Your guess';
      }
      return show('s-guess');
    }

    if (S.status === 'closed') {
      $('closed-mine').innerHTML = S.me.guess != null
        ? `You guessed <b>${B.fmtGuess(S.me.guess)}</b>. The reveal is coming on the big screen.`
        : `You didn't get a guess in this round. Like our kicker, you'll get another shot.`;
      $('closed-joke').textContent = joke('closed');
      return show('s-closed');
    }

    if (S.status === 'revealed' && S.result) return renderResult(S.result);
    show('s-closed');
  }

  function renderResult(r) {
    const m = r.mine;
    $('res-avg').textContent = B.fmt(r.avg, 1);
    $('res-tgt').textContent = B.fmt(r.target, 1);
    $('res-me').textContent = m ? B.fmtGuess(m.guess) : '–';

    const banner = $('res-banner');
    if (!m) {
      banner.className = 'banner';
      banner.textContent = 'You sat this one out';
      $('res-rank').textContent = `${r.n} people guessed. The target was ${B.fmt(r.target, 2)}.`;
      $('res-level').hidden = true;
      $('res-joke').textContent = joke('far');
    } else {
      const top = m.rank <= Math.max(3, Math.ceil(r.n * 0.1));
      banner.className = 'banner' + (m.win ? ' win' : '');
      banner.textContent = m.win ? (r.winnerCount > 1 ? '🏆 You tied for the win!' : '🏆 You won!') : `You finished ${B.ordinal(m.rank)} of ${r.n}`;
      $('res-rank').textContent = m.win
        ? `You were ${B.fmt(m.dist, 2)} away from the target. Nobody did better.`
        : `You were ${B.fmt(m.dist, 2)} away from the target of ${B.fmt(r.target, 2)}.`;
      const L = B.LEVELS[m.level];
      $('res-level').hidden = false;
      $('res-level').innerHTML = `<h3>You played like: <span>${B.esc(L.name)}</span></h3><p>${B.esc(L.blurb)}</p>`;
      $('res-joke').textContent = joke(m.win ? 'win' : top ? 'near' : 'far');
      if (m.win && celebrated !== S.round) { celebrated = S.round; B.confetti(5000); }
    }
    // Winners all sit at the same distance, but a tie can straddle the target (e.g. 20 and 24 around 22).
    const same = r.winners.every((w) => w.guess === r.winners[0].guess);
    const names = r.winners.map((w) => B.esc(w.name) + (w.school ? ` (${B.esc(w.school)})` : '') + (same ? '' : ` with ${B.fmtGuess(w.guess)}`));
    const more = r.winnerCount > names.length ? ` and ${r.winnerCount - names.length} more` : '';
    const said = same && r.winners.length ? `, who said ${B.fmtGuess(r.winners[0].guess)}` : '';
    $('res-win').innerHTML = r.winnerCount ? `<b>Winner${r.winnerCount > 1 ? 's' : ''}:</b> ${names.join(', ')}${more}${said}.` : '';
    show('s-result');
  }

  /* --------------------------------------------------------------- forms */
  $('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button');
    btn.disabled = true;
    try {
      S = await api('api/join', { pid, name: $('name').value, school: $('school').value });
      renaming = false;
      render();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });
  $('rename').addEventListener('click', () => { renaming = true; render(); $('name').focus(); });

  const guessBox = $('guess');
  guessBox.addEventListener('input', () => {
    editing = true;
    $('guess-err').textContent = '';
    const v = Number(guessBox.value.replace(',', '.'));
    if (Number.isFinite(v) && v >= 0 && v <= 100) $('slider').value = Math.round(v);
  });
  $('slider').addEventListener('input', () => {
    editing = true;
    $('guess-err').textContent = '';
    guessBox.value = $('slider').value;
  });

  $('guess-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = guessBox.value.trim().replace(',', '.');
    const v = Number(raw);
    if (!raw || !Number.isFinite(v) || v < 0 || v > 100) {
      $('guess-err').textContent = 'Pick a number from 0 to 100. (Yes, decimals are fine.)';
      return;
    }
    const btn = $('lock');
    btn.disabled = true;
    try {
      S = await api('api/guess', { pid, guess: raw });
      editing = false;
      guessBox.blur();
      jokeFor['locked:' + S.round] = null;
      render();
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (err) {
      $('guess-err').textContent = err.message;
      poll();
    } finally {
      btn.disabled = false;
    }
  });

  poll();
})();
