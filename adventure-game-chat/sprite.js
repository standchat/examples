// The pixel rig: turns a character definition into animation frames.
//
// A character is a few hand-drawn pixel maps (head and torso, seen from the
// front, the side and the back) plus a palette. Arms and legs are drawn here,
// from joint positions, so every character gets every pose: walking in four
// directions, waving, sitting, leaning, peeking, talking. Nothing here touches
// the DOM, so the same code renders frames in the browser and in tests.

export const FRAME_W = 40;
export const FRAME_H = 64;
const CX = 20; // Center line, between pixel columns 19 and 20.
const SOLE = 61; // Bottom row of the shoes.
const HEAD = 18; // Head and torso maps are 18 × 18.

const DEFAULT_COLORS = {
  o: '#1c1426', // Outline
  e: '#1c1426', // Eyes
  m: '#a4574f', // Closed mouth
  M: '#4a1a26', // Open mouth
  w: '#fbf6ec', // White
};

const BUILD = { legs: 14, shoulders: 7, hips: 3 };

// Joint geometry, in pixels. Poses name hand and ankle positions; elbows and
// knees are solved from these lengths.
const UPPER_ARM = 5.5;
const FOREARM = 5.5;
const THIGH = 6.5;
const SHIN = 6.2;

export function createRig(definition) {
  const def = normalize(definition);
  const build = def.build;
  const hipY = SOLE - build.legs; // 47 for the default build
  const torsoTop = hipY - 13;
  const headTop = torsoTop - HEAD;
  const colors = { ...DEFAULT_COLORS, ...def.palette };
  // A letter without a color draws magenta; say which, to help whoever drew it.
  const unknown = new Set();
  for (const maps of [def.head, def.torso]) {
    for (const rows of Object.values(maps)) for (const row of rows) for (const key of row) if (key !== '.' && key !== ' ' && !colors[key]) unknown.add(key);
  }
  if (unknown.size) console.warn(`Character "${def.id ?? def.name}": no palette color for ${[...unknown].map((k) => `"${k}"`).join(', ')}.`);
  const rgba = Object.fromEntries(Object.entries(colors).map(([key, hex]) => [key, parseColor(hex)]));
  const cache = new Map();

  const geometry = { hipY, torsoTop, headTop };

  function frame(pose) {
    const key = JSON.stringify(pose);
    let result = cache.get(key);
    if (!result) {
      const keys = draw(def, geometry, pose);
      result = { width: FRAME_W, height: FRAME_H, data: toRgba(keys, rgba), anchorY: pose.sit ? hipY + 1 : SOLE + 1, bbox: bbox(keys) };
      cache.set(key, result);
    }
    return result;
  }

  // Where things are, for the runtime: the visible body box and the head.
  const bounds = { top: headTop, bottom: SOLE + 1, left: CX - 9, right: CX + 9, eyes: headTop + (def.face.front.eyes[0][1] ?? 9) };

  return { def, frame, bounds, geometry };
}

function normalize(def) {
  const build = { ...BUILD, ...(def.build ?? {}) };
  const pad = (rows = []) => {
    const out = rows.slice(0, HEAD).map((row) => row.padEnd(HEAD, '.').slice(0, HEAD));
    while (out.length < HEAD) out.unshift('.'.repeat(HEAD));
    return out;
  };
  const views = (maps = {}) => ({ front: pad(maps.front), side: pad(maps.side ?? maps.front), back: pad(maps.back ?? maps.front) });
  return {
    ...def,
    build,
    head: views(def.head),
    torso: views(def.torso),
    face: {
      front: { eyes: [[6, 10], [11, 10]], mouth: [8, 13], ...(def.face?.front ?? {}) },
      side: { eye: [12, 10], mouth: [13, 13], ...(def.face?.side ?? {}) },
      eye: def.face?.eye ?? [1, 2],
    },
    arms: { sleeve: 't', shade: 'T', hand: 's', cuff: null, short: false, ...(def.arms ?? {}) },
    legs: { color: 'p', shade: 'P', skin: null, shoe: 'f', sole: 'F', ...(def.legs ?? {}) },
  };
}

// --- Drawing -----------------------------------------------------------------

