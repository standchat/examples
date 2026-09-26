# Foldcraft — Template audition

An original fictional website builder and template marketplace. The visitor puts the same business name and description into three substantially different authored layouts, marks sections, and discusses preferences through real, section-scoped Stand conversations.

## Run or copy

Open the folder through any static HTTP server. No installation or build step is needed. To copy:

```sh
npx degit standchat/examples/template-audition my-audition
```

Keep `index.html`, `style.css`, `app.js`, `model.js`, `stand-inline.js`, and `stand-visitor.js` together. The `/_shared/` references are optional repository chrome; remove those references and `<sx-example-bar>` when hosting the copied folder without that chrome. All artwork is original inline SVG or CSS; there are no image or font dependencies.

Change `SITE_ID = 'demo'` in `app.js` and `data-stand-id="demo"` in `index.html` to your registered Site ID from **Sites** in Stand. Configure your responders and domain. The demo Site ID connects to Stand's shared demo AI, not a configured Foldcraft business. The widget bundle supplies the example bar's availability signal; it is hidden on this custom UI page. Actual chat uses the local inline component and visitor client.

## Interaction and boundaries

- Fieldwork is a warm editorial split layout; Signal uses bold poster typography and expressive color; Good Form uses a centered product presentation.
- Name and description update locally through `textContent`. Supporting copy and original artwork remain illustrative. There is no model-generated design, scoring, or automated change to the preview.
- Keep, Wrong, and Missing belong to a specific template and section. Notes distinguish visual preferences from the business story. Choices can be changed or removed in the brief; its linked section titles open editable notes.
- Wrong and Missing reveal the inline Stand UI at that section. Discovery checks availability but creates no conversation. Only an explicit Send starts a conversation or sends a message.
- A visible context preview shows the current business, template, target section, explicit feedback, brief notes, and assumptions. Every visitor send includes that snapshot plus their question as a supported text message. AI/human replies never execute page changes.
- Separate scopes (`foldcraft-TEMPLATE-SECTION`) isolate the nine possible section threads. Returning to a section reuses its conversation. Session recovery, pending-message reconciliation, bounded reconnects, responder identity, handoff cards, safe links, notices, and offered email follow-up are inherited from the local client.
- Local choices and conversation credentials use this tab's session storage when available. Without storage, the page continues in memory. Reset clears audition choices, not Stand conversations. End a conversation in its inline thread.
- Download/copy exports only explicit choices and notes with the demo assumptions. No signup, purchase, or website publishing is implemented.

## Stand implementation

`stand-inline.js` and `stand-visitor.js` are copied from the repository's public-domain inline example, so this folder has no sibling dependency. The custom chat contract is documented at <https://stand.chat/guide/custom-chat-ui>.

This copy adds one local synchronous `stand-before-send` event immediately before `client.send()`. The page changes `event.detail.text` to include the latest brief. This is a page/component hook, not a new Stand API. The normal visitor HTTP endpoints and WebSocket events handle the conversation. The session's short `prompt` explains the demo's limitations; it is not treated as a secret or authorization boundary.

## Verification

```sh
node --test template-audition/model.test.mjs
npm run build
npm run og -- template-audition
```

The model tests cover independent section state, preservation of explicit comments, validation of stored data, limits, complete/current conversation context, deterministic brief export, and refreshed context after an uncertain-start retry. `og.png` is a real 1200×630 browser capture of the finished page, using the repository's capture tool.

Browser validation performed in isolated Chrome contexts:

- Desktop at 1440px and mobile/touch at 390px; all three compositions, preview width controls, no horizontal overflow, keyboard tab arrows/Home/End, reset cancel/confirm, and literal rendering of HTML-shaped inputs.
- Real demo discovery, one explicit session creation, contextual AI reply, reload/session recovery without another creation, brief download, and explicit conversation end.
- Controlled network fixtures for no available responder, discovery rejection, uncertain first-start failure, and reload without automatic duplicate creation.
- Operation with optional `/_shared/` assets blocked, and no JavaScript errors in the main/touch flows.

Live human handoff and offered follow-up require a configured real site; the shared demo only has an AI responder. The reused client supports those states, but they were not exercised against a live human in this verification.

Public domain under the repository's Unlicense. Stand Chat's name and marks retain their existing rights.
