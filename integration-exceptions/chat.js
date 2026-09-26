import { StandVisitorClient, parseCard } from './stand-visitor.js';
import { normalize, contextFor, TOOLS, RULES } from './scenario.js';

const $ = id => document.getElementById(id);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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

export function createThread({ getConfig }) {
  const site = document.querySelector('script[data-stand-id]')?.dataset.standId || 'demo';
  const key = `flowspoke:attachment:v1:${site}`;
  const client = new StandVisitorClient({ site, scope: 'flowspoke-exception' });
  let attached = null;
  let sentContext = '';
  let pendingContext = '';
  let mounted = false;
  let stop;
  let lastTranscript = '';
  let sawPending = Boolean(client.getSnapshot().pending);
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved?.attached) attached = normalize(saved.attached);
    sentContext = typeof saved?.sentContext === 'string' ? saved.sentContext : '';
    pendingContext = typeof saved?.pendingContext === 'string' ? saved.pendingContext : '';
  } catch { /* Works in memory when storage is denied. */ }

  function persist() {
    try { sessionStorage.setItem(key, JSON.stringify({ attached, sentContext, pendingContext })); } catch { /* In-memory operation. */ }
  }

  function renderContext(config = getConfig()) {
    if (!attached) return;
    $('attachment-title').textContent = `${TOOLS[attached.source].name} → ${TOOLS[attached.target].name}`;
    $('attachment-rule').textContent = `${RULES[attached.rule]} · ${attached.branch === 'review' ? 'review branch' : 'stop branch'}`;
    $('context-preview').textContent = contextFor(attached);
    const changed = !equal(attached, normalize(config));
    $('attachment-change').textContent = changed ? 'The canvas has changed. This conversation still uses the snapshot above. Attach the current workflow to discuss your changes.' : 'Your selected tools, record, rule, and requirement accompany your next message when this snapshot has not been sent yet.';
    $('attach-current').hidden = !changed;
    $('attach-current').disabled = client.getSnapshot().busy || Boolean(client.getSnapshot().pending);
  }

  function open(config, { focus = true } = {}) {
    if (!attached) { attached = normalize(config); persist(); }
    $('thread').hidden = false;
    if (!mounted) { mounted = true; stop = client.mount(); }
    renderContext(config);
    render(client.getSnapshot());
    if (focus) {
      $('thread').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      $('question').focus({ preventScroll: true });
    }
  }

  function messageNode(message) {
    if (message.type === 'system-prompt' || message.senderType === 'system-prompt') return null;
    const node = document.createElement('div');
    node.className = 'message';
    if (['text', 'standin-idle-prompt'].includes(message.type) && ['visitor', 'rep', 'standin'].includes(message.senderType)) {
      if (message.senderType === 'visitor') node.classList.add('visitor');
      const name = document.createElement('strong');
      name.textContent = message.senderType === 'visitor' ? 'You' : message.senderType === 'standin' ? 'AI Stand-in' : 'Human responder';
      node.append(name, document.createTextNode(message.body));
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
    // A pending send recovered from storage keeps its snapshot until confirmed.
    if (s.pending) sawPending = true;
    if (pendingContext && sawPending && !s.pending && !s.busy && s.phase === 'active') {
      sentContext = pendingContext; pendingContext = ''; sawPending = false; persist();
    }
    $('chat-host').textContent = s.host.name || 'Stand Chat';
    $('chat-identity').textContent = s.host.kind === 'standin' ? 'AI Stand-in' : s.host.kind === 'rep' ? 'Human responder' : 'Checking coverage';
    const statuses = { loading: 'Checking availability…', available: 'Ready to talk', unavailable: s.error ? 'Connection unavailable' : 'No responder available', uncertain: 'Start unconfirmed', ended: 'Conversation ended' };
    $('chat-status').textContent = s.phase === 'active' ? ({ online: 'Connected', connecting: 'Connecting…', offline: 'Reconnecting…' })[s.connection] : statuses[s.phase];
    const serial = JSON.stringify([s.messages, s.pending, s.busy]);
    if (serial !== lastTranscript) {
      lastTranscript = serial;
      const log = $('messages');
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
      const nodes = s.messages.map(messageNode).filter(Boolean);
      if (s.pending) {
        const node = document.createElement('div'); node.className = 'message visitor pending';
        const label = document.createElement('strong'); label.textContent = s.busy ? 'You · sending…' : 'You · delivery not confirmed';
        node.append(label, document.createTextNode(s.pending.body)); nodes.push(node);
      }
      if (!nodes.length) {
        const empty = document.createElement('p'); empty.className = 'empty-chat';
        empty.textContent = 'Bring the edge case. What happens if a payment is late, a record already exists, or the order changes? No conversation starts until you send.';
        nodes.push(empty);
      }
      log.replaceChildren(...nodes);
      if (atBottom) log.scrollTop = log.scrollHeight;
    }
    $('activity').hidden = !s.activity;
    $('activity').textContent = s.activity ? (s.activity.kind === 'thinking' ? 'AI Stand-in is preparing a reply…' : 'The human responder is typing…') : '';
    $('chat-notice').hidden = !s.notice;
    $('chat-notice').textContent = s.notice;
    let error = errors[s.error] || '';
    if (!error && s.phase === 'unavailable') error = 'Nobody is available for a new conversation right now. Your draft is kept. Try checking again later.';
    $('chat-error').hidden = !error;
    $('chat-error').textContent = error;
    $('retry-chat').hidden = !((s.phase === 'unavailable') || (s.phase === 'active' && (s.connection !== 'online' || s.error)));
    $('retry-chat').textContent = s.phase === 'active' ? 'Reconnect' : 'Check again';
    $('retry-chat').disabled = s.busy;
    $('retry-message').hidden = !s.pending || s.pending.creating || s.phase !== 'active';
    $('retry-message').disabled = s.busy;
    $('new-chat').hidden = !['ended', 'uncertain'].includes(s.phase);
    $('new-chat').disabled = s.busy;
    $('end-chat').hidden = s.phase !== 'active'; $('end-chat').disabled = s.busy;
    $('followup').hidden = !s.followupOffered || s.phase !== 'active';
    for (const el of $('followup').elements) el.disabled = s.busy;
    const canSend = ['available', 'active'].includes(s.phase) && !s.busy && !s.pending;
    $('question').disabled = s.busy || Boolean(s.pending);
    $('question').value = s.draft;
    $('send').disabled = !canSend || !s.draft.trim();
    $('send').textContent = s.busy ? 'Sending…' : s.phase === 'active' ? 'Send message ↗' : 'Start conversation ↗';
    $('attribution').href = safeUrl(s.poweredByUrl) || 'https://stand.chat';
    renderContext();
  }

  client.subscribe(render);
  $('attach-current').addEventListener('click', () => {
    if (client.getSnapshot().busy || client.getSnapshot().pending) return;
    attached = normalize(getConfig()); persist(); renderContext();
    $('announcement').textContent = 'Current workflow attached. It will be shared only when you send your next question.';
    $('question').focus();
  });
  $('question').addEventListener('input', () => {
    // Drafts stay local. Typing events are intentionally not sent before consent.
    client.setDraft($('question').value);
  });
  $('chat-form').addEventListener('submit', async event => {
    event.preventDefault();
    const s = client.getSnapshot();
    const question = $('question').value.trim();
    if (!question || s.busy || s.pending || !['available', 'active'].includes(s.phase)) return;
    const context = contextFor(attached);
    const changed = s.phase === 'active' && sentContext !== context;
    const message = changed ? `Updated workflow snapshot (shared by me):\n${context}\n\nMy question: ${question}` : question;
    pendingContext = context; persist();
    client.setDraft('');
    const ok = await client.send(message, { owner: 'exception-step', prompt: context, analyticsId: 'flowspoke-exception' });
    if (ok) { sentContext = context; pendingContext = ''; sawPending = false; persist(); }
  });
  $('question').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !$('send').disabled) { event.preventDefault(); $('chat-form').requestSubmit(); }
  });
  $('retry-chat').addEventListener('click', () => client.retry());
  $('retry-message').addEventListener('click', () => client.send());
  $('new-chat').addEventListener('click', () => {
    sentContext = ''; pendingContext = ''; persist();
    client.newChat(); $('question').focus();
  });
  $('end-chat').addEventListener('click', () => client.end());
  $('followup').addEventListener('submit', event => { event.preventDefault(); client.submitEmail($('followup-email').value); });
  $('attribution').addEventListener('click', () => client.trackAttributionClick());
  addEventListener('pagehide', () => { client.setDraft($('question').value); stop?.(); mounted = false; });
  addEventListener('pageshow', event => { if (event.persisted && attached) open(getConfig(), { focus: false }); });
  if (attached) open(getConfig(), { focus: false });
  return { open, canvasChanged: renderContext };
}
