// Timed case drill: one case, one written answer under a timer, feedback on three aspects.
// A drill costs a fraction of a full LGD session (one scorer call, no participant turns),
// which is what lets the paid plans include dozens of them. Pure module apart from zod.

import { z } from "zod";
import { findCase } from "./cases.js";
import { ASPECT_LABELS } from "./schemas.js";
import { MAX_ELAPSED_SEC } from "./validate.js";

export const DRILL_ASPECTS = Object.freeze(["analisis", "komunikasi", "keputusan"]);
export const DRILL_SECONDS = 120;
export const MAX_ANSWER_LENGTH = 1200;

const OVERTIME_GRACE_SEC = 5;
const MAX_NEXT_STEPS = 3;
const MIN_WORDS = 8;
const GOOD_MIN_WORDS = 25;
const GOOD_MAX_WORDS = 120;
const TOO_LONG_WORDS = 140;
// Control characters except tab and newline.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;
const RECOMMENDATION = /\b(rekomendasi\w*|saya usul\w*|saya sarankan|sebaiknya|saya pilih|kita pilih|prioritas)\b/i;
const REASON = /\b(karena|sebab|agar|supaya)\b/i;
const FOLLOW_UP = /\b(setelah|lalu|kemudian|tahap|opsi kedua|berikutnya)\b/i;

export const DrillSchema = z.object({
  scores: z.array(
    z.object({
      aspect: z.enum(DRILL_ASPECTS),
      score: z.number(),
      evidence: z.string(),
      comment: z.string(),
    }),
  ),
  summary: z.string(),
  nextSteps: z.array(z.string()),
});

const fail = (error) => ({ ok: false, error });
const clean = (value) => (typeof value === "string" ? value.trim() : "");
const clamp = (score) => Math.min(5, Math.max(1, Math.round(score)));

export function validateDrillRequest(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return fail("Body must be a JSON object.");
  if (!findCase(body.caseId)) return fail("Unknown case.");
  if (typeof body.answer !== "string") return fail("Jawaban harus berupa teks.");

  const answer = body.answer.replace(CONTROL_CHARS, "").trim();
  if (answer.length === 0) return fail("Jawaban masih kosong.");
  if (answer.length > MAX_ANSWER_LENGTH) return fail(`Jawaban terlalu panjang (maksimal ${MAX_ANSWER_LENGTH} karakter).`);

  const elapsed = Number(body.elapsedSec);
  const elapsedSec = Number.isFinite(elapsed) ? Math.min(MAX_ELAPSED_SEC, Math.max(0, Math.round(elapsed))) : 0;
  return { ok: true, value: Object.freeze({ caseId: body.caseId, answer, elapsedSec }) };
}

const numbersIn = (text) => new Set((text.match(NUMBER) ?? []).map((n) => n.replace(",", ".")));
const sentencesOf = (text) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

function analisisScore(answer, caseData) {
  const caseNumbers = numbersIn(`${caseData.brief} ${caseData.facts.join(" ")}`);
  const cited = [...numbersIn(answer)].filter((n) => caseNumbers.has(n));
  const sentence = sentencesOf(answer).find((s) => [...numbersIn(s)].some((n) => caseNumbers.has(n))) ?? "";
  const comments = [
    "Belum ada angka dari kasus. Tanpa angka, pendapatmu terdengar seperti klaim.",
    "Satu angka dari kasus. Tambah satu atau dua lagi untuk menguatkan alasanmu.",
    "Dua angka dari kasus. Hubungkan angka itu langsung dengan rekomendasimu.",
    "Angka kasusmu cukup untuk mendukung rekomendasi.",
    "Kamu memakai banyak angka kasus dan menghubungkannya dengan pilihanmu.",
  ];
  const score = clamp(1 + Math.min(4, cited.length));
  return { aspect: "analisis", score, evidence: sentence, comment: comments[score - 1] };
}

