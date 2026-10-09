// Ada's performance: everything that moves, from breathing to gestures, driven by what the
// conversation is doing. Nothing here is a canned animation clip. The layers, slow to fast:
//
//   behaviour   idle, listening, thinking, speaking; gaze targets; gesture plans from the reply
//   body        posture, weight shifts and breathing on the spine; arms by two-bone IK toward
//               hand targets, with wrist and forearm twist shared out to the twist bones; fingers
//   head/eyes   eyes jump to a target and the head follows a beat later; saccades; blinks
//   face        ARKit blendshapes: expression mixes plus mouth shapes from the speech timeline
//
// Every target eases on a damped spring, so motion overlaps the way a body's does: the eyes
// lead, the head follows, the shoulders and hands arrive last.
import * as THREE from 'three';
import { shapeAt } from './speech.js';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Smooth value noise for drift that never repeats.
function noise(t, seed) {
  const i = Math.floor(t), f = t - i;
  const h = (n) => { const x = Math.sin((n + seed * 71.3) * 127.1) * 43758.5453; return x - Math.floor(x); };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

// A damped spring with an exact step, stable at any frame time.
class Spring {
  constructor(value = 0, frequency = 3, damping = 1) {
    this.value = value; this.velocity = 0; this.target = value;
    this.omega = 2 * Math.PI * frequency; this.zeta = damping;
  }
  step(dt) {
    const { omega: w, zeta: z } = this;
    const j0 = this.value - this.target, v = this.velocity;
    if (z >= 0.999) {
      const e = Math.exp(-w * dt), j1 = v + w * j0;
      this.value = this.target + (j0 + j1 * dt) * e;
      this.velocity = (v - w * j1 * dt) * e;
    } else {
      const zw = z * w, wd = w * Math.sqrt(1 - z * z);
      const e = Math.exp(-zw * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt);
      const b = (v + zw * j0) / wd;
      this.value = this.target + e * (j0 * c + b * s);
      this.velocity = e * (v * c - ((zw * v + w * w * j0) / wd) * s);
    }
    return this.value;
  }
  snap(v) { this.value = this.target = v; this.velocity = 0; }
}

class Spring3 {
  constructor(v, frequency, damping) { this.x = new Spring(v.x, frequency, damping); this.y = new Spring(v.y, frequency, damping); this.z = new Spring(v.z, frequency, damping); this.out = v.clone(); }
  set(v) { this.x.target = v.x; this.y.target = v.y; this.z.target = v.z; }
  snap(v) { this.x.snap(v.x); this.y.snap(v.y); this.z.snap(v.z); this.out.copy(v); }
  step(dt) { return this.out.set(this.x.step(dt), this.y.step(dt), this.z.step(dt)); }
  setFrequency(f) { for (const s of [this.x, this.y, this.z]) s.omega = 2 * Math.PI * f; }
}

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

// Rotation that takes the frame (a0, b0) onto (a1, b1): a exactly, b as close as it can.
function alignFrames(a0, b0, a1, b1, out) {
  const basis = (a, b, m) => {
    const x = _v1.copy(a).normalize();
    const y = _v2.copy(b).addScaledVector(x, -b.dot(x)).normalize();
    const z = _v3.crossVectors(x, y);
    return m.makeBasis(x, y, z);
  };
  basis(a0, b0, _m1);
  basis(a1, b1, _m2);
  return out.setFromRotationMatrix(_m2.multiply(_m1.transpose()));
}

// ---- The skeleton, in the character's own space (the model root sits at the origin) ----------

class Rig {
  constructor(model) {
    this.model = model;
    model.updateMatrixWorld(true);
    this.bones = new Map();
    model.traverse((o) => {
      if (!o.isBone || this.bones.has(o.name)) return;
      const bindRot = o.getWorldQuaternion(new THREE.Quaternion());
      const bindPos = o.getWorldPosition(new THREE.Vector3());
      this.bones.set(o.name, { bone: o, bindLocal: o.quaternion.clone(), bindLocalPos: o.position.clone(), bindRot, bindPos, bindRotInv: bindRot.clone().invert() });
    });
  }
  get(name) { return this.bones.get(name); }
  has(name) { return this.bones.has(name); }
  reset(names) { for (const n of names) { const b = this.bones.get(n); if (b) { b.bone.quaternion.copy(b.bindLocal); b.bone.position.copy(b.bindLocalPos); } } }
  /** Rotate a bone by a model-space rotation, expressed in its bind frame (so parents carry it). */
  rotate(name, q) {
    const b = this.bones.get(name);
    if (!b) return;
    _q1.copy(b.bindRotInv).multiply(q).multiply(b.bindRot);
    b.bone.quaternion.multiply(_q1);
  }
  euler(name, pitch, yaw, roll) {
    if (!pitch && !yaw && !roll) return;
    this.rotate(name, _q2.setFromEuler(_e.set(pitch * DEG, yaw * DEG, roll * DEG, 'YXZ')));
  }
  worldRot(name, out = new THREE.Quaternion()) { const b = this.bones.get(name); b.bone.updateWorldMatrix(true, false); return b.bone.getWorldQuaternion(out); }
  worldPos(name, out = new THREE.Vector3()) { const b = this.bones.get(name); b.bone.updateWorldMatrix(true, false); return b.bone.getWorldPosition(out); }
}

// ---- Hands ---------------------------------------------------------------------------------------

// Finger curls in degrees at the three knuckles, plus spread; the thumb has its own.
const HAND_SHAPES = {
  relaxed: { index: [14, 20, 10], middle: [18, 24, 12], ring: [22, 27, 14], pinky: [26, 28, 14], thumb: [6, 14, 10], spread: 0 },
  soft: { index: [8, 12, 6], middle: [11, 15, 8], ring: [15, 18, 10], pinky: [19, 20, 11], thumb: [2, 8, 6], spread: 3 },
  open: { index: [2, 4, 2], middle: [3, 5, 3], ring: [5, 7, 4], pinky: [8, 9, 5], thumb: [-6, 2, 2], spread: 7 },
  hold: { index: [32, 40, 22], middle: [36, 44, 24], ring: [40, 46, 26], pinky: [44, 46, 26], thumb: [12, 22, 16], spread: -2 },
  wave: { index: [3, 5, 3], middle: [3, 5, 3], ring: [5, 6, 4], pinky: [7, 8, 5], thumb: [-8, 2, 2], spread: 9 },
};
const FINGERS = ['index', 'middle', 'ring', 'pinky', 'thumb'];

// Arm poses: wrist position relative to the bind shoulder (x is outward from the body, y up,
// z forward), a hint for where the elbow goes (same axes), forearm rotation (supination turns
// the palm up, degrees), wrist flexion and deviation, and a hand shape.
const ARM_POSES = {
  sides: { at: [0.045, -0.415, 0.075], elbow: [0.05, -0.24, -0.03], sup: 6, flex: 8, dev: 0, hand: 'relaxed' },
  clasp: { at: [-0.085, -0.33, 0.2], elbow: [0.07, -0.22, 0.04], sup: -10, flex: 10, dev: 6, hand: 'hold' },
  ready: { at: [-0.05, -0.29, 0.24], elbow: [0.08, -0.21, 0.05], sup: 30, flex: 2, dev: 0, hand: 'soft' },
  present: { at: [0.13, -0.17, 0.32], elbow: [0.14, -0.2, 0.03], sup: 80, flex: -16, dev: 0, hand: 'open' },
  open: { at: [0.11, -0.26, 0.29], elbow: [0.12, -0.21, 0.05], sup: 75, flex: -6, dev: 0, hand: 'open' },
  beat: { at: [-0.03, -0.27, 0.28], elbow: [0.08, -0.21, 0.06], sup: 42, flex: -4, dev: 0, hand: 'soft' },
  self: { at: [-0.115, -0.07, 0.2], elbow: [0.1, -0.2, 0.08], sup: -62, flex: 16, dev: -8, hand: 'soft' },
  shrug: { at: [0.09, -0.21, 0.27], elbow: [0.07, -0.22, 0.0], sup: 90, flex: -14, dev: 0, hand: 'open' },
  wave: { at: [0.13, 0.15, 0.13], elbow: [0.2, -0.13, 0.06], sup: 12, flex: -8, dev: 0, hand: 'wave' },
  count: { at: [-0.02, -0.25, 0.28], elbow: [0.08, -0.2, 0.06], sup: 20, flex: -4, dev: 0, hand: 'soft' },
};

class Arm {
  constructor(rig, side) {
    this.rig = rig; this.side = side; this.out = side === 'l' ? 1 : -1; // model +x is her left
    const n = (b) => `${b}_${side}`;
    this.names = { clav: n('clavicle'), up: n('upperarm'), lo: n('lowerarm'), hand: n('hand') };
    const up = rig.get(this.names.up), lo = rig.get(this.names.lo), hand = rig.get(this.names.hand);
    this.L1 = up.bindPos.distanceTo(lo.bindPos);
    this.L2 = lo.bindPos.distanceTo(hand.bindPos);
    this.shoulder0 = up.bindPos.clone();
    this.u0 = lo.bindPos.clone().sub(up.bindPos).normalize();
    this.v0 = hand.bindPos.clone().sub(lo.bindPos).normalize();
    // Elbow flexion brings the forearm forward; at bind that's +z, square to the upper arm.
    this.f0 = Z.clone().addScaledVector(this.u0, -Z.dot(this.u0)).normalize();
    this.h0 = new THREE.Vector3().crossVectors(this.u0, this.f0).normalize();
    // Hand frame at bind: finger direction and palm normal (palm faces the body's midline).
    const middle = rig.get(n('middle_01')), index = rig.get(n('index_01')), pinky = rig.get(n('pinky_01')), thumb = rig.get(n('thumb_02'));
    this.d0 = middle.bindPos.clone().sub(hand.bindPos).normalize();
    const across = index.bindPos.clone().sub(pinky.bindPos);
    this.p0 = new THREE.Vector3().crossVectors(across, this.d0).normalize();
    if (this.p0.x * this.out > 0) this.p0.negate(); // palm toward the midline
    // Supination turns the thumb away from the body; find which way that is about the forearm.
    const thumbDir = thumb.bindPos.clone().sub(hand.bindPos);
    this.supSign = Math.sign(new THREE.Vector3().crossVectors(this.v0, thumbDir).x * this.out) || 1;
    const local = (boneName, axis) => axis.clone().applyQuaternion(rig.get(boneName).bindRotInv).normalize();
    this.handAxes = {
      twist: local(this.names.hand, this.v0),
      flex: local(this.names.hand, new THREE.Vector3().crossVectors(this.d0, this.p0).normalize()),
      dev: local(this.names.hand, this.p0),
    };
    // Twist bones share the forearm's roll (nearer the wrist, more) and undo the upper arm's.
    this.loTwist = ['lowerarm_twist_01', 'lowerarm_twist_02'].map((b) => n(b)).filter((b) => rig.has(b))
      .map((name) => ({ name, axis: local(name, this.v0), share: 0.25 + 0.6 * (rig.get(name).bindPos.distanceTo(lo.bindPos) / this.L2) }));
    this.upTwist = ['upperarm_twist_01', 'upperarm_twist_02'].map((b) => n(b)).filter((b) => rig.has(b))
      .map((name) => ({ name, axis: local(name, this.u0), share: 1 - rig.get(name).bindPos.distanceTo(up.bindPos) / this.L1 }));
    // Finger chains with their curl and spread axes, in each bone's own frame.
    this.fingers = {};
    for (const f of FINGERS) {
      const chain = [1, 2, 3].map((i) => n(`${f}_0${i}`)).filter((b) => rig.has(b));
      const dir = rig.get(chain[1]).bindPos.clone().sub(rig.get(chain[0]).bindPos).normalize();
      const curlAxis = new THREE.Vector3().crossVectors(dir, this.p0).normalize();
      this.fingers[f] = chain.map((name) => ({ name, curl: local(name, curlAxis), spread: local(name, this.p0) }));
    }
    // Live state, eased.
    const bindTarget = this.poseTarget(ARM_POSES.sides, new THREE.Vector3());
    this.target = new Spring3(bindTarget, 1.6, 1);
    this.sup = new Spring(ARM_POSES.sides.sup, 1.8, 1);
    this.flex = new Spring(0, 2, 1);
    this.dev = new Spring(0, 2, 1);
    this.elbow = new Spring3(new THREE.Vector3(...ARM_POSES.sides.elbow), 1.6, 1);
    this.handShape = {};
    for (const f of FINGERS) this.handShape[f] = [0, 1, 2].map(() => new Spring(0, 3, 1));
    this.spread = new Spring(0, 3, 1);
    this.pose = ARM_POSES.sides;
  }

  poseTarget(pose, out) {
    return out.set(this.shoulder0.x + pose.at[0] * this.out, this.shoulder0.y + pose.at[1], this.shoulder0.z + pose.at[2]);
  }

  setPose(pose, { speed = 1, offset = null } = {}) {
    this.pose = pose;
    this.poseTarget(pose, _v4);
    if (offset) _v4.add(offset);
    // Bodies are never mirror images: each arm settles a little differently.
    if (!offset) _v4.add(_v3.set(rand(-0.012, 0.012), rand(-0.015, 0.01), rand(-0.01, 0.015)));
    this.target.set(_v4);
    this.target.setFrequency(1.5 * speed);
    for (const s of [this.sup, this.flex, this.dev]) s.omega = 2 * Math.PI * 1.7 * speed;
    this.sup.target = pose.sup + rand(-4, 4); this.flex.target = pose.flex + rand(-3, 3); this.dev.target = pose.dev;
    this.elbow.set(_v3.set(...pose.elbow)); this.elbow.setFrequency(1.5 * speed);
    const shape = HAND_SHAPES[pose.hand];
    for (const f of FINGERS) shape[f].forEach((v, i) => { this.handShape[f][i].target = v; });
    this.spread.target = shape.spread;
  }

  snap() {
    this.target.snap(this.poseTarget(this.pose, _v4));
    for (const s of [this.sup, this.flex, this.dev, this.spread]) s.snap(s.target);
    this.elbow.snap(_v3.set(...this.pose.elbow));
    for (const f of FINGERS) this.handShape[f].forEach((s) => s.snap(s.target));
  }

  /** Pose the arm for this frame. `torso` maps bind-space targets into the moved torso. */
  update(dt, torso, extra) {
    const rig = this.rig;
    const T = this.target.step(dt).clone();
    if (extra) T.add(extra);
    T.sub(torso.pivot).applyQuaternion(torso.rot).add(torso.at);
    const sup = this.sup.step(dt), flex = this.flex.step(dt), dev = this.dev.step(dt);
    const elbowHint = this.elbow.step(dt);

    // Clavicle: a little lift and reach when the hand works high or forward.
    const lift = clamp((T.y - (this.shoulder0.y - 0.3)) / 0.45, 0, 1);
    const reach = clamp((T.z - 0.15) / 0.3, 0, 1);
    rig.euler(this.names.clav, 0, -reach * 6 * this.out, lift * 9 * this.out);

    const S = rig.worldPos(this.names.up, new THREE.Vector3());
    const parentRot = rig.worldRot(this.names.clav, new THREE.Quaternion());
    const d = T.clone().sub(S);
    const dist = clamp(d.length(), Math.abs(this.L1 - this.L2) + 0.02, (this.L1 + this.L2) * 0.995);
    const dir = d.normalize();
    // The pose's elbow hint (out, down, forward from the shoulder) picks the plane the arm bends in.
    const pole = _v4.set(elbowHint.x * this.out, elbowHint.y, elbowHint.z).applyQuaternion(torso.rot);
    const polePerp = pole.clone().addScaledVector(dir, -pole.dot(dir));
    if (polePerp.lengthSq() < 1e-6) polePerp.set(this.out, 0, 0);
    polePerp.normalize();
    const a = (this.L1 * this.L1 - this.L2 * this.L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, this.L1 * this.L1 - a * a));
    const E = S.clone().addScaledVector(dir, a).addScaledVector(polePerp, h);
    const Tc = S.clone().addScaledVector(dir, dist);
    const u1 = E.clone().sub(S).normalize();
    const v1 = Tc.clone().sub(E).normalize();
    const f1 = v1.clone().addScaledVector(u1, -v1.dot(u1));
    if (f1.lengthSq() < 1e-6) f1.copy(polePerp).negate();
    f1.normalize();
    const h1 = new THREE.Vector3().crossVectors(u1, f1).normalize();

    const up = rig.get(this.names.up), lo = rig.get(this.names.lo);
    const Wup = alignFrames(this.u0, this.f0, u1, f1, new THREE.Quaternion()).multiply(up.bindRot);
    up.bone.quaternion.copy(parentRot.invert()).multiply(Wup);
    const Wlo = alignFrames(this.v0, this.h0, v1, h1, new THREE.Quaternion()).multiply(lo.bindRot);
    lo.bone.quaternion.copy(Wup.clone().invert()).multiply(Wlo);

    // Upper-arm twist relative to the plain swing, handed back down the twist bones.
    const swing = new THREE.Quaternion().setFromUnitVectors(this.u0, u1);
    const twistQ = swing.invert().multiply(alignFrames(this.u0, this.f0, u1, f1, new THREE.Quaternion()));
    const upTwist = 2 * Math.atan2(_v1.set(twistQ.x, twistQ.y, twistQ.z).dot(this.u0), twistQ.w);
    for (const t of this.upTwist) {
      const b = rig.get(t.name);
      b.bone.quaternion.copy(b.bindLocal).multiply(_q1.setFromAxisAngle(t.axis, -upTwist * t.share * 0.85));
    }

    // Wrist: supination about the forearm, then flexion and deviation.
    const supRad = sup * DEG * this.supSign;
    const hand = rig.get(this.names.hand);
    hand.bone.quaternion.copy(hand.bindLocal)
      .multiply(_q1.setFromAxisAngle(this.handAxes.twist, supRad))
      .multiply(_q2.setFromAxisAngle(this.handAxes.flex, flex * DEG))
      .multiply(_q3.setFromAxisAngle(this.handAxes.dev, dev * DEG * this.out));
    for (const t of this.loTwist) {
      const b = rig.get(t.name);
      b.bone.quaternion.copy(b.bindLocal).multiply(_q1.setFromAxisAngle(t.axis, supRad * t.share));
    }

    // Fingers.
    const spread = this.spread.step(dt);
    for (const f of FINGERS) {
      const chain = this.fingers[f];
      const springs = this.handShape[f];
      const fan = f === 'index' ? 1 : f === 'middle' ? 0.2 : f === 'ring' ? -0.6 : f === 'pinky' ? -1.2 : 0.8;
      chain.forEach((j, i) => {
        const b = rig.get(j.name);
        const curl = springs[i].step(dt) * DEG;
        b.bone.quaternion.copy(b.bindLocal).multiply(_q1.setFromAxisAngle(j.curl, curl));
        if (i === 0 && spread) b.bone.quaternion.multiply(_q2.setFromAxisAngle(j.spread, spread * fan * DEG * this.out));
      });
    }
  }
}

