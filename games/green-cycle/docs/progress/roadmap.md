# 下阶段开发计划

> 本文档规划《绿色循环圈》M7-M9 阶段的任务。
> 开发时请遵守 [关键契约](#关键契约) 一节。

## 里程碑路线图

| 阶段 | 名称 | 优先级 | 依赖 |
|------|------|--------|------|
| M6 | 辅助/光环/控制塔 | 高 | 无 |
| M7 | 合成系统 | 中 | 无 |
| M8 | 存档与难度 | 中 | 无 |
| M9 | 音效/UI/性能 | 低 | M6-M8 |

---

## M6：辅助/光环/控制塔

### 目标
完善辅助塔的 debuff 机制，扩展光环系统支持友方加成可视化，新增控制塔。

### 任务清单
- [x] **冰霜塔 debuff 叠加**：减速效果支持持续叠加
- [x] **腐蚀塔减甲叠加**：减甲效果支持层数叠加
- [x] **光环系统扩展**：新增友方光环加成可视化
- [x] **新增控制塔**：眩晕塔、冰冻塔
  - 数据在 `data/towers.ts` 新增塔定义
  - Buff 类型 `stun`/`freeze` 已在 `types.ts` 中存在

### 涉及文件
- `systems/AuraSystem.ts` — 扩展友方光环
- `systems/MovementSystem.ts` — 处理眩晕/冰冻时停止移动
- `data/towers.ts` — 新增控制塔定义
- `types.ts` — 新增 `debuff` / `debuffDuration` 字段（只增不改）

---

## M7：合成系统

### 目标
实现多塔合成，玩家选中多座塔按配方合成更高级塔。

### 任务清单
- [ ] **合成 UI**：多塔选中交互（框选/Shift 多选）、配方提示、合成确认
- [ ] **合成逻辑**：校验配方、消耗材料塔、生成产物塔、返还差价
- [ ] **配方数据**：`data/recipes.ts` 已有 3 配方，需确认数据完整性

### 涉及文件
- `game/Game.ts` — 合成交互处理
- `data/recipes.ts` — 配方数据（已存在）
- `index.html` — 合成 UI 元素

---

## M8：存档与难度

### 目标
实现本地存档，支持难度解锁、无尽模式、排行榜。

### 任务清单
- [ ] **存档读写**：`utils/SaveManager.ts` 已有框架，需实现 localStorage 读写
- [ ] **难度解锁**：通关后解锁更高难度
- [ ] **无尽模式**：`config.ts` 已有无尽模式常量，需实现 50 波后无限刷怪逻辑
- [ ] **排行榜**：记录历史最高分（PF 分/波次/难度）

### 涉及文件
- `utils/SaveManager.ts` — 存档读写（已存在框架）
- `game/Game.ts` — 存档触发点（胜利/失败时）
- `config.ts` — 难度/无尽模式常量（已存在）

---

## M9：音效/UI/性能

### 目标
打磨音效细节、美化 UI、优化性能。

### 任务清单
- [ ] **音效细化**：为技能释放、暴击、合成、Boss 出场等添加专属音效
- [ ] **UI 美化**：塔面板、技能图标、波次提示动画
- [ ] **Quadtree 索敌优化**：`utils/Quadtree.ts` 已实现但 `TowerAISystem` 未接入，需替换线性遍历
- [ ] **离屏 canvas 缓存**：地图静态层用离屏 canvas 缓存，减少每帧重绘

### 涉及文件
- `audio/Audio.ts` — 音效扩展
- `render/` — UI 美化
- `systems/TowerAISystem.ts` — 接入 Quadtree
- `render/MapRenderer.ts` — 离屏缓存

---

## 关键契约

> 以下契约为各阶段开发必须遵守的接口约定，违反将破坏现有系统。

### 系统签名
- 所有系统：`update(state: GameState, dt: number): void`
- 即时命中：`CombatSystem.applyDamage(state, enemy, damage, attackType, sourceTowerId)`
- 技能被动：`SkillSystem.applyPassiveOnAttack(tower, damage)` → `{damage, isCrit}`
- 技能主动：`SkillSystem.update` 自动释放，无需手动调用

### 成长塔技能 API
- `learnSkill(t, skillId)` — 学习/升级技能（消耗技能点）
- `canLearnSkill(t, skillId)` — 检查是否可学习（属性要求/技能点/等级上限）
- `getSkillLevel(t, skillId)` — 获取技能当前等级（0=未学）
- `HERO_SKILLS[towerId]` — 查询成长塔可学技能列表

### 实体工厂
- `createEnemy` / `createTower` / `createHeroTower` / `createProjectile` / `createXxxEffect`

### 状态机
- phase：`menu | ready | battling | paused | won | lost`

### 塔属性获取
- 普通塔：`getTowerStat(t)`
- 成长塔：`getHeroStat(t)`

### 类型扩展原则
- **不要修改** `types.ts`/`config.ts` 的现有字段定义，只增不改
