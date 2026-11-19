# Auto Git Commit & Push
# Set COMMIT_API_KEY in environment, or enter interactively when prompted.

$ErrorActionPreference = "Stop"

# ---------- force UTF-8 everywhere ----------
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$env:GIT_CONFIG_PARAMETERS = "'core.quotepath=false' 'i18n.commitEncoding=utf-8' 'i18n.logOutputEncoding=utf-8'"
$env:LC_ALL = "en_US.UTF-8"
$env:LANG   = "en_US.UTF-8"
# ---------- config ----------
$COMMIT_DEBUG_MODE = ($env:COMMIT_DEBUG_MODE -eq "true")
$COMMIT_BASE_URL   = if ($env:COMMIT_BASE_URL)   { $env:COMMIT_BASE_URL }   else { "https://api.siliconflow.cn/v1" }
$COMMIT_MODEL  = if ($env:COMMIT_MODEL)  { $env:COMMIT_MODEL }              else { "Qwen/Qwen3-Coder-30B-A3B-Instruct" }
# 超大变更集降级阈值：文件数超 300 或压缩后 diff 仍超 400KB → 改用目录聚合
$LARGE_FILE_COUNT    = 300
$MAX_CONDENSED_CHARS = 400000

if ($env:COMMIT_API_KEY) {
    $apiKey = $env:COMMIT_API_KEY.Trim()
} else {
    Write-Host "COMMIT_API_KEY not set in environment." -ForegroundColor Yellow
    $inputKey = Read-Host -Prompt "Enter COMMIT_API_KEY(CTRL+V)"
    if (-not $inputKey) {
        Write-Host "No key provided. Exiting." -ForegroundColor Red
        exit 1
    }
    $apiKey = $inputKey.Trim()
    $env:COMMIT_API_KEY = $apiKey
    # Persist to Windows user environment variable so it survives across sessions
    [Environment]::SetEnvironmentVariable("COMMIT_API_KEY", $apiKey, "User")
    Write-Host "COMMIT_API_KEY saved to user environment." -ForegroundColor Green
}

if (-not $apiKey) {
    Write-Host "Error: COMMIT_API_KEY is empty." -ForegroundColor Red
    exit 1
}

# ---------- ensure git on PATH ----------
$gitPaths = @("C:\Program Files\Git\cmd", "C:\Program Files (x86)\Git\cmd")
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    foreach ($p in $gitPaths) {
        if (Test-Path $p) { $env:PATH = "$p;$env:PATH"; break }
    }
}

# ---------- prompt template ----------
$LLM_PROMPT_TEMPLATE = @"
根据下面的 Git diff 生成中文提交信息。

输出格式（严格遵循）：
一句话概括本次变更
    - [新增] 文件名：变更说明
    - [修改] 文件名：变更说明
    - [删除] 文件名：变更说明

重要规则：
- 不要包含任何解释、推理或分析
- 不要使用 <thinking>、<think> 等思考标签
- 不要包含 "变更内容:" 或 diff 详情
- 只输出提交信息，不要其他任何内容
- 概述和变更说明均使用中文

Git Diff:
{0}
"@

