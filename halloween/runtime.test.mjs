// Contract tests run the dependency-free runtime in an isolated fake DOM.
// Browser checks cover placement, clipping, focus, and real Stand integration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./halloween.js', import.meta.url), 'utf8');
function fixture(date = '2026-10-09T12:00:00', config = {}, installation = {}) {
  const listeners = new Map(), timers = new Map(), calls = [];
  let serial = 0, unsubscribed = 0, hiddenLauncher = 0;
  const events = () => ({ addEventListener(name, callback) { const list = listeners.get(name) || []; list.push(callback); listeners.set(name, list); }, removeEventListener(name, callback) { listeners.set(name, (listeners.get(name) || []).filter(item => item !== callback)); }, dispatchEvent() {} });
  const scriptNode = (src, attributes = {}) => {
    const callbacks = new Map();
    const node = { src, dataset: {}, attributes: { ...attributes },
      setAttribute(name, value) { this.attributes[name] = value; },
      hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
      addEventListener(name, callback) { callbacks.set(name, callback); },
      fail() { callbacks.get('error')?.(); }, remove() { scripts.splice(scripts.indexOf(this), 1); },
    };
    return node;
  };
  const scripts = (installation.scripts || []).map(item => scriptNode(item.src, item.attributes));
  const currentScript = scriptNode('https://example.test/halloween/halloween.js');
  if (installation.standId !== undefined) currentScript.dataset.standId = installation.standId;
  scripts.push(currentScript);
  const document = { ...events(), readyState: 'loading', baseURI: 'https://example.test/', currentScript, hidden: false, body: null,
    querySelectorAll: selector => selector === 'script[src]' ? scripts : [], activeElement: null,
    createElement(tag) { assert.equal(tag, 'script'); return scriptNode(''); },
    head: { appendChild(node) { scripts.push(node); } },
  };
  const window = { ...events(), StandHalloweenConfig: { autoStart: false, ...config }, StandChat: { initiallyHideChatButton() { hiddenLauncher++; }, whenAvailable(callback) { callback(); return () => unsubscribed++; }, isAvailable: () => true, openChat: (...args) => calls.push(args) } };
  if (installation.noApi) delete window.StandChat;
  if (installation.globalConfig) window.StandChatConfig = installation.globalConfig;
  const context = { window, document, innerWidth: 1280, innerHeight: 900, URL, queueMicrotask, console,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [date])); } static now() { return new Date(date).getTime(); } },
    sessionStorage: { getItem: () => null, setItem() {} },
    setTimeout(callback, ms) { timers.set(++serial, { callback, ms }); return serial; }, clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
  };
  window.matchMedia = () => ({ ...events(), matches: false });
  vm.runInNewContext(source, context);
  return { api: window.StandHalloween, window, scripts, calls, timers, listeners, unsubscribed: () => unsubscribed, hiddenLauncher: () => hiddenLauncher,
    boot() { for (const callback of listeners.get('DOMContentLoaded') || []) callback(); },
    rerun() { vm.runInNewContext(source, context); },
  };
}
for (const [date, active] of [['2026-09-30', false], ['2026-10-01', true], ['2026-11-01', true], ['2026-11-02', false]]) {
  const { api } = fixture(date + 'T12:00:00'); assert.equal(api.state.seasonActive, active, date);
}
for (const [date, active] of [['2026-12-20', true], ['2027-01-05', true], ['2027-02-01', false]]) {
  const { api } = fixture(date + 'T12:00:00', { season: '12-10/01-20' }); assert.equal(api.state.seasonActive, active);
}
{
  const { api } = fixture('2026-06-01T12:00:00');
  api.start(); assert.equal(api.state.running, false); assert.equal(api.state.stopped, true);
  api.configure({ preview: true }); api.start(); assert.equal(api.state.running, true);
  assert.throws(() => api.configure({ season: '13-01/11-01' }));
  assert.throws(() => api.configure({ season: '02-30/11-01' }));
  api.configure({ season: '02-29/03-01' });
}
{
  const { api } = fixture();
  assert.equal(api.state.arrivalInterval, 14000); assert.equal(api.state.maxItems, 2);
  api.configure({ activity: 'haunted' }); assert.equal(api.state.arrivalInterval, 8000); assert.equal(api.state.maxItems, 3);
  api.configure({ arrivalInterval: 50000, maxItems: 1, activity: 'calm' }); assert.equal(api.state.arrivalInterval, 50000);
  api.configure({ activity: 'haunted' }); assert.equal(api.state.arrivalInterval, 50000); assert.equal(api.state.maxItems, 1);
  api.configure({ arrivalInterval: null, maxItems: null }); assert.equal(api.state.arrivalInterval, 8000); assert.equal(api.state.maxItems, 3);
  api.configure({ cast: 'ghost, pumpkin,ghost,spider' }); assert.equal(api.state.cast.join(','), 'ghost,pumpkin');
  api.configure({ cast: [], size: 4 }); assert.equal(api.state.cast.length, 0); assert.equal(api.state.size, 1.35);
}
{
  const f = fixture(); f.api.start(); assert.equal(f.api.state.running, true);
  f.api.parade(); assert.ok(f.timers.size >= 3);
  f.api.stop(); assert.equal(f.api.state.stopped, true); assert.equal(f.api.state.paused, false); assert.equal(f.timers.size, 0);
  f.api.start(); f.api.pause(); assert.equal(f.api.state.paused, true); assert.equal(f.api.state.stopped, false);
  f.api.destroy(); assert.equal(f.api.state.destroyed, true); assert.equal(f.unsubscribed(), 1); assert.equal(f.timers.size, 0);
}
{
  const f = fixture();
  await f.api.openChat('pumpkin'); assert.match(f.calls[0][0], /lit up/); assert.equal(f.calls[0][1].analyticsId, 'halloween-pg-pumpkin');
  assert.equal(f.calls[0][1].visitorMessage, undefined);
  f.api.configure({ greeting: 'Welcome friend' }); await f.api.openChat('bat'); assert.equal(f.calls.at(-1)[0], 'Welcome friend');
  f.api.configure({ chatGreeting: 'Private opening' }); await f.api.openChat('ghost'); assert.equal(f.calls.at(-1)[0], 'Private opening');
  f.api.configure({ greeting: null }); await f.api.openChat('bat'); assert.match(f.calls.at(-1)[0], /night shift/);
}
for (const standId of ['demo', 'example-site-id']) {
  const f = fixture(undefined, {}, { standId, noApi: true });
  f.boot();
  const sdk = f.scripts.at(-1);
  assert.equal(sdk.src, 'https://cdn.stand.chat/widget/stand.js');
  assert.equal(sdk.attributes['data-stand-id'], standId);
  assert.equal(sdk.attributes['data-stand-hide-button'], 'true');
  assert.equal(sdk.async, true);
  f.boot(); f.rerun();
  assert.equal(f.scripts.length, 2, 'one SDK request across repeated boot and duplicate Halloween script');
  f.api.destroy();
}
{
  const f = fixture(undefined, {}, { standId: 'demo' });
  const original = f.window.StandChat;
  f.boot(); assert.equal(f.scripts.length, 1); assert.equal(f.window.StandChat, original);
}
for (const existing of [
  { src: 'https://cdn.stand.chat/widget/stand.js' },
  { src: 'https://cdn.staging.stand.chat/widget/stand.js?version=2' },
  { src: '/custom/stand.js', attributes: { 'data-stand-id': 'existing-site' } },
]) {
  const f = fixture(undefined, {}, { standId: 'demo', noApi: true, scripts: [existing] });
  f.boot(); assert.equal(f.scripts.length, 2, 'reuse an existing SDK tag while it is loading');
}
{
  const globalConfig = { siteId: 'global-site', hideButton: true };
  const f = fixture(undefined, {}, { standId: 'demo', noApi: true, globalConfig });
  f.boot(); assert.equal(f.window.StandChatConfig, globalConfig);
  const failed = f.scripts.at(-1); failed.fail();
  assert.equal(f.scripts.length, 1, 'only the failed owned SDK tag is removed');
  const pending = f.api.openChat('ghost');
  assert.equal(f.scripts.length, 2, 'explicit chat retry reloads a failed owned SDK');
  assert.notEqual(f.scripts.at(-1), failed);
  f.api.destroy(); await pending;
}
for (const standId of [undefined, '', '   ']) {
  const f = fixture(undefined, {}, { standId, noApi: true });
  f.boot(); assert.equal(f.scripts.length, 1, 'without a Site ID the legacy add-on does not load Stand');
}
{
  const f = fixture(); f.boot(); f.api.start();
  assert.equal(f.hiddenLauncher(), 1, 'existing SDK launcher hidden once');
  await f.api.openChat('ghost'); f.api.start();
  assert.equal(f.hiddenLauncher(), 1, 'do not rehide after an explicit conversation');
}
for (const [date, config] of [['2026-06-01T12:00:00', {}], ['2026-10-09T12:00:00', { cast: [] }]]) {
  const existing = fixture(date, config); existing.boot(); existing.api.start();
  assert.equal(existing.hiddenLauncher(), 0, 'keep normal launcher when no Halloween entry point is active');
  const fresh = fixture(date, config, { standId: 'demo', noApi: true }); fresh.boot();
  assert.equal(fresh.scripts.at(-1).attributes['data-stand-hide-button'], undefined);
}
console.log('Passed: seasons, configuration, lifecycle, greetings, public chat options, optional SDK loading, Site ID forwarding, duplicate prevention, existing installation/config preservation, and failed-load retry.');
