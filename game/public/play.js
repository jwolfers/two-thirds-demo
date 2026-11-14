// The phone page. Joins, takes a guess, and shows how you did after the reveal.
(function () {
  'use strict';
  const { blockM, cwruMark, LEVEL_TALK, fmt, esc, confetti, TEAMS } = window.TT;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  $$('[data-mark]').forEach((el) => {
    const size = Number(el.dataset.size || 40);
    el.innerHTML = el.dataset.mark === 'm' ? blockM(size) : cwruMark(size);
  });

  /* --------------------------------------------------------- local memory */
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  let pid = store.get('tt-pid');
  if (!pid) {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    pid = 'p' + [...a].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
    store.set('tt-pid', pid);
  }
  let profile = store.get('tt-profile'); // { name, team }
  let editing = !profile;
  let state = null;
  let shownRound = null; // round whose guess screen we've initialised
  let celebrated = store.get('tt-celebrated') || null;

  /* --------------------------------------------------------------- quips */
  const QUIPS = {
    wait: [
      'While you wait: Michigan\'s offense is also waiting for something to open up.',
      'Case Western\'s mascot is Spartie. Not to be confused with the Spartans up the road from Ann Arbor. Totally different. Much nicer.',
      'Stretch those thumbs. For some of us this is the most cardio all week.',
      'Remember: it\'s not what you think. It\'s what you think they think.',
      'Fun fact: a football field is exactly 100 yards. So is this game. Coincidence? Yes.',
    ],
    guess: [
      'No pressure. Well, some pressure. It\'s an economics class.',
      'Decimals allowed. Overthinking encouraged.',
      'Your number stays secret until the reveal. Unlike Michigan\'s play calls.',
      'Take your time. Michigan\'s offense certainly does.',
    ],
    closed: [
      'Computing two-thirds of the average. Faster than a Michigan two-minute drill.',
      'The replay booth is reviewing every guess…',
      'Somewhere, a Level 0 player is very confident right now.',
    ],
  };
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const quipT = {};
  function quip(el, list) {
    if (quipT[el]) return;
    const node = $(el);
    node.textContent = pick(list);
    quipT[el] = setInterval(() => { node.textContent = pick(list); }, 8000);
  }

  /* -------------------------------------------------------------- screens */
  function show(id) {
    $$('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
  }

  /* ----------------------------------------------------------------- join */
  let team = profile ? profile.team : null;
  function paintTeams() {
    $$('.team').forEach((b) => b.classList.toggle('sel', b.dataset.team === team));
  }
  $('#teams').addEventListener('click', (e) => {
    const b = e.target.closest('.team');
    if (!b) return;
    team = b.dataset.team;
    paintTeams();
  });
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    editing = true;
    $('#name').value = profile ? profile.name : '';
    team = profile ? profile.team : null;
    paintTeams();
    render();
  }));

  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again?');
    return j;
  }

  $('#joinBtn').addEventListener('click', async () => {
    const btn = $('#joinBtn');
    btn.disabled = true;
    const p = { name: $('#name').value.trim().slice(0, 24), team: team || 'other' };
    try {
      await post('api/join', { pid, ...p });
      profile = p;
      store.set('tt-profile', p);
      editing = false;
      await refresh();
    } catch (e) {
      btn.textContent = e.message;
      setTimeout(() => { btn.textContent = "Let's play"; }, 2500);
    }
    btn.disabled = false;
  });

  /* ---------------------------------------------------------------- guess */
  const guessEl = $('#guess');
  const slider = $('#slider');
  guessEl.addEventListener('input', () => {
    const v = Number(String(guessEl.value).replace(',', '.'));
    if (Number.isFinite(v)) slider.value = Math.max(0, Math.min(100, v));
    $('#err').textContent = '';
  });
  slider.addEventListener('input', () => {
    guessEl.value = slider.value;
    $('#err').textContent = '';
  });
  guessEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') lock(); });
  $('#lockBtn').addEventListener('click', lock);

  async function lock() {
    const raw = String(guessEl.value).trim().replace(',', '.');
    const v = Number(raw);
    if (!raw || !Number.isFinite(v) || v < 0 || v > 100) {
      $('#err').textContent = 'Pick a number from 0 to 100. (Out of bounds is a penalty.)';
      return;
    }
    const btn = $('#lockBtn');
    btn.disabled = true;
    try {
      const j = await post('api/guess', { pid, guess: v, name: profile ? profile.name : '', team: profile ? profile.team : 'other' });
      guessEl.blur();
      if (navigator.vibrate) navigator.vibrate(30);
      showLocked(j.guess);
      await refresh();
    } catch (e) {
      $('#err').textContent = e.message;
    }
    btn.disabled = false;
  }
  function showLocked(g) {
    const box = $('#lockedBox');
    if (g == null) { box.hidden = true; $('#lockBtn').textContent = 'Lock it in 🔒'; return; }
    box.hidden = false;
    $('#lockedVal').textContent = fmt(g, 2);
    $('#lockBtn').textContent = 'Change my guess';
  }

  /* --------------------------------------------------------------- render */
  function render() {
    if (editing || !profile) { show('sJoin'); return; }
    if (!state) { show('sWait'); return; }
    const me = state.me;
    $$('.who').forEach((el) => { el.textContent = profile.name || (profile.team === 'um' ? 'Wolverine' : profile.team === 'cwru' ? 'Spartan' : 'friend'); });

    if (state.status === 'waiting') {
      show('sWait');
      quip('#waitQuip', QUIPS.wait);
    } else if (state.status === 'open') {
      if (shownRound !== state.round) {
        shownRound = state.round;
        guessEl.value = me && me.guess != null ? me.guess : '';
        slider.value = me && me.guess != null ? me.guess : 50;
        $('#err').textContent = '';
      }
      $('#roundLbl').textContent = 'Round ' + state.round;
      showLocked(me ? me.guess : null);
      show('sGuess');
      quip('#guessQuip', QUIPS.guess);
    } else if (state.status === 'closed') {
      $('#closedLead').innerHTML = me && me.guess != null
        ? `You locked in <b class="maize">${fmt(me.guess, 2)}</b>. Eyes on the big screen.`
        : 'You didn\'t get a guess in this round. Like a Michigan field goal attempt: next time.';
      show('sClosed');
      quip('#closedQuip', QUIPS.closed);
    } else if (state.status === 'revealed') {
      renderResult();
      show('sResult');
    }
  }

  function renderResult() {
    const r = state.result;
    if (!r) return;
    const m = r.mine;
    const me = state.me;
    $('#rAvg').textContent = fmt(r.avg, 1);
    $('#rTarget').textContent = fmt(r.target, 1);
    $('#rMine').textContent = me && me.guess != null ? fmt(me.guess, 2) : '–';
    $('#rRank').textContent = m ? `#${m.rank}` : '–';
    const banner = $('#banner');
    if (m && m.win) {
      banner.className = 'banner win';
      banner.innerHTML = `<b>🏆 You won!</b>${r.winnerCount > 1 ? `Shared with ${r.winnerCount - 1} other${r.winnerCount > 2 ? 's' : ''}. ` : ''}${profile.team === 'um' ? 'A Michigan win! Frame this phone.' : profile.team === 'cwru' ? 'Spartans on top. The good Spartans.' : 'You beat both home teams. Rude, but impressive.'}`;
      if (celebrated !== state.round + ':' + r.n) {
        celebrated = state.round + ':' + r.n;
        store.set('tt-celebrated', celebrated);
        confetti(160);
        if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
      }
    } else if (m) {
      banner.className = 'banner';
      const close = m.rank <= Math.max(3, Math.ceil(r.n * 0.1));
      banner.innerHTML = `<b>${close ? 'So close!' : m.dist < 10 ? 'Not bad!' : 'Well, that happened.'}</b>You finished #${m.rank} of ${r.n}, ${fmt(m.dist, 2)} from the target.${close ? '' : ' Still a better result than Michigan\'s last road trip.'}`;
    } else {
      banner.className = 'banner';
      banner.innerHTML = '<b>You sat this one out</b>Smart, in a way: you can\'t lose if you don\'t play. That\'s also Michigan\'s new offensive philosophy.';
    }
    $('#rLevel').innerHTML = m ? `<b>Your style:</b> ${esc(LEVEL_TALK[m.level])}` : '';
    $('#rLevel').hidden = !m;
    const ws = r.winners.map((w) => `${esc(w.name)} (${TEAMS[w.team] ? TEAMS[w.team].short : ''}, ${fmt(w.guess, 2)})`);
    $('#rWinners').innerHTML = `🏆 ${r.winnerCount > 1 ? 'Winners' : 'Winner'}: ${ws.join(', ')}${r.winnerCount > ws.length ? ` +${r.winnerCount - ws.length} more` : ''}`;
  }

  /* ----------------------------------------------------------------- poll */
  let rejoining = false;
  async function refresh() {
    try {
      const r = await fetch('api/state?pid=' + encodeURIComponent(pid), { cache: 'no-store' });
      if (!r.ok) return;
      state = await r.json();
      // The server forgot us (restart or reset): quietly sign back in.
      if (profile && !state.me && !rejoining) {
        rejoining = true;
        post('api/join', { pid, ...profile }).catch(() => {}).finally(() => { rejoining = false; });
      }
      render();
    } catch (e) { /* offline for a moment; the next poll will catch up */ }
  }
  async function loop() {
    await refresh();
    setTimeout(loop, document.hidden ? 6000 : 2500);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  if (profile) {
    $('#name').value = profile.name;
    paintTeams();
    post('api/join', { pid, ...profile }).catch(() => {});
  }
  render();
  loop();
})();
