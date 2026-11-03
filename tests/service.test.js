import test from "node:test";
import assert from "node:assert/strict";
import { runScore, runTurn } from "../lib/service.js";
import { ASPECTS } from "../lib/schemas.js";

const request = {
  caseId: "bbm-terpencil",
  messages: Object.freeze([
    Object.freeze({ speaker: "raka", text: "Mulai." }),
    Object.freeze({ speaker: "you", text: "Saya usul kita bandingkan biaya dua opsi dulu." }),
  ]),
  elapsedSec: 120,
};
const silent = () => {};
const goodScore = () => ({
  scores: ASPECTS.map((aspect) => ({ aspect, score: 4, evidence: "Saya usul", comment: "Baik." })),
  summary: "Bagus.",
  nextSteps: ["Satu", "Dua"],
});

test("runTurn uses the live model when available and passes the chosen speakers", async () => {
  let seen;
  const llm = {
    turn: async (args) => {
      seen = args;
      return { replies: args.speakers.map((speaker) => ({ speaker, text: `Balasan ${speaker}` })) };
    },
  };
  const out = await runTurn(request, { llm, log: silent });
  assert.equal(out.mode, "live");
  assert.deepEqual(seen.speakers, out.replies.map((r) => r.speaker));
  assert.equal(seen.caseData.id, "bbm-terpencil");
});

test("runTurn drops replies from speakers that were not requested", async () => {
  const llm = {
    turn: async (args) => ({
      replies: [
        { speaker: "dimas", text: "Saya tidak diminta bicara." },
        { speaker: args.speakers[0], text: "Ini sah." },
      ],
    }),
  };
  const out = await runTurn(request, { llm, log: silent });
  assert.equal(out.mode, "live");
  assert.equal(out.replies.length, 1);
  assert.equal(out.replies[0].text, "Ini sah.");
});

test("runTurn falls back to the simulation when the model fails, and logs it", async () => {
  const logged = [];
  const llm = { turn: async () => { throw new Error("boom"); } };
  const out = await runTurn(request, { llm, log: (...a) => logged.push(a.join(" ")) });
  assert.equal(out.mode, "fallback");
  assert.ok(out.replies.length > 0);
  assert.ok(logged.some((line) => line.includes("boom")));
});

test("runTurn falls back when the model returns nothing usable", async () => {
  const llm = { turn: async () => ({ replies: [{ speaker: "nobody", text: "x" }] }) };
  assert.equal((await runTurn(request, { llm, log: silent })).mode, "fallback");
});

test("runTurn without a model runs the simulation", async () => {
  const out = await runTurn(request, { log: silent });
  assert.equal(out.mode, "mock");
  assert.ok(out.replies.length > 0);
});

test("runScore returns the normalised live score", async () => {
  const out = await runScore(request, { llm: { score: async () => goodScore() }, log: silent });
  assert.equal(out.mode, "live");
  assert.equal(out.scores.length, 6);
  assert.equal(out.scores[0].label, "Inisiatif");
});

test("runScore falls back when the model output is incomplete", async () => {
  const bad = goodScore();
  bad.scores.pop();
  const out = await runScore(request, { llm: { score: async () => bad }, log: silent });
  assert.equal(out.mode, "fallback");
  assert.equal(out.scores.length, 6);
});

test("runScore falls back when the model throws", async () => {
  const llm = { score: async () => { throw new Error("rate limited"); } };
  assert.equal((await runScore(request, { llm, log: silent })).mode, "fallback");
});

test("runScore without a model runs the simulation", async () => {
  const out = await runScore(request, { log: silent });
  assert.equal(out.mode, "mock");
  assert.equal(out.scores.length, 6);
});
