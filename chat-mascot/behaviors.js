// What Gilly does: poses, little scripted performances, and a director that
// picks them. Poses are degrees about the model's axes, relative to the rest
// A-pose: [pitch (+ = forward/down), yaw (+ = toward Gilly's left), roll].
// Left-side values are mirrored onto the right unless both are given. Hands
// are placed with IK: model-space points, x to Gilly's left, y up, z forward.

import * as THREE from 'three';
import { ease } from './mascot.js';

// --- Stances ------------------------------------------------------------------

export const STANCES = {
  // Hovering in the water: limbs soft, legs dangling, toes pointed.
  float: {
    y: 0.045,
    bob: 1,
    pose: {
      spine: [3, 0, 0], chest: [2, 0, 0], head: [-2, 0, 0],
      upper_armL: [-10, 0, -12], forearmL: [-24, 0, 4], handL: [-6, 0, 0],
      thighL: [-12, 0, 3], shinL: [20, 0, 0], footL: [26, 0, 0],
      tail0: [6, 0, 0], tail1: [5, 0, 0], tail2: [5, 0, 0], tail3: [4, 0, 0], tail4: [3, 0, 0],
    },
  },
  // Sitting on the floor, stubby legs out in a V, like a plush toy.
  sit: {
    y: -0.018,
    bob: 0,
    pose: {
      hips: [-8, 0, 0], spine: [-4, 0, 0], chest: [2, 0, 0], head: [6, 0, 0],
      thighL: [-62, 18, 34], shinL: [-6, 0, 0], footL: [-40, 0, 0],
      upper_armL: [-20, 0, -20], forearmL: [-36, 0, -10],
      tail0: [16, 0, 0], tail1: [2, 0, 0], tail2: [-4, 0, 0], tail3: [-4, 0, 0], tail4: [-2, 0, 0],
    },
  },
};

// One-sided poses are applied as written, never mirrored.
const oneSided = (pose) => Object.defineProperty(pose, 'exact', { value: true });

