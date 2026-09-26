// Gilly, rendered with three.js: the stage, the rig and the motion system.
//
// Motion is layered, from slow to fast:
//   stance (float, sit, ...)  →  actions (scripted poses with timing and easing)
//   →  procedural life (breathing, bobbing, look-at)  →  joint springs
//   →  spring-bone physics for gills and tail  →  face (eyes, lids, mouth).
// Every joint eases toward its target on its own spring, so the body settles in
// overlapping waves instead of moving like one stiff piece.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const ease = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  sine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  outBack: (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2,
  inBack: (t) => 2.4 * t * t * t - 1.4 * t * t,
};

// Smooth 1D value noise, for organic drift.
export function noise(t, seed = 0) {
  const i = Math.floor(t);
  const f = t - i;
  const h = (n) => {
    const x = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

// Joints driven by springs: frequency (Hz) and damping ratio. Lower damping
// overshoots more; limbs are looser than the core.
const JOINTS = {
  hips: [3.0, 0.85], spine: [3.4, 0.8], chest: [3.6, 0.75], head: [3.4, 0.7],
  upper_armL: [4.2, 0.6], forearmL: [4.8, 0.55], handL: [5.5, 0.5],
  upper_armR: [4.2, 0.6], forearmR: [4.8, 0.55], handR: [5.5, 0.5],
  thighL: [4.0, 0.7], shinL: [4.4, 0.65], footL: [5.0, 0.6],
  thighR: [4.0, 0.7], shinR: [4.4, 0.65], footR: [5.0, 0.6],
  tail0: [3.2, 0.7], tail1: [3.2, 0.7], tail2: [3.2, 0.7], tail3: [3.2, 0.7], tail4: [3.2, 0.7],
  gill0L0: [5, 0.6], gill1L0: [5, 0.6], gill2L0: [5, 0.6], gill0R0: [5, 0.6], gill1R0: [5, 0.6], gill2R0: [5, 0.6],
  gill0L1: [5, 0.6], gill1L1: [5, 0.6], gill2L1: [5, 0.6], gill0R1: [5, 0.6], gill1R1: [5, 0.6], gill2R1: [5, 0.6],
};
export const JOINT_NAMES = Object.keys(JOINTS);

// Chains simulated as springy particles on top of the animated pose.
const SPRING_CHAINS = [
  { bones: ['gill0L0', 'gill0L1'], stiffness: 0.16, drag: 0.22, gravity: 0.02 },
  { bones: ['gill1L0', 'gill1L1'], stiffness: 0.15, drag: 0.22, gravity: 0.02 },
  { bones: ['gill2L0', 'gill2L1'], stiffness: 0.15, drag: 0.22, gravity: 0.02 },
  { bones: ['gill0R0', 'gill0R1'], stiffness: 0.16, drag: 0.22, gravity: 0.02 },
  { bones: ['gill1R0', 'gill1R1'], stiffness: 0.15, drag: 0.22, gravity: 0.02 },
  { bones: ['gill2R0', 'gill2R1'], stiffness: 0.15, drag: 0.22, gravity: 0.02 },
  { bones: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'], stiffness: 0.22, drag: 0.3, gravity: 0.01 },
];

// Mirror a left-side pose value onto the right: pitch stays, yaw and roll flip.
export const mirror = ([x, y, z]) => [x, -y, -z];

export function mirrorPose(pose) {
  const out = { ...pose };
  for (const [name, v] of Object.entries(pose)) {
    const other = name.endsWith('L') ? `${name.slice(0, -1)}R` : name.replace(/^gill(\d)L(\d)$/, 'gill$1R$2');
    if (other !== name && !(other in pose)) out[other] = mirror(v);
  }
  return out;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

const _qm = new THREE.Quaternion();
const _qd = new THREE.Quaternion();
const _qv = new THREE.Quaternion();
const _axis = new THREE.Vector3();

// Joint targets are rotation vectors (axis × angle, degrees) so that blending and
// springs follow the shortest arc. Poses are written as [pitch, yaw, roll] and
// converted once.
export function eulerToVec(e) {
  modelRotation(e, _qv);
  if (_qv.w < 0) _qv.set(-_qv.x, -_qv.y, -_qv.z, -_qv.w);
  const s = Math.sqrt(Math.max(0, 1 - _qv.w * _qv.w));
  if (s < 1e-6) return [0, 0, 0];
  const angle = (2 * Math.acos(clamp(_qv.w, -1, 1))) / DEG;
  return [(_qv.x / s) * angle, (_qv.y / s) * angle, (_qv.z / s) * angle];
}

function vecToQuat([x, y, z], out) {
  const angle = Math.hypot(x, y, z);
  if (angle < 1e-6) return out.identity();
  return out.setFromAxisAngle(_axis.set(x / angle, y / angle, z / angle), angle * DEG);
}

export function toVecPose(pose) {
  const out = {};
  for (const [k, v] of Object.entries(pose)) if (Array.isArray(v)) out[k] = eulerToVec(v);
  return out;
}

// Rotation from model-space degrees: yaw about Y, then pitch about X, then roll about Z.
function modelRotation([x, y, z], out) {
  out.setFromAxisAngle(Y, y * DEG);
  _qm.setFromAxisAngle(X, x * DEG);
  out.premultiply(_qm);
  _qm.setFromAxisAngle(Z, z * DEG);
  return out.premultiply(_qm);
}

class Rig {
  constructor(root, meta) {
    this.root = root;
    this.meta = meta;
    this.bones = {};
    root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    root.traverse((o) => {
      if (!o.isBone) return;
      const modelMatrix = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
      const modelQ = new THREE.Quaternion();
      modelMatrix.decompose(new THREE.Vector3(), modelQ, new THREE.Vector3());
      this.bones[o.name] = {
        bone: o,
        restQ: o.quaternion.clone(),
        restP: o.position.clone(),
        restS: o.scale.clone(),
        modelQ, // rest orientation in model space
        modelQInv: modelQ.clone().invert(),
        tail: meta.boneTails?.[o.name] ? new THREE.Vector3(...meta.boneTails[o.name]) : null,
        restHead: new THREE.Vector3().setFromMatrixPosition(modelMatrix),
      };
    });
  }

  has(name) {
    return name in this.bones;
  }

  // Sets a bone to its rest pose rotated by a model-space rotation (quaternion).
  setModelRotation(name, q) {
    const b = this.bones[name];
    if (!b) return;
    // local = rest * (modelRest⁻¹ · q · modelRest)
    _q.copy(b.modelQInv).multiply(q).multiply(b.modelQ);
    b.bone.quaternion.copy(b.restQ).multiply(_q);
  }

  setDegrees(name, v) {
    this.setModelRotation(name, modelRotation(v, _qd));
  }

  setVec(name, v) {
    this.setModelRotation(name, vecToQuat(v, _qd));
  }

  // Two-bone IK in the rest pose's model space: pose values (degrees) that put the
  // end of `lower` at `target`, bending the middle joint toward `pole`.
  reach(upperName, lowerName, endName, target, pole) {
    const U = this.bones[upperName];
    const F = this.bones[lowerName];
    const H = this.bones[endName];
    if (!U || !F || !H) return {};
    const S = U.restHead;
    const E = F.restHead;
    const W = H.restHead;
    const l1 = S.distanceTo(E);
    const l2 = E.distanceTo(W);
    const T = new THREE.Vector3().subVectors(target, S);
    const d = clamp(T.length(), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.999);
    const dirT = T.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const p = pole.clone().normalize();
    const poleDir = p.sub(dirT.clone().multiplyScalar(p.dot(dirT))).normalize();
    const newE = S.clone().addScaledVector(dirT, a).addScaledVector(poleDir, h);
    const newW = S.clone().addScaledVector(dirT, d);
    const restU = new THREE.Vector3().subVectors(E, S).normalize();
    const restL = new THREE.Vector3().subVectors(W, E).normalize();
    const newU = new THREE.Vector3().subVectors(newE, S).normalize();
    const newL = new THREE.Vector3().subVectors(newW, newE).normalize();
    // Frames from each limb direction and its bend-plane normal keep the twist sane.
    const restN = bendNormal(restU, restL, pole);
    const newN = bendNormal(newU, newL, pole);
    const Ru = frameRotation(restU, restN, newU, newN);
    const Rf = frameRotation(restL, restN, newL, newN);
    const d2 = Ru.clone().invert().multiply(Rf);
    return { [upperName]: toDegrees(Ru), [lowerName]: toDegrees(d2) };
  }
}

function bendNormal(a, b, pole) {
  const n = new THREE.Vector3().crossVectors(a, b);
  if (n.lengthSq() < 1e-4) n.crossVectors(a, pole);
  return n.normalize();
}

function frameRotation(fromDir, fromN, toDir, toN) {
  const m1 = new THREE.Matrix4().makeBasis(fromDir, fromN, new THREE.Vector3().crossVectors(fromDir, fromN));
  const m2 = new THREE.Matrix4().makeBasis(toDir, toN, new THREE.Vector3().crossVectors(toDir, toN));
  return new THREE.Quaternion().setFromRotationMatrix(m2.multiply(m1.transpose()));
}

const _euler = new THREE.Euler();
// Model-space rotation → [pitch, yaw, roll] degrees in this file's convention (Rz · Rx · Ry).
export function toDegrees(q) {
  _euler.setFromQuaternion(q, 'ZXY');
  return [_euler.x / DEG, _euler.y / DEG, _euler.z / DEG];
}

class SpringChain {
  constructor(rig, spec) {
    this.rig = rig;
    this.spec = spec;
    this.links = spec.bones.map((name) => rig.bones[name]).filter(Boolean);
    this.tips = null;
    this.prev = null;
  }

  reset() {
    this.tips = null;
  }

  // Runs after the animated pose is applied to the bones.
  update(dt, strength = 1) {
    const { stiffness, drag, gravity } = this.spec;
    const steps = Math.max(1, Math.round(dt * 60));
    if (!this.tips) {
      this.tips = this.links.map((l) => this.tipWorld(l, new THREE.Vector3()));
      this.prev = this.tips.map((t) => t.clone());
      return;
    }
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < this.links.length; i++) {
        const link = this.links[i];
        const bone = link.bone;
        bone.updateMatrixWorld(true);
        const head = _v.setFromMatrixPosition(bone.matrixWorld);
        const animTip = this.tipWorld(link, _v2);
        const tip = this.tips[i];
        const prev = this.prev[i];
        const len = animTip.distanceTo(head);
        // Verlet: keep momentum, pull toward the animated tip, a touch of gravity.
        const vx = (tip.x - prev.x) * (1 - drag);
        const vy = (tip.y - prev.y) * (1 - drag);
        const vz = (tip.z - prev.z) * (1 - drag);
        prev.copy(tip);
        tip.x += vx + (animTip.x - tip.x) * stiffness;
        tip.y += vy + (animTip.y - tip.y) * stiffness - gravity * len * 0.02;
        tip.z += vz + (animTip.z - tip.z) * stiffness;
        // Keep the bone's length.
        _v3.subVectors(tip, head).setLength(len);
        tip.copy(head).add(_v3);
        // Rotate the bone from its animated direction toward the simulated one.
        const from = _v2.sub(head).normalize();
        const to = _v3.normalize();
        _q.setFromUnitVectors(from, to);
        if (strength < 1) _q.slerp(_q2.identity(), 1 - strength);
        // World delta → local: parentWorld⁻¹ · delta · parentWorld · local
        bone.parent.getWorldQuaternion(_q2);
        const parentInv = _q2.clone().invert();
        bone.quaternion.premultiply(_q2).premultiply(_q).premultiply(parentInv);
        bone.updateMatrixWorld(true);
      }
    }
  }

  tipWorld(link, out) {
    // The bone's tail, from the rest data, carried by the bone's current transform.
    const b = link;
    out.copy(b.tail).sub(b.restHead); // rest offset in model space
    out.applyQuaternion(b.modelQInv); // into bone space
    return out.applyMatrix4(b.bone.matrixWorld);
  }
}

// A spring for 3-component joint rotations.
class JointSprings {
  constructor(names) {
    this.names = names;
    this.x = new Float32Array(names.length * 3);
    this.v = new Float32Array(names.length * 3);
    this.params = names.map((n) => JOINTS[n] ?? [4, 0.7]);
  }

  step(target, dt, scale = 1) {
    const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / sub;
    for (let i = 0; i < this.names.length; i++) {
      const [f, z] = this.params[i];
      const w = 2 * Math.PI * f * scale;
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        let x = this.x[j];
        let v = this.v[j];
        const t = target[j];
        for (let s = 0; s < sub; s++) {
          v += (w * w * (t - x) - 2 * z * w * v) * h;
          x += v * h;
        }
        this.x[j] = x;
        this.v[j] = v;
      }
    }
  }

  snap(target) {
    this.x.set(target);
    this.v.fill(0);
  }
}

// A generic critically damped scalar spring.
export class Spring {
  constructor(value = 0, freq = 3, zeta = 1) {
    this.x = value;
    this.v = 0;
    this.target = value;
    this.freq = freq;
    this.zeta = zeta;
  }

  step(dt) {
    const w = 2 * Math.PI * this.freq;
    const sub = Math.max(1, Math.ceil(dt * 240));
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      this.v += (w * w * (this.target - this.x) - 2 * this.zeta * w * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }

  snap(v) {
    this.x = this.target = v;
    this.v = 0;
  }
}

// Tweened values: a target that moves over time with easing, then a spring on top.
class Tween {
  constructor(value) {
    this.from = value;
    this.to = value;
    this.t = 1;
    this.dur = 0;
    this.easing = ease.inOut;
    this.value = value;
  }

  set(to, dur = 0.3, easing = ease.inOut) {
    this.from = this.value;
    this.to = to;
    this.t = 0;
    this.dur = dur;
    this.easing = easing;
    if (dur <= 0) {
      this.t = 1;
      this.value = to;
    }
  }

  update(dt) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / Math.max(this.dur, 1e-4));
      this.value = lerp(this.from, this.to, this.easing(this.t));
    }
    return this.value;
  }
}

