// The page is the character's world. This file finds places to be (the end of
// a heading, the top of a card, the gap behind a picture, the quay in the hero
// scene) and decides what the character does there while nobody is talking
// to it. Every spot is checked against the words and pictures on the page
// first, so the character never stands in front of what you're reading.
//
// Tune it from HTML:
//   data-scene          a picture the character can walk into (see index.html)
//   data-perch          an extra box to sit on or hide behind
//   data-world-ignore   keep the character away from this element

import { POSES, leanElbow, footUp } from './sprite.js';

const CX = 20; // The sprite's center line.
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const docRect = (r) => ({ left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY });
const rectOf = (el) => docRect(el.getBoundingClientRect());
const overlaps = (a, b, pad = 0) => a.left < b.right - pad && a.right > b.left + pad && a.top < b.bottom - pad && a.bottom > b.top + pad;
const inside = (a, b) => a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isAbort = (error) => error?.name === 'AbortError';

// How long to stay at each kind of place, in milliseconds.
const DWELL = { peek: [9e3, 15e3], kilroy: [8e3, 12e3], point: [6e3, 9e3], scene: [16e3, 26e3], edge: [7e3, 12e3] };
const DWELL_DEFAULT = [13e3, 21e3];

// --- Reading the page ------------------------------------------------------------

// The visible part of the page, in document coordinates.
function view(margin = {}) {
  return {
    left: scrollX + (margin.left ?? 8),
    right: scrollX + innerWidth - (margin.right ?? 8),
    top: scrollY + (margin.top ?? 56),
    bottom: scrollY + innerHeight - (margin.bottom ?? 8),
  };
}

// Words and pictures the character must not stand in front of.
function obstacles(root, near) {
  const found = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!/\S/.test(node.data)) continue;
    const el = node.parentElement;
    if (!el || el.closest('[data-scene], script, style, template')) continue;
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue;
      const d = docRect(r);
      if (overlaps(d, near)) found.push({ ...d, el });
    }
  }
  for (const el of root.querySelectorAll('img, svg, canvas, video, iframe, input, textarea, select, button, a, summary, [role="img"]')) {
    if (el.closest('[data-scene]')) continue;
    if (el.matches('a, summary') && !solid(el)) continue; // Plain links are covered by their text.
    const d = rectOf(el);
    if (d.right - d.left >= 2 && overlaps(d, near)) found.push({ ...d, el });
  }
  return found;
}

// Something to hide behind: a picture, or a box with an opaque background.
function solid(el) {
  if (el.matches('img, canvas, video, picture')) return true;
  const bg = getComputedStyle(el).backgroundColor;
  const alpha = bg.startsWith('rgba') ? Number(bg.split(',')[3]?.replace(')', '')) : bg === 'transparent' ? 0 : 1;
  return alpha > 0.9;
}

// A heading's last line: where it ends, its baseline and how tall its capitals are.
function lastLine(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter((r) => r.width > 2 && r.height > 2);
  if (!rects.length) return null;
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const line = rects.filter((r) => r.bottom > bottom - 6);
  const style = getComputedStyle(el);
  const ctx = (lastLine.ctx ??= document.createElement('canvas').getContext('2d'));
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const metrics = ctx.measureText('HERD');
  const rect = docRect({ left: Math.min(...line.map((r) => r.left)), right: Math.max(...line.map((r) => r.right)), top: Math.min(...line.map((r) => r.top)), bottom });
  return { ...rect, baseline: rect.bottom - (metrics.fontBoundingBoxDescent ?? parseFloat(style.fontSize) * 0.22), cap: metrics.actualBoundingBoxAscent };
}

// A picture with a floor to walk on, described in its own pixels (see index.html).
export function readScene(el) {
  let data;
  try { data = JSON.parse(el.querySelector('script[type="application/json"]').textContent); } catch { return null; }
  const [w, h] = data.size;
  const { far, near } = data.depth;
  return {
    el,
    data,
    door: data.door,
    spots: data.spots ?? [],
    toPage(x, y) {
      const r = rectOf(el);
      return { x: r.left + (x / w) * (r.right - r.left), y: r.top + (y / h) * (r.bottom - r.top) };
    },
    // Characters shrink toward the horizon: one sprite pixel is one scene pixel up close.
    scaleAt(y) {
      const pixel = el.getBoundingClientRect().width / w;
      const t = clamp((y - far[0]) / (near[0] - far[0]), -0.2, 1.2);
      return pixel * (far[1] + (near[1] - far[1]) * t);
    },
    visible(v) {
      const r = rectOf(el);
      return r.bottom > v.top + 120 && r.top < v.bottom - 120;
    },
  };
}

