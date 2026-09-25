// The character ROM: every glyph on the terminal's own dot grid, 10 dots wide
// and 12 scanlines tall. VT323 (a revival of DEC's VT320 terminal font) is
// sampled at dot centres, so each glyph keeps its original pixels. Box drawing
// and block elements are drawn here, so lines join across cells like on the
// real thing. Anything else (other scripts, emoji) is traced from the system
// font as well as 120 dots allow.

export const DOTS = 10; // dots per character, horizontally
export const LINES = 12; // scanlines per character row
const BASELINE = 10; // two scanlines below the baseline for descenders
const PER_ROW = 64;
const S = 200; // sampling size: VT323 draws one dot as 0.04 em and one scanline as 0.08 em
const DOT = S * 0.04;
const LINE = S * 0.08;

// Light box drawing by its arms: [left, right, up, down]. Lines run through the
// cell centre (dots 4–5, scanline 6), so they join their neighbours.
const BOX = {
  '─': [1, 1, 0, 0], '━': [1, 1, 0, 0], '│': [0, 0, 1, 1], '┃': [0, 0, 1, 1],
  '┌': [0, 1, 0, 1], '┐': [1, 0, 0, 1], '└': [0, 1, 1, 0], '┘': [1, 0, 1, 0],
  '╭': [0, 1, 0, 1], '╮': [1, 0, 0, 1], '╰': [0, 1, 1, 0], '╯': [1, 0, 1, 0],
  '├': [0, 1, 1, 1], '┤': [1, 0, 1, 1], '┬': [1, 1, 0, 1], '┴': [1, 1, 1, 0], '┼': [1, 1, 1, 1],
};

// Double lines as dot rectangles [x0, x1, y0, y1]: two strokes at dots 2–3 and
// 6–7, scanlines 5 and 7, with proper inner and outer corners.
const DOUBLE = {
  '═': [[0, 9, 5, 5], [0, 9, 7, 7]],
  '║': [[2, 3, 0, 11], [6, 7, 0, 11]],
  '╔': [[2, 9, 5, 5], [2, 3, 5, 11], [6, 9, 7, 7], [6, 7, 7, 11]],
  '╗': [[0, 7, 5, 5], [6, 7, 5, 11], [0, 3, 7, 7], [2, 3, 7, 11]],
  '╚': [[2, 3, 0, 7], [2, 9, 7, 7], [6, 7, 0, 5], [6, 9, 5, 5]],
  '╝': [[6, 7, 0, 7], [0, 7, 7, 7], [2, 3, 0, 5], [0, 3, 5, 5]],
  '╠': [[2, 3, 0, 11], [6, 7, 0, 5], [6, 9, 5, 5], [6, 7, 7, 11], [6, 9, 7, 7]],
  '╣': [[6, 7, 0, 11], [2, 3, 0, 5], [0, 3, 5, 5], [2, 3, 7, 11], [0, 3, 7, 7]],
  '╦': [[0, 9, 5, 5], [0, 3, 7, 7], [2, 3, 7, 11], [6, 9, 7, 7], [6, 7, 7, 11]],
  '╩': [[0, 9, 7, 7], [0, 3, 5, 5], [2, 3, 0, 5], [6, 9, 5, 5], [6, 7, 0, 5]],
  '╬': [[0, 3, 5, 5], [2, 3, 0, 5], [6, 9, 5, 5], [6, 7, 0, 5], [0, 3, 7, 7], [2, 3, 7, 11], [6, 9, 7, 7], [6, 7, 7, 11]],
};

// Block elements as dot predicates (x: 0–9, y: 0–11).
const BLOCKS = {
  '█': () => true,
  '▀': (x, y) => y < 6,
  '▄': (x, y) => y >= 6,
  '▌': (x) => x < 5,
  '▐': (x) => x >= 5,
  '░': (x, y) => (x + 2 * y) % 4 === 0,
  '▒': (x, y) => (x + y) % 2 === 0,
  '▓': (x, y) => (x + 2 * y) % 4 !== 0,
  '■': (x, y) => x >= 2 && x <= 7 && y >= 4 && y <= 8,
  '▪': (x, y) => x >= 3 && x <= 6 && y >= 5 && y <= 7,
  '▲': (x, y) => y >= 3 && y <= 8 && Math.abs(x - 4.5) <= (y - 3) * 0.8 + 0.5,
  '▼': (x, y) => y >= 3 && y <= 8 && Math.abs(x - 4.5) <= (8 - y) * 0.8 + 0.5,
  '►': (x, y) => x >= 2 && x <= 8 && Math.abs(y - 5.5) <= (8 - x) * 0.45 + 0.5,
  '◄': (x, y) => x >= 1 && x <= 7 && Math.abs(y - 5.5) <= (x - 1) * 0.45 + 0.5,
};

// Terminal cells are one or two columns wide. Wide: CJK, Hangul, fullwidth forms, emoji.
export function isWide(cp) {
  return (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f)
    || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f)
    || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff)
    || (cp >= 0x20000 && cp <= 0x3fffd);
}

