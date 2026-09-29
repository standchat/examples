import { StandClient, safeUrl } from './stand-client.js';
import { Rom } from './rom.js';
import { Screen, BRIGHT, DIM } from './screen.js';
import { GAMES } from './games.js';

const $ = (selector) => document.querySelector(selector);
const room = $('#room');
const dialog = $('.game-dialog');
const input = $('#command');
const controls = $('.game-controls');
const transcript = $('.transcript');
const connection = $('.connection-status');
const backdrop = $('.backdrop');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const rom = new Rom();
const terminals = [];
let active = null;
let moving = null;
let raf = 0;
let timer = 0;
let lastFrame = 0;
let warmUntil = 0;
let layoutDirty = true;
let ready = false;

// StandClient's own key is site-specific. A per-game Storage adapter keeps all
// three conversations (and the parent BBS) isolated, including after reload.
function storageFor(id) {
  const prefix = `stand-gameroom:v1:${id}:`;
  return {
    getItem(key) { try { return sessionStorage.getItem(prefix + key); } catch { return null; } },
    setItem(key, value) { try { sessionStorage.setItem(prefix + key, value); } catch { /* Memory-only play. */ } },
  };
}

function center(text, cols = 24) {
  return ' '.repeat(Math.max(0, Math.floor((cols - text.length) / 2))) + text;
}

class GameTerminal {
  constructor(game, index) {
    this.game = game;
    this.index = index;
    this.button = $(`[data-game="${game.id}"]`);
    this.screen = new Screen(rom, 40, 25);
    this.screen.baud = reducedMotion.matches ? 1e7 : 2400;
    this.screen.title = { left: game.name.toUpperCase(), right: '' };
    this.screen.input.visible = true;
    this.attract = new Screen(rom, 24, 18);
    this.attract.title = { left: `GAME ${String(index + 1).padStart(2, '0')}`, right: 'AI EDITION' };
    this.attract.status = { left: '', right: 'SELECT TO PLAY' };
    this.attract.print([{ text: '\n' + center(game.title) + '\n' + center(game.subtitle), attr: BRIGHT }]);
    this.attract.print([{ text: '\n' + game.art.map(line => center(line)).join('\n'), attr: DIM }]);
    this.attract.print([{ text: '\n' + center('PRESS TO PLAY'), attr: BRIGHT }]);
    this.attract.flush();
    this.entries = [];
    this.seen = new Set();
    this.lastSeq = 0;
    this.preview = null;
    this.history = [];
    this.historyIndex = 0;
    this.zoom = 0;
    this.dirty = true;
    this.client = new StandClient({
      siteId: 'demo', greeting: game.greeting, prompt: game.prompt,
      analyticsId: `gameroom-${game.id}`, storage: storageFor(game.id),
    });
    this.print(game.greeting, BRIGHT, Infinity);
    this.client.subscribe(state => this.update(state));
    this.button.addEventListener('click', () => openTerminal(this));
  }

  print(text, attr = 0, cps) {
    const entry = { text, block: this.screen.print([{ text: text + '\n', attr }], { cps }) };
    this.entries.push(entry);
    if (active === this) this.appendEntry(entry);
    return entry;
  }

  appendEntry(entry) {
    const p = document.createElement('p');
    p.textContent = entry.text;
    transcript.append(p);
    entry.element = p;
    transcript.scrollTop = transcript.scrollHeight;
  }

