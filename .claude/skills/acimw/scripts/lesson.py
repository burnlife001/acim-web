#!/usr/bin/env python3
"""acimw: 按起始日期计算今日练习课号，或按内容搜索 365 课原文。

用法:
  lesson.py            # 今天的课
  lesson.py 宽恕       # 全文搜索练习手册，按课分组列出命中行

配置: 本技能目录下的 .env，一行: ACIM_START_DATE=2026-09-24 (第1课的日期)
语料: 仓库 src/books/02.练习手册/ 下的 365 个单课文件 (NNN. 课名.md)
输出: 今日模式 -> 日期/课号/课名/课文文件/章节摘要文件
      搜索模式 -> 课号+课名+命中行号与内容(最多 30 行)
"""
import re
import sys
from datetime import date
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

SKILL_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = SKILL_DIR / ".env"
ACIM_DIR = SKILL_DIR.parent / "acim"
REPO_ROOT = SKILL_DIR.parents[2]
WORKBOOK_DIR = REPO_ROOT / "src" / "books" / "02.练习手册"

CHAPTERS = [
    (1, 50, "ch33-wb-01-50.md"),
    (51, 90, "ch34-wb-51-90.md"),
    (91, 140, "ch35-wb-91-140.md"),
    (141, 180, "ch36-wb-141-180.md"),
    (181, 220, "ch37-wb-181-220.md"),
    (221, 280, "ch39-wb-221-280.md"),
    (281, 365, "ch40-wb-281-365.md"),
]

LESSON_FILE_RE = re.compile(r"^(\d{3})\.\s*(.+)\.md$")
FINAL_FILE_RE = re.compile(r"^(36[1-5])-(36[1-5])\.md$")  # 361-365 合并为一课
MAX_HITS = 30


def read_start_date() -> date:
    if not ENV_FILE.exists():
        sys.exit(f"错误: 缺少 {ENV_FILE}，请写入一行 ACIM_START_DATE=YYYY-MM-DD (第1课的日期)")
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith("ACIM_START_DATE="):
            return date.fromisoformat(line.split("=", 1)[1].strip())
    sys.exit(f"错误: {ENV_FILE} 中没有 ACIM_START_DATE=YYYY-MM-DD")


def load_lessons() -> dict[int, tuple[str, Path]]:
    """扫描练习手册目录，返回 {课号: (课名, 课文文件路径)}。"""
    if not WORKBOOK_DIR.is_dir():
        sys.exit(f"错误: 找不到练习手册目录 {WORKBOOK_DIR}")
    lessons = {}
    for p in WORKBOOK_DIR.rglob("*.md"):
        m = LESSON_FILE_RE.match(p.name)
        if m:
            lessons[int(m.group(1))] = (m.group(2).strip(), p)
            continue
        m = FINAL_FILE_RE.match(p.name)
        if m:
            title = p.read_text(encoding="utf-8").splitlines()[0].lstrip("# ").split(". ", 1)[-1].strip()
            for n in range(int(m.group(1)), int(m.group(2)) + 1):
                lessons[n] = (title, p)
    if len(lessons) != 365:
        missing = [n for n in range(1, 366) if n not in lessons]
        sys.exit(f"错误: 只找到 {len(lessons)} 课，缺: {missing[:10]}{'...' if len(missing) > 10 else ''}")
    return lessons


def show_today(lessons: dict[int, tuple[str, Path]]) -> None:
    d = date.today()
    start = read_start_date()
    n = (d - start).days + 1
    if n < 1:
        sys.exit(f"{d} 尚未开始 (第1课: {start})")
    print(f"日期: {d}")
    if n > 365:
        print(f"课号: 365课已完结 (超出 {n - 365} 天)——可重置 .env 的 ACIM_START_DATE 开启新一轮")
        return
    title, path = lessons[n]
    chapter = next(f for lo, hi, f in CHAPTERS if lo <= n <= hi)
    print(f"课号: 第{n}课 ({n:03d}/365)")
    print(f"课名: {title}")
    print(f"课文: {path}")
    print(f"章节摘要: {ACIM_DIR / 'chapters' / chapter}")


def search(query: str, lessons: dict[int, tuple[str, Path]]) -> None:
    print(f"「{query}」命中:")
    hits = 0
    for n in sorted(lessons):
        title, path = lessons[n]
        lines = path.read_text(encoding="utf-8").splitlines()
        matched = [(i + 1, l.strip()) for i, l in enumerate(lines) if query in l]
        if not matched:
            continue
        print(f"第{n}课 {title}")
        for lineno, text in matched:
            if hits >= MAX_HITS:
                print(f"... 已达 {MAX_HITS} 行上限，后续命中省略")
                return
            print(f"  L{lineno}: {text}")
            hits += 1
    if hits == 0:
        print("  (无命中)")


def main() -> None:
    lessons = load_lessons()
    if len(sys.argv) > 1:
        search(sys.argv[1], lessons)
    else:
        show_today(lessons)


if __name__ == "__main__":
    main()
