// The 3D terminal: a CRT monitor modelled in Blender, lit like a product shot,
// with a picture made the way a real terminal made it. A character generator
// turns cells into a video signal of 10 dots by 12 scanlines per character,
// the phosphor keeps a little afterglow, and the glass draws each scanline as
// a soft electron beam with a halo, under the room's reflections.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DOTS, LINES } from './rom.js';

const FOV = 24; // a longish lens, like a product photo
const RASTER = { x0: 0.045, y0: 0.05, x1: 0.955, y1: 0.95 }; // the lit area on the glass, in its UVs
const BARREL = 0.035;
const OVERSCAN = { x: 0.022, y: 0.03 }; // dark border between the raster edge and the picture
const PHOSPHOR = new THREE.Color(0.16, 1, 0.36); // P1-ish green, linear
const PERSISTENCE = 0.06; // seconds for the afterglow to fall to 1/e

const fullscreen = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

// The character generator: cells + ROM → one dot per texel, one scanline per row.
const textMode = /* glsl */ `
  precision highp float;
  precision highp int;
  uniform highp sampler2D uCells;
  uniform highp sampler2D uRom;
  uniform vec2 uGrid;       // cols, rows
  uniform vec4 uRegion;     // top row, bottom row, scroll in scanlines, spare row
  uniform vec4 uCursor;     // col, row, on, unused
  uniform float uTime;
  uniform float uBlink;
  uniform float uHover;     // hovered link id
  in vec2 vUv;
  out vec4 fragColor;
  void main() {
    float line = floor((1.0 - vUv.y) * uGrid.y * ${LINES}.0);
    float dotX = floor(vUv.x * uGrid.x * ${DOTS}.0);
    float col = floor(dotX / ${DOTS}.0);
    float row = floor(line / ${LINES}.0);
    float ly = line - row * ${LINES}.0;
    float screenRow = row;
    if (row >= uRegion.x && row <= uRegion.y) {
      float v = line - uRegion.x * ${LINES}.0 + uRegion.z;
      row = uRegion.x + floor(v / ${LINES}.0);
      ly = v - (row - uRegion.x) * ${LINES}.0;
      if (row > uRegion.y) row = uRegion.w;
    }
    vec4 cell = texelFetch(uCells, ivec2(int(col), int(row)), 0);
    int glyph = int(cell.r + 0.5);
    int attr = int(cell.g + 0.5);
    float dx = dotX - col * ${DOTS}.0;
    ivec2 rom = ivec2((glyph % 64) * ${DOTS} + int(dx), (glyph / 64) * ${LINES} + int(ly));
    float on = texelFetch(uRom, rom, 0).r;
    bool hovered = (attr & 32) != 0 && abs(cell.a - uHover) < 0.5;
    if (((attr & 8) != 0 || hovered) && ly > ${LINES - 1.5}) on = 1.0;
    if ((attr & 16) != 0 && uBlink < 0.5) on = 0.0;
    bool invert = (attr & 4) != 0;
    if (uCursor.z > 0.5 && col == uCursor.x && screenRow == uCursor.y) invert = !invert;
    if (invert) on = 1.0 - on;
    float level = (attr & 1) != 0 || hovered ? 1.0 : (attr & 2) != 0 ? 0.42 : 0.74;
    float heat = cell.b >= 0.0 ? exp(-max(0.0, uTime - cell.b) / 0.16) : 0.0;
    fragColor = vec4(on * level, on * heat, 0.0, 1.0);
  }`;

// Phosphor persistence: lit dots follow the signal, dark ones fade out.
const persistence = /* glsl */ `
  precision highp float;
  uniform sampler2D uSignal;
  uniform sampler2D uPrev;
  uniform float uDecay;
  in vec2 vUv;
  out vec4 fragColor;
  void main() {
    vec4 s = texture(uSignal, vUv);
    float lit = s.r * (1.0 + 0.7 * s.g);
    float prev = texture(uPrev, vUv).r * uDecay;
    fragColor = vec4(max(lit, prev), 0.0, 0.0, 1.0);
  }`;

