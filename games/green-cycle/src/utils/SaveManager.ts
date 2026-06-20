// localStorage 存档管理
import { CONFIG } from '../config';
import type { SaveData } from '../types';

/** 存档版本号，版本不匹配时读取返回 null */
const SAVE_VERSION = 1;

/**
 * 存档管理器（静态方法，无需实例化）
 *
 * 使用 CONFIG.SAVE_KEY 作为 localStorage 键名，
 * 读取时校验 version 字段，不匹配返回 null。
 */
export class SaveManager {
  /**
   * 读取存档。不存在或版本不匹配时返回 null。
   */
  static load(): SaveData | null {
    try {
      const raw = localStorage.getItem(CONFIG.SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as Partial<SaveData>;
      if (data.version !== SAVE_VERSION) return null;
      // 合并默认值，避免旧字段缺失导致运行时错误
      const def = SaveManager.getDefault();
      return {
        version: SAVE_VERSION,
        settings: { ...def.settings, ...data.settings },
        unlocks: { ...def.unlocks, ...data.unlocks },
        leaderboard: {
          endless: Array.isArray(data.leaderboard?.endless) ? data.leaderboard!.endless : [],
        },
        bestPf: typeof data.bestPf === 'number' ? data.bestPf : 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * 写入存档。写入失败（如存储空间不足）静默忽略。
   */
  static save(data: SaveData): void {
    try {
      const payload: SaveData = { ...data, version: SAVE_VERSION };
      localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(payload));
    } catch {
      // 忽略写入错误
    }
  }

  /**
   * 清除存档
   */
  static clear(): void {
    try {
      localStorage.removeItem(CONFIG.SAVE_KEY);
    } catch {
      // 忽略
    }
  }

  /**
   * 返回默认存档（新玩家初始状态）
   */
  static getDefault(): SaveData {
    return {
      version: SAVE_VERSION,
      settings: { volume: 1, quality: 'high' },
      unlocks: { difficulties: ['easy'], endlessUnlocked: false },
      leaderboard: { endless: [] },
      bestPf: 0,
    };
  }
}
