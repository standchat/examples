// The Stand Inline page: its spectrum illustration and the studio. Page code,
// not part of the element. The studio loads an example page in a frame and
// changes the <stand-inline> on it: attributes, custom properties, and a
// scripted sample client in place of the live one.
import { SampleClient, playSample, SCRIPTS } from './samples.js';

const LOOKS = ['whisper', 'line', 'field', 'card', 'stage'];
const LOOK_NAMES = ['Whisper', 'Line', 'Field', 'Card', 'Stage'];
const LOOK_HINTS = {
  whisper: 'A line of text in your content, barely there until someone needs it. The conversation grows as a thread.',
  line: 'A sentence-sized prompt on a rule. It reads like part of the page.',
  field: 'A box that reads like search: familiar and easy to spot. It unfolds into the conversation.',
  card: 'A contained panel with who answers, the greeting and suggestions. Clearly an invitation.',
  stage: 'The greeting becomes the headline. Impossible to ignore.',
};
const GROW_HINTS = {
  unfold: 'Grows in place and pushes the page down, then scrolls inside.',
  follow: 'Grows in place, and a dock follows the visitor when they scroll away.',
  focus: 'Lifts into a focused view over the page when the conversation starts.',
};
const PRESETS = [
  { id: 'blank', name: 'Blank canvas', tag: 'your colors', url: 'canvas.html', element: 'canvas-inline', host: 'your-site.example' },
  { id: 'docs', name: 'Docs', tag: 'whisper', url: 'docs/', element: 'ask-docs', host: 'docs.tidewire.example/webhooks/verify' },
  { id: 'careers', name: 'Job post', tag: 'line', url: 'careers/', element: 'ask-role', host: 'paperbark.example/jobs/product-designer' },
  { id: 'product', name: 'Product page', tag: 'field · follow', url: 'product/', element: 'ask-tern', host: 'northfold.example/tents/tern-2' },
  { id: 'help', name: 'Help center', tag: 'field', url: 'help/', element: 'ask-help', host: 'help.porchlight.example' },
  { id: 'pricing', name: 'Pricing', tag: 'ask() · events', url: 'pricing/', element: 'ask-plan', host: 'loomwork.example/pricing' },
  { id: 'contact', name: 'Contact', tag: 'card', url: 'contact/', element: 'ask-project', host: 'studiohalden.example/start' },
  { id: 'concierge', name: 'Hero', tag: 'stage · focus', url: 'concierge/', element: 'ask-trip', host: 'tundraandtide.example' },
];
const SWATCHES = ['#1B90B3', '#C8643B', '#0E7C86', '#1F4D3A', '#E4572E', '#B5532E', '#6A4FD8', '#1D1D1F'];

// The spectrum in the hero: five idle elements with sample clients, as a still life.
for (const element of document.querySelectorAll('[data-spectrum]')) {
  const script = SCRIPTS[element.dataset.spectrum];
  element.client = new SampleClient({ host: script.host, turns: [] });
}

// Studio ------------------------------------------------------------------------
const form = document.querySelector('[data-controls]');
const frame = document.querySelector('[data-frame]');
const browser = document.querySelector('[data-browser]');
const playButton = document.querySelector('[data-play]');
const note = document.querySelector('[data-frame-note]');
const codeBlock = document.querySelector('[data-code]');
const fields = form.elements;

let preset = PRESETS.find((p) => p.id === 'product');
let target = null; // the <stand-inline> in the preview
let playing = null;
let mode = 'sample';
const state = {
  look: 'field', grow: 'unfold', focusAt: 1, accent: '#1B90B3', radius: 14, size: 17,
  placeholder: '', greeting: '', suggestions: '', prompt: '',
  pageBg: '#FFFFFF', pageInk: '#1D1D1F', pageFont: fields.pageFont.value,
};

// Page presets
const presetList = document.querySelector('[data-presets]');
for (const p of PRESETS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.preset = p.id;
  button.innerHTML = `<span></span><small></small>`;
  button.querySelector('span').textContent = p.name;
  button.querySelector('small').textContent = p.tag;
  button.addEventListener('click', () => load(p));
  presetList.append(button);
}

