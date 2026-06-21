// 测试共享工厂：仅被 *.test.ts 引用，禁止在生产代码中 import
import { GameState } from './game/State';
import { Path } from './utils/Path';
import { createEnemy } from './entities/Enemy';
import { createTower } from './entities/Tower';
import { createHeroTower } from './entities/HeroTower';
import { createProjectile } from './entities/Projectile';
import { resetEntityId } from './entities/Entity';
import type { Enemy, Tower, Projectile } from './types';

export function makeState(
  difficulty: 'easy' | 'normal' | 'hard' = 'normal',
  endless = false,
): GameState {
  resetEntityId();
  const s = new GameState(Path.createLoopPath(1280, 720, 80, 320));
  s.initDifficulty(difficulty, endless);
  s.phase = 'battling';
  return s;
}

export function makeEnemy(
  state: GameState,
  defId = 'grunt',
  overrides: Partial<Enemy> = {},
): Enemy {
  const e = createEnemy(defId, state.path, state.difficulty, state.enemyPool);
  Object.assign(e, overrides);
  return e;
}

export function addEnemy(state: GameState, enemy: Enemy): Enemy {
  state.addEnemy(enemy);
  state.enemyQuadtree.insert({ x: enemy.x, y: enemy.y, ref: enemy });
  return enemy;
}

export function makeTower(defId = 'arrow', x = 100, y = 100): Tower {
  return createTower(defId, x, y);
}

export function makeHeroTower(defId = 'tianshen', x = 100, y = 100): Tower {
  return createHeroTower(defId, x, y);
}

export function addTower(state: GameState, tower: Tower): Tower {
  state.addTower(tower);
  return tower;
}

export function makeProjectile(
  opts: Partial<Projectile> & { targetId: number; sourceTowerId: number },
): Projectile {
  return createProjectile({
    x: 0,
    y: 0,
    speed: 300,
    damage: 10,
    attackType: 'normal',
    splashRadius: 0,
    color: '#FFFFFF',
    size: 4,
    ...opts,
  });
}

export function addProjectile(state: GameState, proj: Projectile): Projectile {
  state.addProjectile(proj);
  return proj;
}
