// Gilly's voice and ears.
//
// speak() reads text aloud and reports progress as a character index, so the
// speech bubble and the mouth stay in sync. Where the browser has WebGPU, Gilly
// speaks English with Kokoro, a neural voice that runs on the device
// (voice-worker.js). Its audio is made a sentence or two ahead and played with
// Web Audio, and the progress comes from the audio itself. Other languages, and
// browsers without Kokoro, get the browser's built-in Web Speech voice: voices
// that report word boundaries drive progress exactly, others are estimated
// from the speaking rate. Muted, the same timeline runs silently.
// listen() wraps SpeechRecognition where the browser has it (Chrome, Edge,
// Safari); elsewhere canListen is false.

const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const AudioContextClass = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;

// Kokoro's af_heart voice, Gilly-sized: made a little slow, then played back
// faster, so it sounds higher at a normal pace.
const NEURAL = { voice: 'af_heart', speed: 0.89, rate: 1.12 };

// Natural-sounding built-in English voices first. Names differ per platform.
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

const settings = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch { /* Not remembered. */ }
  },
};

export class Voice {
  constructor() {
    this.canListen = Boolean(Recognition);
    this.engine = synth ? 'system' : null; // 'neural' once Kokoro is ready.
    this.muted = settings.get('gilly-voice') === 'off';
    this.voice = null;
    this.rate = 1.02;
    this.pitch = 1.18;
    this.current = null;
    if (synth) {
      this.pickVoice();
      synth.addEventListener?.('voiceschanged', () => this.pickVoice());
    }
    // Sound may only start from a tap or a key press: the first one anywhere unlocks it.
    const unlock = () => this.engine === 'neural' && this.unlock();
    for (const type of ['pointerdown', 'pointerup', 'keydown']) addEventListener(type, unlock, { capture: true, passive: true });
  }

  get supported() {
    return Boolean(this.engine);
  }

  // Gets the neural voice ready where it makes sense, and makes the first
  // words ahead of time (`first`, most likely the greeting), so the first tap
  // gets an instant answer. Resolves with the engine Gilly will speak with:
  // 'neural', 'system', or null for none.
  async load({ onProgress, first = 'Hi! I’m Gilly.' } = {}) {
    if (!wantNeural()) return this.engine;
    let neural = null;
    try {
      neural = await NeuralVoice.load({ ...NEURAL, onProgress });
      // Timing the first chunk tells whether this GPU keeps up with the voice.
      const t0 = performance.now();
      const { samples, sampleRate } = await neural.generate(voiceChunks(first)[0].text.trim());
      const cost = (performance.now() - t0) / 1000 / (samples.length / sampleRate);
      if (cost > 0.8) throw new Error(`Too slow here: ${cost.toFixed(2)} s per second of speech.`);
      this.neural = neural;
      this.engine = 'neural';
      this.prepare(first);
    } catch (e) {
      neural?.worker.terminate();
      console.warn('Gilly’s neural voice is unavailable, using the built-in voice.', e);
    }
    return this.engine;
  }

