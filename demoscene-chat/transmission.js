// A real WebGL particle renderer. The DOM remains the source of truth for text,
// layout, selection, links, input, and accessibility. Only its entrance is GPU art.
const vertex = `
attribute vec3 aPoint;
attribute float aSeed;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime, uProgress, uMode, uDpr, uOutgoing;
varying float vAlpha, vHue;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec2 center = uResolution * .5;
  vec2 p;
  float size;
  if (uMode < .5) {
    float depth = 1. - fract(aPoint.z + uTime * .025);
    vec2 drift = (uPointer - .5) * uResolution * .14;
    p = center + drift * (1. - depth) + aPoint.xy / (.16 + depth * 2.8);
    vec2 delta = p - uPointer * uResolution;
    float lens = max(0., 1. - length(delta) / 180.);
    p += delta * lens * .4;
    vAlpha = .12 + pow(1. - depth, 2.) * .75 + lens * .45;
    size = (1.4 + (1. - depth) * 3.) * uDpr;
  } else {
    // Per-particle delay creates a left-to-right 3D scroller wave.
    float delay = (aPoint.x / uResolution.x) * .13 + aSeed * .09;
    float t = smoothstep(0., 1., clamp((uProgress - delay) / .52, 0., 1.));
    vec3 source = vec3((hash(aSeed * 821.) - .5) * uResolution.x * 3.,
                       (hash(aSeed * 317.) - .5) * uResolution.y * 2.,
                       300. + hash(aSeed * 157.) * 1600.);
    vec3 target = vec3(aPoint.xy - center, 0.);
    if (uOutgoing > .5) source = vec3(target.x * .6, uResolution.y * .43, -180. - aSeed * 100.);
    vec3 pos = mix(source, target, t);
    float angle = (1. - t) * 1.1;
    pos.yz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * pos.yz;
    pos.y += sin(aPoint.x * .018 + uTime * 3.) * 38. * (1. - t);
    p = center + pos.xy * (800. / (800. + pos.z));
    vAlpha = (.35 + t * .65) * (1. - smoothstep(.92, 1., uProgress));
    size = mix(4.5, 2.8, t) * uDpr;
  }
  vHue = aSeed;
  gl_Position = vec4(p.x / uResolution.x * 2. - 1., 1. - p.y / uResolution.y * 2., 0., 1.);
  gl_PointSize = size;
}`;

const fragment = `
precision highp float;
uniform float uMode;
varying float vAlpha, vHue;
void main() {
  float radius = length(gl_PointCoord - .5) * 2.;
  if (radius > 1.) discard;
  float glow = exp(-radius * radius * 2.5);
  vec3 color = uMode < .5 ? mix(vec3(.2,.6,.8),vec3(.65,.85,1.),vHue)
                         : mix(vec3(.55,.95,.9),vec3(.9,1.,.6),vHue);
  float alpha = glow * vAlpha;
  gl_FragColor = vec4(color * alpha, alpha);
}`;

