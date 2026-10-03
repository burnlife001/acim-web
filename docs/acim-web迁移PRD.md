# 《奇迹课程》阅读站 迁移 + CRUD 功能 PRD

> 项目代号：acim-web ｜ 当前托管：GitHub Pages ｜ 目标托管：Cloudflare Pages + Pages Functions + D1
> 核心诉求：在不产生任何费用前提下，为站点增加数据增删改查（CRUD）能力，并支持多设备同步。

---

## 1. 文档信息

| 项 | 内容 |
|---|---|
| 文档版本 | v1.0 |
| 撰写日期 | 2026-10-03 |
| 项目仓库 | https://github.com/burnlife001/acim-web |
| 当前线上地址 | https://burnlife001.github.io/acim-web/ |
| 技术栈（现状） | VitePress 静态站点 + PWA |
| 执行方式 | Claude Code 在仓库内完成编码，人工完成 Cloudflare 网页端操作 |

---

## 2. 背景与问题

| # | 问题 | 影响 |
|---|---|---|
| P1 | GitHub Pages 仅托管静态文件，无服务器、无数据库 | 无法实现任何在线增删改查 |
| P2 | 阅读进度、练习手册进度等数据仅存于浏览器 localStorage | 换设备即丢失；iPhone/Android 进度互不打通 |
| P3 | 练习笔记、书签无持久化存储位置 | 用户无法积累个人学习数据 |
| P4 | 站长无法在线管理站点内容 | 任何内容修改都要改源码、重新构建部署 |

## 3. 目标与非目标

### 3.1 目标

| 编号 | 目标 | 衡量标准 |
|---|---|---|
| G1 | 站点整体迁移至 Cloudflare Pages，国内访问质量不下降 | 部署成功，原 GitHub Pages 地址保留作备份 |
| G2 | 提供 REST 风格 API，支持笔记、进度的增删改查 | API 联调通过，覆盖全部 CRUD 操作 |
| G3 | 个人数据（进度/笔记）跨设备同步 | 两台设备登录同一密钥后数据一致 |
| G4 | 全程零费用 | 各平台均使用免费额度 |

### 3.2 非目标（本期不做）

| # | 非目标 | 原因 |
|---|---|---|
| N1 | 多用户注册登录体系 | 个人工具场景，token 鉴权足够；后续有需要再引入 Supabase Auth |
| N2 | 站长在线 CMS（改书籍正文） | 书籍内容为静态源文件，改动低频，直接改仓库更可靠 |
| N3 | 服务端渲染（SSR） | VitePress 静态生成已满足阅读场景 |
| N4 | 付费任何云服务 | 硬性约束 |

---

## 4. 需求详述（Functional Requirements）

> 数据归属模型：单用户（站长本人）多设备。所有数据按 `owner_key` 隔离，为将来扩展多用户预留字段。

| 编号 | 需求 | 优先级 | 描述 | 验收要点 |
|---|---|---|---|---|
| FR-1 | 后端 API 基础框架 | P0 | Pages Functions 按文件路由提供 `/api/*` 接口 | 部署后可通过 curl 访问 |
| FR-2 | 鉴权中间件 | P0 | 除健康检查外所有 API 要求请求头携带 `X-Auth-Token`，与服务端环境变量比对 | 无 token / 错误 token 返回 401 |
| FR-3 | 笔记 CRUD | P0 | 用户可对任意课文/练习课创建、查看、修改、删除笔记 | 四个操作均有对应 API 与前端 UI |
| FR-4 | 阅读进度同步 | P0 | 阅读位置（章节、滚动位置）写入服务端，换设备可恢复 | 设备 A 保存 → 设备 B 打开自动跳转 |
| FR-5 | 练习手册进度同步 | P0 | 当前课程编号（1–365）写入服务端 | 与现有"导入日历"功能读取同一份数据源 |
| FR-6 | 书签 CRUD | P1 | 对课文添加/删除书签，列表可查 | 书签列表页展示正常 |
| FR-7 | 数据合并策略 | P1 | 多设备并发修改时以"最后写入为准"（Last-Write-Wins） | 冲突场景文档化，不丢数据 |
| FR-8 | 本地缓存兜底 | P0 | 网络不可用时退回 localStorage，恢复后同步 | 断网可正常阅读，联网后进度一致 |
| FR-9 | 数据导出 | P2 | 一键导出全部个人数据为 JSON | 导出文件字段与数据库一致 |
| FR-10 | 原站保留 | P0 | GitHub Pages 继续可访问，作为备用 | 新旧地址均可打开 |

---

## 5. 技术方案选型

### 5.1 平台对比

