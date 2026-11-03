// Sliding-window rate limiter. In-memory, so it is best-effort on serverless:
// each warm instance counts on its own. Set a spend limit in the Anthropic Console too.

const MAX_TRACKED_KEYS = 5000;

export function createRateLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map();

  const prune = (t) => {
    for (const [key, stamps] of hits) {
      if (stamps.every((stamp) => t - stamp >= windowMs)) hits.delete(key);
    }
  };

  return Object.freeze({
    check(key) {
      const t = now();
      if (hits.size > MAX_TRACKED_KEYS) prune(t);

      const recent = (hits.get(key) ?? []).filter((stamp) => t - stamp < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (t - recent[0])) / 1000)) };
      }
      hits.set(key, [...recent, t]);
      return { allowed: true };
    },
  });
}
