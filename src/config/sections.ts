// 站点分区定义：新增分区只需在这里加一项，首页 / 导航 / 分区页自动生效。
// key 同时也是 frontmatter 中 `section` 字段的取值（见 src/content.config.ts）。

export const SECTIONS = [
  {
    key: 'cs',
    label: '计算机',
    labelEn: 'Computer Science',
    description: '系统编程、C++、编译器与工具链、算法与复杂度。',
    rune: '⌘',
  },
  {
    key: 'math',
    label: '数学',
    labelEn: 'Mathematics',
    description: '数论、分析、离散数学与证明笔记。',
    rune: '∑',
  },
  {
    key: 'game',
    label: '游戏',
    labelEn: 'Games',
    description: '游戏设计与实现，以及其他玩物。',
    rune: '◈',
  },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];

export const SECTION_KEYS = SECTIONS.map((s) => s.key) as SectionKey[];

export const DEFAULT_SECTION: SectionKey = 'cs';

export function getSection(key: string) {
  return SECTIONS.find((s) => s.key === key);
}

export function sectionHref(key: string) {
  return `/section/${key}/`;
}
