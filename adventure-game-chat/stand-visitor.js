// A small client for Stand's Visitor API (beta): the same HTTP and WebSocket
// contract that stand.js uses, without any of its UI.
//
//   discovery  GET    /v1/reps/find            who can answer on this page
//   start      POST   /v1/sessions             once, on the visitor's first message
//   send       POST   /v1/sessions/{id}/messages
//   receive    WSS    /ws/sessions/{id}        replies, typing, handoffs, close
//   recover    GET    /v1/sessions/{id}        after a reload or a dropped socket
//   end        DELETE /v1/sessions/{id}        only when the visitor ends it
//
// Nothing here draws anything. The UI subscribes to state changes and calls
// send(), end() and friends. Contract: https://stand.chat/guide/custom-chat-ui

const API = 'https://api.stand.chat';
const WS = 'wss://api.stand.chat';

const text = (value) => (typeof value === 'string' ? value : '');
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const isMessage = (m) =>
  Boolean(m && typeof m.messageId === 'string' && typeof m.body === 'string' && typeof m.type === 'string' &&
    typeof m.senderType === 'string' && Number.isFinite(m.seq));

class HttpError extends Error {
  constructor(status) {
    super(`Request failed (${status})`);
    this.status = status;
  }
}

export const INITIAL_STATE = {
  phase: 'loading', // loading | available | unavailable | active | ended | uncertain
  connection: 'offline', // offline | connecting | online
  busy: false,
  error: null,
  pending: null, // { body, clientMessageId }: sent, not yet confirmed
  draft: '', // Text from a message that never got through, for the visitor to send again
  messages: [], // canonical transcript, sorted by seq
  host: { name: '', kind: null, avatar: '', title: '' }, // kind: 'standin' (AI) | 'rep' (a person)
  notice: '', // the site's sensitive-data notice, if configured
  poweredByUrl: '', // Stand attribution link, if the plan shows it
  followupOffered: false, // a person offered to follow up by email
  activity: { typing: false, preview: '' }, // transient: typing indicator, streamed preview
};

export class StandVisitor {
  #state = INITIAL_STATE;
  #listeners = new Set();
  #session = null; // { sessionId, visitorToken }
  #offer = {};
  #socket = null;
  #timer;
  #read = null;
  #retries = 0;
  #uncertain = false;
  #typingSent = 0;
  #turn = { id: '', seq: -1 };
  #activationId = null;
  #typingTimer;
  #resent = ''; // The clientMessageId already sent again on its own, or refused with 409
  #key;

  constructor({ siteId, page = () => location.href, prompt = '', greeting = '', storage = safeStorage(), apiBase = API, wsBase = WS }) {
    Object.assign(this, { siteId, page, prompt, greeting, storage, apiBase, wsBase });
    this.#key = `stand-visitor:v1:${apiBase}:${siteId}`;
  }

