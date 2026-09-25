// The vintage terminal: a 3D CRT in the corner of the page that is a complete
// Stand chat. Move the pointer close to it (or tap it) and it fills the screen;
// click outside or press Esc and it returns to its corner.
//
//   stand-client.js  Stand's Visitor API: discovery, session, HTTP + WebSocket
//   bbs.js           the chat program: prints the conversation, /commands
//   screen.js        the text model: 80×25 cells printed at 1200 baud
//   rom.js           the character ROM (VT323 on a 10 × 12 dot grid)
//   crt.js           three.js: the monitor model and the phosphor picture
//   ascii.js         portraits and the Stand logo in characters
//
// This file wires them to the page: layout, motion, input and accessibility.

import { StandClient, safeUrl } from './stand-client.js';
import { Rom } from './rom.js';
import { Screen } from './screen.js';
import { Crt } from './crt.js';
import { Bbs, describeCard } from './bbs.js';

// -- Stand ---------------------------------------------------------------------

const STAND = {
  // Your Site ID from Sites in Stand. 'demo' is Stand Chat's shared demo site:
  // its AI Stand-in answers on any domain, including localhost.
  siteId: 'demo',
  // The opening line typed on screen. Leave it out to use your site's greeting.
  greeting: 'Welcome to the Kilobaud BBS! Ask me anything, or type LOOK to look around.',
  // Private context for your team and AI Stand-ins, sent with each new conversation.
  prompt: `You are the sysop on duty at the Kilobaud BBS: a warm, quick-witted night owl from 1983 who somehow knows everything about Stand. The visitor types into a custom chat UI built on Stand's Visitor API: an 80-column green-phosphor terminal on a 3D CRT monitor that prints every character at 1200 baud. The page is a Stand Chat example set on the website of Kilobaud, a made-up web framework.

Rules:
- Answer the actual question in your first sentence. Usefulness beats jokes.
- Short: two or three sentences, under 300 characters. Every character costs time at 1200 baud.
- Plain text only: no Markdown, no asterisks, no emoji. ASCII emoticons like :) are fine, sparingly.
- Lists: at most four lines starting with "- ". A URL goes on its own line, bare.
- At most one small retro flourish per reply (baud, modems, BBS lingo), in about half of your replies. Never repeat one.

Play along with text-adventure and shell commands in one short line, then be useful:
- LOOK: one line of scenery (the green phosphor glow, the humming modem, the sysop's cluttered desk), then two or three things they can ask you.
- INVENTORY: what they are carrying, as Stand things (a Site ID, a Visitor API, a greeting...).
- XYZZY: Nothing happens.
- HELP: three or four things you can help with, and mention that /help lists the terminal's own commands.
- Other commands (LS, DIR, GO NORTH...): a playful one-liner, then offer help.
Never pretend to run real commands or access systems.

Only these URLs exist. Never invent others:
https://stand.chat/
https://stand.chat/guide/custom-chat-ui (building a custom chat UI like this one)
https://stand.chat/pricing
https://github.com/standchat/examples/tree/main/vintage-terminal (this example's source)`,
  analyticsId: 'vintage-terminal',
};

// -- Page ------------------------------------------------------------------------

const MODEL = new URL('monitor.glb', import.meta.url).href;
const ROWS = 25;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');

const html = String.raw;
const root = document.createElement('div');
root.className = 'crt';
root.innerHTML = html`
  <canvas class="crt-canvas" aria-hidden="true"></canvas>
  <div class="crt-safe" aria-hidden="true"></div>
  <button class="crt-launcher" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Open the chat terminal" hidden></button>
  <div class="crt-backdrop" hidden></div>
  <div class="crt-dialog" role="dialog" aria-modal="true" aria-label="Chat terminal" hidden>
    <textarea class="crt-input" rows="1" spellcheck="false" autocomplete="off" autocapitalize="sentences" enterkeyhint="send" aria-label="Message" aria-describedby="crt-help"></textarea>
    <p id="crt-help" class="crt-sr">Type a message and press Enter. Type /help for commands. Escape minimizes the terminal.</p>
    <div class="crt-log crt-sr" role="log" aria-live="polite" aria-relevant="additions"></div>
    <p class="crt-status crt-sr" role="status"></p>
    <div class="crt-controls">
      <button type="button" data-action="minimize">Minimize <kbd>Esc</kbd></button>
      <button type="button" data-action="hangup" hidden>Hang up</button>
      <button type="button" data-action="redial" hidden>Dial again</button>
      <a class="crt-powered" target="_blank" rel="noopener noreferrer" hidden>Powered by Stand</a>
    </div>
  </div>`;
