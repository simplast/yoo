# 已完成功能清单

> 本文档跟踪《绿色循环圈》已完成的功能里程碑。
> 最后更新：M9 阶段完成

## 里程碑总览

| 阶段 | 名称 | 状态 |
|------|------|------|
| M0-M4 | MVP 核心玩法 | ✅ 完成 |
| M5 | 成长塔技能系统 | ✅ 完成 |
| M6 | 辅助/光环/控制塔 | ✅ 完成 |
| M7 | 合成系统 | ✅ 完成 |
| M8 | 存档与难度 | ✅ 完成 |
| M9 | 音效/UI/性能 | ✅ 完成 |

---

## M0-M4：MVP 核心玩法

### 技术架构
- **ECS-lite 架构**：集中式 `GameState` + 纯函数系统（`update(state, dt)`）
- **固定步长主循环**：60FPS，支持 1x/2x/3x 加速
- **单文件产物**：`vite build` 输出 `dist/index.html`（JS/CSS 全内联）

### 核心系统（8 个）
| 系统 | 文件 | 职责 |
|------|------|------|
| WaveSystem | `systems/WaveSystem.ts` | 波次调度、敌人生成队列 |
| MovementSystem | `systems/MovementSystem.ts` | 敌人沿路径移动、buff/减速计算 |
| TowerAISystem | `systems/TowerAISystem.ts` | 塔索敌、投射物生成、即时命中、被动技能集成 |
| CombatSystem | `systems/CombatSystem.ts` | 伤害计算（护甲克制）、投射物命中、死亡奖励 |
| AuraSystem | `systems/AuraSystem.ts` | 敌方光环（减速/加速） |
| EconomySystem | `systems/EconomySystem.ts` | 技能 CD、全局减速、压力、失败/Boss 超时判定 |
| EffectSystem | `systems/EffectSystem.ts` | 伤害飘字、粒子特效更新 |
| SkillSystem | `systems/SkillSystem.ts` | 成长塔技能 CD、主动技能自动释放、被动应用 |

### 已实现机制
- **循环圈路径**：外圈+内圈+连接道闭合循环，敌人无限跑动
- **50 波次**：5 Boss 波 + 1 经济波，波次倒计时/空格立即召唤
- **护甲克制**：5 攻击类型 × 4 护甲类型伤害系数表
- **塔系统**：建造/升级/出售，5 种索敌策略（最近/最前/最强/最弱/优先）
- **光环塔**：敌方减速/加速，友方攻速/攻击加成
- **全局技能**：神力一击/全屏减速/召唤支援，各自 CD
- **失败条件**：漏怪上限失败、Boss 限时、PF 完美分、压力条警报
- **视听**：像素风程序生成精灵（无图片资源）、8-bit 程序化音效

### 塔种类（13 种）
| 类别 | 塔 | 说明 |
|------|----|------|
| basic | 箭塔/破坏塔/群攻塔/混乱塔/闪电塔 | 基础攻击塔 |
| support | 冰霜塔/腐蚀塔 | 减速/减甲辅助 |
| aura | 加速光环/加攻光环/减速光环 | 范围增益/减益 |
| growth | 天神/剑圣/电法 | 成长塔，30 级 |

---

## M5：成长塔技能系统

### 新增文件
- `systems/SkillSystem.ts` — 技能 CD tick、主动技能自动释放、被动技能应用

### 修改文件
| 文件 | 改动 |
|------|------|
| `types.ts` | Tower 增 `skillLevels`/`skillCds`/`shieldBonus`；SkillDef 增 `cooldown`/`range`/`critChance`；EffectType 增 `lightning`/`shockwave` |
| `data/skills.ts` | 6 技能补全 CD/范围/暴击率数据；新增 `HERO_SKILLS` 映射表 |
| `entities/HeroTower.ts` | 新增 `learnSkill`/`canLearnSkill`/`getSkillLevel` |
| `entities/Effect.ts` | 新增闪电链/审判之光/冲击波特效工厂 |
| `systems/TowerAISystem.ts` | 集成暴击/圣盾被动，暴击伤害金色飘字 |
| `game/Game.ts` | 接入 SkillSystem；属性加点/技能学习方法；扩展 showTowerInfo |
| `index.html` | 成长塔面板：经验条/属性加点/技能树 UI + 样式 |
| `render/PixelArt.ts` | 渲染闪电锯齿线/扩散冲击波 |

### 技能实装

**主动技能（CD 就绪自动释放）：**
| 技能 | 所属塔 | 效果 | CD |
|------|--------|------|----|
| 审判之光 | 天神 | 单体神圣伤害 200~900 | 8s |
| 剑刃风暴 | 剑圣 | 范围普通伤害 150~700 | 10s |
| 闪电链 | 电法 | 连锁魔法伤害，每跳衰减 15%，3~8 跳 | 6s |
| 雷暴 | 电法 | 范围魔法伤害 300~800 + 眩晕 2s | 15s |