// ---- Legs and walking ----------------------------------------------------------------------------

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

class Leg {
  constructor(rig, side) {
    this.rig = rig; this.side = side; this.out = side === 'l' ? 1 : -1;
    const n = (b) => `${b}_${side}`;
    this.names = { thigh: n('thigh'), calf: n('calf'), foot: n('foot'), ball: n('ball') };
    const thigh = rig.get(this.names.thigh), calf = rig.get(this.names.calf), foot = rig.get(this.names.foot), ball = rig.get(this.names.ball);
    this.L1 = thigh.bindPos.distanceTo(calf.bindPos);
    this.L2 = calf.bindPos.distanceTo(foot.bindPos);
    this.u0 = calf.bindPos.clone().sub(thigh.bindPos).normalize();
    this.v0 = foot.bindPos.clone().sub(calf.bindPos).normalize();
    // Knees bend forward, so the shin swings back: flexion is -z, square to the thigh.
    this.f0 = new THREE.Vector3(0, 0, -1).addScaledVector(this.u0, Z.dot(this.u0)).normalize();
    this.h0 = new THREE.Vector3().crossVectors(this.u0, this.f0).normalize();
    this.ankleHeight = foot.bindPos.y;
    this.hip0 = thigh.bindPos.clone();
    this.toe = ball.bindPos.clone().sub(foot.bindPos);
    this.toe.x = 0; // straight ahead of the ankle in the foot's own frame
    this.ballAxis = X.clone().applyQuaternion(ball.bindRotInv).normalize();
    // Where the foot is: the ankle's spot on the floor (y unused), its heading, its swing if any.
    this.plant = new THREE.Vector3(this.out * 0.095, 0, 0);
    this.yaw = 0;
    this.swing = null;
    this.lift = 0;
    this.pitch = new Spring(0, 4, 1);
  }

