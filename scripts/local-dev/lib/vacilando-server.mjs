#!/usr/bin/env node
/**
 * Vacilando Runtime — local control-plane server.
 *
 * A loopback-only (127.0.0.1) HTTP + SSE surface over the runtime projections.
 * It binds nothing externally reachable, never auto-starts, and serves the
 * Command Center SPA as a pure presentation layer that binds to `/api/state`.
 *
 * Reads are projections; writes go ONLY through the fail-closed command
 * registry (executor), which wraps existing alloy-* tooling — no shell, no
 * request-supplied paths, consequential actions preview→confirm.
 *
 * Endpoints:
 *   GET  /api/health          → liveness + schema
 *   GET  /api/state           → the full Command Center snapshot
 *   GET  /api/events          → SSE stream; a `snapshot` frame on connect + tick
 *   GET  /api/commands        → the registered command catalog (+ unsupported)
 *   GET  /api/audit           → recent execution audit events
 *   POST /api/commands/preview→ resolve+evaluate+preview a command (never runs)
 *   POST /api/commands        → confirm+execute a command through the registry
 *   GET  /                    → the SPA shell (static, path-traversal safe)
 */
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { composeSnapshot } from "./vacilando/compose.mjs";
import { runCommand } from "./vacilando/commands/executor.mjs";
import { listCommands } from "./vacilando/commands/registry.mjs";
import { readAuditEvents } from "./vacilando/commands/audit.mjs";
import { collectResources } from "./vacilando/resources.mjs";
import { workerOutputs, evidenceFilePath } from "./vacilando/outputs.mjs";
import { readDirectorLog, recordAsk } from "./vacilando/commands/director.mjs";
import { createRequest, updateRequest, readRequests, pendingCount, recoverInterrupted, REQUEST_TYPES } from "./vacilando/commands/director-requests.mjs";
import { sendViaProvider } from "./vacilando/provider-runtime.mjs";
import { writeAuditEvent } from "./vacilando/commands/audit.mjs";
import { computeCloseout } from "./vacilando/closeout.mjs";
import { prForWorktree } from "./vacilando/github.mjs";
import { collectPolicies } from "./vacilando/policies.mjs";
import { collectUsage } from "./vacilando/usage.mjs";
import { getProviderRuntime } from "./vacilando/provider-runtime.mjs";
import { computeReclaim, memoryPressure, runningDevServers } from "./vacilando/memory-manager.mjs";
import { schedule } from "./vacilando/scheduler.mjs";
import { readReviews } from "./vacilando/commands/review.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const LOOPBACK_HOST = "127.0.0.1";
const PUBLIC_DIR = resolve(HERE, "..", "apps", "vacilando", "public");
const DEFAULT_PORT = 3020;
// A full projection costs ~6–8s (dominated by git ahead/behind across worktrees).
// Serve from a single-flight cache with a matching TTL and background tick so
// requests are instant and the machine never runs overlapping composes.
const TICK_MS = 10000;
const MEMORY_TICK_MS = 45000; // memory measure + idle-server auto-reclaim cadence

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".log": "text/plain; charset=utf-8",
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  res.end(body);
}

/** Map a command lifecycle outcome to an HTTP status. */
function statusForStage(out) {
  switch (out.code) {
    case "unknown_command": return 404;
    case "unsupported": return 400;
    case "invalid_input": return 400;
    case "ineligible": return 409;
    case "confirmation_required": return 428; // Precondition Required
    case "binary_missing": return 500;
    default: break;
  }
  if (out.stage === "execute") return 200; // executed; result.ok reflects the toolkit exit
  return 400;
}

/** Build id from the SPA assets' size+mtime — changes whenever a file changes,
 *  so versioned asset URLs bust the browser cache automatically. */
function assetBuildId() {
  let s = "";
  for (const f of ["app.js", "styles.css", "index.html"]) {
    try { const st = statSync(join(PUBLIC_DIR, f)); s += `${f}:${st.size}:${Math.round(st.mtimeMs)};`; } catch {}
  }
  return createHash("sha1").update(s).digest("hex").slice(0, 10);
}