  update(state) {
    // A WebSocket reply can beat the HTTP acknowledgement of the command.
    // Rebuild only in that race so the displayed order stays canonical.
    const reordered = state.messages.some(m => !this.seen.has(m.messageId) && m.seq < this.lastSeq);
    if (reordered) {
      this.screen.clear();
      this.entries = [];
      this.seen.clear();
      this.preview = null;
      this.lastSeq = 0;
      if (active === this) transcript.replaceChildren();
      this.print(this.game.greeting, BRIGHT, Infinity);
    }
    for (const message of state.messages) {
      if (this.seen.has(message.messageId)) continue;
      this.seen.add(message.messageId);
      this.lastSeq = Math.max(this.lastSeq, message.seq);
      if (!['text', 'standin-idle-prompt'].includes(message.type) || !['visitor', 'standin', 'rep'].includes(message.senderType)) continue;
      if (message.body === this.game.greeting && message.senderType !== 'visitor') continue;
      if (message.senderType === 'visitor') this.print('> ' + message.body, DIM, Infinity);
      else if (this.preview && (!message.turnId || message.turnId === this.preview.turnId)) {
        const entry = this.preview.entry;
        entry.text = message.body;
        this.screen.update(entry.block, [{ text: message.body + '\n' }]);
        if (entry.element?.isConnected) entry.element.textContent = message.body;
        this.preview = null;
      } else this.print(message.body, 0, reordered ? Infinity : undefined);
    }
    if (state.preview) {
      if (this.preview?.turnId === state.preview.turnId) {
        const entry = this.preview.entry;
        entry.text = state.preview.text;
        this.screen.update(entry.block, [{ text: entry.text + '\n' }]);
        // Announce only the final reply, not each streamed token.
      } else this.preview = { turnId: state.preview.turnId, entry: this.print(state.preview.text) };
    } else if (this.preview && !state.typing) {
      this.screen.remove(this.preview.entry.block);
      this.preview.entry.element?.remove();
      this.entries = this.entries.filter(entry => entry !== this.preview.entry);
      this.preview = null;
    }
    this.screen.status = { left: 'HELP / ESC', right: state.busy || state.typing ? 'WORKING...' : state.phase === 'active' ? 'ONLINE' : state.phase === 'available' ? 'READY' : state.phase.toUpperCase() };
    this.screen.input.text = state.draft;
    this.screen.input.caret = state.draft.length;
    this.screen.touch();
    this.dirty = true;
    if (active === this) {
      if (input.value !== state.draft) input.value = state.draft;
      syncControls();
      if (state.phase === 'available' && !this.activated) {
        this.activated = true;
        this.client.activate('click');
      }
    }
    wake();
  }

  resume() {
    if (!this.unmount) this.unmount = this.client.mount();
  }

  suspend() {
    this.unmount?.();
    this.unmount = null;
  }
}

function syncControls() {
  if (!active) return;
  const s = active.client.state;
  const waiting = s.busy || s.typing || Boolean(s.preview);
  input.readOnly = s.busy;
  controls.querySelector('[data-action="send"]').disabled = waiting || !['available', 'active'].includes(s.phase);
  const retry = controls.querySelector('[data-action="retry"]');
  retry.hidden = !s.error && !s.pending && s.phase !== 'unavailable' && !(s.phase === 'active' && s.connection === 'offline');
  retry.disabled = s.busy;
  retry.textContent = s.pending ? 'Retry command' : 'Reconnect';
  const restart = controls.querySelector('[data-action="new"]');
  restart.hidden = !['ended', 'uncertain'].includes(s.phase);
  restart.disabled = s.busy;
  const powered = controls.querySelector('.powered');
  const url = safeUrl(s.poweredByUrl);
  powered.hidden = !url;
  if (url) powered.href = url;
  connection.textContent = s.error || (s.pending ? 'Command not yet confirmed. Retry safely.' : {
    loading: 'CONNECTING...', available: 'AI RE-CREATION · TYPE A COMMAND TO BEGIN',
    active: s.connection === 'offline' ? 'CONNECTION LOST · RECONNECTING...' : s.typing ? 'THE COMPUTER IS THINKING...' : 'AI RE-CREATION · HELP FOR COMMANDS',
    unavailable: 'LINE UNAVAILABLE · RECONNECT TO TRY AGAIN',
    ended: 'SESSION ENDED · OPEN A NEW SESSION TO PLAY',
    uncertain: 'START NOT CONFIRMED · A NEW SESSION MAY START A SEPARATE GAME',
  }[s.phase]);
  layoutControls();
}

function openTerminal(terminal) {
  if (active || moving) return;
  active = terminal;
  moving = { terminal, from: terminal.zoom, to: 1, start: performance.now() };
  room.inert = true;
  terminal.button.setAttribute('aria-expanded', 'true');
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('is-visible'));
  dialog.hidden = false;
  dialog.classList.toggle('is-fallback', !terminal.crt);
  $('#game-title').textContent = terminal.game.name;
  transcript.replaceChildren();
  terminal.entries.forEach(entry => terminal.appendEntry(entry));
  input.value = terminal.client.state.draft;
  if (terminal.crt) {
    terminal.crt.screen = terminal.screen;
    terminal.crt.setGrid(terminal.screen.cols, terminal.screen.rows);
    terminal.canvas.classList.add('is-active');
    terminal.crt.setViewport(innerWidth, innerHeight);
  }
  for (const other of terminals) if (other !== terminal) other.suspend();
  terminal.resume();
  terminal.client.showGreeting(terminal.game.greeting);
  terminal.screen.scrollToEnd();
  terminal.dirty = true;
  measure();
  syncControls();
  input.focus({ preventScroll: true });
  wake();
}

