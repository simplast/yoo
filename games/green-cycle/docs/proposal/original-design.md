# 绿色循环圈 — 原始设计文档

> 本文档为项目初始设计稿的归档存档，记录了 M0-M5 阶段的完整设计与实现总结。
> 后续开发以 [docs/progress/](../progress/) 下的文档为准。

## 项目位置
`/Users/doer/dev/yoo/public/games/green-cycle/`

## 已完成内容（M0-M5）

塔防游戏《绿色循环圈》，HTML5 Canvas 2D + TypeScript + Vite，单文件构建产物。

### 技术架构
- **ECS-lite**：集中式 `GameState` + 8 个纯函数系统（`update(state, dt)`）
- **固定步长主循环**：60FPS，支持 1x/2x/3x 加速
- **单文件产物**：`vite build` 输出 `dist/index.html`（79KB，JS/CSS 全内联）

### 目录结构
```
src/
├── config.ts          # 全局常量
├── types.ts           # 类型契约（所有模块共享）
├── main.ts            # 入口，绑定 UI
├── game/
│   ├── State.ts       # 集中式状态（实体集合/资源/波次/技能CD）
│   ├── Game.ts        # 主控：状态机/系统调度/输入/UI同步
│   └── Loop.ts        # requestAnimationFrame 固定步长循环
├── entities/          # 实体工厂（Enemy/Tower/HeroTower/Projectile/Effect）
├── systems/           # 8系统（Wave/Movement/TowerAI/Combat/Aura/Economy/Effect/Skill）
├── render/            # 像素风渲染（Renderer/Map/Entity/UI/PixelArt）
├── data/              # 数据表（13塔/15敌人/50波/护甲表/配方/技能）
├── utils/             # Path循环路径/Pool对象池/Quadtree/MathUtil/SaveManager
├── audio/Audio.ts     # Web Audio 8-bit 程序化音效
└── input/InputManager.ts  # 鼠标/触摸/键盘 + 坐标变换
```

### 已实现机制
- 循环圈路径（外圈+内圈+连接道闭合循环，敌人无限跑动）
- 50 波次（5 Boss 波 + 1 经济波），波次倒计时/空格立即召唤
- 护甲克制（5 攻击 × 4 护甲伤害系数表）
- 塔建造/升级/出售，5 种索敌策略（最近/最前/最强/最弱/优先）
- 成长塔（经验/属性点/技能点，30 级，前 5 级数据 + 外推公式）
- **成长塔技能系统（M5）**：3 座成长塔 6 技能全部实装
  - 主动技能自动释放：审判之光（单体神圣）、剑刃风暴（范围普通）、闪电链（连锁魔法）、雷暴（范围魔法+眩晕）
  - 被动技能：圣盾（附加神圣伤害）、致命一击（25% 暴击）
  - 技能树 UI + 属性加点 UI + 经验条
- 光环塔（敌方减速/加速，友方攻速/攻击加成）
- 全局技能（神力一击/全屏减速/召唤支援，各自 CD）
- 漏怪上限失败、Boss 限时、PF 完美分、压力条警报
- 像素风程序生成精灵（无图片资源）、8-bit 音效

### 验证状态
- `tsc --noEmit`：零错误
- `vite build`：成功，`dist/index.html` 单文件
- dev 服务器：`cd green-cycle && npx vite`，端口 5173

## 下阶段任务（M6-M9 完整版）

- **M6 辅助/光环/控制塔**：完善冰霜/腐蚀塔的 debuff 持续叠加，光环塔友方加成可视化，新增控制塔（眩晕/冰冻）。`systems/AuraSystem.ts` 目前只处理敌方光环，需扩展。
- **M7 合成系统**：实现 `data/recipes.ts` 的配方合成 UI 和逻辑（选中多塔合成）。数据已有 3 配方，需实现合成交互。
- **M8 存档与难度**：实现 `utils/SaveManager.ts` 的存档读写（难度解锁/无尽模式/排行榜），`config.ts` 已有无尽模式常量。
- **M9 音效/UI/性能**：音效细化、UI 美化、Quadtree 索敌优化（`utils/Quadtree.ts` 已实现但 `TowerAISystem` 未接入）、离屏 canvas 缓存地图。

### 关键契约（下阶段开发需遵守）
- 系统签名：`update(state: GameState, dt: number): void`，`CombatSystem.applyDamage(state, enemy, damage, attackType, sourceTowerId)` 供即时命中调用
- 技能系统：`SkillSystem.applyPassiveOnAttack(tower, damage)` 供 TowerAISystem 调用返回 `{damage, isCrit}`；`SkillSystem.update` 自动释放主动技能
- 成长塔技能：`learnSkill(t, skillId)` / `canLearnSkill(t, skillId)` / `getSkillLevel(t, skillId)`，`HERO_SKILLS[towerId]` 查可学技能
- 实体工厂：`createEnemy/createTower/createHeroTower/createProjectile/createXxxEffect`
- 状态机 phase：`menu | ready | battling | paused | won | lost`
- 塔属性获取：普通塔 `getTowerStat(t)`，成长塔 `getHeroStat(t)`
- 不要修改 `types.ts`/`config.ts` 的现有字段定义，只增不改
