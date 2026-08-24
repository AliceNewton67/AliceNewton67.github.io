import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 内容集合：使用 Astro Content Layer API（glob loader），
// 禁止使用已废弃的 getCollection / Astro.glob。
const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    // ISO 8601 日期字符串（YYYY-MM-DD）
    date: z.coerce.date(),
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
