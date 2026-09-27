// Chat: the app on Molehill's desktop that talks to Stand.
//
// It renders the client's state (stand-visitor.js) and nothing else: the
// transcript, who is answering, the attachments waiting to be sent, and every
// state the Visitor API can be in. The unsent message, attachments included,
// is the client's draft, so it survives a reload; the transcript comes back
// from the client too.

import { isConversation, parseCard } from './stand-visitor.js';
import { icon } from './icons.js';
import {
  MAX_ATTACHMENTS, attachment, attachmentLabel, formatMessage, parseMessage, parseReply, sameAttachment,
} from './message-format.js';
import { buildPrompt } from './prompt.js';

const CARDS = new Set(['handoff', 'human-transfer', 'standin-takeover', 'session-end', 'rep-followup-offer', 'rep-followup-confirmation']);

const TEXT = {
  connect: 'Can’t reach the chat right now.',
  start: 'Couldn’t start the conversation. Your message is back in the box.',
  uncertain: 'Your first message may have started a conversation, but it couldn’t be confirmed. Starting again could open a second one.',
  lost: 'The conversation ended before your last message was confirmed. It’s kept below, so you can copy it.',
  gone: 'This conversation isn’t available anymore.',
  paused: 'Lost the connection for a while.',
  refresh: 'Catching up on replies…',
  end: 'Couldn’t end the conversation.',
  email: 'Couldn’t send that. Check the address and try again.',
  offer: 'That follow-up offer has expired.',
  unavailable: 'Nobody can answer right now. Your question and attachments will wait here.',
  ended: 'Conversation ended.',
  followup: 'Thanks. The team will follow up by email, and this conversation is closed.',
};

const SUGGESTIONS = ['Can we keep our data in the EU?', 'What counts as an event?', 'Can I self-host Molehill?'];

