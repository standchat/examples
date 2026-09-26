// Gilly outside the page.
//
// iPhone and iPad: AR Quick Look places gilly.usdz in the room through the
// camera (an <a rel="ar"> link).
// Vision Pro: Safari's <model> element shows gilly.usdz with real depth right in
// the page, in a porthole in the corner. Visitors can pinch and drag Gilly out of
// the page into their room. The USDZ has one long animation; Gilly's moods are
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
// Mac, but renders it flat there, where the WebGL Gilly is livelier.
export async function spatialModelSupported() {
  if (!('HTMLModelElement' in window)) return false;
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

// --- Vision Pro: Gilly as a <model> in a porthole ------------------------------------

export async function createSpatialGilly(stage, { src, poster, onTap }) {
  const port = document.createElement('div');
  port.className = 'gc-porthole';
  // A nameplate under the window, like an aquarium tank label: a tap target that
  // doesn't compete with the model's own pinch-and-drag.
  const plaque = document.createElement('button');
  plaque.type = 'button';
  plaque.className = 'gc-plaque';
  plaque.innerHTML = '<strong>Gilly</strong><span>Tap to chat</span>';
  plaque.addEventListener('click', () => onTap?.());
  port.addEventListener('click', () => onTap?.());
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
  port.append(model);
  stage.append(port, plaque);
  await model.ready;
  // <model> fits the model's bounds to the element's height; the round window would
  // clip gills and feet, so shrink a little and re-center.
  const fit = model.entityTransform;
  const s = fit.m11 * 0.74;
  model.entityTransform = new DOMMatrix()
    .translateSelf(0, -model.boundingBoxCenter.y * s, fit.m43 * 0.74)
    .scaleSelf(s, s, s);

  let segment = null;
  let startedAt = 0;
  const play = (name, { loop = false, then } = {}) => {
    const seg = SEGMENTS[name];
    if (!seg) return;
    segment = { name, ...seg, loop, then };
    startedAt = performance.now();
    model.currentTime = seg.start;
    model.playbackRate = 1;
    model.play?.()?.catch?.(() => {});
  };
  // Keep playback inside the current segment: loop it or move on. Checked every
  // frame, and on a timer too: frames can stop while the model keeps playing, and
  // it must never run on into the rest of the reel. A model that stopped (at the
  // end of the timeline, say) starts again.
  const check = () => {
    if (!segment) return;
    const t = model.currentTime;
    const stopped = model.paused && performance.now() - startedAt > 1000;
    if (!stopped && t >= segment.start - 0.5 && t < segment.end - 0.03) return;
    if (segment.loop) play(segment.name, { loop: true });
    else play(segment.then ?? 'idle', { loop: true });
  };
  let raf = 0;
  const onFrame = () => {
    raf = requestAnimationFrame(onFrame);
    check();
  };
  raf = requestAnimationFrame(onFrame);
  const timer = setInterval(check, 100);
  play('idle', { loop: true });

  const LOOPS = { idle: 'idle', attentive: 'idle', listening: 'listen', thinking: 'think', talking: 'talk' };
  let state = 'idle';
  let bored = 0;
  const boredom = setInterval(() => {
    // Now and then, a bored little performance while nobody is chatting.
    if (state !== 'idle' || document.hidden) return;
    bored += 1;
    if (bored % 3 === 0) play(['sigh', 'yawn', 'look', 'flip'][Math.floor(Math.random() * 4)], { then: 'idle' });
  }, 5000);

  const rect = () => port.getBoundingClientRect();
  return {
    plaque,
    setState(next) {
      if (next === state) return;
      state = next;
      play(LOOPS[next] ?? 'idle', { loop: true });
    },
    perform(name) {
      const map = { greet: 'wave', wave: 'wave', bye: 'wave', happy: 'happy', aww: 'happy', sorry: 'sorry', bubbles: 'look' };
      play(map[name] ?? name, { then: LOOPS[state] ?? 'idle' });
    },
    attention() {
      bored = 0;
    },
    mouth() { /* Talking is baked into the talk loop. */ },
    anchor() {
      const r = rect();
      return { x: r.left + r.width * 0.42, y: r.top + r.height * 0.48 };
    },
    bounds() {
      const r = rect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    },
    pointer() {},
    dispose() {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      clearInterval(boredom);
      port.remove();
    },
  };
}
