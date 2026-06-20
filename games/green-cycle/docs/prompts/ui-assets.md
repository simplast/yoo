# UI 素材生成提示词

> 复制各提示词发给图像生成 AI（Midjourney / DALL-E / Flux / SD 等），按下方规格产出。
> 生成后将文件放入 `assets/` 目录，后续由代码接入精灵图渲染。

## 通用产出规格

所有素材必须满足以下要求：

- **格式**：SVG（矢量），纯色块 + 简单几何形，无渐变、无滤镜
- **尺寸**：viewBox 64×64（塔）/ 32×32（图标）
- **风格**：像素风（pixel art），扁平色块，无抗锯齿，无圆角（或极小圆角）
- **视角**：**正交俯视**（正上方往下看，orthographic top-down），**不使用 45° 倾斜**
- **背景**：纯透明，无地面投影、无环境光、无文字
- **构图**：主体居中，占画布 70%~80%，四周留出安全边
- **调色板**：每图 4~8 种颜色，高对比，小尺寸仍能辨识
- **命名约定**：`tower_<id>.svg` / `icon_<type>.svg`

---

## 一、塔图标（64×64 SVG）

### 基础攻击塔

**1. 箭塔（arrow）**
```
SVG pixel art game asset, arrow tower, wooden bow turret on a small stone base, top-down orthographic view, brown and tan solid colors, flat shapes, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

**2. 破坏塔（cannon）**
```
SVG pixel art game asset, heavy cannon tower, dark gray metal barrel on a sturdy base, top-down orthographic view, industrial fantasy, flat solid colors, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

**3. 群攻塔（splash）**
```
SVG pixel art game asset, mortar bomb tower, orange and bronze cannon with explosive barrel, short wide shape, top-down orthographic view, flat solid colors, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

**4. 混乱塔（chaos）**
```
SVG pixel art game asset, chaos magic tower, purple crystalline spire with glowing violet core, top-down orthographic view, mystical fantasy, flat solid colors, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

**5. 闪电塔（lightning）**
```
SVG pixel art game asset, lightning tower, yellow crystal rod with electric arcs, bright yellow and dark blue contrast, top-down orthographic view, flat solid colors, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

---

### 辅助塔

**6. 冰霜塔（frost）**
```
SVG pixel art game asset, ice frost tower, blue ice shard crystal on a frozen base, cold mist motif, top-down orthographic view, cyan and white solid colors, flat shapes, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

**7. 腐蚀塔（corrosive）**
```
SVG pixel art game asset, acid poison tower, green toxic blob cannon with corroded metal, bubbling acid, top-down orthographic view, lime green and dark gray solid colors, flat shapes, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

---

### 光环塔

**8. 加速光环（auraHaste）**
```
SVG pixel art game asset, speed aura tower, golden clock or wind symbol on a small pedestal, radiating speed lines, top-down orthographic view, orange and yellow solid colors, flat shapes, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

**9. 加攻光环（auraDamage）**
```
SVG pixel art game asset, power aura tower, red flaming sword or crossed swords on a pedestal, attack boost motif, top-down orthographic view, red and orange solid colors, flat shapes, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

**10. 减速光环（auraSlow）**
```
SVG pixel art game asset, slow aura tower, blue snowflake or hourglass on a frozen pedestal, chilling aura motif, top-down orthographic view, blue and cyan solid colors, flat shapes, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

---

### 成长塔

**11. 天神（tianshen）**
```
SVG pixel art game asset, holy angel tower, golden winged figure with halo and divine sword, top-down orthographic view, white and gold solid colors, flat shapes, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

**12. 剑圣（jianfa）**
```
SVG pixel art game asset, blade master tower, silver samurai-style warrior with katana, top-down orthographic view, gray and red solid colors, flat shapes, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

