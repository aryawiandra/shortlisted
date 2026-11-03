// Built-in simulation used when no API key is set, and as the fallback when the model
// fails. Rule-based, deterministic, and clearly labelled "mock" in every response.

import { PERSONAS } from "./personas.js";
import { ASPECTS, ASPECT_LABELS, normalizeScore } from "./schemas.js";

const OPENERS = {
  raka: "Oke, langsung saja. Menurut saya kita fokus ke satu opsi yang paling cepat berdampak. Ada yang mau mulai?",
  sinta: "Sebelum memilih, kita baca dulu faktanya. Angka apa saja yang kita punya dari kasus ini?",
  ayu: "Halo semua. Supaya waktunya cukup, kita bagi dulu ya: siapa yang mulai, siapa yang merangkum?",
};

const LINES = {
  raka: [
    "Menurut saya sudah jelas, ambil opsi yang paling cepat. Kita tidak punya waktu untuk debat panjang.",
    "Saya potong sebentar: yang paling mendesak itu dampaknya ke target, bukan hal lain. Kita putuskan sekarang.",
    "Kita sudah berputar-putar. Siapa yang mau mengambil keputusan?",
    "Oke, tapi jangan terlalu lama. Satu rekomendasi saja, lalu kita jalan.",
  ],
  sinta: [
    "Sebelum lanjut, angkanya mana? Berapa selisih biaya antar-opsi itu?",
    "Itu klaim, belum data. Fakta mana di kasus ini yang mendukungnya?",
    "Boleh kita bandingkan dulu dampak tiap opsi terhadap anggaran dan waktu?",
    "Saya belum yakin. Apa risiko terbesar kalau opsi itu dipilih?",
  ],
  dimas: [
    "Kalau saya lihat, risiko terbesarnya ada di hal yang paling mendesak. Itu yang perlu dijawab lebih dulu.",
    "Mungkin kita mulai dari yang bisa dikerjakan minggu ini, lalu sisanya menyusul.",
  ],
  ayu: [
    "Sepertinya semua punya poin bagus. Bisa kita cari titik tengahnya?",
    "Supaya waktunya cukup, bagaimana kalau kita rangkum dulu lalu pilih satu?",
    "Saya setuju sebagian. Ada yang keberatan kalau dua pendapat tadi kita gabungkan?",
    "Biar adil, bagaimana kalau tiap orang menyebut satu prioritas, lalu kita pilih yang paling banyak sama?",
  ],
};

const pick = (pool, seed) => pool[seed % pool.length];

export function mockTurn({ messages }, speakers) {
  const opening = messages.length === 0;
  const replies = speakers.map((speaker, index) => ({
    speaker,
    text: opening && OPENERS[speaker] ? OPENERS[speaker] : pick(LINES[speaker], messages.length + index),
  }));
  return { replies };
}

const KEYWORDS = {
  analisis: ["karena", "data", "angka", "biaya", "risiko", "dampak", "selisih", "persen", "prioritas", "stok", "anggaran", "rasio", "kredit"],
  kerja_tim: ["setuju", "tambah", "betul", "poin", "menanggapi", "rangkum", "bagaimana menurut", "sependapat", ...PERSONAS.map((p) => p.id)],
  kepemimpinan: ["usul", "sarankan", "mari", "langkah", "pembagian", "urutan", "saya ambil", "kita mulai", "saya rangkum"],
  keputusan: ["kesimpulan", "keputusan", "rekomendasi", "kita pilih", "sepakat", "final", "jadi kita", "disimpulkan"],
};

const COMMENTS = {
  inisiatif: [
    "Kamu hampir tidak membuka atau mengarahkan diskusi.",
    "Kamu ikut berbicara, tetapi lebih banyak menanggapi daripada membuka.",
    "Kamu aktif membuka dan mengarahkan diskusi.",
  ],
  analisis: [
    "Argumenmu belum memakai fakta atau angka dari kasus.",
    "Sebagian argumenmu memakai fakta, tetapi alasannya belum selalu jelas.",
    "Argumenmu didukung fakta dan alasan yang jelas.",
  ],
  komunikasi: [
    "Ucapanmu terlalu sedikit atau terlalu pendek untuk dinilai.",
    "Pesanmu cukup jelas, tetapi panjang dan strukturnya bisa lebih rapi.",
    "Ucapanmu ringkas, jelas, dan mudah diikuti.",
  ],
  kerja_tim: [
    "Kamu jarang merespons peserta lain.",
    "Kamu cukup menanggapi peserta lain, tetapi belum membangun dari pendapat mereka.",
    "Kamu menanggapi nama dan pendapat peserta lain dengan baik.",
  ],
  kepemimpinan: [
    "Kamu belum mengusulkan arah atau langkah untuk kelompok.",
    "Kamu mulai mengusulkan arah, tetapi belum konsisten.",
    "Kamu mengarahkan kelompok dengan usulan yang konkret.",
  ],
  keputusan: [
    "Kelompok belum sampai pada kesimpulan lewat doronganmu.",
    "Kamu menyinggung kesimpulan, tetapi belum mendorong sampai sepakat.",
    "Kamu mendorong kelompok sampai pada kesimpulan.",
  ],
};