**被动技能：**
| 技能 | 所属塔 | 效果 |
|------|--------|------|
| 圣盾 | 天神 | 附加神圣伤害（shieldValue×0.3） |
| 致命一击 | 剑圣 | 25% 暴击率，1.5x~4.0x 倍率 |

### UI 功能
- 选中成长塔时显示：经验条、属性加点（力量/敏捷/智力 +按钮）、技能树（学习/升级按钮，显示属性需求）
- 暴击伤害金色飘字（✦ 前缀标记）

---

## M6：辅助/光环/控制塔

### 新增文件
- `src/utils/BuffUtil.ts` — 统一 buff 施加/叠加/汇总工具

### 修改文件
| 文件 | 改动 |
|------|------|
| `src/types.ts` | Projectile 增 `debuff` 字段；TowerDef 增 `debuffDuration` 字段 |
| `src/entities/Projectile.ts` | createProjectile 支持 `debuffType/debuffValue/debuffDuration` |
| `src/systems/TowerAISystem.ts` | 提取 `getHitDebuff`；即时命中与投射物均携带 debuff |
| `src/systems/CombatSystem.ts` | 伤害计算加入减甲加成（`armorBreak * 10%`）；命中时应用 debuff |
| `src/systems/MovementSystem.ts` | 已支持 `stun/freeze` 停止移动，无需改动 |
| `src/data/towers.ts` | 冰霜/腐蚀塔补 `debuffDuration`；新增眩晕塔/冰冻塔 |
| `src/render/PixelArt.ts` | 敌人头顶 debuff 小图标；友方光环覆盖的塔顶金色箭头 |
| `src/render/EntityRenderer.ts` | 计算每个塔是否处于友方光环范围并传给 drawTower |

### 机制实装
| 机制 | 说明 |
|------|------|
| 冰霜塔 | 命中施加 `slow 0.4`，持续 1.5s，多座冰霜塔减速叠加（上限 0.8 由 MovementSystem 控制） |
| 腐蚀塔 | 命中施加 `armorBreak 3`，持续 3s，多座腐蚀塔减甲叠加，每点 +10% 受到伤害 |
| 眩晕塔 | 即时命中，眩晕 1.0/1.2/1.5s，敌人完全停止移动 |
| 冰冻塔 | 投射物命中，冻结 1.5/2.0/2.5s，敌人完全停止移动 |
| 友方光环可视化 | 处于加攻/加速光环范围内的塔，顶部显示金色向上箭头 |
| 敌方 debuff 可视化 | 敌人头顶显示对应 debuff 小图标（↓ 减速/破甲、✦ 眩晕、❄ 冻结） |

### 验证状态
- `tsc --noEmit`：零错误
- `vite build`：成功，`dist/index.html` 82.32 kB（gzip 23.87 kB）

---

## M7：合成系统

### 新增文件
- `src/utils/RecipeUtil.ts` — 配方匹配、材料查找、合成执行（含差价计算）

### 修改文件
| 文件 | 改动 |
|------|------|
| `src/types.ts` | EffectType 新增 `combine` |
| `src/game/State.ts` | 新增 `selectedTowerIds` 多选列表、`selectBox` 框选矩形；`removeTower` 同步清理多选；新增 `isTowerSelected` |
| `src/input/InputManager.ts` | 新增拖拽/框选输入：`dragStartWorld`、`isDragging`、`justFinishedSelectBox`、`consumeSelectBox` |
| `src/game/Game.ts` | Shift+点击/框选多选、`combineSelected`、合成面板信息、右键清空多选 |
| `src/entities/Effect.ts` | 新增 `createCombineEffect` 合成成功特效 |
| `src/render/PixelArt.ts` | `combine` 特效按彩色粒子渲染 |
| `src/render/EntityRenderer.ts` | 多选塔青色高亮边框，主选塔保留射程圈 |
| `src/render/UIRenderer.ts` | 新增 `drawSelectBox` 半透明绿色虚线框 |
| `src/render/Renderer.ts` | 渲染链路加入 `drawSelectBox` |
| `index.html` | 新增 `#ti-combine-section` 合成面板及样式 |
| `src/main.ts` | 绑定合成 UI 元素与按钮事件 |