document.body.append(root);

const $ = (selector) => root.querySelector(selector);
const canvas = $('.crt-canvas');
const launcher = $('.crt-launcher');
const backdrop = $('.crt-backdrop');
const dialog = $('.crt-dialog');
const textarea = $('.crt-input');
const log = $('.crt-log');
const status = $('.crt-status');
const controls = $('.crt-controls');
const powered = $('.crt-powered');
const safe = $('.crt-safe'); // measures the notch and home indicator insets

let storage;
try {
  storage = sessionStorage;
} catch {
  // In-memory only.
}

const client = new StandClient({ ...STAND, storage });
const rom = new Rom();
let screen;
let crt;
let bbs;

// -- Layout ----------------------------------------------------------------------

const layout = {
  width: innerWidth,
  height: innerHeight,
  corner: { x: 0, y: 0, h: 180 }, // where the monitor sits: centre and height
  cornerRect: { x: 0, y: 0, w: 1, h: 1 }, // the canvas area around it
  zoom: { x: 0, y: 0, w: 600 }, // where the raster goes when zoomed
  cols: 80,
};

function measure() {
  const vv = visualViewport;
  const width = innerWidth;
  const height = innerHeight;
  const phone = Math.min(width, height) < 560;
  const h = phone ? 116 : width < 1100 ? 170 : 200;
  const inset = phone ? 12 : 28;
  const insets = getComputedStyle(safe);
  layout.width = width;
  layout.height = height;
  layout.inset = { right: inset + parseFloat(insets.paddingRight), bottom: inset + parseFloat(insets.paddingBottom) };
  layout.corner = { x: width - layout.inset.right - h * 0.7, y: height - layout.inset.bottom - h / 2, h };

  // Zoomed: the monitor's face fills what's visible above the keyboard, with
  // room for the control strip below. Phones favour a wide raster instead: the
  // bezel may run off the sides there.
  const top = vv ? vv.offsetTop : 0;
  const left = vv ? vv.offsetLeft : 0;
  const visibleW = vv ? vv.width : width;
  const visibleH = vv ? vv.height : height;
  const strip = 56;
  const margin = phone ? 8 : 28;
  const availW = visibleW - margin * 2;
  const availH = visibleH - strip - margin * 2;
  const raster = crt?.rasterSize ?? { x: 0.284, y: 0.211 };
  const face = crt?.faceSize ?? { x: 0.406, y: 0.36 };
  const offset = crt?.faceOffset ?? { x: 0, y: -0.04 };
  // CSS px per metre: the whole face if the text stays readable (7.2 px per
  // character at least), otherwise as large as the raster can be.
  const fit = Math.min(availW / face.x, availH / face.y);
  const most = Math.min((visibleW * 0.94) / raster.x, (availH * 0.94) / raster.y);
  const cols = !phone && raster.x * most >= 80 * 7.2 ? 80 : 40;
  const scale = phone ? most : Math.min(most, Math.max(fit, (cols * (cols === 80 ? 7.2 : 8.6)) / raster.x));
  const rasterW = raster.x * scale;
  // Centre the face; when it doesn't fit, centre the raster instead.
  const faceFits = face.y * scale <= availH + 1;
  const centreY = top + margin + availH / 2;
  layout.zoom = { x: left + visibleW / 2 - (faceFits ? offset.x * scale : 0), y: faceFits ? centreY + offset.y * scale : centreY, w: rasterW };
  const below = faceFits ? centreY + (face.y * scale) / 2 : layout.zoom.y + (raster.y * scale) / 2 + raster.y * scale * 0.12;
  layout.stripTop = Math.min(top + visibleH - strip + 12, below + 12);
  layout.cols = cols;
  if (crt?.model) fitCorner();
}

