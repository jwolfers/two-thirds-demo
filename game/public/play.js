// Student phone page: one guess per device, editable until guessing closes.
const $ = (s) => document.querySelector(s);
const fmt = (x) => (x == null ? '–' : (Math.round(x * 10) / 10).toString());

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } }
let id = store('tt-id');
if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); store('tt-id', id); }
$('#name').value = store('tt-name') || '';

let me = null;
let editing = false;

// Keep the number box and slider in sync
$('#slider').addEventListener('input', () => { $('#guess').value = $('#slider').value; });
$('#guess').addEventListener('input', () => { const v = Number($('#guess').value); if (Number.isFinite(v)) $('#slider').value = Math.max(0, Math.min(100, v)); });

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#err').textContent = '';
  const raw = $('#guess').value.trim();
  const guess = Number(raw);
  if (raw === '' || !Number.isFinite(guess)) return ($('#err').textContent = 'Type a number first. Even Level 0 thinkers pick something.');
  if (guess < 0 || guess > 100) return ($('#err').textContent = 'Between 0 and 100, please. We admire the creativity, though.');
  const name = $('#name').value.trim();
  store('tt-name', name);
  $('#submit').disabled = true;
  try {
    const res = await fetch('/api/guess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, guess, name }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    editing = false;
    me.mine = data.mine;
    render();
    $('#lockedIn').classList.remove('pop'); void $('#lockedIn').offsetWidth; $('#lockedIn').classList.add('pop');
    navigator.vibrate?.(30);
  } catch (err) {
    $('#err').textContent = err.message;
  } finally {
    $('#submit').disabled = false;
  }
});

$('#change').addEventListener('click', () => {
  editing = true;
  $('#guess').value = me.mine.guess; $('#slider').value = me.mine.guess;
  render();
  $('#guess').focus();
});

async function poll() {
  try {
    const res = await fetch(`/api/me?id=${encodeURIComponent(id)}`);
    const next = await res.json();
    if (me && next.round !== me.round) { editing = false; $('#guess').value = ''; $('#slider').value = 50; }
    me = next;
    render();
  } catch {
    $('#statusText').textContent = 'Reconnecting…';
  }
}
setInterval(poll, 2000);
poll();

const STATUS = {
  waiting: ['Waiting for the professor', 'Guessing opens in a moment. Use the time to predict your classmates.'],
  open: ['Guessing is open', 'Submit your guess. You can change it until we close.'],
  closed: ['Guessing is closed', 'Eyes on the big screen. The math is happening.'],
  revealed: ['Results are in', 'Now look up: the professor is about to explain why.'],
};

function render() {
  if (!me) return;
  $('#round').textContent = me.round;
  document.body.className = `phase-${me.phase}`;
  const [title, sub] = STATUS[me.phase];
  $('#statusText').textContent = title;
  $('#statusSub').textContent = sub;
  $('#dot').className = 'dot ' + (me.phase === 'open' ? 'open' : me.phase === 'waiting' ? '' : 'closed');

  const open = me.phase === 'open';
  const showForm = open && (!me.mine || editing);
  $('#form').hidden = !(showForm || (me.phase === 'waiting'));
  $('#submit').disabled = !open;
  $('#submit').textContent = open ? (me.mine ? 'Update my guess' : 'Lock it in') : 'Waiting to open…';

  $('#lockedIn').hidden = !me.mine || showForm;
  if (me.mine) {
    $('#myGuess').textContent = fmt(me.mine.guess);
    $('#lockedNote').textContent = open ? 'You can change it until guessing closes.' : 'Locked. No take-backs now.';
    $('#change').hidden = !open;
  }

  const r = me.result;
  $('#result').hidden = !r;
  if (r) {
    $('#rMean').textContent = fmt(r.mean);
    $('#rTarget').textContent = fmt(r.target);
    $('#rYou').textContent = me.mine ? fmt(me.mine.guess) : '–';
    $('#result').classList.toggle('won', r.won);
    $('#resultKicker').textContent = `${r.n} players`;
    if (!me.mine) {
      $('#resultHead').textContent = 'You sat this one out';
      $('#resultQuip').textContent = 'Not playing is a strategy. It just never wins. Catch the next round!';
    } else {
      $('#resultHead').textContent = r.won ? (r.winners.length > 1 ? 'You tied for the win!' : 'You won!') : `You placed #${r.rank} of ${r.n}`;
      $('#resultQuip').textContent = quip(me.mine.guess, r);
    }
  }
}

function quip(g, r) {
  if (r.won) return 'You out-thought the whole room. Go Blue! (And Go Broncos. Diplomacy matters.)';
  if (g > 66.67) return 'Bold. Mathematically impossible to win, but bold.';
  if (g === 0) return 'Perfectly rational. Sadly, your classmates are not. Theory 1, you 0.';
  if (Math.abs(g - 50) <= 3) return 'Level 0 energy. We respect the honesty.';
  if (g < r.target) return 'You thought one step too many. Overthinking: an economist\'s occupational hazard.';
  if (r.rank <= Math.max(1, Math.ceil(r.n * 0.1))) return 'Top 10%. You were nearly one step deeper than the crowd.';
  return 'Next round: think one step further than everyone else. But only one.';
}
