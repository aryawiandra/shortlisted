// Thin client for the demo API. Turns every failure into an ApiError with a message
// that is safe to show to the user.

export class ApiError extends Error {
  constructor(message, { status = 0, retryAfterSec = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

export function createApiClient({ fetchImpl = (...args) => fetch(...args), getAccessCode = () => "" } = {}) {
  async function request(path, { method = "POST", payload } = {}) {
    let response;
    try {
      response = await fetchImpl(path, {
        method,
        headers: { "Content-Type": "application/json", "x-demo-code": getAccessCode() },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    } catch {
      throw new ApiError("Tidak bisa terhubung. Periksa koneksi internetmu lalu coba lagi.");
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      // Non-JSON body (for example a platform error page): fall through to the generic message.
    }

    if (!response.ok) {
      throw new ApiError(data?.error ?? "Terjadi kesalahan. Coba lagi.", {
        status: response.status,
        retryAfterSec: Number(response.headers?.get?.("Retry-After")) || null,
      });
    }
    return data;
  }

  return Object.freeze({
    status: () => request("/api/status", { method: "GET" }),
    turn: (payload) => request("/api/turn", { payload }),
    score: (payload) => request("/api/score", { payload }),
  });
}
