// Small pure helpers for the demo UI.

export function formatClock(totalSec) {
  const seconds = Math.max(0, Math.round(totalSec));
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// Reads a number from a query-string value, clamped to [min, max]; fallback when missing or invalid.
export function parseBounded(value, { min, max, fallback }) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

// The last `size` items, as a new array.
export const tail = (items, size) => items.slice(-size);