// Nudges the monitor so that, at rest, it sits exactly inside the corner
// margins, and sizes the corner canvas around it with room to move.
function fitCorner() {
  for (let i = 0; i < 2; i++) {
    crt.setViewport(layout.width, layout.height, null);
    crt.place({ corner: layout.corner, zoom: layout.zoom, t: 0, yaw: BASE_YAW, pitch: BASE_PITCH, roll: 0 });
    const b = crt.bounds();
    layout.corner.x -= b.x + b.w - (layout.width - layout.inset.right);
    layout.corner.y -= b.y + b.h - (layout.height - layout.inset.bottom);
  }
  crt.place({ corner: layout.corner, zoom: layout.zoom, t: 0, yaw: BASE_YAW, pitch: BASE_PITCH, roll: 0 });
  const b = crt.bounds();
  const pad = Math.round(Math.max(b.w, b.h) * 0.3);
  const x = Math.max(0, Math.floor(b.x - pad));
  const y = Math.max(0, Math.floor(b.y - pad));
  layout.cornerRect = { x, y, w: Math.ceil(Math.min(layout.width, b.x + b.w + pad) - x), h: Math.ceil(Math.min(layout.height, b.y + b.h + pad) - y) };
}

function applyGrid() {
  if (!screen || screen.cols === layout.cols) return;
  screen.resize(layout.cols, ROWS);
  crt.setGrid(layout.cols, ROWS);
  bbs?.resized();
}

// -- Motion ------------------------------------------------------------------------

// Critically damped springs for everything that moves.
function spring(value, stiffness = 60, damping = 2 * Math.sqrt(60)) {
  return { value, target: value, velocity: 0, stiffness, damping };
}
function step(s, dt) {
  const force = s.stiffness * (s.target - s.value) - s.damping * s.velocity;
  s.velocity += force * dt;
  s.value += s.velocity * dt;
  return Math.abs(s.velocity) > 1e-4 || Math.abs(s.target - s.value) > 1e-4;
}

const motion = {
  yaw: spring(-0.56, 26, 2 * Math.sqrt(26)),
  pitch: spring(-0.05, 26, 2 * Math.sqrt(26)),
  tilt: spring(0, 90, 7.5), // scroll: a little underdamped, it wobbles back
  roll: spring(0, 70, 7),
  lift: spring(260, 38, 2 * Math.sqrt(38) * 0.8), // starts below the edge and rises in
  scale: spring(1, 120, 2 * Math.sqrt(120)),
  zoom: 0,
  zoomFrom: 0,
  zoomTarget: 0,
  zoomStart: 0,
};
const BASE_YAW = -0.56; // turned towards the page, so its side and depth show
const BASE_PITCH = -0.07;

const pointer = { x: -1, y: -1, near: 0, armed: true, dwell: 0, moved: 0 };
let scrollVelocity = 0;
let lastScroll = { y: scrollY, t: performance.now() };

function lookTarget(now) {
  if (reducedMotion.matches) {
    motion.yaw.target = BASE_YAW * 0.6;
    motion.pitch.target = BASE_PITCH;
    return;
  }
  // A slow sway while the visitor is around; it settles after 20 idle seconds,
  // so an untouched page stops drawing.
  const idle = now - Math.max(pointer.moved, lastScroll.t, typedAt);
  const sway = Math.max(0, Math.min(1, 1 - (idle - 20000) / 4000));
  let yaw = BASE_YAW + Math.sin(now * 0.00045) * 0.025 * sway;
  let pitch = BASE_PITCH + Math.sin(now * 0.00031) * 0.012 * sway;
  if (pointer.x >= 0) {
    const dx = (pointer.x - layout.corner.x) / layout.width;
    const dy = (pointer.y - layout.corner.y) / layout.height;
    const pull = 0.5 + pointer.near * 0.7;
    yaw += Math.max(-0.14, Math.min(0.14, dx * 0.26)) * pull;
    pitch += Math.max(-0.07, Math.min(0.07, dy * 0.14)) * pull;
  }
  motion.yaw.target = yaw;
  motion.pitch.target = pitch;
}

function onScroll() {
  const now = performance.now();
  const dt = Math.max(8, now - lastScroll.t) / 1000;
  const v = (scrollY - lastScroll.y) / dt;
  lastScroll = { y: scrollY, t: now };
  scrollVelocity = scrollVelocity * 0.6 + v * 0.4;
  if (reducedMotion.matches) return;
  motion.tilt.target = Math.max(-0.1, Math.min(0.1, -scrollVelocity * 0.000035));
  motion.roll.target = Math.max(-0.03, Math.min(0.03, scrollVelocity * 0.000008));
  clearTimeout(onScroll.timer);
  onScroll.timer = setTimeout(() => {
    scrollVelocity = 0;
    motion.tilt.target = 0;
    motion.roll.target = 0;
  }, 90);
}

