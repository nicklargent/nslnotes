#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BINARY="$PROJECT_DIR/target/release/nslnotes-web"

if [ ! -f "$BINARY" ]; then
  echo "Error: Release binary not found at $BINARY"
  echo "Run 'npm run web:build' first."
  exit 1
fi

OS="$(uname -s)"

case "$OS" in
  Linux)
    echo "Installing NslNotes Web for Linux..."

    mkdir -p ~/.local/bin
    cp "$BINARY" ~/.local/bin/nslnotes-web
    chmod +x ~/.local/bin/nslnotes-web
    echo "  Installed binary to ~/.local/bin/nslnotes-web"

    # Create systemd user service
    mkdir -p ~/.config/systemd/user
    cat > ~/.config/systemd/user/nslnotes-web.service <<EOF
[Unit]
Description=NslNotes Web Server
After=network.target

[Service]
ExecStart=%h/.local/bin/nslnotes-web
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
    echo "  Installed systemd user service"

    systemctl --user daemon-reload
    systemctl --user enable nslnotes-web.service
    systemctl --user start nslnotes-web.service
    echo "  Service started on http://localhost:3000"

    echo "Done."
    echo ""
    echo "Manage with:"
    echo "  systemctl --user status nslnotes-web"
    echo "  systemctl --user stop nslnotes-web"
    echo "  systemctl --user restart nslnotes-web"
    ;;

  Darwin)
    echo "Installing NslNotes Web for macOS..."

    mkdir -p ~/.local/bin
    cp "$BINARY" ~/.local/bin/nslnotes-web
    chmod +x ~/.local/bin/nslnotes-web
    echo "  Installed binary to ~/.local/bin/nslnotes-web"

    # Create launchd user agent
    PLIST_DIR="$HOME/Library/LaunchAgents"
    PLIST="$PLIST_DIR/com.nsl.nslnotes-web.plist"
    mkdir -p "$PLIST_DIR"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.nsl.nslnotes-web</string>
  <key>ProgramArguments</key>
  <array>
    <string>$HOME/.local/bin/nslnotes-web</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/nslnotes-web.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/nslnotes-web.log</string>
</dict>
</plist>
EOF
    echo "  Installed launchd agent"

    launchctl bootout gui/$(id -u) "$PLIST" 2>/dev/null || true
    launchctl bootstrap gui/$(id -u) "$PLIST"
    echo "  Service started on http://localhost:3000"

    echo "Done."
    echo ""
    echo "Manage with:"
    echo "  launchctl kickstart -k gui/$(id -u)/com.nsl.nslnotes-web  # restart"
    echo "  launchctl bootout gui/$(id -u)/com.nsl.nslnotes-web       # stop"
    echo "  Logs: ~/Library/Logs/nslnotes-web.log"
    ;;

  *)
    echo "Error: Unsupported platform '$OS'. Use install-web.ps1 on Windows."
    exit 1
    ;;
esac
