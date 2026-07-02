import { UserAccount } from '../core/UserAccount.js';

const TAB_TITLES = {
  login:    'Log in',
  register: 'Create new account',
  reset:    'Reset your password',
};

export class AuthUI {
  constructor() {
    this.el      = document.getElementById('auth-screen');
    this.onAuth  = null; // (username: string) => void
    this.onClose = null; // () => void  — dismiss without authenticating (spectate)

    // Tab switching (Log in / Create new account / Reset your password)
    document.querySelectorAll('.auth-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach((f) => f.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById('auth-' + btn.dataset.tab).classList.remove('hidden');
        const title = document.getElementById('login-title');
        if (title) title.textContent = TAB_TITLES[btn.dataset.tab] || 'Log in';
        this._clearErrors();
      });
    });

    // --- Log in ---
    const doLogin = () => {
      const name  = document.getElementById('auth-login-name').value.trim();
      const pass  = document.getElementById('auth-login-pass').value;
      const errEl = document.getElementById('auth-login-err');
      const res   = UserAccount.login(name, pass);
      if (res.ok) {
        errEl.classList.add('hidden');
        this.onAuth?.(name.toLowerCase());
      } else {
        errEl.textContent = res.err;
        errEl.classList.remove('hidden');
      }
    };
    document.getElementById('auth-login-btn').addEventListener('click', doLogin);
    document.getElementById('auth-login-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

    // --- Create new account ---
    const doReg = () => {
      const name  = document.getElementById('auth-reg-name').value.trim();
      const pass  = document.getElementById('auth-reg-pass').value;
      const pass2 = document.getElementById('auth-reg-pass2').value;
      const errEl = document.getElementById('auth-reg-err');
      if (pass !== pass2) {
        errEl.textContent = "Passwords don't match";
        errEl.classList.remove('hidden');
        return;
      }
      const res = UserAccount.register(name, pass);
      if (res.ok) {
        errEl.classList.add('hidden');
        this.onAuth?.(name.toLowerCase());
      } else {
        errEl.textContent = res.err;
        errEl.classList.remove('hidden');
      }
    };
    document.getElementById('auth-reg-btn').addEventListener('click', doReg);
    document.getElementById('auth-reg-pass2').addEventListener('keydown', (e) => { if (e.key === 'Enter') doReg(); });

    // --- Reset password (local build has no email; guide the user) ---
    document.getElementById('auth-reset-btn')?.addEventListener('click', () => {
      const note = document.getElementById('auth-reset-note');
      if (note) {
        note.textContent = 'This local build has no email server. Create a new account or play as guest.';
        note.classList.add('login-hint-warn');
      }
    });

    // --- Guest ---
    document.getElementById('auth-guest-btn').addEventListener('click', () => {
      UserAccount.guest();
      this.onAuth?.('__guest__');
    });

    // --- Dismiss (Play / Info return to the spectating main menu) ---
    document.getElementById('login-nav-play')?.addEventListener('click', () => this.onClose?.());
    document.getElementById('login-nav-info')?.addEventListener('click', () => this.onClose?.());
  }

  _clearErrors() {
    document.querySelectorAll('.auth-error').forEach((e) => e.classList.add('hidden'));
  }

  // Open on a specific tab ('login' | 'register' | 'reset'); defaults to login.
  show(tab = 'login') {
    const btn = document.querySelector(`.auth-tab[data-tab="${tab}"]`);
    if (btn) btn.click();
    this._clearErrors();
    this.el.classList.remove('hidden');
  }

  hide() { this.el.classList.add('hidden'); }
}
