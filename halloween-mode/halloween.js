/*!
 * Halloween mode for Stand Chat 1.0
 * https://examples.stand.chat/halloween-mode/
 * Public domain (Unlicense): copy it, change it, ship it.
 */
// Halloween characters drop by your pages, and each one opens your Stand chat
// with its own greeting. When nobody has moved for a while, a ghost comes out to
// say hi. Five looks, rated like films: G, PG, PG-13, R and NC-17. Add this
// after Stand's snippet:
//
//   <script defer src="https://cdn.stand.chat/widget/stand.js" data-stand-id="YOUR-SITE-ID"></script>
//   <script defer src="halloween.js" data-rating="pg-13"></script>
//
// Options are data-* attributes on that script tag, or window.StandHalloweenConfig
// set before it (see DEFAULTS). Characters sit on, hang from and peek over the
// page's own cards, images, buttons and headings; data-halloween="perch hang peek
// web none" on an element steers them. It wakes up every October 1, packs itself
// away after November 1, and runs only while Stand has someone to answer. The
// characters are images in the halloween folder next to this file; it loads one,
// for the rating on show.
(() => {
  'use strict';
  if (window.StandHalloween) return; // Included twice.

  const VERSION = '1.0.0';
  const script = document.currentScript;
  const KINDS = ['ghost', 'bats', 'spider', 'pumpkin', 'cat', 'broom'];
  const RATINGS = ['g', 'pg', 'pg-13', 'r', 'nc-17'];

  // ---------------------------------------------------------------------------
  // The five looks: who the characters are, what they say, how they move.

  const LOOKS = {
    g: {
      label: 'G',
      title: 'General audiences',
      blurb: 'Rated G for plush ghosts, giggles and an alarming number of puns.',
      names: { ghost: 'Boo', bats: 'The night shift', spider: 'Webster', pumpkin: 'Jack', cat: 'Midnight', broom: 'The broom' },
      who: {
        ghost: 'Boo, a plush felt ghost carrying a little lantern',
        bats: 'a lavender plush bat',
        spider: 'Webster, a fluffy plush spider',
        pumpkin: 'Jack, a smiling plush pumpkin',
        cat: 'Midnight, a plush black kitten with an orange bow',
        broom: 'a flying felt broomstick with a witch’s hat on it, but no witch',
      },
      lines: {
        ghost: [
          'Boo! Sorry, force of habit. Anything I can help you find?',
          'Still floating around? Me too. Got a question? I’m all ears. Well, all sheet.',
          'Didn’t mean to haunt you. Anything we can help with before I drift off?',
        ],
        bats: ['Fangs for stopping by! What can we help you with?'],
        hanging: 'Just hanging around. What’s on your mind?',
        spider: ['Caught you in our web! Need a hand? I’ve got eight.', 'Hi, I’m Webster. I work on the website. What can I help with?'],
        pumpkin: ['Lit to see you! What can we help you with?', 'Hey there, pumpkin. Got a question? Ask away.'],
        cat: ['Purr-haps I can help? Ask me anything.', 'Meow’s it going? Ask me anything.'],
        broom: ['The witch is out, but I can still sweep you to an answer. What do you need?', 'Just sweeping by! Anything I can help with?'],
      },
      labels: { ask: 'Ask away', hint: 'Click to chat', dismiss: 'Not now' },
      tone: 'Open your first reply with a playful one-liner in its spirit, like a gentle pun. Keep everything friendly and fine for children.',
      burst: 'candy',
      ghost: { arrive: 'launcher', move: 'float', speed: 30, bob: 6 },
      bats: [1, 3],
    },
    pg: {
      label: 'PG',
      title: 'Parental guidance suggested',
      blurb: 'Rated PG for mischief, a bedsheet ghost and a witch who flies too fast.',
      names: { ghost: 'Boo', bats: 'The bats', spider: 'Webster', pumpkin: 'Jack', cat: 'Midnight', broom: 'The witch' },
      who: {
        ghost: 'Boo, a mischievous bedsheet ghost carrying a lantern',
        bats: 'a cheeky puppet bat with orange ears',
        spider: 'Webster, a striped puppet spider with a grin',
        pumpkin: 'Jack, a gap-toothed jack-o’-lantern',
        cat: 'Midnight, a grinning black cat',
        broom: 'a cackling witch on a broomstick',
      },
      lines: {
        ghost: [
          'BOO! Ha, got you. Anything I can help you find?',
          'Trick or treat? The treat is we answer questions. Go on.',
          'I’m not following you, I’m haunting. Totally different. Need anything?',
        ],
        bats: ['We came for the snacks and stayed for your questions. What’s up?'],
        hanging: 'Hang on, I’ll be right side up in a sec. What do you need?',
        spider: ['Welcome to my parlor. It’s really just a help desk. Ask away!', 'Eight legs, zero chill. What can I help with?'],
        pumpkin: ['Don’t mind my face, I was carved this way. What’s on your mind?', 'Somebody scooped out my brains, but I still know the answers. Try me.'],
        cat: ['I knocked something off your page. Kidding! Need a hand?', 'Bad luck? Never heard of it. What can I help with?'],
        broom: ['Coming through! Need a lift to an answer?', 'Hop on, we’re flying straight to the help desk. What’s your question?'],
      },
      labels: { ask: 'Ask away', hint: 'Click to chat', dismiss: 'Not now' },
      tone: 'Open your first reply with a cheeky one-liner in its spirit. Mischief is welcome; nothing actually scary.',
      burst: 'classic',
      ghost: { arrive: 'launcher', move: 'float', speed: 32, bob: 6 },
      bats: [1, 3],
    },
    'pg-13': {
      label: 'PG-13',
      title: 'Parents strongly cautioned',
      blurb: 'Rated PG-13 for things in the dark and a ghost you can see through.',
      names: { ghost: 'The ghost', bats: 'The bats', spider: 'The spider', pumpkin: 'Jack', cat: 'Midnight', broom: 'The witch' },
      who: {
        ghost: 'a gauzy apparition carrying an old lantern',
        bats: 'a bat',
        spider: 'a long-legged spider',
        pumpkin: 'a weathered, sinister jack-o’-lantern',
        cat: 'a black cat with amber eyes',
        broom: 'a witch flying past in the dark',
      },
      lines: {
        ghost: ['Didn’t hear you come in. Anything I can help you find?', 'This place gets quiet after dark. Got a question?', 'Still here. So am I. What do you need?'],
        bats: ['Out for the night. Ask us anything.'],
        hanging: 'We only come out at night. And for questions.',
        spider: ['You walked right into my web. Might as well ask.', 'I’ve been here the whole time. What do you need?'],
        pumpkin: ['The candle’s lit, so someone’s home. Ask away.', 'Grinning since sundown. What can we help with?'],
        cat: ['Crossing your path is just a habit. What can I help with?', 'Nine lives, one question at a time. Go on.'],
        broom: ['She’s busy tonight, but I can still help.', 'Just passing the moon. Anything you need?'],
      },
      labels: { ask: 'Ask us', hint: 'Click to chat', dismiss: 'Not now' },
      tone: 'Open your first reply with one dry, atmospheric line, like a spooky film trailer. Spooky is fine; nothing upsetting.',
      burst: 'embers',
      ghost: { arrive: 'peek', move: 'float', speed: 22, bob: 4 },
      bats: [1, 3],
      mood: true,
    },
    r: {
      label: 'R',
      title: 'Restricted',
      blurb: 'Rated R for creepy crawlies, a rotting pumpkin and a raven who won’t stop staring.',
      names: { ghost: 'The wraith', bats: 'The bats', spider: 'The tarantula', pumpkin: 'Rotten Jack', cat: 'Midnight', broom: 'The raven' },
      who: {
        ghost: 'a hooded skeletal wraith carrying a lantern',
        bats: 'a snarling vampire bat',
        spider: 'a hairy tarantula',
        pumpkin: 'a rotting jack-o’-lantern',
        cat: 'a gaunt, hissing black cat',
        broom: 'a raven',
      },
      lines: {
        ghost: ['I’ve been watching you scroll. You look like you have a question.', 'You found me. Now ask what you came here to ask.', 'They say this website is haunted. They’re right. How can I help?'],
        bats: ['We smelled a question. Ask it.'],
        hanging: 'Don’t mind us. We sleep upside down. Ask your question.',
        spider: ['Every website has a few spiders. I’m the one who answers. Ask.', 'Eight eyes, all on you. What do you need?'],
        pumpkin: ['I’m a little past my prime. My answers aren’t. Go ahead.', 'Something crawled into me last week. Never mind. Question?'],
        cat: ['Hssss. Sorry. What do you want to know?', 'I don’t like strangers. I make an exception for questions.'],
        broom: ['Nevermore? No. Ask more.', 'Caw. That means: how can I help?'],
      },
      labels: { ask: 'Ask… if you dare', hint: 'Click to chat', dismiss: 'Leave me' },
      tone: 'Open your first reply with one deadpan, creepy line in its spirit, like a side character in a horror film. Creepy fun only: no gore, no threats.',
      burst: 'moths',
      ghost: { arrive: 'peek', move: 'glide', speed: 24, bob: 3 },
      bats: [1, 2],
      mood: true,
    },
    'nc-17': {
      label: 'NC-17',
      title: 'No one 17 and under admitted',
      blurb: 'Rated NC-17 for nightmares. Probably not for your kindergarten’s website.',
      names: { ghost: 'The reaper', bats: 'The swarm', spider: 'The widow', pumpkin: 'Hungry Jack', cat: 'The thing', broom: 'The crows' },
      who: {
        ghost: 'a towering, screaming reaper holding a red lantern',
        bats: 'a swarm of demon bats',
        spider: 'a black widow',
        pumpkin: 'a monstrous jack-o’-lantern with too many teeth',
        cat: 'an emaciated shadow cat with four red eyes',
        broom: 'a murder of crows',
      },
      lines: {
        ghost: ['You shouldn’t be here alone. Ask your question.', 'Don’t look behind you. Look at me. What do you need?', 'It’s been so long since anyone came. Ask me something.'],
        bats: ['There are more of us than you think. What do you need?'],
        hanging: 'We’re always up here. You just never looked. Ask.',
        spider: ['Something brushed your hand just now. It was me. Ask your question.', 'I’m already in the walls. Might as well help. Go on.'],
        pumpkin: ['Burnt, not finished. Ask me anything.', 'The light inside me never goes out. What do you want?'],
        cat: ['That noise in the dark? Just me. What do you need?', 'Don’t count my eyes. Ask your question.'],
        broom: ['We’ve been circling. What do you want to know?', 'A murder of crows, at your service. Ask.'],
      },
      labels: { ask: 'Answer it', hint: 'Click. If you must.', dismiss: 'Go away' },
      tone: 'Open your first reply with one ominous line, like the host of a horror anthology, then answer plainly and accurately. Dark humor only: no gore, no violence, no threats.',
      burst: 'swarm',
      ghost: { arrive: 'appear', move: 'jerk', speed: 0, bob: 1.5 },
      bats: [6, 9],
      mood: true,
      typewriter: true,
    },
  };

  const PROMPT =
    'Halloween mode is on for this website: Halloween characters visit the page. The visitor opened this chat by ' +
    'clicking {who}, and the greeting came from it. {tone} Then help as you normally would.';

  const DEFAULTS = {
    rating: 'pg', // The look: g, pg, pg-13, r or nc-17.
    cast: KINDS, // Who visits. The ghost is the one who comes out when nobody's moving.
    haunt: 'lively', // How often the others drop by: calm, lively or haunted.
    perch: 'auto', // Using the page: auto (cards, images, headings), marked (data-halloween only) or off.
    webs: 2, // Cobwebs in the corners of cards and images. 0 for none.
    season: '10-01/11-01', // Month-day range, every year. Or full dates, "always" or "never".
    idle: 8, // Seconds without scrolling, typing or moving before the ghost comes out.
    costume: 'on', // Stand's chat button dresses up for the season. "none" leaves it alone.
    sound: true, // Small synthesized sounds. Browsers allow them after the visitor's first click or tap.
    size: 1, // Scale for every character.
    greetings: {}, // Your own lines, per character: a string or a list.
    prompt: PROMPT, // Private context for whoever answers. {who} and {tone} are filled in. "" sends none.
    context: '', // Appended to the prompt: facts about your site or campaign.
    labels: {}, // Your own wording for the buttons: { ask, hint, dismiss }.
    autostart: true, // false waits for StandHalloween.start().
    assets: '', // The URL of the halloween folder with the images. Next to this script by default.
    zIndex: 2147483646, // Just under Stand's own widget.
  };

  // How often visitors come by, in seconds, and how many may be on screen at once.
  const HAUNTS = {
    calm: { every: [40, 70], together: 1 },
    lively: { every: [16, 30], together: 2 },
    haunted: { every: [6, 12], together: 3 },
  };
  const WEIGHTS = { bats: 3, spider: 2, pumpkin: 2, cat: 2, broom: 1 };
  // Without motion, only the characters that can simply appear and sit still.
  const STILL_CAST = ['ghost', 'spider', 'pumpkin', 'cat'];
  const INTERACTIVE =
    'a[href], button, input, select, textarea, label, summary, iframe, video, [role="button"], [contenteditable=""], ' +
    '[contenteditable="true"], stand-button, stand-card, stand-chatbox';
  const READING = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, code, td, th, figcaption, dt, dd, img';

  // ---------------------------------------------------------------------------
  // Small helpers

  const now = () => performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const approach = (value, target, rate, dt) => lerp(value, target, 1 - Math.exp(-rate * dt));
  const ease = {
    outCubic: (t) => 1 - (1 - t) ** 3,
    inCubic: (t) => t ** 3,
    inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
    outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
    inBack: (t) => 2.70158 * t ** 3 - 1.70158 * t ** 2,
  };
  const firstSentence = (text) => text.match(/^.*?[.!?…](?=\s|$)/)?.[0] ?? text;
  const toList = (value) => (Array.isArray(value) ? value : String(value).split(/[\s,]+/));
  const flag = (value) => !/^(false|0|no|off)$/i.test(String(value).trim());

  // ---------------------------------------------------------------------------
  // Configuration: defaults, then window.StandHalloweenConfig, then data-* on the
  // script tag. ?halloween=on|off in the page URL overrides the season, and
  // ?halloween=r (or any rating) picks a look.

  function readConfig() {
    const data = script?.dataset ?? {};
    const config = { ...DEFAULTS, ...(window.StandHalloweenConfig ?? {}) };
    config.greetings = { ...config.greetings };
    config.labels = { ...config.labels };
    for (const key of ['rating', 'cast', 'haunt', 'perch', 'webs', 'season', 'idle', 'costume', 'size', 'context', 'assets']) {
      if (data[key]) config[key] = data[key];
    }
    if (data.sound) config.sound = flag(data.sound);
    if (data.autostart) config.autostart = flag(data.autostart);
    if (data.prompt != null) config.prompt = data.prompt;
    for (const kind of KINDS) {
      const line = data[`${kind}Greeting`];
      if (line) config.greetings[kind] = line;
    }
    const asked = rating(new URLSearchParams(location.search).get('halloween'));
    if (asked) config.rating = asked;
    return normalize(config);
  }

  // "PG-13", "pg13" and "pg 13" are all pg-13.
  function rating(value) {
    const key = String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return { g: 'g', pg: 'pg', pg13: 'pg-13', r: 'r', nc17: 'nc-17' }[key] ?? null;
  }

  function normalize(config) {
    config.rating = rating(config.rating) ?? DEFAULTS.rating;
    config.cast = toList(config.cast).map((k) => k.trim().toLowerCase().replace(/^bat$/, 'bats')).filter((k) => KINDS.includes(k));
    if (!HAUNTS[config.haunt]) config.haunt = 'lively';
    if (!['auto', 'marked', 'off'].includes(config.perch)) config.perch = flag(config.perch) ? 'auto' : 'off';
    config.webs = clamp(Math.round(Number(config.webs)), 0, 6) || 0;
    config.idle = clamp(Number(config.idle) || DEFAULTS.idle, 2, 600);
    config.size = clamp(Number(config.size) || 1, 0.5, 2);
    config.costume = config.costume === 'none' || config.costume === false || config.costume === 'off' ? 'none' : 'on';
    config.sound = flag(config.sound);
    return config;
  }

  // "10-01/11-01" runs every year, inclusive, and may wrap over New Year.
  // "2026-10-09/2026-11-02" runs once.
  function inSeason(season, date = new Date()) {
    if (season === true || season === 'always') return true;
    if (!season || season === 'never') return false;
    const [from, until] = String(season).split('/').map((part) => part.trim().split('-').map(Number));
    if (!from || !until || from.length !== until.length || [...from, ...until].some(Number.isNaN)) {
      console.warn(`[Halloween mode] Can't read season "${season}". Use "10-01/11-01" or "always".`);
      return inSeason(DEFAULTS.season, date);
    }
    if (from.length === 3) {
      return date >= new Date(from[0], from[1] - 1, from[2]) && date < new Date(until[0], until[1] - 1, until[2] + 1);
    }
    const key = (month, day) => month * 100 + day;
    const today = key(date.getMonth() + 1, date.getDate());
    const [start, end] = [key(...from), key(...until)];
    return start <= end ? today >= start && today <= end : today >= start || today <= end;
  }

  const config = readConfig();
  const urlSwitch = new URLSearchParams(location.search).get('halloween');
  const look = (r = config.rating) => LOOKS[r];

  // ---------------------------------------------------------------------------
  // The art: one image per rating (g.webp, pg.webp, …) in the halloween folder
  // next to this script, made with an image model and cut into parts that move.
  // Wings flap, legs step, tails sway, lanterns swing and lids pop. Only the
  // rating on show is downloaded. RIGS says where each part sits in its image,
  // where it goes on the character and the point it turns around.

  const RIGS = {
    g: {
      atlas: [1024, 659],
      ghost: { size: [306, 300], parts: [["lantern", 937, 3, 70, 152, 236, 107, 36, 2], ["body", 3, 3, 276, 300, 0, 0]], glow: [276, 207, 35] },
      bat: { size: [240, 106], parts: [["wingL", 247, 557, 53, 60, 42, 30, 48, 25], ["wingL2", 303, 557, 55, 60, 0, 30, 48, 7, "wingL", 1], ["wingR", 361, 557, 53, 60, 145, 30, 4, 25], ["wingR2", 417, 557, 55, 60, 185, 30, 6, 7, "wingR", 1], ["body", 764, 306, 98, 106, 72, 0]] },
      batHang: { size: [86, 150], parts: [["body", 3, 306, 86, 150, 0, 0]] },
      spider: { size: [220, 174], parts: [["leg-l1", 423, 459, 80, 79, 0, 18, 73, 55], ["leg-l0", 886, 459, 69, 68, 26, 0, 52, 60], ["leg-l3", 656, 459, 77, 75, 25, 98, 55, 12], ["leg-l2", 75, 557, 83, 61, 13, 76, 72, 14], ["leg-r2", 161, 557, 83, 61, 122, 75, 11, 15], ["leg-r3", 506, 459, 78, 76, 119, 97, 24, 12], ["leg-r0", 3, 557, 69, 68, 126, 0, 18, 60], ["leg-r1", 79, 459, 78, 80, 142, 15, 7, 57], ["body", 377, 306, 81, 125, 71, 29]] },
      pumpkin: { size: [260, 276], parts: [["body", 674, 3, 260, 196, 0, 80], ["lid", 160, 459, 260, 80, 0, 0, 78, 80]] },
      cat: { size: [300, 184], parts: [["pelvis", 736, 459, 72, 71, 109, 64, 61, 37], ["pelvisFill", 587, 459, 66, 76, 104, 63, null, null, "pelvis", 1], ["tail0", 863, 557, 27, 30, 81, 59, 24, 18, "pelvis", 1], ["tail1", 893, 557, 26, 30, 60, 59, 24, 17, "tail0", 1], ["tail2", 922, 557, 26, 30, 40, 59, 24, 16, "tail1", 1], ["tail3", 951, 557, 26, 30, 19, 59, 24, 15, "tail2", 1], ["tail4", 980, 557, 24, 30, 0, 59, 22, 14, "tail3", 1], ["hf0", 679, 557, 43, 34, 84, 103, 22, 7, "pelvis", 1], ["hf1", 771, 557, 43, 31, 84, 128, 22, 4, "hf0", 1], ["hf2", 3, 628, 43, 28, 84, 150, 12, 4, "hf1", 1], ["chest", 811, 459, 72, 71, 159, 64, 11, 37, "pelvis", 0], ["chestFill", 265, 306, 109, 139, 170, 0, null, null, "chest", 1], ["ff0", 475, 557, 48, 38, 203, 105, 23, 8, "chest", 1], ["ff1", 577, 557, 48, 36, 203, 134, 24, 4, "ff0", 1], ["ff2", 95, 628, 48, 21, 203, 162, 21, 4, "ff1", 1], ["fn0", 526, 557, 48, 38, 209, 106, 23, 8, "chest", 0], ["fn1", 628, 557, 48, 36, 209, 136, 24, 4, "fn0", 1], ["fn2", 146, 628, 48, 21, 209, 163, 21, 4, "fn1", 1], ["head", 865, 306, 89, 104, 211, 0, 12, 68, "chest", 0], ["hn0", 725, 557, 43, 34, 90, 104, 22, 7, "pelvis", 0], ["hn1", 817, 557, 43, 31, 90, 130, 22, 4, "hn0", 1], ["hn2", 49, 628, 43, 28, 90, 152, 12, 4, "hn1", 1]] },
      catSit: { size: [164, 240], parts: [["tail", 3, 459, 73, 95, 91, 133, 22, 15], ["body", 535, 3, 136, 240, 0, 0]] },
      flyer: { size: [300, 124], parts: [["body", 461, 306, 300, 124, 0, 0]] },
      hat: { size: [170, 149], parts: [["body", 92, 306, 170, 149, 0, 0]] },
      web: { size: [250, 249], parts: [["body", 282, 3, 250, 249, 0, 0]] },
    },
    pg: {
      atlas: [1024, 692],
      ghost: { size: [245, 300], parts: [["lantern", 555, 306, 58, 135, 187, 65, 30, 2], ["body", 3, 3, 217, 300, 0, 0]], glow: [216, 155, 30] },
      bat: { size: [240, 97], parts: [["wingL", 551, 508, 55, 63, 43, 19, 50, 28], ["wingL2", 609, 508, 56, 63, 0, 19, 50, 8, "wingL", 1], ["wingR", 668, 508, 55, 63, 142, 20, 5, 29], ["wingR2", 726, 508, 56, 63, 184, 20, 6, 8, "wingR", 1], ["body", 3, 508, 75, 97, 83, 0]] },
      batHang: { size: [73, 150], parts: [["body", 479, 306, 73, 150, 0, 0]] },
      spider: { size: [220, 193], parts: [["leg-l2", 852, 508, 51, 59, 4, 95, 47, 11], ["leg-l0", 193, 608, 40, 44, 25, 0, 37, 39], ["leg-l1", 612, 608, 79, 35, 0, 62, 76, 27], ["leg-l3", 261, 508, 92, 92, 16, 100, 68, 15], ["leg-r3", 81, 508, 93, 94, 111, 99, 25, 15], ["leg-r1", 236, 608, 83, 44, 137, 58, 4, 27], ["leg-r0", 149, 608, 41, 45, 152, 0, 3, 41], ["leg-r2", 906, 508, 48, 56, 165, 96, 4, 10], ["body", 616, 306, 85, 124, 68, 22]] },
      pumpkin: { size: [260, 307], parts: [["body", 620, 3, 260, 204, 0, 103], ["lid", 704, 306, 260, 103, 0, 0, 78, 103]], glow: [89, 158, 141] },
      cat: { size: [300, 179], parts: [["pelvis", 3, 608, 70, 55, 120, 68, 59, 29], ["pelvisFill", 785, 508, 64, 63, 115, 69, null, null, "pelvis", 1], ["tail0", 906, 608, 27, 23, 85, 64, 25, 13, "pelvis", 1], ["tail1", 936, 608, 27, 23, 63, 64, 25, 13, "tail0", 1], ["tail2", 966, 608, 27, 23, 41, 64, 25, 13, "tail1", 1], ["tail3", 3, 666, 27, 23, 19, 64, 25, 11, "tail2", 1], ["tail4", 33, 666, 25, 23, 0, 64, 23, 10, "tail3", 1], ["hf0", 414, 608, 50, 38, 104, 95, 29, 9, "pelvis", 1], ["hf1", 694, 608, 50, 32, 104, 123, 30, 4, "hf0", 1], ["hf2", 747, 608, 50, 32, 104, 146, 15, 4, "hf1", 1], ["chest", 76, 608, 70, 55, 168, 68, 11, 29, "pelvis", 0], ["chestFill", 356, 508, 120, 85, 179, 47, null, null, "chest", 1], ["ff0", 322, 608, 43, 40, 206, 96, 14, 8, "chest", 1], ["ff1", 520, 608, 43, 37, 206, 126, 16, 4, "ff0", 1], ["ff2", 61, 666, 43, 22, 206, 154, 23, 4, "ff1", 1], ["fn0", 368, 608, 43, 40, 211, 97, 14, 8, "chest", 0], ["fn1", 566, 608, 43, 37, 211, 127, 16, 4, "fn0", 1], ["fn2", 107, 666, 43, 22, 211, 156, 23, 4, "fn1", 1], ["head", 177, 508, 81, 94, 219, 0, 12, 70, "chest", 0], ["hn0", 467, 608, 50, 38, 110, 96, 29, 9, "pelvis", 0], ["hn1", 800, 608, 50, 32, 110, 125, 30, 4, "hn0", 1], ["hn2", 853, 608, 50, 32, 110, 147, 15, 4, "hn1", 1]] },
      catSit: { size: [148, 240], parts: [["tail", 479, 508, 69, 85, 79, 155, 30, 11], ["body", 476, 3, 141, 228, 0, 0]] },
      flyer: { size: [300, 199], parts: [["body", 3, 306, 300, 199, 0, 0]] },
      hat: { size: [170, 158], parts: [["body", 306, 306, 170, 158, 0, 0]] },
      web: { size: [250, 280], parts: [["body", 223, 3, 250, 280, 0, 0]] },
    },
    'pg-13': {
      atlas: [1024, 661],
      ghost: { size: [195, 300], parts: [["lantern", 680, 306, 37, 92, 158, 47, 18, 2], ["body", 3, 3, 182, 300, 0, 0]], glow: [176, 107, 12] },
      bat: { size: [240, 82], parts: [["wingL", 866, 505, 56, 65, 44, 0, 51, 39], ["wingL2", 925, 505, 57, 65, 0, 0, 50, 12, "wingL", 1], ["wingR", 3, 593, 55, 65, 141, 0, 5, 39], ["wingR2", 61, 593, 57, 65, 183, 0, 7, 12, "wingR", 1], ["body", 817, 505, 46, 67, 97, 16]] },
      batHang: { size: [65, 150], parts: [["body", 479, 306, 65, 150, 0, 0]] },
      spider: { size: [220, 200], parts: [["leg-l0", 181, 593, 49, 56, 21, 41, 45, 41], ["leg-l2", 266, 505, 104, 78, 0, 94, 90, 8], ["leg-l3", 593, 306, 42, 94, 54, 106, 37, 6], ["leg-l1", 923, 306, 73, 88, 36, 0, 58, 82], ["leg-r1", 847, 306, 73, 89, 110, 4, 14, 83], ["leg-r3", 638, 306, 39, 93, 128, 106, 2, 9], ["leg-r2", 373, 505, 105, 78, 115, 93, 15, 9], ["leg-r0", 233, 593, 49, 56, 150, 41, 5, 42], ["body", 547, 306, 43, 113, 89, 55]] },
      pumpkin: { size: [260, 293], parts: [["body", 576, 3, 260, 208, 0, 85], ["lid", 3, 505, 260, 85, 0, 0, 78, 85]], glow: [138, 161, 162] },
      cat: { size: [300, 164], parts: [["pelvis", 645, 505, 83, 70, 106, 38, 70, 34], ["pelvisFill", 566, 505, 76, 71, 100, 41, null, null, "pelvis", 1], ["tail0", 761, 593, 27, 26, 83, 39, 24, 14, "pelvis", 1], ["tail1", 791, 593, 26, 26, 62, 39, 24, 14, "tail0", 1], ["tail2", 820, 593, 26, 26, 41, 39, 24, 13, "tail1", 1], ["tail3", 849, 593, 26, 26, 20, 39, 24, 13, "tail2", 1], ["tail4", 878, 593, 25, 26, 0, 39, 23, 12, "tail3", 1], ["hf0", 473, 593, 45, 40, 90, 74, 19, 8, "pelvis", 1], ["hf1", 569, 593, 45, 35, 90, 103, 26, 4, "hf0", 1], ["hf2", 665, 593, 45, 34, 90, 129, 13, 4, "hf1", 1], ["chest", 731, 505, 83, 70, 163, 38, 13, 34, "pelvis", 0], ["chestFill", 720, 306, 124, 90, 176, 23, null, null, "chest", 1], ["ff0", 285, 593, 44, 45, 217, 70, 17, 8, "chest", 1], ["ff1", 379, 593, 44, 43, 217, 105, 19, 4, "ff0", 1], ["ff2", 906, 593, 44, 24, 217, 138, 25, 4, "ff1", 1], ["fn0", 332, 593, 44, 45, 224, 72, 17, 8, "chest", 0], ["fn1", 426, 593, 44, 43, 224, 106, 19, 4, "fn0", 1], ["fn2", 953, 593, 44, 24, 224, 139, 25, 4, "fn1", 1], ["head", 121, 593, 57, 60, 243, 0, 8, 41, "chest", 0], ["hn0", 521, 593, 45, 40, 97, 75, 19, 8, "pelvis", 0], ["hn1", 617, 593, 45, 35, 97, 105, 26, 4, "hn0", 1], ["hn2", 713, 593, 45, 34, 97, 130, 13, 4, "hn1", 1]] },
      catSit: { size: [193, 240], parts: [["tail", 481, 505, 82, 75, 110, 156, 7, 49], ["body", 188, 3, 132, 240, 0, 0]] },
      flyer: { size: [300, 196], parts: [["body", 3, 306, 300, 196, 0, 0]] },
      hat: { size: [170, 174], parts: [["body", 306, 306, 170, 174, 0, 0]] },
      web: { size: [250, 239], parts: [["body", 323, 3, 250, 239, 0, 0]] },
    },
    r: {
      atlas: [1024, 711],
      ghost: { size: [181, 300], parts: [["lantern", 840, 306, 38, 107, 143, 54, 19, 2], ["body", 3, 3, 179, 300, 0, 0]], glow: [162, 130, 13] },
      bat: { size: [240, 114], parts: [["wingL", 335, 481, 55, 92, 43, 0, 48, 62], ["wingL2", 393, 481, 56, 92, 0, 0, 50, 12, "wingL", 1], ["wingR", 217, 481, 55, 93, 141, 0, 7, 62], ["wingR2", 275, 481, 57, 93, 183, 0, 6, 12, "wingR", 1], ["body", 156, 587, 60, 78, 91, 36]] },
      batHang: { size: [65, 150], parts: [["body", 704, 306, 65, 150, 0, 0]] },
      spider: { size: [220, 189], parts: [["leg-l3", 881, 306, 113, 104, 5, 85, 73, 25], ["leg-l2", 637, 481, 98, 82, 0, 82, 83, 18], ["leg-l1", 74, 587, 79, 79, 13, 29, 74, 62], ["leg-l0", 544, 481, 90, 84, 23, 1, 68, 78], ["leg-r0", 452, 481, 89, 86, 107, 0, 23, 80], ["leg-r1", 219, 587, 78, 78, 129, 30, 5, 63], ["leg-r2", 738, 481, 99, 82, 121, 81, 15, 19], ["leg-r3", 3, 481, 113, 103, 102, 87, 39, 24], ["body", 772, 306, 65, 133, 78, 46]] },
      pumpkin: { size: [260, 277], parts: [["body", 556, 3, 260, 200, 0, 77], ["lid", 434, 587, 260, 77, 0, 0, 78, 77]], glow: [120, 136, 164] },
      cat: { size: [300, 147], parts: [["pelvis", 697, 587, 74, 67, 117, 11, 62, 32], ["pelvisFill", 3, 587, 68, 80, 112, 10, null, null, "pelvis", 1], ["tail0", 99, 670, 27, 36, 86, 17, 25, 14, "pelvis", 1], ["tail1", 129, 670, 27, 36, 65, 17, 25, 15, "tail0", 1], ["tail2", 159, 670, 27, 36, 43, 17, 25, 15, "tail1", 1], ["tail3", 189, 670, 27, 36, 21, 17, 25, 12, "tail2", 1], ["tail4", 219, 670, 27, 36, 0, 17, 25, 9, "tail3", 1], ["hf0", 249, 670, 38, 36, 102, 55, 14, 8, "pelvis", 1], ["hf1", 331, 670, 38, 32, 102, 82, 24, 4, "hf0", 1], ["hf2", 413, 670, 38, 30, 102, 104, 14, 4, "hf1", 1], ["chest", 774, 587, 74, 67, 168, 11, 11, 32, "pelvis", 0], ["chestFill", 840, 481, 121, 82, 179, 8, null, null, "chest", 1], ["ff0", 914, 587, 45, 41, 202, 63, 16, 9, "chest", 1], ["ff1", 3, 670, 45, 38, 202, 95, 17, 4, "ff0", 1], ["ff2", 495, 670, 45, 22, 202, 123, 23, 4, "ff1", 1], ["fn0", 962, 587, 45, 41, 208, 65, 16, 9, "chest", 0], ["fn1", 51, 670, 45, 38, 208, 96, 17, 4, "fn0", 1], ["fn2", 543, 670, 45, 22, 208, 125, 23, 4, "fn1", 1], ["head", 851, 587, 60, 48, 240, 0, 7, 29, "chest", 0], ["hn0", 290, 670, 38, 36, 108, 56, 14, 8, "pelvis", 0], ["hn1", 372, 670, 38, 32, 108, 83, 24, 4, "hn0", 1], ["hn2", 454, 670, 38, 30, 108, 106, 14, 4, "hn1", 1]] },
      catSit: { size: [155, 240], parts: [["tail", 119, 481, 95, 99, 60, 137, 42, 16], ["body", 438, 3, 115, 240, 0, 0]] },
      flyer: { size: [300, 197], parts: [["pose0", 3, 306, 222, 172, 18, 0], ["pose1", 300, 587, 131, 78, 93, 64], ["pose2", 401, 306, 300, 154, 0, 42]] },
      hat: { size: [170, 164], parts: [["body", 228, 306, 170, 164, 0, 0]] },
      web: { size: [250, 251], parts: [["body", 185, 3, 250, 251, 0, 0]] },
    },
    'nc-17': {
      atlas: [1024, 754],
      ghost: { size: [211, 300], parts: [["lantern", 550, 306, 42, 137, 169, 55, 22, 2], ["body", 3, 3, 198, 300, 0, 0]], glow: [190, 128, 52] },
      bat: { size: [240, 123], parts: [["wingL", 439, 503, 60, 91, 48, 5, 55, 53], ["wingL2", 502, 503, 62, 91, 0, 5, 55, 21, "wingL", 1], ["wingR", 749, 503, 59, 89, 134, 5, 5, 52], ["wingR2", 811, 503, 62, 89, 178, 5, 7, 21, "wingR", 1], ["body", 899, 306, 53, 123, 94, 0]] },
      batHang: { size: [56, 150], parts: [["body", 397, 306, 56, 150, 0, 0]] },
      spider: { size: [220, 190], parts: [["leg-l3", 876, 503, 68, 79, 20, 111, 40, 8], ["leg-l1", 303, 625, 76, 63, 13, 46, 58, 27], ["leg-l2", 333, 503, 52, 111, 48, 8, 32, 83], ["leg-l0", 567, 503, 88, 91, 0, 0, 81, 59], ["leg-r0", 658, 503, 88, 90, 132, 1, 7, 58], ["leg-r2", 388, 503, 48, 108, 123, 10, 17, 81], ["leg-r1", 382, 625, 73, 59, 135, 47, 16, 24], ["leg-r3", 947, 503, 68, 79, 133, 107, 26, 8], ["body", 817, 306, 79, 125, 71, 43]] },
      pumpkin: { size: [260, 344], parts: [["body", 204, 3, 260, 286, 0, 59], ["lid", 458, 625, 260, 59, 0, 0, 78, 59]], glow: [134, 185, 145] },
      cat: { size: [300, 202], parts: [["pelvis", 69, 625, 77, 68, 124, 50, 66, 37], ["pelvisFill", 229, 625, 71, 65, 119, 54, null, null, "pelvis", 1], ["tail0", 278, 705, 36, 38, 96, 52, 28, 16, "pelvis", 1], ["tail1", 317, 705, 31, 38, 71, 52, 29, 11, "tail0", 1], ["tail2", 351, 705, 31, 38, 47, 52, 29, 18, "tail1", 1], ["tail3", 385, 705, 31, 38, 22, 52, 29, 17, "tail2", 1], ["tail4", 419, 705, 28, 38, 0, 52, 26, 17, "tail3", 1], ["hf0", 721, 625, 51, 51, 77, 67, 19, 10, "pelvis", 1], ["hf1", 62, 705, 51, 45, 77, 105, 29, 5, "hf0", 1], ["hf2", 170, 705, 51, 43, 77, 137, 18, 5, "hf1", 1], ["chest", 149, 625, 77, 68, 178, 50, 12, 37, "pelvis", 0], ["chestFill", 3, 503, 110, 119, 190, 0, null, null, "chest", 1], ["ff0", 775, 625, 56, 51, 197, 97, 17, 12, "chest", 1], ["ff1", 947, 625, 56, 46, 197, 137, 27, 5, "ff0", 1], ["ff2", 450, 705, 56, 28, 197, 172, 27, 5, "ff1", 1], ["fn0", 834, 625, 56, 51, 204, 99, 17, 12, "chest", 0], ["fn1", 3, 705, 56, 46, 204, 139, 27, 5, "fn0", 1], ["fn2", 509, 705, 56, 28, 204, 174, 27, 5, "fn1", 1], ["head", 3, 625, 63, 77, 237, 0, 9, 58, "chest", 0], ["hn0", 893, 625, 51, 51, 84, 69, 19, 10, "pelvis", 0], ["hn1", 116, 705, 51, 45, 84, 107, 29, 5, "hn0", 1], ["hn2", 224, 705, 51, 43, 84, 139, 18, 5, "hn1", 1]] },
      catSit: { size: [159, 240], parts: [["tail", 456, 306, 91, 146, 68, 91, 2, 44], ["body", 720, 3, 99, 240, 0, 0]] },
      flyer: { size: [300, 194], parts: [["pose0", 3, 306, 218, 194, 21, 0], ["pose1", 116, 503, 214, 114, 86, 53], ["pose2", 595, 306, 219, 134, 0, 17]] },
      hat: { size: [170, 169], parts: [["body", 224, 306, 170, 169, 0, 0]] },
      web: { size: [250, 260], parts: [["body", 467, 3, 250, 260, 0, 0]] },
    },
  };
  // CSS pixels per image pixel, so every rating's characters come out the same size.
  const DISPLAY = { ghost: 0.52, bat: 0.38, batHang: 0.4, spider: 0.4, pumpkin: 0.46, cat: 0.44, catSit: 0.44, flyer: 0.44, hat: 1, web: 0.42 };
  // Candle and lantern light, per rating.
  const LIGHT = { g: '255, 214, 128', pg: '255, 196, 96', 'pg-13': '255, 178, 84', r: '196, 240, 96', 'nc-17': '255, 54, 32' };
  const INK = '#2a1f3d';
  const f1 = (n) => n.toFixed(1);
  const ART_NAMES = { ghost: 'ghost', bats: 'bat', bat: 'bat', spider: 'spider', pumpkin: 'pumpkin', cat: 'catSit', broom: 'flyer', costume: 'hat', hat: 'hat', web: 'web' };

  const assets = () => {
    try {
      return new URL(config.assets || 'halloween/', config.assets ? document.baseURI : script?.src || document.baseURI).href;
    } catch {
      return 'halloween/';
    }
  };
  const atlasUrl = (rated) => `${assets()}${rated}.webp`;

  // Fetches and decodes a rating's image once; everything waits for it.
  const atlases = {};
  const loaded = new Set();
  const ready = (rated) => loaded.has(rated);
  function loadAtlas(rated) {
    atlases[rated] ??= new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => {
        loaded.add(rated);
        resolve(img);
      });
      img.onerror = () => {
        delete atlases[rated];
        reject(new Error(`[Halloween mode] Can't load ${img.src}. Copy the halloween folder next to halloween.js, or point data-assets at it.`));
      };
      img.src = atlasUrl(rated);
    });
    return atlases[rated];
  }

  const pct = (n) => `${(n * 100).toFixed(3)}%`;
  const box = (el, x, y, w, h) => Object.assign(el.style, { position: 'absolute', left: pct(x), top: pct(y), right: 'auto', bottom: 'auto', width: pct(w), height: pct(h) });

  // A character as positioned parts, each showing its piece of the rating's image.
  // Sizes are percentages, so it fills whatever box it's put in. A part can hang
  // off another one (a forearm off an upper arm), so it turns with it, and can sit
  // behind it. bands: the lower half of the body as strips that sway like cloth.
  function sprite(kind, rated = config.rating, { bands = 0 } = {}) {
    const rig = RIGS[rated];
    const sp = rig[kind];
    const [W, H] = rig.atlas;
    const [w, h] = sp.size;
    const url = `url("${atlasUrl(rated)}")`;
    const el = document.createElement('div');
    el.className = `rig rig-${kind}`;
    Object.assign(el.style, { position: 'absolute', inset: '0' });
    el.parts = {};
    // A part with parts behind it shows its own piece in a layer above them.
    const under = new Set(sp.parts.filter((p) => p[10]).map((p) => p[9]));
    const paint = (node, ax, ay, aw, ah) => Object.assign(node.style, {
      backgroundImage: url,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${pct(W / aw)} ${pct(H / ah)}`,
      backgroundPosition: `${W === aw ? '0%' : pct(ax / (W - aw))} ${H === ah ? '0%' : pct(ay / (H - ah))}`,
    });
    const piece = (name, ax, ay, aw, ah, x, y, px = null, py = null, parent = null, behind = 0) => {
      const up = parent ? el.parts[parent] : null;
      const node = document.createElement('i');
      node.className = `part p-${name}`;
      const [ox, oy, ow, oh] = up ? [up.x, up.y, up.w, up.h] : [0, 0, w, h];
      box(node, (x - ox) / ow, (y - oy) / oh, aw / ow, ah / oh);
      if (px != null) node.style.transformOrigin = `${pct(px / aw)} ${pct(py / ah)}`;
      let skin = node;
      if (under.has(name)) {
        skin = document.createElement('i');
        skin.className = 'skin';
        Object.assign(skin.style, { position: 'absolute', inset: '0' });
        node.append(skin);
      }
      paint(skin, ax, ay, aw, ah);
      const host = up ? up.el : el;
      if (behind && up && up.skin !== up.el) host.insertBefore(node, up.skin);
      else host.append(node);
      if (/^pose[1-9]/.test(name)) node.style.opacity = '0';
      el.parts[name] = { el: node, skin, x, y, w: aw, h: ah, px, py };
      return node;
    };
    const light = (cls, [gx, gy, gr], into, ox = 0, oy = 0, ow = w, oh = h, strength = 0.5) => {
      const glow = document.createElement('i');
      glow.className = cls;
      box(glow, (gx - gr - ox) / ow, (gy - gr - oy) / oh, (2 * gr) / ow, (2 * gr) / oh);
      Object.assign(glow.style, { borderRadius: '50%', pointerEvents: 'none', background: `radial-gradient(closest-side, rgba(${LIGHT[rated]}, ${strength}), rgba(${LIGHT[rated]}, ${strength * 0.4}) 45%, rgba(${LIGHT[rated]}, 0))` });
      into.append(glow);
      return glow;
    };
    if (kind === 'pumpkin' && sp.glow) light('halo', [sp.glow[0], sp.glow[1], sp.glow[2] * 1.5], el, 0, 0, w, h, 0.3);
    for (const row of sp.parts) {
      const [name, ax, ay, aw, ah, x, y] = row;
      if (bands && name === 'body') {
        const split = Math.round(ah * 0.48);
        const step = (ah - split) / bands;
        piece('body', ax, ay, aw, split + 1, x, y);
        for (let i = 0; i < bands; i++) piece('band', ax, ay + split + i * step, aw, step + 1, x, y + split + i * step);
        continue;
      }
      const part = piece(...row);
      // The lantern carries its own light, so it swings with it.
      if (name === 'lantern' && sp.glow) {
        const [gx, gy, gr] = sp.glow;
        light('halo', [gx, gy, gr * 2.6], part, x, y, aw, ah, 0.22);
        light('glow', [gx, gy, gr * 1.1], part, x, y, aw, ah, 0.55);
      }
    }
    if (kind === 'pumpkin' && sp.glow) light('glow', sp.glow, el, 0, 0, w, h, 0.32);
    return el;
  }

  // The actor size for a sprite: [width, height, CSS px per image px].
  const sized = (kind, k = 1, rated = config.rating) => [...RIGS[rated][kind].size, DISPLAY[kind] * k];


  // The bat flying, and the same bat hanging by its feet, shown while it hangs.
  function batRigs(rated = config.rating) {
    const [fw, fh] = RIGS[rated].bat.size;
    const [hw, hh] = RIGS[rated].batHang.size;
    const k = DISPLAY.batHang / DISPLAY.bat;
    const hang = sprite('batHang', rated);
    box(hang, 0.5 - (hw * k) / fw / 2, 0, (hw * k) / fw, (hh * k) / fh);
    return [sprite('bat', rated), hang];
  }

  // The sitting cat is a drawing of its own, so it comes at its own scale: this makes it the
  // same cat as the one walking (matched by the head and the height).
  const SIT_SCALE = { g: 0.7, pg: 0.67, 'pg-13': 0.68, r: 0.62, 'nc-17': 0.8 };

  // The cat sitting, facing you: shown while it sits, in the walking cat's box.
  function sitRig(rated = config.rating) {
    const [ww, wh] = RIGS[rated].cat.size;
    const [sw, sh] = RIGS[rated].catSit.size;
    const k = (DISPLAY.catSit / DISPLAY.cat) * SIT_SCALE[rated];
    const sit = sprite('catSit', rated);
    box(sit, 0.5 - (sw * k) / ww / 2, 1 - (sh * k) / wh, (sw * k) / ww, (sh * k) / wh);
    return sit;
  }

  // How each rating's cat carries itself: speed (CSS px/s), stride time, paw lift,
  // tail raised (radians) and curled at the tip, how low it slinks, how it bobs.
  const CAT_STYLE = {
    g: { speed: 74, period: 0.62, lift: 0.1, tail: 1.2, curl: 0.55, low: 0, bob: 1.3, lash: 0.9 },
    pg: { speed: 82, period: 0.6, lift: 0.1, tail: 1.1, curl: 0.5, low: 0, bob: 1.1, lash: 1 },
    'pg-13': { speed: 80, period: 0.64, lift: 0.08, tail: 0.95, curl: 0.4, low: 0.02, bob: 0.9, lash: 0.9 },
    r: { speed: 72, period: 0.7, lift: 0.07, tail: 0.35, curl: 0.15, low: 0.05, bob: 0.7, lash: 1.5 },
    'nc-17': { speed: 58, period: 0.82, lift: 0.06, tail: 0.12, curl: -0.25, low: 0.09, bob: 0.5, lash: 0.7 },
  };
  // A cat's walk: hind paw, front paw on the same side, then the other side. Each
  // paw spends this share of a stride on the ground.
  const GAIT = { hn: 0, fn: 0.25, hf: 0.5, ff: 0.75 };
  const STANCE = 0.62;

  const turn = (p, a) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
  const about = (p, o, a) => {
    const r = turn({ x: p.x - o.x, y: p.y - o.y }, a);
    return { x: r.x + o.x, y: r.y + o.y };
  };

  // A pose part-way between two others.
  function mixPose(a, b, k) {
    const m = (p, q) => lerp(p ?? 0, q ?? 0, k);
    const paws = {};
    for (const [code, p] of Object.entries(b.paws)) {
      const q = a.paws?.[code] ?? p;
      paws[code] = { x: m(q.x, p.x), y: m(q.y, p.y), a: m(q.a, p.a) };
    }
    return { x: m(a.x, b.x), y: m(a.y, b.y), pitch: m(a.pitch, b.pitch), bend: m(a.bend, b.bend), head: m(a.head, b.head), tail: b.tail.map((v, i) => m(a.tail?.[i], v)), paws };
  }

  // The cat's skeleton, read from RIGS: a pelvis with the chest hanging off it at
  // the spine, the head off the chest, the tail off the pelvis, and legs of three
  // pieces. pose() places the body, then finds each knee and elbow so the paws
  // land where they're told (two-bone IK), and turns every part about its joint.
  class CatBody {
    constructor(rated) {
      this.el = sprite('cat', rated);
      const P = (this.P = this.el.parts);
      [this.W, this.H] = RIGS[rated].cat.size;
      const joint = (n) => ({ x: P[n].x + P[n].px, y: P[n].y + P[n].py });
      this.spine = joint('chest');
      this.legs = {};
      for (const code of ['hn', 'hf', 'fn', 'ff']) {
        const hip = joint(`${code}0`), knee = joint(`${code}1`), ankle = joint(`${code}2`);
        const foot = P[`${code}2`];
        const toe = { x: foot.x + foot.w * 0.5, y: foot.y + foot.h - 1 };
        this.legs[code] = {
          front: code[0] === 'f', hip, toe,
          l1: Math.hypot(knee.x - hip.x, knee.y - hip.y), l2: Math.hypot(ankle.x - knee.x, ankle.y - knee.y),
          a1: Math.atan2(knee.y - hip.y, knee.x - hip.x), a2: Math.atan2(ankle.y - knee.y, ankle.x - knee.x),
          foot: { x: toe.x - ankle.x, y: toe.y - ankle.y },
        };
      }
      this.ground = Math.max(...Object.values(this.legs).map((l) => l.toe.y));
    }

    // In the image's pixels, facing right. x, y: where the pelvis moves; pitch:
    // the whole body; bend: the chest against the pelvis; head; tail: five angles
    // down the chain; paws: where each toe goes, and how its paw turns (a).
    pose({ x = 0, y = 0, pitch = 0, bend = 0, head = 0, tail, paws }, k) {
      const P = this.P;
      const deg = (a) => (a * 57.29578).toFixed(2);
      const set = (name, css) => (P[name].el.style.transform = css);
      const pelvis = (p) => {
        const q = about(p, this.spine, pitch);
        return { x: q.x + x, y: q.y + y };
      };
      const chest = (p) => pelvis(about(p, this.spine, bend));
      set('pelvis', `translate(${(x * k).toFixed(2)}px, ${(y * k).toFixed(2)}px) rotate(${deg(pitch)}deg)`);
      set('chest', `rotate(${deg(bend)}deg)`);
      set('head', `rotate(${deg(head)}deg)`);
      tail.forEach((a, i) => set(`tail${i}`, `rotate(${deg(a)}deg)`));
      for (const [code, L] of Object.entries(this.legs)) {
        const want = paws[code];
        const parent = pitch + (L.front ? bend : 0);
        const root = L.front ? chest(L.hip) : pelvis(L.hip);
        const fa = want.a ?? 0;
        const fv = turn(L.foot, fa);
        const ax = want.x - fv.x, ay = want.y - fv.y;
        const dx = ax - root.x, dy = ay - root.y;
        const d = clamp(Math.hypot(dx, dy), Math.abs(L.l1 - L.l2) + 0.5, L.l1 + L.l2 - 0.5);
        const reach = Math.acos(clamp((L.l1 * L.l1 + d * d - L.l2 * L.l2) / (2 * L.l1 * d), -1, 1));
        // Elbows bend back, knees forward.
        const u1 = Math.atan2(dy, dx) + (L.front ? reach : -reach);
        const kx = root.x + L.l1 * Math.cos(u1), ky = root.y + L.l1 * Math.sin(u1);
        const u2 = Math.atan2(ay - ky, ax - kx);
        const d1 = u1 - L.a1, d2 = u2 - L.a2;
        set(`${code}0`, `rotate(${deg(d1 - parent)}deg)`);
        set(`${code}1`, `rotate(${deg(d2 - d1)}deg)`);
        set(`${code}2`, `rotate(${deg(fa - d2)}deg)`);
      }
    }
  }

  // The flyer: a broom, a witch or a raven. NC-17 sends three crows.
  function flyerRigs(rated = config.rating) {
    if (rated !== 'nc-17') return sprite('flyer', rated);
    return [[0, 0.02, 0.5, 1], [0.08, 0.48, 0.42, 2], [0.22, 0.08, 0.78, 0]].map(([x, y, size, beat]) => {
      const bird = sprite('flyer', rated);
      box(bird, x, y, size, size);
      if (beat) bird.classList.add(`beat-${beat}`);
      return bird;
    });
  }

  // Where something sits on a sprite, as fractions of its box: the middle of a part, or a fallback.
  function anchorOf(kind, name, fy = 0.5, rated = config.rating) {
    const sp = RIGS[rated][kind];
    const part = sp.parts.find((p) => p[0] === name);
    if (!part) return null;
    return { x: (part[5] + part[3] / 2) / sp.size[0], y: (part[6] + part[4] * fy) / sp.size[1] };
  }

  // Treats and other little things that burst out when a character is clicked.
  const CANDY = ['#ff8a1f', '#9a5cf0', '#6fd14f', '#ff6fa5', '#3fb7ff'];
  const CLASSIC = ['#f47b20', '#17121c', '#6b3fa0', '#f47b20'];
  const wrapped = (c) => `<svg viewBox="0 0 24 24"><path d="M2.5,7.5 L8,10.6 L8,13.4 L2.5,16.5 Z M21.5,7.5 L16,10.6 L16,13.4 L21.5,16.5 Z" fill="${c}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="12" cy="12" rx="5.6" ry="4.7" fill="${c}" stroke="${INK}" stroke-width="1.2"/><path d="M9,10.4 Q12,8.9 15,10.4" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".85"/></svg>`;
  const candyCorn = `<svg viewBox="0 0 24 24"><path d="M12,2.5 C14.6,7 17.8,14 19,19.5 C14.5,21.6 9.5,21.6 5,19.5 C6.2,14 9.4,7 12,2.5 Z" fill="#ffd43b"/><path d="M8.3,10.6 C10.6,11.4 13.4,11.4 15.7,10.6 L17.6,16 C14,17.2 10,17.2 6.4,16 Z" fill="#ff8c1a"/><path d="M12,2.5 C13.2,4.6 14.4,7.2 15.3,9.6 C13.1,10.2 10.9,10.2 8.7,9.6 C9.6,7.2 10.8,4.6 12,2.5 Z" fill="#fff8e6"/><path d="M12,2.5 C14.6,7 17.8,14 19,19.5 C14.5,21.6 9.5,21.6 5,19.5 C6.2,14 9.4,7 12,2.5 Z" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  const star = (c) => `<svg viewBox="0 0 24 24"><path d="M12,2 L14.6,8.6 L21.6,9 L16.2,13.5 L18,20.4 L12,16.6 L6,20.4 L7.8,13.5 L2.4,9 L9.4,8.6 Z" fill="${c}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  const lollipop = (c) => `<svg viewBox="0 0 24 24"><path d="M12,14.5 V22.5" stroke="#f3e9d2" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="8.5" r="6.5" fill="${c}" stroke="${INK}" stroke-width="1.2"/><path d="M12,8.5 C12,7 14,7 14,8.5 C14,10.5 10.5,10.6 10.2,8.3 C10,5.6 15.2,5.2 15.6,8.6" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".9"/></svg>`;
  const TREATS = {
    candy: [() => wrapped(pick(CANDY)), () => candyCorn, () => star('#ffd25e'), () => lollipop(pick(CANDY))],
    classic: [() => wrapped(pick(CLASSIC)), () => candyCorn, () => candyCorn, () => star('#ffc93c')],
  };
  const MOTH = '<svg viewBox="0 0 24 18"><g class="hw-moth"><path d="M12,9 C8,2 2,2 1.5,6 C1,10 7,11 12,9 Z M12,9 C16,2 22,2 22.5,6 C23,10 17,11 12,9 Z" fill="#d8ccb4"/><path d="M12,9 C9,12 5,16 3.5,13 C3,11 8,10 12,9 Z M12,9 C15,12 19,16 20.5,13 C21,11 16,10 12,9 Z" fill="#c2b496"/></g><ellipse cx="12" cy="9.5" rx="1.2" ry="4" fill="#5a4e3c"/></svg>';
  const MINI_BAT = '<svg viewBox="0 0 30 14"><g class="hw-flit"><path d="M15,6 C13,3 9,1 4,2 C6,3.5 6,5 5,6.5 C8,6 10,7 11,9 C12,8 14,8 15,9 C16,8 18,8 19,9 C20,7 22,6 25,6.5 C24,5 24,3.5 26,2 C21,1 17,3 15,6 Z" fill="#060507"/></g><circle cx="14" cy="5.4" r=".7" fill="#ff2a2a"/><circle cx="16" cy="5.4" r=".7" fill="#ff2a2a"/></svg>';

  // ---------------------------------------------------------------------------
  // Styles, inside shadow roots so they never touch the page (and vice versa).

  const GRAIN =
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

  const CSS = `
* { box-sizing: border-box; }
.stage, .layer, .ambience, .ambience > div { position: absolute; inset: 0; pointer-events: none; }
.ambience > div { opacity: 0; transition: opacity 1.8s ease; }
.vignette { background: radial-gradient(130% 100% at 50% 42%, rgba(10, 14, 8, 0) 52%, rgba(10, 14, 8, .4) 100%); }
.stage[data-rating="nc-17"] .vignette { background: radial-gradient(130% 100% at 50% 42%, rgba(30, 0, 4, 0) 48%, rgba(30, 0, 4, .5) 100%); }
.ambience > .mist { top: auto; height: 36vh; background:
  radial-gradient(48% 70% at 18% 100%, rgba(232, 228, 246, .34), transparent 72%),
  radial-gradient(42% 60% at 52% 100%, rgba(232, 228, 246, .26), transparent 72%),
  radial-gradient(46% 70% at 86% 100%, rgba(232, 228, 246, .32), transparent 72%); animation: hw-mist 16s ease-in-out infinite alternate; }
.stage[data-rating="r"] .mist { filter: hue-rotate(40deg) saturate(.6); }
.stage[data-rating="nc-17"] .mist { filter: grayscale(1) brightness(.75); }
@keyframes hw-mist { from { transform: translateX(-5%); } to { transform: translateX(5%); } }
.grain { background-image: ${GRAIN}; animation: hw-grain .6s steps(3) infinite; }
@keyframes hw-grain { 0% { background-position: 0 0; } 33% { background-position: -60px 40px; } 66% { background-position: 50px -30px; } }
.mood[data-rating="pg-13"] .mist, .mood[data-rating="r"] .mist, .mood[data-rating="r"] .vignette,
.mood[data-rating="nc-17"] .mist, .mood[data-rating="nc-17"] .vignette { opacity: 1; }
.mood[data-rating="nc-17"] .grain { opacity: .1; }
.flicker .vignette { animation: hw-flicker .7s steps(1) 1; }
@keyframes hw-flicker { 0% { opacity: 1; } 20% { opacity: .2; } 40% { opacity: 1; } 60% { opacity: .5; } 100% { opacity: 1; } }

.actor { position: absolute; left: 0; top: 0; pointer-events: auto; cursor: pointer; will-change: transform, opacity; -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.actor.leaving, .actor.web { pointer-events: none; }
.rig { filter: drop-shadow(0 6px 5px rgba(22, 10, 48, .24)); }
.part { position: absolute; display: block; }
.actor.web { margin: 0 !important; transform-origin: 0 0; }
.actor.web > .rig { filter: drop-shadow(0 0 1px rgba(0, 0, 0, .45)); }
.cat > .rig-catSit { opacity: 0; transition: opacity .18s; }
.cat.sitting > .rig-cat { opacity: 0; transition: opacity .18s; }
.cat.sitting > .rig-catSit { opacity: 1; }
.bat > .rig-batHang, .bat.hanging > .rig-bat { display: none; }
.bat.hanging > .rig-batHang { display: block; }
.silk { position: absolute; left: calc(50% - 1px); width: 2px; height: 0; pointer-events: none; background: linear-gradient(90deg, rgba(255, 255, 255, .8) 50%, rgba(70, 54, 104, .55) 50%); }
.glow { mix-blend-mode: screen; }

.rig-bat .p-wingL { animation: hw-flap-l .26s ease-in-out infinite; }
.rig-bat .p-wingR { animation: hw-flap-r .26s ease-in-out infinite; }
/* A bat's wing beats from the shoulder; the hand trails on the way down and folds on the way up. */
.rig-bat .p-wingL2 { animation: hw-hand-l .26s linear infinite; }
.rig-bat .p-wingR2 { animation: hw-hand-r .26s linear infinite; }
@keyframes hw-flap-l {
  0% { transform: rotate(28deg) scaleY(.84); animation-timing-function: cubic-bezier(.45, 0, .7, 1); }
  40% { transform: rotate(-24deg) scaleY(.8); animation-timing-function: cubic-bezier(.3, 0, .55, 1); }
  100% { transform: rotate(28deg) scaleY(.84); }
}
@keyframes hw-flap-r {
  0% { transform: rotate(-28deg) scaleY(.84); animation-timing-function: cubic-bezier(.45, 0, .7, 1); }
  40% { transform: rotate(24deg) scaleY(.8); animation-timing-function: cubic-bezier(.3, 0, .55, 1); }
  100% { transform: rotate(-28deg) scaleY(.84); }
}
@keyframes hw-hand-l { 0%, 100% { transform: rotate(-6deg); } 20% { transform: rotate(16deg); } 40% { transform: rotate(-4deg); } 64% { transform: rotate(-42deg); } 86% { transform: rotate(-20deg); } }
@keyframes hw-hand-r { 0%, 100% { transform: rotate(6deg); } 20% { transform: rotate(-16deg); } 40% { transform: rotate(4deg); } 64% { transform: rotate(42deg); } 86% { transform: rotate(20deg); } }
.stage[data-rating="nc-17"] .rig-bat .part { animation-duration: .17s; }
/* A bird beats its wings in three drawn poses, up, level, down and level again,
   rising a little on each downstroke. */
.rig-flyer { --beat: 0s; animation: hw-bob .48s ease-in-out infinite; animation-delay: var(--beat); }
.rig-flyer .p-pose0, .rig-flyer .p-pose1, .rig-flyer .p-pose2 { animation: .48s step-end infinite; animation-delay: var(--beat); }
.rig-flyer .p-pose0 { animation-name: hw-pose0; }
.rig-flyer .p-pose1 { animation-name: hw-pose1; }
.rig-flyer .p-pose2 { animation-name: hw-pose2; }
.beat-1 { --beat: -.16s; }
.beat-2 { --beat: -.32s; }
@keyframes hw-pose0 { 0% { opacity: 1; } 25% { opacity: 0; } }
@keyframes hw-pose1 { 0% { opacity: 0; } 25% { opacity: 1; } 50% { opacity: 0; } 75% { opacity: 1; } }
@keyframes hw-pose2 { 0% { opacity: 0; } 50% { opacity: 1; } 75% { opacity: 0; } }
@keyframes hw-bob { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-3%); } }

.rig-spider [class*="p-leg-"] { animation: hw-wiggle 1.4s ease-in-out infinite; }
.stage[data-rating="nc-17"] .rig-spider [class*="p-leg-"] { animation-duration: .55s; }
.rig-spider .p-leg-l1, .rig-spider .p-leg-r2 { animation-delay: -.35s; }
.rig-spider .p-leg-l2, .rig-spider .p-leg-r3 { animation-delay: -.7s; }
.rig-spider .p-leg-l3, .rig-spider .p-leg-r0 { animation-delay: -1.05s; }
.climbing .rig-spider [class*="p-leg-"] { animation-duration: .32s; }
@keyframes hw-wiggle { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(6deg); } }

.rig-catSit .p-tail { animation: hw-tail 2.6s ease-in-out infinite; }
.hover .rig-catSit .p-tail { animation-duration: .9s; }
@keyframes hw-tail { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(7deg); } }

.waving > .rig { transform-origin: 50% 90%; animation: hw-wobble .36s ease-in-out 5 alternate; }
@keyframes hw-wobble { from { transform: rotate(-7deg); } to { transform: rotate(7deg); } }
.rig-pumpkin .p-lid { transition: transform .45s cubic-bezier(.3, 1.6, .5, 1); }
.pop .rig-pumpkin .p-lid { transform: translate(-4%, -32%) rotate(-16deg); }

.hint, .bubble { position: absolute; left: 0; top: 0; color: #1f1830; font-family: inherit; background: #fff; will-change: transform, opacity; }
.hint { padding: 7px 11px 8px; border-radius: 12px; font-size: 13.5px; line-height: 1.3; font-weight: 600; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .15s;
  box-shadow: 0 6px 18px rgba(30, 15, 60, .22), 0 0 0 1px rgba(30, 15, 60, .07); }
.hint.on { opacity: 1; }
.hint small { display: block; margin-top: 1px; color: #e8650a; font-size: 11.5px; font-weight: 700; letter-spacing: .02em; }
.bubble { width: max-content; max-width: min(268px, calc(100vw - 32px)); padding: 12px 34px 14px 16px; border-radius: 18px; font-size: 15px; line-height: 1.42; cursor: pointer; pointer-events: auto; opacity: 0;
  box-shadow: 0 16px 36px rgba(26, 12, 56, .26), 0 2px 6px rgba(26, 12, 56, .1), 0 0 0 1px rgba(26, 12, 56, .06); }
.bubble.gone { pointer-events: none; }
.bubble::after { content: ''; position: absolute; bottom: 18px; width: 16px; height: 16px; background: inherit; border-radius: 3px; transform: rotate(45deg); }
.bubble.left::after { right: -6px; }
.bubble.right::after { left: -6px; }
.bubble p { margin: 0; }
.bubble .text { min-height: 1.42em; }
.bubble .ask { display: inline-flex; align-items: center; gap: 7px; margin-top: 11px; padding: 7px 14px 8px; border-radius: 999px; background: #ff7a1a; color: #fff; font-size: 14px; font-weight: 700; line-height: 1.2; box-shadow: 0 3px 0 #cf5800; transition: transform .12s, box-shadow .12s; }
.bubble:hover .ask { transform: translateY(-1px); box-shadow: 0 4px 0 #cf5800; }
.bubble .close { position: absolute; top: 7px; right: 7px; display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: #a497ba; font: inherit; font-size: 19px; line-height: 1; cursor: pointer; }
.bubble .close:hover { background: rgba(120, 100, 160, .12); color: #4b3e66; }
.typing { display: inline-flex; gap: 4px; padding: 6px 0 2px; }
.typing i { width: 7px; height: 7px; border-radius: 50%; background: #c4b9da; animation: hw-dot 1s ease-in-out infinite; }
.typing i:nth-child(2) { animation-delay: .15s; }
.typing i:nth-child(3) { animation-delay: .3s; }
@keyframes hw-dot { 0%, 100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-4px); opacity: 1; } }

.stage[data-rating="pg"] .bubble, .stage[data-rating="pg"] .hint { background: #fff6e4; color: #17121c; box-shadow: 0 0 0 2.5px #17121c, 5px 5px 0 2.5px #17121c; }
.stage[data-rating="pg"] .bubble { font-weight: 600; }
.stage[data-rating="pg"] .bubble .ask { color: #17121c; background: #f47b20; box-shadow: 0 0 0 2px #17121c, 3px 3px 0 2px #17121c; text-transform: uppercase; letter-spacing: .05em; font-size: 12.5px; font-weight: 800; }
.stage[data-rating="pg"] .bubble:hover .ask { box-shadow: 0 0 0 2px #17121c, 4px 4px 0 2px #17121c; }
.stage[data-rating="pg"] .hint small { color: #c54f00; }
.stage[data-rating="pg-13"] .bubble, .stage[data-rating="pg-13"] .hint { background: rgba(18, 13, 30, .95); color: #efe9ff; box-shadow: 0 16px 40px rgba(0, 0, 0, .45), 0 0 0 1px rgba(255, 255, 255, .12), 0 0 32px rgba(255, 170, 80, .14); }
.stage[data-rating="pg-13"] .bubble .ask { background: transparent; color: #ffb347; box-shadow: inset 0 0 0 1.5px #ffb347; }
.stage[data-rating="pg-13"] .bubble:hover .ask { box-shadow: inset 0 0 0 1.5px #ffb347, 0 0 16px rgba(255, 179, 71, .35); transform: none; }
.stage[data-rating="pg-13"] .hint small { color: #ffb347; }
.stage[data-rating="pg-13"] .typing i { background: #6d5f8f; }
.stage[data-rating="r"] .bubble, .stage[data-rating="r"] .hint { background: #11140f; color: #e3e8d9; border-radius: 6px 18px 8px 16px; font-family: Georgia, 'Times New Roman', serif; box-shadow: 0 18px 40px rgba(0, 0, 0, .5), 0 0 0 1px rgba(182, 240, 90, .2); }
.stage[data-rating="r"] .bubble .text { font-style: italic; }
.stage[data-rating="r"] .bubble .ask { background: transparent; color: #b6f05a; box-shadow: inset 0 0 0 1.5px #b6f05a; border-radius: 4px; }
.stage[data-rating="r"] .bubble:hover .ask { box-shadow: inset 0 0 0 1.5px #b6f05a, 0 0 18px rgba(182, 240, 90, .3); transform: none; }
.stage[data-rating="r"] .hint small { color: #b6f05a; }
.stage[data-rating="r"] .typing i { background: #5d6b4d; }
.stage[data-rating="nc-17"] .bubble, .stage[data-rating="nc-17"] .hint { background: #070506; color: #f2efe8; border-radius: 2px; font-family: 'Courier New', Courier, monospace; box-shadow: 0 0 0 1px #4a0a10, 0 20px 50px rgba(0, 0, 0, .6), 0 0 40px rgba(208, 16, 30, .2); }
.stage[data-rating="nc-17"] .bubble .ask { border-radius: 0; background: transparent; color: #ff2a2a; box-shadow: inset 0 0 0 1.5px #ff2a2a; text-transform: uppercase; letter-spacing: .12em; font-size: 12.5px; }
.stage[data-rating="nc-17"] .bubble:hover .ask { background: rgba(255, 42, 42, .12); transform: none; box-shadow: inset 0 0 0 1.5px #ff2a2a; }
.stage[data-rating="nc-17"] .hint small { color: #ff2a2a; letter-spacing: .06em; }
.stage[data-rating="nc-17"] .typing i { background: #5a1418; }
.stage:not([data-rating="g"]) .bubble .close:hover { background: rgba(255, 255, 255, .1); color: inherit; }
.stage[data-rating="pg"] .bubble .close:hover { background: rgba(0, 0, 0, .08); }

.treat, .puff, .spark, .float, .ember, .moth, .minibat { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform, opacity; }
.treat { width: 22px; height: 22px; }
.treat svg, .moth svg, .minibat svg { display: block; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 2px 2px rgba(22, 10, 48, .25)); }
.ember { width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; border-radius: 50%; background: radial-gradient(circle, #fff6d0 0, #ffb347 45%, rgba(255, 122, 26, 0) 72%); }
.moth { width: 22px; height: 17px; margin: -8px 0 0 -11px; }
.hw-moth { transform-origin: 50% 50%; animation: hw-moth .09s linear infinite alternate; }
@keyframes hw-moth { to { transform: scaleX(.3); } }
.minibat { width: 26px; height: 12px; margin: -6px 0 0 -13px; }
.hw-flit { transform-origin: 50% 60%; animation: hw-flit .12s linear infinite alternate; }
@keyframes hw-flit { to { transform: scaleY(-.6); } }
.puff { width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; background: radial-gradient(circle at 40% 38%, #fff 0, #f1ecff 55%, rgba(241, 236, 255, 0) 72%); }
.puff.smoke { background: radial-gradient(circle at 45% 40%, rgba(90, 84, 88, .5) 0, rgba(60, 55, 58, .35) 50%, rgba(40, 36, 38, 0) 72%); }
.spark { width: 12px; height: 12px; margin: -6px 0 0 -6px; background: #ffd25e; clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); }
.spark.red { background: #ff3a2a; }
.float { margin: -10px 0 0 -6px; color: #a796d6; font: 800 15px/1 ui-rounded, system-ui, sans-serif; }
.float.heart { color: #ff5c8a; font-size: 18px; }

.hat { position: absolute; left: 0; top: 0; opacity: 0; transform-origin: 50% 83%; transition: transform .25s ease, opacity .25s; pointer-events: none; }
.hat.on { opacity: 1; }
.hat .rig { filter: drop-shadow(0 3px 3px rgba(22, 10, 48, .3)); }
.hat.on .rig { animation: hw-land .8s cubic-bezier(.25, 1.5, .5, 1) both; }
.hat.off { opacity: 0; transition: opacity .5s ease .25s; }
.hat.off .rig { animation: hw-fly-off .8s ease-in both; }
@keyframes hw-land { from { transform: translateY(-46px) rotate(-30deg); } to { transform: none; } }
@keyframes hw-fly-off { to { transform: translate(-30px, -90px) rotate(-60deg); } }

@media (prefers-reduced-motion: reduce) {
  .part, .rig, .typing i, .hat .rig, .mist, .grain { animation: none !important; }
}
@media print { :host { display: none !important; } }
`;
  let sheetCache = null;

  function createHost(tag, zIndex) {
    const host = document.createElement(tag);
    const styles = {
      position: 'fixed', inset: '0', 'z-index': String(zIndex), display: 'block', margin: '0', padding: '0', border: '0',
      background: 'none', overflow: 'hidden', 'pointer-events': 'none', contain: 'strict', 'font-size': '16px',
    };
    for (const [property, value] of Object.entries(styles)) host.style.setProperty(property, value, 'important');
    host.setAttribute('aria-hidden', 'true');
    const root = host.attachShadow({ mode: 'open' });
    try {
      sheetCache ??= new CSSStyleSheet();
      if (!sheetCache.cssRules.length) sheetCache.replaceSync(CSS);
      root.adoptedStyleSheets = [sheetCache];
    } catch {
      const style = document.createElement('style');
      style.textContent = CSS;
      root.append(style);
    }
    return { host, root };
  }

  // ---------------------------------------------------------------------------
  // State shared by everything below.

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    running: false,
    stopped: false,
    chatOpen: false,
    still: reducedMotion.matches,
    lastActivity: now(),
    ghost: null,
    ghostVisits: 0,
    ghostLeftAt: -Infinity,
    dismissed: readDismissed(),
    lastKind: '',
    lastBroom: -Infinity,
  };
  const pointer = { x: 0, y: 0, seen: false, since: 0 };
  let stage = null;

  reducedMotion.addEventListener?.('change', () => (state.still = reducedMotion.matches));

  function readDismissed() {
    try {
      return Number(sessionStorage.getItem('stand-halloween-dismissed')) > Date.now() - 30 * 60e3;
    } catch {
      return false;
    }
  }

  const narrow = () => (stage?.w ?? innerWidth) < 640;
  const scale = () => config.size * (narrow() ? 0.78 : 1);
  const resolveX = (value) => (value == null ? null : value >= 0 && value <= 1 ? value * stage.w : Number(value));
  const resolveY = (value) => (value == null ? null : value >= 0 && value <= 1 ? value * stage.h : Number(value));

  // ---------------------------------------------------------------------------
  // The stage: one fixed, click-through layer under Stand's widget, and one
  // animation loop that sleeps whenever nobody is on it.

  class Stage {
    constructor() {
      const { host, root } = createHost('stand-halloween', config.zIndex);
      root.innerHTML =
        '<div class="stage"><div class="ambience"><div class="vignette"></div><div class="mist"></div><div class="grain"></div></div>' +
        '<div class="layer webs"></div><div class="layer creatures"></div><div class="layer fx"></div></div>';
      this.host = host;
      this.root = root.querySelector('.stage');
      this.webs = root.querySelector('.webs');
      this.creatures = root.querySelector('.creatures');
      this.fx = root.querySelector('.fx');
      this.actors = new Set();
      this.followers = new Set();
      this.raf = 0;
      this.last = 0;
      this.frame = this.frame.bind(this);
      this.measure = () => {
        this.w = document.documentElement.clientWidth || innerWidth;
        this.h = innerHeight;
      };
      this.measure();
      this.rate(config.rating);
      addEventListener('resize', this.measure, { passive: true });
      // Speech bubbles borrow the font of the page's own text.
      const text = document.querySelector('main p, article p, p') ?? document.body;
      host.style.setProperty('font-family', getComputedStyle(text).fontFamily, 'important');
      document.body.append(host);
    }

    rate(value) {
      this.root.dataset.rating = value;
    }

    add(actor) {
      this.actors.add(actor);
      (actor.kind === 'web' ? this.webs : this.creatures).append(actor.el);
      actor.tick(0);
      actor.render();
      this.wake();
      return actor;
    }

    wake() {
      if (this.raf || document.hidden) return;
      this.last = now();
      this.raf = requestAnimationFrame(this.frame);
    }

    frame(time) {
      const dt = Math.min(0.05, Math.max(0, (time - this.last) / 1000));
      this.last = time;
      for (const actor of this.actors) {
        if (actor.tick(dt)) actor.render();
        else this.remove(actor);
      }
      for (const follower of this.followers) follower.update(dt);
      const ghost = state.ghost;
      this.root.classList.toggle('mood', Boolean(look().mood && ghost && !ghost.leaving && !state.still));
      // Cobwebs alone don't need the loop: it rests until someone moves or the page scrolls.
      const busy = this.followers.size || [...this.actors].some((a) => a.kind !== 'web' || a.phase !== 'hold');
      this.raf = busy ? requestAnimationFrame(this.frame) : 0;
    }

    remove(actor) {
      this.actors.delete(actor);
      actor.el.remove();
      actor.removed?.();
    }

    destroy() {
      cancelAnimationFrame(this.raf);
      removeEventListener('resize', this.measure);
      this.host.remove();
    }
  }

  // ---------------------------------------------------------------------------
  // The page itself. Characters sit on the top edges of cards, images and
  // buttons, hang from the bottoms of bars and headings, peek over boxes, and
  // leave cobwebs in their corners. data-halloween on an element steers them:
  // "perch", "hang", "peek", "web" (or "web-left", "web-right"), and "none" to
  // keep everything off it and its children.

  const MARK = 'data-halloween';
  const OURS = new Set(['stand-halloween', 'stand-halloween-costume', 'stand-chat']);
  const marked = (el, token) => (el.getAttribute?.(MARK) ?? '').toLowerCase().split(/\s+/).includes(token);
  const alphaOf = (color) => {
    const parts = String(color).match(/rgba?\(([^)]+)\)/)?.[1].split(/[\s,/]+/).filter(Boolean);
    return parts ? (parts.length > 3 ? parseFloat(parts[3]) : 1) : color === 'transparent' ? 0 : 1;
  };

  function backdrop(el) {
    for (; el && el !== document.documentElement; el = el.parentElement) {
      const color = getComputedStyle(el).backgroundColor;
      if (alphaOf(color) > 0.5) return color;
    }
    return 'rgb(255, 255, 255)';
  }

  // Does it have an edge you can see? A border, a shadow, an image, or a
  // background that differs from what's behind it.
  function painted(el, style) {
    if (parseFloat(style.borderTopWidth) > 0.5 && style.borderTopStyle !== 'none' && alphaOf(style.borderTopColor) > 0.15) return true;
    if (style.boxShadow && style.boxShadow !== 'none') return true;
    if (style.backgroundImage && style.backgroundImage !== 'none') return true;
    if (alphaOf(style.backgroundColor) < 0.5) return false;
    return backdrop(el.parentElement) !== style.backgroundColor;
  }

  function describe(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 70 || r.height < 16) return null;
    if (el.closest(`[${MARK}~="none"], dialog, [role="dialog"], [aria-modal="true"]`)) return null;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || Number(style.opacity) < 0.3) return null;
    const media = /^(img|picture|video|canvas|svg|iframe)$/.test(el.localName);
    const control = el.matches('button, input[type="submit"], input[type="button"], [role="button"], a[class*="btn"], a[class*="button"]');
    const heading = /^h[1-3]$/.test(el.localName);
    const bar = el.matches('header, nav, [role="banner"], [role="navigation"]') || style.position === 'fixed' || style.position === 'sticky';
    const solid = media || control || painted(el, style);
    const huge = r.width > stage.w * 0.94 && r.height > stage.h * 0.45;
    return { el, r, media, control, heading, bar, solid, huge };
  }

  // What's on screen right now, found by sampling what lies under a grid of points.
  function onScreen() {
    const seen = new Set();
    const boxes = [];
    const add = (el) => {
      for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        if (seen.has(el)) return;
        seen.add(el);
        if (OURS.has(el.localName)) return;
        const box = describe(el);
        if (box) boxes.push(box);
      }
    };
    for (const el of document.querySelectorAll(`[${MARK}]`)) add(el);
    for (let x = 0.05; x < 1; x += 0.1) {
      for (let y = 0.06; y < 1; y += 0.11) for (const el of document.elementsFromPoint(x * stage.w, y * stage.h)) add(el);
    }
    return boxes;
  }

  // Is this element what you'd actually see at that point, not something on top of it?
  const showing = (el, x, y) => {
    const top = document.elementFromPoint(clamp(x, 1, stage.w - 1), clamp(y, 1, stage.h - 1));
    return Boolean(top && (top === el || el.contains(top)));
  };

  // Whether another character already settled on this element, about here.
  const settled = (el, x, width) =>
    [...stage.actors].some((a) => a.perch?.el === el && !a.leaving && Math.abs(a.perch.r.left + a.perch.dx - x) < (width + a.w) / 2 + 20);

  // A top edge to stand on (the cat) or peek over (the pumpkin, the ghost), with
  // nothing to read or click right above it. Only the cat sits on buttons.
  function findLedge(width, height, { solidOnly = false, token = 'perch', controls = false } = {}) {
    if (config.perch === 'off' || !stage) return null;
    const H = stage.h;
    let best = null;
    for (const box of onScreen()) {
      const { r } = box;
      const asked = marked(box.el, token) || marked(box.el, 'perch');
      if (!asked && (config.perch !== 'auto' || box.huge || box.bar || !(box.solid || (!solidOnly && box.heading)))) continue;
      if (!asked && box.control && !controls) continue;
      if (r.width < width * 1.15 || r.top < H * 0.14 + height * 0.5 || r.top > H - 30) continue;
      const left = Math.max(r.left, 0) + width * 0.55;
      const right = Math.min(r.right, stage.w) - width * 0.55;
      if (right <= left) continue;
      const x = rand(left, right);
      if (!showing(box.el, x, r.top + 3) || settled(box.el, x, width)) continue;
      let score = crowded(x, r.top - height / 2, width, height) + Math.random() * 0.8;
      score -= asked ? 20 : box.media ? 1.2 : box.control ? 0.8 : box.solid ? 0.6 : 0;
      if (!best || score < best.score) best = { box, x, score };
    }
    return best && best.score < 5 ? { el: best.box.el, dx: best.x - best.box.r.left, r: best.box.r } : null;
  }

  // A bottom edge to hang from (spiders, bats), with room below.
  function findCeiling(width, depth) {
    if (config.perch === 'off' || !stage) return null;
    const H = stage.h;
    let best = null;
    for (const box of onScreen()) {
      const { r } = box;
      const asked = marked(box.el, 'hang');
      if (!asked && (config.perch !== 'auto' || box.huge || !(box.solid || box.heading || box.bar))) continue;
      if (r.width < width * 1.3 || r.bottom < H * 0.05 || r.bottom > H * 0.55) continue;
      const left = Math.max(r.left, 0) + width * 0.6;
      const right = Math.min(r.right, stage.w) - width * 0.6;
      if (right <= left) continue;
      const x = rand(left, right);
      if (!showing(box.el, x, r.bottom - 3) || settled(box.el, x, width)) continue;
      let score = crowded(x, r.bottom + depth / 2, width, depth) + Math.random() * 0.8;
      score -= asked ? 20 : box.bar ? 1.4 : box.media ? 1 : box.solid ? 0.6 : 0.2;
      if (!best || score < best.score) best = { box, x, score };
    }
    return best && best.score < 5 ? { el: best.box.el, dx: best.x - best.box.r.left, r: best.box.r } : null;
  }

  // A corner for a cobweb: cards and images, not buttons or bars.
  function findCorner(size) {
    if (config.perch === 'off' || !stage) return null;
    const H = stage.h;
    const taken = new Set([...stage.actors].filter((a) => a.kind === 'web').map((a) => a.perch.el));
    let best = null;
    for (const box of onScreen()) {
      const { r, el } = box;
      if (taken.has(el)) continue;
      const asked = marked(el, 'web') || marked(el, 'web-left') || marked(el, 'web-right');
      if (!asked && (config.perch !== 'auto' || box.huge || box.bar || box.control || !box.solid)) continue;
      if (r.width < size * 1.8 || r.height < size * 1.3 || r.top < H * 0.04 || r.top > H * 0.8) continue;
      const sides = marked(el, 'web-left') ? ['left'] : marked(el, 'web-right') ? ['right'] : Math.random() < 0.5 ? ['left', 'right'] : ['right', 'left'];
      for (const side of sides) {
        const x = side === 'left' ? r.left : r.right;
        if (x < 4 || x > stage.w - 4 || !showing(el, x + (side === 'left' ? 6 : -6), r.top + 6)) continue;
        const score = (asked ? -20 : box.media ? -1 : 0) + Math.random();
        if (!best || score < best.score) best = { el, side, score, r };
        break;
      }
    }
    return best ? { el: best.el, side: best.side, dx: best.side === 'left' ? 0 : best.r.width, r: best.r } : null;
  }

  // Follows a perch as the page scrolls and reflows. Null once it's gone.
  function follow(perch) {
    if (!perch?.el.isConnected) return null;
    const r = perch.el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    perch.r = r;
    return r;
  }

  // Hides whatever part of an actor is past an edge, so it seems to be behind
  // the element: below its top edge ("bottom") or above its bottom edge ("top").
  function clipAt(actor, edgeY, side) {
    if (edgeY == null) return void (actor.el.style.clipPath = '');
    const s = Math.abs(actor.sy) || 1;
    const local = actor.h / 2 + (edgeY - actor.y) / s;
    actor.el.style.clipPath = side === 'bottom'
      ? `inset(-80% -80% ${f1(Math.max(0, actor.h - local))}px -80%)`
      : `inset(${f1(Math.max(0, local))}px -80% -80% -80%)`;
  }

  // ---------------------------------------------------------------------------
  // Characters

  class Actor {
    constructor(kind, className, [width, height, size], content) {
      const k = size * scale();
      this.kind = kind;
      this.w = width * k;
      this.h = height * k;
      this.el = document.createElement('div');
      this.el.className = `actor ${className}`;
      Object.assign(this.el.style, {
        width: `${this.w}px`, height: `${this.h}px`, marginLeft: `${-this.w / 2}px`, marginTop: `${-this.h / 2}px`, opacity: '0',
      });
      this.el.append(...[content].flat());
      this.x = -1e4;
      this.y = -1e4;
      this.rot = 0;
      this.sx = 1;
      this.sy = 1;
      this.alpha = 1;
      this.age = 0;
      this.t = 0;
      this.phase = '';
    }

    go(phase) {
      this.phase = phase;
      this.t = 0;
    }

    tick(dt) {
      this.age += dt;
      this.t += dt;
      return this.step(dt) !== false;
    }

    render() {
      this.el.style.transform =
        `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0) rotate(${this.rot.toFixed(4)}rad) ` +
        `scale(${this.sx.toFixed(3)}, ${this.sy.toFixed(3)})`;
      this.el.style.opacity = this.alpha.toFixed(3);
    }
  }

  class Creature extends Actor {
    constructor(kind, className, size, html) {
      super(kind, className, size, html);
      this.rating = config.rating;
      this.greeting = greetingFor(kind);
      this.hovered = false;
      this.el.addEventListener('pointerenter', (event) => event.pointerType !== 'touch' && this.hover(true));
      this.el.addEventListener('pointerleave', () => this.hover(false));
      this.el.addEventListener('click', (event) => {
        event.stopPropagation();
        this.activate();
      });
    }

    hover(on) {
      if (this.hovered === on) return;
      this.hovered = on;
      this.el.classList.toggle('hover', on);
      if (on && !this.leaving && !this.clicked) hint.show(this);
      else hint.hide(this);
      this.onHover?.(on);
    }

    activate() {
      if (this.leaving || this.clicked) return;
      this.clicked = true;
      hint.hide(this);
      fx.burst(this.x, this.y - this.h * 0.15);
      sound.play('treat');
      this.onActivate?.();
      openChat(this.kind, this.greeting, this.rating);
    }

    leave(quick = false) {
      if (this.leaving) return;
      this.leaving = true;
      this.quick = quick;
      this.el.classList.add('leaving');
      this.hover(false);
      this.exit?.(quick);
    }

    // Where speech hints anchor, in viewport pixels.
    get top() {
      return this.y - this.h * 0.5;
    }

    // Scrolled far away with its perch.
    lost(r) {
      return !r || r.bottom < -stage.h * 1.5 || r.top > stage.h * 2.5;
    }
  }

  // The ghost: comes out when nobody has moved for a while, greets, and goes.
  // G and PG float out of Stand's chat button; PG-13 and R rise from behind
  // something on the page; NC-17 is just there, all of a sudden.
  class Ghost extends Creature {
    constructor(options = {}) {
      super('ghost', 'ghost', sized('ghost'), sprite('ghost', config.rating, { bands: 8 }));
      this.bands = [...this.el.querySelectorAll('.p-band')];
      this.style = look().ghost;
      this.lantern = this.el.querySelector('.p-lantern');
      this.glow = this.el.querySelector('.p-lantern .glow');
      this.halo = this.el.querySelector('.p-lantern .halo');
      this.greeting = options.greeting ?? ghostGreeting();
      this.vx = 0;
      this.vy = 0;
      this.swing = 0;
      this.baseY = 0;
      this.noticed = null;
      this.side = options.side; // Where the bubble goes: "left", "right", or wherever there's room.
      this.bubble = new Bubble(this);
      this.arrive(options);
    }

    arrive(options) {
      const button = launcherRect();
      this.to = options.x != null ? { x: resolveX(options.x), y: resolveY(options.y ?? 0.4) } : this.findSpot(button);
      this.alpha = 0;
      this.pause = 0;
      this.home = null;
      const how = state.still ? 'fade' : options.from ?? this.style.arrive;
      const cover = how === 'peek' ? findLedge(this.w * 0.8, this.h, { solidOnly: true, token: 'peek' }) : null;
      if (cover) {
        // Peekaboo: up from behind an element, a look around, then out.
        this.perch = cover;
        this.x = cover.r.left + cover.dx;
        this.baseY = this.y = cover.r.top + this.h * 0.6;
        this.alpha = 1;
        this.go('peek');
        return;
      }
      if ((how === 'launcher' || how === 'peek') && button && !state.still) {
        this.from = { x: button.left + button.width / 2, y: button.top + button.height / 2 };
        this.via = { x: lerp(this.from.x, this.to.x, 0.25), y: Math.min(this.from.y, this.to.y) - 120 };
        this.home = this.from;
        fx.poof(this.from.x, this.from.y - 6, 7);
        this.go('arrive');
      } else if (how === 'appear') {
        this.from = this.via = this.to;
        this.go('glitch-in');
      } else {
        this.from = { x: this.to.x, y: this.to.y + (state.still ? 0 : 30) };
        this.via = this.from;
        this.go('arrive');
      }
      this.x = this.from.x;
      this.baseY = this.y = this.from.y;
    }

    // Somewhere in the open: away from the edges, the chat button and things people click.
    findSpot(button) {
      const W = stage.w;
      const H = stage.h;
      let best = null;
      for (let i = 0; i < 12; i++) {
        const x = rand(0.14, 0.86) * W;
        const y = rand(0.22, 0.62) * H;
        // The speech bubble will sit beside the ghost, so its spot counts too.
        const side = x > W * 0.55 ? -1 : 1;
        let score = crowded(x, y, this.w * 1.3, this.h) + crowded(x + side * (this.w * 0.42 + 135), y - 30, 270, 110) + Math.random();
        // It likes to stay near the chat it came out of.
        if (button) score += (3 * Math.hypot(x - button.left, y - button.top)) / Math.hypot(W, H);
        if (!best || score < best.score) best = { x, y, score };
      }
      return best;
    }

    greet() {
      this.go('greet');
      this.bubble.show();
      this.el.classList.add('waving');
      setTimeout(() => this.el.classList.remove('waving'), 2400);
      sound.play('boo');
    }

    step(dt) {
      const W = stage.w;
      const H = stage.h;
      this.edge = null; // Set while it's behind an element; the clip is applied once the position is final.
      switch (this.phase) {
        case 'peek': { // Up from behind the cover until the eyes show, then a look around.
          const r = follow(this.perch);
          if (!r) {
            this.perch = null;
            this.from = this.via = { x: this.x, y: this.baseY };
            this.go('arrive');
            break;
          }
          const p = Math.min(1, this.t / 0.9);
          this.x = r.left + this.perch.dx;
          this.baseY = lerp(r.top + this.h * 0.6, r.top - this.h * 0.12, ease.outCubic(p));
          this.edge = r.top;
          if (this.t > 2) {
            this.from = { x: this.x, y: this.baseY };
            this.via = { x: lerp(this.x, this.to.x, 0.3), y: Math.min(this.baseY, this.to.y) - 60 };
            this.go('rise');
          }
          break;
        }
        case 'rise': {
          const r = follow(this.perch);
          const p = Math.min(1, this.t / 1.6);
          const e = ease.inOut(p);
          this.x = (1 - e) ** 2 * this.from.x + 2 * (1 - e) * e * this.via.x + e ** 2 * this.to.x;
          this.baseY = (1 - e) ** 2 * this.from.y + 2 * (1 - e) * e * this.via.y + e ** 2 * this.to.y;
          if (r && this.baseY + this.h * 0.5 > r.top) this.edge = r.top;
          if (p >= 1) {
            this.perch = null;
            this.greet();
          }
          break;
        }
        case 'arrive': {
          const p = Math.min(1, this.t / (state.still ? 0.8 : 1.6));
          const e = ease.outCubic(p);
          this.x = (1 - e) ** 2 * this.from.x + 2 * (1 - e) * e * this.via.x + e ** 2 * this.to.x;
          this.baseY = (1 - e) ** 2 * this.from.y + 2 * (1 - e) * e * this.via.y + e ** 2 * this.to.y;
          const s = state.still || !this.home ? 1 : lerp(0.2, 1, ease.outBack(p));
          this.sx = this.sy = s;
          this.alpha = Math.min(1, this.t * (state.still ? 1.6 : 5));
          if (p >= 1) this.greet();
          break;
        }
        case 'glitch-in': {
          this.alpha = this.t < 0.5 ? (Math.random() < 0.55 ? 1 : 0.1) : 1;
          this.x = this.to.x + (this.t < 0.5 ? rand(-4, 4) : 0);
          this.baseY = this.to.y;
          stage.root.classList.toggle('flicker', this.t < 0.5);
          if (this.t >= 0.5) this.greet();
          break;
        }
        case 'greet': // Holds still while the greeting is read.
          this.drift(dt, 0);
          if (this.t > 6) this.go('wander');
          break;
        case 'wander': {
          if (this.style.move === 'jerk') this.jerk(dt);
          else this.drift(dt, this.noticed != null || state.still ? 0 : this.style.speed);
          if (this.style.move === 'glide' && !state.still) {
            this.dip = (this.dip ?? rand(3, 6)) - dt;
            if (this.dip < 0) this.dip = rand(3, 6);
            this.alpha = this.dip < 0.12 ? 0.3 : 1;
          }
          const away = !pointer.seen || Math.hypot(pointer.x - this.x, pointer.y - this.y) > 220;
          const lingered = this.noticed != null && this.age - this.noticed > 8;
          if (!this.hovered && !this.bubble.hovered && ((lingered && away) || this.t > 34)) this.leave();
          break;
        }
        case 'spin': {
          const p = Math.min(1, this.t / 0.55);
          this.sx = Math.cos(p * Math.PI * 2);
          this.drift(dt, 0);
          if (p >= 1) this.leave(true);
          break;
        }
        case 'home': { // Back into Stand's chat button, or away without one.
          const p = Math.min(1, this.t / (this.quick ? 0.6 : 1.2));
          if (this.style.move === 'jerk' && !state.still) {
            this.alpha = p > 0.6 ? 0 : Math.random() < 0.5 ? 1 : 0.1;
            this.x = this.leftFrom.x + rand(-4, 4);
          } else if (this.home) {
            const e = ease.inCubic(p);
            this.x = lerp(this.leftFrom.x, this.home.x, e);
            this.baseY = lerp(this.leftFrom.y, this.home.y, e) - Math.sin(p * Math.PI) * 50;
            this.sx = this.sy = lerp(1, 0.18, e);
            this.alpha = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
          } else {
            if (!state.still) this.baseY = this.leftFrom.y - ease.outCubic(p) * 60;
            this.alpha = 1 - p;
          }
          if (p >= 1) {
            if (this.home && !state.still && this.style.move !== 'jerk') fx.poof(this.home.x, this.home.y - 4, 5, 0.7);
            return false;
          }
          break;
        }
      }

      // Float, lean into the drift, swing the lantern and ripple the hem.
      this.x = clamp(this.x, -this.w, W + this.w);
      this.baseY = clamp(this.baseY, -this.h, H + this.h * 1.5);
      this.y = this.baseY + (state.still ? 0 : Math.sin(this.age * 2.1) * this.style.bob);
      clipAt(this, this.edge, 'bottom');
      if (this.phase !== 'spin') this.rot = state.still ? 0 : clamp(this.vx / 260, -0.16, 0.16) + Math.sin(this.age * 1.3) * 0.03;
      if (!state.still) {
        // The hem trails and ripples like cloth; the lantern swings and flickers.
        const unit = this.w / 120;
        this.bands.forEach((band, i) => {
          const k = (i + 1) / this.bands.length;
          const dx = (Math.sin(this.age * 2.4 - i * 0.6) * 2.4 - clamp(this.vx * 0.02, -5, 5)) * k * k * unit;
          band.style.transform = `translateX(${dx.toFixed(2)}px)`;
        });
        this.swing = approach(this.swing, clamp(-this.vx * 0.35, -28, 28) + Math.sin(this.age * 1.7) * 5, 3, dt);
        if (this.lantern) this.lantern.style.transform = `rotate(${(this.swing - this.rot * 57.3).toFixed(2)}deg)`;
        const flicker = 0.82 + Math.sin(this.age * 13) * 0.08 + Math.sin(this.age * 31) * 0.06;
        if (this.glow) this.glow.style.opacity = flicker.toFixed(3);
        if (this.halo) this.halo.style.opacity = (0.6 + flicker * 0.4).toFixed(3);
      }
    }

    // Steers toward a waypoint, slows down to arrive, rests a moment, picks another.
    drift(dt, speed) {
      if (speed > 0) {
        if (this.pause > 0) this.pause -= dt;
        else if (!this.waypoint) this.waypoint = this.findSpot(launcherRect());
        else if (Math.hypot(this.waypoint.x - this.x, this.waypoint.y - this.baseY) < 14) {
          this.waypoint = null;
          this.pause = rand(1.4, 3);
        }
      }
      const target = speed > 0 && this.waypoint && this.pause <= 0 ? this.waypoint : { x: this.x, y: this.baseY };
      const dx = target.x - this.x;
      const dy = target.y - this.baseY;
      const d = Math.hypot(dx, dy);
      const want = Math.min(speed, d * 0.8);
      this.vx = approach(this.vx, d ? (dx / d) * want : 0, 1.4, dt);
      this.vy = approach(this.vy, d ? (dy / d) * want : 0, 1.4, dt);
      this.x += this.vx * dt;
      this.baseY += this.vy * dt;
    }

    // NC-17 doesn't float. It's here, then it's there.
    jerk(dt) {
      this.vx = 0;
      if (this.noticed != null || state.still) return;
      this.jump = (this.jump ?? rand(1.6, 3.2)) - dt;
      if (this.jump > 0.3) return;
      this.alpha = Math.random() < 0.5 ? 1 : 0.15;
      this.x += rand(-3, 3);
      if (this.jump <= 0) {
        const spot = this.findSpot(launcherRect());
        const d = Math.hypot(spot.x - this.x, spot.y - this.baseY);
        const k = d > 200 ? 200 / d : 1;
        this.x += (spot.x - this.x) * k;
        this.baseY += (spot.y - this.baseY) * k;
        this.alpha = 1;
        this.jump = rand(1.6, 3.2);
      }
    }

    visitorBack() {
      if (this.phase === 'wander' || this.phase === 'greet') this.noticed ??= this.age;
    }

    onActivate() {
      this.bubble.hide();
      this.go('spin');
      sound.play('boo');
    }

    dismiss() {
      this.el.classList.add('waving');
      state.dismissed = true;
      try {
        sessionStorage.setItem('stand-halloween-dismissed', String(Date.now()));
      } catch {}
      this.home = null; // Off it goes, rather than back into the chat button.
      this.leave();
    }

    exit() {
      this.bubble.hide();
      this.leftFrom = { x: this.x, y: this.baseY };
      if (this.home) this.home = launcherRect() ? centerOf(launcherRect()) : null;
      this.go('home');
    }

    removed() {
      this.bubble.remove();
      stage?.root.classList.remove('flicker');
      if (state.ghost === this) {
        state.ghost = null;
        state.ghostLeftAt = now();
      }
    }
  }

  // Bats swoop across in ones, twos and threes (NC-17: a swarm). Sometimes one
  // stops to hang upside down from the top of the window, or from the bottom of
  // a header or heading, until it's time to go.
  class Bat extends Creature {
    constructor({ dir, y, delay = 0, hang = null, speed, small = false }) {
      super('bats', 'bat', sized('bat', small ? 0.65 : 1), batRigs());
      this.dir = dir;
      this.baseY = y;
      this.delay = delay;
      this.speed = speed ?? rand(170, 235) * (small ? 1.35 : 1);
      this.amp = rand(14, 30) * (small ? 0.6 : 1);
      this.freq = rand(0.5, 0.9);
      this.phi = rand(0, 6.28);
      this.hang = hang; // { x } at the top of the window, or a perch { el, dx, r }.
      if (hang?.el) this.perch = hang;
      if (hang && !config.greetings.bats) this.greeting = look().lines.hanging;
      this.x = dir > 0 ? -this.w : stage.w + this.w;
      this.y = y;
      this.alpha = 0;
      this.lag = 0;
      this.lagVel = 0;
      this.go('fly');
    }

    // Where it hangs from right now: a perch's bottom edge, or the top of the window.
    ceiling() {
      if (!this.perch) return this.hang ? { x: this.hang.x, y: 0 } : null;
      const r = follow(this.perch);
      return r ? { x: r.left + this.perch.dx, y: r.bottom } : null;
    }

    step(dt) {
      if (this.delay > 0) {
        this.delay -= dt;
        return;
      }
      this.alpha = 1;
      const W = stage.w;
      switch (this.phase) {
        case 'fly': {
          const pace = this.hovered ? 0.28 : this.leaving ? 1.7 : 1;
          this.x += this.dir * this.speed * pace * dt;
          const wave = this.age * this.freq * Math.PI * 2 + this.phi;
          this.baseY += Math.sin(this.age * 0.7 + this.phi) * 10 * dt;
          this.y = this.baseY + Math.sin(wave) * this.amp;
          this.rot = Math.cos(wave) * 0.16 * this.dir;
          const spot = this.hang && !this.leaving && !this.clicked ? this.ceiling() : null;
          if (this.hang && !spot) this.hang = null;
          if (spot && Math.abs(this.x - spot.x) < 70) this.go('perch');
          if (this.x < -this.w * 1.3 || this.x > W + this.w * 1.3) return false;
          break;
        }
        case 'perch': { // Swoop up to the edge, then flip over.
          const spot = this.ceiling();
          if (!spot) return void this.go('drop');
          const top = spot.y + this.h / 2 - 1;
          this.x = approach(this.x, spot.x, 5, dt);
          this.y = approach(this.y, top, 4.5, dt);
          this.rot = approach(this.rot, 0, 6, dt);
          if (Math.abs(this.y - top) < 6 && Math.abs(this.x - spot.x) < 8) this.go('flip');
          break;
        }
        case 'flip': {
          const spot = this.ceiling();
          if (!spot) return void this.go('drop');
          const p = Math.min(1, this.t / 0.22);
          this.sy = Math.abs(Math.cos(p * Math.PI));
          if (p >= 0.5 && !this.el.classList.contains('hanging')) this.el.classList.add('hanging');
          this.x = spot.x;
          this.y = spot.y + this.h / 2 - 1;
          if (p >= 1) {
            this.sy = 1;
            this.stay ??= rand(14, 22);
            this.lastEdge = spot.y;
            this.go('hang');
          }
          break;
        }
        case 'hang': {
          const spot = this.ceiling();
          if (!spot || (this.perch && this.lost(this.perch.r))) return void this.go('drop');
          // When the page scrolls, it holds on and bounces.
          this.lag -= spot.y - (this.lastEdge ?? spot.y);
          this.lastEdge = spot.y;
          this.lagVel += (-60 * this.lag - 7 * this.lagVel) * dt;
          this.lag = clamp(this.lag + this.lagVel * dt, -24, 24);
          this.x = spot.x;
          this.y = spot.y + this.h / 2 - 1 + Math.max(0, this.lag) * 0.4;
          this.rot = Math.sin(this.age * 1.4) * 0.05 + (this.hovered ? Math.sin(this.age * 10) * 0.05 : 0) + this.lagVel * 0.004;
          this.zzz = (this.zzz ?? 0) - dt;
          if (this.zzz <= 0 && !this.hovered && !state.still && this.rating !== 'nc-17') {
            this.zzz = 1.7;
            fx.float(this.x + this.w * 0.18, this.y + this.h * 0.32, 'z');
          }
          if (this.t > this.stay && !this.hovered) this.leave();
          break;
        }
        case 'drop': { // Let go, unfold and fly off.
          const p = Math.min(1, this.t / 0.25);
          this.sy = Math.abs(Math.cos(p * Math.PI));
          this.y += 60 * dt;
          if (p >= 0.5) this.el.classList.remove('hanging');
          if (p >= 1) {
            this.sy = 1;
            this.hang = null;
            this.perch = null;
            this.baseY = this.y + 30;
            this.dir = this.x < W / 2 ? -1 : 1;
            this.go('fly');
          }
          break;
        }
        case 'loop': { // Clicked: a loop-the-loop, then on its way.
          const p = Math.min(1, this.t / 0.7);
          const a = ease.inOut(p) * Math.PI * 2;
          this.x = this.loopX + this.dir * Math.sin(a) * 34;
          this.y = this.loopY - (1 - Math.cos(a)) * 34;
          this.rot = -this.dir * a;
          if (p >= 1) {
            this.rot = 0;
            this.baseY = this.loopY;
            this.go('fly');
          }
          break;
        }
      }
    }

    onHover(on) {
      if (on) sound.play('squeak');
    }

    onActivate() {
      if (this.phase === 'hang' || this.phase === 'flip') return void this.go('drop');
      this.loopX = this.x;
      this.loopY = this.y;
      this.go('loop');
    }

    exit() {
      if (this.phase === 'hang' || this.phase === 'flip' || this.phase === 'perch') this.go('drop');
      this.hang = null;
    }

    get top() {
      return this.phase === 'hang' ? this.y + this.h * 0.25 : this.y - this.h * 0.35;
    }
  }

  // The spider drops in on a thread, from the top of the window or out of the
  // bottom of a heading or card, dangles (bouncing when you scroll), and climbs
  // back up.
  class Spider extends Creature {
    constructor(options = {}) {
      super('spider', 'spider', sized('spider'), sprite('spider'));
      this.silk = document.createElement('div');
      this.silk.className = 'silk';
      const hold = anchorOf('spider', 'body', 0.38)?.y ?? 0.42;
      this.silk.style.bottom = pct(1 - hold);
      this.el.prepend(this.silk);
      this.stiffness = config.rating === 'nc-17' ? 90 : 42;
      this.attach = this.h * (0.5 - hold); // From the middle of the box up to where the thread holds on.
      if (options.x == null && !state.still) this.perch = options.perch ?? (Math.random() < 0.65 ? findCeiling(this.w * 1.2, this.h * 2.2) : null);
      if (this.perch) {
        this.length = rand(0.08, 0.2) * stage.h + this.h * 0.3;
      } else {
        this.length = resolveY(options.drop) ?? rand(0.16, 0.38) * stage.h;
        this.anchorX = claim(this, 'top', resolveX(options.x) ?? freeX(this.w * 1.2, this.length, this.h, [0.08, 0.92], 'top'), this.w);
        this.unwelcome = noRoom(options);
      }
      this.len = -this.h;
      this.vel = 0;
      this.angle = 0;
      this.lag = 0;
      this.lagVel = 0;
      this.stay = options.stay ?? rand(9, 15);
      this.alpha = 1;
      this.go(state.still ? 'dangle' : 'drop');
      if (state.still) this.len = this.length;
    }

    anchor() {
      if (!this.perch) return { x: this.anchorX, y: 0 };
      const r = follow(this.perch);
      return r ? { x: r.left + this.perch.dx, y: r.bottom } : null;
    }

    step(dt) {
      const anchor = this.anchor();
      if (!anchor) return false;
      if (this.perch && this.lost(this.perch.r) && !this.leaving) this.leave(true);
      switch (this.phase) {
        case 'drop': {
          const pull = this.stiffness * (this.length - this.len) - 6.5 * this.vel;
          this.vel += pull * dt;
          this.len += this.vel * dt;
          if (this.t > 2 && Math.abs(this.vel) < 6) this.go('dangle');
          break;
        }
        case 'dangle':
          this.len = approach(this.len, this.length + (state.still ? 0 : Math.sin(this.t * 1.1) * 7), 4, dt);
          if (this.rating === 'nc-17' && !state.still && Math.random() < dt * 0.6) this.len += rand(-14, 10);
          if (this.t > this.stay && !this.hovered) this.leave();
          break;
        case 'twirl': {
          const p = Math.min(1, this.t / 0.6);
          this.sx = Math.cos(p * Math.PI * 2);
          if (p >= 1) {
            this.sx = 1;
            this.go('dangle');
          }
          break;
        }
        case 'climb':
          this.len -= (this.quick ? 520 : 190) * dt;
          if (this.len < -this.h) return false;
          break;
      }
      // Scrolling yanks the anchor; the spider lags behind, then springs back.
      if (this.lastAnchor != null && this.phase !== 'climb') {
        const moved = anchor.y - this.lastAnchor;
        this.lag -= moved;
        this.lagVel -= moved * 0.2;
      }
      this.lastAnchor = anchor.y;
      this.lagVel += (-30 * this.lag - 4 * this.lagVel) * dt;
      this.lag = clamp(this.lag + this.lagVel * dt, -60, 90);
      // A slow pendulum, livelier while dropping, still while someone's looking.
      const sway = state.still || this.hovered ? 0 : Math.sin(this.age * 1.25) * 0.05 + Math.sin(this.age * 0.53) * 0.03 + this.lagVel * 0.0008;
      this.angle = approach(this.angle, sway, 2, dt);
      // The thread hangs from the anchor; the spider's up points back along it.
      const reach = Math.max(this.len + this.lag, this.len) + this.attach;
      this.x = anchor.x - reach * Math.sin(this.angle);
      this.y = anchor.y + reach * Math.cos(this.angle);
      this.rot = this.angle;
      this.silk.style.height = `${Math.max(0, reach - this.attach) + 6}px`;
      clipAt(this, this.perch ? anchor.y : null, 'top');
    }

    onHover(on) {
      if (on) sound.play('boing');
    }

    onActivate() {
      this.go('twirl');
      setTimeout(() => this.leave(), 1100);
    }

    exit() {
      this.el.classList.add('climbing');
      this.go('climb');
    }
  }

  // The pumpkin rises from the bottom edge of the window, or from behind a card
  // or an image, flickers a while, and sinks back down.
  class Pumpkin extends Creature {
    constructor(options = {}) {
      super('pumpkin', 'pumpkin', sized('pumpkin'), sprite('pumpkin'));
      this.candle = this.el.querySelector('.glow');
      this.halo = this.el.querySelector('.halo');
      this.visible = 0.8;
      if (options.x == null && !state.still) {
        this.perch = options.perch ?? (Math.random() < 0.6 ? findLedge(this.w, this.h * this.visible, { solidOnly: true, token: 'peek' }) : null);
      }
      if (!this.perch) {
        this.px = claim(this, 'bottom', resolveX(options.x) ?? freeX(this.w, stage.h - this.h * 0.8, this.h * 0.8, [0.06, 0.8], 'bottom'), this.w);
        this.unwelcome = noRoom(options);
      }
      this.stay = options.stay ?? rand(11, 17);
      this.light = 1;
      this.flicker = 1;
      this.nextFlicker = 0;
      this.nextHop = rand(3, 6);
      this.smoke = 0;
      this.alpha = 1;
      this.go('rise');
    }

    // The edge it rises from: the top of its perch, or the bottom of the window.
    edge() {
      if (!this.perch) return { x: this.px, y: stage.h };
      const r = follow(this.perch);
      return r ? { x: r.left + this.perch.dx, y: r.top } : null;
    }

    step(dt) {
      const edge = this.edge();
      if (!edge) return false;
      if (this.perch && this.lost(this.perch.r) && !this.leaving) this.leave(true);
      const rest = edge.y - this.h * this.visible + this.h / 2;
      const hidden = edge.y + this.h / 2 + 8;
      this.x = edge.x;
      switch (this.phase) {
        case 'rise': {
          const p = Math.min(1, this.t / 0.95);
          if (state.still) {
            this.y = rest;
            this.alpha = p;
          } else {
            this.y = lerp(hidden, rest, ease.outBack(p));
            this.rot = Math.sin(p * Math.PI * 3) * 0.07 * (1 - p);
          }
          if (p >= 1) this.go('stay');
          break;
        }
        case 'stay': {
          let hop = 0;
          if (!state.still && this.age > this.nextHop) {
            const h = (this.age - this.nextHop) / 0.42;
            hop = h < 1 ? Math.sin(h * Math.PI) * 12 : 0;
            if (h >= 1) this.nextHop = this.age + rand(4, 8);
          }
          this.y = rest - hop;
          this.rot = approach(this.rot, this.hovered ? Math.sin(this.age * 8) * 0.04 : 0, 8, dt);
          if (this.t > this.stay && !this.hovered) this.leave();
          break;
        }
        case 'sink': {
          const p = Math.min(1, this.t / (this.quick ? 0.4 : 0.7));
          if (state.still) {
            this.y = rest;
            this.alpha = 1 - p;
          } else this.y = lerp(rest, hidden, ease.inBack(p));
          if (p >= 1) return false;
          break;
        }
      }
      clipAt(this, this.perch ? edge.y : null, 'bottom');
      // Candlelight: a jittery random walk, brighter when someone's close.
      if (this.age > this.nextFlicker) {
        this.flicker = state.still ? 0.8 : rand(0.5, 1);
        this.nextFlicker = this.age + rand(0.05, 0.16);
      }
      this.light = approach(this.light, this.hovered ? 1.15 : this.flicker, 14, dt);
      if (this.candle) this.candle.style.opacity = clamp(this.light - 0.25, 0, 1).toFixed(3);
      if (this.halo) this.halo.style.opacity = clamp(this.light * 0.9, 0, 1).toFixed(3);
      if (this.rating === 'nc-17' && !state.still && this.phase === 'stay') {
        this.smoke -= dt;
        if (this.smoke <= 0) {
          this.smoke = rand(0.35, 0.7);
          fx.smoke(this.x + rand(-6, 6), this.y - this.h * 0.36);
        }
      }
    }

    onActivate() {
      this.el.classList.add('pop');
      sound.play('pop');
      setTimeout(() => this.el.classList.remove('pop'), 900);
    }

    exit() {
      this.go('sink');
    }

    get top() {
      return this.y - this.h * 0.36;
    }
  }

  // The cat: the page's resident. It walks in along the bottom of the window or
  // climbs up onto something, then makes itself at home: it hops from card to
  // card, sits, watches the pointer, and follows it to whatever the visitor
  // lingers on. Its body is a skeleton (CatBody) posed fresh every frame.
  class Cat extends Creature {
    constructor(options = {}) {
      const body = new CatBody(config.rating);
      super('cat', 'cat', sized('cat'), [body.el, sitRig()]);
      this.body = body;
      this.st = CAT_STYLE[config.rating];
      this.k = this.w / body.W; // CSS pixels per image pixel
      this.feetDx = ((body.legs.hn.toe.x + body.legs.fn.toe.x) / 2 - body.W / 2) * this.k;
      this.lift0 = (body.H - body.ground) * this.k;
      this.sitH = RIGS[config.rating].catSit.size[1] * SIT_SCALE[config.rating] * (DISPLAY.catSit / DISPLAY.cat) * this.k;
      this.stay = options.stay ?? rand(10, 16);
      this.speed = (options.speed ?? this.st.speed) * scale();
      this.gait = 0;
      this.crouch = 0;
      this.trips = 0;
      const from = options.from ?? (Math.random() < 0.5 ? 'left' : 'right');
      this.dir = from === 'left' ? 1 : -1;
      if (options.x == null && !state.still) this.perch = options.perch ?? (Math.random() < 0.55 ? findLedge(this.w * 0.75, this.h, { controls: true }) : null);
      if (this.perch) {
        // Up from behind one end of the ledge, then along it to the spot.
        this.surface = { perch: this.perch };
        const width = this.perch.r.width;
        const spot = this.perch.dx;
        const ends = [this.w * 0.45, width - this.w * 0.45];
        this.at = Math.abs(ends[0] - spot) > Math.abs(ends[1] - spot) ? ends[0] : ends[1];
        if (Math.abs(this.at - spot) < 30) this.at = spot;
        this.goal = spot;
        this.dir = spot >= this.at ? 1 : -1;
        this.go('climb');
      } else {
        this.surface = { floor: true };
        this.goal = claim(this, 'bottom', resolveX(options.x) ?? freeX(this.w * 0.7, stage.h - this.h, this.h, [0.08, 0.8], 'bottom'), this.w * 0.7);
        this.unwelcome = noRoom(options);
        this.at = state.still ? this.goal : this.dir > 0 ? -this.w / 2 : stage.w + this.w / 2;
        if (state.still) this.sit(true);
        else this.go('walk');
      }
      this.alpha = state.still ? 0 : 1;
      this.next = 'sit';
    }

    go(phase) {
      if (this.lastPose && phase !== this.phase) this.blend = { from: this.lastPose, t: 0, dur: phase === 'leap' ? 0.1 : 0.16 };
      super.go(phase);
    }

    // Where a surface is right now, in the window: the bottom of the window, or a perch's top edge.
    ground(surface = this.surface) {
      if (surface.floor) return { left: 0, right: stage.w, y: stage.h };
      const r = follow(surface.perch);
      return r ? { left: r.left, right: r.right, y: r.top } : null;
    }

    // Puts the cat with its feet at (x, y) in the window, raised by `up`.
    place(x, y, up = 0) {
      this.x = x - this.dir * this.feetDx;
      this.y = y - this.h / 2 + this.lift0 - up;
    }

    sit(now = false) {
      this.el.classList.add('sitting');
      this.sx = 1;
      this.go('sit');
      if (!now) sound.play('purr');
    }

    stand() {
      this.el.classList.remove('sitting');
      this.sx = this.dir;
    }

    // Somewhere new to be: a ledge in reach, or the floor.
    hop(target) {
      const g = this.ground();
      if (!g) return false;
      const from = g.left + this.at;
      // Take off from the nearest point of this surface, facing the target.
      const room = this.w * 0.42;
      const takeoff = clamp(target.x, g.left + room, g.right - room);
      this.plan = { target, takeoff: takeoff - g.left, pounce: Boolean(target.pounce) };
      this.stand();
      this.goal = this.plan.takeoff;
      this.next = 'jump';
      if (Math.abs(this.goal - this.at) < 6) return this.prepare(), true;
      this.dir = this.goal > this.at ? 1 : -1;
      this.go('walk');
      return Boolean(from);
    }

    prepare() {
      const t = this.plan.target;
      const g = this.ground();
      const tx = t.floor ? t.x : t.x;
      const want = tx > g.left + this.at ? 1 : -1;
      if (want !== this.dir) {
        this.turnTo = want;
        return void this.go('turn');
      }
      this.go('crouch');
    }

    // Picks the next thing to do: hop somewhere, sit, or (after a while) leave.
    decide() {
      if (this.leaving) return;
      if (!state.still && this.trips < 3 && Math.random() < (this.trips ? 0.45 : 0.6)) {
        const spot = this.findHop();
        if (spot && this.hop(spot)) return;
      }
      this.sit();
    }

    // A ledge in reach that isn't crowded, or the floor if it's on a ledge.
    findHop(prefer) {
      const g = this.ground();
      if (!g) return null;
      const fx = g.left + this.at;
      if (prefer) return prefer;
      const list = ledgesFor(this, fx, g.y);
      if (list.length) return list[0];
      if (!this.surface.floor && Math.random() < 0.5) return { floor: true, x: clamp(fx + this.dir * this.w * rand(0.6, 1.4), this.w, stage.w - this.w) };
      return null;
    }

    step(dt) {
      const B = this.body;
      const st = this.st;
      const g = this.ground();
      if (!g && this.phase !== 'leap') return false;
      if (this.surface.perch && this.lost(this.surface.perch.r) && !this.leaving && this.phase !== 'leap') this.leave(true);
      let pose = null;
      let up = 0;
      let sink = 0;
      switch (this.phase) {
        case 'climb': { // Up over the edge from behind.
          const p = Math.min(1, this.t / 0.55);
          sink = (1 - ease.outCubic(p)) * this.h;
          this.crouch = 1 - p;
          if (p >= 1) {
            this.crouch = 0;
            if (Math.abs(this.goal - this.at) < 4) this.decide();
            else this.go('walk');
          }
          break;
        }
        case 'walk':
        case 'out': {
          const pace = this.phase === 'out' ? (this.quick ? 2.4 : 1.25) : this.hovered ? 0 : 1;
          const v = this.speed * pace;
          this.at += this.dir * v * dt;
          this.gait = (this.gait + (dt * pace) / st.period) % 1;
          this.stride = (v / pace || this.speed) / this.k * STANCE * st.period;
          if (this.phase === 'walk' && (this.goal - this.at) * this.dir <= 0) {
            this.at = this.goal;
            this.gait = 0;
            if (this.next === 'jump') this.prepare();
            else this.decide();
          }
          if (this.phase === 'out') {
            const x = g.left + this.at;
            if (this.surface.floor && (x < -this.w || x > stage.w + this.w)) return false;
            if (!this.surface.floor && (this.at < this.w * 0.3 || this.at > g.right - g.left - this.w * 0.3)) this.go('drop');
          }
          break;
        }
        case 'turn': {
          const p = Math.min(1, this.t / 0.24);
          this.sx = this.dir * Math.cos(p * Math.PI);
          if (p >= 0.5 && this.dir !== this.turnTo) this.dir = this.turnTo;
          if (p >= 1) {
            this.sx = this.dir;
            this.go('crouch');
          }
          break;
        }
        case 'crouch': { // A quick dip (a wiggle first, if it's pouncing), then the push-off.
          const dip = 0.22, wiggle = this.plan?.pounce ? 0.42 : 0, push = 0.12;
          if (this.t < dip) this.crouch = ease.outCubic(this.t / dip);
          else if (this.t < dip + wiggle) this.crouch = 1;
          else {
            const p = Math.min(1, (this.t - dip - wiggle) / push);
            this.crouch = 1 - 1.3 * ease.inCubic(p); // Unfolding: past standing, up on its toes.
            if (p >= 1) this.launch();
          }
          this.wiggling = this.t > dip && this.t < dip + wiggle ? this.t - dip : 0;
          break;
        }
        case 'leap': {
          const j = this.jump;
          const p = Math.min(1, this.t / j.T);
          const a = this.ground(j.from) ?? j.lastFrom;
          const b = this.ground(j.to.surface);
          if (!b) return false;
          j.lastFrom = a;
          const x0 = a.left + j.fromAt, y0 = a.y;
          const x1 = j.to.surface.floor ? j.to.x : b.left + j.to.at, y1 = b.y;
          const cy = Math.min(y0, y1) - j.apex;
          const u = p;
          const x = lerp(x0, x1, u);
          const y = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * cy + u * u * y1;
          const vy = 2 * (1 - u) * (cy - y0) + 2 * u * (y1 - cy);
          this.flight = { u, slope: Math.atan2(vy, Math.abs(x1 - x0) || 1) };
          this.x = x - this.dir * this.feetDx;
          this.y = y - this.h / 2 + this.lift0;
          if (p >= 1) {
            this.surface = j.to.surface;
            this.at = j.to.surface.floor ? j.to.x : j.to.at;
            this.perch = this.surface.perch ?? null;
            this.trips++;
            sound.play('boing');
            this.go('land');
          }
          break;
        }
        case 'land': {
          if (this.t > 0.34) {
            if (this.leaving) this.out();
            else this.decide();
          }
          break;
        }
        case 'sit':
          if (state.still) this.alpha = Math.min(1, this.alpha + dt * 2);
          if (!state.still && !this.hovered && this.t > 1.2 && pointerDwell(this)) break;
          if (this.t > this.stay && !this.hovered) {
            this.stay = rand(8, 13);
            if (!state.still && this.trips < 3 && Math.random() < 0.55) {
              const spot = this.findHop();
              if (spot && this.hop(spot)) break;
            }
            this.leave();
          }
          break;
        case 'drop': { // Down behind the far side of the ledge.
          const p = Math.min(1, this.t / 0.45);
          sink = ease.inCubic(p) * this.h * 1.1;
          this.crouch = p;
          if (p >= 1) return false;
          break;
        }
        case 'fade':
          this.alpha -= dt * 2.5;
          if (this.alpha <= 0) return false;
          break;
      }

      // Facing where it's going (turning flips it on its own; sitting faces you).
      if (this.phase !== 'turn' && this.phase !== 'sit' && this.phase !== 'fade') this.sx = this.dir;
      if (this.phase !== 'leap' && g) {
        this.x = g.left + this.at - this.dir * this.feetDx;
        this.y = g.y - this.h / 2 + this.lift0 + sink - up;
      }
      clipAt(this, !this.surface.floor && g && this.phase !== 'leap' ? g.y : null, 'bottom');

      // The pose for this moment.
      if (this.phase === 'sit') return;
      const t = this.age;
      if (this.phase === 'leap') pose = this.flightPose(this.flight.u, this.flight.slope, t);
      else if (this.phase === 'land') pose = this.landPose(Math.min(1, this.t / 0.34), t);
      else if (this.phase === 'walk' || this.phase === 'out') pose = this.gaitPose(this.gait, t, this.hovered);
      else pose = this.crouchPose(this.crouch, this.phase === 'crouch' ? this.wiggling : 0, t);
      // Changes of pose blend over a moment, so one move flows into the next.
      if (this.blend) {
        this.blend.t += dt;
        const k = ease.inOut(Math.min(1, this.blend.t / this.blend.dur));
        pose = mixPose(this.blend.from, pose, k);
        if (k >= 1) this.blend = null;
      }
      this.lastPose = pose;
      B.pose(pose, this.k);
    }

    // Walking: each paw lifts in turn, swings forward and plants again while the
    // body rides along; the head nods and the tail sways up high.
    gaitPose(phase, t, paused) {
      const B = this.body, st = this.st, H = B.H;
      const stride = paused ? 0 : this.stride ?? 0;
      const paws = {};
      for (const [code, L] of Object.entries(B.legs)) {
        const p = (phase + GAIT[code]) % 1;
        let x = L.toe.x, y = B.ground, a = 0;
        if (p < STANCE) x += stride / 2 - (p / STANCE) * stride;
        else {
          const q = (p - STANCE) / (1 - STANCE);
          x += -stride / 2 + stride * ease.inOut(q);
          y -= paused ? 0 : st.lift * H * Math.sin(Math.PI * q);
          a = paused ? 0 : 0.6 * Math.sin(Math.PI * Math.min(1, q * 1.25));
        }
        paws[code] = { x, y, a };
      }
      const bob = paused ? 0 : st.bob * 0.014 * H * (0.5 - 0.5 * Math.cos(phase * Math.PI * 4));
      const look = this.hovered && pointer.seen ? this.headToward(pointer.x, pointer.y) : -0.03 * Math.sin(phase * Math.PI * 4 + 0.6);
      return {
        y: bob + st.low * H, pitch: paused ? 0 : 0.012 * Math.sin(phase * Math.PI * 2), bend: paused ? 0 : 0.025 * Math.sin(phase * Math.PI * 2 + 1),
        head: look, tail: this.tailPose(t, st.tail, st.curl), paws,
      };
    }

    // Down low before a jump, eyes on where it's going, then the wiggle.
    crouchPose(c, wiggling, t) {
      const B = this.body, st = this.st, H = B.H, W = B.W;
      const paws = {};
      for (const [code, L] of Object.entries(B.legs)) paws[code] = { x: L.toe.x + (L.front ? 0.03 : -0.04) * W * c, y: B.ground, a: L.front ? 0 : -0.25 * c };
      const w = wiggling > 0 ? Math.sin(wiggling * Math.PI * 2 * 7) * Math.min(1, wiggling * 3) : 0;
      const target = this.plan?.target;
      const aim = target && !target.floor && this.ground() ? clamp((this.ground().y - (target.r?.top ?? this.ground().y)) / (this.h * 3), -0.3, 0.35) : -0.1;
      const lean = c < 0 ? -c : 0;
      return {
        y: c * 0.19 * H + st.low * H * Math.max(0, 1 - lean) + w * 0.012 * H, pitch: -aim * (c > 0 ? c * 0.6 : 0.6 + lean), bend: w * 0.05 - lean * 0.04, head: -aim * Math.abs(c) * 0.5,
        tail: this.tailPose(t, st.tail * (1 - 0.7 * c), st.curl * (1 - c), w * 0.25), paws,
      };
    }

    // In the air: pushing off, stretched out like a long cat, then the front paws
    // reach for the landing while the hind legs swing in under.
    flightPose(u, slope, t) {
      const B = this.body, H = B.H, W = B.W;
      // Steep take-offs tilt the whole body up, so the pushing legs line up behind it.
      const pitch = clamp(slope * 0.9, -0.72, 0.48);
      const paws = {};
      // Keyframes over the flight, for front and hind paws: [u, dx, dy] as shares of the body.
      const FRONT = [[0, 0.06, -0.16], [0.22, 0.24, -0.2], [0.6, 0.27, -0.08], [0.85, 0.17, 0.06], [1, 0.08, 0.02]];
      const HIND = [[0, -0.18, -0.02], [0.22, -0.38, -0.14], [0.6, -0.32, -0.16], [0.85, -0.1, -0.14], [1, 0, -0.03]];
      const at = (keys) => {
        let i = 0;
        while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
        const [u0, x0, y0] = keys[i], [u1, x1, y1] = keys[i + 1];
        const f = ease.inOut(clamp((u - u0) / (u1 - u0), 0, 1));
        return [lerp(x0, x1, f), lerp(y0, y1, f)];
      };
      for (const [code, L] of Object.entries(B.legs)) {
        const [fx, fy] = at(L.front ? FRONT : HIND);
        const local = { x: L.toe.x + fx * W, y: B.ground + fy * H };
        const q = about(local, B.spine, pitch);
        paws[code] = { x: q.x, y: q.y - 0.04 * H, a: pitch + (L.front ? -0.25 : 0.55) };
      }
      return { y: -0.04 * H, pitch, bend: -0.06, head: -pitch * 0.75, tail: this.tailPose(t, 0.1, 0, 0, 0.3), paws };
    }

    // Front paws first, then the rest, sinking into the landing and back up.
    landPose(v, t) {
      const B = this.body, st = this.st, H = B.H;
      const c = Math.sin(Math.PI * Math.min(1, v * 1.15)) * 0.85;
      const paws = {};
      for (const [code, L] of Object.entries(B.legs)) paws[code] = { x: L.toe.x, y: B.ground - (L.front ? 0 : Math.max(0, 0.08 - v * 0.3) * H), a: 0 };
      return { y: c * 0.17 * H + st.low * H, pitch: 0.16 * (1 - v), bend: 0.04 * c, head: -0.1 * (1 - v), tail: this.tailPose(t, st.tail * 0.6, st.curl * 0.5), paws };
    }

    // Five angles down the tail: raised at the base, curled at the tip, with a
    // ripple running along it. Higher-rated cats carry it low and lash it.
    tailPose(t, raise, curl, twitch = 0, stream = 0) {
      const lash = this.st.lash ?? 1;
      return [0, 1, 2, 3, 4].map((i) => {
        const wave = Math.sin(t * 2.3 * lash - i * 0.9) * (0.05 + i * 0.035) * lash;
        if (!i) return raise + wave * 0.6 + stream * Math.sin(t * 9) * 0.05;
        return (i >= 3 ? curl : 0.06) + wave + (i === 4 ? twitch : 0) - stream * 0.04;
      });
    }

    // The head turns toward a point, a little.
    headToward(px, py) {
      const dx = (px - this.x) * this.dir, dy = py - (this.y - this.h * 0.3);
      return clamp(Math.atan2(dy, Math.max(30, dx)) * 0.6, -0.45, 0.35);
    }

    launch() {
      const g = this.ground();
      const t = this.plan.target;
      const tg = t.floor ? { left: 0, y: stage.h } : this.ground({ perch: { el: t.el, r: t.r } }) ?? null;
      if (!g || !tg) return void this.decide();
      const surface = t.floor ? { floor: true } : { perch: { el: t.el, dx: t.x - tg.left, r: t.r } };
      const to = t.floor ? { surface, x: t.x } : { surface, at: t.x - tg.left };
      const x0 = g.left + this.at, x1 = t.floor ? t.x : t.x;
      const dist = Math.hypot(x1 - x0, tg.y - g.y);
      this.jump = {
        from: this.surface, fromAt: this.at, to,
        apex: this.h * 0.38 + Math.abs(x1 - x0) * 0.16 + Math.max(0, g.y - tg.y) * 0.25,
        T: clamp(0.42 + dist / 1400, 0.45, 0.85),
      };
      this.plan = null;
      this.next = 'sit';
      this.flight = { u: 0, slope: 0 };
      sound.play('swoosh');
      this.go('leap');
    }

    out() {
      this.stand();
      if (this.surface.floor) this.dir = this.x < stage.w / 2 ? -1 : 1;
      else {
        const g = this.ground();
        this.dir = g && this.at < (g.right - g.left) / 2 ? -1 : 1;
      }
      this.sx = this.dir;
      this.go('out');
    }

    onHover(on) {
      if (on && this.phase === 'sit') {
        fx.float(this.x + this.w * 0.08, this.top + 4, '♥', 'heart');
        sound.play('purr');
      }
    }

    onActivate() {
      fx.float(this.x, this.top, '♥', 'heart');
    }

    exit() {
      if (state.still) return void this.go('fade');
      if (this.phase === 'leap') return; // It finishes the jump first, then goes.
      this.out();
    }

    get top() {
      return this.phase === 'sit' ? this.y + this.h / 2 - this.sitH : this.y - this.h * 0.35;
    }
  }

  // Where the pointer has been resting, if the cat should go and sit by it:
  // a ledge under a pointer that hasn't moved for a moment, within a leap.
  function pointerDwell(cat) {
    if (!pointer.seen || now() - pointer.since < 1300 || now() - (cat.followedAt ?? -1e9) < 7000) return false;
    if (cat.dwellSeen === pointer.since) return false; // Already looked at this spot.
    cat.dwellSeen = pointer.since;
    const under = document.elementFromPoint(pointer.x, pointer.y);
    for (let el = under; el && el !== document.body; el = el.parentElement) {
      if (OURS.has(el.localName)) return false;
      const box = describe(el);
      if (!box || box.huge || box.bar || box.control || !(box.solid || box.heading || box.media)) continue;
      if (cat.surface.perch?.el === el) return false;
      const spot = ledgesFor(cat, pointer.x, pointer.y, el)[0];
      if (!spot) return false;
      cat.followedAt = now();
      return cat.hop({ ...spot, x: clamp(pointer.x, spot.left, spot.right), pounce: true });
    }
    return false;
  }

  // Ledges the cat could leap to from (x, y): tops of cards, images and headings in
  // view, not too far, not too high, and with room to land. `only` limits it to one element.
  function ledgesFor(cat, x, y, only = null) {
    if (config.perch === 'off') return [];
    const w = cat.w * 0.7;
    const out = [];
    for (const box of only ? [describe(only)].filter(Boolean) : onScreen()) {
      const { r } = box;
      const asked = marked(box.el, 'perch');
      if (!asked && (config.perch !== 'auto' || box.huge || box.bar || box.control || !(box.solid || box.heading || box.media))) continue;
      if (cat.surface.perch?.el === box.el) continue;
      if (r.width < w * 1.2 || r.top < stage.h * 0.1 + cat.h * 0.6 || r.top > stage.h - 24) continue;
      const left = Math.max(r.left, 0) + w * 0.62;
      const right = Math.min(r.right, stage.w) - w * 0.62;
      if (right <= left) continue;
      const at = clamp(x + rand(-1, 1) * w, left, right);
      const g = cat.ground();
      const fromX = g ? g.left + cat.at : x;
      const fromY = g ? g.y : y;
      const dx = Math.abs(at - fromX);
      const rise = fromY - r.top;
      if (dx > cat.w * 3.6 || rise > cat.h * 2.6 || (dx < cat.w * 0.5 && Math.abs(rise) < cat.h * 0.5)) continue;
      if (!showing(box.el, at, r.top + 3) || settled(box.el, at, w)) continue;
      const crowd = crowded(at, r.top - cat.h / 2, w, cat.h);
      if (crowd > 5) continue;
      out.push({ el: box.el, r, x: at, left, right, score: crowd + (dx / cat.w) * 0.35 + Math.random() * 0.8 - (asked ? 10 : 0) });
    }
    return out.sort((a, b) => a.score - b.score);
  }

  // The broom (G), the witch (PG, PG-13), the raven (R) or the crows (NC-17):
  // a rare guest that crosses the top of the window.
  class Broom extends Creature {
    constructor(options = {}) {
      super('broom', 'broom', sized('flyer', config.rating === 'nc-17' ? 1.25 : 1), flyerRigs());
      const from = options.from ?? (Math.random() < 0.5 ? 'left' : 'right');
      this.dir = from === 'left' ? 1 : -1;
      this.y0 = resolveY(options.y) ?? rand(0.16, 0.34) * stage.h;
      this.speed = rand(240, 290) * (config.rating === 'r' ? 0.75 : 1);
      this.arc = rand(30, 70);
      this.travel = 0;
      this.sparks = 0;
      this.roll = 0;
      this.alpha = 1;
      this.trail = ['g', 'pg', 'pg-13'].includes(config.rating);
      this.go('fly');
    }

    step(dt) {
      const span = stage.w + this.w * 2;
      const pace = this.hovered ? 0.3 : this.leaving ? 1.8 : 1;
      this.travel += this.speed * pace * dt;
      const p = this.travel / span;
      this.x = (this.dir > 0 ? -this.w : stage.w + this.w) + this.dir * this.travel;
      this.y = this.y0 - Math.sin(p * Math.PI) * this.arc + Math.sin(this.age * 3.2) * 5;
      this.rot = this.dir * (-Math.cos(p * Math.PI) * 0.1) + Math.sin(this.age * 3.2) * 0.03;
      this.sx = this.dir;
      if (this.roll > 0) {
        this.roll = Math.max(0, this.roll - dt);
        this.sy = Math.cos((1 - this.roll / 0.7) * Math.PI * 2);
      }
      this.sparks -= dt;
      if (this.trail && this.sparks <= 0) {
        this.sparks = 0.06;
        fx.spark(this.x - this.dir * this.w * 0.4 + rand(-6, 6), this.y + rand(-4, 10));
      }
      return p < 1;
    }

    onHover(on) {
      if (on) sound.play('swoosh');
    }

    onActivate() {
      this.roll = 0.7;
    }

    get top() {
      return this.y - this.h * 0.4;
    }
  }

  // A cobweb in the corner of a card or an image. It grows out of the corner,
  // follows the element as the page scrolls, and is gone once it's far away.
  class Web extends Actor {
    constructor(spot) {
      super('web', 'web', sized('web'), sprite('web'));
      this.perch = spot;
      this.side = spot.side;
      this.grow = 0;
      this.alpha = 1;
      this.go('grow');
    }

    step(dt) {
      const r = follow(this.perch);
      if (!r || r.bottom < -stage.h * 1.5 || r.top > stage.h * 2.5) return false;
      this.x = this.side === 'left' ? r.left : r.right;
      this.y = r.top;
      if (this.phase === 'grow') {
        this.grow = Math.min(1, this.grow + dt / (state.still ? 0.01 : 1.1));
        if (this.grow >= 1) this.go('hold');
      } else if (this.phase === 'fade') {
        this.grow = Math.max(0, this.grow - dt / 0.5);
        if (this.grow <= 0) return false;
      }
      return true;
    }

    render() {
      const g = ease.outCubic(this.grow);
      this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0) scale(${(this.side === 'left' ? 1 : -1) * g}, ${g})`;
      this.el.style.opacity = String(Math.min(1, this.grow * 2));
    }

    leave() {
      if (this.leaving) return;
      this.leaving = true;
      this.go('fade');
      stage?.wake();
    }
  }

  // ---------------------------------------------------------------------------
  // Speech: the ghost's greeting bubble and the small hint over whoever is hovered.

  class Bubble {
    constructor(ghost) {
      this.ghost = ghost;
      this.el = document.createElement('div');
      this.el.className = 'bubble gone';
      this.el.innerHTML =
        '<p class="text"><span class="typing"><i></i><i></i><i></i></span></p>' +
        '<span class="ask"><span class="label"></span><b aria-hidden="true">→</b></span><button class="close" type="button">×</button>';
      this.el.querySelector('.label').textContent = label('ask');
      this.el.querySelector('.close').title = label('dismiss');
      this.el.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.target.closest('.close')) ghost.dismiss();
        else ghost.activate();
      });
      this.el.addEventListener('pointerenter', () => (this.hovered = true));
      this.el.addEventListener('pointerleave', () => (this.hovered = false));
      this.shown = false;
      this.alpha = 0;
      this.side = '';
      stage.fx.append(this.el);
      stage.followers.add(this);
    }

    show() {
      this.shown = true;
      this.el.classList.remove('gone');
      quietStandGreeting(true);
      this.measure();
      clearTimeout(this.typing);
      const text = this.el.querySelector('.text');
      const line = this.ghost.greeting;
      this.typing = setTimeout(() => {
        text.textContent = line;
        this.measure();
        if (!look().typewriter || state.still) return;
        // NC-17 types it out, one character at a time.
        let shown = 0;
        const type = () => {
          shown += 1;
          text.textContent = line.slice(0, shown);
          if (shown < line.length) this.typing = setTimeout(type, line[shown - 1] === '.' ? 260 : 34);
        };
        type();
      }, state.still ? 0 : 750);
    }

    hide() {
      this.shown = false;
      this.el.classList.add('gone');
    }

    measure() {
      this.bw = this.el.offsetWidth;
      this.bh = this.el.offsetHeight;
    }

    update(dt) {
      const g = this.ghost;
      this.alpha = approach(this.alpha, this.shown ? 1 : 0, 12, dt);
      if (!this.shown && this.alpha < 0.01) {
        this.el.style.opacity = '0';
        return;
      }
      const W = stage.w;
      const H = stage.h;
      const roomRight = g.x + g.w * 0.45 + this.bw < W - 12;
      const roomLeft = g.x - g.w * 0.45 - this.bw > 12;
      const side = (g.side === 'right' && roomRight) || (g.side === 'left' && !roomLeft) ? 'right'
        : g.side === 'left' || g.x > W * 0.55 || !roomRight ? 'left' : 'right';
      if (side !== this.side) {
        this.el.classList.remove(this.side || 'x');
        this.el.classList.add(side);
        this.side = side;
      }
      const gap = g.w * 0.42;
      let x = side === 'left' ? g.x - gap - this.bw : g.x + gap;
      let y = g.baseY - g.h * 0.2 - this.bh + 28;
      x = clamp(x, 12, W - this.bw - 12);
      y = clamp(y, 12, H - this.bh - 12);
      const s = 0.86 + 0.14 * this.alpha;
      this.el.style.transformOrigin = side === 'left' ? '100% 85%' : '0 85%';
      this.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
      this.el.style.opacity = (this.alpha * (g.alpha < 0.5 ? 0.6 : 1)).toFixed(3);
    }

    remove() {
      clearTimeout(this.typing);
      stage?.followers.delete(this);
      this.el.remove();
      quietStandGreeting(false);
    }
  }

  const hint = {
    el: null,
    target: null,
    show(creature) {
      if (!stage || creature.kind === 'ghost') return;
      if (!this.el) {
        this.el = document.createElement('div');
        this.el.className = 'hint';
        this.el.innerHTML = '<span></span><small></small>';
      }
      if (!this.el.isConnected) stage.fx.append(this.el);
      this.el.firstChild.textContent = firstSentence(creature.greeting);
      this.el.lastChild.textContent = label('hint');
      this.target = creature;
      this.size = [this.el.offsetWidth, this.el.offsetHeight];
      this.el.classList.add('on');
      stage.followers.add(this);
      stage.wake();
    },
    hide(creature) {
      if (this.target !== creature || !this.el) return;
      this.target = null;
      this.el.classList.remove('on');
      stage?.followers.delete(this);
    },
    update() {
      const c = this.target;
      if (!c) return;
      const [w, h] = this.size;
      const x = clamp(c.x - w / 2, 8, stage.w - w - 8);
      const above = c.top - h - 10;
      const y = above < 8 ? c.y + c.h * 0.42 : above;
      this.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    },
  };

  function label(key) {
    return config.labels[key] ?? look().labels[key];
  }

  // ---------------------------------------------------------------------------
  // Effects: what bursts out when something is clicked, puffs, sparks, smoke.

  const fx = {
    burst(x, y) {
      if (state.still || !stage) return;
      const kind = look().burst;
      if (kind === 'embers') return this.embers(x, y);
      if (kind === 'moths') return this.moths(x, y);
      if (kind === 'swarm') return this.swarm(x, y);
      this.treats(x, y, TREATS[kind]);
    },
    add(className, html = '') {
      const el = document.createElement('div');
      el.className = className;
      el.innerHTML = html;
      stage.fx.append(el);
      return el;
    },
    // Animates an element along path(p) => [x, y, rotation, scale, opacity].
    fly(el, life, path) {
      const frames = [];
      for (let k = 0; k <= 14; k++) {
        const [px, py, rot = 0, s = 1, o = 1] = path(k / 14);
        frames.push({ transform: `translate3d(${f1(px)}px, ${f1(py)}px, 0) rotate(${rot.toFixed(0)}deg) scale(${s.toFixed(2)})`, opacity: o });
      }
      el.animate(frames, { duration: life * 1000, easing: 'linear', fill: 'forwards' }).onfinish = () => el.remove();
    },
    treats(x, y, kinds) {
      for (let i = 0; i < 12; i++) {
        const el = this.add('treat', pick(kinds)());
        const [vx, vy, spin, life] = [rand(-180, 180), rand(-470, -230), rand(-600, 600), rand(0.9, 1.3)];
        this.fly(el, life, (p) => {
          const t = p * life;
          return [x + vx * t - 11, y + vy * t + 490 * t * t - 11, spin * t, p ? 1 : 0.3, p > 0.7 ? (1 - p) / 0.3 : 1];
        });
      }
    },
    embers(x, y) {
      this.poof(x, y, 6, 0.9);
      for (let i = 0; i < 18; i++) {
        const el = this.add('ember');
        const [vx, vy, life, wobble] = [rand(-70, 70), rand(-150, -60), rand(1.1, 1.9), rand(6, 16)];
        this.fly(el, life, (p) => {
          const t = p * life;
          return [x + vx * t + Math.sin(t * 7 + i) * wobble, y + vy * t - 60 * t * t, 0, 1 - p * 0.5, p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85];
        });
      }
    },
    moths(x, y) {
      for (let i = 0; i < 7; i++) {
        const el = this.add('moth', MOTH);
        const [vx, vy, life] = [rand(-120, 120), rand(-170, -90), rand(1.4, 2)];
        this.fly(el, life, (p) => {
          const t = p * life;
          return [x + vx * t + Math.sin(t * 9 + i * 2) * 14, y + vy * t + Math.cos(t * 7 + i) * 10, Math.sin(t * 8 + i) * 25, 0.6 + p * 0.4, p > 0.75 ? (1 - p) / 0.25 : 1];
        });
      }
    },
    swarm(x, y) {
      for (let i = 0; i < 11; i++) {
        const el = this.add('minibat', MINI_BAT);
        const a = rand(0, Math.PI * 2);
        const [speed, life] = [rand(260, 420), rand(0.8, 1.2)];
        this.fly(el, life, (p) => {
          const d = speed * life * (1 - (1 - p) ** 2);
          return [x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7 - 40 * p, Math.cos(a) * 20, 0.6 + p * 0.6, p > 0.7 ? (1 - p) / 0.3 : 1];
        });
      }
      for (let i = 0; i < 6; i++) this.spark(x + rand(-20, 20), y + rand(-20, 20), 'red');
    },
    poof(x, y, count = 7, size = 1) {
      if (state.still || !stage) return;
      for (let i = 0; i < count; i++) {
        const el = this.add('puff');
        const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
        const r = rand(18, 34) * size;
        el.animate(
          [
            { transform: `translate3d(${x}px, ${y}px, 0) scale(${0.3 * size})`, opacity: 0.95 },
            { transform: `translate3d(${x + Math.cos(a) * r}px, ${y + Math.sin(a) * r - 10}px, 0) scale(${1.5 * size})`, opacity: 0 },
          ],
          { duration: rand(550, 800), easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
        ).onfinish = () => el.remove();
      }
    },
    smoke(x, y) {
      if (state.still || !stage) return;
      const el = this.add('puff smoke');
      el.animate(
        [
          { transform: `translate3d(${x}px, ${y}px, 0) scale(.4)`, opacity: 0 },
          { transform: `translate3d(${x + rand(-6, 6)}px, ${y - 20}px, 0) scale(.9)`, opacity: 0.9, offset: 0.25 },
          { transform: `translate3d(${x + rand(-18, 18)}px, ${y - 70}px, 0) scale(1.8)`, opacity: 0 },
        ],
        { duration: 2200, easing: 'ease-out', fill: 'forwards' },
      ).onfinish = () => el.remove();
    },
    spark(x, y, tone = '') {
      if (state.still || !stage) return;
      const el = this.add(`spark ${tone}`);
      el.animate(
        [
          { transform: `translate3d(${x}px, ${y}px, 0) scale(1) rotate(0deg)`, opacity: 1 },
          { transform: `translate3d(${x + rand(-10, 10)}px, ${y + rand(10, 26)}px, 0) scale(.2) rotate(90deg)`, opacity: 0 },
        ],
        { duration: rand(450, 700), easing: 'ease-out', fill: 'forwards' },
      ).onfinish = () => el.remove();
    },
    float(x, y, text, className = '') {
      if (state.still || !stage) return;
      const el = this.add(`float ${className}`);
      el.textContent = text;
      el.animate(
        [
          { transform: `translate3d(${x}px, ${y}px, 0) scale(.6)`, opacity: 0 },
          { transform: `translate3d(${x + 8}px, ${y - 16}px, 0) scale(1)`, opacity: 1, offset: 0.3 },
          { transform: `translate3d(${x + 18}px, ${y - 44}px, 0) scale(1.1)`, opacity: 0 },
        ],
        { duration: 1500, easing: 'ease-out', fill: 'forwards' },
      ).onfinish = () => el.remove();
    },
  };

  // ---------------------------------------------------------------------------
  // Sounds, synthesized on the spot. Off unless configured, and silent until the
  // visitor's first click or key press, as browsers require.

  const sound = {
    ctx: null,
    out: null,
    noise: null,
    unlock() {
      if (!config.sound) return;
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      if (!this.ctx) {
        this.ctx = new Context();
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.2;
        this.out.connect(this.ctx.destination);
        const length = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },
    play(name) {
      if (!config.sound || this.ctx?.state !== 'running' || document.hidden) return;
      try {
        SOUNDS[name]?.(this, this.ctx.currentTime + 0.01);
      } catch {}
    },
    tone(t, { type = 'sine', from, to = from, dur, gain = 0.4, attack = 0.01 }) {
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + dur);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(gain, t + attack);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(amp).connect(this.out);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    },
    hiss(t, { dur, from, to, q = 1, gain = 0.3, type = 'bandpass', wobble = 0 }) {
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const amp = this.ctx.createGain();
      source.buffer = this.noise;
      source.loop = true;
      filter.type = type;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(from, t);
      filter.frequency.exponentialRampToValueAtTime(to, t + dur);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.08, dur / 3));
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      if (wobble) {
        const lfo = this.ctx.createOscillator();
        const depth = this.ctx.createGain();
        lfo.frequency.value = wobble;
        depth.gain.value = gain * 0.8;
        lfo.connect(depth).connect(amp.gain);
        lfo.start(t);
        lfo.stop(t + dur);
      }
      source.connect(filter).connect(amp).connect(this.out);
      source.start(t);
      source.stop(t + dur + 0.05);
    },
  };

  const SOUNDS = {
    boo(s, t) { // A theremin's "ooo-OOO-ooo", lower and darker as the rating goes up.
      const pitch = { g: 1, pg: 1, 'pg-13': 0.8, r: 0.6, 'nc-17': 0.42 }[config.rating];
      const osc = s.ctx.createOscillator();
      const vibrato = s.ctx.createOscillator();
      const depth = s.ctx.createGain();
      const amp = s.ctx.createGain();
      osc.type = config.rating === 'nc-17' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(330 * pitch, t);
      osc.frequency.linearRampToValueAtTime(523 * pitch, t + 0.5);
      osc.frequency.linearRampToValueAtTime(392 * pitch, t + 1.25);
      vibrato.frequency.value = 5.5 * Math.sqrt(pitch);
      depth.gain.value = 9 * pitch;
      vibrato.connect(depth).connect(osc.frequency);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.32, t + 0.3);
      amp.gain.setValueAtTime(0.32, t + 0.85);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(amp).connect(s.out);
      osc.start(t);
      vibrato.start(t);
      osc.stop(t + 1.45);
      vibrato.stop(t + 1.45);
      if (pitch < 0.7) s.hiss(t, { dur: 1.4, from: 900, to: 300, q: 2, gain: 0.12 }); // A breath under it.
    },
    squeak(s, t) {
      s.tone(t, { from: 2600, to: 3900, dur: 0.06, gain: 0.12 });
      s.tone(t + 0.09, { from: 2900, to: 4400, dur: 0.05, gain: 0.1 });
    },
    boing(s, t) {
      s.tone(t, { type: 'triangle', from: 170, to: 520, dur: 0.3, gain: 0.25 });
    },
    pop(s, t) {
      s.tone(t, { from: 160, to: 55, dur: 0.18, gain: 0.45 });
      s.hiss(t, { dur: 0.12, from: 1800, to: 900, q: 0.8, gain: 0.25 });
    },
    purr(s, t) {
      s.hiss(t, { dur: 0.9, from: 260, to: 200, q: 0.7, gain: 0.35, type: 'lowpass', wobble: 23 });
    },
    swoosh(s, t) {
      s.hiss(t, { dur: 0.55, from: 400, to: 2600, q: 1.4, gain: 0.22 });
    },
    treat(s, t) {
      const notes = ['r', 'nc-17'].includes(config.rating) ? [659, 622, 587, 554] : [1319, 1568, 1976, 2637];
      notes.forEach((f, i) => s.tone(t + i * 0.06, { type: 'triangle', from: f, dur: 0.25, gain: 0.12 }));
    },
  };

  // ---------------------------------------------------------------------------
  // Stand: wait for its API, open the chat, and notice when it opens or closes.

  function waitForStand(callback, tries = 0) {
    if (window.StandChat) return callback(window.StandChat);
    if (tries < 150) return void setTimeout(() => waitForStand(callback, tries + 1), 100);
    console.info('[Halloween mode] Stand Chat isn’t on this page, so nobody would answer. Staying in the box.');
  }

  function openChat(kind, greeting, rated = config.rating) {
    const stand = window.StandChat;
    emit('open', { creature: kind, greeting, rating: rated });
    if (!stand) return console.warn('[Halloween mode] Add Stand’s script to the page to open the chat.');
    const looks = LOOKS[rated];
    const prompt = [
      config.prompt.replaceAll('{who}', looks.who[kind] ?? kind).replaceAll('{name}', looks.names[kind] ?? kind).replaceAll('{tone}', looks.tone),
      config.context,
    ].filter(Boolean).join('\n\n');
    stand.openChat(greeting, { prompt, analyticsId: `halloween-${kind}` });
  }

  const standChat = () => document.querySelector('stand-chat');

  function launcherRect() {
    const button = standChat()?.shadowRoot?.getElementById('avatar-btn');
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return r.width > 8 && r.height > 8 && r.right > 0 && r.left < innerWidth && r.bottom > 0 ? r : null;
  }

  const centerOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  // One greeting at a time: while the ghost talks, Stand's own greeting bubble steps aside.
  const quieted = new WeakSet();
  function quietStandGreeting(on) {
    const element = standChat();
    const root = element?.shadowRoot;
    if (!root) return;
    if (on && !quieted.has(root)) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(':host([data-halloween-ghost]) #greeting-bubble { visibility: hidden !important; opacity: 0 !important; }');
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
        quieted.add(root);
      } catch {
        return;
      }
    }
    element.toggleAttribute('data-halloween-ghost', on);
  }

  // stand.js marks its element with .widget-open while the chat panel is open.
  function watchChat() {
    const attach = () => {
      const element = standChat();
      if (!element) return false;
      const sync = () => setChatOpen(element.classList.contains('widget-open'));
      new MutationObserver(sync).observe(element, { attributes: true, attributeFilter: ['class'] });
      sync();
      return true;
    };
    if (attach()) return;
    const waiting = new MutationObserver(() => attach() && waiting.disconnect());
    waiting.observe(document.body, { childList: true });
  }

  function setChatOpen(open) {
    if (state.chatOpen === open) return;
    state.chatOpen = open;
    costume.place();
    if (!state.running) return;
    if (open) {
      // Everyone steps back while there's a conversation. The cobwebs can stay.
      for (const actor of stage?.actors ?? []) {
        if (actor.kind === 'web') continue;
        if (!actor.clicked) actor.leave?.();
        else setTimeout(() => actor.leave?.(), 900);
      }
      director.stop();
    } else {
      state.lastActivity = now();
      director.schedule(rand(8, 14));
    }
  }

  // ---------------------------------------------------------------------------
  // The costume: Stand's chat button dresses up (a hat, or horns for NC-17), in
  // a layer of its own just above the widget.

  const costume = {
    host: null,
    hat: null,
    timer: 0,
    wear() {
      if (config.costume === 'none' || this.host) return;
      const { host, root } = createHost('stand-halloween-costume', 2147483647);
      this.hat = document.createElement('div');
      this.hat.className = 'hat';
      this.hat.append(sprite('hat'));
      root.append(this.hat);
      this.host = host;
      this.tilt = { g: -14, pg: -14, 'pg-13': -12, r: -16, 'nc-17': 0 }[config.rating];
      this.aspect = RIGS[config.rating].hat.size[1] / RIGS[config.rating].hat.size[0];
      document.body.append(host);
      this.timer = setInterval(() => this.place(), 250);
      this.place();
    },
    place() {
      if (!this.host) return;
      const element = standChat();
      // Same z-index as Stand's widget, so it has to come after it to be on top.
      if (element?.parentNode && element.compareDocumentPosition(this.host) & Node.DOCUMENT_POSITION_PRECEDING) element.after(this.host);
      const r = state.chatOpen ? null : launcherRect();
      if (!r) return void this.hat.classList.remove('on');
      const horns = config.rating === 'nc-17';
      const w = r.width * (horns ? 1.1 : 1.02);
      const h = w * this.aspect;
      const x = r.left + r.width * (horns ? 0.5 : 0.47) - w / 2;
      const y = r.top + r.height * (horns ? 0.42 : 0.2) - h * (horns ? 1 : 0.9);
      Object.assign(this.hat.style, { width: `${w}px`, height: `${h}px`, transform: `translate3d(${x}px, ${y}px, 0) rotate(${this.tilt}deg)` });
      this.hat.classList.add('on');
    },
    remove() {
      if (!this.host) return;
      clearInterval(this.timer);
      const host = this.host;
      this.hat.classList.add('off');
      this.host = null;
      setTimeout(() => host.remove(), state.still ? 0 : 1100);
    },
  };

  // ---------------------------------------------------------------------------
  // The director decides who visits and when. The ghost has its own schedule:
  // idleness. Cobwebs come and go with what's on screen.

  const director = {
    timer: 0,
    schedule(seconds) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.visit(), seconds * 1000);
    },
    stop() {
      clearTimeout(this.timer);
      this.timer = 0;
    },
    visit() {
      if (!state.running) return;
      const level = HAUNTS[config.haunt];
      if (!quiet() && visitors().length < (narrow() ? 1 : level.together)) {
        const kind = chooseVisitor();
        if (kind) summon(kind);
      }
      spinWebs();
      this.schedule(rand(...level.every) * (state.dismissed ? 1.8 : 1));
    },
  };

  function quiet() {
    if (document.hidden || state.chatOpen) return true;
    const active = document.activeElement;
    return Boolean(active?.matches?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
  }

  // Characters on screen right now, not counting the ghost, cobwebs, or anyone
  // who scrolled away with their perch.
  const visitors = () =>
    [...(stage?.actors ?? [])].filter((a) => a.kind !== 'ghost' && a.kind !== 'web' && !a.leaving && a.y > -a.h && a.y < stage.h + a.h);

  function chooseVisitor() {
    const present = new Set(visitors().map((a) => a.kind));
    let options = config.cast.filter((k) => k !== 'ghost' && !present.has(k));
    if (state.still) options = options.filter((k) => STILL_CAST.includes(k));
    if (now() - state.lastBroom < 120e3) options = options.filter((k) => k !== 'broom');
    if (options.length > 1) options = options.filter((k) => k !== state.lastKind);
    const total = options.reduce((sum, k) => sum + WEIGHTS[k], 0);
    let roll = Math.random() * total;
    return options.find((k) => (roll -= WEIGHTS[k]) < 0) ?? options[0];
  }

  function summon(kind, options = {}) {
    if (!ready(config.rating)) {
      // Still downloading the characters: they come on as soon as they're here.
      const rated = config.rating;
      loadAtlas(rated).then(() => state.running && config.rating === rated && summon(kind, options), () => {});
      return true;
    }
    if (!stage) return false;
    if (kind === 'bat') kind = 'bats';
    if (!stage || !KINDS.includes(kind)) return false;
    if (state.still && !STILL_CAST.includes(kind)) return false;
    switch (kind) {
      case 'ghost':
        if (state.ghost) return false;
        state.ghostVisits++;
        state.ghost = stage.add(new Ghost(options));
        break;
      case 'bats': {
        const swarm = config.rating === 'nc-17';
        const dir = options.from === 'left' ? 1 : options.from === 'right' ? -1 : pick([1, -1]);
        const [few, many] = look().bats;
        const count = clamp(Math.round(options.count ?? rand(few - 0.49, many + 0.49)), 1, 12);
        const y = resolveY(options.y) ?? rand(0.14, 0.42) * stage.h;
        let hang = null;
        if (options.hang ?? Math.random() < 0.35) {
          const ceiling = options.x == null && !options.top ? findCeiling(70, 60) : null;
          hang = ceiling && Math.random() < 0.7 ? ceiling : { x: resolveX(options.x) ?? freeX(70, 0, 56, [0.12, 0.88], 'top') };
          if (!hang.el && noRoom(options)) hang = null;
        }
        for (let i = 0; i < count; i++) {
          const hangs = i === count - 1 ? hang : null;
          const bat = new Bat({ dir, y: y + rand(-30, 30) + (i % 4) * 22, delay: i * rand(0.12, swarm ? 0.22 : 0.5), hang: hangs, speed: options.speed, small: swarm && !hangs });
          if (hangs && !hangs.el) claim(bat, 'top', hangs.x, bat.w);
          stage.add(bat);
        }
        sound.play('squeak');
        break;
      }
      case 'spider':
      case 'pumpkin':
      case 'cat': {
        const Kind = { spider: Spider, pumpkin: Pumpkin, cat: Cat }[kind];
        const visitor = new Kind(options);
        if (visitor.unwelcome) return false; // Nowhere to settle that isn't in someone's way.
        stage.add(visitor);
        if (kind === 'spider') sound.play('boing');
        break;
      }
      case 'broom':
        state.lastBroom = now();
        stage.add(new Broom(options));
        sound.play('swoosh');
        break;
    }
    state.lastKind = kind;
    emit('visit', { creature: kind });
    return true;
  }

  // Keeps a couple of cobwebs on screen, in the corners of cards and images.
  function spinWebs() {
    if (!stage || !state.running || !ready(config.rating) || !config.webs || config.perch === 'off') return;
    const webs = [...stage.actors].filter((a) => a.kind === 'web' && !a.leaving);
    const inView = webs.filter((w) => w.perch.r.bottom > 0 && w.perch.r.top < stage.h);
    for (let i = inView.length; i < config.webs; i++) {
      const spot = findCorner(RIGS[config.rating].web.size[0] * DISPLAY.web * scale());
      if (!spot) break;
      stage.add(new Web(spot));
    }
  }

  // How much a spot of this size would cover: links, buttons, fields, the chat
  // button, another character, or text someone may be reading. Lower is better.
  function crowded(x, y, w, h) {
    let score = 0;
    for (const px of [0.15, 0.5, 0.85]) {
      for (const py of [0.2, 0.5, 0.8]) {
        const cx = x + (px - 0.5) * w;
        const cy = y + (py - 0.5) * h;
        if (cx < 0 || cy < 0 || cx >= stage.w || cy >= stage.h) continue;
        const hit = document.elementFromPoint(cx, cy);
        if (!hit) continue;
        if (hit === stage.host || hit.localName === 'stand-chat') score += 3;
        else if (hit.closest(INTERACTIVE)) score += 4;
        else if (hit.closest(READING)) score += 0.8;
      }
    }
    // Stay clear of Stand's chat button and the greeting bubble beside it.
    const button = launcherRect();
    if (button) {
      const overlaps = (left, top, right, bottom) => x + w / 2 > left && x - w / 2 < right && y + h / 2 > top && y - h / 2 < bottom;
      if (overlaps(button.left - 24, button.top - 24, button.right + 24, button.bottom + 24)) score += 8;
      if (overlaps(button.left - Math.min(290, stage.w * 0.55), button.top - 80, button.left, button.bottom)) score += 4;
    }
    return score;
  }

  // Picks a resting spot along a window edge (zone "top" or "bottom") that covers
  // the least, and isn't where another character already settled. When even the
  // best spot would sit on buttons or links, the character stays home.
  let crowding = 0;
  function freeX(width, top, height, [from, to], zone) {
    let best = null;
    for (let i = 0; i < 9; i++) {
      const x = rand(from, to) * stage.w;
      let score = crowded(x, top + height / 2, width, height) + Math.random() * 0.6;
      for (const other of stage.actors) {
        if (other.zone === zone && !other.leaving && Math.abs(other.spotX - x) < (width + other.spotW) / 2 + 30) score += 5;
      }
      if (!best || score < best.score) best = { x, score };
    }
    crowding = best.score;
    return best.x;
  }
  const noRoom = (options) => options.x == null && crowding > 6;

  function claim(actor, zone, x, width) {
    actor.zone = zone;
    actor.spotX = x;
    actor.spotW = width;
    return x;
  }

  function greetingFor(kind) {
    const own = config.greetings[kind];
    return pick(own ? [].concat(own) : look().lines[kind]);
  }

  function ghostGreeting() {
    const lines = config.greetings.ghost ? [].concat(config.greetings.ghost) : look().lines.ghost;
    return lines[(state.ghostVisits - 1 + lines.length) % lines.length];
  }

  // ---------------------------------------------------------------------------
  // Idleness: no pointer, keys, wheel, touch or scroll for `idle` seconds brings
  // the ghost out. Scrolling also wakes the loop and sends cobwebs to new corners.

  let settleTimer = 0;
  function activity(event) {
    state.lastActivity = now();
    if (event.type === 'pointermove' || event.type === 'pointerdown') {
      // Where it's been resting, and since when: the cat may come and sit by it.
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 14) pointer.since = now();
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.seen = event.pointerType !== 'touch';
    }
    if (event.type === 'scroll' || event.type === 'wheel' || event.type === 'touchstart') {
      stage?.wake();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(spinWebs, 700);
    }
    state.ghost?.visitorBack();
  }

  function checkIdle() {
    if (!state.running || state.ghost || state.dismissed || !config.cast.includes('ghost') || quiet()) return;
    const idle = (now() - state.lastActivity) / 1000;
    // Each visit, it rests longer before the next: 20 seconds, 40, 80.
    const rested = (now() - state.ghostLeftAt) / 1000 > 20 * 2 ** Math.max(0, state.ghostVisits - 1);
    if (idle >= config.idle && rested && state.ghostVisits < 4) summon('ghost');
  }

  let typed = '';
  function secretWord(event) {
    if (!state.running || event.metaKey || event.ctrlKey || event.altKey || quiet() || event.key.length !== 1) return;
    typed = (typed + event.key.toLowerCase()).slice(-3);
    if (typed === 'boo' && !state.ghost) summon('ghost');
  }

  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    addEventListener(type, activity, { capture: true, passive: true });
  }
  addEventListener('pointerdown', () => sound.unlock(), { capture: true, passive: true });
  addEventListener('keydown', (event) => {
    sound.unlock();
    secretWord(event);
    if (event.key === 'Escape' && state.ghost?.bubble.shown) state.ghost.dismiss();
  }, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      state.lastActivity = now();
      stage?.wake();
    }
  });
  document.addEventListener('stand-chat-panel-open', () => setChatOpen(true));
  setInterval(checkIdle, 400);

  // ---------------------------------------------------------------------------
  // Starting, stopping and the public API.

  function emit(type, detail = {}) {
    document.dispatchEvent(new CustomEvent(`stand-halloween-${type}`, { detail }));
  }

  // The parade: everyone arrives at once, and the ghost says hi last.
  function parade() {
    const cast = config.cast;
    const at = (seconds, kind, options) => cast.includes(kind) && setTimeout(() => state.running && summon(kind, options), seconds * 1000);
    setTimeout(spinWebs, 300);
    if (state.still) {
      at(0.2, 'pumpkin');
      at(0.6, 'cat');
      at(1, 'ghost');
      return;
    }
    at(0, 'bats', { hang: true });
    at(0.35, 'pumpkin');
    at(0.8, 'spider');
    at(1.2, 'cat');
    at(2, 'ghost');
  }

  let watching = false;

  function start({ parade: withParade = true } = {}) {
    if (state.running) return;
    if (!document.body) return void document.addEventListener('DOMContentLoaded', () => start({ parade: withParade }), { once: true });
    state.running = true;
    state.stopped = false;
    state.lastActivity = now();
    const rated = config.rating;
    emit('start', { rating: rated });
    loadAtlas(rated).then(
      () => state.running && config.rating === rated && !stage && begin(withParade),
      (error) => {
        console.warn(error.message);
        stop();
      },
    );
  }

  // Once the rating's image is here: the stage, the costume, and the first guests.
  function begin(withParade) {
    stage = new Stage();
    stage.rate(config.rating);
    costume.wear();
    if (!watching) watchChat();
    watching = true;
    if (withParade && !state.chatOpen) {
      parade();
      director.schedule(rand(14, 20));
    } else {
      setTimeout(spinWebs, 1200);
      director.schedule(rand(3, 6));
    }
  }

  function stop() {
    if (!state.running) return;
    state.running = false;
    state.stopped = true;
    director.stop();
    costume.remove();
    for (const actor of stage?.actors ?? []) actor.leave?.(true);
    // Take the stage down once the last one has left.
    const finished = stage;
    const tidy = () => {
      if (state.running || stage !== finished) return;
      if (finished?.actors.size) return void setTimeout(tidy, 400);
      finished?.destroy();
      stage = null;
    };
    setTimeout(tidy, 400);
    emit('stop');
  }

  // A new rating sends everyone home and brings the new cast on with a parade.
  let recasting = 0;
  function recast(withParade) {
    for (const actor of stage?.actors ?? []) actor.leave?.(true);
    costume.remove();
    clearTimeout(recasting);
    const rated = config.rating;
    const asked = now();
    loadAtlas(rated).then(
      () => {
        clearTimeout(recasting);
        recasting = setTimeout(() => {
          if (!state.running || config.rating !== rated) return;
          if (!stage) return void begin(withParade);
          stage.rate(rated);
          costume.wear();
          if (withParade && !state.chatOpen) parade();
          else setTimeout(spinWebs, 300);
        }, Math.max(0, 700 - (now() - asked)));
      },
      (error) => console.warn(error.message),
    );
  }

  function configure(changes = {}) {
    const before = { rating: config.rating, costume: config.costume, webs: config.webs, perch: config.perch };
    Object.assign(config, changes, {
      greetings: { ...config.greetings, ...changes.greetings },
      labels: { ...config.labels, ...changes.labels },
    });
    normalize(config);
    if (state.running) {
      if (before.rating !== config.rating) recast(changes.parade !== false);
      else if (before.costume !== config.costume) {
        if (config.costume === 'none') costume.remove();
        else costume.wear();
      }
      if (before.rating === config.rating && (before.webs !== config.webs || before.perch !== config.perch)) {
        const webs = [...(stage?.actors ?? [])].filter((a) => a.kind === 'web' && !a.leaving);
        webs.slice(config.perch === 'off' ? 0 : config.webs).forEach((w) => w.leave());
        spinWebs();
      }
    }
    for (const actor of stage?.actors ?? []) if (actor.kind !== 'web' && !config.cast.includes(actor.kind)) actor.leave?.();
    if (config.sound) sound.unlock();
    emit('change', { rating: config.rating });
    return window.StandHalloween.config;
  }

  // A character at rest, for your own pages (docs, a 404): an element that fills
  // the box you put it in and fits the character inside, like object-fit: contain.
  function staticArt(kind, rated = config.rating) {
    const r = rating(rated) ?? config.rating;
    const name = ART_NAMES[kind] ?? kind;
    if (!RIGS[r][name]) return null;
    const [w, h] = RIGS[r][name].size;
    const frame = document.createElement('div');
    frame.className = `stand-halloween-art art-${name}`;
    Object.assign(frame.style, { position: 'relative', width: '100%', height: '100%', containerType: 'size' });
    const fit = document.createElement('div');
    Object.assign(fit.style, {
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      width: `min(100cqw, ${(100 * w) / h}cqh)`, height: `min(100cqh, ${(100 * h) / w}cqw)`,
    });
    fit.append(sprite(name, r));
    frame.append(fit);
    loadAtlas(r).catch((error) => console.warn(error.message));
    return frame;
  }

  window.StandHalloween = {
    version: VERSION,
    start,
    stop,
    toggle: () => (state.running ? stop() : start()),
    get running() {
      return state.running;
    },
    summon: (kind, options) => (state.running ? summon(kind, options) : false),
    configure,
    get config() {
      return { ...config, cast: [...config.cast], greetings: { ...config.greetings }, labels: { ...config.labels } };
    },
    ratings: RATINGS.map((key) => ({ key, label: LOOKS[key].label, title: LOOKS[key].title, blurb: LOOKS[key].blurb })),
    look: (rated = config.rating) => JSON.parse(JSON.stringify(LOOKS[rating(rated) ?? config.rating])),
    inSeason: (date) => inSeason(config.season, date),
    art: staticArt,
  };

  function boot() {
    if (urlSwitch === 'off' || !config.autostart) return;
    if (urlSwitch == null && !inSeason(config.season)) return;
    loadAtlas(config.rating).catch(() => {}); // Start downloading while Stand gets ready.
    waitForStand((stand) => stand.whenAvailable(() => state.running || state.stopped || start({ parade: false })));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