// A partial pose that tweens in and out: bone → [x, y, z] degrees, plus a weight per bone.
class PoseLayer {
  constructor(names) {
    this.names = names;
    this.index = Object.fromEntries(names.map((n, i) => [n, i]));
    this.tweens = names.map(() => [new Tween(0), new Tween(0), new Tween(0)]);
    this.weights = names.map(() => new Tween(0));
  }

  set(pose, dur, easing = ease.inOut, weight = 1) {
    for (const [name, v] of Object.entries(pose)) {
      const i = this.index[name];
      if (i === undefined || !v) continue;
      const tw = this.tweens[i];
      // A bone that was released starts from wherever the lower layers had it.
      if (this.weights[i].value < 0.001) tw.forEach((t, k) => (t.value = v[k]));
      tw.forEach((t, k) => t.set(v[k], dur, easing));
      this.weights[i].set(weight, dur, easing);
    }
  }

  release(names, dur = 0.4, easing = ease.inOut) {
    for (const name of names ?? this.names) {
      const i = this.index[name];
      if (i !== undefined) this.weights[i].set(0, dur, easing);
    }
  }

  update(dt, out) {
    for (let i = 0; i < this.names.length; i++) {
      const w = this.weights[i].update(dt);
      const tw = this.tweens[i];
      for (let k = 0; k < 3; k++) {
        const v = tw[k].update(dt);
        if (w > 0) out[i * 3 + k] = lerp(out[i * 3 + k], v, w);
      }
    }
  }
}

