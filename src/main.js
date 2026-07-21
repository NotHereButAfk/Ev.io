import './style.css';
import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
// Dev/diagnostic handle (also lets the authnet integration be inspected).
if (import.meta.env?.DEV) window.__game = game;
