import test from "node:test";
import assert from "node:assert/strict";
import { VOICE_PROFILES, assignVoices, estimateSpeechMs, genderOf, rankVoices, splitForSpeech } from "../demo/voice.js";

const voice = (name, lang, extra = {}) => ({ name, lang, voiceURI: name, localService: true, ...extra });
const ARDI = voice("Microsoft Ardi Online (Natural) - Indonesian (Indonesia)", "id-ID", { localService: false });
const GADIS = voice("Microsoft Gadis Online (Natural) - Indonesian (Indonesia)", "id-ID", { localService: false });
const GOOGLE = voice("Google Bahasa Indonesia", "id-ID", { localService: false });
const DAMAYANTI = voice("Damayanti", "id-ID");
const SPEAKERS = ["raka", "sinta", "dimas", "ayu", "ratna"];

test("rankVoices keeps only Indonesian voices and puts natural voices first", () => {
  const ranked = rankVoices([voice("Samantha", "en-US"), DAMAYANTI, GOOGLE, voice("Amira", "ms-MY"), ARDI, voice("Android id", "id_ID")]);
  assert.deepEqual(ranked.map((v) => v.name), [ARDI.name, GOOGLE.name, DAMAYANTI.name, "Android id"]);
});

test("rankVoices does not mutate its input", () => {
  const input = Object.freeze([DAMAYANTI, ARDI]);
  assert.doesNotThrow(() => rankVoices(input));
});

test("genderOf reads common Indonesian voice names", () => {
  assert.equal(genderOf(ARDI), "m");
  assert.equal(genderOf(GADIS), "f");
  assert.equal(genderOf(DAMAYANTI), "f");
  assert.equal(genderOf(voice("Mystery voice", "id-ID")), null);
});

test("assignVoices gives every speaker a profile and prefers a matching gender", () => {
  const cast = assignVoices([ARDI, GADIS]);
  assert.deepEqual(Object.keys(cast).sort(), [...SPEAKERS].sort());
  assert.equal(cast.raka.voice, ARDI);
  assert.equal(cast.dimas.voice, ARDI);
  assert.equal(cast.sinta.voice, GADIS);
  assert.equal(cast.ayu.voice, GADIS);
  for (const id of SPEAKERS) {
    assert.ok(cast[id].rate > 0.5 && cast[id].rate < 1.5);
    assert.ok(cast[id].pitch > 0.5 && cast[id].pitch < 1.6);
  }
});

test("assignVoices still varies speakers when only one voice exists, and works with none", () => {
  const single = assignVoices([GOOGLE]);
  assert.ok(SPEAKERS.every((id) => single[id].voice === GOOGLE));
  assert.notEqual(single.raka.pitch, single.ayu.pitch);
  const none = assignVoices([]);
  assert.ok(SPEAKERS.every((id) => none[id].voice === null && none[id].rate > 0));
});

test("every profile names a gender the cast can match", () => {
  assert.ok(Object.values(VOICE_PROFILES).every((p) => p.gender === "m" || p.gender === "f"));
});

test("splitForSpeech keeps every word, in order, in chunks no longer than the limit", () => {
  const text =
    "Saya usul kita mulai dari angka, karena stok tinggal enam hari dan anggaran dipotong lima belas persen. Lalu kita bandingkan dua opsi satu per satu. Setuju?";
  const chunks = splitForSpeech(text, 60);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((chunk) => chunk.length <= 60 && chunk.trim() === chunk && chunk.length > 0));
  assert.equal(chunks.join(" "), text);
  assert.deepEqual(splitForSpeech("   "), []);
});

test("estimateSpeechMs grows with length and stays within bounds", () => {
  const short = estimateSpeechMs("Oke.");
  const long = estimateSpeechMs("kata ".repeat(40));
  assert.ok(short >= 1200);
  assert.ok(long > short);
  assert.ok(estimateSpeechMs("kata ".repeat(500)) <= 12000);
  assert.ok(estimateSpeechMs("kata ".repeat(10), 1.2) < estimateSpeechMs("kata ".repeat(10), 1));
});
