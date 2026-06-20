# Prompt 模板库

> 来源：[`docs/prompts/ui-assets.md`](file:///Users/doer/dev/yoo/games/green-cycle/docs/prompts/ui-assets.md)
> 这些 prompt 喂给 `text_to_image` API 生成 PNG 参考图，模型再据此写 SVG。

## 通用 prompt 框架

```
SVG pixel art {type}, {subject}, top-down orthographic view,
{color_clause}, flat shapes, no gradients, no anti-aliasing,
{size}x{size} viewBox, transparent background,
isolated on alpha channel --no text shadow ground perspective 45-degree
```

字段：
- `{type}`：`game asset` / `UI icon` / `tile`
- `{subject}`：素材主体描述（见下表）
- `{color_clause}`：`{color1} and {color2} solid colors`（主题色 + 辅色）
- `{size}`：`64` / `32`

## 塔（towers, 64×64）

### 基础攻击塔

**arrow**（箭塔）
```
SVG pixel art game asset, arrow tower, wooden bow turret on a small stone base,
top-down orthographic view, brown and tan solid colors, flat shapes,
no gradients, no anti-aliasing, 64x64 viewBox, transparent background,
isolated on alpha channel --no text shadow ground perspective 45-degree
```

**cannon**（破坏塔）
```
SVG pixel art game asset, heavy cannon tower, dark gray metal barrel on a sturdy base,
top-down orthographic view, industrial fantasy, flat solid colors,
no gradients, no anti-aliasing, 64x64 viewBox, transparent background,
isolated on alpha channel --no text shadow ground perspective 45-degree
```

**splash**（群攻塔）
```
SVG pixel art game asset, mortar bomb tower, orange and bronze cannon with explosive barrel,
short wide shape, top-down orthographic view, flat solid colors,
no gradients, no anti-aliasing, 64x64 viewBox, transparent background,
isolated on alpha channel --no text shadow ground perspective 45-degree
```

**chaos**（混乱塔）
```
SVG pixel art game asset, chaos magic tower, purple crystalline spire with glowing violet core,
top-down orthographic view, mystical fantasy, flat solid colors,
no gradients, no anti-aliasing, 64x64 viewBox, transparent background,
isolated on alpha channel --no text shadow ground perspective 45-degree
```

**lightning**（闪电塔）
```
SVG pixel art game asset, lightning tower, yellow crystal rod with electric arcs,
bright yellow and dark blue contrast, top-down orthographic view,
flat solid colors, no gradients, no anti-aliasing, 64x64 viewBox,
transparent background, isolated on alpha channel
--no text shadow ground perspective 45-degree
```

### 辅助塔

**frost**（冰霜塔）
```
SVG pixel art game asset, ice frost tower, blue ice shard crystal on a frozen base,
cold mist motif, top-down orthographic view, cyan and white solid colors,
flat shapes, no gradients, no anti-aliasing, 64x64 viewBox,
transparent background, isolated on alpha channel
--no text shadow ground perspective 45-degree
```

**corrosive**（腐蚀塔）
```
SVG pixel art game asset, acid poison tower, green toxic blob cannon with corroded metal,
bubbling acid, top-down orthographic view, lime green and dark gray solid colors,
flat shapes, no gradients, no anti-aliasing, 64x64 viewBox,
transparent background, isolated on alpha channel
--no text shadow ground perspective 45-degree
```

### 光环塔

**auraHaste**（加速光环）
```
SVG pixel art game asset, speed aura tower, golden clock or wind symbol on a small pedestal,
radiating speed lines, top-down orthographic view, orange and yellow solid colors,
flat shapes, no gradients, no anti-aliasing, 64x64 viewBox,
transparent background, isolated on alpha channel
--no text shadow ground perspective 45-degree
```

**auraDamage**（加攻光环）
```
SVG pixel art game asset, power aura tower, red flaming sword or crossed swords on a pedestal,
attack boost motif, top-down orthographic view, red and orange solid colors,
flat shapes, no gradients, no anti-aliasing, 64x64 viewBox,
transparent background, isolated on alpha channel
--no text shadow ground perspective 45-degree
```

**auraSlow**（减速光环）
```
SVG pixel art game asset, slow aura tower, blue snowflake or hourglass on a frozen pedestal,
chilling aura motif, top-down orthographic view, blue and cyan solid colors,
flat shapes, no gradients, no anti-aliasing, 64x64 viewBox,
transparent background, isolated on alpha channel
--no text shadow ground perspective 45-degree
```

### 成长塔

**tianshen**（天神）
```
SVG pixel art game asset, holy angel tower, golden winged figure with halo and divine sword,
top-down orthographic view, white and gold solid colors, flat shapes,
no gradients, no anti-aliasing, 64x64 viewBox, transparent background,
isolated on alpha channel --no text shadow ground perspective 45-degree
```

**jianfa**（剑圣）
```
SVG pixel art game asset, blade master tower, silver samurai-style warrior with katana,
top-down orthographic view, gray and red solid colors, flat shapes,
no gradients, no anti-aliasing, 64x64 viewBox, transparent background,
isolated on alpha channel --no text shadow ground perspective 45-degree
```

**dianfa**（电法）
```
SVG pixel art game asset, lightning mage tower, robed spellcaster with electric orb,
casting lightning, top-down orthographic view, cyan and purple solid colors,
flat shapes, no gradients, no anti-aliasing, 64x64 viewBox,
transparent background, isolated on alpha channel
--no text shadow ground perspective 45-degree
```

### 控制塔

**stun**（眩晕塔）
```
SVG pixel art game asset, stun tower, yellow lightning hammer or shock orb,
daze stars motif, top-down orthographic view, yellow and black solid colors,
flat shapes, no gradients, no anti-aliasing, 64x64 viewBox,
transparent background, isolated on alpha channel
--no text shadow ground perspective 45-degree
```

**freeze**（冰冻塔）
```
SVG pixel art game asset, freeze tower, cyan ice crystal launcher with snow particles,
freezing beam motif, top-down orthographic view, cyan and white solid colors,
flat shapes, no gradients, no anti-aliasing, 64x64 viewBox,
transparent background, isolated on alpha channel
--no text shadow ground perspective 45-degree
```

## 图标（icons, 32×32）

### Buff / Debuff 图标

**icon_slow**（减速）
```
SVG pixel art UI icon, blue downward arrow, slow debuff symbol,
top-down orthographic view, 32x32 viewBox, solid blue and dark blue,
flat shapes, no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_haste**（加速）
```
SVG pixel art UI icon, yellow upward arrow with speed lines, haste buff symbol,
32x32 viewBox, solid yellow and orange, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_armorBreak**（破甲）
```
SVG pixel art UI icon, green cracked shield, armor break debuff symbol,
32x32 viewBox, solid green and dark green, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_stun**（眩晕）
```
SVG pixel art UI icon, yellow spinning stars around head, stun debuff symbol,
32x32 viewBox, solid yellow and black, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_freeze**（冰冻）
```
SVG pixel art UI icon, cyan snowflake, freeze debuff symbol,
32x32 viewBox, solid cyan and white, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_poison**（中毒）
```
SVG pixel art UI icon, green skull and crossbones with bubbles, poison debuff symbol,
32x32 viewBox, solid green and dark green, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

### 技能图标

**icon_judge**（审判之光）
```
SVG pixel art UI icon, golden holy beam descending from above, divine judgement skill,
32x32 viewBox, solid gold and white, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_bladeStorm**（剑刃风暴）
```
SVG pixel art UI icon, spinning silver blades in a circular vortex, blade storm skill,
32x32 viewBox, solid silver and gray, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_chainLightning**（闪电链）
```
SVG pixel art UI icon, zigzag lightning bolt chaining between points, chain lightning skill,
32x32 viewBox, solid cyan and yellow, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_thunderStorm**（雷暴）
```
SVG pixel art UI icon, multiple lightning bolts striking from a storm cloud, thunder storm skill,
32x32 viewBox, solid cyan and dark blue, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_holyShield**（圣盾）
```
SVG pixel art UI icon, golden shield with divine glow, holy shield passive skill,
32x32 viewBox, solid gold and white, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_criticalStrike**（致命一击）
```
SVG pixel art UI icon, red exclamation mark on a blade, critical strike passive skill,
32x32 viewBox, solid red and dark gray, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

### 全局技能图标

**icon_blast**（神力一击）
```
SVG pixel art UI icon, giant fist or hammer striking down, divine blast global skill,
32x32 viewBox, solid gold and orange, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_slowGlobal**（全屏减速）
```
SVG pixel art UI icon, hourglass with frost effect, global slow skill,
32x32 viewBox, solid blue and cyan, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

**icon_summon**（召唤支援）
```
SVG pixel art UI icon, portal or summoning circle with figure emerging, summon support skill,
32x32 viewBox, solid purple and gold, flat shapes,
no gradients, no anti-aliasing, transparent background,
isolated on alpha channel --no text shadow perspective
```

## 瓦片（tiles, 64×64）

**tile_buildable**（可建造格子）
```
SVG pixel art tile, green grass square with subtle grid lines, buildable cell,
top-down orthographic view, 64x64 viewBox, solid green shades,
flat shapes, no gradients, no anti-aliasing, seamless tile,
transparent background, isolated on alpha channel
--no text shadow perspective
```

**tile_blocked**（不可建造格子）
```
SVG pixel art tile, dark gray rocky square with cracks, unbuildable cell,
top-down orthographic view, 64x64 viewBox, solid gray shades,
flat shapes, no gradients, no anti-aliasing, seamless tile,
transparent background, isolated on alpha channel
--no text shadow perspective
```

**tile_path**（路径瓦片）
```
SVG pixel art tile, tan dirt path square, road tile,
top-down orthographic view, 64x64 viewBox, solid tan and brown,
flat shapes, no gradients, no anti-aliasing, seamless tile,
transparent background, isolated on alpha channel
--no text shadow perspective
```

## 完整清单（33 个）

| # | 文件 | 类别 | 尺寸 | 状态 |
|---|---|---|---|---|
| 1 | `tower_arrow.svg` | tower | 64 | ✅ 已生成 |
| 2 | `tower_cannon.svg` | tower | 64 | ⬜ |
| 3 | `tower_splash.svg` | tower | 64 | ⬜ |
| 4 | `tower_chaos.svg` | tower | 64 | ⬜ |
| 5 | `tower_lightning.svg` | tower | 64 | ⬜ |
| 6 | `tower_frost.svg` | tower | 64 | ⬜ |
| 7 | `tower_corrosive.svg` | tower | 64 | ⬜ |
| 8 | `tower_auraHaste.svg` | tower | 64 | ⬜ |
| 9 | `tower_auraDamage.svg` | tower | 64 | ⬜ |
| 10 | `tower_auraSlow.svg` | tower | 64 | ⬜ |
| 11 | `tower_tianshen.svg` | tower | 64 | ⬜ |
| 12 | `tower_jianfa.svg` | tower | 64 | ⬜ |
| 13 | `tower_dianfa.svg` | tower | 64 | ⬜ |
| 14 | `tower_stun.svg` | tower | 64 | ⬜ |
| 15 | `tower_freeze.svg` | tower | 64 | ⬜ |
| 16 | `icon_slow.svg` | icon | 32 | ⬜ |
| 17 | `icon_haste.svg` | icon | 32 | ⬜ |
| 18 | `icon_armorBreak.svg` | icon | 32 | ⬜ |
| 19 | `icon_stun.svg` | icon | 32 | ⬜ |
| 20 | `icon_freeze.svg` | icon | 32 | ⬜ |
| 21 | `icon_poison.svg` | icon | 32 | ⬜ |
| 22 | `icon_judge.svg` | icon | 32 | ⬜ |
| 23 | `icon_bladeStorm.svg` | icon | 32 | ⬜ |
| 24 | `icon_chainLightning.svg` | icon | 32 | ⬜ |
| 25 | `icon_thunderStorm.svg` | icon | 32 | ⬜ |
| 26 | `icon_holyShield.svg` | icon | 32 | ⬜ |
| 27 | `icon_criticalStrike.svg` | icon | 32 | ⬜ |
| 28 | `icon_blast.svg` | icon | 32 | ⬜ |
| 29 | `icon_slowGlobal.svg` | icon | 32 | ⬜ |
| 30 | `icon_summon.svg` | icon | 32 | ⬜ |
| 31 | `tile_buildable.svg` | tile | 64 | ⬜ |
| 32 | `tile_blocked.svg` | tile | 64 | ⬜ |
| 33 | `tile_path.svg` | tile | 64 | ⬜ |
