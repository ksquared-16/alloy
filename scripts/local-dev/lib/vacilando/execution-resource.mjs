/**
 * Vacilando Governor Phase 2 — normalized resource read model + Execution Run
 * resource requests. Does not replace alloy-compute / vac-run / sprint-ops.
 *
 * Resource Request owns queue/grant state.
 * Execution Run.resource_wait is a projection.
 *
 * Automatic resource allocation is allowed.
 * Automatic Claude continuation is not.
 *
 * Convergence: Resource Request is authoritative for queue/grant. The
 * Execution Run stores a projection on resource_wait. This module is not
 * the mission resource-claims store and does not rewrite alloy-compute.
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  getExecutionRun,
  isTerminalRunState,
  patchRunResourceWait,
  transitionExecutionRun,
} from "./execution-run.mjs";
import { acquireBrowserCertLease, releaseBrowserCertLease } from "../browser-cert-lease.mjs";
import { LANE_ID_RE } from "./lanes.mjs";
import { canonicalLaneStoreId } from "./development-lane.mjs";
import { orchestrateDirectorGovernedWait } from "./governed-action-request.mjs";
import {
  EXCLUSIVE_RESOURCE_KEY,
  attachLaneExclusivePosture,
  bindExclusiveResourceApi,
  exclusiveBlocksNewGrant,
  exclusiveGrantRelease,
  exclusiveProjection,
  exclusiveSnapshotFields,
  evaluateExclusiveWindow,
  resetExclusiveForTests,
} from "./execution-exclusive.mjs";

export const RESOURCE_REQUEST_SCHEMA = "vacilando.resource_request.v1";
export const RESOURCE_REQUEST_MAX = 64;
export const RESOURCE_CLASSES = Object.freeze(["SHARED", "CAPACITY_LIMITED", "EXCLUSIVE_NAMED", "MACHINE_EXCLUSIVE"]);
export const REQUEST_STATES = Object.freeze(["REQUESTED", "QUEUED", "GRANTED", "RELEASED", "CANCELLED", "FAILED"]);
const ACTIVE_REQUEST = new Set(["REQUESTED", "QUEUED", "GRANTED"]);

export const DEV_SERVER_CAP = 3;

const REGISTRY = Object.freeze([
  {
    key: "browser_certification",
    aliases: ["browser-certification", "browser_cert"],
    class: "EXCLUSIVE_NAMED",
    label: "Browser certification",
    authority: "alloy-compute browser-certification",
    authority_key: "browser-certification",
    capacity: 1,
    queueable: true,
    governor_mutable: true,
    wired: true,
    stale_source: "alloy-compute permit pid + min reclaim age 900s",
    release_authority: "alloy-compute release via browser-cert-lease",
    phase2_mutability: "request/queue/read; grant/release through existing lease API",
    resume_state: "VALIDATING",
  },
  {
    key: "validate",
    aliases: ["validation", "heavy_validate", "vac-run"],
    class: "EXCLUSIVE_NAMED",
    label: "Heavy validation",
    authority: "vac-run / alloy-validate / lib/lock.sh",
    capacity: 1,
    queueable: false,
    governor_mutable: false,
    wired: true,
    stale_source: "validate lock PID or heartbeat > 90s",
    release_authority: "vac-run holder",
    phase2_mutability: "read-only snapshot; workers already queue in vac-run",
    notes: "Serializes heavy validation. NOT machine-exclusive timing.",
  },
  {
    key: "dev_servers",
    aliases: ["heavy_next_dev_live", "next_dev"],
    class: "CAPACITY_LIMITED",
    label: "Dev servers",
    authority: "sprint-ops ALLOY_MAX_RUNNING_SERVERS",
    capacity: DEV_SERVER_CAP,
    queueable: false,
    governor_mutable: false,
    wired: true,
    stale_source: "slot PID files / worker doctor",
    release_authority: "alloy-dev-start / pause / finish",
    phase2_mutability: "read-only; do not merge with unwired heavy-next-dev cap 2",
  },
  {
    key: "full_typecheck",
    aliases: ["full-typecheck"],
    class: "EXCLUSIVE_NAMED",
    label: "Full typecheck permit",
    authority: "alloy-compute full-typecheck",
    authority_key: "full-typecheck",
    capacity: 1,
    queueable: false,
    governor_mutable: false,
    wired: false,
    stale_source: "alloy-compute permit",
    release_authority: "alloy-compute release",
    phase2_mutability: "declared, unwired — do not acquire",
  },
  {
    key: "heavy_next_dev",
    aliases: ["heavy-next-dev"],
    class: "CAPACITY_LIMITED",
    label: "Heavy Next dev permit",
    authority: "alloy-compute heavy-next-dev",
    authority_key: "heavy-next-dev",
    capacity: 2,
    queueable: false,
    governor_mutable: false,
    wired: false,
    stale_source: "alloy-compute permit",
    release_authority: "alloy-compute release",
    phase2_mutability: "declared, unwired — live cap is sprint-ops 3",
  },
  {
    key: "runtime_timing_certification",
    aliases: ["exclusive_timing", "machine_exclusive"],
    class: "MACHINE_EXCLUSIVE",
    label: "Exclusive machine timing",
    authority: "vacilando machine-exclusive window",
    capacity: 1,
    queueable: true,
    governor_mutable: true,
    wired: true,
    stale_source: "window deadline + owner run health",
    release_authority: "explicit resource release / emergency operator release",
    phase2_mutability: "request/queue/grant after quietness; separate from validate",
    resume_state: "VALIDATING",
    notes: "MACHINE_EXCLUSIVE authority. Not the validate lease. Not browser-cert.",
  },
  {
    key: "docker_stack",
    aliases: ["alloy-stack"],
    class: "EXCLUSIVE_NAMED",
    label: "Shared Docker stack",
    authority: "alloy-stack leases",
    capacity: 1,
    queueable: false,
    governor_mutable: false,
    wired: true,
    stale_source: "stack lease TTL / worktree gone",
    release_authority: "alloy-stack release",
    phase2_mutability: "KEEP; not queueable by Execution Runs",
  },
  {
    key: "control_plane",
    aliases: ["control-plane"],
    class: "EXCLUSIVE_NAMED",
    label: "Control plane",
    authority: "control-plane-owner.json per runtime root",
    capacity: 1,
    queueable: false,
    governor_mutable: false,
    wired: true,
    stale_source: "dead owner pid replaced",
    release_authority: "releaseControlPlaneOwnership",
    phase2_mutability: "KEEP; Gateway already isolated",
  },
]);

const ALIAS = new Map();
for (const rec of REGISTRY) {
  ALIAS.set(rec.key, rec);
  for (const a of rec.aliases || []) ALIAS.set(String(a).replace(/-/g, "_"), rec);
  ALIAS.set(String(rec.key).replace(/_/g, "-"), rec);
}

export function listResourceRegistry() {
  return REGISTRY.map((r) => ({ ...r }));
}

export function normalizeResourceKey(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const snake = s.replace(/-/g, "_");
  return ALIAS.get(snake) || ALIAS.get(s) || null;
}

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

function hostRuntimeRoot() {
  return join(homedir(), ".local", "state", "alloy-dev");
}

function computeStateDir() {
  return process.env.ALLOY_COMPUTE_STATE_DIR?.trim()
    || join(homedir(), ".local", "state", "alloy", "compute");
}

export function resourceRequestStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "resource-requests.json");
}

export function resourceRequestEventsPath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "resource-events.jsonl");
}

function emptyStore() {
  return { schema_version: RESOURCE_REQUEST_SCHEMA, requests: [] };
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function readResourceRequestStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(resourceRequestStorePath(root), "utf8"));
    const requests = Array.isArray(raw?.requests) ? raw.requests : [];
    return { schema_version: RESOURCE_REQUEST_SCHEMA, requests };
  } catch {
    return emptyStore();
  }
}

function writeStore(store, root) {
  store.requests = (store.requests || []).slice(-RESOURCE_REQUEST_MAX);
  atomicWrite(resourceRequestStorePath(root), store);
  return store;
}

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

function newRequestId(runId, key, nowMs) {
  return "ereq_" + createHash("sha256")
    .update(`${runId}:${key}:${nowMs}:${randomBytes(4).toString("hex")}`)
    .digest("hex")
    .slice(0, 16);
}

export function emitResourceEvent(type, rec, root, extra = {}) {
  const line = JSON.stringify({
    type,
    request_id: rec.request_id,
    run_id: rec.run_id,
    lane_id: rec.lane_id,
    resource_key: rec.resource_key,
    at: iso(),
    origin: rec.origin || "system",
    ...extra,
  });
  try {
    const path = resourceRequestEventsPath(root);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${line}\n`, "utf8");
  } catch { /* best-effort */ }
}

