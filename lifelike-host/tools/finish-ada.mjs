// Last step after the GDK preparation: give the website character the textures a browser needs
// and compress it.
//   - garments: bake albedo from the export's masks + AO with our own colours (the export ships masks)
//   - eyes: bake the iris/sclera albedo the MetaHuman eye shader would compute (pole UV + iris mask)
//   - face/body: real roughness and cavity maps; teeth: gum/crown/depth shading as vertex colour
//   - drop rig-mask vertex colours, hidden helper meshes and textures the GDK loads separately
//   - WebP textures, sparse morph targets, meshopt
//   node finish-ada.mjs in.glb out.glb textureDir
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { prune, dedup, sparse, reorder, quantize, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { join } from 'node:path';

const [,, input, output, texDir] = process.argv;
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(input);
const root = doc.getRoot();
const tex = (name) => join(texDir, `${name}.png`);

const srgb = (lin) => (lin <= 0.0031308 ? 12.92 * lin : 1.055 * lin ** (1 / 2.4) - 0.055);
const lin = (hex) => [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const raw = async (file, size = 1024) => {
  const { data, info } = await sharp(file).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};
const png = async (rgb, w, h, channels = 3) => sharp(Buffer.from(rgb), { raw: { width: w, height: h, channels } }).png().toBuffer();
const setImage = (texture, buffer, name) => { texture.setImage(new Uint8Array(buffer)).setMimeType('image/png').setURI(`${name}.png`).setName(name); };
const newTexture = (buffer, name) => doc.createTexture(name).setImage(new Uint8Array(buffer)).setMimeType('image/png').setURI(`${name}.png`);
const material = (re) => root.listMaterials().find((m) => re.test(m.getName()));

// ---- Garments ---------------------------------------------------------------------------------
// Mask channels (measured): R = weave/heather variation around 0.5, G = trim (shirt placket,
// shoe sole), A = crease detail. AO is in R.
const GARMENTS = [
  { re: /_Shirt$/, mask: 'f_top_shirt_Mask', ao: 'f_top_shirt_AO', color: '#7f9bb6', trim: '#7891ab', rough: 0.82, aoAmount: 0.7, weave: 0.22 },
  { re: /_Slacks$/, mask: 'btm_slacks_Mask', ao: 'btm_slacks_AO', color: '#2c2e33', trim: '#2c2e33', rough: 0.86, aoAmount: 0.8, weave: 0.25 },
  { re: /_Shoe$/, mask: 'shs_flats_Mask', ao: 'shs_flats_AO', color: '#1d1714', trim: '#6b5d52', rough: 0.55, aoAmount: 0.8, weave: 0.35 },
];
for (const g of GARMENTS) {
  const mat = material(g.re);
  const m = await raw(tex(g.mask)); const a = await raw(tex(g.ao));
  const base = lin(g.color), trim = lin(g.trim);
  const out = new Uint8Array(m.w * m.h * 3);
  for (let i = 0; i < m.w * m.h; i++) {
    const r = m.data[i * 4] / 255, gch = m.data[i * 4 + 1] / 255, crease = m.data[i * 4 + 3] / 255;
    const ao = a.data[i * 4] / 255;
    const weave = 1 + (r - 0.5) * g.weave;
    const shade = weave * (1 - g.aoAmount + g.aoAmount * ao) * (0.92 + 0.08 * crease);
    for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.round(255 * clamp01(srgb((base[k] + (trim[k] - base[k]) * gch) * shade)));
  }
  setImage(mat.getBaseColorTexture(), await png(out, m.w, m.h), `${g.mask.replace('_Mask', '')}_BaseColor`);
  // Double-sided: the export removed the body under the clothes, so the placket slit would
  // show the page through her; this way it shows the inside of the shirt.
  mat.setRoughnessFactor(g.rough).setMetallicFactor(0).setDoubleSided(true);
  console.log(`baked ${mat.getName()} albedo`);
}

// ---- Eyes -------------------------------------------------------------------------------------
// The MetaHuman eye: the iris atlas is a mask, zoomed (uv_scale) around the eye mesh's pole UV;
// R = fibrils, B = limbus darkening; radial ramps separate iris, sclera and pupil.
const EYE = {
  iris: [0.176, 0.077, 0.045], irisDark: [0.036, 0.015, 0.0], sclera: [0.52, 0.48, 0.45], pupil: [0.005, 0.005, 0.005],
  vein: [0.62, 0.18, 0.15], veinsPower: 0.12, limbusStart: 0.095, irisIn: 0.131, irisOut: 0.146, pupilIn: 0.022, pupilOut: 0.046, uvScale: 4,
};
const irisMask = await raw(tex('T_Iris_A_M'));
const sampleIris = (u, v) => {
  const x = Math.min(irisMask.w - 1, Math.max(0, Math.round(u * (irisMask.w - 1))));
  const y = Math.min(irisMask.h - 1, Math.max(0, Math.round(v * (irisMask.h - 1))));
  const i = (y * irisMask.w + x) * 4; return [irisMask.data[i] / 255, irisMask.data[i + 1] / 255, irisMask.data[i + 2] / 255];
};
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const veinEdge = (px, py) => { // distance to the nearest cell border of a jittered grid
  const nx = Math.floor(px), ny = Math.floor(py); let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = nx + i + hash(nx + i, ny + j), cy = ny + j + hash(ny + j + 17.3, nx + i - 4.1);
    const d = Math.hypot(cx - px, cy - py); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return (d2 - d1) * 0.5;
};
const EYE_POLES = { L: [0.4883885513314857, 0.5037298562991204], R: [0.5087699054536939, 0.5042725668248146] };
for (const side of ['L', 'R']) {
  const mat = material(new RegExp(`MI_Eye${side}_`));
  const [pu, pv] = EYE_POLES[side];
  const S = 1024; const out = new Uint8Array(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const [ir, , ib] = sampleIris(0.5 + (u - pu) * EYE.uvScale, 0.5 + (v - pv) * EYE.uvScale);
    const fib = 0.65 + (1.15 - 0.65) * clamp01((ir - 0.25) / 0.5);
    const limbus = clamp01((ib - EYE.limbusStart) / (1 - EYE.limbusStart));
    const rd = Math.hypot(u - pu, v - pv);
    const outside = smooth(EYE.irisIn, EYE.irisOut, rd);
    const vein = clamp01((1 - smooth(0, 0.04, veinEdge(u * 35, v * 35))) * outside * EYE.veinsPower) * smooth(0.22, 0.36, rd);
    const pupil = 1 - smooth(EYE.pupilIn, EYE.pupilOut, rd);
    for (let k = 0; k < 3; k++) {
      const iris = EYE.iris[k] * fib + (EYE.irisDark[k] - EYE.iris[k] * fib) * limbus;
      // The sclera darkens slightly toward its rim, as in a real eye socket.
      const sclera = (EYE.sclera[k] + (EYE.vein[k] - EYE.sclera[k]) * vein) * (1 - 0.25 * smooth(0.2, 0.42, rd));
      const c = iris + (sclera - iris) * outside;
      out[(y * S + x) * 3 + k] = Math.round(255 * clamp01(srgb(c + (EYE.pupil[k] - c) * pupil)));
    }
  }
  const t = newTexture(await png(out, S, S), `Eye${side}_BaseColor`);
  mat.setBaseColorTexture(t).setRoughnessFactor(0.08);
  // The export zoomed its iris mask with KHR_texture_transform; the baked texture maps 1:1.
  mat.getBaseColorTextureInfo().setExtension('KHR_texture_transform', null);
  console.log(`baked eye ${side}`);
}

// ---- Face and body: roughness (G of metallicRoughness) and cavity as occlusion -----------------
const roughnessTexture = async (file, name, scale = 1) => {
  const r = await raw(tex(file)); const out = new Uint8Array(r.w * r.h * 3);
  for (let i = 0; i < r.w * r.h; i++) { out[i * 3] = 255; out[i * 3 + 1] = Math.round(clamp01((r.data[i * 4] / 255) * scale) * 255); out[i * 3 + 2] = 0; }
  return newTexture(await png(out, r.w, r.h), name);
};
const occlusionTexture = async (file, name) => {
  const r = await raw(tex(file)); const out = new Uint8Array(r.w * r.h * 3);
  for (let i = 0; i < r.w * r.h; i++) out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = r.data[i * 4];
  return newTexture(await png(out, r.w, r.h), name);
};
{
  const face = material(/MI_Face_Skin/);
  face.getMetallicRoughnessTexture()?.dispose();
  face.setMetallicRoughnessTexture(await roughnessTexture('FaceRoughness_MAIN', 'Face_Roughness', 0.66)).setRoughnessFactor(1).setMetallicFactor(0);
  face.setOcclusionTexture(await occlusionTexture('FaceCavity_MAIN', 'Face_Cavity')).setOcclusionStrength(0.4);
  const body = material(/MI_Body_Baked/);
  body.setRoughnessFactor(0.6).setMetallicFactor(0);
  body.setOcclusionTexture(await occlusionTexture('female_body_cavity_map', 'Body_Cavity')).setOcclusionStrength(0.6);
}

// ---- Teeth: no UVs in this export, so shade by geometry -------------------------------------
// The tongue is whatever the tongue joints carry. Crowns sit within ~9 mm of the bite line; above
// and below that is gum. Everything darkens toward the back of the mouth (the job of Unreal's
// mouth-occlusion texture).
{
  const faceNode = root.listNodes().find((n) => /FaceMesh$/.test(n.getMesh()?.getName() ?? '') && n.getSkin());
  const jointNames = faceNode.getSkin().listJoints().map((j) => j.getName());
  const teeth = faceNode.getMesh().listPrimitives().find((p) => /Teeth/.test(p.getMaterial()?.getName() ?? ''));
  const P = teeth.getAttribute('POSITION'), J = teeth.getAttribute('JOINTS_0'), Wt = teeth.getAttribute('WEIGHTS_0');
  const n = P.getCount(); const p = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  const ys = []; let zMax = -9;
  const tongue = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    P.getElement(i, p); J.getElement(i, j); Wt.getElement(i, w);
    for (let k = 0; k < 4; k++) if (/Tongue/.test(jointNames[j[k]] ?? '')) tongue[i] += w[k];
    if (tongue[i] < 0.5) { ys.push(p[1]); zMax = Math.max(zMax, p[2]); }
  }
  ys.sort((a, b) => a - b); const bite = ys[Math.floor(ys.length * 0.5)];
  const tooth = lin('#e6dccb'), gum = lin('#a8524f'), tongueColor = lin('#9a4a4c');
  const colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    P.getElement(i, p);
    const crown = 1 - smooth(0.0075, 0.0105, Math.abs(p[1] - bite));
    const depth = zMax - p[2];
    const occ = 0.08 + 0.92 * (1 - smooth(0.006, 0.05, depth));
    for (let k = 0; k < 3; k++) {
      const c = gum[k] + (tooth[k] - gum[k]) * crown;
      colors[i * 4 + k] = (c + (tongueColor[k] - c) * tongue[i]) * occ * (tongue[i] > 0.5 ? 0.7 : 1);
    }
    colors[i * 4 + 3] = 1;
  }
  teeth.getAttribute('COLOR_0').setArray(colors).setNormalized(false);
  teeth.getMaterial().setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.35);
  console.log(`teeth: bite line y=${bite.toFixed(4)}, front z=${zMax.toFixed(4)}, tongue vertices ${tongue.filter((t) => t > 0.5).length}`);
}

