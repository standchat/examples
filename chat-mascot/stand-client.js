// A small visitor client for Stand's custom chat UI API (beta):
// https://stand.chat/guide/custom-chat-ui
//
// Discovery, one-time session creation, HTTP sends, a WebSocket for replies,
// reload and reconnect recovery. It follows the guide's reference client and
// adds the optional live events a character needs: typing, and streamed
// previews of an AI reply while it is being written.
//
// The UI subscribes to one state object and calls send(), retry(), end(),
// newChat(), submitEmail() and trackLinkClick(). Nothing here touches the DOM.

const PHASES = ['loading', 'available', 'unavailable', 'active', 'ended', 'uncertain'];

export const INITIAL_STATE = {
  phase: 'loading', // one of PHASES
  connection: 'offline', // connecting | online | offline
  busy: false,
  error: null,
  draft: '',
  pending: null, // { body, clientMessageId } while a send is unconfirmed
  messages: [], // canonical transcript, sorted by seq
  host: { name: 'Stand', kind: null, avatar: '' }, // kind: 'rep' | 'standin'
  notice: '',
  poweredByUrl: '',
  followupOffered: false,
  typing: false, // the responder is typing or an AI turn is in progress
  preview: '', // streamed text of the AI reply in progress
};

class HttpError extends Error {
  constructor(status) {
    super(`Request failed (${status}).`);
    this.status = status;
  }
}

const object = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const text = (v) => (typeof v === 'string' ? v : '');
const toMessages = (v) =>
  (Array.isArray(v) ? v : []).filter(
    (m) => m && typeof m.messageId === 'string' && typeof m.body === 'string' &&
      typeof m.type === 'string' && typeof m.senderType === 'string' && Number.isFinite(m.seq),
  );

export class StandChatClient {
  #state = INITIAL_STATE;
  #session = null; // { sessionId, visitorToken }
  #offer = {};
  #listeners = new Set();
  #mounted = false;
  #initialized = false;
  #epoch = 0;
  #socket = null;
  #timer;
  #read = null;
  #retries = 0;
  #uncertain = false;
  #typingTimer;
  #turn = { id: '', seq: -1 };

  /**
   * @param {object} config
   * @param {string} config.siteId      Your site's public ID ('demo' works anywhere).
   * @param {string} [config.apiBase]   https://api.stand.chat
   * @param {string} [config.wsBase]    wss://api.stand.chat
   * @param {() => string} [config.page]  The current page URL.
   * @param {Storage} [config.storage]  Where to keep the conversation across reloads.
   * @param {() => object} [config.context]  Extra fields for session creation: prompt, openingMessage…
   */
  constructor(config) {
    this.config = {
      apiBase: 'https://api.stand.chat',
      wsBase: 'wss://api.stand.chat',
      page: () => location.href,
      ...config,
    };
    this.api = this.config.apiBase.replace(/\/$/, '');
    this.key = `stand-custom-chat:v1:${this.api}:${this.config.siteId}`;
  }

