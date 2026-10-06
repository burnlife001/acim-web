# 奇迹课程 · 阅读+练习辅助工具

配合Iphone可添加日历进行辅助练习，android

## 1.部署

上传`src`目录到[Cloudflare Pages] || [github-pages]
本地运行：双击`acim-preview.ps1`，按3构建,按1启动


--- 

## 2.手机操作指南

### Android:

- 使用浏览器访问`https://burnlife001.github.io/acim-web/` 

### Iphone:
- Safari浏览器访问并添加到主屏幕：访问`https://burnlife001.github.io/acim-web/
- 导入练习到日历:`导入为今天日历`,`导入为明天日历`会以练习手册的当前进度课程作为练习目标导入日历
- 删除练习日历：
  - 新建快捷指令并添加到主屏幕：筛选条件：1.`标题`,`包含`,`acim-`, 2.`开始日期`介于`2026-10-05`和`2090-10-05`, 动作：`移除日程`,
  - [快捷指令下载](https://www.icloud.com/shortcuts/32cc115fbec24212add4b163ad1dc5af)

## 奇迹课程AI导师：
### 方法1：google notebook
将书籍目录的所有文档上传到google notebook,直接提问

### 方法2：使用acim技能
.claude/skills/中有acim技能，可直接使用`/acim`调用

配套技能：
- acim (主校准技能)：整书知识库视角解读问题(1.用户`/acim`主动调用，2.对话触发/acimw间接调用)
- acimw（每日一课）：由今日功课视角调用/acim并进行回答(被clauede.md默认调用,.env存起始练习日期)
- acimd（对话存档）：对话内容存档(`07.日记` 或 `06.问答`,自动文件名)
- install-skill.sh：全局技能安装器(将4个技能安装到claude code全局技能目录,链接到本仓库,不要删除本仓库)
---
