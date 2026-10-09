// Ada, standing on the page: where she is, what she says in her speech bubble, and the
// dialogue choices under it, adventure-game style. The conversation is Stand Chat.
//
//   stand-client.js  Stand's Visitor API: discovery, session, messages, recovery
//   speech.js        a reply as a timeline of words and mouth shapes; the optional voice
//   stage.js         three.js, light, and Ada via the Bitmagic GDK            (loaded on demand)
//   performer.js     her acting: walking, posture, gaze, face, gestures        (loaded on demand)

import { StandChatClient } from './stand-client.js';
import { buildTimeline, Voice } from './speech.js';

// Stand Chat's shared demo site: answers on any domain, including localhost.
// Use your own Site ID (from Sites in Stand) on your own site.
const SITE_ID = 'demo';

const GREETING = "Hi, I'm Ada. I can walk you through Hollin Air, or answer anything you're wondering about.";
const SUGGESTIONS = [
  'Give me the quick tour of Hollin Air.',
  'Will it work with my old radiators?',
  'How much could I save on oil?',
  'How loud is it, really?',
  'What happens during installation?',
];
const HEIGHT = 1.65; // metres, her height

// The page's sections, by the names Ada uses for them.
const SECTIONS = new Map([...document.querySelectorAll('[data-host-section]')].map((el) => [el.dataset.hostSection.toLowerCase(), el]));

// Private context for whoever answers: the AI Stand-in, or a person on the team. Visitors
// don't see it, but it's in the page, so never put secrets here. Up to 2,000 characters,
// fixed when the conversation starts; what changes (where they are) goes last.
function privateContext() {
  const lines = [
    "You are Ada, the host on Hollin's website: a lifelike 3D person standing on the page who says your replies aloud, in a speech bubble.",
    'Talk like a person in conversation: one to three short sentences, under 55 words, plain text, no lists, markdown, links or emoji.',
    'When a part of the page helps, name it once in double square brackets, exactly as written, and the page scrolls there while you present it: [[How it works]] (how the pump makes heat), [[Savings]] (savings and payback calculator), [[Models]] (sizes and prices), [[Quiet]] (sound levels), [[Installation]] (survey, quote, install), [[FAQ]] (frost, radiators, upkeep, grants).',
    "Example: 'Most family homes suit the Air 9. You can compare all three under [[Models]].' For a tour, cover two or three sections, one sentence each, each with its reference.",
    'Facts: Hollin Air is an air-to-water heat pump for radiators, underfloor heating and hot water. Full heat to −25 °C, with a small electric backup below. Air 6: homes to 120 m², €6,900 installed. Air 9: to 200 m², €8,400. Air 12: to 280 m², €9,900. SCOP up to 5.1. 35 to 39 dB(A) at 3 m. Water up to 65 °C, so most radiators work. R290 refrigerant. Typical saving: about 60% against oil, 65% against direct electric, 45% against gas. Free 30-minute video survey, fixed quote in 48 hours, installed in two days. No yearly service; remote check-up in the app. 7-year warranty.',
    "Hollin is a made-up company in a Stand Chat example; say so if asked. If a fact isn't here, say you're not sure and offer to put them in touch with the team. Don't name real brands.",
  ];
  const estimate = window.hollinEstimate;
  if (estimate) lines.push(`Their calculator shows: ${estimate.fuel}, ${estimate.bill} a year, ${estimate.size}, saving about ${estimate.save}, payback ${estimate.payback}, ${estimate.model}.`);
  const reading = readingSection();
  if (reading) lines.push(`They are looking at "${reading.dataset.hostSection}".`);
  return lines.join(' ').slice(0, 2000);
}

function readingSection() {
  return [...SECTIONS.values()].find((el) => {
    const r = el.getBoundingClientRect();
    return r.top < innerHeight * 0.55 && r.bottom > innerHeight * 0.45;
  });
}

const CARD_NOTES = {
  handoff: '{repName} from the Hollin team joined.',
  'human-transfer': 'A person from the team is taking it from here.',
  'standin-takeover': 'Ada is answering again.',
  'session-end': 'The chat ended.',
  'rep-followup-offer': 'The team can follow up by email.',
  'rep-followup-confirmation': 'Your follow-up request was received.',
};

const ICONS = {
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="m16 9.5 5 5m0-5-5 5"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  log: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9"/></svg>',
};

const storage = (kind) => { try { return window[kind]; } catch { return undefined; } };
const session = storage('sessionStorage');
const local = storage('localStorage');
const get = (store, key) => { try { return store?.getItem(key) ?? null; } catch { return null; } };
const set = (store, key, value) => { try { store?.setItem(key, value); } catch { /* memory only */ } };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const phone = matchMedia('(max-width: 720px)');
const saveData = navigator.connection?.saveData === true;

