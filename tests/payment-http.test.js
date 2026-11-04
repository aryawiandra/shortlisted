import test from "node:test";
import assert from "node:assert/strict";
import { createCheckoutHandler, createOrderHandler } from "../lib/paymentHttp.js";

const SANDBOX_ENV = { MIDTRANS_SERVER_KEY: "SB-Mid-server-test", SITE_URL: "https://shortlisted.test" };
const BODY = { plan: "siap", name: "Nadia Putri", email: "nadia@example.test", whatsapp: "081234567890", consent: true };
const allowAll = { check: () => ({ allowed: true }) };
const quiet = () => {};

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
  };
}

const post = (body, headers = {}) => ({ method: "POST", body: JSON.stringify(body), headers, socket: { remoteAddress: "1.2.3.4" } });
const get = (url) => ({ method: "GET", url, headers: {}, socket: { remoteAddress: "1.2.3.4" } });

function fakeFetch(status, json) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { status, ok: status >= 200 && status < 300, json: async () => json };
  };
  return { impl, calls };
}

const checkout = (overrides = {}) =>
  createCheckoutHandler({
    env: SANDBOX_ENV,
    limiter: allowAll,
    now: () => 1_762_200_000_000,
    randomHex: () => "a1b2c3d4e5",
    log: quiet,
    ...overrides,
  });

test("checkout creates a Snap transaction at the server price and returns its payment page", async () => {
  const fetch = fakeFetch(201, { token: "tok", redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/tok" });
  const res = fakeRes();
  await checkout({ fetchImpl: fetch.impl })(post({ ...BODY, price: 1 }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.redirectUrl, "https://app.sandbox.midtrans.com/snap/v4/redirection/tok");
  assert.match(res.body.orderId, /^SL-SIAP-/);
  assert.equal(res.headers["cache-control"], "no-store");

  const [call] = fetch.calls;
  assert.equal(call.url, "https://app.sandbox.midtrans.com/snap/v1/transactions");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers.Authorization, `Basic ${Buffer.from("SB-Mid-server-test:").toString("base64")}`);
  const sent = JSON.parse(call.init.body);
  assert.equal(sent.transaction_details.gross_amount, 49_000);
  assert.equal(sent.transaction_details.order_id, res.body.orderId);
  assert.equal(sent.customer_details.phone, "+6281234567890");
});

test("checkout says payments are closed when no key is set, without calling Midtrans", async () => {
  const fetch = fakeFetch(201, {});
  const res = fakeRes();
  await checkout({ env: {}, fetchImpl: fetch.impl })(post(BODY), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "closed");
  assert.equal(fetch.calls.length, 0);
});

test("a sandbox key in production mode is refused and logged", async () => {
  const logged = [];
  const res = fakeRes();
  const env = { MIDTRANS_SERVER_KEY: "SB-Mid-server-test", MIDTRANS_ENV: "production" };
  await checkout({ env, fetchImpl: fakeFetch(201, {}).impl, log: (...args) => logged.push(args.join(" ")) })(post(BODY), res);
  assert.equal(res.statusCode, 503);
  assert.match(logged.join("\n"), /key_mismatch/);
});

test("checkout rejects bad input with a readable message", async () => {
  const res = fakeRes();
  await checkout({ fetchImpl: fakeFetch(201, {}).impl })(post({ ...BODY, consent: false }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /syarat/i);
});

test("checkout accepts POST only and honours the rate limit", async () => {
  const wrong = fakeRes();
  await checkout({ fetchImpl: fakeFetch(201, {}).impl })(get("/api/checkout"), wrong);
  assert.equal(wrong.statusCode, 405);
  assert.equal(wrong.headers.allow, "POST");

  const limited = fakeRes();
  const limiter = { check: () => ({ allowed: false, retryAfterSec: 30 }) };
  await checkout({ fetchImpl: fakeFetch(201, {}).impl, limiter })(post(BODY), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers["retry-after"], "30");
});

test("a Midtrans error or an unexpected redirect host becomes a 502, details only in the log", async () => {
  for (const [status, json] of [
    [401, { error_messages: ["Access denied"] }],
    [201, { token: "t", redirect_url: "https://evil.test/pay" }],
  ]) {
    const logged = [];
    const res = fakeRes();
    await checkout({ fetchImpl: fakeFetch(status, json).impl, log: (...args) => logged.push(args.join(" ")) })(post(BODY), res);
    assert.equal(res.statusCode, 502);
    assert.doesNotMatch(JSON.stringify(res.body), /Access denied|evil/);
    assert.ok(logged.length > 0);
  }
});

test("a network failure becomes a 502 instead of crashing", async () => {
  const res = fakeRes();
  const fetchImpl = async () => {
    throw new Error("socket hang up");
  };
  await checkout({ fetchImpl })(post(BODY), res);
  assert.equal(res.statusCode, 502);
});

const order = (fetchImpl, env = SANDBOX_ENV) => createOrderHandler({ env, fetchImpl, limiter: allowAll, log: quiet });

test("order status asks Midtrans directly and returns only the state and plan", async () => {
  const fetch = fakeFetch(200, { status_code: "200", transaction_status: "settlement", gross_amount: "49000.00", customer_details: { email: "x" } });
  const res = fakeRes();
  await order(fetch.impl)(get("/api/order?id=SL-SIAP-abc-a1b2c3d4e5"), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { state: "paid", plan: "Siap Seleksi" });
  assert.equal(fetch.calls[0].url, "https://api.sandbox.midtrans.com/v2/SL-SIAP-abc-a1b2c3d4e5/status");
});

test("order status reports pending and unknown orders", async () => {
  const pending = fakeRes();
  await order(fakeFetch(200, { status_code: "201", transaction_status: "pending" }).impl)(get("/api/order?id=SL-INTENSIF-abc-1"), pending);
  assert.deepEqual(pending.body, { state: "pending", plan: "Intensif" });

  const missing = fakeRes();
  await order(fakeFetch(404, { status_code: "404", status_message: "Transaction doesn't exist." }).impl)(get("/api/order?id=SL-SIAP-abc-1"), missing);
  assert.equal(missing.statusCode, 200);
  assert.equal(missing.body.state, "not_found");
});

test("a rejected key or a Midtrans outage is an error, not a missing order", async () => {
  for (const [status, json] of [
    [401, { error: "Unauthorized" }],
    [500, null],
  ]) {
    const logged = [];
    const res = fakeRes();
    const handler = createOrderHandler({
      env: SANDBOX_ENV,
      fetchImpl: fakeFetch(status, json).impl,
      limiter: allowAll,
      log: (...args) => logged.push(args.join(" ")),
    });
    await handler(get("/api/order?id=SL-SIAP-abc-1"), res);
    assert.equal(res.statusCode, 502);
    assert.match(logged.join("\n"), new RegExp(String(status)));
  }
});

test("order status rejects ids that are not ours before calling Midtrans", async () => {
  const fetch = fakeFetch(200, {});
  const res = fakeRes();
  await order(fetch.impl)(get("/api/order?id=..%2F..%2Fsecret"), res);
  assert.equal(res.statusCode, 400);
  assert.equal(fetch.calls.length, 0);
});

test("order status is closed without a key and fails soft when Midtrans is down", async () => {
  const closed = fakeRes();
  await order(fakeFetch(200, {}).impl, {})(get("/api/order?id=SL-SIAP-abc-1"), closed);
  assert.equal(closed.statusCode, 503);

  const down = fakeRes();
  await order(async () => {
    throw new Error("timeout");
  })(get("/api/order?id=SL-SIAP-abc-1"), down);
  assert.equal(down.statusCode, 502);
});
