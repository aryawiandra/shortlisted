// GET /api/tts?s=<speaker>&t=<text>: one line of meeting speech as MP3. Responses are
// cacheable at Vercel's edge, so a line that has been spoken once (scripted participant
// lines, the assessor's fixed lines) is served instantly and costs nothing afterwards.

import { createRateLimiter } from "./rateLimit.js";
import { clientIp, safeEqual } from "./request.js";
import { synthesize } from "./tts.js";
import { VOICE_CAST, validateTtsQuery } from "./voices.js";

const RATE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_TTS_RATE_MAX = 200; // a full session speaks about 40 to 60 lines
const AUDIO_CACHE = "public, max-age=86400, s-maxage=31536000, immutable";

export function createTtsHandler({ env = process.env, limiter, synth = synthesize, log = console.error } = {}) {
  const limit =
    limiter ?? createRateLimiter({ max: Number(env.DEMO_TTS_RATE_MAX) || DEFAULT_TTS_RATE_MAX, windowMs: RATE_WINDOW_MS });

  return async function tts(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed." });
    }
    if (env.DEMO_ACCESS_CODE && !safeEqual(req.headers?.["x-demo-code"], env.DEMO_ACCESS_CODE)) {
      return res.status(401).json({ error: "Kode akses salah atau belum diisi." });
    }
    const verdict = limit.check(clientIp(req));
    if (!verdict.allowed) {
      res.setHeader("Retry-After", String(verdict.retryAfterSec));
      return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi sebentar." });
    }

    const query = Object.fromEntries(new URL(req.url ?? "", "http://local").searchParams);
    const checked = validateTtsQuery(query);
    if (!checked.ok) return res.status(400).json({ error: checked.error });

    try {
      const audio = await synth({ ...VOICE_CAST[checked.value.speaker], text: checked.value.text });
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", String(audio.length));
      res.setHeader("Cache-Control", AUDIO_CACHE);
      return res.status(200).end(audio);
    } catch (error) {
      log("tts failed:", error?.message ?? error);
      res.setHeader("Cache-Control", "no-store");
      return res.status(502).json({ error: "Suara sedang tidak tersedia." });
    }
  };
}