  /** Pose thigh, calf, foot and toes so the ankle lands where the foot says. */
  solve(rig) {
    const yawQ = _q3.setFromAxisAngle(Y, this.yaw);
    const pitch = this.pitch.value;
    const ankle = new THREE.Vector3(this.plant.x, this.ankleHeight + this.lift, this.plant.z);
    if (pitch > 0 && !this.swing) {
      // Heel off: the foot rolls over the ball, which stays on the floor.
      const toeW = this.toe.clone().applyQuaternion(yawQ);
      const back = this.toe.clone().negate().applyAxisAngle(X, pitch).applyQuaternion(yawQ);
      ankle.add(toeW).add(back);
    }
    const S = rig.worldPos(this.names.thigh, new THREE.Vector3());
    const parentRot = rig.worldRot('pelvis', new THREE.Quaternion());
    const d = ankle.clone().sub(S);
    const dist = clamp(d.length(), 0.25, (this.L1 + this.L2) * 0.997);
    const dir = d.normalize();
    // Knees point where the foot points, a touch outward.
    const pole = new THREE.Vector3(Math.sin(this.yaw) + Math.cos(this.yaw) * this.out * 0.15, 0, Math.cos(this.yaw) - Math.sin(this.yaw) * this.out * 0.15);
    const polePerp = pole.addScaledVector(dir, -pole.dot(dir));
    if (polePerp.lengthSq() < 1e-6) polePerp.set(0, 0, 1);
    polePerp.normalize();
    const a = (this.L1 * this.L1 - this.L2 * this.L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, this.L1 * this.L1 - a * a));
    const E = S.clone().addScaledVector(dir, a).addScaledVector(polePerp, h);
    const T = S.clone().addScaledVector(dir, dist);
    const u1 = E.clone().sub(S).normalize();
    const v1 = T.clone().sub(E).normalize();
    const f1 = v1.clone().addScaledVector(u1, -v1.dot(u1));
    if (f1.lengthSq() < 1e-6) f1.copy(polePerp).negate();
    f1.normalize();
    const h1 = new THREE.Vector3().crossVectors(u1, f1).normalize();
    const thigh = rig.get(this.names.thigh), calf = rig.get(this.names.calf), foot = rig.get(this.names.foot), ball = rig.get(this.names.ball);
    const Wth = alignFrames(this.u0, this.f0, u1, f1, new THREE.Quaternion()).multiply(thigh.bindRot);
    thigh.bone.quaternion.copy(parentRot.invert()).multiply(Wth);
    const Wca = alignFrames(this.v0, this.h0, v1, h1, new THREE.Quaternion()).multiply(calf.bindRot);
    calf.bone.quaternion.copy(Wth.invert()).multiply(Wca);
    const Wfo = new THREE.Quaternion().copy(yawQ).multiply(_q2.setFromAxisAngle(X, pitch)).multiply(foot.bindRot);
    foot.bone.quaternion.copy(Wca.invert()).multiply(Wfo);
    // Toes stay flat on the floor as the heel rises.
    if (pitch > 0 && !this.swing) ball.bone.quaternion.copy(ball.bindLocal).multiply(_q1.setFromAxisAngle(this.ballAxis, -pitch));
  }
}

/**
 * Walking and standing. She stays at the origin of her own little world and the floor moves
 * under her (the page moves her canvas by the same amount), so planted feet never slide.
 * `x` is where she is along the page's floor, in metres.
 */
class Walker {
  constructor(legs) {
    this.legs = legs;
    this.x = 0;
    this.target = null;
    this.standYaw = 0;
    this.yaw = new Spring(0, 0.8, 1);
    this.speed = 0;
    this.dir = 0;
    this.sinceLand = 1;
    this.maxSpeed = 0.78;
    this.hips = { l: legs.l.hip0.clone(), r: legs.r.hip0.clone() };
    this.hipHeight = legs.l.hip0.y;
    this.drop = new Spring(0, 7, 1);
  }

  get walking() { return this.target !== null || this.speed > 0.02; }
  /** Still walking, turning, or with a foot in the air. */
  get moving() {
    return this.walking || Math.abs(wrap(this.yaw.value - this.standYaw)) > 0.12 || Boolean(this.legs.l.swing || this.legs.r.swing);
  }

  goTo(x, faceYaw = 0) { this.target = x; this.standYaw = faceYaw; }
  face(yaw) { this.standYaw = yaw; if (this.target === null) this.yaw.target = yaw; }