// Accent swatches
const swatches = document.querySelector('[data-swatches]');
for (const color of SWATCHES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.style.setProperty('--c', color);
  button.setAttribute('aria-label', `Accent ${color}`);
  button.addEventListener('click', () => {
    state.accent = color;
    writeForm();
    apply();
  });
  swatches.append(button);
}

// Presence dial
const lookInput = fields.look;
lookInput.addEventListener('input', () => {
  state.look = LOOKS[Number(lookInput.value)];
  writeForm();
  apply();
});
for (const stop of document.querySelectorAll('[data-look-stop]')) {
  stop.addEventListener('click', () => {
    state.look = LOOKS[Number(stop.dataset.lookStop)];
    writeForm();
    apply();
  });
}

form.addEventListener('input', (event) => {
  const { name, value } = event.target;
  if (name === 'look') return;
  if (name === 'grow') state.grow = value;
  else if (name === 'focusAt') state.focusAt = Math.max(1, Number(value) || 1);
  else if (name === 'radius' || name === 'size') state[name] = Number(value);
  else if (name in state) state[name] = value;
  else return;
  writeForm({ keepText: true });
  if (['placeholder', 'greeting', 'suggestions', 'prompt'].includes(name)) applySoon();
  else apply();
});
form.addEventListener('submit', (event) => event.preventDefault());

// Preview toolbar
for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener('change', () => {
    mode = radio.value;
    applyMode();
  });
}
for (const radio of document.querySelectorAll('input[name="device"]')) {
  radio.addEventListener('change', () => {
    browser.dataset.device = radio.value;
    // The page reflows at the new width: bring the element back into view.
    setTimeout(() => target && centerInFrame(target, 'smooth'), 420);
  });
}
playButton.addEventListener('click', () => play());
document.querySelector('[data-reset]').addEventListener('click', () => load(preset));
document.querySelector('[data-copy-code]').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(codeText());
    button.textContent = 'Copied';
  } catch {
    getSelection().selectAllChildren(codeBlock);
    button.textContent = 'Selected';
  }
  setTimeout(() => (button.textContent = 'Copy'), 1600);
});

function load(p) {
  preset = p;
  stop();
  target = null;
  note.hidden = true;
  // The page's own settings arrive with it: hold the controls until then.
  form.setAttribute('aria-busy', 'true');
  form.inert = true;
  for (const button of presetList.children) button.setAttribute('aria-pressed', String(button.dataset.preset === p.id));
  document.querySelector('[data-url]').textContent = p.host;
  document.querySelector('[data-open]').href = p.url;
  document.querySelector('[data-canvas-only]').hidden = p.id !== 'blank';
  frame.src = p.url;
}

frame.addEventListener('load', async () => {
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) return;
  // The example pages' own site chrome stays out of the preview.
  const style = doc.createElement('style');
  style.textContent = 'sx-example-bar, .sx-explainer { display: none !important; } :root { --sx-bar-height: 0px; }';
  doc.head.append(style);
  const element = doc.getElementById(preset.element) ?? doc.querySelector('stand-inline');
  if (!element) {
    note.textContent = 'This page has no Stand Inline element.';
    note.hidden = false;
    form.removeAttribute('aria-busy');
    form.inert = false;
    return;
  }
  await win.customElements.whenDefined('stand-inline');
  target = element;
  read(element, win);
  applyMode();
  apply();
  centerInFrame(element, 'auto');
  form.removeAttribute('aria-busy');
  form.inert = false;
});

