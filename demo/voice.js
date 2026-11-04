// Voices for the meeting, using the browser's built-in speech synthesis (free, no download,
// nothing leaves the device beyond what the browser itself does). Pure helpers choose and
// cast Indonesian voices; createVoiceEngine() is the only part that touches the browser.
// When synthesis is unavailable or muted, speech is simulated with a timed pause so the
// meeting keeps its rhythm and the captions still play.

export const VOICE_PROFILES = Object.freeze({
  raka: Object.freeze({ gender: "m", rate: 1.12, pitch: 0.82, volume: 1 }),
  sinta: Object.freeze({ gender: "f", rate: 1.02, pitch: 1.08, volume: 1 }),
  dimas: Object.freeze({ gender: "m", rate: 0.92, pitch: 0.96, volume: 0.9 }),
  ayu: Object.freeze({ gender: "f", rate: 1.06, pitch: 1.22, volume: 1 }),
  ratna: Object.freeze({ gender: "f", rate: 0.96, pitch: 0.98, volume: 1 }),
});

const DEFAULT_CHUNK = 160;
const MS_PER_WORD = 400;
const MIN_SPEECH_MS = 1200;
const MAX_SPEECH_MS = 12_000;

const isIndonesian = (lang = "") => /^(id|in)([-_]|$)/i.test(lang);
const QUALITY = [
  [/natural|neural/i, 3],
  [/online|google/i, 2],
  [/enhanced|premium/i, 1],
];
const quality = (voice) => QUALITY.reduce((score, [pattern, points]) => (pattern.test(voice.name) ? Math.max(score, points) : score), 0);

// Indonesian voices only, best-sounding first; ties keep the browser's order.
export const rankVoices = (voices) =>
  voices
    .map((voice, index) => ({ voice, index, score: quality(voice) }))
    .filter(({ voice }) => isIndonesian(voice.lang))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ voice }) => voice);

const MALE = /\b(ardi|andika|male|pria)\b/i;
const FEMALE = /\b(gadis|damayanti|female|wanita)\b|google bahasa indonesia/i;
export const genderOf = (voice) => (MALE.test(voice.name) ? "m" : FEMALE.test(voice.name) ? "f" : null);

// One voice per speaker. Matching gender first, cycling through the matches so two
// speakers of the same gender get different voices when the device has them.
export function assignVoices(voices, profiles = VOICE_PROFILES) {
  const ranked = rankVoices(voices);
  const byGender = { m: ranked.filter((v) => genderOf(v) === "m"), f: ranked.filter((v) => genderOf(v) === "f") };
  const unknown = ranked.filter((v) => genderOf(v) === null);
  const used = { m: 0, f: 0 };
  const cast = {};
  for (const [id, profile] of Object.entries(profiles)) {
    const matches = byGender[profile.gender];
    let voice = null;
    if (matches.length) voice = matches[used[profile.gender]++ % matches.length];
    else voice = unknown[0] ?? ranked[0] ?? null;
    cast[id] = Object.freeze({ ...profile, voice });
  }
  return Object.freeze(cast);
}

function splitLong(sentence, max) {
  const out = [];
  let line = "";
  for (const word of sentence.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out;
}

// Long utterances get cut off in some browsers, so speech goes out in sentence-sized chunks.
export function splitForSpeech(text, max = DEFAULT_CHUNK) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  return clean
    .split(/(?<=[.!?])\s+/)
    .flatMap((sentence) => (sentence.length <= max ? [sentence] : sentence.split(/(?<=,)\s+/).flatMap((part) => splitLong(part, max))));
}

export function estimateSpeechMs(text, rate = 1) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_SPEECH_MS, Math.max(MIN_SPEECH_MS, (words * MS_PER_WORD) / rate + 400));
}

export function createVoiceEngine({
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  lang = "id-ID",
} = {}) {
  const available = Boolean(synth && Utterance);
  let cast = assignVoices(available ? synth.getVoices() : []);
  let enabled = available;
  let current = null;

  if (available) synth.addEventListener?.("voiceschanged", () => (cast = assignVoices(synth.getVoices())));

  const wait = (ms, token) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      token.stop = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  const sayChunk = (chunk, profile, token) =>
    new Promise((resolve) => {
      const utterance = new Utterance(chunk);
      utterance.lang = profile.voice?.lang ?? lang;
      if (profile.voice) utterance.voice = profile.voice;
      utterance.rate = profile.rate;
      utterance.pitch = profile.pitch;
      utterance.volume = profile.volume;
      // Some browsers never fire onend; the timer keeps the meeting moving regardless.
      const guard = setTimeout(resolve, estimateSpeechMs(chunk, profile.rate) * 2 + 2000);
      const done = () => {
        clearTimeout(guard);
        resolve();
      };
      utterance.onend = done;
      utterance.onerror = done;
      token.stop = done;
      synth.speak(utterance);
    });

  // Resolves true when the line was said in full, false when it was cut off.
  async function speak(speakerId, text) {
    const profile = cast[speakerId] ?? cast.ratna;
    const token = { cancelled: false, stop: () => {} };
    current = token;
    if (!enabled) {
      await wait(estimateSpeechMs(text, profile.rate), token);
      return !token.cancelled;
    }
    for (const chunk of splitForSpeech(text)) {
      if (token.cancelled) break;
      await sayChunk(chunk, profile, token);
    }
    return !token.cancelled;
  }

  function cancel() {
    if (current) {
      current.cancelled = true;
      current.stop();
    }
    if (available) synth.cancel();
  }

  return Object.freeze({
    available,
    isEnabled: () => enabled,
    setEnabled: (value) => {
      enabled = available && Boolean(value);
      if (!enabled && available) synth.cancel();
    },
    voiceCount: () => (available ? rankVoices(synth.getVoices()).length : 0),
    speak,
    cancel,
  });
}
