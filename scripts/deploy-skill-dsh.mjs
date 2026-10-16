#!/usr/bin/env bun
/**
 * deploy-skill-dsh.mjs — 把本仓库的 acim skill 部署到 deepseek harness (dsh) 的 skill 根。
 *
 * dsh 的本地 skill 发现根 (packages/skill/skill-filesystem, 按 rank):
 *   100  <projectRoot>/.dsh/skills      200  <projectRoot>/.agents/skills
 *   400  <dshHome>/skills               500  <agentsHome>/skills
 * 本脚本默认部署到 rank 400 的用户根 (~/.dsh/skills/acim), 对所有 dsh 会话可见。
 *
 * 用法:
 *   bun scripts/deploy-skill-dsh.mjs                 # 部署到 ~/.dsh/skills/acim 并验证
 *   bun scripts/deploy-skill-dsh.mjs --target project # 部署到 <repo>/.dsh/skills/acim
 *   bun scripts/deploy-skill-dsh.mjs --dry-run        # 只打印将要做什么
 *   bun scripts/deploy-skill-dsh.mjs --no-verify      # 跳过 dsh 真实发现验证
 *   bun scripts/deploy-skill-dsh.mjs --fix-source-eol # 顺带把源 skill 的 CRLF 转成 LF
 */

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SKILL_NAME = 'acim'
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// 部署副本的路径改写规则: 源文档以 .claude/skills/acim 为基准, dsh 副本改成 dsh 侧路径。
const REWRITES = [
  ['从项目根执行', '从任意目录执行'],
]

const argv = process.argv.slice(2)
const flag = name => argv.includes(`--${name}`)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(repoRoot, '.claude', 'skills', SKILL_NAME)
const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const targetKind = opt('target', 'user')
const targetRoot = targetKind === 'project' ? join(repoRoot, '.dsh', 'skills') : join(dshHome, 'skills')
const target = join(targetRoot, SKILL_NAME)
const dryRun = flag('dry-run')
const banner = step => console.log(`\n${step}`.padEnd(60, '─'))

const fail = message => {
  console.error(`\n[FAIL] ${message}`)
  process.exit(1)
}

banner(`[1/4] 源与目标`)
console.log(`源    : ${source}`)
console.log(`目标  : ${target}  (dsh ${targetKind === 'user' ? 'user-dsh rank 400' : 'project-dsh rank 100'})`)
if (dryRun) console.log('模式  : dry-run')

