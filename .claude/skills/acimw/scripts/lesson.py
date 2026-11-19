#!/usr/bin/env python3
"""acimw: 按起始日期与暂停区间计算今日练习课号，或按内容搜索 365 课原文。

用法:
  lesson.py            # 今天的课
  lesson.py 宽恕       # 全文搜索练习手册，按课分组列出命中行

配置: 本技能目录下的 config.json，含 start_date 与 pauses 暂停区间
语料: 仓库 src/books/02.练习手册/ 下的 365 个单课文件 (NNN. 课名.md)
输出: 今日模式 -> 日期/课号/课名/课文文件/章节摘要文件
      搜索模式 -> 课号+课名+命中行号与内容(最多 30 行)
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

SKILL_DIR = Path(__file__).resolve().parent.parent
CONFIG_FILE = SKILL_DIR / "config.json"
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


def read_config() -> tuple[date, list[tuple[date, date]]]:
    if not CONFIG_FILE.exists():
        sys.exit(f"错误: 缺少 {CONFIG_FILE}，请写入 start_date 与 pauses")
    cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    try:
        start = date.fromisoformat(cfg["start_date"])
        pauses = [(date.fromisoformat(p["start"]), date.fromisoformat(p["end"]))
                  for p in cfg.get("pauses", [])]
    except (KeyError, TypeError, ValueError) as exc:
        sys.exit(f"错误: {CONFIG_FILE} 格式无效: {exc}")
    for lo, hi in pauses:
        if lo > hi:
            sys.exit(f"错误: 暂停区间起点晚于终点: {lo} ~ {hi}")
    return start, pauses


def paused_days(pauses: list[tuple[date, date]], start: date, today: date) -> int:
    """统计 [start, today] 内被暂停的天数（区间含首尾，重叠只算一次）。"""
    covered: set[date] = set()
    for lo, hi in pauses:
        lo, hi = max(lo, start), min(hi, today)
        if lo <= hi:
            covered.update(date.fromordinal(o) for o in range(lo.toordinal(), hi.toordinal() + 1))
    return len(covered)


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
    start, pauses = read_config()
    paused = paused_days(pauses, start, d)
    n = (d - start).days + 1 - paused
    if n < 1:
        sys.exit(f"{d} 尚未开始 (第1课: {start})")
    print(f"日期: {d}")
    print(f"起始: {start}，暂停 {paused} 天")
    if n > 365:
        print(f"课号: 365课已完结 (超出 {n - 365} 天)——可重置 config.json 的 start_date 开启新一轮")
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
