// Demo controller: case selection, reading time, the LGD room, and the scorecard.
// State is replaced, never mutated; DOM updates are applied from the latest state.

import { CASES, findCase } from "../lib/cases.js";
import { createApiClient } from "./api.js";
import { formatClock, parseBounded, tail } from "./format.js";
import { caseRow, factList, roster, scorecard } from "./render.js";
import { messageNode, typingNode } from "./render.js";
import { createDictation } from "./speech.js";

const query = new URLSearchParams(location.search);
// ?minutes= and ?read= let you shorten the session when testing.
const SESSION_SEC = Math.round(parseBounded(query.get("minutes"), { min: 0.25, max: 15, fallback: 6 }) * 60);
const READ_SEC = Math.round(parseBounded(query.get("read"), { min: 0, max: 120, fallback: 60 }));
const MAX_SENT_MESSAGES = 40;
const REPLY_GAP_MS = 900;
const CODE_KEY = "shortlisted-demo-code";

const MODE_LABELS = {
  live: ["AI aktif", "Balasan dan penilaian dibuat oleh model AI."],
  mock: ["Mode simulasi", "Balasan dan nilai dibuat dari aturan sederhana, bukan AI."],
  fallback: ["AI bermasalah, memakai simulasi", "Model AI tidak tersedia sesaat, jadi aturan sederhana dipakai."],
};

const $ = (id) => document.getElementById(id);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// sessionStorage can be unavailable (private mode, blocked site data); the demo works without it.
const store = {
  get: () => {
    try {
      return sessionStorage.getItem(CODE_KEY) ?? "";
    } catch {
      return "";
    }
  },
  set: (value) => {
    try {
      sessionStorage.setItem(CODE_KEY, value);
    } catch {
      /* code is kept in memory for this page load only */
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(CODE_KEY);
    } catch {
      /* nothing stored */
    }
  },
};
let memoryCode = store.get();
const api = createApiClient({ getAccessCode: () => memoryCode });

let state = Object.freeze({
  screen: "start",
  caseId: null,
  messages: Object.freeze([]),
  busy: false,
  typing: false,
  speaking: null,
  error: null,
  canRetry: false,
  remainingSec: SESSION_SEC,
  ended: false,
  scoring: false,
  result: null,
  scoreError: null,
  accessRequired: false,
});
const setState = (patch) => {
  state = Object.freeze({ ...state, ...patch });
  render();
};
const withMessage = (message) => Object.freeze([...state.messages, Object.freeze(message)]);

let tickTimer = null;
let readTimer = null;
let renderedCount = 0;
let dictation = null;

function noteMode(mode) {
  const [label, title] = MODE_LABELS[mode] ?? MODE_LABELS.mock;
  const pill = $("mode");
  pill.hidden = false;
  pill.textContent = label;
  pill.title = title;
  pill.dataset.mode = mode;
}

function syncLog() {
  const log = $("log");
  if (renderedCount > state.messages.length) {
    log.replaceChildren();
    renderedCount = 0;
  }
  let typing = log.querySelector(".typing");
  for (const message of state.messages.slice(renderedCount)) {
    const node = messageNode(message);
    if (typing) log.insertBefore(node, typing);
    else log.append(node);
  }
  renderedCount = state.messages.length;
  if (state.typing && !typing) log.append(typingNode());
  if (!state.typing && typing) typing.remove();
  log.scrollTop = log.scrollHeight;
}