function draw(def, { hipY, torsoTop, headTop }, pose) {
  const view = pose.view ?? 'front';
  const bob = pose.bob ?? 0;
  const lean = pose.lean ?? 0;
  const torsoDx = Math.round(lean / 2);
  const out = new Array(FRAME_W * FRAME_H).fill('');
  const { shoulders, hips } = def.build;
  const shoulderY = torsoTop + 1.5 + bob;
  const hipJointY = hipY + bob;

  const torso = () => stamp(out, def.torso[view], CX - 9 + torsoDx, torsoTop + bob);
  const head = () => {
    const x = CX - 9 + lean + (pose.headDx ?? 0);
    const y = headTop + bob + (pose.headDy ?? 0);
    // The head can turn on its own: a side head on a front body looks aside.
    const headView = pose.headView ?? view;
    const map = pose.headMirror ? def.head[headView].map((row) => [...row].reverse().join('')) : def.head[headView];
    stamp(out, map, x, y);
    if (headView !== 'back') face(out, def, headView, pose, x, y, pose.headMirror);
  };
  const shoulder = (side) =>
    view === 'side' ? [CX + torsoDx + (side === 'far' ? 1 : -1), shoulderY] : [CX + torsoDx + (side === 'l' ? -shoulders : shoulders), shoulderY];
  const hip = (side) => (view === 'side' ? [CX, hipJointY] : [CX + (side === 'l' ? -hips : hips), hipJointY]);
  const arm = (side, spec) => spec && drawArm(out, def, view, side, shoulder(side), spec);
  const leg = (side, spec) => spec && drawLeg(out, def, view, side, hip(side), spec, pose.sit);

  const arms = pose.arms ?? {};
  const legs = pose.legs ?? {};
  if (view === 'side') {
    arm('far', arms.far);
    leg('far', legs.far);
    leg('near', legs.near);
    torso();
    head();
    arm('near', arms.near);
  } else if (pose.sit) {
    torso();
    for (const side of pose.legOrder ?? ['r', 'l']) leg(side, legs[side]);
    head();
    for (const side of pose.armOrder ?? ['l', 'r']) arm(side, arms[side]);
  } else {
    for (const side of pose.legOrder ?? ['r', 'l']) leg(side, legs[side]);
    torso();
    if (view === 'back') {
      for (const side of pose.armOrder ?? ['l', 'r']) arm(side, arms[side]);
      head();
    } else {
      head();
      for (const side of pose.armOrder ?? ['l', 'r']) arm(side, arms[side]);
    }
  }

  outline(out);
  return pose.mirror ? mirror(out) : out;
}

function stamp(out, map, x0, y0) {
  map.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const key = row[i];
      if (key !== '.' && key !== ' ') put(out, x0 + i, y0 + j, key);
    }
  });
}

function face(out, def, view, pose, x0, y0, flipped = false) {
  if (flipped) {
    // Draw on a scratch copy facing the usual way, then flip it into place.
    const scratch = new Array(FRAME_W * FRAME_H).fill('');
    face(scratch, def, view, pose, 0, 0);
    for (let y = 0; y < HEAD; y++) for (let x = 0; x < HEAD; x++) {
      const key = scratch[y * FRAME_W + x];
      if (key) put(out, x0 + HEAD - 1 - x, y0 + y, key);
    }
    return;
  }
  const look = pose.look ?? 0;
  const up = pose.eyes === 'up' ? -1 : pose.eyes === 'down' ? 1 : 0;
  const [ew, eh] = def.face.eye;
  const eyes = view === 'side' ? [def.face.side.eye] : def.face.front.eyes;
  eyes.forEach(([ex, ey], index) => {
    const x = x0 + ex + (view === 'side' ? 0 : look);
    const y = y0 + ey;
    const outward = view === 'side' ? 0 : index === 0 ? -1 : 1;
    switch (pose.eyes) {
      case 'closed':
        for (let i = -1; i < ew; i++) put(out, x + (outward < 0 ? i : i + 1), y + eh - 1, 'e');
        break;
      case 'happy':
        put(out, x, y, 'e');
        for (let i = 0; i < ew; i++) put(out, x + i, y, 'e');
        put(out, x - 1, y + 1, 'e');
        put(out, x + ew, y + 1, 'e');
        break;
      case 'down':
        for (let i = 0; i < ew; i++) put(out, x + i, y + eh - 1, 'e');
        break;
      default:
        for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) put(out, x + i, y + j + up, 'e');
    }
  });

  const [mx, my] = view === 'side' ? def.face.side.mouth : def.face.front.mouth;
  const x = x0 + mx;
  const y = y0 + my;
  const wide = view === 'side' ? 1 : 2;
  switch (pose.mouth) {
    case 'smile':
      if (view === 'side') { put(out, x - 1, y, 'm'); put(out, x, y, 'm'); put(out, x - 2, y - 1, 'm'); }
      else { put(out, x - 1, y - 1, 'm'); put(out, x, y, 'm'); put(out, x + 1, y, 'm'); put(out, x + 2, y - 1, 'm'); }
      break;
    case 'open':
      for (let i = 0; i < wide; i++) { put(out, x + i, y, 'M'); put(out, x + i, y + 1, 'M'); }
      break;
    case 'wide':
      for (let i = -1; i <= wide; i++) put(out, x + i, y, 'M');
      for (let i = 0; i < wide; i++) put(out, x + i, y + 1, 'M');
      break;
    case 'o':
      put(out, x + (wide > 1 ? 0 : 0), y, 'M');
      if (wide > 1) put(out, x + 1, y, 'M');
      break;
    case 'none':
      break;
    default:
      for (let i = 0; i < wide; i++) put(out, x + i, y, 'm');
  }
}

