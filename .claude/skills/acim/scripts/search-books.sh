#!/usr/bin/env bash
# search-books.sh — 在 ACIM 五部语料中搜索关键词 (Bash / git-bash / WSL)
# 用法:
#   ./search-books.sh "宽恕"
#   ./search-books.sh "神圣一刻" --source "01.正文"
#   ./search-books.sh "小我" --max 50 --context 3
#   ./search-books.sh "T-15\.V" --source "01.正文"

set -euo pipefail
export LC_ALL=C.UTF-8

QUERY=""
SOURCE="all"
MAX_HITS=20
CONTEXT=2
CASE_FLAG=""

usage() {
    cat <<EOF
用法: $0 <query> [选项]
选项:
  --source <name>   指定语料目录 (01.正文|02.练习手册|03.教师指南|04.词汇解释|05.补编：心理治疗目的、过程与行业|all)
  --max <N>         最多显示命中数 (默认 20)
  --context <N>     上下文行数 (默认 2)
  --case            大小写敏感
  -h, --help        显示帮助
EOF
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --source) SOURCE="$2"; shift 2 ;;
        --max) MAX_HITS="$2"; shift 2 ;;
        --context) CONTEXT="$2"; shift 2 ;;
        --case) CASE_FLAG="--case-sensitive"; shift ;;
        -h|--help) usage ;;
        -*) echo "未知选项: $1"; usage ;;
        *) QUERY="$1"; shift ;;
    esac
done

if [[ -z "$QUERY" ]]; then
    echo "错误: 缺少查询关键词"
    usage
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCES_DIR="$(cd "$SCRIPT_DIR/../../../../src/books" && pwd)"

declare -A LABEL=(
    ["01.正文"]="正文"
    ["02.练习手册"]="练习手册"
    ["03.教师指南"]="教师指南"
    ["04.词汇解释"]="词汇解释"
    ["05.补编：心理治疗目的、过程与行业"]="补编"
)

if [[ "$SOURCE" == "all" ]]; then
    TARGETS=("01.正文" "02.练习手册" "03.教师指南" "04.词汇解释" "05.补编：心理治疗目的、过程与行业")
else
    TARGETS=("$SOURCE")
fi

echo "🔍 ACIM 语料搜索"
echo "------------------------------------------------------------"
echo "查询: $QUERY"
echo "范围: ${TARGETS[*]}"
echo ""

TOTAL=0
for file in "${TARGETS[@]}"; do
    path="$SOURCES_DIR/$file"
    if [[ ! -e "$path" ]]; then
        echo "⚠ 目录不存在: $path" >&2
        continue
    fi
    echo "📖 [${LABEL[$file]}] $file"
    echo "------------------------------------------------------------"

    if command -v rg >/dev/null 2>&1; then
        COUNT=$(rg --count $CASE_FLAG --glob '*.md' --glob '!index.md' "$QUERY" "$path" 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}'; true)
        echo "  命中: $COUNT"
        if [[ "$COUNT" -gt 0 ]]; then
            rg $CASE_FLAG --glob '*.md' --glob '!index.md' --line-number --context "$CONTEXT" "$QUERY" "$path" \
                | awk -v max="$MAX_HITS" -v count="$COUNT" '
                BEGIN { cnt=0; skip=0 }
                {
                    if (skip) next
                    if ($0 == "--") { print "  ───"; next }
                    if (match($0, /:[0-9]+:/)) {
                        cnt++
                        if (cnt > max) { skip=1; next }
                    }
                    txt=$0
                    if (length(txt)>250) txt=substr(txt,1,200) "..."
                    print "  " txt
                }
                END {
                    remaining = count - max
                    if (remaining > 0) print "  ... (还有 " remaining " 条未显示)"
                }'
        fi
        TOTAL=$((TOTAL + COUNT))
    else
        COUNT=$(grep -r --include='*.md' --exclude='index.md' -c "$QUERY" "$path" 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}'; true)
        echo "  命中: $COUNT"
        if [[ "$COUNT" -gt 0 ]]; then
            grep -r --include='*.md' --exclude='index.md' -n -B "$CONTEXT" -A "$CONTEXT" "$QUERY" "$path" \
                | awk -v max="$MAX_HITS" -v count="$COUNT" '
                BEGIN { cnt=0; skip=0 }
                {
                    if (skip) next
                    if ($0 == "--") { print "  ───"; next }
                    if (match($0, /:[0-9]+:/)) {
                        cnt++
                        if (cnt > max) { skip=1; next }
                    }
                    txt=$0
                    if (length(txt)>250) txt=substr(txt,1,200) "..."
                    print "  " txt
                }
                END {
                    remaining = count - max
                    if (remaining > 0) print "  ... (还有 " remaining " 条未显示)"
                }'
        fi
        TOTAL=$((TOTAL + COUNT))
    fi
    echo ""
done

echo "------------------------------------------------------------"
echo "总命中: $TOTAL"
