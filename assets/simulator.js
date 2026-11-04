// Content and scoring for the landing page's "three moments" mini-simulation.
// Illustrative only: fixed choices with hand-set effects, not the real assessor.
// Pure data + one pure function, so it runs in the browser and under node:test.

export const SIM_ASPECTS = Object.freeze([
  Object.freeze({ id: "inisiatif", label: "Inisiatif" }),
  Object.freeze({ id: "analisis", label: "Analisis" }),
  Object.freeze({ id: "komunikasi", label: "Komunikasi" }),
  Object.freeze({ id: "kerja_tim", label: "Kerja tim" }),
  Object.freeze({ id: "kepemimpinan", label: "Kepemimpinan" }),
  Object.freeze({ id: "keputusan", label: "Keputusan" }),
]);

export const BASELINE = 2;
const MIN = 1;
const MAX = 5;

const choice = (text, deltas, verdict, note) => Object.freeze({ text, deltas: Object.freeze(deltas), verdict, note });

export const MOMENTS = Object.freeze([
  Object.freeze({
    minute: "Menit 1",
    speaker: "Raka",
    trait: "suka memotong",
    line: "Oke, langsung saja. Sewa truk tambahan, selesai. Semua setuju, kan?",
    choices: Object.freeze([
      choice("Setuju, biar cepat.", {}, "Aman, tapi tidak terlihat.",
        "Setuju tanpa alasan tidak menambah nilai apa pun. Assessor mencatat kamu ikut arus."),
      choice("Sebelum memilih, kita sepakati alurnya dulu: masalah, dua opsi, lalu keputusan. Waktu kita enam menit.",
        { inisiatif: 2, kepemimpinan: 2, komunikasi: 1 }, "Kamu membuka arah diskusi.",
        "Mengusulkan alur di menit awal adalah sinyal inisiatif dan kepemimpinan yang paling mudah dilihat assessor."),
      choice("Saya tidak setuju. Sewa truk itu mahal.", { inisiatif: 1, kerja_tim: -1 }, "Berani, tapi terdengar menyerang.",
        "Menyanggah tanpa angka dan tanpa tawaran lain membuat diskusi jadi adu pendapat."),
    ]),
  }),
  Object.freeze({
    minute: "Menit 3",
    speaker: "Sinta",
    trait: "selalu minta data",
    line: "Faktanya: truk Rp18 juta per unit per bulan. Jalur sungai 40% lebih murah, tapi tambah 3 hari. Stok tinggal 6 hari. Jadi?",
    choices: Object.freeze([
      choice("Jalur sungai, karena lebih murah.", { analisis: 1 }, "Pakai angka, tapi baru satu.",
        "Kamu melewatkan stok 6 hari. Tambahan 3 hari perjalanan membuat opsi ini berisiko untuk pengiriman pertama."),
      choice("Stok tinggal 6 hari, jadi pengiriman pertama tidak bisa menunggu jalur sungai. Truk untuk minggu ini, sungai untuk rutin.",
        { analisis: 2, komunikasi: 1, keputusan: 1 }, "Dua fakta jadi satu alasan.",
        "Menghubungkan angka stok dengan waktu tempuh adalah bentuk analisis yang dinilai tinggi."),
      choice("Dimas, dari tadi belum bicara. Menurutmu bagaimana?", { kerja_tim: 2, kepemimpinan: 1 }, "Kamu memberi ruang.",
        "Mengajak peserta yang diam menambah nilai kerja tim. Lain kali, tambahkan juga pendapatmu sendiri."),
    ]),
  }),
  Object.freeze({
    minute: "Menit 5",
    speaker: "Ayu",
    trait: "ingin cepat sepakat",
    line: "Waktu tinggal satu menit dan kita belum sepakat. Gimana?",
    choices: Object.freeze([
      choice("(Diam, menunggu Raka yang memutuskan.)", { keputusan: -1 }, "Waktu habis tanpa kesimpulan.",
        "Kelompok tanpa keputusan merugikan semua orang di aspek keputusan, termasuk kamu."),
      choice("Saya rangkum: 2 truk untuk minggu ini, jalur sungai untuk pengiriman rutin, biaya dievaluasi bulan depan. Ada yang keberatan?",
        { keputusan: 3, komunikasi: 1, kerja_tim: 1 }, "Kamu menutup diskusi.",
        "Merangkum lalu meminta persetujuan adalah cara paling jelas menunjukkan peranmu dalam keputusan."),
      choice("Kita voting saja biar cepat.", { keputusan: 1 }, "Selesai, tapi tanpa alasan.",
        "Voting menghasilkan keputusan, tapi assessor tidak melihat alasan dan peranmu di dalamnya."),
    ]),
  }),
]);

const clamp = (n) => Math.min(MAX, Math.max(MIN, n));

// picks[i] is the chosen index for MOMENTS[i]. Returns one score per SIM_ASPECTS entry.
export function scoreAfter(picks) {
  const totals = picks.reduce((acc, pick, i) => {
    const deltas = MOMENTS[i]?.choices[pick]?.deltas ?? {};
    return acc.map((value, j) => value + (deltas[SIM_ASPECTS[j].id] ?? 0));
  }, SIM_ASPECTS.map(() => BASELINE));
  return totals.map(clamp);
}