export function createChat({ root, el, win, client, desktop, mole, context }) {
  let attachments = []; // [{ source, item, value, icon }]
  let lastDraft = null; // the draft this UI last wrote, to tell it from the client's own changes
  let seenSeq = null; // replies with a higher seq arrived while this page watched
  let unread = 0;
  let stick = true; // keep the transcript scrolled to the bottom
  let returnTo = null; // where Esc in the message box goes back to
  let lastVia = ''; // how the first attachment came in, for Stand's activation analytics
  let followupSent = false; // the visitor left an email: the ended banner thanks them
  // What the first-visit demo dropped: shown next to the attachments, never
  // part of the draft, so nothing the visitor didn't choose is ever sent.
  let suggestion = desktop.storage.load().suggestion ?? null;
  let state = client.getSnapshot();
  const nodes = new Map(); // messageId → <li>

  // DOM ---------------------------------------------------------------------------

  el.replaceChildren();
  const head = h('div', 'chat-head');
  const avatar = h('span', 'chat-avatar');
  avatar.setAttribute('aria-hidden', 'true');
  const who = h('div', 'chat-who');
  const nameRow = h('p', 'chat-name');
  const name = h('span', 'chat-name-text');
  const badge = h('span', 'chat-badge');
  nameRow.append(name, badge);
  const sub = h('p', 'chat-sub');
  who.append(nameRow, sub);
  const more = h('button', 'chat-more');
  more.type = 'button';
  more.textContent = '⋯';
  more.setAttribute('aria-label', 'Conversation options');
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', 'false');
  const moreMenu = h('div', 'ctx-menu chat-menu');
  moreMenu.setAttribute('role', 'menu');
  moreMenu.hidden = true;
  head.append(avatar, who, more, moreMenu);

  const log = h('div', 'chat-log');
  log.tabIndex = 0;
  log.setAttribute('aria-label', 'Conversation');
  const empty = h('div', 'chat-empty');
  const list = h('ol', 'chat-msgs');
  const pendingSlot = h('div', 'chat-pending');
  const activity = h('div', 'chat-activity');
  log.append(empty, list, pendingSlot, activity);

  const foot = h('div', 'chat-foot');
  const banner = h('div', 'chat-banner');
  banner.setAttribute('role', 'status');
  const tray = h('ul', 'chat-tray');
  tray.setAttribute('aria-label', 'Attached to your next message');
  const form = h('form', 'chat-form');
  const input = h('textarea', 'chat-input');
  input.id = 'chat-input';
  input.rows = 1;
  input.setAttribute('aria-label', 'Your question');
  input.setAttribute('enterkeyhint', 'send');
  const send = h('button', 'chunky chat-send');
  send.type = 'submit';
  send.textContent = 'Send';
  form.append(input, send);
  const notice = h('p', 'chat-notice');
  foot.append(banner, tray, form, notice);

  const status = h('div', 'win-status chat-status');
  const conn = h('span', 'chat-conn');
  const powered = h('a', 'chat-powered');
  powered.target = '_blank';
  powered.rel = 'noopener noreferrer';
  powered.textContent = 'Powered by Stand';
  status.append(conn, powered);

  const drop = h('div', 'chat-drop');
  drop.setAttribute('aria-hidden', 'true');
  const dropCard = h('div', 'chat-drop-card');
  const dropIcon = h('span', 'chat-drop-icon');
  const dropLabel = h('b');
  dropCard.append(dropIcon, Object.assign(h('p'), { textContent: 'Drop to ask about' }), dropLabel);
  drop.append(dropCard);

  const mid = h('div', 'chat-mid');
  mid.append(log, drop);
  el.append(head, mid, foot);
  win.append(status);

  // On phones the taskbar holds the attachments until Chat is opened.
  const phoneTray = h('button', 'mh-attached');
  phoneTray.type = 'button';
  phoneTray.dataset.drop = 'chat';
  phoneTray.hidden = true;
  root.querySelector('.mh-taskbar').insertBefore(phoneTray, root.querySelector('.mh-task--chat'));
  phoneTray.addEventListener('click', () => {
    desktop.open('chat');
    focusComposer();
  });

  // Events ------------------------------------------------------------------------

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void submit();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!send.disabled) form.requestSubmit();
    } else if (e.key === 'Escape' && returnTo?.isConnected) {
      e.preventDefault();
      const back = returnTo;
      returnTo = null;
      desktop.reveal({ win: desktop.windowOf(back)?.id, el: null }, { focus: false });
      back.focus();
    } else if (e.key === 'Backspace' && !input.value && attachments.length && input.selectionStart === 0) {
      remove(attachments.length - 1);
    }
  });
  input.addEventListener('input', () => {
    autosize();
    pushDraft();
    client.typing(Boolean(input.value.trim()));
    renderComposer();
  });
  input.addEventListener('blur', () => client.typing(false));
  log.addEventListener('scroll', () => {
    stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  });
  powered.addEventListener('click', () => client.trackAttributionClick());
  more.addEventListener('click', () => (moreMenu.hidden ? openMore() : closeMore()));
  document.addEventListener('pointerdown', (e) => {
    if (!moreMenu.hidden && !moreMenu.contains(e.target) && e.target !== more) closeMore(false);
  });
  moreMenu.addEventListener('keydown', (e) => {
    const items = [...moreMenu.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
    else if (e.key === 'Escape' || e.key === 'Tab') closeMore();
    else return;
    e.preventDefault();
  });
  desktop.on((event) => {
    if ((event.type === 'open' || event.type === 'focus' || event.type === 'mode') && isVisible()) {
      setUnread(0);
      if (desktop.phone) mole?.hush();
    }
    if (event.type === 'mode' || event.type === 'open' || event.type === 'close') renderPhoneTray();
  });

  // Rendering ----------------------------------------------------------------------

  function render(next) {
    state = next;
    // A reload shows what was already there as seen. A new conversation
    // starts counting from zero again: its seq numbers start over.
    if (seenSeq === null) seenSeq = Math.max(0, ...state.messages.map((m) => m.seq));
    if (!state.messages.length) {
      seenSeq = 0;
      nodes.clear();
    }
    syncDraft(state.draft);
    renderHead();
    renderMessages();
    renderPending();
    renderActivity();
    renderBanner();
    renderComposer();
    renderStatus();
    renderEmpty();
    if (stick) requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  }

  function renderHead() {
    const { host, phase } = state;
    const known = Boolean(host.name);
    name.textContent = known ? host.name : phase === 'loading' ? 'Checking who’s around…' : phase === 'unavailable' ? 'Nobody’s around' : 'Chat';
    badge.hidden = !host.kind;
    badge.textContent = host.kind === 'rep' ? 'Team' : 'AI';
    badge.dataset.kind = host.kind ?? '';
    badge.title = host.kind === 'rep' ? 'A person from the team is answering' : 'An AI Stand-in is answering';
    sub.textContent = host.kind === 'rep'
      ? `${host.title ? `${host.title} · ` : ''}Real conversation, via Stand`
      : host.kind === 'standin' ? 'Real conversation · AI Stand-in via Stand'
        : phase === 'unavailable' ? 'Try again in a little while' : 'Real conversation via Stand';
    const url = safeUrl(host.avatar);
    const current = avatar.querySelector('img');
    if (url && current?.src !== url) {
      const img = new Image();
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => { img.remove(); avatar.dataset.initials = initials(host.name); };
      img.src = url;
      avatar.replaceChildren(img);
    } else if (!url) {
      avatar.replaceChildren();
    }
    avatar.dataset.initials = initials(host.name);
    avatar.dataset.kind = host.kind ?? '';
    root.querySelector('.mh-talk')?.setAttribute('data-state', phase === 'unavailable' ? 'offline' : 'online');
    mole?.sleep(phase === 'unavailable');
  }

  function renderMessages() {
    const names = { standin: '', rep: '' };
    const items = [];
    let previous = '';
    let offerId = '';
    for (const m of state.messages) {
      if (m.type === 'system-card' && parseCard(m.body).cardType === 'rep-followup-offer') offerId = m.messageId;
    }
    for (const m of state.messages) {
      const card = m.type === 'system-card' ? parseCard(m.body) : null;
      if (card?.cardType === 'session-start' || card?.cardType === 'standin-takeover') names.standin = text(card.standinName) || names.standin;
      if (card?.cardType === 'handoff' || card?.cardType === 'human-transfer') names.rep = text(card.repName) || names.rep;
      if (!shown(m, card)) continue;
      let node = nodes.get(m.messageId);
      const fresh = !node;
      if (fresh) {
        node = build(m, card, names);
        if (!node) continue;
        nodes.set(m.messageId, node);
      }
      if (card?.cardType === 'rep-followup-offer') updateOffer(node, card, m.messageId === offerId && state.followupOffered);
      const sender = card ? 'card' : m.senderType;
      node.classList.toggle('is-first', sender !== previous);
      previous = sender;
      items.push(node);
      if (fresh && m.seq > seenSeq && m.senderType !== 'visitor' && isConversation(m)) arrived(m, node);
    }
    if (items.length !== list.children.length || items.some((node, i) => list.children[i] !== node)) list.replaceChildren(...items);
    seenSeq = Math.max(seenSeq, ...state.messages.map((m) => m.seq));
  }

  function shown(m, card) {
    if (m.type === 'system-prompt' || m.senderType === 'system-prompt') return false;
    if (m.type === 'text' || m.type === 'standin-idle-prompt') return true;
    if (m.type === 'link-card') return Boolean(safeUrl(parseCard(m.body).url));
    return m.type === 'system-card' && CARDS.has(card?.cardType);
  }

  function build(m, card, names) {
    if (m.type === 'system-card') return note(card);
    if (m.senderType === 'visitor') return visitorBubble(m.body);
    const li = h('li', `msg msg--reply msg--${m.senderType === 'rep' ? 'rep' : 'ai'}`);
    const label = h('p', 'msg-who');
    const who = m.senderType === 'rep' ? names.rep || state.host.name || 'Team' : names.standin || state.host.name || 'AI Stand-in';
    label.textContent = who;
    label.append(Object.assign(h('span', 'chat-badge'), { textContent: m.senderType === 'rep' ? 'Team' : 'AI' }));
    li.append(label);
    li.dataset.who = `${who}${m.senderType === 'rep' ? '' : ' (AI)'}`;
    if (m.type === 'link-card') {
      li.append(linkCard(m));
      return li;
    }
    const bubble = h('div', 'msg-bubble');
    const firstTarget = richText(bubble, m.body);
    li.append(bubble);
    li._target = firstTarget;
    return li;
  }

  // A reply that arrived while the page watched: announce it, point at the
  // page, and tell the visitor if Chat isn't on screen.
  function arrived(m, node) {
    const words = parseReply(m.body).map((p) => p.ref ?? p.text).join('');
    desktop.announce(`${node.dataset.who}: ${words}`);
    if (!isVisible()) setUnread(unread + 1);
    else if (node._target && !desktop.phone) desktop.reveal(node._target, { focus: false, beside: 'chat' });
  }

  function visitorBubble(body) {
    const { attachments: parts, text: question } = parseMessage(body);
    const li = h('li', 'msg msg--visitor');
    const bubble = h('div', 'msg-bubble');
    if (parts.length) {
      const chips = h('ul', 'msg-chips');
      chips.setAttribute('aria-label', 'Attached');
      for (const a of parts) {
        const item = h('li');
        item.append(sentChip(a));
        chips.append(item);
      }
      bubble.append(chips);
    }
    if (question) bubble.append(Object.assign(h('p', 'msg-text'), { textContent: question }));
    li.append(bubble);
    return li;
  }

  function sentChip(a) {
    const target = desktop.resolve(attachmentLabel(a));
    const chip = h(target ? 'button' : 'span', 'chip chip--sent');
    if (target) {
      chip.type = 'button';
      chip.title = `Show ${attachmentLabel(a)}`;
      chip.addEventListener('click', () => desktop.reveal(target));
    }
    chip.append(icon(iconFor(a, target)), chipText(a));
    return chip;
  }

  function note(card) {
    const li = h('li', 'msg msg--note');
    const p = h('p');
    const t = card.cardType;
    if (t === 'handoff' || t === 'human-transfer') {
      p.textContent = `${text(card.repName) || 'Someone from the team'} joined the conversation.${text(card.message) ? ` ${text(card.message)}` : ''}`;
      li.classList.add('msg--join');
    } else if (t === 'standin-takeover') {
      p.textContent = `${text(card.standinName) || 'The AI Stand-in'} (AI) is answering again.${text(card.message) ? ` ${text(card.message)}` : ''}`;
    } else if (t === 'session-end') {
      p.textContent = 'Conversation ended.';
    } else if (t === 'rep-followup-confirmation') {
      p.textContent = text(card.message) || 'Thanks. The team will follow up by email.';
      li.classList.add('msg--ok');
    } else if (t === 'rep-followup-offer') {
      li.classList.add('msg--offer');
      p.textContent = text(card.message) || `${text(card.repName) || 'The team'} can’t reply right now, but can follow up by email.`;
    }
    li.append(p);
    return li;
  }

  // The email form lives in the offer card while the offer stands.
  function updateOffer(li, card, active) {
    let formEl = li.querySelector('form');
    if (!active) return void formEl?.remove();
    if (!formEl) {
      formEl = h('form', 'offer-form');
      const id = `offer-${Math.random().toString(36).slice(2, 8)}`;
      const label = Object.assign(h('label'), { htmlFor: id, textContent: 'Your email' });
      const email = Object.assign(h('input'), { id, type: 'email', required: true, autocomplete: 'email', placeholder: 'you@company.com' });
      const go = Object.assign(h('button', 'chunky'), { type: 'submit', textContent: 'Send' });
      const err = h('p', 'offer-error');
      formEl.append(label, email, go, err);
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (await client.submitEmail(email.value)) {
          email.value = '';
          followupSent = true;
          render(client.getSnapshot());
        }
      });
      li.append(formEl);
    }
    formEl.querySelector('button').disabled = state.busy;
    formEl.querySelector('.offer-error').textContent = state.error === 'email' ? TEXT.email : '';
  }

  function linkCard(m) {
    const card = parseCard(m.body);
    const url = safeUrl(card.url);
    const a = h('a', 'chat-link');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.append(Object.assign(h('b'), { textContent: text(card.title) || new URL(url).host }));
    if (text(card.description)) a.append(Object.assign(h('span'), { textContent: text(card.description) }));
    a.append(Object.assign(h('small'), { textContent: `${new URL(url).host} ↗` }));
    a.addEventListener('click', () => client.trackLinkClick(m.messageId, url));
    return a;
  }

  function renderPending() {
    const p = state.pending;
    const key = p ? `${p.body}|${p.creating}|${state.busy}|${state.phase}` : '';
    if (pendingSlot.dataset.key === key) return;
    pendingSlot.dataset.key = key;
    if (!p) return void pendingSlot.replaceChildren();
    const li = visitorBubble(p.body);
    li.classList.add('is-pending');
    const line = h('p', 'msg-status');
    if (p.creating || state.busy) {
      line.textContent = p.creating ? 'Starting the conversation…' : 'Sending…';
    } else {
      li.classList.add('is-failed');
      line.textContent = state.phase === 'ended' ? 'Not confirmed before the conversation ended' : 'Not delivered';
      if (state.phase === 'active') {
        const retry = Object.assign(h('button', 'link-btn'), { type: 'button', textContent: 'Retry' });
        retry.addEventListener('click', () => void client.send());
        line.append(' · ', retry);
      }
    }
    li.append(line);
    const wrap = h('ol', 'chat-msgs');
    wrap.append(li);
    pendingSlot.replaceChildren(wrap);
  }

  function renderActivity() {
    const a = state.activity;
    mole?.dig(a?.kind === 'thinking');
    // Rebuilt only when it changes, so the digging doesn't restart on every keystroke.
    const key = a ? `${a.kind}|${a.preview}|${state.host.name}` : '';
    if (activity.dataset.key === key) return;
    activity.dataset.key = key;
    if (!a) return void activity.replaceChildren();
    const li = h('div', `msg msg--reply msg--ai is-first is-thinking`);
    const label = h('p', 'msg-who');
    if (a.kind === 'thinking') {
      label.textContent = state.host.name || 'AI Stand-in';
      const bubble = h('div', 'msg-bubble');
      if (a.preview) bubble.append(Object.assign(h('p', 'msg-preview'), { textContent: a.preview }));
      else bubble.append(Object.assign(h('span', 'digging'), { innerHTML: '<i></i><i></i><i></i>' }), Object.assign(h('span', 'digging-text'), { textContent: 'Digging for an answer' }));
      li.append(label, bubble);
    } else {
      label.textContent = `${state.host.name || 'The team'} is typing…`;
      li.append(label);
    }
    activity.replaceChildren(li);
  }

  function renderBanner() {
    const { phase, error } = state;
    let message = '';
    let action = null;
    if (phase === 'unavailable') {
      message = error === 'start' ? TEXT.start : error === 'connect' ? TEXT.connect : TEXT.unavailable;
      action = ['Check again', () => client.retry()];
    } else if (phase === 'uncertain') {
      message = TEXT.uncertain;
      action = ['Start a new conversation', () => void client.newChat()];
    } else if (phase === 'ended') {
      message = error === 'gone' ? TEXT.gone : error === 'lost' ? TEXT.lost : followupSent ? TEXT.followup : TEXT.ended;
      action = ['Start a new conversation', () => {
        followupSent = false;
        void client.newChat().then(() => focusComposer());
      }];
    } else if (phase === 'active' && ['connect', 'paused', 'refresh'].includes(error)) {
      message = TEXT[error];
      if (error !== 'refresh') action = ['Reconnect', () => client.retry()];
    } else if (error === 'end') {
      message = TEXT.end;
      action = ['Try again', () => void client.end()];
    } else if (error === 'offer') {
      message = TEXT.offer;
    }
    banner.hidden = !message;
    banner.dataset.kind = phase === 'ended' ? 'ended' : error ? 'error' : phase;
    if (banner.dataset.message === `${message}|${action?.[0] ?? ''}|${state.busy}`) return;
    banner.dataset.message = `${message}|${action?.[0] ?? ''}|${state.busy}`;
    banner.replaceChildren(Object.assign(h('p'), { textContent: message }));
    if (action) {
      // Stand can report the end over the socket before the HTTP request that
      // ended it returns: the button waits for it, and says so.
      const label = state.busy && phase === 'ended' ? 'Closing the conversation…' : action[0];
      const b = Object.assign(h('button', phase === 'ended' || phase === 'uncertain' ? 'chunky' : 'chunky chunky--quiet'), { type: 'button', textContent: label, disabled: state.busy });
      b.addEventListener('click', action[1]);
      banner.append(b);
    }
  }

  function renderComposer() {
    const { phase, busy, pending } = state;
    // Uncertain keeps the message box visible: the visitor's text is in it, waiting.
    const open = ['loading', 'available', 'active', 'unavailable', 'uncertain'].includes(phase);
    form.hidden = !open;
    tray.hidden = !open || (!attachments.length && !suggestion);
    const ready = ['available', 'active'].includes(phase) && !busy && !(pending && !pending.creating);
    const hasContent = Boolean(input.value.trim() || attachments.length);
    send.disabled = !ready || !hasContent;
    send.textContent = phase === 'loading' ? 'Wait…' : 'Send';
    input.placeholder = attachments.length === 1
      ? `Ask about ${attachments[0].item || attachments[0].source}…`
      : attachments.length ? 'Ask about these…' : desktop.phone ? 'Ask anything' : 'Ask, or drag something here';
    notice.hidden = !state.notice;
    notice.textContent = state.notice;
    win.classList.toggle('has-attachments', attachments.length > 0);
  }

  function renderStatus() {
    const { phase, connection, host } = state;
    const label = phase === 'active'
      ? connection === 'online' ? 'Connected' : connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'
      : phase === 'available' ? host.kind === 'rep' ? 'Someone’s here' : 'AI Stand-in ready'
        : phase === 'loading' ? 'Checking…' : phase === 'unavailable' ? 'Nobody around' : phase === 'ended' ? 'Ended' : 'Not confirmed';
    conn.dataset.state = phase === 'active' ? connection : phase;
    conn.textContent = label;
    const url = safeUrl(state.poweredByUrl);
    powered.hidden = !url;
    if (url) powered.href = url;
  }

  // The thing just attached suggests a question: data-try on it, its list or its window.
  function suggestionFor(a) {
    const target = desktop.resolve(attachmentLabel(a)) ?? desktop.resolve(a.source);
    const el = target?.el ?? desktop.window(target?.win)?.el;
    return el?.closest('[data-try]')?.dataset.try ?? '';
  }

  function renderEmpty() {
    const visible = list.children.length || state.pending;
    empty.hidden = Boolean(visible);
    if (visible) return;
    const hint = attachments.length ? suggestionFor(attachments.at(-1)) : '';
    const key = `${state.phase}|${attachments.length ? 'a' : ''}|${suggestion ? 's' : ''}|${desktop.phone}|${hint}`;
    if (empty.dataset.key === key) return;
    empty.dataset.key = key;
    const art = h('div', 'chat-empty-art');
    art.setAttribute('aria-hidden', 'true');
    art.append(icon('chat'), icon('sheet'), icon('txt'));
    const title = h('h3');
    const body = h('p');
    if (state.phase === 'loading') {
      title.textContent = 'Checking who’s around…';
      body.textContent = 'You can start typing. Your message waits until someone can answer.';
    } else if (state.phase === 'uncertain') {
      title.textContent = 'Did that go through?';
      body.textContent = 'Your message is still in the box below. Start a new conversation to send it again.';
    } else if (state.phase === 'ended') {
      title.textContent = 'Conversation ended';
      body.textContent = 'Start a new one whenever you like. Anything you attached is kept.';
    } else if (state.phase === 'unavailable') {
      title.textContent = 'Nobody’s at their desk';
      body.textContent = 'Keep collecting what you want to ask about. The chat checks again when you ask it to.';
    } else if (attachments.length) {
      title.textContent = 'Now ask about it';
      body.textContent = 'Type your question below. Drag more things in if they help, up to four.';
    } else if (suggestion) {
      title.textContent = 'Your turn';
      body.textContent = 'That was a demo, so nothing is attached yet. Drag your own chart, price or changelog line here, or attach the demo’s row below.';
    } else if (desktop.phone) {
      title.textContent = 'Ask about anything';
      body.textContent = 'In any app, tap a row, a line or a chart and choose Ask. It comes along with your question, so we see exactly what you mean.';
    } else {
      title.textContent = 'Drag anything here to ask about it';
      body.textContent = 'A chart, a price, a changelog line, a whole app. It rides along with your question, so we see exactly what you’re looking at.';
    }
    empty.replaceChildren(art, title, body);
    const options = attachments.length ? (hint ? [hint] : []) : SUGGESTIONS;
    if (['available', 'loading', 'active'].includes(state.phase) && options.length) {
      const tries = h('p', 'chat-try');
      tries.append(Object.assign(h('span'), { textContent: attachments.length ? 'For example:' : 'Or just ask:' }));
      for (const s of options) {
        const b = Object.assign(h('button', 'try-btn'), { type: 'button', textContent: s });
        b.addEventListener('click', () => {
          input.value = s;
          autosize();
          pushDraft();
          renderComposer();
          input.focus();
        });
        tries.append(b);
      }
      empty.append(tries);
    }
  }

  // Attachments -----------------------------------------------------------------------

  // The demo's suggestion: a marked chip that attaches only when clicked.
  function suggestionChip() {
    const a = suggestion;
    const li = h('li', 'chip chip--tray chip--suggest');
    const main = h('button', 'chip-main');
    main.type = 'button';
    main.setAttribute('aria-label', `Attach ${attachmentLabel(a)}, the row from the demo`);
    main.title = 'From the demo: not attached until you click';
    main.append(
      Object.assign(h('span', 'chip-tag'), { textContent: 'Demo' }),
      icon(a.icon || iconFor(a)),
      chipText(a),
      Object.assign(h('span', 'chip-attach'), { textContent: 'Attach' }),
    );
    main.addEventListener('click', () => {
      attach(a, { via: 'demo' });
      input.focus();
    });
    const x = h('button', 'chip-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss the demo’s suggestion');
    x.textContent = '×';
    x.addEventListener('click', () => {
      clearSuggestion();
      input.focus();
    });
    li.append(main, x);
    return li;
  }

  /** The demo drops its row here instead of attaching it. Returns the chip, to land on. */
  function suggest(payload) {
    const a = { ...attachment(payload), icon: payload.icon || '' };
    if (!a.source || attachments.some((x) => sameAttachment(x, a))) return null;
    suggestion = a;
    saveSuggestion();
    renderTray();
    desktop.announce(`Demo: ${attachmentLabel(a)} is suggested below the conversation. Nothing is attached until you choose it.`);
    return tray.querySelector('.chip--suggest');
  }

  function clearSuggestion() {
    if (!suggestion) return;
    suggestion = null;
    saveSuggestion();
    renderTray();
  }

  function saveSuggestion() {
    const { load, store } = desktop.storage;
    store({ ...load(), suggestion });
  }

  function renderTray() {
    tray.replaceChildren(...attachments.map((a, i) => {
      const li = h('li', 'chip chip--tray');
      const main = h('button', 'chip-main');
      main.type = 'button';
      main.title = `Show ${attachmentLabel(a)}`;
      main.append(icon(a.icon || iconFor(a)), chipText(a));
      main.addEventListener('click', () => {
        const target = desktop.resolve(attachmentLabel(a));
        if (target) desktop.reveal(target);
      });
      const x = h('button', 'chip-x');
      x.type = 'button';
      x.setAttribute('aria-label', `Remove ${attachmentLabel(a)}`);
      x.textContent = '×';
      x.addEventListener('click', () => {
        remove(i);
        input.focus();
      });
      li.append(main, x);
      return li;
    }));
    if (suggestion) tray.append(suggestionChip());
    renderComposer();
    renderEmpty();
    renderPhoneTray();
  }

  function renderPhoneTray() {
    const show = desktop.phone && attachments.length > 0 && !isVisible();
    phoneTray.hidden = !show;
    if (!show) return;
    const first = attachments[0];
    phoneTray.replaceChildren(
      icon(first.icon || iconFor(first)),
      Object.assign(h('span'), { textContent: attachments.length === 1 ? attachmentLabel(first) : `${attachments.length} things attached` }),
      Object.assign(h('b'), { textContent: 'Ask →' }),
    );
  }

  /** Adds an attachment for the next message. Returns its chip, to land a drag on. */
  function attach(payload, { via = '', returnTo: back = null } = {}) {
    const a = { ...attachment(payload), icon: payload.icon || '' };
    if (!a.source) return null;
    const at = attachments.findIndex((x) => sameAttachment(x, a));
    if (at >= 0) {
      attachments[at] = a; // the same row, with what it shows now
    } else if (attachments.length >= MAX_ATTACHMENTS) {
      desktop.toast('Four things per question, please. Send these first.');
      return null;
    } else {
      attachments.push(a);
    }
    // A real choice replaces the demo's suggestion, whatever it was.
    if (suggestion) {
      suggestion = null;
      saveSuggestion();
    }
    if (!lastVia) lastVia = via;
    returnTo = back;
    renderTray();
    pushDraft();
    const chip = tray.children[at >= 0 ? at : attachments.length - 1];
    chip?.classList.add('is-new');
    setTimeout(() => chip?.classList.remove('is-new'), 700);
    desktop.announce(`Attached ${attachmentLabel(a)} to your next message.`);
    mole?.nod();
    if (desktop.phone && !isVisible()) mole?.speak('Got it. Tap “Ask →” when you’re ready.', 3200);
    return chip;
  }

  function remove(i) {
    const [gone] = attachments.splice(i, 1);
    renderTray();
    pushDraft();
    if (gone) desktop.announce(`Removed ${attachmentLabel(gone)}.`);
  }

  // The draft is the whole message: attachment lines and the question.
  function pushDraft() {
    lastDraft = formatMessage({ attachments, text: input.value });
    client.setDraft(lastDraft);
  }

  function syncDraft(draft) {
    if (draft === lastDraft) return;
    lastDraft = draft;
    const parsed = parseMessage(draft);
    attachments = parsed.attachments.map((a) => ({ ...a, icon: iconFor(a) }));
    if (document.activeElement !== input || !input.value.trim()) input.value = parsed.text;
    autosize();
    renderTray();
  }

  async function submit() {
    const s = client.getSnapshot();
    if (s.busy || (s.pending && !s.pending.creating) || !['available', 'active'].includes(s.phase)) return;
    const body = formatMessage({ attachments, text: input.value });
    if (!body) return;
    const via = lastVia || (attachments.length ? 'drag' : 'typed');
    attachments = [];
    input.value = '';
    lastVia = '';
    returnTo = null;
    if (suggestion) {
      suggestion = null;
      saveSuggestion();
    }
    autosize();
    renderTray();
    lastDraft = '';
    client.setDraft('');
    client.typing(false);
    stick = true;
    await client.send(body, { prompt: buildPrompt(context()), analyticsId: `drag-to-ask:${via}` });
  }

  // Replies: safe text, and names of windows turned into chips -----------------------

  // Escapes nothing because it never parses HTML: every piece becomes a text node,
  // except a few formats rebuilt as elements. Returns the first page reference.
  function richText(container, body) {
    let first = null;
    const lines = String(body).replace(/\r/g, '').split('\n');
    let para = null;
    let listEl = null;
    for (const raw of lines) {
      const line = raw.trimEnd();
      const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
      if (!line.trim()) {
        para = null;
        listEl = null;
      } else if (bullet) {
        para = null;
        if (!listEl) container.append(listEl = h(/^\s*\d/.test(line) ? 'ol' : 'ul'));
        const li = h('li');
        const found = inline(li, bullet[1]);
        first ??= found;
        listEl.append(li);
      } else {
        listEl = null;
        if (para) para.append(h('br'));
        else container.append(para = h('p'));
        const found = inline(para, line);
        first ??= found;
      }
    }
    return first;
  }

  function inline(parent, line) {
    const pattern = /\[\[([^\]\n]{1,80})\]\]|\*\*([^*\n]+)\*\*|`([^`\n]+)`|(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])/g;
    let last = 0;
    let first = null;
    for (const m of line.matchAll(pattern)) {
      if (m.index > last) parent.append(line.slice(last, m.index));
      if (m[1]) {
        const target = desktop.resolve(m[1]);
        if (target) {
          first ??= target;
          parent.append(refChip(target));
        } else {
          parent.append(m[1]);
        }
      } else if (m[2]) parent.append(Object.assign(h('strong'), { textContent: m[2] }));
      else if (m[3]) parent.append(Object.assign(h('code'), { textContent: m[3] }));
      else {
        const a = Object.assign(h('a'), { href: m[4], target: '_blank', rel: 'noopener noreferrer', textContent: m[4] });
        parent.append(a);
      }
      last = m.index + m[0].length;
    }
    if (last < line.length) parent.append(line.slice(last));
    return first;
  }

  function refChip(target) {
    const b = h('button', 'chip chip--ref');
    b.type = 'button';
    b.title = `Open ${target.label}`;
    b.append(icon(desktop.window(target.win)?.el.dataset.icon ?? 'file'), Object.assign(h('span'), { textContent: target.label }));
    b.addEventListener('click', () => desktop.reveal(target));
    return b;
  }

  // Menu, drop zone, visibility ----------------------------------------------------------

  function openMore() {
    const item = (label, action, disabled = false) => {
      const b = Object.assign(h('button'), { type: 'button', disabled });
      b.setAttribute('role', 'menuitem');
      b.textContent = label;
      b.addEventListener('click', () => {
        closeMore(false);
        action();
      });
      return b;
    };
    moreMenu.replaceChildren(
      item('End conversation', () => void client.end(), state.phase !== 'active' || state.busy),
      item('Remove attachments', () => {
        attachments = [];
        renderTray();
        pushDraft();
      }, !attachments.length),
      item('How this page works', () => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })),
    );
    moreMenu.hidden = false;
    more.setAttribute('aria-expanded', 'true');
    moreMenu.querySelector('[role="menuitem"]:not([disabled])')?.focus();
  }

  function closeMore(restore = true) {
    moreMenu.hidden = true;
    more.setAttribute('aria-expanded', 'false');
    if (restore) more.focus();
  }

  /** The drop target lights up while something is dragged, and more when it's over Chat. */
  function dragState({ active, over = false, payload = null }) {
    root.classList.toggle('is-drag-armed', active);
    win.classList.toggle('is-armed', active);
    win.classList.toggle('is-over', active && over);
    phoneTray.hidden = !(desktop.phone && (active || (attachments.length && !isVisible())));
    if (active && desktop.phone) phoneTray.replaceChildren(icon('chat'), Object.assign(h('span'), { textContent: 'Drop here to ask' }));
    else if (!active) renderPhoneTray();
    if (payload) {
      dropIcon.replaceChildren(icon(payload.icon || 'file'));
      dropLabel.textContent = payload.item === 'Quote' && !payload.value ? 'the text you selected' : attachmentLabel(payload);
    }
  }

  function isVisible() {
    return desktop.isVisible('chat');
  }

  function focusComposer({ returnTo: back = null } = {}) {
    if (back) returnTo = back;
    if (form.hidden) return banner.querySelector('button')?.focus();
    input.focus({ preventScroll: true });
  }

  function setUnread(n) {
    const rising = n > unread;
    unread = n;
    for (const b of root.querySelectorAll('.dicon--chat .badge, .mh-task--chat .badge')) {
      b.hidden = !n;
      b.textContent = String(n);
    }
    root.querySelector('.mh-task--chat')?.setAttribute('aria-label', n ? `Chat, ${n} new ${n === 1 ? 'reply' : 'replies'}` : 'Chat');
    mole?.flag(n > 0);
    if (rising) mole?.speak(n === 1 ? 'A reply just landed in Chat.' : `${n} new replies in Chat.`, 4000);
    renderPhoneTray();
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  render(state);
  return { render, attach, suggest, dragState, isVisible, focusComposer, get attachments() { return attachments.slice(); } };
}

// Helpers ------------------------------------------------------------------------------

function h(tag, className = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function chipText(a) {
  const span = h('span', 'chip-text');
  span.append(Object.assign(h('b'), { textContent: attachmentLabel(a) }));
  if (a.value) span.append(Object.assign(h('small'), { textContent: a.value }));
  return span;
}

function iconFor(a, target) {
  if (a.icon) return a.icon;
  const known = {
    'pricing.sheet': 'sheet', 'changelog.txt': 'txt', 'why molehill.doc': 'doc', 'quickstart.md': 'md',
    'product analytics': 'analytics', 'session replay': 'replay', 'feature flags': 'flags', experiments: 'experiments',
    surveys: 'surveys', 'data warehouse': 'warehouse', trash: 'trash', desktop: 'txt',
  };
  return known[a.source.toLowerCase()] ?? (target ? 'file' : 'file');
}

function initials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

function safeUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}
