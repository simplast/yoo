# Plan 004: 加 GitHub Actions CI 与 pre-commit 钩子

> **执行者须知**：按步执行，每一步都跑验证命令并确认结果再继续。若触发 "STOP 条件" 中的任何一条，立即停止并汇报，不要自行发挥。完成后请在 `plans/README.md` 更新本计划的状态行。
>
> **漂移检查（先跑）**：`git diff --stat aca6de9..HEAD -- package.json .github`
> 若上述路径有变更，对照 "Current state" 的代码片段与现行代码比较；不一致即按 STOP 处理。

## Status

- **Priority**: P2
- **Effort**: S（约 2-3 小时）
- **Risk**: LOW（纯新增基础设施，不改生产代码）
- **Depends on**: 无
- **Category**: dx
- **Planned at**: commit `aca6de9`, 2026-06-21

## Why this matters

项目目前没有 CI，测试和 lint 只能靠开发者本地跑。最近 2 个 commit（`bbe12d9` "chore: remove all old plan documents and redundant docs" 和 `aca6de9` "docs: remove redundant milestone docs and directory listings"）一次性清空了 `plans/` 目录——这种全量删除**没有任何自动化检查拦截**，意味着改完即忘。本计划加最薄一层 CI（typecheck + lint + test）和 pre-commit（lint-staged + 阻止直接 push 到 main）作为后续所有 plan 的安全网。

## Current state

**关键事实**：
- 仓库根：`/Users/doer/dev/yoo/games/green-cycle/`（注意：是 monorepo 的一个子目录，不是 git 根）
- 实际 git 根推断：`/Users/doer/dev/yoo/`（`git rev-parse` 在 `games/green-cycle/` 下工作，但 `git log` 显示这是项目历史）
- 已有 npm 脚本（`package.json`）：
  ```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write 'src/**/*.ts' '*.json' '*.js' '*.ts'",
    "format:check": "prettier --check 'src/**/*.ts' '*.json' '*.js' '*.ts'"
  }
  ```
- `package.json` 已包含 `eslint`、`prettier`、`@typescript-eslint/*`、`vitest` 全部为 devDependencies
- **无** husky / lint-staged / GitHub Actions / commitlint 任何一项
- `AGENT.md` 列出全部 npm 命令，未提 CI

**约束**：
- 这是 monorepo 的子目录，CI 工作目录需要 `defaults.run.working-directory: games/green-cycle`
- 不引入 React/Vue 等前端框架相关的 CI 模板
- 保持 `npm test` / `npm run lint` / `npm run typecheck` 全部 exit 0 作为门禁
- **注意**：当前 `npm run format:check` 在现有 `src/**/*.ts` 上有多处格式不符（prettier 会报 7 个文件）。因此本计划**不在 CI 中启用 `format:check`**，只通过 `lint-staged` 在提交前格式化新改的文件；待后续专门格式化清理后再进 CI

## Commands you will need

| 用途 | 命令 | 期望结果 |
|------|------|---------|
| 安装 | `npm install` | exit 0 |
| 类型检查 | `npm run typecheck` | exit 0 |
| 测试 | `npm test` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| husky 装钩子 | `npm run prepare` | exit 0（首次） |
| 验证 pre-commit | `git commit --allow-empty -m "test"` | 应触发 lint-staged |
| 验证 commit-msg | `git commit --allow-empty -m "bad message"` | 应被 reject（若启用 commitlint） |

## Scope

**In scope**：
- `.github/workflows/ci.yml`（新建）
- `.husky/pre-commit`（新建）
- `.husky/pre-push`（新建）
- `.husky/commit-msg`（新建，可选 — 若操作员希望启用 commitlint）
- `commitlint.config.js`（新建，可选）
- `package.json`（小改：加 `prepare` 脚本与 `lint-staged` 配置）
- `README.md` / `AGENT.md` 顶部加一个"CI 状态徽章"行（可选；若不引入徽章可跳过）

**Out of scope**：
- 改任何 `src/**` 文件
- 改任何 `tsconfig.json` / `vite.config.ts` / `eslint.config.js`
- 改 `.prettierrc` / `vitest.config.ts`
- 引入新 lint 规则或更严格的 TS 配置（属于另一个 plan）
- 引入 release / changelog / semantic-release 工具

## Git workflow

- 分支：`advisor/004-ci-and-pre-commit`
- 提交风格：
  - 第一次：`chore(ci): add GitHub Actions workflow for typecheck/lint/test`
  - 第二次：`chore(husky): add pre-commit, pre-push and commit-msg hooks`
