import { StandVisitorClient, parseCard } from './stand-visitor.js';
import { FIELDS, restoreRun, runLabel, sameRun, fieldValue, compareRuns, investigationContext, evidenceMessage, readEvidence } from './investigation.js';

const $ = id => document.getElementById(id);
const safeUrl = value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
};
const errors = {
  connect: 'Could not reach Stand. Your draft is kept. Check your connection and try again.',
  start: 'Stand could not start this conversation. Check availability and try again.',
  uncertain: 'We could not confirm whether the conversation started. It may have reached Stand. Preparing a new conversation can create a second one; your question is kept for you to review and send.',
  send: 'Delivery is not confirmed. Retry the same message to check it without creating a duplicate.',
  lost: 'The conversation ended before delivery was confirmed. Your unresolved text is kept below.',
  gone: 'This conversation is no longer available. Prepare a new one to continue.',
  paused: 'The connection is paused after several attempts. Reconnect to check for replies.',
  refresh: 'Could not refresh the transcript. Reconnecting…',
  end: 'Could not confirm the end of the conversation. Try End conversation again.',
  email: 'Could not send the follow-up request. Check your email and try again.',
  offer: 'The email offer has expired. Continue in the conversation.',
};

export function createThread({ initialRun }) {
  const site = document.querySelector('script[data-stand-id]')?.dataset.standId || 'demo';
  const key = `flowspoke:investigation:v2:${site}`;
  const client = new StandVisitorClient({ site, scope: 'flowspoke-investigation' });
  let anchor = initialRun;
  let replay = null;
  let includeReplay = false;
  let fields = [];
  let mounted = false;
  let stop;
  let lastTranscript = '';
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved) {
      anchor = restoreRun(saved.anchor) || anchor;
      replay = restoreRun(saved.replay);
      includeReplay = Boolean(replay && saved.includeReplay);
      fields = FIELDS.filter(field => saved.fields?.includes?.(field));
    }
  } catch { /* Evidence works in memory if storage is denied. */ }

  function persist() {
    try { sessionStorage.setItem(key, JSON.stringify({ anchor, replay, includeReplay, fields })); } catch { /* In-memory operation. */ }
  }
  const evidence = () => ({ anchor, comparison: includeReplay ? replay : null, fields });
  const busy = () => client.getSnapshot().busy || Boolean(client.getSnapshot().pending);

  function renderEvidence() {
    $('anchor-label').textContent = `INVESTIGATION / ${runLabel(anchor).toUpperCase()}`;
    $('record-name').textContent = anchor.result.record.name;
    $('record-summary').textContent = `${anchor.result.record.company} · ${anchor.config.trigger}`;
    $('trace-outcome').textContent = anchor.result.passes ? 'The record passed this rule.' : anchor.result.route === 'review' ? 'The record took the review path.' : 'The rule stopped this record.';
    $('trace-reason').textContent = `${anchor.result.reason} ${anchor.result.passes ? anchor.config.action + ' was simulated.' : 'The destination action was skipped.'}`;
    for (const field of FIELDS) {
      let button = document.querySelector(`[data-field="${field}"]`);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'field'; button.dataset.field = field;
        const key = document.createElement('span'); key.textContent = field;
        const value = document.createElement('strong'); value.textContent = fieldValue(anchor, field);
        button.append(key, value);
        button.setAttribute('aria-label', `Quote ${field}: ${fieldValue(anchor, field)}`);
        button.addEventListener('click', () => toggleField(field));
        $('record-fields').append(button);
      }
      button.disabled = busy();
      button.setAttribute('aria-pressed', String(fields.includes(field)));
    }
    $('quoted-fields').replaceChildren(...fields.map(field => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'quote-chip'; button.disabled = busy();
      const text = document.createElement('span'); text.textContent = `${field}: ${fieldValue(anchor, field)}`;
      const cross = document.createElement('span'); cross.textContent = '×'; cross.setAttribute('aria-hidden', 'true');
      button.append(text, cross); button.setAttribute('aria-label', `Remove quoted ${field}`);
      button.addEventListener('click', () => {
        toggleField(field);
        document.querySelector(`[data-field="${field}"]`)?.focus();
      }); return button;
    }));
    $('context-preview').textContent = investigationContext(evidence());
    $('replay-evidence').hidden = !replay;
    if (replay) {
      const comparison = compareRuns(anchor, replay);
      $('replay-title').textContent = `${runLabel(anchor)} → ${runLabel(replay)}`;
      $('comparison-diff').replaceChildren(...comparison.changes.map(change => {
        const row = document.createElement('div'); row.className = 'change';
        for (const [className, value] of [['change-label', change.label], ['change-old', change.before], ['change-arrow', '→'], ['change-new', change.after]]) {
          const span = document.createElement('span'); span.className = className; span.textContent = value; row.append(span);
        }
        return row;
      }));
      if (!comparison.changes.length) $('comparison-diff').textContent = 'Same setup and record. The result is repeatable.';
      $('comparison-outcome').textContent = `${anchor.result.route.toUpperCase()} → ${replay.result.route.toUpperCase()}. ${replay.result.reason}`;
      $('include-replay').checked = includeReplay;
      $('include-replay').disabled = busy();
      $('replay-notice').textContent = includeReplay ? 'The before/after will accompany your next question.' : 'This replay stays local until you choose to include it and send.';
    }
  }

  function toggleField(field) {
    if (busy()) return;
    fields = fields.includes(field) ? fields.filter(value => value !== field) : [...fields, field];
    persist(); renderEvidence();
    $('announcement').textContent = fields.includes(field) ? `${field} from ${runLabel(anchor)} will be quoted with your next question. Nothing sent yet.` : `${field} removed from your question.`;
  }
  function messageNode(message) {
    if (message.type === 'system-prompt' || message.senderType === 'system-prompt') return null;
    const node = document.createElement('div');
    node.className = 'message';
    if (message.messageId) node.dataset.id = message.messageId;
    node.dataset.content = `${message.type}|${message.senderType}|${message.body}`;
    if (['text', 'standin-idle-prompt'].includes(message.type) && ['visitor', 'rep', 'standin'].includes(message.senderType)) {
      if (message.senderType === 'visitor') node.classList.add('visitor');
      const name = document.createElement('strong');
      name.textContent = message.senderType === 'visitor' ? 'You' : message.senderType === 'standin' ? 'AI Stand-in' : 'Human responder';
      const evidence = message.senderType === 'visitor' ? readEvidence(message.body) : null;
      node.append(name, document.createTextNode(evidence ? evidence.question : message.body));
      if (evidence) {
        const details = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = 'Evidence sent with this question';
        const pre = document.createElement('pre'); pre.textContent = evidence.evidence;
        details.append(summary, pre); node.append(details);
      }
      return node;
    }
    const card = parseCard(message.body);
    if (message.type === 'link-card') {
      const url = safeUrl(card.url);
      if (!url) return null;
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = typeof card.title === 'string' ? card.title : url;
      link.addEventListener('click', () => client.trackLinkClick(message.messageId, url));
      node.append(link);
      if (typeof card.description === 'string') node.append(document.createElement('br'), document.createTextNode(card.description));
      return node;
    }
    if (message.type !== 'system-card') return null;
    const name = typeof card.repName === 'string' ? card.repName : 'A human responder';
    const ai = typeof card.standinName === 'string' ? card.standinName : 'An AI Stand-in';
    const labels = { 'session-start': `${ai} is answering as an AI Stand-in.`, handoff: `${name} joined the conversation.`, 'human-transfer': `${name} took over the conversation.`, 'standin-takeover': `${ai} took over as an AI Stand-in.`, 'session-end': 'Conversation ended.', 'rep-followup-offer': `${name} offered to follow up by email.`, 'rep-followup-confirmation': 'Your follow-up request was received.' };
    if (!Object.hasOwn(labels, card.cardType)) return null;
    node.classList.add('system');
    node.textContent = labels[card.cardType] + (typeof card.message === 'string' ? ` ${card.message}` : '');
    return node;
  }

  function render(s) {
    if (!mounted) return;
    $('chat-host').textContent = s.host.name || 'Stand Chat';
    $('chat-identity').textContent = s.host.kind === 'standin' ? 'AI Stand-in' : s.host.kind === 'rep' ? 'Human responder' : 'Checking coverage';
    const statuses = { loading: 'Checking availability…', available: 'Ready · nothing sent', unavailable: 'Unavailable', uncertain: 'Start unconfirmed', ended: 'Conversation ended' };
    $('chat-status').textContent = s.phase === 'active' ? ({ online: 'Connected', connecting: 'Connecting…', offline: 'Reconnecting…' })[s.connection] : statuses[s.phase];
    const serial = JSON.stringify([s.messages, s.pending, s.busy]);
    if (serial !== lastTranscript) {
      lastTranscript = serial;
      const log = $('messages');
      const nodes = s.messages.map(messageNode).filter(Boolean);
      if (s.pending) {
        const node = messageNode({ type: 'text', senderType: 'visitor', body: s.pending.body });
        node.classList.add('pending'); node.querySelector('strong').textContent = s.busy ? 'You · sending…' : 'You · delivery not confirmed'; nodes.push(node);
      }
      if (!nodes.length) {
        const empty = document.createElement('p'); empty.className = 'empty-chat';
        empty.textContent = 'Your question is the next step. A real Stand reply will follow it here.';
        nodes.push(empty);
      }
      // Reuse unchanged rows so reading positions and evidence disclosures survive typing.
      const existing = new Map([...log.children].filter(n => n.dataset.id).map(n => [n.dataset.id, n]));
      log.replaceChildren(...nodes.map(node => {
        const prior = existing.get(node.dataset.id);
        return prior && prior.dataset.content === node.dataset.content ? prior : node;
      }));
    }
    $('activity').hidden = !s.activity;
    $('activity').textContent = s.activity ? (s.activity.kind === 'thinking' ? 'AI Stand-in is preparing the next step…' : 'The human responder is typing…') : '';
    $('chat-notice').hidden = !s.notice; $('chat-notice').textContent = s.notice;
    const error = errors[s.error] || (s.phase === 'unavailable' ? 'Nobody can answer right now. The local replay still works, and your question is kept. Check again later.' : '');
    $('chat-error').hidden = !error; $('chat-error').textContent = error;
    $('retry-chat').hidden = !(s.phase === 'unavailable' || (s.phase === 'active' && (s.connection !== 'online' || s.error)));
    $('retry-chat').textContent = s.phase === 'active' ? 'Reconnect' : 'Check again'; $('retry-chat').disabled = s.busy;
    $('retry-message').hidden = !s.pending || s.pending.creating || s.phase !== 'active'; $('retry-message').disabled = s.busy;
    $('new-chat').hidden = !['ended', 'uncertain'].includes(s.phase); $('new-chat').disabled = s.busy;
    $('end-chat').hidden = s.phase !== 'active'; $('end-chat').disabled = s.busy;
    $('followup').hidden = !s.followupOffered || s.phase !== 'active';
    for (const el of $('followup').elements) el.disabled = s.busy;
    $('question').disabled = s.busy || Boolean(s.pending);
    const draft = readEvidence(s.draft)?.question ?? s.draft;
    if ($('question').value !== draft) $('question').value = draft;
    $('send').disabled = !['available', 'active'].includes(s.phase) || s.busy || Boolean(s.pending) || !s.draft.trim();
    $('send').textContent = s.busy ? 'Sending…' : s.phase === 'active' ? 'Continue this path ↗' : 'Ask at this step ↗';
    $('attribution').href = safeUrl(s.poweredByUrl) || 'https://stand.chat';
    renderEvidence();
  }

  function focus() {
    $('question').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    $('question').focus({ preventScroll: true });
  }
  function offerRun(run) {
    if (!sameRun(anchor, run)) { replay = run; includeReplay = false; persist(); renderEvidence(); }
  }
  client.subscribe(render);
  $('include-replay').addEventListener('change', () => { includeReplay = $('include-replay').checked; persist(); renderEvidence(); });
  $('question').addEventListener('input', () => client.setDraft($('question').value));
  $('chat-form').addEventListener('submit', async event => {
    event.preventDefault();
    const s = client.getSnapshot(), question = $('question').value.trim();
    if (!question || s.busy || s.pending || !['available', 'active'].includes(s.phase)) return;
    const body = evidenceMessage(evidence(), question);
    client.setDraft('');
    await client.send(body, { owner: 'exception-step', analyticsId: 'flowspoke-question-branch', prompt: 'Discuss the visitor-provided Flowspoke workflow evidence. The business, tools, and runs are fictional. Identify missing fields and limitations. Do not claim real connector support or execute or change the workflow. Keep your reply concise and ask a useful next question.' });
  });
  $('question').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !$('send').disabled) { event.preventDefault(); $('chat-form').requestSubmit(); }
  });
  $('retry-chat').addEventListener('click', () => client.retry());
  $('retry-message').addEventListener('click', () => client.send());
  $('new-chat').addEventListener('click', async () => { await client.newChat(); focus(); });
  $('end-chat').addEventListener('click', () => client.end());
  $('followup').addEventListener('submit', event => { event.preventDefault(); client.submitEmail($('followup-email').value); });
  $('attribution').addEventListener('click', () => client.trackAttributionClick());
  addEventListener('pagehide', () => { client.setDraft($('question').value); stop?.(); mounted = false; });
  const mount = () => { mounted = true; stop = client.mount(); render(client.getSnapshot()); };
  addEventListener('pageshow', event => { if (event.persisted) mount(); });
  // Discovery and recovering an existing chat are read-only; only Submit creates one.
  persist(); mount();
  if (!sameRun(initialRun, anchor) && (!replay || !sameRun(initialRun, replay))) offerRun(initialRun);
  return { offerRun, focus };
}
