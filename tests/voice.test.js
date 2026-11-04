import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceEngine, estimateSpeechMs, ttsUrl } from "../demo/voice.js";

const noSleep = () => Promise.resolve();

// Plays instantly and ends on the next tick, unless told to hang until paused.
function fakeAudioClass({ hang = false } = {}) {
  return class FakeAudio {
    constructor() {
      this.src = "";
      this.volume = 1;
      this.paused = true;
      FakeAudio.instances.push(this);
    }
    play() {
      this.paused = false;
      if (!hang) setTimeout(() => this.onended?.(), 0);
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    static instances = [];
  };
}

function fakeFetch({ fail = false } = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    if (fail) return new Response(JSON.stringify({ error: "x" }), { status: 502 });
    return new Response(new Uint8Array([0xff, 0xf3, 1]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  };
  return { impl, calls };
}

test("ttsUrl names the speaker and encodes the text", () => {
  assert.equal(ttsUrl("raka", "Halo & selamat?"), "/api/tts?s=raka&t=Halo+%26+selamat%3F");
});

test("estimateSpeechMs grows with length and stays within bounds", () => {
  assert.ok(estimateSpeechMs("Oke.") >= 1200);
  assert.ok(estimateSpeechMs("kata ".repeat(40)) > estimateSpeechMs("kata ".repeat(5)));
  assert.ok(estimateSpeechMs("kata ".repeat(500)) <= 12000);
});

test("speak fetches the line, starts on play, and resolves true when it ends", async () => {
  const fetch = fakeFetch();
  let started = 0;
  const voice = createVoiceEngine({ fetchImpl: fetch.impl, AudioCtor: fakeAudioClass(), getAccessCode: () => "kode", sleep: noSleep });
  const finished = await voice.speak("sinta", "Datanya mana?", { onStart: () => (started += 1) });
  assert.equal(finished, true);
  assert.equal(started, 1);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, ttsUrl("sinta", "Datanya mana?"));
  assert.equal(fetch.calls[0].options.headers["x-demo-code"], "kode");
});

test("prefetch and speak share one request for the same line", async () => {
  const fetch = fakeFetch();
  const voice = createVoiceEngine({ fetchImpl: fetch.impl, AudioCtor: fakeAudioClass(), sleep: noSleep });
  voice.prefetch("ayu", "Kita gabung saja?");
  await voice.speak("ayu", "Kita gabung saja?");
  assert.equal(fetch.calls.length, 1);
});

test("cancel cuts the current line off and resolves false", async () => {
  const Audio = fakeAudioClass({ hang: true });
  const voice = createVoiceEngine({ fetchImpl: fakeFetch().impl, AudioCtor: Audio, sleep: noSleep });
  let resolveStarted;
  const started = new Promise((resolve) => (resolveStarted = resolve));
  const speaking = voice.speak("raka", "Sudahlah, sewa truk saja.", { onStart: resolveStarted });
  await started;
  voice.cancel();
  assert.equal(await speaking, false);
  assert.ok(Audio.instances.every((a) => a.paused));
});

test("when the voice server fails, the line still starts and the failure is reported once", async () => {
  const statuses = [];
  const voice = createVoiceEngine({ fetchImpl: fakeFetch({ fail: true }).impl, AudioCtor: fakeAudioClass(), sleep: noSleep, onStatus: (s) => statuses.push(s) });
  let started = 0;
  assert.equal(await voice.speak("dimas", "Mungkin kita mulai dari yang bisa dikerjakan.", { onStart: () => (started += 1) }), true);
  await voice.speak("dimas", "Baris lain.");
  assert.equal(started, 1);
  assert.deepEqual(statuses, ["unavailable"]);
});

test("after two failures in a row the meeting stops calling the voice server", async () => {
  const fetch = fakeFetch({ fail: true });
  const voice = createVoiceEngine({ fetchImpl: fetch.impl, AudioCtor: fakeAudioClass(), sleep: noSleep });
  for (const line of ["Satu.", "Dua.", "Tiga.", "Empat."]) await voice.speak("raka", line);
  assert.equal(fetch.calls.length, 2);
  await voice.reset(); // a new meeting tries again
  await voice.speak("raka", "Lima.");
  assert.equal(fetch.calls.length, 3);
});

test("a voice request that hangs is abandoned and the line goes on", async () => {
  const hanging = (_url, { signal }) =>
    new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const voice = createVoiceEngine({ fetchImpl: hanging, AudioCtor: fakeAudioClass(), sleep: noSleep, fetchTimeoutMs: 20 });
  let started = false;
  assert.equal(await voice.speak("ayu", "Halo.", { onStart: () => (started = true) }), true);
  assert.equal(started, true);
});

test("with voices off, nothing is fetched and lines still keep their timing", async () => {
  const fetch = fakeFetch();
  const voice = createVoiceEngine({ fetchImpl: fetch.impl, AudioCtor: fakeAudioClass(), sleep: noSleep });
  voice.setEnabled(false);
  let started = false;
  assert.equal(await voice.speak("raka", "Halo.", { onStart: () => (started = true) }), true);
  voice.prefetch("raka", "Halo lagi.");
  assert.equal(started, true);
  assert.equal(fetch.calls.length, 0);
});
