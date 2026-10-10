# The characters

One image per rating: `g.webp`, `pg.webp`, `pg-13.webp`, `r.webp` and `nc-17.webp`. Each one holds every character of that rating cut into parts (bodies, wings, legs, tails, lanterns, lids), and `RIGS` in `halloween.js` says where each part is, where it goes on the character and the point it turns around. Keep this folder next to `halloween.js`, or point `data-assets` at wherever it lives. A page only downloads the rating it shows.

| Rating | Made as | The cast |
| --- | --- | --- |
| G | Handmade plush and felt toys | A felt ghost with a lantern, a lavender bat, a pom-pom spider, a smiling pumpkin, a kitten with a bow, a broom with a hat |
| PG | Stop-motion puppets | A bedsheet ghost, a cheeky bat, a striped spider, a gap-toothed jack-o’-lantern, a grinning cat, a witch on a broom |
| PG-13 | Film props in the dark | A gauze apparition, a real bat, a long-legged spider, a weathered jack-o’-lantern, a black cat, a witch in silhouette |
| R | Horror-film creatures | A skeletal wraith, a vampire bat, a tarantula, a rotting pumpkin, a hissing cat, a raven |
| NC-17 | A haunted-house attraction | A screaming reaper, a demon bat, a black widow, a pumpkin with too many teeth, a shadow cat, crows |

## How they were made

The image model in Codex CLI drew every character whole, on a transparent background, in a pose that's easy to cut: wings spread, legs apart, the lantern hanging free. Then it redrew each one as a sheet of puppet parts. Claude Code matched the parts back onto the whole character in headless Chrome, so the rig at rest looks like the original, and packed each rating into one WebP.

All original characters, no franchise or real people, and no gore at any rating. The ratings describe intensity, not official film ratings.

## Your own cast

Replace an image and its entry in `RIGS`. Each part is `[name, x, y, width, height, left, top, pivotX, pivotY, parent, behind]`: `x`, `y`, `width` and `height` say where the piece is in the image, `left` and `top` where it goes on the character, and the pivot is the point it turns around, measured from the piece's own top-left corner. A part with a `parent` hangs off it and turns with it, like a forearm off an upper arm, and `behind` set to 1 draws it behind its parent. The last four are optional.

The part names are what the animation looks for: `wingL` and `wingL2` (shoulder and hand) for bats, `leg-l0` to `leg-r3` for spiders, `lantern` and `lid` for the ghost and the pumpkin, `tail` for the sitting cat, `pose0` to `pose2` for a bird's three wing beats. The walking cat is a skeleton: `pelvis`, `chest` and `head`, a tail of five pieces (`tail0` to `tail4`) and legs of three (`hn0` to `hn2` for the near hind leg, then `hf`, `fn` and `ff`).
