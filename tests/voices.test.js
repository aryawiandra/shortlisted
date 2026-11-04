import test from "node:test";
import assert from "node:assert/strict";
import { MAX_TTS_TEXT, VOICE_CAST, escapeXml, validateTtsQuery } from "../lib/voices.js";

const SPEAKERS = ["raka", "sinta", "dimas", "ayu", "ratna"];

test("every meeting speaker has a neural voice with valid prosody", () => {
  assert.deepEqual(Object.keys(VOICE_CAST).sort(), [...SPEAKERS].sort());
  for (const id of SPEAKERS) {
    const { voice, rate, pitch } = VOICE_CAST[id];
    assert.match(voice, /Neural$/);
    assert.match(rate, /^[+-]\d+%$/);
    assert.match(pitch, /^[+-]\d+Hz$/);
  }
});

test("speakers sound different: no two share a voice, and the native Indonesian voices are used", () => {
  const voices = SPEAKERS.map((id) => VOICE_CAST[id].voice);
  assert.equal(new Set(voices).size, voices.length);
  assert.ok(voices.includes("id-ID-ArdiNeural"));
  assert.ok(voices.includes("id-ID-GadisNeural"));
});

test("validateTtsQuery accepts a known speaker and normalises the text", () => {
  const out = validateTtsQuery({ s: "raka", t: "  Halo\u0007   semua \n" });
  assert.deepEqual(out, { ok: true, value: { speaker: "raka", text: "Halo semua" } });
});

test("validateTtsQuery rejects unknown speakers, missing or oversized text", () => {
  assert.equal(validateTtsQuery({ s: "you", t: "Halo" }).ok, false);
  assert.equal(validateTtsQuery({ s: "raka", t: "   " }).ok, false);
  assert.equal(validateTtsQuery({ s: "raka" }).ok, false);
  assert.equal(validateTtsQuery({ s: "raka", t: "a".repeat(MAX_TTS_TEXT + 1) }).ok, false);
  assert.equal(validateTtsQuery({ s: ["raka"], t: "Halo" }).ok, false);
});

test("escapeXml makes text safe to embed in SSML", () => {
  assert.equal(escapeXml(`a & b < c > "d" 'e'`), "a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;");
});
