// Drag anything onto Chat to ask about it.
//
// Anything with data-ask (or data-ask-app, for a whole app or file) can be
// picked up. Pointer events do the work instead of native drag and drop: the
// ghost looks the way we want, touch gets a long press instead of fighting the
// page's scrolling, and a headless browser can test it. Every drag has a path
// without dragging too: the hover "Ask" pill, a right-click or ⋯ menu,
// Enter on a focused item, and a tap on phones.

import { icon } from './icons.js';
import { attachmentLabel } from './message-format.js';

const LONG_PRESS = 380; // ms a finger rests before the item lifts
const MOUSE_SLOP = 5; // px a mouse moves before a press becomes a drag
const TOUCH_SLOP = 9; // px a finger moves before a press becomes a scroll
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

export function initDrag({ root, desktop, chat }) {
  let press = null; // a pointer is down on something draggable
  let drag = null; // it's being dragged
  let menu = null; // the open ⋯ menu: { el, list, returnTo }
  let hovered = null; // the item the Ask pill belongs to
  let selected = null; // tapped or clicked item
  let suppressClickUntil = 0;
  let nativeSource = null; // the window a native text drag started in

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'ask-pill';
  pill.tabIndex = -1;
  pill.setAttribute('aria-hidden', 'true');
  pill.hidden = true;
  pill.append(icon('chat'), Object.assign(document.createElement('span'), { textContent: 'Ask' }));
  root.append(pill);

  // Long texts drag by a grip, so their words stay selectable.
  for (const el of root.querySelectorAll('[data-ask-handle]')) {
    const grip = document.createElement('span');
    grip.className = 'ask-grip';
    grip.setAttribute('aria-hidden', 'true');
    el.prepend(grip);
  }
  prepareFocus(root);

  // Payloads ---------------------------------------------------------------------

  /** What an element carries: { source, item, value, icon }. Charts compute theirs. */
  function payloadOf(el, event) {
    if (typeof el.askPayload === 'function') return el.askPayload(event);
    if (el.dataset.askApp) return desktop.appPayload(el.dataset.askApp);
    const w = desktop.windowOf(el);
    return {
      source: el.dataset.askSource || w?.name || 'Molehill',
      item: el.dataset.ask || '',
      value: el.dataset.val || '',
      icon: el.dataset.askIcon || w?.el.dataset.icon || 'file',
    };
  }

  function draggableFrom(target) {
    if (!(target instanceof Element)) return null;
    if (target.closest('input, textarea, select, a[href], .toggle, .win-btn, .win-back, .ask-pill, .ctx-menu, [data-no-drag]')) return null;
    const grip = target.closest('.ask-grip');
    if (grip) return grip.closest('[data-ask]');
    const el = target.closest('[data-ask], [data-ask-app]');
    if (!el || !root.contains(el) || el.hasAttribute('data-ask-handle')) return null;
    return el;
  }

  // Pointer: press, lift, drag, drop ---------------------------------------------

  root.addEventListener('pointerdown', (e) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = draggableFrom(e.target);
    if (!el) return;
    const touch = e.pointerType !== 'mouse' && e.pointerType !== 'pen';
    press = { el, id: e.pointerId, x: e.clientX, y: e.clientY, touch, lifted: false, timer: 0, event: e };
    if (touch) press.timer = setTimeout(lift, LONG_PRESS);
  });

  function lift() {
    if (!press) return;
    press.lifted = true;
    press.el.classList.add('is-lifted');
    navigator.vibrate?.(8);
  }

  addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) return moveDrag(e.clientX, e.clientY);
    if (!press || e.pointerId !== press.id) return;
    const distance = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.touch) {
      if (!press.lifted && distance > TOUCH_SLOP) endPress();
      else if (press.lifted && distance > 4) begin(e);
    } else if (distance > MOUSE_SLOP) {
      begin(e);
    }
  });

  addEventListener('pointerup', (e) => {
    if (drag && e.pointerId === drag.id) return drop(e.clientX, e.clientY);
    if (!press || e.pointerId !== press.id) return;
    const { el, touch, lifted } = press;
    endPress();
    if (touch && lifted) {
      // Pressed and held without moving: the item's menu, like a long press anywhere.
      suppressClickUntil = Date.now() + 400;
      openMenu(el, { x: e.clientX, y: e.clientY });
    } else if (el.matches('.win-proxy')) {
      // A window's title-bar icon: its menu, like a proxy icon.
      openMenu(el, null);
    } else {
      select(el, touch ? 'touch' : 'mouse');
    }
  });

  addEventListener('pointercancel', (e) => {
    if (drag && e.pointerId === drag.id) cancel();
    else if (press && e.pointerId === press.id) endPress();
  });

  // Once an item has lifted, the finger drags it instead of scrolling the page.
  document.addEventListener('touchmove', (e) => { if ((press?.lifted || drag) && e.cancelable) e.preventDefault(); }, { passive: false });

  // A drag ends with a pointerup on the dragged element: don't let it click too.
  addEventListener('click', (e) => {
    if (Date.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  root.addEventListener('contextmenu', (e) => {
    const el = draggableFrom(e.target);
    if (!el) return;
    e.preventDefault();
    if (press?.touch || Date.now() < suppressClickUntil) return; // the long press handles it
    openMenu(el, { x: e.clientX, y: e.clientY });
  });

  function endPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press.el.classList.remove('is-lifted');
    press = null;
  }

  function begin(e) {
    const p = press;
    endPress();
    const payload = payloadOf(p.el, p.event);
    if (!payload) return;
    hidePill();
    closeMenu({ restore: false });
    const ghost = makeGhost(payload);
    root.append(ghost);
    drag = {
      id: p.id, el: p.el, payload, ghost, target: null,
      from: p.el.getBoundingClientRect(), start: { x: p.x, y: p.y },
      icon: p.el.matches('.dicon') ? p.el : null,
    };
    try { p.el.setPointerCapture(p.id); } catch { /* the pointer may be gone already */ }
    root.classList.add('is-dragging');
    p.el.classList.add('is-picked');
    // Dragging content summons Chat if it's closed; icons may just be rearranged.
    if (!drag.icon && !desktop.phone && !chat.isVisible()) desktop.open('chat', { focus: false });
    chat.dragState({ active: true, payload });
    moveDrag(e.clientX, e.clientY);
    desktop.announce(`Picked up ${attachmentLabel(payload)}. Drop it on Chat to ask about it, or press Escape.`);
  }

  function moveDrag(x, y) {
    drag.ghost.style.transform = `translate(${x + 14}px, ${y + 12}px)`;
    const hit = document.elementFromPoint(x, y)?.closest('[data-drop]');
    const target = hit && root.contains(hit) ? hit : null;
    if (target !== drag.target) {
      drag.target?.classList.remove('is-drop');
      target?.classList.add('is-drop');
      drag.target = target;
      drag.ghost.classList.toggle('is-over', Boolean(target));
      chat.dragState({ active: true, over: Boolean(target), payload: drag.payload });
    }
  }

  function drop(x, y) {
    const d = drag;
    finishDrag();
    if (d.target) {
      if (!chat.isVisible()) desktop.open('chat', { focus: false });
      const chip = chat.attach(d.payload, { via: 'drag' });
      landGhost(d.ghost, chip);
      chat.focusComposer();
      return;
    }
    const onDesktop = !document.elementFromPoint(x, y)?.closest('.win, .mh-menubar, .mh-taskbar, .mh-molehill');
    if (d.icon && onDesktop) {
      desktop.moveIcon(d.icon, x - d.start.x, y - d.start.y);
      d.ghost.remove();
      return;
    }
    returnGhost(d.ghost, d.from);
  }

  function cancel() {
    if (!drag) return;
    const d = drag;
    finishDrag();
    returnGhost(d.ghost, d.from);
    desktop.announce('Drag cancelled.');
  }

  function finishDrag() {
    const d = drag;
    drag = null;
    suppressClickUntil = Date.now() + 350;
    root.classList.remove('is-dragging');
    d.el.classList.remove('is-picked');
    d.target?.classList.remove('is-drop');
    try { d.el.releasePointerCapture(d.id); } catch { /* already released */ }
    chat.dragState({ active: false });
  }

  function returnGhost(ghost, rect) {
    if (reduced.matches || !ghost.animate) return ghost.remove();
    const from = ghost.getBoundingClientRect();
    ghost.animate(
      [
        { transform: `translate(${from.left}px, ${from.top}px)`, opacity: 1 },
        { transform: `translate(${rect.left}px, ${rect.top}px) scale(.9)`, opacity: 0 },
      ],
      { duration: 220, easing: 'cubic-bezier(.4, 0, .6, 1)', fill: 'forwards' },
    ).finished.then(() => ghost.remove(), () => ghost.remove());
  }

  // Asking without dragging --------------------------------------------------------

  /** Attaches an item: from the keyboard, the ⋯ menu, the Ask pill or a tap. */
  function ask(el, via) {
    const payload = payloadOf(el);
    if (!payload) return;
    const from = el.getBoundingClientRect();
    if (!desktop.phone && !chat.isVisible()) desktop.open('chat', { focus: false });
    const chip = chat.attach(payload, { via, returnTo: el });
    if (desktop.phone) return;
    if (chip && !reduced.matches) {
      const ghost = makeGhost(payload);
      ghost.style.transform = `translate(${from.left + Math.min(40, from.width / 3)}px, ${from.top}px)`;
      root.append(ghost);
      requestAnimationFrame(() => landGhost(ghost, chip));
    }
    chat.focusComposer({ returnTo: via === 'keyboard' ? el : null });
  }

  root.addEventListener('keydown', (e) => {
    if (drag && e.key === 'Escape') {
      e.preventDefault();
      return cancel();
    }
    const el = e.target;
    if (!(el instanceof Element) || !el.matches('[data-ask], [data-ask-app]') || !root.contains(el)) return;
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      openMenu(el, null);
    } else if ((e.key === 'Enter' || e.key === ' ') && !el.matches('button, a, input, [data-ask-app]')) {
      e.preventDefault();
      ask(el, 'keyboard');
    } else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      roam(el, e);
    }
  });

  // Arrow keys move between the items of a list, a table or a chart.
  function roam(el, e) {
    const group = el.closest('[data-ask-group]');
    if (!group) return;
    const items = [...group.querySelectorAll('[data-ask]')].filter((x) => x.closest('[data-ask-group]') === group);
    const at = items.indexOf(el);
    if (at === -1) return;
    const row = group.hasAttribute('data-ask-row');
    const forward = row ? ['ArrowRight'] : ['ArrowDown', 'ArrowRight'];
    const back = row ? ['ArrowLeft'] : ['ArrowUp', 'ArrowLeft'];
    let next = null;
    if (forward.includes(e.key)) next = items[at + 1];
    else if (back.includes(e.key)) next = items[at - 1];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items.at(-1);
    if (!next) return;
    e.preventDefault();
    el.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  }

  // The ⋯ menu ------------------------------------------------------------------------

  function openMenu(el, at) {
    closeMenu({ restore: false });
    hidePill();
    const payload = payloadOf(el);
    if (!payload) return;
    const list = document.createElement('div');
    list.className = 'ctx-menu';
    list.setAttribute('role', 'menu');
    list.setAttribute('aria-label', attachmentLabel(payload));
    const title = document.createElement('p');
    title.className = 'ctx-title';
    title.textContent = attachmentLabel(payload);
    list.append(title);
    const item = (label, hint, action) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.append(Object.assign(document.createElement('span'), { textContent: label }));
      if (hint) b.append(Object.assign(document.createElement('kbd'), { textContent: hint }));
      b.addEventListener('click', () => {
        closeMenu({ restore: false });
        action();
      });
      list.append(b);
    };
    item('Ask about this', desktop.phone ? '' : 'Enter', () => ask(el, 'menu'));
    const app = el.dataset.askApp;
    if (app && app !== desktop.windowOf(el)?.el.dataset.win) item(`Open ${payload.source}`, '', () => desktop.open(app));
    item('Copy as text', '', () => copy(payload));
    root.append(list);
    const box = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const w = list.offsetWidth;
    const h = list.offsetHeight;
    let x = (at ? at.x : r.left + 12) - box.left;
    let y = (at ? at.y : r.bottom) - box.top + 4;
    if (x + w > box.width - 8) x = box.width - w - 8;
    if (y + h > box.height - 8) y = (at ? at.y : r.top) - box.top - h - 4;
    list.style.left = `${Math.max(8, x)}px`;
    list.style.top = `${Math.max(8, y)}px`;
    menu = { el, list };
    list.querySelector('[role="menuitem"]').focus();
    list.addEventListener('keydown', (e) => {
      const items = [...list.querySelectorAll('[role="menuitem"]')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') items[(i + 1) % items.length].focus();
      else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length].focus();
      else if (e.key === 'Escape' || e.key === 'Tab') closeMenu();
      else return;
      e.preventDefault();
    });
  }

  function closeMenu({ restore = true } = {}) {
    if (!menu) return;
    const { list, el } = menu;
    menu = null;
    list.remove();
    if (restore && el.isConnected) el.focus({ preventScroll: true });
  }

  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.list.contains(e.target)) closeMenu({ restore: false });
    if (selected && !selected.contains(e.target) && !pill.contains(e.target)) deselect();
  });

  async function copy(payload) {
    const text = [attachmentLabel(payload), payload.value].filter(Boolean).join(': ');
    try {
      await navigator.clipboard.writeText(text);
      desktop.toast('Copied.');
    } catch {
      desktop.toast(text);
    }
  }

  // The Ask pill: hover (or tap, or focus) shows it at the item's end ------------------

  root.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || drag || press) return;
    const el = pillTarget(e.target);
    if (el) {
      if (!selected || selected === el) showPill(el, 'mouse');
    } else if (!pill.contains(e.target) && !selected) hidePill();
  });
  root.addEventListener('pointerleave', () => { if (!selected) hidePill(); });
  root.addEventListener('focusin', (e) => {
    const el = pillTarget(e.target);
    if (el && e.target === el && el.matches(':focus-visible')) showPill(el, 'keyboard');
  });
  root.addEventListener('scroll', () => {
    if (hovered && (selected || document.activeElement === hovered)) placePill(hovered);
    else hidePill();
  }, true);
  pill.addEventListener('click', () => {
    const el = hovered;
    deselect();
    hidePill();
    if (el?.isConnected) ask(el, 'pill');
  });

  function pillTarget(target) {
    if (!(target instanceof Element)) return null;
    const el = target.closest('[data-ask]');
    return el && el.closest('.win-body') && root.contains(el) ? el : null;
  }

  // mouse: a small "Ask" at the item's end. keyboard: the same, with the key.
  // touch: a bigger "Ask about this" just under the item, where a thumb expects it.
  function showPill(el, mode = 'mouse') {
    hovered = el;
    pill.dataset.mode = mode;
    // Spreadsheet rows keep their cells readable: the pill shrinks into the row number.
    pill.toggleAttribute('data-compact', mode !== 'touch' && Boolean(el.querySelector(':scope > .rn')));
    pill.lastChild.textContent = mode === 'touch' ? 'Ask about this' : mode === 'keyboard' ? '↵ Ask' : 'Ask';
    pill.title = pill.hasAttribute('data-compact') ? 'Ask about this row' : '';
    pill.hidden = false;
    placePill(el);
  }

  function placePill(el) {
    const body = el.closest('.win-body');
    if (!body || !el.isConnected) return hidePill();
    const b = body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    const pw = pill.offsetWidth || 64;
    const ph = pill.offsetHeight || 24;
    const top = Math.max(r.top, b.top);
    const bottom = Math.min(r.bottom, b.bottom);
    if (bottom - top < 12 || r.right < b.left || r.left > b.right) return void (pill.hidden = true);
    let x;
    let y;
    if (pill.dataset.mode === 'touch') {
      x = (Math.max(r.left, b.left) + Math.min(r.right, b.right)) / 2 - pw / 2;
      y = r.bottom + ph + 8 < b.bottom ? r.bottom + 6 : r.top - ph - 6;
    } else if (el.dataset.pill === 'bottom') {
      // Tall, narrow things like a chart's week: the pill sits at the foot.
      x = r.left + r.width / 2 - pw / 2;
      y = bottom - ph - 4;
    } else if (pill.hasAttribute('data-compact')) {
      const rn = el.querySelector(':scope > .rn').getBoundingClientRect();
      x = rn.left + rn.width / 2 - pw / 2;
      y = (top + bottom) / 2 - ph / 2;
    } else {
      const inside = r.width > pw * 2.6;
      x = inside ? Math.min(r.right, b.right) - pw - 6 : Math.min(r.right + 6, b.right - pw - 4);
      y = (top + bottom) / 2 - ph / 2;
    }
    x = Math.max(b.left + 4, Math.min(x, b.right - pw - 4));
    y = Math.max(b.top + 2, Math.min(y, b.bottom - ph - 2));
    pill.style.transform = `translate(${Math.round(x - box.left)}px, ${Math.round(y - box.top)}px)`;
    pill.hidden = false;
  }

  function hidePill() {
    pill.hidden = true;
    hovered = null;
  }

  function select(el, mode) {
    deselect();
    if (!el.closest('.win-body')) return;
    selected = el;
    el.classList.add('is-selected');
    showPill(el, mode);
  }

  function deselect() {
    selected?.classList.remove('is-selected');
    selected = null;
  }

  // Native drags: text selected anywhere on the page can be dropped as a quote -------

  document.addEventListener('dragstart', (e) => {
    const node = e.target instanceof Element ? e.target : e.target?.parentElement;
    nativeSource = node?.closest?.('.win') ?? null;
  });
  document.addEventListener('dragend', () => { nativeSource = null; });

  let depth = 0;
  const quote = (text) => ({
    source: nativeSource ? desktop.windowOf(nativeSource)?.name ?? 'Selected text' : 'Selected text',
    item: 'Quote',
    value: text,
    icon: nativeSource?.dataset.icon ?? 'txt',
  });
  for (const target of root.querySelectorAll('[data-drop]')) {
    target.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer?.types.includes('text/plain')) return;
      e.preventDefault();
      if (depth++ === 0) {
        target.classList.add('is-drop');
        chat.dragState({ active: true, over: true, payload: quote('') });
      }
    });
    target.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('text/plain')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    target.addEventListener('dragleave', () => {
      if (--depth > 0) return;
      depth = 0;
      target.classList.remove('is-drop');
      chat.dragState({ active: false });
    });
    target.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      target.classList.remove('is-drop');
      chat.dragState({ active: false });
      const text = e.dataTransfer.getData('text/plain').replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (!chat.isVisible()) desktop.open('chat');
      chat.attach(quote(text), { via: 'text' });
      chat.focusComposer();
    });
  }

  return {
    ask,
    payloadOf,
    get dragging() { return Boolean(drag); },
    refreshFocus: () => prepareFocus(root),
  };
}

