// Contract tests run the dependency-free runtime in an isolated fake DOM.
// Browser checks cover placement, clipping, focus, and real Stand integration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./halloween.js', import.meta.url), 'utf8');
function fixture(date = '2026-10-09T12:00:00', config = {}) {
  const listeners = new Map(), timers = new Map(), calls = [];
  let serial = 0, unsubscribed = 0;
  const events = () => ({ addEventListener(name, callback) { const list = listeners.get(name) || []; list.push(callback); listeners.set(name, list); }, removeEventListener(name, callback) { listeners.set(name, (listeners.get(name) || []).filter(item => item !== callback)); }, dispatchEvent() {} });
  const document = { ...events(), readyState: 'loading', baseURI: 'https://example.test/', currentScript: null, hidden: false, body: null, querySelectorAll: () => [], activeElement: null };
  const window = { ...events(), StandHalloweenConfig: { autoStart: false, ...config }, StandChat: { whenAvailable(callback) { callback(); return () => unsubscribed++; }, isAvailable: () => true, openChat: (...args) => calls.push(args) } };
  const context = { window, document, innerWidth: 1280, innerHeight: 900, URL, queueMicrotask, console,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [date])); } static now() { return new Date(date).getTime(); } },
    sessionStorage: { getItem: () => null, setItem() {} },
    setTimeout(callback, ms) { timers.set(++serial, { callback, ms }); return serial; }, clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
  };
  window.matchMedia = () => ({ ...events(), matches: false });
  vm.runInNewContext(source, context);
  return { api: window.StandHalloween, calls, timers, listeners, unsubscribed: () => unsubscribed };
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
console.log('Passed: inclusive/wrapping seasons, preview, invalid dates, preset overrides/resets, cast normalization, size bounds, stop/pause/parade cleanup, availability unsubscribe, per-kind greetings and public chat options.');
