// Practice cases for the LGD demo. Fictional scenarios in the style of MT/SOE selection.
// Pure data, no Node imports: the browser loads this file directly.

export const CASES = Object.freeze([
  Object.freeze({
    id: "bbm-terpencil",
    title: "Distribusi BBM ke kabupaten terpencil",
    industry: "Energi",
    brief:
      "Sebuah perusahaan distribusi BBM melayani 3 kabupaten terpencil. Dalam 30 hari terakhir, pengiriman terlambat rata-rata 9 hari, dan anggaran logistik kuartal ini dipotong 15%. Kelompok harus sepakat pada satu rekomendasi prioritas untuk direktur operasi: menyewa truk tambahan, atau memindahkan sebagian rute ke jalur sungai.",
    facts: Object.freeze([
      "Stok BBM di 2 dari 3 kabupaten tinggal cukup untuk 6 hari.",
      "Sewa truk tambahan: Rp18 juta per truk per bulan, tersedia 4 truk.",
      "Jalur sungai: biaya 40% lebih murah, tetapi menambah 3 hari perjalanan.",
      "Anggaran logistik kuartal ini: Rp900 juta, setelah dipotong 15%.",
    ]),
  }),
  Object.freeze({
    id: "kredit-umkm",
    title: "Kredit macet UMKM naik",
    industry: "Perbankan",
    brief:
      "Rasio kredit macet UMKM di sebuah bank naik dari 3,1% menjadi 4,6% dalam dua kuartal. Direktur meminta satu rekomendasi prioritas dalam waktu singkat: memperketat syarat kredit baru, merestrukturisasi debitur yang tertunggak, atau menambah tim penagihan.",
    facts: Object.freeze([
      "Portofolio kredit UMKM: Rp2,4 triliun, 18.000 debitur.",
      "60% kredit macet berasal dari sektor perdagangan eceran.",
      "Restrukturisasi menurunkan risiko gagal bayar, tetapi menahan pendapatan bunga 6 bulan.",
      "Tambahan 10 petugas penagihan: Rp1,2 miliar per tahun.",
    ]),
  }),
]);

export const findCase = (id) => CASES.find((item) => item.id === id) ?? null;