export class Mascot {
  static async load({ host, url, layout }) {
    // gilly.glb is meshopt-compressed (see blender/README.md): about a third of the size.
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    return new Mascot(host, gltf, layout);
  }

  constructor(host, gltf, layout = {}) {
    this.host = host;
    this.layout = { worldHeight: 0.5, ...layout };
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.listeners = new Set();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.canvas.setAttribute('aria-hidden', 'true');
    host.append(this.canvas);

    const scene = new THREE.Scene();
    this.scene = scene;
    // Plain lights and standard materials: they compile quickly everywhere. (Older
    // Safari on iOS can crash compiling the much longer physical shaders.)
    const light = (color, intensity, x, y, z) => {
      const l = new THREE.DirectionalLight(color, intensity);
      l.position.set(x, y, z);
      scene.add(l);
    };
    light('#fff1e6', 2.6, -0.7, 1.1, 1.0); // key, warm, from the upper left
    light('#e4f6ff', 2.8, 0.6, 0.7, -1.0); // rim, cool, from behind: lights the gills' edges
    light('#ffe9ef', 0.7, 0.9, 0.1, 0.8); // fill
    scene.add(new THREE.HemisphereLight('#e9f6ff', '#f2b8c8', 1.25));

    this.camera = new THREE.PerspectiveCamera(18, 1, 0.05, 20);

    // Gilly lives in a holder that carries root motion, facing and squash & stretch.
    this.holder = new THREE.Group();
    this.body = new THREE.Group(); // squash & stretch pivot, at the feet
    this.holder.add(this.body);
    scene.add(this.holder);
    const model = gltf.scene;
    this.body.add(model);
    this.model = model;
    this.setupMaterials(model);

    const armature = model.getObjectByName('Gilly');
    const meta = JSON.parse(armature?.userData?.gilly ?? '{}');
    this.meta = meta;
    this.rig = new Rig(armature ?? model, meta);
    this.mouth = model.getObjectByName('Mouth');
    this.chains = SPRING_CHAINS.map((spec) => new SpringChain(this.rig, spec));
    this.addCatchlights();

    this.names = JOINT_NAMES.filter((n) => this.rig.has(n));
    this.target = new Float32Array(this.names.length * 3);
    this.springs = new JointSprings(this.names);
    this.stance = new PoseLayer(this.names);
    this.action = new PoseLayer(this.names);
    this.gesture = new PoseLayer(this.names);

    // Root motion and body feel.
    this.root = {
      x: new Spring(0, 1.2, 0.9), y: new Spring(0, 1.6, 0.8), z: new Spring(0, 1.4, 0.9),
      yaw: new Spring(0, 1.6, 0.8), pitch: new Spring(0, 2.0, 0.7), roll: new Spring(0, 2.0, 0.7),
      squash: new Spring(1, 4.5, 0.35),
    };
    this.bob = new Tween(1); // floating bob amount
    this.spin = new Tween(0); // somersaults, degrees about the belly
    this.pivot = new THREE.Vector3(0, 0.13, 0); // Gilly's middle: root rotations turn around it
    this.breath = { rate: 0.28, depth: 1 };

    // Face.
    this.gaze = {
      target: new THREE.Vector3(0, 0.2, 2), // world point to look at
      eyes: [new Spring(0, 14, 1), new Spring(0, 14, 1)], // yaw, pitch (degrees)
      head: [new Spring(0, 1.8, 0.85), new Spring(0, 1.8, 0.85)],
      saccade: [0, 0],
      nextSaccade: 0,
      headFollow: 0.55,
      enabled: true,
    };
    this.lids = { open: new Tween(1), blink: 0, blinkT: -1, nextBlink: 1.5, squint: new Tween(0), wide: new Tween(0) };
    this.mouthTargets = {};
    this.mouthWeights = {};
    this.visemes = { Open: 0, Wide: 0, Round: 0 };
    this.expression = { Smile: new Tween(0), Grin: new Tween(0), Frown: new Tween(0), Pout: new Tween(0), Open: new Tween(0) };
    this.gills = { perk: new Tween(0), flare: new Tween(0), wave: new Tween(1) };
    this.tailWag = new Tween(1);
    this.lean = new Tween(0);

    this.hidden = false;
    this.maxFps = 60; // Lowered while nobody is interacting, to save battery.
    this.last = performance.now();
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // Lets three.js restore the context when the GPU comes back.
      this.emit('contextlost');
    });
    this.canvas.addEventListener('webglcontextrestored', () => this.emit('contextrestored'));
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.onVisibility = () => {
      this.hidden = document.hidden;
      this.last = performance.now();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setupMaterials(model) {
    // One material for skin, lids and gills; a warm emissive tint stands in for the
    // light that soaks through pink skin.
    const skin = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.42, emissive: new THREE.Color('#3b0a1d'), emissiveIntensity: 0.55,
    });
    const mouth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
    this.materials = { skin, mouth };
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      if (o.name.startsWith('Body') || o.name.startsWith('Lid') || o.name.startsWith('Gill')) o.material = skin;
      else if (o.name.startsWith('Mouth')) o.material = mouth;
      else if (o.name.startsWith('Eye')) {
        o.material = new THREE.MeshStandardMaterial({ map: o.material.map, roughness: 0.12 });
      }
    });
  }

  // Catchlights: little reflections of the key light, fixed to the head so they stay
  // put while the eyes look around, the way real highlights do.
  addCatchlights() {
    const head = this.rig.bones.head;
    this.catchlights = [];
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92, depthWrite: false });
    for (const e of this.meta.eyes ?? []) {
      const c = new THREE.Vector3(...e.center);
      const f = new THREE.Vector3(...e.forward);
      const u = new THREE.Vector3(...e.up);
      const x = new THREE.Vector3(...e.x);
      const r = this.meta.eyeRadius ?? 0.0228;
      for (const [size, dx, dy] of [[0.2, -0.36, 0.42], [0.09, 0.3, -0.2]]) {
        const dot = new THREE.Mesh(new THREE.CircleGeometry(r * size, 20), mat);
        // On the eyeball's surface, facing out along the eye.
        const dir = f.clone().addScaledVector(x, dx).addScaledVector(u, dy).normalize();
        const p = c.clone().addScaledVector(dir, r * 1.04);
        p.sub(head.restHead).applyQuaternion(head.modelQInv);
        dot.position.copy(p);
        dot.quaternion.copy(head.modelQInv).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
        dot.renderOrder = 2;
        head.bone.add(dot);
        this.catchlights.push(dot);
      }
    }
  }

  // The camera frames worldHeight meters of the scene; the floor is the canvas bottom.
  resize() {
    const rect = this.host.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const H = this.layout.worldHeight;
    const cam = this.camera;
    cam.aspect = w / h;
    const dist = H / 2 / Math.tan((cam.fov * DEG) / 2);
    cam.position.set(0, H / 2, dist);
    cam.lookAt(0, H / 2, 0);
    cam.updateProjectionMatrix();
    this.worldWidth = H * cam.aspect;
    this.size = { w, h };
    this.emit('resize');
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, detail) {
    for (const fn of this.listeners) fn(type, detail);
  }

  // Page coordinates (client px) → a world point on a plane in front of Gilly.
  pagePointToWorld(clientX, clientY, planeZ = 0.35, out = new THREE.Vector3()) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
    out.set(nx, ny, 0.5).unproject(this.camera);
    const dir = out.sub(this.camera.position).normalize();
    const t = (planeZ - this.camera.position.z) / dir.z;
    return out.copy(this.camera.position).addScaledVector(dir, t);
  }

  // A named point on Gilly in page coordinates, for anchoring speech bubbles.
  anchor(name = 'mouth', out = { x: 0, y: 0 }) {
    if (name === 'mouth') this.mouthWorld(_v);
    else if (this.rig.bones[name]) _v.setFromMatrixPosition(this.rig.bones[name].bone.matrixWorld);
    else return out;
    _v.project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    out.x = rect.left + ((_v.x + 1) / 2) * rect.width;
    out.y = rect.top + ((1 - _v.y) / 2) * rect.height;
    return out;
  }

  mouthWorld(out) {
    // The mouth sits on the head: carry its rest position with the head bone.
    const head = this.rig.bones.head;
    const rest = this.meta.mouthCenter ?? [0, 0.165, 0.088];
    out.set(...rest).sub(head.restHead).applyQuaternion(head.modelQInv);
    return out.applyMatrix4(head.bone.matrixWorld);
  }

  // Screen-space bounds of Gilly's head and body, for the click target.
  bounds(out = { x: 0, y: 0, w: 0, h: 0 }) {
    const rect = this.canvas.getBoundingClientRect();
    const pts = ['head', 'hips', 'handL', 'handR', 'gill1L1', 'gill1R1', 'footL', 'footR', 'gill0L1', 'gill0R1'];
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const n of pts) {
      const b = this.rig.bones[n];
      if (!b) continue;
      _v.setFromMatrixPosition(b.bone.matrixWorld);
      if (n === 'head') _v.y += 0.06;
      _v.project(this.camera);
      const x = rect.left + ((_v.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - _v.y) / 2) * rect.height;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    Object.assign(out, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    return out;
  }

  // --- Controls used by behaviors ---------------------------------------------

  setStance(pose, dur = 0.6, easing = ease.inOut) {
    this.stance.set(toVecPose(mirrorPose(pose)), dur, easing);
  }

  pose(pose, dur = 0.4, easing = ease.inOut, weight = 1) {
    this.action.set(toVecPose(mirrorPose(pose)), dur, easing, weight);
  }

  // IK: pose values that put a wrist (side 'L' or 'R') at a model-space point.
  // The elbow bends toward pole, by default outward and a little back.
  reachHand(side, [x, y, z], pole) {
    const s = side === 'L' ? 1 : -1;
    const p = pole ? new THREE.Vector3(...pole) : new THREE.Vector3(s * 1, -0.35, -0.55);
    return this.rig.reach(`upper_arm${side}`, `forearm${side}`, `hand${side}`, new THREE.Vector3(x, y, z), p);
  }

  reachFoot(side, [x, y, z], pole) {
    const s = side === 'L' ? 1 : -1;
    const p = pole ? new THREE.Vector3(...pole) : new THREE.Vector3(s * 0.3, 0.2, 1);
    return this.rig.reach(`thigh${side}`, `shin${side}`, `foot${side}`, new THREE.Vector3(x, y, z), p);
  }

  // Like pose, but no mirroring: for one-sided gestures.
  poseExact(pose, dur = 0.4, easing = ease.inOut, weight = 1) {
    this.action.set(toVecPose(pose), dur, easing, weight);
  }

  release(dur = 0.5, names) {
    this.action.release(names, dur);
  }

  moveTo({ x, y, z, yaw, pitch, roll }) {
    const r = this.root;
    if (x !== undefined) r.x.target = x;
    if (y !== undefined) r.y.target = y;
    if (z !== undefined) r.z.target = z;
    if (yaw !== undefined) r.yaw.target = yaw;
    if (pitch !== undefined) r.pitch.target = pitch;
    if (roll !== undefined) r.roll.target = roll;
  }

  squash(amount) {
    // amount < 1 squashes, > 1 stretches; the spring settles back with a wobble.
    this.root.squash.x = amount;
  }

  lookAt(point) {
    this.gaze.target.copy(point);
  }

  lookAtPage(clientX, clientY) {
    this.pagePointToWorld(clientX, clientY, 0.4, this.gaze.target);
  }

  lookAtViewer() {
    this.gaze.target.set(this.root.x.x * 0.3, 0.25, 3);
  }

  blink() {
    if (this.lids.blinkT < 0) this.lids.blinkT = 0;
  }

  setExpression(weights, dur = 0.25) {
    for (const [k, t] of Object.entries(this.expression)) t.set(weights[k] ?? 0, dur, ease.inOut);
  }

  setMouth(visemes) {
    Object.assign(this.visemes, visemes);
  }

  // Snap every spring and tween to its target and restart the clock: the pose
  // at time 0 becomes exact and repeatable (used to record the AR showreel).
  resetMotion() {
    this.time = 0;
    for (const layer of [this.stance, this.action, this.gesture]) {
      layer.weights.forEach((w) => { w.t = 1; w.value = w.to; });
      layer.tweens.forEach((tw) => tw.forEach((t) => { t.t = 1; t.value = t.to; }));
    }
    for (const tw of [this.bob, this.spin, this.tailWag, this.lean, this.lids.open, this.lids.squint, this.lids.wide,
      this.gills.perk, this.gills.flare, this.gills.wave, ...Object.values(this.expression)]) {
      tw.t = 1;
      tw.value = tw.to;
    }
    this.target.fill(0);
    this.stance.update(0, this.target);
    this.action.update(0, this.target);
    this.gesture.update(0, this.target);
    this.addLife(0, 0);
    this.springs.snap(this.target);
    for (const s of Object.values(this.root)) s.snap(s.target);
    const g = this.gaze;
    g.saccade = [0, 0];
    g.nextSaccade = 0.6;
    [...g.eyes, ...g.head].forEach((s) => s.snap(0));
    this.lids.blinkT = -1;
    this.lids.nextBlink = 1.6;
    this.visemes = { Open: 0, Wide: 0, Round: 0 };
    this.mouthWeights = {};
    this.chains.forEach((c) => c.reset());
    this.update(1e-4);
    [...g.eyes, ...g.head].forEach((s) => s.snap(s.target));
    this.chains.forEach((c) => c.reset());
    this.update(1e-4);
  }

  // --- The frame loop ---------------------------------------------------------

  frame() {
    const now = performance.now();
    if (now - this.last < 1000 / this.maxFps - 4) return;
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    if (this.hidden || dt <= 0) return;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.emit('tick', dt);

    // 1. Pose layers into the joint targets.
    this.target.fill(0);
    this.stance.update(dt, this.target);
    this.action.update(dt, this.target);
    this.gesture.update(dt, this.target);

    // 2. Procedural life on top.
    this.addLife(dt, t);

    // 3. Springs, then onto the bones.
    this.springs.step(this.target, dt, this.reducedMotion ? 0.8 : 1);
    for (let i = 0; i < this.names.length; i++) {
      const x = this.springs.x;
      this.rig.setVec(this.names[i], [x[i * 3], x[i * 3 + 1], x[i * 3 + 2]]);
    }

    // 4. Root motion.
    const r = this.root;
    for (const s of Object.values(r)) s.step(dt);
    const bob = this.bob.update(dt) * (this.reducedMotion ? 0.4 : 1);
    const spin = this.spin.update(dt);
    this.holder.rotation.set((r.pitch.x + spin) * DEG + bob * 1.2 * DEG * Math.sin(t * 1.35 + 0.8), r.yaw.x * DEG, r.roll.x * DEG, 'YXZ');
    // Rotate around Gilly's middle, not the feet.
    _v.copy(this.pivot).applyEuler(this.holder.rotation);
    this.holder.position.set(r.x.x + this.pivot.x - _v.x, r.y.x + bob * 0.006 * Math.sin(t * 1.35) + this.pivot.y - _v.y, r.z.x + this.pivot.z - _v.z);
    const s = r.squash.x;
    this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));

    // 5. Head and eyes look toward the gaze target.
    this.updateGaze(dt, t);

    // 6. Secondary motion on gills and tail.
    this.model.updateMatrixWorld(true);
    for (const chain of this.chains) chain.update(dt);

    // 7. Face.
    this.updateLids(dt, t);
    this.updateMouth(dt);
  }

  addLife(dt, t) {
    const add = (name, x, y, z) => {
      const i = this.names.indexOf(name);
      if (i < 0) return;
      this.target[i * 3] += x;
      this.target[i * 3 + 1] += y;
      this.target[i * 3 + 2] += z;
    };
    const calm = this.reducedMotion ? 0.5 : 1;
    // Breathing.
    const br = Math.sin(t * Math.PI * 2 * this.breath.rate) * this.breath.depth * calm;
    add('spine', -1.2 * br, 0, 0);
    add('chest', -1.6 * br, 0, 0);
    add('head', 1.0 * br, 0, 0);
    add('upper_armL', 0, 0, 1.2 * br);
    add('upper_armR', 0, 0, -1.2 * br);
    // Slow weight shifts.
    const sway = noise(t * 0.23, 1) * calm;
    add('hips', 0, sway * 3, sway * 2.5);
    add('chest', 0, -sway * 2, -sway * 2.2);
    add('head', noise(t * 0.31, 2) * 2 * calm, 0, noise(t * 0.27, 3) * 3 * calm);
    // Floating: gentle paddling and dangling legs.
    const b = this.bob.value * calm;
    add('forearmL', 5 * b * Math.sin(t * 1.35 + 0.5), 0, 0);
    add('forearmR', 5 * b * Math.sin(t * 1.35 + 1.1), 0, 0);
    add('upper_armL', 0, 0, 3 * b * Math.sin(t * 1.35 + 0.2));
    add('upper_armR', 0, 0, -3 * b * Math.sin(t * 1.35 + 0.7));
    add('thighL', 4 * b * Math.sin(t * 1.1), 0, 0);
    add('thighR', 4 * b * Math.sin(t * 1.1 + Math.PI), 0, 0);
    add('footL', 6 * b * Math.sin(t * 1.1 + 0.6), 0, 0);
    add('footR', 6 * b * Math.sin(t * 1.1 + Math.PI + 0.6), 0, 0);
    // Tail: a traveling wave.
    const wag = this.tailWag.update(dt) * calm;
    for (let i = 0; i < 5; i++) add(`tail${i}`, 0, wag * (3 + i * 1.6) * Math.sin(t * 1.6 - i * 0.7), 0);
    // Gills: posture (perked or droopy) plus a slow rippling wave.
    const perk = this.gills.perk.update(dt);
    const flare = this.gills.flare.update(dt);
    const wave = this.gills.wave.update(dt) * calm;
    for (let g = 0; g < 3; g++) {
      const spread = [1, 0.15, -1][g];
      for (const side of ['L', 'R']) {
        const s = side === 'L' ? 1 : -1;
        const phase = g * 1.7 + (side === 'L' ? 0 : 0.9);
        const ripple = wave * 4 * Math.sin(t * 2.1 + phase);
        // Perk tips the gills up and a little forward, like ears; droop lets them
        // hang back and down. Flare fans the three apart.
        const droop = Math.max(0, -perk);
        const up = perk * 14 - droop * 14 + flare * 12 * spread + ripple;
        const fwd = perk * 6 - droop * 4 + flare * 8;
        add(`gill${g}${side}0`, -perk * 4, -s * fwd, s * up);
        add(`gill${g}${side}1`, 0, -s * flare * 4, s * (perk * 10 - droop * 12 + flare * 6 * spread + ripple * 1.4));
      }
    }
    // Leaning toward something (a bubble, the viewer).
    const lean = this.lean.update(dt);
    add('spine', lean * 6, 0, 0);
    add('chest', lean * 5, 0, 0);
  }

  updateGaze(dt, t) {
    const g = this.gaze;
    const head = this.rig.bones.head.bone;
    head.updateMatrixWorld(true);
    // Direction to the target, in Gilly's model space (so turning the body counts).
    const headPos = _v.setFromMatrixPosition(head.matrixWorld);
    headPos.y += 0.05;
    const dir = _v2.subVectors(g.target, headPos);
    this.holder.getWorldQuaternion(_q).invert();
    dir.applyQuaternion(_q);
    let yaw = Math.atan2(dir.x, dir.z) / DEG;
    let pitch = -Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) / DEG;
    // Micro saccades while fixating: the eyes never sit perfectly still.
    if (t > g.nextSaccade) {
      g.saccade = [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2];
      g.nextSaccade = t + 0.4 + Math.random() * 1.6;
    }
    yaw = clamp(yaw, -80, 80);
    pitch = clamp(pitch, -40, 40);
    const follow = g.enabled ? g.headFollow : 0;
    g.head[0].target = clamp(yaw * follow, -34, 34);
    g.head[1].target = clamp(pitch * follow, -16, 20);
    g.head.forEach((s) => s.step(dt));
    // The eyes cover what the head doesn't, and lead it.
    g.eyes[0].target = g.enabled ? clamp(yaw - g.head[0].x, -28, 28) + g.saccade[0] : g.saccade[0];
    g.eyes[1].target = g.enabled ? clamp(pitch - g.head[1].x, -18, 18) + g.saccade[1] : g.saccade[1];
    g.eyes.forEach((s) => s.step(dt));

    // Head turn on top of whatever the head bone is doing.
    const hb = this.rig.bones.head;
    modelRotation([g.head[1].x * 0.8, g.head[0].x * 0.85, 0], _q2);
    _q.copy(hb.modelQInv).multiply(_q2).multiply(hb.modelQ);
    head.quaternion.multiply(_q);
    const chest = this.rig.bones.chest;
    if (chest) {
      modelRotation([g.head[1].x * 0.2, g.head[0].x * 0.15, 0], _q2);
      _q.copy(chest.modelQInv).multiply(_q2).multiply(chest.modelQ);
      chest.bone.quaternion.multiply(_q);
    }
    // Eyes: rotate each eyeball about its own up (yaw) and side (pitch) axes.
    for (const e of this.meta.eyes ?? []) {
      const b = this.rig.bones[`eye${e.side}`];
      if (!b) continue;
      modelRotation([g.eyes[1].x, g.eyes[0].x, 0], _q2);
      this.rig.setModelRotation(`eye${e.side}`, _q2);
    }
  }

  updateLids(dt, t) {
    const L = this.lids;
    // Natural blinking: every 2–6 s, sometimes twice.
    if (t > L.nextBlink && L.blinkT < 0) {
      L.blinkT = 0;
      L.double = Math.random() < 0.18;
      L.nextBlink = t + 2 + Math.random() * 4;
    }
    let blink = 0;
    if (L.blinkT >= 0) {
      L.blinkT += dt;
      const bt = L.blinkT;
      // Close fast, hold a beat, open a little slower.
      blink = bt < 0.07 ? ease.in(bt / 0.07) : bt < 0.1 ? 1 : 1 - ease.out(Math.min(1, (bt - 0.1) / 0.12));
      if (bt > 0.22) {
        L.blinkT = -1;
        if (L.double) {
          L.double = false;
          L.nextBlink = t + 0.08;
        }
      }
    }
    const open = L.open.update(dt); // 1 open, 0 closed (sleepy in between)
    const squint = L.squint.update(dt); // happy: lower lids rise
    const wide = L.wide.update(dt); // surprise: lids pull back
    const lookDown = clamp(this.gaze.eyes[1].x / 18, -1, 1);
    const upper = clamp(1 - open + blink + Math.max(0, lookDown) * 0.25 - wide * 0.25, -0.3, 1);
    const lower = clamp(squint * 0.55 + blink * 0.9 - wide * 0.1, -0.2, 1);
    const shine = clamp(1 - (upper - 0.25) / 0.35, 0, 1);
    for (const dot of this.catchlights ?? []) dot.visible = shine > 0.05;
    if (this.catchlights?.[0]) this.catchlights[0].material.opacity = 0.92 * shine;
    const lidOpen = this.meta.lidOpen ?? { upper: -68, lower: 58 };
    for (const e of this.meta.eyes ?? []) {
      const axis = _v.set(...e.x);
      // Closing undoes the opening rotation about the eye's side axis.
      _q2.setFromAxisAngle(axis, -lidOpen.upper * DEG * upper);
      this.rig.setModelRotation(`lid_up${e.side}`, _q2);
      _q2.setFromAxisAngle(axis, -lidOpen.lower * DEG * lower * 0.98);
      this.rig.setModelRotation(`lid_lo${e.side}`, _q2);
    }
  }

  updateMouth(dt) {
    const m = this.mouth;
    if (!m?.morphTargetDictionary) return;
    const dict = m.morphTargetDictionary;
    const w = {};
    for (const [k, tw] of Object.entries(this.expression)) w[k] = tw.update(dt);
    // Speech shapes blend over the expression.
    const talk = Math.min(1, this.visemes.Open + this.visemes.Wide + this.visemes.Round);
    w.Open = Math.max(w.Open ?? 0, this.visemes.Open);
    w.Wide = this.visemes.Wide;
    w.Round = this.visemes.Round;
    w.Grin = (w.Grin ?? 0) * (1 - talk * 0.6);
    for (const [k, v] of Object.entries(w)) {
      const i = dict[k];
      if (i === undefined) continue;
      const cur = this.mouthWeights[k] ?? 0;
      const next = lerp(cur, v, 1 - Math.exp(-dt * 28));
      this.mouthWeights[k] = next;
      m.morphTargetInfluences[i] = next;
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.dispose();
    this.canvas.remove();
  }
}
