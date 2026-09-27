# search-sources.ps1 — 在 ACIM 四部源文档中搜索关键词
# 用法:
#   .\search-sources.ps1 -Query "宽恕"
#   .\search-sources.ps1 -Query "神圣一刻" -Source "acim-1.正文.md"
#   .\search-sources.ps1 -Query "第121课" -Source "acim-2.练习手册.md" -Context 3
#   .\search-sources.ps1 -Query "小我" -MaxHits 50

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Query,

    [ValidateSet("all","acim-1.正文.md","acim-2.练习手册.md","acim-3.教师指南.md","acim-4.词汇解释.md")]
    [string]$Source = "all",

    [int]$Context = 2,

    [int]$MaxHits = 20,

    [switch]$CaseSensitive,

    [switch]$Regex
)

$ErrorActionPreference = "Stop"
$sourcesDir = Join-Path $PSScriptRoot "..\sources"
$sourcesDir = (Resolve-Path $sourcesDir).Path

$sourceMap = @{
    "acim-1.正文.md"      = "正文"
    "acim-2.练习手册.md"   = "练习手册"
    "acim-3.教师指南.md"   = "教师指南"
    "acim-4.词汇解释.md"   = "词汇解释"
}

$targets = if ($Source -eq "all") { $sourceMap.Keys } else { @($Source) }

Write-Output "🔍 ACIM 源文档搜索"
Write-Output ("─" * 60)
Write-Output "查询: $Query"
Write-Output "范围: $($targets -join ', ')"
Write-Output ""

$totalHits = 0
foreach ($file in $targets) {
    $path = Join-Path $sourcesDir $file
    if (-not (Test-Path $path)) {
        Write-Warning "文件不存在: $path"
        continue
    }

    $label = $sourceMap[$file]
    Write-Output "📖 [$label] $file"
    Write-Output ("─" * 60)

    $hits = Select-String -Path $path -Pattern $Query -Context $Context
    if ($CaseSensitive) {
        $hits = Select-String -Path $path -Pattern $Query -Context $Context -CaseSensitive
    }
    $hitCount = if ($hits) { @($hits).Count } else { 0 }
    Write-Output "命中: $hitCount"

    if ($hits -and $MaxHits -gt 0) {
        $shown = $hits | Select-Object -First $MaxHits
        $shown | ForEach-Object {
            $lineNum = $_.LineNumber
            $lineText = $_.Line.Trim()
            if ($lineText.Length -gt 200) {
                $lineText = $lineText.Substring(0,200) + "..."
            }
            Write-Output "  [行 $lineNum] $lineText"
        }
        if ($hitCount -gt $MaxHits) {
            Write-Output "  ... (还有 $($hitCount - $MaxHits) 条未显示)"
        }
    }
    Write-Output ""
    $totalHits += $hitCount
}

Write-Output ("─" * 60)
Write-Output "总命中: $totalHits"
