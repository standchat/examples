# Generated Halloween character packs

The five packs were rebuilt with the **built-in image-generation model** on October 9, 2026. Each ghost, pumpkin, bat, spider, and reaching hand was generated separately and visually reviewed. The ten spider and hand sprites extend the same material and intensity progression as the original cast. R and PG bats and the R ghost received model-based framing corrections to keep the full silhouettes inside the transparent image.

The low levels use tangible soft craft materials. The upper levels use photoreal practical-effects material, creature anatomy, distressed cloth, carved bone, and theatrical lighting. [Compare all 25 characters](../cast.html).

| Folder | Art direction |
| --- | --- |
| `g/` | Preschool plush and felt, no fangs or threatening faces |
| `pg/` | Handmade stop-motion miniatures, welcoming mischief |
| `pg-13/` | Eerie supernatural film props and realistic creature textures |
| `r/` | Horror-film skeletal wraith and vampire creatures |
| `nc-17/` | Full haunted-house wraith and monstrous carved/fanged creatures |

Every rating folder contains full-size `ghost.webp`, `pumpkin.webp`, `bat.webp`, `spider.webp`, and `hand.webp`, plus the original generated PNG versions. The gallery, hero, and creative layouts use these full-size WebPs (quality 90, alpha quality 100).

The drop-in runtime and portable download use separate **384 × 384** versions under `runtime/{rating}/`, encoded at quality 84 with alpha quality 100. All 25 delivery assets total **882,624 bytes**; only one selected style is needed for a visit. Only the chosen characters are loaded when they appear. The originals remain intact; delivery optimization only resizes and encodes them. All character design and framing edits used the image model.

Full prompts, any correction prompts, original generation locations, and tool provenance:

- [G and PG](provenance-g-pg.json)
- [PG-13](provenance-pg-13.json)
- [R](provenance-r.json)
- [NC-17](provenance-nc-17.json)
- [Spiders and reaching hands, all five levels](provenance-spiders-hands.json)

The spiders are isolated without silk so the runtime can attach a real thread to the current page surface. The hands include a short forearm so the ground emergence can hide the wrist rather than cutting through the fingers. The new provenance file records each optimized sprite's alpha bounds for alignment.

The high-intensity direction was informed by the physical materials and long silhouettes of [Spirit Halloween's theatrical reaper props](https://www.spirithalloween.com/product/7-ft-6-in-jack-the-reaper-animatronic/280556.uts), together with horror-film practical-effects aesthetics. These are original characters, not reproductions of specific merchandise or film characters. G / PG / PG-13 / R / NC-17 are informal intensity labels, not official content ratings.

`hero-art.png` is the separate paper-theatre illustration used by the gentle campaign/OG designs. Its prompt and provenance remain in [marketing/PROVENANCE.md](../marketing/PROVENANCE.md).
