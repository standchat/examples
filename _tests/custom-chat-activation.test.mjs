import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const offer = { available: true, standinProfileId: 'ai', repId: 'rep', showId: 'show', responderType: 'standin' };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
const session = { sessionId: 'session', visitorToken: 'token', status: 'active', messages: [] };

for (const name of ['chat-mascot', 'lifelike-host']) {
  const { StandChatClient } = await import(`../${name}/stand-client.js`);
  test(`${name}: activation lifecycle`, async (t) => {
    let fetchImpl;
    const original = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, document: globalThis.document };
    globalThis.document = { documentElement: { lang: 'en' } };
    globalThis.WebSocket = class { close() {} };
    globalThis.fetch = (...args) => fetchImpl(...args);
    t.after(() => Object.assign(globalThis, original));
    const setup = ({ find = async () => response(offer), activation = async () => response({}, 204), storage } = {}) => {
      const calls = [];
      fetchImpl = async (url, options) => {
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ url, body });
        if (url.includes('/reps/find')) return find();
        if (url.endsWith('/events/activate')) return activation();
        if (url.endsWith('/sessions')) return response(session);
        if (url.endsWith('/messages')) return response({ messageId: 'm2', body: body.body, clientMessageId: body.clientMessageId, type: 'text', senderType: 'visitor', seq: 2 });
        return response(session);
      };
      const client = new StandChatClient({ siteId: 'demo', apiBase: 'https://api.test', page: () => 'https://example.test/page', analyticsId: name, storage });
      const unmount = client.mount();
      return { client, calls, unmount, events: () => calls.filter(c => c.url.endsWith('/events/activate')).map(c => c.body), creates: () => calls.filter(c => c.url.endsWith('/sessions')).map(c => c.body) };
    };
    await t.test('mount is silent; an open with no message counts; repeated open is suppressed; reopen gets a fresh ID', async () => {
      const h = setup(); await settle();
      assert.equal(h.events().length, 0);
      h.client.activate(); h.client.activate(); await settle();
      assert.equal(h.events().length, 1);
      assert.equal(h.events()[0].showId, 'show');
      assert.equal(h.events()[0].sourceType, 'custom_ui');
      assert.equal(h.events()[0].analyticsId, name);
      h.client.closeInvitation(); h.client.activate(); await settle();
      assert.equal(h.events().length, 2);
      assert.notEqual(h.events()[0].activationId, h.events()[1].activationId);
      assert.equal(h.creates().length, 0);
      h.unmount();
    });
    await t.test('open before discovery keeps its ID, then attributes to the offer and subsequent session', async () => {
      let resolveFind;
      const h = setup({ find: () => new Promise(resolve => { resolveFind = resolve; }) });
      h.client.activate(); assert.equal(h.events().length, 0);
      resolveFind(response(offer)); await settle();
      assert.equal(h.events().length, 1);
      h.client.setDraft('Hi'); await h.client.send();
      assert.equal(h.creates()[0].activationId, h.events()[0].activationId);
      assert.equal(h.creates()[0].activationSource, h.events()[0].sourceType);
      assert.equal(h.creates()[0].activationAnalyticsId, h.events()[0].analyticsId);
      h.client.activate(); h.client.setDraft('Again'); await h.client.send();
      assert.equal(h.events().length, 1);
      h.unmount();
    });
    await t.test('closing before lookup finishes preserves two separate opens', async () => {
      let resolveFind;
      const h = setup({ find: () => new Promise(resolve => { resolveFind = resolve; }) });
      h.client.activate(); h.client.closeInvitation(); h.client.activate();
      assert.equal(h.events().length, 1);
      assert.equal(h.events()[0].showId, null);
      resolveFind(response(offer)); await settle();
      assert.equal(h.events().length, 2);
      assert.equal(h.events()[1].showId, 'show');
      assert.notEqual(h.events()[0].activationId, h.events()[1].activationId);
      h.unmount();
    });
    await t.test('failed discovery still records an open without inventing a responder', async () => {
      const h = setup({ find: async () => { throw new Error('offline'); } });
      h.client.activate(); await settle();
      assert.equal(h.events().length, 1);
      assert.equal(h.events()[0].showId, null);
      assert.equal(h.events()[0].repId, null);
      assert.equal(h.creates().length, 0);
      h.unmount();
    });
    await t.test('first submit fallback retries telemetry with the same payload without blocking chat', async () => {
      const h = setup({ activation: async () => { throw new Error('lost response'); } }); await settle();
      h.client.setDraft('Hi'); await h.client.send(); await settle();
      assert.equal(h.events().length, 2);
      assert.deepEqual(h.events()[0], h.events()[1]);
      assert.equal(h.events()[0].initialMessagePresent, true);
      assert.equal(h.creates()[0].activationId, h.events()[0].activationId);
      assert.equal(h.client.state.phase, 'active');
      h.unmount();
    });
    await t.test('restoring an existing conversation does not activate or create again', async () => {
      const storage = { getItem: () => JSON.stringify({ session, messages: [] }), setItem() {} };
      const h = setup({ storage }); await settle();
      h.client.activate(); h.client.setDraft('Continue'); await h.client.send();
      assert.equal(h.events().length, 0);
      assert.equal(h.creates().length, 0);
      h.unmount();
    });
    await t.test('new chat does not reuse the old activation', async () => {
      const h = setup(); await settle();
      h.client.activate(); h.client.setDraft('First'); await h.client.send();
      await h.client.end(); await h.client.newChat();
      h.client.setDraft('Second'); await h.client.send();
      assert.equal(h.events().length, 2);
      assert.notEqual(h.events()[0].activationId, h.events()[1].activationId);
      assert.equal(h.creates()[1].activationId, h.events()[1].activationId);
      h.unmount();
    });
  });
}