// Poses that need the rig (IK), built once per mascot.
export function buildPoses(m) {
  const hand = (side, p, pole) => m.reachHand(side, p, pole);
  const poses = {
    inhale: { spine: [-5, 0, 0], chest: [-6, 0, 0], head: [-9, 0, 0], upper_armL: [0, 0, 6] },
    slump: {
      spine: [6, 0, 0], chest: [5, 0, 0], head: [7, 0, 0],
      upper_armL: [-2, 0, -22], forearmL: [-8, 0, 0], handL: [0, 0, 0],
    },
    // Left wrist up in front of the chest, as if reading a watch.
    // Left wrist held out to the side, as if reading a watch.
    watch: {
      ...hand('L', [0.084, 0.142, 0.056], [0.6, -1, -0.5]),
      handL: [-20, 0, 50], head: [8, 8, 6], chest: [2, 6, 0],
    },
    watchShake: { handL: [0, 0, 60] },
    // Gilly's right hand (on the screen's left, next to the chat) raised to wave.
    waveUp: {
      ...hand('R', [-0.112, 0.176, 0.05], [-1, -0.6, -0.2]),
      handR: [0, 0, -10], chest: [0, -4, 5], head: [0, -5, 6],
    },
    waveA: { handR: [0, 0, -34] },
    waveB: { handR: [0, 0, 16] },
    // Chin on the right hand, thinking.
    think: {
      ...hand('R', [-0.018, 0.122, 0.078], [-1, -0.8, 0]),
      handR: [-40, 0, -20], head: [-8, -8, 10], chest: [0, -4, 2],
    },
    // Hands out, palms up: "who knows?"
    shrug: {
      ...hand('L', [0.105, 0.112, 0.05], [0.4, -1, -0.3]),
      ...hand('R', [-0.105, 0.112, 0.05], [-0.4, -1, -0.3]),
      handL: [0, 0, 40], handR: [0, 0, -40], chest: [-3, 0, 0], head: [2, 0, 10],
    },
    // Hands on cheeks: "aww!"
    cheeks: {
      ...hand('L', [0.058, 0.152, 0.07], [1, -0.8, 0]),
      ...hand('R', [-0.058, 0.152, 0.07], [-1, -0.8, 0]),
      handL: [-30, 0, 20], handR: [-30, 0, -20],
    },
    // Talking gestures: small, varied, mostly with the hand near the chat.
    explainR: { ...hand('R', [-0.082, 0.108, 0.07], [-1, -0.6, -0.2]), handR: [0, 0, -25] },
    explainL: { ...hand('L', [0.082, 0.108, 0.07], [1, -0.6, -0.2]), handL: [0, 0, 25] },
    bothOpen: {
      ...hand('L', [0.09, 0.1, 0.075], [1, -0.7, -0.2]),
      ...hand('R', [-0.09, 0.1, 0.075], [-1, -0.7, -0.2]),
      handL: [0, 0, 30], handR: [0, 0, -30],
    },
    pointUp: { ...hand('R', [-0.094, 0.168, 0.066], [-1, -0.8, 0]), handR: [-20, 0, -40] },
    // Hand cupped by the side of the head: "I'm listening!"
    ear: { ...hand('R', [-0.098, 0.162, 0.03], [-1, -0.6, -0.4]), handR: [0, -20, -30], head: [0, -8, 12] },
    // Both hands at the chin, bored.
    chinRest: {
      ...hand('L', [0.03, 0.118, 0.078], [1, -1, 0]),
      ...hand('R', [-0.03, 0.118, 0.078], [-1, -1, 0]),
      handL: [-40, 0, 10], handR: [-40, 0, -10], head: [4, 0, 0],
    },
    yawnStretch: {
      spine: [-7, 0, 0], chest: [-8, 0, 0], head: [-16, 0, 0],
      ...hand('L', [0.085, 0.2, 0.0], [1, 0, -1]),
      ...hand('R', [-0.085, 0.2, 0.0], [-1, 0, -1]),
    },
    stretchSide: {
      spine: [0, 0, 8], chest: [0, 0, 10], head: [0, 0, 6],
      ...hand('L', [0.07, 0.205, 0.0], [1, 0, -1]),
    },
    tuck: {
      spine: [22, 0, 0], chest: [18, 0, 0], head: [16, 0, 0],
      ...hand('L', [0.045, 0.1, 0.08], [1, -1, 0]),
      ...hand('R', [-0.045, 0.1, 0.08], [-1, -1, 0]),
      thighL: [-70, 0, 6], shinL: [80, 0, 0],
      tail0: [30, 0, 0], tail1: [20, 0, 0], tail2: [20, 0, 0], tail3: [20, 0, 0],
    },
    sleepy: {
      spine: [8, 0, 0], chest: [7, 0, 0], head: [18, 0, -8],
      upper_armL: [-18, 0, -22], forearmL: [-40, 0, 0],
    },
    lean: { spine: [7, 0, 0], chest: [6, 0, 0], head: [-6, 0, 0] },
    hop: { thighL: [-40, 0, 6], shinL: [70, 0, 0], footL: [30, 0, 0], upper_armL: [0, 0, 40] },
  };
  for (const name of ['watch', 'watchShake', 'waveUp', 'waveA', 'waveB', 'think', 'explainR', 'explainL', 'pointUp', 'ear', 'stretchSide']) {
    oneSided(poses[name]);
  }
  return poses;
}

// --- Cancellable timing ---------------------------------------------------------

export class Cancelled extends Error {}

class Token {
  cancelled = false;
  check() {
    if (this.cancelled) throw new Cancelled();
  }
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

// --- The performer: a scripting surface over the Mascot -------------------------

export class Performer {
  constructor(mascot) {
    this.m = mascot;
    this.P = buildPoses(mascot);
    this.timers = [];
    this.token = new Token();
    this.stanceName = 'float';
    this.lookFn = null;
    this.cursor = null;
    mascot.on((type) => {
      if (type === 'tick') this.tick();
    });
  }

