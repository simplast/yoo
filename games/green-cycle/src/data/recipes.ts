// 合成配方表（PRD 5.6 节）
// 通过消耗多座已建塔 + 资源，合成更高级的塔

import type { Recipe } from '../types';

export const RECIPES: Recipe[] = [
  // 3 座 3 级箭塔 → 1 座 1 级群攻塔（消耗 100 金）
  {
    id: 'recipe_arrow_to_splash',
    name: '箭塔合群攻',
    ingredients: [
      { towerId: 'arrow', level: 3 },
      { towerId: 'arrow', level: 3 },
      { towerId: 'arrow', level: 3 },
    ],
    result: { towerId: 'splash', level: 1 },
    cost: { gold: 100 },
  },
  // 2 座 5 级破坏塔 → 1 座 1 级混乱塔（消耗 200 金 5 木）
  {
    id: 'recipe_cannon_to_chaos',
    name: '破坏塔合混乱塔',
    ingredients: [
      { towerId: 'cannon', level: 5 },
      { towerId: 'cannon', level: 5 },
    ],
    result: { towerId: 'chaos', level: 1 },
    cost: { gold: 200, wood: 5 },
  },
  // 天神 + 剑圣 10 级 → 天神 15 级（演示用，消耗 500 金 10 木）
  {
    id: 'recipe_growth_fuse',
    name: '成长塔融合',
    ingredients: [
      { towerId: 'tianshen', level: 10 },
      { towerId: 'jianfa', level: 10 },
    ],
    result: { towerId: 'tianshen', level: 15 },
    cost: { gold: 500, wood: 10 },
  },
];
