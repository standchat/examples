// Gilly outside the page.
//
// iPhone and iPad: AR Quick Look places gilly.usdz in the room through the
// camera (an <a rel="ar"> link).
// Vision Pro: Safari's <model> element shows gilly.usdz with real depth right in
// the page, in a soft window in the corner. Visitors can pinch and drag Gilly out
// of the page into their room. The USDZ has one long animation; Gilly's moods are
// segments of it, played by seeking.
// Everywhere else, Gilly stays in the page (WebGL) and this file only offers a hint.

import { SEGMENTS } from './gilly-segments.js';

export function quickLookSupported() {
  try {
    return document.createElement('a').relList.supports('ar');
  } catch {
    return false;
  }
}

// Stereoscopic <model> is visionOS. Safari 27 also has <model> on iPhone, iPad and
// Mac, but renders it flat there, where the WebGL Gilly is livelier. visionOS 27
// tells by its immersive <model> API, which works on plain http too; visionOS 26
// only by WebXR, which needs https.
export async function spatialModelSupported() {
  if (!('HTMLModelElement' in window)) return false;
  if (document.immersiveEnabled) return true;
  try {
    return Boolean(await navigator.xr?.isSessionSupported?.('immersive-vr'));
  } catch {
    return false;
  }
}

// Opens AR Quick Look. Safari needs an <a rel="ar"> with an image child; a
// programmatic click from a user gesture works (this is what <model-viewer> does).
export function openQuickLook(usdz, { title = 'Gilly', subtitle = 'Tidelight Aquarium' } = {}) {
  const a = document.createElement('a');
  a.rel = 'ar';
  const params = new URLSearchParams({ allowsContentScaling: '1', canonicalWebPageURL: location.href.split('#')[0] });
  a.href = `${usdz}#${params}`;
  a.append(document.createElement('img'));
  a.dataset.title = title;
  a.dataset.subtitle = subtitle;
  a.click();
}

// "See Gilly in your room", for the chat menu.
export function menuItem({ usdz }) {
  if (!quickLookSupported()) return null;
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'See Gilly in your room';
  b.addEventListener('click', () => openQuickLook(usdz));
  return b;
}

// Fills the page's [data-ar-slot] with the right call to action for this device.
export async function decoratePage({ usdz, poster, onOpenChat }) {
  const slot = document.querySelector('[data-ar-slot]');
  if (!slot) return;
  const spatial = await spatialModelSupported();
  slot.replaceChildren();
  if (quickLookSupported()) {
    // Apple's markup: a link with rel="ar" around an image shows the AR badge.
    const a = document.createElement('a');
    a.rel = 'ar';
    a.href = `${usdz}#allowsContentScaling=1`;
    a.className = 'tl-ar-link';
    const img = document.createElement('img');
    img.src = poster;
    img.alt = 'See Gilly in your room';
    img.width = 120;
    img.height = 135;
    a.append(img);
    const label = document.createElement('span');
    label.className = 'tl-ar-label';
    label.textContent = spatial
      ? 'Tap for Quick Look, or pinch Gilly in the corner and drag them into your room.'
      : 'Tap to put Gilly on your table with AR.';
    slot.append(a, label);
  } else {
    const p = document.createElement('p');
    p.className = 'tl-ar-note';
    p.textContent = 'Open this page on iPhone, iPad or Apple Vision Pro to bring Gilly into your room. Here, Gilly lives in the corner.';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tl-ar-chat';
    b.textContent = 'Say hi to Gilly';
    b.addEventListener('click', onOpenChat);
    slot.append(p, b);
  }
}

// --- Vision Pro: Gilly in a soft window into the page ---------------------------------
//
// visionOS draws a <model> behind the page surface, fills its box with an opaque
// backdrop, and clips anything that comes in front of the surface. So Gilly stands
// in a pool of soft light whose edges fade into the page (a CSS mask), just far
// enough behind the surface that no mood gets clipped.

const POOL_SCALE = 0.64; // Gilly's size in the pool, relative to Safari's own fit
const MOUTH = [0, 0.162, 0.088]; // In the model's space: meters, Y up, facing +Z