// "Text with [[Section]] references" → plain text for speech, and where each reference sits.
function parseReply(body) {
  const refs = [];
  let plain = '';
  let last = 0;
  for (const m of body.matchAll(/\[\[([^\]]{1,40})\]\]/g)) {
    plain += body.slice(last, m.index);
    const name = m[1].trim();
    refs.push({ index: plain.length, length: name.length, name, el: SECTIONS.get(name.toLowerCase()) ?? null });
    plain += name;
    last = m.index + m[0].length;
  }
  plain += body.slice(last);
  return { plain: plain.replace(/\s+/g, ' ').trim(), refs };
}

// A clock for a performance: wall time, nudged onto the voice's word boundaries when it speaks.
class Clock {
  constructor() { this.t0 = performance.now(); this.base = 0; this.paused = false; }
  now() { return this.paused ? this.base : this.base + (performance.now() - this.t0) / 1000; }
  sync(t) { this.base = t; this.t0 = performance.now(); }
  hold() { this.base = this.now(); this.paused = true; }
  resume() { this.t0 = performance.now(); this.paused = false; }
}

class Host {
  constructor(root) {
    this.root = root;
    const $ = (sel) => root.querySelector(sel);
    this.figure = $('.ada-figure');
    this.hit = $('.ada-hit');
    this.bubble = $('.ada-bubble');
    this.bubbleText = $('.ada-bubble-text');
    this.you = $('.ada-you');
    this.panel = $('.ada-panel');
    this.pill = $('.ada-pill');
    this.log = $('.ada-log');
    this.live = $('.ada-live');
    this.choices = $('.ada-choices');
    this.form = $('.ada-form');
    this.input = $('#ada-input');
    this.sendBtn = $('.ada-send');
    this.voiceBtn = $('.ada-voice');
    this.logBtn = $('.ada-log-toggle');
    this.closeBtn = $('.ada-close');
    this.who = $('.ada-who');
    this.powered = $('.ada-powered');

    this.voice = new Voice();
    this.voiceOn = get(local, 'lifelike-host:voice') === 'on' && this.voice.supported;
    this.greeting = get(session, 'lifelike-host:greeting') || '';
    this.spoken = new Set(JSON.parse(get(session, 'lifelike-host:spoken') || '[]'));
    this.queue = [];
    this.performance = null;
    this.stage = null;
    this.engaged = false;
    this.asked = new Set();
    this.firstState = true;
    this.away = false; // walked off while the explainer is in view
    this.layout = null;

    this.client = new StandChatClient({
      siteId: SITE_ID,
      storage: session,
      context: () => ({
        prompt: privateContext(),
        // Keep the greeting Ada said in the transcript, so the team sees it too.
        includeOpeningGreeting: Boolean(this.greeting),
        openingMessage: this.greeting || undefined,
      }),
    });

    this.bubbleSize = { width: 300, height: 60 };
    new ResizeObserver(() => { this.bubbleSize = { width: this.bubble.offsetWidth, height: this.bubble.offsetHeight }; }).observe(this.bubble);

    this.#wire();
    this.setEngaged(false, { quiet: true });
    this.#place();
    this.client.subscribe((s) => this.#onState(s));
    this.client.mount();
    // Phones and Data Saver start with her picture; the 3D Ada comes when you talk to her.
    if (!phone.matches && !saveData) this.#loadStageSoon();
  }

  // ---- Wiring ------------------------------------------------------------------------------

  #wire() {
    this.sendBtn.innerHTML = ICONS.send;
    this.closeBtn.innerHTML = ICONS.close;
    this.logBtn.innerHTML = ICONS.log;
    this.#renderVoice();
    this.voiceBtn.addEventListener('click', () => this.#toggleVoice());
    this.closeBtn.addEventListener('click', () => this.setEngaged(false));
    this.logBtn.addEventListener('click', () => {
      const open = this.panel.classList.toggle('show-log');
      this.logBtn.setAttribute('aria-pressed', String(open));
      if (open) this.log.scrollTop = this.log.scrollHeight;
      this.#measure();
    });
    this.pill.addEventListener('click', () => this.setEngaged(true, { focus: true }));
    this.hit.addEventListener('click', () => this.setEngaged(true, { focus: true }));
    this.root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.engaged) this.setEngaged(false); });

    this.form.addEventListener('submit', (e) => { e.preventDefault(); this.#send(this.input.value); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.#send(this.input.value); }
    });
    this.input.addEventListener('input', () => {
      this.#autosize();
      this.client.setDraft(this.input.value);
      this.#renderSendable();
      // She turns to you and leans in while you type, and relaxes when you pause.
      if (this.performance || !this.performer) return;
      if (this.input.value.trim()) {
        this.performer.face(0);
        this.performer.setMode('listening');
        clearTimeout(this.typingTimer);
        this.typingTimer = setTimeout(() => this.performer?.setMode('attentive'), 1800);
      }
    });
    this.input.addEventListener('focus', () => {
      if (this.performance || this.client.state.typing) return;
      this.performer?.face(0);
      this.performer?.setMode('attentive');
    });

    document.addEventListener('click', (e) => {
      const ask = e.target.closest('[data-ask]');
      if (ask) { e.preventDefault(); this.setEngaged(true); this.#send(ask.dataset.ask); }
      const ref = e.target.closest('[data-host-ref]');
      if (ref) { e.preventDefault(); this.#show(SECTIONS.get(ref.dataset.hostRef), { force: true }); }
    });

    // Her glances follow your pointer; your own scrolling keeps her from scrolling the page.
    let raf = 0;
    document.addEventListener('pointermove', (e) => {
      if (raf || e.pointerType === 'touch') return;
      raf = requestAnimationFrame(() => { raf = 0; this.stage?.setCursor(e.clientX, e.clientY); });
    }, { passive: true });
    document.addEventListener('pointerleave', () => this.stage?.setCursor(null));
    addEventListener('wheel', () => { this.userScroll = performance.now(); }, { passive: true });
    addEventListener('touchmove', () => { this.userScroll = performance.now(); }, { passive: true });
    addEventListener('resize', () => { this.#measure(); this.#place(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.voice.cancel(); });

    // She steps off the page while you read how the example works, and comes back after.
    const explainer = document.getElementById('how-it-works');
    if (explainer) {
      new IntersectionObserver(([e]) => this.#setAway(e.isIntersecting), { rootMargin: '0px 0px -50% 0px' }).observe(explainer);
    }
  }

  setEngaged(engaged, { focus = false, quiet = false } = {}) {
    this.engaged = engaged;
    this.root.classList.toggle('is-engaged', engaged);
    this.panel.setAttribute('aria-hidden', String(!engaged));
    this.panel.inert = !engaged;
    this.#measure();
    if (quiet) return;
    if (engaged) {
      this.#loadStage();
      if (focus) setTimeout(() => this.input.focus({ preventScroll: true }), 200);
      if (!this.performance) { this.performer?.face(0); this.performer?.setMode('attentive'); }
      this.#maybeGreet();
    } else {
      this.pill.focus({ preventScroll: true });
      if (!this.performance) this.performer?.setMode('idle');
      clearTimeout(this.homeTimer);
      this.homeTimer = setTimeout(() => { if (!this.performance && !this.engaged) this.#walkHome(); }, 900);
    }
  }

  // ---- Where she stands -----------------------------------------------------------------------

  // Sizes for this window: how tall she is on screen, where "home" is, where the floor is.
  #measure() {
    const vw = document.documentElement.clientWidth, vh = innerHeight;
    const small = phone.matches;
    const figure = small ? clamp(vh * 0.3, 190, 260) : clamp(vh * 0.44, 300, 440);
    const ppm = figure / HEIGHT;
    const content = document.querySelector('.hl-site main')?.getBoundingClientRect();
    const right = content ? Math.min(vw, content.right) : vw;
    const margin = vw - right;
    // Home: the middle of the right-hand margin when there is room, otherwise just inside the edge.
    const home = margin > 0.9 * ppm ? right + margin / 2 : vw - 0.42 * ppm;
    // On a phone she stands on the dialogue panel when it's open.
    const floor = this.engaged && small ? this.panel.getBoundingClientRect().height + 6 : small ? 8 : 14;
    const prev = this.layout;
    this.layout = { vw, vh, ppm, home, floor, small, contentRight: right, width: ppm * 1.2, height: ppm * 1.98 };
    this.figure.style.width = `${this.layout.width}px`;
    this.figure.style.height = `${this.layout.height}px`;
    this.root.style.setProperty('--ada-home', `${vw - home}px`);
    this.root.style.setProperty('--ada-ppm', `${ppm}px`);
    // Keep her where she was on screen when the window changes size.
    if (this.performer && prev && prev.ppm !== ppm) this.performer.x *= prev.ppm / ppm;
  }

  // Move her canvas to where she is on the floor, and the bubble and click target with her.
  #place() {
    const L = this.layout;
    if (!L) return;
    const x = this.performer ? this.performer.x * L.ppm : L.home;
    const left = x - L.width / 2;
    const top = L.vh - L.floor - (1.9 * L.ppm);
    if (Math.abs(left - this.lastLeft) > 0.25 || Math.abs(top - this.lastTop) > 0.25 || this.lastLeft === undefined) {
      this.figure.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      this.lastLeft = left; this.lastTop = top;
    }
    // Head and body on screen: from the 3D when she's live, from proportions otherwise.
    let crownY, headX, floorY;
    if (this.stage) {
      const m = this.stage.landmarks();
      crownY = m.crown.y; headX = m.head.x; floorY = m.floor.y;
    } else {
      floorY = L.vh - L.floor; crownY = floorY - (HEIGHT + 0.08) * L.ppm; headX = x;
    }
    this.hit.style.transform = `translate3d(${headX - 0.2 * L.ppm}px, ${crownY}px, 0)`;
    this.hit.style.width = `${0.4 * L.ppm}px`;
    this.hit.style.height = `${Math.max(40, floorY - crownY)}px`;
    // The bubble opens away from the nearer edge, its tail on her head.
    const { width: bw, height: bh } = this.bubbleSize;
    const toLeft = headX > L.vw / 2;
    const bx = clamp(toLeft ? headX - bw + 48 : headX - 48, 12, L.vw - bw - 12);
    const by = Math.max(bh + 12, crownY - 10);
    this.bubble.style.transform = `translate3d(${bx}px, ${by}px, 0) translateY(-100%)`;
    this.bubble.style.setProperty('--tail', `${clamp(headX - bx, 24, bw - 24)}px`);
  }

  #walkHome() {
    if (!this.performer || this.away) return;
    this.performer.walkTo(this.layout.home / this.layout.ppm, 0);
  }

  #setAway(away) {
    if (away === this.away) return;
    this.away = away;
    this.root.classList.toggle('is-away', away);
    if (!this.performer) return;
    if (away) {
      this.voice.cancel();
      this.performer.walkTo((this.layout.vw + this.layout.width) / this.layout.ppm, 0);
    } else this.#walkHome();
  }

  // Now and then, when nothing is going on, she takes a few steps and settles again.
  #stroll() {
    clearTimeout(this.strollTimer);
    this.strollTimer = setTimeout(() => {
      this.#stroll();
      const p = this.performer;
      if (!p || reducedMotion.matches || this.away || this.performance || this.engaged || p.walking || this.layout.small) return;
      const L = this.layout;
      const home = L.home / L.ppm;
      if (Math.abs(p.x - home) < 0.15) {
        const to = home + rand(0.35, 0.8) * (Math.random() < 0.7 ? -1 : 1);
        p.walkTo(clamp(to, 0.45, L.vw / L.ppm - 0.45), Math.random() < 0.5 ? -0.35 : 0);
        p.look('page', { hold: rand(1.5, 3) });
      } else p.walkTo(home, 0);
    }, rand(14000, 26000));
  }

  // ---- The 3D stage -----------------------------------------------------------------------------

  #loadStageSoon() {
    const go = () => this.#loadStage();
    if (document.readyState === 'complete') (window.requestIdleCallback ?? setTimeout)(go, { timeout: 1500 });
    else addEventListener('load', () => (window.requestIdleCallback ?? setTimeout)(go, { timeout: 1500 }), { once: true });
  }

  async #loadStage() {
    if (this.stagePromise) return this.stagePromise;
    this.root.classList.add('is-loading');
    this.stagePromise = (async () => {
      try {
        const { Stage } = await import('./stage.js');
        const stage = new Stage(this.figure);
        await stage.load();
        this.stage = stage;
        const p = stage.performer;
        p.reduced = reducedMotion.matches;
        stage.setShot('figure', { snap: true });
        // First visit: she walks in from the right. Later visits: she's already here.
        const L = this.layout;
        const firstTime = !get(session, 'lifelike-host:arrived') && !reducedMotion.matches;
        set(session, 'lifelike-host:arrived', '1');
        p.x = firstTime || this.away ? (L.vw + L.width * 0.6) / L.ppm : L.home / L.ppm;
        if (!this.away) this.#walkHome();
        stage.onFrame = () => this.#place();
        this.#anchorPage();
        this.root.classList.add('is-live');
        this.#stroll();
        this.#maybeGreet();
        this.#next();
      } catch (error) {
        console.warn('Ada could not load in 3D; the chat still works.', error);
      } finally {
        this.root.classList.remove('is-loading');
      }
    })();
    return this.stagePromise;
  }

  get performer() { return this.stage?.performer ?? null; }

  // Back to her resting behaviour.
  #settle() {
    const p = this.performer;
    if (this.performance || !p) return;
    const s = this.client.state;
    if (s.typing && s.host.kind !== 'rep') p.setMode('thinking');
    else if (this.engaged) p.setMode('attentive');
    else p.setMode('idle');
  }

  // Where "the page" is, from her point of view.
  #anchorPage(el = null) {
    if (!this.stage) return;
    const r = el?.getBoundingClientRect();
    const x = r ? Math.min(r.left + r.width / 2, this.layout.contentRight - 80) : this.layout.contentRight / 2;
    const y = r ? clamp(r.top + Math.min(r.height, innerHeight) / 2, 80, innerHeight - 80) : innerHeight * 0.45;
    this.stage.setPageAnchor(x, y);
  }

  #maybeGreet() {
    if (this.greeted || !this.stage || this.client.state.messages.length || this.client.hasSession || this.away) return;
    if (!['available', 'loading'].includes(this.client.state.phase)) return;
    this.greeted = true;
    const already = Boolean(this.greeting);
    this.greeting = GREETING;
    set(session, 'lifelike-host:greeting', GREETING);
    // Once per visit she says hello when she has arrived; after that, a small wave.
    const hello = () => {
      if (this.performance || this.client.state.messages.length) return;
      if (this.performer.moving) return void setTimeout(hello, 200);
      this.performer.gesture('wave', { side: 'l' });
      if (!already) setTimeout(() => this.#perform({ id: 'greeting', body: GREETING, local: true }), 700);
    };
    setTimeout(hello, 500);
  }

  // ---- Stand state --------------------------------------------------------------------------

  #onState(s) {
    this.root.dataset.phase = s.phase;
    this.#renderLog(s);
    this.#renderChoices(s);
    this.#renderSendable();
    this.#renderFine(s);

    // Replies that arrived before this page load are history: shown, not performed.
    const replies = s.messages.filter((m) => m.senderType === 'standin' && m.type === 'text');
    if (this.firstState) {
      for (const m of replies) this.spoken.add(m.messageId);
      for (const m of s.messages) if (m.senderType === 'rep') this.spoken.add(m.messageId);
      this.firstState = false;
    }
    for (const m of replies) {
      if (this.spoken.has(m.messageId)) continue;
      this.spoken.add(m.messageId);
      // The greeting she already said comes back as the session's first message: not again.
      if (this.greeting && m.body.trim() === this.greeting) continue;
      this.queue.push({ id: m.messageId, body: m.body });
      this.#announce(`Ada: ${parseReply(m.body).plain}`);
    }
    // A person on the team speaks for themselves, in the panel; Ada listens with you.
    for (const m of s.messages) {
      if (m.senderType !== 'rep' || this.spoken.has(m.messageId)) continue;
      this.spoken.add(m.messageId);
      this.#announce(`${s.host.name || 'The Hollin team'}: ${m.body}`);
      this.performer?.gesture('acknowledge');
      this.#bubbleNote(`${s.host.name || 'Someone from the team'} answered you below.`);
      if (!this.engaged) this.setEngaged(true);
      this.panel.classList.add('show-log');
    }
    set(session, 'lifelike-host:spoken', JSON.stringify([...this.spoken].slice(-200)));

    if (s.typing && !this.performance && !this.queue.length) {
      if (s.host.kind === 'rep') this.#bubbleNote(`${s.host.name} is typing…`);
      else { this.performer?.setMode('thinking'); this.#bubbleThinking(); }
    } else if (!s.typing && !this.performance && this.bubble.dataset.note === 'thinking') {
      this.#hideBubble();
    }
    if (s.phase === 'available' || s.phase === 'loading') this.#maybeGreet();
    if (this.waiting && ['available', 'active'].includes(s.phase) && !s.busy) queueMicrotask(() => this.waiting && this.#send(this.waiting));
    this.#next();
    if (!s.typing) this.#settle();
  }

  #send(text) {
    const body = text.trim();
    if (!body || this.client.state.busy) return;
    const phase = this.client.state.phase;
    if (!['available', 'active'].includes(phase)) {
      // Still finding who can answer: hold the question and send it as soon as someone can.
      if (phase === 'loading' || phase === 'ended') {
        this.waiting = body;
        this.input.value = body;
        this.#autosize();
        if (phase === 'ended') this.client.newChat();
      }
      return;
    }
    this.waiting = null;
    this.asked.add(body);
    // A fresh question interrupts whatever she was saying.
    this.#stopPerformance();
    this.queue = [];
    this.client.setDraft(body);
    this.client.send();
    this.input.value = '';
    this.#autosize();
    this.#youSaid(body);
    const p = this.performer;
    if (p) { p.face(0); p.gesture('acknowledge'); }
    setTimeout(() => { if (!this.performance) { this.performer?.setMode('thinking'); this.#bubbleThinking(); } }, 650);
  }

  // ---- Performing a reply ------------------------------------------------------------------

  #next() {
    if (this.performance || !this.queue.length || !this.stage) return;
    this.#perform(this.queue.shift());
  }

  #perform(message) {
    const { plain, refs } = parseReply(message.body);
    const timeline = buildTimeline(plain, { refs });
    const clock = new Clock();
    const perf = { message, timeline, refs, clock, shown: new Set() };
    this.performance = perf;
    clearTimeout(this.homeTimer);
    this.#renderBubble(perf);

    // Voice, when it's on: the clock follows the words it reports.
    if (this.voiceOn && !document.hidden) {
      clock.hold();
      let started = false;
      const fallback = setTimeout(() => { if (!started) { started = true; clock.resume(); } }, 1200);
      this.voice.speak(timeline, {
        onStart: () => { if (!started) { started = true; clearTimeout(fallback); clock.sync(timeline.words[0]?.start ?? 0); clock.resume(); } },
        onWord: (i) => { const w = timeline.words[i]; if (w && Math.abs(clock.now() - w.start) > 0.08) clock.sync(w.start); },
      }).then(() => { if (this.performance === perf) clock.sync(Math.max(clock.now(), timeline.duration)); });
    }

    this.performer.say(timeline, () => clock.now());
    const tick = () => {
      if (this.performance !== perf) return;
      const t = clock.now();
      this.#followBubble(perf, t);
      for (const ref of refs) {
        if (perf.shown.has(ref) || !ref.el) continue;
        const word = timeline.words.find((w) => w.ref === ref);
        if (word && t >= word.start - 0.45) { perf.shown.add(ref); this.#show(ref.el); }
      }
      if (t > timeline.duration + 0.2) return this.#finishPerformance(perf);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  #finishPerformance(perf) {
    if (this.performance !== perf) return;
    this.#followBubble(perf, Infinity);
    this.performance = null;
    this.performer?.stopSpeaking();
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => { if (!this.performance) this.#hideBubble(); }, 6500);
    // If she went to show something, she wanders back after a moment, unless you're still
    // talking: then she stays where she is, beside the panel.
    this.homeTimer = setTimeout(() => { if (!this.performance && !this.engaged) this.#walkHome(); }, 3500);
    this.#settle();
    setTimeout(() => this.#next(), 450);
  }

  #stopPerformance() {
    if (!this.performance) return;
    this.voice.cancel();
    const perf = this.performance;
    this.performance = null;
    this.#followBubble(perf, Infinity);
    this.performer?.stopSpeaking();
  }

  // Scroll the page to a section she mentions, glow it, and step over to present it.
  #show(el, { force = false } = {}) {
    if (!el) return;
    el.dataset.hostLabel = 'Ada is showing this';
    el.classList.add('is-shown');
    clearTimeout(el.hostTimer);
    el.hostTimer = setTimeout(() => el.classList.remove('is-shown'), 3400);
    const scrolledByHand = performance.now() - (this.userScroll ?? -1e9) < 2500;
    if (force || (!scrolledByHand && !reducedMotion.matches)) {
      el.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    }
    const p = this.performer;
    if (!p) return;
    setTimeout(() => this.#anchorPage(el), 500);
    // She steps toward the content and turns to it: past the dialogue panel when it's open, so
    // it never hides her. On a phone, or with reduced motion, she just turns.
    const L = this.layout;
    const panel = this.engaged ? this.panel.getBoundingClientRect() : null;
    const spotPx = panel ? panel.left - 0.32 * L.ppm : Math.max(L.contentRight - 0.15 * L.ppm, L.home - 0.9 * L.ppm);
    const spot = L.small || reducedMotion.matches ? p.x : clamp(spotPx, 0.45 * L.ppm, L.vw - 0.45 * L.ppm) / L.ppm;
    if (Math.abs(spot - p.x) > 0.2) {
      p.walkTo(spot, -0.45);
      const present = () => {
        if (this.performer !== p) return;
        if (p.moving) return void setTimeout(present, 150);
        p.look('page', { hold: 1.4 });
        p.gesture('present', { hold: 1.8 });
      };
      setTimeout(present, 400);
    } else {
      p.face(-0.45);
      p.look('page', { hold: 1.4 });
      p.gesture('present', { hold: 1.8 });
    }
  }

  // ---- Speech bubble ------------------------------------------------------------------------------

  #renderBubble(perf) {
    clearTimeout(this.bubbleTimer);
    const { timeline, refs } = perf;
    this.bubbleText.replaceChildren();
    delete this.bubble.dataset.note;
    const text = timeline.text;
    const sentences = [];
    let out = null;
    let at = 0;
    // One sentence at a time, the words lighting up as she says them.
    perf.spans = timeline.words.map((w) => {
      if (!sentences[w.sentence]) {
        out = sentences[w.sentence] = document.createElement('span');
        out.className = 'ada-sentence';
        this.bubbleText.append(out);
        at = w.index;
      }
      if (w.index > at) out.append(text.slice(at, w.index));
      // A reference can span several words ("How it works"): each of them links.
      const ref = refs.find((r) => w.index + w.length > r.index && w.index < r.index + r.length);
      let span;
      if (ref && ref.el) {
        span = document.createElement('a');
        span.href = `#${ref.el.id}`;
        span.dataset.hostRef = ref.name.toLowerCase();
      } else span = document.createElement('span');
      span.className = 'w';
      span.textContent = w.text;
      out.append(span);
      at = w.index + w.length;
      return span;
    });
    perf.sentences = sentences;
    perf.sentence = -1;
    this.bubble.classList.add('is-on');
  }

  #followBubble(perf, t) {
    const words = perf.timeline.words;
    let current = 0;
    perf.spans?.forEach((span, i) => {
      const said = words[i].start <= t + 0.05;
      span.classList.toggle('is-said', said);
      if (said) current = words[i].sentence;
    });
    if (current !== perf.sentence && perf.sentences) {
      perf.sentence = current;
      perf.sentences.forEach((el, i) => { el.hidden = i !== current; });
    }
  }

  #bubbleThinking() {
    clearTimeout(this.bubbleTimer);
    const dots = document.createElement('span');
    dots.className = 'ada-dots';
    dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
    this.bubbleText.replaceChildren(dots);
    this.bubble.dataset.note = 'thinking';
    this.bubble.classList.add('is-on');
  }

  #bubbleNote(text) {
    clearTimeout(this.bubbleTimer);
    const p = document.createElement('span');
    p.className = 'ada-note';
    p.textContent = text;
    this.bubbleText.replaceChildren(p);
    this.bubble.dataset.note = 'note';
    this.bubble.classList.add('is-on');
    this.bubbleTimer = setTimeout(() => this.#hideBubble(), 5000);
  }

  #hideBubble() {
    this.bubble.classList.remove('is-on');
    delete this.bubble.dataset.note;
  }

  // What you said, briefly, over the dialogue panel: your line in the scene.
  #youSaid(text) {
    this.you.textContent = text;
    this.you.classList.add('is-on');
    clearTimeout(this.youTimer);
    this.youTimer = setTimeout(() => this.you.classList.remove('is-on'), 2600);
  }

  // Screen readers hear every line, whether or not the panel is open.
  #announce(text) {
    const p = document.createElement('p');
    p.textContent = text;
    this.live.replaceChildren(p);
  }

  // ---- The dialogue panel ----------------------------------------------------------------------

  #renderLog(s) {
    const items = [];
    const greet = this.greeting && (s.messages.length || s.pending);
    if (greet && !s.messages.some((m) => m.body === this.greeting)) items.push({ kind: 'host', body: this.greeting });
    for (const m of s.messages) {
      if (m.type === 'system-card' || m.senderType === 'system-card') {
        try {
          const card = JSON.parse(m.body);
          const note = CARD_NOTES[card.cardType];
          if (note) items.push({ kind: 'note', body: note.replace('{repName}', card.repName || 'Someone') });
        } catch { /* unknown card */ }
        continue;
      }
      if (m.type !== 'text') continue;
      if (m.senderType === 'visitor') items.push({ kind: 'visitor', body: m.body });
      else if (m.senderType === 'standin') items.push({ kind: 'host', body: m.body });
      else if (m.senderType === 'rep') items.push({ kind: 'rep', who: s.host.kind === 'rep' ? s.host.name : 'Hollin team', body: m.body });
    }
    if (s.pending && !s.messages.some((m) => m.clientMessageId === s.pending.clientMessageId)) items.push({ kind: 'visitor', body: s.pending.body, pending: true });
    if (s.phase === 'ended') items.push({ kind: 'note', body: 'This chat has ended.' });
    this.logBtn.hidden = items.length === 0;

    const key = JSON.stringify(items);
    if (key === this.logKey && !s.error) return;
    this.logKey = key;
    this.log.replaceChildren(...items.map((item) => {
      const li = document.createElement('li');
      li.className = `ada-msg ada-msg-${item.kind}${item.pending ? ' is-pending' : ''}`;
      const who = document.createElement('b');
      who.textContent = item.kind === 'visitor' ? 'You' : item.kind === 'host' ? 'Ada' : item.kind === 'rep' ? item.who : '';
      if (who.textContent) li.append(who, ' ');
      if (item.kind === 'host' || item.kind === 'rep') li.append(...this.#withRefs(item.body));
      else li.append(item.body);
      return li;
    }));
    if (s.error) {
      const li = document.createElement('li');
      li.className = 'ada-msg ada-msg-note ada-error';
      li.append(s.error, ' ');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = s.phase === 'ended' ? 'Start a new chat' : 'Try again';
      retry.addEventListener('click', () => (s.phase === 'ended' ? this.client.newChat() : s.pending ? this.client.send() : this.client.retry()));
      li.append(retry);
      this.log.append(li);
      this.panel.classList.add('show-log');
    }
    this.log.scrollTop = this.log.scrollHeight;
  }

  #withRefs(body) {
    const out = [];
    let last = 0;
    for (const m of body.matchAll(/\[\[([^\]]{1,40})\]\]/g)) {
      out.push(body.slice(last, m.index));
      const name = m[1].trim();
      const el = SECTIONS.get(name.toLowerCase());
      if (el) {
        const a = document.createElement('a');
        a.href = `#${el.id}`;
        a.dataset.hostRef = name.toLowerCase();
        a.textContent = name;
        out.push(a);
      } else out.push(name);
      last = m.index + m[0].length;
    }
    out.push(body.slice(last));
    return out;
  }

  // Dialogue choices: real questions sent to Stand, never canned answers.
  #renderChoices(s) {
    const show = ['available', 'active'].includes(s.phase) && !s.busy;
    const list = show ? SUGGESTIONS.filter((q) => !this.asked.has(q) && !s.messages.some((m) => m.body === q)).slice(0, 3) : [];
    const key = s.phase === 'ended' ? 'ended' : list.join('|');
    if (key === this.choicesKey) return;
    this.choicesKey = key;
    const button = (text, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ada-choice';
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    };
    if (s.phase === 'ended') this.choices.replaceChildren(button('Start a new chat', () => this.client.newChat()));
    else this.choices.replaceChildren(...list.map((q) => button(q, () => this.#send(q))));
  }

  #renderSendable() {
    const s = this.client.state;
    const ok = ['available', 'active', 'ended'].includes(s.phase) && !s.busy;
    this.sendBtn.disabled = !ok || !this.input.value.trim();
    this.input.placeholder = s.phase === 'unavailable' ? 'Ada is offline right now' : s.phase === 'loading' ? 'Connecting…' : 'Or say something…';
    this.input.disabled = s.phase === 'unavailable';
  }

  #renderFine(s) {
    this.who.textContent = s.host.kind === 'rep' ? `${s.host.name} from the team is answering` : 'Answers by an AI Stand-in';
    if (s.poweredByUrl) this.powered.href = s.poweredByUrl;
    if (s.notice) this.who.title = s.notice;
  }

  #autosize() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(110, this.input.scrollHeight)}px`;
  }

  #toggleVoice() {
    this.voiceOn = !this.voiceOn && this.voice.supported;
    set(local, 'lifelike-host:voice', this.voiceOn ? 'on' : 'off');
    this.#renderVoice();
    if (!this.voiceOn) this.voice.cancel();
    else if (!this.performance) {
      // A tap is the gesture browsers need before speech; say nothing so it's unlocked.
      try { speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(' '), { volume: 0 })); } catch { /* no speech */ }
    }
  }

  #renderVoice() {
    if (!this.voice.supported) { this.voiceBtn.hidden = true; return; }
    this.voiceBtn.innerHTML = this.voiceOn ? ICONS.speaker : ICONS.muted;
    this.voiceBtn.setAttribute('aria-pressed', String(this.voiceOn));
    const label = this.voiceOn ? "Turn off Ada's voice" : "Turn on Ada's voice";
    this.voiceBtn.setAttribute('aria-label', label);
    this.voiceBtn.title = label;
  }
}

const root = document.getElementById('host');
if (root) window.adaHost = new Host(root);
