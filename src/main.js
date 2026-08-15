import './style.css';
import { Game } from './core/Game.js';
import { installSponsorBlockCheck } from './ui/SponsorAvailability.js';

installSponsorBlockCheck();

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
// Dev/diagnostic handle (also lets the authnet integration be inspected).
if (import.meta.env?.DEV) window.__game = game;
