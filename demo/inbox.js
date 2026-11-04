// Email content for the simulation: the inbox the applicant starts with, the invitation
// that opens the meeting, and the rapor that arrives after it. Pure data builders, so the
// copy is testable. Companies and addresses are fictional; every address ends in .test.

const DAY_MS = 86_400_000;
const MAX_NAME = 40;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export const COMPANIES = Object.freeze({
  arunika: Object.freeze({
    id: "arunika",
    name: "Arunika Energi",
    team: "Tim Rekrutmen Arunika Energi",
    address: "rekrutmen@arunika-energi.test",
    initials: "AE",
    program: "Management Trainee 2026",
    caseId: "bbm-terpencil",
    meetingId: "482 117 903",
  }),
  rinjani: Object.freeze({
    id: "rinjani",
    name: "Rinjani Finansial",
    team: "Tim Talenta Rinjani Finansial",
    address: "talenta@rinjani-finansial.test",
    initials: "RF",
    program: "Graduate Development Program 2026",
    caseId: "kredit-umkm",
    meetingId: "615 230 448",
  }),
});

const SHORTLISTED = Object.freeze({ id: "shortlisted", name: "Asesor Shortlisted", address: "rapor@shortlisted.test", initials: "S" });

export const otherCompanyId = (companyId) => (companyId === "arunika" ? "rinjani" : "arunika");

export function displayName(raw) {
  const clean = String(raw ?? "").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, MAX_NAME).trim() : "Kandidat";
}

const timeFormat = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const startOfDay = (ms) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime();

export const clockLabel = (ms) => timeFormat.format(ms);

export function formatReceived(ms, now) {
  const today = startOfDay(now);
  if (ms >= today) return clockLabel(ms);
  if (ms >= today - DAY_MS) return "Kemarin";
  return dateFormat.format(ms).replace(".", "");
}

// Rounds up to the next five-minute mark, at least three minutes ahead, like a real invite.
function meetingTime(now) {
  const step = 5 * 60_000;
  return Math.ceil((now + 3 * 60_000) / step) * step;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const [key, child] of Object.entries(value)) if (key !== "result") deepFreeze(child);
  return Object.freeze(value);
}

const p = (text) => ({ type: "p", text });
const fictional = (company) =>
  ({ type: "fineprint", text: `Email ini bagian dari simulasi latihan Shortlisted. ${company.name} adalah perusahaan fiktif.` });
const sender = (company) => ({ id: company.id, name: company.team, address: company.address, initials: company.initials });

function email({ kind, company, from, name, subject, preview, receivedAt, unread, body, caseId = null }) {
  return deepFreeze({
    id: `${kind}-${company?.id ?? "shortlisted"}-${receivedAt}`,
    kind,
    companyId: company?.id ?? null,
    caseId,
    from,
    to: name,
    subject,
    preview,
    receivedAt,
    unread,
    body,
  });
}

export function inviteEmail(companyId, { name, now, readSec, minutes, receivedAt = now, unread = true }) {
  const company = COMPANIES[companyId];
  const who = displayName(name);
  const isToday = receivedAt >= startOfDay(now);
  const when = isToday ? `Hari ini, ${clockLabel(meetingTime(receivedAt))}` : "Kapan saja hari ini, sampai pukul 23.59";
  const label = (sec) => (sec % 60 === 0 ? `${sec / 60} menit` : `${Math.round(sec)} detik`);
  const reading = readSec > 0 ? `${label(readSec)} membaca kasus, ` : "";
  const talking = label(Math.round(minutes * 60));
  return email({
    kind: "invite",
    company,
    caseId: company.caseId,
    from: sender(company),
    name: who,
    subject: `Selamat, Anda lolos seleksi berkas: undangan LGD ${company.program}`,
    preview: `Anda kami undang mengikuti Leaderless Group Discussion daring. ${when}.`,
    receivedAt,
    unread,
    body: [
      p(`Halo ${who},`),
      p(`Terima kasih telah melamar ${company.program} di ${company.name}. Kami senang mengabarkan bahwa Anda lolos seleksi berkas.`),
      p("Tahap berikutnya adalah Leaderless Group Discussion (LGD) daring bersama empat kandidat lain. Tidak ada ketua dalam diskusi ini. Kami menilai cara Anda berpikir, berbicara, dan bekerja dengan kelompok."),
      {
        type: "schedule",
        title: "Jadwal",
        rows: [
          { label: "Tahap", value: "Leaderless Group Discussion, daring" },
          { label: "Waktu", value: when },
          { label: "Durasi", value: `${reading}${talking} diskusi` },
          { label: "Peserta", value: "5 kandidat dan 1 asesor" },
          { label: "Media", value: "Shortlisted Meet" },
        ],
      },
      { type: "action", action: "join", label: "Gabung meeting", caseId: company.caseId },
      { type: "meta", text: `ID meeting ${company.meetingId}. Tautan aktif sampai sesi berakhir.` },
      {
        type: "list",
        title: "Sebelum bergabung",
        items: [
          "Cari tempat yang tenang dan pakai headphone kalau ada.",
          "Siapkan mikrofon. Kamera boleh menyala, boleh tidak.",
          "Studi kasus dibagikan di awal meeting, jadi tidak perlu menyiapkan materi.",
        ],
      },
      p("Semoga sukses."),
      { type: "signature", lines: ["Salam,", company.team] },
      fictional(company),
    ],
  });
}