// --- The director ---------------------------------------------------------------------

export class World {
  constructor({ root, actor, scene }) {
    this.root = root;
    this.actor = actor;
    this.rig = actor.rig;
    this.scene = scene;
    this.perch = null;
    this.recent = [];
    this.kinds = [];
    this.summoned = false;
    this.job = null;
    this.lastInput = performance.now();
    this.scrolling = false;
    this.#listen();
  }

  // Sprite pixels per CSS pixel on the page.
  get scale() {
    return innerWidth >= 700 ? 3 : 2;
  }

  // The body box of a pose at a spot, in document coordinates.
  body(pose, x, y, s) {
    const f = this.rig.frame(pose);
    return {
      left: x + (f.bbox.left - CX) * s,
      right: x + (f.bbox.right - CX) * s,
      top: y + (f.bbox.top - f.anchorY) * s,
      bottom: y + (f.bbox.bottom - f.anchorY) * s,
    };
  }

  // Every place the character could be right now: in view and clear of text.
  places() {
    const v = view({ top: 96, bottom: 24 });
    const within = view({ top: 60, bottom: 8 });
    const rootRect = rectOf(this.root);
    const blockers = obstacles(this.root, { left: v.left - 200, right: v.right + 200, top: v.top - 400, bottom: v.bottom + 200 });
    const s = this.scale;
    const places = [];
    const free = (box, ignore = []) =>
      inside(box, within) &&
      box.left >= rootRect.left && box.right <= rootRect.right &&
      !blockers.some((o) => !ignore.some((el) => el === o.el || el.contains(o.el)) && overlaps(box, o, 1));
    const skip = (el) => el.closest('[data-world-ignore], [data-scene], [hidden]');

    // Headings: an elbow on the last word, or a foot up on it.
    for (const h of this.root.querySelectorAll('h1, h2')) {
      if (skip(h)) continue;
      const line = lastLine(h);
      if (!line || line.cap < 8) continue;
      for (const scale of [s, s * 0.87, s * 1.15, s * 0.75, s * 1.25]) {
        const cap = line.cap / scale;
        const option = cap >= 17 && cap <= 26.5
          ? { kind: 'lean', pose: leanElbow(24.5 - cap), x: line.right + 13 * scale, facing: 'front' }
          : cap >= 5 && cap <= 10.5
            ? { kind: 'foot', pose: footUp(cap), x: line.right + 3.5 * scale, facing: 'left' }
            : null;
        if (!option) continue;
        const box = this.body({ ...option.pose, mirror: option.facing === 'left' }, option.x, line.baseline, scale);
        if (!free(box, [h])) continue;
        places.push({ ...option, el: h, y: line.baseline, scale, box, weight: h.localName === 'h1' ? 6.5 : 5.5 });
        break;
      }
    }

    // Boxes: cards, pictures, tables. Peek around or over them, or sit on top.
    const boxes = [...this.root.querySelectorAll('article, figure, table, aside, blockquote, details, dl, img, picture, [data-perch]')]
      .filter((el) => !skip(el) && solid(el))
      .filter((el, _, all) => !all.some((other) => other !== el && other.contains(el)));
    for (const el of boxes) {
      const r = rectOf(el);
      const w = r.right - r.left, h = r.bottom - r.top;
      if (w < 90 || h < 60 || w > rootRect.right - rootRect.left - 40) continue;

      // Around a side: the box hides the body, the face shows beside it.
      if (h >= 40 * s) {
        for (const side of ['right', 'left']) {
          const edge = side === 'right' ? r.right : r.left;
          const x = side === 'right' ? edge + 5.5 * s : edge - 5.5 * s;
          const y = clamp(r.top + 0.32 * h + 44 * s, r.top + 44 * s, r.bottom - 2 * s);
          const box = this.body({ ...POSES.peek, mirror: side === 'left' }, x, y, s);
          const shown = side === 'right' ? { ...box, left: edge } : { ...box, right: edge };
          if (free(shown, [el])) places.push({ kind: 'peek', el, side, edge, x, y, scale: s, flip: side === 'left', occluder: r, box: shown, weight: 4 });
        }
      }

      // Over the top: eyes and fingers above the edge.
      if (w >= 30 * s) {
        for (const at of [0.22, 0.78, 0.5]) {
          const x = r.left + w * at;
          const y = r.top + 34 * s;
          const shown = { ...this.body(POSES.kilroy, x, y, s), bottom: r.top };
          if (free(shown, [el])) {
            places.push({ kind: 'kilroy', el, x, y, scale: s, occluder: r, box: shown, weight: 4 });
            break;
          }
        }
      }

      // On the top edge, legs dangling over pictures, never over words.
      if (w >= 24 * s) {
        const pictures = [...el.querySelectorAll('img, svg, canvas, picture'), ...(el.matches('img, picture') ? [el] : [])];
        for (const at of [0.2, 0.8, 0.5, 0.35, 0.65]) {
          const x = r.left + w * at;
          const box = this.body(POSES.sit, x, r.top, s);
          if (free(box, pictures)) {
            places.push({ kind: 'sit', el, x, y: r.top, scale: s, occluder: r, box, weight: 4.5 });
            break;
          }
        }
      }
    }

    // Where one section's background gives way to another, there's a floor.
    let previous = null;
    for (const section of this.root.querySelectorAll('section, footer')) {
      if (skip(section)) continue;
      const bg = getComputedStyle(section).backgroundColor;
      if (previous !== null && bg !== previous && !bg.endsWith(', 0)')) {
        const r = rectOf(section);
        for (const at of [0.9, 0.1, 0.75, 0.25]) {
          const x = r.left + (r.right - r.left) * at;
          const box = this.body(POSES.stand, x, r.top, s);
          if (!free(box)) continue;
          // How far the character can stroll along it.
          let min = x, max = x;
          while (min - 12 * s > r.left && free(this.body(POSES.stand, min - 12 * s, r.top, s))) min -= 12 * s;
          while (max + 12 * s < r.right && free(this.body(POSES.stand, max + 12 * s, r.top, s))) max += 12 * s;
          places.push({ kind: 'floor', el: section, x, y: r.top, scale: s, box, range: [min, max], weight: 3 });
          break;
        }
      }
      previous = bg;
    }

    // Buttons worth pointing at.
    for (const el of this.root.querySelectorAll('a, button')) {
      if (skip(el) || !solid(el)) continue;
      const r = rectOf(el);
      if (r.right - r.left > 360) continue;
      for (const side of ['right', 'left']) {
        const x = side === 'right' ? r.right + 12 * s : r.left - 12 * s;
        const facing = side === 'right' ? 'left' : 'right';
        const box = this.body({ ...POSES.pointDown, mirror: facing === 'left' }, x, r.bottom, s);
        if (free(box, [el])) {
          places.push({ kind: 'point', el, x, y: r.bottom, scale: s, facing, box, weight: 2.5 });
          break;
        }
      }
    }

    // The harbour scene, when it's on screen.
    if (this.scene?.visible(v)) {
      for (const spot of this.scene.spots) {
        const at = this.scene.toPage(spot.x, spot.seat ?? spot.y);
        const scale = this.scene.scaleAt(spot.y);
        const pose = POSES[spot.pose] ?? POSES.stand;
        const box = this.body({ ...pose, mirror: spot.facing === 'left' }, at.x, at.y, scale);
        if (free(box)) places.push({ kind: 'scene', spot, x: at.x, y: at.y, scale, box, weight: 7 });
      }
    }
    return places;
  }

