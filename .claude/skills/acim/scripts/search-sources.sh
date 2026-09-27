#!/usr/bin/env bash
# search-sources.sh — 在 ACIM 四部源文档中搜索关键词 (Bash / git-bash / WSL)
# 用法:
#   ./search-sources.sh "宽恕"
#   ./search-sources.sh "神圣一刻" --source acim-1.正文.md
#   ./search-sources.sh "小我" --max 50 --context 3

set -euo pipefail

QUERY=""
SOURCE="all"
MAX_HITS=20
CONTEXT=2
CASE_FLAG=""

usage() {
    cat <<EOF
用法: $0 <query> [选项]
选项:
  --source <name>   指定源文件 (acim-1.正文.md|acim-2.练习手册.md|acim-3.教师指南.md|acim-4.词汇解释.md|all)
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
SOURCES_DIR="$(cd "$SCRIPT_DIR/../sources" && pwd)"

declare -A LABEL=(
    ["acim-1.正文.md"]="正文"
    ["acim-2.练习手册.md"]="练习手册"
    ["acim-3.教师指南.md"]="教师指南"
    ["acim-4.词汇解释.md"]="词汇解释"
)

if [[ "$SOURCE" == "all" ]]; then
    TARGETS=("acim-1.正文.md" "acim-2.练习手册.md" "acim-3.教师指南.md" "acim-4.词汇解释.md")
else
    TARGETS=("$SOURCE")
fi

echo "🔍 ACIM 源文档搜索"
echo "------------------------------------------------------------"
echo "查询: $QUERY"
echo "范围: ${TARGETS[*]}"
echo ""

TOTAL=0
for file in "${TARGETS[@]}"; do
    path="$SOURCES_DIR/$file"
    if [[ ! -e "$path" ]]; then
        echo "⚠ 文件不存在: $path" >&2
        continue
    fi
    echo "📖 [${LABEL[$file]}] $file"
    echo "------------------------------------------------------------"

    if command -v rg >/dev/null 2>&1; then
        COUNT=$(rg --count $CASE_FLAG "$QUERY" "$path" || true)
        if [[ -n "$COUNT" && "$COUNT" -gt 0 ]]; then
            rg $CASE_FLAG --context "$CONTEXT" --max-count "$MAX_HITS" "$QUERY" "$path" | \
                awk -v max="$MAX_HITS" -v count="$COUNT" '
                NR==1 { print "  命中: " count; next }
                /--/ { print "  ───"; next }
                { sub(/^[^:]+:/, ""); print "  " $0 }
                END { if (count > max) print "  ... (还有 " (count - max) " 条未显示)" }'
        else
            echo "  命中: 0"
        fi
        TOTAL=$((TOTAL + COUNT))
    else
        COUNT=$(grep $CASE_FLAG -c "$QUERY" "$path" 2>/dev/null || echo 0)
        echo "  命中: $COUNT"
        if [[ "$COUNT" -gt 0 ]]; then
            grep $CASE_FLAG -B "$CONTEXT" -A "$CONTEXT" -m "$MAX_HITS" "$QUERY" "$path" | \
                awk -v max="$MAX_HITS" -v count="$COUNT" '
                /--/ { print "  ───"; next }
                /^[^:]+:/ { sub(/^[^:]+:/, ""); print "  " $0; next }
                { print "  " $0 }
                END { if (count > max) print "  ... (还有 " (count - max) " 条未显示)" }'
        fi
        TOTAL=$((TOTAL + COUNT))
    fi
    echo ""
done

echo "------------------------------------------------------------"
echo "总命中: $TOTAL"
