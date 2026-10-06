#!/usr/bin/env bash
# install-skill.sh — 把技能目录链接进 Claude Code 全局技能目录（win/linux 自适应）
#
# 全局技能目录默认 ~/.claude/skills，链接指向源技能目录，源改动即时生效，不复制内容。
# Windows: 优先进程无权限要求的 NTFS junction (mklink /J)，失败回退原生符号链接/ pwsh。
# Linux/macOS: ln -s。
#
# 用法:
#   ./install-skill.sh                      # 自动探测：脚本所在仓库的 .claude/skills/* 全装
#   ./install-skill.sh <技能目录> [...]      # 指定技能目录，或含技能的父目录（装其下所有）
#   ./install-skill.sh -s <父目录>           # 显式指定源技能根
#
# 选项:
#   -t, --target DIR   目标技能根（默认 $CLAUDE_CONFIG_DIR/skills 或 ~/.claude/skills）
#   -s, --source DIR   源技能根（默认自动探测）
#   -f, --force        同名实体目录冲突时，改名备份为 <名>.bak 后再链接
#   -n, --dry-run      只打印将要做的事，不落盘
#   -h, --help         帮助
#
# 输出标记: + 新建   = 已是最新   ! 异常/跳过   - 清理

set -u

OS=unknown
case "$(uname -s 2>/dev/null || echo unknown)" in
  MINGW*|MSYS*|CYGWIN*) OS=windows ;;
  Linux*)               OS=linux ;;
  Darwin*)              OS=darwin ;;
esac
UNAME_S=$(uname -s 2>/dev/null || echo unknown)

usage() { awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"; }

DRY=0
FORCE=0
SRC_ARG=
TARGET_ARG=
SOURCES=()

while [ $# -gt 0 ]; do
  case "$1" in
    -t|--target) TARGET_ARG=${2:-}; shift 2 ;;
    -s|--source) SRC_ARG=${2:-};    shift 2 ;;
    -f|--force)  FORCE=1; shift ;;
    -n|--dry-run) DRY=1; shift ;;
    -h|--help)   usage; exit 0 ;;
    --) shift; while [ $# -gt 0 ]; do SOURCES+=("$1"); shift; done ;;
    -*) echo "未知选项: $1（-h 看用法）" >&2; exit 2 ;;
    *)  SOURCES+=("$1"); shift ;;
  esac
done

die() { echo "!! $*" >&2; exit 1; }

# ── 路径工具 ────────────────────────────────────────────────────────────────
abs() { ( cd "$1" 2>/dev/null && pwd -P ) || printf '%s' "$1"; }

win_path() { cygpath -w -a "$1"; }

norm() {
  if [ "$OS" = windows ] && command -v cygpath >/dev/null 2>&1; then
    cygpath -a -u "$1" 2>/dev/null || printf '%s' "$1"
  else
    printf '%s' "$1"
  fi
}

# ── 建链 / 删链 ─────────────────────────────────────────────────────────────
# 用 mklink /J 建 junction：无需管理员/开发者模式，MSYS 侧 readlink 可正常读取
make_link() { # $1=link $2=target
  local link=$1 target=$2 wl wt
  if [ "$OS" = windows ]; then
    if command -v cygpath >/dev/null 2>&1; then
      wl=$(win_path "$link"); wt=$(win_path "$target")
      # MSYS_NO_PATHCONV / MSYS2_ARG_CONV_EXCL 防止 /J 被 MSYS 当成路径改写
      MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cmd /c mklink /J "$wl" "$wt" >/dev/null 2>&1 && return 0
      if command -v pwsh >/dev/null 2>&1; then
        pwsh -NoProfile -NonInteractive -Command \
          "New-Item -ItemType Junction -Path '$wl' -Target '$wt' -Force | Out-Null" >/dev/null 2>&1 && return 0
      fi
    fi
    MSYS=winsymlinks:nativestrict ln -s "$target" "$link" 2>/dev/null && return 0
    return 1
  fi
  ln -sfn "$target" "$link"
}

# 只删链接本身，绝不递归删除（rm -rf 作用于 junction 会删掉源目录内容）
remove_link() {
  local link=$1
  if [ "$OS" = windows ] && command -v cygpath >/dev/null 2>&1; then
    MSYS_NO_PATHCONV=1 cmd /c rmdir "$(win_path "$link")" >/dev/null 2>&1 && return 0
  fi
  rm -f "$link"
}

is_link() { [ -L "$1" ]; }
link_points_to() { # $1=link $2=期望目标
  local cur; cur=$(readlink "$1" 2>/dev/null) || return 1
  [ "$cur" = "$2" ] || [ "$(norm "$cur")" = "$(norm "$2")" ]
}