// Halation: a soft halo around bright text, blurred in two passes.
const blur = /* glsl */ `
  precision highp float;
  uniform sampler2D uInput;
  uniform vec2 uStep;
  in vec2 vUv;
  out vec4 fragColor;
  void main() {
    float w[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    float sum = texture(uInput, vUv).r * w[0];
    for (int i = 1; i < 5; i++) {
      sum += texture(uInput, vUv + uStep * float(i)).r * w[i];
      sum += texture(uInput, vUv - uStep * float(i)).r * w[i];
    }
    fragColor = vec4(sum, 0.0, 0.0, 1.0);
  }`;

// The picture on the glass, added to the glass material's emission.
const glassEmission = /* glsl */ `
  const vec2 OVERSCAN = vec2(${OVERSCAN.x}, ${OVERSCAN.y});
  vec3 crtEmission(vec2 uv) {
    vec2 r = (uv - uCrtRaster.xy) / (uCrtRaster.zw - uCrtRaster.xy);
    vec2 c = r * 2.0 - 1.0;
    c *= 1.0 + ${BARREL} * c.yx * c.yx; // the raster bows like a real tube's
    c /= uCrtScale; // power on/off: the raster grows from a line
    r = c * 0.5 + 0.5;
    vec2 edge = smoothstep(vec2(0.0), vec2(0.01), r) * smoothstep(vec2(0.0), vec2(0.01), 1.0 - r);
    float inside = edge.x * edge.y;
    if (inside <= 0.0) return vec3(0.0);
    // The picture sits inside the raster with a thin overscan border.
    vec2 s = (r - OVERSCAN) / (1.0 - 2.0 * OVERSCAN);
    vec2 size = uCrtSignal;
    vec2 p = vec2(s.x * size.x, (1.0 - s.y) * size.y); // dots and scanlines from the top left
    vec2 fw = fwidth(p);
    float lod = max(0.0, log2(max(fw.x, fw.y)));
    vec2 aa = max(fw / size, vec2(1e-5));
    vec2 inPicture = smoothstep(-aa, aa, s) * smoothstep(-aa, aa, 1.0 - s);
    float y = p.y - 0.5;
    float y0 = floor(y);
    float f = y - y0;
    float a = textureLod(uCrtPhosphor, vec2(s.x, 1.0 - (y0 + 0.5) / size.y), lod).r;
    float b = textureLod(uCrtPhosphor, vec2(s.x, 1.0 - (y0 + 1.5) / size.y), lod).r;
    // Each scanline is a beam spot that grows wider as it gets brighter.
    float sa = mix(0.27, 0.45, clamp(a, 0.0, 1.0));
    float sb = mix(0.27, 0.45, clamp(b, 0.0, 1.0));
    float beam = a * exp(-f * f / (2.0 * sa * sa)) / (sa * 2.3) + b * exp(-(1.0 - f) * (1.0 - f) / (2.0 * sb * sb)) / (sb * 2.3);
    // Too small to resolve scanlines: show their average instead of moiré.
    float average = textureLod(uCrtPhosphor, vec2(s.x, s.y), lod).r;
    float level = mix(beam, average, smoothstep(0.35, 0.8, fw.y)) * inPicture.x * inPicture.y;
    vec2 near = smoothstep(vec2(-0.04), vec2(0.0), s) * smoothstep(vec2(-0.04), vec2(0.0), 1.0 - s);
    float halo = texture(uCrtBloom, clamp(s, 0.0, 1.0)).r * near.x * near.y;
    float vignette = 1.0 - 0.2 * dot(c, c);
    float intensity = (level + halo * 0.32) * vignette * inside * uCrtPower;
    vec3 color = uCrtColor * intensity;
    color += vec3(0.5, 0.8, 0.55) * max(0.0, intensity - 1.15) * 0.4; // hot cores go white-green
    return color;
  }`;

const up = new THREE.Vector3(0, 1, 0);