  #desired(leg, yaw, ahead) {
    const lat = 0.095 * leg.out;
    return new THREE.Vector3(Math.cos(yaw) * lat + Math.sin(yaw) * ahead, 0, -Math.sin(yaw) * lat + Math.cos(yaw) * ahead);
  }

  /** Advance the walk; returns what the body above the legs should do. */
  update(dt) {
    const legs = [this.legs.l, this.legs.r];
    // Heading and speed toward the destination.
    let desiredSpeed = 0;
    if (this.target !== null) {
      const dist = this.target - this.x;
      const walkYaw = Math.sign(dist) * Math.PI / 2;
      if (Math.abs(dist) < 0.03 && this.speed < 0.08) {
        this.target = null;
      } else {
        this.dir = Math.sign(dist);
        this.yaw.target = walkYaw;
        const facing = Math.abs(wrap(this.yaw.value - walkYaw)) < 0.5;
        const stopping = Math.abs(dist) <= (this.speed * this.speed) / (2 * 0.7) + 0.03;
        desiredSpeed = facing && !stopping ? this.maxSpeed : 0;
      }
    }
    if (this.target === null) this.yaw.target = this.standYaw;
    const accel = desiredSpeed > this.speed ? 1.1 : 1.4;
    this.speed += clamp(desiredSpeed - this.speed, -accel * dt, accel * dt);
    if (this.target === null && this.speed < 0.01) this.speed = 0;
    const yaw = this.yaw.step(dt);
    const move = this.speed * this.dir * dt;
    this.x += move;
    const walk = clamp(this.speed / this.maxSpeed, 0, 1);

    // The floor slides back under planted feet.
    for (const leg of legs) if (!leg.swing) leg.plant.x -= move;

    // Steps: in time while walking, as needed while standing or turning.
    this.sinceLand += dt;
    const swinging = legs.find((l) => l.swing);
    if (!swinging) {
      const ahead = this.speed * 0.3;
      const errors = legs.map((leg) => {
        const want = this.#desired(leg, yaw, ahead);
        const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        return { leg, want, off: leg.plant.distanceTo(want), behind: -leg.plant.clone().sub(want).dot(forward), turn: Math.abs(wrap(leg.yaw - (yaw + leg.out * 0.1))) };
      });
      let step = null;
      if (this.speed > 0.05 && this.sinceLand > 0.08) {
        step = errors.sort((a, b) => b.behind - a.behind)[0];
        if (step.behind < 0.12) step = null;
      } else if (this.sinceLand > 0.22) {
        step = errors.sort((a, b) => (b.off + b.turn * 0.12) - (a.off + a.turn * 0.12))[0];
        if (step.off < 0.035 && step.turn < 0.2) step = null;
      }
      if (step) {
        const big = this.speed > 0.05;
        step.leg.swing = { from: step.leg.plant.clone(), fromYaw: step.leg.yaw, t: 0, dur: big ? 0.4 : 0.3, height: big ? 0.07 : 0.035 };
      }
    }
    let stance = null, swingS = 0;
    for (const leg of legs) {
      const sw = leg.swing;
      if (!sw) {
        // A trailing foot rolls onto its toes before it lifts.
        const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const behind = -leg.plant.dot(forward);
        leg.pitch.target = walk > 0.2 ? clamp((behind - 0.08) / 0.18, 0, 1) * 0.42 : 0;
        leg.pitch.step(dt);
        leg.lift = 0;
        stance = leg;
        continue;
      }
      sw.t += dt;
      const sN = Math.min(1, sw.t / sw.dur);
      const e = (1 - Math.cos(Math.PI * sN)) / 2;
      const want = this.#desired(leg, yaw, this.speed * 0.3);
      leg.plant.lerpVectors(sw.from, want, e);
      const toYaw = yaw + leg.out * 0.1;
      leg.yaw = sw.fromYaw + wrap(toYaw - sw.fromYaw) * e;
      leg.lift = sw.height * Math.sin(Math.PI * sN);
      // Toe down as it leaves, level through the swing, toe up for the heel strike.
      leg.pitch.target = sN < 0.25 ? 0.3 * (1 - sN / 0.25) : sN > 0.7 ? -0.22 * ((sN - 0.7) / 0.3) * walk : 0;
      leg.pitch.step(dt * 2);
      swingS = sN;
      if (sN >= 1) { leg.swing = null; leg.lift = 0; this.sinceLand = 0; leg.pitch.target = 0; }
    }

    // What the hips and shoulders do. The hips ride as high as the planted legs allow, nearly
    // straight over the foot at mid-stance and lower when both feet are down (an inverted
    // pendulum), and lean over the stance foot.
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const along = (leg) => leg.plant.dot(forward);
    const stride = clamp((along(this.legs.l) - along(this.legs.r)) / 0.4, -1, 1);
    const bobS = legs.some((l) => l.swing) ? Math.sin(Math.PI * swingS) : 0;
    const stanceOut = stance ? stance.out : 0;
    const sideShift = walk * 0.02 * bobS * stanceOut;
    let hipY = Infinity;
    for (const leg of legs) {
      if (leg.swing) continue;
      const h0 = this.hips[leg.side];
      const hip = new THREE.Vector3(Math.cos(yaw) * h0.x + Math.sin(yaw) * h0.z, h0.y, -Math.sin(yaw) * h0.x + Math.cos(yaw) * h0.z).addScaledVector(side, sideShift);
      const horizontal = Math.hypot(hip.x - leg.plant.x, hip.z - leg.plant.z);
      const ankleY = leg.ankleHeight + Math.max(0, leg.pitch.value) * 0.11;
      const reach = (leg.L1 + leg.L2) * 0.985;
      hipY = Math.min(hipY, ankleY + Math.sqrt(Math.max(0, reach * reach - horizontal * horizontal)));
    }
    const drop = Math.min(0, (isFinite(hipY) ? hipY : this.hipHeight) - this.hipHeight);
    this.drop.target = drop;
    const pelvis = new THREE.Vector3().addScaledVector(side, sideShift).add(new THREE.Vector3(0, this.drop.step(dt), 0));
    const feetMid = this.legs.l.plant.clone().add(this.legs.r.plant).multiplyScalar(0.5);
    return { yaw, walk, stride, pelvis, hipDrop: walk * 2.2 * bobS * -stanceOut, feetMid, forward, side };
  }
}

// ---- Face ----------------------------------------------------------------------------------------

const EXPRESSIONS = {
  neutral: { mouthSmileLeft: 0.06, mouthSmileRight: 0.06 },
  pleasant: { mouthSmileLeft: 0.2, mouthSmileRight: 0.18, cheekSquintLeft: 0.08, cheekSquintRight: 0.07, eyeSquintLeft: 0.05, eyeSquintRight: 0.05 },
  smile: { mouthSmileLeft: 0.55, mouthSmileRight: 0.5, cheekSquintLeft: 0.3, cheekSquintRight: 0.27, eyeSquintLeft: 0.18, eyeSquintRight: 0.16, mouthDimpleLeft: 0.12, mouthDimpleRight: 0.12, browInnerUp: 0.08 },
  listening: { mouthSmileLeft: 0.14, mouthSmileRight: 0.12, browInnerUp: 0.14, browOuterUpLeft: 0.05, browOuterUpRight: 0.05, eyeWideLeft: 0.04, eyeWideRight: 0.04 },
  thinking: { browDownLeft: 0.22, browDownRight: 0.12, browInnerUp: 0.18, mouthPressLeft: 0.28, mouthPressRight: 0.22, mouthRollLower: 0.12, mouthLeft: 0.1, eyeSquintLeft: 0.16, eyeSquintRight: 0.1 },
  interested: { browInnerUp: 0.22, browOuterUpLeft: 0.18, browOuterUpRight: 0.16, eyeWideLeft: 0.08, eyeWideRight: 0.08, mouthSmileLeft: 0.16, mouthSmileRight: 0.14 },
  concerned: { browInnerUp: 0.38, browDownLeft: 0.05, browDownRight: 0.05, mouthFrownLeft: 0.06, mouthFrownRight: 0.06, mouthPressLeft: 0.1, mouthPressRight: 0.1 },
};

