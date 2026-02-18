// Tiebreaker bracket tournament with animated coin flips

var _bracketUid = 0;
function nextUid() { return _bracketUid++; }

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function startBracket() {
  var data = window.RESULTS_DATA;
  if (!data || !data.winners || data.winners.length < 2) return;

  var overlay = document.getElementById('bracket-overlay');
  overlay.style.display = 'flex';
  overlay.innerHTML = '<h2 class="bracket-title">Tiebreaker Tournament</h2>';

  var players = data.winners.map(function (w) { return w.name; });
  runBracket(players, overlay);
}

async function runBracket(players, container) {
  // Fisher-Yates shuffle
  var shuffled = players.slice();
  for (var i = shuffled.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }

  var currentRound = shuffled;
  var roundNum = 1;

  while (currentRound.length > 1) {
    var isLast = currentRound.length <= 2;
    var roundLabel = isLast ? 'Final' : 'Round ' + roundNum;

    var roundDiv = document.createElement('div');
    roundDiv.className = 'bracket-round';
    roundDiv.innerHTML = '<div class="round-label">' + roundLabel + '</div>';
    container.appendChild(roundDiv);

    var nextRound = [];

    for (var i = 0; i < currentRound.length; i += 2) {
      if (i + 1 >= currentRound.length) {
        // Bye
        nextRound.push(currentRound[i]);
        var byeDiv = document.createElement('div');
        byeDiv.className = 'matchup';
        byeDiv.innerHTML =
          '<span class="player-name winner-highlight">' + escapeHtml(currentRound[i]) + '</span>' +
          '<span class="bye-label">gets a bye</span>';
        roundDiv.appendChild(byeDiv);
      } else {
        var winner = await animateMatchup(currentRound[i], currentRound[i + 1], roundDiv);
        nextRound.push(winner);
      }
    }

    currentRound = nextRound;
    roundNum++;

    if (currentRound.length > 1) {
      await delay(800);
    }
  }

  // Announce champion
  await delay(500);
  var champDiv = document.createElement('div');
  champDiv.className = 'champion-announcement';
  champDiv.innerHTML =
    '<h2>Champion</h2>' +
    '<div class="champion-name">' + escapeHtml(currentRound[0]) + '</div>' +
    '<p style="color: var(--michigan-maize); font-size: 1.2rem; margin-top: 1rem; font-weight: 700;">Wins the $50 Amazon Gift Card!</p>' +
    '<button class="btn btn-outline" style="margin-top: 1.5rem;" onclick="document.getElementById(\'bracket-overlay\').style.display=\'none\'">Close</button>';
  container.appendChild(champDiv);
}

function animateMatchup(playerA, playerB, roundDiv) {
  return new Promise(async function (resolve) {
    var id = nextUid();
    var paId = 'pa-' + id;
    var pbId = 'pb-' + id;
    var coinId = 'coin-' + id;

    var matchup = document.createElement('div');
    matchup.className = 'matchup';
    matchup.innerHTML =
      '<span class="player-name" id="' + paId + '">' + escapeHtml(playerA) + '</span>' +
      '<div class="coin-wrapper">' +
        '<div class="coin" id="' + coinId + '">' +
          '<div class="coin-face coin-front">A</div>' +
          '<div class="coin-face coin-back">B</div>' +
        '</div>' +
      '</div>' +
      '<span class="player-name" id="' + pbId + '">' + escapeHtml(playerB) + '</span>';
    roundDiv.appendChild(matchup);

    await delay(500);

    // Determine winner randomly
    var winner = Math.random() < 0.5 ? playerA : playerB;

    // Flip the coin
    var coin = document.getElementById(coinId);
    var extraHalf = winner === playerA ? 0 : 180;
    coin.style.transition = 'transform 2s ease-out';
    coin.style.transform = 'rotateY(' + (1800 + extraHalf) + 'deg)';

    await delay(2200);

    // Highlight winner and dim loser
    var paEl = document.getElementById(paId);
    var pbEl = document.getElementById(pbId);

    if (winner === playerA) {
      paEl.classList.add('winner-highlight');
      pbEl.classList.add('loser');
    } else {
      pbEl.classList.add('winner-highlight');
      paEl.classList.add('loser');
    }

    await delay(300);
    resolve(winner);
  });
}
