import test from "node:test";
import assert from "node:assert/strict";
import { groupByTier, radarGeometry, tierOf } from "../demo/radar.js";

const close = (a, b) => Math.abs(a - b) < 1e-6;

test("radarGeometry puts the first axis straight up and spaces axes evenly", () => {
  const { points } = radarGeometry([5, 5, 5, 5, 5, 5], { max: 5, radius: 100, cx: 0, cy: 0 });
  assert.equal(points.length, 6);
  assert.ok(close(points[0].x, 0) && close(points[0].y, -100));
  assert.ok(close(points[3].x, 0) && close(points[3].y, 100));
});

test("radarGeometry scales each point by value over max", () => {
  const { points } = radarGeometry([1, 5, 0, 5, 5, 5], { max: 5, radius: 100, cx: 10, cy: 10 });
  assert.ok(close(Math.hypot(points[0].x - 10, points[0].y - 10), 20));
  assert.ok(close(Math.hypot(points[1].x - 10, points[1].y - 10), 100));
  assert.ok(close(points[2].x, 10) && close(points[2].y, 10));
});

test("radarGeometry clamps out-of-range values instead of drawing outside the chart", () => {
  const { points } = radarGeometry([9, -3, 5], { max: 5, radius: 50, cx: 0, cy: 0 });
  assert.ok(close(Math.hypot(points[0].x, points[0].y), 50));
  assert.ok(close(Math.hypot(points[1].x, points[1].y), 0));
});

test("radarGeometry returns one ring per level and label anchors outside the radius", () => {
  const { rings, labels } = radarGeometry([3, 3, 3, 3, 3, 3], { max: 5, radius: 100, cx: 0, cy: 0 });
  assert.equal(rings.length, 5);
  assert.equal(rings[4].length, 6);
  assert.ok(labels.every((l) => Math.hypot(l.x, l.y) > 100));
});

test("tierOf maps 1-2 to latih, 3 to cukup, 4-5 to kuat", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(tierOf), ["latih", "latih", "cukup", "kuat", "kuat"]);
});

test("groupByTier keeps every item once, strongest tier first, without mutating input", () => {
  const items = Object.freeze([
    Object.freeze({ aspect: "a", score: 2 }),
    Object.freeze({ aspect: "b", score: 5 }),
    Object.freeze({ aspect: "c", score: 3 }),
  ]);
  const groups = groupByTier(items);
  assert.deepEqual(groups.map((g) => g.tier), ["kuat", "cukup", "latih"]);
  assert.deepEqual(groups.map((g) => g.items.map((i) => i.aspect)), [["b"], ["c"], ["a"]]);
});
