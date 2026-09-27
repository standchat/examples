// Molehill's desktop: windows you can move, resize, stack, minimize and close,
// a menu bar, a taskbar and icons. On phones the same windows open as
// full-screen apps over a home screen.
//
// It also answers "where is this?" for Chat: resolve() turns a name from a
// reply or an attachment ("Pricing.sheet: Session replay") into a window and a
// row, and reveal() opens that window and lights the row up.

import { drawIcons, icon } from './icons.js';
import { normalizeName, splitRef } from './message-format.js';

const STORE_KEY = 'drag-to-ask:v1:desktop';
// Narrow screens, and phones held sideways, get the home screen of apps.
const PHONE_QUERY = '(max-width: 759px), (max-height: 520px) and (pointer: coarse)';
const BAR = 32; // title bar height
const SNAP = 10; // px within which edges snap together
const GAP = 8; // gap left between snapped windows

// Preferred sizes; open() fits them into the desktop.
const SIZES = {
  analytics: [600, 380], pricing: [660, 348], chat: [384, 620], replay: [520, 512],
  flags: [612, 352], experiments: [460, 392], surveys: [470, 432], warehouse: [540, 420],
  changelog: [620, 380], why: [580, 520], docs: [520, 420], trash: [440, 290], setup: [440, 214],
};
const MIN = { chat: [300, 380], setup: [320, 180] };

