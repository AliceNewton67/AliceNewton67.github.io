// picomatch 4.0.5 只提供 CJS 入口（package.json 里没有 "exports"）。
// Vite 8 的 SSR module runner 会把它当 ESM 加载，里面的 require() 直接抛
// "require is not defined"，导致 astro sync/build 失败。
//
// 这个 ESM 包装层用 createRequire 加载真正的 CJS 实现，再补上命名/默认导出，
// 让 Vite 8 能正常使用它。astro.config.mjs 里通过 alias 生效。
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// 以项目根为基准解析，避免写死 .pnpm 里的版本号目录
const projectRequire = createRequire(fileURLToPath(new URL('../package.json', import.meta.url)));
const picomatchPath = projectRequire.resolve('picomatch');
const picomatch = projectRequire(picomatchPath);

export default picomatch;
export const test = picomatch.test;
export const matchBase = picomatch.matchBase;
export const scan = picomatch.scan;
export const parse = picomatch.parse;
export const compile = picomatch.compile;
export const makeRe = picomatch.makeRe;
export const constants = picomatch.constants;
export const isMatch = picomatch.isMatch;
