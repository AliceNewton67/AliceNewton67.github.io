# KaTeX 集成与样式验证清单

本文档用于在**生产构建**后验证 KaTeX 是否正确集成，以及深色/浅色模式下公式渲染是否正常、是否引发布局抖动（CLS）。

## 前置条件

- 文章 frontmatter 中 `mathEnabled: true`（示例见 `src/content/posts/fibonacci-tmp.mdx`）。
- `astro.config.mjs` 中已配置：
  ```js
  remarkPlugins: [remarkMath],
  rehypePlugins: [rehypeKatex],
  ```

## 验证步骤

### 1. 构建阶段渲染（无运行时 JS）

```bash
pnpm build
```

然后确认产物：

- 在 `dist/posts/fibonacci-tmp/index.html` 中搜索 `katex`、`katex-display`、或 `class="katex"`。
- **确认页面不含任何 KaTeX 的 `<script>` 标签**（KaTeX CSS 可被内联/打包，但不得有脚本）。
- 公式是构建期产出的 HTML 结构；页面加载后 `execCommand` / `onload` 不应重新计算公式。

> 若存在 KaTeX `<script>` 或运行时初始化代码，说明未满足零运行时原则，需要回退到当前构建配置。

### 2. 高亮验证（Shiki）

- 确认示例 `fibonacci-tmp.mdx` 中的 C++ 代码块在产物中带有 `shiki` 相关 class 与高亮颜色。
- 确认产物**不含 Shiki 的运行时脚本**（高亮应在 build 时完成）。

### 3. 深色 / 浅色模式

- 打开 `dist/posts/fibonacci-tmp/index.html`。
- 默认（无 `class="light"`）应为深色背景，公式文字为浅色（`--color-text`）。
- 在浏览器地址栏手动执行：
  ```js
  document.documentElement.classList.add('light');
  ```
  公式颜色应切换为浅色背景的深色文字，且**页面无闪烁**（无 FOUC）。

### 4. CLS（Cumulative Layout Shift）检查

- 使用 Chrome DevTools → Performance → 勾选 `Web Vitals`。
- 滚动页面使长公式出现；应为 `0` CLS 或接近 0。
- `prose blockquote`、表格、`katex-display` 均已设置 `overflow-x: auto`，长公式不应撑破容器导致排版跳动。

### 5. 最终人工目测

在浏览器中查看：

- 行内公式 `$O(n \log n)$` 是否以正常字号嵌入文本流。
- 独立公式块 `\int_0^1 x^2 \, dx` 是否居中且字号合适。
- 表格、列表、`<Image />` 是否正常渲染。

## 检查表（Checklist）

- [ ] `pnpm build` 零 error、零 warning
- [ ] 产物中含 `katex` 标记但**无** KaTeX `<script>`
- [ ] 产物中含 Shiki 高亮 class，且**无**高亮运行时脚本
- [ ] 深色模式默认生效，公式可读
- [ ] 浅色模式（`class="light"`）交互切换，公式颜色随主题变化且无 FOUC
- [ ] CLS ≈ 0（长公式不撑爆宽度）
- [ ] 页面不含 React/Vue/Svelte 等客户端框架标记