function renderResult() {
  const body = $("result-body");
  const note = $("result-note");
  note.hidden = true;
  if (state.scoring) {
    body.replaceChildren(Object.assign(document.createElement("p"), { className: "status-line", textContent: "Assessor sedang menilai sesimu..." }));
  } else if (state.scoreError) {
    const retry = Object.assign(document.createElement("button"), { className: "btn btn-primary", type: "button", textContent: "Coba lagi" });
    retry.addEventListener("click", loadScore);
    const message = Object.assign(document.createElement("p"), { className: "status-line", textContent: state.scoreError });
    body.replaceChildren(message, retry);
  } else if (state.result) {
    body.replaceChildren(scorecard(state.result));
    if (state.result.mode !== "live") {
      note.hidden = false;
      note.textContent = "Penilaian ini dibuat dari aturan sederhana, bukan AI. Di versi penuh, penilaian dibuat model AI yang dikalibrasi bersama assessor.";
    }
  } else {
    body.replaceChildren(Object.assign(document.createElement("p"), { className: "status-line", textContent: "Kamu belum berbicara di sesi ini, jadi belum ada yang bisa dinilai. Coba lagi dan sampaikan pendapatmu minimal sekali." }));
  }
}

function render() {
  $("timer").textContent = formatClock(state.remainingSec);
  $("timer").classList.toggle("urgent", state.screen === "room" && state.remainingSec <= 30);
  $("send").disabled = state.busy || state.ended;
  $("draft").disabled = state.ended;
  $("finish").disabled = state.ended;
  $("roster").replaceChildren(...roster(state.speaking));
  $("error").hidden = !state.error;
  $("error-text").textContent = state.error ?? "";
  $("retry").hidden = !state.canRetry;
  syncLog();
  if (state.screen === "result") renderResult();
}

function show(screen) {
  for (const section of document.querySelectorAll("[data-screen]")) section.hidden = section.id !== `screen-${screen}`;
  state = Object.freeze({ ...state, screen });
  window.scrollTo(0, 0);
  document.querySelector(`#screen-${screen} [tabindex="-1"]`)?.focus();
  render();
}

function handleApiError(error, { canRetry }) {
  if (error.status === 401) {
    store.clear();
    memoryCode = "";
    $("access").hidden = false;
    $("access-error").hidden = false;
    $("access-error").textContent = error.message;
  }
  const hint = error.retryAfterSec ? ` Coba lagi dalam ${error.retryAfterSec} detik.` : "";
  setState({ busy: false, typing: false, speaking: null, error: `${error.message}${hint}`, canRetry });
}

async function fetchReplies() {
  setState({ busy: true, typing: true, error: null, canRetry: false });
  try {
    const data = await api.turn({
      caseId: state.caseId,
      messages: tail(state.messages, MAX_SENT_MESSAGES),
      elapsedSec: SESSION_SEC - state.remainingSec,
    });
    noteMode(data.mode);
    for (const [index, reply] of data.replies.entries()) {
      if (state.ended) return;
      if (index > 0) {
        setState({ typing: true, speaking: null });
        await pause(REPLY_GAP_MS);
        if (state.ended) return;
      }
      setState({ messages: withMessage({ speaker: reply.speaker, text: reply.text }), typing: false, speaking: reply.speaker });
    }
    setState({ busy: false, typing: false, speaking: null });
    $("draft").focus({ preventScroll: true });
  } catch (error) {
    handleApiError(error, { canRetry: true });
  }
}

async function send(event) {
  event?.preventDefault();
  const text = $("draft").value.trim();
  if (!text || state.busy || state.ended) return;
  $("draft").value = "";
  setState({ messages: withMessage({ speaker: "you", text }) });
  await fetchReplies();
}

async function loadScore() {
  setState({ scoring: true, scoreError: null });
  try {
    const result = await api.score({
      caseId: state.caseId,
      messages: tail(state.messages, MAX_SENT_MESSAGES),
      elapsedSec: SESSION_SEC - state.remainingSec,
    });
    noteMode(result.mode);
    setState({ scoring: false, result });
  } catch (error) {
    if (error.status === 401) handleApiError(error, { canRetry: false });
    setState({ scoring: false, scoreError: error.message });
  }
}

async function finish() {
  if (state.ended) return;
  clearInterval(tickTimer);
  dictation?.stop();
  const hasSpoken = state.messages.some((m) => m.speaker === "you");
  setState({ ended: true, busy: false, typing: false, speaking: null, error: null, result: null, scoreError: null });
  show("result");
  if (hasSpoken) await loadScore();
}

