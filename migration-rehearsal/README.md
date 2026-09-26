# Threadlane migration rehearsal

A fictional issue and project management website with a working, contextual Stand Chat conversation. Edit a current workflow beside its proposed equivalent, then discuss the uncertain parts without losing the board.

## Run or copy

From the repository root, `npm start` serves the examples. The folder also runs on any static HTTP server without dependencies or a build step.

```sh
npx degit standchat/examples/migration-rehearsal my-threadlane
```

All functional files are in this folder. The optional `/_shared/` stylesheet and script only supply the example bar and code-copy buttons; remove those two references when hosting the copied folder elsewhere. Fonts come from Google Fonts, with local sans-serif fallbacks.

Replace `data-stand-id="demo"` in `index.html` with the Site ID from **Sites** in Stand. `app.js` reads the same value. `data-stand-hide-button="true"` keeps the supplied launcher hidden; the embedded panel uses the visitor API directly. The demo ID answers on localhost and preview domains, but demo conversations do not appear in your account.

## Behavior and limits

- Three editable starting workflows, two to eight columns, mouse/touch drag, and separate move/remove buttons. Reset loads the current sample and retains the chat.
- `workflow.js` matches a fixed synonym list. Custom status labels are preserved when requested. Unknown labels, duplicate labels, approvals, and a completed stage before another step are flagged. Reporting and approval placement add explicit decisions. No readiness score or actual migration is inferred.
- A single conversation follows the selected mapping. Initial `prompt` context uses Stand's supported 2,000-character field; every visitor send also includes the current board snapshot in its text body, so changed mappings are available on follow-ups. The UI lets the visitor inspect that context before sending and in each sent message.
- Editing, selecting mappings, and discovery never submit board contents. Only an explicit Send shares the question, scenario, requirements, mapping, and assumptions. Discovery sends the current page URL. Do not put sensitive information in page URLs.
- Responses are plain text. They cannot mutate the board, import data, or execute browser code. Link cards accept only HTTP(S) URLs. Internal prompts, unknown cards, and metadata are not displayed.
- Session storage keeps the board, selected mapping, drafts, and conversation credentials in the same tab. Denied storage falls back to memory. Reset does not end a chat; **End chat** does. After an ambiguous first start, the visitor must explicitly choose a new conversation and review the draft.
- The local `stand-visitor.js` is adapted from this repository's Stand visitor client, with a final-transcript read for send/closure races. It retains canonical message deduplication, original message IDs on retry, bounded reconnects, truthful AI/human identity, notices, attribution, link tracking, and offered email follow-ups.

Threadlane is an invented demo business. The board describes a proposal, not verified capabilities of a real service. Tickets, history, permissions, attachments, automations, and reporting data are never imported or inspected.

## Verification

```sh
node --test migration-rehearsal/*.test.mjs
npm run build
npm run og -- migration-rehearsal
```

The focused Node tests cover ambiguous mappings and ordering, requirements, context construction, storage validation, serialized chat creation, duplicate echoes, reload recovery, ambiguous starts, same-ID retries, handoff/follow-up transitions, and recovery of a send accepted during closure. Protocol tests use fixtures, not a real human.

Browser validation includes a real demo AI reply, context on initial and subsequent messages, same-session reload recovery, explicit end, desktop and phone layouts, keyboard controls, mouse and touch drag, and arbitrary text rendered safely. Human handoff and follow-up delivery require a configured site for live acceptance testing.

Contract: [Stand custom chat UI guide](https://stand.chat/guide/custom-chat-ui). Public domain under the repository's [Unlicense](https://unlicense.org/).