// Reads the page's own configuration: every preset starts from what the page does.
function read(element, win) {
  const style = win.getComputedStyle(element);
  Object.assign(state, {
    look: LOOKS.includes(element.getAttribute('look')) ? element.getAttribute('look') : 'field',
    grow: ['unfold', 'follow', 'focus'].includes(element.getAttribute('grow')) ? element.getAttribute('grow') : 'unfold',
    focusAt: Number(element.getAttribute('focus-at')) || 1,
    placeholder: element.getAttribute('placeholder') ?? '',
    greeting: element.getAttribute('greeting') ?? '',
    suggestions: element.getAttribute('suggestions') ?? '',
    prompt: element.getAttribute('prompt') ?? '',
    accent: hex(style.getPropertyValue('--si-accent').trim() || style.color) ?? '#1D1D1F',
    radius: parseFloat(style.getPropertyValue('--si-radius')) || 14,
    size: Math.round(parseFloat(style.fontSize)) || 17,
  });
  if (preset.id === 'blank') {
    const root = win.getComputedStyle(frame.contentDocument.documentElement);
    state.pageBg = hex(root.getPropertyValue('--bg').trim()) ?? '#FFFFFF';
    state.pageInk = hex(root.getPropertyValue('--ink').trim()) ?? '#1D1D1F';
  }
  writeForm();
}

function writeForm({ keepText = false } = {}) {
  const index = LOOKS.indexOf(state.look);
  lookInput.value = String(index);
  lookInput.setAttribute('aria-valuetext', LOOK_NAMES[index]);
  document.querySelector('[data-look-name]').textContent = LOOK_NAMES[index];
  document.querySelector('[data-look-hint]').textContent = LOOK_HINTS[state.look];
  for (const stop of document.querySelectorAll('[data-look-stop]')) stop.setAttribute('aria-current', String(Number(stop.dataset.lookStop) === index));
  for (const radio of form.querySelectorAll('input[name="grow"]')) radio.checked = radio.value === state.grow;
  document.querySelector('[data-grow-hint]').textContent = GROW_HINTS[state.grow];
  document.querySelector('[data-focus-at]').hidden = state.grow !== 'focus';
  fields.focusAt.value = state.focusAt;
  fields.accent.value = state.accent;
  for (const swatch of swatches.children) swatch.setAttribute('aria-pressed', String(swatch.style.getPropertyValue('--c').toLowerCase() === state.accent.toLowerCase()));
  fields.radius.value = state.radius;
  document.querySelector('[data-radius-out]').textContent = `${state.radius}px`;
  fields.size.value = state.size;
  document.querySelector('[data-size-out]').textContent = `${state.size}px`;
  fields.pageBg.value = state.pageBg;
  fields.pageInk.value = state.pageInk;
  fields.pageFont.value = state.pageFont;
  if (!keepText) {
    for (const name of ['placeholder', 'greeting', 'suggestions', 'prompt']) fields[name].value = state[name];
  }
}

let applyTimer = 0;
function applySoon() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(apply, 300);
  renderCode();
}

function apply() {
  renderCode();
  const element = target;
  if (!element) return;
  element.setAttribute('look', state.look);
  element.setAttribute('grow', state.grow);
  attr(element, 'focus-at', state.grow === 'focus' && state.focusAt > 1 ? String(state.focusAt) : null);
  for (const name of ['placeholder', 'greeting', 'suggestions', 'prompt']) attr(element, name, state[name].trim() || null);
  element.style.setProperty('--si-accent', state.accent);
  element.style.setProperty('--si-radius', `${state.radius}px`);
  element.style.fontSize = `${state.size}px`;
  if (preset.id === 'blank') {
    const root = frame.contentDocument.documentElement;
    root.style.setProperty('--bg', state.pageBg);
    root.style.setProperty('--ink', state.pageInk);
    root.style.setProperty('--font', state.pageFont);
  }
  // The element reads the page's colors; tell it they changed.
  requestAnimationFrame(() => element.refreshTheme?.());
}

function applyMode() {
  stop();
  playButton.disabled = mode !== 'sample';
  if (!target) return;
  target.client = mode === 'sample' ? new SampleClient(SCRIPTS[preset.id] ?? SCRIPTS.blank) : null;
}

async function play() {
  if (!target || mode !== 'sample') return;
  stop();
  const controller = (playing = new AbortController());
  playButton.querySelector('span').textContent = 'Playing…';
  target.collapse?.();
  centerInFrame(target, 'smooth');
  await playSample(target, SCRIPTS[preset.id] ?? SCRIPTS.blank, { signal: controller.signal });
  if (playing === controller) playButton.querySelector('span').textContent = 'Play again';
}