  // Picks somewhere new, preferring variety and the edges of the screen.
  choose({ exclude = [] } = {}) {
    const scored = this.places()
      .filter((p) => !exclude.includes(p.kind))
      .map((p) => {
        let score = p.weight + Math.random() * 3;
        const key = p.el ?? p.spot;
        if (this.recent.includes(key)) score -= 3;
        if (p.kind === this.kinds[0]) score -= 2.2;
        if (p.kind === this.kinds[1]) score -= 1;
        const cx = (p.box.left + p.box.right) / 2 - scrollX;
        score += Math.abs(cx / innerWidth - 0.5) * 2;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored[0]?.p ?? null;
  }

  // --- The loop ------------------------------------------------------------------

  async start({ greeting }) {
    await document.fonts?.ready;
    this.greeting = greeting;
    this.running = true;
    this.#loop();
  }

  // For when the element leaves the page.
  stop() {
    this.running = false;
    this.job?.abort();
    this.transition?.abort();
    this.listening.abort();
  }

  async #loop() {
    while (this.running) {
      const job = (this.job = new AbortController());
      const signal = job.signal;
      try {
        if (this.summoned || this.scrolling) {
          await this.actor.wait(300, signal);
        } else if (!this.perch || !this.#stillThere() || performance.now() > this.leaveAt) {
          // The hello happens once, even if something interrupts it.
          const first = Boolean(this.greeting);
          this.greetingDue = this.greeting;
          this.greeting = null;
          await this.#move(signal, first);
        } else {
          await this.#idle(signal);
        }
      } catch (error) {
        if (!isAbort(error)) {
          console.error(error);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }

  #stillThere() {
    if (this.perch.kind === 'edge') return true;
    const b = this.perch.box;
    const v = view({ top: 20, bottom: 0 });
    return b.bottom > v.top + 30 && b.top < v.bottom - 30;
  }

  async #move(signal, first = false) {
    // The first time, say hello up close if the scene has a spot for it.
    const next = (first && this.places().find((p) => p.spot?.greet)) || this.choose();
    if (this.perch) await this.#exit(this.perch, next, signal);
    if (!next) return this.#edge(signal, first);
    this.#arrive(next);
    await this.#enter(next, signal, first);
    if (first) await this.#greet(next, signal);
  }

  #arrive(p) {
    this.perch = p;
    this.recent = [p.el ?? p.spot, ...this.recent].slice(0, 3);
    this.kinds = [p.kind, ...this.kinds].slice(0, 2);
    // With reduced motion, stay put until scrolled out of view.
    this.leaveAt = reducedMotion() ? Infinity : performance.now() + between(...(DWELL[p.kind] ?? DWELL_DEFAULT));
  }

  // Hello, with a wave where the pose allows one.
  async #greet(p, signal) {
    const a = this.actor;
    if (!this.greetingDue) return;
    a.express({ eyes: 'happy', mouth: 'smile' });
    a.say(this.greetingDue, { ms: 7000 });
    a.label.classList.add('is-shown');
    setTimeout(() => a.label.classList.remove('is-shown'), 6000);
    const sitting = p.kind === 'sit' || p.spot?.pose === 'sit';
    const standing = ['floor', 'point', 'edge'].includes(p.kind) || (p.kind === 'scene' && !sitting && !p.spot?.pose?.startsWith('lean'));
    const wave = reducedMotion() ? null : sitting ? 'sitWave' : standing ? 'wave' : null;
    if (wave) await a.play(wave, { loop: false, facing: 'front', signal });
    this.#settle(p);
    await a.wait(2200, signal);
    a.express({});
  }

