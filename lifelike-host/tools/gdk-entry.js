// The parts of the Bitmagic GDK's MetaHuman toolkit this page uses, as one module.
// tools/build-gdk.mjs compiles it into vendor/bitmagic-metahuman.js.
export { MetaHumanActor } from 'gdk/MetaHumanActor.ts';
export {
  upgradeMetaHumanMaterials, classifyMaterial,
  DEFAULT_HAIR, DEFAULT_BROWS, DEFAULT_METAHUMAN_MATERIAL_OPTIONS,
} from 'gdk/MetaHumanMaterials.ts';
export { VISEMES } from 'gdk/MetaHumanSpeech.ts';
export { isWebGpuActive, setWebGpuActive } from './renderer-type.js';
