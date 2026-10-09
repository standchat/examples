# Halloween creative kit

Original artwork and editable campaign layouts for Stand Chat Halloween mode. These files are prepared for review and use; nothing has been published or submitted to an ad account.

## Files

| Asset | Size | Use |
| --- | --- | --- |
| [`../og.png`](../og.png) | 1200 × 630 | Social link preview: Stand Chat Halloween mode, a browser coming to life, and five mood labels. |
| [`reddit-free-halloween.png`](reddit-free-halloween.png) | 1200 × 1500 | Portrait ad master: “Free Halloween mode for your website.” |
| [`reddit-free-halloween-landscape.png`](reddit-free-halloween-landscape.png) | 1200 × 630 | Landscape version of the same ad. |
| [`linkedin-01-familiar.png`](linkedin-01-familiar.png) | 1200 × 1500 | Editorial companion: the familiar product becomes surprising. |
| [`linkedin-02-moment.png`](linkedin-02-moment.png) | 1200 × 1500 | Editorial companion: the product moment is worth sharing. |
| [`linkedin-03-choice.png`](linkedin-03-choice.png) | 1200 × 1500 | Editorial companion: give people control over the intensity. |
| [`../assets/hero-art.png`](../assets/hero-art.png) | 1536 × 1024 | Original paper-theatre key art. |
| [`../cast.html`](../cast.html) | Responsive | Complete cast comparison: all fifteen generated characters, with light/dark backdrop control. |
| [`../assets/cast-preview.png`](../assets/cast-preview.png) | 1600 × 1300 | Browser-rendered view of the complete cast. |

## Reddit ad

**Headline:** Free Halloween mode for your website 🎃

**Body:** Your website called. It wants a ghost costume. Pumpkins drop in, bats fly by, and a friendly ghost offers a hand. Tap a character to open your Stand Chat. Five moods, one script + assets, free to make your own.

**CTA:** Get the free mode

**Destination after deployment:** `https://examples.stand.chat/halloween/`

**Image alt text:** Free Halloween mode for your website. A smiling ivory paper ghost emerges from a miniature browser with an orange pumpkin and a flying bat. Friendly ghosts. Real conversations. One script plus assets, five moods, tap a character to chat. Stand Chat.

The free offer refers to this downloadable mode and its assets. The website still needs its own Stand Chat installation. The mode does not change the site's Stand Chat plan.

## LinkedIn companions

These work as a three-image sequence or as individual companions to a post about Rivian's Halloween marketing. They intentionally use editorial typography and observations, with no sales CTA, product logo, or brand billboard. They are original website concepts, not screenshots of Rivian's interface.

1. **Make the familiar feel new.** A normal website alongside the same website inhabited by the actual image-generated PG ghost, pumpkin, and bat assets. Alt text: An ordinary cream website beside a Halloween version with a dimensional friendly ghost offering help; same place, different feeling.
2. **The moment is the marketing.** A tactile paper browser becomes a playful Halloween scene. Alt text: A ghost, pumpkin, and bat escape a paper browser below the words “The moment is the marketing.” An unexpected detail gives people something worth passing on.
3. **Let people choose their kind of weird.** A visual specimen sheet of the five actual image-generated ghost styles with a quiet intensity dial. Alt text: Five ghosts progress from a soft cheerful greeting through a storybook spirit and a gauze apparition to cinematic haunted-house creatures. A slider runs from a little surprise to a full transformation. Easy to try, easy to tune, easy to leave.

The third image uses mood descriptions rather than movie rating marks. G, PG, PG-13, R and NC-17 in the example are familiar creative intensity labels, not official age ratings. No gore or explicit imagery is included.

## Inspiration and provenance

The source for the seasonal product-experience inspiration is [Rivian's 2026 Halloween update](https://rivian.com/stories/new-software-halloween-ghostbusters-2026), published October 8, 2026. The creative lesson used here is to transform a familiar surface and make the discovery itself enjoyable. This is an independent Stand Chat example, not a Rivian collaboration or endorsement. No Rivian, Ghostbusters, or other franchise artwork is used.

See [`PROVENANCE.md`](PROVENANCE.md) for generation prompts and saved sources. The fifteen character sprites were individually generated with the built-in OpenAI image generation tool and retain transparent backgrounds. The PG-13, R and NC-17 packs use progressively stronger cinematic practical-effects styling; the G and PG packs stay welcoming. The familiar/dial companions show these actual updated assets.

The original paper-theatre key art remains in the OG image, both Reddit ads, and the second LinkedIn companion. It is a deliberately gentle campaign illustration, not a depiction of the higher-intensity packs. Typography, diagrams, and final layouts are editable HTML/CSS in [`source.html`](source.html).

## Edit and render

Edit the designs in `source.html`, then run from the repository root:

```sh
node halloween/marketing/render.mjs
```

Requires Node 22+ and local Chrome/Chromium. Set `CHROME_PATH` if Chrome is installed at a nonstandard location. There are no package dependencies. The script waits for images and fonts and creates the exact dimensions shown above. It renders the original illustration as part of each layout without raster-editing it.

To render only selected files:

```sh
node halloween/marketing/render.mjs og reddit
```

After updating character packs, regenerate the two companions that show live assets with:

```sh
node halloween/marketing/render.mjs familiar dial cast
```

The creative renderer is separate from the repository's generic `npm run og` command. Use this renderer to preserve the deliberate Halloween social-preview composition.