| 方案 | 免费额度 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| Cloudflare Pages + Functions + D1 | Functions 10 万请求/天；D1 读 500 万行/天、写 10 万行/天、5GB | 与现有 CF Pages 部署流程无缝；延迟低；wrangler 命令行全自动 | 无内置用户体系 | ✅ **选用** |
| Supabase（Auth + Postgres） | 500MB 数据库；7 天不活跃暂停 | 自带登录体系和 REST API | 对小项目偏重；暂停机制麻烦；数据放第三方 Postgres | 备选（未来多用户时切换） |
| Firebase | Spark 额度有限 | 生态成熟 | 国内访问不稳定，面向中文读者不友好 | ❌ 排除 |
| Render/Railway 跑 json-server | 免费层休眠 | 上手快 | 冷启动慢，不稳定 | ❌ 排除 |
| GitHub Token + API 当数据库 | 免费 | 无新平台 | token 必然泄露；并发写冲突 | ❌ 排除 |

### 5.2 最终架构

```
浏览器 PWA ──fetch /api/*──> Cloudflare Pages
                                ├─ 静态资源（VitePress 构建产物）
                                └─ Pages Functions（functions/ 目录）
                                      └─ D1 (SQLite) ── 表：notes / progress / bookmarks
鉴权：请求头 X-Auth-Token == 环境变量 AUTH_TOKEN
```

---

## 6. 数据模型设计（D1 / SQLite）

### 6.1 表结构

**notes 表**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 自增 ID |
| owner_key | TEXT NOT NULL | 数据归属（默认 'default'，预留多用户） |
| target_type | TEXT NOT NULL | 关联对象类型：'chapter' / 'lesson' |
| target_id | TEXT NOT NULL | 章节 ID 或课程编号（1–365） |
| content | TEXT NOT NULL | 笔记正文 |
| created_at | INTEGER NOT NULL | Unix 毫秒时间戳 |
| updated_at | INTEGER NOT NULL | Unix 毫秒时间戳 |

**progress 表**（每类进度一行，UPSERT 更新）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 自增 ID |
| owner_key | TEXT NOT NULL | 数据归属 |
| progress_type | TEXT NOT NULL | 'reading'（章节+滚动位置）/ 'workbook'（练习课编号 1–365） |
| payload | TEXT NOT NULL | JSON 字符串，结构见 6.2 |
| updated_at | INTEGER NOT NULL | 最后更新时间 |

**bookmarks 表**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 自增 ID |
| owner_key | TEXT NOT NULL | 数据归属 |
| target_type | TEXT NOT NULL | 'chapter' / 'lesson' |
| target_id | TEXT NOT NULL | 目标 ID |
| note | TEXT | 备注（可空） |
| created_at | INTEGER NOT NULL | 创建时间 |

### 6.2 payload 示例（progress 表）

```json
// progress_type = 'reading'
{"chapterId": "text/ch01", "scrollY": 1280}

// progress_type = 'workbook'
{"lessonNo": 47}
```

### 6.3 索引

| 表 | 索引 | 用途 |
|---|---|---|
| notes | UNIQUE(owner_key, target_type, target_id) | 一个目标一篇笔记，重复提交转更新 |
| progress | UNIQUE(owner_key, progress_type) | 同类型进度单行，UPSERT |
| bookmarks | INDEX(owner_key) | 书签列表查询 |

---

## 7. API 设计

> 统一约定：请求/响应均为 JSON；除 `GET /api/health` 外均需 `X-Auth-Token` 头；错误返回 `{"error": "描述"}` 及对应状态码。

| 方法 | 路径 | 功能 | 请求体 | 成功响应 |
|---|---|---|---|---|
| GET | /api/health | 健康检查（无需鉴权） | — | `{"ok": true}` |
| GET | /api/notes | 笔记列表（可按 target 过滤） | — | 笔记数组 |
| POST | /api/notes | 新建/覆盖笔记 | `{target_type, target_id, content}` | `{"ok": true}` |
| DELETE | /api/notes/:id | 删除笔记 | — | `{"ok": true}` |
| GET | /api/progress/:type | 读取某类进度 | — | `{payload, updated_at}` |
| PUT | /api/progress/:type | 写入/覆盖进度 | `{payload}` | `{"ok": true}` |
| GET | /api/bookmarks | 书签列表 | — | 书签数组 |
| POST | /api/bookmarks | 添加书签 | `{target_type, target_id, note?}` | `{"ok": true}` |
| DELETE | /api/bookmarks/:id | 删除书签 | — | `{"ok": true}` |
| GET | /api/export | 导出全部数据 | — | 全量 JSON 文件下载 |

---

## 8. 前端改造点

| # | 位置 | 现状 | 改造 |
|---|---|---|---|
| C1 | 进度存储模块 | 直接读写 localStorage | 抽 `storage.js`：优先调 API，失败回退 localStorage，联网后补同步 |
| C2 | 课文阅读页 | 记录本地阅读位置 | 打开时拉服务端进度恢复滚动；滚动停止 3 秒后写入服务端 |
| C3 | 练习手册页 | 当前课号存本地 | 读改写改为先写服务端；日历导入功能数据源不变 |
| C4 | 新增笔记组件 | 无 | 课文/课程页内嵌笔记编辑框，支持增改删 |
| C5 | 新增书签按钮与列表页 | 无 | 章节页加书签入口；"我的"页面集中展示笔记/书签/进度 |
| C6 | 设置页 | 无 | 增加：服务端连接状态、手动同步按钮、数据导出、密钥更换 |
| C7 | PWA manifest | 现有 | 无需改动 |

