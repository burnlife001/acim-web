#!/usr/bin/env bun
// 构建入口：检测 src/books/ 下 .md 的变更，决定走全量还是增量
//   - 增删.md 后 → 重写各书 index.md + 生成 tmp/search.json、tmp/filelist.json
//                    （顺带刷新 tmp/books.json；通过 gen-index.mjs 全量构建）
//   - 改.md 后    → 仅更新 tmp/search.json 中对应条目的 x 字段
//   - 每次跑都调 gen-icons.mjs（幂等，icons 存在则跳过）
// 用法: bun scripts/build.mjs
import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(HERE, "..", "src");
const BOOKS_ROOT = join(SRC, "books");
const TMP = join(SRC, "tmp");
const STATE = join(HERE, ".build-state.json");

const zh = new Intl.Collator("zh-Hans-CN", { numeric: true });

// 与 gen-index.mjs 同口径：src/books/ 下非点目录 = 书集
const BOOKS = readdirSync(BOOKS_ROOT)
  .filter((n) => !n.startsWith(".") && statSync(join(BOOKS_ROOT, n)).isDirectory())
  .sort(zh.compare);

// 递归收集 .md 路径（相对书根，正斜杠），跳过 index.md 与点开头文件
function walk(dir, rel = "") {
  const out = [];
  for (const name of readdirSync(dir)
    .filter((n) => !n.startsWith(".") && n !== "index.md")
    .sort(zh.compare)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, rel ? `${rel}/${name}` : name));
    } else if (name.endsWith(".md")) {
      out.push(rel ? `${rel}/${name}` : name);
    }
  }
  return out;
}

const sha1 = (p) => createHash("sha1").update(readFileSync(p)).digest("hex");

// 当前文件集（key = `书集/rel`，value = hash）
const current = {};
for (const book of BOOKS) {
  for (const rel of walk(join(BOOKS_ROOT, book))) {
    current[`${book}/${rel}`] = sha1(join(BOOKS_ROOT, book, rel));
  }
}

const prev = existsSync(STATE)
  ? JSON.parse(readFileSync(STATE, "utf8"))
  : { files: {} };
const prevFiles = prev.files || {};

// 分类：新增 / 删除 / 修改
const added = [];
const removed = [];
const modified = [];
for (const k of Object.keys(current)) {
  if (!(k in prevFiles)) added.push(k);
  else if (prevFiles[k].h !== current[k]) modified.push(k);
}
for (const k of Object.keys(prevFiles)) {
  if (!(k in current)) removed.push(k);
}

const needFull = added.length > 0 || removed.length > 0;

// 复用 gen-index.mjs 的 stripMd，保证 search.json 中 x 字段一致
const stripMd = (md) => md
  .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
  .replace(/[#>*`|\-[\]()]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

if (needFull) {
  console.log(`[build] 增 ${added.length} / 删 ${removed.length} → 全量重建`);
  await $`bun ${HERE}/gen-index.mjs`;
} else if (modified.length > 0) {
  const searchPath = join(TMP, "search.json");
  if (!existsSync(searchPath)) {
    console.log(`[build] search.json 缺失 → 降级全量重建`);
    await $`bun ${HERE}/gen-index.mjs`;
  } else {
    console.log(`[build] 改 ${modified.length} 篇 → 仅更新 search.json`);
    const search = JSON.parse(readFileSync(searchPath, "utf8"));
    for (const k of modified) {
      const slash = k.indexOf("/");
      const book = k.slice(0, slash);
      const rel = k.slice(slash + 1);
      const idx = search.findIndex((e) => e.b === book && e.p === rel);
      const x = stripMd(readFileSync(join(BOOKS_ROOT, book, rel), "utf8"));
      if (idx === -1) {
        search.push({
          b: book,
          p: rel,
          t: rel.split("/").pop().replace(/\.md$/, ""),
          x,
        });
      } else {
        search[idx].x = x;
      }
    }
    writeFileSync(searchPath, JSON.stringify(search));
    console.log(`[build] tmp/search.json: 更新 ${modified.length} 条`);
  }
} else {
  console.log(`[build] 无变更 → 跳过`);
}

// 落盘状态（无论走哪条路径都要更新，反映最新文件集）
writeFileSync(
  STATE,
  JSON.stringify(
    { v: 1, files: Object.fromEntries(Object.entries(current).map(([k, h]) => [k, { h }])) },
    null,
  ),
);

await $`bun ${HERE}/gen-icons.mjs`;
console.log("[build] 完成");