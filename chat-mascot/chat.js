// Gilly as the whole chat UI: a 3D character in the corner instead of a chat
// button, speech bubbles synced to speech synthesis, a bubble to type or talk
// back in, and AR where the platform allows it.
//
//   stand-client.js  Stand's visitor API: discovery, session, messages, recovery
//   voice.js         Web Speech: speaking with progress, listening
//   mascot.js        three.js stage, rig and motion        (loaded on demand)
//   behaviors.js     what Gilly does, and when             (loaded on demand)
//   ar.js            AR Quick Look and Vision Pro's <model> (loaded on demand)

import { StandChatClient } from './stand-client.js';
import { Voice } from './voice.js';

// Stand Chat's shared demo site: answers on any domain, including localhost.
// Use your own Site ID (from Sites in Stand) on your own site.
const SITE_ID = 'demo';
const BASE = new URL('.', import.meta.url);
const asset = (path) => new URL(path, BASE).href;

const GREETINGS = [
  "Oh! Hi there! I'm Gilly, Tidelight's resident axolotl. Ask me anything about your visit: tickets, feeding times, or where the jellies glow!",
  "Oh, hello! I'm Gilly. I've been floating here waiting for someone to ask me something. What would you like to know about Tidelight?",
  "Hi hi! Gilly here, Tidelight's axolotl on duty. Want to know what's on today, or how to get tickets?",
];
const WELCOME_BACK = 'Welcome back! What else can I help you with?';
const TICKLES = ['Hee hee, that tickles!', 'Boop! Hi again!', "Careful, I'm ticklish!"];

// Private context for whoever answers: the AI Stand-in, or a person on the team.
// Visitors don't see it, but it is in the page, so never put secrets here. Up to
// 2,000 characters; most of it comes from what this page already shows.
function privateContext() {
  const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  const lines = [
    'The visitor is on the homepage of Tidelight Aquarium, a made-up aquarium on the Harborview waterfront, used as a Stand Chat demo.',
    'Your replies are spoken aloud by Gilly, a cartoon axolotl, and shown in a speech bubble: keep them to one to three short sentences, warm and playful, in plain text without markdown, lists, links or emoji.',
    'Open daily 9:30 to 17:30, Thursdays until 21:00 for Tidelight After Dark (ages 18 and up after 18:00). Tickets: adult $32, child 3 to 12 $18, under 3 and members free; timed entry, then stay all day.',
    'Step-free with lifts to all three levels, wheelchairs and sensory backpacks at the front desk, stroller parking, the Driftwood Café on Level 2.',
  ];
  // Today's schedule and the exhibits, as the page shows them.
  const events = [...document.querySelectorAll('[data-event]:not([hidden])')].map((el) => {
    const state = el.classList.contains('is-done') ? ' (over)' : el.classList.contains('is-now') ? ' (now)' : '';
    return `${el.dataset.time} ${text(el.querySelector('h3'))} at ${text(el.querySelector('.tl-event-where'))}${state}`;
  });
  if (events.length) lines.push(`Today: ${events.join('; ')}.`);
  const exhibits = [...document.querySelectorAll('.tl-card')].map((el) => `${text(el.querySelector('h3'))} (${text(el.querySelector('.tl-card-meta'))})`);
  if (exhibits.length) lines.push(`Exhibits: ${exhibits.join(', ')}.`);
  // What the visitor is looking at right now.
  const reading = [...document.querySelectorAll('main section, .tl-page section, section')].find((s) => {
    const r = s.getBoundingClientRect();
    return r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5 && !s.closest('.gc-root');
  });
  const heading = text(reading?.querySelector('h1, h2'));
  if (heading) lines.push(`They are looking at the section "${heading}".`);
  lines.push(`Their local time: ${new Date().toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' })}.`);
  return lines.join(' ').slice(0, 2000);
}

const CARD_NOTES = {
  'session-start': null,
  handoff: '{repName} from the team joined the chat.',
  'human-transfer': 'A person from the team is taking it from here.',
  'standin-takeover': 'An AI Stand-in is answering now.',
  'session-end': 'The chat ended.',
  'rep-followup-offer': 'The team can follow up by email.',
  'rep-followup-confirmation': 'Your follow-up request was received.',
};

const ICONS = {
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="m16 9.5 5 5m0-5-5 5"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>',
  end: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><circle cx="12" cy="12" r="9"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
};

const $ = (tag, cls, attrs = {}) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  return el;
};

const store = (() => {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
})();
const remember = (key, value) => {
  try {
    if (value === undefined) return store?.getItem(key);
    store?.setItem(key, value);
  } catch { /* In memory only. */ }
  return undefined;
};

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const phone = matchMedia('(max-width: 640px)');

// --- The widget -------------------------------------------------------------------

class GillyChat {
  constructor() {
    this.voice = new Voice();
    this.client = new StandChatClient({
      siteId: SITE_ID,
      storage: store,
      context: () => ({
        prompt: privateContext(),
        // Persist the greeting Gilly spoke, so the transcript and the team see it.
        includeOpeningGreeting: Boolean(this.greeting),
        openingMessage: this.greeting || undefined,
      }),
    });
    this.open = false;
    this.spoken = new Set(JSON.parse(remember('gilly-spoken') || '[]'));
    this.unread = [];
    this.speaking = null; // { id, text, char }
    this.queue = [];
    this.listening = null;
    this.lastTyping = 0;
    this.hovering = false;
    this.pointer = null;
    this.greeting = remember('gilly-greeting') || '';
    this.state = this.client.state;
    this.firstState = true;

    this.build();
    this.layout();
    this.client.subscribe((s) => this.onState(s));
    this.client.mount();
    this.loadGilly();
    this.bindPage();

    if (remember('gilly-open') === '1') this.setOpen(true, { quiet: true });
    else this.scheduleHint();
  }

