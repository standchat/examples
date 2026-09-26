# Afterlight — demoscene chat

A fictional creative-coding gathering with original procedural artwork inspired
by the early PC demoscene. No original demo assets, music, or logos are used.

Run `npm start` at the repository root and visit `/demoscene-chat/`. Or copy this
folder to any static web server. The shared example bar and explainer styles are
optional; the experience itself has no framework or external graphics dependency.

## The interaction

- Terrain: a perspective sine landscape of luminous dots.
- Orbit: the same dot grid mapped onto a rotating torus.
- Vortex: a twisting tunnel with a moving vanishing point.
- Approach: landscape dots gather into “Hey, curious human. What are you making?”
  as the pointer approaches or the visitor scrolls. After a short idle interval,
  the greeting also forms on its own, without taking focus.
- Reply inline: type directly below the greeting. Only sending the first reply
  enters the full-screen conversation and creates a Stand session.
- Send: a particle version of the message rises from the real typing line.
- Receive: stars project through 3D space and assemble into the reply; after a brief
  hold, the dots crossfade into crisp, selectable HTML.
- History: previous messages tilt back like a 3D scroller; scrolling restores flat text.
- Close: return to the selected landscape, preserving the conversation.

`scene.js` draws the Canvas 2D landscape, samples greeting glyphs, and morphs the
same points in response to pointer proximity and scroll progress. `transmission.js` contains the WebGL
vertex/fragment shaders and samples DOM glyphs into particle targets. `app.js`
owns the accessible HTML chat; `transmission.css` styles the conversation stage. `stand-client.js`
is adapted from the repository's vintage terminal client, with an isolated storage
key. It uses Stand's Visitor API directly, so no widget script is needed.

Set `siteId` in `app.js` to your own Stand Site ID. The default `demo` site provides
a real AI conversation. Its generated answers may vary. Afterlight is fictional:
the prompt explicitly excludes real bookings, prices, and ticket availability.
Session storage preserves the chat across reloads in the same browser tab.
Responder discovery runs on page load; merely viewing or playing with the
artwork never creates a conversation. The starfield follows the pointer and
briefly accelerates with wheel scrolling and typing. Marketing copy has been
removed; implementation notes are in a collapsed “Behind the pixels” disclosure.

## Manual test checklist

- [ ] Switch among all three scenes and move the pointer over the artwork.
- [ ] Move toward the greeting, scroll, or wait briefly; watch the landscape form words.
- [ ] Verify movement and scrolling never open the dialog, take focus, or create a session.
- [ ] Type into the inline reply field and press Enter; only then enter the conversation.
- [ ] Send a message and receive a real reply; verify shader letter assembly and the handoff to selectable text.
- [ ] Close with Escape and the close button; check focus returns to the inline reply.
- [ ] Reopen and reload; verify the conversation returns without duplicate messages.
- [ ] Disconnect the network; check the error/retry state and preserve an unsent draft.
- [ ] Pause animation and enable reduced motion; chat must still work immediately.
- [ ] Check 320px and 390px mobile widths, a short viewport, and keyboard navigation.
- [ ] Replay a message, then select/scroll during formation; text should appear immediately.
- [ ] Disable WebGL or simulate context loss; the HTML conversation remains usable.
- [ ] End the chat and start another; verify the old transcript clears.
- [ ] Run `npm run og -- demoscene-chat` and `npm run build` at the repo root.

Canvas resolution is capped at 1.5× pixel density. Fewer points are used on phones.
Rendering stops while paused, offscreen, or in a hidden tab. If Canvas or WebGL is unavailable,
the HTML site and chat continue to work without the decorative effect.