function parsePermitFile(path) {
  try {
    const out = {};
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
    }
    return out;
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try { process.kill(n, 0); return true; } catch { return false; }
}

export function readComputeHolders(authorityKey) {
  const dir = join(computeStateDir(), authorityKey);
  if (!existsSync(dir)) return [];
  const holders = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".permit")) continue;
    const rec = parsePermitFile(join(dir, name));
    if (!rec) continue;
    const holder = rec.HOLDER || name.replace(/\.permit$/, "");
    holders.push({
      holder,
      pid: rec.PID || null,
      alive: pidAlive(rec.PID),
      worktree: rec.WORKTREE || null,
      reason: rec.REASON || null,
      created: rec.CREATED || null,
      governor: String(holder).startsWith("vac-erun_"),
    });
  }
  return holders;
}

export function readValidateSnapshot() {
  const lockDir = join(hostRuntimeRoot(), "locks", "validate.lock");
  const ownerPath = join(lockDir, "owner.env");
  if (!existsSync(lockDir)) {
    return { held: false, holders: [], health: "available" };
  }
  const rec = parsePermitFile(ownerPath) || {};
  const pid = rec.ALLOY_VALIDATE_PID || rec.PID;
  const alive = pidAlive(pid);
  return {
    held: true,
    holders: [{
      holder: rec.ALLOY_VALIDATE_WORKTREE || rec.ALLOY_VALIDATE_REQUEST_ID || "validate",
      pid: pid || null,
      alive,
      kind: rec.ALLOY_VALIDATE_KIND || null,
    }],
    health: alive ? "held" : "stale_owner",
  };
}

