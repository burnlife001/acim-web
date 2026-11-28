---
name: acimw
description: 奇迹课程每日一课——按 config.json 的起始日与暂停区间自动算出今天第几课，取原文与章节摘要，以当日练习为视角解读用户抛出的事。当用户说"今天第几课""每日练习""今日练习""acimw"，或要求"记录暂停""把今天设为第N课"，或在日记/对话语境中借今日练习说事时使用。
---


# acimw：每日一课

练习手册 365 课，一天一课。配置在 `.claude/skills/acimw/config.json`：

```json
{"start_date": "2026-09-24", "pauses": [{"start": "2026-09-24", "end": "2026-10-06"}]}
```

`start_date` 是第1课的日期，始终不变；`pauses` 是中断的日期区间（含首尾）。
课号 = （今天 − start_date + 1）− 落在区间内的暂停天数。

## 流程

### 0. 记录暂停（用户要求时）
起始日期不动，从仓库根执行脚本，把「某一天 = 第 N 课」反推成**差额暂停段追加**到 `config.json`：
```bash
python .claude/skills/acimw/scripts/set_start.py           # 今天 = 第43课（默认）
python .claude/skills/acimw/scripts/set_start.py 43        # 同上，显式课号
python .claude/skills/acimw/scripts/set_start.py 43 2026-11-18  # 指定课号+日期
python .claude/skills/acimw/scripts/set_start.py 44 2026-11-26 11-19 11-25  # 显式新增暂停区间
```
公式：`所需总暂停 =（目标日期 − start_date + 1）− 课号`，`新增暂停 = 所需总暂停 − 已有暂停`。脚本只追加差额，不覆盖历史暂停段。不带暂停区间时，自动排到起始日之后的第一个连续空位；显式区间时须正好等于差额且不与已有段重叠。可反复调用记录多次暂停。

### 1. 算课号（必须用脚本，不要自己算日期）
从仓库根执行：
```bash
python .claude/skills/acimw/scripts/lesson.py        # 今天的课
python .claude/skills/acimw/scripts/lesson.py '内容' # 指定内容搜索 365 课原文，按课分组列出命中行
```
输出：今日模式 → 课号、课名、课文文件、章节摘要文件；搜索模式 → 课号+课名+命中行号与内容。

### 2. 取内容
- 加载`/acim`技能
- 原文：Read 脚本给出的课文文件（`src/books/02.练习手册/` 下的单课 .md，引用原句时标注 `W-11` 式出处）
- 章节摘要：Read 脚本给出的 ch 文件（该课所在课组的操练框架、卡点、类比）

### 3. 说事
- 用户只问"今天第几课"→ 回课号+课名+原句一段+一句落地用法，收住
- 用户抛出事件/情绪/日记 → **以今日这一课为镜头**解读：先给结论，指出这件事在该课框架下的位置，再回用户原事。内容框架、类比风格（电路/代码/ML 三选一）、判别器、表达规范全部遵循 **acim 技能**的 SKILL.md 与各规范节——本技能只负责"定课"，不另立口径
- 一日一课，不预支明天的课；需跨课找内容时用搜索模式

## 禁区
- `config.json` 只在用户明确要求时改（一轮 365 天跑完后重置 `start_date` 并清空 `pauses` 开启新一轮）
