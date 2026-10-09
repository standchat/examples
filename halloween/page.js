(() => {
  'use strict';
  const modes = [
    { rating: 'g', label: 'G', name: 'Little boos', hello: 'Boo. Hello, you.', description: 'Soft felt, plush little wings, and pumpkin smiles. A preschool kind of Halloween.' },
    { rating: 'pg', label: 'PG', name: 'A little mischief', hello: 'Just floating by.', description: 'A handmade film set: a muslin ghost, candlelit pumpkin, and one mischievous little bat.' },
    { rating: 'pg-13', label: 'PG-13', name: 'After dark', hello: 'A little lost?', description: 'Uncanny apparitions, weathered gourds, and real leathery wings. The lights are getting lower.' },
    { rating: 'r', label: 'R', name: 'Gothic hours', hello: 'Don’t be a stranger.', description: 'Skeletal faces, distressed gauze, and deep-set fangs. Straight from a horror-film prop room.' },
    { rating: 'nc-17', label: 'NC-17', name: 'Full haunt', hello: 'Come closer.', description: 'A towering wraith, splinter-toothed pumpkin, and snarling winged creature. The full haunted house.' }
  ];
  const byId = id => document.getElementById(id);
  const form = byId('mode-settings');
  const slider = byId('rating');
  const status = byId('mode-status');
  const pause = byId('pause-mode');
  const stop = byId('stop-mode');
  const snippet = byId('install-snippet');
  const kinds = ['ghost', 'pumpkin', 'bat'];
  const activityNotes = {
    calm: 'An unhurried hello. One visitor at a time, with plenty of breathing room.',
    lively: 'An occasional visitor. A little company for your page.',
    haunted: 'A busier house, with a few more entrances. Still room to read and explore.'
  };
  const placementNotes = {
    auto: 'They find a quiet edge of a card or heading, then make it their own.',
    marked: 'Only surfaces marked with data-halloween. This page has a few ready for them.',
    edges: 'A little company at the window edges. No exploring your cards.'
  };
  let selected = 1;
  let off = false;
  let lastState = {};
  let copyTimer;
  const api = () => window.StandHalloween;
  const chosen = name => form.querySelector(`input[name="${name}"]:checked`)?.value;
  const readSettings = () => ({
    rating: modes[selected].rating,
    cast: [...form.querySelectorAll('input[name="cast"]:checked')].map(input => input.value),
    activity: chosen('activity'),
    placement: chosen('placement'),
    size: Number(chosen('size')),
    idleDelay: Number(byId('idle-delay').value) * 1000,
    greeting: byId('ghost-greeting').value.trim(),
    season: byId('season').value
  });
  const attribute = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

  function settingsURL(settings) {
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set('rating', settings.rating);
    for (const [key, value, defaultValue] of [
      ['activity', settings.activity, 'lively'], ['placement', settings.placement, 'auto'],
      ['cast', settings.cast.join(',') || 'none', kinds.join(',')], ['size', String(settings.size), '1'],
      ['idle', String(settings.idleDelay / 1000), '12'], ['season', settings.season, '10-01/11-01']
    ]) if (value !== defaultValue) url.searchParams.set(key, value);
    return url;
  }

  function renderSnippet(settings) {
    const selfHosted = document.querySelector('input[name="source"]:checked').value === 'self';
    const attributes = [
      ['src', selfHosted ? './halloween.js' : 'https://examples.stand.chat/halloween/halloween.js'],
      ['data-rating', settings.rating], ['data-cast', settings.cast.join(',') || 'none'],
      ['data-activity', settings.activity], ['data-placement', settings.placement],
      ['data-size', settings.size], ['data-idle-delay', settings.idleDelay],
      ['data-greeting', settings.greeting], ['data-season', settings.season]
    ];
    snippet.textContent = `<script defer\n${attributes.map(([key, value]) => `  ${key}="${attribute(value)}"`).join('\n')}>\n<\/script>`;
    byId('copy-status').textContent = selfHosted
      ? 'Unzip the download next to this page. Keep halloween.js and assets/ together; adjust the script path if needed.'
      : 'All your workshop settings, ready to paste after Stand’s installation. Your site follows the selected season.';
    byId('copy-code').textContent = 'Copy code';
  }

  function applySettings(updateURL = true) {
    const settings = readSettings();
    api()?.configure({ ...settings, preview: true, controls: false });
    byId('idle-value').textContent = `${settings.idleDelay / 1000} seconds`;
    byId('activity-note').textContent = activityNotes[settings.activity];
    byId('placement-note').textContent = placementNotes[settings.placement];
    byId('cast-note').textContent = settings.cast.length
      ? settings.cast.includes('ghost') ? `${settings.cast.length === 1 ? 'One guest' : `${settings.cast.length} guests`}. The ghost handles the quiet-moment hello.` : 'The ghost is off the guest list, so there will be no idle invitation.'
      : 'A quiet page. Choose a guest or invite one from the cards.';
    byId('replay-mode').disabled = settings.cast.length === 0;
    document.querySelectorAll('[data-guest]').forEach(card => {
      const included = settings.cast.includes(card.dataset.guest);
      card.classList.toggle('guest-away', !included);
      const button = card.querySelector('[data-summon]');
      button.firstChild.textContent = `${included ? 'Invite' : 'Add & invite'} the ${card.dataset.guest} `;
    });
    byId('ghost-greeting').placeholder = `${modes[selected].hello} Need a hand?`;
    byId('stage-greeting').textContent = byId('ghost-greeting').value.trim() || modes[selected].hello;
    byId('stage-chat').classList.toggle('custom-greeting', Boolean(byId('ghost-greeting').value.trim()));
    renderSnippet(settings);
    if (updateURL) window.history.replaceState(null, '', settingsURL(settings));
    return settings;
  }

  function renderMode(index, preview = true) {
    selected = Math.max(0, Math.min(4, Number(index) || 0));
    const mode = modes[selected];
    slider.value = String(selected);
    slider.setAttribute('aria-valuetext', `${mode.label}: ${mode.name}`);
    byId('rating-name').textContent = `${mode.label} · ${mode.name}`;
    byId('guest-rating').textContent = `${mode.label} · ${mode.name}`;
    byId('rating-description').textContent = mode.description;
    document.querySelector('.theatre').dataset.rating = mode.rating;
    document.querySelector('.guest-preview').dataset.rating = mode.rating;
    document.querySelectorAll('[data-rating-index]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.ratingIndex) === selected)));
    document.querySelectorAll('[data-character] img').forEach(img => { img.src = `./assets/${mode.rating}/${img.parentElement.dataset.character}.webp`; });
    document.querySelectorAll('[data-guest] img').forEach(img => { img.src = `./assets/${mode.rating}/${img.closest('[data-guest]').dataset.guest}.webp`; });
    document.querySelector('.theatre-note').innerHTML = selected < 2 ? '<span aria-hidden="true">↖</span> They’re friendly. Give one a tap.' : '<span aria-hidden="true">↖</span> Looks scary. Still here to help.';
    applySettings(preview);
    if (preview) {
      status.textContent = `${mode.label} · ${mode.name}. Your cast and installation code have changed.`;
      if (!off && !lastState.paused) api()?.parade();
    }
  }

  function syncState(state = {}) {
    lastState = state;
    if (typeof state.stopped === 'boolean') off = state.stopped;
    else if (state.running) off = false;
    const paused = Boolean(state.paused) && !off;
    document.body.classList.toggle('is-paused', paused || off);
    document.body.classList.toggle('mode-off', off);
    document.querySelectorAll('[data-character], #stage-chat').forEach(button => { button.disabled = off; });
    pause.disabled = off;
    pause.setAttribute('aria-pressed', String(paused));
    pause.innerHTML = paused ? '<span aria-hidden="true">▷</span> Resume motion' : '<span aria-hidden="true">Ⅱ</span> Pause motion';
    stop.setAttribute('aria-pressed', String(off));
    stop.textContent = off ? 'Turn mode on' : 'Turn mode off';
  }

  function begin() {
    off = false;
    api()?.start();
    syncState(api()?.state);
  }

  function invite(kind) {
    const checkbox = form.querySelector(`input[name="cast"][value="${kind}"]`);
    if (!checkbox.checked) { checkbox.checked = true; applySettings(); }
    if (off) begin();
    api()?.summon(kind);
    status.textContent = `The ${kind} is visiting. Tap it to open Stand Chat.`;
  }

  slider.addEventListener('input', () => renderMode(slider.value));
  document.querySelectorAll('[data-rating-index]').forEach(button => button.addEventListener('click', () => renderMode(button.dataset.ratingIndex)));
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', () => applySettings());
  byId('summon').addEventListener('click', () => invite('ghost'));
  document.querySelectorAll('[data-summon]').forEach(button => button.addEventListener('click', () => invite(button.dataset.summon)));
  byId('replay-mode').addEventListener('click', () => {
    begin();
    api()?.parade();
    status.textContent = 'A visit is on its way. Watch the page edges and the cards around you.';
  });
  pause.addEventListener('click', () => {
    const willPause = !lastState.paused;
    api()?.[willPause ? 'pause' : 'start']();
    syncState(api()?.state);
    status.textContent = willPause ? 'Motion paused. Turn the mode off to clear the visitors.' : 'The spirits are moving again. Tap one to open chat.';
  });
  stop.addEventListener('click', () => {
    off = !off;
    api()?.[off ? 'stop' : 'start']();
    syncState(api()?.state);
    status.textContent = off ? 'Mode off. The visitors have gone home.' : 'Halloween mode is on. The next visitor will be along shortly.';
  });
  document.querySelectorAll('[data-character]').forEach(button => button.addEventListener('click', () => api()?.openChat(button.dataset.character)));
  byId('stage-chat').addEventListener('click', () => api()?.openChat('ghost'));
  document.querySelectorAll('input[name="source"]').forEach(input => input.addEventListener('change', () => renderSnippet(readSettings())));
  window.addEventListener('stand-halloween:error', () => { status.textContent = 'Chat is unavailable right now. Try a character again in a moment.'; });
  window.addEventListener('stand-halloween:chat', () => { status.textContent = 'Chat requested. The spirits step aside for your conversation.'; });
  window.addEventListener('stand-halloween:state', event => syncState(event.detail));

  byId('copy-code').addEventListener('click', async () => {
    clearTimeout(copyTimer);
    try {
      await navigator.clipboard.writeText(snippet.textContent);
      byId('copy-status').textContent = `Copied your ${modes[selected].label} setup. Paste it after your existing Stand Chat installation.`;
      byId('copy-code').textContent = 'Copied ✓';
      copyTimer = setTimeout(() => { byId('copy-code').textContent = 'Copy code'; }, 2000);
    } catch {
      const range = document.createRange(); range.selectNodeContents(snippet);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      byId('copy-status').textContent = 'Code selected. Press Ctrl+C or ⌘C to copy.';
    }
  });
  byId('share-settings').addEventListener('click', async () => {
    const url = settingsURL(readSettings()).href;
    try {
      await navigator.clipboard.writeText(url);
      byId('share-status').textContent = 'Link copied. It includes the look and settings, without your custom greeting.';
    } catch {
      const link = document.createElement('a'); link.href = url; link.textContent = url;
      byId('share-status').replaceChildren('Copy this link: ', link);
    }
  });
  byId('reset-settings').addEventListener('click', () => {
    form.reset();
    renderMode(1, false);
    window.history.replaceState(null, '', settingsURL(readSettings()));
    status.textContent = 'Back to a little mischief. The default guests and settings are restored.';
  });

  const params = new URLSearchParams(window.location.search);
  const ratingIndex = modes.findIndex(mode => mode.rating === params.get('rating')?.toLowerCase());
  for (const key of ['activity', 'placement', 'size']) {
    const value = params.get(key);
    const input = [...form.querySelectorAll(`input[name="${key}"]`)].find(element => element.value === value);
    if (input) input.checked = true;
  }
  if (params.has('cast')) {
    const cast = params.get('cast').split(',').filter(kind => kinds.includes(kind));
    form.querySelectorAll('input[name="cast"]').forEach(input => { input.checked = cast.includes(input.value); });
  }
  const idle = Number(params.get('idle'));
  if (params.has('idle') && Number.isFinite(idle)) byId('idle-delay').value = String(Math.max(3, Math.min(60, Math.round(idle))));
  if ([...byId('season').options].some(option => option.value === params.get('season'))) byId('season').value = params.get('season');
  renderMode(ratingIndex < 0 ? 1 : ratingIndex, false);
  syncState(api()?.state);
})();
