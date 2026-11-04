// Optional voice input through the browser's built-in speech recognition (Chrome, Edge, Safari).
// Returns null where it is unsupported, so the UI can fall back to typing.
// Push-to-talk: start() when the applicant presses, stop() when they let go. Live words go
// to onInterim for the caption; the final text arrives once, in onText, after stop().
// Note: the browser may send audio to its own speech service; the demo server never receives audio.

export function createDictation({
  onText,
  onInterim = () => {},
  onError,
  onEnd = () => {},
  lang = "id-ID",
  Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition,
}) {
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.lang = lang;
  recognition.interimResults = true;
  recognition.continuous = true;

  let finalText = "";
  let heard = "";
  let active = false;

  recognition.onresult = (event) => {
    let interim = "";
    let finals = "";
    for (const result of Array.from(event.results)) {
      if (result.isFinal) finals += ` ${result[0].transcript}`;
      else interim += ` ${result[0].transcript}`;
    }
    finalText = finals.replace(/\s+/g, " ").trim();
    heard = `${finals} ${interim}`.replace(/\s+/g, " ").trim();
    onInterim(heard);
  };
  recognition.onerror = (event) => {
    if (event.error !== "aborted") onError(event.error);
  };
  // A quick release can end recognition before the last words turn final; keep what was heard.
  recognition.onend = () => {
    active = false;
    const text = finalText || heard;
    finalText = "";
    heard = "";
    if (text) onText(text);
    onEnd();
  };

  return Object.freeze({
    start: () => {
      if (active) return;
      active = true;
      finalText = "";
      try {
        recognition.start();
      } catch (error) {
        active = false;
        onError(error?.name === "InvalidStateError" ? "busy" : "start-failed");
      }
    },
    stop: () => {
      if (active) recognition.stop();
    },
    abort: () => {
      finalText = "";
      heard = "";
      if (active) recognition.abort();
    },
    isActive: () => active,
  });
}
