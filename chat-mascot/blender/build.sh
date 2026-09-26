#!/bin/sh
# Rebuilds Gilly's 3D files from source. Nothing here runs at page load: the
# example serves the results (gilly.glb, gilly.usdz, gilly-segments.js).
#
#   sh blender/build.sh                 # the web model: ../gilly.glb
#   sh blender/build.sh showreel.json   # also the AR model: ../gilly.usdz
#
# Needs Blender 5.2 (BLENDER=/path/to/blender to override) and, for compression,
# Node 18+. showreel.json comes from blender/showreel/ (see README.md).
set -e
cd "$(dirname "$0")"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
OUT="$(mktemp -d)"

"$BLENDER" --background --factory-startup --python gilly.py -- --out "$OUT" --export
# Separate vertex buffers: iOS Safari's WebGL crashes on the default interleaved layout.
npx --yes @gltf-transform/cli@4.5.0 meshopt "$OUT/gilly.glb" ../gilly.glb --level medium --vertex-layout separate

if [ -n "$1" ]; then
  "$BLENDER" --background --factory-startup --python gilly.py -- --out "$OUT" --usdz "$1"
  cp "$OUT/gilly.usdz" "$OUT/gilly-segments.js" ..
  usdchecker --arkit ../gilly.usdz 2>/dev/null || echo "(usdchecker not found: skipped ARKit validation)"
fi
rm -rf "$OUT"
ls -l ../gilly.glb ../gilly.usdz 2>/dev/null
