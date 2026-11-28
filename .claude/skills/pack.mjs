#!/usr/bin/env bun
/** 把 skills + 语料打成"只需拷 .claude/skills"的自包含副本，并发布到 acim-master。
 *
 * 用法: bun .claude/skills/pack.mjs [输出目录]
 *   默认输出: out/skills-bundle（out/ 已在 .gitignore）
 *
 * bundle 结构:
 *   OUT/.claude/skills/...              全部技能
 *   OUT/.claude/skills/acim/src/books/  语料副本
 * 打包时改写 bundle 内 3 个 .py 脚本的路径：原本"上溯 4 级到仓库根/src/books"
 * 改为指向 skills 内的 acim/src/books。仓库内脚本不动。重复运行先清理旧输出。
 *
 * 打包后把目标库已存在的技能（acim/acimd/acimw）强制覆盖，
 * 再 git add -A && commit && push（不 force push）。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)));
const REPO_ROOT = resolve(SKILLS_DIR, "../..");
const OUT = resolve(REPO_ROOT, process.argv[2] ?? "out/skills-bundle");
const BOOKS_SRC = resolve(REPO_ROOT, "src/books");
const BUNDLE_SKILLS = resolve(OUT, ".claude/skills");
const BUNDLE_BOOKS = resolve(BUNDLE_SKILLS, "acim/src/books");

const TARGET_REPO = "E:/__work/__frequently/value_pipeline/acim-master";
const TARGET_SKILLS = resolve(TARGET_REPO, ".claude/skills");

const PATCHES = [
  {
    file: "acim/scripts/search-books.py",
    from: 'SOURCES_DIR = Path(__file__).resolve().parents[4] / "src" / "books"',
    to: 'SOURCES_DIR = Path(__file__).resolve().parents[1] / "src" / "books"',
  },
  {
    file: "acimw/scripts/lesson.py",
    from: 'REPO_ROOT = SKILL_DIR.parents[2]\nWORKBOOK_DIR = REPO_ROOT / "src" / "books" / "02.练习手册"',
    to: 'WORKBOOK_DIR = SKILL_DIR.parent / "acim" / "src" / "books" / "02.练习手册"',
  },
  {
    file: "acimd/scripts/gen_filename.py",
    from: 'BOOKS = Path(__file__).resolve().parents[4] / "src" / "books"',
    to: 'BOOKS = Path(__file__).resolve().parents[2] / "acim" / "src" / "books"',
  },
];

function count(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? count(resolve(dir, e.name)) : 1;
  }
  return n;
}

function fail(msg) {
  console.error(`错误: ${msg}`);
  process.exit(1);
}

async function git(args) {
  const p = Bun.spawn(["git", "-C", TARGET_REPO, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited,
  ]);
  if (code !== 0) fail(`git ${args.join(" ")} 失败 (${code}): ${err.trim() || out.trim()}`);
  return out.trim();
}

if (!existsSync(BOOKS_SRC)) fail(`找不到语料目录 ${BOOKS_SRC}`);
if (OUT === REPO_ROOT || OUT.startsWith(SKILLS_DIR + "/")) {
  fail(`输出目录不能与源重合或位于 skills 内: ${OUT}`);
}

const t0 = Date.now();
if (existsSync(OUT)) {
  rmSync(OUT, { recursive: true, force: true });
  console.log(`清理旧输出: ${OUT}`);
}
cpSync(SKILLS_DIR, BUNDLE_SKILLS, { recursive: true });
cpSync(BOOKS_SRC, BUNDLE_BOOKS, { recursive: true });

for (const { file, from, to } of PATCHES) {
  const p = resolve(BUNDLE_SKILLS, file);
  if (!existsSync(p)) fail(`待改写的脚本不存在: ${p}`);
  const text = readFileSync(p, "utf-8");
  if (!text.includes(from)) fail(`脚本内容已变，找不到预期片段，请更新 PATCHES: ${file}`);
  writeFileSync(p, text.replace(from, to), "utf-8");
  console.log(`改写路径: ${file}`);
}

const a = count(BOOKS_SRC);
const b = count(BUNDLE_BOOKS);
console.log(`${a === b ? "OK" : "FAIL"}  语料 ${a}/${b} 个条目`);
if (a !== b) fail("复制后条目数不一致");
console.log(`打包完成: ${OUT} (${Date.now() - t0}ms)`);

// --- 发布到 acim-master：只覆盖目标已存在的技能，强制替换整个目录 ---
if (!existsSync(TARGET_SKILLS)) fail(`目标技能目录不存在: ${TARGET_SKILLS}`);
const dirty = await git(["status", "--porcelain"]);
if (dirty) fail(`目标库有未提交改动，先处理再发布:\n${dirty}`);

const updates = [];
for (const name of readdirSync(BUNDLE_SKILLS, { withFileTypes: true })) {
  if (!name.isDirectory()) continue;
  const target = resolve(TARGET_SKILLS, name.name);
  if (!existsSync(target)) {
    console.log(`跳过（目标库无此技能）: ${name.name}`);
    continue;
  }
  rmSync(target, { recursive: true, force: true });
  cpSync(resolve(BUNDLE_SKILLS, name.name), target, { recursive: true });
  updates.push(name.name);
  console.log(`强制覆盖: ${name.name}`);
}
if (updates.length === 0) fail("没有可发布的技能");

await git(["add", "-A"]);
const staged = await git(["diff", "--cached", "--name-only"]);
if (!staged) {
  console.log("无变更，跳过提交与推送");
} else {
  console.log(`暂存变更 ${staged.split("\n").length} 个文件`);
  const msg = `sync skills from acim-web (${updates.join(", ")})`;
  const body = `同步技能: ${updates.join(", ")}\n语料随技能发布至 .claude/skills/acim/src/books/\n由 .claude/skills/pack.mjs 自动生成`;
  await git(["commit", "-m", msg, "-m", body]);
  await git(["push", "origin", "HEAD"]);
  console.log("已提交并推送到 origin");
}
