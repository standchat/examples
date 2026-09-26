// The character on the page: a pixel sprite that walks, poses, blinks, talks,
// looks around and hides behind things. This file is only about movement and
// drawing. world.js decides where the character goes and what it does there,
// and adventure-chat.js decides when it talks.

import { createRig, ANIMATIONS, FRAME_W, FRAME_H } from './sprite.js';

const CX = FRAME_W / 2;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Actor {
  constructor({ definition, layers, label }) {
    this.def = definition;
    this.rig = createRig(definition);
    this.layers = layers; // { page: absolutely positioned in the document, screen: fixed to the viewport }
    this.mode = 'page';
    this.x = 0; // Feet, in the current layer's coordinates.
    this.y = 0;
    this.scale = 3; // CSS pixels per sprite pixel.
    this.facing = 'front'; // front | back | left | right
    this.flip = false; // Mirror front and back poses (lean to the other side).
    this.anim = 'stand';
    this.animStart = 0;
    this.animLoop = true;
    this.animFps = null;
    this.pose = null; // A one-off pose that overrides the animation.
    this.expression = {};
    this.gaze = null; // A point to look at, in the current layer's coordinates.
    this.talking = false;
    this.occluders = []; // Rects the character is behind, in layer coordinates.
    this.dissolve = 1; // 0 = gone, 1 = whole. Pixels appear in a fixed order.
    this.visible = false;
    this.motion = null;
    this.#build(label);
    this.#blinkLater();
    requestAnimationFrame(this.#tick);
  }

  #blinkUntil = 0;
  #fading = null;
  #stopped = false;
  #mouth = 'closed';
  #mouthUntil = 0;
  #drawn = '';
  #box = '';
  #clip = '';
  #frame = null;

  #build(label) {
    this.el = document.createElement('div');
    this.el.className = 'actor';
    this.el.hidden = true;
    this.clipEl = document.createElement('div');
    this.clipEl.className = 'actor-clip';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'actor-sprite';
    this.canvas.width = FRAME_W;
    this.canvas.height = FRAME_H;
    this.ctx = this.canvas.getContext('2d');
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'actor-hit';
    this.button.setAttribute('aria-label', label);
    this.clipEl.append(this.canvas, this.button);
    this.bubble = document.createElement('div');
    this.bubble.className = 'actor-bubble';
    this.bubble.setAttribute('aria-hidden', 'true');
    this.bubble.hidden = true;
    this.label = document.createElement('div');
    this.label.className = 'actor-label';
    this.label.setAttribute('aria-hidden', 'true');
    this.label.textContent = label;
    this.el.append(this.clipEl, this.bubble, this.label);
    this.layers.page.append(this.el);
  }

  // --- State -------------------------------------------------------------------

  show() { this.visible = true; this.el.hidden = false; }
  hide() { this.visible = false; this.el.hidden = true; this.quiet(); }

  place({ x = this.x, y = this.y, scale = this.scale } = {}) {
    Object.assign(this, { x, y, scale });
  }

  play(name, { loop = true, fps = null, facing, flip, signal } = {}) {
    if (!ANIMATIONS[name]) throw new Error(`No animation "${name}"`);
    if (facing) this.facing = facing;
    if (flip !== undefined) this.flip = flip;
    if (this.anim !== name || !loop || fps !== this.animFps) this.animStart = performance.now();
    Object.assign(this, { anim: name, animLoop: loop, animFps: fps, pose: null });
    if (loop) return Promise.resolve();
    const { frames, fps: rate } = ANIMATIONS[name];
    return this.wait((frames.length / (fps ?? rate)) * 1000, signal);
  }

  // Holds a single pose, built from any pose object (see sprite.js).
  hold(pose, { facing, flip } = {}) {
    if (facing) this.facing = facing;
    if (flip !== undefined) this.flip = flip;
    this.pose = pose;
  }

  face(facing) { this.facing = facing; }
  express(expression = {}) { this.expression = expression; }
  talk(on) { this.talking = on; }

  // Looks toward a point in the current layer's coordinates, or ahead.
  lookAt(point) { this.gaze = point; }

  occlude(rects = []) { this.occluders = rects; }

  // --- Layers ------------------------------------------------------------------

  // Moves between the page (scrolls with the content) and the screen (fixed).
  setMode(mode) {
    if (mode === this.mode) return;
    const doc = this.toDocument({ x: this.x, y: this.y });
    const focused = this.button.getRootNode().activeElement === this.button;
    this.occluders = [];
    this.mode = mode;
    Object.assign(this, this.fromDocument(doc));
    this.layers[mode].append(this.el);
    if (focused) this.button.focus({ preventScroll: true }); // Moving an element drops its focus.
    this.#box = '';
  }

  toDocument({ x, y }) {
    const o = this.#origin(this.mode);
    return { x: x + o.x, y: y + o.y };
  }

  fromDocument({ x, y }) {
    const o = this.#origin(this.mode);
    return { x: x - o.x, y: y - o.y };
  }

  #origin(mode) {
    if (mode === 'screen') return { x: scrollX, y: scrollY };
    const rect = this.layers.page.getBoundingClientRect();
    return { x: rect.left + scrollX, y: rect.top + scrollY };
  }

  // The body's box in the current layer (for hit tests and free space).
  get box() {
    const frame = this.#frame ?? this.rig.frame(ANIMATIONS.stand.frames[0]);
    const s = this.scale;
    const left = this.x - CX * s;
    const top = this.y - frame.anchorY * s;
    return {
      left: left + frame.bbox.left * s,
      right: left + frame.bbox.right * s,
      top: top + frame.bbox.top * s,
      bottom: top + frame.bbox.bottom * s,
    };
  }

  // --- Actions (all cancellable with an AbortSignal) --------------------------------

  wait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const timer = setTimeout(done, ms);
      function done() { signal?.removeEventListener('abort', stop); resolve(); }
      function stop() { clearTimeout(timer); reject(abortError()); }
      signal?.addEventListener('abort', stop, { once: true });
    });
  }

  // Walks to a point. Picks the walk cycle from the direction unless told:
  // sideways uses the profile walk, toward the viewer the front walk.
  // `perspective` makes size and position change like a walk toward the camera.
  walkTo(target, { speed = 30, duration, anim, facing, perspective = false, signal } = {}) {
    const from = { x: this.x, y: this.y, scale: this.scale };
    const to = { x: target.x ?? from.x, y: target.y ?? from.y, scale: target.scale ?? from.scale };
    const dx = to.x - from.x, dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (!duration) duration = (distance / (speed * Math.max(from.scale, to.scale))) * 1000;
    if (reducedMotion()) duration = 0;
    const sideways = Math.abs(dx) >= Math.abs(dy) * 0.8 && Math.abs(dx) > 1;
    // anim: null slides without stepping (peeking out, ducking down).
    const walk = anim === null ? null : anim ?? (sideways ? 'walk.side' : to.scale >= from.scale || dy > 0 ? 'walk.front' : 'walk.back');
    if (walk) {
      const direction = facing ?? (walk === 'walk.side' ? (dx < 0 ? 'left' : 'right') : walk === 'walk.back' ? 'back' : 'front');
      // Step faster when walking faster, so the feet don't slide.
      const pace = walk === 'walk.side' && distance ? Math.min(18, Math.max(8, (distance / Math.max(from.scale, to.scale)) / (duration / 1000) * 0.4)) : null;
      this.play(walk, { facing: direction, fps: pace });
    }
    // A new walk replaces the one in progress, and that one's promise rejects.
    this.motion?.cancel();
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const finish = (arrived) => {
        signal?.removeEventListener('abort', stop);
        if (this.motion === motion) this.motion = null;
        if (arrived) resolve();
        else reject(abortError());
      };
      const stop = () => finish(false);
      const motion = { from, to, perspective, duration, start: performance.now(), done: () => finish(true), cancel: stop };
      signal?.addEventListener('abort', stop, { once: true });
      this.motion = motion;
    });
  }

  // Pixels appear or vanish in a scattered order, like an old screen wipe.
  fade(to, ms = 450, signal) {
    const from = this.dissolve;
    const start = performance.now();
    const fade = (this.#fading = {}); // A newer fade takes over.
    if (reducedMotion()) ms = 0;
    return new Promise((resolve, reject) => {
      const step = () => {
        if (signal?.aborted || this.#fading !== fade) return reject(abortError());
        const t = ms ? Math.min(1, (performance.now() - start) / ms) : 1;
        this.dissolve = from + (to - from) * t;
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      step();
    });
  }

  say(text, { ms = 4200, news = false } = {}) {
    clearTimeout(this.sayTimer);
    this.news = news;
    this.bubble.textContent = text;
    this.bubble.hidden = false;
    this.bubble.classList.remove('is-out');
    this.#fitBubble();
    if (ms) this.sayTimer = setTimeout(() => this.quiet(), ms);
  }

  quiet() {
    clearTimeout(this.sayTimer);
    this.news = false;
    if (this.bubble.hidden) return;
    this.bubble.classList.add('is-out');
    this.sayTimer = setTimeout(() => { this.bubble.hidden = true; }, 180);
  }

  // --- Drawing loop --------------------------------------------------------------------

  #tick = (now) => {
    if (this.#stopped) return;
    requestAnimationFrame(this.#tick);
    if (!this.visible) return;
    this.#move(now);
    this.#draw(now);
    this.#layout();
  };

  #move(now) {
    const m = this.motion;
    if (!m) return;
    const t = m.duration > 0 ? Math.min(1, (now - m.start) / m.duration) : 1;
    let scale, e;
    if (m.perspective && Math.abs(m.to.scale - m.from.scale) > 0.01) {
      // Constant speed in depth: size grows as 1 / distance.
      scale = 1 / (1 / m.from.scale + (1 / m.to.scale - 1 / m.from.scale) * t);
      e = (scale - m.from.scale) / (m.to.scale - m.from.scale);
    } else {
      e = t;
      scale = m.from.scale + (m.to.scale - m.from.scale) * t;
    }
    this.x = m.from.x + (m.to.x - m.from.x) * e;
    this.y = m.from.y + (m.to.y - m.from.y) * e;
    this.scale = scale;
    if (t >= 1) m.done();
  }

  #currentPose(now) {
    let base = this.pose;
    if (!base) {
      const anim = ANIMATIONS[this.anim];
      const fps = Number.isFinite(this.animFps) ? this.animFps : anim.fps;
      // A frame's timestamp can be a hair earlier than a play() call just before it.
      let i = Math.floor((Math.max(0, now - this.animStart) / 1000) * fps);
      i = this.animLoop ? i % anim.frames.length : Math.min(i, anim.frames.length - 1);
      base = anim.frames[i] ?? anim.frames[0];
    }
    const view = base.view ?? 'front';
    const mirror = view === 'side' ? this.facing === 'left' : this.flip;
    const pose = { ...base, mirror };

    // Eyes: blinking wins, then the pose, then the mood.
    if (now < this.#blinkUntil && base.eyes !== 'closed') pose.eyes = 'closed';
    else if (!base.eyes && this.expression.eyes) pose.eyes = this.expression.eyes;

    // Mouth: talking cycles through shapes at speaking speed.
    if (this.talking) {
      if (now > this.#mouthUntil) {
        const shapes = ['open', 'closed', 'wide', 'open', 'closed', 'smile', 'o', 'open'];
        this.#mouth = shapes[Math.floor(Math.random() * shapes.length)];
        this.#mouthUntil = now + 80 + Math.random() * 90;
      }
      pose.mouth = this.#mouth;
    } else if (!base.mouth && this.expression.mouth) {
      pose.mouth = this.expression.mouth;
    }

    // Looking: shift the eyes, or turn the head for things far to the side.
    if (this.gaze && view === 'front' && base.look === undefined && !base.headView) {
      const eyeX = this.x;
      const eyeY = this.y - (this.#frame?.anchorY ?? 62) * this.scale + 26 * this.scale;
      const dx = this.gaze.x - eyeX, dy = this.gaze.y - eyeY;
      const far = Math.abs(dx) > 260 * (this.scale / 3) && Math.abs(dx) > Math.abs(dy) * 1.4;
      if (far && !this.talking) {
        pose.headView = 'side';
        pose.headMirror = (dx < 0) !== mirror;
      } else {
        const look = Math.abs(dx) < 24 ? 0 : Math.sign(dx);
        pose.look = mirror ? -look : look;
        if (dy < -140 && !pose.eyes) pose.eyes = 'up';
      }
    }
    return pose;
  }

  #draw(now) {
    const pose = this.#currentPose(now);
    const step = Math.round(this.dissolve * 16);
    const key = JSON.stringify(pose) + step;
    if (key === this.#drawn) return;
    this.#drawn = key;
    const frame = this.rig.frame(pose);
    this.#frame = frame;
    let data = frame.data;
    if (step < 16) {
      data = new Uint8ClampedArray(frame.data);
      for (let i = 0; i < FRAME_W * FRAME_H; i++) {
        const x = i % FRAME_W, y = (i - x) / FRAME_W;
        if (((x * 7 + y * 13 + ((x * y) % 5) * 3) % 16) >= step) data[i * 4 + 3] = 0;
      }
    }
    this.ctx.putImageData(new ImageData(data, FRAME_W, FRAME_H), 0, 0);
    const { left, top, right, bottom } = frame.bbox;
    Object.assign(this.button.style, {
      left: `${(left / FRAME_W) * 100}%`,
      top: `${(top / FRAME_H) * 100}%`,
      width: `${((right - left) / FRAME_W) * 100}%`,
      height: `${((bottom - top) / FRAME_H) * 100}%`,
    });
    this.#box = '';
  }

  #layout() {
    const frame = this.#frame;
    if (!frame) return;
    const dpr = devicePixelRatio || 1;
    const s = this.scale;
    const snap = (v) => Math.round(v * dpr) / dpr;
    const left = snap(this.x - CX * s);
    const top = snap(this.y - frame.anchorY * s);
    const width = snap(FRAME_W * s);
    const height = snap(FRAME_H * s);
    const key = `${left} ${top} ${width} ${height}`;
    if (key !== this.#box) {
      this.#box = key;
      this.el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      this.el.style.width = `${width}px`;
      this.el.style.height = `${height}px`;
      this.el.style.setProperty('--head', `${frame.bbox.top * s}px`);
      this.el.style.setProperty('--feet', `${(FRAME_H - frame.bbox.bottom) * s}px`);
      if (!this.bubble.hidden) this.#fitBubble();
    }

    // Behind things: cut the occluded rectangles out of the sprite.
    let clip = '';
    for (const r of this.occluders) {
      const x0 = Math.max(0, r.left - left), x1 = Math.min(width, r.right - left);
      const y0 = Math.max(0, r.top - top), y1 = Math.min(height, r.bottom - top);
      if (x1 <= x0 || y1 <= y0) continue;
      clip += ` M${x0.toFixed(1)} ${y0.toFixed(1)}H${x1.toFixed(1)}V${y1.toFixed(1)}H${x0.toFixed(1)}Z`;
    }
    const path = clip ? `path(evenodd, 'M0 0H${width}V${height}H0Z${clip}')` : '';
    if (path !== this.#clip) {
      this.#clip = path;
      this.clipEl.style.clipPath = path;
      // Half hidden behind something: labels go above the head, not under the feet.
      this.el.classList.toggle('is-behind', Boolean(clip));
    }
  }

  // Keeps the speech bubble on screen.
  #fitBubble() {
    this.bubble.style.setProperty('--shift', '0px');
    const rect = this.bubble.getBoundingClientRect();
    const margin = 12;
    let shift = 0;
    if (rect.left < margin) shift = margin - rect.left;
    else if (rect.right > innerWidth - margin) shift = innerWidth - margin - rect.right;
    this.bubble.style.setProperty('--shift', `${shift}px`);
  }

  // Stops drawing and timers, for when the element leaves the page.
  destroy() {
    this.#stopped = true;
    this.motion?.cancel();
    clearTimeout(this.blinkTimer);
    clearTimeout(this.sayTimer);
    this.el.remove();
  }

  #blinkLater() {
    this.blinkTimer = setTimeout(() => {
      const now = performance.now();
      this.#blinkUntil = now + 130;
      // Now and then, a double blink.
      if (Math.random() < 0.2) setTimeout(() => { this.#blinkUntil = performance.now() + 110; }, 260);
      this.#blinkLater();
    }, 2400 + Math.random() * 3800);
  }
}

function abortError() {
  return new DOMException('Stopped', 'AbortError');
}