- 不要 push 或开 PR

## Steps

### Step 1：加 GitHub Actions workflow

**A. 创建 `.github/workflows/ci.yml`**：

```yaml
name: CI

on:
  push:
    branches: [main, 'advisor/**']
  pull_request:
    branches: [main]

defaults:
  run:
    working-directory: games/green-cycle

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: games/green-cycle/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
```

> 几点：
> - `working-directory: games/green-cycle` 是关键，否则 `npm ci` 找不到 `package.json`
> - `cache-dependency-path` 必须指向 monorepo 子目录的 lockfile
> - `actions/setup-node@v4` 用 Node 20（Vite 5 + TypeScript 5.4 兼容）
> - 触发条件 `branches: [main, 'advisor/**']` 覆盖常规 push 与本批 plan 的分支
> - 加 `Build` 步骤验证 `vite-plugin-singlefile` 的 singlefile 构建仍可产物化（早期发现打包问题）
> - **未加 `Format check` 步骤**：当前仓库存在历史格式不符文件，直接启用会导致 CI 全红；先用 `lint-staged` 保证新提交格式正确
> - `timeout-minutes: 10` 防止挂死

**Verify**：
- 文件存在：`ls .github/workflows/ci.yml`
- YAML 语法检查：`npx js-yaml .github/workflows/ci.yml > /dev/null` → exit 0（如果没有 `js-yaml`，用 `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` 验证）

### Step 2：加 husky 与 lint-staged

**A. 装依赖**（按计划新增 `devDependencies`）：

```bash
npm install --save-dev husky lint-staged
```

> 这是实际修改 `package.json` 的步骤；记录到 plan 范围内。

**B. 在 `package.json` 加 `scripts.prepare`**：

```json
"scripts": {
  ...,
  "prepare": "husky || true"
}
```

`|| true` 防止 CI 环境（`npm ci`）在没有 git 的情况下失败；本地 `npm install` 会真正执行 `husky` 命令并安装 git 钩子。

**C. 在 `package.json` 加 `lint-staged` 字段**（与 scripts 同级）：

```json
"lint-staged": {
    "src/**/*.ts": [
      "prettier --write",
      "eslint --fix"
    ],
    "*.{json,md,yml,yaml}": [
      "prettier --write"
    ]
  }
```

**D. 安装 husky 钩子骨架**：

```bash
npm run prepare
```

`prepare` 脚本里的 `husky` 命令会创建 `.husky/_/` 目录并把 git 钩子指向 husky。

**E. 创建 `.husky/pre-commit`**：

```sh
npx lint-staged
```

**F. 创建 `.husky/pre-push`**（阻止直接 push 到 `main`）：

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" = "main" ]; then
  echo "Direct push to main is blocked. Please use a feature branch and open a PR."
  exit 1
fi
```

> 注意：pre-push 钩子只能阻止常规 `git push`；`git push --no-verify` 仍可绕过。彻底保护 `main` 需要在 GitHub 仓库设置里开启 branch protection rules。

**Verify**：
- `ls .husky/pre-commit` 存在
- `cat .husky/pre-commit` 内容为 `npx lint-staged`
- `ls .husky/pre-push` 存在
- `cat .husky/pre-push` 包含 `Direct push to main is blocked`
- `cat package.json | grep '"prepare"'` 存在
- `cat package.json | grep '"lint-staged"'` 存在

### Step 3：（可选）commitlint

如果项目希望 commit 风格统一，加 commitlint：

**A. 装依赖**：

```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional
```

**B. 创建 `commitlint.config.js`**：

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 72],
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'style', 'ci']],
  },
};
```

**C. 编辑 `.husky/commit-msg`**：

```sh
npx --no -- commitlint --edit "$1"
```

**Verify**：
- `cat commitlint.config.js` 内容正确
- `cat .husky/commit-msg` 内容正确
- 试 `git commit --allow-empty -m "bad message"` → 应被 reject（exit code 非 0 + 提示）

> **如果操作员不希望强制 commit 风格，跳过整个 Step 3**。本计划默认包含，但执行前与操作员确认。

### Step 4：验证 husky 已接管 git 钩子

`npm run prepare`（Step 2D）已经安装 husky 骨架；本步只做确认。

**Verify**：
- `ls -la .husky/` 至少有 `pre-commit`、`pre-push`、`_/`、可能 `commit-msg`
- `cat .git/hooks/pre-commit` 应该被 husky 接管（一般是 `husky.sh` 路径）
- `cat .git/hooks/pre-push` 应该被 husky 接管

