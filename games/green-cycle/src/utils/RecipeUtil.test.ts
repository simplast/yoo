import { describe, it, expect } from 'vitest';
import { matchRecipe, executeCombine } from './RecipeUtil';
import { RECIPES } from '../data/recipes';
import { createTower, upgradeTower } from '../entities/Tower';
import { GameState } from '../game/State';
import { Path } from './Path';
import type { Recipe, Tower } from '../types';

function arrowLevel3(x = 100, y = 100): Tower {
  const t = createTower('arrow', x, y);
  upgradeTower(t);
  upgradeTower(t);
  return t;
}

function cannonLevel5(x = 200, y = 200): Tower {
  const t = createTower('cannon', x, y);
  for (let i = 0; i < 4; i++) {
    upgradeTower(t);
  }
  return t;
}

function freshState(): GameState {
  const state = new GameState(Path.createLoopPath(1280, 720, 80, 320));
  state.initDifficulty('normal', false);
  return state;
}

describe('matchRecipe', () => {
  it('returns null for empty towers', () => {
    expect(matchRecipe([], RECIPES)).toBeNull();
  });

  it('matches 3 level-3 arrow towers to recipe_arrow_to_splash', () => {
    const towers = [arrowLevel3(), arrowLevel3(), arrowLevel3()];
    const result = matchRecipe(towers, RECIPES);
    expect(result).not.toBeNull();
    expect(result!.recipe.id).toBe('recipe_arrow_to_splash');
    expect(result!.materials.length).toBe(3);
    expect(result!.materials.every((t) => t.id === 'arrow' && t.level === 3)).toBe(true);
  });

  it('matches 2 level-5 cannon towers to recipe_cannon_to_chaos', () => {
    const towers = [cannonLevel5(), cannonLevel5()];
    const result = matchRecipe(towers, RECIPES);
    expect(result).not.toBeNull();
    expect(result!.recipe.id).toBe('recipe_cannon_to_chaos');
    expect(result!.materials.length).toBe(2);
  });

  it('returns null when tower level does not match', () => {
    const towers = [createTower('arrow', 0, 0), createTower('arrow', 0, 0), createTower('arrow', 0, 0)];
    expect(matchRecipe(towers, RECIPES)).toBeNull();
  });

  it('returns null when there are not enough towers', () => {
    const towers = [arrowLevel3(), arrowLevel3()];
    expect(matchRecipe(towers, RECIPES)).toBeNull();
  });

  it('returns the earlier recipe when multiple recipes could match', () => {
    const customRecipes: Recipe[] = [
      {
        id: 'recipe_a',
        name: 'A',
        ingredients: [{ towerId: 'arrow' }],
        result: { towerId: 'splash' },
      },
      {
        id: 'recipe_b',
        name: 'B',
        ingredients: [{ towerId: 'arrow' }],
        result: { towerId: 'chaos' },
      },
    ];
    const towers = [createTower('arrow', 0, 0)];
    const result = matchRecipe(towers, customRecipes);
    expect(result).not.toBeNull();
    expect(result!.recipe.id).toBe('recipe_a');
  });
});

describe('executeCombine', () => {
  it('successfully combines, removes materials and creates result', () => {
    const state = freshState();
    const materials = [arrowLevel3(), arrowLevel3(), arrowLevel3()];
    const beforeGold = state.gold;
    const matched = matchRecipe(materials, RECIPES)!;
    const ok = executeCombine(state, matched.recipe, matched.materials);

    expect(ok).toBe(true);
    expect(state.towers.length).toBe(1);
    expect(state.towers[0].id).toBe('splash');
    expect(state.towers[0].level).toBe(1);
    // netCost = 100 + 80 - 3 * 130 = -210，玩家应得到返还
    expect(state.gold).toBe(beforeGold + 210);
  });

  it('returns false when wood is insufficient', () => {
    const state = freshState();
    state.wood = 0;
    const materials = [cannonLevel5(), cannonLevel5()];
    const matched = matchRecipe(materials, RECIPES)!;
    expect(executeCombine(state, matched.recipe, matched.materials)).toBe(false);
  });

  it('returns false when gold is insufficient', () => {
    const state = freshState();
    state.gold = 100;
    const materials = [arrowLevel3(), arrowLevel3(), arrowLevel3()];
    materials.forEach((t) => (t.totalSpent = 0));
    const matched = matchRecipe(materials, RECIPES)!;
    expect(executeCombine(state, matched.recipe, matched.materials)).toBe(false);
  });

  it('returns false when population space is insufficient', () => {
    const state = freshState();
    state.gold = 1000;
    state.wood = 100;
    state.pop = state.popMax + 10;
    const materials = [arrowLevel3(), arrowLevel3(), arrowLevel3()];
    materials.forEach((t) => (t.totalSpent = 0));
    const matched = matchRecipe(materials, RECIPES)!;
    expect(executeCombine(state, matched.recipe, matched.materials)).toBe(false);
  });
});