  // The resting pose for a place.
  #settle(p) {
    const a = this.actor;
    a.occlude();
    switch (p.kind) {
      case 'lean':
      case 'foot':
        a.hold(p.pose, { facing: p.facing, flip: false });
        break;
      case 'sit':
        a.play('sit', { flip: false });
        break;
      case 'peek':
        a.hold(POSES.peek, { flip: p.flip });
        a.occlude([this.#local(p.occluder)]);
        break;
      case 'kilroy':
      case 'edge':
        a.hold(POSES.kilroy, { flip: false });
        a.occlude([p.kind === 'edge' ? p.occluder : this.#local(p.occluder)]);
        break;
      case 'point':
        a.hold(POSES.pointDown, { facing: p.facing });
        break;
      case 'scene':
        if (p.spot.pose === 'sit') a.play('sit', { flip: false });
        else a.hold(POSES[p.spot.pose] ?? POSES.stand, { facing: p.spot.facing ?? 'front', flip: false });
        break;
      default:
        a.play('stand', { facing: 'front' });
    }
  }

  // A document rectangle in the actor's current layer.
  #local(rect) {
    const o = this.actor.fromDocument({ x: rect.left, y: rect.top });
    return { left: o.x, top: o.y, right: o.x + (rect.right - rect.left), bottom: o.y + (rect.bottom - rect.top) };
  }

  #at(x, y, scale) {
    this.actor.place({ ...this.actor.fromDocument({ x, y }), scale });
  }

  // Moves without stepping: leaning out, ducking, climbing.
  #slide(to, ms, signal) {
    return this.actor.walkTo(this.actor.fromDocument(to), { duration: ms, anim: null, signal });
  }

