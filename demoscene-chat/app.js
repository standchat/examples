import { StandClient, safeUrl } from './stand-client.js';
import { ParticleScene } from './scene.js';
import { Transmission } from './transmission.js';

const $ = selector => document.querySelector(selector);
const dialog = $('#chat');
const input = $('#message');
const transcript = $('#transcript');
const invitationInput = $('#invitation-input');
const scene = new ParticleScene($('#scene'), $('.hero'));
const transmission = new Transmission($('#transmission'), dialog, transcript);
let storage;
try { storage = sessionStorage; } catch { /* Private browsing can disable storage. */ }
const client = new StandClient({
  siteId: 'demo', storage, analyticsId: 'afterlight-signal',
  greeting: 'Hey, curious human. What are you making?',
  prompt: 'You are the friendly host of Afterlight, a FICTIONAL creative-coding and electronic-music gathering in this Stand Chat example. Stay candid that this is a demo if asked. The imagined event is November 14, 2026 at fictional Signal Hall in Helsinki: 18:00 Open circuits (meet, plug in, show unfinished work), 19:30 Impossible in real time (demo showcase), 22:00 After the afterlight (live-coded music). Everyone is welcome, beginners included. No actual tickets, reservations, venue address, prices or availability exist: never invent them or claim to book. Help with creative coding, demoscene effects and this example. Technical facts: landing-page terrain, torus and tunnel use Canvas 2D. The conversation is full-screen with WebGL shader particles that travel through 3D space to assemble into the actual reply glyphs. The GPU reads sampled glyph positions from laid-out DOM text. The vertex shader projects and interpolates particles; the fragment shader draws glowing point sprites with additive blending. Once formed, text becomes ordinary selectable HTML. Older messages tilt back like a 3D scroller; scrolling restores flat readable history. A real textarea preserves editing, IME, mobile keyboard and accessibility. Stand Visitor API powers the conversation directly; there is no widget overlay. Be warm, curious and concise. Prefer 1-3 short sentences, under 350 characters unless detail is requested; the reply is a luminous transmission. Never claim affiliation with Future Crew.',
});
const rendered = new Map();
let mounted = false;
let lastOpener;
let openTimer;
let activation = null;
let formedKey = '';
let outgoing = '';
let formFrame;
let followLatest = true;

function fitViewport() {
  if (!dialog.open) return;
  dialog.style.height = `${window.visualViewport?.height || innerHeight}px`;
  dialog.style.top = `${window.visualViewport?.offsetTop || 0}px`;
  transmission.resize?.();
  if (followLatest) requestAnimationFrame(() => { transcript.scrollTop = transcript.scrollHeight; });
}
window.visualViewport?.addEventListener('resize', fitViewport);
window.visualViewport?.addEventListener('scroll', fitViewport);
addEventListener('resize', fitViewport);

function formMessage(element) {
  cancelAnimationFrame(formFrame);
  // Let native scroll/layout finish before sampling the letter positions.
  formFrame = requestAnimationFrame(() => {
    formFrame = requestAnimationFrame(() => transmission.form(element));
  });
}

function openChat(event) {
  if (dialog.open) return;
  lastOpener = event?.currentTarget || document.activeElement;
  document.body.classList.add('chat-open');
  dialog.showModal();
  fitViewport();
  scene.setPaused(true);
  transmission.open();
  clearTimeout(openTimer);
  openTimer = setTimeout(() => dialog.classList.add('ready'), scene.paused ? 0 : 150);
  activation = event?.detail === 0 ? 'keyboard' : 'click';
  if (!mounted) { mounted = true; client.mount(); }
  if (client.state.phase === 'available') {
    client.activate(activation);
    activation = null;
  }
  if (client.state.greeting) client.showGreeting(client.state.greeting);
  input.focus({ preventScroll: true });
  transcript.scrollTop = transcript.scrollHeight;
  formMessage(transcript.lastElementChild);
}

function closeChat() { dialog.close(); }
dialog.addEventListener('close', () => {
  clearTimeout(openTimer);
  dialog.classList.remove('ready');
  document.body.classList.remove('chat-open');
  transmission.close();
  cancelAnimationFrame(formFrame);
  scene.setPaused(transmission.paused);
  lastOpener?.focus({ preventScroll: true });
});
dialog.addEventListener('click', event => { if (event.target === dialog) closeChat(); });
$('#close').addEventListener('click', closeChat);
$('#resume').addEventListener('click', openChat);

document.querySelectorAll('[data-effect]').forEach(button => button.addEventListener('click', () => {
  const effect = Number(button.dataset.effect);
  scene.select(effect);
  document.querySelectorAll('[data-effect]').forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
}));

