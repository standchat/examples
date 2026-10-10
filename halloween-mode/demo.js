// This page's own controls: the rating slider, the switch, the cast cards, the
// configurator that writes your snippet, and the first parade. halloween.js is
// the part to copy; this file only drives it through window.StandHalloween.
(() => {
  const halloween = window.StandHalloween;
  if (!halloween) return;

  const page = document.querySelector('.hw-page');
  const RATINGS = halloween.ratings.map((r) => r.key);
  const DEFAULTS = { rating: 'pg', cast: 'ghost bats spider pumpkin cat broom', haunt: 'lively', perch: 'auto', webs: 2, idle: 8, size: 1, costume: 'on', season: '10-01/11-01', sound: true };
  const CHIPS = { ghost: 'Ghost', bats: 'Bats', spider: 'Spider', pumpkin: 'Pumpkin', cat: 'Cat', broom: 'Flyer' };
  const TAGLINES = {
    g: 'Your website is going as a ghost this year.',
    pg: 'Your website is going as a ghost this year.',
    'pg-13': 'Your website is going as a ghost this year.',
    r: 'Your website is going as a wraith this year.',
    'nc-17': 'Your website is going as something we can’t describe.',
  };
  const HAUNTS = {
    calm: 'About once a minute, one at a time.',
    lively: 'Someone drops by every 16 to 30 seconds, two at most.',
    haunted: 'Every 6 to 12 seconds, up to three at once. It’s Halloween, after all.',
  };
  const PERCHES = {
    auto: 'Cards, images, buttons and headings are fair game.',
    marked: 'Only elements marked with data-halloween. This page marks its cast cards and the rating card.',
    off: 'Everyone stays on the edges of the window.',
  };

  // Facts for the demo Stand-in, so it can answer questions about Halloween mode
  // itself. On your site, data-context carries facts about your business instead.
  halloween.configure({
    context:
      'This page is Stand Chat’s Halloween mode example. Halloween mode is a free, public-domain script, halloween.js, ' +
      'for any website that has Stand Chat. To add it, paste two script tags anywhere on the page: Stand’s own, with ' +
      'the site’s ID, and <script defer src="https://examples.stand.chat/halloween-mode/halloween.js"></script>. To ' +
      'serve it yourself, download halloween.js and the image for your rating into a folder named halloween next to it. Characters visit ' +
      'the page (a ghost, bats, a spider, a pumpkin, a cat and a flyer), sit on its cards and headings, and clicking ' +
      'one opens this chat. It comes in five ratings, like films: G, PG (the default), PG-13, R and NC-17, set with ' +
      'data-rating. Other options are data attributes too: data-cast, data-haunt (calm, lively or haunted), ' +
      'data-perch (auto, marked or off), data-webs, data-idle, data-season (default 10-01/11-01, every year), ' +
      'data-costume, data-size, data-sound and data-ghost-greeting. It works through Stand’s JavaScript API: ' +
      'whenAvailable, and openChat with a greeting, a private prompt and an analyticsId. If something isn’t covered ' +
      'here, say you’re not sure.',
  });

  const form = document.querySelector('[data-knobs]');
  // Two sliders, the hero's and the snippet builder's, always on the same rating.
  const sliders = [...document.querySelectorAll('[data-rating-slider]')];
  const toggle = document.querySelector('[data-switch]');
  const toggleState = document.querySelector('[data-switch-state]');
  const soundButton = document.querySelector('[data-sound]');
  const set = (selector, text) => document.querySelectorAll(selector).forEach((el) => (el.textContent = text));

  // ---------------------------------------------------------------------------
  // The rating: the hero, the cast cards and the characters on screen follow it.

  function rate(key) {
    const look = halloween.look(key);
    page.dataset.rating = key;
    for (const slider of sliders) {
      slider.value = String(RATINGS.indexOf(key));
      slider.setAttribute('aria-valuetext', `${look.label}: ${look.title}`);
    }
    set('[data-studio-rating]', `${look.label} · ${look.title}`);
    set('[data-rating-label]', look.label);
    set('[data-rating-title]', look.title);
    set('[data-rating-blurb]', look.blurb);
    set('[data-tagline]', TAGLINES[key]);
    for (const tick of document.querySelectorAll('[data-rate]')) tick.classList.toggle('on', RATINGS[tick.dataset.rate] === key);
    for (const el of document.querySelectorAll('[data-art]')) el.replaceChildren(halloween.art(el.dataset.art, key) ?? '');
    for (const el of document.querySelectorAll('[data-cast-art]')) el.replaceChildren(halloween.art(el.dataset.castArt, key) ?? '');
    for (const el of document.querySelectorAll('[data-cast-name]')) el.textContent = look.names[el.dataset.castName];
    for (const el of document.querySelectorAll('[data-cast-line]')) el.textContent = `“${look.lines[el.dataset.castLine][0]}”`;
    for (const chip of document.querySelectorAll('.chip')) chip.querySelector('.art').replaceChildren(halloween.art(chip.dataset.kind, key) ?? '');
    if (halloween.config.rating !== key) halloween.configure({ rating: key });
    refresh();
  }

  for (const slider of sliders) slider.addEventListener('input', () => rate(RATINGS[Number(slider.value)]));
  for (const tick of document.querySelectorAll('[data-rate]')) {
    tick.addEventListener('click', () => rate(RATINGS[Number(tick.dataset.rate)]));
  }

  // ---------------------------------------------------------------------------
  // The switch and the sound toggle.

  const reflect = () => {
    toggle.setAttribute('aria-checked', String(halloween.running));
    toggleState.textContent = halloween.running ? 'On' : 'Off';
  };
  document.addEventListener('stand-halloween-start', reflect);
  document.addEventListener('stand-halloween-stop', reflect);
  toggle.addEventListener('click', () => {
    if (halloween.running) halloween.stop();
    else halloween.start();
  });
  soundButton.addEventListener('click', () => {
    form.sound.checked = soundButton.getAttribute('aria-pressed') !== 'true';
    refresh();
  });

  // ---------------------------------------------------------------------------
  // Summon buttons on the cast cards.

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-summon]');
    if (!button) return;
    if (!halloween.running) halloween.start({ parade: false });
    const kind = button.dataset.summon;
    if (!halloween.config.cast.includes(kind)) return say(button, 'Not on the guest list');
    const options = kind === 'bats' ? { count: halloween.config.rating === 'nc-17' ? 8 : 3 } : kind === 'ghost' ? {} : { stay: 14 };
    if (!halloween.summon(kind, options)) say(button, kind === 'ghost' ? 'Already out' : 'Already here');
  });

  function say(button, text) {
    button.dataset.label ??= button.textContent;
    button.dataset.said = '';
    button.textContent = text;
    clearTimeout(button.timer);
    button.timer = setTimeout(() => {
      button.textContent = button.dataset.label;
      delete button.dataset.said;
    }, 1600);
  }

  // ---------------------------------------------------------------------------
  // The configurator: changes apply to this page, and the snippet lists only
  // what differs from the defaults.

  const chips = document.querySelector('[data-cast-chips]');
  for (const [kind, name] of Object.entries(CHIPS)) {
    const chip = document.createElement('label');
    chip.className = 'chip';
    chip.dataset.kind = kind;
    chip.innerHTML = `<input type="checkbox" name="cast" value="${kind}" checked><span class="art" aria-hidden="true"></span><span></span>`;
    chip.lastElementChild.textContent = name;
    chips.append(chip);
  }

  function read() {
    return {
      rating: RATINGS[Number(sliders[0].value)],
      cast: [...form.querySelectorAll('input[name="cast"]:checked')].map((input) => input.value).join(' '),
      haunt: form.haunt.value,
      perch: form.perch.value,
      webs: Number(form.webs.value),
      idle: Number(form.idle.value),
      greeting: form.greeting.value.trim(),
      size: Number(form.size.value),
      costume: form.costume.value,
      season: form.season.value,
      sound: form.sound.checked,
    };
  }

  function refresh() {
    const v = read();
    halloween.configure({
      cast: v.cast,
      haunt: v.haunt,
      perch: v.perch,
      webs: v.webs,
      idle: v.idle,
      size: v.size,
      costume: v.costume,
      sound: v.sound,
      greetings: { ghost: v.greeting || null },
    });
    form.greeting.placeholder = halloween.look(v.rating).lines.ghost[0];
    set('[data-idle-out]', `${v.idle} seconds`);
    set('[data-webs-out]', String(v.webs));
    set('[data-haunt-note]', HAUNTS[v.haunt]);
    set('[data-perch-note]', PERCHES[v.perch]);
    soundButton.setAttribute('aria-pressed', String(v.sound));
    for (const link of document.querySelectorAll('[data-image-link]')) {
      link.href = `halloween/${v.rating}.webp`;
      link.textContent = `${v.rating}.webp`;
    }

    const attributes = [];
    if (v.rating !== DEFAULTS.rating) attributes.push(['data-rating', v.rating]);
    if (v.cast !== DEFAULTS.cast) attributes.push(['data-cast', v.cast || 'none']);
    if (v.haunt !== DEFAULTS.haunt) attributes.push(['data-haunt', v.haunt]);
    if (v.perch !== DEFAULTS.perch) attributes.push(['data-perch', v.perch]);
    if (v.webs !== DEFAULTS.webs) attributes.push(['data-webs', v.webs]);
    if (v.idle !== DEFAULTS.idle) attributes.push(['data-idle', v.idle]);
    if (v.greeting) attributes.push(['data-ghost-greeting', v.greeting]);
    if (v.size !== DEFAULTS.size) attributes.push(['data-size', v.size]);
    if (v.costume !== DEFAULTS.costume) attributes.push(['data-costume', v.costume]);
    if (v.season !== DEFAULTS.season) attributes.push(['data-season', v.season]);
    if (v.sound !== DEFAULTS.sound) attributes.push(['data-sound', String(v.sound)]);
    render(attributes);
  }

  // The copy this page serves: paste it anywhere, nothing to download.
  const HOSTED = 'https://examples.stand.chat/halloween-mode/halloween.js';
  const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let snippet = '';

  function render(attributes) {
    snippet = `<script defer src="${HOSTED}"${attributes.map(([name, value]) => `\n  ${name}="${value}"`).join('')}></script>`;
    const pretty = attributes
      .map(([name, value]) => `\n  <span class="a">${name}</span>=<span class="s">"${escape(value)}"</span>`)
      .join('');
    document.querySelector('[data-snippet]').innerHTML =
      '<span class="dim"><span class="c">&lt;!-- Stand’s snippet, as it is --&gt;</span>\n' +
      '<span class="t">&lt;script</span> <span class="a">defer src</span>=<span class="s">"…/stand.js"</span> ' +
      '<span class="a">data-stand-id</span>=<span class="s">"…"</span><span class="t">&gt;&lt;/script&gt;</span></span>\n\n' +
      '<span class="c">&lt;!-- Then Halloween mode --&gt;</span>\n' +
      `<span class="t">&lt;script</span> <span class="a">defer src</span>=<span class="s">"${HOSTED}"</span>${pretty}<span class="t">&gt;&lt;/script&gt;</span>`;
  }

  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('submit', (event) => event.preventDefault());

  // ---------------------------------------------------------------------------
  // Copy buttons.

  async function copy(button, text) {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select it';
    }
    setTimeout(() => (button.textContent = 'Copy'), 1600);
  }
  document.querySelector('[data-copy-snippet]').addEventListener('click', (event) => copy(event.currentTarget, snippet));
  // The hero's box copies a demo that works on any page as it is: Stand's demo site and this script.
  const DEMO = `<script defer src="https://cdn.stand.chat/widget/stand.js" data-stand-id="demo"></script>\n<script defer src="${HOSTED}"></script>`;
  document.querySelector('[data-copy-install]').addEventListener('click', (event) => copy(event.currentTarget, DEMO));

  rate(halloween.config.rating);

  // ---------------------------------------------------------------------------
  // The first parade, staged around this hero's moon. On narrow screens, with
  // reduced motion, or after the rating changed, the script's own parade does.

  function parade() {
    const staged = innerWidth >= 900 && !matchMedia('(prefers-reduced-motion: reduce)').matches && halloween.config.rating === 'pg-13';
    if (!staged) return halloween.start();
    halloween.start({ parade: false });
    const at = (seconds, kind, options) => setTimeout(() => halloween.running && halloween.summon(kind, options), seconds * 1000);
    at(0, 'cat', { from: 'right', x: 0.72, speed: 120, stay: 22 });
    at(0.25, 'pumpkin', { x: 0.55, stay: 22 });
    at(0.6, 'spider', { x: 0.86, drop: 0.15, stay: 20 });
    at(1.1, 'ghost', { x: 0.8, y: 0.58, side: 'left', from: 'launcher' });
    at(2.9, 'bats', { count: 2, from: 'right', y: 0.3, hang: false });
  }

  (function waitForStand(tries = 0) {
    if (window.StandChat) {
      let started = false;
      window.StandChat.whenAvailable(() => {
        if (started) return;
        started = true;
        parade();
      });
    } else if (tries < 150) {
      setTimeout(() => waitForStand(tries + 1), 100);
    }
  })();
})();
