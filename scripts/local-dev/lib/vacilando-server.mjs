#!/usr/bin/env node
/**
 * Vacilando Runtime — local control-plane server.
 *
 * A loopback-only (127.0.0.1) HTTP + SSE surface over the runtime projections.
 * It binds nothing externally reachable, never auto-starts, and serves the
 * Command Center SPA as a pure presentation layer that binds to `/api/state`.
 *
 * READ-ONLY in Phase 1: there is no command endpoint yet. The server projects;
 * it does not mutate. (The command allowlist is Phase 1's next increment and is
 * deliberately not present here — nothing can change state through this port.)
 *
 * Endpoints:
 *   GET /api/health   → liveness + schema
 *   GET /api/state    → the full Command Center snapshot
 *   GET /api/events   → SSE stream; a `snapshot` frame on connect and each tick
 *   GET /             → the SPA shell (static, path-traversal safe)
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { composeSnapshot } from "./vacilando/compose.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const LOOPBACK_HOST = "127.0.0.1";
const PUBLIC_DIR = resolve(HERE, "..", "apps", "vacilando", "public");
const DEFAULT_PORT = 3020;
const TICK_MS = 4000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  res.end(body);
}

function serveStatic(res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const full = normalize(join(PUBLIC_DIR, rel));
  if (!full.startsWith(PUBLIC_DIR)) {
    // Path traversal — fail closed to the shell.
    return serveStatic(res, "/");
  }
  if (!existsSync(full) || !statSync(full).isFile()) {
    if (rel !== "index.html") return serveStatic(res, "/"); // SPA fallback
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Vacilando SPA shell missing");
  }
  res.writeHead(200, { "Content-Type": MIME[extname(full)] || "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(full).pipe(res);
}

/**
 * Single-flight snapshot cache. A full projection spawns ~11 short-lived child
 * processes (alloy-ro ×4 + git log ×6); letting every request and every SSE
 * tick launch its own compose concurrently starves the machine and trips the
 * exec timeout. So: at most ONE compose runs at a time, its result is shared by
 * all waiters, and a short TTL collapses bursts into a single recompute.
 */
const CACHE_TTL_MS = 2500;
const cache = { at: 0, snap: null, inflight: null };

async function getSnapshot({ maxAgeMs = CACHE_TTL_MS } = {}) {
  const now = Date.now();
  if (cache.snap && now - cache.at < maxAgeMs) return cache.snap;
  if (cache.inflight) return cache.inflight;
  cache.inflight = composeSnapshot()
    .then((s) => { cache.snap = s; cache.at = Date.now(); cache.inflight = null; return s; })
    .catch((e) => {
      cache.inflight = null;
      if (cache.snap) return cache.snap; // serve last-good rather than an empty frame
      return { schema_version: "vacilando.snapshot.v1", error: `projection failed: ${String(e.message || e)}`, headline: null, sprints: [], workers: [], approvals: { total: 0, counts: {} }, activity: [], gaps: [], project: {} };
    });
  return cache.inflight;
}
const snapshotSafe = () => getSnapshot();

export function createVacilandoServer() {
  const clients = new Set();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${LOOPBACK_HOST}`);
    const path = url.pathname;

    if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });

    if (path === "/api/health") {
      return sendJson(res, 200, { ok: true, schema: "vacilando.snapshot.v1", server: "vacilando", host: LOOPBACK_HOST });
    }
    if (path === "/api/state" || path === "/api/snapshot") {
      return sendJson(res, 200, await snapshotSafe());
    }
    if (path === "/api/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      const snap = await snapshotSafe();
      res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (path.startsWith("/api/")) return sendJson(res, 404, { error: "unknown_endpoint" });

    return serveStatic(res, path);
  });

  // Live push: re-project on a fixed tick and broadcast to SSE listeners.
  const timer = setInterval(async () => {
    if (clients.size === 0) return;
    const snap = await snapshotSafe();
    const frame = `event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`;
    for (const res of clients) {
      try {
        res.write(frame);
      } catch {
        clients.delete(res);
      }
    }
  }, TICK_MS);
  timer.unref?.();

  return { server, clients, close: () => { clearInterval(timer); server.close(); } };
}

export function startVacilandoServer(port = DEFAULT_PORT) {
  const { server, close } = createVacilandoServer();
  return new Promise((res, rej) => {
    server.once("error", rej);
    server.listen(port, LOOPBACK_HOST, () => res({ server, close, port }));
  });
}

// Direct invocation: `node lib/vacilando-server.mjs [--port N]`
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const pIdx = process.argv.indexOf("--port");
  const port = pIdx > -1 ? Number(process.argv[pIdx + 1]) : DEFAULT_PORT;
  startVacilandoServer(port).then(({ port }) => {
    process.stdout.write(`Vacilando Runtime → http://${LOOPBACK_HOST}:${port}  (loopback only, read-only, Ctrl-C to stop)\n`);
  }).catch((e) => {
    process.stderr.write(`failed to bind ${LOOPBACK_HOST}:${port}: ${e.message}\n`);
    process.exit(1);
  });
}