  get state() {
    return this.#state;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  // Restores a saved conversation, or asks Stand who can answer.
  async start() {
    try {
      const saved = object(JSON.parse(this.storage?.getItem(this.#key) || '{}'));
      const session = object(saved.session);
      if (text(session.sessionId) && text(session.visitorToken)) {
        this.#session = { sessionId: session.sessionId, visitorToken: session.visitorToken };
      }
      this.#uncertain = saved.uncertain === true && !this.#session;
      const host = object(saved.host);
      const pending = object(saved.pending);
      const resumable = this.#session && text(pending.body) && text(pending.clientMessageId);
      this.#update({
        messages: this.#session && Array.isArray(saved.messages) ? saved.messages.filter(isMessage) : [],
        pending: resumable ? { body: pending.body, clientMessageId: pending.clientMessageId } : null,
        // A message that never got through, before the chat ended: keep its words.
        draft: text(saved.draft) || (!resumable && text(pending.body)) || '',
        host: { name: text(host.name), kind: host.kind === 'rep' || host.kind === 'standin' ? host.kind : null, avatar: text(host.avatar), title: text(host.title) },
        notice: text(saved.notice),
        poweredByUrl: text(saved.poweredByUrl),
      });
    } catch {
      // Unreadable storage: start fresh, in memory.
    }
    await this.retry();
  }

  // Discovery, or recovery of the current conversation. Safe to call again.
  retry = async () => {
    if (this.#state.busy || this.#state.phase === 'ended') return;
    this.#disconnect();
    this.#read?.abort();
    const read = (this.#read = new AbortController());
    if (this.#uncertain) {
      this.#update({ phase: 'uncertain', error: 'We could not confirm whether your chat started. Start a new one to try again.' });
      return;
    }
    this.#update({ error: null, ...(this.#session ? { connection: 'connecting' } : { phase: 'loading' }) });
    try {
      if (this.#session) {
        this.#apply(await this.#request(this.#path('?messageLimit=200'), { signal: read.signal }));
        if (this.#session) this.#connect();
      } else {
        const query = new URLSearchParams({ siteId: this.siteId, page: this.page(), greetingsEnabled: 'false' });
        const offer = await this.#request(`/v1/reps/find?${query}`, { signal: read.signal });
        if (read.signal.aborted) return;
        this.#offer = offer;
        const available = offer.available === true && Boolean(text(offer.standinProfileId) || text(offer.repId));
        this.#update({
          phase: available ? 'available' : 'unavailable',
          host: {
            name: text(offer.repName),
            kind: offer.responderType === 'standin' ? 'standin' : offer.responderType === 'rep' ? 'rep' : null,
            avatar: text(offer.avatar),
            title: text(offer.repTitle),
          },
          notice: text(offer.sensitiveNoticeText),
          poweredByUrl: text(offer.poweredByUrl),
        });
      }
    } catch (error) {
      if (read.signal.aborted) return;
      this.#fail(error, 'Could not reach the chat. Check your connection and try again.');
      if (this.#session) this.#reconnectLater();
      else if (this.#state.phase !== 'ended') this.#update({ phase: 'unavailable' });
    }
  };

  // Sends a visitor message. The first one starts the conversation.
  send = async (body) => {
    body = String(body ?? '').trim();
    if (this.#state.busy || !body || !['available', 'active'].includes(this.#state.phase)) return false;
    // One message at a time: an unconfirmed one goes first, as itself.
    const waiting = this.#state.pending;
    if (waiting?.clientMessageId && waiting.body !== body) return false;
    this.#update({ busy: true, error: null });
    let recover = false;
    try {
      if (!this.#session) {
        // No idempotency key on create: remember that a start may be in flight,
        // so a lost response never turns into a second conversation.
        this.#uncertain = true;
        this.#update({ pending: { body, clientMessageId: '' } });
        const offer = this.#offer;
        const data = await this.#request('/v1/sessions', {
          body: {
            siteId: this.siteId,
            page: this.page(),
            ...(text(offer.standinProfileId) ? { standinProfileId: offer.standinProfileId } : { repId: offer.repId }),
            initialMessage: body,
            // The greeting the character showed becomes the first line of the transcript.
            includeOpeningGreeting: Boolean(this.greeting),
            ...(this.greeting ? { openingMessage: this.greeting } : {}),
            ...(this.prompt ? { prompt: this.prompt.slice(0, 2000) } : {}),
            showId: offer.showId,
            ...(this.#activationId ? { activationId: this.#activationId, activationSource: 'unknown' } : {}),
            visitorLanguage: navigator.language,
            visitorLanguages: navigator.languages,
            visitorTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            pageLanguage: document.documentElement.lang,
          },
        });
        if (!text(data.sessionId) || !text(data.visitorToken)) throw new Error('Incomplete session');
        this.#session = { sessionId: data.sessionId, visitorToken: data.visitorToken };
        this.#uncertain = false;
        this.#activationId = null; // Used once, for this conversation.
        this.#update({ pending: null });
        this.#apply(data);
        if (this.#session) this.#connect();
      } else {
        // Retries reuse the same clientMessageId, so Stand never stores it twice.
        const pending = this.#state.pending?.clientMessageId ? this.#state.pending : { body, clientMessageId: crypto.randomUUID() };
        this.#update({ pending });
        this.#sendTyping(false);
        const accepted = await this.#request(this.#path('/messages'), { body: { ...pending, type: 'text' } });
        if (!isMessage(accepted)) throw new Error('Incomplete message');
        this.#merge([accepted]);
      }
      return true;
    } catch (error) {
      if (!this.#session && this.#uncertain) {
        // A clear 4xx means no chat was created; anything else might have been.
        this.#uncertain = !(error instanceof HttpError && error.status >= 400 && error.status < 500);
        this.#update({
          pending: null,
          phase: this.#uncertain ? 'uncertain' : 'unavailable',
          error: this.#uncertain ? 'We could not confirm whether your chat started. Start a new one to try again.' : 'The chat could not start. Please try again in a moment.',
        });
      } else {
        this.#fail(error, 'Your message was not confirmed. Send it again: it will not be duplicated.');
        recover = error instanceof HttpError && error.status === 409;
        // Never resubmit a refused transition on our own; the visitor decides.
        if (recover) this.#resent = this.#state.pending?.clientMessageId ?? '';
      }
      return false;
    } finally {
      this.#update({ busy: false });
      if (this.#session && (recover || (!this.#socket && !this.#timer))) this.retry();
    }
  };

  // Ends the conversation for good. Closing the UI does not call this.
  end = async () => {
    if (!this.#session || this.#state.busy) return;
    this.#update({ busy: true, error: null });
    try {
      await this.#request(this.#path(), { method: 'DELETE' });
      this.#finish();
    } catch (error) {
      this.#fail(error, 'Could not end the chat. Try again.');
    } finally {
      this.#update({ busy: false });
    }
  };

  // After an ended or uncertain chat: discover again. Never replays a message:
  // text that didn't get through comes back as a draft to review and resend.
  newChat = async () => {
    if (this.#state.busy || this.#session) return;
    this.#uncertain = false;
    this.#retries = 0;
    this.#update({ ...INITIAL_STATE, draft: this.#state.pending?.body || this.#state.draft });
    await this.retry();
  };

  // The UI took the draft into its input.
  takeDraft() {
    if (this.#state.draft) this.#update({ draft: '' });
  }

  submitEmail = async (email) => {
    if (!this.#session || !this.#state.followupOffered || this.#state.busy) return false;
    this.#update({ busy: true, error: null });
    try {
      await this.#request(this.#path('/followup-request'), { body: { email } });
      this.#finish();
      return true;
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) this.#update({ followupOffered: false, error: 'That offer has expired.' });
      else this.#fail(error, 'Could not send your email. Check it and try again.');
      return false;
    } finally {
      this.#update({ busy: false });
    }
  };

  trackLinkClick = (messageId, url) => {
    if (!this.#session) return;
    this.#request(this.#path('/link-clicks'), { body: { messageId, url } }).catch(() => {});
  };

  // Lets a person on the other end see that the visitor is typing.
  typing = () => this.#sendTyping(true);

  // Optional telemetry, fire and forget: the visitor opened the chat. Stand
  // ties this activation to the conversation it starts.
  activate(interaction) {
    if (this.#session || this.#state.phase !== 'available') return;
    const offer = this.#offer;
    this.#activationId = crypto.randomUUID();
    this.#beacon('/v1/events/activate', {
      siteId: this.siteId,
      activationId: this.#activationId,
      showId: offer.showId ?? null,
      page: this.page(),
      ...(text(offer.standinProfileId) ? { standinProfileId: offer.standinProfileId } : { repId: offer.repId ?? null }),
      responderType: offer.responderType ?? null,
      sourceType: 'unknown',
      interaction,
      initialMessagePresent: false,
    });
  }

  // Optional telemetry: the visitor clicked "Powered by Stand".
  badgeClick() {
    const offer = this.#offer;
    const responder = text(offer.standinProfileId) ? { standinProfileId: offer.standinProfileId } : text(offer.repId) ? { repId: offer.repId } : null;
    if (responder) this.#beacon('/v1/events/badge-click', { siteId: this.siteId, page: this.page(), ...responder });
  }

  destroy() {
    this.#disconnect();
    this.#read?.abort();
    this.#listeners.clear();
  }

  // --- Internals -------------------------------------------------------------

  #update(patch) {
    this.#state = { ...this.#state, ...patch };
    try {
      this.storage?.setItem(this.#key, JSON.stringify({
        session: this.#session,
        uncertain: this.#uncertain,
        pending: this.#state.pending,
        draft: this.#state.draft,
        host: this.#state.host,
        notice: this.#state.notice,
        poweredByUrl: this.#state.poweredByUrl,
        messages: this.#state.messages.slice(-200),
      }));
    } catch {
      // Storage can be full or denied; the chat still works in memory.
    }
    for (const listener of this.#listeners) listener(this.#state);
  }

  async #request(path, { body, method = body ? 'POST' : 'GET', signal } = {}) {
    const timeout = new AbortController();
    const abort = () => timeout.abort();
    const timer = setTimeout(abort, 15000);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(this.apiBase + path, {
        method,
        credentials: 'omit',
        signal: timeout.signal,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.#session && !path.startsWith('/v1/reps/') && path !== '/v1/sessions' ? { Authorization: `Bearer ${this.#session.visitorToken}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new HttpError(response.status);
      return object(await response.json().catch(() => ({})));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  #path(suffix = '') {
    return `/v1/sessions/${encodeURIComponent(this.#session.sessionId)}${suffix}`;
  }

  // Merges canonical messages by messageId, orders them by seq, and works out
  // who is answering from the system cards.
  #merge(incoming) {
    const byId = new Map(this.#state.messages.map((m) => [m.messageId, m]));
    for (const message of incoming) byId.set(message.messageId, message);
    const messages = [...byId.values()].sort((a, b) => a.seq - b.seq);
    let host = this.#state.host;
    let followupOffered = false;
    for (const message of messages) {
      if (message.senderType === 'rep') followupOffered = false;
      if (message.type !== 'system-card') continue;
      let card;
      try { card = object(JSON.parse(message.body)); } catch { continue; }
      if (card.cardType === 'handoff' || card.cardType === 'human-transfer') {
        host = { name: text(card.repName) || host.name, kind: 'rep', avatar: text(card.repAvatar), title: text(card.repTitle) };
        followupOffered = false;
      } else if (card.cardType === 'session-start' || card.cardType === 'standin-takeover') {
        host = { name: text(card.standinName) || host.name, kind: 'standin', avatar: text(card.standinAvatar) || host.avatar, title: text(card.standinTitle) };
        followupOffered = false;
      } else if (card.cardType === 'rep-followup-offer') {
        followupOffered = true;
      } else if (card.cardType === 'rep-followup-confirmation' || card.cardType === 'session-end') {
        followupOffered = false;
      }
    }
    const pending = this.#state.pending;
    const confirmed = pending && messages.some((m) => m.clientMessageId === pending.clientMessageId);
    // A reply ends any streamed preview for its turn.
    const replied = incoming.some((m) => m.senderType === 'standin' || m.senderType === 'rep');
    this.#update({
      messages,
      host,
      followupOffered,
      pending: confirmed ? null : pending,
      ...(replied ? { activity: { typing: false, preview: '' } } : {}),
    });
    if (replied) clearTimeout(this.#typingTimer);
  }

  #apply(data) {
    if (data.sessionId !== this.#session?.sessionId) throw new Error('Unexpected session');
    const host = object((Array.isArray(data.participants) ? data.participants : []).find((p) => p?.isRep === true));
    if (host.name) this.#update({ host: { ...this.#state.host, name: text(host.name), avatar: text(host.avatar) || this.#state.host.avatar, title: text(host.title) } });
    this.#merge((Array.isArray(data.messages) ? data.messages : []).filter(isMessage));
    if (data.status !== 'active') this.#finish();
    else this.#update({ phase: 'active', error: null });
  }

  #finish(error = null) {
    this.#disconnect();
    this.#read?.abort();
    this.#session = null;
    this.#uncertain = false;
    this.#update({ phase: 'ended', connection: 'offline', followupOffered: false, activity: { typing: false, preview: '' }, error });
  }

  #fail(error, message) {
    if (error instanceof HttpError && [401, 403, 404].includes(error.status) && this.#session) {
      this.#finish('This conversation is no longer available. Start a new one to continue.');
    } else {
      this.#update({ error: message });
    }
  }

  #connect() {
    if (!this.#session) return;
    const url = new URL(`${this.wsBase}/ws/sessions/${encodeURIComponent(this.#session.sessionId)}`);
    url.searchParams.set('token', this.#session.visitorToken);
    const socket = new WebSocket(url);
    this.#socket = socket;
    const current = () => this.#socket === socket && Boolean(this.#session);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      if (current()) { this.#disconnect(); this.#reconnectLater(); }
    }, 10000);

    socket.onmessage = (event) => {
      if (!current()) return;
      let data;
      try { data = object(JSON.parse(event.data)); } catch { return; }
      if (data.sessionId && data.sessionId !== this.#session.sessionId) return;
      switch (data.type) {
        case 'connected':
          clearTimeout(this.#timer);
          this.#timer = undefined;
          this.#update({ connection: 'online', error: null });
          // Subscribed; now fetch anything that arrived before the socket did.
          this.#request(this.#path('?messageLimit=200'), { signal: this.#read?.signal })
            .then((snapshot) => {
              if (!current()) return;
              this.#apply(snapshot);
              this.#retries = 0;
              // A message still unconfirmed goes again, once, with the same clientMessageId.
              const pending = this.#state.pending;
              if (pending?.clientMessageId && pending.clientMessageId !== this.#resent && !this.#state.busy && this.#state.phase === 'active') {
                this.#resent = pending.clientMessageId;
                this.send(pending.body);
              }
            })
            .catch((error) => { if (current()) { this.#fail(error, 'Reconnecting…'); this.#disconnect(); this.#reconnectLater(); } });
          return;
        case 'session.closed':
          this.#finish();
          return;
        case 'typing':
          if (data.senderType !== 'visitor') this.#typing(data.active === true);
          return;
        case 'standin.status':
          if (data.phase === 'fallback') this.#update({ activity: { ...this.#state.activity, preview: '' } });
          this.#typing(data.phase === 'typing' || data.phase === 'reconnecting' || data.phase === 'fallback');
          return;
        case 'standin.delta': {
          // `text` is the whole preview so far. Only a newer seq replaces it.
          const turnId = text(data.turnId);
          if (turnId !== this.#turn.id) this.#turn = { id: turnId, seq: -1 };
          if (!(data.seq > this.#turn.seq)) return;
          this.#turn.seq = data.seq;
          this.#update({ activity: { typing: true, preview: text(data.text) } });
          return;
        }
        case 'message.rejected':
          this.retry();
          return;
        default:
          if (data.event === 'message' && isMessage(data)) this.#merge([data]);
        // Anything else (language changes, future events) is safe to ignore.
      }
    };
    socket.onclose = () => {
      if (current()) { this.#disconnect(); this.#reconnectLater(); }
    };
    socket.onerror = () => {};
  }

  #beacon(path, body) {
    const json = JSON.stringify(body);
    try {
      if (navigator.sendBeacon?.(this.apiBase + path, new Blob([json], { type: 'text/plain' }))) return;
    } catch {
      // Fall back to fetch.
    }
    fetch(this.apiBase + path, { method: 'POST', credentials: 'omit', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: json }).catch(() => {});
  }

  // Typing indicators fade on their own if the other side goes quiet.
  #typing(active) {
    clearTimeout(this.#typingTimer);
    if (active) this.#typingTimer = setTimeout(() => this.#typing(false), 20000);
    if (this.#state.activity.typing !== active) this.#update({ activity: { ...this.#state.activity, typing: active } });
  }

  #sendTyping(active) {
    const socket = this.#socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (active && now - this.#typingSent < 3000) return;
    this.#typingSent = active ? now : 0;
    socket.send(JSON.stringify({ type: 'typing', active }));
  }

  #disconnect() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#state.activity.typing) this.#typing(false);
    const socket = this.#socket;
    this.#socket = null;
    if (socket) {
      socket.onclose = socket.onmessage = socket.onerror = null;
      socket.close();
    }
  }

  #reconnectLater() {
    if (!this.#session || this.#timer) return;
    this.#update({ connection: 'offline' });
    if (this.#retries >= 6) {
      this.#update({ error: 'Lost the connection. Try again to check for replies.' });
      return;
    }
    const delay = Math.min(1000 * 2 ** this.#retries++, 15000) + Math.random() * 400;
    this.#timer = setTimeout(() => { this.#timer = undefined; this.retry(); }, delay);
  }
}

function safeStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
