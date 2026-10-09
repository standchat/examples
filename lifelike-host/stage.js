// The 3D stage: renderer, studio light, camera framing, and Ada herself, loaded and dressed by
// the Bitmagic GDK's MetaHuman toolkit (vendor/bitmagic-metahuman.js) and moved by performer.js.
import * as THREE from 'three';
import { WebGPURenderer, PMREMGenerator } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MetaHumanActor, DEFAULT_HAIR, DEFAULT_BROWS, VISEMES, setWebGpuActive } from './vendor/bitmagic-metahuman.js';
import { Performer, Spring } from './performer.js';

const asset = (name) => new URL(`assets/${name}`, import.meta.url).href;

// Shots, as the slice of her body that should fill the frame's height (metres above the floor).
export const SHOTS = {
  figure: { bottom: -0.08, top: 1.9, width: 1.2 },     // head to toe, with room for her hands
  close: { bottom: 1.33, top: 1.69, width: 0.26 },     // a tight face
};

export class Stage {
  constructor(container, { onReady } = {}) {
    this.container = container;
    this.onReady = onReady;
    this.shot = 'figure';
    this.frameBottom = new Spring(SHOTS.figure.bottom, 0.9, 1);
    this.frameTop = new Spring(SHOTS.figure.top, 0.9, 1);
    this.frameWidth = new Spring(SHOTS.figure.width, 0.9, 1);
    this.shiftX = new Spring(0, 0.9, 1);
    this.visible = true;
    this.running = false;
    this.page = new THREE.Vector3(-2.4, 1.35, 1.8);
    this.cursor = null;
  }

  async load() {
    const forceWebGL = new URLSearchParams(location.search).has('webgl');
    const renderer = new WebGPURenderer({ antialias: true, alpha: true, forceWebGL });
    await renderer.init();
    const webgpu = renderer.backend?.isWebGPUBackend === true;
    setWebGpuActive(webgpu); // the GDK's richer skin and hair shaders need WebGPU
    this.backend = webgpu ? 'webgpu' : 'webgl';
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    this.container.prepend(canvas);
    this.renderer = renderer;

    const scene = (this.scene = new THREE.Scene());
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.04);
    scene.environment = this.envTarget.texture;
    scene.environmentIntensity = 0.6;
    room.dispose(); pmrem.dispose();

    // Soft studio light: a warm key from the page side, a cool fill, two rims to lift her off
    // whatever the page behind is.
    // The GDK's skin shader adds subsurface scattering per direct light, so the rims stay modest.
    const key = new THREE.DirectionalLight(0xfff4ea, 2.3);
    key.position.set(-1.7, 2.6, 2.4);
    const fill = new THREE.DirectionalLight(0xe4ecff, 0.55);
    fill.position.set(2.2, 1.2, 2.0);
    const rimR = new THREE.DirectionalLight(0xffffff, 0.9);
    rimR.position.set(1.6, 2.3, -2.2);
    const rimL = new THREE.DirectionalLight(0xffffff, 0.5);
    rimL.position.set(-1.8, 2.0, -2.0);
    const bounce = new THREE.HemisphereLight(0xf6f2ec, 0x6f6a64, 0.25);
    for (const l of [key, fill, rimR, rimL]) l.target.position.set(0, 1.35, 0);
    scene.add(key, key.target, fill, fill.target, rimR, rimR.target, rimL, rimL.target, bounce);

    this.camera = new THREE.PerspectiveCamera(18, 1, 0.05, 30);

    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(asset('ada.glb'), (e) => this.onProgress?.(e.loaded / (e.total || 9.2e6)));
    const model = gltf.scene;
    scene.add(model);

