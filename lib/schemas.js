// Output schemas for the model, and normalisation of whatever comes back.

import { z } from "zod";

export const ASPECTS = Object.freeze(["inisiatif", "analisis", "komunikasi", "kerja_tim", "kepemimpinan", "keputusan"]);

export const ASPECT_LABELS = Object.freeze({
  inisiatif: "Inisiatif",
  analisis: "Analisis",
  komunikasi: "Komunikasi",
  kerja_tim: "Kerja tim",
  kepemimpinan: "Kepemimpinan",
  keputusan: "Keputusan",
});

// Structured outputs support a limited JSON Schema subset, so ranges and lengths are
// not expressed here. normalizeScore() enforces them after the fact.
export const TurnSchema = z.object({
  replies: z.array(z.object({ speaker: z.string(), text: z.string() })),
});

export const ScoreSchema = z.object({
  scores: z.array(
    z.object({
      aspect: z.enum(ASPECTS),
      score: z.number(),
      evidence: z.string(),
      comment: z.string(),
    }),
  ),
  summary: z.string(),
  nextSteps: z.array(z.string()),
});

const clean = (value) => (typeof value === "string" ? value.trim() : "");
const MAX_NEXT_STEPS = 3;

// Returns a complete, canonical score object, or null if the input cannot be repaired.
export function normalizeScore(raw) {
  if (!raw || !Array.isArray(raw.scores)) return null;
  const byAspect = new Map(raw.scores.map((item) => [item?.aspect, item]));

  const scores = [];
  for (const aspect of ASPECTS) {
    const item = byAspect.get(aspect);
    if (!item || !Number.isFinite(item.score)) return null;
    scores.push({
      aspect,
      label: ASPECT_LABELS[aspect],
      score: Math.min(5, Math.max(1, Math.round(item.score))),
      evidence: clean(item.evidence),
      comment: clean(item.comment),
    });
  }

  const nextSteps = (Array.isArray(raw.nextSteps) ? raw.nextSteps : [])
    .map(clean)
    .filter(Boolean)
    .slice(0, MAX_NEXT_STEPS);
  if (nextSteps.length === 0) return null;

  return { scores, summary: clean(raw.summary), nextSteps };
}
