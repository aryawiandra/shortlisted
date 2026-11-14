import test from "node:test";
import assert from "node:assert/strict";
import {
  DRILL_ASPECTS,
  DRILL_SECONDS,
  MAX_ANSWER_LENGTH,
  mockDrill,
  normalizeDrill,
  validateDrillRequest,
} from "../lib/drill.js";
import { createHandler } from "../lib/http.js";
import { runDrill } from "../lib/service.js";

const GOOD_ANSWER =
  "Saya rekomendasikan sewa 2 truk dulu, karena stok di 2 kabupaten tinggal 6 hari. Biayanya Rp36 juta per bulan, masih di bawah anggaran Rp900 juta. Jalur sungai kita siapkan sebagai opsi kedua setelah stok aman.";
const WEAK_ANSWER = "Menurut saya sih bagus.";
const request = Object.freeze({ caseId: "bbm-terpencil", answer: GOOD_ANSWER, elapsedSec: 90 });
const silent = () => {};

const fakeRes = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});
const open = { check: () => ({ allowed: true }) };

test("validateDrillRequest accepts a clean request and clamps elapsed time", () => {
  const out = validateDrillRequest({ caseId: "bbm-terpencil", answer: "  Jawaban saya.  ", elapsedSec: 99999 });
  assert.equal(out.ok, true);
  assert.equal(out.value.answer, "Jawaban saya.");
  assert.ok(out.value.elapsedSec <= 3600);
});

test("validateDrillRequest rejects unknown cases, empty and oversized answers, bad bodies", () => {
  assert.equal(validateDrillRequest(null).ok, false);
  assert.equal(validateDrillRequest({ caseId: "tidak-ada", answer: "x" }).ok, false);
  assert.equal(validateDrillRequest({ caseId: "bbm-terpencil", answer: "   " }).ok, false);
  assert.equal(validateDrillRequest({ caseId: "bbm-terpencil", answer: 5 }).ok, false);
  const tooLong = "a".repeat(MAX_ANSWER_LENGTH + 1);
  assert.equal(validateDrillRequest({ caseId: "bbm-terpencil", answer: tooLong }).ok, false);
});

test("validateDrillRequest strips control characters", () => {
  const out = validateDrillRequest({ caseId: "bbm-terpencil", answer: "Halo\u0000 dunia" });
  assert.equal(out.value.answer, "Halo dunia");
});

test("mockDrill scores exactly the drill aspects within 1 to 5", () => {
  const out = mockDrill(request);
  assert.deepEqual(out.scores.map((s) => s.aspect), [...DRILL_ASPECTS]);
  for (const item of out.scores) {
    assert.ok(item.score >= 1 && item.score <= 5);
    assert.equal(typeof item.comment, "string");
  }
  assert.ok(out.nextSteps.length >= 1 && out.nextSteps.length <= 3);
});

test("mockDrill rewards case figures and a clear recommendation", () => {
  const good = mockDrill(request);
  const weak = mockDrill({ ...request, answer: WEAK_ANSWER });
  const byAspect = (out, aspect) => out.scores.find((s) => s.aspect === aspect).score;
  assert.ok(byAspect(good, "analisis") >= 4);
  assert.ok(byAspect(good, "keputusan") >= 4);
  assert.ok(byAspect(weak, "analisis") <= 2);
  assert.ok(byAspect(weak, "keputusan") <= 2);
});

test("mockDrill quotes the applicant's own words as evidence and flags overtime", () => {
  const out = mockDrill({ ...request, elapsedSec: DRILL_SECONDS + 30 });
  const analisis = out.scores.find((s) => s.aspect === "analisis");
  assert.ok(GOOD_ANSWER.includes(analisis.evidence) && analisis.evidence.length > 0);
  assert.match(out.summary, /waktu/i);
});

test("normalizeDrill repairs a complete result and rejects an incomplete one", () => {
  const complete = {
    scores: DRILL_ASPECTS.map((aspect) => ({ aspect, score: 9, evidence: " kutipan ", comment: " ok " })),
    summary: " Ringkas. ",
    nextSteps: ["Satu", "Dua", "Tiga", "Empat"],
  };
  const out = normalizeDrill(complete);
  assert.equal(out.scores[0].score, 5);
  assert.equal(out.scores[0].evidence, "kutipan");
  assert.equal(out.nextSteps.length, 3);
  assert.equal(normalizeDrill({ scores: complete.scores.slice(1), summary: "", nextSteps: ["x"] }), null);
  assert.equal(normalizeDrill(null), null);
});

test("runDrill uses simulation without a model, live with one, and falls back on failure", async () => {
  assert.equal((await runDrill(request)).mode, "mock");

  const good = {
    drill: async () => ({
      scores: DRILL_ASPECTS.map((aspect) => ({ aspect, score: 4, evidence: "", comment: "Baik." })),
      summary: "Bagus.",
      nextSteps: ["Satu"],
    }),
  };
  assert.equal((await runDrill(request, { llm: good, log: silent })).mode, "live");

  const broken = { drill: async () => { throw new Error("boom"); } };
  assert.equal((await runDrill(request, { llm: broken, log: silent })).mode, "fallback");

  const incomplete = { drill: async () => ({ scores: [], summary: "", nextSteps: [] }) };
  assert.equal((await runDrill(request, { llm: incomplete, log: silent })).mode, "fallback");
});

test("the client posts drill answers to /api/drill", async () => {
  const { createApiClient } = await import("../demo/api.js");
  let seen;
  const fetchImpl = async (path, init) => {
    seen = { path, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ mode: "mock" }), headers: { get: () => null } };
  };
  const api = createApiClient({ fetchImpl });
  await api.drill({ caseId: "bbm-terpencil", answer: "Jawaban.", elapsedSec: 10 });
  assert.equal(seen.path, "/api/drill");
  assert.equal(seen.body.answer, "Jawaban.");
});

test("the drill endpoint answers POST, rejects bad input and other methods", async () => {
  const handler = createHandler({ kind: "drill", env: {}, limiter: open });

  const ok = fakeRes();
  await handler({ method: "POST", headers: {}, body: request }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.mode, "mock");
  assert.equal(ok.body.scores.length, DRILL_ASPECTS.length);

  const bad = fakeRes();
  await handler({ method: "POST", headers: {}, body: { caseId: "bbm-terpencil", answer: "" } }, bad);
  assert.equal(bad.statusCode, 400);

  const wrongMethod = fakeRes();
  await handler({ method: "GET", headers: {} }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
});
