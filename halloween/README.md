# Stand Chat Halloween mode

A seasonal layer for any page using Stand Chat. A pumpkin peeks over a card. A bat finds a perch. A friendly ghost wanders in after a quiet moment. Tap a character to open your existing chat. Five generated casts range from soft preschool plush to theatrical haunted-house creatures.

[Example and configurator](https://examples.stand.chat/halloween/) · [Compare every character](cast.html) · [Creative kit](marketing/) · [Download the portable package](halloween-mode.zip)

## Put it on your site

Keep your normal Stand installation snippet from **Sites in Stand**, then add one script:

```html
<script defer
  src="https://examples.stand.chat/halloween/halloween.js"
  data-rating="pg"
  data-activity="calm">
</script>
```

The hosted URL becomes available when this example is deployed. The mode runs October 1 through November 1, inclusive, in the visitor's local time. It stays out of the way for the rest of the year. Choose **Always** in the configurator or use `data-season="always"` to run it year-round.

To self-host, unpack `halloween-mode.zip` into your site and change `src` to `/halloween/halloween.js`. Keep this structure:

```text
/halloween/
  halloween.js
  INSTALL.txt
  LICENSE
  assets/runtime/
    g/      ghost.webp, pumpkin.webp, bat.webp
    pg/     ghost.webp, pumpkin.webp, bat.webp
    pg-13/  ghost.webp, pumpkin.webp, bat.webp
    r/      ghost.webp, pumpkin.webp, bat.webp
    nc-17/  ghost.webp, pumpkin.webp, bat.webp
```

There is no package install, framework, external animation library, or build step. The script discovers its assets relative to its own URL. The ZIP contains the runtime and fifteen transparent, 384-pixel WebP sprites. Full-resolution artwork, generated PNG originals, fonts, page chrome, and campaign images are not needed for an installation. Characters load as they appear.

The mode and original assets are free under this repository's Unlicense. Your site still needs a configured Stand Chat installation and an available responder; this mode does not change your Stand Chat plan. The example uses `data-stand-id="demo"`; use your own Stand snippet on your site.

## Five styles, one cast

| Setting | Name | Character |
| --- | --- | --- |
| `g` | Little boos | Soft plush and felt, rounded wings, friendly preschool faces |
| `pg` | A little mischief | Handmade film miniatures, muslin ghost, warm carved pumpkin, playful bat |
| `pg-13` | After dark | Eerie gauze apparition, realistic leathery bat, weathered glowing gourd |
| `r` | Gothic hours | Horror-film practical effects: skeletal wraith, distressed cloth, long vampire fangs |
| `nc-17` | Full haunt | Towering reaper, splinter-toothed pumpkin monster, snarling winged creature |

Each style changes the materials, anatomy, and mood. All fifteen characters were individually generated and reviewed on light and dark backgrounds. The higher levels draw on horror-film practical effects and theatrical Halloween props. Prompts and source provenance are in [assets/README.md](assets/README.md).

The labels borrow the movie-rating vocabulary to describe visual intensity. They are not official film ratings, content certifications, or age gates. No style includes gore or explicit imagery. No Rivian or licensed movie characters are included.

## Make it yours

Use the example's live configurator to choose a cast, pace, placement, size, season, and greeting, then copy the resulting snippet. The example previews the chosen season immediately; the exported snippet respects the schedule.

Script attributes override `window.StandHalloweenConfig` at startup. JavaScript keys are camelCase; attributes are kebab-case (`idleDelay` → `data-idle-delay`).

| JavaScript key | Default | Meaning |
| --- | --- | --- |
| `rating` | `'pg'` | `g`, `pg`, `pg-13`, `r`, or `nc-17` |
| `cast` | All three | Array or comma-separated list of `ghost`, `pumpkin`, and `bat` |
| `activity` | `'lively'` | `calm` (28-second interval, one visitor at a time), `lively` (14 seconds, two), or `haunted` (8 seconds, three) |
| `placement` | `'auto'` | Discover page features; `marked` uses your markers, `edges` keeps visitors at the viewport edges |
| `size` | `1` | Character scale, bounded to `0.75`–`1.35` |
| `season` | `'10-01/11-01'` | Inclusive annual `MM-DD/MM-DD` range in local time, or `'always'` |
| `greeting` | Empty | Use the chosen character's greeting; a nonempty string overrides the invitation and chat greeting |
| `chatGreeting` | Empty | Optional separate greeting passed to Stand |
| `idleDelay` | `12000` | Quiet time before the idle ghost, in milliseconds; minimum 2 seconds |
| `arrivalInterval` | Activity preset | Override the interval between visits, in milliseconds; `null` restores the preset |
| `duration` | `11000` | Ambient visitor lifetime, 5–30 seconds; greeting ghost lasts 22 seconds |
| `maxItems` | Activity preset | Override the concurrent visitor limit, 1–3; `null` restores the preset; narrow screens are more restrained |
| `autoStart` | `true` | Set `false` to start through the API |
| `controls` | `true` | Show the floating pause/resume control; provide an equivalent control if disabled |
| `idleOnce` | `true` | Limit automatic greeting to once per tab session |
| `storageKey` | `'stand-halloween:greeted'` | Optional `sessionStorage` key for that limit |
| `readyTimeout` | `8000` | Time to wait for Stand after an explicit chat click, 0.5–30 seconds |
| `assetBase` | `assets/runtime/` beside script | Absolute or script-relative URL containing rating folders |
| `preview` | `false` | Bypass the seasonal schedule for a demo; leave this off in a production snippet |

For example, before loading the script:

```html
<script>
  window.StandHalloweenConfig = {
    rating: 'pg-13',
    cast: ['ghost', 'bat'],
    activity: 'calm',
    placement: 'marked',
    season: '10-24/10-31',
    idleDelay: 18000,
    greeting: 'A little lost? I know my way around.'
  };
</script>
<script defer src="/halloween/halloween.js"></script>
```

Leave `greeting` blank to keep the character-specific lines as you change styles. A custom greeting is plain text, not HTML. An empty string or `null` resets either greeting override.

## Give the visitors a place to land

Automatic placement looks for suitable page features and falls back to the edges. For more control, mark a few sturdy headings, cards, or images:

```html
<h2 data-halloween="hang">The October edit</h2>
<article data-halloween="perch peek">…</article>
<form data-halloween="none">…</form>
```

`perch` and `peek` offer the top edge of an element; `hang` offers its lower edge. Combine tokens with spaces. `none` excludes an element and its descendants from placement. With `placement: 'marked'`, the mode only considers your marked features before falling back to an edge. Use `placement: 'edges'` to skip page features entirely.

The placement checks account for the character and its invitation, avoid page controls, and update when the page scrolls. Marked features are suggestions, not a request to cover their contents.

## Control it with JavaScript

After the script has loaded:

```js
StandHalloween.configure({ rating: 'g', activity: 'calm' });
StandHalloween.start();          // Resume animation and automatic arrivals
StandHalloween.pause();          // Freeze current visitors and stop arrivals
StandHalloween.stop();           // Remove visitors and stop arrivals
StandHalloween.summon('ghost');  // Invite one character; static if paused
StandHalloween.parade();         // Resume and invite the selected cast in sequence
await StandHalloween.openChat('ghost'); // Open chat from your own control
StandHalloween.state;            // Read-only snapshot, including seasonActive
StandHalloween.destroy();        // Remove the layer, listeners, timers, and API
```

An explicit summon bypasses the once-per-session idle greeting limit. `summon()` preserves a paused state and shows a static visitor until `start()` is called. `parade()` resumes the mode for a bounded cast sequence. Both respect the seasonal schedule; use `preview: true` only when deliberately testing outside it.

For an SPA, call `destroy()` when unmounting the page. Loading the script again creates a fresh instance. Loading it twice without destroying is harmless. After a chat handoff, automatic visits pause; resume with `start()` when appropriate for your page.

## Visitor experience

- Characters enter, settle into the page, and leave. Their surrounding layer lets pointer events pass through.
- Pointer movement, taps, keypresses, and scrolling reset the idle clock. The automatic ghost appears only when chat is available and the ghost is in the selected cast.
- Chat opens only after explicit interaction. The mode calls `StandChat.openChat()` with a greeting; it does not submit a visitor message or simulate an answer.
- Unavailable chat or a failed handoff produces a retryable notice. Opening chat or dismissing a visitor suppresses further automatic idle invitations.
- Hover or keyboard focus freezes a character so it is easy to select. Escape dismisses current visitors. A visible control pauses and resumes the mode.
- Typing in a text field hides and pauses visitors. Hidden tabs pause work. Reduced-motion preferences produce static characters.
- There is no audio, flashing, or jump scare. The runtime adds no separate tracking or cookies. The normal Stand chat handoff identifies the selected rating and character through an activation ID. One optional session-storage flag limits idle invitations; blocked storage does not break the mode.

Events are dispatched on `window`: `stand-halloween:state`, `:arrival`, `:chat`, `:error`, and `:dismiss`. For example:

```js
window.addEventListener('stand-halloween:chat', ({ detail }) => {
  // "requested" means the public openChat() API was called, not delivery confirmed.
  console.log(detail.status, detail.rating, detail.kind);
});
```

The runtime uses Shadow DOM to isolate its styles. A restrictive Content Security Policy must permit the script, image assets, and injected runtime stylesheet. Self-hosting keeps the script and images on your own origin. Google Fonts and shared example-site analytics belong to the example page, not the drop-in runtime.

## Run and check the example

From the repository root, run `npm start` and open `/halloween/`. The site build reads this folder's metadata automatically; no shared-file changes are required.

Manual checks:

- [ ] Move through all five styles; check the artwork, character greetings, slider labels, and exported snippet.
- [ ] Try one character, a smaller cast, and a parade; confirm the selected cast and visitor limits are respected.
- [ ] Change pace, placement, size, season, and greeting; paste the snippet onto a separate host page with Stand installed.
- [ ] Test automatic, marked, and edge placement while scrolling and resizing. Confirm forms and links remain usable.
- [ ] Tap a staged or passing character and confirm Stand opens with the intended greeting.
- [ ] On a fresh tab session, wait without input and confirm one idle ghost invitation appears. Exclude the ghost and confirm it does not appear.
- [ ] Pause, resume, stop, and dismiss with Escape. Reach a moving visitor with keyboard focus.
- [ ] Check 320-pixel and 390-pixel screens, a hidden tab, text-field focus, and reduced motion.
- [ ] Check a date inside and outside the season on the installed snippet; only the example's preview should bypass the schedule.
- [ ] Temporarily block Stand and confirm the retry notice after an explicit chat click.
- [ ] Download the ZIP, load its script and assets from another folder, then destroy and reinitialize it as an SPA would.

## Creative assets and inspiration

`marketing/` contains a Reddit ad, three editorial LinkedIn companion graphics, editable HTML/CSS masters, copy, alt text, and a browser renderer. `og.png` is a composed 1200×630 social preview. Run `node halloween/marketing/render.mjs` to regenerate the creative; the generic repository OG command would replace that composition.

Inspired by [Rivian's 2026 Halloween announcement](https://rivian.com/stories/new-software-halloween-ghostbusters-2026), published October 8: familiar surfaces become playful places to explore. This is an independent experiment, not a partnership or endorsement. Artwork-generation provenance is in [marketing/PROVENANCE.md](marketing/PROVENANCE.md).
