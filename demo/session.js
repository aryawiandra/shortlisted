// One LGD meeting: the assessor's opening, the reading time, the discussion, and the close.
// It owns timing and turn-taking; meet.js owns the DOM and the microphone. State is
// replaced, never mutated, and every change is pushed to onChange.

import {
  ASSESSOR,
  DISCUSSION_START,
  assessorClosing,
  assessorOpening,
  nudgeLine,
  shouldNudge,
  transcriptForApi,
} from "./meeting-plan.js";

const GAP_MS = 380;
const TICK_MS = 1000;
const MAX_TEXT = 600;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createSession({ caseId, name, minutes, readSec, api, voice, onChange, onEnd, onAuthError }) {
  const totalSec = Math.round(minutes * 60);
  let state = Object.freeze({
    phase: "opening", // opening | reading | discussion | closing | ended
    sharing: false,
    remainingSec: totalSec,
    readLeft: readSec,
    messages: Object.freeze([]),
    speaker: null,
    caption: null,
    listening: false,
    busy: false,
    thinking: false,
    error: null,
    canRetry: false,
    mode: null,
  });
  let turnToken = 0;
  let nudgesUsed = 0;
  let lastActivityAt = Date.now();
  let timer = null;
  let ended = false;
  let openingReplies = null;

  const set = (patch) => {
    state = Object.freeze({ ...state, ...patch });
    onChange(state);
  };
  const elapsedSec = () => totalSec - state.remainingSec;
  const live = () => !ended && state.phase !== "closing";

  async function say(speaker, text) {
    set({ messages: Object.freeze([...state.messages, Object.freeze({ speaker, text })]), speaker, caption: Object.freeze({ speaker, text }) });
    const finished = await voice.speak(speaker, text);
    if (state.speaker === speaker) set({ speaker: null });
    lastActivityAt = Date.now();
    return finished;
  }

  const fetchTurn = () => api.turn({ caseId, messages: transcriptForApi(state.messages), elapsedSec: elapsedSec() });

  function stopAll() {
    ended = true;
    clearInterval(timer);
    turnToken += 1;
    voice.cancel();
  }

  function handleError(error) {
    if (error.status === 401) {
      stopAll();
      onAuthError(error.message);
      return;
    }
    const hint = error.retryAfterSec ? ` Coba lagi dalam ${error.retryAfterSec} detik.` : "";
    set({ busy: false, error: `${error.message}${hint}`, canRetry: true });
  }

  // Speaks the participants' replies in order. A newer turn (the applicant talking again)
  // silently drops whatever is left of this one.
  async function respond(pending = null) {
    const token = ++turnToken;
    set({ busy: true, thinking: true, error: null, canRetry: false });
    let data;
    try {
      data = await (pending ?? fetchTurn());
    } catch (error) {
      if (token === turnToken && live()) {
        set({ thinking: false });
        handleError(error);
      }
      return;
    }
    if (token !== turnToken || state.phase !== "discussion" || ended) return;
    set({ mode: data.mode, thinking: false });
    for (const [index, reply] of data.replies.entries()) {
      if (index > 0) await pause(GAP_MS);
      if (token !== turnToken || state.phase !== "discussion" || state.listening || ended) return;
      await say(reply.speaker, reply.text);
    }
    if (token === turnToken) set({ busy: false });
  }

  async function beginDiscussion() {
    if (!live() || state.phase === "discussion") return;
    set({ phase: "discussion", sharing: false, readLeft: 0, caption: null });
    await say(ASSESSOR.id, DISCUSSION_START);
    if (!live()) return;
    lastActivityAt = Date.now();
    const pending = openingReplies;
    openingReplies = null;
    await respond(pending);
  }

  function tick() {
    if (!live()) return;
    if (state.phase === "reading") {
      const readLeft = state.readLeft - 1;
      if (readLeft <= 0) beginDiscussion();
      else set({ readLeft });
      return;
    }
    if (state.phase !== "discussion") return;
    const remainingSec = state.remainingSec - 1;
    if (remainingSec <= 0) {
      set({ remainingSec: 0 });
      finish("time");
      return;
    }
    set({ remainingSec });
    const idle = { phase: state.phase, busy: state.busy, speaking: Boolean(state.speaker), listening: state.listening, nudgesUsed, lastActivityAt, now: Date.now() };
    if (shouldNudge(idle)) {
      const line = nudgeLine({ messages: state.messages, name, nudgeIndex: nudgesUsed });
      nudgesUsed += 1;
      say(line.speaker, line.text);
    }
  }

  async function start() {
    // Fetch the participants' opening while the assessor talks; a bad passcode surfaces now.
    openingReplies = fetchTurn();
    openingReplies.catch((error) => {
      if (error.status === 401 && !ended) handleError(error);
    });
    timer = setInterval(tick, TICK_MS);
    const [greeting, ...rest] = assessorOpening({ name, readSec, minutes });
    await say(ASSESSOR.id, greeting);
    if (!live()) return;
    set({ sharing: true });
    for (const line of rest) {
      await pause(GAP_MS);
      if (!live() || state.phase !== "opening") return;
      await say(ASSESSOR.id, line);
    }
    if (!live() || state.phase !== "opening") return;
    if (readSec > 0) set({ phase: "reading", readLeft: readSec, caption: null });
    else beginDiscussion();
  }

  function sendText(raw) {
    const text = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (!text || state.phase !== "discussion" || !live()) return false;
    voice.cancel();
    turnToken += 1;
    set({
      messages: Object.freeze([...state.messages, Object.freeze({ speaker: "you", text })]),
      listening: false,
      speaker: null,
      caption: Object.freeze({ speaker: "you", text }),
      error: null,
      canRetry: false,
    });
    lastActivityAt = Date.now();
    respond();
    return true;
  }

  function startListening() {
    if (state.phase !== "discussion" || !live() || state.listening) return false;
    voice.cancel();
    turnToken += 1;
    set({ listening: true, busy: false, thinking: false, speaker: "you", caption: Object.freeze({ speaker: "you", text: "", interim: true }) });
    return true;
  }

  const heard = (text) => state.listening && set({ caption: Object.freeze({ speaker: "you", text, interim: true }) });
  const stopListening = () => state.listening && set({ listening: false, speaker: null, caption: null });

  async function finish(reason) {
    if (!live()) return;
    clearInterval(timer);
    turnToken += 1;
    voice.cancel();
    set({ phase: "closing", sharing: false, busy: false, thinking: false, listening: false, error: null, canRetry: false });
    if (reason === "time") await say(ASSESSOR.id, assessorClosing({ name }));
    ended = true;
    set({ phase: "ended", speaker: null });
    onEnd(Object.freeze({ messages: transcriptForApi(state.messages), elapsedSec: elapsedSec(), reason }));
  }

  return Object.freeze({
    start,
    skipReading: () => state.phase === "reading" && beginDiscussion(),
    sendText,
    startListening,
    heard,
    stopListening,
    retry: () => state.canRetry && respond(),
    leave: () => finish("leave"),
    destroy: stopAll,
    getState: () => state,
  });
}