function readDevServerSnapshot() {
  const dir = join(hostRuntimeRoot(), "pids");
  let running = 0;
  const holders = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".pid") || name.endsWith(".provider.pid")) continue;
      let pid = "";
      try { pid = readFileSync(join(dir, name), "utf8").trim(); } catch { continue; }
      if (!pidAlive(pid)) continue;
      running += 1;
      holders.push({ holder: name.replace(/\.pid$/, ""), pid });
    }
  }
  return {
    held_count: running,
    capacity: DEV_SERVER_CAP,
    holders,
    health: running >= DEV_SERVER_CAP ? "at_capacity" : "available",
  };
}

function compareQueue(a, b) {
  const pa = Number(a.priority) || 0;
  const pb = Number(b.priority) || 0;
  if (pb !== pa) return pb - pa;
  const ta = a.requested_at || "";
  const tb = b.requested_at || "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return String(a.request_id).localeCompare(String(b.request_id));
}

export function queuedRequestsFor(store, resourceKey) {
  return (store.requests || [])
    .filter((r) => r.resource_key === resourceKey && r.state === "QUEUED")
    .slice()
    .sort(compareQueue);
}

export function queuePositionFor(store, request) {
  if (!request || request.state !== "QUEUED") return null;
  const q = queuedRequestsFor(store, request.resource_key);
  const i = q.findIndex((r) => r.request_id === request.request_id);
  return i >= 0 ? i + 1 : null;
}