// Arms: shoulder → elbow → hand. `hand` and `elbow` are [out, down] from the
// shoulder, where "out" points away from the body (front and back views) or
// forward (side view).
function drawArm(out, def, view, side, [sx, sy], spec) {
  const dir = view === 'side' ? 1 : side === 'l' ? -1 : 1;
  const hand = [sx + spec.hand[0] * dir, sy + spec.hand[1]];
  const elbow = spec.elbow ? [sx + spec.elbow[0] * dir, sy + spec.elbow[1]] : solve([sx, sy], hand, UPPER_ARM, FOREARM, view === 'side' ? -1 : dir);
  const far = side === 'far';
  const { sleeve, shade, hand: skin, cuff, short } = def.arms;
  const color = far ? shade : sleeve;
  const mask = new Set();
  capsule(mask, sx, sy, elbow[0], elbow[1], 1);
  capsule(mask, elbow[0], elbow[1], hand[0], hand[1], 1);
  const handMask = new Set();
  disc(handMask, hand[0], hand[1], spec.shape === 'open' ? 1.4 : 1.1);
  if (spec.shape === 'point') {
    const [hx, hy] = hand;
    const ux = hand[0] - elbow[0], uy = hand[1] - elbow[1];
    const len = Math.hypot(ux, uy) || 1;
    handMask.add(idx(Math.floor(hx + (ux / len) * 2), Math.floor(hy + (uy / len) * 2)));
  }
  separate(out, new Set([...mask, ...handMask]));
  for (const i of mask) out[i] = color;
  if (short) {
    const forearm = new Set();
    capsule(forearm, lerp(sx, elbow[0], 0.7), lerp(sy, elbow[1], 0.7), hand[0], hand[1], 1);
    for (const i of forearm) out[i] = far ? (def.palette.S ? 'S' : skin) : skin;
  } else if (cuff) {
    const wrist = new Set();
    capsule(wrist, lerp(elbow[0], hand[0], 0.8), lerp(elbow[1], hand[1], 0.8), lerp(elbow[0], hand[0], 0.8), lerp(elbow[1], hand[1], 0.8), 1);
    for (const i of wrist) out[i] = cuff;
  }
  for (const i of handMask) out[i] = far && def.palette.S ? 'S' : skin;
}