**13. 电法（dianfa）**
```
SVG pixel art game asset, lightning mage tower, robed spellcaster with electric orb, casting lightning, top-down orthographic view, cyan and purple solid colors, flat shapes, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

---

### 控制塔

**14. 眩晕塔（stun）**
```
SVG pixel art game asset, stun tower, yellow lightning hammer or shock orb, daze stars motif, top-down orthographic view, yellow and black solid colors, flat shapes, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

**15. 冰冻塔（freeze）**
```
SVG pixel art game asset, freeze tower, cyan ice crystal launcher with snow particles, freezing beam motif, top-down orthographic view, cyan and white solid colors, flat shapes, no gradients, no anti-aliasing, 64x64 viewBox, transparent background, isolated on alpha channel --no text shadow ground perspective 45-degree
```

---

## 二、UI / Buff 图标（32×32 SVG）

**16. 减速图标（slow）**
```
SVG pixel art UI icon, blue downward arrow, slow debuff symbol, top-down orthographic view, 32x32 viewBox, solid blue and dark blue, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**17. 加速图标（haste）**
```
SVG pixel art UI icon, yellow upward arrow with speed lines, haste buff symbol, 32x32 viewBox, solid yellow and orange, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**18. 破甲图标（armorBreak）**
```
SVG pixel art UI icon, green cracked shield, armor break debuff symbol, 32x32 viewBox, solid green and dark green, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**19. 眩晕图标（stun）**
```
SVG pixel art UI icon, yellow spinning stars around head, stun debuff symbol, 32x32 viewBox, solid yellow and black, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**20. 冰冻图标（freeze）**
```
SVG pixel art UI icon, cyan snowflake, freeze debuff symbol, 32x32 viewBox, solid cyan and white, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**21. 中毒图标（poison）**
```
SVG pixel art UI icon, green skull and crossbones with bubbles, poison debuff symbol, 32x32 viewBox, solid green and dark green, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

---

## 三、技能图标（32×32 SVG）

**22. 审判之光（judge）**
```
SVG pixel art UI icon, golden holy beam descending from above, divine judgement skill, 32x32 viewBox, solid gold and white, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**23. 剑刃风暴（bladeStorm）**
```
SVG pixel art UI icon, spinning silver blades in a circular vortex, blade storm skill, 32x32 viewBox, solid silver and gray, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**24. 闪电链（chainLightning）**
```
SVG pixel art UI icon, zigzag lightning bolt chaining between points, chain lightning skill, 32x32 viewBox, solid cyan and yellow, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**25. 雷暴（thunderStorm）**
```
SVG pixel art UI icon, multiple lightning bolts striking from a storm cloud, thunder storm skill, 32x32 viewBox, solid cyan and dark blue, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**26. 圣盾（holyShield）**
```
SVG pixel art UI icon, golden shield with divine glow, holy shield passive skill, 32x32 viewBox, solid gold and white, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**27. 致命一击（criticalStrike）**
```
SVG pixel art UI icon, red exclamation mark on a blade, critical strike passive skill, 32x32 viewBox, solid red and dark gray, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

---

## 四、全局技能图标（32×32 SVG）

**28. 神力一击（blast）**
```
SVG pixel art UI icon, giant fist or hammer striking down, divine blast global skill, 32x32 viewBox, solid gold and orange, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**29. 全屏减速（slowGlobal）**
```
SVG pixel art UI icon, hourglass with frost effect, global slow skill, 32x32 viewBox, solid blue and cyan, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

**30. 召唤支援（summon）**
```
SVG pixel art UI icon, portal or summoning circle with figure emerging, summon support skill, 32x32 viewBox, solid purple and gold, flat shapes, no gradients, no anti-aliasing, transparent background, isolated on alpha channel --no text shadow perspective
```

---

## 五、网格/地面瓦片（64×64 SVG）

**31. 建造格子（可建造）**
```
SVG pixel art tile, green grass square with subtle grid lines, buildable cell, top-down orthographic view, 64x64 viewBox, solid green shades, flat shapes, no gradients, no anti-aliasing, seamless tile, transparent background, isolated on alpha channel --no text shadow perspective
```

