import test from 'node:test';
import assert from 'node:assert/strict';
import { StandVisitorClient } from './stand-visitor.js';

test('an immediate teardown flushes a debounced draft for reload recovery', async () => {
  const events = new EventTarget();
  const original = { fetch: globalThis.fetch, document: globalThis.document, addEventListener: globalThis.addEventListener, removeEventListener: globalThis.removeEventListener };
  Object.assign(globalThis, {
    document: new EventTarget(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    fetch: async () => new Response(JSON.stringify({ available: true, standinProfileId: 'test', responderType: 'standin' }), { status: 200 }),
  });
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const config = { site: 'demo', page: () => 'https://example.test/', storage, scope: 'draft-test' };
  try {
    const client = new StandVisitorClient(config);
    const unmount = client.mount();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(client.getSnapshot().phase, 'available');
    client.setDraft('A question typed immediately before reloading.');
    unmount();
    const restored = new StandVisitorClient(config);
    assert.equal(restored.getSnapshot().draft, 'A question typed immediately before reloading.');
    assert.equal(restored.getSnapshot().messages.length, 0);
    assert.equal(restored.getSnapshot().pending, null);
  } finally {
    Object.assign(globalThis, original);
  }
});