// Legs: hip → knee → ankle, then a shoe. `ankle` is [out, down] from the hip.
function drawLeg(out, def, view, side, [hx, hy], spec, sitting) {
  const dir = view === 'side' ? 1 : side === 'l' ? -1 : 1;
  const ankle = [hx + spec.ankle[0] * dir, hy + spec.ankle[1]];
  let knee;
  if (spec.knee) knee = [hx + spec.knee[0] * dir, hy + spec.knee[1]];
  else if (view === 'side') knee = solve([hx, hy], ankle, THIGH, SHIN, 1);
  else knee = [lerp(hx, ankle[0], 0.5), lerp(hy, ankle[1], 0.5)];
  const far = side === 'far';
  const { color, shade, skin, shoe, sole } = def.legs;
  const mask = new Set();
  capsule(mask, hx, hy, knee[0], knee[1], sitting ? 2.2 : 2);
  capsule(mask, knee[0], knee[1], ankle[0], ankle[1], 2);
  const shoeMask = new Map();
  const ax = Math.round(ankle[0]);
  const ay = Math.floor(ankle[1]) + 1;
  const kind = spec.shoe ?? (view === 'side' ? 'side' : view === 'back' ? 'back' : 'front');
  const outward = view === 'side' ? 1 : dir;
  const add = (x, y, key) => shoeMask.set(idx(x, y), key);
  if (kind === 'side') {
    for (let x = ax - 2; x <= ax + 2; x++) add(x, ay, shoe);
    for (let x = ax - 2; x <= ax + 3; x++) add(x, ay + 1, sole);
  } else if (kind === 'tiptoe') {
    for (let x = ax - 1; x <= ax + 1; x++) add(x, ay, shoe);
    for (let x = ax; x <= ax + 2; x++) add(x, ay + 1, sole);
  } else if (kind === 'back') {
    for (let x = ax - 2; x <= ax + 1; x++) add(x, ay, shoe);
    for (let x = ax - 2; x <= ax + 1; x++) add(x, ay + 1, sole);
  } else {
    // Front: a little wider than the leg, toes pointing out.
    const [a, b] = outward < 0 ? [ax - 3, ax + 1] : [ax - 2, ax + 2];
    for (let x = a + (outward < 0 ? 1 : 0); x <= b - (outward < 0 ? 0 : 1); x++) add(x, ay, shoe);
    for (let x = a; x <= b; x++) add(x, ay + 1, sole);
  }
  separate(out, new Set([...mask, ...shoeMask.keys()]));
  const legColor = far ? shade : color;
  for (const i of mask) out[i] = legColor;
  if (skin) {
    // Bare or stockinged legs below a skirt or shorts: color the shin.
    const shin = new Set();
    capsule(shin, lerp(knee[0], ankle[0], 0.05), lerp(knee[1], ankle[1], 0.05), ankle[0], ankle[1], 2);
    for (const i of shin) out[i] = far && def.palette[skin.toUpperCase()] ? skin.toUpperCase() : skin;
  }
  for (const [i, key] of shoeMask) if (i >= 0) out[i] = key;
}

// Two-bone IK: the joint between root and end, bending toward `bend`.
function solve([rx, ry], [ex, ey], a, b, bend) {
  const dx = ex - rx, dy = ey - ry;
  const d = Math.min(Math.hypot(dx, dy), a + b - 0.001);
  if (d < 0.001) return [rx, ry + a];
  const cos = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const angle = Math.atan2(dy, dx) - bend * Math.acos(cos);
  return [rx + Math.cos(angle) * a, ry + Math.sin(angle) * a];
}

// Pixels whose centers are within r of the segment.
function capsule(mask, x1, y1, x2, y2, r) {
  const minX = Math.floor(Math.min(x1, x2) - r), maxX = Math.ceil(Math.max(x1, x2) + r);
  const minY = Math.floor(Math.min(y1, y2) - r), maxY = Math.ceil(Math.max(y1, y2) + r);
  const vx = x2 - x1, vy = y2 - y1;
  const len2 = vx * vx + vy * vy || 1e-9;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const t = clamp(((px - x1) * vx + (py - y1) * vy) / len2, 0, 1);
      if (Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy)) < r) {
        const i = idx(x, y);
        if (i >= 0) mask.add(i);
      }
    }
  }
}

function disc(mask, cx, cy, r) {
  capsule(mask, cx, cy, cx, cy, r);
}

// Limbs drawn over the body get their own outline, so an arm in front of a
// coat reads as an arm.
function separate(out, mask) {
  for (const i of mask) {
    const x = i % FRAME_W, y = (i - x) / FRAME_W;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const j = idx(nx, ny);
      if (j >= 0 && !mask.has(j) && out[j] && out[j] !== 'o') out[j] = 'o';
    }
  }
}

// The silhouette's outline, drawn on the outside.
function outline(out) {
  const edge = [];
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      if (out[y * FRAME_W + x]) continue;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const j = idx(nx, ny);
        if (j >= 0 && out[j] && out[j] !== 'o') { edge.push(y * FRAME_W + x); break; }
      }
    }
  }
  for (const i of edge) out[i] = 'o';
}