// Mouth shapes as ARKit weights: the GDK's VISEMES table, with a few lip-closure and rounding
// tweaks for this face. Anything not listed falls back to the GDK's values.
const VISEME_TWEAKS = {
  A: { mouthClose: 0.12, mouthPressLeft: 0.3, mouthPressRight: 0.3, mouthRollLower: 0.18, mouthRollUpper: 0.12 },
  E: { jawOpen: 0.22, mouthFunnel: 0.38, mouthPucker: 0.22 },
  F: { jawOpen: 0.08, mouthPucker: 0.68, mouthFunnel: 0.25 },
};

const FACE_CHANNELS = [
  'browInnerUp', 'browDownLeft', 'browDownRight', 'browOuterUpLeft', 'browOuterUpRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight',
  'eyeLookUpLeft', 'eyeLookUpRight', 'eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight',
  'cheekSquintLeft', 'cheekSquintRight', 'cheekPuff', 'noseSneerLeft', 'noseSneerRight',
  'jawOpen', 'jawForward', 'jawLeft', 'jawRight',
  'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight', 'mouthSmileLeft', 'mouthSmileRight',
  'mouthFrownLeft', 'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'mouthPressLeft', 'mouthPressRight',
  'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight',
];

// ---- The performer ---------------------------------------------------------------------------------