  async #enter(p, signal, first) {
    const a = this.actor;
    a.setMode('page');
    a.dissolve = 1;
    switch (p.kind) {
      case 'peek': {
        this.#at(p.side === 'right' ? p.edge - 12 * p.scale : p.edge + 12 * p.scale, p.y, p.scale);
        this.#settle(p);
        a.show();
        await this.#slide({ x: p.x, y: p.y }, 700, signal);
        return;
      }
      case 'kilroy': {
        this.#at(p.x, p.y + 16 * p.scale, p.scale);
        this.#settle(p);
        a.show();
        await this.#slide({ x: p.x, y: p.y }, 650, signal);
        return;
      }
      case 'sit': {
        // Climb up from behind the box, then swing the legs over the edge.
        this.#at(p.x, p.y + 44 * p.scale, p.scale);
        a.hold(POSES.jump);
        a.occlude([this.#local(p.occluder)]);
        a.show();
        await this.#slide({ x: p.x, y: p.y + 14 * p.scale }, 420, signal);
        this.#settle(p);
        return;
      }
      case 'scene':
        await this.#enterScene(p, signal, first);
        this.#settle(p);
        return;
      default: {
        // Walk in from the nearer side if the way is clear; otherwise appear.
        const fromLeft = p.x - scrollX < innerWidth / 2;
        const startX = fromLeft ? scrollX - 24 * p.scale : scrollX + innerWidth + 24 * p.scale;
        if (!reducedMotion() && Math.abs(startX - p.x) < innerWidth * 0.45 && this.#clear(startX, p)) {
          this.#at(startX, p.y, p.scale);
          a.show();
          await a.walkTo(a.fromDocument({ x: p.x, y: p.y }), { speed: 50, signal });
        } else {
          this.#at(p.x, p.y, p.scale);
          this.#settle(p);
          a.dissolve = 0;
          a.show();
          await a.fade(1, 500, signal);
        }
        this.#settle(p);
      }
    }
  }

  // Is the walk along this floor free of words?
  #clear(fromX, p) {
    const path = { left: Math.min(fromX, p.x) - 8, right: Math.max(fromX, p.x) + 8, top: p.box.top, bottom: p.y - 2 };
    return !obstacles(this.root, path).some((o) => o.el !== p.el && !p.el?.contains(o.el) && overlaps(path, o, 1));
  }

