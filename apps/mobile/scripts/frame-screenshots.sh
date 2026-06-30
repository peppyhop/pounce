#!/bin/bash
# Compose App Store marketing screenshots: branded gradient bg + caption + full
# device screenshot. Reads raw captures from screenshots/raw, writes framed
# marketing shots to screenshots/framed. Requires ImageMagick (`magick`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/screenshots/raw"
OUT="$ROOT/screenshots/framed"
mkdir -p "$OUT"

W=1320; H=2868                 # 6.9" canvas
CAP=470                        # vertical space reserved for the caption block
BOT=140                        # bottom margin so the device is never cut off
SY=$CAP                        # screenshot top
SH=$(( H - SY - BOT ))         # full screenshot height, fits with margin
SW=$(( SH * W / H ))           # keep aspect -> whole device visible
SX=$(( (W - SW) / 2 ))         # center x
R=50                           # corner radius
FONT="/System/Library/Fonts/Supplemental/Arial Black.ttf"
SUBFONT="/System/Library/Fonts/Supplemental/Arial.ttf"

compose() {
  local src="$1" dst="$2" caption="$3" sub="$4"
  local tmp_round="$OUT/.round.png"

  # 1) scale + round the screenshot corners
  magick "$src" -resize ${SW}x${SH}! \
    \( +clone -alpha extract -fill black -colorize 100 \
       -fill white -draw "roundrectangle 0,0,$((SW-1)),$((SH-1)),$R,$R" \) \
    -alpha off -compose CopyOpacity -composite "$tmp_round"

  # 2) gradient canvas + radial purple glow behind the device + caption
  magick -size ${W}x${H} gradient:'#2a1d52'-'#0a0910' \
    \( -size ${W}x${H} radial-gradient:'rgba(139,92,246,0.55)'-'rgba(139,92,246,0)' \
       -gravity center -geometry +0+150 \) -compose screen -composite \
    \( "$tmp_round" \( +clone -background black -shadow 55x40+0+30 \) +swap \
       -background none -layers merge +repage \) \
    -gravity northwest -geometry +$((SX-30))+$((SY-10)) -compose over -composite \
    -font "$FONT" -fill white -gravity north -pointsize 80 -annotate +0+230 "$caption" \
    -font "$SUBFONT" -fill '#c4b5fd' -pointsize 41 -annotate +0+360 "$sub" \
    "$dst"

  rm -f "$tmp_round"
  echo "wrote $dst"
}

compose "$RAW/01-home.png"    "$OUT/01-home.png"    "All your agents, one screen" "Every machine you own, at a glance"
compose "$RAW/02-session.png" "$OUT/02-session.png" "Watch them work, live"       "Reasoning, tools, terminal — in real time"
compose "$RAW/05-voice.png"   "$OUT/05-voice.png"   "Just hold and speak"         "Steer any agent by voice, hands-free"
compose "$RAW/03-changes.png" "$OUT/03-changes.png" "Review the diff. Ship it."   "Commit, push, open a PR from your phone"
compose "$RAW/04-compose.png" "$OUT/04-compose.png" "Start a task in seconds"     "Any agent, any repo, hands-free with voice"