function closeTerminal() {
  if (!active) return;
  const terminal = active;
  terminal.suspend();
  active = null;
  moving = { terminal, from: terminal.zoom, to: 0, start: performance.now() };
  dialog.hidden = true;
  backdrop.classList.remove('is-visible');
  terminal.button.setAttribute('aria-expanded', 'false');
  // Focus stays outside the inert room until the closing transition finishes.
  input.blur();
  wake();
}

function finishClosing(terminal) {
  if (terminal.crt) {
    terminal.crt.screen = terminal.attract;
    terminal.crt.setGrid(terminal.attract.cols, terminal.attract.rows);
    terminal.canvas.classList.remove('is-active');
    terminal.crt.setViewport(innerWidth, innerHeight, terminal.rect);
  }
  terminal.dirty = true;
  backdrop.hidden = true;
  room.inert = false;
  terminal.button.focus({ preventScroll: true });
}

function measure() {
  layoutDirty = false;
  const width = innerWidth, height = innerHeight;
  for (const terminal of terminals) {
    if (!terminal.crt) continue;
    const box = terminal.button.querySelector('.fallback-monitor').getBoundingClientRect();
    terminal.corner = { x: box.x + box.width / 2, y: box.y + box.height / 2, h: box.height * .95 };
    // The inward-facing outer monitors frame the front-facing middle one.
    terminal.yaw = [.28, 0, -.28][terminal.index];
    terminal.crt.setViewport(width, height);
    terminal.crt.place({ corner: terminal.corner, zoom: { x: width / 2, y: height / 2, w: 500 }, t: 0, yaw: terminal.yaw, pitch: -.06, roll: 0 });
    let bounds = terminal.crt.bounds();
    const fit = Math.min(box.width / bounds.w, box.height / bounds.h) * .98;
    terminal.corner.h *= fit;
    terminal.crt.place({ corner: terminal.corner, zoom: { x: 0, y: 0, w: 500 }, t: 0, yaw: terminal.yaw, pitch: -.06, roll: 0 });
    bounds = terminal.crt.bounds();
    terminal.corner.x += box.x + box.width / 2 - (bounds.x + bounds.w / 2);
    terminal.corner.y += box.y + box.height / 2 - (bounds.y + bounds.h / 2);
    const pad = 12;
    const x = Math.max(0, Math.floor(box.x - pad));
    const y = Math.max(0, Math.floor(box.y - pad));
    terminal.rect = { x, y, w: Math.min(width - x, Math.ceil(box.width + pad * 2)), h: Math.min(height - y, Math.ceil(box.height + pad * 2)) };
    const vv = visualViewport;
    const vw = vv?.width ?? width, vh = vv?.height ?? height;
    const left = vv?.offsetLeft ?? 0, top = vv?.offsetTop ?? 0;
    const crt = terminal.crt;
    terminal.screen.resize(vw < 600 ? 32 : 40, vw < 600 ? 20 : 25);
    if (crt.screen === terminal.screen) crt.setGrid(terminal.screen.cols, terminal.screen.rows);
    const availableH = Math.max(80, vh - 120);
    // On phones, crop the housing slightly to keep 40 columns readable.
    const faceScale = Math.min((vw - 30) / crt.faceSize.x, availableH / crt.faceSize.y);
    const rasterScale = Math.min((vw - 24) / crt.rasterSize.x, (availableH - 12) / crt.rasterSize.y);
    const scale = vw < 600 ? rasterScale : faceScale;
    const fits = crt.faceSize.y * scale <= availableH;
    terminal.target = { x: left + vw / 2, y: top + availableH / 2 + 12 + (fits ? crt.faceOffset.y * scale : 0), w: crt.rasterSize.x * scale };
    terminal.stripTop = top + vh - 94;
    terminal.crt.setViewport(width, height, terminal === active || terminal === moving?.terminal ? null : terminal.rect);
    terminal.dirty = true;
  }
  layoutControls();
}

