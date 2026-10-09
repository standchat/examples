/*! Stand Chat Halloween mode · Public domain (Unlicense) */
(function () {
  'use strict';
  if (window.StandHalloween) return;

  const script = document.currentScript;
  const source = script && script.src ? script.src : document.baseURI;
  const ratings = ['g', 'pg', 'pg-13', 'r', 'nc-17'];
  const kinds = ['ghost', 'pumpkin', 'bat', 'spider', 'hand'];
  const activities = {
    calm: { interval: 28000, max: 1 }, lively: { interval: 14000, max: 2 }, haunted: { interval: 8000, max: 3 },
  };
  const voices = {
    g: { ghost: 'Boo. Hello, you. Need a hand?', pumpkin: 'A little pumpkin with a big hello. What can I help you find?', bat: 'Hi from up here! Have a question?' },
    pg: { ghost: 'Just floating by. Need a hand?', pumpkin: 'All lit up and ready to help. What are you looking for?', bat: 'Working the night shift. What can I help you find?' },
    'pg-13': { ghost: 'A little lost? I know my way around.', pumpkin: 'The light is on. Someone is home. What would you like to know?', bat: 'You caught me on my rounds. Need a hand?' },
    r: { ghost: 'Don’t be a stranger. What brings you here?', pumpkin: 'A face only October could love. What can I help with?', bat: 'Something on your mind? I’m all ears.' },
    'nc-17': { ghost: 'Come closer. Even the undead can be helpful.', pumpkin: 'The last light in the haunted house. What are you looking for?', bat: 'A creature of the night. A surprisingly good listener. Ask away.' },
  };
  Object.assign(voices.g, { spider: 'Eight little waves. Hello!', hand: 'A helping hand. What can I find for you?' });
  Object.assign(voices.pg, { spider: 'Just dropping in. Need a hand?', hand: 'Could you use a hand?' });
  Object.assign(voices['pg-13'], { spider: 'Hanging by a thread? Let’s untangle that.', hand: 'Help is closer than you think. What are you looking for?' });
  Object.assign(voices.r, { spider: 'Weaving a little welcome. What brings you here?', hand: 'Back from the beyond. Still happy to help.' });
  Object.assign(voices['nc-17'], { spider: 'You’ve wandered into my web. Let’s find you a way through.', hand: 'Something brought you here. May I lend a hand?' });
  const accents = { g: '#adf7ce', pg: '#ffbe78', 'pg-13': '#c6adff', r: '#ff8c6b', 'nc-17': '#d0f184' };
  const defaults = {
    rating: 'pg', idleDelay: 12000, arrivalInterval: 14000, duration: 11000,
    greeting: '', chatGreeting: '', cast: kinds, activity: 'lively', placement: 'auto', size: 1,
    season: '10-01/11-01', preview: false,
    autoStart: true, controls: true, idleOnce: true, maxItems: 2, readyTimeout: 8000,
    assetBase: new URL('assets/runtime/', source).href, storageKey: 'stand-halloween:greeted',
  };
  const data = script ? script.dataset : {};
  // Supplying a Site ID opts into the complete, one-script installation.
  // Omit it when an existing Stand installation owns SDK loading.
  const standId = String(data.standId || '').trim();
  const initial = Object.assign({}, window.StandHalloweenConfig || {});
  Object.keys(defaults).forEach(key => { if (data[key] !== undefined) initial[key] = data[key]; });
  let config = Object.assign({}, defaults);
  let running = false;
  let stopped = false;
  let destroyed = false;
  let opening = false;
  let available = false;
  let suppressed = false;
  let host, root, layer, control, notice, noticeText, retry;
  let timer, noticeTimer, lastActivity = Date.now(), nextArrival = Date.now() + 1800;
  let actorSequence = 0, paradeSequence = 0, geometryFrame = 0;
  const paradeTimers = new Set();
  const particles = new Set();
  let geometryCache = null;
  let currentKind = 'ghost';
  let formBusy = false;
  let sessionGreeted = false;
  const actors = new Set();
  const listeners = [];
  const readinessCancels = new Set();
  const observedApis = new WeakSet();
  const hiddenLauncherApis = new WeakSet();
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const boolean = value => value !== false && value !== 'false' && value !== '0';
  const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

  function normalize(options) {
    const result = Object.assign({}, config);
    if (!options || typeof options !== 'object') return result;
    if (options.rating !== undefined) {
      const key = String(options.rating).toLowerCase().replace(/[^a-z0-9]/g, '');
      const rating = { g: 'g', pg: 'pg', pg13: 'pg-13', r: 'r', nc17: 'nc-17' }[key];
      if (!rating) throw new TypeError('Halloween rating must be G, PG, PG-13, R, or NC-17.');
      result.rating = rating;
    }
    for (const key of ['autoStart', 'controls', 'idleOnce', 'preview']) if (options[key] !== undefined) result[key] = boolean(options[key]);
    if (options.activity !== undefined) {
      if (!activities[options.activity]) throw new TypeError('Halloween activity must be calm, lively, or haunted.');
      result.activity = options.activity;
    }
    if (options.placement !== undefined) {
      if (!['auto', 'marked', 'edges'].includes(options.placement)) throw new TypeError('Halloween placement must be auto, marked, or edges.');
      result.placement = options.placement;
    }
    if (options.cast !== undefined) {
      const list = Array.isArray(options.cast) ? options.cast : String(options.cast).split(/[\s,]+/);
      result.cast = [...new Set(list.map(kind => String(kind).trim().toLowerCase()).filter(kind => kinds.includes(kind)))];
    }
    if (options.season !== undefined) {
      const season = String(options.season);
      if (season !== 'always' && !seasonParts(season)) throw new TypeError('Halloween season must be always or a valid MM-DD/MM-DD date range.');
      result.season = season;
    }
    for (const [key, min, max] of [['idleDelay', 2000, 3600000], ['arrivalInterval', 4000, 3600000], ['duration', 5000, 30000], ['maxItems', 1, 3], ['readyTimeout', 500, 30000], ['size', .75, 1.35]]) {
      if (options[key] !== undefined) {
        if (key === 'arrivalInterval' || key === 'maxItems') result['_' + key] = options[key] !== null;
        result[key] = clamp(options[key], min, max, defaults[key]);
      }
    }
    if (!result._arrivalInterval) result.arrivalInterval = activities[result.activity].interval;
    if (!result._maxItems) result.maxItems = activities[result.activity].max;
    result.maxItems = Math.floor(result.maxItems);
    for (const key of ['greeting', 'chatGreeting', 'storageKey']) if (options[key] !== undefined) result[key] = String(options[key] ?? '').slice(0, key === 'chatGreeting' ? 500 : 160);
    if (options.greeting !== undefined && options.chatGreeting === undefined) result.chatGreeting = result.greeting;
    if (options.assetBase !== undefined) {
      const url = new URL(String(options.assetBase).replace(/\/?$/, '/'), source);
      if (!['http:', 'https:', 'file:'].includes(url.protocol)) throw new TypeError('Halloween assetBase must be an HTTP(S) or relative URL.');
      result.assetBase = url.href;
    }
    return result;
  }
  function seasonParts(value) {
    const match = /^(\d{2})-(\d{2})\/(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const [fromMonth, fromDay, toMonth, toDay] = match.slice(1).map(Number);
    const valid = (month, day) => month >= 1 && month <= 12 && day >= 1 && day <= new Date(2000, month, 0).getDate();
    return valid(fromMonth, fromDay) && valid(toMonth, toDay) ? [fromMonth * 100 + fromDay, toMonth * 100 + toDay] : null;
  }
  function inSeason(date = new Date()) {
    if (config.preview || config.season === 'always') return true;
    const [from, to] = seasonParts(config.season);
    const today = (date.getMonth() + 1) * 100 + date.getDate();
    return from <= to ? today >= from && today <= to : today >= from || today <= to;
  }
  function greetingFor(kind, chat = false, rating = config.rating) {
    return (chat ? config.chatGreeting : config.greeting) || voices[rating][kind];
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent('stand-halloween:' + name, { detail: Object.assign({ rating: config.rating }, detail || {}) }));
  }
  function state() {
    return Object.freeze({ running: running && !destroyed, paused: !running && !destroyed && !stopped, stopped: stopped && !destroyed, destroyed,
      rating: config.rating, available, opening, reducedMotion: media.matches, seasonActive: inSeason(),
      cast: [...config.cast], activity: config.activity, placement: config.placement, size: config.size,
      arrivalInterval: config.arrivalInterval, maxItems: config.maxItems,
      activeItems: [...actors].filter(actor => actor.ready).length, pendingItems: [...actors].filter(actor => !actor.ready).length, greetingSuppressed: suppressed || (config.idleOnce && sessionGreeted) });
  }
  function changed() { emit('state', state()); }
  function listen(target, name, callback, options) {
    target.addEventListener(name, callback, options);
    listeners.push(() => target.removeEventListener(name, callback, options));
  }
  function storageRead() {
    try { sessionGreeted = sessionStorage.getItem(config.storageKey) === '1'; } catch (_) { sessionGreeted = false; }
  }
  function markGreeted() {
    sessionGreeted = true;
    try { sessionStorage.setItem(config.storageKey, '1'); } catch (_) { /* Private or blocked storage is optional. */ }
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function button(className, text) {
    const node = element('button', className, text);
    node.type = 'button';
    return node;
  }
  function mount() {
    if (host || destroyed || !document.body) return;
    host = element('div');
    host.setAttribute('data-stand-halloween', '');
    root = host.attachShadow({ mode: 'open' });
    const style = element('style');
    style.textContent = `
      :host{all:initial;position:fixed;inset:0;z-index:2147400000;pointer-events:none;contain:layout style;--accent:#ffbe78;color-scheme:dark}
      *,*:before,*:after{box-sizing:border-box}button{font:inherit}button:focus-visible{outline:3px solid var(--accent);outline-offset:5px}
      .layer{position:absolute;inset:0;overflow:hidden;pointer-events:none}
      .actor{position:absolute;pointer-events:none;will-change:transform,opacity}.art-window{position:absolute;inset:0;overflow:visible;pointer-events:none}.ground .art-window{overflow:hidden}.sprite{width:100%;pointer-events:none}
      .visitor{position:relative;display:block;width:100%;height:100%;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      .visitor:disabled{cursor:default;pointer-events:none}.visitor:focus-visible{border-radius:30px}
      .art{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 8px 18px #0003);animation:var(--float-animation,float) var(--float-speed,3.6s) ease-in-out infinite;pointer-events:none}
      .actor[data-kind="pumpkin"],.actor[data-kind="hand"],.actor[data-kind="spider"]{--float-animation:none}.actor[data-kind="bat"]{--float-animation:flutter;--float-speed:.34s}.actor[data-kind="pumpkin"] .art,.actor[data-kind="hand"] .art{object-position:center bottom}
      .fallback{display:block;font:74px/124px sans-serif}.fallback[hidden]{display:none}
      .bubble{position:absolute;left:calc(100% - 12px);bottom:60%;width:max-content;max-width:215px;padding:13px 17px;background:#fffaf1;color:#24211d;border:1px solid #24211d18;border-radius:18px 18px 18px 3px;box-shadow:0 5px 24px #0002;font:600 14px/1.4 system-ui,sans-serif;text-align:left;pointer-events:none}
      .actor.right .bubble{left:auto;right:calc(100% - 12px);border-radius:18px 18px 3px 18px}
      .preview .bubble{left:50%;right:auto;bottom:0;transform:translateX(-50%);padding:5px 8px;border-radius:20px;max-width:100%;white-space:nowrap;font-size:11px}
      .preview .art-window{bottom:30px}.silk{position:absolute;left:50%;bottom:calc(100% - 14px);width:1px;height:var(--silk-length,80px);background:linear-gradient(#7775,#666a);pointer-events:none}
      .flock{position:absolute;inset:0}.flock-bat{position:absolute;object-fit:contain;filter:drop-shadow(0 3px 6px #0002);animation:wingbeat .3s ease-in-out infinite alternate;pointer-events:none}.flock-bat:nth-child(2n){animation-delay:-.15s;animation-duration:.38s}.frozen .flock-bat{animation-play-state:paused}
      .ground:after{content:"";position:absolute;left:14%;right:14%;bottom:0;height:3px;border-radius:50%;background:#241e2155;box-shadow:0 2px 9px #241e2133;pointer-events:none}.preview.ground:after{bottom:30px}.preview.perched:after{content:"";position:absolute;left:5%;right:5%;bottom:30px;height:2px;background:#514a4140;pointer-events:none}
      @keyframes wingbeat{from{transform:scaleY(.7) rotate(-5deg)}to{transform:scaleY(1) rotate(4deg)}}
      .dismiss{position:absolute;top:-8px;right:-3px;width:28px;height:28px;border:1px solid #ffffff30;border-radius:50%;background:#24211de8;color:#fff;font:20px/1 system-ui,sans-serif;cursor:pointer;pointer-events:auto;opacity:.75}
      .dismiss:hover,.dismiss:focus-visible{opacity:1}.visitor:disabled~.dismiss{opacity:1}
      .control{position:absolute;bottom:max(12px,env(safe-area-inset-bottom));left:max(12px,env(safe-area-inset-left));pointer-events:auto;border:1px solid #ffffff30;border-radius:30px;padding:9px 13px;background:#211d2bef;color:#fff7e8;box-shadow:0 3px 15px #0002;font:500 11px/1.3 system-ui,sans-serif;cursor:pointer;touch-action:manipulation}
      .notice{position:absolute;left:16px;bottom:58px;width:min(330px,calc(100vw - 32px));padding:15px 42px 15px 17px;border:1px solid #ffffff30;border-radius:16px;background:#211d2bf5;color:#fff7e8;box-shadow:0 8px 32px #0003;font:14px/1.5 system-ui,sans-serif;pointer-events:auto}
      .notice[hidden],.control[hidden]{display:none}.notice .dismiss{right:7px;top:8px}.retry{display:block;margin-top:8px;border:0;padding:4px 0;background:transparent;color:var(--accent);font-weight:700;cursor:pointer}.retry[hidden]{display:none}
      .frozen .art{animation-play-state:paused}.particle{position:absolute;pointer-events:none;will-change:transform,opacity}.particle img{width:100%;height:100%;object-fit:contain}.hint{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%);white-space:nowrap;border-radius:20px;padding:6px 10px;background:#24211df0;color:#fffaf1;font:600 11px/1.3 system-ui,sans-serif;opacity:0;pointer-events:none}.visitor:hover .hint,.visitor:focus-visible .hint{opacity:1}.perched .art{animation:none}:host([data-editing]) .actor{visibility:hidden}
      @keyframes float{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(3deg)}}
      @keyframes flutter{0%,100%{transform:scaleY(.97) rotate(-3deg)}50%{transform:scaleY(1.03) rotate(3deg)}}
      @media(max-width:600px){.bubble{max-width:min(185px,calc(100vw - 118px));font-size:12px;padding:11px 13px}.dismiss{width:28px;height:28px;right:-3px;top:-10px}.fallback{font-size:58px}}

      @media print{:host{display:none}}
      @media(prefers-reduced-motion:reduce){.art,.flock-bat{animation:none}.actor{will-change:auto}}
    `;
    layer = element('div', 'layer');
    control = button('control', 'Pause Halloween');
    control.addEventListener('click', () => running ? pause() : start());
    notice = element('div', 'notice');
    notice.hidden = true;
    noticeText = element('span');
    noticeText.setAttribute('role', 'status');
    noticeText.setAttribute('aria-live', 'polite');
    retry = button('retry', 'Try chat again →');
    retry.addEventListener('click', () => openChat(currentKind));
    const close = button('dismiss', '×');
    close.setAttribute('aria-label', 'Dismiss chat notice');
    close.addEventListener('click', () => { notice.hidden = true; });
    notice.append(noticeText, retry, close);
    root.append(style, layer, control, notice);
    document.body.append(host);
    applyConfig();
  }
  function applyConfig() {
    if (!host) return;
    host.style.setProperty('--accent', accents[config.rating]);
    control.hidden = !config.controls || !inSeason();
    control.textContent = running ? 'Pause Halloween' : 'Resume Halloween';
    control.setAttribute('aria-pressed', String(running));
  }
  function showNotice(message, allowRetry) {
    mount();
    if (!notice) return;
    clearTimeout(noticeTimer);
    noticeText.textContent = message;
    retry.hidden = !allowRetry;
    notice.hidden = false;
    if (!allowRetry) noticeTimer = setTimeout(() => { if (notice) notice.hidden = true; }, 4500);
  }
  function removeActor(actor) {
    if (!actors.delete(actor)) return;
    actor.animations.forEach(animation => animation.cancel());
    actor.node.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    clearTimeout(actor.expiry); clearTimeout(actor.loadTimeout);
    actor.resolve(false);
    actor.node.remove();
    if (actor.ready) emit('departure', { kind: actor.kind, manual: actor.manual, anchor: actor.previewAnchor || null });
    changed();
  }
  function clearActors() { [...actors].forEach(removeActor); }
  function freezeActor(actor) {
    if (!actors.has(actor) || !actor.ready) return;
    const frozen = !running || document.hidden || formBusy || actor.hover || actor.focus;
    actor.node.classList.toggle('frozen', frozen);
    // A hover during an entrance must never freeze a half-visible chat target.
    if (frozen && !actor.settled) for (const animation of actor.intros) if (animation.playState !== 'finished') animation.finish();
    for (const animation of actor.animations) {
      if (animation === actor.entrance || animation.playState === 'finished') continue;
      frozen ? animation.pause() : animation.play();
    }
    if (frozen && actor.expiry) {
      clearTimeout(actor.expiry); actor.expiry = null;
      actor.remaining = Math.max(0, actor.remaining - (Date.now() - actor.started));
    } else if (!frozen && !actor.expiry) {
      actor.started = Date.now();
      actor.expiry = setTimeout(() => depart(actor), actor.remaining);
    }
  }
  function freezeAll() { actors.forEach(freezeActor); }
  function depart(actor) {
    if (!actors.has(actor)) return;
    if (media.matches || !running || typeof actor.button.animate !== 'function') return removeActor(actor);
    const target = actor.kind === 'hand' || actor.kind === 'spider' ? actor.sprite : actor.button;
    const exit = actor.kind === 'hand' ? { transform: 'translateY(100%)' } : actor.kind === 'spider' ? { transform: `translateY(${-actor.silkLength}px)`, opacity: 0 } : actor.kind === 'pumpkin' ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-12px)' };
    if (actor.bubble && ['hand', 'spider'].includes(actor.kind)) actor.bubble.style.opacity = '0';
    const motion = target.animate([{ opacity: 1, transform: 'none' }, exit], { duration: 360, easing: 'ease-in', fill: 'forwards' });
    actor.animations.push(motion);
    motion.finished.then(() => removeActor(actor)).catch(() => {});
  }
  function loadStand() {
    if (!standId || destroyed || window.StandChat) return;
    const installed = [...document.querySelectorAll('script[src]')].some(node => {
      if (node === script) return false;
      try {
        const url = new URL(node.src, document.baseURI);
        return url.pathname.endsWith('/stand.js') && (
          /(^|\.)stand\.chat$/.test(url.hostname) ||
          node.hasAttribute('data-stand-id') || node.hasAttribute('data-stand-site-id')
        );
      } catch (_) { return false; }
    });
    if (installed) return;
    const sdk = document.createElement('script');
    sdk.src = 'https://cdn.stand.chat/widget/stand.js';
    sdk.async = true;
    sdk.setAttribute('data-stand-id', standId);
    if (inSeason() && config.cast.length) sdk.setAttribute('data-stand-hide-button', 'true');
    sdk.addEventListener('error', () => {
      // Remove only our failed request so an explicit chat retry can load it again.
      sdk.remove();
      if (!destroyed) emit('error', { reason: 'sdk-load-failed' });
    }, { once: true });
    (document.head || document.documentElement).appendChild(sdk);
  }
  function checkStand() {
    if (destroyed) return false;
    const stand = window.StandChat;
    // Characters are the entry points. Hide once, then let an opened conversation
    // keep Stand's normal controls. Outside the season the usual launcher stays.
    if (stand && inSeason() && config.cast.length && !hiddenLauncherApis.has(stand) && typeof stand.initiallyHideChatButton === 'function') {
      stand.initiallyHideChatButton();
      hiddenLauncherApis.add(stand);
    }
    if (stand && typeof stand.whenAvailable === 'function' && !observedApis.has(stand)) {
      observedApis.add(stand);
      try { const unsubscribe = stand.whenAvailable(() => { if (!destroyed) { refreshAvailable(); schedule(); } }); if (typeof unsubscribe === 'function') listeners.push(unsubscribe); } catch (_) { /* Polling also checks availability. */ }
    }
    return refreshAvailable();
  }
  function refreshAvailable() {
    const stand = window.StandChat;
    let next = false;
    try { next = !!(stand && typeof stand.openChat === 'function' && typeof stand.isAvailable === 'function' && stand.isAvailable()); } catch (_) { /* Retry on the next check. */ }
    if (next !== available) {
      available = next;
      actors.forEach(actor => {
        actor.button.disabled = opening;
        if (actor.bubble && !actor.previewAnchor) actor.bubble.textContent = available ? actor.greeting : 'Chat is getting ready…';
      });
      changed();
    }
    return available;
  }
  function waitForStand() {
    return new Promise(resolve => {
      const deadline = Date.now() + config.readyTimeout;
      let pending;
      const finish = value => { clearTimeout(pending); readinessCancels.delete(cancel); resolve(value); };
      const cancel = () => finish(null);
      readinessCancels.add(cancel);
      const poll = () => {
        if (destroyed) return finish(null);
        if (checkStand()) return finish(window.StandChat);
        if (Date.now() >= deadline) return finish(null);
        pending = setTimeout(poll, 160);
      };
      poll();
    });
  }
  async function openChat(kind = 'ghost') {
    if (destroyed || opening) return false;
    loadStand();
    currentKind = kinds.includes(kind) ? kind : 'ghost';
    suppressed = true;
    opening = true;
    markGreeted();
    actors.forEach(actor => { actor.button.disabled = true; });
    changed();
    if (!checkStand()) showNotice('Getting the chat ready…', false);
    try {
      const stand = await waitForStand();
      if (destroyed) return false;
      if (!stand) throw new Error('unavailable');
      const tone = ['g', 'pg'].includes(config.rating) ? 'warm and playful' : 'atmospheric and dryly funny';
      await stand.openChat(greetingFor(currentKind, true), {
        prompt: `The visitor opened this chat by clicking a Halloween ${currentKind} on the website. A ${config.rating.toUpperCase()} visual theme is selected. Keep your first line ${tone}, then help normally. Be friendly; no threats or invented facts.`,
        analyticsId: `halloween-${config.rating}-${currentKind}`,
        interaction: 'click',
      });
      if (destroyed) return false;
      clearActors();
      pause();
      if (notice) notice.hidden = true;
      // Public StandChat.openChat() returns void. This event confirms the request, not delivery or a visible session.
      emit('chat', { kind: currentKind, status: 'requested' });
      return true;
    } catch (error) {
      if (destroyed) return false;
      showNotice("Chat isn't available right now. Please try again in a moment.", true);
      emit('error', { kind: currentKind, reason: error && error.message === 'unavailable' ? 'unavailable' : 'open-failed' });
      return false;
    } finally {
      opening = false;
      actors.forEach(actor => { actor.button.disabled = opening; });
      if (!destroyed) changed();
    }
  }
  // Surface discovery is bounded and cached. No page scanning happens in the animation loop.
  const protectedSelector = 'a[href],button,input,textarea,select,label,summary,iframe,video,form,dialog[open],[role="dialog"],[aria-modal="true"],[role="button"],[role="textbox"],[contenteditable]:not([contenteditable="false"]),stand-button,stand-card,stand-chatbox,[data-halloween~="none"]';
  const markerHas = (node, token) => (node.getAttribute('data-halloween') || '').split(/\s+/).includes(token);
  const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
  const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  function isRendered(node) {
    const closed = node.closest('details:not([open])');
    if (closed && !closed.querySelector(':scope > summary')?.contains(node)) return false;
    if (typeof node.checkVisibility === 'function' && !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    return getComputedStyle(node).visibility !== 'hidden';
  }
  function geometry() {
    if (geometryCache && Date.now() - geometryCache.time < 1600) return geometryCache;
    const width = document.documentElement.clientWidth || innerWidth, height = innerHeight;
    const blocked = [];
    for (const node of [...document.querySelectorAll(protectedSelector)].slice(0, 400)) {
      const box = node.getBoundingClientRect();
      if (box.width && box.height && box.bottom > 0 && box.top < height && isRendered(node)) blocked.push(Object.assign(rect(box.left - 5, box.top - 5, box.width + 10, box.height + 10), { node }));
    }
    // Reserve the usual launcher corner without reaching into Stand's private DOM.
    blocked.push(rect(width - 180, height - 172, 180, 172));
    if (config.controls) blocked.push(rect(0, height - 62, 165, 62));
    const surfaces = [];
    if (config.placement !== 'edges') {
      const marked = [...document.querySelectorAll('[data-halloween]')].slice(0, 80);
      const candidates = config.placement === 'auto' ? [...marked, ...[...document.querySelectorAll('main article,main section,main img,main figure,[class*="card"],h2,h3,header,nav')].slice(0, 100)] : marked;
      for (const node of new Set(candidates)) {
        if (node.closest('[data-halloween~="none"],a,button,form,dialog,[role="dialog"],[aria-modal="true"]')) continue;
        const box = node.getBoundingClientRect();
        if (box.width < 100 || box.height < 12 || box.bottom < 0 || box.top > height || box.width > width * .98 && box.height > height * .7) continue;
        const style = getComputedStyle(node);
        if (!isRendered(node) || Number(style.opacity) < .3) continue;
        const explicit = ['peek', 'perch', 'hang', 'ground'].some(token => markerHas(node, token));
        const painted = /^(IMG|FIGURE|HEADER|NAV|H2|H3)$/.test(node.tagName) || style.boxShadow !== 'none' || parseFloat(style.borderTopWidth) > 0 || style.backgroundImage !== 'none';
        if (explicit || config.placement === 'auto' && painted) surfaces.push({ node, box, explicit });
      }
    }
    surfaces.sort((a, b) => Number(b.explicit) - Number(a.explicit));
    return geometryCache = { time: Date.now(), width, height, blocked, surfaces };
  }
  function boxesAt(actor, x, y, right = actor.right) {
    const boxes = [rect(x - 3, y - 3, actor.width + 6, actor.height + 6)];
    if (actor.bubble && !actor.previewAnchor) boxes.push(rect(right ? x + 12 - actor.bubbleWidth : x + actor.width - 12,
      y + actor.height * .4 - actor.bubbleHeight, actor.bubbleWidth, actor.bubbleHeight));
    return boxes;
  }
  function blockedAt(actor, x, y, right, enforceBounds = true) {
    const g = geometry();
    const boxes = boxesAt(actor, x, y, right);
    const bottomMargin = actor.kind === 'hand' || actor.kind === 'pumpkin' ? -4 : 4;
    if (enforceBounds && boxes.some(box => box.left < 4 || box.right > g.width - 4 || box.top < 4 || box.bottom > g.height - bottomMargin)) return true;
    if (boxes.some(box => g.blocked.some(block => block.node !== actor.previewAnchor && intersects(box, block)))) return true;
    return [...actors].some(other => other !== actor && other.ready && boxes.some(box => boxesAt(other, other.left, other.top).some(otherBox => intersects(box, otherBox))));
  }
  function placeActor(actor) {
    const g = geometry();
    if (actor.previewAnchor) {
      if (!actor.previewAnchor.isConnected) return null;
      const box = actor.previewAnchor.getBoundingClientRect();
      const left = box.left + (box.width - actor.width) / 2;
      const top = ['pumpkin', 'hand'].includes(actor.kind) ? box.bottom - actor.height - 8 : box.top + (box.height - actor.height) / 2;
      actor.anchor = { node: actor.previewAnchor, preview: true };
      actor.silkLength = Math.max(12, top - box.top + 12);
      // Explicit preview slots may replace their own static art, but never cover a control.
      if (!blockedAt(actor, left, top, false)) return { left, top, right: false, placement: actor.kind === 'hand' ? 'ground' : actor.kind === 'pumpkin' ? 'perch' : actor.kind === 'spider' ? 'hang' : 'preview' };
      return null;
    }
    if (['pumpkin', 'spider', 'hand'].includes(actor.kind)) {
      for (const surface of g.surfaces) {
        const token = actor.kind === 'spider' ? 'hang' : actor.kind === 'hand' ? 'ground' : 'perch';
        if (surface.explicit && !markerHas(surface.node, token) && !(token === 'perch' && markerHas(surface.node, 'peek'))) continue;
        // Hands need a deliberate ground; automatic cards never become trapdoors.
        if (actor.kind === 'hand' && !markerHas(surface.node, 'ground')) continue;
        const silk = actor.kind === 'spider' ? 42 : 0;
        const y = actor.kind === 'spider' ? surface.box.bottom + silk : surface.box.top - actor.height;
        for (const fraction of [.76, .24, .5]) {
          const x = surface.box.left + surface.box.width * fraction - actor.width / 2;
          if (x < surface.box.left || x + actor.width > surface.box.right) continue;
          for (const right of [x > g.width * .55, x <= g.width * .55]) {
            if (blockedAt(actor, x, y, right)) continue;
            actor.anchor = { node: surface.node, fraction, side: actor.kind === 'spider' ? 'bottom' : 'top', silk };
            actor.silkLength = silk + 14;
            return { left: x, top: y, right, placement: token };
          }
        }
      }
    }
    if (actor.origin && ['ghost', 'bat'].includes(actor.kind)) {
      const origin = actor.origin.getBoundingClientRect();
      for (const x of [origin.right + 20, origin.left - actor.width - 20, origin.left + (origin.width - actor.width) / 2]) for (const y of [origin.top - actor.height - 20, origin.bottom + 20, origin.top]) for (const right of [false, true]) {
        if (!blockedAt(actor, x, y, right)) return { left: x, top: y, right, placement: 'nearby' };
      }
    }
    const xs = [24, g.width - actor.width - 24, g.width * .5 - actor.width / 2];
    if (actorSequence % 2) xs.reverse();
    const ys = ['hand', 'pumpkin'].includes(actor.kind) ? [g.height - actor.height] : actor.kind === 'spider' ? [54, 100, 150] : [g.height * .24, g.height * .5, g.height - actor.height - 92, 38];
    for (const x of xs) for (const y of ys) for (const right of [x > g.width * .5, x <= g.width * .5]) {
      if (!blockedAt(actor, x, y, right)) {
        actor.silkLength = y + 14;
        return { left: x, top: y, right, placement: actor.kind === 'hand' ? 'ground' : actor.kind === 'pumpkin' ? 'perch' : actor.kind === 'spider' ? 'hang' : 'edge' };
      }
    }
    // On narrow screens a friendly hover label can replace a full speech bubble.
    if (actor.bubble) {
      actor.bubble.remove(); actor.bubble = null;
      return placeActor(actor);
    }
    return null;
  }
  function updateGeometry() {
    geometryCache = null;
    if (geometryFrame || !actors.size) return;
    geometryFrame = requestAnimationFrame(() => {
      geometryFrame = 0;
      for (const actor of [...actors]) {
        if (!actor.ready) continue;
        let x = actor.left, y = actor.top;
        if (actor.anchor) {
          if (!actor.anchor.node.isConnected) { removeActor(actor); continue; }
          const box = actor.anchor.node.getBoundingClientRect();
          x = actor.anchor.preview ? box.left + (box.width - actor.width) / 2 : box.left + box.width * actor.anchor.fraction - actor.width / 2;
          y = actor.anchor.preview ? (['pumpkin', 'hand'].includes(actor.kind) ? box.bottom - actor.height - 8 : box.top + (box.height - actor.height) / 2) : actor.anchor.side === 'bottom' ? box.bottom + actor.anchor.silk : box.top - actor.height;
        }
        if (blockedAt(actor, x, y, actor.right)) { removeActor(actor); continue; }
        actor.left = x; actor.top = y;
        actor.node.style.left = x + 'px'; actor.node.style.top = y + 'px';
      }
    });
  }
  function clearEffects() {
    for (const particle of particles) { particle.getAnimations().forEach(animation => animation.cancel()); particle.remove(); }
    particles.clear();
  }
  function celebrate(actor) {
    if (media.matches || !running || document.hidden || typeof actor.node.animate !== 'function') return;
    const box = actor.node.getBoundingClientRect();
    const mature = ['r', 'nc-17'].includes(actor.rating);
    for (let i = 0; i < 9; i++) {
      const particle = element('span', 'particle');
      particle.setAttribute('aria-hidden', 'true');
      const size = mature ? 16 + i % 3 * 5 : 4 + i % 4;
      Object.assign(particle.style, { left: box.left + box.width / 2 + 'px', top: box.top + box.height * .45 + 'px', width: size + 'px', height: size + 'px', background: mature ? 'none' : ['#f6bd58', '#dda8fa', '#e27d45'][i % 3], borderRadius: actor.rating === 'g' ? '2px' : '50%' });
      if (mature) { const img = element('img'); img.alt = ''; img.src = new URL(actor.rating + '/bat.webp', config.assetBase).href; particle.append(img); }
      layer.append(particle); particles.add(particle);
      const angle = i / 9 * Math.PI * 2, distance = mature ? 65 : 45;
      const animation = particle.animate([
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: .85 },
        { transform: `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance - 25}px) scale(${mature ? .7 : 1}) rotate(${i * 36}deg)`, opacity: 0 },
      ], { duration: 650 + i * 30, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
      animation.finished.catch(() => {}).finally(() => { particle.remove(); particles.delete(particle); });
    }
  }
  function addMotion(actor, target, frames, options) {
    const animation = target.animate(frames, options);
    actor.animations.push(animation);
    return animation;
  }
  function animateActor(actor) {
    if (media.matches || typeof actor.node.animate !== 'function') { actor.resolve(true); return; }
    const entranceDuration = actor.kind === 'hand' ? 420 : 320;
    const from = actor.kind === 'spider' ? 'none' : actor.kind === 'pumpkin' ? 'translateY(-12px) scale(.94)' : 'translateY(8px) scale(.96)';
    // Speech and artwork enter together. Entrance speed never depends on visit duration.
    if (running) {
      actor.entrance = addMotion(actor, actor.button, [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: entranceDuration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      actor.intros.push(actor.entrance);
      actor.entrance.finished.then(() => { actor.settled = true; if (actors.has(actor)) actor.resolve(true); }).catch(() => {});
    } else { actor.settled = true; actor.resolve(true); }
    if (actor.kind === 'hand') {
      if (running) actor.intros.push(addMotion(actor, actor.sprite, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }));
      return;
    }
    if (actor.kind === 'pumpkin') return; // Its base stays seated after the short landing.
    if (actor.kind === 'spider') {
      if (running) {
        const drop = Math.min(24, actor.silkLength - 8);
        actor.intros.push(addMotion(actor, actor.sprite, [{ transform: `translateY(${-drop}px)` }, { transform: 'translateY(0)' }], { duration: 320, easing: 'ease-out', fill: 'both' }));
        actor.intros.push(addMotion(actor, actor.silk, [{ height: actor.silkLength - drop + 'px', bottom: `calc(100% - ${14 - drop}px)` }, { height: actor.silkLength + 'px', bottom: 'calc(100% - 14px)' }], { duration: 320, easing: 'ease-out', fill: 'both' }));
      }
      actor.node.style.transformOrigin = `50% ${-actor.silkLength + 14}px`;
      addMotion(actor, actor.node, [{ transform: 'rotate(-2deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(-2deg)' }], { duration: 5800, iterations: Infinity, easing: 'ease-in-out' });
      return;
    }
    const preview = actor.previewAnchor?.getBoundingClientRect();
    let horizontal = preview ? Math.max(0, (preview.width - actor.width) / 2 - 7) : actor.kind === 'bat' ? 240 : 64;
    let vertical = preview ? (actor.kind === 'bat' ? Math.min(32, (preview.height - actor.height) / 2 - 8) : 10) : actor.kind === 'bat' ? 38 : 22;
    if (!preview && actor.left > geometry().width / 2) horizontal *= -1;
    const points = actor.kind === 'bat' ? (preview ? [[0, 0], [1, -.7], [.6, -1], [-.8, -.5], [-1, .6], [0, 1], [1, .4], [0, 0]] : [[0, 0], [.42, -1], [1, .3], [.54, 1], [0, 0]]) : [[0, 0], [1, -1], [.36, .3], [0, 0]];
    // Test the complete swept route, including the return leg and its speech bubble.
    for (let scale = 1; scale >= 0; scale -= .125) {
      let safe = true;
      for (let i = 1; i < points.length && safe; i++) for (let t = 0; t <= 1; t += .25) {
        const x = actor.left + (points[i - 1][0] * (1 - t) + points[i][0] * t) * horizontal * scale;
        const y = actor.top + (points[i - 1][1] * (1 - t) + points[i][1] * t) * vertical * scale;
        if (blockedAt(actor, x, y, actor.right) || preview && (x < preview.left + 3 || x + actor.width > preview.right - 3 || y < preview.top + 3 || y + actor.height > preview.bottom - 3)) { safe = false; break; }
      }
      if (safe || scale === 0) { horizontal *= scale; vertical *= scale; break; }
    }
    const frames = points.map(([x, y], index) => ({ transform: `translate(${x * horizontal}px,${y * vertical}px)${actor.kind === 'bat' ? ` rotate(${[-3, 5, -4, -6, -3, 4, 3, -3][index]}deg)` : ''}` }));
    addMotion(actor, actor.node, frames, { duration: actor.kind === 'bat' ? 6400 : 14000, iterations: Infinity, easing: 'ease-in-out' });
  }
  function arrive(kind, greeting, manual, options = {}) {
    mount();
    if (!layer || destroyed || (!running && !manual) || !inSeason() || opening || formBusy || document.hidden || !config.cast.includes(kind)) return null;
    if (manual && !options.parade) for (const previous of [...actors]) if (previous.manual && !previous.focus) removeActor(previous);
    const mobile = innerWidth <= 600;
    const limit = mobile ? 1 : config.maxItems;
    if (actors.size >= limit) {
      if (!manual) return null;
      const removable = [...actors].find(actor => !actor.focus && !actor.hover);
      if (!removable) return null;
      removeActor(removable);
    }
    const origin = options.anchor && typeof options.anchor.getBoundingClientRect === 'function' ? options.anchor : null;
    const previewAnchor = origin?.hasAttribute('data-halloween-preview') ? origin : null;
    const previewBox = previewAnchor?.getBoundingClientRect();
    let factor = config.size * (mobile ? .78 : 1);
    const [baseWidth, baseHeight] = { ghost: [118, 150], pumpkin: [124, 124], bat: [184, 112], spider: [114, 114], hand: [112, 144] }[kind];
    if (previewBox) factor = Math.min(factor, (kind === 'bat' ? previewBox.width * .66 : previewBox.width - 18) / baseWidth, (previewBox.height - 42) / baseHeight);
    if (!(factor > .2)) return null;
    const node = element('div', 'actor');
    node.dataset.kind = kind; node.dataset.rating = config.rating;
    node.classList.toggle('preview', !!previewAnchor);
    const target = button('visitor');
    target.setAttribute('aria-label', `Halloween ${kind === 'bat' ? 'bat flock' : kind === 'hand' ? 'skeleton hand' : kind}. Open chat`);
    const artWindow = element('span', 'art-window');
    const sprite = element('span', 'sprite');
    sprite.style.display = 'block'; sprite.style.height = baseHeight * factor + 'px';
    const art = element('img', 'art');
    art.alt = ''; art.draggable = false; art.decoding = 'async';
    art.src = new URL(config.rating + '/' + kind + '.webp', config.assetBase).href;
    sprite.append(art); artWindow.append(sprite); target.append(artWindow);
    if (kind === 'bat') {
      art.style.visibility = 'hidden';
      const flock = element('span', 'flock');
      for (const [index, [x, y, size]] of [[38, 32, 46], [5, 12, 31], [67, 2, 29], [1, 64, 26], [73, 66, 25]].entries()) {
        const bat = element('img', 'flock-bat'); bat.alt = ''; bat.draggable = false; bat.src = art.src;
        Object.assign(bat.style, { left: x + '%', top: y * .65 + '%', width: size + '%', height: size * 1.35 + '%', animationDelay: `${index * -.07}s` });
        flock.append(bat);
      }
      sprite.append(flock);
    }
    const actorGreeting = greetingFor(kind);
    let bubble;
    if (greeting) {
      bubble = element('span', 'bubble', previewAnchor ? 'Tap to chat ↗' : available ? actorGreeting : 'Chat is getting ready…');
      target.append(bubble);
    } else {
      const hint = element('span', 'hint', 'Say hello ↗'); hint.setAttribute('aria-hidden', 'true'); target.append(hint);
    }
    node.append(target);
    let resolveVisit;
    const promise = new Promise(resolve => { resolveVisit = resolve; });
    const actor = { kind, rating: config.rating, greeting: actorGreeting, node, button: target, bubble, sprite, art, previewAnchor, origin, manual: !!manual,
      width: baseWidth * factor, height: baseHeight * factor + (previewAnchor ? 30 : 0), fullHeight: baseHeight * factor,
      animations: [], intros: [], settled: false, expiry: null, remaining: greeting ? 22000 : config.duration, started: 0, hover: false, focus: false, right: false, ready: false,
      promise, resolve(value) { resolveVisit(value); } };
    Object.assign(node.style, { width: actor.width + 'px', height: actor.height + 'px', visibility: 'hidden' });
    layer.append(node); actors.add(actor); changed();
    target.addEventListener('click', () => { celebrate(actor); openChat(kind); });
    node.addEventListener('pointerenter', () => { actor.hover = true; freezeActor(actor); });
    node.addEventListener('pointerleave', () => { actor.hover = false; freezeActor(actor); });
    node.addEventListener('focusin', () => { actor.focus = true; freezeActor(actor); });
    node.addEventListener('focusout', () => { queueMicrotask(() => { actor.focus = node.contains(root?.activeElement); freezeActor(actor); }); });
    const fail = reason => {
      if (!actors.has(actor)) return;
      removeActor(actor);
      emit('arrival-error', { kind, manual: !!manual, anchor: previewAnchor, reason });
    };
    const reveal = () => {
      if (!actors.has(actor) || destroyed || !inSeason()) return;
      if (document.hidden || formBusy) return fail('interrupted');
      clearTimeout(actor.loadTimeout);
      geometryCache = null; // Decode or scrolling may have changed layout since the invite.
      actor.bubbleWidth = bubble?.getBoundingClientRect().width || 0;
      actor.bubbleHeight = bubble?.getBoundingClientRect().height || 0;
      const position = placeActor(actor);
      if (!position) return fail('no-space');
      Object.assign(actor, position); actorSequence++;
      node.classList.toggle('right', position.right);
      node.classList.toggle('perched', kind === 'pumpkin');
      node.classList.toggle('ground', kind === 'hand');
      if (kind === 'spider') {
        const silk = element('span', 'silk'); silk.setAttribute('aria-hidden', 'true');
        node.style.setProperty('--silk-length', actor.silkLength + 'px');
        target.append(silk); actor.silk = silk;
      }
      if (kind === 'pumpkin' || kind === 'hand') {
        const padding = (kind === 'pumpkin' ? { g: .08073, pg: .04167, 'pg-13': .046875, r: .03646, 'nc-17': .02604 } : { g: .026042, pg: .010417, 'pg-13': .010417, r: .018229, 'nc-17': .007813 })[actor.rating];
        // Align painted pixels, accounting for transparent padding in the original square assets.
        art.style.transform = `translateY(${Math.min(actor.width, actor.fullHeight) * padding}px)`;
      }
      Object.assign(node.style, { left: position.left + 'px', top: position.top + 'px', visibility: '' });
      actor.ready = true;
      animateActor(actor); freezeActor(actor);
      emit('arrival', { kind, greeting: !!greeting, manual: !!manual, anchor: previewAnchor, placement: position.placement });
      changed();
    };
    actor.loadTimeout = setTimeout(() => fail('asset-timeout'), 12000);
    // decode() waits for actual pixels, including a cached image. A canceled visit can never reappear.
    if (typeof art.decode === 'function') art.decode().then(reveal, () => fail('asset-unavailable'));
    else if (art.complete && art.naturalWidth) reveal();
    else { art.addEventListener('load', reveal, { once: true }); art.addEventListener('error', () => fail('asset-unavailable'), { once: true }); }
    return actor;
  }

  function tick() {
    timer = null;
    if (!running || destroyed || document.hidden) return;
    if (!inSeason()) { stop(); return; }
    checkStand();
    const now = Date.now();
    if (!formBusy && !opening && available) {
      if (config.cast.includes('ghost') && !suppressed && !(config.idleOnce && sessionGreeted) && now - lastActivity >= config.idleDelay && ![...actors].some(actor => actor.kind === 'ghost' && actor.bubble)) {
        const ghost = arrive('ghost', true, false);
        if (ghost) { ghost.promise.then(shown => { if (shown) markGreeted(); }); lastActivity = now; nextArrival = now + Math.max(25000, config.arrivalInterval); }
      } else if (now >= nextArrival) {
        const present = new Set([...actors].map(actor => actor.kind));
        const options = config.cast.filter(kind => !present.has(kind));
        if (options.length) arrive(options[actorSequence % options.length], false, false);
        nextArrival = now + config.arrivalInterval * (.85 + Math.random() * .3);
      }
    }
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    if (running && !destroyed && !document.hidden) timer = setTimeout(tick, 500);
  }
  function cancelParade() {
    paradeSequence++;
    paradeTimers.forEach(clearTimeout);
    paradeTimers.clear();
  }
  function start() {
    if (destroyed) return state();
    mount();
    if (!inSeason()) { running = false; stopped = true; clearActors(); applyConfig(); changed(); return state(); }
    stopped = false;
    if (!running) { running = true; lastActivity = Date.now(); nextArrival = Date.now() + 1800; }
    applyConfig(); freezeAll(); checkStand(); schedule(); changed();
    return state();
  }
  function pause() {
    if (destroyed) return state();
    running = false; stopped = false; clearTimeout(timer); cancelParade();
    applyConfig(); freezeAll(); changed();
    return state();
  }
  function stop() {
    if (destroyed) return state();
    running = false; stopped = true; clearTimeout(timer); cancelParade();
    clearActors(); clearEffects();
    if (notice) notice.hidden = true;
    applyConfig(); changed();
    return state();
  }
  function summon(kind = 'ghost', options = {}) {
    if (destroyed || !inSeason() || !config.cast.includes(kind)) return Promise.resolve(false);
    // An explicit summon while paused is visible and still, never frozen at an invisible first frame.
    if (stopped) stopped = false;
    checkStand();
    const actor = arrive(kind, true, true, options);
    if (actor) { actor.promise.then(shown => { if (shown) markGreeted(); }); nextArrival = Date.now() + Math.max(25000, config.arrivalInterval); }
    changed();
    return actor ? actor.promise : Promise.resolve(false);
  }
  function parade() {
    if (destroyed || !inSeason()) return state();
    cancelParade();
    if (!running) start();
    const sequence = paradeSequence;
    const cast = [...config.cast];
    cast.forEach((kind, index) => {
      const handle = setTimeout(() => {
        paradeTimers.delete(handle);
        if (!destroyed && running && sequence === paradeSequence) arrive(kind, kind === 'ghost', true, { parade: true });
      }, index * (innerWidth <= 600 || config.maxItems === 1 ? 4200 : 2300));
      paradeTimers.add(handle);
    });
    nextArrival = Date.now() + Math.max(25000, config.arrivalInterval);
    emit('parade', { cast: [...cast] });
    return state();
  }
  function configure(options) {
    if (destroyed) return state();
    const next = normalize(options);
    const actorsChanged = ['rating', 'assetBase', 'size', 'placement', 'greeting', 'chatGreeting'].some(key => next[key] !== config[key]);
    const storageChanged = next.storageKey !== config.storageKey;
    const timingChanged = next.arrivalInterval !== config.arrivalInterval;
    config = next;
    geometryCache = null;
    cancelParade();
    if (storageChanged) storageRead();
    if (actorsChanged) clearActors();
    for (const actor of [...actors]) if (!config.cast.includes(actor.kind)) removeActor(actor);
    const limit = innerWidth <= 600 ? 1 : config.maxItems;
    for (const actor of [...actors].slice(limit)) if (!actor.focus && !actor.hover) removeActor(actor);
    if (timingChanged) nextArrival = Date.now() + config.arrivalInterval;
    if (!inSeason()) return stop();
    applyConfig(); schedule(); changed();
    return state();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true; running = false;
    clearTimeout(timer); clearTimeout(noticeTimer); cancelParade();
    cancelAnimationFrame(geometryFrame); clearEffects();
    readinessCancels.forEach(cancel => cancel());
    listeners.splice(0).forEach(remove => remove());
    clearActors();
    if (host) host.remove();
    host = root = layer = control = notice = noticeText = retry = null;
    changed();
    if (window.StandHalloween === api) delete window.StandHalloween;
  }
  const api = Object.freeze({ version: '2.2.0', configure, start, pause, stop, summon, parade, openChat, destroy, get state() { return state(); } });
  config = normalize(initial);
  storageRead();
  window.StandHalloween = api;
  const activity = event => { lastActivity = Date.now(); if (event?.type === 'scroll') updateGeometry(); };
  for (const name of ['pointerdown', 'keydown', 'scroll']) listen(document, name, activity, { passive: true, capture: true });
  listen(document, 'pointermove', activity, { passive: true });
  listen(document, 'keydown', event => {
    if (event.key === 'Escape' && (actors.size || (notice && !notice.hidden))) {
      suppressed = true; markGreeted(); clearActors();
      if (notice) notice.hidden = true;
      emit('dismiss', { kind: 'all' }); changed();
    }
  });
  const editing = event => {
    let focused = event && event.composedPath ? event.composedPath()[0] : document.activeElement;
    while (focused && focused.shadowRoot && focused.shadowRoot.activeElement) focused = focused.shadowRoot.activeElement;
    const typingSelector = 'textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],input:not([type]),input[type="text"],input[type="email"],input[type="password"],input[type="search"],input[type="tel"],input[type="url"],input[type="number"],input[type="date"],input[type="time"],input[type="datetime-local"]';
    formBusy = !!(focused && focused.matches && (focused.matches(typingSelector) || focused.closest('[contenteditable]:not([contenteditable="false"])')));
    if (host) host.toggleAttribute('data-editing', formBusy);
    freezeAll();
  };
  listen(document, 'focusin', editing);
  listen(document, 'focusout', () => queueMicrotask(editing));
  listen(document, 'visibilitychange', () => { lastActivity = Date.now(); if (document.hidden) { cancelParade(); clearEffects(); } freezeAll(); schedule(); });
  listen(window, 'resize', () => { geometryCache = null; clearActors(); cancelParade(); lastActivity = Date.now(); nextArrival = Date.now() + 2500; });
  listen(media, 'change', () => { clearActors(); clearEffects(); cancelParade(); changed(); });
  listen(window, 'pagehide', event => { if (!event.persisted) destroy(); });
  const boot = () => { loadStand(); mount(); editing(); if (config.autoStart) start(); else { checkStand(); changed(); } };
  if (document.readyState === 'loading') listen(document, 'DOMContentLoaded', boot, { once: true }); else boot();
}());
