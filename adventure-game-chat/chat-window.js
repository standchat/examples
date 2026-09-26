// The chat window, in the style of an old adventure game's message box: a
// transcript that reads like a game log, and a parser line where you type.
// It renders the visitor client's state and reports what the visitor does.
// It knows nothing about the network.

const SPEED = 55; // Characters per second for replies that type themselves out.

export class ChatWindow {
  constructor({ parent, name, portrait, on }) {
    this.name = name;
    this.on = on; // { send, close, end, newChat, retry, email, link, typing, speaking }
    this.items = new Map();
    this.typing = null;
    this.greeting = '';
    this.#build(parent, portrait);
  }

  #build(parent, portrait) {
    const el = (this.el = document.createElement('section'));
    el.className = 'win';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-labelledby', 'win-title');
    el.innerHTML = `
      <header class="win-bar">
        <span class="win-portrait"></span>
        <h2 id="win-title"><span class="win-name"></span><span class="win-badge"></span></h2>
        <span class="win-sub"></span>
        <button class="win-close" type="button" aria-label="Close the chat"><span aria-hidden="true">×</span></button>
      </header>
      <div class="win-log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation" tabindex="0"></div>
      <div class="win-foot">
        <p class="win-notice" hidden></p>
        <form class="win-parser">
          <label class="win-prompt" for="win-input">&gt;<span class="win-visually-hidden">Your message</span></label>
          <textarea id="win-input" rows="1" autocomplete="off" spellcheck="true" enterkeyhint="send"></textarea>
          <button class="win-send" type="submit" aria-label="Send">⏎</button>
        </form>
        <div class="win-meta">
          <span class="win-status" role="status"></span>
          <button class="win-end" type="button" hidden>End chat</button>
          <a class="win-powered" target="_blank" rel="noopener noreferrer" hidden>Powered by Stand</a>
        </div>
      </div>
      <div class="win-confirm" hidden>
        <div class="win-confirm-box" role="alertdialog" aria-labelledby="win-confirm-text">
          <p id="win-confirm-text">End this conversation? You can't pick it up again afterwards.</p>
          <div><button type="button" data-yes>End chat</button><button type="button" data-no>Keep talking</button></div>
        </div>
      </div>`;
    parent.append(el);
    this.log = el.querySelector('.win-log');
    this.input = el.querySelector('textarea');
    this.form = el.querySelector('form');
    this.status = el.querySelector('.win-status');
    el.querySelector('.win-portrait').append(portrait);
    el.querySelector('.win-name').textContent = this.name;
    this.input.placeholder = '';
    this.input.setAttribute('aria-label', `Message to ${this.name}`);

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#submit();
    });
    // keyCode 229: Safari reports IME composition this way on the confirming key.
    const composing = (event) => event.isComposing || event.keyCode === 229;
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !composing(event)) {
        event.preventDefault();
        this.#submit();
      }
    });
    this.input.addEventListener('input', () => {
      this.#grow();
      if (this.input.value.trim()) this.on.typing?.();
    });
    el.querySelector('.win-close').addEventListener('click', () => this.on.close());
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !composing(event)) {
        event.stopPropagation();
        if (!this.el.querySelector('.win-confirm').hidden) this.#confirm(false);
        else this.on.close();
      }
    });
    el.querySelector('.win-end').addEventListener('click', () => this.#confirm(true));
    el.querySelector('.win-powered').addEventListener('click', () => this.on.badge?.());
    el.querySelector('[data-yes]').addEventListener('click', () => { this.#confirm(false); this.on.end(); });
    el.querySelector('[data-no]').addEventListener('click', () => this.#confirm(false));
    // Clicking the log finishes a reply that is still typing itself out.
    this.log.addEventListener('click', () => this.typing?.finish());
    this.#grow();
  }

  // Open from the moment open() is called until close() is: the animations
  // around it don't count.
  get isOpen() {
    return this.opened === true;
  }

  open({ focus = true } = {}) {
    this.opened = true;
    clearTimeout(this.hideTimer);
    this.el.hidden = false;
    this.el.classList.remove('is-closing');
    this.el.classList.add('is-opening');
    setTimeout(() => this.el.classList.remove('is-opening'), 400);
    this.#scroll(true);
    if (focus) this.focus();
  }

  close() {
    this.opened = false;
    this.typing?.finish();
    this.el.classList.add('is-closing');
    this.hideTimer = setTimeout(() => {
      this.el.hidden = true;
      this.el.classList.remove('is-closing');
    }, 160);
  }

  // The parser line if you can type, else the first thing you can do.
  focus() {
    const typeable = !this.form.hidden && !this.input.disabled;
    const target = typeable ? this.input : this.log.querySelector('button') ?? this.el.querySelector('.win-close');
    target.focus({ preventScroll: true });
  }

  // Starts the parser line with some text (typed before the window opened).
  prefill(text) {
    this.input.value = text;
    this.#grow();
    this.input.focus({ preventScroll: true });
    this.input.setSelectionRange(text.length, text.length);
  }

  #submit() {
    const text = this.input.value.trim();
    // While a message waits to be confirmed, keep the new one in the box.
    if (!text || this.busy || this.waiting) return;
    this.typing?.finish();
    this.input.value = '';
    this.#grow();
    this.on.send(text);
  }

  #grow() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 120)}px`;
    this.form.toggleAttribute('data-empty', !this.input.value);
  }

  #confirm(show) {
    this.el.querySelector('.win-confirm').hidden = !show;
    if (show) this.el.querySelector('[data-no]').focus();
    else this.input.focus({ preventScroll: true });
  }

  // --- Rendering -------------------------------------------------------------------

  render(state) {
    const root = this.el.getRootNode();
    const hadFocus = this.el.contains(root.activeElement);
    this.busy = state.busy;
    this.waiting = Boolean(state.pending);
    const ai = state.host.kind === 'standin';
    const badge = this.el.querySelector('.win-badge');
    badge.textContent = state.host.kind ? (ai ? 'AI' : 'Live') : '';
    badge.title = ai ? 'An AI Stand-in is answering.' : state.host.kind === 'rep' ? 'A person is answering.' : '';
    badge.hidden = !state.host.kind;
    const who = state.host.name && firstName(state.host.name) !== firstName(this.name) ? `Answered by ${state.host.name}` : '';
    this.el.querySelector('.win-sub').textContent = who;

    const notice = this.el.querySelector('.win-notice');
    notice.textContent = state.notice;
    notice.hidden = !state.notice;
    const powered = this.el.querySelector('.win-powered');
    const url = safeUrl(state.poweredByUrl);
    powered.hidden = !url;
    if (url) powered.href = url;
    this.el.querySelector('.win-end').hidden = state.phase !== 'active' || state.busy;

    this.#items(state);
    this.status.textContent = statusText(state);
    const composing = state.phase === 'available' || state.phase === 'active';
    this.form.hidden = !composing;
    this.input.disabled = !composing;
    // Text that never got through comes back to the parser line.
    if (state.draft && !this.input.value) {
      this.input.value = state.draft;
      this.#grow();
      queueMicrotask(() => this.on.draft?.()); // After this render, not inside it.
    }
    // If the focused control just went away (the chat ended mid-sentence), move on.
    if (hadFocus && this.isOpen && !this.el.contains(root.activeElement)) this.focus();
  }

  // Builds the transcript as keyed items and patches the log in place, so a
  // reply that is typing itself out keeps going across updates.
  #items(state) {
    const wanted = [];
    const visible = state.messages.filter((m) => m.type !== 'system-prompt' && m.senderType !== 'system-prompt');
    // Replies type themselves out only while you watch, and never twice.
    const typeOut = this.isOpen && !this.restoring;
    if (!visible.length && this.greeting && this.isOpen && state.phase !== 'unavailable') {
      wanted.push({ key: 'greeting', kind: 'say', text: this.greeting, typeOut });
    }
    if (state.activity.preview) this.previewed = true;
    const firstReply = visible.find((m) => m.type === 'text' && m.senderType !== 'visitor');
    for (const m of visible) {
      if (m.type === 'text' || m.type === 'standin-idle-prompt') {
        // The greeting we showed comes back as the first reply: keep its line.
        const key = m === firstReply && m.body === this.greeting ? 'greeting' : m.messageId;
        const fresh = !this.items.has(key);
        wanted.push(m.senderType === 'visitor'
          ? { key, kind: 'you', text: m.body }
          : { key, kind: 'say', text: m.body, typeOut: typeOut && fresh && !this.previewed });
        if (fresh && m.senderType !== 'visitor') this.previewed = false;
      } else if (m.type === 'link-card') {
        const card = parse(m.body);
        const url = safeUrl(card.url);
        if (url) wanted.push({ key: m.messageId, kind: 'link', url, title: text(card.title) || url, description: text(card.description), messageId: m.messageId });
      } else if (m.type === 'system-card') {
        const line = cardLine(parse(m.body));
        if (line) wanted.push({ key: m.messageId, kind: 'note', text: line });
      }
    }
    if (state.pending?.body) wanted.push({ key: `pending:${state.pending.clientMessageId || 'start'}`, kind: 'you', text: state.pending.body, pending: state.busy ? 'sending' : 'failed' });
    if (state.activity.preview) wanted.push({ key: 'preview', kind: 'say', text: state.activity.preview, preview: true });
    else if (state.activity.typing || (state.busy && state.pending)) wanted.push({ key: 'thinking', kind: 'thinking' });
    if (state.followupOffered && state.phase === 'active') wanted.push({ key: 'followup', kind: 'email' });
    if (state.phase === 'unavailable') wanted.push({ key: 'unavailable', kind: 'note', text: 'Nobody can answer right now. Try again in a little while.', action: ['Try again', 'retry'] });
    if (state.phase === 'ended') wanted.push({ key: 'ended', kind: 'note', text: 'The conversation has ended.', action: ['New chat', 'newChat'] });
    if (state.phase === 'uncertain') wanted.push({ key: 'uncertain', kind: 'note', text: 'We could not tell whether your chat started.', action: ['New chat', 'newChat'] });
    if (state.error && state.phase !== 'ended' && state.phase !== 'uncertain') {
      wanted.push({ key: `error:${state.error}`, kind: 'note', text: state.error, action: state.pending && !state.busy ? ['Send again', 'resend'] : ['Try again', 'retry'], error: true });
    }

    const keep = new Set(wanted.map((w) => w.key));
    for (const [key, node] of this.items) {
      if (!keep.has(key)) {
        if (this.typing?.key === key) this.typing.finish();
        node.remove();
        this.items.delete(key);
      }
    }
    let previous = null;
    for (const item of wanted) {
      let node = this.items.get(item.key);
      if (!node || node.dataset.sig !== signature(item)) {
        const fresh = this.#node(item, state);
        if (node) node.replaceWith(fresh);
        node = fresh;
        this.items.set(item.key, node);
      }
      const expected = previous ? previous.nextSibling : this.log.firstChild;
      if (node !== expected) this.log.insertBefore(node, expected);
      previous = node;
    }
    this.#scroll();
  }

  #node(item, state) {
    const node = document.createElement('div');
    node.className = `line line-${item.kind}`;
    node.dataset.sig = signature(item);
    switch (item.kind) {
      case 'you': {
        node.append(Object.assign(document.createElement('span'), { className: 'line-you-mark', textContent: '> ' }));
        node.append(document.createTextNode(item.text));
        if (item.pending) {
          const tag = Object.assign(document.createElement('span'), { className: 'line-pending', textContent: item.pending === 'sending' ? ' …' : ' (not delivered)' });
          node.append(tag);
        }
        break;
      }
      case 'say': {
        const body = markdown(item.text);
        if (item.typeOut && !item.preview && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          // Screen readers get the whole reply at once; the eyes get it letter by letter.
          const spoken = Object.assign(document.createElement('div'), { className: 'win-visually-hidden' });
          spoken.append(body.cloneNode(true));
          const shown = document.createElement('div');
          shown.setAttribute('aria-hidden', 'true');
          shown.append(body);
          node.append(spoken, shown);
          this.#typeOut(item.key, shown);
        } else {
          node.append(body);
        }
        if (item.preview) {
          // A streamed preview changes many times; screen readers get the final reply once.
          node.classList.add('is-preview');
          node.setAttribute('aria-hidden', 'true');
        }
        break;
      }
      case 'link': {
        const a = Object.assign(document.createElement('a'), { href: item.url, target: '_blank', rel: 'noopener noreferrer', className: 'line-link-card' });
        a.append(Object.assign(document.createElement('strong'), { textContent: item.title }));
        if (item.description) a.append(Object.assign(document.createElement('span'), { textContent: item.description }));
        a.addEventListener('click', () => this.on.link?.(item.messageId, item.url));
        node.append(a);
        break;
      }
      case 'note': {
        node.append(Object.assign(document.createElement('p'), { textContent: item.text }));
        if (item.error) node.classList.add('is-error');
        if (item.action) {
          const [label, action] = item.action;
          const button = Object.assign(document.createElement('button'), { type: 'button', textContent: label });
          button.addEventListener('click', () => this.on[action]?.());
          node.append(button);
        }
        break;
      }
      case 'thinking': {
        node.append(Object.assign(document.createElement('span'), { textContent: `${this.name} is thinking` }), Object.assign(document.createElement('span'), { className: 'dots', ariaHidden: 'true' }));
        break;
      }
      case 'email': {
        node.innerHTML = `
          <p>Nobody could answer in time. Leave your email and the team will get back to you.</p>
          <form class="line-email">
            <label class="win-visually-hidden" for="win-email">Your email</label>
            <input id="win-email" type="email" autocomplete="email" required placeholder="you@example.com">
            <button type="submit">Send</button>
          </form>`;
        node.querySelector('form').addEventListener('submit', (event) => {
          event.preventDefault();
          this.on.email?.(node.querySelector('input').value.trim());
        });
        break;
      }
    }
    return node;
  }

  // Reveals a reply letter by letter while the character talks.
  #typeOut(key, container) {
    this.typing?.finish();
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push({ node: n, text: n.data });
    const total = nodes.reduce((sum, n) => sum + n.text.length, 0);
    for (const n of nodes) n.node.data = '';
    const speed = Math.max(SPEED, total / 6); // Long replies speed up; none takes over ~6 s.
    const start = performance.now();
    let frame;
    const finish = () => {
      cancelAnimationFrame(frame);
      for (const n of nodes) n.node.data = n.text;
      if (this.typing?.key === key) {
        this.typing = null;
        this.on.speaking?.(false);
      }
      this.#scroll();
    };
    const step = () => {
      let shown = Math.floor(((performance.now() - start) / 1000) * speed);
      for (const n of nodes) {
        const take = Math.min(n.text.length, Math.max(0, shown));
        n.node.data = n.text.slice(0, take);
        shown -= n.text.length;
      }
      this.#scroll();
      if (shown < 0) frame = requestAnimationFrame(step);
      else finish();
    };
    this.typing = { key, finish };
    this.on.speaking?.(true);
    frame = requestAnimationFrame(step);
  }

  #scroll(force = false) {
    const log = this.log;
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    if (force || near) log.scrollTop = log.scrollHeight;
  }
}