  // Makes the neural voice's audio for text now, to speak later without a wait.
  prepare(text) {
    if (this.engine !== 'neural') return;
    for (const chunk of voiceChunks(text)) this.neural.generate(chunk.text.trim()).catch(() => {});
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

  // The built-in voice for a language: the one picked above for English, or
  // the best one installed for another language.
  voiceFor(lang) {
    if (isEnglish(lang)) {
      if (!this.voice) this.pickVoice();
      return this.voice;
    }
    const tag = lang.toLowerCase().replace('_', '-');
    const voices = synth.getVoices().filter((v) => v.lang?.toLowerCase().replace('_', '-').split('-')[0] === tag.split('-')[0]);
    // The same region first, then enhanced and neural voices, then local ones.
    const score = (v) => (v.lang.toLowerCase().replace('_', '-') === tag ? 0 : 5)
      + (/Premium|Enhanced/i.test(v.name) ? 0 : /Natural/i.test(v.name) ? 1 : /^Google/i.test(v.name) ? 2 : v.localService ? 3 : 4);
    return voices.sort((a, b) => score(a) - score(b))[0] ?? null;
  }

  setMuted(muted) {
    this.muted = muted;
    settings.set('gilly-voice', muted ? 'off' : 'on');
    if (muted) this.cancel();
  }

  // Unlocks sound inside a tap: browsers only let audio start from a user gesture.
  prime() {
    if (this.engine === 'neural') this.unlock();
    if (synth && !this.primed) {
      this.primed = true;
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      synth.speak(u);
    }
  }

  unlock() {
    const ctx = this.audio();
    if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
    if (!this.unlocked) {
      // iOS also wants a sound played in the gesture: a silent one will do.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start();
      this.unlocked = true;
    }
  }

  // Web Audio for the neural voice; `output` is where every word goes out.
  audio() {
    if (!this.ctx) {
      this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
      this.output = this.ctx.createGain();
      this.output.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  // A soft two-note chirp: "your turn". Used when Gilly starts listening on its own.
  chirp() {
    if (this.engine !== 'neural' || this.muted || this.ctx?.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    [660, 990].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.09);
      gain.gain.linearRampToValueAtTime(0.07, t + i * 0.09 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.16);
      osc.connect(gain).connect(this.output);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.18);
    });
  }

  /**
   * Speaks text and reports progress.
   * @param {string} text
   * @param {{ lang?: string, onStart?: () => void, onProgress?: (charIndex: number) => void, onMouth?: (shape: number[]) => void, onEnd?: (completed: boolean) => void }} options
   *   lang: the text's language (BCP 47); English when not given.
   * @returns {{ cancel: () => void, done: Promise<boolean> }}
   */
  speak(text, { lang, ...handlers } = {}) {
    this.cancel();
    // Kokoro only speaks English: other languages get the browser's voice for them.
    if (this.engine === 'neural' && !this.muted && isEnglish(lang)) return this.speakNeural(text, handlers);
    return this.speakSystem(text, handlers, { lang });
  }

