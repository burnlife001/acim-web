# 《奇迹课程》阅读 PWA — PRD

## 1. 目标

iPhone Safari 优先的 PWA，零构建纯静态部署，单 `index.html` 运行时加载 Markdown。

## 2. 内容

四本书放在 `src/{text,workbook,manual,clarification}/`，全量约 2.7MB（正文 1.6MB / 练习手册 812KB / 教师指南 143KB / 词汇解释 139KB）。

## 3. 功能

- **M1** 目录树导航 + 阅读页 + 字号/夜间模式
- **M2** 全文搜索（MiniSearch，预生成 `src/tmp/search.json`）+ 阅读进度记忆（localStorage）
- **M3** 今日第 N 课（按用户设定的开始日期计算）+ 导出 `.ics` 导入系统日历
- **M4** PWA：`manifest.webmanifest` + Service Worker 全量预缓存 + 图标

不做：账号/云同步、笔记划线、Web Push、webcal 动态订阅。

## 4. 技术

- **栈**：纯静态 HTML + `vendor/marked.min.js` + `vendor/minisearch.min.js`，零打包
- **构建**：`bun scripts/build.mjs` 重写每本 `index.md` 目录、生成 `src/tmp/search.json` + `src/tmp/filelist.json` + `src/icons/`
- **预览**：`bun scripts/serve.mjs [port]`（默认 4173，从 `src/` 起）
- **E2E**：`bun scripts/e2e-m{1..4}.mjs`（puppeteer-core），截图存 `e2e-out/`
- **部署**：Cloudflare Pages，build = `bun scripts/build.mjs`，输出目录 = `src`，根目录 = 仓库根

## 5. 验收

1. iPhone Safari 翻阅四本书完整
2. 搜索"宽恕"返回跨书结果并跳转
3. 设置开始日期后首页显示正确课号，`.ics` 导入日历可定时提醒
4. 加到主屏幕后断网可读

## 6. 状态

M1-M4 全部完成。