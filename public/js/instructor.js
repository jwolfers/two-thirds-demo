// Poll /api/status every 3 seconds and update the live counter
let lastCount = -1;

async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    const countEl = document.getElementById('submission-count');
    if (data.count !== lastCount) {
      countEl.textContent = data.count;
      if (lastCount >= 0) {
        countEl.classList.remove('pulse');
        void countEl.offsetWidth;
        countEl.classList.add('pulse');
      }
      lastCount = data.count;
    }

    // Update status indicator
    const statusEl = document.getElementById('status-indicator');
    const btnClose = document.getElementById('btn-close');
    const btnOpen = document.getElementById('btn-open');

    if (data.gameOpen) {
      statusEl.textContent = 'Accepting Submissions';
      statusEl.classList.remove('closed');
      btnClose.style.display = '';
      btnOpen.style.display = 'none';
    } else {
      statusEl.textContent = 'Submissions Closed';
      statusEl.classList.add('closed');
      btnClose.style.display = 'none';
      btnOpen.style.display = '';
    }
  } catch (e) {
    // Silently retry on next poll
  }
}

setInterval(pollStatus, 3000);
pollStatus();

// Control buttons
async function closeSubmissions() {
  await fetch('/api/close', { method: 'POST' });
}

async function openSubmissions() {
  await fetch('/api/open', { method: 'POST' });
}

async function resetGame() {
  if (confirm('Reset all guesses and start a new round?')) {
    await fetch('/api/reset', { method: 'POST' });
    location.reload();
  }
}