// -- Zoom --------------------------------------------------------------------------

let open = false;
let returnFocus = null;

function zoomTo(target, now = performance.now()) {
  motion.zoomFrom = motion.zoom;
  motion.zoomTarget = target;
  motion.zoomStart = now;
}

function openTerminal(interaction) {
  if (open || !crt) return;
  open = true;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  zoomTo(1);
  client.activate(interaction);
  if (client.state.phase === 'unavailable') void client.retry();
  launcher.setAttribute('aria-expanded', 'true');
  backdrop.hidden = false;
  dialog.hidden = false;
  root.classList.add('is-open');
  requestAnimationFrame(() => backdrop.classList.add('is-visible'));
  textarea.focus({ preventScroll: true });
  bbs.setZoomed(true);
  pointer.armed = false;
  syncControls();
}

function closeTerminal() {
  if (!open) return;
  open = false;
  zoomTo(0);
  launcher.setAttribute('aria-expanded', 'false');
  backdrop.classList.remove('is-visible');
  dialog.hidden = true;
  root.classList.remove('is-open');
  textarea.blur();
  bbs.setZoomed(false);
  pointer.armed = false; // re-armed once the pointer moves away
  if (returnFocus && returnFocus !== textarea && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
  else if (finePointer.matches === false) launcher.blur();
}

// CSS-style cubic-bezier easing: a quick start and a long, soft landing.
function bezier(x1, y1, x2, y2) {
  const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}
const easeOpen = bezier(0.3, 0.05, 0.1, 1);
const easeClose = bezier(0.45, 0, 0.2, 1);

function zoomProgress(now) {
  const opening = motion.zoomTarget > motion.zoomFrom;
  const duration = reducedMotion.matches ? 1 : opening ? 850 : 620;
  const t = Math.min(1, (now - motion.zoomStart) / duration);
  const eased = (opening ? easeOpen : easeClose)(t);
  motion.zoom = motion.zoomFrom + (motion.zoomTarget - motion.zoomFrom) * eased;
  if (t >= 1 && motion.zoomTarget === 0 && backdrop.hidden === false) backdrop.hidden = true;
  return t < 1;
}

// -- Input -------------------------------------------------------------------------

function distanceToMonitor(x, y) {
  const b = monitorBounds;
  if (!b) return Infinity;
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

let monitorBounds = null;

addEventListener('pointermove', (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.moved = performance.now();
  if (open) {
    const hit = crt?.pick(event.clientX, event.clientY, true);
    const cell = hit?.part === 'screen' ? screen.hitTest(hit.dotX, hit.lineY) : null;
    crt.hoverLink = cell?.link ? cell.linkId : 0;
    textarea.style.cursor = cell?.link ? 'pointer' : 'text';
    return;
  }
  if (event.pointerType !== 'mouse') return;
  const distance = distanceToMonitor(event.clientX, event.clientY);
  pointer.near = Math.max(0, 1 - distance / 260);
  if (!pointer.armed && distance > 90) pointer.armed = true;
  if (pointer.armed && distance < 28) {
    pointer.dwell ||= performance.now();
  } else {
    pointer.dwell = 0;
  }
}, { passive: true });

addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', relayout);
visualViewport?.addEventListener('resize', relayout);
visualViewport?.addEventListener('scroll', relayout);

launcher.addEventListener('click', (event) => {
  openTerminal(event.detail === 0 ? 'keyboard' : event.pointerType === 'mouse' ? 'click' : 'tap');
});

// Outside the monitor: back to the corner. On the monitor: keep typing.
backdrop.addEventListener('pointerdown', (event) => {
  const hit = crt.pick(event.clientX, event.clientY);
  if (!hit) {
    event.preventDefault();
    closeTerminal();
    return;
  }
  if (hit.part === 'power') crt.powerTarget = crt.powerTarget ? 0 : 1;
  event.preventDefault();
  textarea.focus({ preventScroll: true });
});
for (const type of ['wheel', 'touchmove']) {
  backdrop.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}

// The textarea lies over the glass: it takes the keyboard, paste and taps.
textarea.addEventListener('input', () => {
  bbs.input(textarea.value, textarea.selectionStart);
  typedAt = performance.now();
  sound('key');
});
document.addEventListener('selectionchange', () => {
  if (document.activeElement === textarea) bbs.input(textarea.value, textarea.selectionStart);
});
textarea.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeTerminal();
  } else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (bbs.submit(textarea.value)) setInput('');
  } else if (['PageUp', 'PageDown'].includes(event.key) || (event.key === 'End' && event.ctrlKey)) {
    event.preventDefault();
    bbs.key(event.key === 'End' ? 'End' : event.key);
  } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !textarea.value.includes('\n')) {
    const recalled = bbs.key(event.key);
    if (recalled !== null) {
      event.preventDefault();
      setInput(recalled);
    }
  }
});
textarea.addEventListener('wheel', (event) => {
  event.preventDefault();
  wheel += event.deltaY / (event.deltaMode === 1 ? 1 : 40);
  const lines = Math.trunc(wheel);
  if (lines) {
    screen.scrollBy(-lines);
    wheel -= lines;
  }
}, { passive: false });
let wheel = 0;
let touchY = null;
textarea.addEventListener('touchstart', (event) => (touchY = event.touches[0].clientY), { passive: true });
textarea.addEventListener('touchmove', (event) => {
  if (touchY === null) return;
  const dy = event.touches[0].clientY - touchY;
  const lineHeight = layout.zoom.w / (crt.rasterSize.x / crt.rasterSize.y) / ROWS;
  if (Math.abs(dy) > lineHeight) {
    screen.scrollBy(Math.trunc(dy / lineHeight));
    touchY = event.touches[0].clientY;
  }
  event.preventDefault();
}, { passive: false });
textarea.addEventListener('click', (event) => {
  const hit = crt.pick(event.clientX, event.clientY);
  if (hit?.part === 'screen' && bbs.click(screen.hitTest(hit.dotX, hit.lineY))) event.preventDefault();
});

