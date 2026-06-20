// Web Audio API 程序化音效封装（8-bit 像素风）
// 不依赖外部音频文件，所有音效通过 oscillator / noise 合成

/**
 * 游戏音效管理器
 * 使用 Web Audio API 程序化合成 8-bit 风格音效
 */
class GameAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.5;
  private muted: boolean = false;

  /**
   * 懒初始化 AudioContext
   * 必须在用户交互（点击/按键）后调用，否则浏览器会阻止
   */
  init(): void {
    if (this.ctx) return;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      // AudioContext 创建失败，静默忽略
      this.ctx = null;
      this.masterGain = null;
    }
  }

  /**
   * 设置主音量 [0, 1]
   */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 设置静音
   */
  setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 恢复挂起的 AudioContext（浏览器自动挂起时调用）
   */
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // 忽略
      });
    }
  }

  /**
   * 合成纯音
   * @param freq 频率 Hz
   * @param duration 持续时间秒
   * @param type 振荡器类型
   * @param gain 增益（0-1）
   */
  private playTone(freq: number, duration: number, type: OscillatorType, gain: number): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      // 包络：快速起音，指数衰减
      g.gain.setValueAtTime(0, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + duration + 0.02);
    } catch {
      // 忽略
    }
  }

  /**
   * 合成噪声（带通滤波）
   * @param duration 持续时间秒
   * @param gain 增益
   * @param filterFreq 滤波器中心频率
   */
  private playNoise(duration: number, gain: number, filterFreq: number): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
      filter.Q.value = 1;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      noise.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      noise.start(this.ctx.currentTime);
      noise.stop(this.ctx.currentTime + duration + 0.02);
    } catch {
      // 忽略
    }
  }

  /**
   * 合成扫频音（用于技能等）
   */
  private playSweep(
    startFreq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
  ): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
      g.gain.setValueAtTime(0, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + duration + 0.02);
    } catch {
      // 忽略
    }
  }

  // ===== 音效方法 =====

  /** 建造：上升短音 */
  playBuild(): void {
    if (!this.ctx) return;
    try {
      this.playSweep(330, 660, 0.12, 'square', 0.2);
    } catch {
      // 忽略
    }
  }

  /** 升级：明亮上升和弦 */
  playUpgrade(): void {
    if (!this.ctx) return;
    try {
      // C-E-G 大三和弦琶音
      this.playTone(523, 0.18, 'square', 0.18); // C5
      setTimeout(() => this.playTone(659, 0.18, 'square', 0.18), 60); // E5
      setTimeout(() => this.playTone(784, 0.25, 'square', 0.2), 120); // G5
    } catch {
      // 忽略
    }
  }

  /** 命中：短促中音 + 噪声 */
  playHit(): void {
    if (!this.ctx) return;
    try {
      this.playTone(440, 0.05, 'square', 0.15);
      this.playNoise(0.06, 0.1, 2000);
    } catch {
      // 忽略
    }
  }

  /** 发射：高频短音 */
  playShoot(): void {
    if (!this.ctx) return;
    try {
      this.playSweep(880, 1320, 0.06, 'square', 0.12);
    } catch {
      // 忽略
    }
  }

  /** 敌人死亡：下降噪声 */
  playEnemyDeath(): void {
    if (!this.ctx) return;
    try {
      this.playSweep(440, 110, 0.2, 'sawtooth', 0.18);
      this.playNoise(0.2, 0.12, 800);
    } catch {
      // 忽略
    }
  }

  /** Boss 警报：低沉长音 */
  playBossWarn(): void {
    if (!this.ctx) return;
    try {
      this.playSweep(110, 80, 0.6, 'sawtooth', 0.25);
      setTimeout(() => this.playSweep(110, 80, 0.6, 'sawtooth', 0.2), 300);
    } catch {
      // 忽略
    }
  }

  /** 漏怪警报：高频警告 */
  playLeak(): void {
    if (!this.ctx) return;
    try {
      this.playTone(1200, 0.08, 'square', 0.2);
      setTimeout(() => this.playTone(1200, 0.08, 'square', 0.2), 120);
    } catch {
      // 忽略
    }
  }

  /** 通关：胜利和弦 */
  playWin(): void {
    if (!this.ctx) return;
    try {
      // C-E-G-C 上行琶音
      this.playTone(523, 0.2, 'square', 0.2); // C5
      setTimeout(() => this.playTone(659, 0.2, 'square', 0.2), 120); // E5
      setTimeout(() => this.playTone(784, 0.2, 'square', 0.2), 240); // G5
      setTimeout(() => this.playTone(1047, 0.4, 'square', 0.22), 360); // C6
    } catch {
      // 忽略
    }
  }

  /** 失败：低沉下降 */
  playLose(): void {
    if (!this.ctx) return;
    try {
      this.playSweep(330, 80, 0.8, 'sawtooth', 0.25);
      setTimeout(() => this.playSweep(220, 60, 0.8, 'sawtooth', 0.2), 200);
    } catch {
      // 忽略
    }
  }

  /** 金币：清脆短音 */
  playCoin(): void {
    if (!this.ctx) return;
    try {
      this.playTone(988, 0.05, 'square', 0.15); // B5
      setTimeout(() => this.playTone(1319, 0.08, 'square', 0.15), 40); // E6
    } catch {
      // 忽略
    }
  }

  /** 通用技能：扫频 */
  playSkill(): void {
    if (!this.ctx) return;
    try {
      this.playSweep(220, 1760, 0.4, 'sawtooth', 0.2);
      this.playSweep(440, 2640, 0.4, 'square', 0.12);
    } catch {
      // 忽略
    }
  }

  /** 神力一击：爆炸式快速下降 */
  playSkillBlast(): void {
    if (!this.ctx) return;
    try {
      this.playSweep(880, 110, 0.35, 'sawtooth', 0.25);
      this.playNoise(0.3, 0.18, 1200);
    } catch {
      // 忽略
    }
  }

  /** 全屏减速：冰冷下降 */
  playSkillSlow(): void {
    if (!this.ctx) return;
    try {
      this.playSweep(1320, 330, 0.5, 'sine', 0.2);
      this.playNoise(0.4, 0.1, 600);
    } catch {
      // 忽略
    }
  }

  /** 召唤支援：上扬号角 */
  playSkillSummon(): void {
    if (!this.ctx) return;
    try {
      this.playTone(523, 0.2, 'square', 0.18);
      setTimeout(() => this.playTone(784, 0.25, 'square', 0.2), 120);
      setTimeout(() => this.playTone(1047, 0.35, 'square', 0.22), 240);
    } catch {
      // 忽略
    }
  }

  /** 暴击：清脆高亮 + 噪声 */
  playCrit(): void {
    if (!this.ctx) return;
    try {
      this.playTone(1760, 0.08, 'square', 0.18);
      this.playTone(2093, 0.12, 'square', 0.16);
      this.playNoise(0.08, 0.08, 3000);
    } catch {
      // 忽略
    }
  }

  /** 合成成功：魔法上升琶音 */
  playCombine(): void {
    if (!this.ctx) return;
    try {
      this.playTone(659, 0.12, 'sine', 0.18);
      setTimeout(() => this.playTone(988, 0.12, 'sine', 0.18), 80);
      setTimeout(() => this.playTone(1319, 0.2, 'sine', 0.2), 160);
      this.playSweep(880, 1760, 0.3, 'sine', 0.1);
    } catch {
      // 忽略
    }
  }
}

// 单例导出
export const audio = new GameAudio();
export type { GameAudio };