// ── 校验源 skill ───────────────────────────────────────────────────────────
const skillFile = join(source, 'SKILL.md')
const raw = await readFile(skillFile, 'utf8').catch(() => fail(`源 SKILL.md 不存在: ${skillFile}`))
const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
if (!front) fail('源 SKILL.md 缺 frontmatter')
const name = front[1].match(/^name:\s*(.+)$/m)?.[1].trim()
const description = front[1].match(/^description:\s*(.+)$/m)?.[1].trim()
if (name !== SKILL_NAME) fail(`frontmatter name 期望 ${SKILL_NAME}, 实际 ${name}`)
if (!KEBAB.test(name)) fail(`name 不符合 dsh kebab-case 规则: ${name}`)
if (!description) fail('frontmatter 缺 description (dsh 硬性要求)')
const descLength = description.replace(/^["']|["']$/g, '').length
const nested = (await readdir(source, { recursive: true })).filter(p => p.endsWith('SKILL.md') && dirname(p) !== '.')
if (nested.length) fail(`dsh 不支持嵌套 SKILL.md: ${nested.join(', ')}`)
console.log(`\n校验  : name=${name} description=${descLength} 字 (dsh 目录渲染上限 500)`)
if (descLength > 500) console.log(`[WARN] description 超过 500 字, 会话目录里会被截断`)

// ── 复制 + 改写 ────────────────────────────────────────────────────────────
banner(`[2/4] 复制 (改写到 dsh 路径)`)
const rewriteBase = targetKind === 'project' ? '.dsh/skills/acim' : '~/.dsh/skills/acim'
const rules = [[`.claude/skills/${SKILL_NAME}`, rewriteBase], ...REWRITES]

if (!dryRun) {
  if (await stat(target).then(() => true, () => false)) {
    const existing = await readFile(join(target, 'SKILL.md'), 'utf8').catch(() => '')
    if (!/^name:\s*acim\s*$/m.test(existing)) fail(`目标已存在且不是 acim 副本, 拒绝覆盖: ${target}`)
    console.log(`替换  : 已存在的部署副本`)
    await rm(target, { recursive: true, force: true })
  }
  await mkdir(target, { recursive: true })
}

let files = 0
let rewritten = 0
let bytes = 0
let normalized = 0
const crlfInSource = []
for (const entry of await readdir(source, { withFileTypes: true, recursive: true })) {
  if (!entry.isFile()) continue
  const rel = join(entry.parentPath.replace(source, ''), entry.name).replace(/^[\\/]/, '')
  const src = join(source, rel)
  const dst = join(target, rel)
  files++
  const text = /\.(md|txt|json)$/i.test(rel) ? await readFile(src, 'utf8') : undefined
  if (text !== undefined) {
    let out = text
    for (const [from, to] of rules) {
      if (out.includes(from)) {
        out = out.split(from).join(to)
        rewritten++
      }
    }
    if (out.includes('\r\n')) {
      // 部署副本强制 LF; 源文件本身的 CRLF 只报告, 不改写仓库内容。
      crlfInSource.push(rel)
      out = out.split('\r\n').join('\n')
      normalized++
    }
    bytes += Buffer.byteLength(out)
    if (!dryRun) {
      await mkdir(dirname(dst), { recursive: true })
      await writeFile(dst, out, 'utf8')
    }
  } else {
    const buf = await readFile(src)
    bytes += buf.length
    if (!dryRun) {
      await mkdir(dirname(dst), { recursive: true })
      await writeFile(dst, buf)
    }
  }
}
console.log(`文件  : ${files} 个, ${(bytes / 1024 / 1024).toFixed(2)} MB, 路径改写 ${rewritten} 处`)
console.log(`换行  : 部署副本已全部转 LF (源文件 CRLF ${normalized} 个)`)
if (crlfInSource.length) {
  console.log(`[WARN] 源 skill 里 ${crlfInSource.length} 个 md 是 CRLF (违反 LF-only 约定), 例如 ${crlfInSource.slice(0, 3).join(', ')}`)
  console.log('       运行 `bun scripts/deploy-skill-dsh.mjs --fix-source-eol` 可把源文件也转成 LF。')
}

// ── 可选: 把源 skill 的 CRLF 也转成 LF ─────────────────────────────────────
if (flag('fix-source-eol') && !dryRun && crlfInSource.length) {
  banner('[*] 修正源文件换行 (LF)')
  for (const entry of await readdir(source, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    const rel = join(entry.parentPath.replace(source, ''), entry.name).replace(/^[\\/]/, '')
    const file = join(source, rel)
    const text = await readFile(file, 'utf8')
    if (!text.includes('\r\n')) continue
    await writeFile(file, text.split('\r\n').join('\n'), 'utf8')
    console.log(`  LF: ${rel}`)
  }
  console.log('源文件已转 LF — 记得 git commit。')
}

// ── dsh 端真实发现验证 ─────────────────────────────────────────────────────
banner(`[3/4] dsh 发现验证 (真实 dsh 包, 非模拟)`)
if (flag('no-verify') || dryRun) {
  console.log('跳过  : --no-verify / --dry-run')
} else {
  const modules = join(dshHome, 'profiles', 'node_modules', '@deepseek-ai')
  const mod = p => pathToFileURL(join(modules, p)).href
  const probe = join(modules, `dsh-skill-filesystem`)
  if (!(await stat(probe).then(() => true, () => false))) {
    console.log(`[SKIP] 未找到已安装的 dsh 包 (${modules}), 无法验证`)
  } else {
    const { Context } = await import(mod('cordis/lib/index.js'))
    const SkillRegistry = (await import(mod('dsh-skill/lib/index.js'))).default
    const provider = await import(mod('dsh-skill-filesystem/lib/index.js'))
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(provider, { watch: false })
    const cwd = process.cwd()
    const list = await ctx.skills.list({ cwd })
    const hit = list.find(s => s.name === SKILL_NAME)
    console.log(`cwd   : ${cwd}`)
    console.log(`目录  : ${list.length} 个 skill -> ${list.map(s => s.name).join(', ') || '(空)'}`)
    if (!hit) fail(`dsh 未发现 ${SKILL_NAME}。检查根路径 / frontmatter`)
    console.log(`命中  : ${hit.name}  source=${hit.source}  provider=${hit.provider}`)
    console.log(`可见性: model=${hit.invocation.modelInvocable} user=${hit.invocation.userInvocable} (tool-skill 只收 model 可见项)`)
    if (!hit.invocation.modelInvocable) fail('skill 对模型不可见 (disable-model-invocation), dsh 会话不会加载')
    console.log(`描述  : ${hit.description.slice(0, 60)}...`)
    const full = await ctx.skills.get(SKILL_NAME, { cwd })
    if (!full) fail('候选存在但正文加载失败 (ctx.skills.get)')
    console.log(`正文  : ${full.content.length} 字, 资源根 ${JSON.stringify(full.resourceBase)}`)
    const scriptsOk = (await stat(join(target, 'scripts', 'search-sources.sh')).then(() => true, () => false))
    const sourcesOk = (await readdir(join(target, 'sources'))).length
    console.log(`资源  : scripts=${scriptsOk ? 'ok' : 'missing'}  sources=${sourcesOk} 个`)
    await ctx.stop?.()
  }
}

banner(`[4/4] 完成`)
console.log(`已部署: ${target}`)
console.log('生效条件: dsh 会话使用含 skill-filesystem + tool-skill 的 preset (standard / ptc), minimal 无 skill 能力。')