function bbox(keys) {
  let left = FRAME_W, right = -1, top = FRAME_H, bottom = -1;
  keys.forEach((key, i) => {
    if (!key) return;
    const x = i % FRAME_W, y = (i - x) / FRAME_W;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  });
  return { left, top, right: right + 1, bottom: bottom + 1 };
}

function mirror(out) {
  const flipped = new Array(out.length);
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) flipped[y * FRAME_W + x] = out[y * FRAME_W + (FRAME_W - 1 - x)];
  return flipped;
}

function toRgba(keys, rgba) {
  const data = new Uint8ClampedArray(keys.length * 4);
  keys.forEach((key, i) => {
    if (!key) return;
    data.set(rgba[key] ?? [255, 0, 255, 255], i * 4);
  });
  return data;
}

function put(out, x, y, key) {
  const i = idx(x, y);
  if (i >= 0) out[i] = key;
}

function idx(x, y) {
  x = Math.floor(x); y = Math.floor(y);
  return x < 0 || y < 0 || x >= FRAME_W || y >= FRAME_H ? -1 : y * FRAME_W + x;
}

function parseColor(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex).trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 255] : [255, 0, 255, 255];
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// --- Poses -------------------------------------------------------------------
// Hands are [out, down] from the shoulder and ankles [out, down] from the hip.
// In the side view, "out" is forward. Front and back views name the arms and
// legs l and r as the viewer sees them.

const hang = { hand: [0, 10.5], elbow: [0.3, 5.2] };
const planted = { ankle: [0, 12.5] };
const front = (arms, legs = { l: planted, r: planted }, extra = {}) => ({ view: 'front', arms, legs, ...extra });
const both = (arm) => ({ l: arm, r: arm });
const dangle = (kick) => ({ knee: [0.5, 0.8], ankle: [0.3 + kick * 0.4, 7.3 - kick * 1.2] });

// Standing with one foot up on something `h` pixels high, just ahead: the
// explorer's pose. Side view; the near hand rests on the raised knee.
export const footUp = (h = 10) => ({
  view: 'side',
  legs: { far: { ankle: [-2, 12.4] }, near: { ankle: [6.5, 12.5 - h] } },
  arms: { far: { hand: [1, 10.5] }, near: { hand: [4.5, Math.max(4, 11 - h * 0.6)], elbow: [1.5, 5] } },
});

// Resting an elbow on something to the viewer's left, `dy` pixels below the shoulder.
export const leanElbow = (dy = 2) =>
  front({ l: { hand: [8, dy], elbow: [4, dy + 0.5] }, r: { hand: [-1, 9], elbow: [4, 4] } }, { l: { ankle: [-3, 12.5], shoe: 'tiptoe' }, r: planted }, { lean: -2, legOrder: ['r', 'l'] });

