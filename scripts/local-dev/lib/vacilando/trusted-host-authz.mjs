/**
 * Trusted Host Action authorization — mission-scoped or single-action.
 * Never grants blanket privileged access.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { listDecisions } from "./decisions.mjs";
import { ACTION_TYPES, DEFAULT_TARGET } from "./trusted-host-action-registry.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "trusted-host-authz");
const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  mkdirSync(DIR, { recursive: true });
}

function pathFor(missionId) {
  return join(DIR, `${missionId}.json`);
}

function readStore(missionId) {
  ensureDir();
  const p = pathFor(missionId);
  if (!existsSync(p)) return { missionId, authorizations: [] };
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return { missionId, authorizations: [] };
  }
}

function writeStore(store) {
  ensureDir();
  writeFileSync(pathFor(store.missionId), JSON.stringify(store, null, 2));
}

function newAuthId() {
  return `tha_auth_${randomBytes(6).toString("hex")}`;
}

export function grantMissionAuthorization({
  missionId,
  actionType,
  databaseTarget = DEFAULT_TARGET,
  riskClass = "privileged_read",
  actor = "operator",
  queryHash = null,
  expiresAt = null,
  sourceDecisionId = null,
  note = null,
  nowMs,
} = {}) {
  if (!missionId || !actionType) return { ok: false, error: "missing_fields" };
  const store = readStore(missionId);
  const auth = {
    authorizationId: newAuthId(),
    scope: "mission",
    missionId,
    actionType,
    databaseTarget,
    riskClass,
    queryHash: queryHash || null,
    status: "active",
    granted_at: iso(nowMs),
    granted_by: actor,
    expires_at: expiresAt || iso((nowMs ?? Date.now()) + 14 * 24 * 3600_000),
    sourceDecisionId: sourceDecisionId || null,
    note: note || null,
  };
  store.authorizations.push(auth);
  writeStore(store);
  return { ok: true, authorization: auth };
}

export function grantSingleActionAuthorization({
  missionId,
  actionType,
  actionRequestId,
  databaseTarget = DEFAULT_TARGET,
  riskClass = "privileged_read",
  actor = "operator",
  queryHash = null,
  nowMs,
} = {}) {
  const store = readStore(missionId);
  const auth = {
    authorizationId: newAuthId(),
    scope: "single_action",
    missionId,
    actionType,
    actionRequestId: actionRequestId || null,
    databaseTarget,
    riskClass,
    queryHash: queryHash || null,
    status: "active",
    granted_at: iso(nowMs),
    granted_by: actor,
    expires_at: iso((nowMs ?? Date.now()) + 2 * 3600_000),
    used_at: null,
  };
  store.authorizations.push(auth);
  writeStore(store);
  return { ok: true, authorization: auth };
}

function isExpired(auth, nowMs = Date.now()) {
  if (!auth?.expires_at) return false;
  return Date.parse(auth.expires_at) < nowMs;
}

/**
 * Recognize prior Access & Identity census decision (option b) as mission auth.
 */
export function recognizePriorCensusAuthorization(missionId, { nowMs } = {}) {
  const decisions = listDecisions(missionId);
  const prior = decisions.find((d) =>
    d.status === "answered"
    && /Wave 0|read-only SELECTs|deployed database/i.test(d.title || "")
    && (d.chosen_option_id === "b" || /trusted DATABASE_URL|read-only psql/i.test(d.response || "")));
  if (!prior) return { ok: false, reason: "no_prior_decision" };

  const existing = listAuthorizations(missionId).find((a) =>
    a.actionType === ACTION_TYPES.DATABASE_READ_CENSUS
    && a.status === "active"
    && !isExpired(a)
    && a.sourceDecisionId === prior.decisionId);
  if (existing) return { ok: true, authorization: existing, recognized: true, already: true };

  return grantMissionAuthorization({
    missionId,
    actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
    databaseTarget: DEFAULT_TARGET,
    riskClass: "privileged_read",
    actor: prior.answered_by || "operator",
    sourceDecisionId: prior.decisionId,
    note: "Recognized prior mission decision authorizing read-only deployed-database census (option b).",
    nowMs,
  });
}

export function listAuthorizations(missionId) {
  return readStore(missionId).authorizations || [];
}

/**
 * Find a usable authorization for an action request.
 */
export function findAuthorization({
  missionId,
  actionType,
  databaseTarget = DEFAULT_TARGET,
  queryHash = null,
  actionRequestId = null,
  nowMs = Date.now(),
} = {}) {
  const auths = listAuthorizations(missionId)
    .filter((a) => a.status === "active")
    .filter((a) => a.actionType === actionType)
    .filter((a) => a.actionType !== ACTION_TYPES.DATABASE_READ_CENSUS || a.databaseTarget === databaseTarget)
    .filter((a) => !isExpired(a, nowMs))
    .filter((a) => {
      // Merge authorization is SHA-bound. Approving one expected head
      // must not auto-execute a later pin of the same PR.
      if (actionType === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST
        || actionType === ACTION_TYPES.DATABASE_APPLY_MIGRATION
        || actionType === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER
        || actionType === ACTION_TYPES.APPLICATION_CERTIFY_STAGING
        || actionType === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) {
        return Boolean(queryHash) && a.queryHash === queryHash;
      }
      return !a.queryHash || !queryHash || a.queryHash === queryHash;
    })
    .filter((a) => a.scope !== "single_action" || !a.actionRequestId || a.actionRequestId === actionRequestId || !a.used_at);

  // Prefer mission-scoped, then unused single-action
  auths.sort((a, b) => {
    if (a.scope === "mission" && b.scope !== "mission") return -1;
    if (b.scope === "mission" && a.scope !== "mission") return 1;
    return Date.parse(b.granted_at) - Date.parse(a.granted_at);
  });
  return auths[0] || null;
}

export function markAuthorizationUsed(missionId, authorizationId, { nowMs } = {}) {
  const store = readStore(missionId);
  const auth = store.authorizations.find((a) => a.authorizationId === authorizationId);
  if (!auth) return null;
  if (auth.scope === "single_action") {
    auth.used_at = iso(nowMs);
    auth.status = "consumed";
  }
  writeStore(store);
  return auth;
}

export function revokeAuthorization(missionId, authorizationId, { actor = "operator", nowMs } = {}) {
  const store = readStore(missionId);
  const auth = store.authorizations.find((a) => a.authorizationId === authorizationId);
  if (!auth) return { ok: false, error: "not_found" };
  auth.status = "revoked";
  auth.revoked_at = iso(nowMs);
  auth.revoked_by = actor;
  writeStore(store);
  return { ok: true, authorization: auth };
}

/** Stable fingerprint of target id — never the connection string. */
export function databaseTargetFingerprint(target = DEFAULT_TARGET) {
  return createHash("sha256").update(`target:${target}`).digest("hex").slice(0, 16);
}