  get state() {
    return this.#state;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  #update(patch) {
    this.#state = { ...this.#state, ...patch };
    try {
      const s = this.#state;
      this.config.storage?.setItem(this.key, JSON.stringify({
        session: this.#session, uncertain: this.#uncertain, phase: s.phase,
        draft: s.draft, pending: s.pending, host: s.host, notice: s.notice,
        poweredByUrl: s.poweredByUrl, messages: s.messages.slice(-500),
      }));
    } catch { /* Storage can be denied or full; the chat still works in memory. */ }
    for (const listener of this.#listeners) listener(this.#state);
  }

  // Start: restore a saved conversation or discover who can answer.
  mount() {
    this.#mounted = true;
    if (!this.#initialized) {
      this.#initialized = true;
      try {
        const saved = object(JSON.parse(this.config.storage?.getItem(this.key) || '{}'));
        const session = object(saved.session);
        if (text(session.sessionId) && text(session.visitorToken)) {
          this.#session = { sessionId: session.sessionId, visitorToken: session.visitorToken };
        }
        this.#uncertain = saved.uncertain === true && !this.#session;
        const pending = object(saved.pending);
        const host = object(saved.host);
        this.#state = {
          ...INITIAL_STATE,
          phase: !this.#session && saved.phase === 'ended' ? 'ended' : 'loading',
          draft: text(saved.draft),
          messages: toMessages(saved.messages),
          pending: (this.#session || saved.phase === 'ended') && text(pending.body) && text(pending.clientMessageId)
            ? { body: pending.body, clientMessageId: pending.clientMessageId } : null,
          host: {
            name: text(host.name) || 'Stand', avatar: text(host.avatar),
            kind: host.kind === 'rep' || host.kind === 'standin' ? host.kind : null,
          },
          notice: text(saved.notice),
          poweredByUrl: text(saved.poweredByUrl),
        };
      } catch { /* Ignore corrupt or unavailable storage. */ }
      this.#update({});
    }
    const epoch = ++this.#epoch;
    if (!this.#state.busy && this.#state.phase !== 'ended') this.retry();
    return () => {
      if (epoch !== this.#epoch) return;
      this.#mounted = false;
      ++this.#epoch;
      this.#disconnect();
      this.#read?.abort();
    };
  }

  get hasSession() {
    return Boolean(this.#session);
  }

  setDraft(draft) {
    this.#update({ draft });
  }

  async #request(path, body, method = body ? 'POST' : 'GET', signal) {
    const timeout = new AbortController();
    const abort = () => timeout.abort();
    const timer = setTimeout(abort, 15000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try {
      const response = await fetch(this.api + path, {
        method,
        credentials: 'omit',
        signal: timeout.signal,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.#session ? { Authorization: `Bearer ${this.#session.visitorToken}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new HttpError(response.status);
      return object(await response.json());
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  #path(suffix = '') {
    return `/v1/sessions/${encodeURIComponent(this.#session.sessionId)}${suffix}`;
  }

  // Canonical messages merge by messageId and sort by seq. Identity cards update the host.
  #merge(incoming) {
    const byId = new Map(this.#state.messages.map((m) => [m.messageId, m]));
    for (const m of incoming) byId.set(m.messageId, m);
    const transcript = [...byId.values()].sort((a, b) => a.seq - b.seq);
    let host = this.#state.host;
    let followupOffered = false;
    for (const m of transcript) {
      if (m.senderType === 'rep') followupOffered = false;
      if (m.type !== 'system-card' && m.senderType !== 'system-card') continue;
      try {
        const card = object(JSON.parse(m.body));
        if (card.cardType === 'handoff' || card.cardType === 'human-transfer') {
          host = { name: text(card.repName) || host.name, avatar: text(card.repAvatar), kind: 'rep' };
          followupOffered = false;
        } else if (card.cardType === 'session-start' || card.cardType === 'standin-takeover') {
          host = { name: text(card.standinName) || host.name, avatar: text(card.standinAvatar) || host.avatar, kind: 'standin' };
          followupOffered = false;
        } else if (card.cardType === 'rep-followup-offer') followupOffered = true;
        else if (card.cardType === 'rep-followup-confirmation' || card.cardType === 'session-end') followupOffered = false;
      } catch { /* Unknown or malformed cards never execute anything. */ }
    }
    const pending = this.#state.pending;
    const answered = incoming.some((m) => m.senderType === 'standin' || m.senderType === 'rep');
    this.#update({
      messages: transcript,
      host,
      followupOffered,
      pending: pending && transcript.some((m) => m.clientMessageId === pending.clientMessageId) ? null : pending,
      ...(answered ? { typing: false, preview: '' } : {}),
    });
  }

  #applySession(data) {
    if (data.sessionId !== this.#session?.sessionId) throw new Error('Unexpected session response');
    const participant = (Array.isArray(data.participants) ? data.participants : []).map(object).find((p) => p.isRep === true);
    if (participant) {
      this.#update({
        host: {
          ...this.#state.host,
          name: text(participant.name) || this.#state.host.name,
          avatar: text(participant.avatar) || this.#state.host.avatar,
        },
      });
    }
    this.#merge(toMessages(data.messages));
    if (data.status !== 'active') this.#finish();
    else this.#update({ phase: 'active', error: null });
  }

  #finish(error = null) {
    this.#disconnect();
    this.#read?.abort();
    this.#session = null;
    this.#uncertain = false;
    // Keep unresolved text and its ID: an in-flight response may still confirm it.
    this.#update({ phase: 'ended', connection: 'offline', followupOffered: false, typing: false, preview: '', error });
  }

  #handleFailure(error, fallback) {
    if (error instanceof HttpError && [401, 403, 404].includes(error.status) && this.#session) {
      this.#finish('This conversation is no longer available. Start a new chat to continue.');
    } else this.#update({ error: fallback });
  }

  retry = async () => {
    if (!this.#mounted || this.#state.busy || this.#state.phase === 'ended') return;
    this.#disconnect();
    this.#read?.abort();
    const read = new AbortController();
    this.#read = read;
    const epoch = this.#epoch;
    if (this.#uncertain) {
      this.#update({ phase: 'uncertain', error: 'The previous start could not be confirmed. It may have created a chat.' });
      return;
    }
    this.#update({ error: null, ...(this.#session ? { connection: 'connecting' } : { phase: 'loading' }) });
    try {
      if (this.#session) {
        const data = await this.#request(this.#path('?messageLimit=500'), undefined, 'GET', read.signal);
        if (!this.#mounted || epoch !== this.#epoch || read.signal.aborted) return;
        this.#applySession(data);
        if (this.#session) this.#connect(epoch);
      } else {
        const query = new URLSearchParams({ siteId: this.config.siteId, page: this.config.page(), greetingsEnabled: 'false' });
        const offer = await this.#request(`/v1/reps/find?${query}`, undefined, 'GET', read.signal);
        if (!this.#mounted || epoch !== this.#epoch || read.signal.aborted) return;
        this.#offer = offer;
        const available = offer.available === true && Boolean(text(offer.standinProfileId) || text(offer.repId));
        this.#update({
          phase: available ? 'available' : 'unavailable',
          host: {
            name: text(offer.repName) || 'Stand',
            avatar: text(offer.avatar),
            kind: offer.responderType === 'standin' ? 'standin' : offer.responderType === 'rep' ? 'rep' : null,
          },
          notice: text(offer.sensitiveNoticeText),
          poweredByUrl: text(offer.poweredByUrl),
        });
      }
    } catch (error) {
      if (!this.#mounted || epoch !== this.#epoch || read.signal.aborted) return;
      this.#handleFailure(error, 'Could not connect. Your message is saved; try again.');
      if (this.#session) this.#scheduleReconnect();
      else if (this.#state.phase !== 'ended') this.#update({ phase: 'unavailable' });
    }
  };

  #disconnect() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#socket) {
      this.#socket.onclose = null;
      this.#socket.onmessage = null;
      this.#socket.onerror = null;
      this.#socket.close();
      this.#socket = null;
    }
  }

  #scheduleReconnect() {
    if (!this.#mounted || !this.#session || this.#timer) return;
    this.#update({ connection: 'offline' });
    if (this.#retries >= 5) {
      this.#update({ error: 'Connection paused. Reconnect to check for replies.' });
      return;
    }
    const delay = Math.min(1000 * 2 ** this.#retries++, 15000) + Math.random() * 300;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.retry();
    }, delay);
  }

  #connect(epoch) {
    if (!this.#mounted || !this.#session || epoch !== this.#epoch) return;
    // Use the configured origin, never a URL from an event.
    const url = new URL(`${this.config.wsBase.replace(/\/$/, '')}${this.#path().replace('/v1/sessions/', '/ws/sessions/')}`);
    url.searchParams.set('token', this.#session.visitorToken);
    const socket = new WebSocket(url);
    this.#socket = socket;
    const current = () => this.#mounted && epoch === this.#epoch && this.#socket === socket && Boolean(this.#session);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      if (current()) {
        this.#disconnect();
        this.#scheduleReconnect();
      }
    }, 10000);
    socket.onmessage = (event) => {
      if (!current()) return;
      let data;
      try {
        data = object(JSON.parse(event.data));
      } catch {
        return;
      }
      if (data.sessionId && data.sessionId !== this.#session?.sessionId) return;
      if (data.type === 'connected') {
        clearTimeout(this.#timer);
        this.#timer = undefined;
        this.#update({ connection: 'online', error: null });
        // Subscribed first; now merge a snapshot to cover anything missed.
        this.#request(this.#path('?messageLimit=500'), undefined, 'GET', this.#read?.signal).then((snapshot) => {
          if (current()) {
            this.#applySession(snapshot);
            this.#retries = 0;
          }
        }).catch((error) => {
          if (!current()) return;
          this.#handleFailure(error, 'Could not refresh replies. Reconnecting.');
          this.#disconnect();
          this.#scheduleReconnect();
        });
      } else if (data.type === 'session.closed') this.#finish();
      else if (data.type === 'typing') this.#onTyping(data);
      else if (data.type === 'standin.status') this.#onStandinStatus(data);
      else if (data.type === 'standin.delta') this.#onDelta(data);
      else if (data.type === 'message.rejected') this.retry();
      else {
        const incoming = toMessages([data]);
        if (incoming.length) this.#merge(incoming); // Ignore unknown frames.
      }
    };
    socket.onclose = () => {
      if (current()) {
        this.#disconnect();
        this.#scheduleReconnect();
      }
    };
    socket.onerror = () => { /* onclose drives recovery. */ };
  }

  // Live, non-persisted events: a typing responder and an AI reply being written.
  #onTyping(data) {
    if (data.senderType === 'visitor') return;
    clearTimeout(this.#typingTimer);
    const active = data.active === true;
    this.#update({ typing: active });
    if (active) this.#typingTimer = setTimeout(() => this.#update({ typing: false }), 8000);
  }

  #onStandinStatus(data) {
    const phase = text(data.phase);
    clearTimeout(this.#typingTimer);
    if (phase === 'typing' || phase === 'reconnecting') {
      this.#update({ typing: true });
      this.#typingTimer = setTimeout(() => this.#update({ typing: false, preview: '' }), 30000);
    } else if (phase === 'fallback') this.#update({ preview: '' });
    else if (phase === 'clear') this.#update({ typing: false, preview: '' });
  }

  #onDelta(data) {
    const turnId = text(data.turnId);
    const seq = Number(data.seq);
    // The text is the full preview so far; only a newer one replaces it.
    if (turnId === this.#turn.id && !(seq > this.#turn.seq)) return;
    this.#turn = { id: turnId, seq: Number.isFinite(seq) ? seq : this.#turn.seq };
    this.#update({ typing: true, preview: text(data.text) });
  }

  send = async () => {
    if (this.#state.busy) return;
    const body = this.#state.pending?.body || this.#state.draft.trim();
    if (!body || !['available', 'active'].includes(this.#state.phase)) return;
    this.#update({ busy: true, error: null });
    let recover = false;
    try {
      if (!this.#session) {
        this.#uncertain = true;
        this.#update({ draft: body, pending: { body, clientMessageId: 'initial' } }); // Remember an ambiguous start before sending.
        const data = await this.#request('/v1/sessions', {
          siteId: this.config.siteId,
          page: this.config.page(),
          initialMessage: body,
          ...(text(this.#offer.standinProfileId) ? { standinProfileId: this.#offer.standinProfileId } : { repId: this.#offer.repId }),
          includeOpeningGreeting: false,
          showId: this.#offer.showId,
          visitorLanguage: navigator.language,
          visitorLanguages: navigator.languages,
          pageLanguage: document.documentElement.lang,
          visitorTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(this.config.context?.() ?? {}),
        });
        if (!text(data.sessionId) || !text(data.visitorToken)) throw new Error('Incomplete session credentials');
        this.#session = { sessionId: data.sessionId, visitorToken: data.visitorToken };
        this.#uncertain = false;
        this.#update({ draft: '', pending: null, typing: true });
        this.#applySession(data);
        if (this.#mounted && this.#session) this.#connect(this.#epoch);
      } else {
        const pending = this.#state.pending || { body, clientMessageId: crypto.randomUUID() };
        this.#update({ pending, draft: '' });
        const data = await this.#request(this.#path('/messages'), { ...pending, type: 'text' });
        const accepted = toMessages([data]);
        if (!accepted.length) throw new Error('Incomplete message response');
        this.#merge(accepted);
      }
    } catch (error) {
      if (!this.#session && this.#uncertain) {
        // A definite rejection can be retried after fresh discovery; a lost
        // response must never trigger an automatic second start.
        this.#uncertain = !(error instanceof HttpError && error.status >= 400 && error.status < 500);
        this.#update({
          phase: this.#uncertain ? 'uncertain' : 'unavailable',
          pending: null,
          error: this.#uncertain
            ? 'We could not confirm whether the chat started.'
            : 'The chat could not start. Check availability and try again.',
        });
      } else {
        this.#handleFailure(error, this.#state.phase === 'ended'
          ? 'Delivery was not confirmed before the chat ended. Start a new chat to review your message.'
          : 'Message not confirmed. Retry to check delivery without sending it twice.');
        recover = error instanceof HttpError && error.status === 409;
      }
    } finally {
      this.#update({ busy: false });
      if (this.#mounted && this.#session && (recover || (!this.#socket && !this.#timer))) this.retry();
    }
  };

  end = async () => {
    if (!this.#session || this.#state.busy) return;
    this.#update({ busy: true, error: null });
    try {
      await this.#request(this.#path(), undefined, 'DELETE');
      this.#finish();
    } catch (error) {
      this.#handleFailure(error, 'Could not confirm the end of this chat. Try again.');
    } finally {
      this.#update({ busy: false });
    }
  };

  newChat = async () => {
    if (this.#state.busy || this.#session) return;
    this.#uncertain = false;
    this.#retries = 0;
    // Starting over only prepares an editable draft; nothing is replayed into
    // another conversation.
    const pendingBody = this.#state.pending?.clientMessageId === 'initial' ? '' : this.#state.pending?.body;
    const draft = pendingBody && pendingBody !== this.#state.draft
      ? [pendingBody, this.#state.draft].filter(Boolean).join('\n\n')
      : this.#state.draft || pendingBody || '';
    this.#update({ ...INITIAL_STATE, draft });
    await this.retry();
  };

  submitEmail = async (email) => {
    if (!this.#session || !this.#state.followupOffered || this.#state.busy) return;
    this.#update({ busy: true, error: null });
    try {
      await this.#request(this.#path('/followup-request'), { email });
      this.#finish('Your follow-up request was sent.');
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        this.#update({ followupOffered: false, error: 'That offer has changed. Reconnect to refresh the conversation.' });
      } else this.#handleFailure(error, 'Could not submit your email. Check it and try again.');
    } finally {
      this.#update({ busy: false });
    }
  };

  trackLinkClick = async (messageId, url) => {
    if (!this.#session) return;
    try {
      await this.#request(this.#path('/link-clicks'), { messageId, url });
    } catch { /* Best effort: never blocks navigation. */ }
  };
}

export { PHASES };