export function activeRequestForRunResource(runId, resourceKey, root = runtimeRoot()) {
  const store = readResourceRequestStore(root);
  return (store.requests || []).find((r) =>
    r.run_id === runId && r.resource_key === resourceKey && ACTIVE_REQUEST.has(r.state)
  ) || null;
}

function putRequest(store, rec) {
  const rest = (store.requests || []).filter((r) => r.request_id !== rec.request_id);
  store.requests = [...rest, rec];
  return store;
}

export function getResourceRequest(requestId, root = runtimeRoot()) {
  const store = readResourceRequestStore(root);
  return (store.requests || []).find((r) => r.request_id === requestId) || null;
}

export function patchResourceRequest(requestId, patch, { root = runtimeRoot(), event = null, extra = {} } = {}) {
  const store = readResourceRequestStore(root);
  const rec = (store.requests || []).find((r) => r.request_id === requestId);
  if (!rec) return null;
  const { continuation, ...rest } = patch || {};
  Object.assign(rec, rest);
  if (continuation) rec.continuation = { ...(rec.continuation || {}), ...continuation };
  writeStore(putRequest(store, rec), root);
  if (event) emitResourceEvent(event, rec, root, extra);
  syncRunProjection(rec, root);
  return rec;
}

export function ensureGrantContinuation(rec, { root = runtimeRoot(), nowMs = Date.now() } = {}) {
  if (!rec || rec.state !== "GRANTED") return rec;
  const episode = rec.granted_at || iso(nowMs);
  if (rec.continuation?.grant_episode === episode && rec.continuation.continuation_id) {
    return rec;
  }
  const continuation = {
    continuation_id: "econ_" + createHash("sha256")
      .update(`${rec.request_id}:${episode}`)
      .digest("hex")
      .slice(0, 16),
    kind: "resource_granted",
    delivery_state: "PENDING",
    created_at: iso(nowMs),
    delivered_at: null,
    attempt_count: 0,
    last_error: null,
    grant_episode: episode,
  };
  return patchResourceRequest(rec.request_id, { continuation }, { root, event: "continuation_created" }) || rec;
}

function governorHolder(runId) {
  return `vac-${runId}`;
}

let grantImpl = null;
let resumeHook = null;
let reclaimHook = null;
let grantReclaimDepth = 0;

export function setResourceGrantImplForTests(impl) {
  grantImpl = impl;
}

export function setResourceResumeHook(fn) {
  resumeHook = typeof fn === "function" ? fn : null;
}

export function setResourceReclaimHook(fn) {
  reclaimHook = typeof fn === "function" ? fn : null;
}

export function resourceGrantIsInjected() {
  return grantImpl != null;
}

export function resumeStateFor(resourceKey) {
  return normalizeResourceKey(resourceKey)?.resume_state || null;
}

function defaultGrant(rec) {
  if (rec.resource_key === EXCLUSIVE_RESOURCE_KEY) {
    return { ok: false, error: "exclusive_requires_quietness" };
  }
  if (rec.resource_key !== "browser_certification") {
    return { ok: false, error: "not_grantable" };
  }
  if (grantImpl) return grantImpl("acquire", rec);
  const holder = rec.holder || governorHolder(rec.run_id);
  const out = acquireBrowserCertLease({
    wait: false,
    holder,
    reason: `execution-run ${rec.run_id}`,
  });
  return { ...out, holder };
}

function defaultRelease(rec, root, nowMs) {
  if (rec.resource_key === EXCLUSIVE_RESOURCE_KEY) {
    return exclusiveGrantRelease(rec, root, nowMs);
  }
  if (rec.resource_key !== "browser_certification") {
    return { ok: true };
  }
  if (grantImpl) return grantImpl("release", rec);
  return releaseBrowserCertLease(rec.holder || governorHolder(rec.run_id));
}

