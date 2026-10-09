# Where Ada comes from

The example's code is public domain (see the repository's [LICENSE](../../LICENSE)). The files in
this folder are not: they are an Epic MetaHuman and stay under Epic's terms.

## The character

Ada is a MetaHuman from Epic Games, exported to glTF by the open
[metahuman-to-glb](https://github.com/creategamecharacters/metahuman-to-glb) pipeline
(MIT, Copyright (c) 2026 smorchj; its license covers the pipeline's code, not the character).

Source, at commit [`c95d2d5`](https://github.com/creategamecharacters/metahuman-to-glb/tree/c95d2d532657762168f897d03fda2bcd12b2829e/docs/characters/ada):
`docs/characters/ada/ada.glb` and the textures beside it.

Epic's [MetaHuman license page](https://www.metahuman.com/license) says MetaHumans can be used with
any engine or creative software, and that from Unreal Engine 5.6 on, the
[Unreal Engine EULA](https://www.unrealengine.com/eula/unreal) governs them. Check those terms
before you use, change or redistribute these files.

## What changed

`../tools/prepare-ada.sh` rebuilds every file here from that source:

- The Bitmagic GDK's MetaHuman tools stripped Draco, merged the export's five skeleton copies into
  one, smoothed the garments' skin weights and gave them the skin's weights where they touch.
- `../tools/finish-ada.mjs` baked new garment colours from the export's masks, the iris and sclera
  from the eye material's parameters, and gum, tooth and tongue shading for the teeth; added the
  face's roughness and cavity maps; dropped hidden helper meshes; and compressed the result
  (WebP textures, quantized morph targets, meshopt).
- `hair.webp`, `brows.webp` and `lashes.webp` are the export's card atlases, converted losslessly.
- `ada-standing.webp` is a render of the finished character, shown until the 3D one loads.
