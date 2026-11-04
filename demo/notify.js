// Notification banners and the two sounds of the simulation (new mail, joined meeting).
// Sound plays on the same frame the banner appears. The AudioContext is created on the
// applicant's first click, because browsers block audio before a user gesture.

import { el } from "./render.js";

const BANNER_MS = 8000;
const EXIT_MS = 240;

export function createSounds() {
  let ctx = null;
  let muted = false;

  const unlock = () => {
    if (ctx || muted) return;
    const AudioCtx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      ctx = new AudioCtx();
    } catch (error) {
      console.warn("Sound unavailable:", error.message);
    }
  };

  // A short sine note with a fast attack and an exponential tail, like a soft bell.
  const note = (freq, startAt, length, gain) => {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0.0001, startAt);
    amp.gain.exponentialRampToValueAtTime(gain, startAt + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, startAt + length);
    osc.connect(amp).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + length + 0.05);
  };

  const play = (notes) => {
    if (!ctx || muted) return;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime + 0.01;
    for (const [freq, offset, length, gain] of notes) note(freq, t + offset, length, gain);
  };

  return Object.freeze({
    unlock,
    setMuted: (value) => (muted = Boolean(value)),
    mail: () => play([[1318.5, 0, 0.35, 0.07], [987.8, 0.11, 0.5, 0.06]]),
    joined: () => play([[659.3, 0, 0.25, 0.05], [987.8, 0.09, 0.4, 0.05]]),
  });
}

export function createNotifier(container, sounds) {
  function dismiss(banner) {
    if (!banner.isConnected || banner.dataset.leaving) return;
    banner.dataset.leaving = "true";
    banner.classList.add("is-leaving");
    setTimeout(() => banner.remove(), EXIT_MS);
  }

  // Shows one banner. Clicking it runs onOpen; it also leaves on its own after a while,
  // unless the pointer or focus is on it.
  function show({ app, title, body, onOpen, sound = "mail" }) {
    let timer = null;
    const open = el(
      "button",
      { class: "banner-main", type: "button", onclick: () => { dismiss(banner); onOpen?.(); } },
      el("span", { class: "banner-app" }, app),
      el("strong", { class: "banner-title" }, title),
      el("span", { class: "banner-body" }, body),
    );
    const close = el("button", { class: "banner-close", type: "button", "aria-label": "Tutup notifikasi", onclick: () => dismiss(banner) }, "×");
    const banner = el("div", { class: "banner", role: "status" }, open, close);
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => dismiss(banner), BANNER_MS);
    };
    banner.addEventListener("pointerenter", () => clearTimeout(timer));
    banner.addEventListener("pointerleave", arm);
    banner.addEventListener("focusin", () => clearTimeout(timer));
    banner.addEventListener("focusout", arm);
    banner.addEventListener("keydown", (event) => event.key === "Escape" && dismiss(banner));
    container.prepend(banner);
    if (sound) sounds?.[sound]?.();
    arm();
    return banner;
  }

  return Object.freeze({ show, clear: () => container.querySelectorAll(".banner").forEach(dismiss) });
}
