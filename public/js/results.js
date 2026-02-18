// Render histogram with Chart.js
(function () {
  var data = window.RESULTS_DATA;
  if (!data || !data.guesses || data.guesses.length === 0) return;

  var ctx = document.getElementById('histogram').getContext('2d');

  // Compute fractional bin position for annotation lines
  function valueToBinPos(val) {
    var idx = Math.floor(val / 5);
    if (idx >= 20) idx = 19;
    var frac = (val - idx * 5) / 5;
    return idx + frac;
  }

  var avgPos = valueToBinPos(data.average);
  var targetPos = valueToBinPos(data.target);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.binLabels,
      datasets: [{
        label: 'Number of Guesses',
        data: data.bins,
        backgroundColor: 'rgba(255, 203, 5, 0.7)',
        borderColor: 'rgba(255, 203, 5, 1)',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1000,
        easing: 'easeOutQuart'
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Guess',
            color: '#A8C4DB',
            font: { size: 14, weight: '600' }
          },
          ticks: { color: '#A8C4DB', font: { size: 11 } },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Count',
            color: '#A8C4DB',
            font: { size: 14, weight: '600' }
          },
          ticks: {
            color: '#A8C4DB',
            stepSize: 1,
            font: { size: 12 }
          },
          grid: { color: 'rgba(168, 196, 219, 0.1)' }
        }
      },
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            averageLine: {
              type: 'line',
              xMin: avgPos,
              xMax: avgPos,
              borderColor: 'rgba(96, 165, 250, 0.9)',
              borderWidth: 3,
              borderDash: [8, 4],
              label: {
                display: true,
                content: 'Average: ' + data.average,
                position: 'start',
                backgroundColor: 'rgba(96, 165, 250, 0.85)',
                color: '#fff',
                font: { size: 13, weight: '700' },
                padding: { x: 8, y: 4 },
                borderRadius: 4
              }
            },
            targetLine: {
              type: 'line',
              xMin: targetPos,
              xMax: targetPos,
              borderColor: 'rgba(34, 197, 94, 0.9)',
              borderWidth: 3,
              label: {
                display: true,
                content: '2/3 Target: ' + data.target,
                position: 'start',
                backgroundColor: 'rgba(34, 197, 94, 0.85)',
                color: '#fff',
                font: { size: 13, weight: '700' },
                padding: { x: 8, y: 4 },
                borderRadius: 4,
                yAdjust: -25
              }
            }
          }
        }
      }
    }
  });
})();
