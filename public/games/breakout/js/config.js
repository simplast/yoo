// ==================== CONFIG ====================
export const CFG = {
  W: 640, H: 720, BG: '#0a0a12',
  PAD_W: 100, PAD_W_WIDE: 160, PAD_H: 14, PAD_Y: 680,
  PAD_SPEED: 420, PAD_COLOR: '#00ee77',
  BALL_R: 5, BALL_SPEED: 230, BALL_SLOW_RATIO: 0.6,
  BALL_COLOR: '#ffffff', BALL_MIN_VY: 100,
  BRICK_ROWS: 5, BRICK_COLS: 8,
  BRICK_W: 72, BRICK_H: 22, BRICK_PAD: 4, BRICK_TOP: 80,
  BRICK_LEFT: 0, GOLD_HITS: 2,
  PU_CHANCE: 0.22, PU_SIZE: 20, PU_FALL: 120,
  PU_WIDE_DUR: 10, PU_SLOW_DUR: 8, PU_PIERCE_DUR: 7,
  LIVES: 3, DANGER_ZONE_Y: 650, INVULN_DUR: 2,
  BOOST_ENERGY_MAX: 100, BOOST_ENERGY_DRAIN: 30, BOOST_ENERGY_REGEN: 15,
  BOOST_SPEED_MULT: 1.5, BOOST_PAD_SPEED_MULT: 1.6,
};
CFG.BRICK_LEFT = (CFG.W - (CFG.BRICK_COLS * (CFG.BRICK_W + CFG.BRICK_PAD) - CFG.BRICK_PAD)) / 2;

export const ROW_COLORS = ['#ff2255','#ff8811','#ffdd00','#00cc44','#2299ff'];
export const ROW_SCORES = [50,40,30,20,10];
export const GOLD_COLOR = '#ffaa00', GOLD_SCORE = 80;

// Level color themes (Feature 11)
export const LEVEL_THEMES=[
  {name:'Default',rows:['#ff2255','#ff8811','#ffdd00','#00cc44','#2299ff']},
  {name:'Teal/Magenta',rows:['#ff00ff','#cc00cc','#00cccc','#00aacc','#cc00cc']},
  {name:'Orange/Purple',rows:['#ff6600','#cc33ff','#9933ff','#ff6600','#cc33ff']},
  {name:'Cyan/White',rows:['#00ffff','#ffffff','#00cccc','#aaffff','#00ffff']},
  {name:'Green/Red',rows:['#00ff44','#ff2222','#00cc33','#cc0000','#00ff55']},
];
export function getLevelTheme(level){return LEVEL_THEMES[(level-1)%LEVEL_THEMES.length];}

export const PU_TYPES = [
  {id:'WIDE',label:'W',color:'#00ff66',name:'加宽'},
  {id:'MULTI',label:'M',color:'#4488ff',name:'多球'},
  {id:'SLOW',label:'S',color:'#ffee00',name:'减速'},
  {id:'PIERCE',label:'P',color:'#ff4444',name:'穿透'},
  {id:'LIFE',label:'+',color:'#ff66cc',name:'加命'},
];
