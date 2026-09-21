---
title: "本站源码结构梳理：每个文件在做什么"
date: 2026-09-16
description: "Ecliptic Event 博客自身的源码导览：Astro 7 静态站点的目录结构、构建链路、内容管线与部署流程。写给自己备忘。"
tags:
  - Astro
  - 博客
  - 备忘
draft: false
section: cs
mathEnabled: false
---

这篇文章梳理本站（Ecliptic Event）自己的源码结构，写给自己备忘：每个目录/文件是干什么的、数据如何流动、改哪里会影响什么。架构一句话概括：**Astro 7 纯静态站点 + Content Layer 内容集合 + Tailwind v4 + GitHub Pages Actions 部署，运行时零 JS。**

## 顶层结构

```text
ecliptic-event/
├── astro.config.mjs          # 站点构建配置（核心）
├── package.json              # 依赖与脚本，Node >= 22.12
├── content.config.ts         # 内容集合 schema 定义
├── pnpm-lock.yaml / .npmrc   # pnpm 锁定与注册表配置
├── public/                   # 原样拷贝的静态资源（favicon）
├── .github/workflows/        # CI/CD（GitHub Pages 部署）
├── docs/                     # 本机使用文档（非站点内容）
└── src/                      # 全部源码
```

## 配置层：两个决定一切的文件

### `astro.config.mjs`

所有构建行为的源头：

- `output: 'static'`——纯 SSG，无服务端，构建产物是 `dist/` 下的一堆 HTML；
- `site: 'https://AliceNewton67.github.io'`——GitHub Pages 地址，canonical / OG / sitemap 都基于它生成；
- `markdown.processor: unified({...})`——Astro 7 的新写法（替代已废弃的 `markdown.remarkPlugins`）。挂了 `remark-math` + `rehype-katex`（数学公式在**构建期**渲染成 HTML，不注入 KaTeX 脚本）和 GFM（表格/删除线/任务列表）；
- `syntaxHighlight: 'shiki'`——代码高亮也是构建期完成，主题 `github-dark`，零运行时；
- `integrations: [mdx(), sitemap()]`——支持 `.mdx` 文章，构建时产出 `sitemap-index.xml`；
- `vite.plugins: [tailwindcss()]`——Tailwind v4 以 Vite 插件接入（v4 没有 tailwind.config.js，全在 CSS 里）。

### `content.config.ts`

内容集合的 schema，用 zod 定义 `posts` 集合：

- loader 是 `glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' })`——Content Layer API，`src/content/posts/` 下的 md/mdx 自动成为文章；
- 字段：`title`（必填）、`date`（自动转 Date）、`section`（分区，取值 `cs` / `math` / `game`，默认 `cs`）、`tags`（默认空）、`draft`（默认 false，**生产构建会过滤 draft: true 的文章**）、`mathEnabled`（数学公式开关标记）、`description`（首页列表摘要）。

**改 frontmatter 字段时必须同步改这里**，否则构建报 schema 校验错误。

## `src/` 目录

```text
src/
├── config/sections.ts        # 分区定义（label / 描述 / 图标），全站分区唯一来源
├── content/posts/            # 文章本体（md / mdx）
├── content.config.ts         # schema（见上）
├── pages/                    # 路由 = 文件结构
│   ├── index.astro           # 首页：按分区展示的文章总览
│   ├── section/[section].astro # 分区列表页（/section/cs|math|game/）
│   └── posts/[...slug].astro # 文章详情页模板（动态路由）
├── layouts/
│   ├── BaseLayout.astro      # 真正在用的布局：<head> 全家桶 + 主题切换
│   └── Layout.astro          # 模板自带的空壳，实际已闲置
├── components/               # PostCard（卡片）、SectionNav（分区导航）
├── styles/global.css         # Tailwind v4 主题 + 全部自定义样式
└── assets/                   # 文章引用的图片（构建时优化）
```

### `src/config/sections.ts` —— 分区定义

