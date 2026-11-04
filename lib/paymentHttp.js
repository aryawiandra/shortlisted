// POST /api/checkout: validates the buyer, prices the plan on the server, and opens a
// Midtrans Snap payment page. GET /api/order?id=: asks Midtrans for that order's status,
// so the thank-you page never trusts the query string Midtrans redirects back with.
// The Midtrans dashboard is the ledger for the pre-sale; nothing is stored here.

import { randomBytes } from "node:crypto";
import { isOrderId, newOrderId, orderState, paymentConfig, planOfOrder, snapRequest, validateCheckout } from "./payments.js";
import { createRateLimiter } from "./rateLimit.js";
import { clientIp, parseJsonBody } from "./request.js";

const RATE_WINDOW_MS = 10 * 60 * 1000;
const CHECKOUT_RATE_MAX = 10;
const ORDER_RATE_MAX = 60;
const MIDTRANS_TIMEOUT_MS = 10_000;
const ORDER_ID_RANDOM_BYTES = 5;

const CLOSED = { error: "Pembayaran pre-sale belum dibuka.", code: "closed" };
const UPSTREAM = { error: "Halaman pembayaran gagal dibuka. Coba lagi sebentar." };
const STATUS_UNAVAILABLE = { error: "Status pembayaran belum bisa dicek. Coba lagi sebentar." };

const authHeader = (serverKey) => `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
const defaultRandomHex = () => randomBytes(ORDER_ID_RANDOM_BYTES).toString("hex");

async function callMidtrans(fetchImpl, url, serverKey, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: authHeader(serverKey) },
    signal: AbortSignal.timeout(MIDTRANS_TIMEOUT_MS),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

function isMidtransPage(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname.endsWith(".midtrans.com");
  } catch {
    return false;
  }
}

// Method, rate limit and configuration checks shared by both routes.
function guard({ req, res, method, limit, env, log }) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== method) {
    res.setHeader("Allow", method);
    res.status(405).json({ error: "Method not allowed." });
    return null;
  }
  const verdict = limit.check(clientIp(req));
  if (!verdict.allowed) {
    res.setHeader("Retry-After", String(verdict.retryAfterSec));
    res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi sebentar." });
    return null;
  }
  const config = paymentConfig(env);
  if (!config.ok) {
    if (config.reason !== "not_configured") log("payments misconfigured:", config.reason);
    res.status(503).json(CLOSED);
    return null;
  }
  return config;
}

export function createCheckoutHandler({
  env = process.env,
  fetchImpl = fetch,
  limiter,
  now = Date.now,
  randomHex = defaultRandomHex,
  log = console.error,
} = {}) {
  const limit = limiter ?? createRateLimiter({ max: CHECKOUT_RATE_MAX, windowMs: RATE_WINDOW_MS });

  return async function checkout(req, res) {
    const config = guard({ req, res, method: "POST", limit, env, log });
    if (!config) return res;

    const checked = validateCheckout(parseJsonBody(req.body));
    if (!checked.ok) return res.status(400).json({ error: checked.error });

    const orderId = newOrderId(checked.value.plan, now(), randomHex());
    const body = snapRequest({ orderId, ...checked.value, siteUrl: config.siteUrl });
    try {
      const { status, json } = await callMidtrans(fetchImpl, config.snapUrl, config.serverKey, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (status !== 201 || !isMidtransPage(json?.redirect_url)) {
        log("snap create failed:", status, JSON.stringify(json));
        return res.status(502).json(UPSTREAM);
      }
      return res.status(200).json({ orderId, redirectUrl: json.redirect_url });
    } catch (error) {
      log("snap create failed:", error?.message ?? error);
      return res.status(502).json(UPSTREAM);
    }
  };
}

export function createOrderHandler({ env = process.env, fetchImpl = fetch, limiter, log = console.error } = {}) {
  const limit = limiter ?? createRateLimiter({ max: ORDER_RATE_MAX, windowMs: RATE_WINDOW_MS });

  return async function order(req, res) {
    const config = guard({ req, res, method: "GET", limit, env, log });
    if (!config) return res;

    const id = new URL(req.url ?? "", "http://local").searchParams.get("id");
    if (!isOrderId(id)) return res.status(400).json({ error: "Nomor pesanan tidak dikenal." });

    try {
      const { status, json } = await callMidtrans(fetchImpl, `${config.apiBase}/v2/${id}/status`, config.serverKey);
      // 404 is a real "no such order"; anything else outside 2xx (a rejected key, an
      // outage) must not tell a buyer who has paid that their order does not exist.
      if (status !== 404 && (status < 200 || status >= 300)) {
        log("order status failed:", status, JSON.stringify(json));
        return res.status(502).json(STATUS_UNAVAILABLE);
      }
      return res.status(200).json({ state: orderState(json), plan: planOfOrder(id).label });
    } catch (error) {
      log("order status failed:", error?.message ?? error);
      return res.status(502).json(STATUS_UNAVAILABLE);
    }
  };
}