# ---------- helpers ----------
function Clear-GitProcesses {
    try {
        Write-Host "Checking for existing Git processes..." -ForegroundColor Cyan
        $procs = Get-Process -Name "git" -ErrorAction SilentlyContinue
        if ($procs -and $procs.Count -gt 0) {
            Write-Host "Found $($procs.Count) Git process(es), stopping..." -ForegroundColor Yellow
            $procs | Stop-Process -Force
            Start-Sleep -Seconds 2
        } else {
            Write-Host "No existing Git processes detected." -ForegroundColor Green
        }
        Write-Host "Checking for Git lock files..." -ForegroundColor Cyan
        $lockFiles = @()
        $indexLock = Join-Path ".git" "index.lock"
        if (Test-Path $indexLock) { $lockFiles += $indexLock }
        if (Test-Path ".git") {
            $lockFiles += Get-ChildItem -Path ".git" -Recurse -Filter "*.lock" | Select-Object -ExpandProperty FullName
        }
        if ($lockFiles.Count -gt 0) {
            Write-Host "Removing $($lockFiles.Count) lock file(s)..." -ForegroundColor Yellow
            foreach ($f in $lockFiles) {
                Remove-Item -Path $f -Force -ErrorAction SilentlyContinue
                Write-Host "  $f - $(if (Test-Path $f) { 'FAILED' } else { 'removed' })"
            }
        }
    } catch {
        Write-Host "Warning clearing Git state: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Get-GitChanges {
    $staged = git diff --staged --name-status 2>$null
    if (-not $staged) { return $null }
    $changes = @{ added = @(); modified = @(); deleted = @() }
    $staged | ForEach-Object {
        $status, $file = $_ -split "\s+", 2
        switch ($status) {
            "A" { $changes["added"]    += $file }
            "M" { $changes["modified"] += $file }
            "D" { $changes["deleted"]  += $file }
        }
    }
    return $changes
}

function Get-CondensedDiff {
    # 控制 LLM 入参体积，避免 provider 400 拒收：
    # - 全量 --stat 概览（覆盖每个文件，token 近零，必送）
    # - -U0 零上下文 hunk，单文件超 50 行截断并标注省略行数
    $cap = 50
    try {
        $stat = git diff --cached --stat 2>$null
        $u0   = git diff --staged -U0 2>$null
        if (-not $u0) { return "No changes detected" }
        $text   = [string]::Join("`n", $u0)
        $chunks = [regex]::Split($text, '(?m)^(?=diff --git )') | Where-Object { $_.Trim() }
        $sb = New-Object System.Text.StringBuilder
        foreach ($c in $chunks) {
            $lines = $c -split "`n"
            if ($lines.Count -gt $cap) {
                [void]$sb.AppendLine([string]::Join("`n", $lines[0..($cap-1)]))
                [void]$sb.AppendLine("# ... 共 $($lines.Count) 行变更，已省略 $($lines.Count-$cap) 行")
            } else {
                [void]$sb.AppendLine($c)
            }
        }
        $statText = if ($stat) { [string]::Join("`n", $stat) } else { "" }
        return "【全局概览】`n$statText`n`n【变更明细（部分大文件已截断）】`n" + $sb.ToString()
    } catch {
        return "Error getting diff content"
    }
}

function Get-AggregatedDiff {
    # 超大变更集降级路径：numstat 按二级目录聚合，输出体积 O(目录数)，与仓库大小无关
    try {
        $num = git diff --staged --numstat 2>$null
        if (-not $num) { return "No changes detected" }
        $groups = @{}
        $binFiles = 0; $totalA = 0L; $totalD = 0L; $totalN = 0
        foreach ($line in ([string]::Join("`n", $num) -split "`n")) {
            $p = $line -split "`t", 3
            if ($p.Count -lt 3) { continue }
            $a = $p[0]; $d = $p[1]; $path = $p[2].Trim()
            $segs = $path -split '/'
            $top  = if ($segs.Count -ge 2) { "$($segs[0])/$($segs[1])" } else { "$($segs[0])" }
            if (-not $groups.ContainsKey($top)) { $groups[$top] = @{ A = 0L; D = 0L; N = 0; B = 0; NA = 0; NM = 0; ND = 0 } }
            $g = $groups[$top]
            if ($a -eq '-') { $g.B++; $binFiles++ } else { $g.A += [long]$a; $g.D += [long]$d }
            $g.N++; $totalN++
            if ($a -ne '-') { $totalA += [long]$a; $totalD += [long]$d }
        }
        # 按 name-status 统计各目录下 新增/修改/删除 文件数，修正聚合信息中的文件状态
        $statusLines = git diff --staged --name-status 2>$null
        foreach ($line in ([string]::Join("`n", $statusLines) -split "`n")) {
            $p = $line -split "`t"
            if ($p.Count -lt 2) { continue }
            $st = $p[0].Substring(0, 1)
            $path = $p[-1].Trim()
            $segs = $path -split '/'
            $top  = if ($segs.Count -ge 2) { "$($segs[0])/$($segs[1])" } else { "$($segs[0])" }
            if (-not $groups.ContainsKey($top)) { continue }
            switch ($st) { "A" { $groups[$top].NA++ } "M" { $groups[$top].NM++ } "D" { $groups[$top].ND++ } }
        }
        $sb = [System.Text.StringBuilder]::new()
        [void]$sb.AppendLine("【全局统计】 $totalN 个文件，共 +$totalA/-$totalD 行（含二进制 $binFiles 个）")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("【按目录聚合（二级目录）】")
        foreach ($k in ($groups.Keys | Sort-Object)) {
            $g = $groups[$k]
            $binNote = if ($g.B) { "，含二进制 $($g.B) 个" } else { "" }
            [void]$sb.AppendLine("$k/ : +$($g.A)/-$($g.D) （$($g.N) 文件：新增 $($g.NA)/修改 $($g.NM)/删除 $($g.ND)$binNote）")
        }
        return $sb.ToString()
    } catch {
        return "Error getting diff content"
    }
}

function Get-LLMCommitMessage {
    param([Parameter(Mandatory)] [string]$diffContent)
    $prompt = $LLM_PROMPT_TEMPLATE -f $diffContent
    $maxRetries = 3
    for ($i = 0; $i -lt $maxRetries; $i++) {
        try {
            Write-Host "Calling $COMMIT_MODEL ..." -ForegroundColor Cyan
            $headers = @{ "Authorization" = "Bearer $apiKey"; "Content-Type" = "application/json" }
            $body = @{
                model       = $COMMIT_MODEL
                messages    = @(@{ role = "user"; content = $prompt })
                top_p       = 0.7
                temperature = 0.9
            } | ConvertTo-Json -Depth 5
            $response = Invoke-RestMethod -Uri "$COMMIT_BASE_URL/chat/completions" -Method Post -Headers $headers -Body $body -ContentType "application/json"
            if ($response -and $response.choices -and $response.choices.count -gt 0) {
                $msg = $response.choices[0].message.content
                $msg = $msg -replace '(?s)<thinking>.*?</thinking>', ''
                $msg = $msg -replace '(?s)<think>.*?</think>', ''
                $msg = $msg -replace '(?s)<analysis>.*?</analysis>', ''
                $msg = $msg -replace '(?s)<reasoning>.*?</reasoning>', ''
                $msg = $msg -replace '(?s)（思考）.*?（思考）', ''
                $msg = $msg -replace '(?s)【思考】.*?【/思考】', ''
                $msg = $msg -replace '(?s)（推理）.*?（/推理）', ''
                $clean = $msg.Trim() -replace '(?m)^[ \t]+', ''
                $clean = $clean -replace '(?im)^(commit message|提交信息)[：:]\s*', ''
                if ($clean -match '(?m)^概述[：:]\s*(.*?)(\r?\n|$)') {
                    $summary = $matches[1].Trim()
                    $clean   = $clean -replace '(?m)^概述[：:]\s*.*?(\r?\n|$)', ''
                    $clean   = "概述：$summary`r`n" + $clean.TrimStart()
                }
                $clean = $clean -replace '(?<!\r?\n)\s*-\s*\[', "`r`n- ["
                $clean = $clean -replace '(?m)^\s*$\r?\n', ''
                return $clean
            }
            throw "No valid response from LLM"
        } catch {
            if ($i -lt $maxRetries - 1) {
                Write-Host "Retry $($i+1)/${maxRetries}: $($_.Exception.Message)" -ForegroundColor Yellow
                Start-Sleep -Seconds (2 * ($i + 1))
            } else {
                Write-Host "LLM failed after ${maxRetries} retries: $($_.Exception.Message)" -ForegroundColor Red
                return $null
            }
        }
    }
    return $null
}

# ====================== main ======================
try {
    Clear-GitProcesses

    Write-Host "`nStaging all changes..." -ForegroundColor Cyan
    git add -A
    if ($LASTEXITCODE -ne 0) { throw "Failed to stage files" }
    Write-Host "Files staged." -ForegroundColor Green

    Write-Host "`nChecking staged changes..." -ForegroundColor Cyan
    $changes = Get-GitChanges
    if (-not $changes) {
        Write-Host "No changes to commit." -ForegroundColor Green
        exit 0
    }

    $fileCount = @($changes["added"]).Count + @($changes["modified"]).Count + @($changes["deleted"]).Count
    if ($fileCount -gt $LARGE_FILE_COUNT) {
        Write-Host "$fileCount files staged (> $LARGE_FILE_COUNT) — using directory-aggregated diff" -ForegroundColor Yellow
        $diffContent = Get-AggregatedDiff
    } else {
        $diffContent = Get-CondensedDiff
        if ($diffContent.Length -gt $MAX_CONDENSED_CHARS) {
            Write-Host "Condensed diff is $($diffContent.Length) chars (> $MAX_CONDENSED_CHARS) — falling back to directory aggregation" -ForegroundColor Yellow
            $diffContent = Get-AggregatedDiff
        }
    }

    Write-Host "`nGenerating commit message via LLM..." -ForegroundColor Cyan
    $commitMessage = Get-LLMCommitMessage -diffContent $diffContent
    if (-not $commitMessage) {
        $currentDate   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $commitMessage = "概述：自动备份提交（LLM 生成失败）`r`n    - [修改] 暂存区文件"
        Write-Host "Using fallback commit message." -ForegroundColor Yellow
    }

    Write-Host "`nCommit message:" -ForegroundColor Cyan
    Write-Host $commitMessage -ForegroundColor Green

    if ($COMMIT_DEBUG_MODE) {
        Write-Host "`n[Debug mode] Commit & push skipped." -ForegroundColor Yellow
    } else {
        Write-Host "`nCommitting..." -ForegroundColor Cyan
        $tmpFile = [System.IO.Path]::GetTempFileName()
        [System.IO.File]::WriteAllText($tmpFile, $commitMessage, [System.Text.UTF8Encoding]::new($false))
        git commit -F $tmpFile 2>&1 | ForEach-Object { Write-Host $_ -ForegroundColor Green }
        $commitExit = $LASTEXITCODE
        Remove-Item $tmpFile -Force
        if ($commitExit -ne 0) { throw "git commit failed (exit code $commitExit)" }
        Write-Host "Commit OK." -ForegroundColor Green

        Write-Host "`nPushing all branches..." -ForegroundColor Cyan
        $pushOutput = git push --all origin 2>&1
        $pushOutput | ForEach-Object { Write-Host $_ -ForegroundColor Green }
        $pushExit = $LASTEXITCODE
        if ($pushExit -ne 0) { throw "git push failed (exit code $pushExit)" }
        Write-Host "Push OK." -ForegroundColor Green
    }

    Write-Host "`n=== Done ===" -ForegroundColor Green
} catch {
    Write-Host "`nError: $_" -ForegroundColor Red
} finally {
    # 人工双击运行则暂停等待按键；被 agent/管道调用（stdin 重定向）时直接结束
    if (-not [Console]::IsInputRedirected) {
        Write-Host "`nPress any key to exit..." -ForegroundColor Cyan
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}