export const POSES = {
  stand: front(both(hang)),
  'stand.side': { view: 'side', arms: { far: { hand: [1, 10.5] }, near: { hand: [-1, 10.5] } }, legs: { far: { ankle: [-1.5, 12.4] }, near: { ankle: [1.5, 12.4] } } },
  'stand.back': { ...front(both(hang)), view: 'back' },
  wave1: front({ l: hang, r: { hand: [3, -9], elbow: [4, -2], shape: 'open' } }, undefined, { mouth: 'smile' }),
  wave2: front({ l: hang, r: { hand: [6, -8], elbow: [4, -2], shape: 'open' } }, undefined, { mouth: 'smile' }),
  think: front({ l: { hand: [-3, 8], elbow: [1, 6] }, r: { hand: [-5, -4], elbow: [2, 5] } }, undefined, { eyes: 'up', look: 1, armOrder: ['l', 'r'] }),
  shrug: front(both({ hand: [5, 6], elbow: [2, 6], shape: 'open' }), undefined, { mouth: 'flat' }),
  hips: front(both({ hand: [-1, 9], elbow: [4, 4] })),
  crossed: front({ l: { hand: [-10, 6], elbow: [1, 6] }, r: { hand: [-10, 5], elbow: [1, 5] } }, undefined, { armOrder: ['r', 'l'] }),
  watch: front({ l: { hand: [-8, 5], elbow: [1, 6] }, r: hang }, undefined, { eyes: 'down', headDy: 1 }),
  stretch: front(both({ hand: [1, -13], elbow: [3, -6] }), undefined, { eyes: 'closed', mouth: 'wide' }),
  scratch: front({ l: hang, r: { hand: [-1, -10], elbow: [4, -4] } }, undefined, { eyes: 'up', look: 1 }),
  gesture: front({ l: hang, r: { hand: [4, 2], elbow: [3, 7], shape: 'open' } }),
  kilroy: front(both({ hand: [0, -10], elbow: [3, -3] })),
  jump: front(both({ hand: [3, -8], elbow: [4, -2], shape: 'open' }), { l: { ankle: [1, 9.5] }, r: { ankle: [1, 9.5] } }, { mouth: 'open' }),
  // Sitting on a ledge, seen from the front: thighs point at the viewer, so
  // the knees sit on the ledge line and the shins hang in front of it.
  sit: front(both({ hand: [2, 12.5], elbow: [1.5, 6] }), { l: dangle(0), r: dangle(0) }, { sit: true }),
  sitKick: front(both({ hand: [2, 12.5], elbow: [1.5, 6] }), { l: dangle(1), r: dangle(0) }, { sit: true }),
  sitWave1: front({ l: { hand: [2, 12.5], elbow: [1.5, 6] }, r: { hand: [3, -9], elbow: [4, -2], shape: 'open' } }, { l: dangle(0), r: dangle(0) }, { sit: true, mouth: 'smile' }),
  sitWave2: front({ l: { hand: [2, 12.5], elbow: [1.5, 6] }, r: { hand: [6, -8], elbow: [4, -2], shape: 'open' } }, { l: dangle(0), r: dangle(1) }, { sit: true, mouth: 'smile' }),
  sitKick2: front(both({ hand: [2, 12.5], elbow: [1.5, 6] }), { l: dangle(0), r: dangle(1) }, { sit: true }),
  point: { view: 'side', arms: { far: { hand: [1, 10.5] }, near: { hand: [10, -1], shape: 'point' } }, legs: { far: { ankle: [-1.5, 12.4] }, near: { ankle: [1.5, 12.4] } } },
  pointDown: { view: 'side', arms: { far: { hand: [1, 10.5] }, near: { hand: [8, 7], shape: 'point' } }, legs: { far: { ankle: [-1.5, 12.4] }, near: { ankle: [1.5, 12.4] } }, mouth: 'smile' },
  present: { view: 'side', arms: { far: { hand: [1, 10.5] }, near: { hand: [7, 5], shape: 'open' } }, legs: { far: { ankle: [-1.5, 12.4] }, near: { ankle: [1.5, 12.4] } }, mouth: 'smile' },
  // Leaning back against something on the character's left, arms folded.
  leanWall: { view: 'side', lean: -1, arms: { far: { hand: [4, 5], elbow: [0, 5] }, near: { hand: [4, 4], elbow: [0, 5] } }, legs: { far: { ankle: [-1, 12.5] }, near: { ankle: [2.5, 12.3], shoe: 'tiptoe' } } },
  leanElbow: leanElbow(2),
  footUp: footUp(10),
  // Leaning out from behind something on the viewer's left, one hand on its edge.
  // The box edge sits at sprite x ≈ 14.5, so the face shows and the hand grips the edge.
  peek: front({ l: { hand: [-1.5, -8.5], elbow: [2, -2], shape: 'open' }, r: hang }, undefined, { lean: 2 }),
  tap: front({ l: { hand: [-1, 9], elbow: [4, 4] }, r: { hand: [-1, 9], elbow: [4, 4] } }, { l: planted, r: { ankle: [0.5, 11.5], shoe: 'tiptoe' } }),
  glasses: front({ l: hang, r: { hand: [-3, -9], elbow: [3, -1] } }),
  beard: front({ l: hang, r: { hand: [-5, -3], elbow: [3, 4] } }, undefined, { eyes: 'up', look: -1 }),
  headset: front({ l: hang, r: { hand: [-1, -9], elbow: [4, -3] } }, undefined, { look: 1 }),
};

