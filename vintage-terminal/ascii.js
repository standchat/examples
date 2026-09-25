// Pictures made of characters, the way BBS art arrived over a modem.
//
// portrait() turns an image into ASCII art. Each cell picks a character by
// density first, then, among characters of about that density, by shape: the
// dot patterns come from the terminal's own ROM, so edges get / \ | _ and
// flat tones get . : + # @.

import { DOTS, LINES } from './rom.js';

const CHARSET = [...' .\'`,:;-_~"^!|/\\()<>+=*#%@&8$oO0'];
const FX = 2; // features per cell: 2 columns…
const FY = 4; // …by 4 rows of the 10 × 12 dot cell

// The characters' dot coverage, measured once from the ROM, scaled so the
// densest character is 1.
let glyphs = null;
function measure(rom) {
  if (glyphs) return glyphs;
  const raw = CHARSET.map((ch) => {
    const [index] = rom.cells(ch);
    const ox = (index % 64) * DOTS;
    const oy = Math.floor(index / 64) * LINES;
    const f = new Float32Array(FX * FY);
    for (let y = 0; y < LINES; y++) {
      for (let x = 0; x < DOTS; x++) {
        const v = rom.data[(oy + y) * rom.width + ox + x] / 255;
        f[Math.min(FY - 1, Math.floor((y * FY) / LINES)) * FX + Math.floor((x * FX) / DOTS)] += v / ((DOTS / FX) * (LINES / FY));
      }
    }
    return { ch, f, mean: f.reduce((a, b) => a + b, 0) / f.length };
  });
  const max = Math.max(...raw.map((g) => g.mean));
  glyphs = raw.map((g) => ({ ch: g.ch, mean: g.mean / max, f: g.f.map((v) => v / max) }));
  return glyphs;
}

function load(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous'; // pixels are readable only if the server allows CORS
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

// Returns lines of text, or null when the image can't be read.
export async function portrait(url, rom, cols, rows) {
  let image;
  try {
    image = await load(url);
  } catch {
    return null;
  }
  // A cell is 10 dots by 12 scanlines, and a scanline is twice as tall as a dot.
  const cellAspect = (LINES * 2) / DOTS;
  const side = Math.min(cols, rows * cellAspect);
  const w = Math.max(4, Math.round(side));
  const h = Math.max(4, Math.round(side / cellAspect));
  const SS = 4; // supersampling per feature
  const canvas = document.createElement('canvas');
  canvas.width = w * FX * SS;
  canvas.height = h * FY * SS;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const s = Math.min(image.naturalWidth, image.naturalHeight); // centre square crop
  ctx.drawImage(image, (image.naturalWidth - s) / 2, (image.naturalHeight - s) / 2, s, s, 0, 0, canvas.width, canvas.height);
  let pixels;
  try {
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return null; // tainted by a cross-origin image without CORS
  }

  // Photos: luminance. Illustrations on a flat background (common in avatars):
  // how far each pixel is from the background, so dark lines light up too.
  const W = canvas.width;
  const n = W * canvas.height;
  const border = [];
  for (let x = 0; x < W; x += 3) border.push(x, (canvas.height - 1) * W + x);
  for (let y = 0; y < canvas.height; y += 3) border.push(y * W, y * W + W - 1);
  const bg = [0, 1, 2].map((c) => border.reduce((sum, p) => sum + pixels[p * 4 + c], 0) / border.length);
  const spread = border.reduce((sum, p) => sum + Math.hypot(...[0, 1, 2].map((c) => pixels[p * 4 + c] - bg[c])), 0) / border.length;
  const flat = spread < 28;
  const luminance = new Float32Array(n);
  const mask = new Float32Array(n).fill(1);
  const subject = [];
  for (let i = 0; i < n; i++) {
    const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2], a = pixels[i * 4 + 3] / 255;
    const distance = Math.hypot(r - bg[0], g - bg[1], b - bg[2]) / 441.7;
    luminance[i] = flat ? a * distance : (a * (0.2126 * r + 0.7152 * g + 0.0722 * b)) / 255;
    if (flat) mask[i] = Math.min(1, Math.max(0, (distance - 0.04) / 0.1));
    if (mask[i] > 0.5) subject.push(luminance[i]);
  }
  // Auto levels over the subject only.
  subject.sort((a, b) => a - b);
  const lo = flat ? 0 : subject[Math.floor(subject.length * 0.02)] ?? 0;
  const hi = Math.max(lo + 0.08, subject[Math.floor(subject.length * 0.98)] ?? 1);
  const value = new Float32Array(n);
  for (let i = 0; i < n; i++) value[i] = Math.min(1, Math.max(0, (luminance[i] - lo) / (hi - lo))) * mask[i];
  const tone = (v) => v;

  const set = measure(rom);
  const lines = [];
  const cell = new Float32Array(FX * FY);
  for (let cy = 0; cy < h; cy++) {
    let line = '';
    for (let cx = 0; cx < w; cx++) {
      let mean = 0;
      for (let fy = 0; fy < FY; fy++) {
        for (let fx = 0; fx < FX; fx++) {
          let sum = 0;
          for (let sy = 0; sy < SS; sy++) {
            for (let sx = 0; sx < SS; sx++) sum += value[((cy * FY + fy) * SS + sy) * W + (cx * FX + fx) * SS + sx];
          }
          const v = Math.pow(tone(sum / (SS * SS)), 1.15);
          cell[fy * FX + fx] = v;
          mean += v / cell.length;
        }
      }
      // Density first: the characters closest in weight. Then the best shape.
      let best = ' ';
      let bestError = Infinity;
      for (const g of set) {
        const weight = (g.mean - mean) ** 2 * 10;
        if (weight > bestError) continue;
        let error = weight;
        for (let k = 0; k < cell.length; k++) error += (cell[k] - g.f[k]) ** 2 * 0.35;
        if (error < bestError) {
          bestError = error;
          best = g.ch;
        }
      }
      line += best;
    }
    lines.push(line.trimEnd());
  }
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

// Stand's logo (a market stand with a smile) for when there's no avatar to draw.
// Stand's name, logo and mascot aren't covered by this repository's license.
export const STAND_LOGO = [
  ' ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
  '██████████████████████████████████',
  '██████████████████████████████████',
  '▀▀██▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀██▀▀',
  '  ██                          ██',
  '  ██                          ██',
  '  ██                          ██',
  '  ██         ██    ██         ██',
  '  ██                          ██',
  '  ██       ▄▄▄▄▄▄▄▄▄▄▄▄       ██',
  '  ██       ▀██████████▀       ██',
  '  ██         ▀▀▀▀▀▀▀▀         ██',
  '  ██                          ██',
  '  ▀▀                          ▀▀',
];

export const STAND_WORDMARK = [
  ' ▄▀▀▀▀ ▀▀█▀▀ ▄▀▀▀▄ █▄  █ █▀▀▀▄',
  ' ▀▀▀▀▄   █   █▄▄▄█ █ ▀▄█ █   █',
  ' ▀▀▀▀    ▀   ▀   ▀ ▀   ▀ ▀▀▀▀ ',
];
