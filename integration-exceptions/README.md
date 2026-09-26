# Flowspoke: the conversation is the exception path

A fictional workflow desk where a blocked record branches directly into a live Stand Chat investigation. Input fields, a deterministic gate result, visitor questions, and real responder messages share one vertical event trail. A replay can add a before/after comparison to the discussion.

## Run or copy

Run `npm start` from the repository and visit `/integration-exceptions/`. Or copy this folder to any HTTP static host; no install or build is required. The optional `/_shared/` references supply the examples gallery bar only. All application modules are local to this folder.

Replace the Stand script in `index.html` with your installation snippet from **Sites** in Stand. `chat.js` reads its `data-stand-id`. The shared `demo` uses Stand's AI and does not save conversations to your account. Use your registered domain and configured responders for real human handoff and account-specific behavior.

## Follow the question branch

1. The opening trace illustrates a trial record stopped by the paid-customer rule. Click **plan / trial** to quote that exact field. Inspect the evidence disclosure below the question.
2. Ask what should happen if payment arrives later. A real Stand reply continues the event trail at step 02. Quoting fields and replaying locally do not create a conversation or send a message.
3. Open **Change the exception**, select **Send to team review** under **If blocked**, and **Replay flow**. The original investigation stays anchored to Run 001. The comparison shows the failure path changing from stop to review.
4. Select **Include this replay with my next message**, then ask a follow-up. Every question retains the exact evidence sent with it in its own disclosure. A later replay never rewrites earlier evidence.
5. Try a paid sample, duplicate detection, or a USD threshold of 240 versus 241. Change source and destination tools; their event/action menus follow the selection. Every replay initially stays local, even if an earlier replay was included.
6. Reload to recover the transcript, question draft, original run, field quotes, and replay choice. **Undo edit** and **Reset setup** change the editable setup; completed runs and the conversation remain. End the conversation explicitly when finished.

Controls use native buttons, selects, inputs, and disclosures with keyboard and touch access. The mobile graph folds downward from trigger to exception, then right to the destination; the question branch continues below. Reduced motion removes traversal delays. Edits cancel an in-progress traversal before it can publish stale results.

## How the evidence and conversation connect

`investigation.js` freezes each normalized run and its result. Reload recovery recomputes outcomes from stored inputs. The original run stays fixed for the investigation; each replay is compared against that anchor. Only an explicit checkbox includes the replay with a question.

`evidenceMessage()` encodes the original run, highlighted fields, optional replay, and question as a JSON envelope in ordinary visitor text. This works for both Stand's initial message and subsequent messages. The supported session `prompt` supplies only a short static instruction about the fictional workflow. Each visitor row displays the question and an expandable copy of its own sent evidence. AI and human messages remain plain text and never become workflow commands.

`stand-visitor.js` owns discovery, session creation, HTTP sends, WebSocket updates, identity, canonical messages, pending-message IDs, recovery, and session storage. It is copied locally from the repository's Stand Inline client, with a draft flush on teardown to preserve typing immediately before reload. An uncertain start requires an explicit choice before creating another conversation. Retries reuse the original message ID. Denied/full storage falls back to memory.

The presentation preserves Stand notices, safe attribution and link cards, AI/human identity, handoffs, and offered email follow-up. The standard Stand script supplies the gallery availability indicator; its floating interface is hidden because the page presents the conversation. See the beta [Stand custom chat UI contract](https://stand.chat/guide/custom-chat-ui).

## Simulation boundaries

No service is connected. A trigger supplies a fixed fixture; destination actions only illustrate a route. Paid means `plan === 'paid'`. Deduplication compares trimmed, lowercased email against a fixed one-record directory. Amount thresholds are inclusive, whole-dollar USD values. Runs never update the fixture or directory. Failed rules skip the destination, optionally taking a simulated team review path. Free-text requirements are discussion context, not executable rules. Update actions assume an existing destination record.

## Files

- `scenario.js`: fixtures, normalization, and deterministic rules.
- `investigation.js`: immutable runs, comparisons, field references, and message evidence.
- `app.js`: editable workflow, cancellable replay, undo, and reset.
- `chat.js`: event-trail presentation, explicit evidence selection, live status, recovery, and follow-up.
- `stand-visitor.js`: self-contained Stand visitor transport and lifecycle.
- `*.test.mjs`: rule boundaries, all 384 supported combinations, immutable evidence, opt-in comparison, encoding, and immediate-reload draft recovery.
- `og.png`: a real 1200×630 screenshot of this page.

## Validation

```sh
node --test integration-exceptions/*.test.mjs
npm run build
npm run og -- integration-exceptions
```

Manual checks:

- [ ] Quote and remove a field using keyboard and touch; inspect evidence before submitting.
- [ ] Replay stop, review, and passing routes; verify the original trace is unchanged.
- [ ] Include a comparison with a follow-up; confirm earlier messages keep their original evidence.
- [ ] Exercise tool/event menus, Undo edit, Reset setup, reduced motion, and a narrow viewport.
- [ ] Send a real demo question, receive a reply, reload, and end the same conversation.
- [ ] On a configured site, verify real human handoff, follow-up offers, notices, and unavailable/recovery states.

Public domain under the repository's Unlicense. Original diagrams use HTML/CSS and inline SVG; `mark.svg` is original. CDN fonts have system fallbacks.
