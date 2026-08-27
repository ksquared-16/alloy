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


/**
 * AUTHORIZATION CLASSES, MADE EXPLICIT.
 *
 * The store used to carry scope strings with no stated contract, and the
 * matcher ended its single-action filter with `|| !a.used_at` — so an UNUSED
 * single-action authorization matched ANY request. A grant minted for one
 * staging push could authorise a different request, including a production
 * one. Unused is not transferable, and that fallback is now gone.
 *
 * exact_request     valid for ONE governed request/content identity, nothing else
 * mission_standing  intentionally reusable inside its declared mission/action/content scope
 *
 * An unknown scope is NOT reusable. Defaulting to reusable is how an
 * authorization class becomes a loophole.
 */
export const AUTHORIZATION_CLASSES = Object.freeze({
  EXACT_REQUEST: "exact_request",
  MISSION_STANDING: "mission",
});

/** Environments a derived execution authority may NEVER cover. */
export const AUTHZ_OPERATOR_ONLY_ENVIRONMENTS = Object.freeze([
  "production", "prod", "alloy_deployed_primary", "deployed_primary",
]);

const normEnv = (v) => String(v ?? "").trim().toLowerCase();
export function isOperatorOnlyAuthzEnvironment(env) {
  return AUTHZ_OPERATOR_ONLY_ENVIRONMENTS.includes(normEnv(env));
}

/**
 * Execution authority derived from a governed decision. Bound to one exact
 * content identity and refused outright for operator-only environments, so a
 * misconfigured policy still cannot produce production authority.
 */
export function grantExactRequestAuthorization({
  missionId,
  requestId,
  contentFingerprint,
  actionType,
  environment,
  repository = null,
  sourceSha = null,
  decisionId = null,
  decisionActor = "director",
  policyId = null,
  policyVersion = null,
  ttlMs = 30 * 60 * 1000,
  nowMs,
} = {}) {
  if (!missionId || !requestId || !contentFingerprint || !actionType) {
    return { ok: false, error: "incomplete_exact_authorization" };
  }
  // DEFENCE IN DEPTH. The Director already refuses production; this refuses to
  // MINT production authority even if that guard were wrong or bypassed.
  if (isOperatorOnlyAuthzEnvironment(environment)) {
    return { ok: false, error: "production_authority_refused" };
  }
  const store = readStore(missionId);
  const auth = {
    authorizationId: newAuthId(),
    scope: AUTHORIZATION_CLASSES.EXACT_REQUEST,
    missionId,
    requestId,
    contentFingerprint,
    actionType,
    environment: normEnv(environment) || null,
    repository: repository || null,
    sourceSha: sourceSha ? String(sourceSha).toLowerCase() : null,
    decisionId,
    decisionActor,
    policyId,
    policyVersion,
    // Kept for the legacy matcher, which keys pushes and promotions on it.
    queryHash: sourceSha ? String(sourceSha).toLowerCase() : null,
    databaseTarget: normEnv(environment) || DEFAULT_TARGET,
    riskClass: "privileged_write",
    status: "active",
    granted_at: iso(nowMs),
    granted_by: decisionActor,
    expires_at: iso((nowMs ?? Date.now()) + ttlMs),
    used_at: null,
  };
  store.authorizations.push(auth);
  writeStore(store);
  return { ok: true, authorization: auth };
}

/**
 * Does this exact-request authorization cover this exact execution?
 * Every bound field must match. A difference in ANY of them is a different
 * decision.
 */
export function exactAuthorizationCovers(auth, {
  requestId = null,
  contentFingerprint = null,
  actionType = null,
  environment = null,
  repository = null,
  sourceSha = null,
} = {}) {
  if (!auth || auth.scope !== AUTHORIZATION_CLASSES.EXACT_REQUEST) return false;
  if (isOperatorOnlyAuthzEnvironment(auth.environment) || isOperatorOnlyAuthzEnvironment(environment)) return false;
  if (!auth.contentFingerprint || auth.contentFingerprint !== contentFingerprint) return false;
  if (!auth.actionType || auth.actionType !== actionType) return false;
  if (normEnv(auth.environment) !== normEnv(environment)) return false;
  if (auth.requestId && requestId && auth.requestId !== requestId) return false;
  if (auth.repository && repository && auth.repository !== repository) return false;
  if (auth.sourceSha && sourceSha && auth.sourceSha !== String(sourceSha).toLowerCase()) return false;
  return true;
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
  requestId = null,
  contentFingerprint = null,
  environment = null,
  repository = null,
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
        || actionType === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
        return Boolean(queryHash) && a.queryHash === queryHash;
      }
      return !a.queryHash || !queryHash || a.queryHash === queryHash;
    })
    // UNUSED IS NOT TRANSFERABLE. This filter used to end `|| !a.used_at`,
    // which let an unused single-action grant match any request at all.
    .filter((a) => {
      if (a.scope === AUTHORIZATION_CLASSES.EXACT_REQUEST) {
        return exactAuthorizationCovers(a, {
          requestId, contentFingerprint, actionType,
          environment: environment ?? databaseTarget,
          repository, sourceSha: queryHash,
        });
      }
      if (a.scope === "single_action") {
        return Boolean(a.actionRequestId) && a.actionRequestId === actionRequestId;
      }
      if (a.scope === AUTHORIZATION_CLASSES.MISSION_STANDING) return true;
      // An unrecognised class is never reusable.
      return false;
    });

  // Prefer the TIGHTEST binding. An exact-request authorization describes this
  // one execution; a standing grant describes a class. Answering "who
  // authorised this exact execution" truthfully means preferring the specific
  // one when both are present.
  const rank = (a) => (a.scope === AUTHORIZATION_CLASSES.EXACT_REQUEST ? 0 : (a.scope === "single_action" ? 1 : 2));
  auths.sort((a, b) => rank(a) - rank(b) || Date.parse(b.granted_at) - Date.parse(a.granted_at));
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
