import test from "node:test";
import assert from "node:assert/strict";
import { createTtsHandler } from "../lib/ttsHttp.js";
import { VOICE_CAST } from "../lib/voices.js";

const MP3 = Buffer.from([0xff, 0xf3, 0x64, 0x00]);
const allowAll = { check: () => ({ allowed: true }) };

function fakeRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.body = payload;
      return this;
    },
  };
}

const request = (query, { method = "GET", headers = {} } = {}) => ({
  method,
  url: `/api/tts?${new URLSearchParams(query)}`,
  headers,
  socket: { remoteAddress: "1.2.3.4" },
});

test("returns mp3 audio for a known speaker, cacheable at the edge", async () => {
  const calls = [];
  const handler = createTtsHandler({ env: {}, limiter: allowAll, synth: async (args) => (calls.push(args), MP3) });
  const res = fakeRes();
  await handler(request({ s: "raka", t: "Oke, langsung saja." }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "audio/mpeg");
  assert.match(res.headers["cache-control"], /s-maxage=\d+/);
  assert.ok(Buffer.isBuffer(res.body) && res.body.equals(MP3));
  assert.deepEqual(calls, [{ ...VOICE_CAST.raka, text: "Oke, langsung saja." }]);
});

test("rejects other methods", async () => {
  const res = fakeRes();
  await createTtsHandler({ env: {}, limiter: allowAll, synth: async () => MP3 })(request({}, { method: "POST" }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "GET");
});

test("rejects unknown speakers and empty text with 400", async () => {
  const handler = createTtsHandler({ env: {}, limiter: allowAll, synth: async () => MP3 });
  for (const query of [{ s: "hacker", t: "Halo" }, { s: "raka", t: "" }]) {
    const res = fakeRes();
    await handler(request(query), res);
    assert.equal(res.statusCode, 400);
  }
});

test("requires the access code when one is configured", async () => {
  const handler = createTtsHandler({ env: { DEMO_ACCESS_CODE: "kode" }, limiter: allowAll, synth: async () => MP3 });
  const denied = fakeRes();
  await handler(request({ s: "raka", t: "Halo" }, { headers: { "x-demo-code": "salah" } }), denied);
  assert.equal(denied.statusCode, 401);
  const allowed = fakeRes();
  await handler(request({ s: "raka", t: "Halo" }, { headers: { "x-demo-code": "kode" } }), allowed);
  assert.equal(allowed.statusCode, 200);
});

test("answers 429 with Retry-After when rate limited", async () => {
  const limiter = { check: () => ({ allowed: false, retryAfterSec: 7 }) };
  const res = fakeRes();
  await createTtsHandler({ env: {}, limiter, synth: async () => MP3 })(request({ s: "raka", t: "Halo" }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["retry-after"], "7");
});

test("a synthesis failure becomes a generic 502 that is never cached", async () => {
  const res = fakeRes();
  const synth = async () => {
    throw new Error("socket closed: internal detail");
  };
  await createTtsHandler({ env: {}, limiter: allowAll, synth, log: () => {} })(request({ s: "raka", t: "Halo" }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.doesNotMatch(JSON.stringify(res.body), /internal detail/);
});
