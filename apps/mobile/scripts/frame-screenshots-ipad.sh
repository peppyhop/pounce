#!/bin/bash
# Compose iPad App Store marketing screenshots (12.9" / 2048x2732): branded
# gradient + caption + full device. Reads screenshots/ipad/raw, writes
# screenshots/ipad/framed. Requires ImageMagick (`magick`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/screenshots/ipad/raw"
OUT="$ROOT/screenshots/ipad/framed"
mkdir -p "$OUT"

W=2048; H=2732                 # 12.9" iPad canvas
CAP=360                        # caption block height
BOT=150                        # bottom margin (device never cut off)
SY=$CAP
SH=$(( H - SY - BOT ))         # full screenshot height with margin
SW=$(( SH * W / H ))           # keep aspect -> whole device visible
SX=$(( (W - SW) / 2 ))
R=44
FONT="/System/Library/Fonts/Supplemental/Arial Black.ttf"
SUBFONT="/System/Library/Fonts/Supplemental/Arial.ttf"

compose() {
  local src="$1" dst="$2" caption="$3" sub="$4"
  local tmp_round="$OUT/.round.png"

  magick "$src" -resize ${SW}x${SH}! \
    \( +clone -alpha extract -fill black -colorize 100 \
       -fill white -draw "roundrectangle 0,0,$((SW-1)),$((SH-1)),$R,$R" \) \
    -alpha off -compose CopyOpacity -composite "$tmp_round"

  magick -size ${W}x${H} gradient:'#2a1d52'-'#0a0910' \
    \( -size ${W}x${H} radial-gradient:'rgba(139,92,246,0.5)'-'rgba(139,92,246,0)' \
       -gravity center -geometry +0+120 \) -compose screen -composite \
    \( "$tmp_round" \( +clone -background black -shadow 55x50+0+34 \) +swap \
       -background none -layers merge +repage \) \
    -gravity northwest -geometry +$((SX-34))+$((SY-12)) -compose over -composite \
    -font "$FONT" -fill white -gravity north -pointsize 104 -annotate +0+150 "$caption" \
    -font "$SUBFONT" -fill '#c4b5fd' -pointsize 50 -annotate +0+290 "$sub" \
    "$dst"

  rm -f "$tmp_round"
  echo "wrote $dst"
}

compose "$RAW/01-home.png"    "$OUT/01-home.png"    "All your agents, one screen" "Every machine you own, at a glance"
compose "$RAW/02-session.png" "$OUT/02-session.png" "Watch them work, live"       "Reasoning, tools, terminal — in real time"
compose "$RAW/05-voice.png"   "$OUT/05-voice.png"   "Just hold and speak"         "Steer any agent by voice, hands-free"
compose "$RAW/03-changes.png" "$OUT/03-changes.png" "Review the diff. Ship it."   "Commit, push, open a PR from your phone"