export class Rom {
  width = PER_ROW * DOTS;
  height = PER_ROW * LINES;
  data = new Uint8Array(this.width * this.height); // one byte per dot
  version = 0; // bumps when a glyph is added, so the renderer re-uploads
  #map = new Map([[' ', [0]]]);
  #next = 1;
  #ctx;

  // Needs VT323 on the page (Google Fonts). Resolves once the ASCII set is in.
  async load() {
    try {
      await document.fonts.load(`${S}px VT323`);
    } catch {
      // Falls back to tracing the system font.
    }
    const canvas = document.createElement('canvas');
    canvas.width = DOT * DOTS * 2 + 32;
    canvas.height = LINE * LINES;
    this.#ctx = canvas.getContext('2d', { willReadFrequently: true });
    for (let c = 33; c < 127; c++) this.cells(String.fromCharCode(c));
    for (const ch of [...Object.keys(BOX), ...Object.keys(DOUBLE), ...Object.keys(BLOCKS)]) this.cells(ch);
  }

  // Glyph indices for one character (a single code point): [glyph] or [left, right].
  cells(ch) {
    const known = this.#map.get(ch);
    if (known) return known;
    const cp = ch.codePointAt(0);
    const wide = isWide(cp);
    const indices = wide ? [this.#allocate(), this.#allocate()] : [this.#allocate()];
    if (indices.includes(-1)) return wide ? [0, 0] : [0]; // ROM full: blank
    const bits = BOX[ch] ? drawBox(BOX[ch])
      : DOUBLE[ch] ? drawRects(DOUBLE[ch])
      : BLOCKS[ch] ? drawBlock(BLOCKS[ch])
      : this.#trace(ch, wide);
    indices.forEach((index, half) => this.#store(index, bits, half));
    this.#map.set(ch, indices);
    this.version++;
    return indices;
  }

  #allocate() {
    return this.#next < PER_ROW * PER_ROW ? this.#next++ : -1;
  }

  #store(index, bits, half) {
    const ox = (index % PER_ROW) * DOTS;
    const oy = Math.floor(index / PER_ROW) * LINES;
    const stride = bits.length / LINES;
    for (let y = 0; y < LINES; y++) {
      for (let x = 0; x < DOTS; x++) this.data[(oy + y) * this.width + ox + x] = bits[y * stride + half * DOTS + x];
    }
  }

  // Samples VT323 at dot centres, or traces another font by dot coverage.
  #trace(ch, wide) {
    const ctx = this.#ctx;
    const w = DOTS * (wide ? 2 : 1);
    const bits = new Uint8Array(w * LINES);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${S}px VT323`;
    const native = !wide && Math.abs(ctx.measureText(ch).width - S * 0.4) < 0.5;
    if (native) {
      ctx.fillText(ch, 0, BASELINE * LINE);
      const img = ctx.getImageData(0, 0, DOTS * DOT, LINES * LINE).data;
      for (let y = 0; y < LINES; y++) {
        for (let x = 0; x < DOTS; x++) {
          const px = Math.floor((x + 0.5) * DOT), py = Math.floor((y + 0.5) * LINE);
          bits[y * w + x] = img[(py * DOTS * DOT + px) * 4 + 3] > 127 ? 255 : 0;
        }
      }
      return bits;
    }
    // Not in VT323: fit the system font's glyph into the cell and trace its coverage.
    const size = wide ? S * 0.78 : S * 0.62;
    ctx.font = `${size}px ui-monospace, Menlo, Consolas, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    const width = ctx.measureText(ch).width || 1;
    const scale = Math.min(1, (w * DOT) / width);
    ctx.save();
    ctx.translate((w * DOT - width * scale) / 2, BASELINE * LINE - LINE * 0.2);
    ctx.scale(scale, 1);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    const img = ctx.getImageData(0, 0, w * DOT, LINES * LINE).data;
    for (let y = 0; y < LINES; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let sy = 0; sy < LINE; sy += 2) {
          for (let sx = 0; sx < DOT; sx += 2) sum += img[((y * LINE + sy) * w * DOT + x * DOT + sx) * 4 + 3];
        }
        const coverage = sum / ((LINE / 2) * (DOT / 2) * 255);
        bits[y * w + x] = Math.round(255 * Math.min(1, Math.max(0, (coverage - 0.12) / 0.4)));
      }
    }
    return bits;
  }
}

function drawBlock(test) {
  const bits = new Uint8Array(DOTS * LINES);
  for (let y = 0; y < LINES; y++) for (let x = 0; x < DOTS; x++) bits[y * DOTS + x] = test(x, y) ? 255 : 0;
  return bits;
}

function drawBox([left, right, up, down]) {
  const rects = [];
  if (left || right) rects.push([left ? 0 : 4, right ? DOTS - 1 : 5, 6, 6]);
  if (up || down) rects.push([4, 5, up ? 0 : 6, down ? LINES - 1 : 6]);
  return drawRects(rects);
}

function drawRects(rects) {
  const bits = new Uint8Array(DOTS * LINES);
  for (const [x0, x1, y0, y1] of rects) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) bits[y * DOTS + x] = 255;
  }
  return bits;
}