  tick() {
    // Wake the scripts whose waits are over.
    const now = this.m.time;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= now);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > now);
        due.forEach((t) => t.resolve());
      }
    }
    if (this.lookFn) {
      const p = this.lookFn();
      if (p) this.m.gaze.target.copy(p);
    }
  }

  wait(seconds, token = this.token) {
    token.check();
    return new Promise((resolve) => this.timers.push({ at: this.m.time + seconds, resolve })).then(() => token.check());
  }

  // Replace whatever is running with a fresh token.
  interrupt() {
    this.token.cancelled = true;
    this.token = new Token();
    return this.token;
  }

  stance(name, dur = 0.8, easing = ease.inOut) {
    const s = STANCES[name];
    this.stanceName = name;
    this.m.setStance(s.pose, dur, easing);
    this.m.moveTo({ y: s.y + (this.m.layout.floorY ?? 0) });
    this.m.bob.set(s.bob, dur);
  }

  pose(pose, dur = 0.4, easing = ease.inOut) {
    const p = typeof pose === 'string' ? this.P[pose] : pose;
    if (p.exact) this.m.poseExact(p, dur, easing);
    else this.m.pose(p, dur, easing);
  }

  // Combine poses; the result is one-sided if any part is.
  mix(...parts) {
    const out = Object.assign({}, ...parts.map((p) => (typeof p === 'string' ? this.P[p] : p)));
    return parts.some((p) => (typeof p === 'string' ? this.P[p] : p).exact) ? oneSided(out) : out;
  }

  release(dur = 0.5) {
    this.m.release(dur);
  }

  // Where to look: 'viewer', 'cursor', a world point, or a function returning one.
  look(target) {
    const m = this.m;
    this.lookTarget = target;
    if (target === 'viewer') this.lookFn = () => _p.set(m.root.x.x * 0.4, m.root.y.x + 0.22, 3);
    else if (target === 'cursor') this.lookFn = () => (this.cursor ? m.pagePointToWorld(this.cursor.x, this.cursor.y, 0.45, _p) : null);
    else if (typeof target === 'function') this.lookFn = target;
    else if (target) this.lookFn = () => target;
    else this.lookFn = null;
  }

  // A world point relative to Gilly: x to the screen's right, y up, z toward the viewer.
  around(x, y, z = 0.6) {
    const m = this.m;
    return () => _p.set(m.root.x.x + x, m.root.y.x + y, z);
  }

  bonePoint(name) {
    const b = this.m.rig.bones[name];
    return () => (b ? _p.setFromMatrixPosition(b.bone.matrixWorld) : null);
  }

  face(expr = {}, dur = 0.25) {
    this.m.setExpression(expr, dur);
  }

  eyes({ open, squint, wide } = {}, dur = 0.3) {
    const L = this.m.lids;
    if (open !== undefined) L.open.set(open, dur);
    if (squint !== undefined) L.squint.set(squint, dur);
    if (wide !== undefined) L.wide.set(wide, dur);
  }

  gills(perk, dur = 0.5, flare) {
    this.m.gills.perk.set(perk, dur);
    if (flare !== undefined) this.m.gills.flare.set(flare, dur);
  }

  mood(name, dur = 0.4) {
    const set = (expr, eyes, perk, flare) => {
      this.face(expr, dur);
      this.eyes(eyes, dur);
      this.gills(perk, dur, flare);
    };
    switch (name) {
      case 'content': return set({}, { open: 1, squint: 0.12, wide: 0 }, 0.1, 0);
      case 'happy': return set({ Smile: 0.8 }, { open: 1, squint: 0.45, wide: 0 }, 0.6, 0.3);
      case 'delighted': return set({ Grin: 1 }, { open: 1, squint: 0.75, wide: 0 }, 0.9, 0.8);
      case 'curious': return set({ Smile: 0.2 }, { open: 1, squint: 0, wide: 0.4 }, 0.5, 0.2);
      case 'bored': return set({ Frown: 0.15 }, { open: 0.78, squint: 0, wide: 0 }, -0.5, 0);
      case 'glum': return set({ Frown: 0.55 }, { open: 0.62, squint: 0, wide: 0 }, -1, 0);
      case 'sleepy': return set({}, { open: 0.45, squint: 0, wide: 0 }, -0.7, 0);
      case 'surprised': return set({ Open: 0.55 }, { open: 1, squint: 0, wide: 1 }, 1, 1);
      case 'sorry': return set({ Frown: 0.4 }, { open: 0.9, squint: 0, wide: 0.1 }, -0.8, 0);
      case 'listening': return set({ Smile: 0.35 }, { open: 1, squint: 0.2, wide: 0.1 }, 0.55, 0.15);
      case 'thinking': return set({ Pout: 0.35 }, { open: 0.9, squint: 0.1, wide: 0 }, 0.25, 0);
      case 'talking': return set({ Smile: 0.35 }, { open: 1, squint: 0.25, wide: 0 }, 0.45, 0.1);
      default: return undefined;
    }
  }

  move(target) {
    this.m.moveTo(target);
  }

  squash(v) {
    this.m.squash(v);
  }

  home() {
    return this.m.layout.homeX ?? 0;
  }

  floor() {
    return this.m.layout.floorY ?? 0;
  }
}

