// <adventure-chat>: a Stand chat whose UI is a pixel character living on the
// page. Wires together the visitor client (stand-visitor.js), the character
// (character.js), its world (world.js) and the message box (chat-window.js).
//
//   <adventure-chat site-id="YOUR-SITE-ID" world="main" characters="vera otto kai"></adventure-chat>
//   <script type="module" src="adventure-chat.js"></script>
//
// Attributes:
//   site-id     Your Stand site ID ("demo" answers anywhere, with Stand's demo Stand-in).
//   characters  Files in ./characters/, without .js. The first is the fallback.
//   character   One of them, or "random" (the default). ?character=kai overrides.
//   world       CSS selector for the part of the page the character explores.
//   prompt      Private context for whoever answers. Never shown to the visitor.
//   type-to-talk  "off" stops keystrokes on the page from opening the chat.

import { StandVisitor } from './stand-visitor.js';
import { Actor } from './character.js';
import { World, readScene } from './world.js';
import { ChatWindow } from './chat-window.js';
import { ANIMATIONS, FRAME_W, FRAME_H } from './sprite.js';

const FONT = 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400..700&display=swap';
const previewing = new URLSearchParams(location.search).has('preview');

class AdventureChat extends HTMLElement {
  async connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <link rel="stylesheet" href="${new URL('./adventure-chat.css', import.meta.url)}">
      <div class="page-layer"></div>
      <div class="screen-layer"></div>`;
    ensureFont();

    const definition = await loadCharacter(this);
    if (!definition || !this.isConnected) return;
    this.definition = definition;
    for (const el of document.querySelectorAll('[data-character-name]')) el.textContent = definition.name;

    // Everything added to window or the page goes away with the element.
    this.listening = new AbortController();
    const options = { signal: this.listening.signal };

    const page = root.querySelector('.page-layer');
    const screen = root.querySelector('.screen-layer');
    const fit = () => { page.style.width = `${document.documentElement.clientWidth}px`; };
    fit();

    const actor = (this.actor = new Actor({
      definition,
      layers: { page, screen },
      label: `Talk to ${definition.name}`,
    }));
    const world = document.querySelector(this.getAttribute('world')) ?? document.body;
    const sceneEl = world.querySelector('[data-scene]');
    this.world = new World({ root: world, actor, scene: sceneEl ? readScene(sceneEl) : null });

    this.client = new StandVisitor({
      siteId: this.getAttribute('site-id') || 'demo',
      prompt: this.getAttribute('prompt') ?? '',
      greeting: definition.greeting ?? '',
    });

    this.window = new ChatWindow({
      parent: screen,
      name: definition.name,
      portrait: portrait(actor),
      on: {
        send: (text) => this.client.send(text).then((ok) => { if (!ok && !this.client.state.pending) this.window.prefill(text); }),
        close: () => this.close(),
        end: () => this.client.end(),
        newChat: () => this.client.newChat(),
        retry: () => this.client.retry(),
        resend: () => this.client.send(this.client.state.pending?.body ?? ''),
        email: (email) => this.client.submitEmail(email),
        link: (messageId, url) => this.client.trackLinkClick(messageId, url),
        badge: () => this.client.badgeClick(),
        typing: () => this.client.typing(),
        draft: () => this.client.takeDraft(),
        speaking: (on) => { this.speaking = on; this.#pose(); },
      },
    });
    this.window.greeting = definition.greeting ?? '';

    actor.button.addEventListener('click', () => this.open({ via: 'character' }));
    actor.bubble.addEventListener('click', () => this.open({ via: 'speech-bubble' }));
    actor.button.addEventListener('pointerenter', () => this.#hover(true));
    actor.button.addEventListener('pointerleave', () => this.#hover(false));
    actor.button.addEventListener('focus', () => this.#hover(true));
    actor.button.addEventListener('blur', () => this.#hover(false));
    this.#typeToTalk(options);
    for (const trigger of document.querySelectorAll('[data-chat-open]')) {
      trigger.addEventListener('click', (event) => { event.preventDefault(); this.open({ via: 'button' }); }, options);
    }
    addEventListener('resize', () => { fit(); this.#repin(); }, options);
    visualViewport?.addEventListener('resize', () => this.#keyboard(), options);

    let seen = 0;
    let failures = 0;
    this.window.restoring = true;
    this.client.subscribe((state) => {
      // Waves goodbye when a conversation ends while you're watching.
      if (state.phase === 'ended' && this.state?.phase === 'active' && this.window.isOpen) {
        this.waving = true;
        this.actor.play('wave', { loop: false, facing: 'front' }).then(() => { this.waving = false; this.#pose(); });
      }
      this.state = state;
      this.window.render(state);
      // Replies that arrive while the window is closed show up in a bubble.
      const replies = state.messages.filter((m) => (m.senderType === 'standin' || m.senderType === 'rep') && m.type === 'text');
      if (replies.length > seen && seen && !this.window.isOpen && this.actor.visible) {
        const last = replies.at(-1).body.replace(/\s+/g, ' ');
        this.actor.say(last.length > 90 ? `${last.slice(0, 88)}…` : last, { ms: 12000, news: true });
        this.world.linger(12000);
      }
      seen = replies.length;
      // Couldn't reach Stand (rather than nobody being there): try again, patiently.
      if (state.phase === 'unavailable' && state.error && !this.retryTimer && failures < 4) {
        this.retryTimer = setTimeout(() => { this.retryTimer = null; this.client.retry(); }, [3e3, 1e4, 3e4, 6e4][failures++]);
      }
      if (state.phase === 'available' || state.phase === 'active') failures = 0;
      this.#arrive();
      this.#pose();
    });
    await this.client.start();
    this.window.restoring = false;
    this.#arrive();
  }

  disconnectedCallback() {
    // A move within the page reconnects right away; only a removal tears down.
    queueMicrotask(() => {
      if (this.isConnected || !this.listening) return;
      this.listening.abort();
      this.world.stop();
      this.actor.destroy();
      this.client.destroy();
      clearInterval(this.gestures);
      clearTimeout(this.retryTimer);
    });
  }

  // The character appears once someone can answer (or with ?preview).
  #arrive() {
    const state = this.client?.state;
    if (this.arrived || !state || this.window.restoring || state.phase === 'loading') return;
    if (state.phase === 'unavailable' && !previewing) return;
    this.arrived = true;
    const returning = state.phase === 'active' && state.messages.some((m) => m.senderType === 'visitor');
    this.world.start({ greeting: returning ? 'Welcome back!' : this.definition.greeting });
  }

  // Walks the character up to the screen and opens the message box.
  async open({ prefill = '', via = 'character' } = {}) {
    if (!this.actor) return;
    if (this.window.isOpen) {
      if (prefill) this.window.prefill(this.window.input.value + prefill);
      else this.window.focus();
      return;
    }
    if (this.opening) {
      this.typedAhead += prefill;
      return;
    }
    this.opening = true;
    this.typedAhead = '';
    this.#hover(false);
    this.client.activate(via);
    this.dispatchEvent(new CustomEvent('adventure-chat:open', { bubbles: true }));
    try {
      await this.world.summon(this.#spot());
    } catch (error) {
      if (error?.name !== 'AbortError') console.error(error);
    } finally {
      // Whatever happened on the way, the box opens and the keyboard is free again.
      this.opening = false;
    }
    this.window.open();
    this.window.render(this.state);
    // Letters typed while the character was on its way land in the parser too.
    const typed = prefill + this.typedAhead;
    if (typed) this.window.prefill(typed);
    this.#pose();
  }

  async close() {
    if (!this.window.isOpen) return;
    this.window.close();
    this.#quiet();
    this.dispatchEvent(new CustomEvent('adventure-chat:close', { bubbles: true }));
    await this.world.dismiss().catch((error) => console.error(error));
    // Back to the character, unless the box has opened again meanwhile.
    if (!this.window.isOpen && this.actor.visible) this.actor.button.focus({ preventScroll: true });
  }

  // Where the character stands while talking: beside the box on wide
  // screens, on top of it on narrow ones. Measures the box while it's hidden.
  #spot() {
    const box = this.window.el;
    const hidden = box.hidden;
    if (hidden) Object.assign(box, { hidden: false }).style.visibility = 'hidden';
    // Layout box, not the animated one: the box may still be scaling away.
    const r = { left: box.offsetLeft, top: box.offsetTop };
    if (hidden) Object.assign(box, { hidden: true }).style.visibility = '';
    const dpr = devicePixelRatio || 1;
    const snap = (s) => Math.round(s * dpr) / dpr;
    if (innerWidth < 700) {
      const scale = snap(Math.min(3, (r.top - 16) / 44));
      return { x: r.left + 28 + 9 * scale, y: r.top + 3 * scale, scale };
    }
    const room = r.left - 24;
    const scale = snap(Math.max(3, Math.min(7, (innerHeight * 0.36) / 46, room / 22)));
    return { x: r.left - 10 - 11 * scale, y: innerHeight - 22, scale };
  }

  // The character's pose while the box is open: thinking, talking, listening.
  #pose() {
    const actor = this.actor;
    if (!actor || this.opening || this.waving) return;
    if (!this.window.isOpen) return this.#quiet();
    const state = this.state;
    const thinking = state.activity.typing || (state.busy && state.pending);
    actor.talk(Boolean(this.speaking));
    clearInterval(this.gestures);
    if (this.speaking) {
      actor.play('stand', { facing: 'front' });
      this.gestures = setInterval(() => actor.play(Math.random() < 0.35 ? 'gesture' : 'stand', { facing: 'front' }), 1400);
    } else {
      actor.play(thinking ? 'think' : 'stand', { facing: 'front' });
    }
    actor.lookAt(null);
  }

  // Stops talking and gesturing, without touching the pose the world gave it.
  #quiet() {
    clearInterval(this.gestures);
    this.actor.talk(false);
  }

  #hover(on) {
    const a = this.actor;
    if (!a || this.window.isOpen) return;
    a.label.classList.toggle('is-shown', on);
    a.express(on ? { eyes: 'happy', mouth: 'smile' } : {});
  }

  // Start typing anywhere and the character comes to listen, like the text
  // parsers of old. Only plain letters, and never while you're in a field.
  #typeToTalk(options) {
    if (this.getAttribute('type-to-talk') === 'off') return;
    addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      // Once the character is on its way, every printable key counts.
      if (event.key.length !== 1 || (!this.opening && !/\p{L}/u.test(event.key))) return;
      const target = event.composedPath()[0];
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable], [role="textbox"], dialog, details summary')) return;
      if (!this.actor?.visible && !this.window?.isOpen) return;
      event.preventDefault();
      this.open({ prefill: event.key, via: 'typing' });
    }, options);
  }

  #repin() {
    if (this.window?.isOpen && !this.opening) this.world.pin(this.#spot());
  }

  // Keeps the box above the on-screen keyboard.
  #keyboard() {
    const vv = visualViewport;
    const hidden = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    this.shadowRoot.querySelector('.screen-layer').style.setProperty('--keyboard', `${hidden}px`);
    this.#repin();
  }
}

// --- Characters -----------------------------------------------------------------

async function loadCharacter(host) {
  const roster = (host.getAttribute('characters') || 'vera').split(/[\s,]+/).filter(Boolean);
  const wanted = new URLSearchParams(location.search).get('character') || host.getAttribute('character') || 'random';
  let id = wanted;
  if (wanted === 'random') {
    // One random character per visit, so a reload keeps the same one.
    const key = 'adventure-chat:character';
    try { id = sessionStorage.getItem(key); } catch { id = null; }
    if (!roster.includes(id)) id = roster[Math.floor(Math.random() * roster.length)];
    try { sessionStorage.setItem(key, id); } catch {}
  }
  for (const candidate of [id, roster[0]]) {
    if (!/^[a-z0-9-]+$/.test(candidate ?? '')) continue;
    try {
      const module = await import(new URL(`./characters/${candidate}.js`, import.meta.url));
      return { greeting: `Hi! I'm ${module.default.name}. Ask me anything.`, ...module.default };
    } catch (error) {
      console.warn(`adventure-chat: could not load the character "${candidate}".`, error);
    }
  }
  return null;
}

// A little head for the message box's title bar.
function portrait(actor) {
  const canvas = document.createElement('canvas');
  canvas.width = 20;
  canvas.height = 20;
  canvas.className = 'portrait';
  const frame = actor.rig.frame({ ...ANIMATIONS.stand.frames[0], mouth: 'smile' });
  canvas.getContext('2d').putImageData(new ImageData(frame.data, FRAME_W, FRAME_H), -10, -15, 10, 15, 20, 20);
  return canvas;
}

function ensureFont() {
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href.includes('Pixelify+Sans'))) return;
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONT }));
}

customElements.define('adventure-chat', AdventureChat);
