// Optional voice input through the browser's built-in speech recognition (Chrome, Edge, Safari).
// Returns null where it is unsupported, so the UI can hide the microphone button.
// Note: Chrome sends the audio to its speech service; the demo server never receives audio.

export function createDictation({
  onText,
  onError,
  onEnd,
  lang = "id-ID",
  Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition,
}) {
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.lang = lang;
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const text = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(" ")
      .trim();
    if (text) onText(text);
  };
  recognition.onerror = (event) => onError(event.error);
  recognition.onend = () => onEnd();

  return Object.freeze({
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  });
}