const _p = new THREE.Vector3();

// --- Idle scripts ---------------------------------------------------------------------
// Each takes the performer and a token; awaits make them cancellable.

export const idleScripts = {
  async glance(g, tk) {
    // Eyes lead, the head follows, a blink covers the switch.
    const side = Math.random() < 0.5 ? -1 : 1;
    g.look(g.around(side * rand(0.6, 1.1), rand(0.05, 0.35)));
    g.gills(0.35, 0.4);
    await g.wait(rand(0.9, 1.6), tk);
    g.m.blink();
    g.look(g.around(-side * rand(0.5, 1), rand(-0.05, 0.3)));
    await g.wait(rand(1, 1.8), tk);
    g.look('viewer');
    g.gills(0.1, 0.8);
    await g.wait(rand(1, 2), tk);
  },

  async sigh(g, tk) {
    // Inhale up, a beat, then deflate into a slump: the "waiting forever" sigh.
    g.pose('inhale', 0.9, ease.out);
    g.eyes({ open: 0.95 }, 0.6);
    g.gills(0.25, 0.8);
    g.look(g.around(-0.3, 0.8));
    await g.wait(1.05, tk);
    g.pose('slump', 1.3, ease.inOut);
    g.mood('bored', 1.2);
    g.gills(-0.9, 1.4);
    // Gaze off into the distance, not at the floor: waiting, not sad.
    g.look(g.around(-1.1, 0.12, 0.8));
    g.m.tailWag.set(0.3, 1);
    g.m.emit('sigh');
    await g.wait(rand(2.2, 3.4), tk);
    g.m.blink();
    await g.wait(0.6, tk);
    g.release(1.2);
    g.mood('content', 1);
    g.look('viewer');
    g.m.tailWag.set(1, 1);
    await g.wait(1.4, tk);
  },

  async checkWatch(g, tk) {
    g.pose('watch', 0.6, ease.outBack);
    g.look(g.around(0.35, -0.25, 0.6));
    g.gills(0, 0.5);
    await g.wait(0.75, tk);
    g.eyes({ open: 0.85 }, 0.3);
    // A little shake of the wrist: is this thing even working?
    for (let i = 0; i < 2; i++) {
      g.pose(g.mix('watch', 'watchShake'), 0.1);
      await g.wait(0.12, tk);
      g.pose('watch', 0.1);
      await g.wait(0.12, tk);
    }
    g.pose(g.mix('watch', { head: [16, 10, -6] }), 0.4);
    await g.wait(0.9, tk);
    g.release(0.6);
    g.look('viewer');
    g.mood('bored', 0.5);
    await g.wait(0.8, tk);
    g.pose('slump', 0.8);
    await g.wait(1.4, tk);
    g.release(0.9);
    g.mood('content', 1);
    await g.wait(1, tk);
  },

  async yawn(g, tk) {
    g.squash(0.93);
    g.pose('yawnStretch', 1.1, ease.inOut);
    g.face({ Round: 0.5 }, 0.4);
    g.eyes({ open: 0.5 }, 0.8);
    g.gills(0.3, 0.9, 0.9);
    g.look(g.around(0, 1.2, 0.8));
    await g.wait(0.45, tk);
    g.face({ Open: 1, Round: 0.3 }, 0.6);
    await g.wait(0.6, tk);
    g.eyes({ open: 0.05 }, 0.3);
    g.squash(1.06);
    await g.wait(0.9, tk);
    // Smack, relax.
    g.face({ Pout: 0.4 }, 0.18);
    g.eyes({ open: 0.7 }, 0.6);
    g.release(1.1);
    g.gills(-0.2, 1, 0);
    await g.wait(0.35, tk);
    g.face({}, 0.3);
    g.look('viewer');
    await g.wait(0.9, tk);
    g.mood('content', 1.5);
    await g.wait(1, tk);
  },

  async stretch(g, tk) {
    g.pose('stretchSide', 0.9, ease.inOut);
    g.eyes({ open: 0.3 }, 0.6);
    g.face({ Smile: 0.5 }, 0.5);
    g.gills(0.4, 0.8, 0.6);
    await g.wait(1.1, tk);
    g.pose(g.mix('stretchSide', { spine: [0, 0, 14], chest: [0, 0, 14] }), 0.6);
    await g.wait(0.6, tk);
    g.release(0.9);
    g.mood('content', 0.8);
    await g.wait(1.2, tk);
  },

  async bubbles(g, tk) {
    g.look(g.around(0.1, 0.9, 0.7));
    g.face({ Pout: 1 }, 0.3);
    g.eyes({ open: 0.9, squint: 0.2 }, 0.3);
    g.pose({ head: [-10, 0, -6] }, 0.5);
    await g.wait(0.4, tk);
    for (let i = 0; i < 3; i++) {
      g.m.emit('bubble', { size: rand(0.6, 1.1) });
      g.squash(0.97);
      await g.wait(rand(0.35, 0.6), tk);
    }
    // Watch them float away, pleased.
    g.face({ Smile: 0.8 }, 0.3);
    g.eyes({ squint: 0.5 }, 0.3);
    g.look(g.around(0.2, 2, 0.6));
    await g.wait(1.5, tk);
    g.release(0.8);
    g.mood('content', 0.8);
    g.look('viewer');
    await g.wait(1, tk);
  },

  async somersault(g, tk) {
    // Anticipate with a crouch, flip forward around the belly, land with a squash and a grin.
    const y = g.m.root.y.target;
    g.pose('tuck', 0.3, ease.in);
    g.squash(0.86);
    g.mood('happy', 0.3);
    await g.wait(0.28, tk);
    g.squash(1.08);
    g.move({ y: y + 0.035 });
    g.m.spin.set(360, 0.8, ease.inOut);
    await g.wait(0.45, tk);
    g.move({ y });
    await g.wait(0.35, tk);
    g.m.spin.set(0, 0); // 360° is where we started.
    g.release(0.35);
    g.squash(0.88);
    g.mood('delighted', 0.15);
    await g.wait(1.1, tk);
    g.mood('content', 0.8);
    await g.wait(0.8, tk);
  },

  async wander(g, tk) {
    // Swim a little way off, look around, swim back home.
    const home = g.home();
    const room = g.m.layout.roam ?? 0.05;
    const dx = -rand(0.4, 1) * room;
    const dir = Math.sign(dx);
    g.move({ yaw: dir * 55, roll: -dir * 6 });
    g.m.tailWag.set(2.6, 0.4);
    g.look(g.around(dir * 1.2, 0.1));
    await g.wait(0.4, tk);
    g.move({ x: home + dx });
    await g.wait(1.3, tk);
    g.move({ yaw: 0, roll: 0 });
    g.m.tailWag.set(1, 0.8);
    await idleScripts.glance(g, tk);
    g.move({ yaw: -dir * 45, roll: dir * 5 });
    g.m.tailWag.set(2.4, 0.4);
    await g.wait(0.35, tk);
    g.move({ x: home });
    await g.wait(1.2, tk);
    g.move({ yaw: 0, roll: 0 });
    g.m.tailWag.set(1, 0.8);
    g.look('viewer');
    await g.wait(1.2, tk);
  },

  // The "waiting forever" bench scene: sit down, stare into the distance.
  async sitAndWait(g, tk) {
    g.stance('sit', 1.1);
    g.mood('bored', 1);
    await g.wait(1.3, tk);
    g.look(g.around(-1.4, 0.25));
    g.eyes({ open: 0.72 }, 1);
    await g.wait(rand(2.5, 3.5), tk);
    await idleScripts.sigh(g, tk);
    // A hopeful glance at the viewer… nothing. Back to the distance.
    g.look('viewer');
    g.mood('curious', 0.3);
    await g.wait(1.4, tk);
    g.mood('bored', 0.8);
    g.pose('chinRest', 0.8);
    g.look(g.around(1.3, 0.2));
    await g.wait(rand(3, 4.5), tk);
    g.m.blink();
    g.look(g.around(-1.2, 0.35));
    await g.wait(rand(2.5, 3.5), tk);
    g.release(0.8);
    g.stance('float', 1.2);
    g.mood('content', 1);
    g.look('viewer');
    await g.wait(1.6, tk);
  },

  async doze(g, tk) {
    g.pose('sleepy', 2.5, ease.inOut);
    g.mood('sleepy', 2);
    g.look(g.around(0, -0.4, 0.8));
    g.m.breath.rate = 0.18;
    await g.wait(2.5, tk);
    // Nod off… jerk awake… nod off again.
    g.eyes({ open: 0.08 }, 1.4);
    await g.wait(2.4, tk);
    g.pose({ ...g.P.sleepy, head: [30, 0, -10] }, 1.2);
    await g.wait(1.4, tk);
    g.pose('sleepy', 0.15, ease.out);
    g.eyes({ open: 0.6 }, 0.12);
    g.gills(-0.2, 0.2);
    await g.wait(0.9, tk);
    g.eyes({ open: 0 }, 1.6);
    g.gills(-1, 1.5);
    await g.wait(1.6, tk);
    g.m.emit('snore', { on: true });
    g.sleeping = true;
    await g.wait(9, tk);
    g.m.emit('snore', { on: false });
    g.sleeping = false;
    // Slow wake.
    g.m.breath.rate = 0.28;
    g.eyes({ open: 0.6 }, 1);
    g.release(1.4);
    g.look('viewer');
    await g.wait(1, tk);
    await idleScripts.yawn(g, tk);
  },
};