export class Crt {
  constructor({ canvas, rom, screen }) {
    this.canvas = canvas;
    this.rom = rom;
    this.screen = screen;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 60);
    this.pixelRatio = Math.min(devicePixelRatio, 2);
    this.power = 0; // 0 = off, 1 = on
    this.powerTarget = 0;
    this.hoverLink = 0;
    this.glow = 0; // how much light the picture throws on the bezel
    this.#setupLights();
    this.#setupScreenPipeline();
  }

  // -- Setup ----------------------------------------------------------------

  #setupLights() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.75;
    // Turn the studio so its brightest softbox glances off the glass from the upper left.
    this.scene.environmentRotation.set(0.25, 0.75, 0);
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xfff1e0, 2.1);
    key.position.set(-2.5, 3.2, 3.5);
    const rim = new THREE.DirectionalLight(0xc8dcff, 1.4);
    rim.position.set(3, 1.5, -2.5);
    this.scene.add(key, rim);
  }

  #setupScreenPipeline() {
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.romTexture = new THREE.DataTexture(this.rom.data, this.rom.width, this.rom.height, THREE.RedFormat, THREE.UnsignedByteType);
    this.romVersion = -1;

    const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: fullscreen, fragmentShader, uniforms, depthTest: false, depthWrite: false,
    });
    this.textPass = pass(textMode, {
      uCells: { value: null }, uRom: { value: this.romTexture }, uGrid: { value: new THREE.Vector2() },
      uRegion: { value: new THREE.Vector4() }, uCursor: { value: new THREE.Vector4() },
      uTime: { value: 0 }, uBlink: { value: 1 }, uHover: { value: 0 },
    });
    this.persistPass = pass(persistence, { uSignal: { value: null }, uPrev: { value: null }, uDecay: { value: 0 } });
    this.blurPass = pass(blur, { uInput: { value: null }, uStep: { value: new THREE.Vector2() } });

    // Shared with the body material: the picture's light on the bezel.
    this.spillUniforms = {
      uCrtWorldToModel: { value: new THREE.Matrix4() },
      uCrtGlassCentre: { value: new THREE.Vector3() },
      uCrtGlassHalf: { value: new THREE.Vector2() },
      uCrtGlow: { value: 0 },
    };
    // Shared with the glass material.
    this.crtUniforms = {
      uCrtPhosphor: { value: null },
      uCrtBloom: { value: null },
      uCrtSignal: { value: new THREE.Vector2(1, 1) },
      uCrtRaster: { value: new THREE.Vector4(RASTER.x0, RASTER.y0, RASTER.x1, RASTER.y1) },
      uCrtScale: { value: new THREE.Vector2(1, 1) },
      uCrtPower: { value: 0 },
      uCrtColor: { value: PHOSPHOR.clone() },
      uCrtFlipV: { value: 0 },
    };
  }

  // Allocates the signal for a cols × rows text mode.
  setGrid(cols, rows) {
    if (this.cols === cols && this.rows === rows) return;
    this.cols = cols;
    this.rows = rows;
    this.cellTexture?.dispose();
    this.cellTexture = new THREE.DataTexture(this.screen.cells, cols, rows + 1, THREE.RGBAFormat, THREE.FloatType);
    this.cellTexture.needsUpdate = true;
    const w = cols * DOTS;
    const h = rows * LINES;
    const target = (width, height, options = {}) => new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, ...options,
    });
    for (const t of [this.signal, ...(this.phosphor ?? []), ...(this.bloom ?? [])]) t?.dispose();
    this.signal = target(w, h, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
    const mipmapped = { type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true };
    this.phosphor = [target(w, h, mipmapped), target(w, h, mipmapped)];
    this.bloom = [target(w / 4, h / 2, { type: THREE.HalfFloatType }), target(w / 4, h / 2, { type: THREE.HalfFloatType })];
    this.textPass.uniforms.uCells.value = this.cellTexture;
    this.textPass.uniforms.uGrid.value.set(cols, rows);
    this.crtUniforms.uCrtSignal.value.set(w, h);
    this.signalDirty = true;
  }

  async load(url) {
    let root;
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      root = gltf.scene;
    } catch (error) {
      console.warn('Monitor model failed to load, using a placeholder.', error);
      root = placeholderMonitor();
    }
    this.#adopt(root);
  }

  #adopt(root) {
    const glassMesh = root.getObjectByName('Screen');
    this.parts = {
      screen: glassMesh,
      power: root.getObjectByName('PowerButton'),
      led: root.getObjectByName('PowerLED'),
    };
    root.traverse((node) => {
      if (!node.isMesh) return;
      node.frustumCulled = false;
      if (node.material?.map) node.material.map.anisotropy = 4;
    });
    this.#makeGlass(glassMesh);
    const bodyMaterials = new Set();
    root.traverse((node) => {
      if (node.isMesh && node !== glassMesh && node !== this.parts.led) bodyMaterials.add(node.material);
    });
    for (const material of bodyMaterials) this.#addSpill(material);
    if (this.parts.led) {
      this.parts.led.material = this.parts.led.material.clone();
      this.parts.led.material.emissive = new THREE.Color(0x33ff66);
      this.parts.led.material.emissiveIntensity = 0;
    }

    // The monitor's pivots: its bounding box centre (corner) and the glass (zoomed).
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    this.size = box.getSize(new THREE.Vector3());
    this.centre = box.getCenter(new THREE.Vector3());
    const glassBox = new THREE.Box3().setFromObject(glassMesh);
    this.glassSize = glassBox.getSize(new THREE.Vector3());
    this.glassCentre = glassBox.getCenter(new THREE.Vector3());
    this.glassCentre.z = glassBox.max.z;
    this.spillUniforms.uCrtGlassCentre.value.set(this.glassCentre.x, this.glassCentre.y, glassBox.min.z);
    this.spillUniforms.uCrtGlassHalf.value.set(this.glassSize.x / 2, this.glassSize.y / 2);
    // The lit raster, in model units, for framing the zoomed view.
    this.rasterSize = new THREE.Vector2(this.glassSize.x * (RASTER.x1 - RASTER.x0), this.glassSize.y * (RASTER.y1 - RASTER.y0));
    // The front face (bezel and chin, not the pedestal): what a zoomed view shows.
    this.face = frontFace(root, glassBox.min.z - 0.03, box.min.y + this.size.y * 0.1) ?? box;
    const raster = this.#rasterCentre();
    this.faceOffset = new THREE.Vector2((this.face.min.x + this.face.max.x) / 2 - raster.x, (this.face.min.y + this.face.max.y) / 2 - raster.y);
    this.faceSize = new THREE.Vector2(this.face.max.x - this.face.min.x, this.face.max.y - this.face.min.y);

    this.hull = hullPoints(root, 64);
    this.model = root;
    this.pivot = new THREE.Group();
    this.pivot.add(root);
    this.scene.add(this.pivot);
  }

  // The picture lights the recess around the glass: a green spill that fades
  // with distance from the glass, computed in the model's own space.
  #addSpill(material) {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.spillUniforms, { uCrtColor: this.crtUniforms.uCrtColor });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nout vec3 vCrtWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCrtWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          in vec3 vCrtWorld;
          uniform mat4 uCrtWorldToModel;
          uniform vec3 uCrtGlassCentre;
          uniform vec2 uCrtGlassHalf;
          uniform float uCrtGlow;
          uniform vec3 uCrtColor;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 crtP = (uCrtWorldToModel * vec4(vCrtWorld, 1.0)).xyz;
          float crtD = length(max(abs(crtP.xy - uCrtGlassCentre.xy) - uCrtGlassHalf, 0.0));
          float crtZ = crtP.z - uCrtGlassCentre.z;
          float crtSpill = exp(-crtD / 0.016) * smoothstep(-0.012, 0.0, crtZ) * (1.0 - smoothstep(0.035, 0.075, crtZ));
          totalEmissiveRadiance += uCrtColor * uCrtGlow * crtSpill * 0.16;`);
    };
    material.needsUpdate = true;
  }

  #makeGlass(mesh) {
    // glTF puts v = 0 at the top of an image: find out which way this glass runs.
    const { position, uv } = mesh.geometry.attributes;
    let top = 0;
    for (let i = 1; i < position.count; i++) if (position.getY(i) > position.getY(top)) top = i;
    this.flipV = uv.getY(top) < 0.5;
    this.crtUniforms.uCrtFlipV.value = this.flipV ? 1 : 0;
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.012, 0.018, 0.014),
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.16,
      envMapIntensity: 0.22,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.crtUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nout vec2 vCrtUv;\nuniform float uCrtFlipV;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvCrtUv = vec2(uv.x, mix(uv.y, 1.0 - uv.y, uCrtFlipV));');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          in vec2 vCrtUv;
          uniform sampler2D uCrtPhosphor;
          uniform sampler2D uCrtBloom;
          uniform vec2 uCrtSignal;
          uniform vec4 uCrtRaster;
          uniform vec2 uCrtScale;
          uniform float uCrtPower;
          uniform vec3 uCrtColor;
          ${glassEmission}`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += crtEmission(vCrtUv);');
    };
    mesh.material = material;
  }

  // -- Layout ---------------------------------------------------------------

  // Viewport in CSS pixels. `rect` limits drawing to part of it (the corner).
  setViewport(width, height, rect = null) {
    this.width = width;
    this.height = height;
    this.rect = rect;
    const w = rect ? rect.w : width;
    const h = rect ? rect.h : height;
    Object.assign(this.canvas.style, rect
      ? { left: `${rect.x}px`, top: `${rect.y}px`, width: `${w}px`, height: `${h}px` }
      : { left: '0px', top: '0px', width: `${width}px`, height: `${height}px` });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = width / height;
    if (rect) this.camera.setViewOffset(width, height, rect.x, rect.y, rect.w, rect.h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  // Places the monitor. corner: { x, y, h } is where the whole monitor sits
  // (centre and height in CSS px); zoom: { x, y, w } is where the raster goes
  // when zoomed in. t blends between them. Angles are in radians.
  place({ corner, zoom, t, yaw, pitch, roll, lift = 0, scale = 1, zoomLook = { yaw: 0, pitch: 0 } }) {
    if (!this.model) return;
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const toWorld = (x, y, depth) => new THREE.Vector3(
      ((x - this.width / 2) / (this.height / 2)) * depth * tan,
      (-(y - this.height / 2) / (this.height / 2)) * depth * tan,
      -depth,
    );
    // Corner: the whole monitor, turned by the look angles.
    const cornerDepth = (this.size.y * this.height) / (2 * corner.h * scale * tan);
    const cornerPosition = toWorld(corner.x, corner.y - lift, cornerDepth);
    const cornerRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    const cornerMatrix = new THREE.Matrix4().compose(cornerPosition, cornerRotation, new THREE.Vector3(1, 1, 1))
      .multiply(new THREE.Matrix4().makeTranslation(-this.centre.x, -this.centre.y, -this.centre.z));
    // Zoomed: the raster fills the target, facing the camera squarely.
    const zoomDepth = (this.rasterSize.x * this.height) / (2 * zoom.w * tan);
    const zoomPosition = toWorld(zoom.x, zoom.y, zoomDepth);
    const zoomRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(zoomPosition.clone().negate(), new THREE.Vector3(), up))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(zoomLook.pitch, zoomLook.yaw, 0, 'YXZ')));
    const glassCentre = this.#rasterCentre();
    const zoomMatrix = new THREE.Matrix4().compose(zoomPosition, zoomRotation, new THREE.Vector3(1, 1, 1))
      .multiply(new THREE.Matrix4().makeTranslation(-glassCentre.x, -glassCentre.y, -glassCentre.z));

    const a = decompose(cornerMatrix);
    const b = decompose(zoomMatrix);
    // Arc a little towards the viewer on the way, so it reads as a move in depth.
    const position = a.position.clone().lerp(b.position, t);
    position.z += Math.sin(t * Math.PI) * 0.04 * cornerDepth;
    const rotation = a.rotation.clone().slerp(b.rotation, t);
    this.pivot.matrixAutoUpdate = false;
    this.pivot.matrix.compose(position, rotation, new THREE.Vector3(1, 1, 1));
    this.pivot.matrixWorldNeedsUpdate = true;
    this.spillUniforms.uCrtWorldToModel.value.copy(this.pivot.matrix).invert();
    this.zoomAmount = t;
  }

  #rasterCentre() {
    const u = (RASTER.x0 + RASTER.x1) / 2;
    const v = (RASTER.y0 + RASTER.y1) / 2;
    return new THREE.Vector3(
      this.glassCentre.x + (u - 0.5) * this.glassSize.x,
      this.glassCentre.y + (v - 0.5) * this.glassSize.y,
      this.glassCentre.z,
    );
  }

  // The monitor's outline on the page, in CSS px, for hit areas and proximity.
  bounds() {
    if (!this.model) return null;
    this.pivot.updateMatrixWorld(true);
    const camera = this.#fullCamera();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const p = new THREE.Vector3();
    for (const point of this.hull) {
      p.copy(point).applyMatrix4(this.model.matrixWorld).project(camera);
      const x = ((p.x + 1) / 2) * this.width;
      const y = ((1 - p.y) / 2) * this.height;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  #fullCamera() {
    const camera = this.camera.clone();
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return camera;
  }

  // What is under a point on the page: the glass (with its terminal cell), a part, or nothing.
  // glassOnly skips the rest of the model: cheap enough for every pointer move.
  pick(x, y, glassOnly = false) {
    if (!this.model) return null;
    const camera = this.#fullCamera();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), camera);
    this.pivot.updateMatrixWorld(true);
    const [hit] = ray.intersectObject(glassOnly ? this.parts.screen : this.model, !glassOnly);
    if (!hit) return null;
    if (hit.object === this.parts.screen && hit.uv) {
      const v = this.flipV ? 1 - hit.uv.y : hit.uv.y;
      let rx = (hit.uv.x - RASTER.x0) / (RASTER.x1 - RASTER.x0);
      let ry = (v - RASTER.y0) / (RASTER.y1 - RASTER.y0);
      let cx = rx * 2 - 1;
      let cy = ry * 2 - 1;
      [cx, cy] = [cx * (1 + BARREL * cy * cy), cy * (1 + BARREL * cx * cx)];
      rx = (cx * 0.5 + 0.5 - OVERSCAN.x) / (1 - 2 * OVERSCAN.x);
      ry = (cy * 0.5 + 0.5 - OVERSCAN.y) / (1 - 2 * OVERSCAN.y);
      return { part: 'screen', dotX: rx * this.cols * DOTS, lineY: (1 - ry) * this.rows * LINES };
    }
    if (this.parts.power && hit.object === this.parts.power) return { part: 'power' };
    return { part: 'body' };
  }

  // -- Frame ----------------------------------------------------------------

  // Renders a frame. Returns false when nothing needed drawing.
  render(now, dt, { moved, blink, screenChanged }) {
    if (!this.model) return false;
    const r = this.renderer;
    const s = this.screen;

    if (this.rom.version !== this.romVersion) {
      this.romVersion = this.rom.version;
      this.romTexture.needsUpdate = true;
      this.signalDirty = true;
    }
    if (screenChanged) {
      this.cellTexture.needsUpdate = true;
      this.signalDirty = true;
      this.hotUntil = now + 0.8;
      this.glowTarget = litShare(s);
    }
    const hot = now < (this.hotUntil ?? 0);
    const cursorOn = s.cursor.visible && blink;
    const cursorKey = `${cursorOn}${s.cursor.col},${s.cursor.row}${this.hoverLink}`;
    if (cursorKey !== this.cursorKey) {
      this.cursorKey = cursorKey;
      this.signalDirty = true;
    }

    // Power: a line that opens into the raster, or collapses into a fading dot.
    const powering = this.power !== this.powerTarget;
    if (powering) {
      const speed = this.powerTarget > this.power ? 1 / 1.1 : 1 / 0.55;
      this.power = this.powerTarget > this.power ? Math.min(1, this.power + dt * speed) : Math.max(0, this.power - dt * speed);
    }
    const { scale, brightness } = powerCurve(this.power, this.powerTarget > 0.5);
    this.crtUniforms.uCrtScale.value.set(scale.x, scale.y);
    this.crtUniforms.uCrtPower.value = brightness;

    const updateScreen = this.signalDirty || hot || this.decaying || powering;
    if (updateScreen) {
      const text = this.textPass.uniforms;
      text.uTime.value = now;
      text.uBlink.value = blink ? 1 : 0;
      text.uHover.value = this.hoverLink;
      text.uRegion.value.set(s.region.top, s.region.bottom, s.scroll, s.rows);
      text.uCursor.value.set(s.cursor.col, s.cursor.row, cursorOn ? 1 : 0, 0);
      if (this.signalDirty || hot) this.#pass(this.textPass, this.signal);
      this.signalDirty = false;
      // Afterglow.
      const [prev, next] = this.phosphor;
      this.persistPass.uniforms.uSignal.value = this.signal.texture;
      this.persistPass.uniforms.uPrev.value = prev.texture;
      this.persistPass.uniforms.uDecay.value = Math.exp(-dt / PERSISTENCE);
      this.#pass(this.persistPass, next);
      this.phosphor = [next, prev];
      this.decaying = hot || screenChanged || this.decayFrames-- > 0;
      if (screenChanged || hot) this.decayFrames = 30;
      // Halation.
      const [b0, b1] = this.bloom;
      this.blurPass.uniforms.uInput.value = next.texture;
      this.blurPass.uniforms.uStep.value.set(1.1 / b0.width, 0);
      this.#pass(this.blurPass, b0);
      this.blurPass.uniforms.uInput.value = b0.texture;
      this.blurPass.uniforms.uStep.value.set(0, 1.1 / b0.height);
      this.#pass(this.blurPass, b1);
      this.crtUniforms.uCrtPhosphor.value = next.texture;
      this.crtUniforms.uCrtBloom.value = b1.texture;
    }

    // The picture lights the bezel a little.
    this.glow += ((this.glowTarget ?? 0) * brightness - this.glow) * Math.min(1, dt * 6);
    this.spillUniforms.uCrtGlow.value = this.glow;
    if (this.parts.led) this.parts.led.material.emissiveIntensity = this.ledLevel ?? (this.powerTarget ? 2.2 : 0);

    if (!(updateScreen || moved || this.ledChanged)) return false;
    this.ledChanged = false;
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
    return true;
  }

  #pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  setLed(level) {
    if (level === this.ledLevel) return;
    this.ledLevel = level;
    this.ledChanged = true;
  }
}

