# CLAUDE.md

本项目有github pages-ci，agent不主动推送，只提交本地

## 项目性质

零构建纯静态 PWA。`src/` 即发布根，单 `index.html` 运行时 fetch Markdown，iPhone Safari 优先。

## 常用命令

```bash
bun scripts/build.mjs              # 改 MD 后跑：重写各书 index.md + 生成 tmp/search.json、tmp/filelist.json、icons
bun scripts/serve.mjs [port]       # 预览，默认 4173，从 src/ 起
bun scripts/e2e-m1.mjs             # E2E + 截图（m1=基础 m2=搜索 m3=今日课 m4=PWA）
```

E2E 依赖 `puppeteer-core` + 本机 Chrome（路径见 `scripts/e2e-m3.mjs` 硬编码）；截图存 `e2e-out/`。无单元测试框架。

## 架构

**入口**：`src/index.html` 内联全部视图逻辑（hash 路由 + marked 渲染 + MiniSearch 调用）。所有源码都在这一个文件里，没有 JS 模块拆分。

**路由**：`#/{book}` 看书首页、`#/{book}/{path}` 看正文（path 相对书根，正斜杠）。`book ∈ {text, workbook, manual, clarification}`。

**内容**：`src/books/{text,workbook,manual,clarification}/`。**每本书的 `index.md` 是构建产物**（`gen-index.mjs` 重写），既是人读目录页，也是阅读器侧边栏/搜索的实时数据源——勿手改，改了也会被覆盖。文件名（含子目录结构）即显示标题与导航路径。

**数据文件**：`src/books/ics.csv`（课号→时刻表，两列 `lesson,times`，365 行，日历提醒数据源；日历标题运行时从课文件名/361-365.md 首个 H1 解析）；`src/books/cfg.json`（泛化配置占位，尚未接入代码）；`src/tmp/{search,filelist}.json`（构建产物，gitignore）。

**vendor**：`src/vendor/{marked.min.js, minisearch.min.js}` —— 唯一两个外部库，本地化、不走 CDN。

**PWA**：`manifest.webmanifest` + `sw.js`（`src/` 内）。SW `install` 阶段全量预缓存 `tmp/filelist.json` 列出的所有文件；`fetch` 走网络优先、离线回退。版本号常量 `VER`（如 `acim-v12`），改了缓存要 bump。

**localStorage 契约**：
- `acim:pos:<book>` —— 每本书的上次阅读位置（path）；其中 `acim:pos:workbook` 兼作练习进度：当前课 = 其指向的课号，"导入为今天/明天日历"均放当前课内容，仅落到的日期不同

**每日提醒**：客户端 JS 拼装 `.ics` 文件触发下载。无服务端、无 webcal、无 Web Push。删除日历事件网页无路（已实测 iOS 导入预览无视 METHOD:CANCEL，只加不删），批量删除由用户自建的 iOS 快捷指令承担，勿再在网页端加删除功能。

## 部署

Cloudflare Pages：build = `bun scripts/build.mjs`，输出目录 = `src`，根目录 = 仓库根。`src/` 不需要拷贝步骤——它就是发布根。

## 构建/脚本约定

- 脚本 shebang `#!/usr/bin/env bun`，本机必须装 bun
- `package.json` 只声明 `puppeteer-core` 一个 devDep
- 课表契约：`books/workbook/` 必须有 360 个 `NNN.` 课号文件 + `03.下篇/15.最后的几课/361-365.md`；`books/ics.csv` 必须恰 365 数据行；`gen-index.mjs` 校验失败则报错

## 参考

- `README.md` —— 命令速查
- `docs/prd.md` —— 需求与里程碑状态