export class Transmission {
  constructor(canvas, dialog, transcript) {
    this.canvas = canvas;
    this.dialog = dialog;
    this.transcript = transcript;
    this.paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.frame = 0;
    this.energy = 0;
    this.time = 0;
    this.last = 0;
    this.pointer = [.5, .5];
    this.pointerTarget = [.5, .5];
    this.impulse = 0;
    this.gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!this.gl) return;
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    try {
      this.program = gl.createProgram();
      gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    } catch (error) { console.warn('Particle text unavailable; using readable HTML.', error); this.gl = null; return; }
    gl.useProgram(this.program);
    this.locations = {};
    for (const name of ['uResolution','uPointer','uTime','uProgress','uMode','uDpr','uOutgoing']) this.locations[name] = gl.getUniformLocation(this.program, name);
    this.point = gl.getAttribLocation(this.program, 'aPoint');
    this.seed = gl.getAttribLocation(this.program, 'aSeed');
    this.stars = gl.createBuffer(); this.glyphs = gl.createBuffer();
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.cancel(); this.gl = null;
      canvas.style.display = 'none'; // Content remains fully usable without graphics.
    });
    this.resize = () => {
      this.cancel();
      const bounds = canvas.getBoundingClientRect();
      this.width = Math.round(bounds.width || innerWidth);
      this.height = Math.round(bounds.height || innerHeight);
      this.dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(this.width * this.dpr); canvas.height = Math.round(this.height * this.dpr);
      if (!this.gl) return;
      const stars = new Float32Array(1800 * 4);
      for (let i = 0; i < 1800; i++) {
        stars.set([(Math.random() - .5) * this.width * 2, (Math.random() - .5) * this.height * 2, Math.random(), Math.random()], i * 4);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.stars); gl.bufferData(gl.ARRAY_BUFFER, stars, gl.STATIC_DRAW);
      this.wake();
    };
    addEventListener('resize', this.resize);
    // Scroll/edit/selection never waits for an effect to finish.
    transcript.addEventListener('scroll', () => this.cancel(), { passive: true });
    transcript.addEventListener('pointerdown', () => this.cancel());
    dialog.addEventListener('pointermove', event => {
      const bounds = canvas.getBoundingClientRect();
      this.pointerTarget = [(event.clientX - bounds.left) / Math.max(1, bounds.width), (event.clientY - bounds.top) / Math.max(1, bounds.height)];
    }, { passive: true });
    dialog.addEventListener('wheel', event => { this.impulse = Math.min(2, this.impulse + Math.abs(event.deltaY) / 400); }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); else this.wake(); });
    this.resize();
  }

  setPaused(value) { this.paused = value; if (value) this.cancel(); this.wake(); }
  setEnergy(value) { this.energy = value; this.wake(); }
  open() { this.last = 0; this.resize?.(); this.wake(); }
  close() { this.cancel(); if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; }
  cancel() {
    this.active?.classList.remove('assembling');
    this.active?.style.removeProperty('--ink');
    this.active = null;
    this.count = 0;
  }

  form(element) {
    this.cancel();
    if (!this.gl || this.paused || !this.dialog.open || !element?.isConnected || document.hidden) return;
    const text = element.querySelector('.body');
    if (!text) return;
    // Sample the actual laid-out glyphs, including wrapping and paragraph breaks.
    const mask = document.createElement('canvas');
    mask.width = this.width; mask.height = this.height;
    const ctx = mask.getContext('2d', { willReadFrequently: true });
    const style = getComputedStyle(text);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
    const ascent = ctx.measureText('Mg').fontBoundingBoxAscent || parseFloat(style.fontSize) * .82;
    const origin = this.canvas.getBoundingClientRect();
    const bounds = this.transcript.getBoundingClientRect();
    const clip = { left: bounds.left - origin.left, top: bounds.top - origin.top,
      right: bounds.right - origin.left, bottom: bounds.bottom - origin.top, width: bounds.width, height: bounds.height };
    ctx.beginPath(); ctx.rect(clip.left, clip.top, clip.width, clip.height); ctx.clip();
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let node;
    while ((node = walker.nextNode())) {
      let offset = 0;
      for (const char of node.textContent) {
        range.setStart(node, offset); offset += char.length; range.setEnd(node, offset);
        const rect = range.getBoundingClientRect();
        if (char.trim() && rect.bottom > bounds.top && rect.top < bounds.bottom) ctx.fillText(char, rect.left - origin.left, rect.top - origin.top + ascent);
      }
    }
    const pixels = ctx.getImageData(0, 0, mask.width, mask.height).data;
    const points = [];
    for (let y = Math.max(0, Math.floor(clip.top)); y < Math.min(this.height, clip.bottom); y += 2) {
      for (let x = Math.max(0, Math.floor(clip.left)); x < Math.min(this.width, clip.right); x += 2) {
        if (pixels[(y * mask.width + x) * 4 + 3] > 65) points.push(x, y, 0, Math.random());
      }
    }
    if (!points.length) return;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.glyphs);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(points), this.gl.DYNAMIC_DRAW);
    this.count = points.length / 4;
    this.active = element;
    this.started = performance.now();
    element.style.setProperty('--ink', '0');
    element.classList.add('assembling');
    this.wake();
  }

  wake() { if (this.gl && this.dialog.open && !document.hidden && !this.frame) this.frame = requestAnimationFrame(now => this.draw(now)); }
  draw(now) {
    this.frame = 0;
    if (!this.gl || !this.dialog.open || document.hidden) return;
    const gl = this.gl;
    const dt = Math.min(.05, (now - (this.last || now)) / 1000);
    this.last = now;
    if (!this.paused) {
      this.time += dt * (1 + this.energy * 1.4 + this.impulse * 3);
      this.impulse *= Math.exp(-dt * 2.5);
      this.pointer = this.pointer.map((value, i) => value + (this.pointerTarget[i] - value) * Math.min(1, dt * 4));
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform2f(this.locations.uResolution, this.width, this.height);
    gl.uniform2f(this.locations.uPointer, ...this.pointer);
    gl.uniform1f(this.locations.uDpr, this.dpr);
    gl.uniform1f(this.locations.uTime, this.time);
    const drawBuffer = (buffer, count, mode, progress = 0) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(this.point); gl.vertexAttribPointer(this.point, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(this.seed); gl.vertexAttribPointer(this.seed, 1, gl.FLOAT, false, 16, 12);
      gl.uniform1f(this.locations.uMode, mode); gl.uniform1f(this.locations.uProgress, progress);
      gl.drawArrays(gl.POINTS, 0, count);
    };
    drawBuffer(this.stars, 1800, 0);
    if (this.active) {
      const progress = Math.min(1, (now - this.started) / 2800);
      gl.uniform1f(this.locations.uOutgoing, this.active.classList.contains('visitor') ? 1 : 0);
      drawBuffer(this.glyphs, this.count, 1, progress);
      this.active.style.setProperty('--ink', String(Math.max(0, (progress - .86) / .14)));
      if (progress === 1) this.cancel();
    }
    if (!this.paused) this.wake();
  }
}
