// Standalone /login page. Shares the same localStorage-backed UserAccount as the
// game, so a successful login sets the session and we bounce back to the game.
import './style.css';
import { UserAccount } from './core/UserAccount.js';

function err(id, msg) { const e = document.getElementById(id); if (e) { e.textContent = msg; e.classList.remove('hidden'); } }
function clearErr(id) { document.getElementById(id)?.classList.add('hidden'); }

const nameEl = document.getElementById('login-name');
const passEl = document.getElementById('login-pass');

const doLogin = () => {
  clearErr('login-err');
  const res = UserAccount.login(nameEl.value.trim(), passEl.value);
  if (res.ok) window.location.href = '/';
  else err('login-err', res.err);
};

document.getElementById('login-btn')?.addEventListener('click', doLogin);
passEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

document.getElementById('guest-btn')?.addEventListener('click', () => {
  UserAccount.guest();
  window.location.href = '/';
});

document.getElementById('reset-btn')?.addEventListener('click', () => {
  err('login-err', 'Password reset is unavailable — create a new account or play as guest.');
});

// ?reset=1 opens the reset panel directly (from the "Reset your password" tab).
if (new URLSearchParams(location.search).get('reset')) {
  document.getElementById('form-login')?.classList.add('hidden');
  document.getElementById('form-reset')?.classList.remove('hidden');
  document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
  document.getElementById('tab-reset')?.classList.add('active');
  const title = document.querySelector('.login-title');
  if (title) title.textContent = 'Reset your password';
}