// How much of the screen is lit, roughly: lights the bezel accordingly.
function litShare(screen) {
  const { cells } = screen;
  let lit = 0;
  const count = screen.cols * screen.rows;
  for (let i = 0; i < count; i++) {
    const attr = cells[i * 4 + 1];
    if (attr & 4) lit += 0.8;
    else if (cells[i * 4]) lit += 0.22;
  }
  return Math.min(1, (lit / count) * 3);
}

// Power on: a dot, a line, then the raster opens. Power off: the reverse, fast.
function powerCurve(p, on) {
  if (on) {
    const width = THREE.MathUtils.smoothstep(p, 0, 0.18);
    const height = Math.max(0.004, THREE.MathUtils.smoothstep(p, 0.2, 0.62));
    return { scale: { x: Math.max(0.02, width), y: height }, brightness: p <= 0 ? 0 : (0.4 + 0.6 * THREE.MathUtils.smoothstep(p, 0.1, 1)) * (1 + (1 - height) * 2.5) };
  }
  const height = Math.max(0.004, THREE.MathUtils.smoothstep(p, 0.45, 1));
  const width = Math.max(0.01, THREE.MathUtils.smoothstep(p, 0.12, 0.45));
  return { scale: { x: width, y: height }, brightness: THREE.MathUtils.smoothstep(p, 0, 0.3) * (1 + (1 - height) * 2) };
}