function updateMotion() {
  const paused = transmission.paused;
  $('#motion').textContent = paused ? '▷' : 'Ⅱ';
  $('#motion').setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
  $('#motion').setAttribute('aria-pressed', String(paused));
  $('#chat-motion').textContent = paused ? '▷' : 'Ⅱ';
  $('#chat-motion').setAttribute('aria-label', paused ? 'Play effects' : 'Pause effects');
  $('#chat-motion').title = paused ? 'Play effects' : 'Pause effects';
  $('#chat-motion').setAttribute('aria-pressed', String(paused));
}
function setMotion(paused) {
  transmission.setPaused(paused);
  scene.setPaused(dialog.open || paused);
  updateMotion();
}
$('#motion').addEventListener('click', () => setMotion(!transmission.paused));
$('#chat-motion').addEventListener('click', () => setMotion(!transmission.paused));
scene.reduced.addEventListener('change', event => setMotion(event.matches));
$('#replay').addEventListener('click', () => {
  transcript.scrollTop = transcript.scrollHeight;
  formMessage(transcript.lastElementChild);
});
transcript.addEventListener('scroll', () => {
  followLatest = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight <= 90;
  transcript.classList.toggle('reading', !followLatest);
}, { passive: true });
updateMotion();

function addMessage(key, body, kind, sender) {
  let article = rendered.get(key);
  if (!article) {
    article = document.createElement('p');
    article.className = `message ${kind}`;
    const label = document.createElement('span');
    label.className = 'sender';
    const content = document.createElement('span');
    content.className = 'body';
    article.append(label, content);
    rendered.set(key, article);
    transcript.append(article);
  }
  article.querySelector('.sender').textContent = sender;
  const content = article.querySelector('.body');
  if (content.dataset.raw !== body) {
    content.dataset.raw = body;
    content.replaceChildren();
    // Never treat remote replies as HTML. Only explicitly safe URLs become links.
    for (const part of body.split(/(https?:\/\/[^\s<>]+)/g)) {
      const url = /^https?:\/\//.test(part) && safeUrl(part);
      if (!url) { content.append(document.createTextNode(part)); continue; }
      const link = document.createElement('a');
      link.href = url; link.textContent = part;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.addEventListener('click', () => client.trackLinkClick(key, url));
      content.append(link);
    }
  }
  return article;
}

function systemText(message) {
  if (message.type !== 'system-card' && message.senderType !== 'system-card') return message.body;
  try {
    const card = JSON.parse(message.body);
    const labels = {
      handoff: `${card.repName || 'A team member'} joined the conversation.`,
      'human-transfer': `${card.repName || 'A team member'} joined the conversation.`,
      'standin-takeover': `${card.standinName || 'An AI Stand-in'} is here to help.`,
      'session-end': 'The conversation has ended.',
      'rep-followup-offer': 'Leave an email below if you would like a follow-up.',
      'rep-followup-confirmation': 'Your follow-up request was sent.',
    };
    return labels[card.cardType] || '';
  } catch { return ''; }
}

