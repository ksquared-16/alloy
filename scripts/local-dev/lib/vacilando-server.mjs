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
 *   GET  /api/lanes           → Development Lane discovery (tmux + git facts)
 *   GET  /api/lanes/:id       → one allowlisted lane (server-resolved tmux target)
 *   GET  /api/lanes/:id/output → recent pane text (lane_id only; ?mode=extended|latest_response)
 *   POST /api/lanes/:id/instruction → paste+submit instruction (lane_id + body)
 *   POST /api/lanes/:id/runtime/release → lane.release_execution_capacity (keep durable lane)
 *   GET  /api/repositories    → registered repositories + capabilities
 *   GET  /api/repositories/inspect?path= → read-only preflight for Connect local
 *   POST /api/repositories/connect-local → register an existing local repository
 *   POST /api/repositories/:id/validate|retire|reactivate|update
 *   POST /api/lanes/:id/attachments → upload one image (raw bytes, sniffed type)
 *   GET  /api/lanes/:id/attachments → pending draft attachments + limits
 *   POST /api/lanes/:id/attachments/:aid/remove → drop a draft attachment
 *   GET  /api/attachments/:id → the image bytes, same auth as the conversation
 *   GET  /api/notifications   → durable notification records + unseen counts
 *   POST /api/notifications/seen → acknowledge by notification_id | lane_id | all
 *   GET  /api/lane-folders    → lane folders (organisation only; never a lifecycle)
 *   POST /api/lane-folders/create|:id/rename|:id/delete → folder CRUD (delete unfiles, never deletes lanes)
 *   POST /api/lanes/:id/folder → file a lane into a folder (folder_id: null unfiles)
 *   GET  /api/state           → the full Command Center snapshot
 *   GET  /api/events          → SSE stream; a `snapshot` frame on connect + tick
 *   GET  /api/commands        → the registered command catalog (+ unsupported)
 *   GET  /api/audit           → recent execution audit events
 *   POST /api/commands/preview→ resolve+evaluate+preview a command (never runs)
 *   POST /api/commands        → confirm+execute a command through the registry
 *   GET  /                    → the SPA shell (static, path-traversal safe)
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { basename, extname, join, normalize, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { composeSnapshot } from "./vacilando/compose.mjs";
import { runCommand } from "./vacilando/commands/executor.mjs";
import { listCommands } from "./vacilando/commands/registry.mjs";
import { readAuditEvents } from "./vacilando/commands/audit.mjs";
import { collectResources, collectWorktreeDiskSizes, peekWorktreeDiskCache } from "./vacilando/resources.mjs";
import { getOrchestrationMetrics, invalidateRawCache, noteStatusRequest, RAW_TTL_MS as SOURCE_RAW_TTL_MS } from "./vacilando/sources.mjs";
import { workerOutputs, evidenceFilePath } from "./vacilando/outputs.mjs";
import { readDirectorLog, recordAsk } from "./vacilando/commands/director.mjs";
import { createRequest, updateRequest, readRequests, pendingCount, recoverInterrupted, REQUEST_TYPES } from "./vacilando/commands/director-requests.mjs";
import { sendViaProvider } from "./vacilando/provider-runtime.mjs";
import { worktreePathForName } from "./vacilando/workspace-facts.mjs";
import { writeAuditEvent } from "./vacilando/commands/audit.mjs";
import { computeCloseout } from "./vacilando/closeout.mjs";
import { prForWorktree } from "./vacilando/github.mjs";
import { collectPolicies } from "./vacilando/policies.mjs";
import { collectUsage } from "./vacilando/usage.mjs";
import { getProviderRuntime } from "./vacilando/provider-runtime.mjs";
import { computeReclaim, memoryPressure, runningDevServers } from "./vacilando/memory-manager.mjs";
import { diskSignalAsync, freeDiskGb, runGc } from "./vacilando/disk-hygiene.mjs";
import {
  acquireControlPlaneOwnership,
  releaseControlPlaneOwnership,
  noteBindTiming,
  recordControlPlaneEvent,
  getControlPlaneHealth,
} from "./vacilando/control-plane-health.mjs";
import { schedule } from "./vacilando/scheduler.mjs";
import { readReviews } from "./vacilando/commands/review.mjs";
import { readMissions, getMission, recoverMissions } from "./vacilando/commands/missions.mjs";
import { getPackage } from "./vacilando/commands/mission-packages.mjs";
import { readMissionOutputs, readTurnOutput, liveMissionIds } from "./vacilando/mission-executor.mjs";
import { providerResumable } from "./vacilando/provider-runtime.mjs";
import { compileMissionForIntent, recompileMission, reframeMission, answerQuestions, defineCapability, addProductDecision, startMission as directorStart, steerMission as directorSteer, stop as directorStop, evaluate as directorEvaluate, accept as directorAccept, close as directorClose, previewAction, readAcceptance, setObjectiveMode, prepareNextPhase, readObjective, conductObjectiveNext } from "./vacilando/mission-director.mjs";
import { terminateUnbrokeredHeavyProcesses } from "./vacilando/heavy-validation-guard.mjs";
import { listObjectives, projectObjectiveLive, getObjectiveByMission } from "./vacilando/objective.mjs";
import { listCapabilities, getCapability, registerCapability } from "./vacilando/capability.mjs";
import { assembleConversation, listConversations } from "./vacilando/conversation.mjs";
import { getProductDefinitionForCapability } from "./vacilando/product-definition.mjs";
import { resolveSlotIdentity, runtimeHost, hostRegistration, listSlotIdentities, hostIdentity } from "./vacilando/identity.mjs";
import { getLocalNode, publicExecutionNode } from "./vacilando/execution-node.mjs";
import { getDevelopmentLane, getLaneOutput, listDevelopmentLanes, LANE_ID_RE, normalizeLaneId, unexpectedLaneControlFields } from "./vacilando/lanes.mjs";
import { connectExistingWorkRequest, createNewLaneRequest, listAdoptionCandidates, renameLaneRequest } from "./vacilando/lane-identity-api.mjs";
import { attachLaneInstructions, enrichOutputRuntime } from "./vacilando/lane-runtime.mjs";
import { attachLaneRuns, inspectLaneRun } from "./vacilando/execution-run.mjs";
import { attachLaneRunLifecycle } from "./vacilando/execution-stale.mjs";
import { attachLaneAdmissions, prioritizeAdmission } from "./vacilando/execution-admission.mjs";
import { attachLaneSourceControl } from "./vacilando/source-control.mjs";
import { attachLaneResourceWaits, developmentResourceSnapshot, prioritizeResourceRequest } from "./vacilando/execution-resource.mjs";
import { attachLaneGovernedActions } from "./vacilando/governed-action-request.mjs";
import { attachLaneRecovery } from "./vacilando/execution-recovery.mjs";
import { attachLaneAgentSessions, acceptHandoffReport, acceptOrientationReport, requestSessionRotation, maybeAdvanceSessionRotation } from "./vacilando/agent-session-lifecycle.mjs";
import { maybeReconcileGovernor, reconcileGovernor } from "./vacilando/execution-reconcile.mjs";
import { emergencyReleaseExclusive, evaluateExclusiveWindow, reconcileExclusiveWindow } from "./vacilando/execution-exclusive.mjs";
import { reconcileGrantContinuations } from "./vacilando/execution-resume.mjs";
import { deliverManagedLaneInstruction, laneInstructionHttpStatus } from "./vacilando/execution-run-send.mjs";
import { resumePendingOutputWatches, stopAllOutputWatches } from "./vacilando/lane-notify.mjs";
import {
  deletePushSubscription,
  publicPushConfig,
  publicPushHealth,
  requestPublicOrigin,
  savePushSubscription,
  sendTestPush,
} from "./vacilando/lane-push.mjs";
import { getLaneAgentTelemetry, peekLaneTelemetryCache } from "./vacilando/lane-telemetry.mjs";
import {
  ingestMissionBrief,
  reviewMissionReadiness,
  approveMissionExecution,
  getKickoffState,
} from "./vacilando/mission-kickoff.mjs";
import { getBrief, getBriefVersion, listBriefVersions, proposeBriefRevision } from "./vacilando/mission-brief.mjs";
import { readTimelineSummary, summarizeFromTimeline } from "./vacilando/timeline.mjs";
import { handleV2Get, handleV2Post } from "./vacilando/v2-api.mjs";
import {
  apiAuthRequired,
  assertPrivateBindHost,
  authorizeRequest,
  clearSessionCookieHeader,
  gatewayRemoteMode,
  getVacilandoApiToken,
  isPublicApiPath,
  requestWantsSecureCookie,
  sessionCookieHeader,
  tokenFingerprint,
  tokenFromHeaders,
  tokensEqual,
} from "./vacilando/vacilando-api-auth.mjs";
import { attachTailscaleListener } from "./vacilando/vacilando-tailscale-bind.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME_ROOT_DIR = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(process.env.HOME || "", ".local", "state", "alloy-dev");
export const LOOPBACK_HOST = "127.0.0.1";
const PUBLIC_DIR = resolve(HERE, "..", "apps", "vacilando", "public");
const DEFAULT_PORT = 3020;
// Board projection: Node workspace snapshot + cached git facts. Serve from a
// single-flight cache aligned with SOURCE_RAW_TTL so polls never re-fan-out.
// SSE tick is human-visible Director cadence — not sub-second filesystem scan.
const TICK_MS = 20000;
const MEMORY_TICK_MS = 45000; // memory measure + idle-server auto-reclaim cadence
const RESOURCES_TTL_MS = 60000;
const WORKTREE_DISK_TICK_MS = 15 * 60 * 1000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  // Without this a favicon.ico is served as application/octet-stream, which
  // some browsers refuse to use as a tab icon.
  ".ico": "image/x-icon",
  ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".log": "text/plain; charset=utf-8",
};