一个数组就是全部真相：`{ key, label, labelEn, description, rune }`。它同时驱动
frontmatter 里 `section` 的合法取值、顶部导航、首页分区区块、分区页。

加新分区要动两处：这个文件的 `SECTIONS`，以及 `content.config.ts` 里内联的
`SECTION_KEYS`（content 配置刻意不 import 本地模块，见 `docs/build-commands.md` 的故障排查）。

### `src/pages/` —— 路由层

Astro 的约定：`pages/` 下的文件路径 = URL 路径。

**`index.astro`（首页 `/`）**：

- frontmatter 里 `getCollection('posts')` 拉全部文章，**生产环境过滤 draft**，按日期倒序，再按 `section` 分组；
- 渲染：顶部品牌行 → Hero 大标题（"Notes on C++ · Algorithms · Systems"）→ 分区索引（锚点跳转）→ 每个分区一段（标题/文章数/描述/卡片列表/"查看全部"）→ 页脚；
- 空分区照样渲染，显示占位提示——这样以后写游戏类文章不必回头改首页；
- 内嵌 JSON-LD（WebSite 类型）做 SEO。

**`section/[section].astro`（分区页 `/section/<key>/`）**：

- `getStaticPaths()` 为每个分区生成一个静态页，只列出该分区的文章；
- 头部面包屑 + 分区大标题 + 描述，底部给"其他分区"的跳转按钮；
- 空分区同样显示占位提示。

**`posts/[...slug].astro`（文章页 `/posts/<id>/`）**：

- `getStaticPaths()` 在构建期为每篇文章生成一个静态页面，slug 就是文件名（如 `p-vs-np.md` → `/posts/p-vs-np/`）；
- 同样过滤 draft、`render(post)` 把 markdown 编译成组件 `<Content />`；
- 文章页骨架：返回链接（全部 / 所属分区）→ 头部（分区 tag-pill、日期、标题、摘要、标签）→ `.prose` 正文容器 → 页脚；
- JSON-LD 用 BlogPosting 类型，canonicalPath 指向自身。

**加新文章不需要动 pages/ 任何文件**——往 `content/posts/` 扔 md、写上 `section` 即可，首页和对应分区页都会自动带上它。

### `src/layouts/` —— 布局层

**`BaseLayout.astro`**（所有页面都用它）是全站最重的文件，职责：

- `<head>` 全套：title 拼接（"文章名 | Ecliptic Event"）、description、canonical、Open Graph、Twitter Card、theme-color、RSS link 声明；
- **无 FOUC 主题切换**：一小段 inline script 在 CSS 加载前同步读 `localStorage('ecliptic-theme')`，若为 light 给 `<html>` 加 `class="light"`——这是全站唯一的 JS；
- Google Fonts 引入 Inter / Noto Sans SC / JetBrains Mono；
- `jsonLd` prop 透传为 `<script type="application/ld+json">`；
- body 上挂 `min-h-dvh bg-(--color-bg)`，含"跳到正文"无障碍链接，`<slot />` 即页面内容。

Props：`title`（必填）、`description`、`canonicalPath`、`ogImage`、`jsonLd`。

模板自带的 `Layout.astro` 空壳（`<title>Astro Basics</title>`）早期已删除，`src/layouts/` 下现在只剩 `BaseLayout.astro`。

### `src/components/` —— 组件层

- `PostCard.astro`：文章卡片（日期／Vol. 编号／标题／摘要／标签），首页与分区页共用；
- `SectionNav.astro`：顶部固定分区导航，输出静态链接，再由一段极短的 inline script 按当前路径给对应项加 `aria-current="page"`。

### `src/styles/global.css` —— 样式层

Tailwind v4 是 CSS-first 配置，这个文件是设计系统的唯一来源：

