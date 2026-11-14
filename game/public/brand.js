// Shared bits: the block M, level-k labels, number formatting, jokes, confetti.
(function () {
  'use strict';

  // A slab "block M": maize with a blue outline. A hand-drawn homage, not the official file.
  function blockM(size, opts) {
    const o = opts || {};
    const fill = o.fill || '#FFCB05';
    const stroke = o.stroke || '#00274C';
    const h = (size * 80) / 108;
    return `<svg class="block-m" viewBox="-4 -4 108 80" width="${size}" height="${h}" role="img" aria-label="Block M">
      <path d="M0 0H34L50 24L66 0H100V18H92V54H100V72H62V54H70V34L50 62L30 34V54H38V72H0V54H8V18H0Z"
        fill="${fill}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/></svg>`;
  }

  // Level k best-responds to a room of level k-1: guesses 50 * (2/3)^k.
  const LEVELS = {
    dom:  { short: '> 66.7', name: 'Dominated',      value: null, blurb: 'Even if everyone else said 100, the target could never top 66.7. This guess can never win.' },
    L0:   { short: 'Level 0', name: 'Level 0',        value: 50,   blurb: 'No strategic thinking: a number off the top of your head. A room of these averages about 50.' },
    L1:   { short: 'Level 1', name: 'Level 1',        value: 100 / 3, blurb: 'You figured everyone else picks at random (average 50), so you said ⅔ × 50 ≈ 33.' },
    L2:   { short: 'Level 2', name: 'Level 2',        value: 200 / 9, blurb: 'You figured everyone else is Level 1 (around 33), so you said ⅔ × 33 ≈ 22.' },
    L3:   { short: 'Level 3', name: 'Level 3',        value: 400 / 27, blurb: 'You figured everyone else is Level 2 (around 22), so you said ⅔ × 22 ≈ 15.' },
    L4:   { short: 'Level 4+', name: 'Level 4+',      value: 800 / 81, blurb: 'You kept iterating: ⅔ of ⅔ of ⅔ of ⅔ of 50 and beyond. Deep. Maybe too deep.' },
    nash: { short: 'Nash (0–1)', name: 'Nash equilibrium', value: 0, blurb: 'You went all the way down to the Nash equilibrium. Correct in theory. Rarely a winner in a room of humans.' },
  };
  const LEVEL_ORDER = ['dom', 'L0', 'L1', 'L2', 'L3', 'L4', 'nash'];

  function fmt(x, d) {
    if (x == null || !Number.isFinite(x)) return '–';
    return x.toFixed(d == null ? 1 : d);
  }
  const fmtGuess = (g) => (g == null ? '–' : Number.isInteger(g) ? String(g) : g.toFixed(2).replace(/0$/, ''));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // The jokes. Michigan football is having a year. These are said with love.
  const JOKES = {
    waiting: [
      'While we wait: this game has more strategy than our play-calling on 3rd and long.',
      'Fun fact: guessing 0 is the Nash equilibrium. It is also our red-zone scoring this season.',
      'Stretch, hydrate, and think about what everyone else is thinking.',
      'Unlike the Michigan offense, this game always moves forward.',
      'Reminder: the Big House holds 107,601 people. This room is smaller, but smarter.',
    ],
    locked: [
      'Locked in. Tighter than our offensive line, anyway.',
      'Locked in. Bold. Decisive. Everything our fourth-down calls are not.',
      'Locked in. You may change it until the whistle, which is more than we can say for our season.',
      'Locked in. The professor cannot see your number, only that you are in.',
    ],
    closed: [
      'Whistle blown. Eyes on the big screen.',
      'Pencils down. Unlike our defense, nobody else gets through now.',
      'Guessing is closed. Time for the replay booth.',
    ],
    win: [
      'You are a Victor! Hail to you. Please consider coaching our offense.',
      'Winner! That is more wins than some teams in Ann Arbor are putting together this fall.',
      'Champion. You outthought the room. Michigan football would like a word.',
    ],
    near: [
      'So close. Like our last two-minute drill.',
      'A strong finish. Better than our fourth quarters, anyway.',
    ],
    far: [
      'Not your day. But you are still having a better season than the Wolverines.',
      'Rough outing. The good news: there is always next year. We say that a lot here.',
    ],
  };

  /* --------------------------------------------------------- confetti */
  function confetti(ms) {
    const dur = ms || 4500;
    let c = document.getElementById('confetti');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'confetti';
      document.body.appendChild(c);
    }
    const ctx = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = (c.width = innerWidth * dpr), H = (c.height = innerHeight * dpr);
    c.style.width = innerWidth + 'px';
    c.style.height = innerHeight + 'px';
    const colors = ['#FFCB05', '#00274C', '#ffffff', '#ffe066', '#1a4f86'];
    const bits = Array.from({ length: Math.min(260, Math.round(innerWidth / 5)) }, () => ({
      x: Math.random() * W, y: -Math.random() * H * 0.6,
      w: (6 + Math.random() * 8) * dpr, h: (8 + Math.random() * 12) * dpr,
      vx: (Math.random() - 0.5) * 2.2 * dpr, vy: (2 + Math.random() * 3.5) * dpr,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.25,
      col: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    (function frame(t) {
      const el = t - t0;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = el > dur - 800 ? Math.max(0, (dur - el) / 800) : 1;
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.r += b.vr; b.vx += Math.sin((t + b.y) / 400) * 0.02 * dpr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r);
        ctx.fillStyle = b.col; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)));
        ctx.restore();
      }
      if (el < dur) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(t0);
  }

  window.Brand = { blockM, LEVELS, LEVEL_ORDER, fmt, fmtGuess, esc, pick, ordinal, JOKES, confetti };
})();
