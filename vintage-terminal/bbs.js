// The program running on the terminal: a 1983 bulletin board whose sysop is
// whoever Stand connects. It prints the conversation IRC-style, turns modem
// result codes into chat states (CONNECT, BUSY, NO CARRIER), understands a few
// /commands, and while nobody is chatting it draws the sysop's portrait in
// characters now and then, the way BBS art arrived over the phone line.

import { BRIGHT, DIM, UNDERLINE } from './screen.js';
import { safeUrl } from './stand-client.js';
import { portrait, STAND_LOGO, STAND_WORDMARK } from './ascii.js';

const BBS_NAME = 'KILOBAUD BBS';
const DIAL = 'ATDT 555-0199';
const SPEEDS = { 300: 300, 1200: 1200, 2400: 2400, 9600: 9600, 14400: 14400, 28800: 28800, 56000: 56000, max: 1e6 };

// Visitor-facing card notices. Unknown card types are never shown.
const CARDS = {
  'handoff': (c) => `${c.repName || 'A person from the team'} (human) joined the chat.`,
  'human-transfer': (c) => `Your chat moved to ${c.repName || 'a person from the team'} (human).`,
  'standin-takeover': (c) => `${c.standinName || 'An AI Stand-in'} (AI Stand-in) is covering this chat.`,
  'session-end': () => 'The conversation has ended.',
  'rep-followup-offer': (c) => `${c.repName || 'The team'} can follow up by email. Type /email you@example.com`,
  'rep-followup-confirmation': () => 'Follow-up requested. Watch your inbox.',
};

// What a system card says to the visitor, or null for cards that stay hidden.
export function describeCard(body) {
  try {
    const card = JSON.parse(body);
    const label = CARDS[card?.cardType];
    return label ? label(card) + (typeof card.message === 'string' && card.message.trim() ? ` ${card.message.trim()}` : '') : null;
  } catch {
    return null;
  }
}

const nickOf = (name, fallback = 'sysop') =>
  (String(name || '').trim().split(/\s+/)[0] || fallback).toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 12) || fallback;

