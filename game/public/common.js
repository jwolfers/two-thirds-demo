/* Helpers shared by the projector deck and the phone page. */
(function () {
  'use strict';

  const BLOCK_M =
    '<svg class="block-m" viewBox="-3 -3 106 76" role="img" aria-label="Block M">' +
    '<polygon points="0,0 32,0 50,24 68,0 100,0 100,15 92,15 92,55 100,55 100,70 62,70 62,55 70,55 70,25.4 50,52 30,25.4 30,55 38,55 38,70 0,70 0,55 8,55 8,15 0,15"/>' +
    '</svg>';

  const FRAC = '<span class="frac" aria-label="two-thirds"><span class="n">2</span><span class="s">/</span><span class="d">3</span></span>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Fixed decimals: 34.2 -> "34.20" with d = 2.
  function fixed(x, d) {
    if (x == null || !Number.isFinite(x)) return '–';
    return x.toFixed(d);
  }

  // Trimmed decimals: 33 -> "33", 33.5 -> "33.5", 33.333 -> "33.33".
  function num(x, maxd = 2) {
    if (x == null || !Number.isFinite(x)) return '–';
    return String(Number(x.toFixed(maxd)));
  }

  function pct(x) {
    if (!Number.isFinite(x)) return '–';
    const p = x * 100;
    return (p > 0 && p < 1 ? p.toFixed(1) : Math.round(p)) + '%';
  }

  function countUp(el, to, d, ms = 900) {
    if (!Number.isFinite(to)) { el.textContent = '–'; return; }
    const start = performance.now();
    function frame(t) {
      const p = Math.max(0, Math.min(1, (t - start) / ms)); // rAF time can precede `start`
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = (to * e).toFixed(d);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // localStorage that never throws (private windows, blocked storage).
  const memory = {};
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v == null ? memory[k] || null : v; } catch (e) { return memory[k] || null; } },
    set(k, v) { memory[k] = v; try { localStorage.setItem(k, v); } catch (e) { /* memory only */ } },
    del(k) { delete memory[k]; try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    let s = '';
    for (let i = 0; i < 24; i++) s += Math.floor(Math.random() * 36).toString(36);
    return s;
  }

  // Maize-and-blue confetti, no library.
  function confetti(opts = {}) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    const colors = ['#FFCB05', '#FFCB05', '#FFE27A', '#FFFFFF', '#8FB8E8'];
    const count = opts.count || 220;
    const parts = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height * 0.7,
      w: (7 + Math.random() * 8) * dpr,
      h: (10 + Math.random() * 12) * dpr,
      vx: (Math.random() - 0.5) * 3 * dpr,
      vy: (2.5 + Math.random() * 4) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.25,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const dur = opts.duration || 5000;
    const start = performance.now();
    function frame(t) {
      const el = t - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = el > dur - 900 ? Math.max(0, (dur - el) / 900) : 1;
      for (const p of parts) {
        p.x += p.vx + Math.sin((el / 400) + p.r) * 0.6 * dpr;
        p.y += p.vy;
        p.vy += 0.03 * dpr;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.7)) + dpr);
        ctx.restore();
      }
      if (el < dur) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  window.TT = { BLOCK_M, FRAC, esc, fixed, num, pct, countUp, store, makeId, confetti };
})();