// Bored behaviors by how long nobody has paid attention (seconds).
const IDLE_MENU = [
  { name: 'glance', from: 0, weight: 3 },
  { name: 'bubbles', from: 6, weight: 1.4 },
  { name: 'stretch', from: 10, weight: 1 },
  { name: 'wander', from: 8, weight: 1.6, big: true },
  { name: 'sigh', from: 16, weight: 1.6 },
  { name: 'checkWatch', from: 20, weight: 1.5 },
  { name: 'somersault', from: 26, weight: 0.9, big: true },
  { name: 'yawn', from: 30, weight: 1.2 },
  { name: 'sitAndWait', from: 38, weight: 1.4 },
  { name: 'doze', from: 70, weight: 1.3 },
];

// --- Chat performances -----------------------------------------------------------------

export const chatScripts = {
  // Tapped out of an idle moment: "Oh! Hi!"
  async greet(g, tk, { startled = true } = {}) {
    g.look('viewer');
    if (g.sleeping || startled) {
      // Anticipation: a quick squash, then pop up wide-eyed.
      g.squash(0.84);
      g.mood('surprised', 0.08);
      g.pose({ spine: [-6, 0, 0], chest: [-6, 0, 0], head: [-6, 0, 0] }, 0.12, ease.out);
      g.move({ y: g.m.root.y.target + 0.02 });
      await g.wait(0.12, tk);
      g.squash(1.12);
      await g.wait(0.35, tk);
      g.move({ y: g.floor() + 0.045 });
    }
    g.sleeping = false;
    g.m.emit('snore', { on: false });
    g.m.breath.rate = 0.28;
    g.mood('delighted', 0.2);
    g.pose('waveUp', 0.35, ease.outBack);
    await g.wait(0.35, tk);
    for (let i = 0; i < 3; i++) {
      g.pose(g.mix('waveUp', 'waveA'), 0.16, ease.inOut);
      await g.wait(0.17, tk);
      g.pose(g.mix('waveUp', 'waveB'), 0.16, ease.inOut);
      await g.wait(0.17, tk);
    }
    g.pose('waveUp', 0.15);
    await g.wait(0.2, tk);
    g.release(0.6);
    g.mood('happy', 0.6);
  },

  async wave(g, tk) {
    g.mood('happy', 0.3);
    g.pose('waveUp', 0.4, ease.outBack);
    await g.wait(0.4, tk);
    for (let i = 0; i < 3; i++) {
      g.pose(g.mix('waveUp', 'waveA'), 0.16);
      await g.wait(0.17, tk);
      g.pose(g.mix('waveUp', 'waveB'), 0.16);
      await g.wait(0.17, tk);
    }
    g.release(0.6);
    await g.wait(0.5, tk);
  },

  async happy(g, tk) {
    // A little hop of joy.
    g.squash(0.86);
    g.pose({ spine: [6, 0, 0], head: [6, 0, 0] }, 0.15);
    await g.wait(0.14, tk);
    g.mood('delighted', 0.12);
    g.pose('hop', 0.2, ease.out);
    g.move({ y: g.m.root.y.target + 0.03 });
    g.squash(1.1);
    await g.wait(0.3, tk);
    g.move({ y: g.floor() + 0.045 });
    await g.wait(0.3, tk);
    g.squash(0.9);
    g.release(0.5);
    await g.wait(0.6, tk);
    g.mood('happy', 0.6);
  },

  async aww(g, tk) {
    g.mood('delighted', 0.3);
    g.pose('cheeks', 0.45, ease.outBack);
    await g.wait(1.2, tk);
    g.release(0.6);
    g.mood('happy', 0.5);
  },

  async sorry(g, tk) {
    g.mood('sorry', 0.4);
    g.pose('shrug', 0.5, ease.outBack);
    await g.wait(1.6, tk);
    g.release(0.7);
  },

  async bye(g, tk) {
    g.mood('happy', 0.3);
    g.look('viewer');
    await chatScripts.wave(g, tk);
    g.mood('content', 1);
  },
};

