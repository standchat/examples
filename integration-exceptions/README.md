# Flowspoke: integration exceptions

A fictional workflow automation page built with plain HTML, CSS, and JavaScript. The deterministic canvas is local; the inline conversation is a real Stand Chat integration.

## Run or copy

From the repository, run `npm start` and visit `/integration-exceptions/`. Or copy this folder to any HTTP static host; there is no install or build step. The optional `/_shared/` stylesheet and script provide the examples gallery bar only. The custom chat uses local modules and works without them.

Replace the Stand script in `index.html` with the installation snippet from **Sites** in Stand. `chat.js` reads `data-stand-id` from that script. `demo` is Stand's shared AI demo, usable on localhost and preview hosts; it does not save conversations to your account. Configure your own registered domain and responders to test human handoff and account-specific skills.

## What to try

1. Run the default paid record through Forms → CRM.
2. Add **Paid customers only**, select the trial record, and run again. The destination is skipped.
3. Select **Send to team review** for the failure branch. The same record now takes the alternate route.
4. Try **Skip existing records** with the existing customer; its email contains whitespace and uppercase characters. Or test an amount threshold of 240 and 241 with the $240 record.
5. Review the workflow snapshot in the inline conversation. If the canvas changed, explicitly attach its current state. Send a question to start a real conversation; running samples and attaching snapshots do not send a message.
6. Reload during the conversation. The local client restores its canonical transcript and reconnects. Undo and Reset affect the canvas, not the conversation or its attachment.

All controls use native buttons, selects, inputs, and forms, with keyboard and touch access. The mobile workflow stacks vertically. Reduced motion skips the traversal delays.

## Files and boundaries

- `scenario.js`: fixed fixtures, input normalization, deterministic rules, and context serialization.
- `app.js`: canvas rendering, cancellable traversal, undo/reset, and rule controls.
- `chat.js`: inline presentation, safe rendering, explicit context attachment, live status, retry/end controls, and offered email follow-up.
- `stand-visitor.js`: copied locally from the repository's Stand Inline client, with a draft flush on teardown to preserve typing immediately before reload. Owns discovery, session creation, HTTP sends, WebSocket replies, identity cards, pending-message IDs, recovery, and session storage. It has no sibling-folder dependency.
- `scenario.test.mjs`: rule, boundary, normalization, and context-limit tests, including all 384 source/destination/sample/rule/branch combinations.
- `stand-visitor.test.mjs`: regression coverage for draft recovery when the page closes inside the debounce window.
- `og.png`: an actual 1200×630 screenshot of this page.

The first explicit send passes the question as `initialMessage` and the reviewed workflow as Stand's supported session `prompt` (at most 2,000 characters). When an attachment changes in an active conversation, the next explicit send includes the updated snapshot as ordinary visitor text. Nothing in an AI or human reply mutates the canvas.

No tool is actually connected. A trigger supplies the selected fixed record; destination actions only illustrate a route. Paid means `plan === 'paid'`; deduplication checks trimmed, lowercased email against a fixed one-record directory; amount rules are inclusive whole-dollar USD comparisons. Runs never change the fixture or directory. Failed rules skip the main action, with an optional simulated review branch. Free-text requirements are conversation context, not executable rules.

The client preserves configured notices, safe attribution links, truthful AI/human identity, link cards, handoffs, and follow-up forms when offered by Stand. An uncertain session creation requires an explicit choice before another start. Message retries reuse the original ID. API/site-scoped session storage supports same-tab reload recovery; denied or full storage falls back to in-memory operation. The retained standard Stand script provides the gallery's availability indicator; its floating UI is hidden because this page owns the conversation UI.

See the current [Stand custom chat UI contract](https://stand.chat/guide/custom-chat-ui), which is in beta.

## Validation

```sh
node --test integration-exceptions/*.test.mjs
npm run build
npm run og -- integration-exceptions
```

For manual verification, run passing, blocked, and review routes; change tools; test keyboard menus and buttons; check Undo/Reset and a narrow mobile viewport; review the context before sending; send a real demo question; reload and reconnect; and end the conversation. A registered site is needed to exercise a real human handoff and follow-up offer.

Public domain under the repository's Unlicense. Original illustrations are inline SVG and `mark.svg`; fonts load from a CDN with system fallbacks.
