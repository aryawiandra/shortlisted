import test from "node:test";
import assert from "node:assert/strict";
import { findCase } from "../lib/cases.js";
import {
  buildInbox,
  displayName,
  failedResultEmail,
  formatReceived,
  inviteEmail,
  noSpeechResultEmail,
  resultEmail,
} from "../demo/inbox.js";

const NOW = new Date(2026, 10, 4, 14, 2).getTime();
const DAY = 86_400_000;
const strings = (value) =>
  typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
const actions = (email) => email.body.filter((block) => block.type === "action");
const sampleResult = Object.freeze({
  mode: "mock",
  summary: "Kekuatan utamamu: Komunikasi.",
  scores: [{ aspect: "komunikasi", label: "Komunikasi", score: 4, evidence: "x", comment: "y" }],
  nextSteps: ["a", "b"],
});

test("displayName trims, strips control characters, clips, and falls back", () => {
  assert.equal(displayName("  Ayu  "), "Ayu");
  assert.equal(displayName("   "), "Kandidat");
  assert.equal(displayName(undefined), "Kandidat");
  assert.equal(displayName("A\u0007yu"), "Ayu");
  assert.equal(displayName("x".repeat(80)).length, 40);
});

test("buildInbox starts with older mail and the second invitation, newest first, all in the past", () => {
  const { emails } = buildInbox({ name: "Ayu", now: NOW });
  assert.ok(emails.length >= 3);
  assert.ok(emails.every((e) => e.receivedAt < NOW));
  assert.deepEqual([...emails].sort((a, b) => b.receivedAt - a.receivedAt).map((e) => e.id), emails.map((e) => e.id));
  const invites = emails.filter((e) => e.kind === "invite");
  assert.equal(invites.length, 1);
  assert.equal(invites[0].unread, true);
  assert.ok(emails.filter((e) => e.kind !== "invite").every((e) => e.unread === false));
});

test("inviteEmail greets by name, uses a .test sender, and has exactly one join action for a real case", () => {
  const email = inviteEmail("arunika", { name: "Ayu Lestari", now: NOW, readSec: 60, minutes: 6 });
  assert.equal(email.kind, "invite");
  assert.match(email.subject, /lolos/i);
  assert.ok(strings(email.body).some((s) => s.includes("Ayu Lestari")));
  assert.match(email.from.address, /\.test$/);
  const joins = actions(email).filter((a) => a.action === "join");
  assert.equal(joins.length, 1);
  assert.ok(findCase(email.caseId));
  assert.ok(strings(email.body).some((s) => s.includes("6 menit")));
});

test("every invitation maps to a different case", () => {
  const a = inviteEmail("arunika", { name: "A", now: NOW, readSec: 60, minutes: 6 });
  const b = inviteEmail("rinjani", { name: "A", now: NOW, readSec: 60, minutes: 6 });
  assert.notEqual(a.caseId, b.caseId);
  assert.ok(findCase(b.caseId));
});

test("result emails come from Shortlisted, name the company, and carry the right next action", () => {
  const ok = resultEmail({ result: sampleResult, companyId: "arunika", name: "Ayu", now: NOW });
  assert.equal(ok.kind, "result");
  assert.match(ok.from.name, /Shortlisted/);
  assert.match(ok.subject, /Arunika/);
  assert.ok(ok.body.some((block) => block.type === "scorecard" && block.result === sampleResult));

  const silent = noSpeechResultEmail({ companyId: "arunika", name: "Ayu", now: NOW });
  assert.ok(actions(silent).some((a) => a.action === "rejoin"));

  const failed = failedResultEmail({ companyId: "arunika", name: "Ayu", now: NOW, reason: "Koneksi putus." });
  assert.ok(actions(failed).some((a) => a.action === "retry-score"));
  assert.ok(strings(failed.body).some((s) => s.includes("Koneksi putus.")));
});

test("no email text uses an em dash", () => {
  const all = [
    ...buildInbox({ name: "Ayu", now: NOW }).emails,
    inviteEmail("arunika", { name: "Ayu", now: NOW, readSec: 60, minutes: 6 }),
    inviteEmail("rinjani", { name: "Ayu", now: NOW, readSec: 0, minutes: 6 }),
    noSpeechResultEmail({ companyId: "rinjani", name: "Ayu", now: NOW }),
    failedResultEmail({ companyId: "rinjani", name: "Ayu", now: NOW, reason: "x" }),
  ];
  for (const text of all.flatMap(strings)) assert.ok(!text.includes("—"), text);
});

test("formatReceived shows a clock time today, 'Kemarin' for yesterday, and a short date before that", () => {
  assert.match(formatReceived(NOW - 60_000, NOW), /^\d{2}[.:]\d{2}$/);
  assert.equal(formatReceived(NOW - DAY, NOW), "Kemarin");
  assert.match(formatReceived(NOW - 12 * DAY, NOW), /^\d{1,2} \S+$/);
});

test("builders do not mutate shared seed data", () => {
  const first = buildInbox({ name: "Ayu", now: NOW });
  const second = buildInbox({ name: "Budi", now: NOW });
  assert.ok(Object.isFrozen(first.emails));
  assert.ok(strings(second.emails).every((s) => !s.includes("Ayu")));
});