function projectWait(rec, store, root = runtimeRoot()) {
  const def = normalizeResourceKey(rec.resource_key);
  const pos = queuePositionFor(store, rec);
  const cont = rec.continuation || null;
  const delivered = cont?.delivery_state === "DELIVERED";
  const resuming = rec.state === "GRANTED" && cont && (cont.delivery_state === "PENDING" || cont.delivery_state === "DELIVERING");
  const ready = rec.state === "GRANTED" && !delivered;
  const exclusive = exclusiveProjection(rec, root) || {};
  return {
    resource_key: rec.resource_key,
    resource_class: rec.resource_class,
    label: def?.label || rec.resource_key,
    request_id: rec.request_id,
    request_state: rec.state,
    queue_position: pos,
    ready_to_resume: ready,
    resuming,
    continuation_id: cont?.continuation_id || null,
    continuation_state: cont?.delivery_state || null,
    resume_event: delivered ? {
      kind: "resource_granted",
      label: def?.label || rec.resource_key,
      summary: `${def?.label || rec.resource_key} granted. Vacilando resumed this run automatically.`,
    } : null,
    grant_pending_continuation: ready,
    ...exclusive,
  };
}

function syncRunProjection(rec, root) {
  const store = readResourceRequestStore(root);
  patchRunResourceWait(rec.run_id, projectWait(rec, store, root), root);
}

function reevaluateGovernor(root, nowMs) {
  evaluateExclusiveWindow(root, nowMs);
  tryGrantHead("browser_certification", root, nowMs);
}

export function evaluateResourceQueue(resourceKey, root = runtimeRoot(), nowMs = Date.now()) {
  const out = tryGrantHead(resourceKey, root, nowMs);
  if (resourceKey !== EXCLUSIVE_RESOURCE_KEY) evaluateExclusiveWindow(root, nowMs);
  return out;
}

function tryGrantHead(resourceKey, root, nowMs) {
  const def = normalizeResourceKey(resourceKey);
  if (!def?.queueable || !def.governor_mutable) return null;
  if (def.key === EXCLUSIVE_RESOURCE_KEY) {
    return evaluateExclusiveWindow(root, nowMs);
  }
  if (exclusiveBlocksNewGrant(def.key, root)) return null;
  const store = readResourceRequestStore(root);
  if ((store.requests || []).some((r) => r.resource_key === resourceKey && r.state === "GRANTED")) {
    return null;
  }
  const head = queuedRequestsFor(store, resourceKey)[0];
  if (!head) return null;
  if (def.authority_key) {
    const ownHolder = governorHolder(head.run_id);
    const blocking = () => readComputeHolders(def.authority_key)
      .filter((h) => h.holder !== ownHolder);
    let holders = blocking();
    if (holders.some((h) => h.alive)) return null;
    const dead = holders.filter((h) => !h.alive);
    if (dead.length && typeof reclaimHook === "function" && grantReclaimDepth === 0) {
      grantReclaimDepth += 1;
      try {
        reclaimHook({
          holders: dead,
          resource_key: resourceKey,
          root,
          nowMs,
        });
      } catch { /* recovery must not fail grant evaluation */ }
      finally {
        grantReclaimDepth -= 1;
      }
      const after = readResourceRequestStore(root);
      if ((after.requests || []).some((r) => r.resource_key === resourceKey && r.state === "GRANTED")) {
        return (after.requests || []).find((r) => r.resource_key === resourceKey && r.state === "GRANTED") || null;
      }
      const nextHead = queuedRequestsFor(after, resourceKey)[0];
      if (!nextHead || nextHead.request_id !== head.request_id) return null;
      holders = blocking();
    }
    if (holders.some((h) => h.alive)) return null;
    if (holders.length) {
      head.state_reason = "resource blocked by stale owner";
      writeStore(putRequest(store, head), root);
      emitResourceEvent("resource_blocked_stale_owner", head, root);
      return head;
    }
  }
  const acq = defaultGrant(head);
  if (!acq?.ok) {
    emitResourceEvent("resource_grant_failed", head, root, { error: acq?.error || "grant_failed" });
    return null;
  }
  head.state = "GRANTED";
  head.granted_at = iso(nowMs);
  head.holder = acq.holder || governorHolder(head.run_id);
  head.ready_to_resume = true;
  writeStore(putRequest(store, head), root);
  emitResourceEvent("resource_granted", head, root);
  syncRunProjection(head, root);
  if (typeof resumeHook === "function") {
    try { resumeHook({ ...head }, { root, nowMs }); } catch { /* resume must not fail the grant */ }
  }
  return head;
}