export class Performer {
  /**
   * @param {object} o
   * @param {THREE.Object3D} o.model   the loaded character, root at the origin, facing +z
   * @param {object} o.actor           the GDK MetaHumanActor that adopted the model
   * @param {Record<string, Record<string, number>>} o.visemes  the GDK's VISEMES table
   */
  constructor({ model, actor, visemes }) {
    this.model = model;
    this.actor = actor;
    this.rig = new Rig(model);
    this.time = 0;
    this.mode = 'idle';
    this.visemes = Object.fromEntries(Object.entries(visemes).map(([k, v]) => [k, { ...v, ...(VISEME_TWEAKS[k] ?? {}) }]));
    this.mouthChannels = [...new Set(Object.values(this.visemes).flatMap((v) => Object.keys(v)))];

    this.torsoBones = ['root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'spine_04', 'spine_05', 'neck_01', 'neck_02', 'head', 'clavicle_l', 'clavicle_r'];
    this.arms = { l: new Arm(this.rig, 'l'), r: new Arm(this.rig, 'r') };
    this.legs = { l: new Leg(this.rig, 'l'), r: new Leg(this.rig, 'r') };
    this.walker = new Walker(this.legs);
    this.legBones = Object.values(this.legs).flatMap((l) => Object.values(l.names));
    this.armBones = Object.values(this.arms).flatMap((a) => [
      ...Object.values(a.names), ...a.loTwist.map((t) => t.name), ...a.upTwist.map((t) => t.name),
      ...FINGERS.flatMap((f) => a.fingers[f].map((j) => j.name)),
    ]);

    // Body springs.
    this.lean = new Spring(0, 0.6, 1);         // forward lean, degrees
    this.sway = new Spring(0, 0.35, 1);        // weight shift, -1..1
    this.tilt = new Spring(0, 0.9, 1);         // head tilt, degrees
    this.nod = new Spring(0, 3.2, 0.55);       // head pitch impulses, degrees
    this.shake = new Spring(0, 2.6, 0.6);      // head yaw impulses
    this.shrug = new Spring(0, 2.2, 0.8);      // shoulder lift, 0..1
    this.headYaw = new Spring(0, 1.7, 0.9);
    this.headPitch = new Spring(0, 1.7, 0.9);
    this.torsoYaw = new Spring(0, 0.8, 1);
    this.breath = 0;
    this.inhale = 0;

    // Gaze: where the eyes aim, in world space, and the eye angles they produce.
    this.gazeTarget = new THREE.Vector3(0, 1.5, 3);
    this.gazeKind = 'visitor';
    this.eyeYaw = 0; this.eyePitch = 0;
    this.microTimer = 0; this.micro = new THREE.Vector2();
    this.gazeHold = 0;
    this.awayTimer = 0;

    // Face.
    this.faceSprings = Object.fromEntries(FACE_CHANNELS.map((n) => [n, new Spring(0, 9, 1)]));
    for (const n of this.mouthChannels) if (this.faceSprings[n]) this.faceSprings[n].omega = 2 * Math.PI * 16;
    this.expression = { neutral: 1 };
    this.exprWeights = Object.fromEntries(Object.keys(EXPRESSIONS).map((k) => [k, new Spring(k === 'neutral' ? 1 : 0, 1.3, 1)]));
    this.browPulse = new Spring(0, 4, 0.7);
    this.blink = { timer: 1.5, t: -1 };

    // Speech.
    this.speech = null; // { timeline, clock(), plan }

    // Idle bookkeeping.
    this.restPose = 'clasp';
    this.idleTimer = rand(4, 8);
    this.cursor = null;
    this.events = [];
    this.setMode('idle', { snap: true });
    this.arms.l.snap(); this.arms.r.snap();
  }

  // ---- Commands --------------------------------------------------------------------------------

  setMode(mode, { snap = false } = {}) {
    if (this.mode === mode && !snap) return;
    const prev = this.mode;
    this.mode = mode;
    if (mode === 'idle') {
      this.setExpression({ neutral: 0.6, pleasant: 0.4 });
      this.restPose = Math.random() < 0.6 ? 'clasp' : 'sides';
      this.lean.target = 0;
    } else if (mode === 'attentive') {
      this.setExpression({ pleasant: 0.7, listening: 0.3 });
      this.restPose = 'clasp';
      this.lean.target = 1.2;
      this.look('visitor');
    } else if (mode === 'listening') {
      this.setExpression({ listening: 0.75, pleasant: 0.25 });
      this.restPose = 'clasp';
      this.lean.target = 2.2;
      this.tilt.target = rand(3, 5) * (Math.random() < 0.5 ? -1 : 1);
      this.look('visitor');
    } else if (mode === 'thinking') {
      this.setExpression({ thinking: 0.8, pleasant: 0.2 });
      this.restPose = 'clasp';
      this.lean.target = 0.5;
      this.tilt.target = rand(-2, 2);
      this.look('away', { up: true });
      this.addNod(-2);
    } else if (mode === 'speaking') {
      this.setExpression({ pleasant: 0.65, interested: 0.35 });
      this.restPose = 'ready';
      this.lean.target = 1.5;
      this.tilt.target = 0;
      this.look('visitor');
    }
    if (prev !== mode || snap) for (const s of ['l', 'r']) this.arms[s].setPose(ARM_POSES[this.restPose], { speed: mode === 'speaking' ? 1.1 : 0.7 });
    if (snap) { for (const s of ['l', 'r']) this.arms[s].snap(); for (const [k, w] of Object.entries(this.exprWeights)) w.snap(this.expression[k] ?? 0); }
  }

  setExpression(mix) {
    this.expression = mix;
    for (const [k, s] of Object.entries(this.exprWeights)) s.target = mix[k] ?? 0;
  }

  /** Aim the eyes (and, a beat later, the head): 'visitor', 'page', 'away', or a world point. */
  look(where, { up = false, hold = 0 } = {}) {
    this.gazeKind = typeof where === 'string' ? where : 'point';
    if (where === 'visitor') this.gazeTarget.copy(this.visitor ?? new THREE.Vector3(0, 1.5, 3));
    else if (where === 'page') this.gazeTarget.copy(this.page ?? new THREE.Vector3(-2.5, 1.35, 1.6));
    else if (where === 'away') this.gazeTarget.set(rand(0.5, 1.2) * (Math.random() < 0.5 ? -1 : 1), up ? 2.25 : rand(1.3, 1.8), 2.4);
    else if (where === 'down') this.gazeTarget.set(rand(-0.2, 0.2), 0.9, 1.6);
    else if (where.isVector3) this.gazeTarget.copy(where);
    this.gazeHold = hold;
    // Big gaze shifts come with a blink more often than not.
    if (Math.random() < 0.55) this.triggerBlink(0.05);
  }

  /** Walk along the page's floor to x (metres), then turn to faceYaw (0 faces the visitor). */
  walkTo(x, faceYaw = 0) { this.walker.goTo(x, faceYaw); }
  /** Turn where she stands: 0 faces the visitor, negative turns toward screen left. */
  face(yaw) { this.walker.face(yaw); }
  get x() { return this.walker.x; }
  set x(v) { this.walker.x = v; }
  get walking() { return this.walker.walking; }
  /** Walking, turning or mid-step: arm gestures wait until she has both feet down. */
  get moving() { return this.walker.moving; }

  /** A nod: positive dips the head. */
  addNod(deg) { this.nod.velocity += deg * 22; }
  addShake(deg) { this.shake.velocity += deg * 18; }

  triggerBlink(delay = 0) { if (this.blink.t < 0) this.blink.timer = Math.min(this.blink.timer, delay); }

  /** Play a gesture now. With reduced motion, the face and head still respond; the arms rest. */
  gesture(name, opts = {}) {
    const armGesture = ['wave', 'present', 'open', 'beat', 'self', 'shrug', 'count'].includes(name);
    if (armGesture && this.walker.moving) return; // hands swing while walking; she gestures when she's settled
    if (this.reduced && armGesture) {
      if (name === 'wave') this.setExpression({ smile: 0.7, pleasant: 0.3 });
      if (name !== 'beat') this.addNod(2);
      return;
    }
    const now = this.time;
    const side = opts.side ?? 'r';
    const other = side === 'l' ? 'r' : 'l';
    const at = (dt, fn) => this.events.push({ t: now + dt, fn });
    const rest = () => { for (const s of ['l', 'r']) this.arms[s].setPose(ARM_POSES[this.restPose], { speed: 0.8 }); };
    switch (name) {
      case 'wave': {
        this.arms[side].setPose(ARM_POSES.wave, { speed: 1.2 });
        this.setExpression({ smile: 0.8, pleasant: 0.2 });
        this.addNod(-3);
        for (let i = 0; i < 4; i++) at(0.55 + i * 0.27, () => { this.arms[side].dev.velocity += (i % 2 ? -1 : 1) * 260; });
        at(1.9, rest);
        at(2.6, () => this.setExpression(this.mode === 'idle' ? { pleasant: 1 } : { pleasant: 0.7, interested: 0.3 }));
        break;
      }
      case 'present': { // an open palm toward the page, with the arm on the page's side
        const hand = opts.side ?? ((this.page?.x ?? -1) < 0 ? 'r' : 'l');
        this.arms[hand].setPose(ARM_POSES.present, { speed: 1.3 });
        this.torsoYaw.target = hand === 'r' ? -7 : 7;
        at(opts.hold ?? 1.6, () => { this.torsoYaw.target = 0; this.arms[hand].setPose(ARM_POSES[this.restPose], { speed: 0.8 }); });
        break;
      }
      case 'open':
        for (const s of ['l', 'r']) this.arms[s].setPose(ARM_POSES.open, { speed: 1.2 });
        at(opts.hold ?? 1.1, rest);
        break;
      case 'beat': {
        const arm = this.arms[side];
        arm.setPose(ARM_POSES.beat, { speed: 2.2, offset: new THREE.Vector3(rand(-0.03, 0.03) * arm.out, 0.02, 0) });
        at(0.2, () => arm.target.y.velocity -= 0.55);
        at(opts.hold ?? 0.65, () => arm.setPose(ARM_POSES[this.restPose], { speed: 1 }));
        break;
      }
      case 'self':
        this.arms[side].setPose(ARM_POSES.self, { speed: 1.2 });
        at(opts.hold ?? 1.1, () => this.arms[side].setPose(ARM_POSES[this.restPose], { speed: 0.9 }));
        break;
      case 'shrug':
        for (const s of ['l', 'r']) this.arms[s].setPose(ARM_POSES.shrug, { speed: 1.3 });
        this.shrug.target = 1; this.tilt.target = rand(4, 7) * (Math.random() < 0.5 ? -1 : 1);
        this.browPulse.velocity += 9;
        at(0.6, () => { this.shrug.target = 0; });
        at(opts.hold ?? 1.2, () => { rest(); this.tilt.target = 0; });
        break;
      case 'count':
        this.arms[side].setPose(ARM_POSES.count, { speed: 1.3 });
        this.arms[other].setPose(ARM_POSES.ready, { speed: 1 });
        at(opts.hold ?? 1.2, rest);
        break;
      case 'nod': this.addNod(opts.size ?? 5); break;
      case 'acknowledge':
        this.addNod(4); at(0.35, () => this.addNod(2.5));
        this.setExpression({ pleasant: 0.7, listening: 0.3 });
        break;
    }
  }

  /** Speak a timeline. `clock()` returns seconds into it (voice-driven or wall time). */
  say(timeline, clock) {
    this.setMode('speaking');
    this.inhale = 1;
    const plan = planGestures(timeline);
    this.speech = { timeline, clock, plan, next: 0, lastWord: -1 };
  }

  stopSpeaking() {
    if (!this.speech) return;
    this.speech = null;
    this.addNod(2.5);
    this.setExpression({ pleasant: 0.8, interested: 0.2 });
    this.look('visitor');
  }

  /** The pointer, as a world point on the plane in front of her, or null. */
  setCursor(point) { this.cursor = point; }

  // ---- Frame --------------------------------------------------------------------------------------

  update(dt, { visitor, page }) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    this.visitor = visitor; this.page = page;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].t <= this.time) { const e = this.events[i]; this.events.splice(i, 1); e.fn(); }
    }
    this.#behave(dt);
    this.#body(dt);
    this.actor.update(dt, null); // the GDK's corrective-joint pass; its own life layer stays off
    this.#face(dt);
  }

  #behave(dt) {
    // Walking: arms hang and swing, eyes on the way ahead with a glance at you now and then.
    const walking = this.walker.walking;
    if (walking !== this.wasWalking) {
      this.wasWalking = walking;
      if (walking) {
        for (const s of ['l', 'r']) this.arms[s].setPose(ARM_POSES.sides, { speed: 0.9 });
        this.torsoYaw.target = 0;
        this.gazeKind = 'walk';
        this.walkGlance = rand(1.5, 3);
      } else {
        for (const s of ['l', 'r']) this.arms[s].setPose(ARM_POSES[this.restPose], { speed: 0.7 });
        this.look('visitor');
      }
    }
    if (walking) {
      this.walkGlance -= dt;
      if (this.walkGlance <= 0) {
        this.walkGlance = rand(2.5, 4.5);
        if (this.gazeKind === 'walk') this.look('visitor', { hold: rand(0.7, 1.2) }); else this.gazeKind = 'walk';
      }
      if (this.gazeKind === 'walk' && this.loco) this.gazeTarget.copy(this.#eyes(_v2)).addScaledVector(this.loco.forward, 4).setY(1.2);
      if (this.gazeHold <= 0 && this.gazeKind === 'visitor' && this.walkGlance < 2) this.gazeKind = 'walk';
    }
    // Weight shifts and idle glances.
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.idleTimer = this.mode === 'idle' ? rand(5, 11) : rand(7, 14);
      this.sway.target = clamp(-Math.sign(this.sway.target || rand(-1, 1)) * rand(0.4, 1), -1, 1);
      if (this.mode === 'idle') {
        const r = Math.random();
        if (r < 0.3) this.look('page', { hold: rand(1.2, 2.5) });
        else if (r < 0.45) this.look('away');
        else this.look('visitor');
        if (Math.random() < 0.25 && !this.walker.walking) {
          this.restPose = this.restPose === 'clasp' ? 'sides' : 'clasp';
          for (const s of ['l', 'r']) this.arms[s].setPose(ARM_POSES[this.restPose], { speed: 0.5 });
        }
      }
    }
    // The cursor draws a glance when it moves near her (idle only).
    if (this.mode === 'idle' && this.cursor && this.gazeKind !== 'cursor' && Math.random() < dt * 0.6) {
      this.gazeTarget.copy(this.cursor); this.gazeKind = 'cursor'; this.gazeHold = rand(0.8, 1.6);
    }
    if (this.gazeHold > 0) {
      this.gazeHold -= dt;
      if (this.gazeHold <= 0 && this.gazeKind !== 'visitor' && this.mode !== 'thinking') this.look('visitor');
    }
    if (this.gazeKind === 'visitor' && this.visitor) this.gazeTarget.lerp(this.visitor, 1 - Math.exp(-dt * 6));

    // Thinking: glance back now and then, so the wait feels attended.
    if (this.mode === 'thinking') {
      this.awayTimer -= dt;
      if (this.awayTimer <= 0) {
        this.awayTimer = rand(1.4, 2.6);
        if (this.gazeKind === 'visitor') this.look('away', { up: Math.random() < 0.6 });
        else { this.look('visitor', { hold: 0 }); this.addNod(1.5); }
      }
    }

    // Listening: small acknowledgement nods.
    if (this.mode === 'listening' && Math.random() < dt * 0.35) this.addNod(rand(1.5, 3));

    // Speech: follow the timeline's clock.
    const sp = this.speech;
    if (sp) {
      const now = sp.clock();
      while (sp.next < sp.plan.length && sp.plan[sp.next].t <= now) {
        this.#cue(sp.plan[sp.next]);
        sp.next++;
      }
      if (now > sp.timeline.duration + 0.15) this.stopSpeaking();
    }

    // Breathing: about 13 breaths a minute at rest; a quick inhale before speaking.
    const rate = this.mode === 'speaking' ? 1 / 3.6 : 1 / 4.6;
    this.breath += dt * rate * Math.PI * 2;
    this.inhale = Math.max(0, this.inhale - dt * 1.6);
  }

  #cue(c) {
    switch (c.type) {
      case 'gesture': this.gesture(c.name, c); break;
      case 'nod': this.addNod(c.size); break;
      case 'brow': this.browPulse.velocity += c.size * 14; break;
      case 'tilt': this.tilt.target = c.deg; break;
      case 'look': this.look(c.where, { hold: c.hold ?? 0, up: c.up }); break;
      case 'blink': this.triggerBlink(0); break;
      case 'expression': this.setExpression(c.mix); break;
      case 'inhale': this.inhale = 1; break;
    }
  }

  #body(dt) {
    const rig = this.rig;
    const t = this.time;
    rig.reset(this.torsoBones);
    rig.reset(this.armBones);
    rig.reset(this.legBones);

    const loco = this.walker.update(dt);
    this.loco = loco;
    const walk = loco.walk;
    const breath = Math.sin(this.breath) * 0.5 + 0.5 + this.inhale * 0.6;
    const sway = this.sway.step(dt) * (1 - walk);
    const lean = this.lean.step(dt);
    const tilt = this.tilt.step(dt);
    const nod = this.nod.step(dt);
    const shake = this.shake.step(dt);
    const shrug = this.shrug.step(dt);
    const torsoYaw = this.torsoYaw.step(dt);
    const drift = (s, f) => noise(t * f, s);

    // Heading, then the hips: weight over one leg when standing; lowered, bobbing and swaying
    // over the stance foot when walking. The legs reach the floor by IK from wherever the hips are.
    rig.euler('root', 0, loco.yaw / DEG, 0);
    const pelvis = rig.get('pelvis');
    const hips = pelvis.bindPos.clone().add(loco.pelvis).addScaledVector(loco.side, sway * 0.018);
    pelvis.bone.parent.updateWorldMatrix(true, false);
    pelvis.bone.position.copy(pelvis.bone.parent.worldToLocal(hips));
    rig.euler('pelvis', 0, drift(1, 0.07) * 1.2 * (1 - walk) + torsoYaw * 0.15 - loco.stride * 5 * walk, sway * 2.2 + loco.hipDrop);
    this.legs.l.solve(rig); this.legs.r.solve(rig);

    // The spine counters the hips (and, walking, their swing) and carries posture, breath and lean.
    const spineRoll = -sway * 1.1 - loco.hipDrop * 0.5;
    const counter = loco.stride * 6 * walk;
    rig.euler('spine_01', lean * 0.2 + walk * 3, torsoYaw * 0.12 + counter * 0.15, spineRoll * 0.5 + drift(2, 0.11) * 0.25);
    rig.euler('spine_02', lean * 0.25, torsoYaw * 0.18 + counter * 0.2, spineRoll * 0.4);
    rig.euler('spine_03', lean * 0.25 - breath * 0.9, torsoYaw * 0.22 + counter * 0.25 + drift(3, 0.09) * 0.6, spineRoll * 0.3 + drift(4, 0.13) * 0.3);
    rig.euler('spine_04', lean * 0.15 - breath * 0.7, torsoYaw * 0.22 + counter * 0.25, spineRoll * 0.2);
    rig.euler('spine_05', -breath * 0.5, torsoYaw * 0.16 + counter * 0.15, 0);
    // Shoulders rise a touch with each breath, and on a shrug.
    for (const s of ['l', 'r']) rig.euler(`clavicle_${s}`, 0, 0, (breath * 1.1 + shrug * 7) * (s === 'l' ? 1 : -1));

    // Head and neck follow the gaze target a beat behind the eyes, relative to where the
    // shoulders face, so she can look at you while walking past.
    const chestFwd = Z.clone().applyQuaternion(rig.worldRot('spine_05', new THREE.Quaternion()).multiply(rig.get('spine_05').bindRotInv));
    const torsoFacing = Math.atan2(chestFwd.x, chestFwd.z);
    const eyeMid = this.#eyes(_v1);
    const toTarget = _v4.copy(this.gazeTarget).sub(eyeMid);
    const yawTo = wrap(Math.atan2(toTarget.x, toTarget.z) - torsoFacing) / DEG;
    const pitchTo = Math.atan2(toTarget.y, Math.hypot(toTarget.x, toTarget.z)) / DEG;
    const headShare = this.gazeKind === 'cursor' ? 0.4 : this.gazeKind === 'away' ? 0.5 : 0.7;
    this.headYaw.target = clamp(yawTo * headShare, -55, 55);
    this.headPitch.target = clamp(pitchTo * headShare, -22, 18);
    const hy = this.headYaw.step(dt) + drift(5, 0.17) * 1.2 + shake - counter * 0.5;
    const hp = this.headPitch.step(dt) + drift(6, 0.15) * 0.9;
    const speakingBob = this.speech ? drift(7, 1.3) * 0.8 : 0;
    const roll = tilt + drift(8, 0.1) * 1.2 - loco.hipDrop * 0.3;
    // Positive pitch tips the head down: nods are positive, looking up is negative.
    rig.euler('neck_01', -hp * 0.3 + nod * 0.3, hy * 0.3, roll * 0.3);
    rig.euler('neck_02', -hp * 0.3 + nod * 0.3, hy * 0.3, roll * 0.3);
    rig.euler('head', -hp * 0.4 + nod * 0.4 + speakingBob, hy * 0.4, roll * 0.4);

    // Arms: targets follow the upper body as it sways and turns, and swing against the legs.
    const chest = rig.get('spine_03');
    // Bind-space hand targets ride the chest: its rotation and wherever the hips have carried it.
    const torso = {
      pivot: chest.bindPos,
      at: rig.worldPos('spine_03', new THREE.Vector3()),
      rot: rig.worldRot('spine_03', new THREE.Quaternion()).multiply(chest.bindRotInv),
    };
    for (const s of ['l', 'r']) {
      const swing = loco.stride * walk * (s === 'l' ? -1 : 1);
      this.arms[s].update(dt, torso, new THREE.Vector3(0, breath * 0.004 + Math.max(0, swing) * 0.035, breath * 0.002 + swing * 0.17));
    }
  }

  #eyes(out) {
    if (this.rig.has('FACIAL_L_Eye')) return this.rig.worldPos('FACIAL_L_Eye', out).add(this.rig.worldPos('FACIAL_R_Eye', _v2)).multiplyScalar(0.5);
    return this.rig.worldPos('head', out).add(_v2.set(0, 0.07, 0.085));
  }

  #face(dt) {
    const t = this.time;
    const out = {};
    for (const n of FACE_CHANNELS) out[n] = 0;

    // Expression mix.
    let total = 0;
    for (const [k, s] of Object.entries(this.exprWeights)) total += Math.max(0, s.step(dt));
    for (const [k, s] of Object.entries(this.exprWeights)) {
      const w = Math.max(0, s.value) / Math.max(1, total);
      if (!w) continue;
      for (const [m, v] of Object.entries(EXPRESSIONS[k])) out[m] += v * w;
    }
    // Brows lift on emphasis.
    const pulse = Math.max(0, this.browPulse.step(dt));
    out.browInnerUp += pulse * 0.025; out.browOuterUpLeft += pulse * 0.03; out.browOuterUpRight += pulse * 0.028;

    // Mouth: the speech timeline's shape, blended toward the next one just before it starts.
    const sp = this.speech;
    if (sp) {
      const now = sp.clock();
      const { shape, next, toNext, word } = shapeAt(sp.timeline, now);
      const a = this.visemes[shape] ?? {};
      const b = this.visemes[next] ?? {};
      const mix = toNext < 0.07 ? (1 - toNext / 0.07) * 0.55 : 0;
      const stress = word?.stressed ? 1.12 : 0.9;
      const openness = (0.95 + noise(t * 3.1, 9) * 0.12) * stress;
      for (const m of this.mouthChannels) {
        const v = (a[m] ?? 0) * (1 - mix) + (b[m] ?? 0) * mix;
        out[m] = (out[m] ?? 0) * 0.5 + v * openness;
      }
      // Smiles soften while the mouth works.
      out.mouthSmileLeft *= 0.75; out.mouthSmileRight *= 0.75;
    }

    // Eyes: aim from the head toward the gaze target, plus micro-saccades.
    this.microTimer -= dt;
    if (this.microTimer <= 0) {
      this.microTimer = rand(0.35, 1.4);
      const amp = this.gazeKind === 'visitor' ? 1.6 : 2.5;
      this.micro.set(rand(-amp, amp), rand(-amp * 0.6, amp * 0.6));
    }
    const headRot = this.rig.worldRot('head', _q1).multiply(this.rig.get('head').bindRotInv);
    const eyes = this.#eyes(_v1);
    const dir = _v3.copy(this.gazeTarget).sub(eyes).applyQuaternion(headRot.invert());
    let yaw = Math.atan2(dir.x, dir.z) / DEG + this.micro.x;
    let pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) / DEG + this.micro.y;
    yaw = clamp(yaw, -32, 32); pitch = clamp(pitch, -24, 22);
    const k = 1 - Math.exp(-dt * 28); // saccades are fast
    this.eyeYaw += (yaw - this.eyeYaw) * k;
    this.eyePitch += (pitch - this.eyePitch) * k;
    const H = 33, V = 27;
    out.eyeLookOutLeft = Math.max(0, this.eyeYaw) / H; out.eyeLookInRight = Math.max(0, this.eyeYaw) / H;
    out.eyeLookInLeft = Math.max(0, -this.eyeYaw) / H; out.eyeLookOutRight = Math.max(0, -this.eyeYaw) / H;
    out.eyeLookUpLeft = out.eyeLookUpRight = Math.max(0, this.eyePitch) / V;
    out.eyeLookDownLeft = out.eyeLookDownRight = Math.max(0, -this.eyePitch) / V;

    // Blinks: every few seconds, more often while talking; sometimes a double.
    const b = this.blink;
    if (b.t < 0) {
      b.timer -= dt;
      if (b.timer <= 0) { b.t = 0; b.double = Math.random() < 0.12; }
    }
    let blink = 0;
    if (b.t >= 0) {
      b.t += dt;
      const CLOSE = 0.075, HOLD = 0.035, OPEN = 0.16;
      if (b.t < CLOSE) blink = b.t / CLOSE;
      else if (b.t < CLOSE + HOLD) blink = 1;
      else if (b.t < CLOSE + HOLD + OPEN) blink = 1 - (b.t - CLOSE - HOLD) / OPEN;
      else {
        b.t = -1;
        b.timer = b.double ? 0.16 : this.speech ? rand(1.6, 3.8) : rand(2.2, 5.5);
        b.double = false;
      }
      blink = blink * blink * (3 - 2 * blink);
    }
    out.eyeBlinkLeft = Math.max(out.eyeBlinkLeft, blink);
    out.eyeBlinkRight = Math.max(out.eyeBlinkRight, blink * 0.97);
    // Looking down lowers the lids a little more.
    out.eyeBlinkLeft = Math.max(out.eyeBlinkLeft, Math.max(0, -this.eyePitch) / 90);
    out.eyeBlinkRight = Math.max(out.eyeBlinkRight, Math.max(0, -this.eyePitch) / 90);

    for (const n of FACE_CHANNELS) {
      const s = this.faceSprings[n];
      s.target = clamp(out[n], 0, 1);
      // Lids and gaze are set directly: springs would smear blinks and saccades.
      const v = n.startsWith('eyeBlink') || n.startsWith('eyeLook') ? s.target : s.step(dt);
      if (n.startsWith('eyeBlink') || n.startsWith('eyeLook')) s.snap(v);
      this.actor.setMorph(n, v);
    }
  }
}