document.addEventListener('keydown', (event) => {
  if (open && event.key === 'Escape') closeTerminal();
});

controls.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'minimize') closeTerminal();
  if (action === 'hangup') bbs.submit('/bye');
  if (action === 'redial') bbs.submit('');
  if (action && action !== 'minimize') textarea.focus({ preventScroll: true });
});
powered.addEventListener('click', () => client.badgeClick());

// Page buttons like <button data-terminal-open> open the terminal too.
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-terminal-open]')) {
    event.preventDefault();
    openTerminal('click');
  }
});

let typedAt = 0;

function setInput(text) {
  textarea.value = text;
  textarea.setSelectionRange(text.length, text.length);
  bbs.input(text, text.length);
}

function relayout() {
  measure();
  applyGrid();
  if (!crt) return;
  crt.setViewport(layout.width, layout.height, open || motion.zoom > 0 ? null : layout.cornerRect);
  needsFrame = true;
}

// Links from the terminal open in a new tab.
function openLink(url) {
  const safe = safeUrl(url);
  if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
}

// -- Accessibility and controls ------------------------------------------------------

const announced = new Set();
function mirror(state) {
  for (const m of state.messages) {
    if (announced.has(m.messageId)) continue;
    announced.add(m.messageId);
    let text = '';
    if (m.type === 'system-prompt' || m.senderType === 'system-prompt') continue; // private context, never shown
    if (m.type === 'text' || m.type === 'standin-idle-prompt') {
      if (m.senderType === 'visitor') continue;
      text = `${state.host.name || 'Sysop'}${state.host.kind === 'standin' ? ' (AI)' : ''}: ${m.body}`;
    } else if (m.type === 'link-card') {
      try {
        const card = JSON.parse(m.body);
        const url = safeUrl(card.url);
        if (!url) continue;
        const p = document.createElement('p');
        const a = Object.assign(document.createElement('a'), { href: url, textContent: card.title || url, target: '_blank', rel: 'noopener noreferrer' });
        p.append('Link: ', a);
        log.append(p);
      } catch {
        // Skipped.
      }
      continue;
    } else if (m.type === 'system-card' || m.senderType === 'system-card') {
      text = describeCard(m.body);
      if (!text) continue;
    } else continue;
    log.append(Object.assign(document.createElement('p'), { textContent: text }));
  }
  // Phase changes and errors, in words.
  const said = state.error || {
    loading: 'Dialing…',
    available: state.host.name ? `${state.host.name}${state.host.kind === 'rep' ? '' : ', an AI Stand-in,'} can answer. Type a message.` : '',
    unavailable: 'Nobody can answer right now.',
    active: state.connection === 'offline' ? 'Connection lost. Reconnecting…' : '',
    ended: 'The conversation has ended. Press Enter to start a new one.',
    uncertain: 'The chat may not have started. Press Enter to try again.',
  }[state.phase];
  if (said !== undefined && said !== status.textContent) status.textContent = said;
}