// Markdown-ish text to terminal spans: **bold** and `code` print bright,
// links are underlined and clickable, headings and bullets are kept plain.
function format(text, messageId) {
  const spans = [];
  const source = String(text)
    .replace(/^#{1,6}\s+(.*)$/gm, '**$1**')
    .replace(/^(\s*)[*•]\s+/gm, '$1- ');
  const pattern = /\*\*(.+?)\*\*|__(.+?)__|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  let last = 0;
  for (const m of source.matchAll(pattern)) {
    if (m.index > last) spans.push({ text: source.slice(last, m.index) });
    if (m[1] ?? m[2]) spans.push({ text: m[1] ?? m[2], attr: BRIGHT });
    else if (m[3]) spans.push({ text: m[3], attr: BRIGHT });
    else {
      const label = m[4] ?? m[6];
      const url = safeUrl(m[5] ?? m[6]);
      spans.push(url ? { text: label, attr: UNDERLINE, link: { url, messageId } } : { text: label });
    }
    last = m.index + m[0].length;
  }
  if (last < source.length) spans.push({ text: source.slice(last) });
  return spans.map((s) => (s.attr ? s : { ...s, text: s.text.replace(/(^|\W)[*_](\S[^*_\n]*?)[*_](?=\W|$)/g, '$1$2') }));
}

export class Bbs {
  #screen;
  #client;
  #rom;
  #options;
  #state = null;
  #zoomed = false;
  #mode = 'boot'; // boot | attract | chat
  #seen = new Set(); // canonical message ids already on screen
  #echoes = []; // the visitor's own lines, printed before Stand confirms them
  #outbox = []; // lines typed while a send is still in flight, sent in order
  #greeting = null; // { text, block } shown before the conversation exists
  #preview = null; // { turnId, block } a streamed AI reply
  #restored = false;
  #intro = false; // CONNECT and the greeting are on screen
  #waitingForLine = false;
  #lastError = null;
  #carrierLost = false;
  #nextArt = 0;
  #art = null;
  #portraits = 0;
  #history = [];
  #historyIndex = -1;
  #lastSpeaker = null;
  #since = 0; // when the line opened, for the status bar clock
  #clock = 0;
  #hangingUp = false;

  constructor({ screen, client, rom, openLink, setInput, sound }) {
    this.#screen = screen;
    this.#client = client;
    this.#rom = rom;
    this.#options = { openLink, setInput, sound };
  }

  // -- Called by the page -----------------------------------------------------

  boot() {
    const s = this.#screen;
    s.title = { left: BBS_NAME, right: '' };
    s.input = { visible: true, prompt: '> ', text: '', caret: 0 };
    s.print([{ text: `${BBS_NAME}  v4.1  ·  64K RAM OK`, attr: BRIGHT }], { cps: 600 });
    s.print([{ text: '(C) 1983 KILOBAUD SYSTEMS · 80×25 MODE', attr: DIM }], { cps: 600 });
    s.print([]);
    s.print([{ text: 'READY.' }], { cps: 600 });
    this.#mode = 'attract';
    this.#nextArt = performance.now() + 1200;
    this.#status();
  }

  setZoomed(zoomed) {
    if (zoomed === this.#zoomed) return;
    this.#zoomed = zoomed;
    const phase = this.#state?.phase;
    if (zoomed) {
      this.#screen.scrollToEnd();
      if (this.#mode !== 'chat') this.#startChatScreen();
      else if (phase === 'ended' && !this.#screen.busy) this.#notice('Press Enter to dial again.', BRIGHT);
    } else if (!this.#inConversation()) {
      // Back to the corner: the portrait loop resumes after a while.
      this.#nextArt = performance.now() + 9000;
    }
    this.#status();
  }

  // The visitor pressed Enter. Returns true if the input should be cleared.
  submit(raw) {
    const text = raw.replace(/\s+$/, '');
    const phase = this.#state?.phase;
    if (!text.trim()) return this.#enter();
    this.#history.push(text);
    this.#historyIndex = -1;
    if (text.trim().startsWith('/')) {
      this.#command(text.trim());
      return true;
    }
    if (phase === 'available' || phase === 'active') {
      this.#screen.flush();
      this.#turn('you');
      this.#say('you', text, { visitor: true, cps: Infinity });
      this.#outbox.push(text.trim());
      this.#pump();
      this.#options.sound?.('send');
      return true;
    }
    if (phase === 'ended' || phase === 'uncertain') this.#notice('Not connected. Press Enter on an empty line to dial again.');
    else if (phase === 'unavailable') this.#notice('The line is busy. Press Enter on an empty line to redial.');
    else this.#notice('Still dialing, one moment…');
    return false;
  }

  // Keystrokes the terminal handles itself.
  key(name) {
    const s = this.#screen;
    const page = s.region.bottom - s.region.top;
    if (name === 'PageUp') s.scrollBy(page);
    else if (name === 'PageDown') s.scrollBy(-page);
    else if (name === 'End') s.scrollToEnd();
    else if (name === 'ArrowUp' || name === 'ArrowDown') {
      if (!this.#history.length) return null;
      const index = this.#historyIndex < 0 ? this.#history.length : this.#historyIndex;
      const next = Math.max(0, Math.min(this.#history.length, index + (name === 'ArrowUp' ? -1 : 1)));
      this.#historyIndex = next;
      return this.#history[next] ?? '';
    }
    return null;
  }

  // Draft changes: mirrored on screen and saved with the conversation.
  input(text, caret) {
    const s = this.#screen;
    s.input.text = text;
    s.input.caret = caret;
    s.touch();
    // Mid-request the client keeps the text it is sending as its draft (so an
    // unconfirmed start survives a reload): leave it alone until it's done.
    const state = this.#client.state;
    if (['available', 'active'].includes(state.phase) && !state.busy) this.#client.setDraft(text);
  }

  // A click on the glass: links open (and link cards are reported to Stand).
  click(hit) {
    const link = hit?.link;
    if (!link?.url) return false;
    this.#options.openLink(link.url);
    if (link.card) void this.#client.trackLinkClick(link.messageId, link.url);
    return true;
  }

  // Stand's state changed.
  update(state) {
    const previous = this.#state;
    this.#state = state;
    if (!previous || state.host !== previous.host) this.#title();

    // First state after a reload: put the saved conversation back at once.
    if (!this.#restored && state.phase !== 'loading' && state.messages.length) {
      this.#restored = true;
      if (this.#mode !== 'chat') this.#enterChat();
      this.#intro = true;
      this.#printMessages(state, Infinity);
      if (state.phase === 'active') this.#notice('Welcome back. The line is still open.');
    } else if (state.phase !== 'loading') {
      this.#restored = true;
    }

    if (this.#mode === 'chat') {
      if (this.#waitingForLine && state.phase !== 'loading') this.#answer();
      this.#printMessages(state, null);
      this.#printPreview(state);
      this.#transitions(previous, state);
      this.#pump();
    }
    this.#status();
  }

  // The grid changed (a phone rotated): bars are laid out again.
  resized() {
    this.#title();
    this.#status();
  }

  // Runs every frame: the attract loop and the status bar clock.
  tick(now) {
    if (this.#mode === 'attract' && !this.#zoomed && now >= this.#nextArt && !this.#screen.busy && this.#state && this.#state.phase !== 'loading' && !this.#art) {
      void this.#drawPortrait();
    }
    if (this.#since && Math.floor(now / 1000) !== this.#clock) {
      this.#clock = Math.floor(now / 1000);
      this.#status();
    }
  }

  // -- Screens ------------------------------------------------------------------

  #inConversation() {
    const phase = this.#state?.phase;
    return phase === 'active' || this.#echoes.length > 0 || Boolean(this.#state?.messages.length);
  }

  // Sends queued lines one at a time: Stand confirms each before the next.
  #pump() {
    const state = this.#client.state;
    if (!this.#outbox.length || state.busy || state.pending || !['available', 'active'].includes(state.phase)) return;
    const body = this.#outbox.shift();
    const echo = { body, clientMessageId: null };
    this.#echoes.push(echo);
    this.#client.setDraft(body);
    void this.#client.send();
    echo.clientMessageId = this.#client.state.pending?.clientMessageId ?? null;
  }

  // ATDT, then CONNECT or BUSY once Stand has answered and the line is quiet.
  #dial() {
    this.#line([{ text: DIAL, attr: DIM }], { cps: 60 });
    this.#options.sound?.('dial');
    this.#waitingForLine = true;
    this.#screen.pause(700, () => {
      if (this.#state && this.#state.phase !== 'loading') this.#answer();
    });
  }

  #enterChat() {
    this.#lastSpeaker = null;
    this.#mode = 'chat';
    this.#art = null;
    this.#screen.clear();
    this.#screen.baud = this.#screen.baud || 1200;
  }

  // Zoomed in for the first time (or after the portrait loop): dial.
  #startChatScreen() {
    this.#enterChat();
    const phase = this.#state?.phase;
    if (this.#state?.messages.length) {
      this.#printMessages(this.#state, Infinity);
      if (phase === 'ended') {
        this.#line([{ text: 'NO CARRIER', attr: BRIGHT }], { cps: Infinity });
        this.#notice('Press Enter to dial again.', BRIGHT);
      }
      return;
    }
    if (phase === 'uncertain') {
      this.#notice('The last call may have connected, but it was never confirmed.');
      this.#notice('Press Enter to dial again.', BRIGHT);
      return;
    }
    this.#dial();
  }

  // The other end picked up (or didn't).
  #answer() {
    if (!this.#waitingForLine || this.#screen.busy) return;
    this.#waitingForLine = false;
    const state = this.#state;
    if (state.phase === 'available') {
      this.#line([{ text: 'CONNECT 1200', attr: BRIGHT }]);
      this.#options.sound?.('connect');
      this.#blank();
      this.#identity(state.host);
      this.#turn('host');
      this.#greeting = { text: state.greeting, block: this.#say(nickOf(state.host.name), state.greeting || 'Hello! What can I help you with?') };
      this.#client.showGreeting(state.greeting);
      this.#intro = true;
    } else if (state.phase === 'unavailable') {
      this.#line([{ text: 'BUSY', attr: BRIGHT }]);
      this.#notice('Nobody can answer right now. Press Enter to try again.');
    } else if (state.phase === 'ended') {
      this.#line([{ text: 'NO CARRIER', attr: BRIGHT }]);
      this.#notice('Press Enter to dial again.', BRIGHT);
    }
  }

  #identity(host) {
    const who = host.kind === 'rep' ? 'human' : 'AI Stand-in';
    this.#notice(`${host.name || 'The sysop'} (${who}) is the sysop on duty.`);
  }

  async #drawPortrait() {
    const s = this.#screen;
    this.#art = 'drawing';
    const rows = s.region.bottom - s.region.top - 2;
    const avatar = this.#state.host.avatar;
    let lines = avatar ? await portrait(avatar, this.#rom, Math.min(s.cols - 2, 56), rows) : null;
    if (this.#mode !== 'attract' || this.#zoomed) {
      this.#art = null;
      return;
    }
    const host = this.#state.host;
    const available = this.#state.phase === 'available' || this.#state.phase === 'active';
    const logo = !lines;
    if (logo) lines = s.cols >= 70 ? sideBySide(STAND_LOGO, STAND_WORDMARK, 6) : STAND_LOGO;
    const width = Math.max(...lines.map((l) => [...l].length));
    const pad = ' '.repeat(Math.max(0, Math.floor((s.cols - width) / 2)));
    s.print([]);
    // The first portrait arrives at 4800 baud to catch the eye; later ones take their time at 2400.
    s.print([{ text: lines.map((l) => pad + l).join('\n'), attr: logo ? BRIGHT : 0 }], { cps: this.#portraits++ ? 240 : 480 });
    const name = (host.name || 'The sysop').toUpperCase();
    const caption = available ? `${name} · ${host.kind === 'rep' ? 'ON LINE' : 'AI STAND-IN · ON LINE'}` : `${name} · AWAY`;
    s.print([]);
    s.print([{ text: centre(caption, s.cols), attr: BRIGHT }], { cps: 240 });
    s.print([{ text: centre(available ? 'MOVE CLOSER TO CHAT' : 'LEAVE A MESSAGE LATER', s.cols), attr: DIM }], { cps: 240 });
    s.pause(5200);
    // Scroll it away, a line at a time.
    for (let i = 0; i < s.region.bottom - s.region.top + 1; i++) {
      s.pause(90);
      s.print([]);
    }
    s.print([{ text: 'READY.' }], {
      cps: 600,
      onDone: () => {
        this.#art = null;
        this.#nextArt = performance.now() + 26000 + Math.random() * 12000;
      },
    });
  }

  // -- Printing -----------------------------------------------------------------

  #line(spans, options = {}) {
    return this.#screen.print(spans, options);
  }

  #blank() {
    this.#screen.print([]);
  }

  #notice(text, attr = DIM, options = {}) {
    this.#lastSpeaker = 'system';
    return this.#screen.print([{ text: `*** ${text}`, attr }], { indent: 4, ...options });
  }

  #say(nick, text, { visitor = false, cps = null, messageId = null } = {}) {
    const prefix = `<${nick}> `;
    return this.#screen.print([{ text: prefix, attr: visitor ? DIM : BRIGHT }, ...format(text, messageId)], {
      indent: [...prefix].length,
      cps: cps ?? undefined,
      hot: cps !== Infinity || !visitor,
    });
  }

  #linkCard(card, messageId, cps) {
    const url = safeUrl(card.url);
    if (!url) return;
    const cols = this.#screen.cols;
    const inner = Math.min(cols - 4, 64);
    const fit = (text) => {
      const chars = [...String(text ?? '').replace(/\s+/g, ' ').trim()];
      return (chars.length > inner - 2 ? chars.slice(0, inner - 3).join('') + '…' : chars.join('')).padEnd(inner - 2);
    };
    const link = { url, messageId, card: true };
    const rows = [
      [{ text: `┌${'─'.repeat(inner)}┐`, link }],
      [{ text: '│ ', link }, { text: fit(card.title || url), attr: BRIGHT, link }, { text: ' │', link }],
    ];
    const description = String(card.description ?? '').trim();
    if (description) rows.push([{ text: '│ ', link }, { text: fit(description), link }, { text: ' │', link }]);
    rows.push([{ text: '│ ', link }, { text: fit(url), attr: UNDERLINE, link }, { text: ' │', link }]);
    rows.push([{ text: `└${'─'.repeat(inner)}┘`, link }]);
    const spans = rows.flatMap((row, i) => (i ? [{ text: '\n' }, ...row] : row));
    this.#screen.print(spans.map((s) => ({ ...s, text: s.text })), { cps: cps ?? undefined, indent: 0 });
  }

  // Prints canonical messages that aren't on screen yet, in order.
  #printMessages(state, cps) {
    for (const m of state.messages) {
      if (this.#seen.has(m.messageId)) continue;
      this.#seen.add(m.messageId);
      if (m.type === 'system-prompt' || m.senderType === 'system-prompt') continue;
      if (m.type === 'text' || m.type === 'standin-idle-prompt') {
        if (m.senderType === 'visitor') {
          const echo = this.#echoes.find((e) => (e.clientMessageId && e.clientMessageId === m.clientMessageId) || (!e.clientMessageId && e.body === m.body.trim()));
          if (echo) {
            this.#echoes = this.#echoes.filter((e) => e !== echo);
            continue;
          }
          this.#turn('you');
          this.#say('you', m.body, { visitor: true, cps: Infinity, messageId: m.messageId });
          continue;
        }
        if (this.#greeting && m.body === this.#greeting.text) {
          this.#greeting = null;
          continue;
        }
        if (this.#preview && (!m.turnId || m.turnId === this.#preview.turnId)) {
          const nick = nickOf(state.host.name);
          this.#screen.update(this.#preview.block, [{ text: `<${nick}> `, attr: BRIGHT }, ...format(m.body, m.messageId)]);
          this.#preview = null;
          continue;
        }
        this.#turn('host');
        this.#say(m.senderType === 'rep' || m.senderType === 'standin' ? nickOf(state.host.name) : 'sysop', m.body, { cps, messageId: m.messageId });
        if (cps !== Infinity) this.#options.sound?.('receive');
      } else if (m.type === 'link-card') {
        this.#turn('host');
        try {
          this.#linkCard(JSON.parse(m.body), m.messageId, cps);
        } catch {
          // Malformed cards are skipped.
        }
      } else if (m.type === 'system-card' || m.senderType === 'system-card') {
        let card;
        try {
          card = JSON.parse(m.body);
        } catch {
          continue;
        }
        if (card?.cardType === 'session-start') {
          if (!this.#intro) this.#identity({ name: card.standinName, kind: 'standin' });
          continue;
        }
        const text = describeCard(m.body);
        if (text) this.#notice(text, BRIGHT, { cps: cps ?? undefined });
      }
    }
  }

  // A blank line between turns, so a conversation reads in paragraphs.
  #turn(speaker) {
    if (this.#lastSpeaker && this.#lastSpeaker !== speaker) this.#blank();
    this.#lastSpeaker = speaker;
  }

  // A streamed AI reply starts printing before it is complete.
  #printPreview(state) {
    const preview = state.preview;
    if (!preview) {
      if (this.#preview && !state.typing) {
        this.#screen.remove(this.#preview.block);
        this.#preview = null;
      }
      return;
    }
    const spans = [{ text: `<${nickOf(state.host.name)}> `, attr: BRIGHT }, ...format(preview.text, null)];
    if (this.#preview?.turnId === preview.turnId) this.#screen.update(this.#preview.block, spans);
    else {
      this.#turn('host');
      this.#preview = { turnId: preview.turnId, block: this.#screen.print(spans, { indent: [...spans[0].text].length }) };
    }
  }

  #transitions(previous, state) {
    if (previous?.phase !== state.phase) {
      if (state.phase === 'active' && !this.#since) this.#since = performance.now();
      if (state.phase === 'ended' && previous?.phase === 'active') {
        this.#since = 0;
        this.#line([{ text: 'NO CARRIER', attr: BRIGHT }]);
        this.#options.sound?.('hangup');
        if (state.pending) this.#notice(`Not confirmed before the line dropped: "${state.pending.body}"`);
        this.#notice('Press Enter to dial again.', BRIGHT);
      }
      if (state.phase === 'uncertain') {
        this.#notice('Could not confirm whether the call connected.');
        this.#notice('Press Enter to dial again.', BRIGHT);
      }
      if (state.phase === 'unavailable' && previous?.phase && previous.phase !== 'loading') {
        this.#line([{ text: 'BUSY', attr: BRIGHT }]);
        this.#notice('Nobody can answer right now. Press Enter to try again.');
      }
      if (['ended', 'unavailable', 'uncertain'].includes(state.phase) && this.#outbox.length) {
        this.#notice(`Not sent: ${this.#outbox.map((t) => `"${t}"`).join(', ')}`);
        this.#outbox = [];
      }
      // A failed start or a new chat puts unsent text back for review, never resent by itself.
      if (['unavailable', 'uncertain', 'loading'].includes(state.phase) && state.draft && !this.#screen.input.text) {
        this.#options.setInput(state.draft);
      }
    }
    if (state.phase === 'active' && previous?.phase === 'active' && previous.connection !== state.connection) {
      if (state.connection === 'offline' && previous.connection === 'online' && !this.#carrierLost) {
        this.#carrierLost = true;
        this.#notice('Carrier lost. Reconnecting…');
      } else if (state.connection === 'online' && this.#carrierLost) {
        this.#carrierLost = false;
        this.#notice('Carrier restored.');
      }
    }
    if (state.phase !== 'active') this.#carrierLost = false;
    if (state.error && state.error !== this.#lastError) this.#notice(state.error, BRIGHT);
    this.#lastError = state.error;
    if (state.followupOffered && !previous?.followupOffered) this.#options.sound?.('receive');
  }

  // -- Commands -----------------------------------------------------------------

  // Enter on an empty line: skip the slow printing, retry, or redial.
  #enter() {
    const s = this.#screen;
    const state = this.#state;
    if (!s.following) {
      s.scrollToEnd();
      return false;
    }
    if (s.busy && !this.#waitingForLine) {
      s.flush();
      return false;
    }
    if (!state) return false;
    if (state.pending && !state.busy && state.phase === 'active') void this.#client.send();
    else if (state.phase === 'ended' || state.phase === 'uncertain') this.#redial();
    else if (state.phase === 'unavailable') {
      this.#dial();
      void this.#client.retry();
    } else if (state.phase === 'active' && state.connection === 'offline') void this.#client.retry();
    return false;
  }

  #redial() {
    this.#blank();
    this.#echoes = [];
    this.#outbox = [];
    this.#greeting = null;
    this.#intro = false;
    this.#dial();
    void this.#client.newChat();
  }

  #command(line) {
    const [name, ...rest] = line.slice(1).split(/\s+/);
    const arg = rest.join(' ');
    const state = this.#state;
    this.#turn('you');
    this.#screen.print([{ text: line, attr: DIM }], { cps: Infinity, hot: false });
    switch (name.toLowerCase()) {
      case 'help':
      case '?':
        this.#help();
        break;
      case 'bye':
      case 'quit':
      case 'exit':
      case 'logoff':
      case 'hangup':
        if (state?.phase === 'active') {
          this.#notice('Hanging up…');
          this.#hangingUp = true;
          this.#status();
          void this.#client.end().finally(() => {
            this.#hangingUp = false;
            this.#status();
          });
        } else this.#notice('Not connected.');
        break;
      case 'new':
      case 'dial':
      case 'redial':
        if (state?.phase === 'ended' || state?.phase === 'uncertain') this.#redial();
        else if (state?.phase === 'unavailable') this.#enter();
        else this.#notice('Already connected. Type /bye to hang up first.');
        break;
      case 'email':
        if (!state?.followupOffered) this.#notice('No follow-up offer is open right now.');
        else if (!/^\S+@\S+\.\S+$/.test(arg)) this.#notice('Usage: /email you@example.com');
        else void this.#client.submitEmail(arg);
        break;
      case 'baud': {
        const speed = SPEEDS[arg.toLowerCase().replace(/k$/, '000')];
        if (!speed) this.#notice(`Modem at ${this.#screen.baud} baud. Try /baud 300, 2400, 9600 or max.`);
        else {
          this.#screen.baud = speed;
          this.#notice(speed >= 1e6 ? 'OK. No speed limit.' : `OK. ${speed} baud.`);
        }
        this.#status();
        break;
      }
      case 'clear':
      case 'cls':
        this.#screen.clear();
        break;
      case 'retry':
        if (state?.pending) void this.#client.send();
        else void this.#client.retry();
        break;
      case 'sound':
        this.#options.sound?.(arg === 'off' ? 'off' : 'on');
        this.#notice(arg === 'off' ? 'Sound off.' : 'Sound on. The modem will sing.');
        break;
      case 'about':
        this.#notice('This terminal is a custom chat UI on Stand\'s Visitor API: discovery, a session over HTTP, replies over a WebSocket. The monitor is a Blender model drawn with three.js; the picture is 800 x 300 dots of simulated phosphor.');
        this.#line([{ text: '    ' }, { text: 'https://github.com/standchat/examples/tree/main/vintage-terminal', attr: UNDERLINE, link: { url: 'https://github.com/standchat/examples/tree/main/vintage-terminal/' } }], { indent: 4 });
        break;
      default:
        this.#line([{ text: '?SYNTAX ERROR', attr: BRIGHT }, { text: '  Type /help for commands.', attr: DIM }], { cps: 240 });
    }
  }

  #help() {
    const wide = this.#screen.cols >= 60;
    const rows = [
      ['/help', 'this list'],
      ['/bye', 'hang up: ends the conversation'],
      ['/new', 'dial again after a hang-up'],
      ['/email ADDR', 'leave your email when a follow-up is offered'],
      ['/baud N', 'modem speed: 300, 1200, 2400, 9600 or max'],
      ['/clear', 'clear the screen'],
      ['/sound on', 'modem noises'],
      ['/about', 'how this terminal works'],
    ];
    this.#notice('Commands:', BRIGHT, { cps: 480 });
    for (const [command, text] of rows) {
      this.#screen.print([{ text: `    ${command.padEnd(wide ? 14 : 12)}`, attr: BRIGHT }, { text }], { indent: wide ? 18 : 16, cps: 480 });
    }
    this.#screen.print([{ text: '    Esc minimizes. PgUp/PgDn scroll. Up recalls. Enter skips the modem.', attr: DIM }], { indent: 4, cps: 480 });
  }

  // -- Bars ---------------------------------------------------------------------

  #title() {
    const host = this.#state?.host;
    const s = this.#screen;
    const wide = s.cols >= 60;
    const ai = host?.kind === 'rep' ? '' : wide ? ' · AI Stand-in' : ' · AI';
    s.title = { left: wide ? BBS_NAME : 'KILOBAUD', right: host?.name ? `${host.name}${ai}`.toUpperCase() : '' };
    s.touch();
  }

  #status() {
    const s = this.#screen;
    const state = this.#state;
    const wide = s.cols >= 60;
    const speed = s.baud >= 1e6 ? 'MAX' : `${s.baud}`;
    let right;
    if (!state || state.phase === 'loading') right = 'DIALING…';
    else if (state.phase === 'unavailable') right = 'BUSY';
    else if (state.phase === 'ended') right = 'NO CARRIER';
    else if (state.phase === 'uncertain') right = 'NO CARRIER?';
    else if (state.phase === 'active' && this.#hangingUp) right = 'HANGING UP…';
    else if (state.phase === 'active' && state.connection !== 'online') right = 'RECONNECTING…';
    else if (state.phase === 'active') right = `ONLINE ${elapsed(this.#since)}`;
    else right = 'ON LINE';
    if (state?.typing && state.phase === 'active') right = `${nickOf(state.host.name)} is typing…  ${right}`;
    right = `${wide ? `${speed} 8N1  │  ` : ''}${right}`;
    const left = this.#zoomed ? (wide ? 'ESC MINIMIZE  │  /HELP' : '/HELP') : wide ? 'MOVE CLOSER TO CHAT' : '';
    s.status = { left, right };
    s.touch();
  }
}

function elapsed(since) {
  if (!since) return '00:00';
  const seconds = Math.floor((performance.now() - since) / 1000);
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

function centre(text, cols) {
  const length = [...text].length;
  return ' '.repeat(Math.max(0, Math.floor((cols - length) / 2))) + text;
}

function sideBySide(left, right, gap) {
  const width = Math.max(...left.map((l) => [...l].length));
  const offset = Math.floor((left.length - right.length) / 2);
  return left.map((line, i) => {
    const r = right[i - offset];
    return r ? `${line.padEnd(width + gap - ([...line].length - line.length))}${r}` : line;
  });
}
