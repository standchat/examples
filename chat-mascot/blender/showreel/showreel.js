// Records Gilly's performances, frame by frame, from the same engine the page
// uses, so the AR model moves exactly like the one in the corner. Each segment
// starts from the same neutral pose and eases back to it, so segments loop and
// chain seamlessly on the USDZ's single timeline.

import * as THREE from 'three';
import { Mascot } from '../../mascot.js';
import { Director, idleScripts, chatScripts, stateLoops } from '../../behaviors.js';
import { mouthAt } from '../../voice.js';

const FPS = 30;
const FADE = 0.5; // seconds eased back to neutral at the end of each segment
const LINE = "Oh, hello there! The otters have breakfast at half past ten, and the jellies glow all day long.";

let talking = false;

const SEGMENTS = [
  { name: 'idle', dur: 6, loop: true, run: async (g, tk) => {
    await g.wait(2.4, tk);
    g.look(g.around(0.9, 0.25));
    await g.wait(1.3, tk);
    g.look('viewer');
    await g.wait(10, tk);
  } },
  { name: 'wave', dur: 2.6, run: chatScripts.wave },
  { name: 'talk', dur: 5, loop: true, run: (g, tk) => { talking = true; return stateLoops.talking(g, tk); } },
  { name: 'listen', dur: 3.6, loop: true, run: (g, tk) => stateLoops.listening(g, tk, {}) },
  { name: 'think', dur: 4, loop: true, run: stateLoops.thinking },
  { name: 'happy', dur: 2.2, run: chatScripts.happy },
  { name: 'sorry', dur: 2.8, run: chatScripts.sorry },
  { name: 'sigh', dur: 6.6, run: idleScripts.sigh },
  { name: 'yawn', dur: 5.4, run: idleScripts.yawn },
  { name: 'look', dur: 4.6, run: idleScripts.glance },
  { name: 'flip', dur: 3.3, run: idleScripts.somersault },
];

// Deterministic "randomness", so the recording is repeatable.
let seed = 7;
Math.random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const log = document.getElementById('log');
const m = await Mascot.load({
  host: document.getElementById('stage'),
  url: new URL('../../gilly.glb', import.meta.url).href,
  layout: { worldHeight: 0.6, homeX: 0, floorY: 0, roam: 0.05 },
});
m.renderer.setAnimationLoop(null); // We step time ourselves.
const director = new Director(m);
const g = director.g;
m.on((type) => {
  if (type !== 'tick') return;
  if (talking) m.setMouth(Object.fromEntries(['Open', 'Wide', 'Round'].map((k, i) => [k, mouthAt(LINE, Math.floor(m.time * 14.5) % LINE.length, m.time * 1000)[i]])));
});

const armature = m.rig.root;
const boneNames = Object.keys(m.rig.bones);
const mouth = m.mouth;
const frames = [];
const segments = [];
// Let scripts whose waits just ended run (microtasks aren't throttled in background tabs).
const settle = async () => {
  for (let i = 0; i < 12; i++) await null;
};
const inv = new THREE.Matrix4();
const mat = new THREE.Matrix4();
const p = new THREE.Vector3();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();

function neutral() {
  g.interrupt();
  talking = false;
  m.action.release(null, 0);
  m.gesture.release(null, 0);
  g.stance('float', 0);
  g.mood('content', 0);
  g.look('viewer');
  m.tailWag.set(1, 0);
  m.bob.set(1, 0);
  m.gills.wave.set(1, 0);
  m.breath.rate = 0.28;
  g.move({ x: 0, yaw: 0, pitch: 0, roll: 0 });
  m.root.pitch.freq = 2;
  m.resetMotion();
}

function capture() {
  armature.updateMatrixWorld(true);
  inv.copy(armature.matrixWorld).invert();
  const bones = boneNames.map((n) => {
    mat.multiplyMatrices(inv, m.rig.bones[n].bone.matrixWorld);
    mat.decompose(p, q, s);
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z];
  });
  armature.matrixWorld.decompose(p, q, s);
  const root = [p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z];
  const morphs = [...(mouth.morphTargetInfluences ?? [])];
  return { root, bones, morphs };
}

// Blend the tail of a segment back into its first frame.
function fadeToStart(start, end) {
  const n = Math.round(FADE * FPS);
  const first = frames[start];
  const blend = (a, b, t) => {
    const out = a.slice();
    for (const i of [0, 1, 2, 7, 8, 9]) out[i] = a[i] + (b[i] - a[i]) * t;
    const qa = new THREE.Quaternion(a[3], a[4], a[5], a[6]);
    const qb = new THREE.Quaternion(b[3], b[4], b[5], b[6]);
    qa.slerp(qb, t);
    [out[3], out[4], out[5], out[6]] = [qa.x, qa.y, qa.z, qa.w];
    return out;
  };
  for (let k = 0; k < n; k++) {
    const i = end - n + k;
    const t = (k + 1) / n;
    const w = t * t * (3 - 2 * t);
    const f = frames[i];
    f.root = blend(f.root, first.root, w);
    f.bones = f.bones.map((b, j) => blend(b, first.bones[j], w));
    f.morphs = f.morphs.map((v, j) => v + (first.morphs[j] - v) * w);
  }
}

// The rest pose, so Blender can match its bone frames to these.
function captureRest() {
  for (const b of Object.values(m.rig.bones)) {
    b.bone.quaternion.copy(b.restQ);
    b.bone.position.copy(b.restP);
    b.bone.scale.copy(b.restS);
  }
  m.holder.position.set(0, 0, 0);
  m.holder.rotation.set(0, 0, 0);
  m.body.scale.set(1, 1, 1);
  m.scene.updateMatrixWorld(true);
  return capture().bones;
}
const rest = captureRest();

for (const seg of SEGMENTS) {
  neutral();
  const start = frames.length;
  const tk = g.token;
  seg.run(g, tk).catch(() => {});
  await settle();
  const count = Math.round(seg.dur * FPS);
  for (let i = 0; i < count; i++) {
    frames.push(capture());
    m.update(1 / FPS);
    await settle();
  }
  fadeToStart(start, frames.length);
  segments.push({ name: seg.name, start: start / FPS, end: frames.length / FPS, loop: Boolean(seg.loop) });
  log.textContent = `Recorded ${segments.map((x) => x.name).join(', ')}`;
}
g.interrupt();
m.renderer.render(m.scene, m.camera);

const round = (a) => a.map((v) => Math.round(v * 1e5) / 1e5);
const data = {
  fps: FPS,
  bones: boneNames,
  rest: rest.map(round),
  morphs: Object.keys(mouth.morphTargetDictionary ?? {}),
  segments,
  frames: frames.map((f) => ({ root: round(f.root), bones: f.bones.map(round), morphs: round(f.morphs) })),
};
const json = JSON.stringify(data);
const post = new URLSearchParams(location.search).get('post');
if (post) {
  await fetch(post, { method: 'POST', body: json });
  log.textContent += `\nSent ${(json.length / 1e6).toFixed(1)} MB to ${post}`;
} else {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: 'showreel.json' });
  a.click();
  log.textContent += `\nDownloaded showreel.json (${(json.length / 1e6).toFixed(1)} MB)`;
}
window.done = true;
