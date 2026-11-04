import test from "node:test";
import assert from "node:assert/strict";
import { ASPECTS } from "../lib/schemas.js";
import { BASELINE, MOMENTS, SIM_ASPECTS, scoreAfter } from "../assets/simulator.js";

test("simulator aspects match the scorecard's canonical order", () => {
  assert.deepEqual([...SIM_ASPECTS.map((a) => a.id)], [...ASPECTS]);
});

test("every moment offers three choices whose deltas name real aspects", () => {
  const known = new Set(ASPECTS);
  assert.equal(MOMENTS.length, 3);
  for (const moment of MOMENTS) {
    assert.equal(moment.choices.length, 3);
    for (const choice of moment.choices) {
      assert.ok(choice.text && choice.verdict && choice.note);
      assert.ok(Object.keys(choice.deltas).every((key) => known.has(key)));
    }
  }
});

test("no picks returns the baseline", () => {
  assert.deepEqual(scoreAfter([]), ASPECTS.map(() => BASELINE));
});

test("scores always stay between 1 and 5", () => {
  for (const a of [0, 1, 2]) for (const b of [0, 1, 2]) for (const c of [0, 1, 2]) {
    const scores = scoreAfter([a, b, c]);
    assert.ok(scores.every((s) => Number.isInteger(s) && s >= 1 && s <= 5), `${a}${b}${c}: ${scores}`);
  }
});

test("the strongest path beats the passive path on total score", () => {
  const sum = (xs) => xs.reduce((n, x) => n + x, 0);
  assert.ok(sum(scoreAfter([1, 1, 1])) > sum(scoreAfter([0, 0, 0])));
});

test("scoreAfter ignores out-of-range picks instead of throwing", () => {
  assert.deepEqual(scoreAfter([9, -1]), ASPECTS.map(() => BASELINE));
});
