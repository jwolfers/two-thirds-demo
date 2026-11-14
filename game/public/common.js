// Shared bits for the deck and the phones: the marks, levels, formatting, confetti.
(function () {
  'use strict';

  // A slab "block M" in maize, outlined in blue. A homage, not the official file.
  function blockM(size, opts) {
    const o = opts || {};
    const fill = o.fill || '#FFCB05';
    const stroke = o.stroke || '#00274C';
    return `<svg class="mark mark-m" viewBox="-4 -4 108 80" width="${size}" height="${(size * 80) / 108}" aria-label="Block M" role="img">
      <path d="M0 0H34L50 24L66 0H100V18H92V54H100V72H62V54H70V34L50 62L30 34V54H38V72H0V54H8V18H0Z"
        fill="${fill}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/></svg>`;
  }

  // A Case Western Reserve shield-ish monogram in CWRU blue. Also a homage.
  function cwruMark(size) {
    return `<svg class="mark mark-cwru" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Case Western Reserve" role="img">
      <path d="M8 6H92V52C92 76 72 90 50 97C28 90 8 76 8 52Z" fill="#0A304E" stroke="#FFFFFF" stroke-width="4"/>
      <path d="M8 34H92" stroke="#7FB3E3" stroke-width="3"/>
      <text x="50" y="27" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-weight="900" font-size="17" fill="#FFFFFF" letter-spacing="1">CWRU</text>
      <text x="50" y="66" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-weight="900" font-size="34" fill="#7FB3E3">⅔</text>
      <text x="50" y="84" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-weight="800" font-size="9" fill="#FFFFFF" letter-spacing="1.5">SPARTANS</text></svg>`;
  }

  const TEAMS = {
    um: { label: 'Michigan', short: 'UM', color: '#FFCB05', ink: '#00274C' },
    cwru: { label: 'Case Western', short: 'CWRU', color: '#7FB3E3', ink: '#0A304E' },
    other: { label: 'Everyone else', short: 'Other', color: '#F4F1E8', ink: '#333333' },
  };

  // Level k guesses 50 x (2/3)^k. The bands match the server's levelOf().
  const LEVELS = [
    { key: 'dom', label: 'Above 66.7', name: 'Dominated', anchor: null },
    { key: 'L0', label: 'Level 0', name: 'Level 0', anchor: 50 },
    { key: 'L1', label: 'Level 1', name: 'Level 1', anchor: 100 / 3 },
    { key: 'L2', label: 'Level 2', name: 'Level 2', anchor: 200 / 9 },
    { key: 'L3', label: 'Level 3', name: 'Level 3', anchor: 400 / 27 },
    { key: 'L4', label: 'Level 4+', name: 'Level 4+', anchor: 800 / 81 },
    { key: 'nash', label: 'Nash (0–1)', name: 'Nash', anchor: 0 },
  ];

  const LEVEL_TALK = {
    dom: 'Above 66.7 is strictly dominated: even if everyone else picked 100, two-thirds of the average could never beat 66.7. Bold, like a fake punt on fourth and twenty.',
    L0: 'Level 0 thinking: you treated the room as picking at random, which averages 50. Honest and trusting, like a Michigan fan in August.',
    L1: 'Level 1 thinking: you figured everyone else was Level 0, so you went with two-thirds of 50, about 33.',
    L2: 'Level 2 thinking: you figured everyone else was Level 1, so you went with two-thirds of 33, about 22. Respect.',
    L3: 'Level 3 thinking: two-thirds of two-thirds of two-thirds of 50, about 15. You have clearly sat through faculty meetings.',
    L4: 'Level 4+ thinking: deep, deep reasoning. Possibly too deep for this room.',
    nash: 'Nash equilibrium thinking: zero (or close). Perfect in theory. In practice, the room did not follow you to the goal line.',
  };

  function fmt(x, d) {
    if (x == null || !Number.isFinite(x)) return '–';
    const dd = d == null ? 1 : d;
    return Number(x).toFixed(dd).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  // Implied depth of reasoning: the k that solves 50 x (2/3)^k = average.
  function depth(avg) {
    if (avg == null || avg <= 0) return null;
    return Math.log(avg / 50) / Math.log(2 / 3);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function confetti(count) {
    const n = count || 140;
    const colors = ['#FFCB05', '#00274C', '#7FB3E3', '#0A304E', '#FFFFFF'];
    const box = document.createElement('div');
    box.className = 'confetti';
    for (let i = 0; i < n; i += 1) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.8 + 's';
      p.style.animationDuration = 2.4 + Math.random() * 2 + 's';
      p.style.setProperty('--drift', (Math.random() * 2 - 1) * 160 + 'px');
      p.style.setProperty('--spin', (Math.random() * 4 - 2) * 360 + 'deg');
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 5200);
  }

  window.TT = { blockM, cwruMark, TEAMS, LEVELS, LEVEL_TALK, fmt, depth, esc, confetti };
})();
