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
import { normalizeRef } from "./action-authorization-identity.mjs";

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
  // Scope a standing grant may DECLARE. Declared-but-different is a non-match;
  // undeclared leaves that dimension unrestricted, which is why the SUBJECT
  // binding above is the one that may never be absent.
  repository = null,
  environment = null,
  subjectScope = null,
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
    repository: repository || null,
    environment: environment || null,
    subject_scope: subjectScope || null,
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

/**
 * SUBJECT SCOPE — reuse breadth, stated rather than inferred.
 *
 * An operator approved ONE failed pull-request close. The grant that minted
 * carried no queryHash, and findAuthorization read "no binding" as "matches
 * anything of this action type" — so a single decision about one PR became
 * standing authority to close EVERY pull request, at any SHA, until it
 * expired. The same happened for branch deletion.
 *
 * Absence of a binding is not a wildcard. A grant that may cover more than one
 * subject has to SAY so.
 */
export const SUBJECT_SCOPES = Object.freeze({
  /** Valid for one subject only: the queryHash it was issued against. */
  EXACT: "exact",
  /** Explicitly reusable for any subject of this action inside the mission. */
  ANY_WITHIN_MISSION: "any_within_mission",
});

/**
 * How a standing grant's reuse breadth resolves.
 *
 * legacy_unbound is the historical shape: no subject binding AND no declared
 * scope. It is reported, never honoured — silently ignoring malformed historical
 * authority is how the leak survived in the first place.
 */
export function classifyStandingGrant(auth) {
  if (!auth) return { class: "absent", matchable: false };
  if (auth.scope === AUTHORIZATION_CLASSES.EXACT_REQUEST) {
    return { class: "exact_request", matchable: true, subject_scope: SUBJECT_SCOPES.EXACT };
  }
  const declared = auth.subject_scope || null;
  if (declared === SUBJECT_SCOPES.ANY_WITHIN_MISSION) {
    return { class: "explicit_wildcard", matchable: true, subject_scope: declared };
  }
  if (auth.queryHash) {
    return { class: "subject_bound", matchable: true, subject_scope: SUBJECT_SCOPES.EXACT };
  }
  return {
    class: "legacy_unbound",
    matchable: false,
    subject_scope: null,
    reason: "issued with no subject binding and no declared subject_scope; absence is not a wildcard",
  };
}

/** Every standing grant that would once have matched anything. For audit and health. */
export function legacyUnboundAuthorizations(missionId) {
  return listAuthorizations(missionId)
    .filter((a) => a.status === "active")
    .filter((a) => classifyStandingGrant(a).class === "legacy_unbound")
    .map((a) => ({
      authorizationId: a.authorizationId,
      actionType: a.actionType,
      granted_by: a.granted_by,
      granted_at: a.granted_at,
      expires_at: a.expires_at,
      databaseTarget: a.databaseTarget || null,
      classification: "legacy_unbound",
      effect: "inert — no longer matches; retained for audit",
    }));
}

export function grantExactRequestAuthorization({
  missionId,
  requestId,
  contentFingerprint,
  actionType,
  environment,
  repository = null,
  sourceSha = null,
  // The ref this execution writes (or, for a proposal, aims at). Derived by
  // the canonical identity resolver, never by a caller — binding it is what
  // keeps authority to open a PR into staging from covering one into main,
  // now that opening a proposal is correctly repository-class authority.
  targetRef = null,
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
    targetRef: normalizeRef(targetRef),
    decisionId,
    decisionActor,
    policyId,
    policyVersion,
    // Kept for the legacy matcher, which keys pushes and promotions on it.
    queryHash: sourceSha ? String(sourceSha).toLowerCase() : null,
    // NOT `|| DEFAULT_TARGET`. DEFAULT_TARGET is a DATABASE target; defaulting
    // to it here is what let a repository authorization be described as
    // `alloy_deployed_primary`, an operator-only environment that
    // exactAuthorizationCovers refuses unconditionally — so an exact-request
    // authorization for a push could never be resolved by anybody.
    databaseTarget: normEnv(environment) || null,
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
  targetRef = null,
} = {}) {
  if (!auth || auth.scope !== AUTHORIZATION_CLASSES.EXACT_REQUEST) return false;
  if (isOperatorOnlyAuthzEnvironment(auth.environment) || isOperatorOnlyAuthzEnvironment(environment)) return false;
  if (!auth.contentFingerprint || auth.contentFingerprint !== contentFingerprint) return false;
  if (!auth.actionType || auth.actionType !== actionType) return false;
  if (normEnv(auth.environment) !== normEnv(environment)) return false;
  if (auth.requestId && requestId && auth.requestId !== requestId) return false;
  if (auth.repository && repository && auth.repository !== repository) return false;
  if (auth.sourceSha && sourceSha && auth.sourceSha !== String(sourceSha).toLowerCase()) return false;
  // STRICT, BOTH DIRECTIONS. Every caller now derives targetRef from the one
  // identity resolver, so both sides always have it or both are null; an
  // authorization minted before that convergence has no targetRef and fails
  // closed here, which escalates to the operator rather than executing on an
  // identity nobody can vouch for.
  if (normalizeRef(auth.targetRef) !== normalizeRef(targetRef)) return false;
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
  targetRef = null,
  nowMs = Date.now(),
} = {}) {
  const auths = listAuthorizations(missionId)
    .filter((a) => a.status === "active")
    .filter((a) => a.actionType === actionType)
    .filter((a) => a.actionType !== ACTION_TYPES.DATABASE_READ_CENSUS || a.databaseTarget === databaseTarget)
    // A grant that names an environment or repository may not be used outside
    // it. Declared-but-different is a non-match, never a shrug.
    .filter((a) => !a.environment || !environment || normEnv(a.environment) === normEnv(environment))
    .filter((a) => !a.repository || !repository || a.repository === repository)
    .filter((a) => !isExpired(a, nowMs))
    .filter((a) => {
      // ABSENCE IS NEVER A WILDCARD.
      //
      // This used to end "|| !a.queryHash || !queryHash", so a grant with no
      // subject binding matched every request of its action type, and a
      // request with no subject matched every grant. One approval of one PR
      // close became authority over all of them.
      //
      // A standing grant now needs a subject binding that MATCHES, or an
      // explicitly declared wildcard scope. Merge and migration keep their
      // stricter rule, which was already correct.
      if (actionType === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST
        || actionType === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
        return Boolean(queryHash) && a.queryHash === queryHash;
      }
      if (a.scope === AUTHORIZATION_CLASSES.EXACT_REQUEST) return true;  // already bound above
      const klass = classifyStandingGrant(a);
      if (klass.class === "legacy_unbound") return false;
      if (klass.class === "explicit_wildcard") return true;
      return Boolean(queryHash) && a.queryHash === queryHash;
    })
    // UNUSED IS NOT TRANSFERABLE. This filter used to end `|| !a.used_at`,
    // which let an unused single-action grant match any request at all.
    .filter((a) => {
      if (a.scope === AUTHORIZATION_CLASSES.EXACT_REQUEST) {
        return exactAuthorizationCovers(a, {
          requestId, contentFingerprint, actionType,
          // `?? databaseTarget` was the fallback that turned a missing
          // environment into a database default. Callers now come from the
          // canonical resolver and always carry one; nothing is substituted.
          environment,
          repository, sourceSha: queryHash, targetRef,
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
