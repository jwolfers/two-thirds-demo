// Explain page: staggered k-level card reveal + convergence chart

(function () {
  var data = window.RESULTS_DATA;

  // --- Staggered card animation ---
  var cards = document.querySelectorAll('.k-card');
  cards.forEach(function (card, i) {
    setTimeout(function () {
      card.classList.add('visible');
    }, i * 500);
  });

  // --- Convergence chart ---
  var ctx = document.getElementById('convergence-chart');
  if (!ctx) return;

  var kLabels = [];
  var values = [];
  var val = 50;
  for (var k = 0; k <= 12; k++) {
    kLabels.push(k);
    values.push(Math.round(val * 100) / 100);
    val *= (2 / 3);
  }

  // Compute class k-level
  var classK = null;
  if (data && data.average && data.average > 0) {
    classK = Math.log(data.average / 50) / Math.log(2 / 3);
    classK = Math.max(0, Math.round(classK * 10) / 10);

    var kLabel = document.getElementById('class-k-level');
    if (kLabel) {
      kLabel.textContent = 'k \u2248 ' + classK;
    }
  }

  // Build annotations
  var annotations = {};

  if (data && data.target != null) {
    annotations.classLine = {
      type: 'line',
      yMin: data.target,
      yMax: data.target,
      borderColor: 'rgba(255, 203, 5, 0.8)',
      borderWidth: 2,
      borderDash: [6, 4],
      label: {
        display: true,
        content: 'Your class: ' + data.target,
        position: 'end',
        backgroundColor: 'rgba(255, 203, 5, 0.85)',
        color: '#00274C',
        font: { size: 13, weight: '700' },
        padding: { x: 8, y: 4 },
        borderRadius: 4
      }
    };
  }

  annotations.nashLine = {
    type: 'line',
    yMin: 0,
    yMax: 0,
    borderColor: 'rgba(96, 165, 250, 0.5)',
    borderWidth: 2,
    borderDash: [4, 4],
    label: {
      display: true,
      content: 'Nash Equilibrium: 0',
      position: 'start',
      backgroundColor: 'rgba(96, 165, 250, 0.7)',
      color: '#fff',
      font: { size: 11, weight: '600' },
      padding: { x: 6, y: 3 },
      borderRadius: 4
    }
  };

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: kLabels,
      datasets: [{
        label: 'Optimal Guess',
        data: values,
        borderColor: 'rgba(255, 203, 5, 1)',
        backgroundColor: 'rgba(255, 203, 5, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: 'rgba(255, 203, 5, 1)',
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 2000,
        easing: 'easeOutQuart'
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Level of Thinking (k)',
            color: '#A8C4DB',
            font: { size: 14, weight: '600' }
          },
          ticks: { color: '#A8C4DB' },
          grid: { color: 'rgba(168, 196, 219, 0.1)' }
        },
        y: {
          min: 0,
          max: 55,
          title: {
            display: true,
            text: 'Optimal Guess',
            color: '#A8C4DB',
            font: { size: 14, weight: '600' }
          },
          ticks: { color: '#A8C4DB' },
          grid: { color: 'rgba(168, 196, 219, 0.1)' }
        }
      },
      plugins: {
        legend: { display: false },
        annotation: { annotations: annotations }
      }
    }
  });
})();
