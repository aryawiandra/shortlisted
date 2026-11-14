// Timed case drill page: pick a case, write one answer before the timer ends, read the feedback.
// Mirrors lib/drill.js (DRILL_SECONDS, MAX_ANSWER_LENGTH) without importing it: that module
// pulls in zod, which the browser cannot resolve.

import { CASES, findCase } from "../lib/cases.js";
import { ApiError, createApiClient } from "./api.js";

const DRILL_SECONDS = 120;
const MAX_ANSWER_LENGTH = 1200;
const LOW_SECONDS = 20;
const LOW_SCORE = 2;
const TICK_MS = 250;

const $ = (id) => document.getElementById(id);
const show = (id, visible) => { $(id).hidden = !visible; };
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

let accessCode = "";
const api = createApiClient({ getAccessCode: () => accessCode });

const state = { caseId: CASES[0].id, startedAt: 0, timerId: 0, submitting: false, expired: false };

function renderCase() {
  const item = findCase(state.caseId);
  $("case-title").textContent = `${item.title} (${item.industry})`;
  $("case-brief").textContent = item.brief;
  $("case-facts").replaceChildren(...item.facts.map((fact) => Object.assign(document.createElement("li"), { textContent: fact })));
  for (const button of $("cases").children) button.setAttribute("aria-pressed", String(button.dataset.id === state.caseId));
}

function buildCaseButtons() {
  const buttons = CASES.map((item) => {
    const button = Object.assign(document.createElement("button"), { type: "button", className: "case-btn", textContent: item.industry });
    button.dataset.id = item.id;
    button.addEventListener("click", () => { reset(); state.caseId = item.id; renderCase(); });
    return button;
  });
  $("cases").replaceChildren(...buttons);
}

function stopTimer() {
  clearInterval(state.timerId);
  state.timerId = 0;
}

function elapsedSec() {
  return Math.round((Date.now() - state.startedAt) / 1000);
}

function tick() {
  const left = Math.max(0, DRILL_SECONDS - elapsedSec());
  $("timer").textContent = clock(left);
  $("timer").classList.toggle("low", left <= LOW_SECONDS);
  if (left === 0) submit({ auto: true });
}

function start() {
  show("case-card", false);
  show("result-card", false);
  show("cta", false);
  show("answer-card", true);
  $("answer").value = "";
  $("answer").disabled = false;
  $("submit").textContent = "Kirim jawaban";
  state.expired = false;
  updateCount();
  show("error", false);
  state.startedAt = Date.now();
  tick();
  state.timerId = setInterval(tick, TICK_MS);
  $("answer").focus();
}

function updateCount() {
  $("count").textContent = `${$("answer").value.length} dari ${MAX_ANSWER_LENGTH} karakter`;
}

function showError(message) {
  $("error").textContent = message;
  show("error", true);
}

function scoreRow(item) {
  const row = document.createElement("div");
  const head = document.createElement("div");
  head.className = "score";
  const label = Object.assign(document.createElement("span"), { textContent: item.label });
  const bar = document.createElement("span");
  bar.className = "bar";
  const fill = document.createElement("i");
  fill.style.width = `${item.score * 20}%`;
  fill.className = item.score <= LOW_SCORE ? "low" : "";
  bar.append(fill);
  head.append(label, bar, Object.assign(document.createElement("b"), { textContent: String(item.score) }));
  row.append(head, Object.assign(document.createElement("p"), { className: "note", textContent: item.comment }));
  if (item.evidence) row.append(Object.assign(document.createElement("q"), { className: "quote", textContent: item.evidence }));
  return row;
}

function renderResult(result) {
  $("summary").textContent = result.summary;
  $("scores").replaceChildren(...result.scores.map(scoreRow));
  $("next-steps").replaceChildren(...result.nextSteps.map((step) => Object.assign(document.createElement("li"), { textContent: step })));
  $("mode").textContent = result.mode === "live" ? "Dinilai oleh AI." : "Mode simulasi: penilaian berbasis aturan sederhana, bukan AI.";
  show("answer-card", false);
  show("result-card", true);
  show("cta", true);
}

async function submit({ auto = false } = {}) {
  if (state.submitting) return;
  if (state.expired) { reset(); start(); return; }
  const answer = $("answer").value.trim();
  if (!answer) {
    if (!auto) { showError("Tulis jawabanmu dulu."); return; }
    stopTimer();
    state.expired = true;
    $("answer").disabled = true;
    $("submit").textContent = "Coba lagi";
    showError("Waktu habis dan jawabanmu masih kosong. Tekan Coba lagi untuk mengulang.");
    return;
  }

  state.submitting = true;
  stopTimer();
  $("submit").disabled = true;
  try {
    const result = await api.drill({ caseId: state.caseId, answer, elapsedSec: elapsedSec() });
    renderResult(result);
  } catch (error) {
    const needsCode = error instanceof ApiError && error.status === 401;
    show("code-box", needsCode);
    showError(error instanceof ApiError ? error.message : "Terjadi kesalahan. Coba lagi.");
  } finally {
    state.submitting = false;
    $("submit").disabled = false;
  }
}

function reset() {
  stopTimer();
  show("answer-card", false);
  show("result-card", false);
  show("cta", false);
  show("case-card", true);
}

function nextCase() {
  const index = CASES.findIndex((item) => item.id === state.caseId);
  state.caseId = CASES[(index + 1) % CASES.length].id;
  reset();
  renderCase();
}

buildCaseButtons();
renderCase();
$("start").addEventListener("click", start);
$("submit").addEventListener("click", () => submit());
$("answer").addEventListener("input", updateCount);
$("code").addEventListener("input", (event) => { accessCode = event.target.value; });
$("retry").addEventListener("click", () => { reset(); start(); });
$("other").addEventListener("click", nextCase);