### Step 5：端到端验证

**A. 跑 dry-run 测试**：

```bash
# 验证 CI workflow 在本地不依赖 husky
npm run typecheck && npm run lint && npm test && npm run build
```

**B. 验证 pre-commit 钩子有效**：

```bash
# 选一个现有 .ts 文件做格式扰动（这里用 src/config.ts 举例）
echo "" >> src/config.ts
git add src/config.ts
git commit -m "test(ci): verify pre-commit hook"
# 应自动跑 prettier --write + eslint --fix；commit 成功后把扰动回退
git reset --soft HEAD^
git checkout -- src/config.ts
```

> 干净路径：直接 `git commit --allow-empty -m "chore(ci): verify hooks"` 也行，只是无法验证 lint-staged 是否实际修复格式。

**Verify**：
- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `npm test` → exit 0
- `npm run build` → exit 0（生成了 `../../public/games/green-cycle/index.html`）
- pre-commit 钩子在 commit 时自动跑（看 git 输出）

### Step 6：自检并准备 push

**A. 确认工作目录干净**：

```bash
git status
```

应该只有本计划新增/修改的文件：
- `.github/workflows/ci.yml`（新增）
- `.husky/pre-commit`（新增）
- `.husky/pre-push`（新增）
- `.husky/commit-msg`（新增，若 Step 3 启用）
- `commitlint.config.js`（新增，若 Step 3 启用）
- `package.json`（新增 `prepare` 脚本 + `lint-staged` 字段 + 2-4 个 devDependencies）
- `package-lock.json`（自动更新）

**B. 跑全套最终验证**：

```bash
npm run typecheck
npm run lint
npm test
```

**Verify**：三个命令全部 exit 0。

## Test plan

本计划**无新功能测试**。但要确保：

- 现有 44 + 任何 001 阶段新增的测试全过
- 在新 commit 上跑 `npm test` 仍然 exit 0
- 跑 `npm run build` 仍然生成 `public/games/green-cycle/index.html` 单文件

## Done criteria

机器可验证，**全部**必须满足：

- [ ] `.github/workflows/ci.yml` 文件存在且 YAML 合法
- [ ] `.husky/pre-commit` 存在且内容为 `npx lint-staged`
- [ ] `.husky/pre-push` 存在且包含 `Direct push to main is blocked`
- [ ] `package.json` 包含 `prepare` 脚本与 `lint-staged` 字段
- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0
- [ ] `npm test` exit 0
- [ ] `npm run build` exit 0
- [ ] `git status` 仅显示本计划新增/修改文件
- [ ] 一次空 commit 能成功触发 pre-commit 钩子（手动验证）
- [ ] `plans/README.md` 第 004 行状态更新为 DONE

## STOP conditions

立即停下并汇报，不要自行发挥：

- "Current state" 中列出的脚本或文件名与现行不一致
- 实际 git 根不是 `/Users/doer/dev/yoo/`（当前在 `games/green-cycle/` 下 `git rev-parse --show-toplevel` 应输出 `/Users/doer/dev/yoo/`），需要重新设计 `working-directory`（参考本计划 monorepo 假设）
- `npm install` 时 husky 报"git not found"或类似 → 把 `prepare: "husky || true"` 已经覆盖；如仍失败回滚并报告
- CI workflow 推到 GitHub 后 fail → 可能是 Node 版本不匹配（先确认 20 LTS 兼容）
- 任何步骤扩展到改 `src/**` 或 `tsconfig.json` / `vite.config.ts` 等

## Maintenance notes

- 当 npm 依赖或 Node 版本升级时，更新 `.github/workflows/ci.yml` 的 `node-version` 与 `cache-dependency-path`
- `lint-staged` 当前只跑 prettier + eslint；若 002 之后 syncUI 重构引入新文件类型（如 `.vue`），要扩 pattern
- **当前 CI 未启用 `format:check`**：待对现有 7 个 prettier 格式不符文件做一次清理后，在 `.github/workflows/ci.yml` 增加 `Format check` 步骤，并在 `plans/README.md` 更新门禁矩阵
- 若未来引入 release-please / semantic-release，可把 commitlint 规则与 release pipeline 对齐
- monorepo 拆分（每个 game 独立 npm package）后，本 workflow 的 `working-directory` 要重新调整

<!-- review-passed: true, reviewer: plan-review-subagent, at: 2026-06-21T02:19:31+0800 -->
