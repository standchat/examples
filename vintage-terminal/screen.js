// The terminal's text model: a title bar, a scrolling output region that
// prints at a modem's pace, an input line and a status bar. It fills a small
// float array of cells for the CRT to draw and never touches the DOM.

import { DOTS, LINES } from './rom.js';

// Cell attributes (bit flags).
export const BRIGHT = 1;
export const DIM = 2;
export const INVERSE = 4;
export const UNDERLINE = 8;
export const BLINK = 16;
export const LINK = 32;

// Emoji become the emoticons a BBS would have used.
const EMOTICONS = new Map(Object.entries({
  '👋': 'o/', '🙂': ':)', '😊': ':)', '☺': ':)', '😀': ':D', '😃': ':D', '😄': ':D', '😁': ':D', '😆': 'XD',
  '😂': 'XD', '🤣': 'XD', '😉': ';)', '😍': '<3', '🥰': '<3', '❤': '<3', '💚': '<3', '💛': '<3', '💙': '<3',
  '🧡': '<3', '💜': '<3', '🖤': '<3', '👍': '(y)', '👎': '(n)', '🙏': '_/\\_', '🎉': '\\o/', '🙌': '\\o/',
  '🥳': '\\o/', '😅': '^^;', '😬': ':-S', '🤔': ':-?', '😮': ':O', '😯': ':O', '😲': ':O', '😢': ":'(",
  '😭': 'T_T', '😞': ':(', '🙁': ':(', '😕': ':/', '😐': ':|', '😎': 'B)', '😜': ';P', '😛': ':P', '🤓': '8)',
  '🤖': '[o_o]', '👀': 'o_o', '✨': '*', '⭐': '*', '🌟': '*', '🔥': '(!)', '💡': '(i)', '✅': '[x]',
  '✔': 'v', '❌': 'x', '⚠': '(!)', '🚀': '>>>', '👉': '->', '👈': '<-', '➡': '->', '⬅': '<-', '💬': '...',
}));

// Plain, printable text: one array entry per terminal character.
export function normalize(text) {
  const out = [];
  for (const ch of String(text).normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, '  ')) {
    const cp = ch.codePointAt(0);
    if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x1f3fb && cp <= 0x1f3ff) || (cp >= 0xe0020 && cp <= 0xe007f)) continue;
    if ((cp < 32 && ch !== '\n') || (cp >= 0x7f && cp < 0xa0)) continue;
    if (cp >= 0x300 && cp <= 0x36f) continue; // stray combining marks
    const emoticon = EMOTICONS.get(ch);
    if (emoticon) out.push(...emoticon);
    else out.push(ch);
  }
  return out;
}

// Greedy word wrap into lines of { start, cells: [{ i, col }] }, where i indexes
// chars. Continuation lines start at `indent`; over-long words are split.
function wrap(chars, cols, indent) {
  indent = Math.max(0, Math.min(indent, cols - 12));
  const lines = [];
  let line = { start: 0, cells: [] };
  let col = 0;
  let soft = false; // right after an automatic wrap, spaces are dropped
  const next = (start, isSoft) => {
    lines.push(line);
    line = { start, cells: [] };
    col = indent;
    soft = isSoft;
  };
  for (let i = 0; i < chars.length;) {
    const c = chars[i];
    if (c.ch === '\n') {
      next(i + 1, false);
      i++;
    } else if (c.ch === ' ') {
      if (!soft) {
        if (col >= cols) next(i + 1, true);
        else line.cells.push({ i, col: col++ });
      }
      i++;
    } else {
      let j = i;
      let width = 0;
      while (j < chars.length && chars[j].ch !== ' ' && chars[j].ch !== '\n') width += chars[j++].w;
      if (col + width > cols && col > indent) next(i, true);
      for (let k = i; k < j; k++) {
        if (col + chars[k].w > cols) next(k, true);
        line.cells.push({ i: k, col });
        col += chars[k].w;
      }
      soft = false;
      i = j;
    }
  }
  lines.push(line);
  return lines;
}

export class Screen {
  baud = 1200; // characters per second = baud / 10 (8 data bits plus start and stop bits)
  title = { left: '', right: '' };
  status = { left: '', right: '' };
  input = { visible: false, prompt: '> ', text: '', caret: 0 };
  cursor = { col: 0, row: 0, visible: false };
  scroll = 0; // scanlines the output region is scrolled by (smooth scrolling)
  region = { top: 1, bottom: 22 };
  links = new Map(); // link id → whatever the caller attached (url, messageId…)
  following = true; // false while the visitor reads the scrollback
  newBelow = false; // output arrived below the scrollback being read