  // The neural voice: each chunk of text becomes a clip, scheduled right after
  // the one before. A frame loop reads where the audio is to move the bubble
  // and the mouth.
  speakNeural(text, { onStart, onProgress, onMouth, onEnd } = {}) {
    const ctx = this.audio();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    const chunks = voiceChunks(text);
    const run = { cancelled: false, finished: false, clips: [], sources: [], raf: 0, char: 0, failed: false };
    let resolveDone;
    const done = new Promise((r) => (resolveDone = r));
    const stop = () => {
      run.finished = true;
      cancelAnimationFrame(run.raf);
      clearTimeout(run.timer);
      for (const src of run.sources) {
        try {
          src.stop();
        } catch { /* Already stopped. */ }
      }
    };
    const finish = (completed) => {
      if (run.finished) return;
      stop();
      onMouth?.([0, 0, 0]);
      onProgress?.(text.length);
      if (this.current === run) this.current = null;
      onEnd?.(completed);
      resolveDone(completed);
    };
    run.cancel = () => {
      run.cancelled = true;
      finish(false);
    };
    this.current = run;

    // Sound can't start without a tap first (after a reload, say): run the same
    // timeline silently instead, so the words still appear.
    run.timer = setTimeout(() => {
      if (ctx.state !== 'running' && !run.finished) {
        stop(); // Hand over, without onEnd: the silent run calls it.
        const silent = this.speakSystem(text, { onStart, onProgress, onMouth, onEnd }, { silent: true });
        silent.done.then(resolveDone);
        run.cancel = silent.cancel;
      }
    }, 600);

    let nextStart = 0;
    const request = (i) => {
      if (i >= chunks.length) return;
      const chunk = chunks[i];
      this.neural.generate(chunk.text.trim()).then(({ samples, sampleRate }) => {
        if (run.cancelled || run.finished) return;
        const clip = makeClip(ctx, chunk, samples, sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = clip.buffer;
        src.playbackRate.value = NEURAL.rate;
        src.connect(this.output);
        clip.start = Math.max(ctx.currentTime + 0.04, nextStart);
        clip.end = clip.start + clip.buffer.duration / NEURAL.rate;
        nextStart = clip.end;
        src.start(clip.start);
        run.clips.push(clip);
        run.sources.push(src);
        request(i + 1);
      }, (e) => {
        // The GPU went away, say. Finish this line silently; later ones use the built-in voice.
        console.warn('Gilly’s neural voice failed, switching to the built-in voice.', e);
        this.engine = synth ? 'system' : null;
        run.failed = true;
      });
    };
    request(0);

    const tick = () => {
      if (run.cancelled || run.finished) return;
      // What's audible now: the audio clock, minus the time it takes to reach the speakers.
      const t = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
      const clip = run.clips.findLast((c) => t >= c.start);
      const last = run.clips.length === chunks.length || run.failed;
      if (clip && !run.started) {
        run.started = true;
        onStart?.();
      }
      if (clip) {
        const playing = t < clip.end;
        const frame = Math.floor(((t - clip.start) * NEURAL.rate) / FRAME);
        const char = clip.chunk.start + (playing ? clip.charAt(frame) : clip.chunk.text.length);
        run.char = Math.max(run.char, Math.min(text.length, char));
        onProgress?.(run.char);
        const level = playing ? clip.levelAt(frame) : 0;
        onMouth?.(level > 0.1 ? mouthAt(text, run.char, performance.now(), level) : [0, 0, 0]);
        if (!playing && clip === run.clips.at(-1) && last) return finish(true);
      } else if (run.failed) {
        return finish(true);
      }
      run.raf = requestAnimationFrame(tick);
    };
    run.raf = requestAnimationFrame(tick);
    return { cancel: () => run.cancel(), done };
  }

  // The built-in voice, sentence by sentence. With { silent }, or muted, only
  // the timeline runs; so it does for a language this browser has no voice for,
  // rather than reading it in an English voice.
  speakSystem(text, { onStart, onProgress, onMouth, onEnd } = {}, { silent = false, lang } = {}) {
    const chunks = splitSentences(text);
    const voice = synth && this.voiceFor(lang);
    const known = Boolean(synth?.getVoices().length); // Some browsers list voices late.
    const run = { cancelled: false, raf: 0, char: 0, audio: Boolean(synth) && !this.muted && !silent && (Boolean(voice) || !known) };
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
      if (!run.started) {
        run.started = true; // Web Speech starts right away.
        onStart?.();
      }
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
      if (voice) u.voice = voice;
      u.lang = voice?.lang || lang || document.documentElement.lang || 'en-US';
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
   * @param {{ onText?: (text: string, final: boolean) => void, onError?: (message: string, code: string) => void, onEnd?: (text: string) => void }} handlers
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
      onError?.(messages[e.error] ?? 'Voice input stopped. You can type instead!', e.error);
    };
    rec.onend = () => onEnd?.(failed ? '' : (finalText || latest).trim());
    try {
      rec.start();
    } catch {
      onError?.('Voice input could not start.', 'start');
      return null;
    }
    return { stop: () => rec.stop(), abort: () => rec.abort() };
  }
}

// --- The neural voice ---------------------------------------------------------

function isEnglish(lang) {
  return !lang || /^en(-|_|$)/i.test(lang);
}

// Kokoro needs WebGPU and a one-time 326 MB download, so phones and Data Saver
// keep the built-in voice. ?voice=neural or ?voice=system decides instead.
function wantNeural() {
  const forced = new URLSearchParams(location.search).get('voice');
  if (forced === 'neural' || forced === 'system') return forced === 'neural';
  if (!('gpu' in navigator) || !AudioContextClass || typeof Worker === 'undefined') return false;
  if (navigator.connection?.saveData) return false;
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  return !phone;
}

