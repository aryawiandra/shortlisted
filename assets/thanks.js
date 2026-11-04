// Thank-you page after Midtrans. The order id comes from the redirect, but the status
// is always asked from our server (which asks Midtrans), never read from the URL.

const POLL_MS = 5000;
const MAX_POLLS = 24; // two minutes; bank transfers can take longer, the email still arrives

// Actions are fixed markup; everything that varies is set as text.
const VIEWS = {
  paid: (plan) => ({
    title: "Pembayaran diterima.",
    text: `Harga pre-sale paket ${plan} sudah terkunci. Bukti bayar dikirim Midtrans ke emailmu, dan tanggal peluncuran menyusul lewat email yang sama.`,
    action: '<a href="demo/">Sambil menunggu, main demo LGD</a>',
  }),
  pending: (plan) => ({
    title: "Menunggu pembayaran.",
    text: `Selesaikan pembayaran paket ${plan} sesuai instruksi di halaman Midtrans. Batasnya 24 jam. Halaman ini memperbarui sendiri.`,
  }),
  stalled: () => ({
    title: "Pembayaran belum masuk.",
    text: "Kalau kamu sudah membayar, buka lagi halaman ini sebentar lagi. Bukti bayar juga dikirim ke emailmu.",
    action: '<a href="">Cek lagi</a>',
  }),
  failed: () => ({
    title: "Pembayaran tidak berhasil.",
    text: "Pembayaranmu dibatalkan, ditolak, atau sudah melewati batas waktu. Tidak ada uang yang ditarik untuk pesanan ini.",
    action: '<a href="index.html#harga">Coba lagi</a>',
  }),
  not_found: () => ({
    title: "Pesanan tidak ditemukan.",
    text: "Kami tidak menemukan pesanan ini. Kalau uangmu sudah terpotong, kirim bukti bayarnya ke kami.",
    action: '<a href="mailto:halo@shortlisted.id">halo@shortlisted.id</a>',
  }),
  error: () => ({
    title: "Status belum bisa dicek.",
    text: "Server pembayaran sedang tidak menjawab. Coba muat ulang sebentar lagi.",
    action: '<a href="">Muat ulang</a>',
  }),
};

const node = (id) => document.getElementById(id);

function render(state, plan = "") {
  const view = (VIEWS[state] ?? VIEWS.error)(plan);
  node("state-title").textContent = view.title;
  node("state-text").textContent = view.text;
  node("state-action").innerHTML = view.action ?? "";
  node("state-action").hidden = !view.action;
}

async function fetchState(orderId) {
  const response = await fetch(`/api/order?id=${encodeURIComponent(orderId)}`, { headers: { Accept: "application/json" } });
  if (response.status === 400) return { state: "not_found" };
  if (!response.ok) return { state: "error" };
  return response.json();
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function start() {
  const orderId = new URLSearchParams(window.location.search).get("order_id");
  if (!orderId) return render("not_found");

  node("state-order").textContent = `Nomor pesanan: ${orderId}`;
  node("state-order").hidden = false;

  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    let result;
    try {
      result = await fetchState(orderId);
    } catch {
      result = { state: "error" };
    }
    if (result.state !== "pending") return render(result.state, result.plan);
    render("pending", result.plan);
    await wait(POLL_MS);
  }
  render("stalled");
}

start();