function serveStatic(res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const full = normalize(join(PUBLIC_DIR, rel));
  if (!full.startsWith(PUBLIC_DIR)) return serveStatic(res, "/"); // path traversal → shell
  if (!existsSync(full) || !statSync(full).isFile()) {
    if (rel !== "index.html") return serveStatic(res, "/"); // SPA fallback
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Vacilando SPA shell missing");
  }
  // The shell is rewritten to version its asset URLs, and is always no-store,
  // so a fresh page load can never run a stale app.js/styles.css.
  if (rel === "index.html") {
    const v = assetBuildId();
    let html = readFileSync(full, "utf8")
      .replace(/(src|href)="(app\.js|styles\.css)"/g, `$1="$2?v=${v}"`);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, must-revalidate", "X-Vacilando-Build": v });
    return res.end(html);
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
const CACHE_TTL_MS = 8000;
const cache = { at: 0, snap: null, inflight: null };

async function getSnapshot({ maxAgeMs = CACHE_TTL_MS } = {}) {
  const now = Date.now();
  if (cache.snap && now - cache.at < maxAgeMs) return cache.snap;
  if (cache.inflight) return cache.inflight;
  cache.inflight = composeSnapshot()
    .then((s) => {
      cache.inflight = null;
      // Resilience: a memory-starved host can make alloy-ro time out, yielding a
      // 0-sprint projection. Never let that transient empty frame blank a board we
      // just had — keep the last-good snapshot and mark it degraded instead.
      if ((!s.sprints || s.sprints.length === 0) && cache.snap?.sprints?.length > 0) {
        return { ...cache.snap, degraded: true, degraded_note: "Projection timed out (host under memory pressure) — showing last known workers." };
      }
      cache.snap = s; cache.at = Date.now(); return s;
    })
    .catch((e) => {
      cache.inflight = null;
      if (cache.snap) return cache.snap; // serve last-good rather than an empty frame
      return { schema_version: "vacilando.snapshot.v1", error: `projection failed: ${String(e.message || e)}`, headline: null, sprints: [], workers: [], approvals: { total: 0, counts: {} }, activity: [], gaps: [], project: {} };
    });
  return cache.inflight;
}
const snapshotSafe = () => getSnapshot();
/** Force a fresh projection (bypass TTL) and update the cache. Used after a command. */
const forceSnapshot = () => getSnapshot({ maxAgeMs: 0 });

/**
 * Resolve a slot's worker from the snapshot, falling back to the slot metadata
 * env file when the full projection is starved (host thrashing → thin snapshot).
 * Lets closeout/send keep working when the dashboard board is momentarily empty.
 */
function sprintFromMetadata(slot) {
  try {
    const dir = join(process.env.HOME, ".local", "state", "alloy-dev", "metadata");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".env"))) {
      const t = readFileSync(join(dir, f), "utf8");
      const g = (k) => (t.match(new RegExp(`^${k}="?([^"\n]*)"?`, "m")) || [])[1] || null;
      if (Number(g("ALLOY_WORKTREE_SLOT")) === slot) {
        const branch = g("ALLOY_WORKTREE_BRANCH");
        const provider = branch ? (branch.match(/^agent\/([^/]+)\//) || [])[1] : null;
        return { slot, worktree: g("ALLOY_WORKTREE_NAME"), branch, provider, port: Number(g("PORT")) || null };
      }
    }
  } catch { /* none */ }
  return null;
}
const resolveSprint = (snap, slot) => (snap?.sprints || []).find((s) => s.slot === slot) || sprintFromMetadata(slot);

/** Assemble the (usage, worker-count) inputs the Provider Runtime needs, keyed by provider id. */
function providerRuntimeInputs(snap, usage) {
  const usageByProvider = {};
  for (const p of (usage || collectUsage()).providers || []) usageByProvider[p.provider] = p;
  const workersByProvider = {};
  for (const s of snap?.sprints || []) { if (s.provider) workersByProvider[s.provider] = (workersByProvider[s.provider] || 0) + 1; }
  return { usageByProvider, workersByProvider };
}

/** Resources are OS reads (incl. a bounded `du`); cache briefly so the board is snappy. */
const resCache = { at: 0, data: null, inflight: null };
async function resourcesCached() {
  const now = Date.now();
  if (resCache.data && now - resCache.at < 8000) return resCache.data;
  if (resCache.inflight) return resCache.inflight;
  resCache.inflight = collectResources()
    .then((d) => { resCache.data = d; resCache.at = Date.now(); resCache.inflight = null; return d; })
    .catch((e) => { resCache.inflight = null; return resCache.data || { workers: [], overall: {}, error: String(e.message || e) }; });
  return resCache.inflight;
}

/**
 * Memory Manager — Vacilando actively manages the memory it CAN: idle worker
 * dev servers. Auto-reclaim is idle-only (never touches an active slot), fires
 * only when the host is genuinely thrashing, has a per-slot cooldown, and is
 * fully audited (via the governed server.stop command). Toggle in policy.
 */
const MEMORY_POLICY = { auto_reclaim: true, swap_pct: 0.85, cooldown_ms: 180000 };
let lastReclaim = { servers: [], reclaimable_mb: 0, idle_count: 0, heavy_active: [], total_server_mb: 0, pressure: null, auto_actions: [] };
const reclaimCooldown = new Map(); // slot -> last-reclaim ts

async function refreshMemory({ act = false } = {}) {
  const snap = await snapshotSafe();
  const [reclaim, pressure] = await Promise.all([computeReclaim(snap), memoryPressure(MEMORY_POLICY)]);
  const auto_actions = [];
  if (act && MEMORY_POLICY.auto_reclaim && pressure.thrashing) {
    for (const s of reclaim.servers.filter((x) => x.reclaimable)) {
      const last = reclaimCooldown.get(s.slot) || 0;
      if (Date.now() - last < MEMORY_POLICY.cooldown_ms) continue;
      reclaimCooldown.set(s.slot, Date.now());
      try {
        const out = await runCommand({ command: "server.stop", input: { slot: s.slot }, confirm: true, actor: "vacilando-memory" }, { snapshot: snap, refresh: forceSnapshot });
        const ok = out?.ok !== false && (out?.result?.exit === 0 || out?.result?.data?.ok !== false);
        auto_actions.push({ slot: s.slot, freed_mb: s.rss_mb, ok, at: new Date().toISOString() });
      } catch (e) { auto_actions.push({ slot: s.slot, freed_mb: s.rss_mb, ok: false, error: String(e.message || e) }); }
    }
  }
  lastReclaim = { ...reclaim, pressure, policy: MEMORY_POLICY, auto_actions: auto_actions.length ? auto_actions : lastReclaim.auto_actions?.slice?.(0, 10) || [] };
  return lastReclaim;
}

/**
 * Director async send: run a durable request's provider turn in the background
 * and update its record through the lifecycle. The browser never waits on this —
 * it created the record (Queued) and polls /api/director/requests for status.
 */
const QUICK_TIMEOUT_MS = 60000;
const INSTRUCTION_TIMEOUT_MS = 600000; // 10 min for a worker instruction
function runDirectorSend(reqRec, sprint) {
  const t0 = Date.now();
  const timeout = reqRec.request_type === "quick-ask" ? QUICK_TIMEOUT_MS : INSTRUCTION_TIMEOUT_MS;
  const cwd = sprint?.worktree ? `${process.env.HOME}/Code/alloy-worktrees/${sprint.worktree}` : null;
  let settled = false;
  updateRequest(reqRec.request_id, { status: "starting", started_at: new Date().toISOString() });
  // If the provider turn is genuinely running (didn't fast-fail on auth), show it.
  const runningTimer = setTimeout(() => { if (!settled) updateRequest(reqRec.request_id, { status: "worker-running" }); }, 1500);
  sendViaProvider({ provider: sprint?.provider, message: reqRec.instruction, cwd, timeout })
    .then((r) => {
      settled = true; clearTimeout(runningTimer);
      const now = new Date().toISOString(); const dur = Date.now() - t0;
      try { recordAsk({ slot: reqRec.worker_slot, worktree: sprint?.worktree, provider: sprint?.provider, message: reqRec.instruction, response: r }); } catch { /* legacy log best-effort */ }
      let patch = { duration_ms: dur };
      if (r.auth_required) patch = { ...patch, status: "authentication-required", error_code: "auth", error_message: r.error || "Authentication required", failed_at: now };
      else if (r.timed_out) patch = { ...patch, status: "timed-out", error_code: "timeout", error_message: "provider timed out", failed_at: now };
      else if (r.ok === false || r.unsupported) patch = { ...patch, status: "failed", error_code: "provider_error", error_message: r.error || "provider error", failed_at: now };
      else patch = { ...patch, status: "worker-responded", response: r.text ?? null, usage: r.usage || null, provider_session_id: r.session_id || null, completed_at: now };
      updateRequest(reqRec.request_id, patch);
      writeAuditEvent({ actor: reqRec.actor || "operator", command: "director.send", input: { slot: reqRec.worker_slot, request_type: reqRec.request_type }, target: { kind: "worker", label: `slot ${reqRec.worker_slot}` }, outcome: patch.status === "worker-responded" ? "succeeded" : "failed", error: patch.error_message || null }, Date.now());
    })
    .catch((e) => {
      settled = true; clearTimeout(runningTimer);
      updateRequest(reqRec.request_id, { status: "failed", error_code: "exception", error_message: String(e.message || e), failed_at: new Date().toISOString(), duration_ms: Date.now() - t0 });
    });
}

/** Read a small JSON body from a loopback POST. Fails closed on size/parse. */
function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((res) => {
    let data = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) { tooBig = true; req.destroy(); }
    });
    req.on("end", () => {
      if (tooBig) return res({ ok: false, error: "body_too_large" });
      if (!data) return res({ ok: true, value: {} });
      try { res({ ok: true, value: JSON.parse(data) }); } catch { res({ ok: false, error: "invalid_json" }); }
    });
    req.on("error", () => res({ ok: false, error: "read_error" }));
  });
}