// Loops for the conversation states. They run until interrupted.
export const stateLoops = {
  // The chat is open and waiting for the visitor: attentive, a little fidgety.
  async attentive(g, tk) {
    g.mood('happy', 0.6);
    g.look(g.cursor ? 'cursor' : 'viewer');
    for (;;) {
      await g.wait(rand(2.5, 5), tk);
      if (Math.random() < 0.35) {
        g.m.blink();
        g.pose({ head: [0, 0, rand(-8, 8)] }, 0.6);
        await g.wait(rand(1, 2), tk);
        g.release(0.8);
      }
    }
  },

  // The visitor is typing or talking: lean in, nod now and then.
  async listening(g, tk, { voice = false, look } = {}) {
    g.mood('listening', 0.4);
    g.pose(voice ? 'ear' : 'lean', 0.6, ease.out);
    g.look(look ?? 'viewer');
    for (;;) {
      await g.wait(rand(1.4, 2.6), tk);
      g.pose(g.mix(voice ? 'ear' : 'lean', { head: [8, 0, voice ? 12 : 0] }), 0.18);
      await g.wait(0.2, tk);
      g.pose(voice ? 'ear' : 'lean', 0.25);
      if (Math.random() < 0.4) g.m.blink();
    }
  },

  // Waiting for a reply.
  async thinking(g, tk) {
    g.mood('thinking', 0.4);
    g.pose('think', 0.6, ease.outBack);
    g.look(g.around(-0.7, 0.9));
    g.m.gills.wave.set(2.2, 0.6);
    for (;;) {
      await g.wait(rand(1.2, 2.2), tk);
      g.look(g.around(rand(-0.9, -0.3), rand(0.6, 1)));
      if (Math.random() < 0.5) {
        // Tap the chin.
        g.pose(g.mix('think', { handR: [-55, 0, -20] }), 0.12);
        await g.wait(0.14, tk);
        g.pose('think', 0.14);
      }
    }
  },

  // Speaking: the voice drives the mouth; the body adds beats and gestures.
  async talking(g, tk, { look } = {}) {
    g.mood('talking', 0.3);
    g.look('viewer');
    // Turned a little toward the speech bubble, like talking to someone beside you.
    if (look) g.move({ yaw: -14 });
    const gestures = ['explainR', 'explainL', 'bothOpen', 'explainR', 'pointUp', null, null];
    for (;;) {
      const name = pick(gestures);
      if (name) g.pose(name, rand(0.35, 0.55), ease.inOut);
      else g.release(0.6);
      await g.wait(rand(1.1, 2), tk);
      if (Math.random() < 0.5) g.pose({ head: [rand(-4, 6), rand(-8, 8), rand(-8, 8)] }, 0.5);
      // Now and then a glance at the words, then back to the listener.
      if (look && Math.random() < 0.3) {
        g.look(look);
        await g.wait(rand(0.6, 1), tk);
        g.look('viewer');
      }
    }
  },
};

