---
name: "game-asset-svg"
description: "Generate 64x64 / 32x32 pixel-art SVG game assets for the green-cycle tower defense project. Invoke when user requests a new sprite, tower icon, buff icon, or asks to expand the assets/ library. Enforces orthographic top-down view, 4px grid, flat solid colors, no gradients."
---

# Game Asset SVG Generator

为塔防游戏《绿色循环圈》生成像素风 SVG 素材。严格遵守项目既有设计语言（详见 `references/style-spec.md`），并使用 AI 生图 → SVG 复刻的混合工作流。

## 何时调用

- 用户说"生成 XXX 塔的图标"、"做一个 XXX 精灵"等
- 用户列出多个素材清单需要批量产出
- 用户要求补齐 `docs/prompts/ui-assets.md` 中 33 个素材的剩余部分

## 严格约束（违反任何一条都视为不合格）

| 项 | 约束 |
|---|---|
| viewBox | `64 64`（塔/瓦片）或 `32 32`（图标） |
| 视角 | **orthographic top-down**（正上方俯视）— 严禁 45° 倾斜 |
| 网格 | 4px 整数倍（64×64 = 16×16 网格，32×32 = 8×8 网格） |
| 颜色 | solid color only，**严禁 gradient / filter / shadow** |
| 抗锯齿 | `shape-rendering="crispEdges"` 必加 |
| 背景 | 透明 alpha channel |
| 形状 | flat shapes，无抗锯齿，无圆角（或极小） |
| 调色板 | 4~8 种颜色，高对比 |
| 构图 | 主体居中，占画布 70%~80%，四周留安全边 |
| 命名 | `tower_<id>.svg` / `icon_<type>.svg` / `tile_<type>.svg` |
| 落点 | `games/green-cycle/assets/{towers,icons,tiles}/` |

**参考实现**：[`assets/towers/tower_arrow.svg`](file:///Users/doer/dev/yoo/games/green-cycle/assets/towers/tower_arrow.svg) — 校准风格用的"金本位"范例。

## 工作流

### 步骤 1 — 解析需求

从用户输入提取：
- `category`：tower / icon / tile
- `name`：文件 id（如 `corrosive`、`tianshen`）
- `theme`：主题描述（如 "acid poison tower with corroded metal"）
- `palette`：颜色清单（用户给 / 从主题色板库取）
- `size`：64（默认）或 32

### 步骤 2 — 构造 text_to_image prompt

参考 `references/prompt-library.md` 中的模板，构造英文 prompt：
```
SVG pixel art game asset, {theme}, top-down orthographic view,
{solid colors clause}, flat shapes, no gradients, no anti-aliasing,
{size}x{size} viewBox, transparent background,
isolated on alpha channel --no text shadow ground perspective 45-degree
```

### 步骤 3 — 生成参考 PNG

调用 `scripts/gen-ref.sh`：
```bash
bash scripts/gen-ref.sh "{prompt}" {size} assets/{category}/{name}.ref.png
```

API 端点（来自 IDE 规范）：
```
https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt={url-encoded-prompt}&image_size=square
```

### 步骤 4 — 把参考图交给使用方

> **关键**：本 skill 的使用方应当具备视觉能力（能看 PNG）。
> 视觉模型根据 PNG 还原 SVG；纯文本模型无法进行此步骤。

把 PNG 路径和约束规范（本文档的"严格约束"表格）一并提供给使用方。

### 步骤 5 — 编写 SVG

按以下结构组装（每塔 4~6 层，自下而上）：

```
<svg viewBox="0 0 64 64" xmlns="..." shape-rendering="crispEdges">
  <defs/>                        <!-- 通常不需要，禁渐变 -->
  <!-- L1. 底座/地面投影 -->
  <g id="base"> ... </g>
  <!-- L2. 主体/躯干 -->
  <g id="body"> ... </g>
  <!-- L3. 特征/炮口/武器 -->
  <g id="feature"> ... </g>
  <!-- L4. 顶部 motif（halo/crystal/cannon barrel） -->
  <g id="top"> ... </g>
  <!-- L5. 装饰细节（受击高光/小标识） -->
  <g id="detail"> ... </g>
</svg>
```

颜色用法：每个 `<rect fill="#XXX">` 用纯 hex，**禁止 `fill="url(#...)"` 引用任何 gradient**。

### 步骤 6 — 渲染预览

调用 `scripts/svg-to-png.sh` 转 64×64 PNG，给使用方核对：
```bash
bash scripts/svg-to-png.sh assets/{category}/{name}.svg /tmp/preview.png 64
```

如果 `rsvg-convert` / `magick` 都不可用，跳过此步，直接交付 SVG 路径（使用方可在 IDE 中直接预览 SVG）。

### 步骤 7 — 提交

告知使用方：
- SVG 绝对路径
- PNG 参考图绝对路径
- 简短设计说明（用了什么主题元素、什么颜色）
- 等待确认 / 反馈

## 参考资源

| 文档 | 用途 |
|---|---|
| `references/style-spec.md` | 详细设计规范（颜色、网格、安全边） |
| `references/prompt-library.md` | 33 个素材的 prompt 模板（搬运自 `docs/prompts/ui-assets.md`） |
| `references/category-skeletons.md` | tower / icon / tile 的图层骨架与坐标分配 |
| `assets/towers/tower_arrow.svg` | 风格金本位（必须以此为模板） |

## 失败 / 兜底

- **API 失败**：跳过 PNG 参考，直接写 SVG（按 prompt 描述 + 风格规范手工设计）
- **PNG 转不出**：交付 SVG 即可，使用方 IDE 可预览
- **视觉模型对结构有疑问**：回看 `tower_arrow.svg` 校准
