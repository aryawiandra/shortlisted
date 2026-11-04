// Request helpers shared by every API route: constant-time access-code check and the
// caller's IP for rate limiting. Kept apart from http.js so the voice route does not
// pull in the AI client.

import { timingSafeEqual } from "node:crypto";

export function safeEqual(received, expected) {
  const a = Buffer.from(String(received ?? ""));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export const clientIp = (req) =>
  String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