// --- The director -----------------------------------------------------------------

export class Director {
  constructor(mascot) {
    this.m = mascot;
    this.g = new Performer(mascot);
    this.state = 'idle';
    this.stateOpts = {};
    this.lastAttention = 0;
    this.recent = [];
    this.running = false;
    this.oneShot = null;
    this.g.stance('float', 0);
    mascot.root.y.snap(STANCES.float.y + (mascot.layout.floorY ?? 0));
    mascot.root.x.snap(this.g.home());
    this.g.look('viewer');
    this.g.mood('content', 0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  attention() {
    this.lastAttention = this.m.time;
  }

  get boredom() {
    return this.m.time - this.lastAttention;
  }

  // Switch the ongoing state: idle, attentive, listening, thinking, talking.
  setState(state, opts = {}) {
    if (state === this.state && JSON.stringify(opts) === JSON.stringify(this.stateOpts)) return;
    this.state = state;
    this.stateOpts = opts;
    this.attention();
    if (!this.oneShot) {
      this.g.interrupt();
      this.settle();
    }
  }

  // Run one performance now; afterwards the current state resumes.
  async perform(name, opts) {
    const fn = chatScripts[name] ?? idleScripts[name];
    if (!fn) return;
    const tk = this.g.interrupt();
    this.oneShot = tk;
    this.settle(0.35);
    try {
      await fn(this.g, tk, opts);
    } catch (e) {
      if (!(e instanceof Cancelled)) console.error(e);
    }
    if (this.oneShot === tk) {
      this.oneShot = null;
      this.g.interrupt();
      this.settle();
    }
  }

  // Undo whatever a cancelled script left behind.
  settle(dur = 0.5) {
    const g = this.g;
    const m = this.m;
    g.release(dur);
    m.root.pitch.freq = 2;
    m.spin.set(0, 0);
    const p = m.root.pitch.x;
    if (Math.abs(p) > 180) m.root.pitch.snap(p - 360 * Math.round(p / 360));
    g.move({ yaw: 0, roll: 0, pitch: 0, x: g.home() });
    m.tailWag.set(1, 0.5);
    m.gills.wave.set(1, 0.5);
    m.breath.rate = 0.28;
    if (g.stanceName !== 'float') g.stance('float', 0.9);
    if (g.sleeping) {
      g.sleeping = false;
      m.emit('snore', { on: false });
    }
  }

  async loop() {
    while (this.running) {
      const tk = this.g.token;
      try {
        if (this.oneShot) await this.g.wait(0.2, tk);
        else if (this.state === 'idle') await this.idleStep(tk);
        else await stateLoops[this.state](this.g, tk, this.stateOpts);
      } catch (e) {
        if (!(e instanceof Cancelled)) {
          console.error(e);
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      // Yield so an interrupt can install its own token first.
      await Promise.resolve();
    }
  }

  async idleStep(tk) {
    const g = this.g;
    await g.wait(this.m.reducedMotion ? rand(3, 6) : rand(1.5, 3.5), tk);
    const b = this.boredom;
    let menu = IDLE_MENU.filter((e) => b >= e.from && !this.recent.includes(e.name));
    if (this.m.reducedMotion || this.m.layout.compact) menu = menu.filter((e) => !e.big);
    // Later behaviors get likelier as boredom grows.
    const weights = menu.map((e) => e.weight * (1 + Math.min(2, (b - e.from) / 30)));
    let r = Math.random() * weights.reduce((a, c) => a + c, 0);
    const choice = menu.find((e, i) => (r -= weights[i]) <= 0) ?? menu[0];
    if (!choice) return;
    this.recent = [choice.name, ...this.recent].slice(0, 3);
    this.current = choice.name;
    await idleScripts[choice.name](g, tk);
    this.current = null;
  }
}
