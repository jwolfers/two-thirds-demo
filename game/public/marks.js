// Original geometric lettermarks in each school's colours (not the official logos).
window.MARKS = {
  M: (fill = '#FFCB05', stroke = '#00274C') => `<svg viewBox="-4 -4 108 88" aria-label="Block M"><polygon points="0,0 30,0 50,30 70,0 100,0 100,18 90,18 90,62 100,62 100,80 62,80 62,62 70,62 70,40 50,68 30,40 30,62 38,62 38,80 0,80 0,62 10,62 10,18 0,18" fill="${fill}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/></svg>`,
  W: (fill = '#F1C500', stroke = '#6C4023') => `<svg viewBox="-4 -4 108 88" aria-label="W"><polygon points="0,0 36,0 36,14 29,14 37,46 46,18 54,18 63,46 71,14 64,14 64,0 100,0 100,14 93,14 76,80 59,80 50,50 41,80 24,80 7,14 0,14" fill="${fill}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/></svg>`,
};
document.querySelectorAll('[data-mark]').forEach((el) => {
  const [letter, fill, stroke] = el.dataset.mark.split(',');
  el.innerHTML = window.MARKS[letter](fill, stroke);
});
