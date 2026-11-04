import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createSynthesizer } from "../lib/tts.js";

const LINE = { voice: "id-ID-GadisNeural", rate: "+0%", pitch: "+0Hz" };

// A fake Edge client: each toStream emits ~300 bytes of "audio", or fails when told to.
function fakeEngine({ failTimes = 0 } = {}) {
  const made = [];
  let failures = failTimes;
  class Engine {
    constructor() {
      this.metadata = [];
      this.spoken = [];
      this.closed = false;
      made.push(this);
    }
    async setMetadata(voice) {
      this.metadata.push(voice);
    }
    toStream(text) {
      this.spoken.push(text);
      const audioStream = new PassThrough();
      setTimeout(() => {
        if (failures > 0) {
          failures -= 1;
          audioStream.destroy(new Error("socket hang up"));
          return;
        }
        audioStream.end(Buffer.alloc(300, 1));
      }, 0);
      audioStream.on("end", () => audioStream.emit("close"));
      return { audioStream };
    }
    close() {
      this.closed = true;
    }
  }
  return { Engine, made };
}

test("lines for the same voice reuse one warm connection", async () => {
  const { Engine, made } = fakeEngine();
  const synth = createSynthesizer({ Engine, now: () => 0 });
  await synth({ ...LINE, text: "Satu." });
  await synth({ ...LINE, text: "Dua." });
  assert.equal(made.length, 1);
  assert.deepEqual(made[0].metadata, ["id-ID-GadisNeural"]);
  assert.deepEqual(made[0].spoken, ["Satu.", "Dua."]);
});

test("different voices get their own connections", async () => {
  const { Engine, made } = fakeEngine();
  const synth = createSynthesizer({ Engine, now: () => 0 });
  await Promise.all([synth({ ...LINE, text: "A" }), synth({ ...LINE, voice: "id-ID-ArdiNeural", text: "B" })]);
  assert.equal(made.length, 2);
});

test("a connection left idle too long is replaced instead of reused", async () => {
  const { Engine, made } = fakeEngine();
  let clock = 0;
  const synth = createSynthesizer({ Engine, now: () => clock, idleMs: 20_000 });
  await synth({ ...LINE, text: "Satu." });
  clock = 25_000;
  await synth({ ...LINE, text: "Dua." });
  assert.equal(made.length, 2);
  assert.equal(made[0].closed, true);
});

test("a failed line is retried once on a fresh connection", async () => {
  const { Engine, made } = fakeEngine({ failTimes: 1 });
  const synth = createSynthesizer({ Engine, now: () => 0 });
  const audio = await synth({ ...LINE, text: "Coba lagi." });
  assert.equal(audio.length, 300);
  assert.equal(made.length, 2);
  assert.equal(made[0].closed, true);
});

test("gives up after the retry and surfaces the error", async () => {
  const { Engine } = fakeEngine({ failTimes: 5 });
  const synth = createSynthesizer({ Engine, now: () => 0 });
  await assert.rejects(synth({ ...LINE, text: "Gagal." }), /socket hang up/);
});

test("text is escaped and '&' is spoken as 'dan'", async () => {
  const { Engine, made } = fakeEngine();
  const synth = createSynthesizer({ Engine, now: () => 0 });
  await synth({ ...LINE, text: "Budi & Sinta <6 hari>" });
  assert.equal(made[0].spoken[0], "Budi dan Sinta &lt;6 hari&gt;");
});
