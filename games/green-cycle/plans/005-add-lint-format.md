# Plan 005: 引入 ESLint + Prettier 并开启未使用代码检查

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bc95bc..HEAD -- package.json tsconfig.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 004（测试基线建立后再开 lint，避免一次性暴露过多问题）
- **Category**: dx
- **Planned at**: commit `7bc95bc`, 2026-06-20

## Why this matters

项目无 lint/format 工具，`tsconfig.json` 关闭了 `noUnusedLocals` 和 `noUnusedParameters`，导致 dead code（如 Plan 003 中的 `hpMul`）堆积无告警。引入轻量 lint + format 工具链，并逐步开启未使用检查，能在后续迭代中及早发现死代码和风格漂移，降低 AI/人工优化的可靠性风险。

## Current state

`package.json:6-17` — 无 lint/format 脚本和依赖：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vite-plugin-singlefile": "^2.0.0"
  }
}
```

`tsconfig.json:14-15` — 未使用检查被关闭：

```json
    "noUnusedLocals": false,
    "noUnusedParameters": false,
```

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Install   | `npm install`          | exit 0              |
| Typecheck | `npm run typecheck`    | exit 0              |
| Lint      | `npm run lint`         | exit 0              |
| Format    | `npm run format`       | exit 0              |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope**:
- `package.json` — 新增 lint/format 脚本和依赖
- `tsconfig.json` — 开启 noUnusedLocals/noUnusedParameters
- `eslint.config.js`（新建）— ESLint 配置（flat config 格式，已通过 `ignores` 处理忽略规则，无需 `.eslintignore`）
- `.prettierrc`（新建）— Prettier 配置

**Out of scope**:
- 任何 `src/` 下源码的逻辑修改（lint 报错应通过删除死代码或添加忽略注释解决，不改变运行逻辑）
- 测试文件（已在 Plan 004 创建）

## Steps

### Step 1: 安装 ESLint + Prettier

```bash
npm install -D eslint @eslint/js @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier eslint-config-prettier
```

**Verify**: `npx eslint --version` → 输出版本号

### Step 2: 创建 ESLint 配置

创建 `eslint.config.js`（ESM 格式，匹配项目 `"type": "module"`）：

```js
import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': ts },
    rules: {
      ...ts.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'plans/'],
  },
  prettier,
];
```

注意：如果上述 ESM flat config 格式与安装的 ESLint 版本不兼容，改用 `.eslintrc.cjs` 传统格式。以 `npx eslint src/` 能运行为准。

**Verify**: `npx eslint src/` → 输出告警/错误列表（首次运行可能有 warning，这是预期的）

### Step 3: 创建 Prettier 配置

创建 `.prettierrc`：

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Verify**: `npx prettier --check src/` → 输出格式不一致的文件列表

### Step 4: 在 package.json 新增脚本

在 `scripts` 中新增：

```json
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write 'src/**/*.ts' '*.json' '*.js' '*.ts'",
    "format:check": "prettier --check 'src/**/*.ts' '*.json' '*.js' '*.ts'"
```

**Verify**: `npm run lint` → exit 0 或仅有 warning

### Step 5: 清理 lint 报告的未使用变量

运行 `npm run lint`，对于每个 `@typescript-eslint/no-unused-vars` 告警（注意：核心 `no-unused-vars` 已关闭，告警来自 `@typescript-eslint/no-unused-vars`）：
- 如果变量确实未使用（如已被 Plan 003 清理的 `hpMul`），删除该变量声明。
- 如果是函数参数未使用但需要保留签名，加 `_` 前缀（如 `_dt`）。
- 如果是暂时保留的占位，加 `// eslint-disable-next-line` 注释。

**不要**修改运行逻辑——只删死代码或加忽略注释。

**Verify**: `npm run lint` → exit 0（无 error，warning 可接受但应尽量消除）

### Step 6: 开启 tsconfig 未使用检查

打开 `tsconfig.json`，将：

```json
    "noUnusedLocals": false,
    "noUnusedParameters": false,
```

改为：

```json
    "noUnusedLocals": true,
    "noUnusedParameters": true,
```

如果 typecheck 报错，按 Step 5 的策略修复（删死代码或加 `_` 前缀）。

**Verify**: `npm run typecheck` → exit 0

### Step 7: 格式化全项目

```bash
npm run format
```

**Verify**: `npm run format:check` → exit 0（所有文件格式一致）

### Step 8: 全量验证

**Verify**:
- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `npm test` → all pass
- `npm run build` → exit 0

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run format:check` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `tsconfig.json` 中 `noUnusedLocals` 和 `noUnusedParameters` 为 `true`
- [ ] `package.json` 有 `lint`/`lint:fix`/`format`/`format:check` 脚本
- [ ] `eslint.config.js` 和 `.prettierrc` 存在
- [ ] No runtime logic changes in `src/`（`git diff` 应只显示删除死代码、加 `_` 前缀、格式调整）
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- ESLint flat config 格式与安装版本不兼容，且传统 `.eslintrc.cjs` 格式也无法工作。
- 开启 `noUnusedLocals` 后出现大量（>20）报错，说明项目有大量死代码——先报告数量，不要逐个删除（可能需要单独的清理计划）。
- `npm run format` 改动了大量文件的逻辑（而非仅格式）——Prettier 不应改变逻辑，如果发生说明配置有误。

## Maintenance notes

- ESLint 配置初始较宽松（`no-explicit-any: off`），后续可逐步收紧。
- Prettier 格式化可能产生大量 diff，建议在一个独立 commit 中完成格式化，与逻辑修改分开。
- 后续可考虑加 `eslint-plugin-import` 检查循环依赖，但本计划不涉及。
- 如果项目后续迁移到 Biome（更快的单工具替代），可删除 ESLint + Prettier 配置，但脚本名保持不变。
