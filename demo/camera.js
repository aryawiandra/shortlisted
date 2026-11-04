// Optional self-view. The camera is asked for only when the applicant turns it on, the video
// stays on this page (never recorded, never sent), and the tracks stop when the meeting ends.

export function createCamera({ media = globalThis.navigator?.mediaDevices } = {}) {
  let stream = null;
  const supported = Boolean(media?.getUserMedia);

  async function start() {
    if (!supported) throw new Error("Browser ini tidak mendukung kamera.");
    if (stream) return stream;
    try {
      stream = await media.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
      return stream;
    } catch (error) {
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      throw new Error(denied ? "Izin kamera ditolak. Kamu tetap bisa ikut tanpa kamera." : "Kamera tidak bisa dibuka. Mungkin sedang dipakai aplikasi lain.");
    }
  }

  function stop() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  return Object.freeze({ supported, start, stop, isOn: () => Boolean(stream), stream: () => stream });
}
