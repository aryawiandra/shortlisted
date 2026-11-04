// Who sounds like whom in the meeting. Shared by the voice server and its tests; the
// browser only ever sends a speaker id, never a voice name.
// Two native Indonesian neural voices plus three multilingual neural voices (all read
// Indonesian clearly in a Whisper intelligibility test, Nov 2026). Each person gets a
// distinct voice instead of a pitch-shifted copy: pitch shifting is what made the old
// browser voices sound robotic. Rates stay within a few percent of natural.

export const MAX_TTS_TEXT = 600;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export const VOICE_CAST = Object.freeze({
  raka: Object.freeze({ voice: "id-ID-ArdiNeural", rate: "+8%", pitch: "+0Hz" }),
  sinta: Object.freeze({ voice: "id-ID-GadisNeural", rate: "+2%", pitch: "+0Hz" }),
  dimas: Object.freeze({ voice: "en-US-BrianMultilingualNeural", rate: "-6%", pitch: "+0Hz" }),
  ayu: Object.freeze({ voice: "en-US-EmmaMultilingualNeural", rate: "+4%", pitch: "+0Hz" }),
  ratna: Object.freeze({ voice: "en-US-AvaMultilingualNeural", rate: "-4%", pitch: "+0Hz" }),
});

export function validateTtsQuery({ s, t } = {}) {
  if (typeof s !== "string" || !Object.hasOwn(VOICE_CAST, s)) return { ok: false, error: "Unknown speaker." };
  if (typeof t !== "string") return { ok: false, error: "Text is required." };
  const text = t.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, error: "Text is required." };
  if (text.length > MAX_TTS_TEXT) return { ok: false, error: `Text too long (max ${MAX_TTS_TEXT} characters).` };
  return { ok: true, value: { speaker: s, text } };
}

const XML = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
export const escapeXml = (text) => String(text).replace(/[&<>"']/g, (ch) => XML[ch]);
