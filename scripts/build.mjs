#!/usr/bin/env bun
// 构建入口：生成 src/ 内的搜索索引与 PWA 图标。
//   - src/ 是仓库的发布根（Cloudflare Pages 部署根 = ./，输出 = src/）
//   - 代码本身就在 src/ 内，不需要拷贝步骤
//   - 构建产物：src/tmp/search.json、src/tmp/filelist.json、src/icons/*.png
// 用法: bun scripts/build.mjs
import { $ } from "bun";

await $`bun ${import.meta.dirname}/gen-index.mjs`;
await $`bun ${import.meta.dirname}/gen-icons.mjs`;
console.log("构建完成");