  // --- DOM ---------------------------------------------------------------------------

  build() {
    const root = $('div', 'gc-root', { 'data-mode': 'loading', 'data-phase': 'loading' });
    this.root = root;

    this.stage = $('div', 'gc-stage');
    this.poster = $('img', 'gc-poster', { src: asset('gilly.png'), alt: '', 'aria-hidden': 'true', draggable: 'false' });
    this.poster.addEventListener('error', () => this.poster.remove());
    this.stage.append(this.poster);

    this.hit = $('button', 'gc-hit', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'gc-panel' });
    this.hit.append($('span', 'gc-sr', { text: 'Chat with Gilly, Tidelight’s axolotl' }));
    this.hit.addEventListener('click', () => this.onTapGilly());
    this.hit.addEventListener('pointerenter', () => this.setHover(true));
    this.hit.addEventListener('pointerleave', () => this.setHover(false));

    this.hint = $('div', 'gc-hint', { hidden: '', role: 'status' });
    this.hint.addEventListener('click', () => this.setOpen(true));

    this.badge = $('div', 'gc-badge', { hidden: '', 'aria-hidden': 'true' });

    // The panel: Gilly's speech bubble, then the visitor's bubble.
    const panel = $('section', 'gc-panel', { id: 'gc-panel', role: 'dialog', 'aria-label': 'Chat with Gilly', hidden: '' });
    this.panel = panel;
    const bubble = $('div', 'gc-bubble');
    this.bubble = bubble;

