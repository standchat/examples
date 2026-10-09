// Deterministic browser capture of the editable creative masters.
// Run with Node 22+ and Chrome: node halloween/marketing/render.mjs
// Select individual designs: node halloween/marketing/render.mjs og reddit
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const designs = {
  og: ['../og.png', 1200, 630],
  reddit: ['reddit-free-halloween.png', 1200, 1500],
  'reddit-landscape': ['reddit-free-halloween-landscape.png', 1200, 630],
  familiar: ['linkedin-01-familiar.png', 1200, 1500],
  moment: ['linkedin-02-moment.png', 1200, 1500],
  dial: ['linkedin-03-choice.png', 1200, 1500],
  cast: ['../assets/cast-preview.png', 1600, 1300, '../cast.html'],
};
const chrome = [process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => p && existsSync(p));
if (!chrome || typeof WebSocket === 'undefined') throw new Error('Install Chrome and Node 22+, or set CHROME_PATH.');
const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(designs);
for (const name of selected) if (!designs[name]) throw new Error(`Unknown design: ${name}`);
const profile = mkdtempSync(join(tmpdir(), 'halloween-creative-'));
const port = 9600 + Math.floor(Math.random() * 200);
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let tab;
  for (let i = 0; i < 80 && !tab; i++) {
    try { tab = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch { await pause(100); }
  }
  if (!tab) throw new Error('Chrome did not become available.');
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => { const msg = JSON.parse(event.data); pending.get(msg.id)?.(msg); pending.delete(msg.id); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, msg => msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  for (const name of selected) {
    const [out, width, height, source = 'source.html'] = designs[name];
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const url = pathToFileURL(join(root, source));
    url.searchParams.set('design', name);
    await send('Page.navigate', { url: url.href });
    await pause(200);
    const checked = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      await document.fonts.ready;
      const images = [...document.images];
      await Promise.all(images.map(i => i.decode()));
      return {width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, images: images.length};
    })()` });
    if (checked.exceptionDetails) throw new Error(`Missing creative asset for ${name}. ${checked.exceptionDetails.text}`);
    await pause(100);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(root, out), Buffer.from(data, 'base64'));
    console.log(`${name}: ${width} × ${height}, ${checked.result.value.images} images → ${join(root, out)}`);
  }
} finally {
  ws?.close();
  browser.kill();
  await pause(300);
  rmSync(profile, { force: true, recursive: true });
}
