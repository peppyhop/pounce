#!/usr/bin/env bash
# Install the Pounce Bridge as a launchd user agent: starts on login, restarts
# on crash. Reversible with scripts/bridge-uninstall.sh.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
SERVER="$REPO/apps/bridge/server.mjs"
TOKEN="${BRIDGE_TOKEN:-pounce-bridge-local}"
PORT="${BRIDGE_PORT:-8099}"
LABEL="com.pounce.bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/pounce-bridge.log"

[ -n "$NODE" ] || { echo "error: node not found on PATH" >&2; exit 1; }
[ -f "$SERVER" ] || { echo "error: $SERVER not found" >&2; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$SERVER</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BRIDGE_TOKEN</key><string>$TOKEN</string>
    <key>BRIDGE_PORT</key><string>$PORT</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

# Stop any launchd-managed or manual instance, then (re)load.
launchctl unload "$PLIST" 2>/dev/null || true
pkill -f "apps/bridge/server.mjs" 2>/dev/null || true
sleep 1
launchctl load -w "$PLIST"

echo "Installed $LABEL"
echo "  • starts on login, restarts on crash"
echo "  • port $PORT, token $TOKEN"
echo "  • logs: $LOG"
echo "  • uninstall: bun run bridge:uninstall"