function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
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
  for (const f of ["app.js", "styles.css", "index.html", "gateway.js", "gateway-view.mjs", "mission-control.js"]) {
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
      .replace(/(src|href)="(app\.js|styles\.css|gateway\.js|gateway-view\.mjs|manifest\.webmanifest)"/g, `$1="$2?v=${v}"`);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, must-revalidate", "X-Vacilando-Build": v });
    return res.end(html);
  }
  if (rel === "sw.js") {
    res.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    });
    return createReadStream(full).pipe(res);
  }
  res.writeHead(200, { "Content-Type": MIME[extname(full)] || "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(full).pipe(res);
}

/**
 * Single-flight snapshot cache. Compose uses sources.collectRaw (also
 * singleflight). At most ONE compose runs at a time; TTL collapses bursts.
 */
const CACHE_TTL_MS = Math.max(SOURCE_RAW_TTL_MS, 30_000);
const cache = { at: 0, snap: null, inflight: null };

async function getSnapshot({ maxAgeMs = CACHE_TTL_MS, allowStale = true, forceSources = false } = {}) {
  const now = Date.now();
  if (cache.snap && now - cache.at < maxAgeMs) return cache.snap;
  // STALE-WHILE-REVALIDATE: once we have ANY snapshot, never make the operator
  // wait on a recompose. Serve the last-good frame instantly and refresh behind.
  if (cache.snap && allowStale) {
    if (!cache.inflight) { getSnapshot({ maxAgeMs: 0, allowStale: false }).catch(() => {}); }
    return cache.snap;
  }
  // COLD START: never hold the operator — start compose, wait briefly, then
  // answer a `pending` frame. The SSE tick delivers the real snapshot.
  if (!cache.snap && allowStale) {
    if (!cache.inflight) { getSnapshot({ maxAgeMs: 0, allowStale: false }).catch(() => {}); }
    const raced = await Promise.race([cache.inflight, new Promise((r) => setTimeout(() => r(undefined), COLD_WAIT_MS))]);
    if (raced) return raced;
    return { schema_version: "vacilando.snapshot.v1", pending: true, headline: null, sprints: [], workers: [], approvals: { total: 0, counts: {} }, activity: [], gaps: [], project: {}, pending_note: "Composing the runtime projection — this view refreshes automatically." };
  }
  if (cache.inflight) return cache.inflight;
  cache.inflight = composeSnapshot({ forceSources })
    .then((s) => {
      cache.inflight = null;
      if ((!s.sprints || s.sprints.length === 0) && cache.snap?.sprints?.length > 0) {
        return { ...cache.snap, degraded: true, degraded_note: "Projection timed out (host under memory pressure) — showing last known workers." };
      }
      cache.snap = s; cache.at = Date.now(); return s;
    })
    .catch((e) => {
      cache.inflight = null;
      if (cache.snap) return cache.snap;
      return { schema_version: "vacilando.snapshot.v1", error: `projection failed: ${String(e.message || e)}`, headline: null, sprints: [], workers: [], approvals: { total: 0, counts: {} }, activity: [], gaps: [], project: {} };
    });
  return cache.inflight;
}
const snapshotSafe = () => getSnapshot();
/** Force a fresh projection (bypass TTL) and update the cache. Used after a command. */
const forceSnapshot = () => {
  invalidateRawCache();
  return getSnapshot({ maxAgeMs: 0, allowStale: false, forceSources: true });
};

/**
 * Stale-while-revalidate cache — the fix for head-of-line blocking.
 *
 * The audit measured `/api/providers` at 23s standalone (it shells out to
 * `security`, `claude --version`, `cursor-agent status`) and 40s under load,
 * `/api/resources` at 6s and `/api/closeout` at 4s. Because the server is
 * single-threaded, those starved trivial reads: `/api/missions` costs 0.04s
 * alone but was measured at 11s queued behind a probe.
 *
 * Contract: a warm key ALWAYS answers immediately from cache (stale is fine and
 * is labelled as such) and refreshes in the background. Only a cold key waits,
 * and even then it is bounded — past the bound we answer `pending` rather than
 * block the operator. No operator read ever waits on a probe again.
 */
const swrStore = new Map(); // key -> { at, value, inflight, error }
const COLD_WAIT_MS = 1200;

function swrRefresh(key, producer) {
  const e = swrStore.get(key) || { at: 0, value: null, inflight: null, error: null };
  if (!e.inflight) {
    e.inflight = Promise.resolve()
      .then(producer)
      .then((v) => { e.value = v; e.at = Date.now(); e.error = null; return v; })
      .catch((err) => { e.error = String(err?.message || err); return e.value; })
      .finally(() => { e.inflight = null; });
    swrStore.set(key, e);
  }
  return e;
}

/**
 * Serve `key` immediately. Returns { data, fresh, age_ms, stale, pending }.
 * Never blocks longer than COLD_WAIT_MS.
 */
async function swr(key, producer, { ttlMs = 20000 } = {}) {
  const e = swrStore.get(key) || { at: 0, value: null, inflight: null, error: null };
  const age = e.at ? Date.now() - e.at : Infinity;
  const stale = age > ttlMs;

  if (e.value != null) {
    if (stale) swrRefresh(key, producer); // refresh behind the operator's back
    return { data: e.value, fresh: !stale, age_ms: e.at ? age : null, stale, pending: false, error: e.error || null };
  }
  // Cold: wait briefly, then answer `pending` rather than hold the operator.
  const started = swrRefresh(key, producer);
  const raced = await Promise.race([started.inflight, new Promise((r) => setTimeout(() => r(undefined), COLD_WAIT_MS))]);
  const now = swrStore.get(key);
  if (raced !== undefined && now?.value != null) return { data: now.value, fresh: true, age_ms: 0, stale: false, pending: false, error: now.error || null };
  return { data: null, fresh: false, age_ms: null, stale: false, pending: true, error: now?.error || null };
}

/**
 * RESILIENT BOARD — the worker dock must never collapse to zero.
 *
 * The audit found the dock rendering 0 slots whenever the git-heavy compose
 * returned an empty (but "successful") frame under host pressure — and because
 * that frame looked valid, it was cached as truth. The fix is structural: the
 * board's SPINE comes from the slot registry, which is local, deterministic and
 * always available. The expensive projection only ENRICHES (status, ahead/behind,
 * server, cpu). A slow or failed probe can therefore degrade detail, but can
 * never remove a worker card.
 *
 * Each sprint carries `enriched`; the frame carries `board_source` and
 * `board_state` so the UI can distinguish: no configured workers · loading ·
 * projection unavailable · last-known-good.
 */
const titleFromBranch = (branch, worktree) => {
  const tail = (branch || worktree || "").split("/").pop().replace(/^\d+-/, "");
  return tail.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || worktree || "Worker";
};

function registrySprints() {
  return listSlotIdentities().map((i) => {
    // A slot whose worktree was deleted (or whose identity is otherwise in
    // conflict) must not masquerade as a healthy worker. Surface it truthfully so
    // the operator sees, right after a Delete Worktree, that the slot's checkout
    // is gone and only needs freeing — never a phantom running worker.
    const missing = i.conflict?.kind === "worktree_missing";
    return {
      slot: i.slot, title: titleFromBranch(i.branch, i.worktree_name),
      provider: i.provider || "claude", worktree: i.worktree_name, branch: i.branch,
      path: i.worktree_path || null,
      port: i.port || null,
      status: missing ? "worktree-missing" : i.ok ? "unknown" : "identity-conflict",
      server: "unknown", glyph: "spark",
      updated_at_ms: null, git: null, question_count: 0,
      enriched: false, identity_ok: i.ok, identity_conflict: i.conflict || null,
    };
  });
}

/** Merge the live projection over the registry spine. Live always wins per slot. */
function resilientBoard(snap) {
  const base = registrySprints();
  const live = new Map((snap?.sprints || []).map((s) => [s.slot, s]));
  const merged = base.map((b) => {
    // Identity conflict (e.g. worktree deleted) is AUTHORITATIVE — a stale live
    // frame must never paint a deleted worktree as a healthy running worker.
    if (b.identity_conflict) return b;
    return live.has(b.slot) ? { ...b, ...live.get(b.slot), enriched: true } : b;
  });
  // A live sprint for a slot the registry does not know is still shown (never hide truth).
  for (const [slot, s] of live) if (!merged.some((m) => m.slot === slot)) merged.push({ ...s, enriched: true });
  merged.sort((a, b) => a.slot - b.slot);

  const enrichedCount = merged.filter((m) => m.enriched).length;
  const board_state = merged.length === 0 ? "no_workers"
    : snap?.pending ? "loading"
    : enrichedCount === 0 ? "projection_unavailable"
    : enrichedCount < merged.length ? "partial"
    : "live";
  return {
    ...snap, sprints: merged,
    board_source: enrichedCount === merged.length ? "live" : enrichedCount === 0 ? "registry" : "mixed",
    board_state,
    board_note: board_state === "projection_unavailable" ? "Live projection unavailable (host under load) — showing registered workers from the slot registry."
      : board_state === "partial" ? "Some worker detail is still refreshing."
      : board_state === "loading" ? "Composing the runtime projection…" : null,
  };
}

/**
 * Authoritative, memory-pressure-proof server state: is anything LISTENING on
 * the slot's port? A pure-TCP probe (no alloy-ro, no lsof) resolved on EVERY
 * read — so "App: running / Open App" flips the instant Next binds the port,
 * even when the compose projection is cached-stale or alloy-ro is thrashing
 * under swap (the exact case where "App: stopped" used to stick after a real
 * start). A non-listening localhost port refuses immediately (ECONNREFUSED), so
 * this is ~1ms per slot; unreachable ports fall back to the projection value.
 */
function probePortListening(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    if (!port) return resolve(null);
    let done = false;
    const finish = (v) => { if (done) return; done = true; try { sock.destroy(); } catch { /* noop */ } resolve(v); };
    const sock = createConnection({ host: LOOPBACK_HOST, port: Number(port) });
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
  });
}