client.subscribe(state => {
  if (dialog.open && activation && state.phase === 'available') {
    client.activate(activation);
    activation = null;
  }
  const nearBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 90;
  const ready = ['available', 'active'].includes(state.phase);
  const hostName = state.host.name || 'Afterlight host';
  $('#host').textContent = state.phase === 'loading' ? 'Tuning into the signal…' : `${hostName}${state.host.kind === 'standin' ? ' · AI Stand-in' : state.host.kind === 'rep' ? ' · Team' : ''}`;
  $('#connection').textContent = state.phase === 'active' ? state.connection === 'online' ? 'CONNECTED' : 'RECONNECTING' : state.phase === 'available' ? 'READY' : state.phase === 'ended' ? 'ENDED' : '';
  const keys = new Set();
  const hasGreeting = state.messages.some(message => message.body === state.greeting);
  if (state.greeting && !hasGreeting) {
    keys.add('greeting');
    addMessage('greeting', state.greeting, 'host', hostName);
    if (dialog.open) client.showGreeting(state.greeting);
  }
  for (const message of state.messages) {
    // Persona/context messages belong to the protocol, never the visitor's log.
    if (message.type === 'system-prompt' || message.senderType === 'system-prompt') continue;
    const system = message.type === 'system-card' || ['system', 'system-card'].includes(message.senderType);
    const body = system ? systemText(message) : message.body;
    if (!body) continue;
    keys.add(message.messageId);
    const visitor = message.senderType === 'visitor';
    addMessage(message.messageId, body, system ? 'system' : visitor ? 'visitor' : 'host', system ? 'CHANNEL' : visitor ? 'YOU' : hostName);
  }
  if (state.pending) {
    keys.add('pending'); addMessage('pending', state.pending.body, 'visitor', 'YOU · SENDING');
  }
  if (outgoing && state.messages.some(message => message.senderType === 'visitor' && message.body === outgoing)) outgoing = '';
  if (outgoing && !state.pending) {
    keys.add('outgoing'); addMessage('outgoing', outgoing, 'visitor', 'YOU · TRANSMITTING');
  }
  if (state.preview?.text) {
    keys.add('preview');
    addMessage('preview', state.preview.text, 'host', hostName).setAttribute('aria-live', 'off');
  }
  for (const [key, element] of rendered) {
    if (!keys.has(key)) { element.remove(); rendered.delete(key); }
  }
  // Keep canonical seq order even when an optimistic or streaming row existed first.
  const order = [...keys];
  order.forEach((key, index) => {
    const node = rendered.get(key);
    if (transcript.children[index] !== node) transcript.insertBefore(node, transcript.children[index] || null);
  });
  if (nearBottom) transcript.scrollTop = transcript.scrollHeight;
  const latestKey = order.at(-1);
  if (latestKey && latestKey !== 'preview' && latestKey !== formedKey && nearBottom && dialog.open) {
    formedKey = latestKey;
    formMessage(rendered.get(latestKey));
  }
  $('#typing').textContent = state.typing ? '···' : '';
  transmission.setEnergy(state.typing || state.draft ? 1 : 0);
  if (input.value !== state.draft) input.value = state.draft;
  input.disabled = state.busy;
  $('#send').disabled = !ready || state.busy || (!state.draft.trim() && !state.pending);
  if (invitationInput.value !== state.draft) invitationInput.value = state.draft;
  invitationInput.disabled = state.busy;
  $('#invitation-send').disabled = !ready || state.busy || !state.draft.trim();
  $('#resume').hidden = !['active', 'ended', 'uncertain'].includes(state.phase);
  $('#invitation-status').textContent = state.phase === 'unavailable' ? 'Signal unavailable. Try again in a moment.' : state.phase === 'loading' && document.activeElement === invitationInput ? 'Finding a signal…' : '';
  $('#invitation-retry').hidden = state.phase !== 'unavailable';
  if (state.greeting) client.showGreeting(state.greeting);
  const problem = state.error || (state.phase === 'unavailable' ? 'The live channel is unavailable right now. You can still explore the artwork. Try connecting again in a moment.' : state.phase === 'ended' ? 'This conversation has ended. Start a new one whenever you like.' : '');
  $('#recovery').hidden = !problem;
  $('#error').textContent = problem;
  $('#retry').textContent = state.phase === 'uncertain' ? 'Start a new chat (previous start unconfirmed) ↗' : state.phase === 'ended' ? 'Start a new conversation ↗' : state.pending ? 'Retry message ↗' : 'Retry connection ↗';
  $('#retry').disabled = state.busy;
  $('#notice').textContent = state.notice;
  $('#invitation-notice').textContent = state.notice;
  $('.invitation-credit').href = safeUrl(state.poweredByUrl) || 'https://stand.chat/';
  $('.invitation-credit').textContent = state.host.kind === 'rep' ? 'Powered by Stand' : 'AI · Powered by Stand';
  $('#attribution').href = safeUrl(state.poweredByUrl) || 'https://stand.chat/';
  $('#end').hidden = state.phase !== 'active';
  $('#end').disabled = state.busy;
  $('#followup').hidden = !state.followupOffered;
  $('#followup button').disabled = state.busy;
});

input.addEventListener('input', () => {
  client.setDraft(input.value);
  input.style.height = 'auto';
  input.style.height = `${Math.min(120, input.scrollHeight)}px`;
});
async function send() {
  if (client.state.busy || !['available', 'active'].includes(client.state.phase)) return;
  if (!input.value.trim() && !client.state.pending) return;
  outgoing = input.value.trim() || client.state.pending.body;
  await client.send();
  outgoing = '';
  const optimistic = rendered.get('outgoing');
  if (optimistic) { optimistic.remove(); rendered.delete('outgoing'); }
  input.style.height = 'auto';
  input.focus({ preventScroll: true });
}
$('#compose').addEventListener('submit', event => { event.preventDefault(); void send(); });
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); }
});
$('#retry').addEventListener('click', () => {
  if (['ended', 'uncertain'].includes(client.state.phase)) void client.newChat();
  else if (client.state.pending) void client.send();
  else void client.retry();
});
$('#end').addEventListener('click', () => client.end());
$('#attribution').addEventListener('click', () => client.badgeClick());
$('.invitation-credit').addEventListener('click', () => client.badgeClick());
$('#followup').addEventListener('submit', event => { event.preventDefault(); void client.submitEmail($('#email').value.trim()); });

invitationInput.addEventListener('focus', () => scene.engage(true));
invitationInput.addEventListener('blur', () => scene.engage(Boolean(invitationInput.value)));
invitationInput.addEventListener('input', () => {
  client.setDraft(invitationInput.value);
  invitationInput.style.height = 'auto';
  invitationInput.style.height = `${Math.min(104, invitationInput.scrollHeight)}px`;
});
function transmitInvitation(event) {
  event.preventDefault();
  if (!client.state.draft.trim() || client.state.busy || !['available', 'active'].includes(client.state.phase)) return;
  openChat({ currentTarget: invitationInput, detail: event.type === 'keydown' ? 0 : event.detail });
  void send();
}
$('#invitation-form').addEventListener('submit', transmitInvitation);
invitationInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) transmitInvitation(event);
});
$('#invitation-retry').addEventListener('click', () => client.retry());
// Discovery is read-only. A conversation is created only by the visitor's reply.
mounted = true;
client.mount();

function showNotes() { if (location.hash === '#how-it-works') $('#how-it-works').open = true; }
addEventListener('hashchange', showNotes);
showNotes();