    const head = $('div', 'gc-head');
    const name = $('div', 'gc-name');
    name.append($('strong', '', { text: 'Gilly' }));
    this.who = $('span', 'gc-who');
    name.append(this.who);
    this.muteBtn = $('button', 'gc-icon', { type: 'button' });
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.moreBtn = $('button', 'gc-icon', { type: 'button', 'aria-label': 'More options', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: ICONS.more });
    this.moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });
    const closeBtn = $('button', 'gc-icon', { type: 'button', 'aria-label': 'Close chat (it stays open in the background)', html: ICONS.close });
    closeBtn.addEventListener('click', () => this.setOpen(false));
    head.append(name, this.muteBtn, this.moreBtn, closeBtn);

    this.menu = $('div', 'gc-menu', { role: 'menu', hidden: '' });

    this.log = $('div', 'gc-log', { role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions text', tabindex: '0', 'aria-label': 'Conversation' });
    // The log follows the conversation (and Gilly's voice) until the visitor
    // scrolls it themselves; scrolling back to the end picks it up again.
    this.follow = true;
    const unfollow = () => (this.follow = false);
    this.log.addEventListener('wheel', unfollow, { passive: true });
    this.log.addEventListener('touchmove', unfollow, { passive: true });
    this.log.addEventListener('keydown', (e) => /^(Arrow|Page|Home|End| )/.test(e.key) && unfollow());
    this.log.addEventListener('pointerdown', (e) => e.offsetX > this.log.clientWidth && unfollow()); // Scrollbar.
    this.log.addEventListener('scroll', () => {
      if (this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 24) this.follow = true;
    }, { passive: true });
    // The log shrinks when the keyboard opens: stay with the newest line.
    new ResizeObserver(() => this.keepInView()).observe(this.log);

    this.status = $('div', 'gc-status', { hidden: '', role: 'alert' });
    this.actions = $('div', 'gc-actions', { hidden: '' });
    this.email = this.buildEmailForm();

    const foot = $('div', 'gc-foot');
    this.notice = $('span', '', { hidden: '' });
    this.attribution = $('a', '', { hidden: '', target: '_blank', rel: 'noopener noreferrer', text: 'Powered by Stand' });
    foot.append(this.notice, this.attribution);

    this.tail = $('div', 'gc-tail', {
      'aria-hidden': 'true',
      html: '<svg viewBox="0 0 26 30" width="26" height="30"><path d="M0 2C9 8 17 12 26 14C17 17 9 22 0 28Z" fill="#fff"/></svg>',
    });

    bubble.append(head, this.menu, this.log, this.status, this.email, this.actions, foot, this.tail);

    // The visitor's own bubble.
    const compose = $('form', 'gc-compose', { 'aria-label': 'Your message' });
    this.compose = compose;
    this.input = $('textarea', '', { rows: '1', placeholder: 'Ask Gilly anything…', 'aria-label': 'Message Gilly', enterkeyhint: 'send', autocomplete: 'off' });
    this.mic = $('button', 'gc-icon gc-mic', { type: 'button', 'aria-label': 'Talk to Gilly', 'aria-pressed': 'false', html: ICONS.mic });
    if (!this.voice.canListen) this.mic.hidden = true;
    this.send = $('button', 'gc-icon gc-send', { type: 'submit', 'aria-label': 'Send', html: ICONS.send });
    compose.append(this.input, this.mic, this.send);
    compose.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.submit();
      }
    });
    this.input.addEventListener('input', () => {
      this.client.setDraft(this.input.value);
      this.lastTyping = performance.now();
      this.autosize();
      this.updateGilly();
    });
    this.input.addEventListener('focus', () => this.updateGilly());
    this.input.addEventListener('blur', () => this.updateGilly());
    this.mic.addEventListener('click', () => this.toggleListening());

    panel.append(bubble, compose);
    this.fx = $('div', 'gc-fx', { 'aria-hidden': 'true' });
    root.append(this.stage, this.fx, this.hint, this.panel, this.hit, this.badge);
    document.body.append(root);

    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.menu.hidden) this.toggleMenu(false);
        else this.setOpen(false);
      }
    });
    document.addEventListener('click', (e) => {
      if (!this.menu.hidden && !this.menu.contains(e.target)) this.toggleMenu(false);
    });
    this.renderMute();
  }

  buildEmailForm() {
    const form = $('form', 'gc-email', { hidden: '' });
    const label = $('label', '', { for: 'gc-email-input', text: 'Your email' });
    const help = $('p', '', { id: 'gc-email-help', text: 'Leave your email and the team will follow up on this conversation.' });
    const input = $('input', '', { id: 'gc-email-input', type: 'email', autocomplete: 'email', required: '', 'aria-describedby': 'gc-email-help' });
    const button = $('button', 'gc-btn', { type: 'submit', text: 'Request follow-up' });
    form.append(label, help, input, button);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim()) this.client.submitEmail(input.value.trim());
    });
    return form;
  }

  // --- Gilly ----------------------------------------------------------------------------

  async loadGilly() {
    const ar = await import('./ar.js').catch(() => null);
    this.ar = ar;
    const spatial = await ar?.spatialModelSupported?.().catch(() => false);
    if (spatial) {
      // Vision Pro: Gilly is a real 3D model in a soft window, and can be pulled out into the room.
      try {
        this.gilly = await ar.createSpatialGilly(this.stage, {
          src: asset('gilly.usdz'), poster: asset('gilly.png'), onTap: () => this.onTapGilly(),
        });
        this.root.dataset.mode = 'spatial';
        this.afterGillyLoaded();
        return;
      } catch (e) {
        console.warn('Spatial Gilly unavailable, using WebGL.', e);
      }
    }
    // Some older Safari versions crash while starting WebGL on busy pages. If the
    // last start in this session never finished, Gilly stays a picture instead.
    const lastStart = remember('gilly-3d');
    if (!webglAvailable() || lastStart === 'starting' || lastStart === 'off') {
      if (lastStart === 'starting') remember('gilly-3d', 'off');
      this.root.dataset.mode = 'poster';
      return;
    }
    remember('gilly-3d', 'starting');
    addEventListener('pagehide', () => {
      if (remember('gilly-3d') === 'starting') remember('gilly-3d', 'ok'); // Left normally: no crash.
    });
    try {
      const [{ Mascot }, { Director }] = await Promise.all([import('./mascot.js'), import('./behaviors.js')]);
      const mascot = await Mascot.load({ host: this.stage, url: asset('gilly.glb'), layout: this.stageLayout() });
      const director = new Director(mascot);
      this.gilly = webglGilly(mascot, director);
      this.mascot = mascot;
      this.director = director;
      let frames = 0;
      mascot.on((type, detail) => {
        if (type === 'tick') {
          this.layout();
          if (++frames === 30) remember('gilly-3d', 'ok'); // Compiled and drawing: safe.
        }
        if (type === 'bubble') this.spawnBubble(detail);
        if (type === 'snore') this.snore(detail.on);
        if (type === 'contextlost') this.root.dataset.mode = 'poster';
        if (type === 'contextrestored') this.root.dataset.mode = 'webgl';
      });
      this.root.dataset.mode = 'webgl';
      director.start();
      this.afterGillyLoaded();
    } catch (e) {
      console.warn('Gilly could not load in 3D; showing a picture instead.', e);
      remember('gilly-3d', 'ok');
      this.root.dataset.mode = 'poster';
    }
  }

  afterGillyLoaded() {
    this.updateGilly();
    this.renderMenu();
    this.ar?.decoratePage?.({ usdz: asset('gilly.usdz'), poster: asset('gilly.png'), onOpenChat: () => this.setOpen(true) });
  }

  stageLayout() {
    const compact = phone.matches;
    return { worldHeight: compact ? 0.56 : 0.58, homeX: 0, floorY: 0, roam: compact ? 0.02 : 0.06, compact };
  }

  // What Gilly should be doing, from what's happening in the chat.
  updateGilly() {
    const g = this.gilly;
    if (!g) return;
    const s = this.state;
    if (this.mascot) this.mascot.maxFps = this.open || this.hovering || this.speaking ? 60 : 30;
    if (this.speaking) return g.setState('talking', { lookAt: this.open && !phone.matches ? this.bubble : null });
    if (!this.open) return g.setState(this.hovering ? 'attentive' : 'idle');
    if (this.listening) return g.setState('listening', { voice: true });
    const waiting = s.pending || (s.typing && s.phase === 'active');
    if (waiting) return g.setState('thinking');
    const typing = document.activeElement === this.input && performance.now() - this.lastTyping < 2500;
    if (typing) return g.setState('listening', { voice: false, lookAt: this.input });
    return g.setState('attentive');
  }

  setHover(on) {
    this.hovering = on;
    if (on) this.gilly?.attention();
    this.updateGilly();
  }

  onTapGilly() {
    this.gilly?.attention();
    this.hideHint();
    if (!this.open) {
      this.setOpen(true);
      return;
    }
    // Poking Gilly while chatting: a giggle.
    if (!this.speaking && !this.listening) {
      this.gilly?.perform(Math.random() < 0.5 ? 'happy' : 'aww');
      this.say({ id: `tickle-${Date.now()}`, text: TICKLES[Math.floor(Math.random() * TICKLES.length)], transient: true });
    }
  }

  // --- Opening and closing ------------------------------------------------------------------

  setOpen(open, { quiet = false } = {}) {
    if (open === this.open) return;
    this.open = open;
    remember('gilly-open', open ? '1' : '0');
    this.hit.setAttribute('aria-expanded', String(open));
    this.hideHint();
    if (open) {
      this.root.dataset.open = '';
      this.panel.hidden = false;
      this.panel.removeAttribute('data-closing');
      this.badge.hidden = true;
      this.render();
      const s = this.state;
      const fresh = !this.client.hasSession && s.phase !== 'ended' && s.phase !== 'uncertain';
      if (!quiet) {
        // Speaking inside this tap also unlocks speech on iOS for later replies.
        if (fresh && s.phase !== 'unavailable') {
          // Greet: Gilly startles awake, grins and waves, and says hello.
          if (!this.greeting) {
            this.greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
            remember('gilly-greeting', this.greeting);
          }
          this.gilly?.perform('greet');
          this.say({ id: 'greeting', text: this.greeting, local: true });
        } else if (s.phase === 'unavailable') {
          this.gilly?.perform('sorry');
          this.say({ id: 'unavailable', text: UNAVAILABLE, local: true });
        } else if (this.unread.length) {
          const last = this.unread[this.unread.length - 1];
          this.gilly?.perform('wave');
          this.say(last);
        } else {
          this.voice.prime(); // Nothing to say yet: unlock speech for the next reply.
          this.gilly?.perform('wave');
        }
      }
      this.unread = [];
      if (!phone.matches && !quiet) setTimeout(() => this.input.focus({ preventScroll: true }), 380);
      requestAnimationFrame(() => this.scrollToEnd());
    } else {
      this.voice.cancel();
      this.stopListening();
      this.speaking = null;
      this.queue = [];
      this.toggleMenu(false);
      delete this.root.dataset.open;
      this.panel.setAttribute('data-closing', '');
      setTimeout(() => {
        if (!this.open) this.panel.hidden = true;
      }, 220);
      this.gilly?.perform('bye');
      if (this.panel.contains(document.activeElement)) this.hit.focus({ preventScroll: true });
    }
    this.updateGilly();
  }

  scheduleHint() {
    if (remember('gilly-hinted') === '1') return;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      if (this.open) return;
      remember('gilly-hinted', '1');
      this.hint.innerHTML = '';
      this.hint.append(document.createTextNode('Psst! Questions about your visit?'), $('small', '', { text: 'Tap me to chat, or just talk to me.' }));
      this.hint.hidden = false;
      this.gilly?.perform('wave');
      this.hintTimer = setTimeout(() => this.hideHint(), 9000);
    }, 6500);
  }

  hideHint() {
    clearTimeout(this.hintTimer);
    this.hint.hidden = true;
  }

  // --- State from Stand -------------------------------------------------------------------

  onState(s) {
    const prev = this.state;
    this.state = s;
    this.root.dataset.phase = s.phase;
    this.root.dataset.connection = s.connection;
    // Messages already there when we load (a reload) are history, not news.
    if (this.firstState || (prev.phase === 'loading' && s.messages.length && !prev.messages.length && !this.open)) {
      for (const m of s.messages) this.spoken.add(m.messageId);
      this.saveSpoken();
    }
    this.firstState = false;
    // New replies from Gilly's side: speak them, or flag them if the chat is closed.
    for (const m of s.messages) {
      if (this.spoken.has(m.messageId) || !isSpeech(m) || m.senderType === 'visitor') continue;
      this.spoken.add(m.messageId);
      if (this.greeting && m.body.trim() === this.greeting.trim()) continue; // Already said it.
      const item = { id: m.messageId, text: m.body };
      if (this.open) this.say(item);
      else {
        this.unread.push(item);
        this.showUnread();
      }
    }
    this.saveSpoken();
    if (prev.phase !== s.phase) this.onPhase(prev.phase, s.phase);
    this.render();
    this.updateGilly();
  }

  onPhase(from, to) {
    if (to === 'unavailable' && this.open && from === 'loading') {
      this.gilly?.perform('sorry');
      this.say({ id: 'unavailable', text: UNAVAILABLE, local: true });
    }
    if (to === 'ended' && from === 'active') {
      this.gilly?.perform('bye');
    }
    if (to === 'active' && from === 'available') this.gilly?.perform('happy');
  }

  saveSpoken() {
    remember('gilly-spoken', JSON.stringify([...this.spoken].slice(-300)));
  }

  showUnread() {
    this.badge.textContent = String(this.unread.length);
    this.badge.hidden = false;
    this.gilly?.perform('wave');
    this.hint.innerHTML = '';
    this.hint.append(document.createTextNode('I have an answer for you!'), $('small', '', { text: 'Tap me to hear it.' }));
    this.hint.hidden = false;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hideHint(), 8000);
  }

  // --- Speaking ---------------------------------------------------------------------------------

  // Queue a line for Gilly to say; the bubble highlights along with the voice.
  say(item) {
    if (this.speaking && item.transient) return;
    this.queue.push(item);
    if (!this.speaking) this.nextLine();
  }

  nextLine() {
    const item = this.queue.shift();
    if (!item) {
      this.speaking = null;
      this.gilly?.mouth([0, 0, 0]);
      this.updateGilly();
      this.render();
      return;
    }
    this.speaking = { ...item, char: 0 };
    if (item.local || item.transient) this.localLines = [...(this.localLines ?? []).filter((l) => l.id !== item.id), item];
    this.updateGilly();
    this.render();
    this.voice.speak(item.text, {
      onProgress: (char) => {
        if (!this.speaking || this.speaking.id !== item.id) return;
        this.speaking.char = char;
        this.renderSpeaking();
      },
      onMouth: (shape) => this.gilly?.mouth(shape),
      onEnd: () => {
        if (this.speaking?.id !== item.id) return;
        if (item.transient) this.localLines = (this.localLines ?? []).filter((l) => l.id !== item.id);
        setTimeout(() => this.nextLine(), 250);
      },
    });
  }

  toggleMute() {
    this.voice.setMuted(!this.voice.muted);
    this.renderMute();
    this.renderMenu();
  }

  renderMute() {
    const muted = this.voice.muted || !this.voice.supported;
    this.muteBtn.innerHTML = muted ? ICONS.muted : ICONS.speaker;
    this.muteBtn.setAttribute('aria-label', muted ? 'Turn Gilly’s voice on' : 'Turn Gilly’s voice off');
    this.muteBtn.setAttribute('aria-pressed', String(!muted));
    this.muteBtn.hidden = !this.voice.supported;
  }

  // --- Listening --------------------------------------------------------------------------------

  toggleListening() {
    if (this.listening) return this.stopListening();
    if (!['available', 'active'].includes(this.state.phase)) return;
    this.voice.cancel();
    this.speaking = null;
    this.queue = [];
    const before = this.input.value;
    this.listening = this.voice.listen({
      onText: (text) => {
        this.input.value = text;
        this.autosize();
      },
      onError: (message) => {
        this.flash(message);
        this.gilly?.perform('sorry');
      },
      onEnd: (text) => {
        this.listening = null;
        this.mic.setAttribute('aria-pressed', 'false');
        this.compose.removeAttribute('data-listening');
        if (text) {
          this.input.value = text;
          this.client.setDraft(text);
          this.submit();
        } else {
          this.input.value = before;
          this.updateGilly();
        }
      },
    });
    if (!this.listening) return;
    this.mic.setAttribute('aria-pressed', 'true');
    this.compose.setAttribute('data-listening', '');
    this.input.value = '';
    this.input.placeholder = 'Listening…';
    this.gilly?.attention();
    this.updateGilly();
  }

  stopListening() {
    if (!this.listening) return;
    this.listening.stop();
    this.input.placeholder = 'Ask Gilly anything…';
  }

  flash(message) {
    this.flashMessage = message;
    this.render();
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flashMessage = null;
      this.render();
    }, 5000);
  }

  // --- Sending -------------------------------------------------------------------------------------

  submit() {
    const s = this.state;
    const text = this.input.value.trim();
    this.input.placeholder = 'Ask Gilly anything…';
    if (!text || s.busy || s.pending) return;
    if (!['available', 'active'].includes(s.phase)) return;
    this.client.setDraft(text);
    this.input.value = '';
    this.autosize();
    this.voice.cancel();
    this.speaking = null;
    this.queue = [];
    this.localLines = (this.localLines ?? []).filter((l) => l.id === 'greeting');
    this.client.send();
    this.gilly?.attention();
    this.scrollToEnd();
  }

  autosize() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(120, this.input.scrollHeight)}px`;
  }

  // --- Rendering --------------------------------------------------------------------------------------

  render() {
    if (this.panel.hidden && !this.open) return;
    const s = this.state;
    // Who is answering, truthfully.
    const human = s.host.kind === 'rep';
    this.who.innerHTML = '';
    this.who.append($('i'), document.createTextNode(
      s.phase === 'loading' ? 'Checking who’s around…'
        : s.phase === 'unavailable' ? 'Nobody’s free right now'
          : human ? `${s.host.name || 'Someone'} from the team (a person)`
            : s.phase === 'active' && s.connection !== 'online' ? 'Reconnecting…'
              : 'Answers by AI Stand-in',
    ));
    this.who.title = s.host.name ? `Responder: ${s.host.name}` : '';

    this.renderLog();

    // Status, errors and actions.
    const status = this.flashMessage || s.error || (s.phase === 'uncertain'
      ? 'Your first message may have started a chat, but we couldn’t confirm it. Starting again could create a second one.'
      : '');
    this.status.hidden = !status;
    this.status.textContent = status || '';
    this.actions.innerHTML = '';
    const action = (label, fn, quiet) => {
      const b = $('button', `gc-btn${quiet ? ' gc-quiet' : ''}`, { type: 'button', text: label });
      b.disabled = s.busy;
      b.addEventListener('click', fn);
      this.actions.append(b);
    };
    if (s.phase === 'ended' || s.phase === 'uncertain') action('Start a new chat', () => this.newChat());
    if (s.phase === 'unavailable') action('Check again', () => this.client.retry(), true);
    if (s.pending && !s.busy && s.phase === 'active' && s.error) action('Retry message', () => this.client.send(), true);
    if (s.phase === 'active' && s.connection === 'offline' && !s.pending) action('Reconnect', () => this.client.retry(), true);
    this.actions.hidden = !this.actions.children.length;

    this.email.hidden = !(s.followupOffered && s.phase === 'active');
    this.notice.hidden = !s.notice;
    this.notice.textContent = s.notice;
    const powered = safeUrl(s.poweredByUrl);
    this.attribution.hidden = !powered;
    if (powered) this.attribution.href = powered;

    // The visitor's bubble.
    const canCompose = s.phase === 'available' || s.phase === 'active';
    this.compose.hidden = !canCompose;
    if (canCompose && document.activeElement !== this.input && !this.listening && this.input.value !== s.draft && !s.pending) {
      this.input.value = s.draft;
      this.autosize();
    }
    this.send.disabled = s.busy || Boolean(s.pending);
    this.mic.disabled = s.busy || Boolean(s.pending);
    this.renderMenu();
  }

  renderLog() {
    const s = this.state;
    const items = [];
    // Local lines (greeting, apologies) until the real transcript takes over.
    const hasTranscript = s.messages.some(isVisible);
    for (const line of this.localLines ?? []) {
      if (line.id === 'greeting' && hasTranscript) continue;
      if (line.id === 'unavailable' && s.phase !== 'unavailable') continue;
      items.push({ key: line.id, from: 'gilly', text: line.text });
    }
    for (const m of s.messages) {
      if (!isVisible(m)) continue;
      if (m.type === 'text' || m.type === 'standin-idle-prompt') {
        items.push({ key: m.messageId, from: m.senderType === 'visitor' ? 'visitor' : 'gilly', text: m.body, human: m.senderType === 'rep' });
      } else if (m.type === 'link-card') {
        const card = parseCard(m.body);
        const url = safeUrl(card?.url);
        if (url) items.push({ key: m.messageId, link: { url, title: text(card.title) || url, description: text(card.description), id: m.messageId } });
      } else if (m.type === 'system-card') {
        const card = parseCard(m.body);
        const template = card && CARD_NOTES[card.cardType];
        if (template) items.push({ key: m.messageId, note: template.replace('{repName}', text(card.repName) || 'Someone') });
      }
    }
    if (s.pending && s.pending.clientMessageId !== 'initial' || (s.pending && s.busy)) {
      items.push({ key: `pending-${s.pending.clientMessageId}`, from: 'visitor', text: s.pending.body, state: s.busy ? 'sending' : 'failed' });
    }
    if ((s.typing || s.pending) && s.phase === 'active' && !this.speaking) items.push({ key: 'typing', typing: true });
    if (s.phase === 'loading' && !items.length) items.push({ key: 'typing', typing: true });

    // Keyed update: keep existing nodes so scrolling and the highlight don't jump.
    const existing = new Map([...this.log.children].map((el) => [el.dataset.key, el]));
    const nodes = items.map((item, i) => {
      let el = existing.get(item.key);
      const sig = JSON.stringify(item) + (i === items.length - 1);
      if (!el || el.dataset.sig !== sig) {
        const fresh = this.renderItem(item);
        fresh.dataset.key = item.key;
        fresh.dataset.sig = sig;
        el = fresh;
      }
      return el;
    });
    this.log.replaceChildren(...nodes);
    // Older Gilly lines step back so the current one reads as "the" bubble.
    const gillyLines = nodes.filter((n) => n.dataset.from === 'gilly');
    gillyLines.forEach((n, i) => n.toggleAttribute('data-old', i < gillyLines.length - 1 && gillyLines.length > 1));
    this.renderSpeaking();
    this.keepInView();
  }

  renderItem(item) {
    if (item.typing) {
      const el = $('div', 'gc-msg', { 'data-from': 'gilly', 'aria-label': 'Gilly is thinking' });
      el.innerHTML = '<span class="gc-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
      return el;
    }
    if (item.note) return $('div', 'gc-note', { text: item.note });
    if (item.link) {
      const a = $('a', 'gc-link', { href: item.link.url, target: '_blank', rel: 'noopener noreferrer' });
      a.append($('strong', '', { text: item.link.title }));
      if (item.link.description) a.append($('span', '', { text: item.link.description }));
      a.addEventListener('click', () => this.client.trackLinkClick(item.link.id, item.link.url));
      return a;
    }
    const el = $('div', 'gc-msg', { 'data-from': item.from });
    if (item.state) el.dataset.state = item.state;
    if (item.human) el.append($('span', 'gc-from', { text: `${this.state.host.name || 'Team'} · person` }));
    const said = $('span', 'gc-said');
    const ahead = $('span', 'gc-ahead');
    said.textContent = item.text;
    el.append(said, ahead);
    if (item.from === 'visitor') el.prepend($('span', 'gc-sr', { text: 'You: ' }));
    return el;
  }

  // The line being spoken: said words solid, the rest faded until Gilly gets there.
  renderSpeaking() {
    const sp = this.speaking;
    const el = sp ? this.log.querySelector(`[data-key="${CSS.escape(sp.id)}"]`) : null;
    let cut = 0;
    if (el) {
      // Reveal whole words.
      cut = Math.min(sp.text.length, sp.char);
      const next = sp.text.slice(cut).search(/\s/);
      cut = next < 0 ? sp.text.length : cut + next;
      // This runs every frame while Gilly talks: touch the DOM only when a word appears.
      if (el === this.spokenEl && cut === this.spokenCut) return;
    }
    for (const old of this.log.querySelectorAll('.gc-msg[data-speaking]')) {
      if (old === el) continue;
      old.removeAttribute('data-speaking');
      const said = old.querySelector('.gc-said');
      const ahead = old.querySelector('.gc-ahead');
      if (said && ahead) {
        said.textContent += ahead.textContent;
        ahead.textContent = '';
      }
    }
    this.spokenEl = el;
    this.spokenCut = cut;
    if (!el) return;
    el.setAttribute('data-speaking', '');
    el.querySelector('.gc-said').textContent = sp.text.slice(0, cut);
    el.querySelector('.gc-ahead').textContent = sp.text.slice(cut);
    this.keepInView();
  }

  renderMenu() {
    const s = this.state;
    this.menu.innerHTML = '';
    const item = (icon, label, fn, cls = '') => {
      const b = $('button', cls, { type: 'button', role: 'menuitem', html: ICONS[icon] });
      b.append(document.createTextNode(label));
      b.addEventListener('click', () => {
        this.toggleMenu(false);
        fn();
      });
      this.menu.append(b);
    };
    if (this.voice.supported) item(this.voice.muted ? 'speaker' : 'muted', this.voice.muted ? 'Turn voice on' : 'Turn voice off', () => this.toggleMute());
    const arItem = this.ar?.menuItem?.({ usdz: asset('gilly.usdz'), poster: asset('gilly.png') });
    if (arItem) {
      arItem.setAttribute('role', 'menuitem');
      arItem.insertAdjacentHTML('afterbegin', ICONS.cube);
      this.menu.append(arItem);
    }
    if (s.phase === 'active') item('end', 'End chat', () => this.client.end(), 'gc-danger');
    if (s.phase === 'ended' || s.phase === 'uncertain') item('refresh', 'Start a new chat', () => this.newChat());
  }

  toggleMenu(show = this.menu.hidden) {
    this.menu.hidden = !show;
    this.moreBtn.setAttribute('aria-expanded', String(show));
    if (show) this.menu.querySelector('button, a')?.focus();
  }

  async newChat() {
    this.localLines = [];
    this.greeting = '';
    remember('gilly-greeting', '');
    await this.client.newChat();
    if (this.open && this.state.phase === 'available') {
      this.greeting = WELCOME_BACK;
      remember('gilly-greeting', this.greeting);
      this.gilly?.perform('wave');
      this.say({ id: 'greeting', text: this.greeting, local: true });
    }
  }

  scrollToEnd() {
    this.follow = true;
    this.keepInView(true);
  }

  // Scrolls down to the newest message. A reply too long for the log shows from
  // its first line, then scrolls along with the words as Gilly reads them out.
  // Unless asked to jump, it only ever scrolls down, so it never fights the visitor.
  keepInView(jump = false) {
    const log = this.log;
    if (!this.follow || !log.clientHeight) return;
    const end = log.scrollHeight - log.clientHeight;
    let goal = end;
    const el = this.speaking && log.querySelector(`[data-key="${CSS.escape(this.speaking.id)}"][data-speaking]`);
    if (el) {
      const box = log.getBoundingClientRect();
      const top = el.getBoundingClientRect().top - box.top + log.scrollTop;
      const said = el.querySelector('.gc-said').getBoundingClientRect();
      const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
      // Bottom of the line being spoken, plus the next line.
      const reading = (said.height ? said.bottom - box.top + log.scrollTop : top + line) + line;
      goal = Math.min(end, Math.max(top - 18, reading - log.clientHeight + 12));
    }
    if (jump || goal > log.scrollTop + 1) log.scrollTop = goal;
  }

  // --- Layout: follow Gilly around -----------------------------------------------------------------

  layout() {
    const g = this.gilly;
    // The click target covers Gilly.
    const b = g?.bounds?.() ?? this.posterBounds();
    if (b) {
      const pad = 10;
      Object.assign(this.hit.style, {
        left: `${b.x - pad}px`, top: `${b.y - pad}px`, width: `${b.w + pad * 2}px`, height: `${b.h + pad * 2}px`,
      });
    }
    const mouth = g?.anchor?.() ?? (b && { x: b.x + b.w * 0.45, y: b.y + b.h * 0.42 });
    // The bubble's tail points at Gilly's mouth.
    if (this.open && mouth && !phone.matches) {
      const r = this.bubble.getBoundingClientRect();
      const y = Math.max(34, Math.min(r.height - 30, mouth.y - r.top));
      this.bubble.style.setProperty('--gc-tail-y', `${y}px`);
    }
    // On phones Gilly perches on top of the chat sheet: the stage's floor sits a
    // little below the sheet's top edge, so floating Gilly's toes just touch it.
    if (phone.matches && this.open) {
      const h = this.panel.getBoundingClientRect().height;
      this.root.style.setProperty('--gc-perch', `${Math.max(0, h - 12)}px`);
    }
    if (!this.hint.hidden && mouth) {
      const hr = this.hint.getBoundingClientRect();
      this.hint.style.left = `${Math.max(8, mouth.x - hr.width - 70)}px`;
      this.hint.style.top = `${Math.max(8, mouth.y - hr.height - 30)}px`;
    }
    if (!this.badge.hidden && b) {
      this.badge.style.left = `${b.x + b.w * 0.78}px`;
      this.badge.style.top = `${b.y + b.h * 0.08}px`;
    }
  }

  posterBounds() {
    const r = this.poster.isConnected ? this.poster.getBoundingClientRect() : this.stage.getBoundingClientRect();
    return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  }

  bindPage() {
    const relayout = () => {
      if (this.mascot) this.mascot.layout = { ...this.mascot.layout, ...this.stageLayout() };
      this.layout();
    };
    addEventListener('resize', relayout);
    phone.addEventListener?.('change', relayout);
    // Keep the chat above the on-screen keyboard. Browsers either cover the bottom
    // of the page with it (keyboard > 0) or, like iOS Safari, scroll the page up
    // under it; either way the chat fits in what's visible.
    const vv = window.visualViewport;
    if (vv) {
      const onViewport = () => {
        const zoomed = vv.scale > 1.01;
        const keyboard = zoomed ? 0 : Math.max(0, innerHeight - vv.height - vv.offsetTop);
        this.root.style.setProperty('--gc-keyboard', `${keyboard > 80 ? keyboard : 0}px`);
        this.root.style.setProperty('--gc-view-h', zoomed ? '100dvh' : `${vv.height}px`);
        this.root.toggleAttribute('data-keyboard', !zoomed && innerHeight - vv.height > 120);
      };
      vv.addEventListener('resize', onViewport);
      vv.addEventListener('scroll', onViewport);
      onViewport();
    }
    // Gilly's eyes follow the pointer while the chat is open or you're close.
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.pointer = { x: e.clientX, y: e.clientY };
      this.gilly?.pointer(this.pointer);
      // Gilly notices a pointer coming close, and loses interest when it leaves.
      const b = this.gilly?.bounds?.();
      if (!b) return;
      const dx = e.clientX - (b.x + b.w / 2);
      const dy = e.clientY - (b.y + b.h / 2);
      const near = Math.hypot(dx, dy) < Math.max(b.w, b.h) * 0.5 + 110;
      if (near !== this.near) {
        this.near = near;
        clearTimeout(this.nearTimer);
        if (near) this.setHover(true);
        else this.nearTimer = setTimeout(() => this.setHover(false), 1200);
      }
    }, { passive: true });
    if (!this.gilly) {
      // Without 3D, keep the hit target on the picture.
      const tick = () => {
        if (!this.gilly) {
          this.layout();
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.voice.cancel();
    });
  }

  // Little effects in the page around Gilly: bubbles, and z's while dozing.
  spawnBubble({ size = 1 } = {}) {
    if (reducedMotion.matches || !this.gilly) return;
    const m = this.gilly.anchor();
    const b = $('i', 'gc-fx-bubble');
    const s = Math.round(9 + 10 * size);
    b.style.cssText = `left:${m.x - s / 2}px;top:${m.y - s / 2}px;--s:${s}px;--dx:${Math.round(-10 + Math.random() * 20)}px`;
    this.fx.append(b);
    b.addEventListener('animationend', () => b.remove());
  }

  snore(on) {
    clearInterval(this.snoreTimer);
    if (!on || reducedMotion.matches) return;
    const puff = () => {
      if (!this.gilly || this.open) return;
      const b = this.gilly.bounds();
      const z = $('i', 'gc-fx-z', { text: 'z' });
      z.style.cssText = `left:${b.x + b.w * 0.62}px;top:${b.y + b.h * 0.12}px;font-size:${14 + Math.random() * 8}px`;
      this.fx.append(z);
      z.addEventListener('animationend', () => z.remove());
    };
    puff();
    this.snoreTimer = setInterval(puff, 1100);
  }
}

const UNAVAILABLE = 'Oh no, everyone’s busy feeding the otters right now! Try again in a little bit?';

function webglGilly(mascot, director) {
  let lastPointer = 0;
  // Page elements become look targets: a point in front of Gilly, toward them.
  const toward = (el) => el && (() => {
    const r = el.getBoundingClientRect();
    return mascot.pagePointToWorld(r.left + r.width * 0.5, r.top + r.height * 0.45, 0.5);
  });
  return {
    setState: (state, { lookAt, ...opts } = {}) => director.setState(state, { ...opts, element: lookAt?.className, look: toward(lookAt) }),
    perform: (name, opts) => director.perform(name, opts),
    attention: () => director.attention(),
    mouth: ([open, wide, round]) => mascot.setMouth({ Open: open, Wide: wide, Round: round }),
    anchor: () => mascot.anchor('mouth'),
    bounds: () => mascot.bounds(),
    pointer: (p) => {
      director.g.cursor = p;
      lastPointer = performance.now();
    },
    get pointerRecent() {
      return performance.now() - lastPointer < 3000;
    },
  };
}

function isSpeech(m) {
  return (m.type === 'text' || m.type === 'standin-idle-prompt') && m.senderType !== 'system-prompt';
}

function isVisible(m) {
  return m.type !== 'system-prompt' && m.senderType !== 'system-prompt';
}

function parseCard(body) {
  try {
    const card = JSON.parse(body);
    return card && typeof card === 'object' && !Array.isArray(card) ? card : null;
  } catch {
    return null;
  }
}

function text(v) {
  return typeof v === 'string' ? v : '';
}

function safeUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => (window.gillyChat = new GillyChat()));
else window.gillyChat = new GillyChat();
