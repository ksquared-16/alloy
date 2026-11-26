/**
 * Vacilando — Resource claims (Execution System V2 §12).
 *
 * Ports, build locks, and CPU-heavy jobs. Prevents unsafe concurrent full
 * TypeScript/build jobs. Integrates with heavy-validation-guard doctrine.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { appendTimelineEvent } from "./timeline.mjs";
import { isUnbrokeredHeavyCommand } from "./heavy-validation-guard.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const FILE = join(RUNTIME_ROOT, "vacilando", "resource-claims.json");

const CAPACITY = {
  worker_slot: 6,
  port: 1, // per port number
  build_lock: 1,
  cpu_heavy_job: 1,
  database: 1,
  browser: 2,
  migration_sequence: 1,
};

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function read() {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return { schema_version: "vacilando.resource_claims.v1", claims: [] };
  }
}

function write(store) {
  const dir = join(RUNTIME_ROOT, "vacilando");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(FILE, JSON.stringify(store, null, 2));
  return store;
}

function activeClaims(store = read()) {
  return (store.claims || []).filter((c) => c.status === "held");
}

export function listResourceClaims({ type = null, missionId = null } = {}) {
  let claims = activeClaims();
  if (type) claims = claims.filter((c) => c.type === type);
  if (missionId) claims = claims.filter((c) => c.missionId === missionId);
  return claims;
}

/**
 * Attempt to claim a resource. build_lock / cpu_heavy_job are exclusive (capacity 1).
 */
export function claimResource({
  type,
  resourceKey = null,
  missionId = null,
  assignmentId = null,
  workerId = null,
  slot = null,
  capacity = null,
  actor = "director",
  nowMs,
} = {}) {
  if (!type) return { ok: false, error: "missing_type" };
  const store = read();
  const key = resourceKey || type;
  const cap = capacity ?? CAPACITY[type] ?? 1;
  const held = activeClaims(store).filter((c) => c.type === type && (c.resourceKey || c.type) === key);
  if (held.length >= cap) {
    return {
      ok: false,
      error: "resource_conflict",
      message: `${type}:${key} already claimed`,
      holders: held,
    };
  }

  // Extra safety: refuse unbrokered heavy commands as claim payloads
  if ((type === "build_lock" || type === "cpu_heavy_job") && resourceKey && isUnbrokeredHeavyCommand(resourceKey)) {
    return {
      ok: false,
      error: "unbrokered_heavy_job",
      message: "Raw tsc/next build must go through vac / alloy-validate",
    };
  }

  const claim = {
    claimId: "rcl_" + createHash("sha256").update(`${type}:${key}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 12),
    type,
    resourceKey: key,
    missionId,
    assignmentId,
    workerId,
    slot,
    status: "held",
    claimed_at: iso(nowMs),
    claimed_by: actor,
  };
  store.claims.push(claim);
  write(store);

  if (missionId) {
    appendTimelineEvent(missionId, {
      type: "resource_claim",
      summary: `Claimed ${type}:${key}`,
      visibility: "diagnostic",
      assignmentId,
      actor,
      detail: claim,
      nowMs,
    });
  }
  return { ok: true, claim };
}

export function releaseResource(claimId, { actor = "director", nowMs } = {}) {
  const store = read();
  const claim = store.claims.find((c) => c.claimId === claimId);
  if (!claim) return { ok: false, error: "claim_not_found" };
  if (claim.status !== "held") return { ok: false, error: "not_held" };
  claim.status = "released";
  claim.released_at = iso(nowMs);
  claim.released_by = actor;
  write(store);
  if (claim.missionId) {
    appendTimelineEvent(claim.missionId, {
      type: "resource_release",
      summary: `Released ${claim.type}:${claim.resourceKey}`,
      visibility: "diagnostic",
      assignmentId: claim.assignmentId,
      actor,
      detail: { claimId },
      nowMs,
    });
  }
  return { ok: true, claim };
}

export function releaseMissionResources(missionId, { actor = "director", nowMs } = {}) {
  const store = read();
  const released = [];
  for (const c of store.claims) {
    if (c.missionId === missionId && c.status === "held") {
      c.status = "released";
      c.released_at = iso(nowMs);
      c.released_by = actor;
      released.push(c);
    }
  }
  write(store);
  return released;
}

/** True when another full typecheck/build is already held. */
export function hasBuildLockConflict() {
  return activeClaims().some((c) => c.type === "build_lock" || c.type === "cpu_heavy_job");
}