const walkSide = [
  [1, [5, 11.5], [-5, 11.0, 'tiptoe'], [-3, 10], [3, 10]],
  [1, [3, 11.5], [-6, 9.5, 'tiptoe'], [-2, 10.3], [2, 10.3]],
  [0, [0, 12.5], [-1.5, 9]],
  [0, [-3, 12.1], [3, 10.5], [2, 10.3], [-2, 10.3]],
  [1, [-5, 11.0, 'tiptoe'], [5, 11.5], [3, 10], [-3, 10]],
  [1, [-6, 9.5, 'tiptoe'], [3, 11.5], [2, 10.3], [-2, 10.3]],
  [0, [-1.5, 9], [0, 12.5]],
  [0, [3, 10.5], [-3, 12.1], [-2, 10.3], [2, 10.3]],
].map(([bob, near, far, nearArm = [0, 10.5], farArm = [0, 10.5]]) => ({
  view: 'side',
  bob,
  legs: { near: { ankle: near.slice(0, 2), shoe: near[2] }, far: { ankle: far.slice(0, 2), shoe: far[2] } },
  arms: { near: { hand: nearArm }, far: { hand: farArm } },
}));

const walkFront = (view) => [
  { bob: 0, l: planted, r: planted, la: hang, ra: hang },
  { bob: 1, l: { ankle: [0, 10] }, r: { ankle: [0, 11.5] }, la: { hand: [0.5, 10.5], elbow: [0.6, 5.2] }, ra: { hand: [-0.5, 9.5], elbow: [0, 5] } },
  { bob: 0, l: planted, r: planted, la: hang, ra: hang },
  { bob: 1, l: { ankle: [0, 11.5] }, r: { ankle: [0, 10] }, la: { hand: [-0.5, 9.5], elbow: [0, 5] }, ra: { hand: [0.5, 10.5], elbow: [0.6, 5.2] } },
].map(({ bob, l, r, la, ra }) => ({ view, bob, legs: { l, r }, arms: { l: la, r: ra } }));

// Animations: frames and a frame rate. The runtime adds blinking, talking and
// looking on top of whichever pose is showing.
export const ANIMATIONS = {
  stand: { frames: [POSES.stand], fps: 1 },
  'stand.side': { frames: [POSES['stand.side']], fps: 1 },
  'stand.back': { frames: [POSES['stand.back']], fps: 1 },
  'walk.side': { frames: walkSide, fps: 11 },
  'walk.front': { frames: walkFront('front'), fps: 7 },
  'walk.back': { frames: walkFront('back'), fps: 7 },
  wave: { frames: [POSES.wave1, POSES.wave2, POSES.wave1, POSES.wave2, POSES.wave1, POSES.wave2], fps: 6 },
  think: { frames: [POSES.think], fps: 1 },
  shrug: { frames: [POSES.shrug], fps: 1 },
  hips: { frames: [POSES.hips], fps: 1 },
  crossed: { frames: [POSES.crossed], fps: 1 },
  watch: { frames: [POSES.watch], fps: 1 },
  stretch: { frames: [POSES.stretch], fps: 1 },
  scratch: { frames: [POSES.scratch], fps: 1 },
  gesture: { frames: [POSES.gesture], fps: 1 },
  kilroy: { frames: [POSES.kilroy], fps: 1 },
  jump: { frames: [POSES.jump], fps: 1 },
  sit: { frames: [POSES.sit], fps: 1 },
  swing: { frames: [POSES.sit, POSES.sitKick, POSES.sit, POSES.sitKick2], fps: 3 },
  sitWave: { frames: [POSES.sitWave1, POSES.sitWave2, POSES.sitWave1, POSES.sitWave2, POSES.sitWave1, POSES.sitWave2], fps: 6 },
  point: { frames: [POSES.point], fps: 1 },
  present: { frames: [POSES.present], fps: 1 },
  pointDown: { frames: [POSES.pointDown], fps: 1 },
  leanWall: { frames: [POSES.leanWall], fps: 1 },
  leanElbow: { frames: [POSES.leanElbow], fps: 1 },
  footUp: { frames: [POSES.footUp], fps: 1 },
  peek: { frames: [POSES.peek], fps: 1 },
  tap: { frames: [POSES.hips, POSES.tap], fps: 4 },
  glasses: { frames: [POSES.glasses], fps: 1 },
  beard: { frames: [POSES.beard, { ...POSES.beard, arms: { ...POSES.beard.arms, r: { hand: [-5, -2], elbow: [3, 4] } } }], fps: 3 },
  headset: { frames: [POSES.headset], fps: 1 },
};
