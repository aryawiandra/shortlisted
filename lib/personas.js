// The four AI participants of the LGD simulation, and who speaks next.
// Pure module with no Node imports: the browser loads it for names and labels.

export const PERSONAS = Object.freeze([
  Object.freeze({
    id: "raka",
    name: "Raka",
    tagline: "Dominan, suka memotong",
    trait: "Dominan dan suka memotong. Ingin cepat memutuskan dan kurang sabar dengan detail.",
  }),
  Object.freeze({
    id: "sinta",
    name: "Sinta",
    tagline: "Selalu minta data",
    trait: "Analitis. Selalu meminta data dan menolak klaim tanpa angka.",
  }),
  Object.freeze({
    id: "dimas",
    name: "Dimas",
    tagline: "Diam sampai ditanya",
    trait: "Pendiam. Baru bicara kalau ditanya langsung, tetapi ucapannya tajam dan bernas.",
  }),
  Object.freeze({
    id: "ayu",
    name: "Ayu",
    tagline: "Ingin cepat sepakat",
    trait: "Menjaga suasana dan ingin cepat sepakat. Sering menawarkan titik tengah.",
  }),
]);

export const personaById = (id) => PERSONAS.find((p) => p.id === id) ?? null;

const NEVER_SPOKE = 1_000_000;
const QUIET_PERSONA = "dimas";
const QUIET_MIN_MESSAGES = 10;
const QUIET_MIN_GAP = 8;

// Chooses who answers the applicant next. Deterministic: a persona named in the
// applicant's last message goes first, then whoever has been silent the longest.
// The quiet persona only joins when addressed or after a long silence.
export function pickSpeakers(messages, { count = 2 } = {}) {
  const last = messages.at(-1);
  const lastIsApplicant = last?.speaker === "you";
  const text = lastIsApplicant ? last.text : "";

  const candidates = PERSONAS.map((persona, order) => {
    const spokeAt = messages.map((m) => m.speaker).lastIndexOf(persona.id);
    return {
      id: persona.id,
      order,
      since: spokeAt === -1 ? NEVER_SPOKE : messages.length - 1 - spokeAt,
      addressed: new RegExp(`\\b${persona.id}\\b`, "i").test(text),
    };
  });

  return candidates
    .filter(
      (c) =>
        c.id !== QUIET_PERSONA ||
        c.addressed ||
        (messages.length >= QUIET_MIN_MESSAGES && c.since >= QUIET_MIN_GAP),
    )
    .sort((a, b) => Number(b.addressed) - Number(a.addressed) || b.since - a.since || a.order - b.order)
    .slice(0, count)
    .map((c) => c.id);
}