// ---- Geometry cleanup ---------------------------------------------------------------------------
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const name = prim.getMaterial()?.getName() ?? '';
    if (/Saliva|EyeEdge|LacrimalFluid/.test(name)) { mesh.removePrimitive(prim); prim.dispose(); continue; }
    if (!/Teeth/.test(name)) prim.getAttribute('COLOR_0')?.dispose();
    prim.getAttribute('COLOR_1')?.dispose();
  }
}
// The GDK's hair, brow and lash materials read their atlases from separate files.
for (const m of root.listMaterials()) {
  if (/CardMat$|LashMat$/.test(m.getName())) m.getBaseColorTexture()?.dispose();
}

// Morph target deltas are millimetres: normalized int16 positions (0.03 mm steps over ±1 m) and
// int8 normals keep every one of the 51 ARKit shapes at a third of the size.
{
  let n = 0;
  for (const prim of root.listMeshes().flatMap((m) => m.listPrimitives())) {
    for (const target of prim.listTargets()) {
      const P = target.getAttribute('POSITION');
      if (P && P.getComponentType() === 5126) {
        const a = P.getArray(); const q = new Int16Array(a.length);
        for (let i = 0; i < a.length; i++) q[i] = Math.round(Math.max(-1, Math.min(1, a[i])) * 32767);
        P.setArray(q).setNormalized(true); n++;
      }
      const N = target.getAttribute('NORMAL');
      if (N && N.getComponentType() === 5126) {
        const a = N.getArray(); const q = new Int8Array(a.length);
        for (let i = 0; i < a.length; i++) q[i] = Math.round(Math.max(-1, Math.min(1, a[i])) * 127);
        N.setArray(q).setNormalized(true);
      }
    }
  }
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  console.log(`quantized ${n} morph target position accessors`);
}

await doc.transform(
  // keepAttributes: the GDK's hair/brow/lash materials sample UVs no glTF texture references any more.
  prune({ keepAttributes: true }), dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [512, 512], slots: /./, pattern: /shs_flats|Body_Cavity/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [1024, 1024] }),
  sparse({ ratio: 1 / 3 }),
  // Positions stay float: the GDK reads bind poses from the skins' inverse bind matrices, which
  // position quantization rewrites (the hair cards then land on the chest). meshopt() would
  // quantize everything, so its three parts run here with our own pattern.
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize({ pattern: /^(NORMAL|TEXCOORD_\d+|JOINTS_\d+|WEIGHTS_\d+|COLOR_\d+)$/, patternTargets: /^$/, quantizeNormal: 10, quantizeTexcoord: 14 }),
  (document) => { document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE }); },
);
await io.write(output, doc);
console.log('written', output);
