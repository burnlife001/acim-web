#!/usr/bin/env bun
// hermes 日记/问答入口：preview / commit 两阶段，JSON 输出供 hermes agent 解析。
//   preview  —— 计算将生成的文件路径与首段预览，不写盘
//   commit   —— 写盘 + 跑 gen-index.mjs 重建索引 + git add/commit/push
// 用法:
//   bun scripts/hermes-journal.mjs preview --dir=日记 --title="面对" --body-file=/tmp/draft.md
//   bun scripts/hermes-journal.mjs commit  --dir=日记 --title="面对" --body-file=/tmp/draft.md
//   bun scripts/hermes-journal.mjs commit  --dir=问答 --title="如何宽恕" --body-file=/tmp/draft.md
// 正文来源：--body-file=PATH（优先级最高） | --body=STRING | stdin
import { $ } from "bun";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const REPO = fileURLToPath(new URL("..", import.meta.url));
const BOOKS_DIR = join(SRC, "books");
const SCRIPTS = fileURLToPath(new URL(".", import.meta.url));

const BOOKS = {
  "日记": { dir: "07.日记", kind: "diary" },
  "问答": { dir: "06.问答", kind: "qa" },
};
const FORBIDDEN = /[<>:"|?*\\/]/;
const MAX_NAME = 200;
const zh = new Intl.Collator("zh-Hans-CN", { numeric: true });

function emit(obj, code = 0) {
  process.stdout.write(JSON.stringify(obj) + "\n");
  process.exit(code);
}
const ok = (data) => emit({ ok: true, ...data });
const fail = (msg, extra = {}) => emit({ ok: false, error: msg, ...extra }, 1);

// ---------- 参数解析 ----------
function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    if (a.startsWith("--")) {
      const i = a.indexOf("=");
      if (i === -1) out[a.slice(2)] = true;
      else out[a.slice(2, i)] = a.slice(i + 1);
    } else out._.push(a);
  }
  return out;
}

function isValidTitle(t) {
  if (!t || !t.trim()) return false;
  const s = t.trim();
  if (s.length > MAX_NAME) return false;
  if (FORBIDDEN.test(s)) return false;
  if (s.startsWith(".")) return false;
  return true;
}

// ---------- 续号逻辑 ----------
function diaryFilename(date, title) {
  const dir = join(BOOKS_DIR, BOOKS["日记"].dir);
  const siblings = existsSync(dir)
    ? readdirSync(dir).filter((n) => n.startsWith(`${date}（`) || n.startsWith(`${date}-`))
    : [];
  if (siblings.length === 0) return `${date}（${title}）.md`;
  let maxNN = 0;
  for (const f of siblings) {
    const m = f.match(new RegExp(`^${date}-(\\d{2})`));
    if (m) maxNN = Math.max(maxNN, parseInt(m[1], 10));
  }
  const hasBase = siblings.some((f) => f.startsWith(`${date}（`));
  const nextNN = Math.max(maxNN + 1, hasBase ? 2 : 1);
  return `${date}-${String(nextNN).padStart(2, "0")}（${title}）.md`;
}

function qaFilename(title) {
  const dir = join(BOOKS_DIR, BOOKS["问答"].dir);
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => /^\d{3}\./.test(n)) : [];
  let max = 0;
  for (const f of files) {
    const m = f.match(/^(\d{3})\./);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${String(max + 1).padStart(3, "0")}.${title}.md`;
}

function todayYMD() {
  // 用本地时区而非 UTC：日记落款要跟作者所在地一致
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function readBody(args) {
  if (args["body-file"]) return readFileSync(args["body-file"], "utf8");
  if (typeof args.body === "string") return args.body;
  if (!process.stdin.isTTY) {
    let data = "";
    for await (const chunk of process.stdin) data += chunk;
    return data;
  }
  return "";
}

// ---------- 主流程 ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || (cmd !== "preview" && cmd !== "commit")) {
    fail("用法: hermes-journal.mjs <preview|commit> --dir=日记|问答 --title=... [--body=...|--body-file=...]");
  }

  const dirKey = (args.dir || "").trim();
  const meta = BOOKS[dirKey];
  if (!meta) fail(`未知目录: ${dirKey}（应为 ${Object.keys(BOOKS).join(" / ")}）`);

  const title = (args.title || "").trim();
  if (!isValidTitle(title)) fail(`标题非法（空/超长/含 <>:"|?*\\/ / 以 . 开头）: ${title}`);

  const body = await readBody(args);
  if (!body.trim()) fail("正文为空");

  // 日记正文首行若无 H1，自动补 # 标题
  const finalBody = /^#\s/m.test(body.split("\n", 3).join("\n")) ? body : `# ${title}\n\n${body}`;
  const filename = meta.kind === "diary" ? diaryFilename(todayYMD(), title) : qaFilename(title);
  const bookDir = join(BOOKS_DIR, meta.dir);
  const filepath = join(bookDir, filename);
  const relPath = `src/books/${meta.dir}/${filename}`;

  if (existsSync(filepath)) {
    fail(`文件已存在: ${relPath}`, { path: relPath });
  }

  // preview 只回报将生成的路径与前 N 字预览，不写盘
  if (cmd === "preview") {
    const snippet = finalBody.slice(0, 240);
    return ok({
      path: relPath,
      title,
      dir: dirKey,
      preview: snippet + (finalBody.length > 240 ? "…" : ""),
      bytes: Buffer.byteLength(finalBody, "utf8"),
    });
  }

  // commit：写盘 → 重建索引 → git add/commit/push
  writeFileSync(filepath, finalBody, "utf8");

  // gen-index.mjs 用 node 跑也行（只用 node:fs 等内置模块），但项目约定 bun；优先 bun
  const genIndex = join(SCRIPTS, "gen-index.mjs");
  const build = await $`bun ${genIndex}`.cwd(REPO).nothrow();
  if (build.exitCode !== 0) {
    fail(`gen-index 失败: exit=${build.exitCode}`, { path: relPath, stderr: build.stderr.toString() });
  }

  const add = await $`git add -A`.cwd(REPO).nothrow();
  if (add.exitCode !== 0) fail("git add 失败", { stderr: add.stderr.toString() });

  const commitMsg = `feat(${meta.dir}): 新增 ${filename}`;
  const commit = await $`git commit -m ${commitMsg}`.cwd(REPO).nothrow();
  if (commit.exitCode !== 0) {
    fail("git commit 失败（可能无变更）", { stderr: commit.stderr.toString(), path: relPath });
  }
  const sha = (await $`git rev-parse --short HEAD`.cwd(REPO).text()).trim();

  const push = await $`git push origin main`.cwd(REPO).nothrow();
  if (push.exitCode !== 0) {
    fail(`git push 失败（已本地提交 ${sha}）`, { sha, stderr: push.stderr.toString(), path: relPath });
  }

  ok({ path: relPath, title, dir: dirKey, sha, pushed: true });
}

main().catch((e) => fail(String(e.message || e), { stack: e.stack }));