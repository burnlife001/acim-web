---
name: acimu
description: 同步 192.168.1.123 上 hermes 的技能——拉取远程 acim-web 仓库并把仓库 .claude/skills 下的技能以符号链接同步进 ~/.hermes/skills。当用户说"同步 hermes 技能""更新服务器技能""acimu""同步技能到服务器""hermes 技能链接"时使用。
---

# acimu：同步 hermes 技能

把本仓库 `.claude/skills/` 下的技能同步到 192.168.1.123 的 hermes（`~/.hermes/skills/`），一轮完成：拉取远程仓库 → 建/更新 symlink → 清理悬空链接。

## 执行（一轮完成）

从仓库根执行（Windows git-bash / pwsh 均可）：

```bash
ssh yg@192.168.1.123 'bash -s' < .claude/skills/acimu/scripts/sync_hermes.sh
```

脚本自动完成：
1. `git -C /home/yg/__work/acim-web pull --ff-only`
2. 对 `.claude/skills/` 下每个技能建/更新 `~/.hermes/skills/<技能名>` 符号链接（已最新的跳过；同名是实体目录则告警跳过）
3. 清理指向本仓库但目标已不存在的悬空链接（只认指向本仓库的链接，不动其他来源）

输出逐条带标记：`+` 新建、`=` 不变、`-` 删除、`!` 异常。执行后把结果回显给用户。

## 前提

- 新技能须先提交并推送到远程，否则远程仓库 pull 后看不到，链接不会建立。
- 本技能自身也走同一流程：首次新增 acimu 后需先推送，再跑一次同步才会链接进 hermes。

## 禁区

- 不要在远端手动建链接，全部走脚本，保证建链与清理规则一致。
- 出现 `!` 告警（同名实体目录冲突）时停下来报告用户，不要自行删除远端目录。
- 不要改成 scp 复制技能目录——hermes 侧必须是指向仓库的符号链接，保证随 pull 自动更新内容。
