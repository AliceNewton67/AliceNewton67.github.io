# 新机器初始化指南（换电脑 / 新同事接手）

本仓库（`ecliptic-event/`）是一个基于 **Astro + Tailwind v4 + MDX** 的零运行时静态博客。
从 GitHub 克隆后，需要在当前机器上补齐依赖才能开发和预览。

> 说明：`git clone` 只拉取源码，`node_modules/` 已被 `.gitignore` 忽略（不提交），
> 因此**每台新机器都必须重新安装依赖**，仓库不携带。

---

## 0. 前置检查

确认已安装：

- **Node.js** ≥ 22.12（`package.json` 中 `engines` 指定）：`node -v`
- **pnpm**（本仓库使用 pnpm 管理，优先与旧环境版本一致，如 11.22）：
  ```bash
  pnpm -v
  ```
  若未安装，可用 corepack 启用或全局安装：
  ```bash
  corepack enable
  # 或
  npm install -g pnpm
  ```

---

## 1. 克隆仓库

```bash
git clone https://github.com/AliceNewton67/AliceNewton67.github.io.git
cd AliceNewton67.github.io
```

> 仓库内目录结构：本项目源码位于仓库根目录（`astro.config.mjs`、`src/`、`package.json` 都在根）。

---

## 2. 安装依赖（必须执行）

```bash
pnpm install
```

### 可能遇到的问题

**忽略构建脚本（常见）**
如果你遇到类似：
```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.2
```
说明 pnpm 出于安全策略跳过了 `esbuild` 等构建脚本，需手动批准：
```bash
pnpm approve-builds   # 交互界面中勾选 esbuild
pnpm install
```

**Lockfile 不兼容**
如果 `pnpm install` 报 lockfile 或版本冲突，先确认 pnpm 版本与旧环境一致（见第 0 步），
必要时 `pnpm install --force` 重建。

---

## 3. 本地预览

开发服务器（长期运行，`Ctrl+C` 停止）：

```bash
pnpm dev
```
浏览器打开 **http://localhost:4321/** 即可实时预览（保存文件自动热更新）。

生产构建验证（零 error、零 warning）：

```bash
pnpm build
pnpm preview   # 本地预览构建产物
```

---

## 4. Git 身份配置（新机器首次）

如果新机器未配置过 Git 身份，本地提交前需设置：

```bash
git config user.name "Alice"
git config user.email "zhaoguang000311@163.com"
```

---

## 5. 日常开发循环

```
改代码 → pnpm dev 本地预览确认 → git add + git commit → 推送
```

推送由开发者在本地手动执行（本机到 github.com 网络可能受限）：

```bash
git push origin main
```

---

## 6. 常用命令速查

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖（新机器必做） |
| `pnpm dev` | 本地开发预览（http://localhost:4321） |
| `pnpm build` | 生产构建（输出 `dist/`，零 error 零警告） |
| `pnpm preview` | 本地预览生产构建产物 |
| `pnpm approve-builds` | 批准被忽略的依赖构建脚本（如 esbuild） |
| `git push origin main` | 推送并触发 GitHub Actions 自动部署 |

## 验证清单（新机器初始化完成后）

- [ ] `pnpm install` 成功，无未处理的构建脚本报错
- [ ] `pnpm dev` 能在 http://localhost:4321 打开页面（暖橙学术风首页）
- [ ] `pnpm build` 零 error、零 warning，`dist/` 已生成
- [ ] git 身份已配置，`git config user.name` / `user.email` 有值