// --- Helpers ----------------------------------------------------------------------

const text = (v) => (typeof v === 'string' ? v : '');
const parse = (body) => { try { const v = JSON.parse(body); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const firstName = (name) => String(name).trim().split(/\s+/)[0].toLowerCase();
const signature = (item) => JSON.stringify([item.kind, item.text, item.pending, item.title, item.action, item.preview ? 1 : 0]);
// (typeOut is left out on purpose: a reply that already typed itself out is never rebuilt.)

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function statusText(state) {
  if (state.phase === 'loading') return 'Looking for someone to answer…';
  if (state.phase === 'active') return state.connection === 'online' ? '' : state.connection === 'connecting' ? 'Connecting…' : 'Reconnecting…';
  return '';
}

function cardLine(card) {
  switch (card.cardType) {
    case 'handoff':
    case 'human-transfer':
      return `${text(card.repName) || 'A person from the team'} has joined the chat.`;
    case 'standin-takeover':
      return `${text(card.standinName) || 'An AI Stand-in'} (AI) has joined the chat.`;
    case 'rep-followup-confirmation':
      return 'Thanks! The team will follow up by email.';
    case 'session-end':
      return 'The conversation has ended.';
    default:
      return ''; // session-start, link clicks and unknown cards stay quiet.
  }
}

// A small, safe Markdown subset: paragraphs, lists, bold, italics, code and
// http(s) links. Builds DOM nodes; never parses HTML.
export function markdown(source, onLink) {
  const fragment = document.createDocumentFragment();
  const blocks = String(source).replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    const bullet = lines.every((l) => /^\s*[-*•]\s+/.test(l));
    const numbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
    if (bullet || numbered) {
      const list = document.createElement(numbered ? 'ol' : 'ul');
      for (const l of lines) {
        const li = document.createElement('li');
        inline(li, l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''), onLink);
        list.append(li);
      }
      fragment.append(list);
    } else {
      const p = document.createElement('p');
      lines.forEach((l, i) => {
        if (i) p.append(document.createElement('br'));
        inline(p, l.replace(/^#{1,6}\s+/, ''), onLink);
      });
      fragment.append(p);
    }
  }
  return fragment;
}

function inline(parent, source, onLink) {
  const pattern = /\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  let last = 0;
  for (const m of source.matchAll(pattern)) {
    parent.append(source.slice(last, m.index));
    if (m[1] || m[2]) parent.append(Object.assign(document.createElement('strong'), { textContent: m[1] || m[2] }));
    else if (m[3] || m[4]) parent.append(Object.assign(document.createElement('em'), { textContent: m[3] || m[4] }));
    else if (m[5]) parent.append(Object.assign(document.createElement('code'), { textContent: m[5] }));
    else {
      const url = safeUrl(m[7] || m[8]);
      if (!url) parent.append(m[0]);
      else {
        const a = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener noreferrer', textContent: m[6] || m[8] });
        a.addEventListener('click', () => onLink?.(url));
        parent.append(a);
      }
    }
    last = m.index + m[0].length;
  }
  parent.append(source.slice(last));
}