export function createVacilandoServer() {
  const clients = new Set();
  const broadcast = (snap) => {
    const frame = `event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`;
    for (const r of clients) { try { r.write(frame); } catch { clients.delete(r); } }
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${LOOPBACK_HOST}`);
    const path = url.pathname;

    // ---- command runtime (POST; inert JSON only, routed through the registry) ----
    if (req.method === "POST" && (path === "/api/commands" || path === "/api/commands/preview")) {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, stage: "request", code: body.error });
      const mode = path.endsWith("/preview") ? "preview" : "execute";
      try {
        // Use the CACHED snapshot (any age) so a command never blocks ~16s on a
        // fresh compose under memory pressure — slot resolution only needs which
        // slots exist, which the cache already holds. Falls back to a fresh
        // compose only when truly cold.
        const snapshot = await getSnapshot({ maxAgeMs: 600000 });
        const out = await runCommand(
          { command: body.value.command, input: body.value.input, confirm: body.value.confirm === true, confirm_text: body.value.confirm_text, mode, actor: body.value.actor || "operator" },
          // Post-execute refresh must NOT block the response on a ~16s compose:
          // return the cached snapshot now and force a fresh one in the background.
          { snapshot, refresh: () => { forceSnapshot().catch(() => {}); return getSnapshot({ maxAgeMs: 600000 }); } },
        );
        if (mode === "execute" && out.snapshot) broadcast(out.snapshot);
        const status = out.ok ? 200 : statusForStage(out);
        return sendJson(res, status, out);
      } catch (e) {
        // NEVER hang: a thrown command returns a real error the UI can show.
        return sendJson(res, 500, { ok: false, stage: "execute", code: "server_error", command: body.value?.command, error: String(e && e.message || e) });
      }
    }

    // Director async send: durable request created BEFORE execution; returns immediately.
    if (req.method === "POST" && path === "/api/director/send") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const { slot, instruction, request_type = "worker-instruction", retry_of = null } = body.value || {};
      if (!Number.isInteger(slot) || slot < 1 || slot > 6) return sendJson(res, 400, { ok: false, error: "bad_slot" });
      if (typeof instruction !== "string" || !instruction.trim()) return sendJson(res, 400, { ok: false, error: "empty_instruction" });
      if (instruction.length > 24000) return sendJson(res, 400, { ok: false, error: "too_long", detail: `${instruction.length} chars exceeds 24000` });
      // Metadata resolve is instant (no compose) — the send must not wait on a
      // starved projection just to accept a request.
      const sprint = sprintFromMetadata(slot) || resolveSprint(await snapshotSafe(), slot);
      if (!sprint) return sendJson(res, 409, { ok: false, error: "slot_not_occupied" });
      const rec = createRequest({ slot, worktree: sprint.worktree, provider: sprint.provider, instruction, request_type: REQUEST_TYPES.has(request_type) ? request_type : "worker-instruction", retry_of });
      runDirectorSend(rec, sprint);
      return sendJson(res, 202, { ok: true, request_id: rec.request_id, status: "queued", created_at: rec.created_at, request_type: rec.request_type });
    }

    if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });

    if (path === "/api/health") {
      return sendJson(res, 200, { ok: true, schema: "vacilando.snapshot.v1", server: "vacilando", host: LOOPBACK_HOST });
    }
    if (path === "/api/state" || path === "/api/snapshot") {
      return sendJson(res, 200, await snapshotSafe());
    }
    if (path === "/api/commands") {
      return sendJson(res, 200, { commands: listCommands() });
    }
    if (path === "/api/audit") {
      return sendJson(res, 200, { events: readAuditEvents(50) });
    }
    if (path === "/api/resources") {
      return sendJson(res, 200, await resourcesCached());
    }
    if (path === "/api/usage") {
      return sendJson(res, 200, collectUsage());
    }
    if (path === "/api/providers") {
      const snap = await snapshotSafe();
      const rt = await getProviderRuntime(providerRuntimeInputs(snap));
      return sendJson(res, 200, rt);
    }
    if (path === "/api/memory") {
      return sendJson(res, 200, await refreshMemory());
    }
    if (path === "/api/dashboard") {
      const [snap, resrc] = await Promise.all([snapshotSafe(), resourcesCached()]);
      const usage = collectUsage();
      const provider_runtime = await getProviderRuntime(providerRuntimeInputs(snap, usage));
      const sched = schedule(snap, resrc);
      const audit = readAuditEvents(300);
      const today = new Date().toISOString().slice(0, 10);
      const isToday = (e) => (e.occurred_at || "").slice(0, 10) === today;
      const reviews = readReviews(200);
      const throughput = {
        commands_today: audit.filter(isToday).length,
        succeeded_today: audit.filter((e) => isToday(e) && e.outcome === "succeeded").length,
        failed_today: audit.filter((e) => isToday(e) && e.outcome === "failed").length,
        reviews_resolved_today: reviews.filter((r) => (r.occurred_at || "").slice(0, 10) === today).length,
        provider_round_trips_today: usage.total_calls_today,
      };
      // Kelly-Minutes foundation: we can count human command interactions from the
      // audit; elapsed human minutes are not yet instrumented → marked unavailable.
      const operator_load = {
        interventions_today: audit.filter(isToday).length,
        decisions_escalated: (snap.approvals?.total ?? 0),
        human_minutes: { value: null, kind: "unavailable", note: "Elapsed human time is not yet instrumented; event foundation (audit) is in place." },
      };
      return sendJson(res, 200, {
        generated_at: snap.generated_at,
        team: {
          slots: sched.counts, base: snap.repository?.base_ref, base_sha: snap.repository?.base_sha,
          project: snap.project?.name,
        },
        machine: resrc.overall,
        providers: usage,
        provider_runtime,
        memory: lastReclaim,
        scheduler: sched,
        throughput,
        operator_load,
        needs_you: snap.approvals?.total ?? 0,
        recent_outputs: (snap.activity || []).slice(0, 6),
      });
    }
    if (path === "/api/outputs") {
      const wt = url.searchParams.get("worktree") || "";
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(wt)) return sendJson(res, 400, { error: "bad_worktree" });
      return sendJson(res, 200, await workerOutputs(wt));
    }
    if (path === "/api/director") {
      const slot = Number(url.searchParams.get("slot"));
      if (!Number.isInteger(slot) || slot < 1 || slot > 6) return sendJson(res, 400, { error: "bad_slot" });
      return sendJson(res, 200, { slot, log: readDirectorLog(slot) });
    }
    if (path === "/api/director/requests") {
      const slot = url.searchParams.get("slot") != null ? Number(url.searchParams.get("slot")) : null;
      if (slot != null && (!Number.isInteger(slot) || slot < 1 || slot > 6)) return sendJson(res, 400, { error: "bad_slot" });
      return sendJson(res, 200, { slot, requests: readRequests(slot) });
    }
    if (path === "/api/closeout") {
      const slot = Number(url.searchParams.get("slot"));
      if (!Number.isInteger(slot) || slot < 1 || slot > 6) return sendJson(res, 400, { error: "bad_slot" });
      const sprint = sprintFromMetadata(slot) || resolveSprint(await snapshotSafe(), slot);
      if (!sprint) return sendJson(res, 404, { error: "slot_not_occupied" });
      // Cheap dev-server check (dev-status, no git/compose).
      const running = await (async () => { try { return (await runningDevServers()).some((s) => s.slot === slot); } catch { return false; } })();
      const co = await computeCloseout(sprint, { devServerRunning: running, providerRunning: false, pendingRequests: pendingCount(slot) });
      return sendJson(res, 200, co);
    }
    if (path === "/api/pr") {
      const wt = url.searchParams.get("worktree") || "";
      const br = url.searchParams.get("branch") || "";
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(wt)) return sendJson(res, 400, { error: "bad_worktree" });
      return sendJson(res, 200, await prForWorktree(wt, br));
    }
    if (path === "/api/policies") {
      return sendJson(res, 200, await collectPolicies());
    }
    if (path === "/api/evidence") {
      const full = evidenceFilePath(url.searchParams.get("worktree") || "", url.searchParams.get("file") || "");
      if (!full) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "Content-Type": MIME[extname(full)] || "application/octet-stream", "Cache-Control": "no-store" });
      return createReadStream(full).pipe(res);
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

  // Memory Manager tick: measure reclaimable memory and auto-reclaim idle dev
  // servers when the host is thrashing. Slower cadence than the SSE tick.
  const memTimer = setInterval(() => { refreshMemory({ act: true }).catch(() => {}); }, MEMORY_TICK_MS);
  memTimer.unref?.();

  // Any Director request left non-terminal died with a previous process — mark it
  // interrupted honestly rather than showing a fake "running".
  try { const n = recoverInterrupted(); if (n) console.log(`[director] recovered ${n} interrupted request(s)`); } catch { /* best-effort */ }

  // Warm the cache immediately so the first request isn't a cold ~8s compute.
  getSnapshot().catch(() => {});
  refreshMemory({ act: true }).catch(() => {});

  return { server, clients, close: () => { clearInterval(timer); clearInterval(memTimer); server.close(); } };
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