  #blocks = [];
  #lines = []; // flat and wrapped: { block, start, cells }
  #queue = [];
  #budget = 0;
  #top = 0; // first visible line, fractional while scrolling
  #head = -1; // last line with printed content
  #nextId = 1;
  #nextLink = 1;
  #changed = true;

  constructor(rom, cols = 80, rows = 25) {
    this.rom = rom;
    this.resize(cols, rows);
  }

  // True while the modem still has characters to send.
  get busy() {
    return this.#queue.length > 0;
  }

  resize(cols, rows) {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.cells = new Float32Array((rows + 1) * cols * 4); // a spare row below for smooth scrolling
    for (const block of this.#blocks) block.lines = wrap(block.chars, cols, block.indent);
    this.#reflow();
    this.#render();
    this.#top = this.#target();
    this.#changed = true;
  }

  // Queues styled text for the modem. spans: [{ text, attr, link }].
  // options: cps (characters per second; Infinity prints at once), indent
  // (hanging indent), hot (fresh characters glow), onDone.
  print(spans, options = {}) {
    const block = {
      id: this.#nextId++,
      chars: [],
      links: [],
      indent: options.indent ?? 0,
      revealed: 0,
      times: new Float32Array(0),
      cps: options.cps ?? null,
      hot: options.hot ?? true,
      done: false,
      onDone: options.onDone ?? null,
      lines: [],
    };
    this.#setChars(block, spans);
    block.lines = wrap(block.chars, this.cols, block.indent);
    this.#blocks.push(block);
    this.#reflow();
    this.#queue.push(block);
    if (block.cps === Infinity && this.#queue.length === 1) this.#advance(0, performance.now() / 1000);
    this.#changed = true;
    return block;
  }

  // Nothing on the line for a while.
  pause(ms, onDone) {
    this.#queue.push({ pause: ms / 1000, onDone, done: false });
  }

  // Replaces a block's text. What already printed stays if it is still a prefix.
  update(block, spans) {
    const before = block.chars.map((c) => c.ch);
    this.#setChars(block, spans);
    const keeps = before.slice(0, block.revealed).every((ch, i) => block.chars[i]?.ch === ch);
    block.revealed = keeps ? Math.min(block.revealed, block.chars.length) : 0;
    block.lines = wrap(block.chars, this.cols, block.indent);
    this.#reflow();
    if (block.revealed < block.chars.length && !this.#queue.includes(block)) {
      block.done = false;
      this.#queue.push(block);
    }
    this.#changed = true;
  }

  remove(block) {
    for (const id of block.links) this.links.delete(id);
    this.#blocks = this.#blocks.filter((b) => b !== block);
    this.#queue = this.#queue.filter((b) => b !== block);
    this.#reflow();
    this.#changed = true;
  }

  // Form feed: clears the output region and drops anything still queued.
  clear() {
    this.#blocks = [];
    this.#queue = [];
    this.links.clear();
    this.#reflow();
    this.#top = 0;
    this.following = true;
    this.newBelow = false;
    this.#changed = true;
  }

  // Prints everything queued right away.
  flush() {
    const queue = this.#queue;
    this.#queue = [];
    const now = performance.now() / 1000;
    for (const block of queue) {
      if (block.chars) this.#reveal(block, block.chars.length, block.hot, now);
      block.done = true;
    }
    this.#reflow();
    for (const block of queue) block.onDone?.();
    this.#changed = true;
  }

  // Scrollback: positive values scroll towards older output.
  scrollBy(lines) {
    const max = this.#target(true);
    const top = Math.max(0, Math.min(max, Math.round(this.#top) - lines));
    this.#top = top;
    this.following = top >= this.#target();
    if (this.following) this.newBelow = false;
    this.#changed = true;
  }

  scrollToEnd() {
    this.following = true;
    this.newBelow = false;
    this.#changed = true;
  }

  // Marks the screen for redraw (after the caller changed bars or input).
  touch() {
    this.#changed = true;
  }

  // Advances the modem and the smooth scroll. Returns true if the screen changed.
  tick(now, dt) {
    this.#advance(dt, now);
    const target = this.following ? this.#target() : this.#top;
    if (target !== this.#top) {
      // Smooth scroll in whole scanlines, like a VT100, catching up when far behind.
      const gap = target - this.#top;
      const visible = this.region.bottom - this.region.top + 1;
      if (Math.abs(gap) > visible) this.#top = target - Math.sign(gap) * visible;
      const step = (9 + Math.abs(gap) * 6) * dt;
      this.#top = Math.abs(target - this.#top) <= step ? target : this.#top + Math.sign(gap) * step;
      this.#changed = true;
    }
    if (!this.#changed) return false;
    this.#changed = false;
    this.#render();
    return true;
  }

  // What is under a point in signal space: dots and scanlines from the top left.
  hitTest(dotX, lineY) {
    const col = Math.floor(dotX / DOTS);
    let row = Math.floor(lineY / LINES);
    const top = this.region.top * LINES;
    if (lineY >= top && lineY < (this.region.bottom + 1) * LINES) {
      row = this.region.top + Math.floor((lineY - top + this.scroll) / LINES);
      if (row > this.region.bottom) row = this.rows; // the spare row
    }
    if (col < 0 || col >= this.cols || row < 0 || row > this.rows) return null;
    const id = this.cells[(row * this.cols + col) * 4 + 3];
    return { row, col, link: id ? this.links.get(id) ?? null : null, linkId: id };
  }

  #advance(dt, now) {
    this.#budget = Math.min(this.#budget + dt, 0.25);
    let reflow = false;
    while (this.#queue.length) {
      const block = this.#queue[0];
      if (block.pause !== undefined) {
        const spend = Math.min(this.#budget, block.pause);
        block.pause -= spend;
        this.#budget -= spend;
        if (block.pause > 1e-6) break;
      } else {
        const cps = block.cps ?? this.baud / 10;
        let count = block.revealed;
        if (cps === Infinity) count = block.chars.length;
        while (count < block.chars.length && this.#budget > 0) {
          this.#budget -= (block.chars[count].ch === '\n' ? 2 : 1) / cps;
          count++;
        }
        if (count > block.revealed) this.#reveal(block, count, block.hot, now);
        if (block.revealed < block.chars.length) break;
      }
      this.#queue.shift();
      block.done = true;
      reflow = true;
      block.onDone?.();
    }
    if (!this.#queue.length) this.#budget = 0;
    if (reflow) this.#reflow();
  }

  #reveal(block, count, hot, now) {
    if (block.times.length < block.chars.length) {
      const times = new Float32Array(block.chars.length).fill(-1);
      times.set(block.times);
      block.times = times;
    }
    for (let i = block.revealed; i < count; i++) block.times[i] = hot ? now : -1;
    block.revealed = count;
    const line = this.#lineOf(block, count - 1);
    if (line > this.#head) this.#head = line;
    if (!this.following) this.newBelow = true;
    this.#changed = true;
  }

  #setChars(block, spans) {
    for (const id of block.links) this.links.delete(id);
    block.links = [];
    const chars = [];
    for (const span of spans) {
      let link = 0;
      if (span.link) {
        link = this.#nextLink++;
        this.links.set(link, span.link);
        block.links.push(link);
      }
      const attr = (span.attr ?? 0) | (link ? LINK : 0);
      for (const ch of normalize(span.text ?? '')) {
        const glyphs = ch === '\n' ? [0] : this.rom.cells(ch);
        chars.push({ ch, g: glyphs, w: glyphs.length, attr, link });
      }
    }
    block.chars = chars;
    if (block.times.length > chars.length) block.times = block.times.slice(0, chars.length);
  }

  #reflow() {
    this.#lines = [];
    for (const block of this.#blocks) for (const line of block.lines) this.#lines.push({ block, ...line });
    const excess = this.#lines.length - 2000; // bounded scrollback
    if (excess > 0) {
      const keep = this.#lines[excess].block;
      for (const block of this.#blocks.slice(0, this.#blocks.indexOf(keep))) for (const id of block.links) this.links.delete(id);
      this.#blocks = this.#blocks.slice(this.#blocks.indexOf(keep));
      this.#lines = this.#lines.filter((line) => this.#blocks.includes(line.block));
      this.#top = Math.max(0, this.#top - excess);
    }
    this.#head = -1;
    for (let i = this.#lines.length - 1; i >= 0; i--) {
      if (this.#printed(this.#lines[i])) {
        this.#head = i;
        break;
      }
    }
  }

  #printed(line) {
    return line.block.done || line.start < line.block.revealed;
  }

  #lineOf(block, charIndex) {
    for (let i = this.#lines.length - 1; i >= 0; i--) {
      const line = this.#lines[i];
      if (line.block === block && line.start <= Math.max(0, charIndex)) return i;
    }
    return this.#head;
  }

  #target(all = false) {
    const visible = this.region.bottom - this.region.top + 1;
    const last = all ? this.#lines.length - 1 : this.#head;
    return Math.max(0, last - visible + 1);
  }

  #render() {
    const { cols, rows, cells } = this;
    cells.fill(0);
    const put = (row, col, glyph, attr, time = -1, link = 0) => {
      if (col < 0 || col >= cols) return;
      const k = (row * cols + col) * 4;
      cells[k] = glyph;
      cells[k + 1] = attr;
      cells[k + 2] = time;
      cells[k + 3] = link;
    };
    const glyphsOf = (string) => normalize(string).map((ch) => this.rom.cells(ch));
    const write = (row, col, glyphs, attr) => {
      for (const g of glyphs) {
        g.forEach((index, h) => put(row, col + h, index, attr));
        col += g.length;
      }
    };
    const bar = (row, { left, right }) => {
      for (let col = 0; col < cols; col++) put(row, col, 0, INVERSE);
      let r = glyphsOf(right ?? '');
      while (r.flat().length > cols - 2) r = r.slice(1);
      const rightWidth = r.flat().length;
      let l = glyphsOf(left ?? '');
      while (l.flat().length > Math.max(0, cols - rightWidth - 3)) l = l.slice(0, -1);
      write(row, 1, l, INVERSE);
      write(row, cols - 1 - rightWidth, r, INVERSE);
    };
    bar(0, this.title);
    bar(rows - 1, this.status);

    const inputLines = this.#inputLines();
    this.region = { top: 1, bottom: rows - 2 - inputLines.length };

    // The output region, plus the spare row below it for smooth scrolling.
    const first = Math.floor(this.#top);
    this.scroll = Math.round((this.#top - first) * LINES);
    const visible = this.region.bottom - this.region.top + 1;
    for (let r = 0; r <= visible; r++) {
      const line = this.#lines[first + r];
      if (!line) continue;
      const row = r === visible ? rows : this.region.top + r;
      const { block } = line;
      for (const { i, col } of line.cells) {
        if (i >= block.revealed) continue;
        const c = block.chars[i];
        c.g.forEach((g, h) => put(row, col + h, g, c.attr, block.times[i] ?? -1, c.link));
      }
    }

    // The prompt and draft, with the cursor at the caret.
    this.cursor = { col: 0, row: 0, visible: false };
    inputLines.forEach((line, k) => {
      const row = this.region.bottom + 1 + k;
      for (const cell of line.cells) put(row, cell.col, cell.g, cell.attr);
      if (line.caret !== undefined) this.cursor = { col: Math.min(line.caret, cols - 1), row, visible: true };
    });
  }

  // Character-wrapped prompt and draft: at most three lines, around the caret.
  #inputLines() {
    const { visible, prompt, text, caret } = this.input;
    if (!visible) return [];
    const chars = [];
    for (const ch of normalize(prompt)) chars.push({ g: this.rom.cells(ch), attr: BRIGHT });
    const promptLength = chars.length;
    const draft = normalize(text);
    for (const ch of draft) chars.push({ g: this.rom.cells(ch === '\n' ? '↵' : ch), attr: 0 });
    const caretIndex = promptLength + Math.min(normalize(text.slice(0, caret)).length, draft.length);
    const lines = [{ cells: [] }];
    let col = 0;
    let caretLine = 0;
    let caretCol = 0;
    chars.forEach((c, index) => {
      if (col + c.g.length > this.cols) {
        lines.push({ cells: [] });
        col = 0;
      }
      if (index === caretIndex) {
        caretLine = lines.length - 1;
        caretCol = col;
      }
      c.g.forEach((g, h) => lines[lines.length - 1].cells.push({ col: col + h, g, attr: c.attr }));
      col += c.g.length;
    });
    if (caretIndex >= chars.length) {
      if (col >= this.cols) {
        lines.push({ cells: [] });
        col = 0;
      }
      caretLine = lines.length - 1;
      caretCol = col;
    }
    const start = Math.max(0, Math.min(caretLine - 1, lines.length - 3));
    const shown = lines.slice(start, start + 3);
    shown[caretLine - start].caret = caretCol;
    return shown;
  }
}
