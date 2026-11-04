// What happens in the meeting besides the AI participants: the assessor's lines, the nudges
// when the applicant stays silent, and what is sent to the API. Pure, so it is testable.
// The assessor is local only: the API speakers are the applicant and the four participants.

export const ASSESSOR = Object.freeze({ id: "ratna", name: "Ratna", role: "Asesor" });
export const MAX_API_MESSAGES = 40;
export const NUDGE_IDLE_MS = 20_000;
export const MAX_NUDGES = 3;

export function durationLabel(totalSec) {
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.round(totalSec % 60);
  return [minutes > 0 ? `${minutes} menit` : "", seconds > 0 ? `${seconds} detik` : ""].filter(Boolean).join(" ");
}

export function assessorOpening({ name, readSec, minutes }) {
  const talk = durationLabel(minutes * 60);
  return [
    `Selamat siang, ${name}, dan teman-teman semua. Saya Ratna, asesor untuk sesi ini.`,
    readSec > 0
      ? `Saya bagikan studi kasusnya sekarang. Kalian punya waktu ${durationLabel(readSec)} untuk membaca, lalu ${talk} untuk berdiskusi.`
      : `Studi kasusnya sudah ada di layar. Kalian punya waktu ${talk} untuk berdiskusi.`,
    "Tugas kalian adalah sepakat pada satu rekomendasi untuk direksi. Tidak ada ketua. Saya hanya mengamati.",
  ];
}

export const DISCUSSION_START = "Waktu membaca selesai. Silakan mulai diskusinya.";

export const assessorClosing = ({ name }) =>
  `Waktu habis. Terima kasih, ${name}, dan semuanya. Hasil penilaian akan kami kirim lewat email setelah meeting ini.`;

const NUDGES = Object.freeze({
  raka: [
    (n) => `Kalau tidak ada yang keberatan, kita putuskan sekarang saja. ${n}, kamu setuju?`,
    (n) => `${n}, dari tadi belum terdengar. Jadi kamu pilih yang mana?`,
  ],
  sinta: [
    (n) => `${n}, kamu punya angka yang bisa mendukung salah satu opsi?`,
    (n) => `Saya ingin dengar pendapat ${n}. Fakta mana yang paling penting menurutmu?`,
  ],
  ayu: [
    (n) => `Biar adil, kita dengar ${n} dulu. Menurutmu bagaimana?`,
    (n) => `${n}, kalau kamu harus merangkum diskusi ini, apa kesimpulannya?`,
  ],
});
const NUDGERS = Object.keys(NUDGES);

// The participant who has been quiet longest invites the applicant in. Dimas never does:
// he only speaks when asked.
export function nudgeLine({ messages, name, nudgeIndex }) {
  const speakers = messages.map((m) => m.speaker);
  const since = (id) => {
    const at = speakers.lastIndexOf(id);
    return at === -1 ? Number.POSITIVE_INFINITY : speakers.length - 1 - at;
  };
  const speaker = [...NUDGERS].sort((a, b) => since(b) - since(a))[0];
  const pool = NUDGES[speaker];
  return Object.freeze({ speaker, text: pool[nudgeIndex % pool.length](name) });
}

export function shouldNudge({
  phase,
  busy,
  speaking,
  listening,
  nudgesUsed,
  lastActivityAt,
  now,
  idleMs = NUDGE_IDLE_MS,
  maxNudges = MAX_NUDGES,
}) {
  return phase === "discussion" && !busy && !speaking && !listening && nudgesUsed < maxNudges && now - lastActivityAt >= idleMs;
}

export const transcriptForApi = (messages) =>
  messages
    .filter((m) => m.speaker !== ASSESSOR.id)
    .slice(-MAX_API_MESSAGES)
    .map(({ speaker, text }) => ({ speaker, text }));