### 机制实装
| 机制 | 说明 |
|------|------|
| 多选交互 | Shift+点击切换单塔选择；拖拽框选批量选中；框内塔加入 `selectedTowerIds` |
| 配方匹配 | 遍历 `RECIPES`，按 `(towerId, level)` 分组计数，优先匹配数组靠前的配方 |
| 合成消耗 | 扣除材料塔，生成产物塔；净成本 = 配方金币 + 产物等级成本 - 材料累计投入；负值则返还玩家 |
| 资源/人口校验 | 金币/木材/人口空间不足时无法合成 |
| 产物位置 | 生成在第一个材料塔位置，自动继承该格子占用 |
| 合成 UI | 多选时右侧面板显示选中数量、可合成配方名称/产物/成本、合成按钮 |

### 验证状态
- `tsc --noEmit`：零错误
- `vite build`：成功，`../../public/games/green-cycle/index.html` 90.56 kB（gzip 26.09 kB）

---

## M8：存档与难度

### 新增文件
- `src/utils/SaveManager.ts` — localStorage 存档读写、版本校验、默认值合并

### 修改文件
| 文件 | 改动 |
|------|------|
| `src/config.ts` | 新增无尽模式缩放常量 `ENDLESS_HP_SCALE`/`ENDLESS_COUNT_SCALE`/`ENDLESS_REWARD_SCALE`/`ENDLESS_MAX_ENEMIES`；存档键 `SAVE_KEY` |
| `src/types.ts` | 新增 `SaveData` 类型：设置、解锁、排行榜、最佳 PF |
| `src/game/State.ts` | 新增 `endless` 标记；`initDifficulty` 支持无尽模式人口/同屏上限 |
| `src/systems/WaveSystem.ts` | 新增 `generateEndlessWave`：50 波后循环模板并随周期缩放血量/数量/奖励；胜利条件适配无尽 |
| `src/game/Game.ts` | 集成 `SaveManager`；`recordResult` 解锁下一难度/无尽模式并写入排行榜；`startGame` 支持无尽参数；游戏结束显示最佳 PF 与榜单；新增 `onShowMenu` 回调 |
| `index.html` | 菜单新增无尽模式切换按钮、排行榜区域与相关样式 |
| `src/main.ts` | 绑定无尽模式按钮；根据存档同步难度解锁与无尽开关；渲染排行榜；游戏结束回调刷新菜单 |

### 机制实装
| 机制 | 说明 |
|------|------|
| 本地存档 | 使用 `localStorage` 持久化，版本号不匹配时回退默认值 |
| 难度解锁 | 通关简单→普通→困难→无尽，依次解锁 |
| 无尽模式 | 通关困难后解锁；50 波后循环波次，每循环血量+30%、数量+20%、奖励+15% |
| 排行榜 | 记录无尽/通关分数，保留前 10 条，按分数排序 |
| 菜单同步 | 未解锁难度按钮禁用；未解锁无尽模式按钮禁用并显示“关” |

### 验证状态
- `tsc --noEmit`：零错误
- `vite build`：成功，`../../public/games/green-cycle/index.html` 95.20 kB（gzip 27.58 kB）

---

## M9：音效/UI/性能

### 修改文件
| 文件 | 改动 |
|------|------|
| `src/audio/Audio.ts` | 新增 `playSkillBlast`/`playSkillSlow`/`playSkillSummon`/`playCrit`/`playCombine` 专属音效 |
| `src/systems/TowerAISystem.ts` | 成长塔暴击时调用 `audio.playCrit()`；每帧构建敌人 Quadtree，`selectTarget` 改为范围查询 |
| `src/systems/WaveSystem.ts` | Boss 波开始时调用 `audio.playBossWarn()` |
| `src/game/Game.ts` | 三个全局技能分别播放对应音效；合成成功播放 `playCombine()`；塔面板按分类渲染图标与颜色 |
| `src/render/MapRenderer.ts` | 静态地图层（草地/跑道/出怪口）缓存到离屏 canvas，仅路径变化时重建 |
| `index.html` | 塔面板分类色/图标、技能按钮 active 缩放发光、波次横幅入场+脉冲发光动画 |

### 机制实装
| 机制 | 说明 |
|------|------|
| 专属音效 | 神力一击（爆炸下降）、全屏减速（冰冷下降）、召唤支援（上扬号角）、暴击（清脆高亮）、合成（魔法琶音）、Boss 警报（已有低沉长音） |
| Quadtree 索敌 | `TowerAISystem.update` 构建敌人四叉树，`selectTarget` 按塔射程查询，替代线性遍历 |
| 地图离屏缓存 | 静态层一次绘制到 `<canvas>`，每帧 `drawImage`；动态建造高亮仍实时绘制 |
| UI 美化 | 塔按钮左侧分类色条+图标；技能按钮悬停/激活缩放发光；波次横幅带入场缩放与发光脉冲 |

### 验证状态
- `tsc --noEmit`：零错误
- `vite build`：成功，`../../public/games/green-cycle/index.html` 99.29 kB（gzip 28.84 kB）
