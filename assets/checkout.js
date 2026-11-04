// Pre-sale checkout: the plan buttons open a short form, the server opens a Midtrans
// payment page, and the buyer is sent there. Until payments are configured on the
// server, the buttons say "Segera dibuka" and do nothing.

import { PLANS, validateCheckout } from "../lib/payments.js";

const CLOSED_LABEL = "Segera dibuka";
const BUSY_LABEL = "Membuka pembayaran…";
const GENERIC_ERROR = "Halaman pembayaran gagal dibuka. Coba lagi sebentar.";

const formatRupiah = (amount) => `Rp${amount.toLocaleString("id-ID")}`;

async function paymentsOpen() {
  try {
    const response = await fetch("/api/status", { headers: { Accept: "application/json" } });
    return response.ok && (await response.json()).paymentsOpen === true;
  } catch {
    return false;
  }
}

function closeButtons(buttons) {
  for (const button of buttons) {
    button.textContent = CLOSED_LABEL;
    button.setAttribute("aria-disabled", "true");
  }
}

function mountCheckout(dialog) {
  const form = dialog.querySelector("form");
  const planLine = dialog.querySelector("#checkout-plan");
  const errorLine = dialog.querySelector("#checkout-error");
  const submit = form.querySelector('[type="submit"]');
  const submitLabel = submit.textContent;
  let plan = null;

  const showError = (message) => {
    errorLine.textContent = message;
    errorLine.hidden = !message;
  };
  const setBusy = (busy) => {
    submit.disabled = busy;
    submit.textContent = busy ? BUSY_LABEL : submitLabel;
  };

  form.addEventListener("input", () => showError("")); // a fix in progress clears the old message
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close(); // backdrop click
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fields = new FormData(form);
    const payload = {
      plan,
      name: fields.get("name"),
      email: fields.get("email"),
      whatsapp: fields.get("whatsapp"),
      consent: form.elements.consent.checked,
    };
    const checked = validateCheckout(payload);
    if (!checked.ok) return showError(checked.error);

    showError("");
    setBusy(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      showError(result.error || GENERIC_ERROR);
    } catch {
      showError(GENERIC_ERROR);
    }
    setBusy(false);
  });

  return function open(planId) {
    plan = planId;
    const { label, price } = PLANS[planId];
    planLine.textContent = `${label} · ${formatRupiah(price)} / 30 hari`;
    showError("");
    setBusy(false);
    dialog.showModal();
    form.elements.name.focus();
  };
}

async function start() {
  const buttons = [...document.querySelectorAll("[data-plan]")];
  const dialog = document.getElementById("checkout");
  if (buttons.length === 0 || !dialog) return;

  const openCheckout = mountCheckout(dialog);
  const ready = paymentsOpen();
  for (const button of buttons) {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (await ready) openCheckout(button.dataset.plan);
    });
  }
  if (!(await ready)) closeButtons(buttons);
}

start();