// The model's outermost vertices in `count` directions (a Fibonacci sphere):
// a cheap stand-in for its convex hull, for tight on-screen bounds.
function hullPoints(root, count) {
  const directions = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    directions.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const best = directions.map(() => ({ d: -Infinity, p: new THREE.Vector3() }));
  const p = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!node.isMesh) return;
    const position = node.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      directions.forEach((direction, k) => {
        const d = p.dot(direction);
        if (d > best[k].d) {
          best[k].d = d;
          best[k].p.copy(p);
        }
      });
    }
  });
  return best.map((b) => b.p);
}

// Bounding box of the vertices in front of `z` and above `y`: the bezel's face.
function frontFace(root, z, y) {
  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  root.traverse((node) => {
    if (!node.isMesh) return;
    const position = node.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      if (p.z >= z && p.y >= y) box.expandByPoint(p);
    }
  });
  return box.isEmpty() ? null : box;
}

function decompose(matrix) {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  matrix.decompose(position, rotation, new THREE.Vector3());
  return { position, rotation };
}

// A stand-in monitor for when the model can't load: a box with a glass.
function placeholderMonitor() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.38), new THREE.MeshStandardMaterial({ color: 0xcfc6ae, roughness: 0.55 }));
  body.position.set(0, 0.19, -0.19);
  body.name = 'Body';
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.304, 0.228), new THREE.MeshStandardMaterial());
  glass.position.set(0, 0.215, 0.0015);
  glass.name = 'Screen';
  root.add(body, glass);
  return root;
}
