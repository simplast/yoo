import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SaveManager } from './SaveManager';
import { CONFIG } from '../config';
import type { SaveData } from '../types';

describe('SaveManager', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getDefault', () => {
    it('returns defaults containing easy difficulty and locked endless', () => {
      const def = SaveManager.getDefault();
      expect(def.version).toBe(1);
      expect(def.unlocks.difficulties).toContain('easy');
      expect(def.unlocks.endlessUnlocked).toBe(false);
      expect(def.leaderboard.endless).toEqual([]);
      expect(def.bestPf).toBe(0);
    });
  });

  describe('save + load', () => {
    it('writes and reads back the same data', () => {
      const data = SaveManager.getDefault();
      SaveManager.save(data);
      const loaded = SaveManager.load();
      expect(loaded).toEqual(data);
    });
  });

  describe('load', () => {
    it('returns null when there is no save', () => {
      expect(SaveManager.load()).toBeNull();
    });

    it('returns null when the saved version does not match', () => {
      const bad: SaveData = { ...SaveManager.getDefault(), version: 999 };
      globalThis.localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(bad));
      expect(SaveManager.load()).toBeNull();
    });

    it('merges missing fields with defaults', () => {
      const partial = {
        version: 1,
        settings: { volume: 0.5, quality: 'low' },
        unlocks: { difficulties: ['normal'], endlessUnlocked: true },
      };
      globalThis.localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(partial));
      const loaded = SaveManager.load();
      expect(loaded).toMatchObject({
        version: 1,
        settings: { volume: 0.5, quality: 'low' },
        unlocks: { difficulties: ['normal'], endlessUnlocked: true },
        leaderboard: { endless: [] },
        bestPf: 0,
      });
    });

    it('round-trips settings with custom volume and quality', () => {
      const data = SaveManager.getDefault();
      data.settings = { volume: 0.42, quality: 'low' };
      SaveManager.save(data);
      const loaded = SaveManager.load();
      expect(loaded?.settings).toEqual({ volume: 0.42, quality: 'low' });
      // second save/load proves no caching
      data.settings = { volume: 0.88, quality: 'high' };
      SaveManager.save(data);
      const loaded2 = SaveManager.load();
      expect(loaded2?.settings).toEqual({ volume: 0.88, quality: 'high' });
    });
  });
});
