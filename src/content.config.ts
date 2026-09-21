import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 内容集合：使用 Astro Content Layer API（glob loader），
// 禁止使用已废弃的 getCollection / Astro.glob。
// 分区取值必须与 src/config/sections.ts 的 SECTIONS[].key 保持一致
// （此处刻意内联字面量：content.config 里引入本地模块会触发 astro sync 的加载问题）
const SECTION_KEYS = ['cs', 'math', 'game'] as const;

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    // ISO 8601 日期字符串（YYYY-MM-DD）
    date: z.coerce.date(),
    // 分区：取值见 src/config/sections.ts（新增分区先改那里）
    section: z.enum([...SECTION_KEYS]).default('cs'),
    tags: z.array(z.string()).default([]),
    // 草稿：为 true 时在生产构建中被排除
    draft: z.boolean().default(false),
    // 是否启用数学公式（影响构建时 KaTeX 处理）
    mathEnabled: z.boolean().default(false),
    // 摘要：用于首页文章列表
    description: z.string().optional(),
  }),
});

export const collections = { posts };