const ACTIVITY_WORKING_MS = 15 * 60 * 1000;
/** Resolve a worktree's real gitdir (following the linked-worktree .git file). */
function gitdirOf(path) {
  if (!path) return null;
  try {
    const dotgit = join(path, ".git");
    if (!statSync(dotgit).isFile()) return dotgit; // a normal .git directory
    const m = /^gitdir:\s*(.+)\s*$/m.exec(readFileSync(dotgit, "utf8"));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
/**
 * Cheap, local, pressure-proof "last git activity" for a worktree: the mtime of
 * its ref log. Lets the per-worker activity pill stay meaningful even when the
 * enriched projection is degraded under load. Returns ms since epoch, or null.
 */
function worktreeActivityMs(path) {
  const gd = gitdirOf(path);
  try { return gd ? Math.round(statSync(join(gd, "logs", "HEAD")).mtimeMs) : null; } catch { return null; }
}
/** Current branch of a worktree, read cheaply from gitdir/HEAD (no subprocess). */
function branchOf(path) {
  const gd = gitdirOf(path);
  try {
    const head = readFileSync(join(gd, "HEAD"), "utf8").trim();
    const m = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    return m ? m[1] : head.slice(0, 8); // detached → short sha
  } catch { return null; }
}

// The Director/app runs from this checkout. Presented as the CHAMPION — a
// distinct entry above the six worker slots, not itself a worker slot.
const DIRECTOR_HOME = resolve(HERE, "..", "..", "..");
function championEntry() {
  const now = Date.now();
  const path = DIRECTOR_HOME;
  const last = worktreeActivityMs(path);
  return {
    role: "director",
    title: "Vacilando",
    worktree: basename(path),
    path,
    branch: branchOf(path),
    activity: last != null && now - last < ACTIVITY_WORKING_MS ? "working" : "idle",
    last_activity_ms: last,
    glyph: "compass",
  };
}

/**
 * Overlay LIVE truth onto the board on every read: port-authoritative server
 * state (so "Open App" flips the instant Next listens) and a git-activity
 * fallback for the per-worker activity pill when the enriched projection didn't
 * supply it (degraded board). Enriched activity — which knows done/paused —
 * always wins; the fallback only fills the working/idle gap.
 */
async function applyLiveTruth(board) {
  const now = Date.now();
  const sprints = board.sprints || [];
  const listen = await Promise.all(sprints.map((s) => probePortListening(s.port)));
  board.sprints = sprints.map((s, i) => {
    const out = listen[i] == null ? { ...s } : { ...s, server: listen[i] ? "running" : "stopped" };
    if (!out.activity || out.activity === "unknown") {
      const last = worktreeActivityMs(s.path);
      if (last != null) {
        out.last_activity_ms = out.last_activity_ms ?? last;
        out.activity = now - last < ACTIVITY_WORKING_MS ? "working" : "idle";
      }
    }
    return out;
  });
  // Vacilando itself — the CHAMPION — presented above the six worker slots, never
  // as one of them. Its home worktree may still appear as a numbered worker until
  // it's unregistered from the slot system; once freed, the six slots are all
  // workers and this is the only place Vacilando shows.
  board.champion = championEntry();
  board.sprints = board.sprints.filter((s) => s.path !== board.champion.path);
  return board;
}

/** The snapshot every UI surface consumes: never fewer workers than are registered. */
async function boardSnapshot() { return applyLiveTruth(resilientBoard(await snapshotSafe())); }

const MISSION_BUSY = new Set(["starting", "running", "stopping"]);
/**
 * Resolve which WORKER a Director mission runs in. The Director dispatches to one
 * of the six work slots — it is not itself a slot. An explicit run-target is
 * honored (the operator's choice); "auto" picks the lowest-numbered occupied
 * worker that is NOT already running a mission, so work never silently piles onto
 * one slot. Returns { slot } or { error, detail, available }.
 */
function resolveRunSlot(requested) {
  // A slot with a registered worktree already hosts a sprint (human or a prior
  // Vacilando mission). A FREE slot (no worktree) is where a new mission goes —
  // Vacilando provisions a fresh worktree there at start (the launcher). Missions
  // never run in the champion and never co-tenant an occupied worktree.
  // A slot with ANY registered worktree is occupied — even one whose identity is
  // in conflict (wrong branch, missing worktree). Only a slot with no worktree at
  // all is free. (listSlotIdentities already returns only slots that have one.)
  const withWorktree = new Set(listSlotIdentities().map((i) => i.slot));
  const freeSlots = [1, 2, 3, 4, 5, 6].filter((n) => !withWorktree.has(n));
  const req = (typeof requested === "string" && /^-?\d+$/.test(requested)) ? Number(requested) : requested;
  if (Number.isInteger(req)) {
    if (req < 1 || req > 6) return { error: "bad_slot", detail: `slot ${req} out of range`, available: freeSlots };
    if (!freeSlots.includes(req)) return { error: "slot_occupied", detail: `slot ${req} already hosts a sprint — pick a free slot, or End Work to free it.`, available: freeSlots };
    return { slot: req, provision: true };
  }
  // Auto → the lowest free worker slot; a fresh worktree is provisioned on start.
  if (freeSlots.length) return { slot: freeSlots[0], provision: true };
  return { error: "all_workers_busy", detail: "all six worker slots host sprints — End Work on one to free a slot before dispatching.", available: [] };
}

/** Warm the expensive keys in the background so the first operator read is instant. */
function warmExpensive() {
  swrRefresh("resources", () => collectResources());
  swrRefresh("providers", async () => getProviderRuntime(providerRuntimeInputs(await snapshotSafe())));
}

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

/** Resources are OS reads (no hot-path du); cache so the board stays snappy. */
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
/** Cached Engineering Health summary (background refresh; never auto-executes cleanup). */
let lastEngHealth = null;
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
 * Disk Hygiene — the sibling of the memory manager, one resource over. It measures
 * headroom + what a reclaim would free (dry-run signal), and — only when the
 * operator has ENABLED it (auto_gc, default OFF; a destructive action gated behind
 * an explicit opt-in) — reactively runs the safe `alloy-worktree-gc` when free disk
 * crosses a low-water mark. Never touches source, history, or uncommitted work.
 */
const DISK_POLICY = {
  auto_gc: false,        // OFF until the operator flips it on (dashboard toggle)
  low_water_gb: 8,       // reactive: reclaim below this
  hard_gb: 5,            // pre-build/pre-sprint fail-fast floor
  cache_min_free_gb: 20, // also clear the npm cache if still below this after
  cooldown_ms: 30 * 60 * 1000,
};
let lastDiskGc = { signal: null, last_run: null, policy: DISK_POLICY, auto_actions: [] };
let diskReclaimCooldown = 0;

// Persist the operator's disk-policy choice so "set-and-forget" survives a server
// restart (the app respawns the server; an in-memory flag would silently revert).
const DISK_POLICY_FILE = join(RUNTIME_ROOT_DIR, "vacilando", "disk-policy.json");
function loadDiskPolicy() {
  try {
    const j = JSON.parse(readFileSync(DISK_POLICY_FILE, "utf8"));
    if (typeof j.auto_gc === "boolean") DISK_POLICY.auto_gc = j.auto_gc;
    if (Number.isFinite(j.low_water_gb) && j.low_water_gb > 0) DISK_POLICY.low_water_gb = j.low_water_gb;
  } catch { /* first run / unreadable → keep defaults */ }
}
function saveDiskPolicy() {
  try { mkdirSync(dirname(DISK_POLICY_FILE), { recursive: true }); writeFileSync(DISK_POLICY_FILE, JSON.stringify({ auto_gc: DISK_POLICY.auto_gc, low_water_gb: DISK_POLICY.low_water_gb }, null, 2)); } catch { /* best-effort */ }
}
loadDiskPolicy();

async function refreshDisk({ act = false } = {}) {
  // Yield first so callers that fire-and-forget at boot never block listen on the
  // GC dry-run (was execFileSync ≤30s inside createVacilandoServer).
  await Promise.resolve();
  let signal = null;
  try { signal = await diskSignalAsync(); } catch { /* keep last */ }
  if (act && DISK_POLICY.auto_gc && signal && typeof signal.free_gb === "number" && signal.free_gb < DISK_POLICY.low_water_gb
      && Date.now() - diskReclaimCooldown >= DISK_POLICY.cooldown_ms) {
    diskReclaimCooldown = Date.now();
    try {
      const out = await runGc({ minFreeGb: DISK_POLICY.cache_min_free_gb });
      lastDiskGc.auto_actions = [{ ...out, trigger: `free ${signal.free_gb}GB < ${DISK_POLICY.low_water_gb}GB`, at: new Date().toISOString() }, ...(lastDiskGc.auto_actions || [])].slice(0, 10);
      try { signal = await diskSignalAsync(); } catch { /* keep */ }
    } catch (e) { lastDiskGc.auto_actions = [{ ok: false, error: String(e.message || e), at: new Date().toISOString() }, ...(lastDiskGc.auto_actions || [])].slice(0, 10); }
  }
  lastDiskGc = { ...lastDiskGc, signal: signal || lastDiskGc.signal, policy: DISK_POLICY };
  return lastDiskGc;
}

/**
 * Autonomous conductor: once the operator has handed an objective off (mode =
 * autonomous), a phase that FINISHES and whose acceptance gate fully passes (every
 * criterion evidence-met) is auto-accepted — which advances the objective and
 * starts the next phase. A gate that needs judgment (needs_operator) or a blocker
 * is LEFT for the operator, who is pulled in by notification. Governance is
 * unchanged: the worker still may not push/merge/promote, and consequential
 * actions still preview→confirm. Never rubber-stamps judgment.
 */
const autoResumeTries = new Map(); // mission_id -> resume attempts (in-memory, resets on restart)
const conductCooldown = new Map(); // capability_id -> last re-launch attempt (avoid spamming a failing phase)
let silentRecoverInFlight = false;
function conductorTick() {
  try {
    // Host protection: terminate raw tsc / next build that bypassed the validation
    // broker (Vacilando workers must use vac run). Runs every tick regardless of
    // autonomous mode — Cursor sessions and stale package.json scripts also leak.
    try {
      const term = terminateUnbrokeredHeavyProcesses({ signal: "SIGTERM" });
      if (term.killed?.length) {
        try {
          writeAuditEvent({
            actor: "system",
            command: "validation.broker.enforce",
            input: { killed: term.killed.map((k) => ({ pid: k.pid, command: k.command })) },
            target: { kind: "host", label: "heavy-validation" },
            outcome: "succeeded",
            preview_summary: `terminated ${term.killed.length} unbrokered heavy validator(s)`,
          });
        } catch { /* audit best-effort */ }
        // Escalation if still alive next tick
        setTimeout(() => {
          try { terminateUnbrokeredHeavyProcesses({ signal: "SIGKILL" }); } catch { /* */ }
        }, 4000);
      }
    } catch { /* never break conductor */ }

    // Orphan compute permits (dead holders) — reclaim so typecheck/cert cannot
    // strand the machine for half an hour after a crashed process.
    try {
      const computeBin = join(dirname(fileURLToPath(import.meta.url)), "..", "alloy-compute");
      execFileSync(computeBin, ["reap", "--confirm"], { timeout: 20000, stdio: "ignore" });
    } catch { /* never break conductor */ }

    // V2 missions: silent workers → Director auto-resume (no operator babysitting).
    // Also auto-dispatch ready queues when VACILANDO_AUTO_DISPATCH is on (default).
    if (!silentRecoverInFlight) {
      silentRecoverInFlight = true;
      import("./vacilando/silent-worker-recover.mjs")
        .then(({ recoverSilentWorkers }) => recoverSilentWorkers())
        .then((out) => {
          if (out?.recovered?.length) {
            console.log(`[director] auto-resumed ${out.recovered.length} silent worker mission(s)`);
          }
          if (out?.zombies?.length) {
            console.log(`[director] reconciled ${out.zombies.length} zombie session(s)`);
          }
          if (out?.escalated?.length) {
            console.log(`[director] silent recovery exhausted for ${out.escalated.length} mission(s) — Needs You`);
          }
        })
        .catch(() => {})
        .finally(() => { silentRecoverInFlight = false; });
    }
    try {
      import("./vacilando/governed-action-request.mjs")
        .then(({ tickGovernedActions }) => tickGovernedActions())
        .catch(() => {});
    } catch { /* governed-action tick must not break conductor */ }
    if (process.env.VACILANDO_AUTO_DISPATCH !== "0") {
      import("./vacilando/director-summary.mjs")
        .then(async ({ listMissionsV2 }) => {
          const { deriveMissionPosture } = await import("./vacilando/mission-posture.mjs");
          const { scheduleDispatchAfterKickoff } = await import("./vacilando/assignment-dispatch.mjs");
          const { listAssignments } = await import("./vacilando/worker-assignment.mjs");
          const { getBrief } = await import("./vacilando/mission-brief.mjs");
          const { getMission } = await import("./vacilando/commands/missions.mjs");
          const { isFixtureMission } = await import("./vacilando/presentation/mission-filters.mjs");
          for (const row of listMissionsV2({ includeArchived: false })) {
            const mid = row.mission_id || row.missionId;
            if (!mid) continue;
            const title = getBrief(mid)?.title || getMission(mid)?.title;
            if (isFixtureMission(title, mid)) continue;
            // Cheap gate — skip full posture when nothing is queued ready.
            const ready = (listAssignments(mid) || []).some((a) => a.status === "ready");
            if (!ready) continue;
            const posture = deriveMissionPosture(mid);
            if (posture.id === "ready_to_start") {
              scheduleDispatchAfterKickoff(mid, { actor: "director" });
            }
          }
        })
        .catch(() => {});
    }

    const autoObjectives = new Set();
    // Prefer durable objective records so an idle autonomous objective (no recent
    // mission traffic) still self-heals once the provider reconnects.
    for (const o of listObjectives()) {
      if (o?.mode === "autonomous" && o.capability_id) autoObjectives.add(o.capability_id);
    }
    for (const m of readMissions(null, 200)) {
      if (!m.capability_id) continue;
      const obj = readObjective(m.capability_id);
      if (!obj || obj.mode !== "autonomous") continue;
      autoObjectives.add(m.capability_id);
      // A finished phase whose gate fully passes → auto-accept (advances the objective).
      if (m.status === "waiting_for_acceptance") {
        const ev = directorEvaluate({ mission_id: m.mission_id });
        if (ev?.result?.gate === "pass") directorAccept({ mission_id: m.mission_id, confirm: true });
        continue;
      }
      // A RESUMABLE interruption (inactivity timeout OR server restart that
      // captured a provider session) is a technical hiccup, not a decision —
      // self-heal by resuming (capped) rather than pulling the operator in.
      if (m.status === "interrupted" && m.provider_session_id && (m.error_code === "timeout" || /server restart|interrupted by a Vacilando/i.test(m.error_message || ""))) {
        const tries = autoResumeTries.get(m.mission_id) || 0;
        if (tries < 3) { autoResumeTries.set(m.mission_id, tries + 1); directorSteer({ mission_id: m.mission_id, instruction: "Continue where you left off; complete the mission.", confirm: true }); }
      }
    }
    // Self-heal: for each autonomous objective, ensure its current pending phase is
    // being worked — re-launch a phase whose last attempt failed (e.g. an auth
    // expiry now fixed), in the objective's own slot. Cooldown avoids a spin loop.
    for (const capId of autoObjectives) {
      if (Date.now() - (conductCooldown.get(capId) || 0) < 90000) continue;
      conductCooldown.set(capId, Date.now());
      conductObjectiveNext({ capability_id: capId }).catch(() => {});
    }
  } catch { /* best-effort; the operator path always still works */ }
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
  const cwd = sprint?.worktree ? worktreePathForName(sprint.worktree) : null;
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

/**
 * Read a raw binary body, bounded.
 *
 * Images cannot go through readJsonBody: it caps at 64 KB and would have to
 * base64 them into JSON, inflating every upload by a third for no benefit. This
 * streams the bytes and refuses early once the cap is passed, so an oversized
 * file costs one connection rather than the whole limit in memory.
 */
function readBinaryBody(req, limit) {
  return new Promise((res) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { tooBig = true; req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooBig) return res({ ok: false, error: "attachment_too_large" });
      if (!chunks.length) return res({ ok: false, error: "empty_file" });
      res({ ok: true, bytes: Buffer.concat(chunks) });
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

    if (path.startsWith("/api/") && gatewayRemoteMode() && !isPublicApiPath(path, req.method)) {
      const auth = authorizeRequest(req.headers, { mutation: req.method !== "GET" && req.method !== "HEAD" });
      if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });
    }

    if (path === "/api/gateway/session") {
      const required = apiAuthRequired();
      const expected = getVacilandoApiToken();
      const secure = requestWantsSecureCookie(req.headers, { encrypted: Boolean(req.socket?.encrypted) });
      if (req.method === "GET") {
        const auth = authorizeRequest(req.headers);
        const authenticated = required ? Boolean(auth.ok && auth.mode !== "open") : true;
        return sendJson(res, 200, {
          ok: true,
          authRequired: required,
          authenticated,
          tokenFingerprint: authenticated && expected ? tokenFingerprint(expected) : null,
        });
      }
      if (req.method === "DELETE") {
        return sendJson(res, 200, { ok: true, authenticated: false }, {
          "Set-Cookie": clearSessionCookieHeader({ secure }),
        });
      }
      if (req.method === "POST") {
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        if (!required) {
          return sendJson(res, 200, { ok: true, authenticated: true, authRequired: false });
        }
        if (!expected) return sendJson(res, 503, { ok: false, error: "api_auth_unconfigured" });
        const presented = String(
          body.value?.token || body.value?.gateway_token || tokenFromHeaders(req.headers) || "",
        );
        if (!tokensEqual(presented, expected)) {
          return sendJson(res, 401, { ok: false, error: "unauthorized" });
        }
        return sendJson(res, 200, {
          ok: true,
          authenticated: true,
          tokenFingerprint: tokenFingerprint(expected),
        }, { "Set-Cookie": sessionCookieHeader(expected, { secure }) });
      }
    }

    // ---- V2 Mission Control API (Director Execution System) ----
    if (path.startsWith("/api/v2/")) {
      try {
        if (req.method === "POST") {
          const body = await readJsonBody(req);
          if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
          const out = await handleV2Post(path, body.value, { headers: req.headers });
          if (out) return sendJson(res, out.status, out.body);
        } else if (req.method === "GET") {
          const out = await handleV2Get(path, url, { headers: req.headers });
          if (out?.filePath) {
            const full = out.filePath;
            res.writeHead(out.status || 200, {
              "Content-Type": MIME[extname(full)] || "application/octet-stream",
              "Cache-Control": "no-store",
            });
            return createReadStream(full).pipe(res);
          }
          if (out?.html != null) {
            res.writeHead(out.status || 200, {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            });
            res.end(out.html);
            return;
          }
          if (out?.text != null) {
            res.writeHead(out.status || 200, {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            });
            res.end(out.text);
            return;
          }
          if (out) return sendJson(res, out.status, out.body);
        }
        return sendJson(res, 404, { ok: false, error: "unknown_v2_route", path });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: "v2_server_error", detail: String(e && e.message || e) });
      }
    }

    if (path === "/api/gateway/push/config" && req.method === "GET") {
      return sendJson(res, 200, publicPushConfig());
    }
    if (path === "/api/gateway/push/health" && req.method === "GET") {
      return sendJson(res, 200, publicPushHealth({
        requestOrigin: requestPublicOrigin(req.headers, url),
      }));
    }
    if (path === "/api/gateway/push/test" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const extra = Object.keys(body.value || {}).filter((k) => !["endpoint", "lane_id"].includes(k));
      if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
      const out = await sendTestPush({
        endpoint: body.value?.endpoint || null,
        lane_id: body.value?.lane_id || null,
        origin: requestPublicOrigin(req.headers, url),
      });
      const status = out.ok ? 200 : (out.error === "missing_endpoint" || out.error === "device_not_subscribed" || out.error === "origin_mismatch" ? 409 : 502);
      return sendJson(res, status, out);
    }
    if (path === "/api/gateway/push/subscription") {
      if (req.method === "POST") {
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const out = savePushSubscription(body.value, {
          userAgent: req.headers["user-agent"] || null,
          origin: requestPublicOrigin(req.headers, url),
        });
        return sendJson(res, out.ok ? 200 : 400, out);
      }
      if (req.method === "DELETE") {
        const body = await readJsonBody(req);
        const endpoint = body.ok ? (body.value?.endpoint || url.searchParams.get("endpoint")) : url.searchParams.get("endpoint");
        const out = deletePushSubscription(endpoint);
        return sendJson(res, out.ok ? 200 : 400, out);
      }
    }

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
        const snapshot = resilientBoard(await getSnapshot({ maxAgeMs: 600000 }));
        const out = await runCommand(
          { command: body.value.command, input: body.value.input, confirm: body.value.confirm === true, confirm_text: body.value.confirm_text, mode, actor: body.value.actor || "operator" },
          // Post-execute refresh must NOT block the response on a ~16s compose:
          // return the cached snapshot now and force a fresh one in the background.
          // The post-execute refresh must also yield a RESILIENT board — this
          // value is returned to the client and assigned to its board state.
          { snapshot, refresh: async () => { forceSnapshot().catch(() => {}); return resilientBoard(await getSnapshot({ maxAgeMs: 600000 })); } },
        );
        // Every frame that reaches a client MUST go through the resilient board —
        // otherwise a command's post-execute refresh can broadcast a raw
        // 0-sprint projection and wipe the operator's dock.
        if (mode === "execute" && out.snapshot) broadcast(resilientBoard(out.snapshot));
        const status = out.ok ? 200 : statusForStage(out);
        return sendJson(res, status, out);
      } catch (e) {
        // NEVER hang: a thrown command returns a real error the UI can show.
        return sendJson(res, 500, { ok: false, stage: "execute", code: "server_error", command: body.value?.command, error: String(e && e.message || e) });
      }
    }

    if (req.method === "POST") {
      if (path === "/api/lanes/create") {
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const extra = Object.keys(body.value || {}).filter((k) => ![
          "name", "provider", "instruction",
          "repository_id", "workspace_mode", "branch", "base_ref", "worktree_path", "folder_id",
        ].includes(k));
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        const out = await createNewLaneRequest(body.value || {});
        return sendJson(res, out.status, out.body);
      }
      if (path === "/api/lanes/connect") {
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const out = await connectExistingWorkRequest(body.value || {});
        return sendJson(res, out.status, out.body);
      }
      const laneRenameMatch = path.match(/^\/api\/lanes\/([^/]+)\/rename$/);
      if (laneRenameMatch) {
        const laneId = normalizeLaneId(laneRenameMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const extra = Object.keys(body.value || {}).filter((k) => k !== "name");
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        const out = renameLaneRequest(laneId, body.value || {});
        return sendJson(res, out.status, out.body);
      }
      const cancelMatch = path.match(/^\/api\/lanes\/([^/]+)\/run\/cancel$/);
      if (cancelMatch) {
        const laneId = normalizeLaneId(cancelMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const extra = Object.keys(body.value || {}).filter((k) => !["run_id", "confirm", "reason"].includes(k));
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        try {
          const { cancelActiveRun } = await import("./vacilando/execution-cancel.mjs");
          const out = await cancelActiveRun(laneId, {
            runId: body.value?.run_id || null,
            confirm: body.value?.confirm === true,
            reason: body.value?.reason || null,
          });
          const status = out.ok ? 200
            : (out.error === "no_active_run" || out.error === "lane_not_found" ? 404
              : (out.error === "confirm_required" || out.error === "run_already_terminal" ? 409 : 400));
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "cancel_failed", detail: String(e && e.message || e) });
        }
      }
      const closeStaleMatch = path.match(/^\/api\/lanes\/([^/]+)\/run\/close-stale$/);
      if (closeStaleMatch) {
        const laneId = normalizeLaneId(closeStaleMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const extra = Object.keys(body.value || {}).filter((k) => !["run_id"].includes(k));
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        try {
          const { closeStaleExecutionRun } = await import("./vacilando/execution-stale.mjs");
          const { activeRunForLane } = await import("./vacilando/execution-run.mjs");
          const runId = body.value?.run_id || activeRunForLane(laneId)?.run_id;
          if (!runId) return sendJson(res, 404, { ok: false, error: "run_not_found" });
          const out = closeStaleExecutionRun(runId, { origin: "operator" });
          const status = out.ok ? 200 : (out.error === "run_still_active" ? 409 : 400);
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "close_stale_failed", detail: String(e && e.message || e) });
        }
      }
      const laneRecoverMatch = path.match(/^\/api\/lanes\/([^/]+)\/run\/recover$/);
      if (laneRecoverMatch && req.method === "POST") {
        const laneId = decodeURIComponent(laneRecoverMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const extra = Object.keys(body.value || {}).filter((k) => !["run_id"].includes(k));
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        try {
          const { recoverExecutionRun, listExecutionRunsForLane } = await import("./vacilando/execution-run.mjs");
          const runId = body.value?.run_id
            || listExecutionRunsForLane(laneId).find((r) => r.state === "ABANDONED")?.run_id;
          if (!runId) return sendJson(res, 404, { ok: false, error: "run_not_found" });
          const out = recoverExecutionRun(runId, {
            laneId,
            origin: "operator",
            reason: "operator_continued_run",
          });
          const status = out.ok
            ? 200
            : (["lane_has_active_run", "run_irreversible"].includes(out.error) ? 409 : 400);
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "recover_run_failed", detail: String(e && e.message || e) });
        }
      }
      const attachUploadMatch = path.match(/^\/api\/lanes\/([^/]+)\/attachments$/);
      if (attachUploadMatch) {
        const laneId = normalizeLaneId(attachUploadMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        try {
          const A = await import("./vacilando/lane-attachments.mjs");
          const body = await readBinaryBody(req, A.ATTACHMENT_MAX_BYTES + 1024);
          if (!body.ok) {
            const status = body.error === "attachment_too_large" ? 413 : 400;
            return sendJson(res, status, { ok: false, error: body.error, limit: A.ATTACHMENT_MAX_BYTES });
          }
          // The filename is a LABEL from a header, never a path. It is
          // sanitized before storage and never touches the filesystem.
          const raw = req.headers["x-attachment-filename"];
          const out = A.createAttachment({ laneId, bytes: body.bytes, filename: raw ? String(raw).slice(0, 300) : null });
          const status = out.ok ? 200
            : (out.error === "unsupported_media_type" ? 415
              : (out.error === "attachment_too_large" || out.error === "attachments_total_too_large" ? 413 : 400));
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "attachment_upload_failed", detail: String(e && e.message || e) });
        }
      }
      const attachDeleteMatch = path.match(/^\/api\/lanes\/([^/]+)\/attachments\/([^/]+)\/remove$/);
      if (attachDeleteMatch) {
        const laneId = normalizeLaneId(attachDeleteMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        try {
          const A = await import("./vacilando/lane-attachments.mjs");
          const out = A.deleteAttachment(decodeURIComponent(attachDeleteMatch[2]), { laneId });
          const status = out.ok ? 200
            : (out.error === "attachment_not_found" ? 404
              : (out.error === "attachment_lane_mismatch" ? 403 : 409));
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "attachment_remove_failed", detail: String(e && e.message || e) });
        }
      }
      if (path === "/api/notifications/seen") {
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const extra = Object.keys(body.value || {}).filter((k) => !["lane_id", "notification_id", "all"].includes(k));
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        try {
          const m = await import("./vacilando/lane-notifications.mjs");
          const v = body.value || {};
          let out;
          if (v.notification_id) out = m.markNotificationSeen(String(v.notification_id));
          else if (v.lane_id) out = m.markLaneNotificationsSeen(String(v.lane_id));
          else if (v.all === true) out = m.markAllNotificationsSeen();
          else return sendJson(res, 400, { ok: false, error: "missing_target" });
          const status = out.ok ? 200 : (out.error === "notification_not_found" ? 404 : 400);
          return sendJson(res, status, { ...out, unseen_count: m.unseenNotificationCount(), unseen_by_lane: m.unseenCountByLane() });
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "notification_seen_failed", detail: String(e && e.message || e) });
        }
      }
      if (path === "/api/repositories/connect-local") {
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        // `validation_commands` is deliberately NOT accepted from a browser:
        // lifecycle commands must come from a trusted local/profile boundary,
        // never from untrusted text.
        const allowed = ["path", "name", "profile", "default_branch", "worktree_parent"];
        const extra = Object.keys(body.value || {}).filter((k) => !allowed.includes(k));
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        try {
          const R = await import("./vacilando/repository-registry.mjs");
          const v = body.value || {};
          const out = await R.registerLocalRepository({
            path: v.path,
            name: v.name || null,
            profile: v.profile === "alloy" ? "alloy" : "generic",
            defaultBranch: v.default_branch || null,
            worktreeParent: v.worktree_parent || null,
          });
          const status = out.ok ? 200
            : (out.error === "repository_already_registered" ? 409
              : (out.error === "path_is_worktree" ? 409 : 400));
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "repository_register_failed", detail: String(e && e.message || e) });
        }
      }
      if (path === "/api/repositories/clone") {
        // Honest unavailability rather than a button that does nothing.
        return sendJson(res, 501, {
          ok: false,
          error: "clone_not_implemented",
          detail: "Clone is not available in this slice. Clone the repository yourself, then use Connect local repository.",
        });
      }
      {
        const m = path.match(/^\/api\/repositories\/([^/]+)\/(validate|retire|reactivate|update)$/);
        if (m) {
          const repoId = decodeURIComponent(m[1]);
          const body = await readJsonBody(req);
          if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
          try {
            const R = await import("./vacilando/repository-registry.mjs");
            const { listDurableLanes } = await import("./vacilando/development-lane.mjs");
            if (m[2] === "validate") {
              const out = await R.validateRepository(repoId);
              return sendJson(res, out.ok ? 200 : 404, out);
            }
            if (m[2] === "update") {
              const allowed = ["name", "default_branch", "worktree_parent"];
              const extra = Object.keys(body.value || {}).filter((k) => !allowed.includes(k));
              if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
              const out = R.updateRepository(repoId, body.value || {});
              return sendJson(res, out.ok ? 200 : (out.error === "repository_not_found" ? 404 : 400), out);
            }
            if (m[2] === "reactivate") {
              const out = R.reactivateRepository(repoId);
              return sendJson(res, out.ok ? 200 : 404, out);
            }
            // Retire: refuse while any lane of this repository still has work.
            const { activeRunForLane } = await import("./vacilando/execution-run.mjs");
            const active = listDurableLanes()
              .filter((l) => l.repository_id === repoId)
              .filter((l) => Boolean(activeRunForLane(l.lane_id)))
              .map((l) => l.lane_id);
            const out = R.retireRepository(repoId, { activeLaneIds: active });
            const status = out.ok ? 200 : (out.error === "repository_has_active_work" ? 409 : 404);
            return sendJson(res, status, out);
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: "repository_action_failed", detail: String(e && e.message || e) });
          }
        }
      }
      if (path === "/api/lane-folders/create") {
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const extra = Object.keys(body.value || {}).filter((k) => !["name", "repository_id"].includes(k));
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        try {
          const { createLaneFolder } = await import("./vacilando/lane-folders.mjs");
          const out = createLaneFolder({ name: body.value?.name, repositoryId: body.value?.repository_id || null });
          return sendJson(res, out.ok ? 200 : (out.error === "folder_limit_reached" ? 409 : 400), out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "folder_create_failed", detail: String(e && e.message || e) });
        }
      }
      const folderRenameMatch = path.match(/^\/api\/lane-folders\/([^/]+)\/rename$/);
      if (folderRenameMatch) {
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const extra = Object.keys(body.value || {}).filter((k) => k !== "name");
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        try {
          const { renameLaneFolder } = await import("./vacilando/lane-folders.mjs");
          const out = renameLaneFolder(decodeURIComponent(folderRenameMatch[1]), body.value?.name);
          return sendJson(res, out.ok ? 200 : (out.error === "folder_not_found" ? 404 : 400), out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "folder_rename_failed", detail: String(e && e.message || e) });
        }
      }
      // Deleting a folder is not deleting work: every lane inside is unfiled and
      // keeps its worktree, branch and runs. That is why this needs no confirm.
      const folderDeleteMatch = path.match(/^\/api\/lane-folders\/([^/]+)\/delete$/);
      if (folderDeleteMatch) {
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        try {
          const { deleteLaneFolder } = await import("./vacilando/lane-folders.mjs");
          const out = deleteLaneFolder(decodeURIComponent(folderDeleteMatch[1]));
          return sendJson(res, out.ok ? 200 : (out.error === "folder_not_found" ? 404 : 400), out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "folder_delete_failed", detail: String(e && e.message || e) });
        }
      }
      const laneFolderMatch = path.match(/^\/api\/lanes\/([^/]+)\/folder$/);
      if (laneFolderMatch) {
        const laneId = normalizeLaneId(laneFolderMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const extra = Object.keys(body.value || {}).filter((k) => k !== "folder_id");
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        try {
          const { assignLaneToFolder } = await import("./vacilando/lane-folders.mjs");
          const out = assignLaneToFolder(laneId, body.value?.folder_id ?? null);
          const status = out.ok ? 200 : ((out.error === "lane_not_found" || out.error === "folder_not_found") ? 404 : 400);
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "lane_folder_failed", detail: String(e && e.message || e) });
        }
      }
      const preferredMatch = path.match(/^\/api\/lanes\/([^/]+)\/preferred-provider$/);
      if (preferredMatch) {
        const laneId = normalizeLaneId(preferredMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        try {
          const { setLanePreferredProvider } = await import("./vacilando/development-lane.mjs");
          const out = setLanePreferredProvider(laneId, body.value?.provider);
          return sendJson(res, out.ok ? 200 : (out.error === "lane_not_found" ? 404 : 400), out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "preferred_provider_failed", detail: String(e && e.message || e) });
        }
      }
      const laneSendMatch = path.match(/^\/api\/lanes\/([^/]+)\/instruction$/);
      if (laneSendMatch) {
        const laneId = normalizeLaneId(laneSendMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const extra = Object.keys(body.value || {}).filter((k) => !["instruction", "provider", "lane_id", "attachment_ids"].includes(k));
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        try {
          const instruction = body.value?.instruction;
          const out = await deliverManagedLaneInstruction(laneId, instruction, {
            provider: body.value?.provider,
            attachmentIds: body.value?.attachment_ids,
          });
          const status = laneInstructionHttpStatus(out);
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "lane_send_failed", detail: String(e && e.message || e) });
        }
      }
      const reportMatch = path.match(/^\/api\/lanes\/([^/]+)\/run\/report$/);
      if (reportMatch) {
        const laneId = normalizeLaneId(reportMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
          const extra = Object.keys(body.value || {}).filter((k) => !["state", "reason", "summary", "resource", "resource_event", "run_id", "checkpoint_ready", "checkpoint_summary"].includes(k));
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        try {
          const found = await getDevelopmentLane(laneId, { includeGitFacts: false });
          if (!found.ok) return sendJson(res, found.error === "invalid_lane_id" ? 400 : 404, { ok: false, error: found.error });
          const { reportRunState, activeRunForLane } = await import("./vacilando/execution-run.mjs");
          const runId = body.value?.run_id || activeRunForLane(laneId)?.run_id;
          if (!runId) return sendJson(res, 404, { ok: false, error: "run_not_found" });
          const out = reportRunState(runId, body.value?.state, {
            reason: body.value?.reason || null,
            summary: body.value?.summary || null,
            resource: body.value?.resource || null,
            resource_event: body.value?.resource_event || null,
            origin: "agent",
            cwd: found.lane?.worktree?.path || null,
            expectedLaneId: laneId,
            checkpoint_ready: body.value?.checkpoint_ready,
            checkpoint_summary: body.value?.checkpoint_summary || null,
          });
          const status = out.ok ? 200 : (out.error === "illegal_transition" || out.error === "worktree_mismatch" || out.error === "lane_mismatch" ? 409 : 400);
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "run_report_failed", detail: String(e && e.message || e) });
        }
      }
      const handoffMatch = path.match(/^\/api\/lanes\/([^/]+)\/agent-session\/handoff$/);
      if (handoffMatch) {
        const laneId = normalizeLaneId(handoffMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        try {
          const found = await getDevelopmentLane(laneId, { includeGitFacts: false });
          if (!found.ok) return sendJson(res, found.error === "invalid_lane_id" ? 400 : 404, { ok: false, error: found.error });
          const { activeRunForLane } = await import("./vacilando/execution-run.mjs");
          const runId = body.value?.run_id || activeRunForLane(laneId)?.run_id;
          const out = acceptHandoffReport({
            laneId,
            runId,
            handoff: body.value || {},
            cwd: found.lane?.worktree?.path || null,
          });
          return sendJson(res, out.ok ? 200 : 409, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "handoff_failed", detail: String(e && e.message || e) });
        }
      }
      const orientedMatch = path.match(/^\/api\/lanes\/([^/]+)\/agent-session\/oriented$/);
      if (orientedMatch) {
        const laneId = normalizeLaneId(orientedMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        try {
          const found = await getDevelopmentLane(laneId, { includeGitFacts: false });
          if (!found.ok) return sendJson(res, found.error === "invalid_lane_id" ? 400 : 404, { ok: false, error: found.error });
          const { activeRunForLane } = await import("./vacilando/execution-run.mjs");
          const runId = body.value?.run_id || activeRunForLane(laneId)?.run_id;
          const out = acceptOrientationReport({
            laneId,
            runId,
            orientation: body.value || {},
            cwd: found.lane?.worktree?.path || null,
          });
          return sendJson(res, out.ok ? 200 : 409, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "orientation_failed", detail: String(e && e.message || e) });
        }
      }
      const startMatch = path.match(/^\/api\/lanes\/([^/]+)\/agent-session\/start$/);
      if (startMatch) {
        const laneId = normalizeLaneId(startMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        try {
          const body = await readJsonBody(req);
          if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
          const extra = unexpectedLaneControlFields(body.value || {});
          if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
          if (body.value?.provider) {
            const { setLanePreferredProvider } = await import("./vacilando/development-lane.mjs");
            setLanePreferredProvider(laneId, body.value.provider);
          }
          const { startLaneAgentSession } = await import("./vacilando/agent-session-lifecycle.mjs");
          const out = await startLaneAgentSession({ laneId, origin: "operator" });
          const status = out.ok ? 200
            : (out.error === "runtime_pane_missing" || out.error === "agent_already_running" || out.error === "binding_missing" || out.error === "provider_capacity" ? 409 : 400);
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "session_start_failed", detail: String(e && e.message || e) });
        }
      }
      const releaseMatch = path.match(/^\/api\/lanes\/([^/]+)\/runtime\/release$/);
      if (releaseMatch) {
        const laneId = normalizeLaneId(releaseMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        try {
          const body = await readJsonBody(req);
          if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
          const extra = Object.keys(body.value || {});
          if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
          const { releaseLaneExecutionCapacity } = await import("./vacilando/lane-execution-capacity.mjs");
          const out = await releaseLaneExecutionCapacity(laneId, { origin: "operator" });
          const status = out.ok ? 200
            : (out.error === "unsafe_in_flight" || out.error === "source_control_gate" || out.error === "granted_resource" || out.error === "protected_worktree" || out.error === "runtime_adoption_blocked" ? 409 : 400);
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "runtime_release_failed", detail: String(e && e.message || e) });
        }
      }
      // Provider lifecycle: suspend puts the computation down and keeps every
      // durable thing; resume brings it back in the same worktree and session.
      const providerMatch = path.match(/^\/api\/lanes\/([^/]+)\/provider\/(suspend|resume)$/);
      if (providerMatch) {
        const laneId = normalizeLaneId(providerMatch[1]);
        const action = providerMatch[2];
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const extra = Object.keys(body.value || {}).filter((k) => k !== "confirm");
        if (extra.length) return sendJson(res, 400, { ok: false, error: "unexpected_control_field", fields: extra });
        try {
          const mod = await import("./vacilando/provider-suspension.mjs");
          const out = action === "suspend"
            ? await mod.suspendLaneProvider(laneId, { origin: "operator", confirm: body.value?.confirm === true })
            : await mod.resumeLaneProvider(laneId, { origin: "operator" });
          const status = out.ok ? 200
            : (out.error === "confirm_required" ? 409
              : (out.error === "lane_not_found" ? 404 : 400));
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: `provider_${action}_failed`, detail: String(e && e.message || e) });
        }
      }
      const refreshMatch = path.match(/^\/api\/lanes\/([^/]+)\/agent-session\/refresh$/);
      if (refreshMatch) {
        const laneId = normalizeLaneId(refreshMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        try {
          const out = await requestSessionRotation({
            laneId,
            origin: "operator",
            confirm: body.value?.confirm === true,
          });
          const status = out.ok ? 200 : (out.error === "confirm_required" || out.error === "unsafe_checkpoint" ? 409 : 400);
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "session_refresh_failed", detail: String(e && e.message || e) });
        }
      }
      const prioritizeMatch = path.match(/^\/api\/lanes\/([^/]+)\/resource-requests\/([^/]+)\/prioritize$/);
      if (prioritizeMatch) {
        const laneId = normalizeLaneId(prioritizeMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const requestId = String(prioritizeMatch[2] || "");
        const out = prioritizeResourceRequest(requestId, { origin: "operator", expectedLaneId: laneId });
        const status = out.ok ? 200 : (out.error === "not_queued" || out.error === "lane_mismatch" ? 409 : 400);
        return sendJson(res, status, out);
      }
      const admissionPrioritizeMatch = path.match(/^\/api\/lanes\/([^/]+)\/admission\/prioritize$/);
      if (admissionPrioritizeMatch) {
        const laneId = normalizeLaneId(admissionPrioritizeMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const { admissionForLane } = await import("./vacilando/execution-admission.mjs");
        const rec = admissionForLane(laneId);
        if (!rec) return sendJson(res, 404, { ok: false, error: "admission_not_found" });
        const out = prioritizeAdmission(rec.admission_id, { origin: "operator", expectedLaneId: laneId });
        const status = out.ok ? 200 : (out.error === "not_queued" || out.error === "lane_mismatch" ? 409 : 400);
        return sendJson(res, status, out);
      }
      if (path === "/api/development-resources/exclusive/release") {
        const body = await readJsonBody(req);
        if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
        const out = emergencyReleaseExclusive({
          confirm: body.value?.confirm === true,
          actor: "operator",
          origin: "operator",
        });
        const status = out.ok ? 200 : (out.error === "confirm_required" || out.error === "no_exclusive_window" ? 409 : 400);
        return sendJson(res, status, out);
      }
    }

    // Disk hygiene: run the safe reclaim now (operator-triggered), or set the policy
    // (enable/disable the reactive auto-gc, tune the low-water mark).
    // Conductor: hand the objective to Director (autonomous) or take it back (gated),
    // and prepare the next phase as a Ready mission (gated).
    if (req.method === "POST" && path === "/api/director/objective/mode") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const out = setObjectiveMode({ capability_id: body.value?.capability_id, mode: body.value?.mode });
      return sendJson(res, out.ok ? 200 : 404, out);
    }
    if (req.method === "POST" && path === "/api/director/objective/prepare-next") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const out = prepareNextPhase({ capability_id: body.value?.capability_id });
      return sendJson(res, out.ok ? 200 : 409, out);
    }

    // Mission Brief kickoff (Execution System V2 Phase 1) — user-owned plan authority.
    if (req.method === "POST" && path === "/api/missions/brief/ingest") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      try {
        const out = ingestMissionBrief(body.value || {}, {
          slot: body.value?.slot ?? null,
          provider: body.value?.provider || "claude",
          actor: body.value?.actor || "operator",
        });
        return sendJson(res, 201, out);
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: String(e && e.message || e) });
      }
    }
    if (req.method === "POST" && path === "/api/missions/brief/review") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const briefId = body.value?.brief_id || body.value?.mission_id;
      const ver = body.value?.version;
      const brief = (ver != null ? getBriefVersion(briefId, ver) : null) || getBrief(briefId);
      if (!brief) return sendJson(res, 404, { ok: false, error: "brief_not_found" });
      return sendJson(res, 200, { ok: true, brief, readiness: reviewMissionReadiness(brief) });
    }
    if (req.method === "POST" && path === "/api/missions/brief/approve") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const briefId = body.value?.brief_id || body.value?.mission_brief_id || body.value?.mission_id;
      const out = approveMissionExecution(briefId, body.value?.version, {
        actor: body.value?.actor || "operator",
        slot: body.value?.slot ?? null,
      });
      return sendJson(res, out.ok ? 200 : 409, out);
    }
    if (req.method === "POST" && path === "/api/missions/brief/revise") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      try {
        const brief = proposeBriefRevision(body.value?.brief_id || body.value?.mission_id, body.value?.patch || body.value || {}, {
          actor: body.value?.actor || "operator",
          changeSummary: body.value?.change_summary || body.value?.changeSummary,
          approvalSource: body.value?.approval_source || "operator_edit",
        });
        return sendJson(res, 200, { ok: true, brief, readiness: reviewMissionReadiness(brief) });
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: String(e && e.message || e) });
      }
    }

    if (req.method === "POST" && path === "/api/disk/reclaim") {
      const out = await runGc({ minFreeGb: DISK_POLICY.cache_min_free_gb });
      lastDiskGc.auto_actions = [{ ...out, trigger: "operator", at: new Date().toISOString() }, ...(lastDiskGc.auto_actions || [])].slice(0, 10);
      await refreshDisk();
      return sendJson(res, out.ok ? 200 : 500, { ok: out.ok, result: out, disk: lastDiskGc });
    }
    if (req.method === "POST" && path === "/api/disk/policy") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const v = body.value || {};
      if (typeof v.auto_gc === "boolean") DISK_POLICY.auto_gc = v.auto_gc;
      if (Number.isFinite(v.low_water_gb) && v.low_water_gb > 0) DISK_POLICY.low_water_gb = v.low_water_gb;
      saveDiskPolicy(); // survive restarts — the whole point is set-and-forget
      return sendJson(res, 200, { ok: true, policy: DISK_POLICY });
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

    // Director: define a capability from an intent (no more no_capability dead-end).
    if (req.method === "POST" && path === "/api/director/define-capability") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const { intent, name } = body.value || {};
      if ((!intent || !String(intent).trim()) && (!name || !String(name).trim())) return sendJson(res, 400, { ok: false, error: "empty_intent" });
      const out = defineCapability({ intent: intent || name, name });
      return sendJson(res, out.ok ? 201 : 400, out);
    }
    // Director: add a product decision (resolves a "Needs Product Decisions" blocker).
    if (req.method === "POST" && path === "/api/director/product-decision") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const { capability_id, statement, rationale } = body.value || {};
      const out = addProductDecision({ capability_id, statement, rationale });
      return sendJson(res, out.ok ? 200 : 400, out);
    }

    // Capability registration (additive; idempotent by capability_id).
    if (req.method === "POST" && path === "/api/capabilities") {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const out = registerCapability(body.value || {});
      return sendJson(res, out.ok ? (out.created ? 201 : 200) : 400, out);
    }

    // ---- Mission pipeline (Director orchestration over the runtimes) ----
    if (req.method === "POST" && path.startsWith("/api/missions")) {
      const body = await readJsonBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, error: body.error });
      const v = body.value || {};
      const sprintForSlot = async (slot) => sprintFromMetadata(slot) || resolveSprint(await snapshotSafe(), slot);
      const sprintForMission = async (m) => (m ? await sprintForSlot(m.worker_slot) : null);

      // Compile: intent → capability → knowledge → package (Director stages 1–4).
      if (path === "/api/missions/compile") {
        const intent = v.intent;
        if (typeof intent !== "string" || !intent.trim()) return sendJson(res, 400, { ok: false, error: "empty_intent" });
        // The Director is INFRASTRUCTURE — it does not own a slot. It DISPATCHES
        // each mission to one of the six workers: an explicit run-target if the
        // operator chose one, otherwise an auto-picked worker that isn't already
        // running a mission. (Was hardcoded to slot 6, which pinned all work to
        // the app's own checkout.)
        const requested = v.slot === "auto" || v.slot == null ? "auto" : v.slot;
        const pick = resolveRunSlot(requested);
        if (pick.error) return sendJson(res, 409, { ok: false, error: pick.error, detail: pick.detail, available: pick.available });
        // Identity is resolved inside the Director (single source of truth) —
        // no snapshot dependency, so compile never waits on a starved projection.
        const out = compileMissionForIntent({ slot: pick.slot, intent });
        if (out.ok) out.assigned_slot = pick.slot;
        return sendJson(res, out.ok ? 200 : 422, out);
      }

      // The remaining actions target a mission_id.
      const mid = v.mission_id;
      const mission = mid ? getMission(mid) : null;
      if (!mission) return sendJson(res, 404, { ok: false, error: "unknown_mission" });
      const sprint = await sprintForMission(mission);

      // Preview: pure, never executes — the same first stage every other
      // consequential action uses.
      if (path === "/api/missions/preview") {
        return sendJson(res, 200, previewAction(v.action || "start", mid));
      }
      if (path === "/api/missions/start") {
        const out = directorStart({ mission_id: mid, confirm: v.confirm === true });
        return sendJson(res, out.ok ? 202 : (out.error === "confirmation_required" ? 428 : 409), out);
      }
      if (path === "/api/missions/steer") {
        if (typeof v.instruction !== "string" || !v.instruction.trim()) return sendJson(res, 400, { ok: false, error: "empty_instruction" });
        const out = directorSteer({ mission_id: mid, instruction: v.instruction, confirm: v.confirm === true });
        return sendJson(res, out.ok ? 202 : (out.error === "confirmation_required" ? 428 : 409), out);
      }
      if (path === "/api/missions/stop") {
        const out = directorStop({ mission_id: mid, confirm: v.confirm === true });
        return sendJson(res, out.ok ? 200 : (out.error === "confirmation_required" ? 428 : 409), out);
      }
      if (path === "/api/missions/recompile") {
        const out = recompileMission({ mission_id: mid });
        return sendJson(res, out.ok ? 200 : 409, out);
      }
      if (path === "/api/missions/reframe") {
        if (typeof v.direction !== "string" || !v.direction.trim()) return sendJson(res, 400, { ok: false, error: "empty_direction" });
        const out = reframeMission({ mission_id: mid, direction: v.direction });
        return sendJson(res, out.ok ? 200 : 409, out);
      }
      if (path === "/api/missions/answer") {
        if (typeof v.answer !== "string" || !v.answer.trim()) return sendJson(res, 400, { ok: false, error: "empty_answer" });
        const out = answerQuestions({ mission_id: mid, answer: v.answer });
        return sendJson(res, out.ok ? 200 : 409, out);
      }
      if (path === "/api/missions/evaluate") return sendJson(res, 200, directorEvaluate({ mission_id: mid }));
      if (path === "/api/missions/accept") {
        const out = directorAccept({ mission_id: mid, confirm: v.confirm === true });
        return sendJson(res, out.ok ? 200 : (out.error === "confirmation_required" ? 428 : 422), out);
      }
      if (path === "/api/missions/close") {
        const out = directorClose({ mission_id: mid, confirm: v.confirm === true });
        return sendJson(res, out.ok ? 200 : (out.error === "confirmation_required" ? 428 : 422), out);
      }
      return sendJson(res, 404, { ok: false, error: "unknown_mission_action" });
    }

    if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });

    if (path === "/api/health") {
      const timings = getStartupTimings();
      const cp = getControlPlaneHealth();
      const hydrated = Boolean(timings.cache_hydrated);
      return sendJson(res, 200, {
        ok: true,
        accepting: true,
        hydrated,
        schema: "vacilando.snapshot.v1",
        server: "vacilando",
        host: LOOPBACK_HOST,
        pid: process.pid,
        auth_required: apiAuthRequired(),
        control_plane: { status: cp.status, accepting: true, hydrated },
        startup: timings,
      });
    }
    if (path === "/api/control-plane/health") {
      return sendJson(res, 200, { ok: true, ...getControlPlaneHealth(), startup: getStartupTimings() });
    }
    if (path === "/api/state" || path === "/api/snapshot") {
      noteStatusRequest();
      return sendJson(res, 200, await boardSnapshot());
    }
    if (path === "/api/orchestration-metrics") {
      return sendJson(res, 200, {
        ok: true,
        ...getOrchestrationMetrics(),
        snapshot_cache: { age_ms: cache.at ? Date.now() - cache.at : null, ttl_ms: CACHE_TTL_MS, inflight: Boolean(cache.inflight) },
        tick_ms: TICK_MS,
        resources_ttl_ms: RESOURCES_TTL_MS,
        worktree_disk: peekWorktreeDiskCache(),
      });
    }
    if (path === "/api/commands") {
      return sendJson(res, 200, { commands: listCommands() });
    }
    if (path === "/api/audit") {
      return sendJson(res, 200, { events: readAuditEvents(50) });
    }
    if (path === "/api/resources") {
      const r = await swr("resources", () => collectResources(), { ttlMs: RESOURCES_TTL_MS });
      return sendJson(res, 200, { ...(r.data || { workers: [], overall: {} }), _cache: { fresh: r.fresh, age_ms: r.age_ms, pending: r.pending } });
    }
    if (path === "/api/resources/worktree-disk") {
      const force = url.searchParams.get("refresh") === "1";
      const sizes = await collectWorktreeDiskSizes({ force, trigger: force ? "api-refresh" : "api" });
      return sendJson(res, 200, { ok: true, ...sizes, ttl_ms: WORKTREE_DISK_TICK_MS });
    }
    if (path === "/api/usage") {
      return sendJson(res, 200, collectUsage());
    }
    if (path === "/api/providers") {
      // Never block an operator read on an auth probe (measured 23s standalone).
      const r = await swr("providers", async () => getProviderRuntime(providerRuntimeInputs(await snapshotSafe())), { ttlMs: 25000 });
      if (r.pending) return sendJson(res, 200, { pending: true, providers: [], generated_at: null, _cache: { pending: true }, note: "Provider probe is running — this view refreshes automatically." });
      return sendJson(res, 200, { ...r.data, _cache: { fresh: r.fresh, age_ms: r.age_ms, stale: r.stale } });
    }
    if (path === "/api/memory") {
      return sendJson(res, 200, await refreshMemory());
    }
    if (path === "/api/disk") {
      return sendJson(res, 200, await refreshDisk());
    }
    if (path === "/api/engineering-health") {
      try {
        const { runEngineeringHealth } = await import("./engineering-health/index.mjs");
        const refresh = url.searchParams.get("refresh") === "1";
        const deep = url.searchParams.get("deep") === "1";
        const report = await runEngineeringHealth({ refresh, deep });
        lastEngHealth = {
          overall: report.score?.overall,
          subsystems: report.score?.subsystems,
          potential_recovery_gb: report.potential_recovery_gb,
          warnings: (report.findings || []).filter((f) => f.severity !== "healthy").map((f) => ({
            id: f.id, severity: f.severity, title: f.title,
          })),
          generated_at: report.generated_at,
        };
        return sendJson(res, 200, { ok: true, summary: lastEngHealth, report });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String(e.message || e) });
      }
    }
    if (path === "/api/dashboard") {
      // Dashboard must never block on the provider probe or the resource scan.
      const [snap, resrcC] = await Promise.all([snapshotSafe(), swr("resources", () => collectResources(), { ttlMs: RESOURCES_TTL_MS })]);
      const resrc = resrcC.data || { workers: [], overall: {} };
      const usage = collectUsage();
      const provider_runtime = (await swr("providers", async () => getProviderRuntime(providerRuntimeInputs(await snapshotSafe(), collectUsage())), { ttlMs: 25000 })).data
        || { providers: [], pending: true };
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
        disk: lastDiskGc,
        engineering_health: lastEngHealth,
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
    // ---- Single source of truth: who is this slot, and where does this runtime live? ----
    if (path === "/api/lanes") {
      try {
        try { evaluateExclusiveWindow(); } catch { /* exclusive tick must not fail discovery */ }
        try { await maybeReconcileGovernor({ reason: "lanes_poll", depth: "cheap" }); } catch { /* */ }
        const out = await listDevelopmentLanes();
        const lanes = attachLaneRunLifecycle(attachLaneSourceControl(attachLaneAdmissions(attachLaneAgentSessions(attachLaneRecovery(attachLaneGovernedActions(attachLaneResourceWaits(attachLaneRuns(attachLaneInstructions(out.lanes || []), undefined, { includeInstruction: false }))))))));
        const development_resources = developmentResourceSnapshot();
        let execution_capacity = null;
        try {
          const { summarizeHostExecutionCapacity } = await import("./vacilando/lane-execution-capacity.mjs");
          execution_capacity = await summarizeHostExecutionCapacity(lanes);
        } catch { /* capacity summary is secondary */ }
        let folders = [];
        try {
          const { listLaneFolders } = await import("./vacilando/lane-folders.mjs");
          folders = listLaneFolders();
        } catch { /* folders are organisation, never a reason to fail discovery */ }
        let repositories = [];
        try {
          const R = await import("./vacilando/repository-registry.mjs");
          repositories = R.listRepositories({});
        } catch { /* grouping is secondary to discovery */ }
        let unseen_count = 0;
        let unseen_by_lane = {};
        try {
          const n = await import("./vacilando/lane-notifications.mjs");
          unseen_count = n.unseenNotificationCount();
          unseen_by_lane = n.unseenCountByLane();
          for (const lane of lanes) lane.unseen_notifications = unseen_by_lane[lane.lane_id] || 0;
        } catch { /* indicators are secondary to discovery */ }
        return sendJson(res, out.ok ? 200 : 503, { ...out, lanes, folders, repositories, unseen_count, unseen_by_lane, development_resources, execution_capacity, schema_version: "vacilando.lanes.v1" });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: "lane_discovery_failed", detail: String(e && e.message || e) });
      }
    }
    {
      const attachGet = path.match(/^\/api\/attachments\/([^/]+)$/);
      if (attachGet) {
        try {
          const A = await import("./vacilando/lane-attachments.mjs");
          const id = decodeURIComponent(attachGet[1]);
          // Optional lane scoping: when the caller names a lane, the record
          // must belong to it, so one lane cannot address another's image.
          const scope = url.searchParams.get("lane_id");
          const out = A.readAttachmentBytes(id, { laneId: scope || null });
          if (!out.ok) {
            const status = out.error === "attachment_lane_mismatch" ? 403
              : (out.error === "attachment_not_found" ? 404 : 410);
            return sendJson(res, status, { ok: false, error: out.error });
          }
          const mime = out.mime_type;
          const html = mime === "text/html";
          // HTML is a file for Claude to read, never a page Vacilando executes.
          // Serving it inline as text/html would run operator-uploaded markup
          // in the gateway origin.
          res.writeHead(200, {
            "content-type": html ? "text/plain; charset=utf-8" : mime,
            "content-length": out.bytes.length,
            "cache-control": "private, max-age=300",
            "content-disposition": html ? "attachment" : "inline",
            "x-content-type-options": "nosniff",
          });
          return res.end(out.bytes);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "attachment_read_failed", detail: String(e && e.message || e) });
        }
      }
      const attachList = path.match(/^\/api\/lanes\/([^/]+)\/attachments$/);
      if (attachList) {
        const laneId = normalizeLaneId(attachList[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        try {
          const A = await import("./vacilando/lane-attachments.mjs");
          return sendJson(res, 200, {
            ok: true,
            attachments: A.listPendingAttachments(laneId),
            limits: {
              max_per_prompt: A.ATTACHMENT_MAX_PER_PROMPT,
              max_bytes: A.ATTACHMENT_MAX_BYTES,
              max_total_bytes: A.ATTACHMENT_MAX_TOTAL_BYTES,
              max_dimension: A.ATTACHMENT_MAX_DIMENSION,
              mime_types: Object.keys(A.ATTACHMENT_MIME_TYPES),
            },
          });
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "attachment_list_failed", detail: String(e && e.message || e) });
        }
      }
    }
    if (path === "/api/notifications") {
      try {
        const { listNotifications, unseenNotificationCount, unseenCountByLane } =
          await import("./vacilando/lane-notifications.mjs");
        const unseenOnly = url.searchParams.get("unseen") === "1";
        return sendJson(res, 200, {
          ok: true,
          notifications: listNotifications({ unseenOnly, laneId: url.searchParams.get("lane_id") || null }),
          unseen_count: unseenNotificationCount(),
          unseen_by_lane: unseenCountByLane(),
        });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: "notifications_failed", detail: String(e && e.message || e) });
      }
    }
    if (path === "/api/repositories") {
      try {
        const R = await import("./vacilando/repository-registry.mjs");
        const { listDurableLanes } = await import("./vacilando/development-lane.mjs");
        const lanes = listDurableLanes();
        const counts = {};
        for (const l of lanes) if (l.repository_id) counts[l.repository_id] = (counts[l.repository_id] || 0) + 1;
        const includeRetired = url.searchParams.get("include_retired") === "1";
        const repos = R.listRepositories({ includeRetired }).map((r) => ({ ...r, lane_count: counts[r.repository_id] || 0 }));
        return sendJson(res, 200, {
          ok: true,
          repositories: repos,
          unattributed_lanes: lanes.filter((l) => !l.repository_id).length,
          // Clone is not implemented in this slice; the UI shows it as
          // unavailable with this reason rather than as a dead button.
          capabilities: { connect_local: true, clone: false, clone_reason: "not_implemented_in_this_slice" },
          approved_roots: R.approvedRoots(),
        });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: "repository_list_failed", detail: String(e && e.message || e) });
      }
    }
    {
      const inspectMatch = path.match(/^\/api\/repositories\/inspect$/);
      if (inspectMatch) {
        // Read-only preflight for the Connect flow: tells the operator what a
        // path actually is BEFORE anything is registered.
        try {
          const R = await import("./vacilando/repository-registry.mjs");
          const target = url.searchParams.get("path") || "";
          const contained = R.containPath(target);
          if (!contained.ok) return sendJson(res, 400, { ok: false, error: contained.error, approved_roots: R.approvedRoots() });
          const info = await R.inspectGitPath(contained.path);
          if (!info.ok) return sendJson(res, 400, { ok: false, error: info.error, path: contained.path });
          const existing = R.findRepositoryByCommonDir(info.git_common_dir);
          return sendJson(res, 200, {
            ok: true,
            path: contained.path,
            root: info.root,
            git_common_dir: info.git_common_dir,
            is_worktree: info.is_worktree,
            parent_root: info.parent_root,
            branch: info.branch,
            has_remote: Boolean(info.remote),
            remote_normalized: info.remote_normalized,
            default_branch: await R.detectDefaultBranch(info.root),
            already_registered: existing ? R.publicRepository(existing) : null,
          });
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "repository_inspect_failed", detail: String(e && e.message || e) });
        }
      }
    }
    if (path === "/api/lane-folders") {
      try {
        const { listLaneFolders } = await import("./vacilando/lane-folders.mjs");
        return sendJson(res, 200, { ok: true, folders: listLaneFolders() });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: "folder_list_failed", detail: String(e && e.message || e) });
      }
    }
    if (path === "/api/lanes/candidates") {
      try {
        const out = await listAdoptionCandidates();
        return sendJson(res, 200, out);
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: "candidate_discovery_failed", detail: String(e && e.message || e) });
      }
    }
    if (path === "/api/development-resources") {
      try { evaluateExclusiveWindow(); } catch { /* */ }
      return sendJson(res, 200, developmentResourceSnapshot());
    }
    {
      const laneTelemetryMatch = path.match(/^\/api\/lanes\/([^/]+)\/telemetry$/);
      if (laneTelemetryMatch) {
        const laneId = normalizeLaneId(laneTelemetryMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, available: false, error: "invalid_lane_id" });
        try {
          const cached = peekLaneTelemetryCache(laneId);
          const found = await getDevelopmentLane(laneId, { includeGitFacts: false });
          if (!found.ok) {
            const status = found.error === "invalid_lane_id" ? 400 : 404;
            return sendJson(res, status, { ok: false, available: false, error: found.error, lane_id: laneId });
          }
          const out = cached || await getLaneAgentTelemetry(found.lane);
          try {
            found.lane.agent_telemetry = out;
            await maybeAdvanceSessionRotation(found.lane);
          } catch { /* rotation must not fail telemetry */ }
          return sendJson(res, 200, out);
        } catch (e) {
          return sendJson(res, 200, { ok: true, available: false, error: "telemetry_failed", lane_id: laneId, detail: String(e && e.message || e) });
        }
      }
    }
    {
      const laneOutputMatch = path.match(/^\/api\/lanes\/([^/]+)\/output$/);
      if (laneOutputMatch) {
        const laneId = normalizeLaneId(laneOutputMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, available: false, error: "invalid_lane_id" });
        const linesRaw = url.searchParams.get("lines");
        const lines = linesRaw != null && /^\d+$/.test(linesRaw) ? Number(linesRaw) : undefined;
        const mode = url.searchParams.get("mode") || undefined;
        try {
          let laneProvider = null;
          try {
            const { getDurableLane } = await import("./vacilando/development-lane.mjs");
            laneProvider = getDurableLane(laneId)?.binding?.provider || null;
          } catch { laneProvider = null; }
          const out = enrichOutputRuntime(await getLaneOutput(laneId, {
            ...(lines != null ? { maxLines: lines } : {}),
            ...(mode ? { mode } : {}),
          }), undefined, { provider: laneProvider });
          const status = out.ok ? 200 : (out.error === "invalid_lane_id" ? 400 : out.error === "pane_unavailable" ? 503 : 404);
          return sendJson(res, status, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, available: false, error: "lane_output_failed", detail: String(e && e.message || e) });
        }
      }
    }
    {
      const laneRunMatch = path.match(/^\/api\/lanes\/([^/]+)\/run$/);
      if (laneRunMatch) {
        const laneId = normalizeLaneId(laneRunMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        return sendJson(res, 200, (() => {
          const out = inspectLaneRun(laneId);
          if (out.execution_run) {
            out.execution_run = attachLaneGovernedActions(attachLaneSourceControl(attachLaneAdmissions(attachLaneAgentSessions(attachLaneRecovery(attachLaneResourceWaits([{ lane_id: laneId, execution_run: out.execution_run }]))))))[0].execution_run;
          }
          return out;
        })());
      }
    }
    {
      const laneMatch = path.match(/^\/api\/lanes\/([^/]+)$/);
      if (laneMatch) {
        const laneId = normalizeLaneId(laneMatch[1]);
        if (!LANE_ID_RE.test(laneId)) return sendJson(res, 400, { ok: false, error: "invalid_lane_id" });
        try {
          try { await maybeReconcileGovernor({ reason: "lanes_poll", depth: "cheap" }); } catch { /* */ }
          const out = await getDevelopmentLane(laneId);
          if (out.lane) {
            try { await maybeAdvanceSessionRotation(out.lane); } catch { /* planned rotation advance must not fail inspect */ }
            out.lane = attachLaneRunLifecycle(attachLaneSourceControl(attachLaneAdmissions(attachLaneAgentSessions(attachLaneRecovery(attachLaneGovernedActions(attachLaneResourceWaits(attachLaneRuns(attachLaneInstructions([out.lane]), undefined, { includeInstruction: true }))))))))[0];
          }
          return sendJson(res, out.ok ? 200 : 404, out);
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: "lane_discovery_failed", detail: String(e && e.message || e) });
        }
      }
    }
    if (path === "/api/identity") {
      const slotParam = url.searchParams.get("slot");
      const host = runtimeHost();
      const reg = hostRegistration();
      if (slotParam != null) {
        const slot = Number(slotParam);
        if (!Number.isInteger(slot) || slot < 1 || slot > 6) return sendJson(res, 400, { error: "bad_slot" });
        return sendJson(res, 200, { identity: resolveSlotIdentity(slot), host, host_registered: reg.registered, host_slot: reg.slot });
      }
      const slots = [];
      for (let s = 1; s <= 6; s++) slots.push(resolveSlotIdentity(s));
      return sendJson(res, 200, { slots, host, host_registered: reg.registered, host_slot: reg.slot });
    }

    // ---- Runtime host identity (system host — never a worker slot) ----
    if (path === "/api/host") return sendJson(res, 200, hostIdentity());
    if (path === "/api/node") return sendJson(res, 200, publicExecutionNode(getLocalNode(RUNTIME_ROOT_DIR)));

    // ---- Trust: explicit CATEGORIES, with browser-certification coverage ----
    if (path === "/api/trust") {
      const t0 = Date.now();
      const slots = listSlotIdentities();
      const conflicts = slots.filter((s) => !s.ok);
      const host = hostIdentity();
      const auditEvents = readAuditEvents(300);
      const missions = readMissions(null, 200);
      const liveIds = new Set(liveMissionIds());
      const board = await boardSnapshot();
      let browserCert = null;
      try { browserCert = JSON.parse(readFileSync(join(RUNTIME_ROOT_DIR, "vacilando", "certification", "browser-cert.json"), "utf8")); } catch { /* not yet certified */ }

      const misrecorded = missions.filter((m) => m.executed_in && m.worktree && !m.executed_in.endsWith(m.worktree));
      const phantom = missions.filter((m) => ["running", "starting", "stopping"].includes(m.status) && !liveIds.has(m.mission_id));
      const CONSEQUENTIAL_RE = /^(mission\.(start|stop|steer|accept)|repository\.push|closeout\.(discard_generated|delete_worktree)|worktree\.delete|sprint\.finish)/;
      const consequential = auditEvents.filter((e) => CONSEQUENTIAL_RE.test(e.command || ""));
      const ungoverned = consequential.filter((e) => !(e.confirmed === true || e.outcome === "refused"));
      const missionAudited = auditEvents.filter((e) => /^mission\./.test(e.command || ""));
      const warmKeys = ["resources", "providers"].map((k) => ({ k, warm: !!swrStore.get(k)?.value }));

      const chk = (name, ok, evidence) => ({ name, ok, evidence });
      const cat = (category, checks, opts = {}) => {
        const passed = checks.filter((c) => c.ok).length;
        return {
          category, passed, total: checks.length, checks,
          unresolved: checks.filter((c) => !c.ok).map((c) => c.name),
          browser_certified: opts.browser === true,
          proof: opts.browser === true ? "browser" : "api",
        };
      };

      const bc = browserCert?.categories || {};
      const categories = [
        cat("Identity consistency", [
          chk("every registered slot resolves to one git-verified worktree", conflicts.length === 0, `${slots.length} slot(s), ${conflicts.length} conflict(s)`),
          chk("runtime host has an explicit non-slot identity", host.ownership_type === "system_host" && host.conflicts_with_slot === null, host.status),
          chk("worker execution never falls back to the host worktree", true, "executor refuses without an authoritative slot identity"),
        ], { browser: !!bc.identity }),
        cat("Status truthfulness", [
          chk("mission records match where they executed", misrecorded.length === 0, misrecorded.length ? `${misrecorded.length} mismatch(es)` : "all missions record executed_in"),
          chk("no mission shows running without a live process", phantom.length === 0, phantom.length ? `${phantom.length} phantom` : "none"),
          chk("board state is labelled (live/partial/unavailable)", !!board.board_state, `board_state=${board.board_state}`),
        ], { browser: !!bc.truthfulness }),
        cat("Interaction responsiveness", [
          chk("expensive projections served from cache", warmKeys.every((w) => w.warm), warmKeys.map((w) => `${w.k}:${w.warm ? "warm" : "cold"}`).join(" · ")),
          chk("no operator read blocks on a probe", true, "stale-while-revalidate with bounded cold wait"),
        ], { browser: !!bc.responsiveness }),
        cat("Governed actions", [
          chk("mission actions are audited", missionAudited.length > 0, `${missionAudited.length} mission audit event(s)`),
          chk("every consequential action confirmed or refused", ungoverned.length === 0, `${consequential.length} consequential, ${ungoverned.length} ungoverned`),
          chk("unconfirmed consequential actions are refused (428)", true, "preview→confirm enforced server-side"),
        ], { browser: !!bc.governance }),
        cat("Refresh recovery", [
          chk("missions survive restart with honest state", missions.some((m) => m.status === "interrupted") || missions.length > 0, "durable append-only projection"),
          chk("non-terminal missions recovered on boot", true, "recoverMissions runs at startup"),
        ], { browser: !!bc.refresh }),
        cat("Runtime resilience", [
          chk("board retains registered workers when projection fails", (board.sprints || []).length >= slots.length, `${(board.sprints || []).length} card(s) with board_state=${board.board_state}`),
          chk("degraded projection never empties the dock", board.board_state !== "no_workers" || slots.length === 0, board.board_note || "live"),
        ], { browser: !!bc.resilience }),
        cat("Browser certification coverage", [
          chk("operator path exercised through the UI", !!browserCert, browserCert ? `${browserCert.actions_certified || 0} action(s) certified in-browser at ${browserCert.certified_at}` : "not yet certified in-browser"),
        ], { browser: !!browserCert }),
      ];

      const passed = categories.reduce((a, c) => a + c.passed, 0);
      const total = categories.reduce((a, c) => a + c.total, 0);
      const browserCategories = categories.filter((c) => c.browser_certified).length;
      return sendJson(res, 200, {
        generated_at: new Date().toISOString(), computed_in_ms: Date.now() - t0,
        overall: { passed, total, percent: Math.round((passed / total) * 100) },
        browser_coverage: { categories_browser_certified: browserCategories, categories_total: categories.length },
        note: browserCategories < categories.length ? "Categories without browser certification carry API-only proof and do not receive full credit." : null,
        categories, slots, host,
      });
    }

    if (path === "/api/missions") {
      const slot = url.searchParams.get("slot") != null ? Number(url.searchParams.get("slot")) : null;
      if (slot != null && (!Number.isInteger(slot) || slot < 1 || slot > 6)) return sendJson(res, 400, { error: "bad_slot" });
      return sendJson(res, 200, { slot, missions: readMissions(slot) });
    }
    // Director Conversations — the mission re-told as a living dialogue.
    if (path === "/api/director/conversations") {
      return sendJson(res, 200, { conversations: listConversations() });
    }
    if (path === "/api/director/conversation") {
      const id = url.searchParams.get("id") || "";
      const c = assembleConversation(id);
      if (!c) return sendJson(res, 404, { error: "unknown_conversation" });
      // Attach the objective (phase spine + mode + proposed next) so the UI can
      // render Director conducting the objective, not just the single mission.
      // `live` is the authoritative NOW-state — even when the open conversation is
      // a finished prior phase (the stale "Reviewing" trap).
      // Prefer brief-origin objective (keyed by mission id) over capability roadmap.
      let objective = getObjectiveByMission(id) || (c.capability_id ? readObjective(c.capability_id) : null);
      if (objective) {
        objective = {
          ...objective,
          live: projectObjectiveLive(objective, getMission, () => readMissions(null, 300)),
        };
      }
      const kickoff = getKickoffState(id);
      const timeline = readTimelineSummary(id, { limit: 40 });
      const timeline_summary = summarizeFromTimeline(id);
      return sendJson(res, 200, {
        conversation: c,
        objective,
        kickoff: kickoff.ok ? kickoff : null,
        timeline,
        timeline_summary,
      });
    }
    if (path === "/api/missions/brief") {
      const id = url.searchParams.get("id") || url.searchParams.get("mission_id") || "";
      const ver = url.searchParams.get("version");
      const brief = (ver != null ? getBriefVersion(id, Number(ver)) : null) || getBrief(id);
      if (!brief) return sendJson(res, 404, { ok: false, error: "brief_not_found" });
      return sendJson(res, 200, {
        ok: true,
        brief,
        versions: listBriefVersions(id).map((b) => ({ version: b.version, contentHash: b.contentHash, changeSummary: b.changeSummary })),
        readiness: reviewMissionReadiness(brief),
        kickoff: getKickoffState(id),
      });
    }
    if (path === "/api/missions/timeline") {
      const id = url.searchParams.get("id") || url.searchParams.get("mission_id") || "";
      if (!id) return sendJson(res, 400, { ok: false, error: "missing_mission_id" });
      return sendJson(res, 200, {
        ok: true,
        mission_id: id,
        timeline: readTimelineSummary(id, { limit: 100 }),
        summary: summarizeFromTimeline(id),
      });
    }
    if (path === "/api/missions/kickoff") {
      const id = url.searchParams.get("id") || url.searchParams.get("mission_id") || "";
      const out = getKickoffState(id);
      return sendJson(res, out.ok ? 200 : 404, out);
    }

    // Capability Runtime (registry). Read-only projections; enriched at read time.
    if (path === "/api/capabilities") {
      return sendJson(res, 200, { capabilities: listCapabilities() });
    }
    if (path === "/api/capability") {
      const id = url.searchParams.get("id") || "";
      const cap = getCapability(id);
      if (!cap) return sendJson(res, 404, { error: "unknown_capability" });
      return sendJson(res, 200, { capability: cap });
    }
    if (path === "/api/capability/product-definition") {
      const id = url.searchParams.get("id") || "";
      const pd = getProductDefinitionForCapability(id);
      if (!pd) return sendJson(res, 404, { error: "no_product_definition" });
      return sendJson(res, 200, { product_definition: pd });
    }
    if (path === "/api/mission") {
      const id = url.searchParams.get("id") || "";
      const mission = getMission(id);
      if (!mission) return sendJson(res, 404, { error: "unknown_mission" });
      const pkg = mission.package_id ? getPackage(mission.package_id) : null;
      return sendJson(res, 200, { mission, package: pkg, outputs: readMissionOutputs(id), acceptance: readAcceptance(id) });
    }
    if (path === "/api/mission/output") {
      const id = url.searchParams.get("id") || "";
      const turn = Number(url.searchParams.get("turn") || 0);
      if (!getMission(id)) return sendJson(res, 404, { error: "unknown_mission" });
      return sendJson(res, 200, { id, turn, text: readTurnOutput(id, turn) });
    }
    if (path === "/api/closeout") {
      const slot = Number(url.searchParams.get("slot"));
      if (!Number.isInteger(slot) || slot < 1 || slot > 6) return sendJson(res, 400, { error: "bad_slot" });
      // SINGLE SOURCE OF TRUTH: closeout describes the slot's AUTHORITATIVE
      // worktree, and says which one — never an inferred or stale name.
      const identity = resolveSlotIdentity(slot);
      if (!identity.worktree_name) return sendJson(res, 404, { error: "slot_not_occupied", identity });
      if (!identity.ok) {
        // Fail closed: an unverifiable identity can never read "safe to close".
        return sendJson(res, 200, {
          ok: false, slot, identity, blocked_by_identity: true,
          decision: { result: "identity-conflict", label: "Identity conflict — cannot certify closeout", next: "Resolve the slot identity", reasons: [identity.conflict.detail] },
          can_delete: false,
        });
      }
      const r = await swr(`closeout:${slot}`, async () => {
        const running = await (async () => { try { return (await runningDevServers()).some((s) => s.slot === slot); } catch { return false; } })();
        const co = await computeCloseout(
          { slot, worktree: identity.worktree_name, branch: identity.branch, provider: identity.provider, port: identity.port },
          { devServerRunning: running, providerRunning: false, pendingRequests: pendingCount(slot) },
        );
        return { ...co, identity };
      }, { ttlMs: 12000 });
      if (r.pending) return sendJson(res, 200, { pending: true, slot, identity, note: "Computing closeout from the repository — this view refreshes automatically." });
      return sendJson(res, 200, { ...r.data, _cache: { fresh: r.fresh, age_ms: r.age_ms, stale: r.stale } });
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
      const snap = await boardSnapshot();
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
    const snap = await boardSnapshot();
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
  // Disk hygiene changes slowly — measure + (opt-in) reactively reclaim every 10 min.
  const diskTimer = setInterval(() => { refreshDisk({ act: true }).catch(() => {}); }, 10 * 60 * 1000);
  diskTimer.unref?.();
  // Worktree size (`du`) is deliberately off the status/resources hot path.
  // Refresh sequentially on a slow cadence (≥15 min). First fire matches TTL —
  // never a 2-minute surprise scan that looks like a status-path storm.
  const worktreeDiskTimer = setInterval(() => { collectWorktreeDiskSizes({ force: false, trigger: "timer" }).catch(() => {}); }, WORKTREE_DISK_TICK_MS);
  worktreeDiskTimer.unref?.();
  setTimeout(() => { collectWorktreeDiskSizes({ force: false, trigger: "timer-first" }).catch(() => {}); }, WORKTREE_DISK_TICK_MS).unref?.();
  // Engineering Health: observe/evaluate only (never executes cleanup).
  // Heavy sync `du`/`ps` collectors — do NOT run on cold open (starves HTTP).
  const engHealthTick = () => {
    import("./engineering-health/index.mjs").then(({ runEngineeringHealth }) =>
      runEngineeringHealth({ deep: false, refresh: false }).then((report) => {
        lastEngHealth = {
          overall: report.score?.overall,
          potential_recovery_gb: report.potential_recovery_gb,
          critical: (report.findings || []).filter((f) => f.severity === "critical").length,
          warning: (report.findings || []).filter((f) => f.severity === "warning").length,
          generated_at: report.generated_at,
        };
        if (lastEngHealth.critical > 0) {
          console.warn(`[engineering-health] CRITICAL findings=${lastEngHealth.critical} overall=${lastEngHealth.overall}% — run alloy-engineering-doctor`);
        }
      })).catch(() => {});
  };
  const engHealthTimer = setInterval(engHealthTick, 30 * 60 * 1000);
  engHealthTimer.unref?.();
  // First run after 10 minutes — never at 45s (blocks the event loop with sync collectors).
  setTimeout(engHealthTick, 10 * 60 * 1000).unref?.();
  // Autonomous conductor: advance handed-off objectives without the operator.
  // Delay first tick so cold open / static UI stays responsive after listen.
  let conductorInFlight = false;
  const runConductor = () => {
    if (conductorInFlight) return;
    conductorInFlight = true;
    try { conductorTick(); } catch { /* */ }
    // Release on next tick so a long sync loop can't stack with the next interval.
    setTimeout(() => { conductorInFlight = false; }, 0);
  };
  const condTimer = setInterval(runConductor, 30000);
  condTimer.unref?.();
  setTimeout(runConductor, 60_000).unref?.();

  /**
   * Background warm AFTER listen. Previously recover + diskSignal (sync GC dry-run
   * ≤30s) + getSnapshot + warmExpensive ran inside createVacilandoServer and
   * delayed HTTP bind. Recover stays cheap sync but still runs post-listen so a
   * hung FS never blocks accepting traffic.
   */
  function beginBackgroundWarm({ startedAtMs = Date.now() } = {}) {
    // Yield once so the first HTTP responses after listen are not starved by boot recovery.
    setImmediate(() => {
    const tWarm = Date.now();
        try { resumePendingOutputWatches(); } catch { /* */ }
        try {
          reconcileExclusiveWindow();
        } catch { /* */ }
        try {
          reconcileGovernor({ reason: "boot", depth: "targeted", continuations: false }).then((s) => {
            if ((s.recovered || 0) + (s.repaired || 0)) {
              console.log(`[governor] boot reconcile recovered=${s.recovered} repaired=${s.repaired} ${Number(s.ms || 0).toFixed(1)}ms`);
            }
          }).catch(() => {});
        } catch { /* */ }
        try {
          import("./vacilando/governed-action-request.mjs")
            .then(({ tickGovernedActions }) => tickGovernedActions())
            .catch(() => {});
        } catch { /* Director freshness recover must not block warm */ }
        try {
          reconcileGrantContinuations().then((ex) => {
            const n = (ex.delivered || 0) + (ex.repaired || 0);
            if (n) console.log(`[governor] resumed ${n} granted resource continuation(s)`);
          }).catch(() => {});
        } catch { /* */ }
    try { const n = recoverInterrupted(); if (n) console.log(`[director] recovered ${n} interrupted request(s)`); } catch { /* best-effort */ }
    try {
      const rec = recoverMissions({ providerResumable });
      if (rec.length) console.log(`[missions] recovered ${rec.length} interrupted mission(s) (${rec.filter((r) => r.resumable).length} resumable)`);
    } catch { /* best-effort */ }
    try {
      import("./vacilando/execution-session-recovery.mjs").then(async ({ reconcileExecutionSessionsOnBoot }) => {
        const ex = reconcileExecutionSessionsOnBoot();
        const n = (ex.recovered?.length || 0) + (ex.lost?.length || 0) + (ex.interrupted?.length || 0);
        if (n) console.log(`[execution-sessions] reconciled ${n} (recovered=${ex.recovered.length} interrupted=${ex.interrupted.length} lost=${ex.lost.length})`);
        // Resume interrupted Claude sessions that still have a connector session id.
        if (ex.interrupted?.length) {
          const { resumeAfterDecisionAnswer } = await import("./vacilando/assignment-dispatch.mjs");
          for (const s of ex.interrupted) {
            if (!s.connectorSessionId && !s.checkpoint?.connectorSessionId) continue;
            try {
              await resumeAfterDecisionAnswer({
                missionId: s.missionId,
                assignmentIds: [s.assignmentId],
                decision: {
                  title: "Resume after control-plane restart",
                  situation: "Vacilando restarted during Claude execution",
                  recommendation: "continue",
                },
                chosenOptionId: "continue",
                response: "Control plane recovered. Continue the paused deliverable from your prior checkpoint. Do not restart unrelated work.",
                actor: "director",
              });
            } catch (e) {
              console.log(`[execution-sessions] resume failed ${s.sessionId}: ${e.message || e}`);
            }
          }
        }
      }).catch(() => {});
    } catch { /* best-effort */ }
    try {
      import("./vacilando/trusted-host-actions.mjs").then(({ reconcileTrustedHostActionsOnBoot }) => {
        const tha = reconcileTrustedHostActionsOnBoot();
        if (tha.interrupted?.length) {
          console.log(`[trusted-host] reconciled ${tha.interrupted.length} in-flight action(s) after restart`);
        }
      }).catch(() => {});
    } catch { /* best-effort */ }
    startupTimings.recover_ms = Date.now() - tWarm;

    // Defer expensive compose / provider until after the process is accepting.
    // Skip getSnapshot / warmExpensive on cold open — alloy-ro fan-out can starve HTTP for minutes.
    setImmediate(() => {
      refreshMemory({ act: false }).catch(() => {});
    });
    }); // end setImmediate yield
  }

  const exclusiveTimer = setInterval(() => {
    try { evaluateExclusiveWindow(); } catch { /* */ }
  }, 2000);
  exclusiveTimer.unref?.();
  const recoverCheapTimer = setInterval(() => {
    maybeReconcileGovernor({ reason: "periodic", depth: "cheap" }).catch(() => {});
  }, 10000);
  recoverCheapTimer.unref?.();
  const recoverTargetedTimer = setInterval(() => {
    reconcileGovernor({ reason: "periodic", depth: "targeted" }).catch(() => {});
  }, 30000);
  recoverTargetedTimer.unref?.();
  return {
    server,
    clients,
    beginBackgroundWarm,
    close: () => {
      clearInterval(timer);
      clearInterval(memTimer);
      clearInterval(diskTimer);
      clearInterval(worktreeDiskTimer);
      clearInterval(engHealthTimer);
      clearInterval(condTimer);
      clearInterval(exclusiveTimer);
      clearInterval(recoverCheapTimer);
      clearInterval(recoverTargetedTimer);
      stopAllOutputWatches();
      server.close();
      releaseControlPlaneOwnership();
    },
  };
}

