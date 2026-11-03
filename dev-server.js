// Local dev server: serves the static site and mounts /api/* the way Vercel does.
// Usage: npm run dev  (reads .env if present; without a key the demo runs in simulation mode)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
try {
  process.loadEnvFile(join(ROOT, ".env"));
} catch {
  // No .env: simulation mode.
}

const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 100_000;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

const handlers = {
  turn: (await import("./api/turn.js")).default,
  score: (await import("./api/score.js")).default,
  status: (await import("./api/status.js")).default,
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    // Oversized bodies are drained and discarded (not stored), then rejected, so the
    // client receives a clean 413 instead of a dropped connection.
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on("end", () => (size > MAX_BODY_BYTES ? reject(new Error("too large")) : resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

function withVercelHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

async function serveApi(name, req, res) {
  withVercelHelpers(res);
  try {
    req.body = req.method === "POST" ? await readBody(req) : undefined;
  } catch {
    return res.status(413).json({ error: "Request too large." });
  }
  return handlers[name](req, res);
}

async function serveStatic(pathname, res) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const relative = clean.endsWith("/") ? `${clean}index.html` : clean;
  const hidden = relative.split(/[/\\]/).some((part) => part.startsWith(".") && part !== "") || relative.includes("node_modules");
  if (hidden) {
    res.writeHead(404).end("Not found");
    return;
  }
  try {
    const file = await readFile(join(ROOT, relative));
    res.writeHead(200, { "Content-Type": TYPES[extname(relative)] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  const apiName = pathname.match(/^\/api\/(\w+)$/)?.[1];
  if (apiName && handlers[apiName]) return serveApi(apiName, req, res);
  if (pathname === "/demo") {
    res.writeHead(301, { Location: "/demo/" }).end();
    return;
  }
  return serveStatic(pathname, res);
}).listen(PORT, () => console.log(`Shortlisted dev server: http://localhost:${PORT}  (demo at /demo/)`));
