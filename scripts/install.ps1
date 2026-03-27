$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Binary = Join-Path $ProjectDir "src-tauri\target\release\nslnotes-tauri.exe"

if (-not (Test-Path $Binary)) {
    Write-Error "Release binary not found at $Binary`nRun 'npm run tauri:build' first."
    exit 1
}

Write-Host "Installing NslNotes for Windows..."

# Copy binary
$InstallDir = Join-Path $env:LOCALAPPDATA "NslNotes"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item $Binary -Destination (Join-Path $InstallDir "nslnotes-tauri.exe") -Force
Write-Host "  Installed binary to $InstallDir\nslnotes-tauri.exe"

# Copy icon
$IconSrc = Join-Path $ProjectDir "src-tauri\icons\icon.ico"
Copy-Item $IconSrc -Destination (Join-Path $InstallDir "icon.ico") -Force

# Create Start Menu shortcut
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$ShortcutPath = Join-Path $StartMenuDir "NslNotes.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = Join-Path $InstallDir "nslnotes-tauri.exe"
$Shortcut.IconLocation = Join-Path $InstallDir "icon.ico"
$Shortcut.Description = "Local-first, plain-text knowledge tool"
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Save()

Write-Host "  Created Start Menu shortcut at $ShortcutPath"
Write-Host "Done."
