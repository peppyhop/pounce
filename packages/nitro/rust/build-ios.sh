#!/usr/bin/env bash
# Cross-compile litter-iroh and package it as a STATIC FRAMEWORK xcframework
# (CocoaPods reliably links framework xcframeworks; bare static-library ones it
# silently skips). Output: ../ios/LitterIroh.xcframework.
#
# Prereqs (one-time):
#   rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
set -euo pipefail
cd "$(dirname "$0")"

LIBNAME=liblitter_iroh.a
OUT=../ios/LitterIroh.xcframework
TMP=$(mktemp -d)

for t in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
  echo "▸ building $t"
  cargo build --release --target "$t"
done

# Fat simulator lib (arm64 + x86_64).
mkdir -p target/sim-universal
lipo -create \
  target/aarch64-apple-ios-sim/release/$LIBNAME \
  target/x86_64-apple-ios/release/$LIBNAME \
  -output target/sim-universal/$LIBNAME

# Wrap each slice's static lib in a LitterIroh.framework.
wrap_framework() { # $1 = static lib, $2 = dest dir
  local lib="$1" dir="$2"
  local fw="$dir/LitterIroh.framework"
  mkdir -p "$fw/Headers" "$fw/Modules"
  cp "$lib" "$fw/LitterIroh"
  cp include/litter_iroh.h "$fw/Headers/"
  printf 'framework module LitterIroh {\n  umbrella header "litter_iroh.h"\n  export *\n}\n' > "$fw/Modules/module.modulemap"
  cat > "$fw/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.pounce.LitterIroh</string>
<key>CFBundleName</key><string>LitterIroh</string>
<key>CFBundleExecutable</key><string>LitterIroh</string>
<key>CFBundlePackageType</key><string>FMWK</string>
<key>MinimumOSVersion</key><string>16.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
</dict></plist>
EOF
}

wrap_framework target/aarch64-apple-ios/release/$LIBNAME "$TMP/device"
wrap_framework target/sim-universal/$LIBNAME "$TMP/sim"

rm -rf "$OUT"
xcodebuild -create-xcframework \
  -framework "$TMP/device/LitterIroh.framework" \
  -framework "$TMP/sim/LitterIroh.framework" \
  -output "$OUT"
rm -rf "$TMP"

echo "✓ $OUT (static-framework xcframework)"
echo "  Vendored by NitroLitter.podspec; Swift uses 'import LitterIroh'."
