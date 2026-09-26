// Original procedural artwork: sine terrain, a rotating dot torus, and a tunnel.
// Canvas 2D keeps the example copyable without a WebGL dependency.
export class ParticleScene {
  constructor(canvas, hero) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.hero = hero;
    this.effect = 0;
    this.previousEffect = 0;
    this.effectMix = 1;
    this.time = 0;
    this.pointer = { x: 0, y: 0 };
    this.cursor = { x: -1000, y: -1000 };
    this.gather = 0;
    this.journey = 0;
    this.engaged = false;
    this.targets = [];
    this.greeting = hero.querySelector('.greeting-text');
    if (this.ctx) hero.style.setProperty('--invite-ink', '0');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.paused = this.reduced.matches;
    this.visible = true;
    this.last = 0;
    this.frame = 0;
    this.colors = Array.from({ length: 48 }, (_, i) => `hsl(${157 + i * 1.5} 64% ${67 - i * .6}%)`);
    this.resize = () => {
      this.width = innerWidth;
      this.height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(this.width * ratio);
      canvas.height = Math.round(this.height * ratio);
      this.ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.measure();
      this.sampleGreeting();
      this.wake();
    };
    this.measure = () => {
      const bounds = hero.getBoundingClientRect();
      this.originY = bounds.top;
      this.visible = bounds.bottom > 0 && bounds.top < innerHeight;
      const track = hero.parentElement.getBoundingClientRect();
      this.journey = Math.max(0, Math.min(1, -track.top / Math.max(1, track.height - bounds.height)));
      hero.style.setProperty('--journey', this.paused ? '0' : String(this.journey));
      this.greetingBounds = this.greeting.getBoundingClientRect();
    };
    addEventListener('resize', this.resize);
    visualViewport?.addEventListener('resize', this.resize);
    addEventListener('scroll', () => { this.measure(); this.wake(); }, { passive: true });
    addEventListener('pointermove', event => {
      this.pointer.x = (event.clientX / this.width - .5) * 2;
      this.pointer.y = (event.clientY / this.height - .5) * 2;
      this.cursor = { x: event.clientX, y: event.clientY };
    }, { passive: true });
    document.addEventListener('visibilitychange', () => this.wake());
    this.resize();
  }

  // Layout is measured only on resize. The same landscape dots become letters.
  sampleGreeting() {
    if (!this.ctx || !this.greeting) return;
    const mask = document.createElement('canvas');
    mask.width = this.width; mask.height = Math.max(this.height, this.hero.offsetHeight);
    const ctx = mask.getContext('2d', { willReadFrequently: true });
    const style = getComputedStyle(this.greeting);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    const ascent = ctx.measureText('Mg').fontBoundingBoxAscent || parseFloat(style.fontSize) * .82;
    const walker = document.createTreeWalker(this.greeting, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let node;
    while ((node = walker.nextNode())) {
      let offset = 0;
      for (const char of node.textContent) {
        range.setStart(node, offset); offset += char.length; range.setEnd(node, offset);
        const box = range.getBoundingClientRect();
        if (char.trim()) ctx.fillText(char, box.left, box.top - this.originY + ascent);
      }
    }
    const pixels = ctx.getImageData(0, 0, mask.width, mask.height).data;
    this.targets = [];
    for (let y = 0; y < mask.height; y += 2) {
      for (let x = 0; x < mask.width; x += 2) {
        if (pixels[(y * mask.width + x) * 4 + 3] > 90) this.targets.push({ x, y });
      }
    }
    this.greetingBounds = this.greeting.getBoundingClientRect();
  }

  engage(value) { this.engaged = value; this.wake(); }

  select(effect) {
    this.previousEffect = this.effect;
    this.effect = effect;
    this.effectMix = this.paused ? 1 : 0;
    this.wake();
  }

  setPaused(value) {
    this.paused = value;
    if (value) this.effectMix = 1;
    this.hero.style.setProperty('--invite-ink', value ? '1' : '0');
    this.wake();
  }

  wake() {
    if (!this.frame && this.ctx && !document.hidden) this.frame = requestAnimationFrame(now => this.draw(now));
  }

  position(effect, u, v, time) {
    const w = this.width, h = this.height;
    const mobile = w < 600;
    const cx = w * (mobile ? .72 : .71) + this.pointer.x * 13;
    const cy = this.originY + (mobile ? 520 : Math.min(425, h * .48));
    if (effect === 0) {
      const x = (u - .5) * 31;
      const z = v * 28;
      const hill = Math.sin(x * .39 + time * .48) * 1.8 + Math.cos(z * .32 - time * .6) * 1.8
        + Math.sin(x * .24 + z * .35 + time * .28) * 1.3;
      const scale = (mobile ? 330 : w * .57) / (z + 9);
      return { x: cx + x * scale, y: cy + (3 - hill + this.pointer.y * .2) * scale - v * 135, z: v, size: Math.min(3, scale * .044) };
    }
    if (effect === 1) {
      const a = u * Math.PI * 2, b = v * Math.PI * 2;
      const r = 2.4 + .85 * Math.cos(b);
      const x = r * Math.cos(a), y = r * Math.sin(a), z = Math.sin(b) * .85;
      const turn = time * .18 + .45;
      const rx = x * Math.cos(turn) + z * Math.sin(turn);
      const rz = -x * Math.sin(turn) + z * Math.cos(turn);
      const tilt = .72;
      const ry = y * Math.cos(tilt) - rz * Math.sin(tilt);
      const depth = y * Math.sin(tilt) + rz * Math.cos(tilt);
      const scale = Math.min(w * .53, mobile ? 300 : 640) / (depth + 7);
      return { x: cx + rx * scale, y: cy - 5 + ry * scale, z: (depth + 4) / 8, size: Math.max(.6, scale * .017) };
    }
    const angle = u * Math.PI * 2 + v * 3 + time * .14;
    const depth = 1 + v * 11;
    const radius = Math.min(w, 1100) * .85 / depth;
    return { x: cx + Math.cos(angle) * radius + Math.sin(time * .35 + v * 3) * 35,
      y: cy + Math.sin(angle) * radius * .8, z: v, size: 2.8 - v * 2.2 };
  }

  draw(now) {
    this.frame = 0;
    if (document.hidden || !this.visible) { this.last = 0; return; }
    const dt = Math.min((now - (this.last || now)) / 1000, .05);
    this.last = now;
    if (!this.paused) {
      this.time += dt * (1 + this.journey * .7);
      this.effectMix = Math.min(1, this.effectMix + dt * 1.2);
    }
    const box = this.greetingBounds;
    const distance = box ? Math.hypot(this.cursor.x - (box.left + box.width / 2), this.cursor.y - (box.top + box.height / 2)) : 1000;
    const proximity = Math.max(0, 1 - distance / (this.width < 600 ? 250 : 480));
    // A slow unsolicited hello; moving closer or scrolling completes it sooner.
    const idleHello = Math.max(0, Math.min(1, (this.time - .8) / 1.7));
    const target = this.paused ? 0 : Math.min(1, Math.max(idleHello, this.journey * 1.7, proximity * 1.25, this.engaged ? 1 : 0));
    this.gather += (target - this.gather) * Math.min(1, dt * 2.7);
    if (Math.abs(target - this.gather) < .006) this.gather = target;
    const gather = this.paused ? 0 : this.gather;
    this.hero.style.setProperty('--invite-ink', this.paused ? '1' : String(Math.max(0, (gather - .97) / .03) * .65));
    this.hero.style.setProperty('--gather', String(gather));
    const ctx = this.ctx, w = this.width, h = this.height;
    ctx.fillStyle = '#090e16';
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * .74, h * .58, 0, w * .74, h * .58, w * .57);
    glow.addColorStop(0, '#183e3b38'); glow.addColorStop(.65, '#142b3512'); glow.addColorStop(1, '#090e1600');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    const columns = w < 600 ? 66 : 90, rows = 56;
    const mix = this.effectMix * this.effectMix * (3 - 2 * this.effectMix);
    // Iterating far to near gives the dot landscape its depth, without sorting.
    for (let row = rows - 1; row >= 0; row--) {
      for (let col = 0; col < columns; col++) {
        const index = row * columns + col;
        const u = col / (columns - 1), v = row / (rows - 1);
        const p = this.position(this.effect, u, v, this.time);
        if (mix < 1) {
          const old = this.position(this.previousEffect, u, v, this.time);
          p.x = old.x + (p.x - old.x) * mix;
          p.y = old.y + (p.y - old.y) * mix;
        }
        let { x, y } = p;
        const letter = index % 5 !== 0 && this.targets.length;
        if (letter) {
          const point = this.targets[(index * 31) % this.targets.length];
          const twist = Math.sin(index * .17 + this.time * 2) * 26 * gather * (1 - gather);
          x += (point.x - x) * gather;
          y += (point.y + this.originY - y) * gather + twist;
        }
        // A small gravity well follows the pointer; settled words stay readable.
        const dx = x - this.cursor.x, dy = y - this.cursor.y;
        const lens = Math.max(0, 1 - Math.hypot(dx, dy) / 170);
        if (!this.paused) {
          x += dx * lens * .32 * (letter ? 1 - gather * .92 : 1);
          y += dy * lens * .32 * (letter ? 1 - gather * .92 : 1);
        }
        if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
        ctx.globalAlpha = Math.min(1, Math.max(.06, .28 + (1 - p.z) * .55 + (letter ? gather * .4 : lens * .5)));
        ctx.fillStyle = letter && gather > .65 ? '#c7f7c6' : this.colors[Math.min(47, Math.floor(v * 47))];
        const size = Math.max(.7, p.size * (1 - gather) + (letter ? 1.3 : p.size) * gather);
        ctx.fillRect(x, y, size, size);
      }
    }
    ctx.globalAlpha = 1;
    // Fade the artwork behind the copy, while leaving the right-hand terrain vivid.
    const shade = ctx.createLinearGradient(0, 0, w * .64, 0);
    shade.addColorStop(0, `rgba(9,14,22,${.92 * (1 - gather)})`);
    shade.addColorStop(.5, `rgba(9,14,22,${.65 * (1 - gather)})`);
    shade.addColorStop(1, 'rgba(9,14,22,0)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
    if (!this.paused) this.wake();
  }
}
