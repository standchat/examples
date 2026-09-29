# Game room

Open `gameroom.html` beside the original vintage-terminal example. It uses the
same `Crt`, `Rom`, `Screen`, monitor model and `StandClient`, with an independent
page controller. There is no build step.

## The games

[`games.js`](games.js) contains the complete prompts, greetings and title screens
for Colossal Cave Adventure, Star Trek, and Hunt the Wumpus. Each prompt includes
the initial state, map, legal commands, resource changes, help, invalid-input
behavior, restart confirmation and win/loss conditions. The complete prompts are
checked against the client's 2,000-character limit at module load.

These are AI adaptations with compact rules, not ports of the original programs.
Stand maintains the game through the conversation. Replies can vary; the page
does not run a deterministic game engine. The screens identify them as AI editions.
Historical references: [Adventure source archive](https://www.ifarchive.org/indexes/if-archive/games/source/),
[BASIC Computer Games: Super Star Trek](https://www.atariarchives.org/basicgames/showpage.php?page=157),
and [Gregory Yob's Hunt the Wumpus article](https://www.atariarchives.org/bcc1/showpage.php?page=247).
The prompts and displayed prose were written for this example.

## Separate sessions and rendering

- Each terminal owns its client, transcript, screen, draft and command history.
- A Storage adapter prefixes the client's key with the game ID. Saved sessions
  survive reloads in the same tab without sharing state with another game or the BBS.
- Discovery starts on opening a terminal; the first submitted command creates
  its conversation. Opening the page alone creates no conversations.
- Closing or switching disconnects the old socket without ending its session.
  Reopening fetches a fresh snapshot and reconnects, including replies completed
  while the terminal was closed. In-flight HTTP sends are allowed to settle.
- Only the selected CRT ticks or renders while expanded. The overview stops
  drawing after settling; a hidden browser tab stops rendering and disconnects.
- Escape and the Game room button minimize. Dialog focus stays contained and
  returns to the selected terminal. Screen-reader transcripts, reduced motion,
  mobile viewport resizing, scrollback and a non-WebGL text fallback are supported.

## Background asset

`assets/greenbar-paper.jpg` was generated with the built-in image generation tool,
then encoded as JPEG for the page. The heading is live HTML text in VT323, so it
stays crisp and accessible. Final image prompt:

> Use case: historical-scene. Asset type: full-viewport website background texture for a minimal vintage computer game room. Primary request: a photorealistic flat overhead scan of blank 1960s–1970s mainframe continuous-feed greenbar printer paper, the kind used with IBM System/360 line printers. One single very broad unfolded sheet fills a landscape 1536x1024 composition edge to edge. Extremely pale desaturated sage-green horizontal bands alternating with warm ivory paper, fine natural paper fibers, subtle age and a few barely perceptible horizontal fanfold creases. Narrow tractor-feed perforation strips and evenly spaced round sprocket holes along the far left and right edges only. The center 85 percent must be unobstructed, quiet, almost blank pale paper for three dark vintage terminals to sit over. Soft neutral diffuse light, no perspective, no desk, no objects, no shadows of other objects. Tasteful authentic archival stationery, restrained aging, not grunge. No printed text, no numbers, no logos, no watermark. Generate the paper texture itself, not a website or a monitor.

## Manual test checklist

- [ ] Open the page: three named terminals and the printer-paper heading appear.
- [ ] Open each game and send its suggested first command, then HELP.
- [ ] Switch games and reload: each transcript and draft stay with their game.
- [ ] Expand/minimize with mouse, touch and keyboard; check focus restoration.
- [ ] Verify a narrow phone viewport and an open onscreen keyboard.
- [ ] Disable WebGL: the text terminal still accepts commands and shows replies.
- [ ] Go offline and reconnect; retry an unconfirmed command without duplication.
- [ ] Follow How this is done back to the vintage-terminal example.
