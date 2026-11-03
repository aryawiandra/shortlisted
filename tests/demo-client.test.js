import test from "node:test";
import assert from "node:assert/strict";
import { formatClock, parseBounded, tail } from "../demo/format.js";
import { ApiError, createApiClient } from "../demo/api.js";

test("formatClock pads minutes and seconds and never goes negative", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(65), "01:05");
  assert.equal(formatClock(360), "06:00");
  assert.equal(formatClock(-4), "00:00");
  assert.equal(formatClock(359.6), "06:00");
});

test("parseBounded clamps, and falls back when missing or invalid", () => {
  const rule = { min: 1, max: 15, fallback: 6 };
  assert.equal(parseBounded("8", rule), 8);
  assert.equal(parseBounded("99", rule), 15);
  assert.equal(parseBounded("0", rule), 1);
  for (const bad of [null, undefined, "", "abc"]) assert.equal(parseBounded(bad, rule), 6);
});

test("tail returns the last items as a new array", () => {
  const items = Object.freeze([1, 2, 3, 4]);
  assert.deepEqual(tail(items, 2), [3, 4]);
  assert.deepEqual(tail(items, 10), [1, 2, 3, 4]);
});

const reply = ({ ok = true, status = 200, data = {}, headers = {}, json } = {}) => ({
  ok,
  status,
  headers: { get: (name) => headers[name] ?? null },
  json: json ?? (async () => data),
});

test("POST requests send JSON and the access code, and return the parsed body", async () => {
  const seen = [];
  const fetchImpl = async (path, init) => {
    seen.push({ path, init });
    return reply({ data: { mode: "mock", replies: [] } });
  };
  const api = createApiClient({ fetchImpl, getAccessCode: () => "kode" });
  const data = await api.turn({ caseId: "x", messages: [] });
  assert.deepEqual(data, { mode: "mock", replies: [] });
  assert.equal(seen[0].path, "/api/turn");
  assert.equal(seen[0].init.method, "POST");
  assert.equal(seen[0].init.headers["x-demo-code"], "kode");
  assert.deepEqual(JSON.parse(seen[0].init.body), { caseId: "x", messages: [] });
});

test("status is a GET without a body", async () => {
  const seen = [];
  const api = createApiClient({ fetchImpl: async (path, init) => (seen.push(init), reply({ data: { mode: "mock" } })) });
  await api.status();
  assert.equal(seen[0].method, "GET");
  assert.equal(seen[0].body, undefined);
});

test("server errors keep their message, status and Retry-After", async () => {
  const fetchImpl = async () =>
    reply({ ok: false, status: 429, data: { error: "Terlalu banyak permintaan." }, headers: { "Retry-After": "30" } });
  await assert.rejects(
    () => createApiClient({ fetchImpl }).turn({}),
    (error) =>
      error instanceof ApiError &&
      error.status === 429 &&
      error.retryAfterSec === 30 &&
      error.message === "Terlalu banyak permintaan.",
  );
});

test("a network failure becomes a friendly ApiError", async () => {
  const fetchImpl = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(
    () => createApiClient({ fetchImpl }).turn({}),
    (error) => error instanceof ApiError && /koneksi/i.test(error.message),
  );
});

test("a non-JSON error body falls back to a generic message", async () => {
  const fetchImpl = async () =>
    reply({ ok: false, status: 502, json: async () => { throw new SyntaxError("Unexpected token <"); } });
  await assert.rejects(
    () => createApiClient({ fetchImpl }).score({}),
    (error) => error instanceof ApiError && error.status === 502 && error.message.length > 0,
  );
});