class NeuralVoice {
  // Starts the worker and resolves once it has made its first sound. Progress
  // is the downloaded share of the model, 0 to 1.
  static load({ voice, speed, onProgress }) {
    const worker = new Worker(new URL('./voice-worker.js', import.meta.url), { type: 'module' });
    const files = new Map();
    return new Promise((resolve, reject) => {
      let timer;
      // A download that stops moving fails, rather than keeping Gilly away forever.
      const watch = (ms) => {
        clearTimeout(timer);
        timer = setTimeout(() => fail(new Error('Loading the voice stalled.')), ms);
      };
      const fail = (e) => {
        clearTimeout(timer);
        worker.terminate();
        reject(e);
      };
      worker.onerror = (e) => fail(new Error(e.message || 'The voice worker failed to start.'));
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') {
          files.set(data.file, data);
          // The model file is nearly all of it; small files would make the bar jump.
          const big = [...files.values()].filter((f) => f.total > 1e6);
          const total = big.reduce((a, f) => a + f.total, 0);
          const share = total ? big.reduce((a, f) => a + f.loaded, 0) / total : 0;
          onProgress?.(share);
          // After the download: starting up and a first run, plus ONNX Runtime's own download.
          watch(share >= 1 ? 90000 : 30000);
        } else if (data.type === 'ready') {
          clearTimeout(timer);
          onProgress?.(1);
          resolve(new NeuralVoice(worker, { voice, speed }));
        } else if (data.type === 'error') {
          fail(new Error(data.message));
        }
      };
      watch(45000);
      worker.postMessage({ id: 0, type: 'load', voice, speed });
    });
  }

  constructor(worker, { voice, speed }) {
    this.worker = worker;
    this.voice = voice;
    this.speed = speed;
    this.seq = 0;
    this.pending = new Map();
    this.made = new Map(); // text → its audio (a promise), the most recent last
    worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (data.type === 'audio') p.resolve({ samples: data.audio, sampleRate: data.sampleRate });
      else p.reject(new Error(data.message));
    };
  }

  // Resolves with the samples for text, made in the order asked. Text made
  // before (see Voice.prepare) comes back right away.
  generate(text) {
    let audio = this.made.get(text);
    if (!audio) {
      const id = ++this.seq;
      audio = new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker.postMessage({ id, type: 'speak', text, voice: this.voice, speed: this.speed });
      });
      audio.catch(() => this.made.delete(text));
      this.made.set(text, audio);
      while (this.made.size > 24) this.made.delete(this.made.keys().next().value);
    }
    return audio;
  }
}

const FRAME = 0.01; // Seconds of audio per analysis frame.

