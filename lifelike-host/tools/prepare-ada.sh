#!/bin/sh
# Maintainers only: rebuild Ada (assets/ada.glb and her hair, brow and lash atlases) from the
# upstream MetaHuman export with the Bitmagic GDK's MetaHuman tools. Serving or copying the
# example needs none of this.
#
# Needs Node 20+, curl, and the GDK:  npm install -g @bitmagic/cli
# `bitmagic tools` works without a Bitmagic Pro subscription.
#
#   sh lifelike-host/tools/prepare-ada.sh
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
ASSETS="$HERE/../assets"
UPSTREAM=https://raw.githubusercontent.com/creategamecharacters/metahuman-to-glb/c95d2d532657762168f897d03fda2bcd12b2829e/docs/characters/ada
TEXTURES="f_top_shirt_Mask f_top_shirt_AO btm_slacks_Mask btm_slacks_AO shs_flats_Mask shs_flats_AO T_Iris_A_M
  FaceRoughness_MAIN FaceCavity_MAIN female_body_cavity_map
  Hair_S_Coil_CardsAtlas_Attribute Eyebrows_M_Thin_CardsAtlas_Attribute Eyelashes_L_SlightCurl_Coverage"

GDK="$(bitmagic tools path metahuman)/tools/metahuman"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# The GDK's scripts and ours run side by side, on the GDK's own dependencies plus two encoders.
cp -R "$GDK/." "$WORK/"
cp "$HERE/adapt-ada.mjs" "$HERE/finish-ada.mjs" "$WORK/"
cd "$WORK"
npm install --no-audit --no-fund --silent
npm install --no-audit --no-fund --silent --no-save meshoptimizer@1.3.0 sharp@0.35.5

echo "Downloading Ada from the metahuman-to-glb export…"
mkdir -p textures
curl -fsSL -o ada.glb "$UPSTREAM/ada.glb"
for t in $TEXTURES; do curl -fsSL --retry 3 -o "textures/$t.png" "$UPSTREAM/textures/$t.png"; done

node strip-draco.mjs ada.glb 1.glb                               # GDK: no Draco
node adapt-ada.mjs 1.glb 2.glb                                   # the 5.6 export, in the GDK's naming
node merge-skeletons.mjs 2.glb 3.glb                             # GDK: five skeleton copies → one
node reorder-body-first.mjs 3.glb 4.glb                          # GDK: the body skin first
node smooth-outfit-weights.mjs 4.glb 5.glb 6 0.5 Slacks          # GDK: soften garment weight seams
node smooth-outfit-weights.mjs 5.glb 6.glb 12 0.6 Shirt
node transfer-skin-weights.mjs 6.glb 7.glb                       # GDK: clothes move with the skin
node finish-ada.mjs 7.glb "$ASSETS/ada.glb" textures             # textures, cleanup, compression

# The card atlases the GDK's hair, brow and lash materials sample. Lossless: they hold data.
node --input-type=module -e "
import sharp from 'sharp';
for (const [from, to] of [['Hair_S_Coil_CardsAtlas_Attribute', 'hair'], ['Eyebrows_M_Thin_CardsAtlas_Attribute', 'brows'], ['Eyelashes_L_SlightCurl_Coverage', 'lashes']])
  await sharp('textures/' + from + '.png').webp({ lossless: true, effort: 6 }).toFile('$ASSETS/' + to + '.webp');
"
ls -la "$ASSETS"
