#!/usr/bin/env bash
# Publish Pounce to TestFlight.
#
#   bash scripts/publish-testflight.sh
#
# Run in a REAL terminal (it has interactive prompts). At the credentials step,
# choose "App Store Connect API Key" and paste the three values printed below —
# they come from the key `asc` already uses, so nothing new to create. EAS then
# signs in the cloud and `--auto-submit` ships the build to TestFlight.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/apps/mobile"

KEY_ID="79FP2FTFVS"   # asc profile: peppyhop
KEY_PATH="$(python3 - <<'PY'
import json, os
try:
    print(json.load(open(os.path.expanduser("~/.asc/config.json"))).get("private_key_path",""))
except Exception:
    print("")
PY
)"

cat <<EOF

  Pounce → TestFlight
  ───────────────────
  Project   : @peppyhop/pounce   (com.pounce.app)
  When EAS asks "How would you like to authenticate?", pick:
      › App Store Connect API Key  ›  Add a new key  (or reuse if offered)

  Paste these when prompted:
      Key ID      : ${KEY_ID}
      Key file    : ${KEY_PATH:-<find it in ~/.asc/config.json → private_key_path>}
      Issuer ID   : <copy from App Store Connect → Users and Access →
                     Integrations → App Store Connect API (top of the page)>

EOF

exec npx eas-cli build --platform ios --profile production --auto-submit