// A clip: the chunk's audio trimmed to its speech, and maps from time (in
// frames of the clip's own audio) to loudness and to the character being said.
function makeClip(ctx, chunk, samples, sampleRate) {
  // Kokoro pads each clip with about a third of a second of silence before and
  // half a second after: keep a little, so sentences follow at a natural pace.
  const rough = loudness(samples, sampleRate);
  const from = Math.max(0, rough.first - 8) * rough.hop;
  const to = Math.min(samples.length, (rough.last + 30) * rough.hop);
  const speech = samples.subarray(from, to);
  const buffer = ctx.createBuffer(1, speech.length, sampleRate);
  buffer.copyToChannel(speech, 0);
  const { rms, loud, voiced, first, last } = loudness(speech, sampleRate);
  const text = chunk.text;
  const n = rms.length;

  // Speech time so far: frames with voice in them.
  const spoken = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) spoken[i + 1] = spoken[i] + voiced[i];

  // Pauses of 80 ms or more between words.
  const pauses = [];
  for (let i = first; i <= last;) {
    if (voiced[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j <= last && !voiced[j]) j++;
    if (j - i >= 8) pauses.push({ from: i, to: j });
    i = j;
  }

  // Line pauses up with punctuation: where each comma or sentence end should fall
  // if speech were even, take the nearest pause. They pin the text to the audio.
  const marks = [...text.trimEnd().matchAll(/[,;:.!?…—–]+["'”’)\]]*(?=\s)/g)].map((m) => m.index + m[0].length);
  const total = spoken[n] || 1;
  const pins = [];
  let used = 0;
  for (const mark of marks) {
    const goal = total * (mark / text.length);
    let best = null;
    for (let k = used; k < pauses.length; k++) {
      const d = Math.abs(spoken[pauses[k].from] - goal);
      if (d < Math.max(30, total * 0.2) && (!best || d < best.d)) best = { k, d };
    }
    if (best) {
      pins.push({ char: mark, ...pauses[best.k] });
      used = best.k + 1;
    }
  }

  // Between pins, characters follow speech time, so they hold still in pauses.
  const bounds = [{ char: 0, to: first }, ...pins, { char: text.length, from: last + 1 }];
  const charAt = (f) => {
    if (f <= first) return 0;
    if (f > last) return text.length;
    for (let k = 0; k < bounds.length - 1; k++) {
      const a = bounds[k];
      const b = bounds[k + 1];
      if (k > 0 && f < a.to) return a.char; // In a pause.
      if (f < b.from) {
        const s0 = spoken[a.to];
        const s1 = spoken[b.from];
        return Math.round(a.char + (b.char - a.char) * clamp((spoken[f] - s0) / Math.max(1, s1 - s0), 0, 1));
      }
    }
    return text.length;
  };
  const levelAt = (f) => (f < 0 || f >= n ? 0 : clamp((rms[Math.max(0, f - 1)] + rms[f] + rms[Math.min(n - 1, f + 1)]) / (3 * loud), 0, 1.3));
  return { chunk, buffer, charAt, levelAt };
}

// Loudness in 10 ms frames, which frames have voice, and where speech starts and ends.
function loudness(samples, sampleRate) {
  const hop = Math.max(1, Math.round(sampleRate * FRAME));
  const n = Math.max(1, Math.floor(samples.length / hop));
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i * hop, end = j + hop; j < end; j++) sum += samples[j] * samples[j];
    rms[i] = Math.sqrt(sum / hop);
  }
  const loud = Math.max(Float32Array.from(rms).sort()[Math.floor(n * 0.9)], 1e-4);
  const voiced = rms.map((v) => (v > loud * 0.1 ? 1 : 0));
  const first = Math.max(0, voiced.indexOf(1));
  const last = voiced.lastIndexOf(1) < 0 ? n - 1 : voiced.lastIndexOf(1);
  return { hop, rms, loud, voiced, first, last };
}

// Sentences for the neural voice, joined into chunks: a short first one, so Gilly
// starts talking right away, then longer ones, which sound more natural.
export function voiceChunks(text) {
  const chunks = [];
  for (const s of splitSentences(text)) {
    const last = chunks.at(-1);
    const room = chunks.length === 1 ? 70 : 180;
    if (last && !/\n\s*$/.test(last.text) && last.text.length + s.text.length <= room) last.text += s.text;
    else chunks.push({ ...s });
  }
  // A long first sentence starts sooner split at a comma.
  const first = chunks[0];
  const comma = first && first.text.length > 100 ? /^.{30,90}?[,;:—–](?=\s)\s*/s.exec(first.text) : null;
  if (comma) {
    const at = comma[0].length;
    chunks.splice(0, 1, { text: first.text.slice(0, at), start: first.start }, { text: first.text.slice(at), start: first.start + at });
  }
  return chunks;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
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
// little wobble so held vowels don't look frozen. With the neural voice, the
// loudness of the audio (0 to about 1) opens or closes it.
export function mouthAt(text, index, now, level = 1) {
  // Accents off (è → e); letters of other scripts get a middling shape.
  const letter = (c) => (c ?? ' ').toLowerCase().normalize('NFD')[0];
  const ch = letter(text[index]);
  if (!/\p{L}/u.test(ch)) return [0, 0, 0];
  const a = SHAPES[ch] ?? [0.35, 0.25, 0.05];
  const b = SHAPES[letter(text[index + 1])] ?? a;
  const wobble = 0.85 + 0.15 * Math.sin(now / 45);
  const open = 0.35 + 0.65 * Math.min(1, level);
  return [((a[0] + b[0]) / 2) * wobble * open, ((a[1] + b[1]) / 2) * Math.min(1, level * 1.4), ((a[2] + b[2]) / 2) * Math.min(1, level * 1.4)];
}
