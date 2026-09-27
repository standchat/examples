// The first visit's demonstration: a pointer picks up the Session replay row
// of Pricing.sheet, carries it across the desktop and holds it over Chat while
// the mole explains, then lets go. Nothing is attached, let alone sent: the
// row lands as a suggestion marked "Demo", which joins the next message only
// if the visitor clicks it. Any click, key or wheel skips the demonstration,
// and with reduced motion there's no flight at all.

import { landGhost, makeGhost } from './drag.js';

export function playIntro({ root, desktop, chat, mole, drag }) {
  const row = root.querySelector('#win-pricing tr[data-ask="Session replay"]');
  const chatWin = root.querySelector('#win-chat');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!row || desktop.phone || !desktop.isVisible('pricing') || !desktop.isVisible('chat')) {
    setTimeout(() => mole.peek(), 500);
    return;
  }

  const payload = drag.payloadOf(row);
  const timers = [];
  let stopped = false;
  let suggested = false;
  let ghost = null;
  const later = (ms, fn) => timers.push(setTimeout(() => { if (!stopped) fn(); }, ms));

  // A dotted trail behind the ghost, so even a still frame reads as a drag.
  const trail = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  trail.setAttribute('class', 'demo-trail');
  trail.setAttribute('aria-hidden', 'true');
  const trailPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  trail.append(trailPath);

  const pointer = document.createElement('div');
  pointer.className = 'demo-pointer';
  pointer.setAttribute('aria-hidden', 'true');
  pointer.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8.2 11.2V4.6a1.6 1.6 0 1 1 3.2 0v5.2l.2-1.1a1.6 1.6 0 0 1 3.1.2l.1.9.2-.6a1.6 1.6 0 0 1 3 .6v.8a1.5 1.5 0 0 1 2.9.5v4.3c0 3.8-2.7 6.6-6.4 6.6h-1.3c-2.1 0-3.7-.9-4.9-2.5l-3.2-4.5a1.6 1.6 0 0 1 2.6-1.9z"/></svg>';

  function finish({ suggest = true } = {}) {
    if (stopped) return;
    stopped = true;
    timers.forEach(clearTimeout);
    removeEventListener('pointerdown', interrupt, true);
    removeEventListener('keydown', interrupt, true);
    removeEventListener('wheel', interrupt, true);
    row.classList.remove('is-picked');
    chat.dragState({ active: false });
    pointer.remove();
    trail.remove();
    ghost?.remove();
    mole.hush();
    mole.peek();
    if (suggest && !suggested) {
      suggested = true;
      chat.suggest(payload);
    }
  }
  // The visitor takes over. The suggestion stays only if the demo was already over Chat.
  const interrupt = () => finish({ suggest: chatWin.classList.contains('is-over') });
  addEventListener('pointerdown', interrupt, true);
  addEventListener('keydown', interrupt, true);
  addEventListener('wheel', interrupt, true);

  later(450, () => mole.peek());
  if (reduced) {
    later(800, () => {
      finish();
      mole.speak('Drag anything onto Chat to ask about it.', 6000);
    });
    return;
  }

  const box = () => root.getBoundingClientRect();
  const at = (x, y) => `translate(${x - box().left}px, ${y - box().top}px)`;
  const grabPoint = () => {
    const r = row.getBoundingClientRect();
    return { x: r.left + Math.min(150, r.width * 0.28), y: r.top + r.height / 2 };
  };

  later(900, () => {
    const p = grabPoint();
    pointer.style.transform = at(p.x + 40, p.y + 34);
    root.append(pointer);
    requestAnimationFrame(() => {
      pointer.classList.add('is-on');
      pointer.style.transform = at(p.x, p.y);
    });
  });

  later(1550, () => {
    const p = grabPoint();
    pointer.classList.add('is-grab');
    row.classList.add('is-picked');
    ghost = makeGhost(payload);
    ghost.style.transform = `translate(${p.x + 14}px, ${p.y + 12}px)`;
    root.append(ghost);
    chat.dragState({ active: true, payload });
  });

  // Carry it along a gentle arc into the middle of Chat.
  later(1850, () => {
    const from = grabPoint();
    const c = chatWin.getBoundingClientRect();
    const to = { x: c.left + c.width * 0.14, y: c.top + c.height * 0.64 };
    const start = performance.now();
    const duration = 1350;
    let over = false;
    pointer.classList.add('is-carrying');
    const b = box();
    trail.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`);
    root.append(trail);
    const point = (e) => [from.x + (to.x - from.x) * e - b.left, from.y + (to.y - from.y) * e - Math.sin(Math.PI * e) * 70 - b.top];
    (function step(now) {
      if (stopped) return;
      const k = Math.min(1, (now - start) / duration);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      const x = from.x + (to.x - from.x) * e;
      const y = from.y + (to.y - from.y) * e - Math.sin(Math.PI * e) * 70;
      ghost.style.transform = `translate(${x + 14}px, ${y + 12}px)`;
      pointer.style.transform = at(x, y);
      const samples = Array.from({ length: 24 }, (_, i) => point((e * i) / 23).map(Math.round).join(' '));
      trailPath.setAttribute('d', `M${samples.join('L')}`);
      if (!over && e > 0.74) {
        over = true;
        ghost.classList.add('is-over');
        chat.dragState({ active: true, over: true, payload });
      }
      if (k < 1) requestAnimationFrame(step);
    })(start);
  });

  later(2300, () => mole.speak('Drag anything onto Chat to ask about it.', 0));

  // Hold it there while the mole explains, then let go.
  later(6700, () => {
    chat.dragState({ active: false });
    suggested = true;
    const chip = chat.suggest(payload);
    pointer.classList.remove('is-grab');
    pointer.classList.add('is-off');
    trail.classList.add('is-off');
    const flying = ghost;
    ghost = null;
    if (flying) landGhost(flying, chip);
    later(340, () => {
      finish({ suggest: false });
      mole.speak('Your turn! Drag your own, or attach mine.', 4600);
    });
  });
}
