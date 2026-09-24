# 构建与开发命令说明

本项目使用 **pnpm** 作为包管理器。

## 环境要求

- Node.js >= 22.12.0（必须满足 `package.json` 中 `engines` 声明）
- pnpm（推荐与 `devEngines.packageManager` 一致的版本）

## 安装依赖

```bash
cd ecliptic-event
pnpm install
```

## 本地开发

```bash
pnpm dev
```

- 默认地址：`http://localhost:4321`
- 本地默认展示 `draft: true` 的文章，方便预览未发布内容。
- 修改配置或内容通常在毫秒级内热更新。

## 生产构建

```bash
pnpm build
```

- 输出目录：`dist/`（纯静态站点，SSG）。
- 构建时排除 `draft: true` 的文章。
- **验收要求**：构建输出**零 error、零 warning**。
- 若目标平台需要前置路径（subpath），请先在 `astro.config.mjs` 中配置 `base`。

## 分区（sections）

站点按分区组织，分区定义集中在 `src/config/sections.ts`，同时决定：

- frontmatter 里 `section` 字段的合法取值（见 `src/content.config.ts` 的 `SECTION_KEYS`，两处必须一致）
- 顶部导航、首页分区区块、分区页 `/section/<key>/`
- 分类列表页由 `src/pages/section/[section].astro` 静态生成，每个分区一个页面

新增一个分区（例如以后想拆出「物理」）：

1. 在 `src/config/sections.ts` 的 `SECTIONS` 里加一项 `{ key, label, labelEn, description, rune }`；
2. 在 `src/content.config.ts` 的 `SECTION_KEYS` 里加上同一个 `key`；
3. 文章 frontmatter 写 `section: <key>` 即可，首页与分区页自动出现（无文章时显示占位提示）。

## 本地预览生产产物

```bash
pnpm preview
```

- 将 `dist/` 交给任意静态服务器（Nginx / Caddy / Vercel / Netlify）即可部署。
- 对 `/404.html`：多数平台会自动用于未匹配路由；若需自定义 `404`，新建 `src/pages/404.astro`。

## 新增一篇文章：从 md 到上线

**页面是自动的。** `src/pages/index.astro`（首页分区总览）与
`src/pages/section/[section].astro`（分区页）都在构建时遍历内容集合，
所以新增文章**不需要改任何页面文件**——往 `src/content/posts/` 里放一个
`.md`（或 `.mdx`）就够了，首页、分区页、导航、sitemap 都会自动带上它。

### 完整流程

```bash
cd ecliptic-event

# 1. 写文章
#    src/content/posts/你的文章.md

# 2. 本地构建，提前发现 frontmatter / 语法错误（可跳过，但推荐）
pnpm build

# 3. 提交源码 —— 这一步最容易被漏掉
git add src/content/posts/你的文章.md
#    文中有插图时，插图也要一起加：
# git add src/assets/你的图.svg
git commit -m "feat(posts): 新增《标题》"

# 4. 推送：这才是触发部署的动作
git push origin main

# 5. 看 CI（约 1–3 分钟）
#    https://github.com/AliceNewton67/AliceNewton67.github.io/actions
```

**`pnpm build` 不上传任何东西。** 它只生成 `dist/`，而 `dist/` 在 `.gitignore` 里、
仓库中没有任何 dist 文件被跟踪。上线完全由 CI 完成：

```text
push main  →  Actions: pnpm install --frozen-lockfile
                        pnpm build
                        upload dist/  →  deploy-pages
```

**服务器用的是你 push 的源码，自己重新构建**，与本地 `dist/` 无关。
所以 `git add` 只需要加源码（md、插图、配置），永远不用管 `dist/`。

### frontmatter 规则

只有 `title` 和 `date` 没有默认值，其余全有：

| 字段 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | ✅ | — | 文章标题 |
| `date` | ✅ | — | `YYYY-MM-DD`，决定排序 |
| `section` | | `cs` | `cs` / `math` / `game`，取值见上节 |
| `tags` | | `[]` | 首页与文章页的标签胶囊 |
| `draft` | | `false` | `true` 时**生产构建会排除** |
| `mathEnabled` | | `false` | 目前只是标记字段，没有代码读它 |
| `description` | | — | 首页/分区页卡片上的摘要 |

