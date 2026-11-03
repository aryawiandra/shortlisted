// HTTP glue for the Vercel functions: method check, access code, rate limit, validation,
// then the service. Written against plain req/res so tests and the dev server can drive it.

import { timingSafeEqual } from "node:crypto";
import { createLlm } from "./llm.js";
import { createRateLimiter } from "./rateLimit.js";
import { runScore, runTurn } from "./service.js";
import { validateScoreRequest, validateTurnRequest } from "./validate.js";

const RATE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_RATE_MAX = 30;

// Live when a key is present (or forced), simulation otherwise or when forced.
export function resolveMode(env) {
  if (env.DEMO_MODE === "live") return "live";
  if (env.DEMO_MODE === "mock") return "mock";
  return env.ANTHROPIC_API_KEY ? "live" : "mock";
}

const defaultLlmFactory = (env) =>
  createLlm({
    personaModel: env.DEMO_PERSONA_MODEL || undefined,
    scorerModel: env.DEMO_SCORER_MODEL || undefined,
  });

function safeEqual(received, expected) {
  const a = Buffer.from(String(received ?? ""));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

const clientIp = (req) =>
  String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

function parseBody(body) {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function createHandler({ kind, env = process.env, limiter, llmFactory = defaultLlmFactory }) {
  const limit =
    limiter ?? createRateLimiter({ max: Number(env.DEMO_RATE_MAX) || DEFAULT_RATE_MAX, windowMs: RATE_WINDOW_MS });
  const validate = kind === "score" ? validateScoreRequest : validateTurnRequest;
  const run = kind === "score" ? runScore : runTurn;
  let llm = null; // built lazily, once per warm instance

  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
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

    const checked = validate(parseBody(req.body));
    if (!checked.ok) return res.status(400).json({ error: checked.error });

    try {
      if (resolveMode(env) === "live") llm ??= llmFactory(env);
      const result = await run(checked.value, { llm: resolveMode(env) === "live" ? llm : null });
      return res.status(200).json(result);
    } catch (error) {
      console.error("demo handler failed:", error);
      return res.status(500).json({ error: "Terjadi kesalahan di server." });
    }
  };
}

export function createStatusHandler({ env = process.env } = {}) {
  return function status(_req, res) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ mode: resolveMode(env), accessCodeRequired: Boolean(env.DEMO_ACCESS_CODE) });
  };
}
