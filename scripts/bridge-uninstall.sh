#!/usr/bin/env bash
# Remove the Pounce Bridge launchd user agent.
set -euo pipefail

LABEL="com.pounce.bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
pkill -f "apps/bridge/server.mjs" 2>/dev/null || true

echo "Uninstalled $LABEL. Run 'bun run bridge' to start it manually again."