---

## 9. 迁移实施计划

| 阶段 | 任务 | 执行方 | 产出 |
|---|---|---|---|
| 一、准备 | 注册/登录 Cloudflare；`npx wrangler login`；`wrangler d1 create acim-db` | 人工（网页端 + 终端） | D1 数据库 ID |
| 二、后端 | 仓库根目录添加 `wrangler.toml`、`functions/api/*`、鉴权中间件；建表 SQL | Claude Code | 可本地 `wrangler pages dev` 调试的 API |
| 三、前端 | 完成改造点 C1–C6 | Claude Code | 新前端构建产物 |
| 四、部署 | CF Pages 连接 GitHub 仓库，配置构建命令与 D1 绑定；设置 `AUTH_TOKEN` 环境变量；部署 | 人工（CF 网页端） | https://acim-web.pages.dev 上线 |
| 五、验证 | 按第 11 节验收标准逐项验证；两台设备实测同步 | 人工 | 验收通过 |
| 六、收尾 | GitHub Pages 保留为备份；README 更新部署说明；仓库打 tag `v2.0` | Claude Code + 人工 | 文档更新 |

**Cloudflare Pages 项目配置（阶段四参考）：**

| 配置项 | 值 |
|---|---|
| 构建命令 | `npm run build`（以仓库 package.json 实际脚本为准） |
| 输出目录 | `src/.vitepress/dist`（以实际配置为准） |
| 根目录 | 仓库根 |
| 环境变量 | `AUTH_TOKEN` = 高强度随机串 |
| D1 绑定 | 项目设置 → Functions → D1 database binding，变量名 `DB` |

---

## 10. 风险与应对

| 风险 | 等级 | 应对 |
|---|---|---|
| 免费额度超限（如被恶意刷接口） | 中 | token 鉴权挡住未授权请求；CF 面板可设速率限制；超限时告警邮件 |
| token 泄露导致数据被篡改 | 中 | 使用 32 字节以上随机 token；仅在受信设备保存；支持随时在 CF 面板更换 |
| CF Pages 构建产物与 GH Pages 不一致 | 低 | 部署后逐页抽查；GH Pages 保留作对照 |
| D1 写操作偶发失败 | 低 | 前端写入失败自动落 localStorage 队列，下次联网重试 |
| 迁移期间旧站数据丢失 | 低 | 不动 GitHub Pages 源分支；迁移为增量并行，不影响现有用户 |
| 国内访问 Cloudflare 偶发波动 | 中 | 保留 GitHub Pages 备份域名；PWA 离线缓存兜底阅读功能 |

## 11. 回滚方案

| 场景 | 回滚动作 |
|---|---|
| CF 部署失败/异常 | GitHub Pages 地址仍在运行，直接切回使用；排查后重试 |
| API 数据异常 | D1 控制台执行 SQL 修复；或从"数据导出"的 JSON 恢复 |
| 完全弃用 CF | 删除 Pages 项目与 D1 数据库即可，无任何费用残留 |

---

## 12. 验收标准

| # | 验收项 | 通过标准 |
|---|---|---|
| AC1 | 部署 | acim-web.pages.dev 可访问，各页面渲染与 GH Pages 一致 |
| AC2 | 鉴权 | 无 token 调 API 返回 401；错误 token 返回 401；正确 token 返回 200 |
| AC3 | 笔记 CRUD | 创建→读取→修改→删除全流程通过，刷新后数据仍在 |
| AC4 | 进度同步 | 设备 A 保存阅读位置/练习课号，设备 B 打开自动恢复 |
| AC5 | 日历导入 | "导入为今天/明天日历"使用同步后的练习进度，课号正确 |
| AC6 | 离线兜底 | 断网可读、可记笔记；联网后数据自动一致 |
| AC7 | 零费用 | CF 账单为 $0；未绑定任何支付方式 |
| AC8 | 原站可用 | burnlife001.github.io/acim-web/ 仍可访问 |

---

## 13. 免费额度监控

| 资源 | 免费上限 | 预估实际用量 | 余量 |
|---|---|---|---|
| Pages Functions 请求 | 100,000/天 | < 500/天（个人 + 少量读者） | 充足 |
| D1 行读取 | 5,000,000/天 | < 50,000/天 | 充足 |
| D1 行写入 | 100,000/天 | < 2,000/天 | 充足 |
| D1 存储 | 5 GB | < 10 MB | 充足 |

---

## 14. 待确认事项

| # | 事项 | 说明 |
|---|---|---|
| Q1 | 阅读进度的具体数据结构（章节 ID 体系） | 需对照 VitePress 页面路由确认 target_id 格式 |
| Q2 | 练习手册"当前进度"目前存于 localStorage 的 key 与格式 | 迁移代码需读取旧格式并上行 |
| Q3 | 是否有其他读者使用该站 | 若实际有多用户访问，需提前评估是否直接上 Supabase Auth |
| Q4 | 笔记是否需要富文本（Markdown？） | 默认按 Markdown 存储，前端简单渲染 |
