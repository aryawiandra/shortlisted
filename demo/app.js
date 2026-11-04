// The simulation, start to finish: intro sheet, inbox, the invitation arriving, the meeting
// opened from the email link, and the rapor delivered back to the same inbox afterwards.

import { findCase } from "../lib/cases.js";
import { createApiClient } from "./api.js";
import { createCamera } from "./camera.js";
import { parseBounded } from "./format.js";
import {
  COMPANIES,
  buildInbox,
  displayName,
  failedResultEmail,
  inviteEmail,
  noSpeechResultEmail,
  otherCompanyId,
  resultEmail,
} from "./inbox.js";
import { createMail } from "./mail.js";
import { createMeet } from "./meet.js";
import { createNotifier, createSounds } from "./notify.js";
import { createVoiceEngine } from "./voice.js";

const query = new URLSearchParams(location.search);
// ?minutes= and ?read= shorten the session when testing.
const MINUTES = parseBounded(query.get("minutes"), { min: 0.25, max: 15, fallback: 6 });
const READ_SEC = Math.round(parseBounded(query.get("read"), { min: 0, max: 120, fallback: 60 }));
const ARRIVAL_MS = 1600;
const CHECKING_MIN_MS = 1100;
const CODE_KEY = "shortlisted-demo-code";
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const MODES = {
  live: ["AI aktif", "Peserta dan rapor ditulis model AI."],
  mock: ["Mode simulasi", "Peserta dan rapor memakai aturan sederhana, bukan AI."],
  fallback: ["AI bermasalah, memakai simulasi", "Model AI tidak tersedia sesaat, jadi aturan sederhana dipakai."],
};

const $ = (id) => document.getElementById(id);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

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
      /* kept in memory for this page load only */
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

let accessCode = store.get();
let accessRequired = false;
const access = Object.freeze({
  required: () => accessRequired,
  get: () => accessCode,
  set: (value) => {
    accessCode = value;
    store.set(value);
  },
  clear: () => {
    accessCode = "";
    store.clear();
  },
});

const api = createApiClient({ getAccessCode: () => accessCode });
const sounds = createSounds();
const notifier = createNotifier($("notifications"), sounds);
let onVoiceStatus = () => {};
const voice = createVoiceEngine({ getAccessCode: () => accessCode, onStatus: (status) => onVoiceStatus(status) });
const camera = createCamera();

let app = Object.freeze({ name: "Kandidat", lastOutcome: null, lastCompanyId: null });

function setMode(mode) {
  const [label, title] = MODES[mode] ?? MODES.mock;
  $("mb-mode").hidden = false;
  $("mb-mode").textContent = label;
  $("mb-mode").title = title;
}

const setMenuApp = (name) => ($("mb-app").textContent = name);

const clockFormat = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
function tickClock() {
  $("mb-clock").textContent = clockFormat.format(Date.now()).replace(/,/g, "");
}

// Opening any email means the applicant has seen the news, so the banners can go.
const mail = createMail({ onAction, onOpen: () => notifier.clear() });
const meet = createMeet({ api, voice, camera, sounds, access, onMode: setMode });
onVoiceStatus = meet.voiceStatus;

function deliver(email) {
  tickClock();
  mail.add(email);
  notifier.show({ app: "Kotak Masuk", title: email.from.name, body: email.subject, onOpen: () => mail.open(email.id) });
}

async function startMeeting(companyId, origin) {
  if (meet.isOpen()) return;
  const company = COMPANIES[companyId];
  notifier.clear();
  setMenuApp("Shortlisted Meet");
  const outcome = await meet.open({ company, caseData: findCase(company.caseId), name: app.name, minutes: MINUTES, readSec: READ_SEC, origin });
  setMenuApp("Kotak Masuk");
  if (!outcome) return;
  app = Object.freeze({ ...app, name: displayName(outcome.name ?? app.name), lastOutcome: outcome, lastCompanyId: companyId });
  await sendResult();
}

// The rapor travels by email: the inbox checks for mail while the assessor scores, then it lands.
async function sendResult() {
  const { lastOutcome: outcome, lastCompanyId: companyId, name } = app;
  if (!outcome || !companyId) return;
  mail.setStatus("Memeriksa email baru…");
  const started = Date.now();
  let email;
  if (!outcome.messages.some((m) => m.speaker === "you")) {
    email = noSpeechResultEmail({ companyId, name, now: Date.now() });
  } else {
    try {
      const result = await api.score({ caseId: COMPANIES[companyId].caseId, messages: outcome.messages, elapsedSec: outcome.elapsedSec });
      setMode(result.mode);
      email = resultEmail({ result, companyId, name, now: Date.now() });
    } catch (error) {
      if (error.status === 401) access.clear();
      const hint = error.retryAfterSec ? ` Coba lagi dalam ${error.retryAfterSec} detik.` : "";
      email = failedResultEmail({ companyId, name, now: Date.now(), reason: `${error.message}${hint}` });
    }
  }
  await pause(Math.max(0, CHECKING_MIN_MS - (Date.now() - started)));
  mail.setStatus(null);
  deliver(email);
}

function onAction(action, email, button) {
  if (action === "join" || action === "rejoin") {
    startMeeting(email.companyId, button);
  } else if (action === "retry-score") {
    sendResult();
  } else if (action === "other-invite") {
    const otherId = otherCompanyId(email.companyId);
    const invite = mail.find((e) => e.kind === "invite" && e.companyId === otherId);
    if (invite) mail.open(invite.id);
    else deliver(inviteEmail(otherId, { name: app.name, now: Date.now(), readSec: READ_SEC, minutes: MINUTES }));
  }
}

async function begin(event) {
  event.preventDefault();
  sounds.unlock();
  app = Object.freeze({ ...app, name: displayName($("intro-name").value) });
  const intro = $("intro");
  if (!reduced()) {
    await intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: "ease-in", fill: "forwards" }).finished;
  }
  intro.hidden = true;
  $("desktop").inert = false;
  mail.setEmails(buildInbox({ name: app.name, now: Date.now() }).emails);
  const win = $("mail-window");
  win.hidden = false;
  if (!reduced()) win.animate([{ opacity: 0, transform: "translateY(10px) scale(0.98)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: EASE });
  $("mail-list").querySelector(".mail-row")?.focus({ preventScroll: true });
  await pause(ARRIVAL_MS);
  deliver(inviteEmail("arunika", { name: app.name, now: Date.now(), readSec: READ_SEC, minutes: MINUTES }));
}

async function init() {
  if (matchMedia("(max-width: 640px)").matches) $("intro-title").textContent = "Anggap ini HP-mu.";
  $("intro-form").addEventListener("submit", begin);
  tickClock();
  setInterval(tickClock, 15_000);
  $("intro-name").focus({ preventScroll: true });
  try {
    const status = await api.status();
    accessRequired = Boolean(status.accessCodeRequired);
    setMode(status.mode);
  } catch (error) {
    console.warn("status check failed:", error.message);
  }
}

init();