- `@import "tailwindcss"` 引入框架；
- `:root` 定义**琥珀主色阶**（amber-400~700）+ **深色模式全部变量**（`--color-bg/surface/text/muted/accent/border/code-bg`）；`:root.light` 覆盖为浅色值——主题切换就是切这一个 class；
- `@theme { ... }` 把变量暴露给 Tailwind 工具类（`text-(--color-muted)` 这种语法就是从这来的），并定义 `--font-sans` / `--font-mono`；
- 自定义组件类：`.article-card`（卡片，带左侧琥珀色 hover 条）、`.tag-pill`、`.brand-row` / `.brand-dot`、`.card-meta`、`.section-nav` / `.section-nav-link`（分区导航）、`.section-block` / `.section-head-divider`（首页分区区块）；
- `.prose` 正文排版容器：标题/段落/列表/blockquote/表格/代码/图片/HR 的全套样式，文章内容全靠它渲染；
- `.katex` 颜色适配主题变量。

**调站点外观基本只改这个文件。**

### `src/content/posts/` —— 内容层

目前四篇：计算机区 `fibonacci-tmp.mdx`（MDX 示例，含代码高亮和公式）、`iwyu-vs-include-cleaner.md`、`site-architecture.md`（本篇），数学区 `p-vs-np.md`。

frontmatter 模板：

```yaml
---
title: "标题"
date: 2026-09-16
description: "首页列表显示的摘要"
section: cs          # cs / math / game，见 src/config/sections.ts
tags: [C++, 算法]
draft: false        # true = 生产构建隐藏
mathEnabled: false  # 用到 $...$ 公式时设 true
---
```

## 数据流（一篇文章的一生）

```text
src/content/posts/x.md
  → content.config.ts schema 校验
  → posts/[...slug].astro 的 getStaticPaths() 拿到 post
  → render(post) 编译 markdown
      （remark-math → rehype-katex → shiki → GFM）
  → BaseLayout 包上 <head>/SEO/主题
  → dist/posts/x/index.html   纯静态 HTML，零 JS
  → push main → Actions 构建 → GitHub Pages 上线
```

## 部署：`.github/workflows/deploy.yml`

push 到 `main`（或手动触发）后：

1. setup pnpm 11 + Node 22（带 pnpm 缓存）；
2. `pnpm install --frozen-lockfile` → `pnpm build`；
3. 上传 `dist/` 为 Pages artifact → `deploy-pages@v4` 部署。

`concurrency: pages` 保证同一时间只有一个部署，新推送会取消进行中的旧部署。

## 本地命令

```sh
pnpm dev       # 开发服务器 localhost:4321（draft 文章也显示）
pnpm build     # 生产构建到 dist/（过滤 draft）
pnpm preview   # 本地预览构建产物（push 前确认用）
```

## 常见改动速查

| 想做什么 | 改哪里 |
|---|---|
| 写新文章 | `src/content/posts/` 新建 md，frontmatter 按 schema（含 `section`） |
| 加一个新分区 | `src/config/sections.ts` + `src/content.config.ts` 的 `SECTION_KEYS` |
| 调配色/字体/暗色 | `src/styles/global.css` 的 `:root` / `:root.light` / `@theme` |
| 改首页版式 | `src/pages/index.astro` |
| 改分区页版式 | `src/pages/section/[section].astro` |
| 改文章卡片 | `src/components/PostCard.astro` |
| 改分区导航 | `src/components/SectionNav.astro` |
| 改文章页版式 | `src/pages/posts/[...slug].astro` |
| 改 `<head>`/SEO/主题脚本 | `src/layouts/BaseLayout.astro` |
| 加/改 frontmatter 字段 | `src/content.config.ts` |
| 换 markdown/公式/高亮行为 | `astro.config.mjs` |
| 文章配图 | `src/assets/`（构建时优化），md 里相对路径引用 |

## 待清理项

- `docs/`（katex-check、deploy-github-pages 等本机文档）不参与构建，是运维备忘。
- `scripts/picomatch-esm.mjs` 与 `astro.config.mjs` 里的 `picomatch` alias 是 Vite 8 的临时绕行，上游修好后可删（见 `docs/build-commands.md`）。
