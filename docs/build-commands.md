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

## 本地预览生产产物

```bash
pnpm preview
```

- 将 `dist/` 交给任意静态服务器（Nginx / Caddy / Vercel / Netlify）即可部署。
- 对 `/404.html`：多数平台会自动用于未匹配路由；若需自定义 `404`，新建 `src/pages/404.astro`。

## 性能与优化的注意点

- **KaTeX 在 build stage 全程渲染**，产物 HTML 为最终渲染结果，无客户端 JS。
- 全部代码高亮（Shiki）均为构建时生成，产物无 `shiki` 运行时脚本。
- 生产构建总 JS（除必需 inline 脚本外）= 0 bytes。
- 自定义字体会增加首次可见延迟，可考虑预加载本地子集化字体；若追求极致，可移除自定义字体并退回系统字体。

## 常见命令速查

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 本地开发服务器 |
| `pnpm build` | 生产构建（产出 `dist/`） |
| `pnpm preview` | 本地预览构建产物 |
| `pnpm astro --help` | Astro CLI 帮助 |
