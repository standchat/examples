# Rowhaven: Who can see this row?

A fictional database/authentication platform with a local permission preview and a real Stand conversation beside the selected record. Plain HTML, CSS, and JavaScript; no installation or build step.

Serve this folder over HTTP, for example `python3 -m http.server 8000`, and open `http://localhost:8000/`. The `/_shared/` stylesheet, script, and `<sx-example-bar>` are optional gallery chrome. Remove them when copying this folder elsewhere. All functional imports are local to this folder.

## Files

- `policies.js`: six fixtures, four identities, three contractor policy variants, pure decisions and context snapshots.
- `app.js`: table, controls, inspector, scenario persistence, Stand mount.
- `conversation.js`: contextual visitor messages and first-session instructions.
- `stand-inline.js` and `stand-visitor.js`: public-domain copies of the repository's inline conversation UI and visitor client, with a small local presentation adaptation that collapses the visitor's scenario attachment into an inspectable detail. No sibling-folder dependency. They retain canonical message recovery, idempotent pending retries, uncertain-start handling, responder identity changes, handoff cards, follow-up offers, attribution, and safe text rendering.
- `policies.test.mjs`: explicit permission matrix plus boundary and context tests.
- `og.png`: 1200×630 browser capture of the completed page.

## Local policy model

Every role requires matching workspace membership. Administrators can read, update, and delete workspace records, including archives. All other roles are denied archived records. Customers read only their own shared projects. Teammates read and update active workspace projects. Contractors read and update assigned active workspace projects by default; the workspace-wide variant broadens reading only; the read-only variant disables all contractor updates. Only administrators delete. Unknown roles, actions, and variants deny access.

All data ships to the browser. Denied row names are masked in the table; selecting one explains the denial. Inspecting the context reveals the fictional fixture, including its name. The buttons simulate allow/deny decisions and do not modify data. This is an educational preview, not authentication or production access control. Real enforcement belongs on your server or database.

## Stand integration

Uses the [official visitor API contract (beta)](https://stand.chat/guide/custom-chat-ui), checked September 26, 2026. The custom client directly uses Stand's HTTP/WebSocket API and does not need a floating widget or `stand.js`. The demo site ID is configured in `app.js`. Replace it with your registered Site ID from **Sites** in Stand for your responders and history.

Discovery on mount contains only the public Site ID and page URL. Clicking a row, changing a policy, testing an action, or drafting a question never creates a session or shares scenario inputs. The visitor chooses Send to create the first session with `initialMessage` and a short supported `prompt`. Each new message carries the current selected fixture, identity, policy, decisions, assumptions, and question. Pending retries retain the original snapshot and `clientMessageId`. No message is replayed automatically into a new conversation.

Scenario controls and chat recovery persist in separate `sessionStorage` entries, scoped to this example. Storage failure degrades to in-memory operation. Reset sandbox changes local controls only; End chat explicitly ends the conversation. The shared demo has an AI responder; human routing/handoff requires a configured site. AI prose cannot change controls, execute code, or validate a policy.

## Verification

```sh
node --test permission-playground/policies.test.mjs
npm run build
npm run og -- permission-playground
```

The model tests enumerate 216 role/record/variant/action decisions and check workspace, archive, assignment, sharing, write/read consistency, invalid inputs, and context replacement on recovery. Browser verification should also cover desktop/mobile layout, keyboard control, deliberate first send, follow-up context changes, reload, network failure, uncertain start, pending retry, and explicit end/new chat.

Public domain under the repository's Unlicense. All brand names, people, projects, and visuals in this example are invented. Stand Chat attribution is retained.
