import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSESSOR,
  assessorClosing,
  assessorOpening,
  durationLabel,
  nudgeLine,
  shouldNudge,
  transcriptForApi,
} from "../demo/meeting-plan.js";

const msg = (speaker, text = "teks") => ({ speaker, text });
const IDLE = { phase: "discussion", busy: false, speaking: false, listening: false, nudgesUsed: 0, lastActivityAt: 0, now: 25_000 };

test("durationLabel speaks minutes and seconds in Indonesian", () => {
  assert.equal(durationLabel(60), "1 menit");
  assert.equal(durationLabel(360), "6 menit");
  assert.equal(durationLabel(30), "30 detik");
  assert.equal(durationLabel(90), "1 menit 30 detik");
});

test("assessorOpening greets by name, states the times, and skips reading when there is none", () => {
  const withReading = assessorOpening({ name: "Ayu", readSec: 60, minutes: 6 }).join(" ");
  assert.match(withReading, /Ayu/);
  assert.match(withReading, /6 menit/);
  assert.match(withReading, /1 menit/);
  assert.match(withReading, /membaca/);
  const noReading = assessorOpening({ name: "Ayu", readSec: 0, minutes: 6 }).join(" ");
  assert.doesNotMatch(noReading, /membaca/);
  assert.ok(!withReading.includes("—"));
});

test("assessorClosing thanks the group and points to email", () => {
  assert.match(assessorClosing({ name: "Ayu" }), /email/i);
});

test("the assessor is not one of the API speakers", () => {
  assert.equal(ASSESSOR.id, "ratna");
});

test("nudgeLine addresses the applicant by name and never uses the quiet participant", () => {
  const messages = [msg("raka"), msg("sinta"), msg("ayu")];
  const line = nudgeLine({ messages, name: "Ayu Lestari", nudgeIndex: 0 });
  assert.equal(line.speaker, "raka");
  assert.match(line.text, /Ayu Lestari/);
  for (let i = 0; i < 6; i += 1) {
    assert.notEqual(nudgeLine({ messages: [msg("sinta")], name: "X", nudgeIndex: i }).speaker, "dimas");
  }
});

test("shouldNudge fires only in the discussion, when idle long enough, and within the budget", () => {
  assert.equal(shouldNudge(IDLE), true);
  assert.equal(shouldNudge({ ...IDLE, phase: "reading" }), false);
  assert.equal(shouldNudge({ ...IDLE, busy: true }), false);
  assert.equal(shouldNudge({ ...IDLE, speaking: true }), false);
  assert.equal(shouldNudge({ ...IDLE, listening: true }), false);
  assert.equal(shouldNudge({ ...IDLE, now: 5_000 }), false);
  assert.equal(shouldNudge({ ...IDLE, nudgesUsed: 3 }), false);
});

test("transcriptForApi drops assessor lines and keeps only the most recent 40", () => {
  const long = [msg("ratna", "pembuka"), ...Array.from({ length: 45 }, (_, i) => msg(i % 2 ? "you" : "raka", `m${i}`))];
  const sent = transcriptForApi(long);
  assert.equal(sent.length, 40);
  assert.ok(sent.every((m) => m.speaker !== "ratna"));
  assert.equal(sent.at(-1).text, "m44");
});
