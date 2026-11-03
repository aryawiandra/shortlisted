import test from "node:test";
import assert from "node:assert/strict";
import { PERSONAS, pickSpeakers } from "../lib/personas.js";

const msg = (speaker, text = "teks") => ({ speaker, text });
const rotation = (length) =>
  Array.from({ length }, (_, i) => msg(["raka", "sinta", "ayu"][i % 3]));

test("there are four personas with unique ids", () => {
  const ids = PERSONAS.map((p) => p.id);
  assert.deepEqual(ids, ["raka", "sinta", "dimas", "ayu"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("opening turn is Raka then Sinta, never Dimas", () => {
  assert.deepEqual(pickSpeakers([]), ["raka", "sinta"]);
});

test("a persona addressed by name answers first", () => {
  const out = pickSpeakers([msg("raka"), msg("you", "Sinta, menurutmu datanya bagaimana?")]);
  assert.equal(out[0], "sinta");
});

test("name matching ignores case and punctuation", () => {
  const out = pickSpeakers([msg("raka"), msg("you", "menurut AYU? bisa jelaskan")]);
  assert.equal(out[0], "ayu");
});

test("Dimas stays silent early on unless addressed", () => {
  const out = pickSpeakers([msg("raka"), msg("sinta"), msg("you", "Saya usul kita bandingkan biaya.")]);
  assert.ok(!out.includes("dimas"));
});

test("Dimas answers when addressed by name", () => {
  const out = pickSpeakers([msg("raka"), msg("you", "Dimas, bagaimana menurut kamu?")]);
  assert.equal(out[0], "dimas");
});

test("Dimas joins after a long silence in a longer discussion", () => {
  const out = pickSpeakers([...rotation(12), msg("you", "Saya usul kita rangkum dulu.")]);
  assert.ok(out.includes("dimas"));
});

test("the persona who spoke most recently is deprioritised", () => {
  const out = pickSpeakers([msg("sinta"), msg("you", "Saya usul opsi pertama.")]);
  assert.deepEqual(out, ["raka", "ayu"]);
});

test("returns at most `count` unique speakers", () => {
  const out = pickSpeakers([...rotation(6), msg("you", "Setuju.")], { count: 3 });
  assert.equal(out.length, 3);
  assert.equal(new Set(out).size, 3);
  assert.equal(pickSpeakers([msg("you", "Halo")], { count: 1 }).length, 1);
});

test("does not mutate its input", () => {
  const frozen = Object.freeze([Object.freeze(msg("raka")), Object.freeze(msg("you", "Sinta, setuju?"))]);
  assert.doesNotThrow(() => pickSpeakers(frozen));
});
