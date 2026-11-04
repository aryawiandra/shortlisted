import test from "node:test";
import assert from "node:assert/strict";
import {
  PLANS,
  isOrderId,
  newOrderId,
  normalizePhone,
  orderState,
  paymentConfig,
  snapRequest,
  validateCheckout,
} from "../lib/payments.js";

const VALID = { plan: "siap", name: "Nadia Putri", email: "Nadia@Example.test", whatsapp: "0812-3456-7890", consent: true };

test("plans are priced on the server and match the landing page", () => {
  assert.equal(PLANS.siap.price, 49_000);
  assert.equal(PLANS.intensif.price, 99_000);
});

test("a valid checkout is normalized: trimmed name, lowercase email, +62 phone", () => {
  const checked = validateCheckout({ ...VALID, name: "  Nadia Putri  " });
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.value, { plan: "siap", name: "Nadia Putri", email: "nadia@example.test", phone: "+6281234567890" });
});

test("the client cannot choose the price", () => {
  const checked = validateCheckout({ ...VALID, price: 1000, amount: 1 });
  assert.equal(checked.ok, true);
  assert.equal(Object.hasOwn(checked.value, "price"), false);
  assert.equal(snapRequest({ orderId: "SL-SIAP-x-1", ...checked.value, siteUrl: "https://a.test" }).transaction_details.gross_amount, 49_000);
});

test("rejects unknown plans, missing consent, bad email, short names and bad numbers", () => {
  const cases = [
    [{ ...VALID, plan: "gratis" }, /paket/i],
    [{ ...VALID, consent: false }, /syarat/i],
    [{ ...VALID, email: "nadia@" }, /email/i],
    [{ ...VALID, name: "N" }, /nama/i],
    [{ ...VALID, whatsapp: "12345" }, /whatsapp/i],
    [null, /data/i],
  ];
  for (const [body, message] of cases) {
    const checked = validateCheckout(body);
    assert.equal(checked.ok, false);
    assert.match(checked.error, message);
  }
});

test("phone numbers in the usual Indonesian forms all become +62", () => {
  for (const raw of ["081234567890", "+6281234567890", "6281234567890", "0812 3456 7890", "81234567890"]) {
    assert.equal(normalizePhone(raw), "+6281234567890");
  }
  assert.equal(normalizePhone("021123"), null);
  assert.equal(normalizePhone("0812345678901234"), null);
});

test("control characters are stripped from the name", () => {
  const checked = validateCheckout({ ...VALID, name: "Nadia\u0000 Putri" });
  assert.equal(checked.value.name, "Nadia Putri");
});

test("order ids are unique per call, Midtrans-safe, and recognisable", () => {
  const id = newOrderId("intensif", 1_762_200_000_000, "a1b2c3d4e5");
  assert.match(id, /^SL-INTENSIF-[0-9a-z]+-a1b2c3d4e5$/);
  assert.ok(id.length <= 50);
  assert.equal(isOrderId(id), true);
  assert.equal(isOrderId("SL-SIAP-1-../../x"), false);
  assert.equal(isOrderId("x".repeat(60)), false);
});

test("the Snap request carries one line item that sums to the gross amount", () => {
  const body = snapRequest({
    orderId: "SL-SIAP-abc-123",
    plan: "siap",
    name: "Nadia Putri",
    email: "nadia@example.test",
    phone: "+6281234567890",
    siteUrl: "https://shortlisted.test/",
  });
  assert.deepEqual(body.transaction_details, { order_id: "SL-SIAP-abc-123", gross_amount: 49_000 });
  assert.equal(body.item_details.length, 1);
  assert.equal(body.item_details[0].price * body.item_details[0].quantity, 49_000);
  assert.deepEqual(body.customer_details, { first_name: "Nadia Putri", email: "nadia@example.test", phone: "+6281234567890" });
  assert.equal(body.callbacks.finish, "https://shortlisted.test/terima-kasih.html");
  assert.deepEqual(body.expiry, { unit: "hours", duration: 24 });
});

test("payments stay closed until a server key is set", () => {
  assert.deepEqual(paymentConfig({}), { ok: false, reason: "not_configured" });
});

test("sandbox is the default and uses the sandbox hosts", () => {
  const config = paymentConfig({ MIDTRANS_SERVER_KEY: "SB-Mid-server-abc", SITE_URL: "https://a.test" });
  assert.equal(config.ok, true);
  assert.equal(config.production, false);
  assert.equal(config.snapUrl, "https://app.sandbox.midtrans.com/snap/v1/transactions");
  assert.equal(config.apiBase, "https://api.sandbox.midtrans.com");
});

test("production needs an explicit switch and uses the production hosts", () => {
  const config = paymentConfig({ MIDTRANS_SERVER_KEY: "Mid-server-abc", MIDTRANS_ENV: "production", SITE_URL: "https://a.test" });
  assert.equal(config.production, true);
  assert.equal(config.snapUrl, "https://app.midtrans.com/snap/v1/transactions");
  assert.equal(config.apiBase, "https://api.midtrans.com");
});

test("a key that does not match the environment is refused, so test money never looks real", () => {
  assert.deepEqual(paymentConfig({ MIDTRANS_SERVER_KEY: "SB-Mid-server-abc", MIDTRANS_ENV: "production" }), {
    ok: false,
    reason: "key_mismatch",
  });
  assert.deepEqual(paymentConfig({ MIDTRANS_SERVER_KEY: "Mid-server-abc" }), { ok: false, reason: "key_mismatch" });
});

test("the site URL defaults to production and must be https", () => {
  assert.equal(paymentConfig({ MIDTRANS_SERVER_KEY: "SB-Mid-server-abc" }).siteUrl, "https://shortlisted-three.vercel.app");
  assert.deepEqual(paymentConfig({ MIDTRANS_SERVER_KEY: "SB-Mid-server-abc", SITE_URL: "javascript:alert(1)" }), {
    ok: false,
    reason: "bad_site_url",
  });
  assert.equal(paymentConfig({ MIDTRANS_SERVER_KEY: "SB-Mid-server-abc", SITE_URL: "http://localhost:3000" }).ok, true);
});

test("Midtrans statuses collapse into paid, pending, failed or not found", () => {
  assert.equal(orderState({ status_code: "200", transaction_status: "settlement" }), "paid");
  assert.equal(orderState({ status_code: "200", transaction_status: "capture", fraud_status: "accept" }), "paid");
  assert.equal(orderState({ status_code: "200", transaction_status: "capture", fraud_status: "challenge" }), "pending");
  assert.equal(orderState({ status_code: "201", transaction_status: "pending" }), "pending");
  for (const status of ["deny", "cancel", "expire", "failure", "refund"]) {
    assert.equal(orderState({ status_code: "202", transaction_status: status }), "failed");
  }
  assert.equal(orderState({ status_code: "404" }), "not_found");
  assert.equal(orderState(null), "not_found");
});
