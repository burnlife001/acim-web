# ACIM 预览服务启停脚本 (port 4173)
# 用法: 直接运行进入菜单; 或 .\acim-preview.ps1 -Action start|stop|status 非交互调用
# 按 0 退出脚本不会停止服务 (服务以独立进程运行)
param([ValidateSet('start', 'stop', 'status')][string]$Action)

$Port = 4173
$ProjectRoot = $PSScriptRoot

function Get-PreviewPid {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) { ($conn | Select-Object -First 1).OwningProcess } else { $null }
}

function Get-LanIP {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1
    if ($ip) { $ip.IPAddress } else { '127.0.0.1' }
}

function Show-Status {
    $procId = Get-PreviewPid
    $ip = Get-LanIP
    if ($procId) {
        Write-Host "状态: 运行中 (PID $procId)" -ForegroundColor Green
        Write-Host "地址: http://${ip}:$Port  /  http://localhost:$Port" -ForegroundColor Green
    } else {
        Write-Host '状态: 未运行' -ForegroundColor DarkGray
    }
}

function Build-Site {
    $bun = (Get-Command bun.exe -ErrorAction SilentlyContinue).Source
    if (-not $bun) { Write-Host '找不到 bun.exe, 请检查 PATH'; return }
    Write-Host '开始构建 (bun scripts/build.mjs)...' -ForegroundColor Cyan
    & $bun scripts/build.mjs
    if ($LASTEXITCODE -eq 0) {
        Write-Host '构建完成 (index.md / tmp/search.json / tmp/filelist.json / icons 已重写)' -ForegroundColor Green
    } else {
        Write-Host "构建失败, 退出码 $LASTEXITCODE" -ForegroundColor Red
    }
}

function Trigger-Actions {
    $gh = (Get-Command gh.exe -ErrorAction SilentlyContinue).Source
    if (-not $gh) { Write-Host '找不到 gh.exe, 请安装 GitHub CLI 并登录' -ForegroundColor Red; return }
    Push-Location $ProjectRoot
    try {
        & $gh workflow run deploy-pages.yml --ref main
        if ($LASTEXITCODE -eq 0) {
            Write-Host '已触发 Deploy to GitHub Pages (workflow_dispatch)' -ForegroundColor Green
            Write-Host '可用命令查看进度: gh run list --workflow=deploy-pages.yml --limit 1' -ForegroundColor DarkGray
        } else {
            Write-Host "触发失败, 退出码 $LASTEXITCODE" -ForegroundColor Red
        }
    } finally {
        Pop-Location
    }
}

function Start-Preview {
    if (Get-PreviewPid) { Write-Host "已在运行, 无需重复启动 (port $Port)"; return }
    # 必须定位 bun.exe: PATH 里有无扩展名的 bun shell shim, Start-Process 会报"不是有效的 Win32 应用程序"
    $bun = (Get-Command bun.exe -ErrorAction SilentlyContinue).Source
    if (-not $bun) { Write-Host '找不到 bun.exe, 请检查 PATH'; return }
    # Start-Process 脱离本脚本进程, 脚本退出后服务继续运行
    Start-Process -FilePath $bun -ArgumentList 'scripts/serve.mjs' `
        -WorkingDirectory $ProjectRoot -WindowStyle Hidden
    Start-Sleep -Seconds 3
    if (Get-PreviewPid) {
        Show-Status
    } else {
        Write-Host '启动失败: 请手动执行 bun scripts/serve.mjs 查看错误输出'
    }
}

function Stop-Preview {
    $procId = Get-PreviewPid
    if (-not $procId) { Write-Host '服务未在运行'; return }
    # /T 连同子进程一起结束 (bun 会派生子进程)
    taskkill /PID $procId /T /F | Out-Null
    Start-Sleep -Seconds 1
    if (Get-PreviewPid) { Write-Host "停止失败, PID $procId 仍在监听" } else { Write-Host '已停止' }
}

function Restart-Preview {
    Stop-Preview
    Start-Preview
}

function Show-Menu {
    while ($true) {
        Clear-Host
        Write-Host "===== ACIM 预览服务 (port $Port) ====="
        Show-Status
        Write-Host ''
        Write-Host '1. 启动服务'
        Write-Host '2. 停止服务'
        Write-Host '3. 重启服务'
        Write-Host '------------------------------' -ForegroundColor DarkGray
        Write-Host '4. 本地构建 (bun scripts/build.mjs)'
        Write-Host '5. 触发 GitHub Actions 构建'
        Write-Host '------------------------------' -ForegroundColor DarkGray
        Write-Host '0. 退出脚本 (服务保持运行)'
        Write-Host ''
        switch (Read-Host '请选择') {
            '1' { Start-Preview }
            '2' { Stop-Preview }
            '3' { Restart-Preview }
            '4' { Build-Site; Start-Preview; [void](Read-Host '按回车返回菜单') }
            '5' { Trigger-Actions; [void](Read-Host '按回车返回菜单') }
            '0' { return }
            default { }
        }
    }
}

switch ($Action) {
    'start'  { Start-Preview }
    'stop'   { Stop-Preview }
    'status' { Show-Status }
    default  { Show-Menu }
}