  async #exit(p, next, signal) {
    const a = this.actor;
    if (!a.news) a.quiet(); // A reply in the bubble travels along.
    if (!a.visible || !this.#onScreen()) {
      a.hide();
      a.occlude();
      return;
    }
    const here = a.toDocument({ x: a.x, y: a.y });
    switch (p.kind) {
      case 'peek':
        a.occlude([this.#local(p.occluder)]);
        await this.#slide({ x: p.side === 'right' ? p.edge - 12 * p.scale : p.edge + 12 * p.scale, y: here.y }, 450, signal);
        break;
      case 'kilroy':
        await this.#slide({ x: here.x, y: here.y + 16 * p.scale }, 380, signal);
        break;
      case 'sit':
        a.hold(POSES.jump);
        a.occlude([this.#local(p.occluder)]);
        await this.#slide({ x: here.x, y: here.y + 44 * p.scale }, 380, signal);
        break;
      case 'scene':
        await this.#leaveScene(p, next, signal);
        break;
      case 'edge':
        await a.walkTo({ x: a.x, y: a.y + 20 * a.scale }, { duration: 380, anim: null, signal });
        break;
      default: {
        // Walk off the near side of the screen, or fade.
        const toRight = here.x - scrollX > innerWidth / 2;
        const endX = toRight ? scrollX + innerWidth + 24 * a.scale : scrollX - 24 * a.scale;
        if (!reducedMotion() && Math.abs(endX - here.x) < innerWidth * 0.45 && this.#clear(endX, { ...p, x: here.x })) {
          await a.walkTo(a.fromDocument({ x: endX, y: here.y }), { speed: 50, signal });
        } else {
          await a.fade(0, 400, signal);
        }
      }
    }
    a.hide();
    a.occlude();
    a.dissolve = 1;
  }

  // Nowhere to be: wait at the bottom of the screen, peeking over the edge.
  async #edge(signal, first) {
    const a = this.actor;
    const s = this.scale;
    a.setMode('screen');
    const x = innerWidth - Math.max(48, 26 * s);
    const peek = innerHeight + 30 * s;
    a.place({ x, y: peek + 20 * s, scale: s });
    const p = { kind: 'edge', occluder: { left: -1e4, right: 1e5, top: innerHeight, bottom: 1e5 }, box: {} };
    this.#arrive(p);
    this.#settle(p);
    a.dissolve = 1;
    a.show();
    await a.walkTo({ x, y: peek }, { duration: 600, anim: null, signal });
    if (first) await this.#greet(p, signal);
  }

  // --- Life at a place ---------------------------------------------------------------

  async #idle(signal) {
    const a = this.actor;
    const p = this.perch;
    if (reducedMotion()) return a.wait(4000, signal); // Blinking only.
    const bored = performance.now() - this.lastInput > 25000;
    switch (p.kind) {
      case 'peek': {
        // Duck back behind, wait, lean out again.
        await a.wait(between(2500, 4500), signal);
        if (Math.random() < 0.5) {
          await this.#slide({ x: p.side === 'right' ? p.edge - 12 * p.scale : p.edge + 12 * p.scale, y: p.y }, 420, signal);
          await a.wait(between(900, 2200), signal);
          await this.#slide({ x: p.x, y: p.y }, 600, signal);
        }
        return;
      }
      case 'kilroy':
      case 'edge': {
        await a.wait(between(1800, 3600), signal);
        if (Math.random() < 0.45) {
          const y = a.y;
          await a.walkTo({ x: a.x, y: y + 16 * a.scale }, { duration: 300, anim: null, signal });
          await a.wait(between(800, 1800), signal);
          await a.walkTo({ x: a.x, y }, { duration: 480, anim: null, signal });
        }
        return;
      }
      case 'sit':
        a.play(Math.random() < 0.6 ? 'swing' : 'sit');
        await a.wait(between(2500, 5000), signal);
        if (bored && Math.random() < 0.3) await this.#yawn(signal, 'sit');
        return;
      case 'lean':
      case 'foot':
        await a.wait(between(3500, 7000), signal);
        if (bored && Math.random() < 0.3) {
          a.express({ eyes: 'closed', mouth: 'wide' });
          await a.wait(900, signal);
          a.express({});
        }
        return;
      case 'point':
        await a.wait(between(2000, 3500), signal);
        a.play('stand', { facing: p.facing });
        await a.wait(between(1500, 3000), signal);
        this.#settle(p);
        return;
      case 'floor': {
        await a.wait(between(2500, 5000), signal);
        if (Math.random() < 0.5) {
          const [min, max] = p.range;
          const x = between(min, max);
          await a.walkTo(a.fromDocument({ x, y: p.y }), { speed: 30, signal });
          p.x = x;
          p.box = this.body(POSES.stand, x, p.y, p.scale);
          a.play('stand', { facing: 'front' });
        } else {
          await this.#fidget(signal, bored);
          this.#settle(p);
        }
        return;
      }
      case 'scene': {
        await a.wait(between(5000, 9000), signal);
        const others = this.scene.spots.filter((spot) => spot !== p.spot);
        if (Math.random() < 0.35 && others.length) {
          const spot = pick(others);
          const at = this.scene.toPage(spot.x, spot.seat ?? spot.y);
          const scale = this.scene.scaleAt(spot.y);
          const box = this.body(POSES[spot.pose] ?? POSES.stand, at.x, at.y, scale);
          if (!inside(box, view({ top: 60, bottom: 8 }))) return;
          await this.#walkScene(p.spot, spot, signal);
          Object.assign(p, { spot, x: at.x, y: at.y, scale, box });
          this.#settle(p);
        } else if (!p.spot.pose || p.spot.pose === 'stand') {
          await this.#fidget(signal, bored);
          this.#settle(p);
        }
        return;
      }
      default:
        await a.wait(between(3000, 6000), signal);
    }
  }

  async #fidget(signal, bored) {
    const a = this.actor;
    const quirk = a.def.quirk;
    const options = [
      ['look', 3], ['hips', 1.5], ['crossed', 1.5], ['watch', 1], ['scratch', 1], ['tap', 1.2],
      ...(quirk ? [[quirk, 2.5]] : []),
      ...(bored ? [['stretch', 2]] : []),
    ];
    let roll = Math.random() * options.reduce((sum, [, w]) => sum + w, 0);
    const [choice] = options.find(([, w]) => (roll -= w) < 0) ?? options[0];
    if (choice === 'look') {
      a.hold({ ...POSES.stand, headView: 'side', headMirror: Math.random() < 0.5 });
      await a.wait(between(900, 1600), signal);
      return;
    }
    if (choice === 'stretch') return this.#yawn(signal);
    a.play(choice, { facing: 'front' });
    await a.wait(choice === 'tap' ? 2400 : between(1600, 2800), signal);
  }

