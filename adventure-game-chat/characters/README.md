# Characters

Each file here is one character for `<adventure-chat>`: a palette and a few pixel maps. `sprite.js` draws the arms and legs and every pose from them, so a character is about 140 lines of text.

To add one, save it as `characters/<id>.js`, add the id to the element's `characters` attribute, and open the page with `?character=<id>`. The browser console names any letter without a palette color.

## The format

| Field | What it is |
| --- | --- |
| `id`, `name` | Lowercase file id, and the first name shown in the chat. |
| `greeting` | The first thing the character says. It becomes the first line of the conversation in Stand. |
| `quirk` | An idle habit: `glasses`, `beard`, `headset`, `watch`, `scratch`, `hips` or `crossed`. |
| `palette` | One-letter keys to hex colors. `s`/`S` skin, `h`/`H`/`j` hair, `t`/`T`/`y` top, `u` shirt under a jacket, `p`/`P` trousers or skirt, `f`/`F` shoes, `g` glasses and dark details, `a`/`A` accents, `b`/`B` beard, `k` cheeks, `w` white. `o` (outline), `e` (eyes), `m` and `M` (mouth) have defaults. |
| `head.front`, `head.side`, `head.back` | 18 rows of 18 characters. `.` is transparent. The side view faces right. Row 17 is the neck. Leave eyes and mouth as skin. |
| `face` | Where the code draws the eyes and mouth: `front.eyes` `[[6, 10], [11, 10]]`, `front.mouth` `[8, 13]`, `side.eye` `[13, 10]`, `side.mouth` `[14, 13]`. |
| `torso.front`, `torso.side`, `torso.back` | 18 rows of 18. Row 0 is the shoulders, row 13 the belt line where the legs start, rows 14 to 17 can hang over the legs. |
| `arms`, `legs`, `build` | Optional. `arms.sleeve` (a palette key), `arms.short`, `legs.color`, `legs.shade`, `legs.skin` for bare legs, `build.legs` (13 to 15) and `build.shoulders` (6 to 8). |

Draw without outlines: the rig adds them. Two or three shades per material are plenty at this size.

## Make one from photos

Attach one to three photos of the person and `vera.js`, and give this to an AI model that can see images:

```text
Make me a pixel-art character for an adventure-game chat on my website, based on the attached photos. The character walks around the page and talks to visitors, so it should be recognizably this person.

I've also attached vera.js, an existing character. Write a new file in exactly the same format:

- id: lowercase, like "maya". name: the first name shown in the chat.
- greeting: one short, friendly line the character says when it appears, under 80 characters.
- quirk: one of glasses, beard, headset, watch, scratch, hips or crossed: a small habit that suits them.
- palette: one-letter keys and hex colors. s/S skin and its shadow; h/H/j hair, shadow and highlight; t/T/y top, shadow and highlight; u a shirt under a jacket; p/P trousers or skirt; f/F shoes and soles; g glasses and other dark details; a/A an accent like a scarf or jewelry; b/B beard; k cheeks; w white. Take the colors from the photos, and keep skin and hair true to them.
- head.front, head.side (facing right) and head.back: 18 strings of exactly 18 characters. "." is transparent. Row 17 is the neck. Keep the face about 10 to 12 pixels wide in rows 7 to 15, like vera.js. Draw hair, beard, glasses, earrings and hats into these maps, but leave the eyes and mouth as plain skin: the code draws them at the positions in `face`.
- face: front.eyes is the top-left pixel of each eye (usually [6, 10] and [11, 10]), front.mouth the mouth's left pixel ([8, 13]), side.eye and side.mouth the same in profile ([13, 10] and [14, 13]). If you move a feature, move its position too.
- torso.front, torso.side and torso.back: 18 strings of exactly 18 characters. Row 0 is the shoulders and row 13 the belt line, where the legs start. Rows 14 to 17 can hang over the legs: coat tails, a skirt. Keep the torso inside columns 3 to 14 from the front and 4 to 13 from the side.
- Arms and legs are drawn by code. Optional: arms.sleeve (a palette key, "t" by default), arms.short: true for short sleeves, legs.color and legs.shade ("p" and "P"), legs.skin: "s" for bare legs under a skirt or shorts, build.legs 13 to 15 for height, build.shoulders 6 to 8 for width.

Style: a late-80s VGA adventure game. Chunky and readable at 3× zoom, two or three shades per material, no outlines (the code adds them), a strong silhouette. Exaggerate what makes this person recognizable: hairstyle and color, facial hair, glasses, a signature piece of clothing.

Before you answer, check that every map has exactly 18 rows of exactly 18 characters, and that every letter you used has a palette color. Reply with only the file.
```

Then look at the result on the page and ask for fixes in plain words: "the hair is too flat on top", "the glasses are rounder than that". Before you publish anyone's likeness, ask them.
