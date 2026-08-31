import './style.css';
import { UserAccount } from './core/UserAccount.js';

const login = document.getElementById('tournament-login');
const register = document.getElementById('tournament-register');
const logout = document.getElementById('tournament-logout');
const enter = document.getElementById('tournament-enter');
const message = document.getElementById('tournament-message');

function renderSession() {
  const account = UserAccount.current();
  const registered = !!account && account !== '__guest__';
  login?.classList.toggle('hidden', registered);
  register?.classList.toggle('hidden', registered);
  logout?.classList.toggle('hidden', !registered);
  if (registered && logout) logout.textContent = `${UserAccount.getDisplayName(account)} · Log out`;
  if (enter) enter.textContent = registered ? 'PLAY DAILY ARENA' : 'LOG IN TO ENTER';
}

enter?.addEventListener('click', () => {
  const account = UserAccount.current();
  if (!account || account === '__guest__') {
    location.href = '/login?next=/tournaments';
    return;
  }
  message.textContent = 'Tournament matchmaking will use your next completed public deathmatch.';
  window.setTimeout(() => { location.href = '/'; }, 900);
});

logout?.addEventListener('click', () => {
  UserAccount.logout();
  message.textContent = 'You are logged out.';
  renderSession();
});

await UserAccount.restore();
renderSession();
