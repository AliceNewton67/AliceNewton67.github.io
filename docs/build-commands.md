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
