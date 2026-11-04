// The meeting window: lobby, room, and the "meeting ended" moment. It grows out of the link
// that opened it and shrinks back to it (spatial consistency). Logic lives in session.js.

import { PERSONAS } from "../lib/personas.js";
import { formatClock } from "./format.js";
import { ASSESSOR, DISCUSSION_START, assessorOpening } from "./meeting-plan.js";
import { el, factList } from "./render.js";
import { createSession } from "./session.js";
import { createDictation } from "./speech.js";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const EASE_EXIT = "cubic-bezier(0.4, 0, 1, 1)";
const ENDED_HOLD_MS = 1700;
const $ = (id) => document.getElementById(id);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "K";

const MIC_ERRORS = {
  "not-allowed": "Izin mikrofon ditolak. Kamu tetap bisa mengetik.",
  "service-not-allowed": "Izin mikrofon ditolak. Kamu tetap bisa mengetik.",
  "no-speech": "Tidak ada suara yang terdengar. Tahan tombolnya sambil bicara.",
  "audio-capture": "Mikrofon tidak ditemukan. Kamu tetap bisa mengetik.",
};

// Grows a window out of an element on the page, or shrinks it back into it.
function travel(win, origin, direction) {
  if (reduced()) return win.animate([{ opacity: direction === "open" ? 0 : 1 }, { opacity: direction === "open" ? 1 : 0 }], { duration: 160 }).finished;
  const to = win.getBoundingClientRect();
  const from = origin?.isConnected ? origin.getBoundingClientRect() : null;
  const away = from
    ? `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${Math.max(0.08, from.width / to.width)})`
    : "translateY(12px) scale(0.96)";
  const frames = [{ transform: away, opacity: 0 }, { transform: "none", opacity: 1 }];
  const options = direction === "open" ? { duration: 560, easing: EASE } : { duration: 380, easing: EASE_EXIT };
  return win.animate(direction === "open" ? frames : [...frames].reverse(), { ...options, fill: "forwards" }).finished;
}

