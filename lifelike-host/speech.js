// Turns a reply into a performance timeline: words with times, the mouth shapes (visemes) inside
// each word, stressed words for beats and nods, and sentence and phrase boundaries. Also plays
// the optional browser voice and keeps the timeline in step with it.
//
// Mouth shapes use the Rhubarb/Preston Blair set the Bitmagic GDK's MetaHumanSpeech maps to
// ARKit blendshapes: A closed (M B P), B teeth (most consonants, EE), C open (EH), D wide (AA),
// E rounded (AO, ER, R), F puckered (OO, W), G lip on teeth (F V), H tongue (L, TH), X rest.

// Letter-to-shape rules, longest match first. English spelling is irregular, but the mouth only
// needs the broad shape, and a wrong guess inside a word is invisible at speaking speed.
const RULES = [
  ['tch', 'B'], ['sch', 'B'], ['igh', 'D'], ['ough', 'E'], ['augh', 'E'], ['eigh', 'C'],
  ['th', 'H'], ['sh', 'B'], ['ch', 'B'], ['ph', 'G'], ['wh', 'F'], ['qu', 'F'], ['ng', 'B'], ['ck', 'B'],
  ['oo', 'F'], ['ou', 'D'], ['ow', 'E'], ['oi', 'E'], ['oy', 'E'], ['ee', 'B'], ['ea', 'B'], ['ie', 'B'],
  ['ei', 'C'], ['ai', 'C'], ['ay', 'C'], ['au', 'E'], ['aw', 'E'], ['ew', 'F'], ['ue', 'F'], ['ui', 'F'],
  ['ar', 'D'], ['or', 'E'], ['er', 'E'], ['ir', 'E'], ['ur', 'E'],
  ['a', 'D'], ['e', 'C'], ['i', 'B'], ['o', 'E'], ['u', 'C'], ['y', 'B'],
  ['m', 'A'], ['b', 'A'], ['p', 'A'], ['f', 'G'], ['v', 'G'], ['w', 'F'], ['l', 'H'], ['r', 'E'],
  ['t', 'B'], ['d', 'B'], ['n', 'B'], ['s', 'B'], ['z', 'B'], ['c', 'B'], ['k', 'B'], ['g', 'B'],
  ['j', 'B'], ['x', 'B'], ['h', 'C'], ['q', 'B'],
];
const VOWEL = new Set(['C', 'D', 'E', 'F']);
const LONG_VOWEL = { a: 'C', e: 'B', i: 'D', o: 'E', u: 'F', y: 'D' };
// Relative duration of each shape inside a word: vowels carry the time.
const WEIGHT = { A: 0.8, B: 0.7, C: 1.25, D: 1.4, E: 1.2, F: 1.1, G: 0.8, H: 0.75 };

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function spellNumber(n) {
  if (n < 20) return NUMBER_WORDS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${NUMBER_WORDS[n % 10]}` : '');
  if (n < 1000) return `${NUMBER_WORDS[Math.floor(n / 100)]} hundred${n % 100 ? ` ${spellNumber(n % 100)}` : ''}`;
  if (n < 1e6) return `${spellNumber(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${spellNumber(n % 1000)}` : ''}`;
  return String(n).split('').map((d) => NUMBER_WORDS[+d]).join(' ');
}

// What the mouth says for a written token: digits, symbols and units are spoken as words.
function spoken(token) {
  return token
    .replace(/€/g, ' euros ').replace(/\$/g, ' dollars ').replace(/%/g, ' percent ').replace(/°C/g, ' degrees ')
    .replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/−|-(?=\d)/g, ' minus ')
    .replace(/\d+/g, (d) => ` ${spellNumber(+d)} `)
    .toLowerCase().replace(/[^a-z' ]+/g, ' ').trim();
}

export function visemesForWord(word) {
  let w = spoken(word).replace(/'/g, '');
  const out = [];
  for (const part of w.split(/\s+/).filter(Boolean)) {
    let s = part;
    // A long vowel before a silent e (time, home, make) or at the end (hi, my) opens wider.
    let long = -1;
    const magic = /[aeiouy][^aeiouwy]e$/.exec(s);
    if (magic && s.length > 3) long = magic.index;
    else if (/^[^aeiou]*[iy]$/.test(s)) long = s.length - 1;
    if (s.length > 3 && s.endsWith('e') && !/[aeiou]e$/.test(s)) s = s.slice(0, -1); // silent e
    for (let i = 0; i < s.length;) {
      const rule = i === long ? [s[i], LONG_VOWEL[s[i]] ?? 'C'] : RULES.find(([letters]) => s.startsWith(letters, i));
      if (!rule) { i++; continue; }
      const [letters, shape] = rule;
      // Doubled consonants are one sound.
      if (out.length && out[out.length - 1] === shape && !VOWEL.has(shape)) { i += letters.length; continue; }
      out.push(shape);
      i += letters.length;
    }
  }
  return out.length ? out : ['C'];
}

const syllables = (shapes) => Math.max(1, shapes.filter((s) => VOWEL.has(s)).length);

// Words that carry meaning get beats, nods and brow lifts; function words do not.
const FUNCTION_WORDS = new Set(('a an the and or but if so to of in on at by for with from as is are was were be been it its ' +
  "this that these those i you we they he she me us them my your our their there here what which who how do does did can " +
  "will would could should has have had not no yes just also than then into about over up out it's that's i'm you're we're " +
  "i'll you'll we'll don't doesn't isn't aren't can't won't let's").split(' '));

/**
 * Build the timeline for `text` (already stripped of markup). `refs` are [{index, name}] where a
 * page reference sits, as character offsets into the text.
 * Times are in seconds at `rate` (1 = about 160 words a minute).
 */
export function buildTimeline(text, { rate = 1, refs = [] } = {}) {
  const words = [];
  const re = /\S+/g;
  let m;
  let t = 0.12; // a breath before the first word
  let sentence = 0;
  let sentenceStart = true;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const clean = raw.replace(/^[("'“‘]+|[)"'”’.,!?;:…]+$/g, '');
    const shapes = visemesForWord(clean || raw);
    const syl = syllables(shapes);
    const dur = (0.11 + 0.135 * syl + 0.012 * shapes.length) / rate;
    const lower = clean.toLowerCase();
    const stressed = !FUNCTION_WORDS.has(lower) && (clean.length > 3 || /\d/.test(clean));
    const word = {
      text: raw, start: t, end: t + dur, shapes: [], index: m.index, length: raw.length,
      stressed, emphatic: stressed && (/\d/.test(clean) || /^[A-Z]/.test(clean) && !sentenceStart || syl >= 3),
      sentence, sentenceStart, question: false, sentenceEnd: false, phraseEnd: false,
      ref: refs.find((r) => r.index >= m.index && r.index < m.index + raw.length) || null,
    };
    // Spread the shapes over the word by weight.
    const total = shapes.reduce((s, x) => s + WEIGHT[x], 0);
    let at = word.start;
    for (const shape of shapes) {
      const d = (dur * WEIGHT[shape]) / total;
      word.shapes.push({ shape, start: at, end: at + d });
      at += d;
    }
    words.push(word);
    t = word.end;
    sentenceStart = false;
    if (/[.!?…]["”’)]*$/.test(raw)) {
      word.sentenceEnd = true;
      word.question = /\?["”’)]*$/.test(raw);
      t += 0.42 / rate;
      sentence++;
      sentenceStart = true;
    } else if (/[,;:—–]["”’)]*$/.test(raw)) {
      word.phraseEnd = true;
      t += 0.2 / rate;
    } else t += 0.035 / rate;
  }
  if (words.length) {
    const last = words[words.length - 1];
    last.sentenceEnd = true;
  }
  return { text, words, duration: t, sentences: sentence + (sentenceStart ? 0 : 1) };
}

/** The mouth shape (and the next one, for coarticulation) at time t. */
export function shapeAt(timeline, t) {
  const { words } = timeline;
  let lo = 0, hi = words.length - 1, w = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (words[mid].start <= t) { w = mid; lo = mid + 1; } else hi = mid - 1; }
  if (w < 0) return { shape: 'X', next: words[0]?.shapes[0]?.shape ?? 'X', toNext: words[0] ? words[0].start - t : 1, word: null };
  const word = words[w];
  if (t >= word.end) {
    const nextWord = words[w + 1];
    return { shape: 'X', next: nextWord?.shapes[0]?.shape ?? 'X', toNext: nextWord ? nextWord.start - t : 1, word: null, after: word };
  }
  const i = word.shapes.findIndex((s) => t < s.end);
  const cur = word.shapes[i];
  const nxt = word.shapes[i + 1] ?? words[w + 1]?.shapes[0] ?? null;
  return { shape: cur.shape, next: nxt?.shape ?? 'X', toNext: cur.end - t, word, wordIndex: w };
}

// ---- Optional voice ------------------------------------------------------------------------------

// Speech synthesis doesn't say which voices are female, so Ada looks for names that are.
const FEMALE = /\b(Aria|Jenny|Michelle|Emma|Ava|Sonia|Libby|Natasha|Clara|Samantha|Zoe|Allison|Susan|Serena|Karen|Moira|Tessa|Fiona|Victoria|Kate|Stephanie|Nicky|Female)\b/;
const QUALITY = /Natural|Premium|Enhanced|Neural/i;

export function pickVoice() {
  const voices = (globalThis.speechSynthesis?.getVoices?.() ?? []).filter((v) => /^en(-|_|$)/i.test(v.lang));
  const score = (v) => (FEMALE.test(v.name) ? 4 : 0) + (QUALITY.test(v.name) ? 2 : 0)
    + (/^en[-_](US|GB)/i.test(v.lang) ? 1 : 0) + (v.localService ? 0.5 : 0);
  return voices.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/**
 * Speaks a timeline with speechSynthesis, one sentence per utterance, and reports progress as a
 * clock the performer can follow: `clock()` returns the timeline time. Word boundary events snap
 * the clock to the word being said; between them, time runs at the voice's measured pace.
 */
export class Voice {
  constructor() {
    this.supported = 'speechSynthesis' in globalThis && 'SpeechSynthesisUtterance' in globalThis;
    this.voice = null;
    this.speaking = false;
    this.#refreshVoice();
    globalThis.speechSynthesis?.addEventListener?.('voiceschanged', () => this.#refreshVoice());
  }

  #refreshVoice() { this.voice = pickVoice(); }

  /** Speak the timeline; resolves when done or cancelled. onWord(index) fires as words start. */
  speak(timeline, { onWord, onStart } = {}) {
    this.cancel();
    if (!this.supported || !timeline.words.length) return Promise.resolve(false);
    const synth = globalThis.speechSynthesis;
    // Group words into sentences, each its own utterance: boundaries stay reliable and
    // cancelling is quick.
    const sentences = [];
    for (const w of timeline.words) {
      (sentences[w.sentence] ??= []).push(w);
    }
    const token = (this.token = {});
    this.speaking = true;
    let started = false;
    return new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (this.token !== token) return resolve(false);
        const words = sentences[i++];
        if (!words) { this.speaking = false; return resolve(true); }
        const text = timeline.text.slice(words[0].index, words.at(-1).index + words.at(-1).length);
        const u = new SpeechSynthesisUtterance(text);
        if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; }
        u.rate = 1;
        u.onstart = () => {
          if (!started) { started = true; onStart?.(); }
          onWord?.(words[0].index === undefined ? 0 : timeline.words.indexOf(words[0]));
        };
        u.onboundary = (e) => {
          if (e.name && e.name !== 'word') return;
          const at = words[0].index + e.charIndex;
          const w = words.findIndex((x) => x.index <= at && at < x.index + x.length + 1);
          if (w >= 0) onWord?.(timeline.words.indexOf(words[w]));
        };
        u.onend = () => next();
        u.onerror = () => next();
        synth.speak(u);
      };
      next();
    });
  }

  cancel() {
    this.token = null;
    this.speaking = false;
    if (this.supported) globalThis.speechSynthesis.cancel();
  }
}
