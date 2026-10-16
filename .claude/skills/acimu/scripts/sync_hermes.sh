#!/usr/bin/env bash
# acimu: 同步 acim-web 仓库技能到 hermes skills 目录
# 用法: ssh yg@192.168.1.123 'bash -s' < sync_hermes.sh
set -u

REPO=/home/yg/__work/acim-web
SRC="$REPO/.claude/skills"
DEST="$HOME/.hermes/skills"

echo "[1/3] 拉取仓库 $REPO"
git -C "$REPO" pull --ff-only || { echo "!! git pull 失败，中止"; exit 1; }

echo "[2/3] 建立/更新符号链接 $SRC -> $DEST"
for d in "$SRC"/*/; do
  n=$(basename "$d")
  target="${d%/}"
  link="$DEST/$n"
  if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
    echo "  = $n (已是最新)"
  elif [ -e "$link" ] && [ ! -L "$link" ]; then
    echo "  ! $n 是实体目录/文件，跳过（需人工处理）"
  else
    ln -sfn "$target" "$link" && echo "  + $n -> $target"
  fi
done

echo "[3/3] 清理悬空链接"
for l in "$DEST"/*; do
  [ -L "$l" ] || continue
  t=$(readlink "$l")
  case "$t" in
    "$SRC"/*)
      if [ ! -e "$t" ]; then
        rm "$l" && echo "  - $(basename "$l") (目标已删除)"
      fi
      ;;
  esac
done
echo "完成"
