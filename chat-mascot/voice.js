// Gilly's voice and ears, with the browser's built-in Web Speech API.
//
// speak() reads text aloud sentence by sentence and reports progress as a
// character index, so the speech bubble and the mouth stay in sync. Voices
// that report word boundaries drive it exactly; otherwise it is estimated from
// the speaking rate. Muted or unsupported, the same timeline runs silently.
// listen() wraps SpeechRecognition where the browser has it (Chrome, Edge,
// Safari); elsewhere canListen is false.

const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// Natural-sounding English voices first. Names differ per platform.
const PREFERRED = [
  /Ava.*(Premium|Enhanced)/i, /Zoe.*(Premium|Enhanced)/i, /Samantha.*(Premium|Enhanced)/i,
  /Microsoft (Ava|Emma|Jenny|Aria|Ana).*Online.*Natural/i, /Microsoft .*Online.*Natural.*English/i,
  /Google US English/i, /^Samantha$/i, /^Ava$/i, /^Zoe$/i, /^Allison$/i, /^Susan$/i, /^Karen$/i,
  /Microsoft Zira/i, /Google UK English Female/i,
];

// Rough visemes per letter: [open, wide, round].
const SHAPES = {
  a: [0.9, 0.2, 0], e: [0.5, 0.7, 0], i: [0.4, 0.8, 0], o: [0.6, 0, 0.8], u: [0.3, 0, 1], y: [0.35, 0.6, 0],
  w: [0.2, 0, 0.9], r: [0.3, 0.1, 0.4], l: [0.4, 0.3, 0], h: [0.45, 0.2, 0],
  m: [0, 0, 0], b: [0, 0, 0], p: [0, 0, 0],
  f: [0.12, 0.3, 0], v: [0.12, 0.3, 0],
  s: [0.18, 0.6, 0], z: [0.18, 0.6, 0], t: [0.25, 0.4, 0], d: [0.3, 0.3, 0], n: [0.25, 0.3, 0],
  k: [0.35, 0.2, 0], g: [0.35, 0.2, 0], c: [0.3, 0.4, 0], j: [0.3, 0.3, 0.3], q: [0.3, 0, 0.6], x: [0.3, 0.4, 0],
};

export class Voice {
  constructor() {
    this.supported = Boolean(synth);
    this.canListen = Boolean(Recognition);
    this.muted = false;
    this.voice = null;
    this.rate = 1.02;
    this.pitch = 1.18;
    this.current = null;
    try {
      this.muted = localStorage.getItem('gilly-muted') === '1';
    } catch { /* No storage: not muted. */ }
    if (synth) {
      this.pickVoice();
      synth.addEventListener?.('voiceschanged', () => this.pickVoice());
    }
  }

