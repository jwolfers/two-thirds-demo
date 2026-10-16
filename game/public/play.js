// Student phone view: show the rules, take a guess, report how it went.
(() => {
  const $ = s => document.querySelector(s);
  const fmt = x => (Math.round(x * 100) / 100).toLocaleString();
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: fine */ } }
  };

  let cid = store.get('tt-cid');
  if (!cid) {
    cid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    store.set('tt-cid', cid);
  }
  $('#name').value = store.get('tt-name') || '';

  // ---------------------------------------------------------------- input
  const guessEl = $('#guess'), slider = $('#slider');

  function quip(v) {
    if (!Number.isFinite(v)) return 'Slide, tap, or type.';
    if (v < 0 || v > 100) return 'Nice try. 0 to 100, Hoss.';
    if (v === 100) return '100? The only guess guaranteed to lose. We respect the chaos.';
    if (v > 66.7) return 'Fun fact: above 66.7 can never win, even if everyone else picks 100.';
    if (v >= 45 && v <= 55) return 'Right down the middle. Strong level-0 energy.';
    if (v > 55) return 'Bold. Are you expecting a room full of 100s?';
    if (v >= 28 && v < 45) return 'Classic level 1: you figure everyone else picks at random.';
    if (v >= 18 && v < 28) return 'Level 2: you think they think. Very Ann Arbor of you.';
    if (v >= 12 && v < 18) return 'Level 3: you think they think they think. Very Kalamazoo of you.';
    if (v > 0 && v < 12) return 'Deep thinker. Or deep overthinker. Time will tell.';
    if (v === 0) return 'Zero: the Nash equilibrium. Principled, lonely, often wrong.';
    return 'Interesting choice. Very… specific.';
  }
  function setGuess(v, fromSlider) {
    if (!fromSlider) slider.value = Number.isFinite(v) ? v : 50;
    else guessEl.value = v;
    $('#quip').textContent = quip(v);
  }
  guessEl.addEventListener('input', () => setGuess(guessEl.value === '' ? NaN : Number(guessEl.value)));
  slider.addEventListener('input', () => setGuess(Number(slider.value), true));
  document.querySelectorAll('.step').forEach(b => b.addEventListener('click', () => {
    const cur = guessEl.value === '' ? 50 : Number(guessEl.value);
    const v = Math.max(0, Math.min(100, Math.round(cur + Number(b.dataset.d))));
    guessEl.value = v; setGuess(v);
  }));

  $('#submit').addEventListener('click', async () => {
    const err = $('#err');
    err.hidden = true;
    const raw = guessEl.value.trim();
    const g = Number(raw);
    if (raw === '' || !Number.isFinite(g)) { showErr('Type a number first. Any number. Well, from 0 to 100.'); return; }
    if (g < 0 || g > 100) { showErr('Nice try. 0 to 100, Hoss.'); return; }
    const name = $('#name').value.trim();
    store.set('tt-name', name);
    $('#submit').disabled = true;
    try {
      const r = await fetch('api/guess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, name, guess: g })
      });
      const data = await r.json();
      if (!r.ok) showErr(data.error || 'Something went wrong. Try again?');
      else apply(data);
    } catch (e) {
      showErr('Couldn\'t reach the server. Lecture-hall Wi-Fi strikes again. Try once more?');
    }
    $('#submit').disabled = false;
  });
  function showErr(m) { const e = $('#err'); e.textContent = m; e.hidden = false; }

  // ---------------------------------------------------------------- state
  let lastPhase = '', lastRound = 0, celebrated = '';

  function levelLine(v) {
    if (v > 50) return 'Your guess was above 50, a number that can only win if your classmates are very, very generous.';
    if (v === 0) return 'You played the Nash equilibrium. Economists everywhere salute you, from a safe distance.';
    const k = Math.log(v / 50) / Math.log(2 / 3);
    return `Your guess is what a level-${Math.max(0, Math.round(k))} thinker would pick. Stick around: the professor is about to explain what that means.`;
  }

  function apply(s) {
    $('#round').textContent = s.round;
    if (s.round !== lastRound) {
      // New round: clear the old guess.
      guessEl.value = ''; slider.value = 50; $('#quip').textContent = quip(NaN);
      $('#rules').open = true;
    }

    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + s.phase));

    if (s.phase === 'open') {
      const locked = $('#locked');
      if (s.me) {
        locked.hidden = false;
        $('#lockedVal').textContent = fmt(s.me.guess);
        $('#submit').textContent = 'Change my guess';
        $('#rules').open = false;
      } else {
        locked.hidden = true;
        $('#submit').textContent = 'Lock it in';
      }
    }

    if (s.phase === 'closed') {
      $('#closedMsg').textContent = s.me
        ? `You guessed ${fmt(s.me.guess)}. The professor is building suspense, as professors do. Eyes on the big screen.`
        : 'Guesses are closed, and you didn\'t get one in. Watch anyway: there will be math, and possibly glory.';
    }

    if (s.phase === 'revealed' && s.results) {
      const R = s.results;
      $('#rMean').textContent = fmt(R.mean);
      $('#rTarget').textContent = fmt(R.target);
      const card = $('#v-revealed');
      card.classList.remove('winner');
      if (!s.me) {
        $('#resEmoji').textContent = '🍿';
        $('#resHead').textContent = 'You sat this one out';
        $('#rMine').textContent = '–'; $('#rRank').textContent = '–';
        $('#resMsg').textContent = 'Can\'t lose if you don\'t play. Can\'t win either. Catch the next round!';
        $('#resLevel').textContent = '';
      } else {
        const { guess, rank } = s.me;
        $('#rMine').textContent = fmt(guess);
        $('#rRank').textContent = `${rank} / ${R.n}`;
        let emoji, head, msg;
        if (rank === 1) {
          emoji = '🏆'; head = 'You won!';
          msg = R.winners.length > 1
            ? `You're one of ${R.winners.length} co-champions. Glory is non-rival, so you each get all of it.`
            : 'Eternal glory is yours, valid in both Ann Arbor and Kalamazoo. Tell your grandkids.';
          card.classList.add('winner');
          const key = s.round + ':' + cid;
          if (celebrated !== key) { celebrated = key; confetti(); }
        } else if (guess === 100) {
          emoji = '💯'; head = 'A noble sacrifice';
          msg = 'You picked 100 and lost, but you raised everyone else\'s target. Truly a public good.';
        } else if (rank <= 3) {
          emoji = '🥈'; head = 'So close!'; msg = 'Podium finish. One more level of thinking (or one fewer) and it was yours.';
        } else if (rank <= Math.ceil(R.n * 0.1)) {
          emoji = '🔥'; head = 'Top 10%'; msg = 'Respectable. Very respectable. Put it on your résumé.';
        } else if (rank <= Math.ceil(R.n / 2)) {
          emoji = '👍'; head = 'Better than half the room'; msg = 'Solidly above average, which is more than most guesses can say.';
        } else {
          emoji = '🤷'; head = 'There\'s always round 2'; msg = Math.abs(guess - R.target) > 40
            ? 'You were a bit far off. But hey, being wrong is how economists learn. Allegedly.'
            : 'Not this time. The good news: now you know what everyone else did.';
        }
        $('#resEmoji').textContent = emoji;
        $('#resHead').textContent = head;
        $('#resMsg').textContent = msg;
        $('#resLevel').textContent = levelLine(guess);
      }
    }

    lastPhase = s.phase; lastRound = s.round;
  }

  async function poll() {
    try {
      const r = await fetch('api/state?cid=' + encodeURIComponent(cid), { cache: 'no-store' });
      if (r.ok) apply(await r.json());
    } catch (e) { /* try again shortly */ }
    setTimeout(poll, 2000);
  }
  poll();
})();