/** The card that follows the pointer: the outer box moves, the inner one tilts. */
export function makeGhost(payload) {
  const g = document.createElement('div');
  g.className = 'drag-ghost';
  g.setAttribute('aria-hidden', 'true');
  const card = document.createElement('div');
  card.className = 'dg';
  const text = document.createElement('span');
  const label = document.createElement('b');
  label.textContent = attachmentLabel(payload);
  text.append(label);
  if (payload.value) text.append(Object.assign(document.createElement('small'), { textContent: payload.value }));
  card.append(icon(payload.icon || 'file'), text);
  g.append(card);
  return g;
}

/** Flies a ghost into the chip it became, then removes it. */
export function landGhost(ghost, chip) {
  const to = chip?.getBoundingClientRect();
  if (!to?.width || reduced.matches || !ghost.animate) return ghost.remove();
  const from = ghost.getBoundingClientRect();
  const scale = Math.min(1, to.width / Math.max(1, from.width));
  ghost.animate(
    [
      { transform: `translate(${from.left}px, ${from.top}px)`, opacity: 1 },
      { transform: `translate(${to.left}px, ${to.top}px) scale(${scale})`, opacity: 0.15 },
    ],
    { duration: 240, easing: 'cubic-bezier(.3, .7, .4, 1)', fill: 'forwards' },
  ).finished.then(() => ghost.remove(), () => ghost.remove());
}

// Every askable thing is reachable by keyboard: groups get one tab stop and
// arrow keys; loners get a tab stop of their own. A shared description says
// what Enter does.
function prepareFocus(root) {
  let hint = root.querySelector('#ask-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.id = 'ask-hint';
    hint.hidden = true;
    hint.textContent = 'Press Enter to ask about this in Chat, or Shift+F10 for more.';
    root.append(hint);
  }
  for (const group of root.querySelectorAll('[data-ask-group]')) {
    const items = [...group.querySelectorAll('[data-ask]')].filter((x) => x.closest('[data-ask-group]') === group);
    const current = items.find((x) => x.tabIndex === 0) ?? items[0];
    for (const x of items) x.tabIndex = x === current ? 0 : -1;
  }
  for (const el of root.querySelectorAll('[data-ask]')) {
    if (el.matches('button, a')) continue;
    if (!el.closest('[data-ask-group]') && el.tabIndex < 0) el.tabIndex = 0;
    const described = el.getAttribute('aria-describedby') ?? '';
    if (!described.includes('ask-hint')) el.setAttribute('aria-describedby', `${described} ask-hint`.trim());
    el.setAttribute('aria-keyshortcuts', 'Enter Shift+F10');
  }
}