const TIPS = {
  inisiatif: "Bicara dalam dua menit pertama: usulkan cara kelompok membahas kasus.",
  analisis: "Sebut minimal satu angka dari kasus setiap kali kamu menyampaikan pendapat.",
  komunikasi: "Pakai pola satu kalimat inti lalu satu alasan, sekitar 15 sampai 30 kata.",
  kerja_tim: "Sebut nama peserta saat menanggapi, lalu bangun dari poinnya sebelum menambahkan pendapatmu.",
  kepemimpinan: "Usulkan urutan pembahasan atau pembagian tugas sebelum menit kelima.",
  keputusan: "Usulkan kesimpulan sebelum waktu habis dan minta persetujuan kelompok.",
};

const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;
const hasAny = (text, words) => words.some((word) => text.toLowerCase().includes(word));
const clamp = (n) => Math.min(5, Math.max(1, n));
const fromCount = (count, thresholds) => clamp(1 + thresholds.filter((t) => count >= t).length);
// For single acts that matter on their own (proposing, building on others, concluding):
// one clear instance already counts as adequate, more instances push it higher.
const fromSignal = (count) => (count === 0 ? 1 : clamp(2 + Math.min(count, 3)));
const COUNT_STEPS = [1, 2, 3, 4];
const QUOTE_LENGTH = 140;
const MIN_CLIP = 40;
const band = (score) => (score <= 2 ? 0 : score === 3 ? 1 : 2);

const sentencesOf = (text) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

// Clips at a word boundary. The result is always a substring of the input.
function clip(text) {
  if (text.length <= QUOTE_LENGTH) return text;
  const cut = text.lastIndexOf(" ", QUOTE_LENGTH);
  return text.slice(0, cut > MIN_CLIP ? cut : QUOTE_LENGTH);
}

export function mockScore({ messages }) {
  const applicant = messages.filter((m) => m.speaker === "you").map((m) => m.text);
  const substantive = applicant.filter((text) => wordCount(text) >= 5);
  const firstIndex = messages.findIndex((m) => m.speaker === "you");
  const early = substantive.length > 0 && firstIndex !== -1 && firstIndex <= 2;
  const avgWords = substantive.length
    ? substantive.reduce((sum, text) => sum + wordCount(text), 0) / substantive.length
    : 0;

  const matching = (words, extra = () => false) =>
    substantive.filter((text) => hasAny(text, words) || extra(text));
  const analysis = matching(KEYWORDS.analisis, (text) => /\d/.test(text));
  const team = matching(KEYWORDS.kerja_tim);
  const lead = matching(KEYWORDS.kepemimpinan);
  const decision = matching(KEYWORDS.keputusan);

  // Evidence is one sentence of the applicant's own words. Prefer a message not already
  // quoted for another aspect, so the scorecard does not repeat itself.
  const used = new Set();
  const quoteFrom = (candidates, words = [], extra = () => false) => {
    const text = candidates.find((t) => !used.has(t)) ?? candidates[0];
    if (!text) return "";
    used.add(text);
    const sentences = sentencesOf(text);
    const best = sentences.find((s) => hasAny(s, words) || extra(s)) ?? sentences[0] ?? text;
    return clip(best);
  };

  const none = substantive.length === 0;
  const results = {
    inisiatif: {
      score: none ? 1 : clamp(2 + Number(substantive.length >= 3) + Number(substantive.length >= 5) + Number(early)),
      evidence: quoteFrom(substantive),
    },
    analisis: { score: fromCount(analysis.length, COUNT_STEPS), evidence: quoteFrom(analysis, KEYWORDS.analisis, (s) => /\d/.test(s)) },
    komunikasi: {
      score: none
        ? 1
        : clamp(2 + Number(avgWords >= 10 && avgWords <= 50) + Number(substantive.length >= 2) + Number(substantive.length >= 3)),
      evidence: quoteFrom(substantive),
    },
    kerja_tim: { score: fromSignal(team.length), evidence: quoteFrom(team, KEYWORDS.kerja_tim) },
    kepemimpinan: { score: fromSignal(lead.length), evidence: quoteFrom(lead, KEYWORDS.kepemimpinan) },
    keputusan: { score: fromSignal(decision.length), evidence: quoteFrom(decision, KEYWORDS.keputusan) },
  };

  const ranked = [...ASPECTS].sort((a, b) => results[a].score - results[b].score);
  const weakest = ranked[0];
  const strongest = ranked.at(-1);
  const summary =
    results[weakest].score === results[strongest].score
      ? "Nilaimu merata di semua aspek. Pertahankan, lalu coba naikkan satu aspek di sesi berikutnya."
      : `Kekuatan utamamu: ${ASPECT_LABELS[strongest]}. Yang paling perlu dilatih: ${ASPECT_LABELS[weakest]}.`;

  return normalizeScore({
    scores: ASPECTS.map((aspect) => ({
      aspect,
      score: results[aspect].score,
      evidence: results[aspect].evidence,
      comment: COMMENTS[aspect][band(results[aspect].score)],
    })),
    summary,
    nextSteps: ranked.slice(0, 2).map((aspect) => TIPS[aspect]),
  });
}