function layoutControls() {
  if (!active) return;
  if (active.crt && active.target) {
    const z = active.target;
    const h = z.w * active.crt.rasterSize.y / active.crt.rasterSize.x;
    Object.assign(input.style, { left: `${z.x - z.w / 2}px`, top: `${z.y - h / 2}px`, width: `${z.w}px`, height: `${h}px` });
    controls.style.top = `${active.stripTop}px`;
    connection.style.top = `${active.stripTop + controls.offsetHeight + 9}px`;
  }
}

function wake() {
  if (!ready || document.hidden) return;
  clearTimeout(timer);
  warmUntil = performance.now() + 1000;
  if (!raf) raf = requestAnimationFrame(frame);
}

function frame(now) {
  raf = 0;
  if (document.hidden) return;
  const dt = Math.max(.001, Math.min(.05, (now - lastFrame) / 1000));
  lastFrame = now;
  if (layoutDirty) measure();
  let closing = null;
  if (moving) {
    const progress = Math.min(1, (now - moving.start) / (reducedMotion.matches ? 1 : 650));
    const ease = 1 - (1 - progress) ** 3;
    moving.terminal.zoom = moving.from + (moving.to - moving.from) * ease;
    moving.terminal.dirty = true;
    if (progress === 1) {
      if (moving.to === 0) closing = moving.terminal;
      moving = null;
    }
  }
  if (closing) finishClosing(closing);
  let busy = false;
  for (const terminal of terminals) {
    // Inactive canvases remain frozen. No screen ticks, GPU passes or sockets.
    if ((active || moving) && terminal !== active && terminal !== moving?.terminal) continue;
    const crt = terminal.crt;
    if (!crt) continue;
    const s = crt.screen;
    const changed = s.tick(now / 1000, dt);
    const moved = terminal.dirty;
    terminal.dirty = false;
    crt.place({ corner: terminal.corner, zoom: terminal.target, t: terminal.zoom, yaw: terminal.yaw, pitch: -.06, roll: 0 });
    crt.setLed(terminal.client.state.typing ? 2.8 : 1.6);
    crt.render(now / 1000, dt, { moved, blink: reducedMotion.matches || Math.floor(now / 530) % 2 === 0, screenChanged: changed });
    busy ||= s.busy || changed || crt.decaying || crt.power !== crt.powerTarget;
  }
  if (moving || busy || now < warmUntil) raf = requestAnimationFrame(frame);
  else if (active?.crt && !reducedMotion.matches) timer = setTimeout(() => { raf = requestAnimationFrame(frame); }, 530);
}

async function submit() {
  if (!active) return;
  const terminal = active;
  const s = terminal.client.state;
  const command = input.value.trim();
  if (!command) { terminal.screen.flush(); wake(); return; }
  if (s.busy || s.typing || s.preview || !['available', 'active'].includes(s.phase)) return;
  if (s.pending) { connection.textContent = 'Retry the unconfirmed command before sending another.'; return; }
  terminal.history.push(command);
  terminal.historyIndex = terminal.history.length;
  terminal.screen.flush();
  terminal.screen.scrollToEnd();
  terminal.client.setDraft(command);
  await terminal.client.send();
}

$('.command-form').addEventListener('submit', event => { event.preventDefault(); void submit(); });
input.addEventListener('input', () => {
  if (!active) return;
  active.client.setDraft(input.value);
  active.screen.input.caret = input.selectionStart;
  active.screen.touch();
  wake();
});
document.addEventListener('selectionchange', () => {
  if (active && document.activeElement === input) {
    active.screen.input.caret = input.selectionStart;
    active.screen.touch();
    wake();
  }
});
input.addEventListener('keydown', event => {
  if (!active || event.isComposing) return;
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); }
  if (event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault(); active.screen.scrollBy(event.key === 'PageUp' ? 17 : -17); wake();
  }
  if (event.key === 'End' && event.ctrlKey) { event.preventDefault(); active.screen.scrollToEnd(); wake(); }
  if (['ArrowUp', 'ArrowDown'].includes(event.key) && !input.value.includes('\n')) {
    event.preventDefault();
    active.historyIndex = Math.max(0, Math.min(active.history.length, active.historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
    input.value = active.history[active.historyIndex] ?? '';
    active.client.setDraft(input.value);
  }
});
input.addEventListener('wheel', event => {
  if (!active) return;
  event.preventDefault();
  active.screen.scrollBy(event.deltaY / (event.deltaMode === 1 ? 1 : 24));
  wake();
}, { passive: false });
let touchY;
input.addEventListener('touchstart', event => { touchY = event.touches[0].clientY; }, { passive: true });
input.addEventListener('touchmove', event => {
  if (!active || touchY == null) return;
  event.preventDefault();
  const y = event.touches[0].clientY;
  if (Math.abs(y - touchY) > 12) { active.screen.scrollBy((y - touchY) / 12); touchY = y; wake(); }
}, { passive: false });

