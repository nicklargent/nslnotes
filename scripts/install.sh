#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BINARY="$PROJECT_DIR/target/release/nslnotes-tauri"

if [ ! -f "$BINARY" ]; then
  echo "Error: Release binary not found at $BINARY"
  echo "Run 'npm run tauri:build' first."
  exit 1
fi

OS="$(uname -s)"

case "$OS" in
  Linux)
    echo "Installing NslNotes for Linux..."

    mkdir -p ~/.local/bin
    cp "$BINARY" ~/.local/bin/nslnotes
    chmod +x ~/.local/bin/nslnotes
    echo "  Installed binary to ~/.local/bin/nslnotes"

    mkdir -p ~/.local/share/applications
    cat > ~/.local/share/applications/NslNotes.desktop <<EOF
[Desktop Entry]
Name=NslNotes
Comment=Local-first, plain-text knowledge tool
Exec=$HOME/.local/bin/nslnotes
Icon=nslnotes
Terminal=false
Type=Application
Categories=Office;Utility;
EOF
    echo "  Installed desktop file to ~/.local/share/applications/NslNotes.desktop"

    ICON_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"
    mkdir -p "$ICON_DIR"
    cp "$PROJECT_DIR/src-tauri/icons/128x128.png" "$ICON_DIR/nslnotes.png"
    echo "  Installed icon to $ICON_DIR/nslnotes.png"

    # Update icon cache if available
    if command -v gtk-update-icon-cache &>/dev/null; then
      gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor 2>/dev/null || true
    fi

    echo "Done. Make sure ~/.local/bin is in your PATH."
    ;;

  Darwin)
    echo "Installing NslNotes for macOS..."

    APP_DIR="$HOME/Applications/NslNotes.app"
    mkdir -p "$APP_DIR/Contents/MacOS"
    mkdir -p "$APP_DIR/Contents/Resources"

    cp "$BINARY" "$APP_DIR/Contents/MacOS/nslnotes-tauri"
    chmod +x "$APP_DIR/Contents/MacOS/nslnotes-tauri"

    cp "$PROJECT_DIR/src-tauri/icons/icon.icns" "$APP_DIR/Contents/Resources/icon.icns"

    cat > "$APP_DIR/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>nslnotes-tauri</string>
  <key>CFBundleIdentifier</key>
  <string>com.nsl.nslnotes</string>
  <key>CFBundleName</key>
  <string>NslNotes</string>
  <key>CFBundleDisplayName</key>
  <string>NslNotes</string>
  <key>CFBundleIconFile</key>
  <string>icon</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
</dict>
</plist>
EOF

    echo "  Installed app bundle to $APP_DIR"
    echo "Done."
    echo ""
    echo "Note: macOS may block the app on first launch since it is unsigned."
    echo "Right-click the app > Open, or run: xattr -cr ~/Applications/NslNotes.app"
    ;;

  *)
    echo "Error: Unsupported platform '$OS'. Use install.ps1 on Windows."
    exit 1
    ;;
esac
