import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StandVisitorClient } from './stand-visitor.js';

const events = new EventTarget();
globalThis.addEventListener = events.addEventListener.bind(events);
globalThis.removeEventListener = events.removeEventListener.bind(events);
globalThis.document = Object.assign(new EventTarget(), { documentElement: { lang: 'en' }, visibilityState: 'visible' });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'en', languages: ['en'], sendBeacon: () => true } });
class Socket {
  static OPEN = 1;
  static instances = [];
  readyState = 1;
  constructor() { Socket.instances.push(this); }
  emit(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
  send() {}
  close() { this.readyState = 3; }
}
globalThis.WebSocket = Socket;
const tick = () => new Promise(r => setImmediate(r));
const message = (id, seq, body, extra = {}) => ({ messageId: id, seq, body, type: 'text', senderType: 'visitor', ...extra });
const session = (messages = [], status = 'active') => ({ sessionId: 'test-session', visitorToken: 'test-token', status, participants: [], messages });
const offer = { available: true, standinProfileId: 'demo-ai', responderType: 'standin', repName: 'Demo AI', poweredByUrl: 'https://stand.chat/', sensitiveNoticeText: 'Test notice' };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const store = () => { const data = new Map(); return { getItem: k => data.get(k), setItem: (k,v) => data.set(k,v) }; };
async function setup(handler, storage = store()) {
  Socket.instances = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path === '/v1/reps/find') return response(offer);
    return handler(path, options);
  };
  const client = new StandVisitorClient({ site: 'demo', scope: 'test', storage, page: () => 'https://example.test/rehearsal/' });
  const release = client.mount(); await tick();
  return { client, release, storage };
}

test('creation is serialized; HTTP and socket copies reconcile; restore uses the same session', async () => {
  let creates = 0; let resolveCreate; let transcript = [];
  const env = await setup(async (path, options) => {
    if (path === '/v1/sessions') { creates++; return new Promise(resolve => resolveCreate = resolve); }
    return response(session(transcript));
  });
  try {
    const first = env.client.send('Approval question', { prompt: 'Current board', owner: 'stage-4' });
    assert.equal(await env.client.send('Double click'), false);
    transcript = [message('m1', 1, 'Approval question')];
    resolveCreate(response(session(transcript))); await first;
    const socket = Socket.instances.at(-1); socket.emit({ type: 'connected' }); await tick();
    socket.emit({ event: 'message', ...transcript[0] });
    assert.equal(creates, 1); assert.equal(env.client.getSnapshot().messages.length, 1);
    env.release();
    const restored = new StandVisitorClient({ site: 'demo', scope: 'test', storage: env.storage, page: () => 'https://example.test/rehearsal/' });
    const stop = restored.mount(); await tick();
    assert.equal(restored.getSnapshot().phase, 'active');
    assert.equal(restored.getSnapshot().notice, 'Test notice');
    assert.equal(creates, 1); stop();
  } finally { env.release(); }
});

test('ambiguous start keeps the draft and never repeats creation on retry', async () => {
  let creates = 0;
  const env = await setup(() => { creates++; throw new TypeError('Network lost'); });
  try {
    await env.client.send('Preserve this question');
    assert.equal(env.client.getSnapshot().phase, 'uncertain');
    assert.match(env.client.getSnapshot().draft, /Preserve this question/);
    await env.client.retry();
    assert.equal(creates, 1);
    await env.client.newChat();
    assert.equal(env.client.getSnapshot().phase, 'available');
    assert.equal(creates, 1);
  } finally { env.release(); }
});

test('failed send retries with its original clientMessageId and preserves body', async () => {
  const ids = []; let transcript = [message('m1', 1, 'First')];
  const env = await setup((path, options) => {
    if (path.endsWith('/messages')) {
      const body = JSON.parse(options.body); ids.push(body.clientMessageId);
      if (ids.length === 1) throw new TypeError('Dropped reply');
      return response(message('m2', 2, body.body, { clientMessageId: body.clientMessageId }));
    }
    return response(session(transcript));
  });
  try {
    await env.client.send('First'); Socket.instances.at(-1).emit({ type: 'connected' }); await tick();
    await env.client.send('Second'); assert.equal(env.client.getSnapshot().pending.body, 'Second');
    await env.client.send(); assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
    assert.equal(env.client.getSnapshot().pending, null);
    assert.equal(env.client.getSnapshot().messages.filter(m => m.body === 'Second').length, 1);
  } finally { env.release(); }
});

test('handoff identity, offered follow-up and closure follow canonical cards', async () => {
  const transcript = [message('m1', 1, 'First')]; let followup = '';
  const env = await setup((path, options) => {
    if (path.endsWith('/followup-request')) { followup = JSON.parse(options.body).email; return response({ status: 'closed' }); }
    return response(session(transcript));
  });
  try {
    await env.client.send('First'); const socket = Socket.instances.at(-1);
    socket.emit({ event: 'message', ...message('m2', 2, JSON.stringify({ cardType: 'human-transfer', repName: 'Demo reviewer' }), { type: 'system-card', senderType: 'system-card' }) });
    assert.equal(env.client.getSnapshot().host.kind, 'rep');
    assert.equal(env.client.getSnapshot().host.name, 'Demo reviewer');
    socket.emit({ event: 'message', ...message('m3', 3, JSON.stringify({ cardType: 'rep-followup-offer' }), { type: 'system-card', senderType: 'system-card' }) });
    assert.equal(env.client.getSnapshot().followupOffered, true);
    assert.equal(await env.client.submitEmail('reviewer@example.test'), true);
    assert.equal(followup, 'reviewer@example.test');
    assert.equal(env.client.getSnapshot().phase, 'ended');
  } finally { env.release(); }
});

test('a 404 send recovers accepted text from the closed transcript before clearing credentials', async () => {
  let closed = false; let accepted;
  const first = message('m1', 1, 'First');
  const env = await setup((path, options) => {
    if (path.endsWith('/messages')) {
      const pending = JSON.parse(options.body); closed = true;
      accepted = message('m2', 2, pending.body, { clientMessageId: pending.clientMessageId });
      return response({}, 404);
    }
    return response(session(closed ? [first, accepted] : [first], closed ? 'closed' : 'active'));
  });
  try {
    await env.client.send('First'); Socket.instances.at(-1).emit({ type: 'connected' }); await tick();
    await env.client.send('Arrived during closure');
    assert.equal(env.client.getSnapshot().phase, 'ended');
    assert.equal(env.client.getSnapshot().pending, null);
    assert.equal(env.client.getSnapshot().messages.at(-1).body, 'Arrived during closure');
  } finally { env.release(); }
});
