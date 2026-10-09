// Rename and regroup a UE 5.6 "cinematic" MetaHuman export (Ada) so the Bitmagic GDK's
// MetaHuman preparation steps, written for the 5.7 native export, can run on it:
//   - one skin per skinned mesh, all roots called "root" (the GDK merge keys joints by name)
//   - skins and mesh nodes named SKM_<id>_FaceMesh, SKM_<id>_BodyMesh and <id>_Outfits
//   - the three garments (shirt, slacks, shoes) as primitives of one <id>_Outfits mesh on one skin
//   - material names the GDK's classifier and weight transfer recognise
//   node adapt-ada.mjs in.glb out.glb [id=ada]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const [,, input, output, id = 'ada'] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const scene = root.listScenes()[0];

const skinned = root.listNodes().filter((n) => n.getSkin() && n.getMesh());
const role = (n) => {
  const name = n.getMesh().getName().toLowerCase();
  if (name.includes('facemesh')) return 'face';
  if (/_body_lod0$/.test(name) || /_body$/.test(name)) return 'body';
  if (name.includes('shirt') || name.includes('top_')) return 'shirt';
  if (name.includes('slacks') || name.includes('btm_')) return 'slacks';
  if (name.includes('shs_') || name.includes('shoe')) return 'shoes';
  throw new Error(`unknown skinned mesh ${n.getMesh().getName()}`);
};
const byRole = Object.fromEntries(skinned.map((n) => [role(n), n]));
for (const r of ['face', 'body', 'shirt', 'slacks', 'shoes']) if (!byRole[r]) throw new Error(`missing ${r}`);

// The top-level group above a node (the export's 0.01-scaled per-mesh group).
const parentOf = (n) => n.listParents().find((p) => p.propertyType === 'Node') ?? null;
const topGroup = (n) => { let g = n; while (parentOf(g)) g = parentOf(g); return g; };

// 5.6 parks each skinned mesh node under its own root joint. The GDK merge detaches the duplicate
// roots, which would take the meshes with them: hang each mesh node off its top group instead
// (the root joint has an identity transform, so nothing moves).
for (const n of skinned) {
  const p = parentOf(n); const g = topGroup(n);
  if (p !== g) { p.removeChild(n); g.addChild(n); }
}

// Every hierarchy's root joint is "root" again.
for (const node of root.listNodes()) if (/^root\.\d+$/.test(node.getName())) node.setName('root');

// Names the GDK steps look for.
const name = (n, mesh, group) => {
  n.setName(mesh); n.getMesh().setName(mesh); n.getSkin().setName(mesh); topGroup(n).setName(group ?? mesh);
};
// The 5.6 skins start at the pelvis; the GDK merge walks from a "root" joint, so list it too
// (appended: existing joint indices stay valid). Its inverse bind follows from the pelvis's:
// IBM_root = local(pelvis) · IBM_pelvis. No vertex is weighted to it.
const mat4 = (n) => { const m = new Float32Array(16); const [t, r, s] = [n.getTranslation(), n.getRotation(), n.getScale()];
  const [x, y, z, w] = r; const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  m.set([(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]); return m; };
const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = v; } return o; };
for (const node of skinned) {
  const skin = node.getSkin();
  const joints = skin.listJoints();
  if (joints.some((j) => j.getName() === 'root')) continue;
  const pelvisIndex = joints.findIndex((j) => j.getName() === 'pelvis');
  const pelvis = joints[pelvisIndex];
  const rootJoint = parentOf(pelvis);
  if (!rootJoint || rootJoint.getName() !== 'root') throw new Error(`pelvis parent is ${rootJoint?.getName()}`);
  const acc = skin.getInverseBindMatrices();
  const ibmPelvis = new Float32Array(16); acc.getElement(pelvisIndex, ibmPelvis);
  const ibmRoot = mul(mat4(pelvis), ibmPelvis);
  const arr = new Float32Array(acc.getArray().length + 16); arr.set(acc.getArray()); arr.set(ibmRoot, acc.getArray().length);
  acc.setArray(arr);
  skin.addJoint(rootJoint);
}

name(byRole.face, `SKM_${id}_FaceMesh`);
name(byRole.body, `SKM_${id}_BodyMesh`);