// ---- Turning a reply into body language --------------------------------------------------------

const UNSURE = /\b(not sure|depends|maybe|might|probably|unfortunately|can't|cannot|don't know)\b/i;
const SELF = /^(i|i'm|i'd|i'll|we|we're|we'll|our|my)$/i;
const GREETING = /^(hi|hello|hey|welcome|sure|great|absolutely|of course|good question)\b/i;

/** Gesture, nod and gaze cues for a timeline, in timeline seconds. */
export function planGestures(timeline) {
  const plan = [];
  const words = timeline.words;
  let lastGesture = -10;
  let hand = 'r';
  const sentences = [];
  for (const w of words) (sentences[w.sentence] ??= []).push(w);

  sentences.forEach((sentence, si) => {
    if (!sentence?.length) return;
    const first = sentence[0];
    const text = sentence.map((w) => w.text).join(' ');
    // Speakers often look away as they plan a new sentence, then come back.
    if (si > 0 && Math.random() < 0.55) {
      plan.push({ t: first.start - 0.25, type: 'look', where: 'away', up: Math.random() < 0.5 });
      plan.push({ t: first.start + rand(0.45, 0.9), type: 'look', where: 'visitor' });
    }
    if (si > 0) plan.push({ t: first.start - 0.3, type: 'inhale' });
    if (si === 0 && GREETING.test(text)) {
      plan.push({ t: first.start, type: 'nod', size: 3.5 });
      plan.push({ t: first.start, type: 'expression', mix: { smile: 0.55, pleasant: 0.45 } });
      plan.push({ t: first.start + 1.4, type: 'expression', mix: { pleasant: 0.65, interested: 0.35 } });
    }
    const ref = sentence.find((w) => w.ref);
    if (ref) {
      plan.push({ t: ref.start - 0.35, type: 'look', where: 'page', hold: 1.3 });
      plan.push({ t: ref.start - 0.25, type: 'gesture', name: 'present', hold: 1.8 });
      lastGesture = ref.start + 1.2;
    } else if (UNSURE.test(text) && first.start - lastGesture > 1.2) {
      const w = sentence.find((x) => UNSURE.test(x.text)) ?? first;
      plan.push({ t: w.start - 0.15, type: 'gesture', name: 'shrug', hold: 1.1 });
      plan.push({ t: w.start, type: 'expression', mix: { concerned: 0.5, pleasant: 0.5 } });
      plan.push({ t: sentence.at(-1).end, type: 'expression', mix: { pleasant: 0.65, interested: 0.35 } });
      lastGesture = w.start + 1;
    } else if (SELF.test(first.text.replace(/[^\w']/g, '')) && Math.random() < 0.5 && first.start - lastGesture > 1) {
      plan.push({ t: first.start - 0.1, type: 'gesture', name: 'self', side: 'l', hold: 0.9 });
      lastGesture = first.start + 0.8;
    } else if (sentence.length > 6 && Math.random() < 0.45 && first.start - lastGesture > 1.5) {
      plan.push({ t: first.start + 0.1, type: 'gesture', name: 'open', hold: 1.0 });
      lastGesture = first.start + 1.0;
    }
    // Beats on the stressed words, not too many, alternating hands now and then.
    let beats = 0;
    for (const w of sentence) {
      if (!w.stressed) continue;
      if (w.emphatic || (w.start - lastGesture > 1.1 && Math.random() < 0.4)) {
        if (w.start - lastGesture > 0.75 && beats < 2) {
          plan.push({ t: w.start - 0.18, type: 'gesture', name: 'beat', side: hand, hold: 0.6 });
          if (Math.random() < 0.35) hand = hand === 'r' ? 'l' : 'r';
          lastGesture = w.start; beats++;
        }
        plan.push({ t: w.start, type: 'nod', size: w.emphatic ? 2.6 : 1.4 });
        if (w.emphatic) plan.push({ t: w.start - 0.05, type: 'brow', size: 1 });
      } else if (Math.random() < 0.25) plan.push({ t: w.start, type: 'nod', size: 1 });
    }
    const last = sentence.at(-1);
    if (last.question) {
      plan.push({ t: last.start, type: 'tilt', deg: rand(4, 7) * (Math.random() < 0.5 ? -1 : 1) });
      plan.push({ t: last.start, type: 'brow', size: 1.4 });
      plan.push({ t: last.end + 0.9, type: 'tilt', deg: 0 });
    } else {
      plan.push({ t: last.end - 0.1, type: 'nod', size: 2 });
    }
    if (Math.random() < 0.6) plan.push({ t: last.end + 0.05, type: 'blink' });
  });
  return plan.sort((a, b) => a.t - b.t);
}

export { ARM_POSES, HAND_SHAPES, Spring };
