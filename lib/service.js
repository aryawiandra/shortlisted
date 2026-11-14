// Orchestrates one turn or one scorecard: live model when available, simulation otherwise,
// and a logged fallback to the simulation whenever the model fails.

import { findCase } from "./cases.js";
import { mockDrill, normalizeDrill } from "./drill.js";
import { mockScore, mockTurn } from "./mock.js";
import { pickSpeakers } from "./personas.js";
import { normalizeScore } from "./schemas.js";

const requestedReplies = (replies, speakers) =>
  replies
    .filter((reply) => speakers.includes(reply.speaker) && typeof reply.text === "string" && reply.text.trim())
    .map((reply) => ({ speaker: reply.speaker, text: reply.text.trim() }));

export async function runTurn(request, { llm = null, log = console.error } = {}) {
  const speakers = pickSpeakers(request.messages);
  if (!llm) return { mode: "mock", ...mockTurn(request, speakers) };

  try {
    const raw = await llm.turn({ caseData: findCase(request.caseId), messages: request.messages, speakers });
    const replies = requestedReplies(raw?.replies ?? [], speakers);
    if (replies.length === 0) throw new Error("model returned no usable replies");
    return { mode: "live", replies };
  } catch (error) {
    log("turn failed, using fallback:", error.message);
    return { mode: "fallback", ...mockTurn(request, speakers) };
  }
}

export async function runDrill(request, { llm = null, log = console.error } = {}) {
  if (!llm) return { mode: "mock", ...mockDrill(request) };

  try {
    const raw = await llm.drill({ caseData: findCase(request.caseId), answer: request.answer, elapsedSec: request.elapsedSec });
    const result = normalizeDrill(raw);
    if (!result) throw new Error("model drill result was incomplete");
    return { mode: "live", ...result };
  } catch (error) {
    log("drill failed, using fallback:", error.message);
    return { mode: "fallback", ...mockDrill(request) };
  }
}

export async function runScore(request, { llm = null, log = console.error } = {}) {
  if (!llm) return { mode: "mock", ...mockScore(request) };

  try {
    const raw = await llm.score({
      caseData: findCase(request.caseId),
      messages: request.messages,
      elapsedSec: request.elapsedSec,
    });
    const score = normalizeScore(raw);
    if (!score) throw new Error("model score was incomplete");
    return { mode: "live", ...score };
  } catch (error) {
    log("score failed, using fallback:", error.message);
    return { mode: "fallback", ...mockScore(request) };
  }
}
