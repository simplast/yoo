# Three.js 渲染层级（renderOrder）踩坑记录

## 核心概念：不透明 pass vs 透明 pass

Three.js 的 WebGLRenderer 渲染分**两遍**执行：

```
不透明 pass (opaque pass)  →  透明 pass (transparent pass)
```

**分类规则**：材质 `transparent: true` 进透明 pass，反之进不透明 pass。

| 材质类型 | `transparent` | 所属 pass | 排序方式 |
|---------|--------------|----------|---------|
| `MeshStandardMaterial` | 默认 `false` | 不透明 | renderOrder → 近到远 |
| `MeshBasicMaterial` | 设置 `true` | 透明 | renderOrder → 远到近 |
| `MeshStandardMaterial` + `transparent: true` | 强制 | 透明 | renderOrder → 远到近 |

---

## 坑 1：renderOrder 在不同 pass 之间无效

**问题**：想让桌面圆环（renderOrder=-999）渲染在卡牌（renderOrder=0）下方。

**错误做法**：只设置了不同的 renderOrder，但卡牌在不透明 pass、圆环在透明 pass。

```typescript
// 圆环 - 透明 material
const rimMaterial = new THREE.MeshBasicMaterial({
  color: 'rgba(91,141,239,0.25)',
  transparent: true,  // ← 进透明 pass
  depthTest: false, depthWrite: false,
});
rim.renderOrder = -999;

// 卡牌 - 不透明 material
const cardMaterial = new THREE.MeshStandardMaterial({
  map: texture,
  depthTest: false, depthWrite: false,
  // transparent: false ← 默认，进不透明 pass
});
cardMesh.renderOrder = 0; // ← 不透明 pass 中最高的 renderOrder
```

**结果**：透明 pass 永远在不透明 pass 之后执行，所以圆环总会盖在卡牌上，renderOrder 完全没用。

**正确做法**：统一放入同一个 pass。

```typescript
const cardMaterial = new THREE.MeshStandardMaterial({
  transparent: true,  // ← 加入透明 pass
  depthTest: false, depthWrite: false,
});
```

---

## 坑 2：depthTest=false 不能替代 transparent=true

`depthTest: false` 只关闭深度缓冲区测试，不改变对象进入哪个 pass。一个 `depthTest: false` 的不透明材质仍然在不透明 pass 中渲染，仍会被透明 pass 覆盖。

---

## 坑 3：depthTest 与 renderOrder 的排序规则不同

打开 `depthTest: true`（默认）时，Three.js 按 **z 深度** 排序渲染（近到远）。此时 `renderOrder` 只在相同 depthTest 的对象之间起作用，且只是次要排序键。

**手牌叠放**靠 `renderOrder = index` 实现左低右高，这要求所有卡牌材质都是 `depthTest: false`。

```typescript
// Scene.ts - layoutHumanHand
mesh.renderOrder = index;  // 左侧 0, 右侧 N
```

如果改成了 `depthTest: true`，renderOrder 失效，牌会按 z 坐标排叠放顺序，视觉效果混乱。

---

## 正确配置速查

| 场景 | `transparent` | `depthTest` | `depthWrite` | `renderOrder` |
|------|:---:|:---:|:---:|:---:|
| 桌面主体 | `false` | `true` | `true` | 很低（如 -999） |
| 桌面装饰（圆环等） | `true` | `false` | `false` | 很低（如 -998） |
| 桌面装饰（网格） | `true` | `false` | `false` | 很低（如 -997） |
| 中央出牌区 | `true` | `false` | `false` | 0（默认） |
| 手牌（左→右） | `true` | `false` | `false` | 0, 1, 2, ... N |
| HUD 2D 元素 | — | — | — | N/A（DOM，在 canvas 上方） |

---

## 关键原则

1. **所有需要 renderOrder 排序的对象，必须统一在同一个 pass 内。**
2. **透明 pass 中，低 renderOrder 先渲染（在下方），高 renderOrder 后渲染（在上方）。**
3. **要用 renderOrder 控制层级 → 关闭 depthTest。**
4. **MeshStandardMaterial 默认不透明 → 需要手动设置 `transparent: true` 才能进透明 pass。**

---

## 实际案例：手牌叠放失效

起因：重构 CardMesh 时删了 `depthTest: false, depthWrite: false`，改成默认的 `depthTest: true`。

现象：手牌从左到右层级错乱，右边的牌不一定在左边的牌上面。

原因：renderOrder 只在不透明 pass 中起作用，但 depthTest 开启后 Three.js 先按 z 深度排序，renderOrder 变成次要排序键。手牌在同一平面上（y≈0.48），z 深度差异很小，导致排序不稳定。

修复：恢复 `depthTest: false, depthWrite: false`。
