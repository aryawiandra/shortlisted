// Pre-sale payments through Midtrans Snap. Pure functions only (no Node APIs), so the
// browser form can reuse the same validation. Prices live here, never in the request.

export const PLANS = Object.freeze({
  siap: Object.freeze({ label: "Siap Seleksi", price: 49_000 }),
  intensif: Object.freeze({ label: "Intensif", price: 99_000 }),
});

export const DEFAULT_SITE_URL = "https://shortlisted-three.vercel.app";
const HOSTS = Object.freeze({
  sandbox: Object.freeze({ snap: "https://app.sandbox.midtrans.com", api: "https://api.sandbox.midtrans.com" }),
  production: Object.freeze({ snap: "https://app.midtrans.com", api: "https://api.midtrans.com" }),
});
const PAYMENT_WINDOW_HOURS = 24;
const MAX_ORDER_ID = 50; // Midtrans limit
const MAX_NAME = 80;
const MAX_EMAIL = 120;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE = /^8\d{8,11}$/; // Indonesian mobile number without the 0 / 62 prefix
const ORDER_ID = /^SL-(SIAP|INTENSIF)-[0-9a-z]+-[0-9a-f]+$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

const fail = (error) => ({ ok: false, error });

export function normalizePhone(raw) {
  const digits = String(raw ?? "").replace(/[\s().-]/g, "");
  const local = digits.replace(/^\+?62/, "").replace(/^0/, "");
  return MOBILE.test(local) ? `+62${local}` : null;
}

function cleanName(raw) {
  return String(raw ?? "").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

export function validateCheckout(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return fail("Data pembelian tidak terbaca.");
  if (!Object.hasOwn(PLANS, body.plan)) return fail("Pilih paket yang tersedia.");

  const name = cleanName(body.name);
  if (name.length < 2 || name.length > MAX_NAME) return fail("Nama minimal 2 huruf.");

  const email = String(body.email ?? "").trim().toLowerCase();
  if (email.length > MAX_EMAIL || !EMAIL.test(email)) return fail("Email belum benar.");

  const phone = normalizePhone(body.whatsapp);
  if (!phone) return fail("Nomor WhatsApp belum benar. Contoh: 0812 3456 7890.");

  if (body.consent !== true) return fail("Centang persetujuan syarat pre-sale dan kebijakan privasi dulu.");

  return { ok: true, value: Object.freeze({ plan: body.plan, name, email, phone }) };
}

export const newOrderId = (plan, nowMs, randomHex) => `SL-${plan.toUpperCase()}-${nowMs.toString(36)}-${randomHex}`;

export const isOrderId = (id) => typeof id === "string" && id.length <= MAX_ORDER_ID && ORDER_ID.test(id);

export const planOfOrder = (id) => PLANS[id.split("-")[1].toLowerCase()];

function parseSiteUrl(raw) {
  try {
    const url = new URL(raw);
    const allowed = url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
    return allowed ? url.origin : null;
  } catch {
    return null;
  }
}

// Sandbox unless MIDTRANS_ENV=production. A key from the other environment is refused,
// so a sandbox payment can never pass for real money (and the reverse).
export function paymentConfig(env) {
  const serverKey = String(env.MIDTRANS_SERVER_KEY ?? "").trim();
  if (!serverKey) return { ok: false, reason: "not_configured" };

  const production = env.MIDTRANS_ENV === "production";
  if (production === serverKey.startsWith("SB-")) return { ok: false, reason: "key_mismatch" };

  const siteUrl = parseSiteUrl(env.SITE_URL || DEFAULT_SITE_URL);
  if (!siteUrl) return { ok: false, reason: "bad_site_url" };

  const hosts = production ? HOSTS.production : HOSTS.sandbox;
  return {
    ok: true,
    production,
    serverKey,
    siteUrl,
    snapUrl: `${hosts.snap}/snap/v1/transactions`,
    apiBase: hosts.api,
  };
}

export function snapRequest({ orderId, plan, name, email, phone, siteUrl }) {
  const { label, price } = PLANS[plan];
  return {
    transaction_details: { order_id: orderId, gross_amount: price },
    item_details: [{ id: plan, price, quantity: 1, name: `Shortlisted ${label} (pre-sale)` }],
    customer_details: { first_name: name, email, phone },
    callbacks: { finish: `${siteUrl.replace(/\/+$/, "")}/terima-kasih.html` },
    expiry: { unit: "hours", duration: PAYMENT_WINDOW_HOURS },
  };
}

const FAILED = new Set(["deny", "cancel", "expire", "failure", "refund", "partial_refund"]);

// Midtrans' status vocabulary, reduced to what the buyer needs to see.
export function orderState(status) {
  if (!status || status.status_code === "404" || !status.transaction_status) return "not_found";
  const { transaction_status: state, fraud_status: fraud } = status;
  if (state === "settlement") return "paid";
  if (state === "capture") return !fraud || fraud === "accept" ? "paid" : "pending";
  if (FAILED.has(state)) return "failed";
  return "pending";
}