export function ensureResourceRequest({
  runId,
  laneId,
  resourceKey,
  reason = null,
  origin = "agent",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const run = getExecutionRun(runId, root);
  if (!run) return { ok: false, error: "run_not_found" };
  if (laneId && run.lane_id !== laneId
      && canonicalLaneStoreId(run.lane_id, root) !== canonicalLaneStoreId(laneId, root)) {
    return { ok: false, error: "lane_mismatch" };
  }
  if (!LANE_ID_RE.test(run.lane_id)) return { ok: false, error: "invalid_lane_id" };
  const def = normalizeResourceKey(resourceKey);
  if (!def) return { ok: false, error: "unsupported_resource" };

  const existing = activeRequestForRunResource(run.run_id, def.key, root);
  if (existing) {
    if (existing.state === "QUEUED") tryGrantHead(def.key, root, nowMs);
    const latest = activeRequestForRunResource(run.run_id, def.key, root) || existing;
    syncRunProjection(latest, root);
    return { ok: true, request: latest, duplicate: true };
  }

  const rec = {
    request_id: newRequestId(run.run_id, def.key, nowMs),
    run_id: run.run_id,
    lane_id: run.lane_id,
    resource_key: def.key,
    resource_class: def.class,
    requested_at: iso(nowMs),
    state: def.queueable ? "QUEUED" : "REQUESTED",
    priority: 0,
    granted_at: null,
    released_at: null,
    reason: reason ? String(reason).slice(0, 500) : null,
    origin: origin || "agent",
    holder: null,
    ready_to_resume: false,
  };
  const store = readResourceRequestStore(root);
  writeStore(putRequest(store, rec), root);
  emitResourceEvent(rec.state === "QUEUED" ? "resource_queued" : "resource_requested", rec, root);
  if (rec.state === "QUEUED") tryGrantHead(def.key, root, nowMs);
  const latest = activeRequestForRunResource(run.run_id, def.key, root) || rec;
  syncRunProjection(latest, root);
  return { ok: true, request: latest, duplicate: false };
}

export function releaseResourceRequest(requestId, {
  origin = "system",
  nowMs = Date.now(),
  root = runtimeRoot(),
  expectedRunId = null,
  expectedLaneId = null,
} = {}) {
  const store = readResourceRequestStore(root);
  const rec = (store.requests || []).find((r) => r.request_id === requestId);
  if (!rec) return { ok: false, error: "request_not_found" };
  if (expectedRunId && rec.run_id !== expectedRunId) return { ok: false, error: "run_mismatch" };
  if (expectedLaneId && rec.lane_id !== expectedLaneId
      && canonicalLaneStoreId(rec.lane_id, root) !== canonicalLaneStoreId(expectedLaneId, root)) {
    return { ok: false, error: "lane_mismatch" };
  }
  const key = rec.resource_key;
  if (rec.state === "GRANTED") {
    const rel = defaultRelease(rec, root, nowMs);
    if (rel && rel.ok === false) return { ok: false, error: "release_failed" };
  }
  rec.state = rec.state === "GRANTED" ? "RELEASED" : "CANCELLED";
  rec.released_at = iso(nowMs);
  rec.origin = origin || rec.origin;
  rec.ready_to_resume = false;
  if (rec.continuation && rec.continuation.delivery_state !== "DELIVERED") {
    rec.continuation = {
      ...rec.continuation,
      delivery_state: "FAILED",
      last_error: rec.state === "CANCELLED" ? "cancelled" : "released",
    };
  }
  writeStore(putRequest(store, rec), root);
  emitResourceEvent(rec.state === "RELEASED" ? "resource_released" : "resource_cancelled", rec, root);
  syncRunProjection(rec, root);
  reevaluateGovernor(root, nowMs);
  return { ok: true, request: rec };
}

export function cleanupRunResources(runId, {
  origin = "system",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const store = readResourceRequestStore(root);
  const active = (store.requests || []).filter((r) => r.run_id === runId && ACTIVE_REQUEST.has(r.state));
  const out = [];
  for (const rec of active) {
    out.push(releaseResourceRequest(rec.request_id, { origin, nowMs, root, expectedRunId: runId }));
  }
  return out;
}

export function prioritizeResourceRequest(requestId, {
  origin = "operator",
  nowMs = Date.now(),
  root = runtimeRoot(),
  expectedLaneId = null,
} = {}) {
  if (origin !== "operator") return { ok: false, error: "operator_only" };
  const store = readResourceRequestStore(root);
  const rec = (store.requests || []).find((r) => r.request_id === requestId);
  if (!rec) return { ok: false, error: "request_not_found" };
  if (expectedLaneId && rec.lane_id !== expectedLaneId
      && canonicalLaneStoreId(rec.lane_id, root) !== canonicalLaneStoreId(expectedLaneId, root)) {
    return { ok: false, error: "lane_mismatch" };
  }
  if (rec.state !== "QUEUED") return { ok: false, error: "not_queued" };
  rec.priority = 1;
  rec.origin = "operator";
  rec.updated_at = iso(nowMs);
  writeStore(putRequest(store, rec), root);
  emitResourceEvent("resource_prioritized", rec, root, { origin: "operator" });
  syncRunProjection(rec, root);
  return { ok: true, request: rec, queue_position: queuePositionFor(readResourceRequestStore(root), rec) };
}

export function onExecutionRunTransition({ run, from, to, resource, reason, origin, nowMs, root }) {
  if (!run?.run_id) return;
  if (to === "WAITING_RESOURCE") {
    const key = resource?.resource_key || resource?.key || run.resource_wait?.resource_key;
    if (!key) return;
    if (key === "director_governed_action") {
      orchestrateDirectorGovernedWait({
        run,
        wait: resource || run.resource_wait,
        reason,
        origin,
        nowMs,
        root,
      });
      return;
    }
    ensureResourceRequest({
      runId: run.run_id,
      laneId: run.lane_id,
      resourceKey: key,
      reason,
      origin,
      nowMs,
      root,
    });
    return;
  }
  if (from === "VALIDATING" && to === "EXECUTING") {
    cleanupRunResources(run.run_id, { origin: origin || "system", nowMs, root });
    return;
  }
  if (isTerminalRunState(to)) {
    cleanupRunResources(run.run_id, { origin: origin || "system", nowMs, root });
  }
}

export function attachLaneResourceWaits(lanes, root = runtimeRoot()) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  const store = readResourceRequestStore(root);
  const withWait = list.map((lane) => {
    const run = lane?.execution_run;
    if (!run?.run_id) return lane;
    const rec = (store.requests || []).find((r) =>
      r.run_id === run.run_id && ACTIVE_REQUEST.has(r.state)
    );
    if (!rec) return lane;
    return {
      ...lane,
      execution_run: {
        ...run,
        resource_wait: projectWait(rec, store, root),
      },
    };
  });
  return attachLaneExclusivePosture(withWait, root);
}

export function developmentResourceSnapshot(root = runtimeRoot()) {
  const store = readResourceRequestStore(root);
  const exclusiveFields = exclusiveSnapshotFields(root);
  const resources = REGISTRY.map((def) => {
    const queued = queuedRequestsFor(store, def.key);
    const granted = (store.requests || []).filter((r) => r.resource_key === def.key && r.state === "GRANTED");
    let holders = granted.map((r) => ({
      holder: r.holder,
      run_id: r.run_id,
      lane_id: r.lane_id,
      source: "governor",
    }));
    let health = "available";
    let heldCount = holders.length;
    let extra = {};

    if (def.key === "browser_certification") {
      const compute = readComputeHolders(def.authority_key);
      extra.authority_holders = compute.map((h) => ({
        holder: h.holder,
        alive: h.alive,
        governor: h.governor,
      }));
      const stale = compute.filter((h) => h.alive === false);
      if (stale.length) health = "stale_owner";
      else if (compute.length || granted.length) health = "held";
      heldCount = Math.max(compute.length, granted.length);
    } else if (def.key === "validate") {
      const v = readValidateSnapshot();
      extra.authority = v;
      holders = v.holders;
      health = v.health;
      heldCount = v.held ? 1 : 0;
    } else if (def.key === "dev_servers") {
      const d = readDevServerSnapshot();
      extra.authority = d;
      holders = d.holders;
      health = d.health;
      heldCount = d.held_count;
    } else if (def.key === "runtime_timing_certification") {
      const mex = exclusiveFields.machine_exclusive;
      extra.exclusive = {
        phase: mex.phase,
        detail: mex.detail || null,
        conflict_count: mex.conflict_count,
      };
      if (granted.length) health = "held";
      else if (mex.phase === "DRAINING_CONFLICTS") health = "draining";
      else if (mex.phase === "VERIFYING_QUIET") health = "verifying";
      else if (mex.phase || queued.length) health = "reserving";
      else health = "available";
    } else if (!def.wired) {
      health = "unwired";
    }

    return {
      key: def.key,
      class: def.class,
      label: def.label,
      capacity: def.capacity,
      wired: def.wired,
      queueable: def.queueable,
      governor_mutable: def.governor_mutable,
      held_count: heldCount,
      holders,
      queue: queued.map((r, i) => ({
        request_id: r.request_id,
        run_id: r.run_id,
        lane_id: r.lane_id,
        position: i + 1,
        requested_at: r.requested_at,
        priority: r.priority || 0,
      })),
      health,
      ...extra,
    };
  });
  return {
    schema_version: "vacilando.development_resources.v1",
    resources,
    ...exclusiveFields,
  };
}

export function resetResourceRequestsForTests(root = runtimeRoot()) {
  writeStore(emptyStore(), root);
  try {
    const p = resourceRequestEventsPath(root);
    if (existsSync(p)) writeFileSync(p, "", "utf8");
  } catch { /* */ }
  grantImpl = null;
  grantReclaimDepth = 0;
  resetExclusiveForTests(root);
}

bindExclusiveResourceApi({
  readStore: readResourceRequestStore,
  queuedFor: queuedRequestsFor,
  patchRequest: patchResourceRequest,
  emit: emitResourceEvent,
  onGranted: (rec, ctx) => {
    if (typeof resumeHook === "function") {
      try { resumeHook(rec, ctx); } catch { /* resume must not fail the grant */ }
    }
  },
  evaluateConflictingQueues: (root, nowMs) => {
    tryGrantHead("browser_certification", root, nowMs);
  },
  readComputeHolders,
  readValidate: readValidateSnapshot,
  getExecutionRun: (runId, root) => getExecutionRun(runId, root),
  isTerminalRunState: (state) => isTerminalRunState(state),
  transitionExecutionRun: (runId, to, opts) => transitionExecutionRun(runId, to, opts),
});