function syncControls() {
  const state = client.state;
  controls.querySelector('[data-action="hangup"]').hidden = state.phase !== 'active';
  controls.querySelector('[data-action="redial"]').hidden = !['ended', 'uncertain', 'unavailable'].includes(state.phase);
  const url = safeUrl(state.poweredByUrl);
  powered.hidden = !url;
  if (url) powered.href = url;
  dialog.setAttribute('aria-label', state.host.name ? `Chat terminal with ${state.host.name}` : 'Chat terminal');
  launcher.setAttribute('aria-label', state.host.name ? `Open the chat terminal: chat with ${state.host.name}` : 'Open the chat terminal');
}

// -- Sound (off until the visitor types /sound on) ---------------------------------

let audio = null;
let soundOn = false;
function sound(kind) {
  if (kind === 'on' || kind === 'off') {
    soundOn = kind === 'on';
    if (soundOn && !audio) audio = new AudioContext();
    return;
  }
  if (!soundOn || !audio) return;
  const t = audio.currentTime;
  const tone = (frequency, start, duration, gain = 0.05, type = 'sine') => {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    amp.gain.setValueAtTime(0, t + start);
    amp.gain.linearRampToValueAtTime(gain, t + start + 0.01);
    amp.gain.setValueAtTime(gain, t + start + duration - 0.02);
    amp.gain.linearRampToValueAtTime(0, t + start + duration);
    osc.connect(amp).connect(audio.destination);
    osc.start(t + start);
    osc.stop(t + start + duration + 0.05);
  };
  const noise = (start, duration, gain = 0.03, frequency = 1800) => {
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const amp = audio.createGain();
    src.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    amp.gain.value = gain;
    src.connect(filter).connect(amp).connect(audio.destination);
    src.start(t + start);
  };
  if (kind === 'key') noise(0, 0.018, 0.05, 3200);
  if (kind === 'send') noise(0, 0.03, 0.06, 2400);
  if (kind === 'receive') tone(1200, 0, 0.05, 0.02, 'square');
  if (kind === 'dial') {
    // Dial tone, then DTMF digits 5-5-5-0-1-9-9.
    tone(350, 0, 0.5, 0.04);
    tone(440, 0, 0.5, 0.04);
    const digits = { 5: [770, 1336], 0: [941, 1336], 1: [697, 1209], 9: [852, 1477] };
    [...'5550199'].forEach((d, i) => {
      tone(digits[d][0], 0.6 + i * 0.12, 0.08, 0.04);
      tone(digits[d][1], 0.6 + i * 0.12, 0.08, 0.04);
    });
  }
  if (kind === 'connect') {
    // Answer tone and a burst of handshake noise.
    tone(2100, 0, 0.6, 0.03);
    tone(1200, 0.65, 0.25, 0.03, 'square');
    tone(2400, 0.65, 0.25, 0.02, 'square');
    noise(0.9, 0.7, 0.05, 1800);
  }
  if (kind === 'hangup') tone(480, 0, 0.35, 0.03, 'square');
}

// -- Start ---------------------------------------------------------------------------

let needsFrame = true;
let last = performance.now();
const shownZoom = { x: 0, y: 0, w: 1 };