  async #yawn(signal, then = 'stand') {
    this.actor.play('stretch');
    await this.actor.wait(1400, signal);
    this.actor.play(then);
  }

  // --- The harbour scene -------------------------------------------------------------

  #door() {
    const door = this.scene.door;
    return door?.open ? this.scene.el.querySelector(door.open) : null;
  }

  // Out of the door, toward the viewer, then over to the spot.
  async #enterScene(p, signal, first) {
    const a = this.actor;
    const { door } = this.scene;
    const doorEl = this.#door();
    this.#at(...Object.values(this.scene.toPage(door.x, door.y)), this.scene.scaleAt(door.y));
    a.play('stand', { facing: 'front' });
    doorEl?.classList.add('is-open');
    try {
      await a.wait(first ? 400 : 250, signal);
      a.dissolve = 0;
      a.show();
      await a.fade(1, 260, signal);
      const step = { x: door.x, y: door.y + 12 };
      await this.#walkScene({ x: door.x, y: door.y }, step, signal, { perspective: true });
      doorEl?.classList.remove('is-open');
      await this.#walkScene(step, p.spot, signal);
    } finally {
      doorEl?.classList.remove('is-open');
    }
  }

  // Home through the door, if it's in view; otherwise just slip away.
  async #leaveScene(p, next, signal) {
    const a = this.actor;
    const { door } = this.scene;
    if (next?.kind === 'scene' || !this.scene.visible(view())) {
      await a.fade(0, 350, signal);
      return;
    }
    const doorEl = this.#door();
    const step = { x: door.x, y: door.y + 10 };
    await this.#walkScene(p.spot, step, signal);
    doorEl?.classList.add('is-open');
    try {
      await this.#walkScene(step, { x: door.x, y: door.y }, signal, { perspective: true, anim: 'walk.back' });
      await a.fade(0, 260, signal);
    } finally {
      doorEl?.classList.remove('is-open');
    }
  }

  // Walks between two scene points, growing and shrinking with depth.
  async #walkScene(from, to, signal, { perspective = false, anim } = {}) {
    const a = this.actor;
    const scene = this.scene;
    const start = scene.toPage(from.x, from.y);
    const end = scene.toPage(to.x, to.y);
    const s0 = scene.scaleAt(from.y), s1 = scene.scaleAt(to.y);
    if (from.seat !== undefined) {
      // Off the barrel or the crate first.
      a.hold(POSES.jump);
      await a.walkTo({ ...a.fromDocument(start), scale: s0 }, { duration: 200, anim: null, signal });
    }
    a.place({ ...a.fromDocument(start), scale: s0 });
    // Speed in scene pixels, so steps match the picture; depth counts double.
    const dist = Math.hypot(to.x - from.x, (to.y - from.y) * 2.2);
    const dx = end.x - start.x, dy = end.y - start.y;
    const walk = anim ?? (Math.abs(dx) > Math.abs(dy) * 1.2 ? 'walk.side' : dy > 0 ? 'walk.front' : 'walk.back');
    await a.walkTo({ ...a.fromDocument(end), scale: s1 }, { duration: Math.max(300, (dist / 26) * 1000), anim: walk, perspective, signal });
    if (to.seat !== undefined) {
      // And up onto the seat.
      a.hold(POSES.jump);
      await a.walkTo({ ...a.fromDocument(scene.toPage(to.x, to.seat)), scale: s1 }, { duration: 220, anim: null, signal });
    }
  }

  // --- To the screen and back ------------------------------------------------------------

  // Walks toward the viewer until close and big, next to the chat window.
  async summon(spot) {
    // One transition at a time: this one wins over a walk back still underway.
    this.transition?.abort();
    const { signal } = (this.transition = new AbortController());
    this.summoned = true;
    this.greeting = null; // No hello after you've already talked.
    this.job?.abort();
    const a = this.actor;
    a.quiet();
    a.express({});
    const wasVisible = a.visible && this.#onScreen();
    a.setMode('screen');
    a.occlude();
    a.dissolve = 1;
    if (!wasVisible) {
      // Come up from below the bottom edge.
      a.place({ x: spot.x, y: innerHeight + 40 * this.scale, scale: this.scale });
      a.show();
    }
    const distance = Math.hypot(spot.x - a.x, spot.y - a.y);
    await a.walkTo({ x: spot.x, y: spot.y, scale: spot.scale }, {
      anim: 'walk.front',
      facing: 'front',
      perspective: true,
      duration: reducedMotion() ? 0 : clamp(700 + distance * 1.1, 900, 1900),
      signal,
    });
    a.play('stand', { facing: 'front' });
    this.perch = null;
  }

  // Stay put for a while, say while showing a reply in the bubble.
  linger(ms) {
    this.leaveAt = Math.max(this.leaveAt ?? 0, performance.now() + ms);
  }

  // Puts the character straight at the chat spot (after a resize).
  pin(spot) {
    const a = this.actor;
    a.setMode('screen');
    a.occlude();
    a.place(spot);
    a.show();
  }

  // Turns around and walks back into the page, shrinking as it goes.
  async dismiss() {
    this.transition?.abort();
    const { signal } = (this.transition = new AbortController());
    const a = this.actor;
    const target = this.choose({ exclude: ['peek', 'kilroy', 'point'] });
    try {
      if (target) {
        const seat = target.kind === 'scene' && target.spot.seat !== undefined;
        const floor = seat ? this.scene.toPage(target.spot.x, target.spot.y) : { x: target.x, y: target.y };
        await a.walkTo({ x: floor.x - scrollX, y: floor.y - scrollY, scale: target.scale }, {
          anim: 'walk.back', facing: 'back', perspective: true, duration: reducedMotion() ? 0 : 1400, signal,
        });
        a.setMode('page');
        a.place(a.fromDocument(floor)); // Right on the spot, even if the page scrolled meanwhile.
        this.#arrive(target);
        if (seat || target.kind === 'sit') {
          a.hold(POSES.jump);
          await a.walkTo(a.fromDocument({ x: target.x, y: target.y }), { duration: 200, anim: null, signal });
        }
        this.#settle(target);
      } else {
        await a.walkTo({ x: a.x, y: a.y - 40, scale: this.scale * 0.8 }, { anim: 'walk.back', facing: 'back', perspective: true, duration: reducedMotion() ? 0 : 900, signal });
        await a.fade(0, 300, signal);
        a.hide();
        a.dissolve = 1;
        a.setMode('page');
        this.perch = null;
      }
    } catch (error) {
      if (isAbort(error)) return; // Called back before getting there: the next transition owns the character.
      throw error;
    }
    this.summoned = false;
    this.job?.abort();
  }

  #onScreen() {
    const a = this.actor;
    const b = a.box;
    const tl = a.toDocument({ x: b.left, y: b.top });
    const br = a.toDocument({ x: b.right, y: b.bottom });
    return overlaps({ left: tl.x, top: tl.y, right: br.x, bottom: br.y }, view({ top: 0, bottom: 0 }));
  }

  // --- Paying attention ------------------------------------------------------------------

  #listen() {
    this.listening = new AbortController();
    const options = { passive: true, signal: this.listening.signal };
    const input = () => { this.lastInput = performance.now(); };
    let settle;
    addEventListener('scroll', () => {
      input();
      this.scrolling = true;
      clearTimeout(settle);
      settle = setTimeout(() => {
        this.scrolling = false;
        // Scrolled out of view: come back somewhere visible.
        if (!this.summoned && this.perch && !this.#stillThere()) this.job?.abort();
      }, 450);
    }, options);
    addEventListener('pointermove', (event) => {
      input();
      this.#gaze(event.clientX + scrollX, event.clientY + scrollY);
    }, options);
    addEventListener('keydown', input, options);
    // Only a new width moves the character. Phones resize the height as the
    // address bar slides in and out, and that shouldn't send it wandering.
    let width = innerWidth;
    addEventListener('resize', () => {
      if (this.summoned || innerWidth === width) return;
      width = innerWidth;
      this.perch = null;
      this.job?.abort();
    }, options);
  }

  // Eyes follow the pointer when it's near.
  #gaze(x, y) {
    const a = this.actor;
    if (!a.visible || this.summoned) return;
    const at = a.fromDocument({ x, y });
    const near = Math.hypot(at.x - a.x, at.y - (a.y - 30 * a.scale)) < 520;
    a.lookAt(near ? at : null);
  }
}