function stop() {
  playing?.abort();
  playing = null;
  playButton.querySelector('span').textContent = 'Play sample';
}

// Scrolls the preview, never this page: scrollIntoView would move both.
function centerInFrame(element, behavior) {
  const win = frame.contentWindow;
  const box = element.getBoundingClientRect();
  win?.scrollBy({ top: box.top + Math.min(box.height, win.innerHeight * 0.6) / 2 - win.innerHeight / 2, behavior });
}

function attr(element, name, value) {
  if (value === null) element.removeAttribute(name);
  else if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

// The code panel: what you'd paste into your own page.
function snippet() {
  const attributes = [['site', 'YOUR-SITE-ID'], ['look', state.look]];
  if (state.grow !== 'unfold') attributes.push(['grow', state.grow]);
  if (state.grow === 'focus' && state.focusAt > 1) attributes.push(['focus-at', String(state.focusAt)]);
  for (const name of ['placeholder', 'greeting', 'suggestions']) if (state[name].trim()) attributes.push([name, state[name].trim()]);
  if (state.prompt.trim()) attributes.push(['prompt', shorten(state.prompt.trim(), 110)]);
  const css = [['--si-accent', state.accent], ['--si-radius', `${state.radius}px`], ['font-size', `${state.size}px`]];
  return { attributes, css };
}

function codeText() {
  const { attributes, css } = snippet();
  return [
    '<script type="module" src="stand-inline.js"></script>',
    '',
    '<stand-inline',
    ...attributes.map(([name, value], i) => `  ${name}="${value.replaceAll('"', '&quot;')}"${i === attributes.length - 1 ? '>' : ''}`),
    '</stand-inline>',
    '',
    '<style>',
    '  stand-inline {',
    ...css.map(([name, value]) => `    ${name}: ${value};`),
    '  }',
    '</style>',
  ].join('\n');
}

function renderCode() {
  const { attributes, css } = snippet();
  const e = escapeHtml;
  const tag = (name) => `<span class="p">&lt;</span><span class="t">${name}</span>`;
  const lines = [
    `${tag('script')} <span class="a">type</span>=<span class="s">"module"</span> <span class="a">src</span>=<span class="s">"stand-inline.js"</span><span class="p">&gt;&lt;/</span><span class="t">script</span><span class="p">&gt;</span>`,
    '',
    tag('stand-inline'),
    ...attributes.map(([name, value], i) => `  <span class="a">${name}</span>=<span class="s">"${e(value.replaceAll('"', '&quot;'))}"</span>${i === attributes.length - 1 ? '<span class="p">&gt;</span>' : ''}`),
    `<span class="p">&lt;/</span><span class="t">stand-inline</span><span class="p">&gt;</span>`,
    '',
    `${tag('style')}<span class="p">&gt;</span>`,
    '  <span class="k">stand-inline</span> {',
    ...css.map(([name, value]) => `    <span class="a">${name}</span>: <span class="s">${e(value)}</span>;`),
    '  }',
    `<span class="p">&lt;/</span><span class="t">style</span><span class="p">&gt;</span>`,
  ];
  codeBlock.innerHTML = lines.join('\n');
}

function shorten(text, length) {
  return text.length > length ? `${text.slice(0, length).replace(/\s+\S*$/, '')}…` : text;
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// Any CSS color to #rrggbb, for <input type="color">.
let paint;
function hex(color) {
  if (!color) return null;
  paint ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  paint.clearRect(0, 0, 1, 1);
  paint.fillStyle = '#000';
  paint.fillStyle = color;
  paint.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
  if (a === 0) return null;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

writeForm();
load(preset);

// Links to #how-this-was-made open the note, not just scroll to it.
const made = document.getElementById('how-this-was-made');
const openMade = () => {
  if (location.hash === `#${made.id}`) made.open = true;
};
addEventListener('hashchange', openMade);
openMade();
