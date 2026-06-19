import { CFG } from './config.js';

// ==================== STATE ====================
export const game = {
  state: 'START',
  score: 0,
  lives: CFG.LIVES,
  level: 1,
  combo: 0,
  comboTimer: 0,
  highScore: parseInt(localStorage.getItem('breakout_hi') || '0'),
  gameTime: 0,
  shakeDur: 0,
  shakeInt: 0,
  flashDur: 0,
  flashColor: '#fff',
  invulnTimer: 0,
  boostEnergy: CFG.BOOST_ENERGY_MAX,
  boostMode: false,
  ballOnPaddle: true,
  brickEnterAnim: 0,
  levelClearTimer: 0,
  useKeyboard: false,
  isTouching: false,
  resetKBTimer: 0,
  keys: {},
  mouseX: CFG.W / 2,

  pad: { x: CFG.W / 2, w: CFG.PAD_W, wTarget: CFG.PAD_W, glow: 0 },
  balls: [],
  bricks: [],
  powerups: [],
  effects: { WIDE: 0, SLOW: 0, PIERCE: 0 },
  particles: [],
  popups: [],
  rings: [],
  ballHeartbeatTimers: [],
};

// ==================== HELPERS ====================
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
export function randFloat(a, b) { return a + Math.random() * (b - a); }
export function triggerShake(d, i) { game.shakeDur = d; game.shakeInt = i; }
export function triggerFlash(color, dur = 0.15) { game.flashDur = dur; game.flashColor = color || '#fff'; }
export function addPopup(x, y, text, color = '#fff') { game.popups.push({ x, y, text, color, life: 1.2, vy: -90 }); }
