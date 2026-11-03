import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../lib/rateLimit.js";

test("allows up to max requests, then blocks with a retry hint", () => {
  let now = 1_000;
  const limiter = createRateLimiter({ max: 2, windowMs: 10_000, now: () => now });
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("a").allowed, true);
  const blocked = limiter.check("a");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 10);
});

test("allows again once the window has passed", () => {
  let now = 0;
  const limiter = createRateLimiter({ max: 1, windowMs: 1_000, now: () => now });
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("a").allowed, false);
  now = 1_001;
  assert.equal(limiter.check("a").allowed, true);
});

test("keys are limited independently", () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 10_000, now: () => 0 });
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("b").allowed, true);
  assert.equal(limiter.check("a").allowed, false);
});

test("stale keys are cleaned up once many callers have been seen", () => {
  let now = 0;
  const limiter = createRateLimiter({ max: 1, windowMs: 1_000, now: () => now });
  for (let i = 0; i < 5_001; i += 1) limiter.check(`ip-${i}`);
  now = 5_000;
  assert.equal(limiter.check("ip-0").allowed, true);
  assert.equal(limiter.check("fresh").allowed, true);
});

test("blocked requests do not extend the lock-out", () => {
  let now = 0;
  const limiter = createRateLimiter({ max: 1, windowMs: 1_000, now: () => now });
  limiter.check("a");
  now = 900;
  limiter.check("a");
  now = 1_001;
  assert.equal(limiter.check("a").allowed, true);
});