// Joints only a garment carries (the shirt's collar correctives) move into the body hierarchy, under
// the same-named parent, so the GDK merge grafts them like any other body joint.
{
  const bodyRootJoint = byRole.body.getSkin().listJoints().find((j) => j.getName() === 'root');
  const bodyByName = new Map(); const index = (n) => { bodyByName.set(n.getName(), n); n.listChildren().forEach(index); }; index(bodyRootJoint);
  for (const r of ['shirt', 'slacks', 'shoes']) {
    for (const j of byRole[r].getSkin().listJoints()) {
      if (bodyByName.has(j.getName())) continue;
      const p = parentOf(j);
      const target = p && bodyByName.get(p.getName());
      if (!target) continue; // a descendant of an already moved joint
      p.removeChild(j); target.addChild(j); index(j);
      console.log(`moved ${r} joint ${j.getName()} under body ${target.getName()}`);
    }
  }
}

// Garments: one mesh, one skin. The shirt's skin is the superset (it adds collar correctives).
const outfit = byRole.shirt;
const outSkin = outfit.getSkin();
const outJoints = outSkin.listJoints();
const outIndex = new Map(outJoints.map((j, i) => [j.getName(), i]));
const ibm = outSkin.getInverseBindMatrices();
for (const r of ['slacks', 'shoes']) {
  const node = byRole[r];
  const skin = node.getSkin();
  const joints = skin.listJoints();
  const missing = joints.filter((j) => !outIndex.has(j.getName()));
  if (missing.length) throw new Error(`${r} uses joints the shirt skin lacks: ${missing.map((j) => j.getName()).join(', ')}`);
  // Same bind pose? Compare the inverse bind matrices of shared joints.
  const a = new Float32Array(16), b = new Float32Array(16);
  let diff = 0;
  joints.forEach((j, i) => {
    skin.getInverseBindMatrices().getElement(i, a); ibm.getElement(outIndex.get(j.getName()), b);
    for (let k = 0; k < 16; k++) diff = Math.max(diff, Math.abs(a[k] - b[k]));
  });
  if (diff > 1e-3) console.warn(`WARNING: ${r} inverse bind matrices differ from the shirt's by ${diff}`);
  const remap = joints.map((j) => outIndex.get(j.getName()));
  for (const prim of node.getMesh().listPrimitives()) {
    const J = prim.getAttribute('JOINTS_0');
    const arr = J.getArray();
    const out = new Uint16Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = remap[arr[i]];
    J.setArray(out);
    node.getMesh().removePrimitive(prim);
    outfit.getMesh().addPrimitive(prim);
  }
  // Drop the garment's own group: its mesh node, skin and duplicate joint hierarchy.
  const group = topGroup(node);
  skin.dispose();
  node.getMesh().dispose();
  const subtree = []; const walk = (n) => { subtree.push(n); n.listChildren().forEach(walk); }; walk(group);
  for (const n of subtree.reverse()) n.dispose();
}
name(outfit, `${id}_Outfits`);

// Material names for the GDK classifier (MetaHumanMaterials) and weight transfer.
const MATERIALS = [
  [/facemesh_head_shader/, `MI_Face_Skin_Baked_${id}`],
  [/_body_mi_body/i, `MI_Body_Baked_${id}`],
  [/facemesh_eyeleft/i, `MI_EyeL_Baked_${id}`],
  [/facemesh_eyeright/i, `MI_EyeR_Baked_${id}`],
  [/facemesh_cartilage/i, `MI_Face_LacrimalFluid_${id}`],
  [/facemesh_eyeedge/i, `MI_Face_EyeEdge_${id}`],
  [/facemesh_saliva/i, `MI_Face_Saliva_${id}`],
  [/facemesh_eyeshell/i, `MI_Face_EyeShell_${id}`],
  [/facemesh_eyelashes/i, `${id}_LashMat`],
  [/facemesh_teeth/i, `MI_Teeth_Baked_${id}`],
  [/top_shirt/i, `MID_${id}_Shirt`],
  [/btm_slacks/i, `MID_${id}_Slacks`],
  [/shs_flats/i, `MID_${id}_Shoe`],
  [/^hair_.*cards/i, (n) => n.replace(/_(Cards_M|lambert\d+)$/i, '') + '_CardMat'],
  [/^eyebrows_.*cards/i, (n) => n.replace(/_(lambert\d+)$/i, '') + '_CardMat'],
];
for (const mat of root.listMaterials()) {
  const hit = MATERIALS.find(([re]) => re.test(mat.getName()));
  if (!hit) { console.warn('unclassified material', mat.getName()); continue; }
  const next = typeof hit[1] === 'function' ? hit[1](mat.getName()) : hit[1];
  console.log(`material ${mat.getName()} → ${next}`);
  mat.setName(next);
}

await doc.transform(prune());
console.log('scene:', scene.listChildren().map((n) => n.getName()).join(', '));
console.log('skins:', root.listSkins().map((s) => `${s.getName()}:${s.listJoints().length}`).join(' '));
await io.write(output, doc);
console.log('written', output);
