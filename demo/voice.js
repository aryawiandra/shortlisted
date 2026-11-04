// Voices for the meeting: natural neural voices from /api/tts, fetched ahead of time so
// the next line is ready while the current one plays. Each speaker has their own voice
// (see lib/voices.js). If the voice server is unreachable, lines keep their timing in
// silence and the captions carry the meeting, so nothing ever stalls.

const MS_PER_WORD = 400;
const MIN_SPEECH_MS = 1200;
const MAX_SPEECH_MS = 12_000;
const VOLUME = Object.freeze({ dimas: 0.85 }); // the quiet one is a little softer
const FETCH_TIMEOUT_MS = 8000;
const MAX_FAILURES = 2; // then the rest of this meeting runs on captions

export function estimateSpeechMs(text, rate = 1) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_SPEECH_MS, Math.max(MIN_SPEECH_MS, (words * MS_PER_WORD) / rate + 400));
}

export const ttsUrl = (speaker, text, endpoint = "/api/tts") => `${endpoint}?${new URLSearchParams({ s: speaker, t: text })}`;

// 0.1 s of silence. Playing it inside the join click unlocks audio for the whole meeting
// on browsers that only allow sound after a user gesture (Safari, iOS).
function silentWav() {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples).fill(128, 44);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, text) => [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, samples, true);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createVoiceEngine({
  endpoint = "/api/tts",
  fetchImpl = (...args) => fetch(...args),
  getAccessCode = () => "",
  AudioCtor = globalThis.Audio,
  sleep = defaultSleep,
  onStatus = () => {},
  fetchTimeoutMs = FETCH_TIMEOUT_MS,
} = {}) {
  const available = typeof AudioCtor === "function";
  const audio = available ? new AudioCtor() : null;
  const cache = new Map(); // "speaker\ntext" -> Promise<object URL | null>
  let enabled = available;
  let current = null;
  let status = null;
  let failures = 0;

  const report = (next) => {
    if (next === status) return;
    status = next;
    onStatus(next);
  };

  function load(speaker, text) {
    if (failures >= MAX_FAILURES) return Promise.resolve(null);
    const key = `${speaker}\n${text}`;
    if (!cache.has(key)) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), fetchTimeoutMs);
      const pending = fetchImpl(ttsUrl(speaker, text, endpoint), { headers: { "x-demo-code": getAccessCode() }, signal: abort.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`voice server answered ${response.status}`);
          const url = URL.createObjectURL(await response.blob());
          failures = 0;
          report("ready");
          return url;
        })
        .catch((error) => {
          console.warn("Voice unavailable:", error.message);
          failures += 1;
          report("unavailable");
          cache.delete(key); // a later line may succeed again, until the breaker trips
          return null;
        })
        .finally(() => clearTimeout(timer));
      cache.set(key, pending);
    }
    return cache.get(key);
  }

  const waitOrCancel = (ms, token) =>
    Promise.race([sleep(ms), new Promise((resolve) => (token.stop = resolve))]);

  // Resolves true when the line ran to the end, false when it was cut off.
  async function speak(speaker, text, { onStart = () => {} } = {}) {
    current?.stop();
    const token = { cancelled: false, stop: () => {} };
    current = token;
    const url = enabled ? await load(speaker, text) : null;
    if (token.cancelled) return false;
    if (!url) {
      onStart();
      await waitOrCancel(estimateSpeechMs(text), token);
      return !token.cancelled;
    }
    return new Promise((resolve) => {
      const done = (finished) => {
        audio.onended = null;
        audio.onerror = null;
        token.stop = () => {};
        resolve(finished);
      };
      token.stop = () => {
        audio.pause();
        done(false);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(true); // a broken clip should not stall the meeting
      audio.src = url;
      audio.volume = VOLUME[speaker] ?? 1;
      onStart();
      audio.play()?.catch?.(() => sleep(estimateSpeechMs(text)).then(() => done(!token.cancelled)));
    });
  }

  function cancel() {
    if (!current) return;
    current.cancelled = true;
    current.stop();
  }

  return Object.freeze({
    available,
    status: () => status,
    isEnabled: () => enabled,
    setEnabled: (value) => {
      enabled = available && Boolean(value);
      if (!enabled) cancel();
    },
    unlock: () => {
      if (!audio) return;
      audio.src = silentWav();
      audio.play()?.catch?.(() => {});
    },
    prefetch: (speaker, text) => {
      if (enabled) load(speaker, text);
    },
    speak,
    cancel,
    reset: async () => {
      cancel();
      const urls = await Promise.all(cache.values());
      urls.filter(Boolean).forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
      failures = 0;
    },
  });
}
