// Maize-and-blue confetti. confetti(ms) fires a burst on the #confetti canvas.
(function () {
  const COLORS = ['#FFCB05', '#00274C', '#FFFFFF', '#FFE57F', '#2F65A7'];
  let parts = [];
  let raf = null;
  function confetti(ms = 3500) {
    const c = document.getElementById('confetti');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = (c.width = innerWidth * devicePixelRatio);
    const H = (c.height = innerHeight * devicePixelRatio);
    const end = performance.now() + ms;
    const spawn = () => {
      for (let i = 0; i < 6; i++) {
        parts.push({
          x: Math.random() * W, y: -20, vx: (Math.random() - 0.5) * 6 * devicePixelRatio, vy: (2 + Math.random() * 4) * devicePixelRatio,
          s: (6 + Math.random() * 8) * devicePixelRatio, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
          col: COLORS[Math.floor(Math.random() * COLORS.length)],
        });
      }
    };
    cancelAnimationFrame(raf);
    const tick = (t) => {
      if (t < end) spawn();
      ctx.clearRect(0, 0, W, H);
      parts = parts.filter((p) => p.y < H + 40);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.04 * devicePixelRatio; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.col;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      }
      if (parts.length || t < end) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(tick);
  }
  window.confetti = confetti;
})();
