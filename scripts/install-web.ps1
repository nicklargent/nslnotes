$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Binary = Join-Path $ProjectDir "target\release\nslnotes-web.exe"

if (-not (Test-Path $Binary)) {
    Write-Error "Release binary not found at $Binary`nRun 'npm run web:build' first."
    exit 1
}

Write-Host "Installing NslNotes Web for Windows..."

# Copy binary
$InstallDir = Join-Path $env:LOCALAPPDATA "NslNotesWeb"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item $Binary -Destination (Join-Path $InstallDir "nslnotes-web.exe") -Force
Write-Host "  Installed binary to $InstallDir\nslnotes-web.exe"

# Create a scheduled task to run at login
$TaskName = "NslNotesWeb"
$Action = New-ScheduledTaskAction -Execute (Join-Path $InstallDir "nslnotes-web.exe")
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "NslNotes Web Server" | Out-Null
Write-Host "  Created scheduled task to run at login"

# Start the task now
Start-ScheduledTask -TaskName $TaskName
Write-Host "  Service started on http://localhost:3000"

Write-Host "Done."
Write-Host ""
Write-Host "Manage with:"
Write-Host "  Get-ScheduledTask -TaskName NslNotesWeb          # status"
Write-Host "  Stop-ScheduledTask -TaskName NslNotesWeb          # stop"
Write-Host "  Start-ScheduledTask -TaskName NslNotesWeb         # start"
Write-Host "  Unregister-ScheduledTask -TaskName NslNotesWeb    # remove"
