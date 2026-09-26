# Framefield — Leave a comment on the page

A fictional design and developer-handoff canvas with real, contextual Stand Chat conversations. Plain HTML, CSS, and ES modules; no consumer installation or build step.

## Run or copy

Serve this directory with any static HTTP server, or run the repository's `npm start` and open `/comment-the-page/`. Keep `index.html`, `style.css`, `app.js`, `model.js`, and `stand-visitor.js` together. The optional `/_shared/` resources provide only the examples bar; all product and explanation styles are local. Fonts load from Google Fonts, with system fallbacks. The inline SVG artwork is original.

```sh
npx degit standchat/examples/comment-the-page my-canvas
```

The Stand script carries `data-stand-id="demo"`. Replace that value with your registered Site ID from **Sites** in Stand; `app.js` reads it. The template script is retained for site discovery, but its default chat element is hidden because this example owns the conversation UI. No page interaction calls the widget launcher.

## The interaction

- **Design mode:** change palette, poster/split layout, and padding. Copy the resulting CSS values. These operations are local; the example does not create a hosted design document.
- **Comment mode:** click or tap a point on the design, handoff claim, or pricing card. Keyboard users can activate each selection surface or the three target buttons. The pin opens an adjacent thread; on narrow screens the thread follows its target in normal document flow.
- **Context:** a snapshot records the target's exact copy, selected design or price settings, assumptions, and relative pin position. The visitor can inspect it and explicitly refresh it before the first send. Active conversations retain their original context. Each target owns a separate conversation and draft.
- **Consent:** discovery does not create a session. The first deliberate send passes the question as `initialMessage` and context through the supported per-session `prompt` (up to 2,000 characters). Closing the panel keeps the conversation; the separate end control calls Stand's end endpoint.

The local client is copied from this repository's `stand-inline/stand-visitor.js` and included here so the folder works independently. It preserves the [Stand custom UI contract](https://stand.chat/guide/custom-chat-ui): HTTP sends, WebSocket canonical messages, message-ID deduplication, identity changes, notices, safe link cards, follow-up offers, reconnect recovery, and explicit recovery from an uncertain initial request. No model response can execute code or mutate the specimen.

## Fiction and live behavior

Framefield's product promises and pricing are illustrative. The price calculator uses whole editor counts (1–50): monthly billing is $12 × editors; annual billing is $10 × editors × 12 paid upfront. All amounts are USD and exclude taxes, add-ons, and prorating. There is no checkout, team sync, or production export service.

The shared demo connects to a real AI Stand-in and labels its messages as AI. Human coverage and offered email follow-ups require your registered site and responder configuration; the UI only exposes these states when Stand sends their corresponding cards. It never invents teammates or a handoff. Session credentials, drafts, pins, and local settings use tab-scoped session storage; storage-denied browsers continue in memory. Text and streamed previews use text nodes, private prompts are hidden, and links accept only HTTP(S).

## Verification

```sh
node --test comment-the-page/model.test.mjs
npm run og -- comment-the-page
npm run build
```

The focused model checks exercise price boundaries, annual billing, design token normalization, exact context construction, and safe URLs. `og.png` is a 1200×630 browser capture of the completed page, not a mockup. See the PR for actual browser coverage and live-service limitations.

For maintainers with Playwright CLI available, `browser-check.js` is a test-only `run-code` function. Open this example in a named session, then pass the file's contents to `playwright-cli --session <name> run-code`. It creates and closes its own isolated context and substitutes API/WebSocket fixtures there; the production page never loads these fixtures. It checks contextual creation, safe rendering, message retries, recovery, identity changes, follow-up, unavailable and uncertain starts, and phone/desktop overflow with the shared chrome omitted. Successful output reports 22 checks. The separate live demo test is still required to verify the hosted service.

Manual checks:

- [ ] Change the specimen, copy CSS, and check the resulting values.
- [ ] Select all three targets with keyboard and touch, inspect their context, close and reopen each pin.
- [ ] Send a real question, check the AI label, reload, and reply in the recovered thread.
- [ ] Check unavailable, offline, uncertain-start, and retry behavior without duplicate sends.
- [ ] With your own registered site, exercise real human handoff and email follow-up.
- [ ] Check the layout at desktop and phone widths and with shared chrome unavailable.

Released into the public domain under the repository's Unlicense. Stand's name and marks retain their own rights.