function receivedNote(company, who, receivedAt) {
  return email({
    kind: "note",
    company,
    from: sender(company),
    name: who,
    subject: "Lamaran Anda telah kami terima",
    preview: `Terima kasih telah melamar ${company.program}. Lamaran Anda sedang kami tinjau.`,
    receivedAt,
    unread: false,
    body: [
      p(`Halo ${who},`),
      p(`Terima kasih telah melamar ${company.program} di ${company.name}. Lamaran Anda sedang kami tinjau.`),
      p("Kami akan menghubungi Anda melalui email ini jika Anda lolos ke tahap berikutnya."),
      { type: "signature", lines: ["Salam,", company.team] },
      fictional(company),
    ],
  });
}

function testNote(company, who, receivedAt) {
  return email({
    kind: "note",
    company,
    from: sender(company),
    name: who,
    subject: "Tes online Anda sudah kami terima",
    preview: "Hasilnya kami kabarkan lewat email paling lambat tujuh hari kerja.",
    receivedAt,
    unread: false,
    body: [
      p(`Halo ${who},`),
      p(`Terima kasih telah mengikuti tes online ${company.program}. Jawaban Anda sudah kami terima.`),
      p("Hasilnya kami kabarkan lewat email paling lambat tujuh hari kerja."),
      { type: "signature", lines: ["Salam,", company.team] },
      fictional(company),
    ],
  });
}

const at = (dayStart, hours, minutes) => dayStart + (hours * 60 + minutes) * 60_000;

// What is already in the inbox when the simulation starts. The Arunika invitation is
// not here: it arrives live, a moment after the applicant opens the laptop.
export function buildInbox({ name, now }) {
  const who = displayName(name);
  const today = startOfDay(now);
  const emails = [
    inviteEmail("rinjani", { name: who, now, readSec: 60, minutes: 6, receivedAt: at(today - DAY_MS, 16, 20) }),
    testNote(COMPANIES.rinjani, who, at(today - 9 * DAY_MS, 19, 40)),
    receivedNote(COMPANIES.arunika, who, at(today - 12 * DAY_MS, 9, 14)),
  ].sort((a, b) => b.receivedAt - a.receivedAt);
  return deepFreeze({ emails });
}

const pricing = { type: "action", action: "pricing", label: "Kunci harga pre-sale" };
const shortlistedSignature = { type: "signature", lines: ["Semangat latihannya,", "Shortlisted"] };
const notStored = { type: "fineprint", text: "Kamu menerima email ini karena memakai simulasi Shortlisted. Tidak ada yang disimpan setelah halaman ini ditutup." };

export function resultEmail({ result, companyId, name, now }) {
  const company = COMPANIES[companyId];
  const who = displayName(name);
  const simulated = result.mode !== "live";
  return email({
    kind: "result",
    company,
    from: SHORTLISTED,
    name: who,
    subject: `Rapor LGD kamu: ${company.name}`,
    preview: result.summary,
    receivedAt: now,
    unread: true,
    body: [
      p(`Halo ${who},`),
      p(`Ini rapor dari LGD barusan bersama ${company.name}. Nilainya 1 sampai 5 per aspek, dan setiap nilai disertai kalimat yang kamu ucapkan sendiri.`),
      { type: "scorecard", result },
      simulated
        ? { type: "meta", text: "Rapor ini dibuat dari aturan sederhana karena demo berjalan dalam mode simulasi. Di versi penuh, rapor ditulis model AI yang dikalibrasi bersama asesor." }
        : { type: "meta", text: "Rapor ini ditulis model AI dari transkrip diskusimu. Rubriknya masih dikalibrasi bersama asesor." },
      { type: "action", action: "rejoin", label: "Ulangi LGD ini", caseId: company.caseId },
      { type: "action", action: "other-invite", label: "Coba undangan lain" },
      pricing,
      shortlistedSignature,
      notStored,
    ],
  });
}

export function noSpeechResultEmail({ companyId, name, now }) {
  const company = COMPANIES[companyId];
  const who = displayName(name);
  return email({
    kind: "result-empty",
    company,
    from: SHORTLISTED,
    name: who,
    subject: "Rapor LGD kamu belum bisa dibuat",
    preview: "Kamu belum bicara di LGD barusan, jadi belum ada yang bisa dinilai.",
    receivedAt: now,
    unread: true,
    body: [
      p(`Halo ${who},`),
      p(`Kamu belum bicara di LGD barusan bersama ${company.name}, jadi asesor belum punya bahan untuk dinilai.`),
      p("Masuk lagi dan sampaikan pendapatmu minimal sekali. Coba bicara di dua menit pertama, misalnya dengan mengusulkan urutan pembahasan."),
      { type: "action", action: "rejoin", label: "Masuk lagi ke LGD", caseId: company.caseId },
      shortlistedSignature,
      notStored,
    ],
  });
}

export function failedResultEmail({ companyId, name, now, reason }) {
  const company = COMPANIES[companyId];
  const who = displayName(name);
  return email({
    kind: "result-error",
    company,
    from: SHORTLISTED,
    name: who,
    subject: "Rapor LGD kamu tertunda",
    preview: "Rapor gagal dibuat. Diskusimu masih ada, jadi kamu bisa mengirim ulang.",
    receivedAt: now,
    unread: true,
    body: [
      p(`Halo ${who},`),
      p(`Rapor LGD bersama ${company.name} gagal dibuat. Penyebabnya: ${reason}`),
      p("Diskusimu masih tersimpan di halaman ini. Tekan tombol di bawah untuk mencoba lagi."),
      { type: "action", action: "retry-score", label: "Kirim ulang rapor" },
      shortlistedSignature,
    ],
  });
}
