// Bits both screens use: level-k copy, number formatting, confetti.
(function () {
  'use strict';

  const LEVELS = {
    dom:  { label: 'Dominated', short: 'Over 66.7', value: null,
      blurb: 'Above 66.7, a guess can never win: even if everyone said 100, the target would be 66.7. A bold call, like going for it on 4th-and-23 from your own 10.' },
    L0:   { label: 'Level 0', short: '≈ 50', value: 50,
      blurb: 'Level 0 doesn’t model anyone else: a number picked at random, or the middle of the field. Fine instincts, no game theory.' },
    L1:   { label: 'Level 1', short: '≈ 33', value: 100 / 3,
      blurb: 'Level 1: “Others will pick at random, so the average is 50, and ⅔ of that is 33.” One step of reasoning. That’s one more than our play-caller.' },
    L2:   { label: 'Level 2', short: '≈ 22', value: 200 / 9,
      blurb: 'Level 2: “Others will think one step and say 33, so I’ll say 22.” You’re modeling people who model people.' },
    L3:   { label: 'Level 3', short: '≈ 15', value: 400 / 27,
      blurb: 'Level 3: “Others will say 22, so I’ll say 15.” Three steps deep. Your students are a little scared of you.' },
    L4:   { label: 'Level 4', short: '≈ 10', value: 800 / 81,
      blurb: 'Level 4: four rounds of “they think that I think…”. This is the economist’s version of a two-minute drill.' },
    L5:   { label: 'Level 5+', short: '1–8', value: null,
      blurb: 'Level 5 and beyond: you’re nearly at the Nash equilibrium, and possibly wondering why the rest of the room isn’t.' },
    nash: { label: 'Nash', short: '0–1', value: 0,
      blurb: 'The Nash equilibrium! If everyone is rational, and everyone knows everyone is rational (and so on, forever), everyone says 0. Correct in theory; in this room, maybe early.' },
  };
  const ORDER = ['dom', 'L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'nash'];

  const JOKES = [
    'Picking a number has never been easier. Ask the Michigan offense: they pick “run up the middle” every time.',
    'Unlike Michigan football this season, you can still finish in first place.',
    'Remember: ⅔ of the average. Not ⅔ of the way down the field, which is where our drives end.',
    'There is no wrong answer. Just answers that lose. Our special teams know the feeling.',
    'Take your time. The play clock is a suggestion, as our quarterback has demonstrated.',
    'If you want to guess our win total this year, the Nash equilibrium is a good place to start.',
    'Think about what everyone else will think. Then think about what they think you think. Then stop: it’s just a game.',
    'This is the only contest in Ann Arbor this fall where the lowest score might win.',
  ];

  const fmt = (x, d = 1) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }));

  function levelOf(g) {
    if (g > 200 / 3 + 1e-9) return 'dom';
    if (g <= 1) return 'nash';
    const v = [50, 100 / 3, 200 / 9, 400 / 27, 800 / 81];
    for (let k = 0; k < v.length - 1; k++) if (g > (v[k] + v[k + 1]) / 2) return `L${k}`;
    return g > (v[4] + v[4] * 2 / 3) / 2 ? 'L4' : 'L5';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function confetti(ms = 3500) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'confetti';
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    const W = (c.width = innerWidth * devicePixelRatio), H = (c.height = innerHeight * devicePixelRatio);
    const colors = ['#FFCB05', '#00274C', '#ffffff', '#FFCB05', '#1b4f86'];
    const bits = Array.from({ length: 220 }, () => ({
      x: Math.random() * W, y: -Math.random() * H * 0.6, w: (6 + Math.random() * 8) * devicePixelRatio, h: (8 + Math.random() * 10) * devicePixelRatio,
      vx: (Math.random() - 0.5) * 3 * devicePixelRatio, vy: (2 + Math.random() * 4) * devicePixelRatio, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    (function tick(t) {
      ctx.clearRect(0, 0, W, H);
      bits.forEach((b) => {
        b.x += b.vx; b.y += b.vy; b.r += b.vr; b.vy += 0.03 * devicePixelRatio;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
      });
      if (t - t0 < ms) requestAnimationFrame(tick); else c.remove();
    })(t0);
  }

  window.TT = { LEVELS, ORDER, JOKES, fmt, levelOf, esc, confetti };
})();
