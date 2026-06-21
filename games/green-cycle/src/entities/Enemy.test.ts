import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../game/State';
import { Path } from '../utils/Path';
import { createEnemy, resetEnemy } from './Enemy';

describe('Enemy pool hygiene', () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState(Path.createLoopPath(1280, 720, 80, 320));
  });

  it('resetEnemy clears _splitChild so recycled splitters can split again', () => {
    // Step 1: get a splitter, mark as child, release
    const a = createEnemy('splitter', state.path, 'normal', state.enemyPool);
    a._splitChild = true;
    state.enemyPool.release(a);

    // Step 2: re-acquire — pool returns the same object
    const b = createEnemy('splitter', state.path, 'normal', state.enemyPool);
    expect(b).toBe(a); // pool returned the recycled object
    expect(b.abilities).toContain('split');
    expect(b._splitChild).toBeFalsy();
  });

  it('resetEnemy is a no-op safety net even when called directly', () => {
    const e = createEnemy('splitter', state.path, 'normal', state.enemyPool);
    e._splitChild = true;
    resetEnemy(e);
    expect(e._splitChild).toBeUndefined();
  });
});
