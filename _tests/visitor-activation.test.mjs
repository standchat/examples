import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const folders = ['ask-any-line', 'ask-at-any-step', 'ask-the-playground', 'comment-anywhere', 'experiment-verdict', 'glitch-mascot', 'launch-simulator', 'pause-to-ask', 'questions-as-issues', 'search-that-talks', 'slash-to-ask', 'stand-inline', 'subscription-lab', 'unusual-order', 'will-it-deploy'];
const offer = { available: true, repId: 'rep', showId: 'show', responderType: 'rep' };
const session = { sessionId: 'session', visitorToken: 'token', status: 'active', messages: [] };
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

for (const folder of folders) {
  const { StandVisitorClient } = await import(`../${folder}/stand-visitor.js`);
  test(`${folder}: invitation accounting`, async t => {
    const keys = ['fetch', 'WebSocket', 'document', 'navigator', 'addEventListener', 'removeEventListener'];
    const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const set = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    set('document', { documentElement: { lang: 'en' }, addEventListener() {}, removeEventListener() {} });
    set('navigator', { language: 'en', languages: ['en'] });
    set('addEventListener', () => {}); set('removeEventListener', () => {});
    set('WebSocket', class { close() {} });
    t.after(() => { for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; });

    function setup(t, { find = async () => response(offer), telemetry, storage = null, page = () => 'https://example.test' } = {}) {
      const calls = [];
      set('fetch', (url, options = {}) => {
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ url, body });
        if (url.includes('/reps/find')) return find();
        if (url.endsWith('/events/activate')) return telemetry ? telemetry() : Promise.resolve(response({}, 204));
        if (url.endsWith('/sessions')) return Promise.resolve(response(session));
        if (url.endsWith('/messages')) return Promise.resolve(response({ messageId: 'next', body: body.body, type: 'text', senderType: 'visitor', seq: 1 }));
        return Promise.resolve(response(session));
      });
      const client = new StandVisitorClient({ site: 'demo', api: 'https://api.test', page, storage });
      const unmount = client.mount(); t.after(unmount);
      return { client, unmount, events: () => calls.filter(c => c.url.endsWith('/events/activate')).map(c => c.body), creates: () => calls.filter(c => c.url.endsWith('/sessions')).map(c => c.body) };
    }

    await t.test('mount is silent, open counts without a session, repeat is suppressed, reopen gets a fresh ID', async t => {
      const h = setup(t); await settle();
      assert.equal(h.events().length, 0);
      h.client.activate({ analyticsId: folder }); h.client.activate({ analyticsId: folder });
      assert.equal(h.events().length, 1); assert.equal(h.creates().length, 0);
      assert.equal(h.events()[0].initialMessagePresent, false);
      h.client.closeInvitation(); h.client.activate({ analyticsId: folder });
      assert.equal(h.events().length, 2);
      assert.notEqual(h.events()[0].activationId, h.events()[1].activationId);
    });

    await t.test('pending discovery attaches one open to the returned responder and ensuing session', async t => {
      let complete;
      let page = 'https://example.test/first';
      const h = setup(t, { find: () => new Promise(resolve => { complete = resolve; }), page: () => page });
      h.client.activate({ analyticsId: folder }); assert.equal(h.events().length, 0);
      page = 'https://example.test/second';
      complete(response(offer)); await settle();
      assert.equal(h.events().length, 1); assert.equal(h.events()[0].showId, 'show');
      assert.equal(h.events()[0].page, 'https://example.test/first');
      await h.client.send('Hello', { analyticsId: 'later-send-context' });
      assert.equal(h.creates()[0].activationId, h.events()[0].activationId);
      assert.equal(h.creates()[0].activationAnalyticsId, h.events()[0].analyticsId);
      assert.equal(h.events()[0].sourceType, 'custom_ui');
      assert.equal(h.creates()[0].activationSource, 'custom_ui');
      h.client.activate(); await h.client.send('Again');
      assert.equal(h.events().length, 1);
    });

    await t.test('a pending open closed before discovery counts separately from its replacement', async t => {
      let complete;
      const h = setup(t, { find: () => new Promise(resolve => { complete = resolve; }) });
      h.client.activate(); h.client.closeInvitation(); h.client.activate();
      assert.equal(h.events().length, 1); assert.equal(h.events()[0].showId, null);
      complete(response(offer)); await settle();
      assert.equal(h.events().length, 2); assert.equal(h.events()[1].showId, 'show');
      assert.notEqual(h.events()[0].activationId, h.events()[1].activationId);
    });

    await t.test('an unavailable or failed discovery still records the real open without a responder', async t => {
      for (const find of [async () => response({ available: false }), async () => { throw new Error('offline'); }]) {
        const h = setup(t, { find }); h.client.activate(); await settle();
        assert.equal(h.events().length, 1); assert.equal(h.events()[0].repId, null);
        assert.equal(h.creates().length, 0); h.unmount();
      }
    });

    await t.test('first-submit fallback survives synchronous and asynchronous telemetry failures', async t => {
      for (const telemetry of [() => { throw new Error('blocked'); }, () => Promise.reject(new Error('offline'))]) {
        const h = setup(t, { telemetry }); await settle();
        assert.equal(await h.client.send('Hello', { analyticsId: folder }), true);
        assert.equal(h.events().length, 1); assert.equal(h.events()[0].initialMessagePresent, true);
        assert.equal(h.creates()[0].activationId, h.events()[0].activationId);
        assert.equal(h.client.getSnapshot().phase, 'active'); h.unmount();
      }
    });

    await t.test('restoring a session never activates or creates it again', async t => {
      const h = setup(t, { storage: { getItem: () => JSON.stringify({ session, messages: [] }), setItem() {} } });
      await settle(); h.client.activate(); await h.client.send('Continue');
      assert.equal(h.events().length, 0); assert.equal(h.creates().length, 0);
    });

    await t.test('new chat first submit uses a fresh activation ID', async t => {
      const h = setup(t); await settle(); await h.client.send('First');
      await h.client.end(); await h.client.newChat();
      assert.equal(h.events().length, 1, 'a programmatic reset does not open an invitation');
      await h.client.send('Second');
      assert.equal(h.events().length, 2);
      assert.notEqual(h.events()[0].activationId, h.events()[1].activationId);
      assert.equal(h.creates()[1].activationId, h.events()[1].activationId);
    });

    await t.test('explicit New chat counts an invitation without sending a message', async t => {
      let lookups = 0, complete;
      const h = setup(t, { find: () => ++lookups === 1 ? Promise.resolve(response(offer)) : new Promise(resolve => { complete = resolve; }) });
      await settle(); await h.client.send('First'); await h.client.end();
      const restart = h.client.newChat({ analyticsId: folder, interaction: 'click' });
      assert.equal(h.events().length, 1, 'the new invitation waits for discovery');
      complete(response(offer)); await restart;
      assert.equal(h.events().length, 2);
      assert.equal(h.events()[1].analyticsId, folder);
      assert.equal(h.events()[1].initialMessagePresent, false);
      assert.equal(h.creates().length, 1, 'opening the invitation does not create a session');
      assert.notEqual(h.events()[0].activationId, h.events()[1].activationId);
      await h.client.send('Second');
      assert.equal(h.events().length, 2);
      assert.equal(h.creates()[1].activationId, h.events()[1].activationId);
    });

    await t.test('explicit New chat still counts when discovery fails', async t => {
      let lookups = 0;
      const h = setup(t, { find: async () => {
        if (++lookups === 1) return response(offer);
        throw new Error('discovery offline');
      } });
      await settle(); await h.client.send('First'); await h.client.end();
      await h.client.newChat({ analyticsId: folder, interaction: 'click' });
      assert.equal(h.events().length, 2);
      assert.equal(h.events()[1].showId, null);
      assert.equal(h.events()[1].repId, null);
      assert.equal(h.events()[1].initialMessagePresent, false);
      assert.equal(h.creates().length, 1);
    });
  });
}

