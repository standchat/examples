// Gilly's voice: Kokoro-82M, an open neural text-to-speech model, running on the
// GPU with WebGPU. It lives in a worker so that making speech never stalls
// Gilly's animation. voice.js plays what it makes.
//
// The model is downloaded once (326 MB) and cached by the browser. Only the full
// fp32 build works here: the smaller fp16 and q8 builds come out garbled on WebGPU.

const KOKORO = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let tts = null;
let queue = Promise.resolve(); // One generation at a time.

self.onmessage = ({ data }) => {
  const { id, type } = data;
  if (type === 'load') load(id, data);
  if (type === 'speak') queue = queue.then(() => speak(id, data));
};

async function load(id, { voice, speed }) {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('WebGPU is not available.');
    const { KokoroTTS } = await import(KOKORO);
    tts = await KokoroTTS.from_pretrained(MODEL, {
      dtype: 'fp32',
      device: 'webgpu',
      progress_callback: (p) => {
        if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
      },
    });
    // The first run compiles the GPU shaders: do it now, not on Gilly's first word.
    await tts.generate('Hi!', { voice, speed });
    self.postMessage({ id, type: 'ready' });
  } catch (e) {
    self.postMessage({ id, type: 'error', message: String(e?.message ?? e) });
  }
}

async function speak(id, { text, voice, speed }) {
  try {
    const { audio, sampling_rate: sampleRate } = await tts.generate(text, { voice, speed });
    self.postMessage({ id, type: 'audio', audio, sampleRate }, [audio.buffer]);
  } catch (e) {
    self.postMessage({ id, type: 'error', message: String(e?.message ?? e) });
  }
}
