// 合成配方工具：匹配配方、执行合成

import type { GameState } from '../game/State';
import type { Recipe, Tower, TowerDef } from '../types';
import { TOWERS } from '../data/towers';
import { createTower } from '../entities/Tower';
import { createHeroTower } from '../entities/HeroTower';
import { createCombineEffect } from '../entities/Effect';

interface GroupedIngredient {
  towerId: string;
  level: number | undefined;
  count: number;
}

/** 将配方材料按 towerId+level 分组计数 */
function groupIngredients(ingredients: Recipe['ingredients']): GroupedIngredient[] {
  const map = new Map<string, GroupedIngredient>();
  for (const ing of ingredients) {
    const key = `${ing.towerId}#${ing.level ?? '*'}`;
    const existed = map.get(key);
    if (existed) {
      existed.count++;
    } else {
      map.set(key, { towerId: ing.towerId, level: ing.level, count: 1 });
    }
  }
  return Array.from(map.values());
}

/** 判断塔是否满足单个材料要求 */
function towerMatchesIngredient(
  t: Tower,
  reqTowerId: string,
  reqLevel: number | undefined,
): boolean {
  if (t.id !== reqTowerId) return false;
  if (reqLevel !== undefined && t.level !== reqLevel) return false;
  return true;
}

/**
 * 从候选塔中找出满足一组材料要求的塔实例 id
 * - 要求候选塔互不重复
 * - 返回匹配到的 id 数组；无法匹配时返回空数组
 */
function findMaterialsForGroup(towers: Tower[], groups: GroupedIngredient[]): number[] {
  const used = new Set<number>();
  const result: number[] = [];

  for (const group of groups) {
    let need = group.count;
    for (const t of towers) {
      if (used.has(t.instanceId)) continue;
      if (towerMatchesIngredient(t, group.towerId, group.level)) {
        used.add(t.instanceId);
        result.push(t.instanceId);
        need--;
        if (need <= 0) break;
      }
    }
    if (need > 0) return [];
  }

  return result;
}

/**
 * 计算材料塔累计投入金币
 * - 使用 totalSpent 字段，包含建造成本 + 升级投入
 */
function calcMaterialValue(towers: Tower[], ids: number[]): number {
  let sum = 0;
  for (const id of ids) {
    const t = towers.find((x) => x.instanceId === id);
    if (t) sum += t.totalSpent;
  }
  return sum;
}

/**
 * 计算产物塔对应等级的"价值"
 * - 普通塔：取 levels[level-1].upgradeCost（即升到该级的成本）
 * - 成长塔：levels 只填前 5 级，level > 5 时取 levels[4].upgradeCost
 */
function calcResultValue(def: TowerDef, level: number): number {
  const lv = Math.min(level, def.levels.length);
  return def.levels[lv - 1].upgradeCost;
}

/**
 * 在候选塔中查找可满足的配方
 * - 返回匹配到的配方及具体材料塔 id 列表
 * - 优先返回 recipes 数组中靠前的配方
 */
export function matchRecipe(
  towers: Tower[],
  recipes: Recipe[],
): { recipe: Recipe; materials: Tower[] } | null {
  if (towers.length === 0) return null;
  for (const recipe of recipes) {
    const groups = groupIngredients(recipe.ingredients);
    const ids = findMaterialsForGroup(towers, groups);
    if (ids.length > 0) {
      const materials = ids.map((id) => towers.find((t) => t.instanceId === id)!).filter(Boolean);
      return { recipe, materials };
    }
  }
  return null;
}

/**
 * 执行合成
 * - 校验资源、扣除消耗、移除材料、生成产物、返还/补收差价
 * - 产物生成在第一个材料塔位置
 * - 返回 true 表示合成成功
 */
export function executeCombine(state: GameState, recipe: Recipe, materials: Tower[]): boolean {
  if (materials.length === 0) return false;

  const resultDef = TOWERS[recipe.result.towerId];
  if (!resultDef) return false;

  const costGold = recipe.cost?.gold ?? 0;
  const costWood = recipe.cost?.wood ?? 0;

  // 材料总价值
  const materialValue = calcMaterialValue(
    materials,
    materials.map((t) => t.instanceId),
  );
  // 产物等级（默认 1）
  const resultLevel = recipe.result.level ?? 1;
  const resultValue = calcResultValue(resultDef, resultLevel);

  // 合成净成本 = 合成配方消耗 + 产物价值 - 材料价值
  // 若 materialValue >= resultValue + cost，则返还差额给玩家
  const netCost = costGold + resultValue - materialValue;

  // 资源检查
  if (state.gold < netCost) return false;
  if (state.wood < costWood) return false;

  // 占用检查：若产物人口 > 材料人口总和，需要额外人口空间
  const popDelta = resultDef.popCost - materials.reduce((sum, t) => sum + t.popCost, 0);
  if (state.pop + popDelta > state.popMax) return false;

  // 产物位置取第一个材料塔
  const resultX = materials[0].x;
  const resultY = materials[0].y;

  // 移除材料塔
  for (const t of materials) {
    state.removeTower(t);
  }

  // 扣资源（netCost 可能为负，表示返还）
  state.gold -= netCost;
  state.wood -= costWood;

  // 创建产物塔
  const resultTower =
    resultDef.category === 'growth'
      ? createHeroTower(resultDef.id, resultX, resultY)
      : createTower(resultDef.id, resultX, resultY);

  // 设置产物等级
  if (resultLevel > 1) {
    resultTower.level = Math.min(resultLevel, resultTower.maxLevel);
    // 重新计算 totalSpent：取对应等级的升级成本
    resultTower.totalSpent = calcResultValue(resultDef, resultTower.level);
  }

  state.addTower(resultTower);
  state.addEffect(createCombineEffect(resultX, resultY));

  // 清空多选，选中产物塔
  state.selectedTowerIds = [];
  state.selectedTowerId = resultTower.instanceId;

  return true;
}