function onTick() {
  const remainingSec = state.remainingSec - 1;
  if (remainingSec <= 0) {
    setState({ remainingSec: 0 });
    finish();
  } else {
    setState({ remainingSec });
  }
}

function enterRoom() {
  clearInterval(readTimer);
  const caseData = findCase(state.caseId);
  $("room-title").textContent = caseData.title;
  $("room-brief").textContent = caseData.brief;
  $("room-facts").replaceChildren(factList(caseData.facts));
  $("draft").value = "";
  setState({ messages: Object.freeze([]), remainingSec: SESSION_SEC, ended: false, result: null, error: null, scoring: false });
  show("room");
  clearInterval(tickTimer);
  tickTimer = setInterval(onTick, 1000);
  fetchReplies();
}

function startCase(caseId) {
  if (state.accessRequired && !memoryCode) {
    $("access").hidden = false;
    $("access-code").focus();
    return;
  }
  const caseData = findCase(caseId);
  setState({ caseId, messages: Object.freeze([]), ended: false, result: null });
  $("brief-title").textContent = caseData.title;
  $("brief-text").textContent = caseData.brief;
  $("brief-facts").replaceChildren(factList(caseData.facts));
  show("brief");
  if (READ_SEC === 0) return enterRoom();

  let left = READ_SEC;
  $("brief-clock").textContent = formatClock(left);
  clearInterval(readTimer);
  readTimer = setInterval(() => {
    left -= 1;
    $("brief-clock").textContent = formatClock(left);
    if (left <= 0) enterRoom();
  }, 1000);
}

function backToStart() {
  clearInterval(readTimer);
  clearInterval(tickTimer);
  setState({ messages: Object.freeze([]), remainingSec: SESSION_SEC, ended: false, busy: false, typing: false, error: null, result: null, scoring: false });
  show("start");
}

function setupDictation() {
  dictation = createDictation({
    onText: (text) => {
      const draft = $("draft");
      draft.value = [draft.value.trim(), text].filter(Boolean).join(" ").slice(0, draft.maxLength);
    },
    onError: (code) => {
      const denied = code === "not-allowed" || code === "service-not-allowed";
      setState({ error: denied ? "Izin mikrofon ditolak. Kamu tetap bisa mengetik." : "Suara tidak terbaca. Coba lagi atau ketik saja.", canRetry: false });
    },
    onEnd: () => $("mic").setAttribute("aria-pressed", "false"),
  });
  if (!dictation) return;
  $("mic").hidden = false;
  $("mic").addEventListener("click", () => {
    const listening = $("mic").getAttribute("aria-pressed") === "true";
    $("mic").setAttribute("aria-pressed", String(!listening));
    if (listening) dictation.stop();
    else dictation.start();
  });
}

async function init() {
  $("case-list").replaceChildren(...CASES.map((caseData) => caseRow(caseData, startCase)));
  $("composer").addEventListener("submit", send);
  $("draft").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    }
  });
  $("finish").addEventListener("click", () => {
    if (!state.messages.some((m) => m.speaker === "you")) {
      setState({ error: "Sampaikan pendapatmu minimal sekali sebelum mengakhiri sesi.", canRetry: false });
      return;
    }
    finish();
  });
  $("retry").addEventListener("click", fetchReplies);
  $("brief-start").addEventListener("click", enterRoom);
  $("again").addEventListener("click", backToStart);
  $("access").addEventListener("submit", (event) => {
    event.preventDefault();
    memoryCode = $("access-code").value.trim();
    store.set(memoryCode);
    $("access").hidden = true;
  });
  setupDictation();
  render();

  try {
    const status = await api.status();
    noteMode(status.mode);
    setState({ accessRequired: status.accessCodeRequired });
    if (status.accessCodeRequired && !memoryCode) $("access").hidden = false;
  } catch (error) {
    console.warn("status check failed:", error.message);
  }
}

init();