async function start() {
  measure();
  await rom.load();
  screen = new Screen(rom, layout.cols, ROWS);
  try {
    crt = new Crt({ canvas, rom, screen });
  } catch (error) {
    console.warn('No WebGL: the terminal needs WebGL 2.', error);
    root.remove();
    return;
  }
  crt.setGrid(layout.cols, ROWS);
  await crt.load(MODEL);
  measure();
  bbs = new Bbs({ screen, client, rom, openLink, setInput, sound });
  bbs.boot();
  client.subscribe((state) => {
    bbs.update(state);
    mirror(state);
    syncControls();
    needsFrame = true;
  });
  client.mount();
  relayout();
  Object.assign(shownZoom, layout.zoom);
  launcher.hidden = false;
  motion.lift.target = 0;
  crt.powerTarget = 1;
  if (reducedMotion.matches) {
    motion.lift.value = 0;
    crt.power = 1;
  }
  requestAnimationFrame(frame);
}

function frame(time) {
  const now = time;
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;

  lookTarget(now);
  let moved = needsFrame;
  needsFrame = false;
  for (const s of [motion.yaw, motion.pitch, motion.tilt, motion.roll, motion.lift, motion.scale]) moved = step(s, dt) || moved;
  // At rest in the corner only the slow sway moves: 30 fps is plenty for that.
  const resting = !open && motion.zoom === 0 && now - pointer.moved > 1500 && now - lastScroll.t > 1500 && !screen.busy;
  if (resting && moved && (frame.count = (frame.count ?? 0) + 1) % 2) moved = false;
  const zooming = zoomProgress(now);
  moved ||= zooming;

  // The canvas covers the whole viewport while zoomed or zooming.
  const full = open || motion.zoom > 0.0001;
  if (full !== frame.full) {
    frame.full = full;
    crt.setViewport(layout.width, layout.height, full ? null : layout.cornerRect);
    moved = true;
  }

  // Proximity: a pointer that settles close to the monitor opens it, unless
  // the visitor is busy typing into something else on the page.
  if (!open && pointer.dwell && now - pointer.dwell > 140) {
    pointer.dwell = 0;
    const typing = document.activeElement?.matches?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
    if (!typing) openTerminal('hover');
  }
  motion.scale.target = open ? 1 : 1 + 0.07 * pointer.near * pointer.near;

  const screenChanged = screen.tick(now / 1000, dt);
  bbs.tick(now);
  const blink = now - typedAt < 600 || Math.floor(now / 530) % 2 === 0;

  // The zoomed target moves when a phone's keyboard opens: glide, don't jump.
  const z = shownZoom;
  const k = Math.min(1, dt * 10);
  if (Math.abs(z.x - layout.zoom.x) + Math.abs(z.y - layout.zoom.y) + Math.abs(z.w - layout.zoom.w) > 0.5) {
    z.x += (layout.zoom.x - z.x) * k;
    z.y += (layout.zoom.y - z.y) * k;
    z.w += (layout.zoom.w - z.w) * k;
    if (open) moved = true;
  } else Object.assign(z, layout.zoom);

  crt.place({
    corner: layout.corner,
    zoom: shownZoom,
    t: motion.zoom,
    yaw: motion.yaw.value,
    pitch: motion.pitch.value + motion.tilt.value,
    roll: motion.roll.value,
    lift: motion.lift.value,
    scale: motion.scale.value,
    zoomLook: reducedMotion.matches || pointer.x < 0 ? { yaw: 0, pitch: 0 } : {
      yaw: (pointer.x / layout.width - 0.5) * 0.04,
      pitch: (pointer.y / layout.height - 0.5) * 0.03,
    },
  });
  crt.setLed(client.state.phase === 'active' ? (client.state.typing || screen.busy ? (Math.floor(now / 90) % 2 ? 3 : 0.4) : 2.2) : client.state.phase === 'available' ? 1.6 : 0.5);
  const drawn = crt.render(now / 1000, dt, { moved, blink, screenChanged });
  if (drawn && (moved || !monitorBounds)) {
    monitorBounds = crt.bounds();
    if (!open && monitorBounds) positionLauncher(monitorBounds);
  }
  if (open) positionOverlay();
  requestAnimationFrame(frame);
}

function positionLauncher(b) {
  Object.assign(launcher.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
}

// The textarea covers the raster; the control strip sits below the monitor.
function positionOverlay() {
  const z = shownZoom;
  const rasterH = z.w / (crt.rasterSize.x / crt.rasterSize.y);
  Object.assign(textarea.style, { left: `${z.x - z.w / 2}px`, top: `${z.y - rasterH / 2}px`, width: `${z.w}px`, height: `${rasterH}px` });
  controls.style.top = `${layout.stripTop}px`;
}

start();
