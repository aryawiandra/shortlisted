import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, createStatusHandler, resolveMode } from "../lib/http.js";
import { ASPECTS } from "../lib/schemas.js";

const fakeRes = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});
const open = { check: () => ({ allowed: true }) };
const body = {
  caseId: "bbm-terpencil",
  messages: [{ speaker: "you", text: "Saya usul kita cek biaya dulu." }],
  elapsedSec: 60,
};
const post = (overrides = {}) => ({
  method: "POST",
  headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
  body,
  ...overrides,
});
const run = async (kind, req, options = {}) => {
  const res = fakeRes();
  await createHandler({ kind, env: {}, limiter: open, ...options })(req, res);
  return res;
};
const fakeLlm = {
  turn: async ({ speakers }) => ({ replies: [{ speaker: speakers[0], text: "Balasan AI." }] }),
  score: async () => ({
    scores: ASPECTS.map((aspect) => ({ aspect, score: 5, evidence: "", comment: "Mantap." })),
    summary: "Ok.",
    nextSteps: ["Satu"],
  }),
};

test("resolveMode: simulation by default, live with a key, mock override, live override", () => {
  assert.equal(resolveMode({}), "mock");
  assert.equal(resolveMode({ ANTHROPIC_API_KEY: "k" }), "live");
  assert.equal(resolveMode({ ANTHROPIC_API_KEY: "k", DEMO_MODE: "mock" }), "mock");
  assert.equal(resolveMode({ DEMO_MODE: "live" }), "live");
});

test("only POST is accepted", async () => {
  const res = await run("turn", post({ method: "GET" }));
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "POST");
});

test("invalid bodies get a 400 with a message", async () => {
  const res = await run("turn", post({ body: { caseId: "tidak-ada", messages: [] } }));
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error);
});

test("a JSON string body is parsed", async () => {
  const res = await run("turn", post({ body: JSON.stringify(body) }));
  assert.equal(res.statusCode, 200);
});

test("a body that is not valid JSON gets a 400", async () => {
  const res = await run("turn", post({ body: "{not json" }));
  assert.equal(res.statusCode, 400);
});

test("an unexpected failure returns a generic 500 without leaking details", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await run("turn", post(), {
      env: { ANTHROPIC_API_KEY: "k" },
      llmFactory: () => { throw new Error("secret internal detail"); },
    });
    assert.equal(res.statusCode, 500);
    assert.ok(!JSON.stringify(res.body).includes("secret internal detail"));
  } finally {
    console.error = originalError;
  }
});

test("without a key the turn endpoint runs the simulation", async () => {
  const res = await run("turn", post());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, "mock");
  assert.ok(res.body.replies.length > 0);
  assert.equal(res.headers["cache-control"], "no-store");
});

test("with a key the turn endpoint uses the live model", async () => {
  const res = await run("turn", post(), { env: { ANTHROPIC_API_KEY: "k" }, llmFactory: () => fakeLlm });
  assert.equal(res.body.mode, "live");
  assert.equal(res.body.replies[0].text, "Balasan AI.");
});

test("DEMO_MODE=mock forces the simulation even with a key", async () => {
  const env = { ANTHROPIC_API_KEY: "k", DEMO_MODE: "mock" };
  const res = await run("turn", post(), { env, llmFactory: () => { throw new Error("must not build"); } });
  assert.equal(res.body.mode, "mock");
});

test("the score endpoint returns six scored aspects", async () => {
  const res = await run("score", post());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.scores.length, 6);
});

test("an access code is required when configured, and checked exactly", async () => {
  const env = { DEMO_ACCESS_CODE: "rahasia" };
  assert.equal((await run("turn", post(), { env })).statusCode, 401);
  const wrong = post({ headers: { "x-demo-code": "salah" } });
  assert.equal((await run("turn", wrong, { env })).statusCode, 401);
  const right = post({ headers: { "x-demo-code": "rahasia" } });
  assert.equal((await run("turn", right, { env })).statusCode, 200);
});

test("rate limited callers get 429 with Retry-After, keyed by the first forwarded IP", async () => {
  const keys = [];
  const limiter = { check: (key) => { keys.push(key); return { allowed: false, retryAfterSec: 42 }; } };
  const res = await run("turn", post(), { limiter });
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["retry-after"], "42");
  assert.deepEqual(keys, ["203.0.113.7"]);
});

test("rate limiting runs before any model work", async () => {
  const limiter = { check: () => ({ allowed: false, retryAfterSec: 1 }) };
  const env = { ANTHROPIC_API_KEY: "k" };
  const res = await run("turn", post(), { env, limiter, llmFactory: () => { throw new Error("must not build"); } });
  assert.equal(res.statusCode, 429);
});

test("status reports the mode and whether a code is needed, without leaking secrets", () => {
  const res = fakeRes();
  createStatusHandler({ env: { ANTHROPIC_API_KEY: "sk-secret", DEMO_ACCESS_CODE: "rahasia" } })({ method: "GET", headers: {} }, res);
  assert.deepEqual(res.body, { mode: "live", accessCodeRequired: true, paymentsOpen: false });
  assert.ok(!JSON.stringify(res.body).includes("sk-secret"));
  assert.ok(!JSON.stringify(res.body).includes("rahasia"));
});

test("status says payments are open only with a key that matches the environment", () => {
  const status = (env) => {
    const res = fakeRes();
    createStatusHandler({ env })({ method: "GET", headers: {} }, res);
    return res.body;
  };
  assert.equal(status({ MIDTRANS_SERVER_KEY: "SB-Mid-server-x" }).paymentsOpen, true);
  assert.equal(status({ MIDTRANS_SERVER_KEY: "SB-Mid-server-x", MIDTRANS_ENV: "production" }).paymentsOpen, false);
  assert.ok(!JSON.stringify(status({ MIDTRANS_SERVER_KEY: "SB-Mid-server-x" })).includes("SB-Mid"));
});