  pickVoice() {
    const lang = (document.documentElement.lang || 'en').slice(0, 2);
    const voices = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith(lang));
    if (!voices.length) return;
    for (const re of PREFERRED) {
      const v = voices.find((x) => re.test(x.name));
      if (v) {
        this.voice = v;
        return;
      }
    }
    this.voice = voices.find((v) => v.localService && /US/.test(v.lang)) ?? voices.find((v) => v.default) ?? voices[0];
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem('gilly-muted', muted ? '1' : '0');
    } catch { /* Fine. */ }
    if (muted) synth?.cancel();
  }

  // Unlock speech on iOS: the first utterance must start inside a user gesture.
  prime() {
    if (!synth || this.primed) return;
    this.primed = true;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    synth.speak(u);
  }

  /**
   * Speaks text and reports progress.
   * @param {string} text
   * @param {{ onProgress?: (charIndex: number) => void, onMouth?: (shape: number[]) => void, onEnd?: (completed: boolean) => void }} handlers
   * @returns {{ cancel: () => void, done: Promise<boolean> }}
   */
  speak(text, { onProgress, onMouth, onEnd } = {}) {
    this.cancel();
    const chunks = splitSentences(text);
    const run = { cancelled: false, raf: 0, char: 0, audio: this.supported && !this.muted };
    let resolveDone;
    const done = new Promise((r) => (resolveDone = r));
    const finish = (completed) => {
      if (run.finished) return;
      run.finished = true;
      cancelAnimationFrame(run.raf);
      clearTimeout(run.watchdog);
      clearTimeout(run.timer);
      onMouth?.([0, 0, 0]);
      onProgress?.(text.length);
      if (this.current === run) this.current = null;
      onEnd?.(completed);
      resolveDone(completed);
    };
    run.cancel = () => {
      run.cancelled = true;
      if (run.audio) synth.cancel();
      finish(false);
    };
    this.current = run;

    // Characters per second at rate 1; refined as utterances finish.
    let cps = 14.5 * this.rate;
    let chunkIndex = 0;
    let chunkStart = 0; // index in text
    let chunkT0 = 0;
    let boundary = false; // the voice reports word boundaries
    let spoken = 0; // char index reported by boundaries
    let spokenAt = 0;

    const tick = () => {
      if (run.cancelled || run.finished) return;
      const now = performance.now();
      const chunk = chunks[chunkIndex];
      if (chunk) {
        // Estimated position, corrected by the last boundary event.
        const est = boundary
          ? spoken + ((now - spokenAt) / 1000) * cps
          : chunkStart + ((now - chunkT0) / 1000) * cps;
        const limit = chunkStart + chunk.text.length;
        run.char = Math.min(limit, Math.max(run.char, Math.floor(est)));
        onProgress?.(run.char);
        onMouth?.(mouthAt(text, run.char, now));
      }
      run.raf = requestAnimationFrame(tick);
    };

    const speakChunk = () => {
      if (run.cancelled) return;
      const chunk = chunks[chunkIndex];
      if (!chunk) return finish(true);
      chunkStart = chunk.start;
      chunkT0 = performance.now();
      boundary = false;
      if (!run.audio) {
        // Silent: run the same timeline on a timer.
        const ms = (chunk.text.length / cps) * 1000 + 180;
        run.timer = setTimeout(() => {
          run.char = chunk.start + chunk.text.length;
          chunkIndex++;
          speakChunk();
        }, ms);
        return;
      }
      const u = new SpeechSynthesisUtterance(chunk.text);
      if (this.voice) u.voice = this.voice;
      u.lang = this.voice?.lang || document.documentElement.lang || 'en-US';
      u.rate = this.rate;
      u.pitch = this.pitch;
      u.onstart = () => {
        chunkT0 = performance.now();
      };
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        boundary = true;
        spoken = chunk.start + e.charIndex;
        spokenAt = performance.now();
        run.char = Math.max(run.char, spoken);
      };
      // Some voices never report the end (Chrome's online voices, now and then):
      // move on once the sentence has clearly had its time.
      clearTimeout(run.watchdog);
      run.watchdog = setTimeout(() => u.onend?.(), (chunk.text.length / cps) * 2500 + 2500);
      u.onend = () => {
        clearTimeout(run.watchdog);
        if (run.cancelled || chunk !== chunks[chunkIndex]) return;
        const secs = (performance.now() - chunkT0) / 1000;
        if (secs > 0.3 && chunk.text.length > 12) cps = lerp(cps, chunk.text.length / secs, 0.5);
        run.char = chunk.start + chunk.text.length;
        chunkIndex++;
        speakChunk();
      };
      u.onerror = (e) => {
        if (run.cancelled || e.error === 'interrupted' || e.error === 'canceled') return;
        // Speech failed (autoplay policy, no voices): continue silently.
        run.audio = false;
        speakChunk();
      };
      synth.speak(u);
      // Chrome can get stuck paused; resume nudges it.
      if (synth.paused) synth.resume();
    };

    run.raf = requestAnimationFrame(tick);
    speakChunk();
    return { cancel: () => run.cancel(), done };
  }

  cancel() {
    if (this.current) this.current.cancel();
    clearTimeout(this.current?.timer);
    if (synth?.speaking || synth?.pending) synth.cancel();
  }

  get speaking() {
    return Boolean(this.current);
  }

  /**
   * Listens for one utterance.
   * @param {{ onText?: (text: string, final: boolean) => void, onError?: (message: string) => void, onEnd?: (text: string) => void }} handlers
   */
  listen({ onText, onError, onEnd } = {}) {
    if (!Recognition) return null;
    this.cancel();
    const rec = new Recognition();
    rec.lang = document.documentElement.lang || navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    let latest = '';
    let failed = false;
    rec.onresult = (e) => {
      let interim = '';
      finalText = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      latest = (finalText + interim).trim();
      onText?.(latest, !interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      failed = true;
      const messages = {
        'no-speech': "I didn't catch that. Tap the mic and try again?",
        'audio-capture': 'No microphone found.',
        'not-allowed': 'Microphone access is blocked. You can type instead!',
        'service-not-allowed': 'Voice input is off in this browser. You can type instead!',
        network: 'Voice input needs a connection.',
        'language-not-supported': "Voice input doesn't support this language here.",
      };
      onError?.(messages[e.error] ?? 'Voice input stopped. You can type instead!');
    };
    rec.onend = () => onEnd?.(failed ? '' : (finalText || latest).trim());
    try {
      rec.start();
    } catch {
      onError?.('Voice input could not start.');
      return null;
    }
    return { stop: () => rec.stop(), abort: () => rec.abort() };
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Sentences, and long sentences split at commas, so each utterance stays short.
export function splitSentences(text) {
  const chunks = [];
  const re = /[^.!?…\n]+(?:[.!?…]+["')\]]*|\n+|$)\s*/g;
  let m;
  while ((m = re.exec(text)) && m[0]) {
    let start = m.index;
    let piece = m[0];
    while (piece.length > 180) {
      const cut = Math.max(piece.lastIndexOf(', ', 160), piece.lastIndexOf(' ', 160));
      const at = cut > 40 ? cut + 1 : 160;
      chunks.push({ text: piece.slice(0, at), start });
      start += at;
      piece = piece.slice(at);
    }
    if (piece.trim()) chunks.push({ text: piece, start });
  }
  return chunks.length ? chunks : [{ text, start: 0 }];
}

// The mouth shape at a character position: the letters around it, with a
// little wobble so held vowels don't look frozen.
export function mouthAt(text, index, now) {
  const ch = text[index]?.toLowerCase() ?? ' ';
  if (!/[a-z]/.test(ch)) return [0, 0, 0];
  const next = text[index + 1]?.toLowerCase() ?? ' ';
  const a = SHAPES[ch] ?? [0.3, 0.2, 0];
  const b = SHAPES[next] ?? a;
  const wobble = 0.85 + 0.15 * Math.sin(now / 45);
  return [((a[0] + b[0]) / 2) * wobble, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}
