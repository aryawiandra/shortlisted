// Speech synthesis through Microsoft Edge's free "Read Aloud" neural voices, via the
// msedge-tts package (MIT). No key and no cost. It is an unofficial endpoint, so treat it
// as best-effort: the same voice names exist in Azure Speech (free tier F0) if this ever
// needs an official, contracted route. Since Dec 2025 it only answers server-side calls.

import msedge from "msedge-tts";
import { escapeXml } from "./voices.js";

const { MsEdgeTTS, OUTPUT_FORMAT } = msedge;
const CONNECT_TIMEOUT_MS = 6000;
const SYNTH_TIMEOUT_MS = 10_000;
const IDLE_MS = 20_000; // a warm socket older than this may be dead; start a new one
const ATTEMPTS = 2;
const MIN_AUDIO_BYTES = 200;

function collect(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("close", () => resolve(Buffer.concat(chunks)));
  });
}

// "&" is read inconsistently by the voices; Indonesian speakers would say "dan".
const spokenText = (text) => escapeXml(text.replace(/\s*&\s*/g, " dan "));

// One warm connection per voice, reused while a meeting is talking: a fresh connection
// costs 2 to 8 seconds, a warm one about 0.3. The client multiplexes overlapping requests
// by request id. Idle or failed connections are closed and replaced.
export function createSynthesizer({ Engine = MsEdgeTTS, now = () => Date.now(), idleMs = IDLE_MS } = {}) {
  const pool = new Map(); // voice -> { ready: Promise<client>, usedAt }

  function drop(voice) {
    const entry = pool.get(voice);
    pool.delete(voice);
    entry?.ready.then((client) => client.close()).catch(() => {});
  }

  function connection(voice) {
    const entry = pool.get(voice);
    if (entry && now() - entry.usedAt <= idleMs) {
      entry.usedAt = now();
      return entry.ready;
    }
    if (entry) drop(voice);
    const ready = (async () => {
      const client = new Engine({ connectionTimeoutMs: CONNECT_TIMEOUT_MS, synthesisTimeoutMs: SYNTH_TIMEOUT_MS });
      await client.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      return client;
    })();
    pool.set(voice, { ready, usedAt: now() });
    return ready;
  }

  return async function synthesize({ voice, rate, pitch, text }) {
    let lastError = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      try {
        const client = await connection(voice);
        const { audioStream } = client.toStream(spokenText(text), { rate, pitch });
        const audio = await collect(audioStream);
        if (audio.length < MIN_AUDIO_BYTES) throw new Error("Voice service returned no audio.");
        return audio;
      } catch (error) {
        lastError = error;
        drop(voice);
      }
    }
    throw lastError;
  };
}

export const synthesize = createSynthesizer();
