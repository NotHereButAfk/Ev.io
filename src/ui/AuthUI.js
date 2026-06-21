import { UserAccount } from '../core/UserAccount.js';

export class AuthUI {
  constructor() {
    this.el  = document.getElementById('auth-screen');
    this.onAuth = null; // (username: string) => void

    // Tab switching (LOGIN / REGISTER)
    document.querySelectorAll('.auth-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach((f) => f.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById('auth-' + btn.dataset.tab).classList.remove('hidden');
      });
    });

    // --- Login ---
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

    // --- Register ---
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

    // --- Guest ---
    document.getElementById('auth-guest-btn').addEventListener('click', () => {
      UserAccount.guest();
      this.onAuth?.('__guest__');
    });
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }
}
