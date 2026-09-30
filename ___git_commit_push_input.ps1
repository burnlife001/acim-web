#!/usr/bin/env pwsh
# Auto Git Commit and Push Script
# Function: Commit and push all branches with user input message

# Ensure Git is in PATH
$gitCmdPath = "C:\Program Files\Git\cmd"
$gitCmdPathAlt = "C:\Program Files (x86)\Git\cmd"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    if (Test-Path $gitCmdPath) {
        $env:PATH = "$gitCmdPath;$env:PATH"
    } elseif (Test-Path $gitCmdPathAlt) {
        $env:PATH = "$gitCmdPathAlt;$env:PATH"
    }
}

# Function to check and clear any existing Git processes and lock files
function Clear-GitProcesses {
    try {
        # Check for running git processes
        Write-Host "Checking for existing Git processes..." -ForegroundColor Cyan
        $gitProcesses = Get-Process -Name "git" -ErrorAction SilentlyContinue

        if ($gitProcesses -and $gitProcesses.Count -gt 0) {
            Write-Host "Found $($gitProcesses.Count) running Git process(es). Attempting to clear..." -ForegroundColor Yellow

            # Try to gracefully stop git processes
            $gitProcesses | ForEach-Object {
                Write-Host "  Stopping Git process (PID: $($_.Id))..." -ForegroundColor Yellow
                $_ | Stop-Process -Force
            }

            # Wait a moment to ensure processes are terminated
            Start-Sleep -Seconds 2

            # Check if any Git processes still exist
            $remainingGitProcesses = Get-Process -Name "git" -ErrorAction SilentlyContinue
            if ($remainingGitProcesses -and $remainingGitProcesses.Count -gt 0) {
                Write-Host "Warning: Could not stop all Git processes. Some operations might fail." -ForegroundColor Red
            } else {
                Write-Host "All Git processes cleared successfully." -ForegroundColor Green
            }
        } else {
            Write-Host "No existing Git processes detected." -ForegroundColor Green
        }

        # Check and remove git lock files
        Write-Host "Checking for Git lock files..." -ForegroundColor Cyan
        $gitDir = ".git"
        $lockFiles = @()

        # Index lock file
        $indexLock = Join-Path -Path $gitDir -ChildPath "index.lock"
        if (Test-Path $indexLock) {
            $lockFiles += $indexLock
        }

        # Check for other possible lock files in .git directory
        if (Test-Path $gitDir) {
            $otherLockFiles = Get-ChildItem -Path $gitDir -Recurse -Filter "*.lock" | Select-Object -ExpandProperty FullName
            $lockFiles += $otherLockFiles
        }

        # Remove lock files if found
        if ($lockFiles.Count -gt 0) {
            Write-Host "Found $($lockFiles.Count) Git lock file(s). Removing..." -ForegroundColor Yellow

            foreach ($lockFile in $lockFiles) {
                try {
                    Write-Host "  Removing lock file: $lockFile" -ForegroundColor Yellow
                    Remove-Item -Path $lockFile -Force

                    if (Test-Path $lockFile) {
                        Write-Host "  Failed to remove lock file: $lockFile" -ForegroundColor Red
                    } else {
                        Write-Host "  Successfully removed lock file: $lockFile" -ForegroundColor Green
                    }
                } catch {
                    $errorMsg = $_.Exception.Message
                    Write-Host "  Error removing lock file $lockFile - $errorMsg" -ForegroundColor Red
                }
            }
        } else {
            Write-Host "No Git lock files detected." -ForegroundColor Green
        }
    } catch {
        $errorMsg = $_.Exception.Message
        Write-Host "Error checking/clearing Git processes and lock files - $errorMsg" -ForegroundColor Red
    }
}

# Clear any existing Git processes and lock files before proceeding
Clear-GitProcesses

# Get current date and format
$currentDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$defaultMessage = "Daily backup: $currentDate"

# Prompt for commit message
Write-Host "`nStarting auto git commit and push..." -ForegroundColor Cyan
Write-Host "Default commit message: $defaultMessage"
$commitMessage = Read-Host "`nEnter your commit message (press Enter to use default)"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = $defaultMessage
}
Write-Host "Using commit message: $commitMessage"

try {
    # Stage all changes
    Write-Host "`nStaging all changed files..." -ForegroundColor Cyan
    git add -A
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to stage files"
    }
    Write-Host "Files staged successfully" -ForegroundColor Green

    # Create commit
    Write-Host "`nCreating commit..." -ForegroundColor Cyan
    git commit -m $commitMessage
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create commit"
    }
    Write-Host "Commit created successfully" -ForegroundColor Green

    # Push all branches
    Write-Host "`nPushing all branches to remote..." -ForegroundColor Cyan
    git push --all origin
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to push branches"
    }
    Write-Host "Branches pushed successfully" -ForegroundColor Green

    # Record last push time
    $currentDateTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "`nAuto git commit and push completed successfully!" -ForegroundColor Green
}
catch {
    Write-Host "`nError: $_" -ForegroundColor Red
    Write-Host "Auto git commit and push failed" -ForegroundColor Red
    exit 1
}