**32. 建造格子（不可建造）**
```
SVG pixel art tile, dark gray rocky square with cracks, unbuildable cell, top-down orthographic view, 64x64 viewBox, solid gray shades, flat shapes, no gradients, no anti-aliasing, seamless tile, transparent background, isolated on alpha channel --no text shadow perspective
```

**33. 路径瓦片**
```
SVG pixel art tile, tan dirt path square, road tile, top-down orthographic view, 64x64 viewBox, solid tan and brown, flat shapes, no gradients, no anti-aliasing, seamless tile, transparent background, isolated on alpha channel --no text shadow perspective
```

---

## 六、目标文件清单

| # | 文件名 | 尺寸 | 用途 |
|---|--------|------|------|
| 1 | `tower_arrow.svg` | 64×64 | 箭塔 |
| 2 | `tower_cannon.svg` | 64×64 | 破坏塔 |
| 3 | `tower_splash.svg` | 64×64 | 群攻塔 |
| 4 | `tower_chaos.svg` | 64×64 | 混乱塔 |
| 5 | `tower_lightning.svg` | 64×64 | 闪电塔 |
| 6 | `tower_frost.svg` | 64×64 | 冰霜塔 |
| 7 | `tower_corrosive.svg` | 64×64 | 腐蚀塔 |
| 8 | `tower_auraHaste.svg` | 64×64 | 加速光环 |
| 9 | `tower_auraDamage.svg` | 64×64 | 加攻光环 |
| 10 | `tower_auraSlow.svg` | 64×64 | 减速光环 |
| 11 | `tower_tianshen.svg` | 64×64 | 天神 |
| 12 | `tower_jianfa.svg` | 64×64 | 剑圣 |
| 13 | `tower_dianfa.svg` | 64×64 | 电法 |
| 14 | `tower_stun.svg` | 64×64 | 眩晕塔 |
| 15 | `tower_freeze.svg` | 64×64 | 冰冻塔 |
| 16 | `icon_slow.svg` | 32×32 | 减速 buff |
| 17 | `icon_haste.svg` | 32×32 | 加速 buff |
| 18 | `icon_armorBreak.svg` | 32×32 | 破甲 debuff |
| 19 | `icon_stun.svg` | 32×32 | 眩晕 debuff |
| 20 | `icon_freeze.svg` | 32×32 | 冰冻 debuff |
| 21 | `icon_poison.svg` | 32×32 | 中毒 debuff |
| 22 | `icon_judge.svg` | 32×32 | 审判之光 |
| 23 | `icon_bladeStorm.svg` | 32×32 | 剑刃风暴 |
| 24 | `icon_chainLightning.svg` | 32×32 | 闪电链 |
| 25 | `icon_thunderStorm.svg` | 32×32 | 雷暴 |
| 26 | `icon_holyShield.svg` | 32×32 | 圣盾 |
| 27 | `icon_criticalStrike.svg` | 32×32 | 致命一击 |
| 28 | `icon_blast.svg` | 32×32 | 神力一击 |
| 29 | `icon_slowGlobal.svg` | 32×32 | 全屏减速 |
| 30 | `icon_summon.svg` | 32×32 | 召唤支援 |
| 31 | `tile_buildable.svg` | 64×64 | 可建造格子 |
| 32 | `tile_blocked.svg` | 64×64 | 不可建造格子 |
| 33 | `tile_path.svg` | 64×64 | 路径瓦片 |

## 七、产出入库路径

生成后，将文件放入以下目录：

```
games/green-cycle/assets/
├── towers/          # 塔图标（1-15）
├── icons/           # buff/技能图标（16-30）
└── tiles/           # 地面瓦片（31-33）
```

后续我会将 `PixelArt.ts` 中的程序化绘制改为加载这些 SVG 精灵，并完成游戏内集成。