function komunikasiScore(answer) {
  const words = wordCount(answer);
  const sentences = sentencesOf(answer);
  let score = 3;
  if (words < MIN_WORDS) score = 1;
  else if (words < GOOD_MIN_WORDS) score = 2;
  else if (words <= GOOD_MAX_WORDS) score = sentences.length >= 2 ? 5 : 4;
  else if (words > TOO_LONG_WORDS) score = 2;
  const comments = {
    1: "Terlalu singkat untuk dinilai. Tulis rekomendasi dan alasannya.",
    2: words < GOOD_MIN_WORDS ? "Agak pendek. Tambah alasan supaya mudah diikuti." : "Terlalu panjang untuk waktu sesingkat ini. Padatkan.",
    3: "Cukup jelas, tetapi bisa dirapikan.",
    4: "Jelas, tetapi pecah jadi dua kalimat atau lebih supaya mudah diikuti.",
    5: "Ringkas dan mudah diikuti.",
  };
  return { aspect: "komunikasi", score, evidence: sentences[0] ?? "", comment: comments[score] };
}

function keputusanScore(answer) {
  const hasRecommendation = RECOMMENDATION.test(answer);
  const score = clamp(1 + (hasRecommendation ? 2 : 0) + (REASON.test(answer) ? 1 : 0) + (FOLLOW_UP.test(answer) ? 1 : 0));
  const sentence = sentencesOf(answer).find((s) => RECOMMENDATION.test(s)) ?? "";
  const comments = [
    "Belum ada rekomendasi yang jelas. Sebut pilihanmu di kalimat pertama.",
    "Pilihanmu belum tegas. Pakai kalimat seperti \"Saya rekomendasikan...\".",
    "Ada rekomendasi, tetapi alasannya belum kuat.",
    "Rekomendasi dan alasannya jelas.",
    "Rekomendasi tegas, beralasan, dan punya langkah lanjutan.",
  ];
  return { aspect: "keputusan", score, evidence: sentence, comment: comments[score - 1] };
}

const NEXT_STEP_FOR = Object.freeze({
  analisis: "Sebut minimal tiga angka dari kasus untuk mendukung pendapatmu.",
  keputusan: "Buka dengan satu kalimat rekomendasi, lalu beri alasannya dan langkah berikutnya.",
  komunikasi: "Tulis 25 sampai 120 kata dalam dua sampai empat kalimat.",
});
const NEXT_STEP_WHEN_STRONG = "Coba kasus dari industri lain dengan jawaban yang sama padatnya.";

export function mockDrill({ caseId, answer, elapsedSec = 0 }) {
  const caseData = findCase(caseId);
  const scores = [analisisScore(answer, caseData), komunikasiScore(answer), keputusanScore(answer)].map((item) => ({
    ...item,
    label: ASPECT_LABELS[item.aspect],
  }));

  const overtime = elapsedSec > DRILL_SECONDS + OVERTIME_GRACE_SEC;
  const average = scores.reduce((sum, item) => sum + item.score, 0) / scores.length;
  const verdict = average >= 4 ? "Jawabanmu kuat" : average >= 3 ? "Jawabanmu cukup" : "Jawabanmu masih perlu dilatih";
  const summary = overtime
    ? `${verdict}, tetapi kamu melewati batas waktu ${DRILL_SECONDS} detik. Di seleksi sungguhan, waktu yang habis berarti jawaban terpotong.`
    : `${verdict} untuk jawaban ${Math.max(1, Math.round(elapsedSec))} detik.`;

  const weak = scores.filter((item) => item.score < 4).map((item) => NEXT_STEP_FOR[item.aspect]);
  const nextSteps = (weak.length > 0 ? weak : [NEXT_STEP_WHEN_STRONG]).slice(0, MAX_NEXT_STEPS);
  return { scores, summary, nextSteps };
}

// Returns a complete, canonical drill result, or null if the input cannot be repaired.
export function normalizeDrill(raw) {
  if (!raw || !Array.isArray(raw.scores)) return null;
  const byAspect = new Map(raw.scores.map((item) => [item?.aspect, item]));

  const scores = [];
  for (const aspect of DRILL_ASPECTS) {
    const item = byAspect.get(aspect);
    if (!item || !Number.isFinite(item.score)) return null;
    scores.push({
      aspect,
      label: ASPECT_LABELS[aspect],
      score: clamp(item.score),
      evidence: clean(item.evidence),
      comment: clean(item.comment),
    });
  }

  const nextSteps = (Array.isArray(raw.nextSteps) ? raw.nextSteps : []).map(clean).filter(Boolean).slice(0, MAX_NEXT_STEPS);
  if (nextSteps.length === 0) return null;
  return { scores, summary: clean(raw.summary), nextSteps };
}
