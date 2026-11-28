#!/usr/bin/env python3
"""在 ACIM 五部语料中搜索关键词（跨平台，无外部依赖）。

用法:
  search-books.py "宽恕"
  search-books.py "神圣一刻" --source "01.正文"
  search-books.py "小我" --max 50 --context 3
  search-books.py "T-15\\.V" --source "01.正文" --case
"""
import argparse
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

SOURCES_DIR = Path(__file__).resolve().parents[4] / "src" / "books"

LABELS = {
    "01.正文": "正文",
    "02.练习手册": "练习手册",
    "03.教师指南": "教师指南",
    "04.词汇解释": "词汇解释",
    "05.补编：心理治疗目的、过程与行业": "补编",
}
ALL_BOOKS = list(LABELS)


def clip(text: str, limit: int = 250) -> str:
    return text[:200] + "..." if len(text) > limit else text


def search_book(book: str, pattern: re.Pattern, args: argparse.Namespace) -> tuple[int, list[str], int]:
    path = SOURCES_DIR / book
    total, shown, out = 0, 0, []
    for f in sorted(path.rglob("*.md")):
        if f.name == "index.md":
            continue
        lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
        hits = [i for i, line in enumerate(lines) if pattern.search(line)]
        total += len(hits)
        for i in hits:
            if shown >= args.max:
                break
            shown += 1
            for j in range(max(0, i - args.context), min(len(lines), i + args.context + 1)):
                mark = ":" if j == i else "-"
                out.append(f"  {f.name}{mark}{j + 1}:{clip(lines[j])}")
            out.append("  ───")
        if shown >= args.max:
            break
    return total, out, total - shown


def main() -> None:
    parser = argparse.ArgumentParser(description="ACIM 语料搜索")
    parser.add_argument("query", help="查询关键词（正则）")
    parser.add_argument("--source", default="all", help="语料目录名或 all（默认 all）")
    parser.add_argument("--max", type=int, default=20, help="最多显示命中数（默认 20）")
    parser.add_argument("--context", type=int, default=2, help="上下文行数（默认 2）")
    parser.add_argument("--case", action="store_true", help="大小写敏感（默认忽略大小写）")
    args = parser.parse_args()

    if args.source != "all" and args.source not in LABELS:
        sys.exit(f"错误: --source 须为 all 或 {list(LABELS)}，收到 {args.source}")
    targets = ALL_BOOKS if args.source == "all" else [args.source]
    pattern = re.compile(args.query, 0 if args.case else re.IGNORECASE)

    print("🔍 ACIM 语料搜索")
    print("-" * 60)
    print(f"查询: {args.query}")
    print(f"范围: {' '.join(targets)}")
    print()

    grand_total = 0
    for book in targets:
        path = SOURCES_DIR / book
        if not path.is_dir():
            print(f"⚠ 目录不存在: {path}", file=sys.stderr)
            continue
        count, lines, remaining = search_book(book, pattern, args)
        grand_total += count
        print(f"📖 [{LABELS[book]}] {book}")
        print("-" * 60)
        print(f"  命中: {count}")
        for line in lines:
            print(line)
        if remaining > 0:
            print(f"  ... (还有 {remaining} 条未显示)")
        print()
    print("-" * 60)
    print(f"总命中: {grand_total}")


if __name__ == "__main__":
    main()