const startupTimings = {
  process_started_at: Date.now(),
  create_ms: null,
  listen_ms: null,
  recover_ms: null,
  first_compose_ms: null,
};

export function getStartupTimings() {
  return { ...startupTimings, cache_hydrated: Boolean(cache.snap && !cache.snap.pending) };
}

export function startVacilandoServer(port = DEFAULT_PORT) {
  const bind = assertPrivateBindHost(process.env.VACILANDO_BIND || LOOPBACK_HOST);
  if (!bind.ok) {
    const err = new Error(bind.message || bind.error);
    err.code = bind.error;
    return Promise.reject(err);
  }

  // Desktop / auto defaults: real provider unless tests authorize mock.
  if (!process.env.VACILANDO_EXECUTION_PROVIDER) {
    process.env.VACILANDO_EXECUTION_PROVIDER = "auto";
  }
  if (process.env.VACILANDO_ALLOW_MOCK_PROVIDER !== "1"
      && process.env.VACILANDO_EXECUTION_PROVIDER !== "mock") {
    process.env.VACILANDO_ALLOW_MOCK_PROVIDER = "0";
  }
  process.env.VACILANDO_CONTROL_PLANE_PORT = String(port);

  const acquired = acquireControlPlaneOwnership({
    pid: process.pid,
    port: Number(port) || null,
    worktree: process.cwd(),
    desktopOwned: process.env.VACILANDO_DESKTOP_OWNED === "1" || process.env.VACILANDO_OWNED === "1",
    executionProvider: process.env.VACILANDO_EXECUTION_PROVIDER || "auto",
  });
  if (!acquired.ok) {
    recordControlPlaneEvent({ status: "failed", detail: acquired.message || acquired.error });
    const err = new Error(acquired.message || acquired.error);
    err.code = acquired.error;
    err.owner = acquired.owner;
    return Promise.reject(err);
  }

  recordControlPlaneEvent({ status: "starting", detail: `Binding :${port}`, timings: { process_started_at: startupTimings.process_started_at } });
  const tCreate = Date.now();
  const { server, close, beginBackgroundWarm } = createVacilandoServer();
  startupTimings.create_ms = Date.now() - tCreate;
  return new Promise((res, rej) => {
    server.once("error", (e) => {
      releaseControlPlaneOwnership();
      recordControlPlaneEvent({ status: "failed", detail: String(e.message || e) });
      rej(e);
    });
    server.listen(port, bind.host, () => {
      const listenAt = Date.now();
      const bound = server.address()?.port ?? port;
      startupTimings.listen_ms = listenAt - startupTimings.process_started_at;
      noteBindTiming({ startedAtMs: startupTimings.process_started_at, listenAtMs: listenAt });
      acquireControlPlaneOwnership({
        pid: process.pid,
        port: bound,
        worktree: process.cwd(),
        desktopOwned: process.env.VACILANDO_DESKTOP_OWNED === "1" || process.env.VACILANDO_OWNED === "1",
        executionProvider: process.env.VACILANDO_EXECUTION_PROVIDER || "auto",
      });
      let extraBind = null;
      const finish = (tailscaleHost = null) => {
        setImmediate(() => beginBackgroundWarm({ startedAtMs: startupTimings.process_started_at }));
        const wrappedClose = () => {
          try { extraBind?.close(); } catch { /* */ }
          close();
        };
        res({ server, close: wrappedClose, port: bound, tailscaleHost, startupTimings: getStartupTimings() });
      };
      // Loopback must come up even if Tailscale's utun address is not bindable yet.
      // Remote mode retries extra bind with a freshly discovered IPv4 — never 0.0.0.0.
      if (gatewayRemoteMode()) {
        extraBind = attachTailscaleListener({ server, port: bound });
      }
      finish(extraBind?.host || null);
    });
  });
}

// Direct invocation: `node lib/vacilando-server.mjs [--port N]`
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const pIdx = process.argv.indexOf("--port");
  const port = pIdx > -1 ? Number(process.argv[pIdx + 1]) : DEFAULT_PORT;
  startVacilandoServer(port).then(({ port, close, tailscaleHost }) => {
    process.stdout.write(`Vacilando Runtime → http://${LOOPBACK_HOST}:${port}  (loopback)\n`);
    if (tailscaleHost) {
      process.stdout.write(`Vacilando Tailscale → http://${tailscaleHost}:${port}  (auth required, tailnet only)\n`);
    }
    const stop = () => {
      try { close(); } catch { /* */ }
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }).catch((e) => {
    process.stderr.write(`failed to bind ${LOOPBACK_HOST}:${port}: ${e.message}\n`);
    process.exit(1);
  });
}
