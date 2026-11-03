import test from "node:test";
import assert from "node:assert/strict";
import { mockScore, mockTurn } from "../lib/mock.js";
import { ASPECTS, normalizeScore } from "../lib/schemas.js";

const msg = (speaker, text) => ({ speaker, text });
const strong = [
  msg("raka", "Langsung saja, sewa truk."),
  msg("you", "Saya usul kita mulai dari angka: sewa truk Rp18 juta per truk, jalur sungai 40% lebih murah karena biayanya lebih rendah."),
  msg("sinta", "Datanya mana?"),
  msg("you", "Sinta, setuju dengan poin datamu. Karena stok hanya 6 hari, prioritas kita pengiriman cepat dulu."),
  msg("ayu", "Bagaimana kalau digabung?"),
  msg("you", "Kesimpulannya, saya sarankan sewa 2 truk dulu lalu evaluasi jalur sungai. Raka, Ayu, apakah sepakat?"),
];
const weak = [msg("raka", "Mulai."), msg("you", "ya"), msg("ayu", "Oke?"), msg("you", "oke")];
const total = (result) => result.scores.reduce((sum, s) => sum + s.score, 0);

test("mockTurn writes one non-empty reply per requested speaker, in order", () => {
  const { replies } = mockTurn({ caseId: "bbm-terpencil", messages: strong }, ["sinta", "ayu"]);
  assert.deepEqual(replies.map((r) => r.speaker), ["sinta", "ayu"]);
  assert.ok(replies.every((r) => r.text.trim().length > 10));
});

test("mockTurn is deterministic", () => {
  const request = { caseId: "bbm-terpencil", messages: strong };
  assert.deepEqual(mockTurn(request, ["raka", "sinta"]), mockTurn(request, ["raka", "sinta"]));
});

test("mockTurn opens the discussion on an empty transcript", () => {
  const { replies } = mockTurn({ caseId: "bbm-terpencil", messages: [] }, ["raka", "sinta"]);
  assert.equal(replies.length, 2);
});

test("mockScore returns the six aspects in canonical order with integer scores 1 to 5", () => {
  const result = mockScore({ caseId: "bbm-terpencil", messages: strong, elapsedSec: 300 });
  assert.deepEqual(result.scores.map((s) => s.aspect), [...ASPECTS]);
  for (const s of result.scores) {
    assert.ok(Number.isInteger(s.score) && s.score >= 1 && s.score <= 5);
    assert.ok(s.label.length > 0 && s.comment.length > 0);
  }
  assert.ok(result.nextSteps.length >= 2 && result.nextSteps.length <= 3);
  assert.ok(result.summary.length > 0);
});

test("mockScore rewards a substantive transcript over a minimal one", () => {
  const good = mockScore({ caseId: "bbm-terpencil", messages: strong, elapsedSec: 300 });
  const poor = mockScore({ caseId: "bbm-terpencil", messages: weak, elapsedSec: 300 });
  assert.ok(total(good) > total(poor));
});

test("proposing a conclusion and asking for agreement scores at least adequate on Decision", () => {
  const messages = [
    msg("raka", "Mulai."),
    msg("you", "Kesimpulannya, saya sarankan sewa 2 truk dulu lalu evaluasi jalur sungai. Apakah kelompok sepakat?"),
  ];
  const decision = mockScore({ caseId: "bbm-terpencil", messages, elapsedSec: 200 }).scores.find((s) => s.aspect === "keputusan");
  assert.ok(decision.score >= 3);
});

test("mockScore evidence is always quoted from the applicant's own words", () => {
  const result = mockScore({ caseId: "bbm-terpencil", messages: strong, elapsedSec: 300 });
  const mine = strong.filter((m) => m.speaker === "you").map((m) => m.text);
  for (const { evidence } of result.scores) {
    assert.ok(evidence === "" || mine.some((t) => t.includes(evidence)), `not a quote: ${evidence}`);
  }
});

test("mockScore evidence is clipped at a word boundary, never mid-word", () => {
  const long =
    "Saya usul kita mulai dari angka dulu supaya semuanya jelas dan terukur, lalu kita bandingkan dua opsi satu per satu dengan data yang ada di kasus ini sebelum memutuskan apa pun juga.";
  const result = mockScore({ caseId: "bbm-terpencil", messages: [msg("you", long)], elapsedSec: 10 });
  const quotes = result.scores.map((s) => s.evidence).filter(Boolean);
  assert.ok(quotes.length > 0);
  for (const quote of quotes) {
    assert.ok(quote.length <= 140);
    const rest = long.slice(long.indexOf(quote) + quote.length);
    assert.ok(rest === "" || rest.startsWith(" "), `cut mid-word: ${quote}`);
  }
});

test("mockScore does not reuse a single quote for every aspect", () => {
  const result = mockScore({ caseId: "bbm-terpencil", messages: strong, elapsedSec: 300 });
  const quotes = result.scores.map((s) => s.evidence).filter(Boolean);
  assert.ok(new Set(quotes).size >= 3);
});

test("mockScore does not crash or invent evidence without applicant messages", () => {
  const result = mockScore({ caseId: "bbm-terpencil", messages: [msg("raka", "Mulai.")], elapsedSec: 0 });
  assert.ok(result.scores.every((s) => s.score === 1 && s.evidence === ""));
});

test("mockScore does not mutate its input", () => {
  const frozen = Object.freeze(strong.map((m) => Object.freeze({ ...m })));
  assert.doesNotThrow(() => mockScore({ caseId: "bbm-terpencil", messages: frozen, elapsedSec: 10 }));
});

const rawScores = (overrides = {}) => ({
  scores: ASPECTS.map((aspect) => ({ aspect, score: 3, evidence: " kutipan ", comment: " ok " })),
  summary: " ringkas ",
  nextSteps: ["a", "b"],
  ...overrides,
});

test("normalizeScore clamps and rounds scores", () => {
  const raw = rawScores();
  raw.scores[0].score = 7;
  raw.scores[1].score = 0;
  raw.scores[2].score = 3.6;
  const out = normalizeScore(raw);
  assert.deepEqual(out.scores.slice(0, 3).map((s) => s.score), [5, 1, 4]);
});

test("normalizeScore returns canonical order, labels, and trimmed strings", () => {
  const raw = rawScores();
  raw.scores.reverse();
  const out = normalizeScore(raw);
  assert.deepEqual(out.scores.map((s) => s.aspect), [...ASPECTS]);
  assert.equal(out.scores[0].label, "Inisiatif");
  assert.equal(out.scores[0].evidence, "kutipan");
  assert.equal(out.summary, "ringkas");
});

test("normalizeScore rejects incomplete or malformed output", () => {
  const missing = rawScores();
  missing.scores.pop();
  assert.equal(normalizeScore(missing), null);
  assert.equal(normalizeScore(null), null);
  assert.equal(normalizeScore(rawScores({ nextSteps: [] })), null);
});

test("normalizeScore keeps at most three next steps", () => {
  const out = normalizeScore(rawScores({ nextSteps: ["a", "", "b", "c", "d"] }));
  assert.deepEqual(out.nextSteps, ["a", "b", "c"]);
});