export async function createSpatialGilly(stage, { src, poster, onTap }) {
  const pool = document.createElement('div');
  pool.className = 'gc-pool';
  const model = document.createElement('model');
  model.setAttribute('aria-label', 'Gilly, a pink axolotl. Pinch and drag to bring Gilly into your room.');
  const source = document.createElement('source');
  source.src = src;
  source.type = 'model/vnd.usdz+zip';
  model.append(source);
  const img = document.createElement('img');
  img.src = poster;
  img.alt = 'Gilly, a pink axolotl';
  model.append(img);
  model.addEventListener('click', () => onTap?.());
  pool.append(model);
  // Something to tap: a pinch on the model itself drags Gilly out of the page.
  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'gc-pool-label';
  label.textContent = 'Chat with Gilly';
  label.addEventListener('click', () => onTap?.());
  stage.append(pool, label);
  await model.ready;

  // Safari fits the model's resting pose into the box, with its front on the page
  // surface (z = 0; +z comes toward the viewer). Gilly stands back from it by as far
  // as the current mood ever reaches (measured in Blender, see gilly-segments.js):
  // the loops share one depth, and bigger moods like the flip back up first.
  const fit = model.entityTransform;
  const scale = fit.m11 * POOL_SCALE;
  const lift = -model.boundingBoxCenter.y * scale;
  const calm = Math.max(...Object.values(SEGMENTS).filter((seg) => seg.loop).map((seg) => seg.front));
  const depthFor = (name) => -(Math.max(calm, SEGMENTS[name]?.front ?? calm) + 0.01) * scale;
  let z = depthFor('idle');
  let zGoal = z;
  const place = () => {
    model.entityTransform = new DOMMatrix().translateSelf(0, lift, z).scaleSelf(scale, scale, scale);
  };
  place();

  let segment = null;
  let startedAt = 0;
  let waiting = null; // A mood that needs more room, until Gilly has backed up.
  const start = (name, { loop = false, then } = {}) => {
    segment = { name, ...SEGMENTS[name], loop, then };
    startedAt = performance.now();
    model.currentTime = segment.start;
    model.playbackRate = 1;
    model.play?.()?.catch?.(() => {});
  };
  const play = (name, options = {}) => {
    if (!SEGMENTS[name]) return;
    zGoal = depthFor(name);
    waiting = zGoal < z - 1e-5 ? [name, options] : null;
    if (!waiting) start(name, options);
  };
  const settle = () => {
    if (z !== zGoal) {
      z = zGoal;
      place();
    }
    if (waiting) {
      const [name, options] = waiting;
      waiting = null;
      start(name, options);
    }
  };
  // Keep playback inside the current segment: loop it or move on. Checked every
  // frame, and on a timer too: frames can stop while the model keeps playing, and
  // it must never run on into the rest of the reel. A model that stopped (at the
  // end of the timeline, say) starts again.
  let lastFrame = performance.now();
  const check = () => {
    if (performance.now() - lastFrame > 250) settle(); // No frames to ease with.
    if (!segment) return;
    const t = model.currentTime;
    const end = Math.min(segment.end, model.duration > 0 ? model.duration : Infinity); // The last one ends with the timeline.
    const stopped = model.paused && performance.now() - startedAt > 1000;
    if (!stopped && t >= segment.start - 0.5 && t < end - 0.03) return;
    if (segment.loop) start(segment.name, { loop: true });
    else if (waiting) start(segment.then ?? 'idle', { loop: true }); // Keep the next mood waiting.
    else play(segment.then ?? 'idle', { loop: true });
  };
  let raf = 0;
  const onFrame = (now) => {
    raf = requestAnimationFrame(onFrame);
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    // Ease to the new depth; a waiting mood starts once Gilly is there.
    if (z !== zGoal) {
      z += (zGoal - z) * Math.min(1, dt * 5);
      if (Math.abs(zGoal - z) < 2e-5) z = zGoal;
      place();
    }
    if (waiting && z === zGoal) settle();
    check();
  };
  raf = requestAnimationFrame(onFrame);
  const timer = setInterval(check, 100);
  start('idle', { loop: true });
  pool.dataset.ready = ''; // Fades in: no empty window while the model loads.

  const LOOPS = { idle: 'idle', attentive: 'idle', listening: 'listen', thinking: 'think', talking: 'talk' };
  let state = 'idle';
  let bored = 0;
  const boredom = setInterval(() => {
    // Now and then, a bored little performance while nobody is chatting.
    if (state !== 'idle' || document.hidden) return;
    bored += 1;
    if (bored % 3 === 0) play(['sigh', 'yawn', 'look', 'flip'][Math.floor(Math.random() * 4)], { then: 'idle' });
  }, 5000);

  // Where a point on Gilly appears on the page. Safari's fit makes the resting
  // pose fill the box, which gives the scale from model meters to CSS pixels.
  const toPage = ([x, y]) => {
    const r = model.getBoundingClientRect();
    const e = model.boundingBoxExtents;
    const px = Math.min(r.width / e.x, r.height / e.y) / fit.m11; // CSS px per unit of the box's space
    return { x: r.left + r.width / 2 + x * scale * px, y: r.top + r.height / 2 - (y * scale + lift) * px };
  };
  // A flip in progress always lands: cutting it off would snap Gilly upright mid-air.
  const flipping = () => segment?.name === 'flip' && model.currentTime < segment.end - 0.05;
  return {
    setState(next) {
      if (next === state) return;
      state = next;
      const loop = LOOPS[next] ?? 'idle';
      if (flipping()) segment.then = loop;
      else play(loop, { loop: true });
    },
    perform(name) {
      if (flipping()) return;
      const map = { greet: 'wave', wave: 'wave', bye: 'wave', happy: 'happy', aww: 'happy', sorry: 'sorry', bubbles: 'look' };
      play(map[name] ?? name, { then: LOOPS[state] ?? 'idle' });
    },
    attention() {
      bored = 0;
    },
    mouth() { /* Talking is baked into the talk loop. */ },
    anchor() {
      return toPage(MOUTH);
    },
    bounds() {
      const c = model.boundingBoxCenter;
      const e = model.boundingBoxExtents;
      const a = toPage([c.x - e.x / 2, c.y + e.y / 2]);
      const b = toPage([c.x + e.x / 2, c.y - e.y / 2]);
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    },
    pointer() {},
    dispose() {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      clearInterval(boredom);
      pool.remove();
      label.remove();
    },
  };
}
