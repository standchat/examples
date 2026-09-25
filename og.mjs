// Captures an example's social image, <folder>/og.png, the same way for everyone:
// a 1200×630 browser window on the live page, taken once Stand has a responder,
// without the site's top bar. The images are committed; the site's build and
// Vercel never run this. No dependencies; needs Node 22+ and Chrome, Chromium or
// Edge (or CHROME_PATH).
//
//   npm run og                        every example, then the default image
//   npm run og -- my-example          one example
//   npm run og -- _shared             just the default image (_shared/og.html)
//
// Optional hints in an example's HTML:
//   data-og-focus   scroll this element to the middle of the frame first
//                   (scrolling is gradual, so a stand-card spotlight triggers)
//   data-og-hide    leave this element out of the picture

import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';

const WIDTH = 1200;
const HEIGHT = 630;
const ROOT = resolve('.');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((path) => path && existsSync(path));
if (!chrome) exit('Chrome not found. Set CHROME_PATH to a Chrome, Chromium or Edge binary.');
if (typeof WebSocket === 'undefined') exit('og.mjs needs Node 22 or newer.');

const slugs = process.argv.slice(2).length
  ? process.argv.slice(2).map((s) => s.replace(/\/$/, ''))
  : [...readdirSync('.').filter((d) => !/^[._]/.test(d) && existsSync(join(d, 'index.html'))), '_shared'];
const pagePath = (slug) => (slug === '_shared' ? '_shared/og.html' : `${slug}/`);
for (const slug of slugs) {
  if (!existsSync(join(slug, slug === '_shared' ? 'og.html' : 'index.html'))) exit(`${pagePath(slug)} not found.`);
}

const server = await serve();
try {
  for (const slug of slugs) {
    // The default image is a collage of the examples' images, listed in examples.json.
    if (slug === '_shared' && spawnSync(process.execPath, ['build.mjs'], { stdio: 'inherit' }).status !== 0) {
      exit('Fix the build errors above before capturing _shared/og.png.');
    }
    await capture(`http://localhost:${server.address().port}/${pagePath(slug)}`, join(slug, 'og.png'));
    console.log(`${slug}/og.png`);
  }
} finally {
  server.close();
}

async function capture(url, out) {
  const profile = mkdtempSync(join(tmpdir(), 'stand-og-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const browser = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });
  try {
    const page = await connect(port);
    await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.enable');
    await page.send('Page.navigate', { url });
    await page.evaluate(`new Promise((done) => {
      const start = Date.now();
      const usesStand = document.querySelector('script[src*="stand.js"]');
      (function check() {
        if (!usesStand || window.StandChat?.isAvailable() || Date.now() - start > 12000) return done();
        setTimeout(check, 200);
      })();
    })`);
    await page.evaluate(`(async () => {
      // The image shows the example itself, never the site's top bar.
      document.querySelector('sx-example-bar')?.style.setProperty('display', 'none');
      document.documentElement.style.setProperty('--sx-bar-height', '0px');
      for (const el of document.querySelectorAll('[data-og-hide]')) el.style.visibility = 'hidden';
      const focus = document.querySelector('[data-og-focus]');
      if (!focus) return;
      const rect = focus.getBoundingClientRect();
      const target = scrollY + rect.top + rect.height / 2 - innerHeight / 2;
      for (let y = scrollY; y < target; y = Math.min(target, y + 60)) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      scrollTo(0, target);
    })()`);
    await sleep(4500); // Reveals, greetings and spotlights settle.
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out, Buffer.from(data, 'base64'));
    page.close();
  } finally {
    browser.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

async function connect(port) {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {
      await sleep(150);
    }
  }
  if (!target) exit('Could not connect to Chrome.');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  const send = (method, params = {}) => new Promise((ok, fail) => {
    pending.set(++id, (m) => (m.error ? fail(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = (expression) => send('Runtime.evaluate', { expression, awaitPromise: true });
  return { send, evaluate, close: () => ws.close() };
}

// A tiny static server that behaves like the Vercel deployment (trailing slashes).
function serve() {
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.webp': 'image/webp', '.woff2': 'font/woff2',
  };
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = join(ROOT, path);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!path.endsWith('/')) return void res.writeHead(308, { location: `${path}/` }).end();
      file = join(file, 'index.html');
    }
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function exit(message) {
  console.error(message);
  process.exit(1);
}
