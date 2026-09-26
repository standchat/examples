# Dayfolio tool replacement

A fictional workspace website built around the question “Which tool could you stop paying for?” Visitors assemble a generic tool shelf, compare one job, preserve its dependencies, and discuss the tradeoffs in a real, attached Stand conversation.

## Run or copy

Serve this directory with any static web server. The page uses plain HTML, CSS, JavaScript, and original SVG drawings; no consumer installation or build step is needed.

```sh
npx degit standchat/examples/tool-replacement my-dayfolio
```

Set `SITE_ID` in `model.js` and the Stand script's `data-stand-id` in `index.html` to your registered Site ID from Sites in Stand. The included `demo` site works on localhost and preview domains and connects to Stand's shared AI Stand-in. Its conversations do not appear in your account. Your own configured site is needed to exercise human handoffs and follow-up offers.

The two `/_shared/` includes and `<sx-example-bar>` are optional gallery chrome. Remove them when copying. No functional code depends on a sibling example.

## Interaction and boundaries

- Use shelf checkboxes to include tools, then drag a card to the desk or use its Compare button with a mouse, keyboard, or touch.
- Each tool has its own original sample workspace, required-feature selections, and free-text feature note.
- `model.js` defines all fictional capabilities. A selected specialist-only need takes precedence over supported needs; a workaround never counts as a full replacement. An empty requirement set gives no recommendation. Free-text feature notes remain unclassified and explicitly need discussion. There are no savings estimates or migration promises.
- The fixed sample workspace and fit note are local illustrations, clearly separated from live conversation. AI replies never mutate the page.
- The first deliberate message sends the tool, job, shelf, required features, assumptions, and bounded feature note as supported session `prompt` context. The question is the visitor's `initialMessage`. Nothing from the planner is sent before that action.
- Each tool has a separate `dayfolio-<tool>` conversation scope. Its assumptions lock while a conversation is active, being sent, being recovered, or uncertain. End the conversation to edit them. Switching tools preserves the original context and transcript.
- Reset planner clears local choices, drafts, and ended transcripts when no tool conversation is active. It does not delete server history or replay messages.
- Planner state and original conversation assumptions use a separate `sessionStorage` entry. If storage is denied, everything continues in memory for the page lifetime.

## Stand implementation

`stand-inline.js` and `stand-visitor.js` are local copies of the repository's public-domain inline component/client. The client implements the [official custom chat UI beta contract](https://stand.chat/guide/custom-chat-ui): discovery, HTTP sends, WebSocket replies, canonical message reconciliation, same-ID retries, uncertain-start handling, reload recovery, responder identities, notices, attribution, and follow-up/handoff cards. Preserve those behaviors and keep the Stand attribution when adapting the page.

The template's demo Stand script remains for shared gallery availability, while its floating UI is hidden. The desk conversation owns its interface and connects directly through the visitor API. No secret or admin credential belongs in this folder.

`app.js` handles the shelf and live component composition. `contextFor()` stays below the API's 2,000-character context limit, including maximum-length feature notes and escaped characters. Arbitrary input is rendered as text, never HTML.

## Verification

```sh
node --test tool-replacement/model.test.mjs
npm run build
npm run og -- tool-replacement
```

Run these from the repository root. The model suite covers all 80 possible feature combinations, specialist/workaround precedence, malformed stored state, snapshot isolation, and context limits. The social image is a real 1200×630 screenshot generated from the page.

For browser checks, use a dedicated server and isolated browser context. Exercise keyboard selection, drag and drop, touch-friendly selection, switching tools, live sending, reload and connection recovery, End chat, reset, offline states, safe text rendering, and narrow viewport overflow. Live human handoffs need a configured non-demo site.

Public domain under the [Unlicense](https://unlicense.org/). Stand Chat's name and marks retain their existing ownership.