const SVG = {
  min: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 7.5h7"/></svg>',
  max: '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7"/></svg>',
  restore: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.5h5v5"/><rect x="1.5" y="3.5" width="5" height="5"/></svg>',
  close: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6"/></svg>',
  back: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg>',
};

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function createDesktop(root) {
  const desk = root.querySelector('.mh-desktop');
  const tasks = root.querySelector('.mh-tasks');
  const chatTask = root.querySelector('.mh-task--chat');
  const live = root.querySelector('#mh-live');
  const listeners = new Set();
  const wins = new Map();
  let order = []; // z-order, topmost last
  let taskOrder = []; // taskbar order: first opened first
  let stack = []; // phone: open apps, topmost last
  let phone = false;
  let menu = null; // the open menu bar dropdown: { button, list }
  const saved = load();
  const iconOffsets = saved.icons ?? {};

  drawIcons(root);
  for (const el of desk.querySelectorAll('.win')) setup(el);

  // Windows ------------------------------------------------------------------

  function setup(el) {
    const id = el.dataset.win;
    const names = el.dataset.names.split('|');
    const w = { id, el, names, name: names[0], kind: el.dataset.kind, open: false, min: false, max: false, placed: false, x: 0, y: 0, w: 0, h: 0, prev: null };
    wins.set(id, w);

    const bar = document.createElement('div');
    bar.className = 'win-bar';
    const back = button('win-back', `${SVG.back}<span>Home</span>`, 'Back');
    const proxy = document.createElement('span');
    proxy.className = 'win-proxy';
    proxy.append(icon(el.dataset.icon));
    if (id !== 'chat' && id !== 'setup') {
      proxy.dataset.askApp = id;
      proxy.title = `Drag onto Chat to ask about ${w.name}`;
    }
    const ctl = document.createElement('div');
    ctl.className = 'win-ctl';
    const minBtn = button('win-btn', SVG.min, `Minimize ${w.name}`);
    const maxBtn = button('win-btn', SVG.max, `Maximize ${w.name}`);
    const closeBtn = button('win-btn', SVG.close, `Close ${w.name}`);
    minBtn.dataset.act = 'min';
    maxBtn.dataset.act = 'max';
    closeBtn.dataset.act = 'close';
    ctl.append(minBtn, maxBtn, closeBtn);
    bar.append(back, proxy, el.querySelector('.win-title'), ctl);
    el.prepend(bar);
    for (const edge of ['e', 's', 'se', 'w', 'sw']) {
      const rz = document.createElement('div');
      rz.className = 'win-rz';
      rz.dataset.edge = edge;
      rz.addEventListener('pointerdown', (e) => startResize(w, edge, e));
      el.append(rz);
    }
    Object.assign(w, { bar, back, maxBtn });
    el.tabIndex = -1;
    el.hidden = true;

    bar.addEventListener('pointerdown', (e) => startMove(w, e));
    bar.addEventListener('dblclick', (e) => {
      if (!phone && !e.target.closest('button, .win-proxy')) toggleMax(id);
    });
    minBtn.addEventListener('click', () => minimize(id));
    maxBtn.addEventListener('click', () => toggleMax(id));
    closeBtn.addEventListener('click', () => close(id));
    back.addEventListener('click', () => close(id));
    el.addEventListener('pointerdown', () => raise(id), true);
    el.addEventListener('focusin', () => raise(id));
    for (const b of el.querySelectorAll('[data-close]')) b.addEventListener('click', () => close(id));
  }

  function area() {
    return { w: desk.clientWidth, h: desk.clientHeight };
  }

  // The icon columns take the desktop's sides; windows prefer the middle.
  // Tablets stack every icon in one column on the left.
  function gutters() {
    const { w } = area();
    return w >= 1000 ? [112, 112] : w >= 740 ? [86, 0] : [0, 0];
  }

  function minSize(id) {
    return MIN[id] ?? [260, 150];
  }

  function fit(w) {
    const A = area();
    const [minW, minH] = minSize(w.id);
    w.w = Math.round(Math.max(Math.min(w.w, A.w - 12), Math.min(minW, A.w - 12)));
    w.h = Math.round(Math.max(Math.min(w.h, A.h - 12), Math.min(minH, A.h - 12)));
    w.x = Math.round(Math.min(Math.max(w.x, -w.w + 96), A.w - 96));
    w.y = Math.round(Math.min(Math.max(w.y, 0), A.h - BAR));
  }

  function apply(w) {
    const s = w.el.style;
    s.setProperty('--x', `${w.x}px`);
    s.setProperty('--y', `${w.y}px`);
    s.width = `${w.w}px`;
    s.height = `${w.h}px`;
    w.el.classList.toggle('is-max', w.max);
    w.maxBtn.innerHTML = w.max ? SVG.restore : SVG.max;
    w.maxBtn.setAttribute('aria-label', `${w.max ? 'Restore' : 'Maximize'} ${w.name}`);
  }

  // A new window goes next to Chat when asked, otherwise in a gentle cascade.
  function place(w, beside) {
    const A = area();
    const [gl, gr] = gutters();
    const [pw, ph] = SIZES[w.id] ?? [480, 360];
    w.w = Math.min(pw, A.w - gl - gr - 16);
    w.h = Math.min(ph, A.h - 24);
    const anchor = beside && wins.get(beside);
    if (anchor && isVisible(beside)) {
      const left = anchor.x - w.w - 14;
      const right = anchor.x + anchor.w + 14;
      if (left >= gl - 20) w.x = left;
      else if (right + w.w <= A.w - gr + 20) w.x = right;
      else w.x = Math.max(gl, anchor.x - w.w + 60);
      w.y = Math.min(anchor.y + 28, A.h - w.h - 12);
    } else {
      const n = [...wins.values()].filter((o) => o.open && o.id !== w.id).length % 6;
      w.x = gl + 40 + n * 28;
      w.y = 18 + n * 26;
    }
    w.placed = true;
    fit(w);
  }

  function isVisible(id) {
    const w = wins.get(id);
    if (!w) return false;
    return phone ? stack.at(-1) === id : w.open && !w.min;
  }

  function topmost() {
    return [...order].reverse().find((id) => isVisible(id)) ?? null;
  }

  function restack() {
    order.forEach((id, i) => { wins.get(id).el.style.zIndex = String(10 + i); });
    const top = phone ? stack.at(-1) : topmost();
    for (const w of wins.values()) w.el.classList.toggle('is-active', w.id === top);
    root.dataset.app = phone ? top ?? '' : '';
    renderTasks();
  }

  /** Brings a window to the front. */
  function raise(id, { focus = false } = {}) {
    const w = wins.get(id);
    if (!w) return;
    if (order.at(-1) !== id) {
      order = [...order.filter((o) => o !== id), id];
      restack();
      emit({ type: 'focus', id });
    }
    if (focus) w.el.focus({ preventScroll: true });
  }

  function open(id, { focus = true, beside = null, animate = true } = {}) {
    const w = wins.get(id);
    if (!w) return;
    closeMenu();
    if (phone) return openApp(id, { focus, animate });
    const wasVisible = isVisible(id);
    if (!w.open) {
      w.open = true;
      if (!w.placed) place(w, beside);
      else fit(w);
      apply(w);
      if (!taskOrder.includes(id)) taskOrder.push(id);
    }
    w.el.hidden = false;
    if (w.min) {
      w.min = false;
      flyFromTask(w);
    } else if (!wasVisible && animate) {
      pulse(w.el, 'is-opening', 220);
    }
    raise(id, { focus });
    restack();
    emit({ type: 'open', id });
    save();
  }

  function close(id) {
    const w = wins.get(id);
    if (!w) return;
    if (phone) return closeApp(id);
    if (!w.open) return;
    w.open = false;
    w.min = false;
    taskOrder = taskOrder.filter((t) => t !== id);
    const hadFocus = w.el.contains(document.activeElement);
    const done = () => {
      w.el.classList.remove('is-closing');
      if (!w.open) w.el.hidden = true;
    };
    if (reducedMotion.matches) done();
    else {
      w.el.classList.add('is-closing');
      setTimeout(done, 150);
    }
    restack();
    if (hadFocus) focusAfterClose(id);
    emit({ type: 'close', id });
    save();
  }

  function minimize(id) {
    const w = wins.get(id);
    if (!w || phone || !w.open || w.min) return;
    const hadFocus = w.el.contains(document.activeElement);
    w.min = true;
    flyToTask(w);
    restack();
    if (hadFocus) focusAfterClose(id);
    emit({ type: 'min', id });
    save();
  }

  function toggleMax(id) {
    const w = wins.get(id);
    if (!w || phone) return;
    if (w.max) {
      Object.assign(w, w.prev ?? {}, { max: false });
    } else {
      const A = area();
      w.prev = { x: w.x, y: w.y, w: w.w, h: w.h };
      Object.assign(w, { x: 6, y: 6, w: A.w - 12, h: A.h - 12, max: true });
    }
    apply(w);
    raise(id);
    save();
  }

  function focusAfterClose(id) {
    const next = topmost();
    if (next) wins.get(next).el.focus({ preventScroll: true });
    else root.querySelector(`.dicon[data-open="${id}"]`)?.focus({ preventScroll: true });
  }

  // Minimize and restore fly to and from the window's taskbar button.
  function taskRect(w) {
    const btn = w.id === 'chat' ? chatTask : tasks.querySelector(`[data-task="${w.id}"]`);
    return (btn ?? chatTask).getBoundingClientRect();
  }

  function flyToTask(w) {
    const done = () => { if (w.min) w.el.hidden = true; };
    if (reducedMotion.matches || !w.el.animate) return done();
    const from = w.el.getBoundingClientRect();
    const to = taskRect(w);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const base = `translate(${w.x}px, ${w.y}px)`;
    w.el.animate(
      [{ transform: base, opacity: 1 }, { transform: `${base} translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0 }],
      { duration: 260, easing: 'cubic-bezier(.5, 0, .75, .3)' },
    ).finished.then(done, done);
  }

  function flyFromTask(w) {
    if (reducedMotion.matches || !w.el.animate) return;
    const to = w.el.getBoundingClientRect();
    const from = taskRect(w);
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const base = `translate(${w.x}px, ${w.y}px)`;
    w.el.animate(
      [{ transform: `${base} translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0 }, { transform: base, opacity: 1 }],
      { duration: 240, easing: 'cubic-bezier(.2, .8, .3, 1)' },
    );
  }

  // Moving: the title bar drags the window. Edges snap to the desktop and to
  // other windows, politely: only within a few pixels.
  function startMove(w, e) {
    if (phone || e.button !== 0 || e.target.closest('button, .win-proxy')) return;
    e.preventDefault();
    raise(w.id);
    const bar = w.bar;
    const start = { px: e.clientX, py: e.clientY, x: w.x, y: w.y };
    let moved = false;
    capture(bar, e.pointerId);
    const move = (ev) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      if (!moved && w.max) {
        // Dragging a maximized window restores it under the pointer.
        const ratio = (start.px - desk.getBoundingClientRect().left - w.x) / w.w;
        Object.assign(w, w.prev ?? {}, { max: false });
        start.x = start.px - desk.getBoundingClientRect().left - ratio * w.w;
        start.y = 0;
      }
      moved = true;
      w.el.classList.add('is-moving');
      const [x, y, snapped] = snap(w, start.x + dx, start.y + dy);
      w.x = x;
      w.y = y;
      w.el.classList.toggle('is-snapped', snapped);
      apply(w);
    };
    const end = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', end);
      bar.removeEventListener('pointercancel', end);
      w.el.classList.remove('is-moving', 'is-snapped');
      if (moved) {
        fit(w);
        apply(w);
        save();
      }
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  function snap(w, x, y) {
    const A = area();
    const xs = [6, A.w - w.w - 6];
    const ys = [6, A.h - w.h - 6];
    for (const o of wins.values()) {
      if (o === w || !isVisible(o.id)) continue;
      xs.push(o.x, o.x + o.w - w.w, o.x + o.w + GAP, o.x - w.w - GAP);
      ys.push(o.y, o.y + o.h - w.h, o.y + o.h + GAP, o.y - w.h - GAP);
    }
    let snapped = false;
    const near = (value, targets) => {
      let best = value;
      let distance = SNAP;
      for (const t of targets) {
        if (Math.abs(t - value) < distance) {
          best = t;
          distance = Math.abs(t - value);
        }
      }
      if (best !== value) snapped = true;
      return best;
    };
    x = near(x, xs);
    y = near(y, ys);
    x = Math.min(Math.max(x, -w.w + 96), A.w - 96);
    y = Math.min(Math.max(y, 0), A.h - BAR);
    return [Math.round(x), Math.round(y), snapped];
  }

  function startResize(w, edge, e) {
    if (phone || w.max || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    raise(w.id);
    const handle = e.currentTarget;
    const start = { px: e.clientX, py: e.clientY, x: w.x, y: w.y, w: w.w, h: w.h };
    const [minW, minH] = minSize(w.id);
    const A = area();
    capture(handle, e.pointerId);
    w.el.classList.add('is-resizing');
    const move = (ev) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      if (edge.includes('e')) w.w = Math.min(Math.max(minW, start.w + dx), A.w - start.x - 4);
      if (edge.includes('w')) {
        const x = Math.min(Math.max(start.x + dx, 4), start.x + start.w - minW);
        w.w = start.w + (start.x - x);
        w.x = x;
      }
      if (edge.includes('s')) w.h = Math.min(Math.max(minH, start.h + dy), A.h - start.y - 4);
      apply(w);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      w.el.classList.remove('is-resizing');
      save();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  // Phone: apps open full screen, one at a time, with a back button ---------

  function openApp(id, { focus = true, animate = true } = {}) {
    const w = wins.get(id);
    const wasTop = stack.at(-1) === id;
    stack = [...stack.filter((s) => s !== id), id];
    for (const o of wins.values()) o.el.hidden = o.id !== id;
    const previous = stack.at(-2);
    w.back.querySelector('span').textContent = previous ? wins.get(previous).name.replace(/\.\w+$/, '') : 'Home';
    if (!wasTop && animate) pulse(w.el, 'is-opening', 240);
    restack();
    if (focus) w.el.focus({ preventScroll: true });
    emit({ type: 'open', id });
    save();
  }

  function closeApp(id) {
    const w = wins.get(id);
    const hadFocus = w.el.contains(document.activeElement);
    stack = stack.filter((s) => s !== id);
    w.el.hidden = true;
    const next = stack.at(-1);
    if (next) {
      const n = wins.get(next);
      n.el.hidden = false;
      const previous = stack.at(-2);
      n.back.querySelector('span').textContent = previous ? wins.get(previous).name.replace(/\.\w+$/, '') : 'Home';
      if (hadFocus) n.el.focus({ preventScroll: true });
    } else if (hadFocus) {
      root.querySelector(`.dicon[data-open="${id}"]`)?.focus({ preventScroll: true });
    }
    restack();
    emit({ type: 'close', id });
    save();
  }

  function setPhone(on) {
    if (on === phone && root.dataset.mode) return;
    phone = on;
    root.dataset.mode = on ? 'phone' : 'desktop';
    root.classList.toggle('is-phone', on);
    if (on) {
      for (const w of wins.values()) w.el.hidden = w.id !== stack.at(-1);
    } else {
      for (const w of wins.values()) {
        w.el.hidden = !(w.open && !w.min);
        if (w.open) {
          if (!w.placed) place(w);
          fit(w);
          apply(w);
        }
      }
    }
    restack();
    renderIcons();
    emit({ type: 'mode', phone });
  }

  // Taskbar --------------------------------------------------------------------

  function renderTasks() {
    const top = phone ? stack.at(-1) : topmost();
    const items = taskOrder.filter((id) => id !== 'chat' && wins.get(id)?.open);
    const existing = new Map([...tasks.children].map((li) => [li.dataset.task, li]));
    const next = items.map((id) => {
      const w = wins.get(id);
      let li = existing.get(id);
      if (!li) {
        li = document.createElement('li');
        li.dataset.task = id;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mh-task';
        b.append(icon(w.el.dataset.icon), Object.assign(document.createElement('span'), { textContent: w.name }));
        b.addEventListener('click', () => toggleTask(id));
        li.append(b);
      }
      const b = li.firstChild;
      b.classList.toggle('is-active', top === id);
      b.classList.toggle('is-min', w.min);
      b.setAttribute('aria-label', `${w.name}${w.min ? ' (minimized)' : ''}`);
      return li;
    });
    tasks.replaceChildren(...next);
    chatTask.classList.toggle('is-active', top === 'chat');
    chatTask.classList.toggle('is-min', Boolean(wins.get('chat')?.min));
  }

  function toggleTask(id) {
    const w = wins.get(id);
    if (!phone && w.open && !w.min && topmost() === id) minimize(id);
    else open(id);
  }

  // Menus -------------------------------------------------------------------------

  for (const btn of root.querySelectorAll('.mh-menubtn[aria-haspopup]')) {
    const list = document.getElementById(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', () => (menu?.button === btn ? closeMenu() : openMenu(btn, list)));
    btn.addEventListener('pointerenter', () => { if (menu && menu.button !== btn) openMenu(btn, list); });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(btn, list);
        list.querySelector('[role="menuitem"]')?.focus();
      }
    });
    list.addEventListener('keydown', (e) => {
      const items = [...list.querySelectorAll('[role="menuitem"]')];
      const at = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') items[(at + 1) % items.length].focus();
      else if (e.key === 'ArrowUp') items[(at - 1 + items.length) % items.length].focus();
      else if (e.key === 'Home') items[0].focus();
      else if (e.key === 'End') items.at(-1).focus();
      else if (e.key === 'Escape') {
        closeMenu();
        btn.focus();
      } else if (e.key === 'Tab') closeMenu();
      else return;
      e.preventDefault();
    });
  }

  function openMenu(button, list) {
    closeMenu();
    menu = { button, list };
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    if (!menu) return;
    menu.list.hidden = true;
    menu.button.setAttribute('aria-expanded', 'false');
    menu = null;
  }

  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.list.contains(e.target) && !menu.button.contains(e.target)) closeMenu();
    if (!e.target.closest('.dicon')) for (const d of root.querySelectorAll('.dicon.is-selected')) d.classList.remove('is-selected');
  });

  // Anything with data-open opens that window: icons, menu items, the taskbar.
  root.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (!opener || !root.contains(opener)) return;
    if (opener.dataset.dragged) return void delete opener.dataset.dragged;
    const id = opener.dataset.open;
    if (opener === chatTask) return toggleTask('chat');
    open(id);
  });

  // Icons ---------------------------------------------------------------------------

  for (const d of root.querySelectorAll('.dicon')) {
    d.addEventListener('pointerdown', () => {
      for (const other of root.querySelectorAll('.dicon.is-selected')) other.classList.remove('is-selected');
      d.classList.add('is-selected');
    });
  }

  function renderIcons() {
    for (const d of root.querySelectorAll('.dicon')) {
      const o = !phone && iconOffsets[d.dataset.open];
      d.style.setProperty('--dx', o ? `${o[0]}px` : '0px');
      d.style.setProperty('--dy', o ? `${o[1]}px` : '0px');
    }
  }

  /** Desktop icons can be rearranged: drag.js calls this for a drop on the desktop. */
  function moveIcon(d, dx, dy) {
    if (phone) return;
    const id = d.dataset.open;
    const [ox, oy] = iconOffsets[id] ?? [0, 0];
    const home = d.getBoundingClientRect();
    const box = desk.getBoundingClientRect();
    // Keep it on the desktop, on an 8 px grid.
    let x = Math.round((ox + dx) / 8) * 8;
    let y = Math.round((oy + dy) / 8) * 8;
    x += Math.min(0, box.right - (home.right + x - ox)) - Math.min(0, home.left + x - ox - box.left);
    y += Math.min(0, box.bottom - (home.bottom + y - oy)) - Math.min(0, home.top + y - oy - box.top);
    iconOffsets[id] = [x, y];
    renderIcons();
    save();
  }

  // Finding and showing things --------------------------------------------------------

  const namesOf = (el) => [el.dataset.ask, ...(el.dataset.alias?.split('|') ?? [])].filter(Boolean).map(normalizeName);

  function findWindow(name) {
    const n = normalizeName(name);
    if (!n) return null;
    for (const w of wins.values()) if (w.names.some((x) => normalizeName(x) === n)) return w;
    return null;
  }

  function findItem(w, name) {
    const n = normalizeName(name);
    if (!n) return null;
    const items = [...w.el.querySelectorAll('[data-ask]')];
    return items.find((el) => namesOf(el).includes(n))
      ?? items.find((el) => namesOf(el).some((x) => x.length >= 4 && (x.startsWith(n) || n.startsWith(x))))
      ?? (n.length >= 5 ? items.find((el) => namesOf(el).some((x) => x.includes(n))) : null)
      ?? items.find((el) => namesOf(el).some((x) => x.length >= 6 && n.includes(x)))
      ?? null;
  }

  /**
   * "Pricing.sheet: Session replay" → { win: 'pricing', el: <tr>, label }. A known
   * window with an unknown row still opens the window. Unknown names → null.
   */
  function resolve(name) {
    const [first, rest] = splitRef(String(name ?? ''));
    const w = findWindow(first);
    if (w) {
      const el = rest ? findItem(w, rest) : null;
      return { win: w.id, el, label: el ? `${w.name} › ${el.dataset.ask}` : w.name };
    }
    for (const o of wins.values()) {
      const el = findItem(o, name);
      if (el) return { win: o.id, el, label: `${o.name} › ${el.dataset.ask}` };
    }
    return null;
  }

  /** Opens the target's window and lights up the row. focus: false keeps the keyboard where it is. */
  function reveal(target, { focus = true, beside = null } = {}) {
    if (!target || !wins.has(target.win)) return;
    const id = target.win;
    if (phone) openApp(id, { focus });
    else {
      open(id, { focus, beside });
      if (!focus && beside && isVisible(beside)) raise(beside);
    }
    const el = target.el;
    if (!el) return;
    const panel = el.closest('[role="tabpanel"]');
    if (panel?.hidden) root.querySelector(`[aria-controls="${panel.id}"]`)?.click();
    requestAnimationFrame(() => {
      scrollIntoWindow(el);
      pulse(el, 'is-flash', 1900);
      emit({ type: 'reveal', id, el });
    });
  }

  function scrollIntoWindow(el) {
    const body = el.closest('.win-body');
    if (!body) return;
    const b = body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const sticky = body.querySelector('.win-toolbar, .sheet-formula, .doc-ruler')?.offsetHeight ?? 0;
    if (r.top >= b.top + sticky && r.bottom <= b.bottom) return;
    body.scrollTo({ top: body.scrollTop + r.top - b.top - sticky - Math.max(0, (b.height - sticky - r.height) / 3), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }

  /** What a reply or an attachment can say about a window or icon being dragged. */
  function appPayload(id) {
    const w = wins.get(id);
    return w ? { source: w.name, item: '', value: w.kind === 'file' ? 'file' : 'app', icon: w.el.dataset.icon } : null;
  }

  function windowOf(el) {
    const winEl = el.closest('.win');
    return winEl ? wins.get(winEl.dataset.win) : null;
  }

  // Layout -------------------------------------------------------------------------

  /** The scene a first visit sees, sized to the screen: a chart, the price sheet and Chat. */
  function firstLayout() {
    const A = area();
    const [gl, gr] = gutters();
    const set = (id, x, y, w, h) => Object.assign(wins.get(id), { open: true, min: false, max: false, placed: true, x, y, w, h });
    const inner = A.w - gl - gr;
    if (inner >= 820) {
      // On big screens the scene keeps together in the middle.
      const W = Math.min(inner, 1320);
      const x0 = gl + Math.round((inner - W) / 2);
      const short = A.h < 700;
      const y0 = short ? 10 : Math.max(14, Math.round((A.h - 740) / 2));
      // Chat on the right, leaving room under it for the mole to talk.
      const chatW = Math.min(390, Math.max(340, Math.round(W * 0.32)));
      const chatX = x0 + W - chatW - 4;
      const chatH = Math.min(660, A.h - y0 - (short ? 72 : 90));
      set('chat', chatX, y0, chatW, chatH);
      // A chart at the top left, the price sheet overlapping its lower half.
      const left = x0 + 6;
      const room = chatX - left - 18;
      const paW = Math.min(600, room - 40);
      // On short screens the sheet shows its first rows, so the chart stays in view.
      const paH = short ? Math.round(A.h * 0.6) : Math.round(Math.min(372, Math.max(290, A.h * 0.5)));
      set('analytics', left, y0 + 4, paW, paH);
      const prY = short ? A.h - 262 : y0 + Math.max(136, Math.round(Math.min(paH - 70, A.h - y0 - 336)));
      const prX = left + Math.max(0, Math.min(56, room - 640));
      set('pricing', prX, prY, Math.min(640, room - (prX - left)), Math.min(348, A.h - prY - 12));
      taskOrder = ['analytics', 'pricing', 'chat'];
      order = ['analytics', 'pricing', 'chat'];
      stickyAt(left + paW + 14, y0 + 16, chatX - (left + paW) - 26);
    } else {
      // Tablets: the price sheet on top, Chat below it, room for the mole under Chat.
      const x = gl + 4;
      const w = A.w - gl - gr - 10;
      const topH = Math.round(A.h * 0.42);
      set('pricing', x, 10, w, topH);
      set('chat', x, topH + 22, w, A.h - topH - 104);
      taskOrder = ['pricing', 'chat'];
      order = ['pricing', 'chat'];
      stickyAt(-999, 0, 0);
    }
  }

  function stickyAt(x, y, room) {
    const sticky = root.querySelector('.sticky');
    if (!sticky) return;
    sticky.hidden = room < 180;
    sticky.style.setProperty('--sx', `${Math.round(x + Math.max(0, (room - 196) / 2))}px`);
    sticky.style.setProperty('--sy', `${Math.round(y)}px`);
  }

  function restore() {
    const data = saved.wins;
    const sameScreen = saved.area && Math.abs(saved.area.w - area().w) < 240 && Math.abs(saved.area.h - area().h) < 200;
    if (data && sameScreen) {
      for (const [id, s] of Object.entries(data)) {
        const w = wins.get(id);
        // A window that was never opened has no size yet: it gets placed when it opens.
        const placed = s.w > 0 && s.h > 0;
        if (w) Object.assign(w, { open: Boolean(s.open) && placed, min: Boolean(s.min), max: Boolean(s.max), placed, x: s.x, y: s.y, w: s.w, h: s.h, prev: s.prev ?? null });
      }
      order = (saved.order ?? []).filter((id) => wins.has(id));
      taskOrder = (saved.tasks ?? []).filter((id) => wins.has(id));
      if (saved.sticky) stickyAt(saved.sticky[0], saved.sticky[1], saved.sticky[2]);
    } else {
      firstLayout();
    }
    stack = (saved.stack ?? []).filter((id) => wins.has(id));
    for (const w of wins.values()) if (!order.includes(w.id)) order.unshift(w.id);
  }

  // Storage ------------------------------------------------------------------------

  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = {
        ...load(),
        area: area(),
        wins: Object.fromEntries([...wins.values()].map((w) => [w.id, { open: w.open, min: w.min, max: w.max, x: w.x, y: w.y, w: w.w, h: w.h, prev: w.prev }])),
        order,
        tasks: taskOrder,
        stack,
        icons: iconOffsets,
        sticky: stickyState(),
      };
      store(data);
    }, 120);
  }

  function stickyState() {
    const s = root.querySelector('.sticky');
    if (!s || s.hidden) return [-999, 0, 0];
    return [parseFloat(s.style.getPropertyValue('--sx')) || 0, parseFloat(s.style.getPropertyValue('--sy')) || 0, 196];
  }

  // Small things ---------------------------------------------------------------------

  function emit(event) {
    for (const fn of listeners) fn(event);
  }

  function pulse(el, className, ms) {
    if (reducedMotion.matches && className !== 'is-flash') return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    clearTimeout(el[`_${className}`]);
    el[`_${className}`] = setTimeout(() => el.classList.remove(className), ms);
  }

  function toast(text) {
    root.querySelector('.mh-toast')?.remove();
    const t = document.createElement('p');
    t.className = 'mh-toast';
    t.setAttribute('role', 'status');
    t.textContent = text;
    root.append(t);
    setTimeout(() => t.remove(), 3400);
  }

  function announce(text) {
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 60);
  }

  for (const b of root.querySelectorAll('[data-toast]')) b.addEventListener('click', () => toast(b.dataset.toast));

  // Theme and clock ----------------------------------------------------------------

  const themeBtn = root.querySelector('.mh-theme');
  function setTheme(theme) {
    root.dataset.theme = theme;
    themeBtn.setAttribute('aria-pressed', String(theme === 'dark'));
    themeBtn.title = theme === 'dark' ? 'Light desktop' : 'Dark desktop';
    themeBtn.setAttribute('aria-label', 'Dark desktop');
  }
  // Molehill's desktop is beige unless the visitor flips the switch.
  setTheme(saved.theme === 'dark' ? 'dark' : 'light');
  themeBtn.addEventListener('click', () => {
    setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
    store({ ...load(), theme: root.dataset.theme });
  });

  const clock = root.querySelector('.mh-clock');
  const long = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const short = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  function renderClock() {
    const now = new Date();
    clock.textContent = (phone ? short : long).format(now);
    clock.dateTime = now.toISOString();
  }
  (function tick() {
    renderClock();
    setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
  })();

  // Start --------------------------------------------------------------------------

  const phoneQuery = matchMedia(PHONE_QUERY);
  restore();
  setPhone(phoneQuery.matches);
  renderClock();
  if (!phone) for (const w of wins.values()) if (w.open) { fit(w); apply(w); }
  restack();
  root.classList.add('is-ready');
  phoneQuery.addEventListener('change', (e) => {
    setPhone(e.matches);
    renderClock();
  });
  addEventListener('resize', () => {
    if (phone) return;
    for (const w of wins.values()) {
      if (!w.open) continue;
      if (w.max) {
        const A = area();
        Object.assign(w, { x: 6, y: 6, w: A.w - 12, h: A.h - 12 });
      } else fit(w);
      apply(w);
    }
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  return {
    root,
    open,
    close,
    minimize,
    raise,
    reveal,
    resolve,
    isVisible,
    appPayload,
    windowOf,
    moveIcon,
    toast,
    announce,
    get phone() { return phone; },
    get top() { return phone ? stack.at(-1) ?? null : topmost(); },
    window: (id) => wins.get(id),
    /** For the prompt: what's on screen right now, topmost first. */
    openNames: () => (phone ? [...stack].reverse() : [...order].reverse().filter((id) => isVisible(id))).map((id) => wins.get(id).name),
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    storage: { load, store },
  };
}

// Pointer capture keeps a move or resize going outside the window; a pointer
// that's already gone can't be captured, and that's fine.
function capture(el, pointerId) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Nothing to capture.
  }
}

function button(className, html, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.innerHTML = html;
  b.setAttribute('aria-label', label);
  return b;
}

// This page's own UI state, in the tab's sessionStorage. Storage can be denied;
// the desktop still works, it just forgets on reload.
function storage() {
  try {
    if (window.top !== window.self) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function load() {
  try {
    const value = JSON.parse(storage()?.getItem(STORE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function store(data) {
  try {
    storage()?.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // Full or denied: fine.
  }
}
