// Student phone view: one guess per device, live status, personal results.
const $ = s => document.querySelector(s);
const fmt = x => (Math.round(x * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
};

let cid = store.get('tt-cid');
if (!cid) {
  cid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  store.set('tt-cid', cid);
}

let state = null;
let editing = false;

function show(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.dataset.view === view));
}

const WAIT_QUIPS = [
  'Now we wait. Somewhere, a Level 3 thinker is sweating.',
  'Bold choice. Or was it? (It was.)',
  'Your number has been sealed in a maize-and-brown envelope.',
  'Fun fact: you are now part of the average you’re trying to beat.',
  'Resist the urge to look at your neighbor’s phone. Or don’t. It’s game theory.'
];

function render() {
  if (!state) return show('loading');
  const { phase, mine } = state;
  $('#liveCount').textContent = state.count;

  if (phase === 'waiting') return show('waiting');
  if (phase === 'open') {
    if (mine && !editing) {
      $('#myGuess').textContent = fmt(mine.guess);
      $('#myName').textContent = mine.name;
      return show('submitted');
    }
    return show('form');
  }
  if (phase === 'closed') {
    $('#closedTicket').style.display = mine ? '' : 'none';
    if (mine) $('#closedGuess').textContent = fmt(mine.guess);
    $('#closedMsg').textContent = mine
      ? 'The game is closed. The professor is about to reveal the results.'
      : 'You didn’t get a guess in this time. Not playing is technically a strategy. Just not a winning one.';
    return show('closed');
  }
  if (phase === 'revealed') return renderResults();
}

function renderResults() {
  const s = state.summary;
  const mine = state.mine;
  if (!s) return show('closed');
  $('#resMean').textContent = fmt(s.mean);
  $('#resTarget').textContent = fmt(s.target);
  $('#resMine').textContent = mine ? fmt(mine.guess) : '—';
  $('#resRank').textContent = mine ? `#${mine.rank}` : '—';
  const card = document.querySelector('[data-view="revealed"]');
  card.classList.remove('winner-glow');

  let head = 'Here’s how you did.', eyebrow = 'Results', quip;
  if (!mine) {
    quip = `You sat this one out. ${s.count} classmates didn’t. Next round?`;
  } else {
    const pct = mine.rank / s.count;
    const winners = s.winners || [];
    const isWinner = mine.rank === 1;
    const off = `You were ${fmt(mine.dist)} away from the target.`;
    if (isWinner && (winners.length === 1 || (s.pick && s.pick.name === mine.name))) {
      eyebrow = 'Winner'; head = 'You won. 🏆';
      quip = `${off} You out-thought ${s.count - 1} people. Stand up and take a bow.`;
      card.classList.add('winner-glow');
    } else if (isWinner) {
      eyebrow = 'Tied for first'; head = 'You’re in the tie!';
      quip = `${off} ${winners.length} of you tied. Watch the screen: a coin flip decides it.`;
      card.classList.add('winner-glow');
    } else if (pct <= 0.05) {
      head = 'So close.'; quip = `${off} Top 5% of the room. A future economist, clearly.`;
    } else if (pct <= 0.25) {
      head = 'Nicely done.'; quip = `${off} Top quarter. You thought a step deeper than most.`;
    } else if (pct <= 0.6) {
      head = 'Solidly average.'; quip = `${off} Which, in a game about averages, is kind of poetic.`;
    } else if (mine.guess > 200 / 3) {
      head = 'Oh no.'; quip = `${off} Fun fact: guesses above 66.7 can never win. Stick around, we’ll explain.`;
    } else if (mine.guess <= 1) {
      head = 'Too smart for the room.'; quip = `${off} You played the Nash equilibrium. Everyone else didn’t. That’s the lesson.`;
    } else {
      head = 'Room to grow.'; quip = `${off} The good news: the next 20 minutes are about exactly this.`;
    }
  }
  $('#resEyebrow').textContent = eyebrow;
  $('#resHead').textContent = head;
  $('#resQuip').textContent = quip;
  show('revealed');
}

async function poll() {
  try {
    const r = await fetch(`/demo/api/state?cid=${encodeURIComponent(cid)}`, { cache: 'no-store' });
    const s = await r.json();
    if (state && s.round !== state.round) editing = false;
    state = s;
    render();
  } catch { /* hiccup: keep the current screen */ }
  // Spread 500 phones out so they don't all knock at once.
  setTimeout(poll, 2500 + Math.random() * 1500);
}

// ----- form
const nameIn = $('#name'), guessIn = $('#guess'), slider = $('#slider');
nameIn.value = store.get('tt-name') || '';
slider.oninput = () => { guessIn.value = slider.value; };
guessIn.oninput = () => {
  const v = parseFloat(guessIn.value);
  if (Number.isFinite(v)) slider.value = Math.max(0, Math.min(100, v));
};

$('#form').onsubmit = async e => {
  e.preventDefault();
  const name = nameIn.value.trim();
  const guess = parseFloat(guessIn.value.replace(',', '.'));
  const err = $('#error');
  err.textContent = '';
  if (!name) { err.textContent = 'We need a name to crown the winner.'; return; }
  if (!Number.isFinite(guess) || guess < 0 || guess > 100) { err.textContent = 'Pick a number from 0 to 100. (Nice try.)'; return; }
  const btn = $('#submit');
  btn.disabled = true; btn.textContent = 'Locking…';
  try {
    const r = await fetch('/demo/api/guess', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid, name, guess })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Something went wrong.');
    store.set('tt-name', name);
    editing = false;
    state = { ...state, mine: { name, guess: d.guess }, count: d.count };
    $('#waitQuip').textContent = WAIT_QUIPS[Math.floor(Math.random() * WAIT_QUIPS.length)];
    if (navigator.vibrate) navigator.vibrate(30);
    render();
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Lock it in';
  }
};

$('#change').onclick = () => {
  editing = true;
  if (state.mine) { guessIn.value = state.mine.guess; slider.value = state.mine.guess; }
  render();
};

render();
poll();
