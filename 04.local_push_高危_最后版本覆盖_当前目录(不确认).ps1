# Force Push 当前目录到远程仓库
# 危险操作 - 会覆盖远程所有内容

$currentPath = $PWD.Path
$repoName = Split-Path $currentPath -Leaf

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "       危险操作 - Force Push 当前目录" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "当前目录: $currentPath" -ForegroundColor Yellow
Write-Host "仓库名称: $repoName" -ForegroundColor Yellow
Write-Host ""

# 无确认 - 直接执行

Write-Host ""
Write-Host "==> 正在覆盖 $repoName ..." -ForegroundColor Red

# 记录现有的远程仓库URL（如果存在）
$existingRemoteUrl = git remote get-url origin 2>$null

# Remove .git directory
Remove-Item -Recurse -Force .git -ErrorAction SilentlyContinue

# Reinitialize git repository
git init
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] git init 失败" -ForegroundColor Red
    exit 1
}

# 检测远程默认分支(非空仓库才有 origin/HEAD,失败回落 main)
$branchName = 'main'
$remoteHead = git symbolic-ref --short refs/remotes/origin/HEAD 2>$null
if ($remoteHead) { $branchName = $remoteHead }
git checkout -b $branchName 2>$null   # 已有分支则忽略

# Remove nested .git directories (they cause "unable to index" errors)
Get-ChildItem -Recurse -Directory | ForEach-Object {
    if ($_.Name -eq '.git' -and $_.FullName -ne (Join-Path $PWD '.git')) {
        Remove-Item -Recurse -Force $_.FullName
    }
}

# 检查是否有远程仓库配置
if ([string]::IsNullOrEmpty($existingRemoteUrl)) {
    $remoteUrl = Read-Host "请输入远程仓库URL"
    git remote add origin $remoteUrl
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] 添加远程仓库失败" -ForegroundColor Red
        exit 1
    }
} else {
    git remote add origin $existingRemoteUrl
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] 恢复远程仓库失败" -ForegroundColor Red
        exit 1
    }
    $remoteUrl = $existingRemoteUrl
}

Write-Host "远程仓库: $remoteUrl" -ForegroundColor Cyan

# Add all files in this directory
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] git add 失败" -ForegroundColor Red
    exit 1
}

# Remove this script from tracking (don't commit .ps1 files)
git rm --cached "$($MyInvocation.MyCommand.Name)" 2>$null

# Set execute permission for .sh files (Windows git doesn't preserve exec bit automatically)
Get-ChildItem -Recurse -File -Filter "*.sh" | ForEach-Object {
    git update-index --chmod=+x $_.FullName.Substring($PWD.Path.Length + 1)
}

# Commit with message "ORG"
git commit -m "ORG"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] git commit 失败" -ForegroundColor Red
    exit 1
}

# Force push to master
git push -f -u origin $branchName
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] git push 失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==> $repoName 完成" -ForegroundColor Green
Write-Host "已成功覆盖推送!" -ForegroundColor Green
