# CLAUDE.md

- 不主动提交和推送
- 改项目代码参考docs\架构.md
- 非代码任务调用/acimw 技能回答

- 改今日练习课号/记录暂停：`.claude/skills/acimw/config.json`（或用 `set_start.py` 按「某天=第N课」追加暂停段）
- 打包技能并发布到 acim-master：`bun .claude/skills/pack.mjs`（会强制覆盖目标已存在技能并提交推送）
