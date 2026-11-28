#!/usr/bin/env python3
"""acimw: 起始日期不变，按「某天=第N课」把差额暂停段追加到 config.json。

用法:
  set_start.py                              # 今天 = 第43课，差额从起始日后的空位排
  set_start.py 43                           # 同上，显式课号
  set_start.py 43 2026-11-18                # 指定课号+日期
  set_start.py 44 2026-11-26 11-19 11-25    # 指定新增暂停区间（须等于差额天数）
"""
import json
import sys
from datetime import date
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

SKILL_DIR = Path(__file__).resolve().parent.parent
CONFIG_FILE = SKILL_DIR / "config.json"
DEFAULT_LESSON = 43


def read_config() -> dict:
    if not CONFIG_FILE.exists():
        sys.exit(f"错误: 缺少 {CONFIG_FILE}")
    cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    if "start_date" not in cfg:
        sys.exit(f"错误: {CONFIG_FILE} 缺少 start_date")
    cfg.setdefault("pauses", [])
    return cfg


def parse_pause_arg(text: str, day: date) -> date:
    try:
        return date.fromisoformat(text) if len(text) == 10 else date.fromisoformat(f"{day.year}-{text}")
    except ValueError:
        sys.exit(f"错误: 暂停日期须为 YYYY-MM-DD 或 MM-DD，收到 {text}")


def covered_days(pauses: list[dict], lo: date, hi: date) -> set[int]:
    """返回 [lo, hi] 内已被暂停覆盖的日期序号（含首尾）。"""
    out: set[int] = set()
    for p in pauses:
        a = max(date.fromisoformat(p["start"]), lo)
        b = min(date.fromisoformat(p["end"]), hi)
        if a <= b:
            out.update(range(a.toordinal(), b.toordinal() + 1))
    return out


def find_free_slot(start: date, day: date, extra: int, pauses: list[dict]) -> tuple[date, date]:
    busy = covered_days(pauses, start, day)
    run: list[int] = []
    for o in range(start.toordinal(), day.toordinal() + 1):
        if o in busy:
            run = []
            continue
        run.append(o)
        if len(run) == extra:
            return date.fromordinal(run[0]), date.fromordinal(run[-1])
    sys.exit(f"错误: {start} ~ {day} 内找不到连续 {extra} 天空位，请显式指定暂停区间")


def main() -> None:
    args = sys.argv[1:]
    try:
        lesson_no = int(args[0]) if args else DEFAULT_LESSON
        day = date.fromisoformat(args[1]) if len(args) > 1 else date.today()
    except ValueError as exc:
        sys.exit(f"错误: 课号须为整数, 日期须为 YYYY-MM-DD ({exc})")
    if not 1 <= lesson_no <= 365:
        sys.exit(f"错误: 课号须在 1..365, 收到 {lesson_no}")

    cfg = read_config()
    start = date.fromisoformat(cfg["start_date"])
    if day < start:
        sys.exit(f"错误: {day} 早于起始日 {start}")
    total = (day - start).days + 1 - lesson_no
    if total < 0:
        sys.exit(f"错误: {day} 距起始日仅 {(day - start).days + 1} 天，放不下第{lesson_no}课")
    existing = len(covered_days(cfg["pauses"], start, day))
    extra = total - existing
    if extra < 0:
        sys.exit(f"错误: 已有 {existing} 天暂停，超过目标所需的 {total} 天")

    lo = hi = None
    if extra:
        if len(args) >= 4:
            lo, hi = parse_pause_arg(args[2], day), parse_pause_arg(args[3], day)
            if lo > hi:
                sys.exit(f"错误: 暂停区间起点晚于终点: {lo} > {hi}")
            got = (hi - lo).days + 1
            if got != extra:
                sys.exit(f"错误: 指定暂停 {got} 天，但差额是 {extra} 天")
            if covered_days(cfg["pauses"], lo, hi):
                sys.exit(f"错误: 暂停区间 {lo} ~ {hi} 与已有暂停重叠")
        else:
            lo, hi = find_free_slot(start, day, extra, cfg["pauses"])
        cfg["pauses"].append({
            "start": lo.isoformat(), "end": hi.isoformat(),
            "note": f"暂停 {extra} 天，使 {day} = 第{lesson_no}课",
        })
        with CONFIG_FILE.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
            f.write("\n")

    suffix = f"新增 {extra} 天 ({lo} ~ {hi})" if extra else "无需新增"
    print(f"起始日 {start} 不变；已有暂停 {existing} 天，目标第{lesson_no}课共需 {total} 天；{suffix}")
    print(f"{'已写入' if extra else '配置未变'}: {CONFIG_FILE}")


if __name__ == "__main__":
    main()
