// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // 纯静态输出，无服务端渲染
  output: 'static',
  // 站点 URL：GitHub Pages 个人主页
  site: 'https://AliceNewton67.github.io',
  markdown: {
    // 统一的 Markdown/MDX 处理器（Astro 7 推荐用法，替代已废弃的
    // markdown.remarkPlugins / markdown.rehypePlugins / markdown.gfm）
    processor: unified({
      // 数学公式：remark-math 解析 $...$ / $$...$$，rehype-katex 在构建阶段完成渲染
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
      // GFM：表格、删除线、任务列表等
      gfm: true,
    }),
    // 语法高亮：使用 Shiki（构建时渲染，不注入任何客户端脚本）
    syntaxHighlight: 'shiki',
    shikiConfig: {
      theme: 'github-dark',
      langs: [],
    },
  },
  integrations: [mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // 临时绕行：Vite 8 的 SSR module runner 会把 CJS-only 的 picomatch@4
    // 当 ESM 加载（require is not defined），导致 astro sync/build 直接失败。
    // 指向 ESM 包装层后恢复正常。详见 docs/build-commands.md。
    resolve: {
      alias: {
        picomatch: fileURLToPath(new URL('./scripts/picomatch-esm.mjs', import.meta.url)),
      },
    },
  },
});