// First-last-invert-play for a layout change, so tiles glide instead of jumping.
function flip(nodes, mutate) {
  const before = new Map(nodes.map((node) => [node, node.getBoundingClientRect()]));
  mutate();
  if (reduced()) return;
  for (const node of nodes) {
    const a = before.get(node);
    const b = node.getBoundingClientRect();
    if (!a.width || !b.width) continue;
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    const s = a.width / b.width;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(s - 1) < 0.01) continue;
    node.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})`, transformOrigin: "top left" }, { transform: "none", transformOrigin: "top left" }], { duration: 420, easing: EASE });
  }
}

function tile(id, label, sub) {
  return el(
    "div",
    { class: `tile tile-${id}`, "data-id": id, role: "group", "aria-label": label },
    el("span", { class: "tile-face", "aria-hidden": "true" }, initials(label)),
    id === "you" ? el("video", { class: "tile-video", autoplay: true, muted: true, playsinline: true, hidden: true }) : null,
    el("span", { class: "tile-label" }, el("span", { class: "tile-name" }, label), sub ? el("span", { class: "tile-sub" }, sub) : null),
    el("span", { class: "tile-bars", "aria-hidden": "true" }, el("i"), el("i"), el("i")),
  );
}

export function createMeet({ api, voice, camera, sounds, access, onMode }) {
  const win = $("meet-window");
  let session = null;
  let ctx = null; // { company, caseData, name, minutes, readSec, origin, resolve }
  let ui = { cc: true, panel: null, composer: false, notice: null };
  let lastLayout = null;
  let renderedMessages = 0;

  const dictation = createDictation({
    onText: (text) => session?.sendText(text),
    onInterim: (text) => session?.heard(text),
    onError: (code) => notice(MIC_ERRORS[code] ?? "Suara tidak terbaca. Coba lagi atau ketik saja.", code === "not-allowed"),
    onEnd: () => session?.stopListening(),
  });

  const speakerName = (id) => (id === "you" ? ctx?.name ?? "Kamu" : id === ASSESSOR.id ? `${ASSESSOR.name} · ${ASSESSOR.role}` : PERSONAS.find((p) => p.id === id)?.name ?? id);

  function notice(text, openComposer = false) {
    ui = { ...ui, notice: text, composer: openComposer || ui.composer };
    render(session?.getState());
  }

  // ---------- Lobby ----------
  function showLobby(error = null) {
    $("lobby").hidden = false;
    $("room").hidden = true;
    $("meet-ended").hidden = true;
    $("lobby-name").value = ctx.name;
    const needCode = access.required() && (!access.get() || Boolean(error));
    $("lobby-code-field").hidden = !needCode;
    $("lobby-error").hidden = !error;
    $("lobby-error").textContent = error ?? "";
    $("lobby-initials").textContent = initials(ctx.name);
    $("meet-timer").textContent = formatClock(ctx.minutes * 60);
    $("meet-timer").classList.remove("is-urgent");
    $("meet-rec").hidden = true;
    $("lobby-voice").setAttribute("aria-pressed", String(voice.isEnabled()));
    $("lobby-voice").disabled = !voice.available;
    // Synthesize the assessor's script while the applicant is still in the lobby, so the
    // meeting starts speaking the moment they join. It also proves the voices work.
    for (const line of [...assessorOpening({ name: ctx.name, readSec: ctx.readSec, minutes: ctx.minutes }), DISCUSSION_START]) {
      voice.prefetch(ASSESSOR.id, line);
    }
    voiceStatus(voice.status());
    $("lobby-mic-note").textContent = dictation
      ? "Saat diskusi, tahan tombol Bicara (atau tombol spasi) selama kamu berbicara."
      : "Browser ini tidak mendukung input suara. Kamu bisa ikut dengan mengetik.";
    (needCode ? $("lobby-code") : $("lobby-join")).focus({ preventScroll: true });
  }

  // Real voice state, as reported by the voice engine: loading, ready, or unavailable.
  function voiceStatus(status) {
    if (!ctx) return;
    const note = !voice.available
      ? "Browser ini tidak bisa memutar suara, jadi peserta tampil sebagai teks."
      : status === "ready"
        ? "Suara peserta siap. Pakai headphone supaya mikrofon tidak ikut menangkap suara mereka."
        : status === "unavailable"
          ? "Suara peserta sedang tidak tersedia. Teks tetap tampil, jadi kamu tetap bisa ikut."
          : "Menyiapkan suara peserta…";
    $("lobby-voice-note").textContent = note;
    if (status === "unavailable" && session && voice.isEnabled()) notice("Suara peserta sedang tidak tersedia. Teks tetap tampil.");
  }

  async function toggleCamera() {
    try {
      if (camera.isOn()) camera.stop();
      else await camera.start();
      ui = { ...ui, notice: null };
      $("lobby-error").hidden = true;
    } catch (error) {
      if ($("room").hidden) {
        $("lobby-error").hidden = false;
        $("lobby-error").textContent = error.message;
      } else {
        notice(error.message);
      }
    }
    syncCamera();
  }

  function syncCamera() {
    const stream = camera.stream();
    for (const video of [$("lobby-video"), win.querySelector(".tile-you video")].filter(Boolean)) {
      video.srcObject = stream;
      video.hidden = !stream;
    }
    $("lobby-cam").setAttribute("aria-pressed", String(Boolean(stream)));
    $("ctl-cam").setAttribute("aria-pressed", String(Boolean(stream)));
  }

  function join(event) {
    event.preventDefault();
    voice.unlock(); // inside the click, so later lines may play on Safari and iOS
    if (!$("lobby-code-field").hidden) {
      const code = $("lobby-code").value.trim();
      if (!code) {
        $("lobby-error").hidden = false;
        $("lobby-error").textContent = "Masukkan kode akses meeting dulu.";
        $("lobby-code").focus();
        return;
      }
      access.set(code);
    }
    ctx = { ...ctx, name: $("lobby-name").value.trim().slice(0, 40) || ctx.name };
    enterRoom();
  }

  // ---------- Room ----------
  function enterRoom() {
    const lobbyRect = $("lobby-preview").getBoundingClientRect();
    $("lobby").hidden = true;
    $("room").hidden = false;
    renderedMessages = 0;
    lastLayout = null;
    $("transcript").replaceChildren();
    ui = { ...ui, panel: null, composer: !dictation, notice: null };
    const grid = $("grid");
    grid.replaceChildren(
      ...PERSONAS.map((p) => tile(p.id, p.name)),
      tile("you", ctx.name, "Kamu"),
      tile(ASSESSOR.id, ASSESSOR.name, ASSESSOR.role),
    );
    syncCamera();
    $("share-industry").textContent = ctx.caseData.industry;
    $("share-title").textContent = ctx.caseData.title;
    $("share-brief").textContent = ctx.caseData.brief;
    $("share-facts").replaceChildren(factList(ctx.caseData.facts));
    $("panel-case-body").replaceChildren(
      el("p", { class: "doc-kicker" }, ctx.caseData.industry),
      el("h3", {}, ctx.caseData.title),
      el("p", {}, ctx.caseData.brief),
      factList(ctx.caseData.facts),
    );
    const you = grid.querySelector(".tile-you");
    if (!reduced() && lobbyRect.width) {
      const r = you.getBoundingClientRect();
      you.animate([{ transform: `translate(${lobbyRect.left - r.left}px, ${lobbyRect.top - r.top}px) scale(${lobbyRect.width / r.width})`, transformOrigin: "top left" }, { transform: "none", transformOrigin: "top left" }], { duration: 560, easing: EASE });
    }
    sounds.joined();
    session = createSession({
      caseId: ctx.caseData.id,
      name: ctx.name,
      minutes: ctx.minutes,
      readSec: ctx.readSec,
      api,
      voice,
      onChange: render,
      onEnd: ended,
      onAuthError: (message) => {
        access.clear();
        session = null;
        showLobby(message || "Kode akses salah. Periksa lagi kodenya.");
      },
    });
    render(session.getState());
    session.start();
  }

  function render(state) {
    if (!state || !ctx) return;
    const layout = state.sharing || state.phase === "reading" ? "share" : "grid";
    if (layout !== lastLayout) {
      flip([...$("grid").children], () => {
        $("stage").dataset.layout = layout;
        $("share").hidden = layout !== "share";
      });
      lastLayout = layout;
    }
    $("meet-timer").textContent =
      state.phase === "reading" ? `Membaca ${formatClock(state.readLeft)}` : state.phase === "opening" ? "Pembukaan" : formatClock(state.remainingSec);
    $("meet-timer").classList.toggle("is-urgent", state.phase === "discussion" && state.remainingSec <= 30);
    $("meet-rec").hidden = state.phase !== "discussion";
    $("share-clock").textContent = formatClock(state.readLeft);
    $("share-skip").hidden = state.phase !== "reading";
    for (const node of $("grid").children) node.classList.toggle("is-speaking", node.dataset.id === state.speaker);
    renderCaption(state);
    renderStatus(state);
    renderControls(state);
    renderTranscript(state);
    if (state.mode) onMode(state.mode);
  }

  function renderCaption(state) {
    const caption = state.caption;
    const show = ui.cc && caption && (caption.text || caption.interim);
    $("captions").hidden = !show;
    if (!show) return;
    $("cap-name").textContent = speakerName(caption.speaker);
    $("cap-text").textContent = caption.text || "Mendengarkan…";
    $("captions").classList.toggle("is-interim", Boolean(caption.interim));
  }

  function renderStatus(state) {
    const waiting = !state.speaker && (state.thinking ? "Peserta lain sedang menanggapi…" : state.connecting ? "Menyambungkan suara…" : null);
    const text = state.error ?? ui.notice ?? waiting;
    $("room-status").hidden = !text;
    // Progress messages fade in after a short delay, so a fast answer never flashes one.
    $("room-status").classList.toggle("is-progress", !state.error && !ui.notice && Boolean(waiting));
    $("room-status-text").textContent = text ?? "";
    $("room-retry").hidden = !state.canRetry;
  }

  function renderControls(state) {
    const talking = state.phase === "discussion";
    const mic = $("ctl-mic");
    mic.disabled = !dictation || !talking;
    mic.setAttribute("aria-pressed", String(state.listening));
    mic.querySelector(".ctl-label").textContent = !dictation ? "Mikrofon tidak didukung" : state.listening ? "Lepas untuk kirim" : "Tahan untuk bicara";
    $("ctl-type").disabled = !talking;
    $("ctl-type").setAttribute("aria-pressed", String(ui.composer));
    $("composer").hidden = !ui.composer || !talking;
    $("composer-input").disabled = !talking;
    $("ctl-cc").setAttribute("aria-pressed", String(ui.cc));
    $("ctl-case").setAttribute("aria-pressed", String(ui.panel === "case"));
    $("ctl-transcript").setAttribute("aria-pressed", String(ui.panel === "transcript"));
    $("panel").hidden = !ui.panel;
    $("panel-title").textContent = ui.panel === "case" ? "Studi kasus" : "Transkrip";
    $("panel-case-body").hidden = ui.panel !== "case";
    $("panel-transcript-body").hidden = ui.panel !== "transcript";
    $("ctl-leave").disabled = state.phase === "closing" || state.phase === "ended";
    $("room").dataset.phase = state.phase;
  }

  function renderTranscript(state) {
    const list = $("transcript");
    $("transcript-empty").hidden = state.messages.length > 0;
    for (const message of state.messages.slice(renderedMessages)) {
      list.append(el("li", { class: message.speaker === "you" ? "is-you" : null }, el("b", {}, speakerName(message.speaker)), el("span", {}, message.text)));
    }
    renderedMessages = state.messages.length;
    list.scrollTop = list.scrollHeight;
  }

  // ---------- End ----------
  async function ended(outcome) {
    dictation?.abort();
    $("meet-ended").hidden = false;
    $("meet-ended-text").textContent =
      outcome.reason === "time" ? "Waktu diskusi habis. Hasilnya dikirim ke email." : "Kamu meninggalkan meeting. Hasilnya dikirim ke email.";
    if (!reduced()) $("meet-ended").animate([{ opacity: 0, transform: "scale(0.98)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: EASE });
    await new Promise((resolve) => setTimeout(resolve, ENDED_HOLD_MS));
    close(outcome);
  }

  async function close(outcome = null) {
    session?.destroy();
    session = null;
    dictation?.abort();
    voice.reset();
    camera.stop();
    syncCamera();
    const done = ctx?.resolve;
    const origin = ctx?.origin;
    const name = ctx?.name;
    await travel(win, origin, "close");
    win.hidden = true;
    win.getAnimations().forEach((a) => a.cancel());
    document.body.classList.remove("is-meeting");
    ctx = null;
    done?.(outcome ? Object.freeze({ ...outcome, name }) : null);
  }

  // ---------- Controls ----------
  const typingTarget = (target) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  const micDown = () => {
    if (!dictation || dictation.isActive()) return;
    if (session?.startListening()) {
      ui = { ...ui, notice: null };
      dictation.start();
    }
  };
  const micUp = () => dictation?.isActive() && dictation.stop();

  function wire() {
    $("lobby-form").addEventListener("submit", join);
    $("lobby-back").addEventListener("click", () => close(null));
    $("lobby-cam").addEventListener("click", toggleCamera);
    $("ctl-cam").addEventListener("click", toggleCamera);
    $("lobby-voice").addEventListener("click", () => {
      voice.setEnabled(!voice.isEnabled());
      $("lobby-voice").setAttribute("aria-pressed", String(voice.isEnabled()));
    });
    $("lobby-cc").addEventListener("click", () => {
      ui = { ...ui, cc: !ui.cc };
      $("lobby-cc").setAttribute("aria-pressed", String(ui.cc));
    });
    const mic = $("ctl-mic");
    mic.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      mic.setPointerCapture(event.pointerId);
      micDown();
    });
    mic.addEventListener("pointerup", micUp);
    mic.addEventListener("pointercancel", micUp);
    mic.addEventListener("click", (event) => {
      if (event.detail !== 0) return; // keyboard activation toggles; pointer uses press-and-hold
      if (dictation?.isActive()) micUp();
      else micDown();
    });
    document.addEventListener("keydown", (event) => {
      if (win.hidden || event.code !== "Space" || event.repeat || typingTarget(event.target) || event.target.closest?.("button")) return;
      event.preventDefault();
      micDown();
    });
    document.addEventListener("keyup", (event) => {
      if (event.code === "Space" && !typingTarget(event.target)) micUp();
    });
    $("ctl-type").addEventListener("click", () => {
      ui = { ...ui, composer: !ui.composer };
      render(session?.getState());
      if (ui.composer) $("composer-input").focus();
    });
    $("composer").addEventListener("submit", (event) => {
      event.preventDefault();
      if (session?.sendText($("composer-input").value)) $("composer-input").value = "";
    });
    $("ctl-cc").addEventListener("click", () => {
      ui = { ...ui, cc: !ui.cc };
      render(session?.getState());
    });
    for (const [button, panel] of [["ctl-case", "case"], ["ctl-transcript", "transcript"]]) {
      $(button).addEventListener("click", () => {
        ui = { ...ui, panel: ui.panel === panel ? null : panel };
        render(session?.getState());
      });
    }
    $("panel-close").addEventListener("click", () => {
      ui = { ...ui, panel: null };
      render(session?.getState());
      $("ctl-transcript").focus();
    });
    win.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && ui.panel) {
        ui = { ...ui, panel: null };
        render(session?.getState());
      }
    });
    $("share-skip").addEventListener("click", () => session?.skipReading());
    $("room-retry").addEventListener("click", () => session?.retry());
    $("ctl-leave").addEventListener("click", () => $("leave-dialog").showModal());
    $("leave-dialog").addEventListener("close", () => {
      if ($("leave-dialog").returnValue === "leave") session?.leave();
    });
  }
  wire();

  // Opens the meeting from the element that was clicked. Resolves with the outcome
  // ({ messages, elapsedSec, reason }) when it ends, or null if the applicant goes back.
  function open({ company, caseData, name, minutes, readSec, origin }) {
    return new Promise((resolve) => {
      ctx = { company, caseData, name, minutes, readSec, origin, resolve };
      $("meet-title").textContent = `LGD · ${company.program} · ${company.name}`;
      $("lobby-heading").textContent = `LGD ${company.name}`;
      win.hidden = false;
      document.body.classList.add("is-meeting");
      showLobby();
      travel(win, origin, "open");
    });
  }

  return Object.freeze({ open, isOpen: () => !win.hidden, voiceStatus });
}
