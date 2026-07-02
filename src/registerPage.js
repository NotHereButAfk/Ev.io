// Standalone /register page. Registers into the shared UserAccount store, then
// bounces back to the game already signed in.
import './style.css';
import { UserAccount } from './core/UserAccount.js';

function err(msg) { const e = document.getElementById('reg-err'); if (e) { e.textContent = msg; e.classList.remove('hidden'); } }

const nameEl = document.getElementById('reg-name');
const passEl = document.getElementById('reg-pass');
const pass2El = document.getElementById('reg-pass2');

const doReg = () => {
  document.getElementById('reg-err')?.classList.add('hidden');
  if (passEl.value !== pass2El.value) { err("Passwords don't match"); return; }
  const res = UserAccount.register(nameEl.value.trim(), passEl.value);
  if (res.ok) window.location.href = '/';
  else err(res.err);
};

document.getElementById('reg-btn')?.addEventListener('click', doReg);
pass2El?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doReg(); });

document.getElementById('guest-btn')?.addEventListener('click', () => {
  UserAccount.guest();
  window.location.href = '/';
});
