// Homemade marks (not the official logos): a block M in maize & blue, a W in gold & brown,
// plus a shared confetti cannon for celebrating winners.
window.MARKS = {
  M: `<svg viewBox="-4 -4 108 78" aria-label="Block M"><polygon points="0,0 32,0 50,27 68,0 100,0 100,16 90,16 90,54 100,54 100,70 62,70 62,54 70,54 70,34 50,62 30,34 30,54 38,54 38,70 0,70 0,54 10,54 10,16 0,16" fill="#FFCB05" stroke="#00274C" stroke-width="4" stroke-linejoin="round"/></svg>`,
  W: `<svg viewBox="-4 -4 108 78" aria-label="W"><polygon points="0,0 28,0 36,38 45,8 55,8 64,38 72,0 100,0 80,70 58,70 50,44 42,70 20,70" fill="#F1C500" stroke="#6C4023" stroke-width="4" stroke-linejoin="round"/></svg>`
};

document.querySelectorAll('[data-mark]').forEach(el => { el.innerHTML = window.MARKS[el.dataset.mark]; });

window.confetti = function confetti(ms = 3500) {
  let c = document.getElementById('confetti');
  if (!c) { c = document.createElement('canvas'); c.id = 'confetti'; document.body.appendChild(c); }
  const ctx = c.getContext('2d');
  const W = c.width = innerWidth, H = c.height = innerHeight;
  const colors = ['#FFCB05', '#00274C', '#F1C500', '#6C4023', '#ffffff'];
  const bits = Array.from({ length: 180 }, () => ({
    x: Math.random() * W, y: -20 - Math.random() * H * .5,
    vx: (Math.random() - .5) * 4, vy: 2 + Math.random() * 4,
    s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - .5) * .3,
    c: colors[Math.floor(Math.random() * colors.length)]
  }));
  const end = performance.now() + ms;
  (function tick(t) {
    ctx.clearRect(0, 0, W, H);
    bits.forEach(b => {
      b.x += b.vx; b.y += b.vy; b.vy += .05; b.r += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore();
    });
    if (t < end) requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
  })(performance.now());
};