最小可用：

```markdown
---
title: "标题"
date: 2026-09-22
description: "首页列表和分区页显示的摘要"
section: cs
tags:
  - C++
draft: true
---

正文。
```

### 几条容易踩的规则

- **文件名就是 URL**：`foo-bar.md` → `/posts/foo-bar/`。发布后改文件名等于换地址，
  旧链接 404。第一次就用 kebab-case 定好。
- **图片放 `src/assets/`**，md 里用**相对路径**引用：
  `![说明](../../assets/你的图.svg)`。构建时会做资源优化并改写为带内容哈希的 URL。
  放 `public/` 则是原样拷贝、不走优化（适合 favicon 这类固定路径文件）。
- **公式不需要开关**：KaTeX 在 `astro.config.mjs` 里全局接好了（`remark-math` +
  `rehype-katex`），正文直接写 `$...$` / `$$...$$` 即可。`mathEnabled` 不控制任何行为。
- **`draft` 默认 `false`，即"新建一个 md 就是发布"**。想先私下写，显式写
  `draft: true`：生产构建过滤它，但 `pnpm dev` 本地仍能看到。
- **新文件是 untracked，`git commit -a` 不会带上它**。漏加的症状很迷惑：
  CI 构建成功、本地 `dist/` 里也有这篇文章，线上却没有。`git status` 里看到
  `??` 就是它。

### 构建后自查（不起服务器）

`dist/` 是纯静态 HTML，可以直接查文件确认：

```bash
# 文章是否生成
ls dist/posts/你的文章/index.html

# 分区页是否带上它
grep -c "你的标题" dist/section/cs/index.html
```

线上生效后若浏览器还是旧版，Ctrl+F5 硬刷（GitHub Pages 有 `cache-control: max-age=600`）。

## 性能与优化的注意点

- **KaTeX 在 build stage 全程渲染**，产物 HTML 为最终渲染结果，无客户端 JS。
- 全部代码高亮（Shiki）均为构建时生成，产物无 `shiki` 运行时脚本。
- 运行时 JS 只有两段极短的 inline script：主题切换（无 FOUC）与分区导航高亮（`aria-current`）。
- 自定义字体会增加首次可见延迟，可考虑预加载本地子集化字体；若追求极致，可移除自定义字体并退回系统字体。

## 故障排查

### `GenerateContentTypesError: require is not defined`

完整报错形如：

```
[GenerateContentTypesError] `astro sync` command failed to generate content collection types: require is not defined.
  ... at eval (.../picomatch@4.0.5/node_modules/picomatch/index.js:6:14)
```

原因：`picomatch@4` 只提供 CJS 入口（`package.json` 里没有 `exports` 字段），
而 Vite 8 的 SSR module runner 在 Node ≥ 22.12 下会带 `module-sync` 条件把它当 ESM 加载，
里面的 `require()` 直接抛错。与本站内容无关，是工具链版本组合问题。

处理：`astro.config.mjs` 里已加一条 alias，把 `picomatch` 指向 `scripts/picomatch-esm.mjs`
（用 `createRequire` 加载真正的 CJS 实现再补导出）。**不要删这段 alias**，否则 build 立刻失败。
上游修掉 Vite 8 / picomatch 4 的解析问题后可移除。

### `spawn EPERM`（esbuild 启动辅助进程被拒）

出现在受限/沙箱环境下运行构建时：esbuild 需要启动子进程并通过管道通信，被安全策略拒绝。
在有完整权限的终端里运行 `pnpm build` 即可，与代码无关。

## 常见命令速查

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 本地开发服务器 |
| `pnpm build` | 生产构建（产出 `dist/`） |
| `pnpm preview` | 本地预览构建产物 |
| `pnpm astro --help` | Astro CLI 帮助 |
| `git push origin main` | 触发 CI 构建与 Pages 部署 |

### 本机（Windows）push 注意

若 `git push` 报 `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`，
是本机 git 用 Windows 证书库握手失败，改用 OpenSSL 后端即可：

```bash
git config --global http.sslBackend openssl   # 一次性设置，持久生效
```

该报错同样会影响 PowerShell / curl 访问 GitHub API；Node 的 `fetch` 不受影响。
