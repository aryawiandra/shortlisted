// Input validation for the demo API. Everything a client sends is untrusted.

import { findCase } from "./cases.js";
import { PERSONAS } from "./personas.js";

export const MAX_MESSAGES = 40;
export const MAX_TEXT_LENGTH = 600;
export const MAX_ELAPSED_SEC = 3600;

const SPEAKERS = new Set(["you", ...PERSONAS.map((p) => p.id)]);
// Control characters except tab and newline.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const fail = (error) => ({ ok: false, error });

function parseMessage(raw) {
  if (raw === null || typeof raw !== "object" || !SPEAKERS.has(raw.speaker)) {
    return { error: "Unknown speaker." };
  }
  if (typeof raw.text !== "string") return { error: "Message text must be a string." };
  const text = raw.text.replace(CONTROL_CHARS, "").trim();
  if (text.length === 0) return { error: "Message text is empty." };
  if (text.length > MAX_TEXT_LENGTH) return { error: `Message too long (max ${MAX_TEXT_LENGTH} characters).` };
  return { message: Object.freeze({ speaker: raw.speaker, text }) };
}

function validateTranscript(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return fail("Body must be a JSON object.");
  }
  if (!findCase(body.caseId)) return fail("Unknown case.");
  if (!Array.isArray(body.messages)) return fail("messages must be an array.");
  if (body.messages.length > MAX_MESSAGES) return fail(`Too many messages (max ${MAX_MESSAGES}).`);

  const messages = [];
  for (const raw of body.messages) {
    const parsed = parseMessage(raw);
    if (parsed.error) return fail(parsed.error);
    messages.push(parsed.message);
  }

  const elapsed = Number(body.elapsedSec);
  const elapsedSec = Number.isFinite(elapsed) ? Math.min(MAX_ELAPSED_SEC, Math.max(0, Math.round(elapsed))) : 0;

  return {
    ok: true,
    value: Object.freeze({ caseId: body.caseId, messages: Object.freeze(messages), elapsedSec }),
  };
}

export function validateTurnRequest(body) {
  const result = validateTranscript(body);
  if (!result.ok) return result;
  const last = result.value.messages.at(-1);
  if (last && last.speaker !== "you") return fail("The last message must be the applicant's.");
  return result;
}

export function validateScoreRequest(body) {
  const result = validateTranscript(body);
  if (!result.ok) return result;
  if (!result.value.messages.some((m) => m.speaker === "you")) {
    return fail("At least one applicant message is required.");
  }
  return result;
}
