import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const settle = () => new Promise(resolve => setImmediate(resolve));
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const response = (body = {}, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const offer = { available: true, responderType: 'standin', standinProfileId: 'assistant', repId: 'rep', showId: 'show-1' };
const activeSession = { sessionId: 'session', visitorToken: 'token', status: 'active', messages: [] };

for (const folder of ['demoscene-chat', 'vintage-terminal', 'pink-cow', 'holocene', 'wormhole', 'raster-harbour', 'adventure-game-chat']) {
  const adventure = folder === 'adventure-game-chat';
  const module = await import(`../${folder}/${adventure ? 'stand-visitor' : 'stand-client'}.js`);
  const Client = module.StandClient || module.StandVisitor;
  function setup(t, options = {}) {
    const calls = { activations: [], creates: [], messages: [], finds: [] };
    const old = { document: globalThis.document, WebSocket: globalThis.WebSocket };
    globalThis.document = { documentElement: { lang: 'en' } };
    globalThis.WebSocket = class { static OPEN = 1; readyState = 0; close() {} };
    t.after(() => Object.assign(globalThis, old));
    let page = 'https://example.test/first';
    const saved = new Map();
    const storage = { getItem: key => saved.get(key) ?? (options.restored ? JSON.stringify({ session: activeSession }) : null), setItem: (key, value) => saved.set(key, value) };
    const client = new Client({ apiBase: 'https://api.test', wsBase: 'wss://api.test', siteId: 'site', page: () => page, analyticsId: folder, storage });
    t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : null;
      if (url.includes('/reps/find')) {
        calls.finds.push(url);
        await options.findGate?.promise;
        if (options.findError) throw new Error('discovery failed');
        return response(options.offer ?? offer);
      }
      if (url.endsWith('/events/activate')) {
        calls.activations.push({ body, init });
        return options.activation ? options.activation(calls.activations.length) : response({}, 202);
      }
      if (url.endsWith('/sessions')) {
        calls.creates.push(body);
        await options.createGate?.promise;
        if (options.createError) throw new Error('response lost');
        if (options.rejectFirst && calls.creates.length === 1) return response({}, 409);
        return response(activeSession, 201);
      }
      if (url.endsWith('/messages')) {
        calls.messages.push(body);
        return response({ messageId: `m${calls.messages.length}`, body: body.body, type: 'text', senderType: 'visitor', seq: calls.messages.length, clientMessageId: body.clientMessageId });
      }
      return response(init.method === 'DELETE' ? { status: 'closed' } : activeSession);
    });
    if (adventure) void client.start();
    const unmount = adventure ? () => client.destroy() : client.mount();
    t.after(unmount);
    return { client, calls, unmount, setPage: value => { page = value; }, send: async body => {
      if (adventure) return client.send(body);
      client.setDraft(body); return client.send();
    } };
  }

  test(`${folder}: discovery and reconnect do not count; first submit is one activation`, async t => {
    const h = setup(t); await settle(); await h.client.retry();
    assert.equal(h.calls.activations.length, 0);
    await h.send('Hello');
    assert.equal(h.calls.activations.length, 1);
    const event = h.calls.activations[0].body;
    assert.equal(event.interaction, 'submit'); assert.equal(event.initialMessagePresent, true);
    assert.equal(event.sourceType, 'custom_ui'); assert.equal(event.analyticsId, folder);
    assert.equal(h.calls.creates[0].activationId, event.activationId);
    assert.equal(h.calls.creates[0].activationSource, event.sourceType);
    assert.equal(h.calls.creates[0].activationAnalyticsId, event.analyticsId);
    h.client.closeInvitation(); h.client.activate(); await h.client.retry(); await h.send('Again');
    assert.equal(h.calls.activations.length, 1); assert.equal(h.calls.creates.length, 1);
  });

  test(`${folder}: an open before discovery counts without a message and keeps attribution`, async t => {
    const discovery = gate(); const h = setup(t, { findGate: discovery });
    h.client.activate('keyboard'); h.client.activate('click');
    assert.equal(h.calls.activations.length, 0);
    discovery.resolve(); await settle();
    assert.equal(h.calls.activations.length, 1);
    assert.equal(h.calls.activations[0].body.showId, 'show-1');
    assert.equal(h.calls.activations[0].body.interaction, 'keyboard');
    assert.equal(h.calls.activations[0].body.initialMessagePresent, false);
    assert.equal(h.calls.creates.length, 0);
    await h.send('Hello');
    assert.equal(h.calls.creates[0].activationId, h.calls.activations[0].body.activationId);
  });

  test(`${folder}: close and reopen during lookup preserves two immutable opens and the latest session ID`, async t => {
    const discovery = gate(); const h = setup(t, { findGate: discovery });
    h.client.activate(); h.client.closeInvitation();
    h.setPage('https://example.test/second'); h.client.activate();
    assert.equal(h.calls.activations.length, 1);
    assert.equal(h.calls.activations[0].body.showId, null);
    discovery.resolve(); await settle();
    assert.equal(h.calls.activations.length, 2);
    assert.equal(h.calls.activations[0].body.page, 'https://example.test/first');
    assert.equal(h.calls.activations[1].body.showId, 'show-1');
    assert.notEqual(h.calls.activations[0].body.activationId, h.calls.activations[1].body.activationId);
    await h.send('Latest');
    assert.equal(h.calls.creates[0].activationId, h.calls.activations[1].body.activationId);
  });

  test(`${folder}: unavailable or failed lookup and departure retain real opens as site-only events`, async t => {
    for (const options of [{ offer: { available: false } }, { findError: true }, { findGate: gate() }]) {
      await t.test(Object.keys(options)[0], async t => {
        const h = setup(t, options); h.client.activate();
        if (options.findGate) { h.unmount(); options.findGate.resolve(); }
        await settle();
        assert.equal(h.calls.activations.length, 1);
        assert.equal(h.calls.activations[0].body.showId, null);
        assert.equal(h.calls.activations[0].body.repId, null);
        assert.equal(h.calls.activations[0].body.standinProfileId, null);
        assert.equal(h.calls.creates.length, 0);
      });
    }
  });

  test(`${folder}: restored sessions are never new activations`, async t => {
    const h = setup(t, { restored: true }); await settle();
    h.client.activate(); await h.send('Welcome back');
    assert.equal(h.calls.activations.length, 0);
    assert.equal(h.calls.creates.length, 0);
    assert.equal(h.calls.finds.length, 0);
  });

  test(`${folder}: new-chat invitation gets a fresh ID and does not replay the previous message`, async t => {
    const h = setup(t); await settle(); await h.send('First'); await h.client.end();
    const discovery = h.client.newChat(); h.client.activate('click'); await discovery;
    assert.equal(h.calls.activations.length, 2);
    assert.equal(h.calls.creates.length, 1);
    assert.notEqual(h.calls.activations[0].body.activationId, h.calls.activations[1].body.activationId);
    await h.send('Second');
    assert.equal(h.calls.creates[1].activationId, h.calls.activations[1].body.activationId);
    assert.equal(h.calls.activations.length, 2);
  });

  test(`${folder}: a rejected create reuses the invitation; an uncertain create is not replayed`, async t => {
    for (const options of [{ rejectFirst: true }, { createError: true }]) {
      await t.test(Object.keys(options)[0], async t => {
        const h = setup(t, options); await settle(); await h.send('Question');
        h.client.activate(); await h.client.retry(); await h.send('Question');
        assert.equal(h.calls.activations.length, 1);
        assert.equal(h.calls.creates.length, options.rejectFirst ? 2 : 1);
        h.calls.creates.forEach(body => assert.equal(body.activationId, h.calls.activations[0].body.activationId));
      });
    }
  });

  test(`${folder}: telemetry retries once with the original snapshot and cannot delay creation`, async t => {
    const telemetry = gate(); const h = setup(t, { activation: async attempt => {
      if (attempt === 1) { await telemetry.promise; throw new Error('accepted but response lost'); }
      return response({}, 503);
    } });
    await settle(); h.client.activate(); h.client.closeInvitation(); h.setPage('https://example.test/second'); h.client.activate();
    await h.send('Does not wait');
    assert.equal(h.calls.creates.length, 1);
    assert.equal(h.calls.creates[0].activationId, h.calls.activations[1].body.activationId);
    telemetry.resolve(); await settle();
    const first = h.calls.activations[0].body;
    const attempts = h.calls.activations.filter(call => call.body.activationId === first.activationId);
    assert.equal(attempts.length, 2); assert.deepEqual(attempts[1].body, first);
    assert.equal(h.calls.activations.length, 4);
  });
}