controls.addEventListener('click', async event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!active) return;
  const terminal = active;
  if (action === 'close') closeTerminal();
  if (action === 'retry') {
    if (terminal.client.state.pending) await terminal.client.send();
    else await terminal.client.retry();
  }
  if (action === 'new' && !terminal.client.state.busy) {
    terminal.screen.clear();
    terminal.entries = [];
    terminal.seen.clear();
    terminal.lastSeq = 0;
    terminal.preview = null;
    terminal.activated = false;
    transcript.replaceChildren();
    terminal.print(terminal.game.greeting, BRIGHT, Infinity);
    await terminal.client.newChat();
  }
  if (active === terminal && action !== 'close') input.focus({ preventScroll: true });
});
$('.powered').addEventListener('click', () => active?.client.badgeClick());
backdrop.addEventListener('click', closeTerminal);
document.addEventListener('keydown', event => {
  if (!active) return;
  if (event.key === 'Escape') { event.preventDefault(); closeTerminal(); }
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.querySelectorAll('textarea, button, a, [tabindex="0"]')].filter(el => !el.hidden && !el.disabled && el.getClientRects().length);
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
function relayout() { layoutDirty = true; wake(); }
addEventListener('resize', relayout);
visualViewport?.addEventListener('resize', relayout);
visualViewport?.addEventListener('scroll', relayout);
reducedMotion.addEventListener('change', () => {
  terminals.forEach(t => { t.screen.baud = reducedMotion.matches ? 1e7 : 2400; });
  wake();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(raf); raf = 0; clearTimeout(timer);
    terminals.forEach(t => t.suspend());
  } else { active?.resume(); relayout(); }
});
addEventListener('pagehide', () => terminals.forEach(t => t.suspend()));
addEventListener('pageshow', event => { if (event.persisted) { active?.resume(); relayout(); } });

async function start() {
  await rom.load();
  GAMES.forEach((game, index) => terminals.push(new GameTerminal(game, index)));
  let Crt;
  try { ({ Crt } = await import('./crt.js')); }
  catch (error) { console.warn('3D unavailable; using text terminals.', error); }
  if (Crt) {
    // Avoid compiling three shader pipelines simultaneously on mobile GPUs.
    for (const terminal of terminals) {
      const canvas = document.createElement('canvas');
      canvas.className = 'monitor-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.append(canvas);
      try {
        const crt = new Crt({ canvas, rom, screen: terminal.attract });
        crt.pixelRatio = Math.min(devicePixelRatio, 1.5);
        crt.setGrid(24, 18);
        await crt.load(new URL('monitor.glb', import.meta.url).href);
        terminal.crt = crt;
        terminal.canvas = canvas;
        crt.powerTarget = crt.power = 1;
        terminal.button.classList.add('is-3d');
        canvas.addEventListener('webglcontextlost', event => {
          event.preventDefault();
          terminal.suspend();
          terminal.crt = null;
          canvas.remove();
          terminal.button.classList.remove('is-3d');
          if (active === terminal) { dialog.classList.add('is-fallback'); terminal.resume(); }
        });
      } catch (error) {
        canvas.remove();
        console.warn('3D unavailable; using a text terminal.', error);
      }
    }
  }
  $('#load-status').hidden = true;
  ready = true;
  terminals.forEach(terminal => { terminal.button.disabled = false; });
  relayout();
}

start().catch(error => {
  console.error(error);
  $('#load-status').textContent = 'TERMINALS COULD NOT START. PLEASE RELOAD.';
});
