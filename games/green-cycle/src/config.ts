// 全局配置常量
export const CONFIG = {
  // 画布逻辑尺寸（游戏世界坐标）
  WORLD_WIDTH: 1280,
  WORLD_HEIGHT: 720,

  // 路径与地图
  TILE: 32, // 格子大小
  OUTER_PAD: 80, // 外圈距画布边距
  INNER_SIZE: 320, // 内圈边长
  PATH_WIDTH: 28, // 跑道宽度

  // 性能
  TARGET_FPS: 60,
  MAX_ENEMIES_NORMAL: 40, // 单人普通模式同屏上限
  MAX_ENEMIES_ENDLESS: 20,
  PRESSURE_WARN: 0.8, // 80% 警告

  // 经济
  START_GOLD: { easy: 350, normal: 250, hard: 180 },
  START_WOOD: { easy: 5, normal: 3, hard: 2 },
  START_POP: { easy: 12, normal: 10, hard: 8 },
  SELL_REFUND: 1.0, // 出售返还建造资金比例

  // 难度系数
  DIFF_HP: { easy: 0.8, normal: 1.0, hard: 1.3 },
  DIFF_GOLD: { easy: 1.2, normal: 1.0, hard: 0.9 },
  DIFF_POP: { easy: 10, normal: 0, hard: -10 },

  // 波次
  TOTAL_WAVES: 50,
  WAVE_INTERVAL: 12, // 秒
  WAVE_BOSS: [15, 25, 35, 45, 50],

  // 全局技能 CD（秒）
  SKILL_BLAST_CD: 60,
  SKILL_SLOW_CD: 90,
  SKILL_SUMMON_CD: 120,
  SKILL_SLOW_DURATION: 8,
  SKILL_SUMMON_DURATION: 15,

  // PF
  PF_PERFECT_BONUS: 50, // 连续 PF 额外金币

  // 存档
  SAVE_KEY: 'greenCycle_v1',
} as const;

export type Difficulty = 'easy' | 'normal' | 'hard';
export type GamePhase = 'menu' | 'ready' | 'battling' | 'paused' | 'won' | 'lost';
