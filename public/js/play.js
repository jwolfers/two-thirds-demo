// Client-side validation for the guess form
document.getElementById('guess-form').addEventListener('submit', function (e) {
  var nameInput = document.getElementById('name');
  var guessInput = document.getElementById('guess');
  var name = nameInput.value.trim();
  var guessVal = guessInput.value;

  // Remove any existing error
  var existing = document.querySelector('.form-error');
  if (existing) existing.remove();

  if (!name) {
    e.preventDefault();
    showError('Please enter your name.');
    nameInput.focus();
    return;
  }

  var guess = parseFloat(guessVal);
  if (guessVal === '' || isNaN(guess)) {
    e.preventDefault();
    showError('Please enter a number.');
    guessInput.focus();
    return;
  }

  if (guess < 0 || guess > 100) {
    e.preventDefault();
    showError('Your guess must be between 0 and 100.');
    guessInput.focus();
    return;
  }

  // Disable submit to prevent double-submission
  var btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
});

function showError(msg) {
  var form = document.getElementById('guess-form');
  var errorDiv = document.createElement('div');
  errorDiv.className = 'form-error';
  errorDiv.textContent = msg;
  form.insertBefore(errorDiv, form.firstChild);
}
