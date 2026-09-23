#!/usr/bin/env bun
// 内容管线：扫描 src/books/ 目录树
//   1. 重写每本书的 index.md（树形链接清单 —— 既是人读目录页，也是阅读器侧边栏数据源，勿手改）
//   2. 生成 src/tmp/books.json（书集清单 = 子目录名数组，客户端启动时拉）
//   3. 生成 src/tmp/search.json + src/tmp/filelist.json（构建产物，gitignore，仅随构建产出）
// 命名即显示名：目录 → 侧边栏分组，文件 → 叶子（标签 = 文件名去 .md）。
// 目录名 = key = name，直接读 src/books/*/，不再维护 cfg.books 字典。
// 课表/日历契约读自 src/books/cfg.json（唯一配置入口，但不含书集清单）。
// 用法: bun scripts/gen-index.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../src", import.meta.url));
const BOOKS_ROOT = join(ROOT, "books");
const TMP = join(ROOT, "tmp");

const CFG = JSON.parse(readFileSync(join(BOOKS_ROOT, "cfg.json"), "utf8"));
const lessonBook = CFG.lessonBook || null; // 可空：无课表书集跳过课表校验
const calendar = CFG.calendar || null;     // 可空：无日历功能

const zh = new Intl.Collator("zh-Hans-CN", { numeric: true });

// 直接枚举 src/books/ 的子目录作为书集（key = name = 目录名）。
// 过滤 cfg.json / ics.csv 等非目录条目；Intl.Collator numeric:true 让 "01." "02." 按数字序排。
const BOOKS = readdirSync(BOOKS_ROOT)
  .filter((n) => !n.startsWith(".") && statSync(join(BOOKS_ROOT, n)).isDirectory())
  .sort(zh.compare);

// 递归扫描一个目录，返回节点树：{ name, children? } | { name, path }
// path 为相对书根的 .md 路径（正斜杠）。忽略 index.md 与点开头文件。
function walk(dir, rel = "") {
  const out = [];
  const names = readdirSync(dir)
    .filter((n) => !n.startsWith(".") && n !== "index.md")
    .sort(zh.compare);
  for (const name of names) {
    const full = join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(full).isDirectory()) {
      out.push({ name, children: walk(full, r) });
    } else if (name.endsWith(".md")) {
      out.push({ name, path: r });
    }
  }
  return out;
}

// 节点树 → 嵌套列表行。叶子链接用 <...> 包裹，路径保留中文原文。
function toLines(nodes, depth = 0, lines = []) {
  for (const n of nodes) {
    const pad = "  ".repeat(depth);
    if (n.children) {
      lines.push(`${pad}- ${n.name}`);
      toLines(n.children, depth + 1, lines);
    } else {
      lines.push(`${pad}- [${n.name.replace(/\.md$/, "")}](<${n.path}>)`);
    }
  }
  return lines;
}

function flatten(nodes, out = []) {
  for (const n of nodes) n.children ? flatten(n.children, out) : out.push(n);
  return out;
}

function stripMd(md) {
  return md
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "") // front matter
    .replace(/[#>*`|\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const search = [];
const filelist = [];
for (const key of BOOKS) {
  const tree = walk(join(BOOKS_ROOT, key));
  const leaves = flatten(tree);

  const md = `# ${key} · 目录\n\n共 ${leaves.length} 篇\n\n${toLines(tree).join("\n")}\n`;
  writeFileSync(join(BOOKS_ROOT, key, "index.md"), md);

  for (const leaf of leaves) {
    filelist.push(`books/${key}/${leaf.path}`);
    const raw = readFileSync(join(BOOKS_ROOT, key, leaf.path), "utf8");
    search.push({
      b: key,
      p: leaf.path,
      t: leaf.name.replace(/\.md$/, ""),
      x: stripMd(raw),
    });
  }
  console.log(`${key}: ${leaves.length} 篇`);
}

// 课表契约校验（仅在 cfg.lessonBook 配置时）
if (lessonBook) {
  const wbKey = lessonBook.book;
  const wbLeaves = flatten(walk(join(BOOKS_ROOT, wbKey))).map((n) => n.path);
  const lessonRe = new RegExp(lessonBook.filePattern);
  const lessons = wbLeaves.filter((p) => lessonRe.test(p));
  const totalLessons = lessonBook.range[1] - lessonBook.range[0] + 1;
  const mergedLessons = lessonBook.mergedRange ? lessonBook.mergedRange[1] - lessonBook.mergedRange[0] + 1 : 0;
  const expected = totalLessons - mergedLessons;
  if (lessons.length !== expected) {
    console.error(`⚠️ 课号文件数 = ${lessons.length}，应为 ${expected}`);
    process.exitCode = 1;
  }
  const mergedOk = !lessonBook.mergedFile || wbLeaves.includes(lessonBook.mergedFile);
  if (lessonBook.mergedFile && !mergedOk) {
    console.error(`⚠️ 缺少 ${lessonBook.mergedFile}`);
    process.exitCode = 1;
  }
  console.log(`课表校验: ${lessons.length} 个课号文件${mergedOk ? ` + ${lessonBook.mergedFile.split("/").pop()}` : ""}`);
}

// ics.csv 契约校验（仅在 cfg.calendar 配置时）
if (calendar) {
  // cfg.calendar.csv 相对 src/books/（cfg.json 与 ics.csv 同级）
  const icsFile = join(BOOKS_ROOT, calendar.csv);
  const icsRows = existsSync(icsFile) ? readFileSync(icsFile, "utf8").trim().split("\n").length - 1 : 0;
  if (icsRows !== calendar.rows) {
    console.error(`⚠️ ${calendar.csv} 数据行 = ${icsRows}，应为 ${calendar.rows}`);
    process.exitCode = 1;
  } else {
    filelist.push(`books/${calendar.csv}`);
  }
}

mkdirSync(TMP, { recursive: true });
writeFileSync(join(TMP, "search.json"), JSON.stringify(search));
// 书集清单：客户端启动时拉此文件，不再读 cfg.books
writeFileSync(join(TMP, "books.json"), JSON.stringify(BOOKS));
// SW 全量预缓存清单（cfg.json / tmp/books.json 也须缓存：前端启动首取依赖）
const precache = [
  "books/cfg.json",
  "tmp/books.json",
  ...BOOKS.map((k) => `books/${k}/index.md`),
  ...filelist,
];
writeFileSync(
  join(TMP, "filelist.json"),
  JSON.stringify(precache),
);
console.log(`tmp/books.json: ${BOOKS.length} 本书；tmp/search.json: ${search.length} 条；tmp/filelist.json: ${precache.length} 个文件`);