# ── 源探测 ──────────────────────────────────────────────────────────────────
has_skill_children() {
  local d c
  for c in "$1"/*/; do
    [ -f "${c}SKILL.md" ] && return 0
  done
  return 1
}

autodetect_source() {
  local d i=0 c
  d=$(abs "$(dirname "${BASH_SOURCE[0]}")") || return 1
  while [ "$i" -lt 8 ]; do
    # 脚本自身就在技能根里 / 在某技能的子目录里
    if [ "$(basename "$d")" = skills ] || has_skill_children "$d"; then
      printf '%s\n' "$d"; return 0
    fi
    # 脚本位于仓库 scripts/ 等位置：向上找仓库根的 agent 技能目录
    for c in "$d/.claude/skills" "$d/.agents/skills" "$d/.dsh/skills"; do
      if [ -d "$c" ] && has_skill_children "$c"; then
        printf '%s\n' "$(abs "$c")"; return 0
      fi
    done
    [ "$d" = "/" ] && break
    d=$(dirname "$d"); i=$((i + 1))
  done
  return 1
}

expand_source() { # 参数 → 技能目录列表（直接是技能则取自身，否则取其下含 SKILL.md 的子目录）
  local p=$1 c found=0
  if [ -f "$p/SKILL.md" ]; then
    printf '%s\n' "$(abs "$p")"; return 0
  fi
  for c in "$p"/*/; do
    [ -f "${c}SKILL.md" ] || continue
    printf '%s\n' "$(abs "${c%/}")"; found=1
  done
  [ "$found" = 1 ] || echo "!! $p 下没有找到含 SKILL.md 的技能目录" >&2
}

# ── 目标 ────────────────────────────────────────────────────────────────────
if [ -n "$TARGET_ARG" ]; then
  TARGET=$(abs "$TARGET_ARG")
else
  TARGET=$(abs "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills")
fi

SRC_ROOTS=()
SKILL_DIRS=()
if [ -n "$SRC_ARG" ]; then
  SRC_ROOTS+=("$(abs "$SRC_ARG")")
  while IFS= read -r line; do SKILL_DIRS+=("$line"); done < <(expand_source "$(abs "$SRC_ARG")")
elif [ ${#SOURCES[@]} -gt 0 ]; then
  for s in "${SOURCES[@]}"; do
    [ -d "$s" ] || die "源不存在: $s"
    SRC_ROOTS+=("$(abs "$s")")
    while IFS= read -r line; do SKILL_DIRS+=("$line"); done < <(expand_source "$s")
  done
else
  auto=$(autodetect_source) || die "自动探测源技能目录失败，请用 -s <技能根> 指定"
  SRC_ROOTS+=("$auto")
  while IFS= read -r line; do SKILL_DIRS+=("$line"); done < <(expand_source "$auto")
fi

[ ${#SKILL_DIRS[@]} -gt 0 ] || die "没有可安装的技能"

echo "平台    : $OS ($UNAME_S)"
echo "源      : ${SRC_ROOTS[*]}"
echo "目标    : $TARGET"
echo "技能数  : ${#SKILL_DIRS[@]}"
[ "$DRY" = 1 ] && echo "模式    : dry-run（不落盘）"
echo

[ "$DRY" = 1 ] || mkdir -p "$TARGET" || die "无法创建目标目录: $TARGET"

echo "[1/2] 建立/更新链接"
ADDED=0; SAME=0; SKIP=0; FAIL=0
for src in "${SKILL_DIRS[@]}"; do
  name=$(basename "$src")
  link="$TARGET/$name"
  if is_link "$link"; then
    if link_points_to "$link" "$src"; then
      echo "  = $name"; SAME=$((SAME + 1)); continue
    fi
    echo "  ~ $name (原指向 $(readlink "$link")，重链)"
    [ "$DRY" = 1 ] || remove_link "$link"
  elif [ -e "$link" ]; then
    if [ "$FORCE" = 1 ]; then
      if [ -e "$link.bak" ]; then
        echo "  ! $name 是实体目录，且 $name.bak 已存在，跳过（人工处理）"; SKIP=$((SKIP + 1)); continue
      fi
      if [ "$DRY" = 1 ]; then
        echo "  + $name (dry-run: 实体目录将改名为 $name.bak)"
      else
        mv "$link" "$link.bak" || { echo "  ! $name 备份失败，跳过"; SKIP=$((SKIP + 1)); continue; }
        echo "  + $name (实体目录已备份为 $name.bak)"
      fi
    else
      echo "  ! $name 是实体目录/文件，跳过（加 -f 可备份后改为链接）"; SKIP=$((SKIP + 1)); continue
    fi
  fi
  if [ "$DRY" = 1 ]; then
    echo "  + $name -> $src"; ADDED=$((ADDED + 1)); continue
  fi
  if make_link "$link" "$src" && [ -e "$link/SKILL.md" ]; then
    echo "  + $name -> $src"; ADDED=$((ADDED + 1))
  else
    echo "  ! $name 建链失败（$link）"; FAIL=$((FAIL + 1))
  fi
done

echo
echo "[2/2] 清理指向源根、但源已删除的悬空链接"
PRUNED=0
for l in "$TARGET"/*; do
  is_link "$l" || continue
  t=$(readlink "$l" 2>/dev/null) || continue
  for r in "${SRC_ROOTS[@]}"; do
    case "$(norm "$t")" in
      "$(norm "$r")"/*)
        if [ ! -e "$t" ]; then
          if [ "$DRY" = 1 ]; then echo "  - $(basename "$l") (dry-run)"; else
            remove_link "$l" && echo "  - $(basename "$l") (源已删除)"; fi
          PRUNED=$((PRUNED + 1))
        fi
        ;;
    esac
  done
done
[ "$PRUNED" = 0 ] && echo "  （无）"

echo
echo "完成: 新建 $ADDED，已是链接 $SAME，跳过 $SKIP，失败 $FAIL，清理 $PRUNED"
[ "$FAIL" -gt 0 ] && exit 1
exit 0