    // The GDK's MetaHumanActor dresses the export: skin with subsurface scattering, hair and
    // brow cards from their attribute atlases, wet eyes, corrective joints. Its own idle life
    // (random blinks, saccades, head-look) stays off: the performer directs all of that.
    const actor = new MetaHumanActor({ scene, loader }, {
      url: '', yawOffset: 0,
      materials: {
        hairAtlasUrl: asset('hair.webp'), browAtlasUrl: asset('brows.webp'), lashCoverageUrl: asset('lashes.webp'),
        // Coily hair scatters light: rough, dark, little sheen.
        hair: { ...DEFAULT_HAIR, color: '#0f0a07', density: 6, roughness: 0.74, roughnessFloor: 0.72, anisotropy: 0.05, seedVariation: 0.28, blendOpacity: 0.18 },
        brows: { ...DEFAULT_BROWS, color: '#120c08' },
        sss: { color: '#ff6a4a', strength: 0.1, distortion: 0.25, power: 2.5, ambient: 0 },
        msaa: true,
      },
      life: { blink: false, saccades: false, breathing: false, lookAtCamera: false, maxHeadTurn: 0 },
    });
    actor.adopt(model, model);
    actor.setLifeEnabled(false);
    model.traverse((o) => {
      if (!o.isMesh) return;
      // The teeth carry baked gum, crown and mouth-depth shading as vertex colour.
      if (/Teeth/.test(o.material?.name)) { o.material.vertexColors = true; o.material.needsUpdate = true; }
      // Less shine on the coils than the GDK's straight-hair default.
      if (/CardMat/i.test(o.material?.name) && /hair/i.test(o.material.name)) o.material.specularIntensity = 0.12;
      // A thinner wet coat than the GDK's default: less glare off the eye whites at small sizes.
      if (/MI_Eye[LR]/.test(o.material?.name)) { o.material.clearcoat = 0.3; o.material.roughness = 0.15; o.material.envMapIntensity = 0.5; }
      // The export's translucent eye shell softens the eyes under the lids; keep it.
      if (/EyeShell/.test(o.material?.name)) { o.visible = true; o.renderOrder = 2; }
      o.castShadow = false; o.receiveShadow = false;
    });
    // The export removed her torso under the shirt, so hairline slits along the placket looked
    // straight through her. A shirt-coloured card inside the chest, riding the spine, closes them.
    const chest = model.getObjectByName('spine_04');
    if (chest) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.42), new THREE.MeshStandardMaterial({ color: 0x6f889f, roughness: 0.95, side: THREE.DoubleSide }));
      card.name = 'inner-shadow';
      card.position.set(0, 1.12, 0.02);
      model.add(card);
      model.updateMatrixWorld(true);
      chest.attach(card);
    }
    this.model = model;
    this.actor = actor;
    this.performer = new Performer({ model, actor, visemes: VISEMES });

    // A soft contact shadow, so she stands on the page instead of floating over it.
    const shade = document.createElement('canvas');
    shade.width = shade.height = 128;
    const g = shade.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.42)'); grad.addColorStop(0.45, 'rgba(0,0,0,0.2)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const shadowTexture = new THREE.CanvasTexture(shade);
    shadowTexture.colorSpace = THREE.SRGBColorSpace;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.42), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.shadow.renderOrder = -1;
    scene.add(this.shadow);

    this.#resize();
    new ResizeObserver(() => this.#resize()).observe(this.container);
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }).observe(this.container);
    // Compile before the first frame so she appears all at once.
    this.performer.update(1 / 60, { visitor: this.camera.position, page: this.page });
    if (renderer.compileAsync) await renderer.compileAsync(scene, this.camera);
    renderer.render(scene, this.camera);
    this.start();
    this.onReady?.();
  }

  setShot(name, { snap = false } = {}) {
    this.shot = name;
    const s = SHOTS[name];
    this.frameBottom.target = s.bottom; this.frameTop.target = s.top; this.frameWidth.target = s.width;
    if (snap) { this.frameBottom.snap(s.bottom); this.frameTop.snap(s.top); this.frameWidth.snap(s.width); }
  }

  /** Where the page sits relative to her, as a point in screen pixels (for her glances and gestures). */
  setPageAnchor(clientX, clientY) {
    const p = this.#unproject(clientX, clientY, 2.2);
    if (p) this.page.copy(p);
  }

  setCursor(clientX, clientY) {
    this.cursor = clientX == null ? null : this.#unproject(clientX, clientY, 1.6);
    this.performer?.setCursor(this.cursor);
  }

  /** Where a point of her world is on the screen, in client pixels. */
  project(point) {
    const r = this.container.getBoundingClientRect();
    const v = point.clone().project(this.camera);
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }

  /** The top of her head and the floor under her, on screen. */
  landmarks() {
    const head = this.performer.rig.worldPos('head', new THREE.Vector3());
    return {
      head: this.project(head.clone().add(new THREE.Vector3(0, 0.12, 0.04))),
      crown: this.project(head.clone().add(new THREE.Vector3(0, 0.25, 0))),
      chin: this.project(head.clone().add(new THREE.Vector3(0, -0.05, 0.08))),
      floor: this.project(new THREE.Vector3(0, 0, 0)),
    };
  }

  /** How many CSS pixels a metre is, for a given container height, in the figure shot. */
  static pxPerMetre(containerHeight) { return containerHeight / (SHOTS.figure.top - SHOTS.figure.bottom); }

  #unproject(clientX, clientY, depth) {
    if (!this.camera) return null;
    const r = this.container.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const ndc = new THREE.Vector3(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1, 0.5);
    const dir = ndc.unproject(this.camera).sub(this.camera.position).normalize();
    // Point on the plane `depth` metres in front of her (z = depth).
    const t = (depth - this.camera.position.z) / dir.z;
    return this.camera.position.clone().addScaledVector(dir, Math.max(0.5, t));
  }

  #resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = width / height;
    this.#frame();
  }

  // Keep the camera at her eye height and shift the lens, so framing never tilts her.
  #frame() {
    const cam = this.camera;
    const bottom = this.frameBottom.value, top = this.frameTop.value;
    const span = top - bottom;
    const fov = cam.fov * Math.PI / 180;
    // Fit the span to the frame height; on wide frames keep her shoulders inside too.
    let dist = span / (2 * Math.tan(fov / 2));
    const widthNeeded = this.frameWidth.value;
    const visibleWidth = 2 * Math.tan(fov / 2) * dist * cam.aspect;
    if (visibleWidth < widthNeeded) dist *= widthNeeded / visibleWidth;
    const eye = 1.52;
    const face = 0.07; // her face and chest sit this far in front of the spine: frame that plane
    cam.position.set(this.shiftX.value, eye, face + dist);
    cam.lookAt(this.shiftX.value, eye, face);
    // If the frame had to widen, keep the headroom and let the extra height go below.
    const visibleHeight = 2 * Math.tan(fov / 2) * dist;
    const centre = top - visibleHeight / 2;
    const W = 1000, H = Math.round(1000 / cam.aspect);
    cam.setViewOffset(W, H, 0, ((eye - centre) / visibleHeight) * H, W, H);
    cam.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      if (document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.frameBottom.step(dt); this.frameTop.step(dt); this.frameWidth.step(dt); this.shiftX.step(dt);
      this.#frame();
      // She keeps living off screen (she may be walking back in); only drawing waits.
      this.performer.update(dt, { visitor: this.camera.position, page: this.page });
      const feet = this.performer.loco?.feetMid;
      if (feet) { this.shadow.position.x = feet.x; this.shadow.position.z = feet.z; this.shadow.rotation.z = this.performer.loco.yaw; }
      if (this.visible) this.renderer.render(this.scene, this.camera);
      this.onFrame?.(dt);
    });
  }

  stop() { this.running = false; this.renderer?.setAnimationLoop(null); }
}
