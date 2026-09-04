/**
 * Trusted Host Actions — privileged host-side execution runtime.
 *
 * Workers may request; workers never receive credentials.
 * Director authorizes; this runtime executes outside the managed sandbox.
 */
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  chmodSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  ACTION_TYPES,
  DEFAULT_TARGET,
  getActionDefinition,
  listRegisteredActions,
  directorRegistryFreshness,
  resolveCanonicalRepoRoot,
  resolveTrustedServerEnvSource,
  findRepoRoot,
  hashSql,
  resolveArtifactRoot,
  sqlFromCensusArtifact,
} from "./trusted-host-action-registry.mjs";
import {
  resolveActionAuthorizationIdentity,
} from "./action-authorization-identity.mjs";
import {
  findAuthorization,
  AUTHORIZATION_CLASSES,
  exactAuthorizationCovers,
  markAuthorizationUsed,
  recognizePriorCensusAuthorization,
  listAuthorizations,
  databaseTargetFingerprint,
} from "./trusted-host-authz.mjs";
import {
  mergePullRequest,
  publicMergeResult,
} from "./trusted-host-merge.mjs";
import { executeRestoreQaSessionSync } from "./qa-session-restore-action.mjs";
import { executeProvisionQaIdentitySync } from "./qa-identity-provision-action.mjs";
import { executeAssignQaAccessSync } from "./qa-access-assign-action.mjs";
import { pushBranch, publicPushResult } from "./trusted-host-push.mjs";
import { executeProviderCeiling } from "./trusted-host-provider-ceiling.mjs";
import { executeToolkitInstall } from "./toolkit-convergence.mjs";
import { openPullRequest, publicOpenPrResult } from "./trusted-host-open-pr.mjs";
import { closePullRequest, deleteRemoteBranch } from "./trusted-host-repository-housekeeping.mjs";
import { applyReconciliationPlan, buildReconciliationPlan } from "./reconciliation-apply.mjs";
import { executeWorktreeRetirement } from "./trusted-host-worktree-retirement.mjs";
import { gatherObservation } from "./reconciliation-observe.mjs";
import {
  applyMigrationBatch,
  publicMigrationResult,
  APPLY_MIGRATION_SH,
  readMigrationContent,
  ledgerLookupSql,
  migrationPostconditionSql,
  migrationPostconditionDescription,
} from "./trusted-host-migrate.mjs";
import { appendTimelineEvent } from "./timeline.mjs";
import { attachEvidence } from "./evidence.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");

/*
 * Resolved per call, not frozen at import.
 *
 * A diagnostic reproduction wrote a placeholder-owned action into the SHARED store because the path
 * was captured when the module loaded, so pointing `ALLOY_RUNTIME_ROOT` at a temp directory
 * afterwards had no effect. Resolving on each access makes isolation actually work: a test sets the
 * variable and its writes land in its own directory, and can never contaminate the production store.
 */
function storeDir() {
  return join(runtimeRoot(), "vacilando", "trusted-host-actions");
}
/**
 * The runtime state root.
 *
 * Two executors already called runtimeRoot() as a fallback and NOTHING DEFINED
 * IT. The reconciliation path never noticed because its CLI always sends
 * inputs.runtimeRoot, so `inputs.runtimeRoot || runtimeRoot()` short-circuited
 * and the right-hand side was never evaluated. A latent ReferenceError sitting
 * behind an `||`, waiting for the first caller whose inputs omitted the key.
 */
function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim() || RUNTIME_ROOT;
}
const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_SQL_SH = join(HERE, "trusted-host-run-sql.sh");
const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir(p = storeDir()) {
  mkdirSync(p, { recursive: true });
}

function newActionId() {
  return `tha_${randomBytes(7).toString("hex")}`;
}

/**
 * Trusted-host SQL stdout → census object.
 * Accepts a single JSON document (wave0) or Q15 labeled rows:
 *   BEGIN
 *   Q15-A1|row_count|{"row_count": 0}
 *   Q15-A1|row|{...}
 *   COMMIT
 */
export function parseTrustedHostSqlOutput(outText) {
  const stripped = String(outText || "").trim();
  if (!stripped) return null;
  try {
    return JSON.parse(stripped);
  } catch { /* fall through */ }
  const blob = stripped.match(/\{[\s\S]*\}/);
  if (blob && !/^[A-Za-z0-9_.-]+\|/.test(stripped.split(/\r?\n/).find((l) => l.includes("|")) || "")) {
    try {
      return JSON.parse(blob[0]);
    } catch { /* labeled rows below */ }
  }
  const rows = [];
  for (const line of stripped.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t === "BEGIN" || t === "COMMIT" || t === "ROLLBACK") continue;
    const i1 = t.indexOf("|");
    const i2 = i1 >= 0 ? t.indexOf("|", i1 + 1) : -1;
    if (i2 < 0) continue;
    const questionId = t.slice(0, i1).trim();
    const kind = t.slice(i1 + 1, i2).trim();
    const payloadRaw = t.slice(i2 + 1);
    let payload = payloadRaw;
    try { payload = JSON.parse(payloadRaw); } catch { /* keep string */ }
    if (!questionId) continue;
    rows.push({ question_id: questionId, kind, payload });
  }
  if (!rows.length) return null;
  const questions = {};
  for (const r of rows) {
    const q = questions[r.question_id] || { question_id: r.question_id, row_count: null, rows: [] };
    if (r.kind === "row_count") {
      q.row_count = r.payload && typeof r.payload === "object" && "row_count" in r.payload
        ? r.payload.row_count
        : r.payload;
    } else {
      q.rows.push(r.payload);
    }
    questions[r.question_id] = q;
  }
  return {
    format: "q15_labeled_rows",
    census_run_at: new Date().toISOString(),
    question_ids: Object.keys(questions),
    questions,
    row_count: rows.length,
  };
}

function storePath(actionId) {
  return join(storeDir(), `${actionId}.json`);
}

function indexPath(missionId) {
  return join(storeDir(), `index_${missionId}.json`);
}

function readAction(actionId) {
  const p = storePath(actionId);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function writeAction(action) {
  ensureDir();
  writeFileSync(storePath(action.id), JSON.stringify(action, null, 2));
  const idxP = indexPath(action.missionId);
  let idx = { missionId: action.missionId, ids: [] };
  if (existsSync(idxP)) {
    try { idx = JSON.parse(readFileSync(idxP, "utf8")); } catch { /* */ }
  }
  if (!idx.ids.includes(action.id)) idx.ids.push(action.id);
  writeFileSync(idxP, JSON.stringify(idx, null, 2));
  return action;
}

export function listTrustedHostActions(missionId = null) {
  ensureDir();
  if (!missionId) return [];
  const idxP = indexPath(missionId);
  if (!existsSync(idxP)) return [];
  const idx = JSON.parse(readFileSync(idxP, "utf8"));
  return (idx.ids || []).map(readAction).filter(Boolean);
}

export function getTrustedHostAction(actionId) {
  return readAction(actionId);
}

function redactSecrets(text) {
  return String(text || "")
    .replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[redacted]")
    .replace(/postgres:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted_jwt]");
}

function buildAudit(action, extra = {}) {
  return {
    actionId: action.id,
    missionId: action.missionId,
    assignmentId: action.assignmentId,
    executionSessionId: action.executionSessionId,
    actionType: action.actionType,
    authorizationId: action.authorizationId,
    authorizingOperator: extra.authorizingOperator || null,
    databaseTarget: action.inputs?.databaseTarget,
    databaseTargetFingerprint: databaseTargetFingerprint(action.inputs?.databaseTarget),
    queryArtifactPath: action.inputs?.queryArtifactPath,
    queryHash: action.inputs?.queryHash,
    validationResult: action.inputs?.validation || null,
    started_at: action.started_at,
    completed_at: action.completed_at,
    rowCount: extra.rowCount ?? null,
    outputArtifactPath: extra.outputArtifactPath || null,
    success: extra.success === true,
    failureCode: extra.failureCode || null,
    retryHistory: action.retryState || null,
  };
}

/**
 * May an existing action be reused for THIS request?
 *
 * Reuse is an identity claim: it says the stored action is the same piece of work, so a grant issued
 * for the new request may drive it. That is only true when the ownership dimensions agree.
 *
 * They did not have to. A record owned by `run_x` — written by a diagnostic reproduction — was
 * adopted for `erun_89f9cbad389cc851` because both carried an undefined `queryHash`, so
 * `undefined === undefined` matched. `grantAuthorizesAction` then refused it with
 * `grant_run_mismatch`, correctly, and the request bounced back to `awaiting_operator` on every
 * approval. The operator approved twice and nothing could ever execute.
 *
 * The refusal was right; the adoption was wrong. This is the missing half: a candidate must match on
 * run, assignment and lane before its identity may be claimed. Comparison is null-tolerant, so an
 * action that genuinely carries no run is still reusable by another that carries none — that is the
 * pre-existing census behaviour and it is not widened here.
 */
export function sameActionOwnership(candidate, { executionSessionId = null, assignmentId = null, inputs = {} } = {}) {
  const same = (a, b) => (a ?? null) === (b ?? null);
  if (!same(candidate?.executionSessionId, executionSessionId)) return false;
  if (!same(candidate?.assignmentId, assignmentId)) return false;
  // The lane is carried in the action's own inputs for lane-scoped actions; for actions that have
  // no lane both sides are null and this is a no-op.
  const candidateLane = candidate?.inputs?.laneId ?? candidate?.inputs?.lane_id ?? null;
  const requestLane = inputs?.laneId ?? inputs?.lane_id ?? null;
  if (!same(candidateLane, requestLane)) return false;
  return true;
}

export function requestTrustedHostAction({
  missionId,
  assignmentId = null,
  executionSessionId = null,
  requestedBy = "director",
  actionType,
  inputs = {},
  // CARRIED, NOT INVENTED. Only the two facts that cannot be derived from the
  // action's own inputs travel from the governed owner: which request this is,
  // and the fingerprint of the content that request was decided on. Scope,
  // environment, repository, ref and SHA are resolved HERE from the normalized
  // inputs, so a caller cannot describe an action as something milder than it
  // is by supplying its own identity fields.
  authorizationContext = null,
  nowMs,
} = {}) {
  if (!missionId || !actionType) return { ok: false, error: "missing_fields" };
  const def = getActionDefinition(actionType);
  if (!def) return { ok: false, error: "unknown_action_type", actionType };

  const validated = def.validateInputs(inputs);
  if (!validated.ok) {
    return { ok: false, error: "input_validation_failed", validation: validated };
  }

  const dedupeKey = validated.normalized.dedupeKey
    || validated.normalized.queryHash
    || null;
  // Dedupe in-flight / completed only — failed actions may be retried.
  const existing = listTrustedHostActions(missionId).find((a) =>
    a.actionType === actionType
    && sameActionOwnership(a, { executionSessionId, assignmentId, inputs: validated.normalized })
    && (dedupeKey
      ? (a.inputs?.dedupeKey === dedupeKey || a.inputs?.queryHash === dedupeKey)
      : a.inputs?.queryHash === validated.normalized.queryHash)
    && ["requested", "policy_review", "authorized", "executing", "completed", "retrying"].includes(a.state));
  if (existing) {
    return { ok: true, action: existing, deduped: true };
  }

  const identity = resolveActionAuthorizationIdentity({
    actionType,
    scope: missionId,
    inputs: validated.normalized,
    requestId: authorizationContext?.requestId || null,
    contentFingerprint: authorizationContext?.contentFingerprint || null,
  });

  const action = {
    schema_version: "vacilando.trusted_host_action.v1",
    id: newActionId(),
    missionId,
    assignmentId,
    executionSessionId,
    requestedBy,
    actionType,
    actionVersion: def.version,
    requestedInputs: { ...validated.normalized },
    inputs: { ...validated.normalized },
    // The resolved identity travels WITH the action, so the executor never has
    // to rediscover it from inputs that may not carry it. It is still
    // re-derived and compared at the boundary — carrying it is what removes the
    // second derivation, not the check.
    authorizationIdentity: {
      scope: identity.scope,
      actionType: identity.actionType,
      repository: identity.repository,
      environment: identity.environment,
      targetRef: identity.targetRef,
      sourceSha: identity.sourceSha,
      subjectKey: identity.subjectKey,
      requestId: identity.requestId,
      contentFingerprint: identity.contentFingerprint,
      resolved: identity.ok,
      reason: identity.reason || null,
    },
    policyClassification: def.riskClass,
    authorizationState: "pending",
    authorizationId: null,
    executionState: "not_started",
    state: "requested",
    hostProcess: null,
    started_at: null,
    completed_at: null,
    result: null,
    evidence: [],
    audit: null,
    failureReason: null,
    retryState: { attempts: 0, maxAttempts: def.retry?.maxAttempts ?? 1 },
    created_at: iso(nowMs),
    updated_at: iso(nowMs),
  };
  writeAction(action);
  try {
    appendTimelineEvent(missionId, {
      type: "progress",
      headline: "Director prepared a Trusted Host Action",
      summary: `${def.title} requested — credentials stay on the trusted host.`,
      visibility: "summary",
      actor: "director",
      detail: { trustedHostActionId: action.id, actionType },
      nowMs,
    });
  } catch { /* optional */ }
  return { ok: true, action, normalized: validated.normalized };
}

/**
 * Does this single-use grant authorize THIS action?
 *
 * Re-derived from the action's own normalized inputs, never from the governed
 * request that produced it — a check that reads the same record twice proves
 * nothing. Each field is compared on its own so the refusal can say what
 * changed; `grant_head_sha_mismatch` is the one that carries the weight, because
 * it is what happens when the branch moves after a Director approves.
 */
export function grantAuthorizesAction(grant, action, { nowMs = Date.now() } = {}) {
  if (!grant) return { ok: false, error: "grant_missing" };
  if (grant.status === "CONSUMED") return { ok: false, error: "grant_already_used" };
  if (grant.status === "REVOKED") return { ok: false, error: "grant_revoked" };
  if (!(Date.parse(grant.expires_at) > nowMs)) return { ok: false, error: "grant_expired" };
  if (grant.action_key !== action.actionType) return { ok: false, error: "grant_action_mismatch" };
  if (grant.repository_id && action.missionId && grant.repository_id !== action.missionId) {
    return { ok: false, error: "grant_scope_mismatch" };
  }
  if (grant.run_id && action.executionSessionId && grant.run_id !== action.executionSessionId) {
    return { ok: false, error: "grant_run_mismatch" };
  }
  const i = action.inputs || {};
  if (action.actionType === ACTION_TYPES.REPOSITORY_PUSH
    || action.actionType === ACTION_TYPES.PROMOTION_OPEN_PR) {
    // The commit is the decision. A branch that moved is a different question.
    if (String(grant.expected_head_sha || "").toLowerCase() !== String(i.expectedHeadSha || "").toLowerCase()) {
      return { ok: false, error: "grant_head_sha_mismatch" };
    }
    const branch = i.branch || i.headBranch || null;
    if (String(grant.branch || "") !== String(branch || "")) {
      return { ok: false, error: "grant_branch_mismatch" };
    }
    if (action.actionType === ACTION_TYPES.PROMOTION_OPEN_PR
      && String(grant.target_branch || "") !== String(i.base || "")) {
      return { ok: false, error: "grant_target_branch_mismatch" };
    }
    return { ok: true };
  }
  if (action.actionType === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    if (Number(grant.pull_request_number) !== Number(i.pullRequestNumber)) {
      return { ok: false, error: "grant_pull_request_mismatch" };
    }
    if (String(grant.expected_head_sha || "").toLowerCase() !== String(i.expectedHeadSha || "").toLowerCase()) {
      return { ok: false, error: "grant_head_sha_mismatch" };
    }
    if (String(grant.target_branch || "") !== String(i.targetBranch || "")) {
      return { ok: false, error: "grant_target_branch_mismatch" };
    }
    if (String(grant.merge_method || "") !== String(i.mergeMethod || "")) {
      return { ok: false, error: "grant_merge_method_mismatch" };
    }
  }
  return { ok: true };
}

/**
 * THE AUTHORIZATION IDENTITY OF A TRUSTED HOST ACTION — THE ONLY DERIVATION.
 *
 * Re-derived from the action's own normalized inputs through the canonical
 * resolver, with the two carried facts (request id, content fingerprint) taken
 * from the identity the governed owner stamped on the action. Nothing here
 * infers an environment, a scope, a ref or a SHA on its own; that independent
 * inference is the defect this whole change removes.
 */
export function trustedHostActionIdentity(action, { requestId = null, contentFingerprint = null } = {}) {
  const carried = action?.authorizationIdentity || {};
  return resolveActionAuthorizationIdentity({
    actionType: action?.actionType,
    scope: action?.missionId,
    inputs: action?.inputs || {},
    requestId: requestId ?? carried.requestId ?? null,
    contentFingerprint: contentFingerprint ?? carried.contentFingerprint ?? null,
  });
}

/**
 * Resolve the authorization that covers this action, exactly as execution will.
 *
 * THE PRE-CONSUMPTION PROOF CALLS THIS SAME FUNCTION. The previous proof called
 * findAuthorization with a policy-side `environment` argument that the real
 * boundary never passed, so it verified a different question than the one that
 * gates execution: it passed, the delegation was consumed, and the boundary
 * then refused. One path, not a simulated equivalent.
 */
export function resolveActionAuthorization(action, {
  nowMs = Date.now(),
  requestId = null,
  contentFingerprint = null,
} = {}) {
  const identity = trustedHostActionIdentity(action, { requestId, contentFingerprint });
  const authorization = findAuthorization({
    ...identity.lookup,
    actionRequestId: action?.id || null,
    nowMs,
  });
  return { identity, authorization };
}

/**
 * Would a governed request's action be authorized at the boundary?
 *
 * Normalizes the inputs through the SAME registry validator the action is built
 * from, then asks `resolveActionAuthorization` — the function execution itself
 * calls. Used before a delegation is consumed, so authority is only ever spent
 * on an authorization that is provably usable.
 */
export function previewTrustedHostAuthorization({
  missionId,
  actionType,
  inputs = {},
  normalizedInputs = null,
  requestId = null,
  contentFingerprint = null,
  nowMs = Date.now(),
} = {}) {
  const def = getActionDefinition(actionType);
  if (!def) return { ok: false, error: "unknown_action_type", actionType };
  let normalized = normalizedInputs;
  if (!normalized) {
    const validated = def.validateInputs(inputs);
    if (!validated.ok) return { ok: false, error: "input_validation_failed", validation: validated };
    normalized = validated.normalized;
  }
  const shape = { id: null, missionId, actionType, inputs: normalized, authorizationIdentity: null };
  const { identity, authorization } = resolveActionAuthorization(shape, {
    nowMs, requestId, contentFingerprint,
  });
  return { ok: Boolean(authorization), identity, authorization: authorization || null };
}

export function authorizeTrustedHostAction(actionId, {
  actor = "operator",
  authorizationId = null,
  nowMs,
  grant = null,
  exactContext = null,
} = {}) {
  const action = readAction(actionId);
  if (!action) return { ok: false, error: "not_found" };

  // AN ACTION AUTHORISED A MOMENT AGO IS STILL AUTHORISED.
  //
  // This is where Director authority was being lost. The fulfil path authorises
  // WITH the Director's exact-request context and the action becomes
  // "authorized"; it then calls executeTrustedHostAction, whose per-action
  // executor authorises AGAIN with no context at all. The second call fell
  // through to findAuthorization, found no standing grant for a fresh SHA, and
  // escalated to the operator — discarding an authorization that had already
  // passed every check seconds earlier.
  //
  // Honouring the pinned authorization is not a weakening: the ONLY way an
  // action reaches this state is by passing the checks below, and the pinned
  // authorization is re-validated here rather than assumed.
  if (action.authorizationState === "authorized" && action.authorizationId) {
    const pinned = listAuthorizations(action.missionId)
      .find((x) => x.authorizationId === action.authorizationId) || null;
    const stillValid = pinned
      && pinned.status === "active"
      && !(pinned.expires_at && Date.parse(pinned.expires_at) < (nowMs ?? Date.now()));
    // A repository grant is not in this store; it authorised the action on its
    // own terms and is equally not re-derived here.
    if (stillValid || (!pinned && grant)) return { ok: true, action, already: true };
  }

  let auth = null;
  if (authorizationId) {
    auth = listAuthorizations(action.missionId).find((a) => a.authorizationId === authorizationId) || null;
    // PRESENTING AN ID IS NOT AUTHORISATION. This lookup used to accept any
    // id it could resolve, with no check that the authorization actually
    // covered THIS action — so a caller holding one id could have executed a
    // different action with it. An exact-request authorization is now verified
    // against the action's own parameters before it counts.
    if (auth && auth.scope === AUTHORIZATION_CLASSES.EXACT_REQUEST) {
      const ctx = exactContext || {};
      // ONE DERIVATION. This block used to spell out environment, repository
      // and sourceSha itself — a fifth independent reconstruction, and the one
      // that read `ctx.environment ?? null` while the mint had recorded a
      // resolved environment. Only the two carried facts come from the caller.
      const identity = trustedHostActionIdentity(action, {
        requestId: ctx.requestId ?? null,
        contentFingerprint: ctx.contentFingerprint ?? null,
      });
      const covers = exactAuthorizationCovers(auth, {
        requestId: identity.requestId,
        contentFingerprint: identity.contentFingerprint,
        actionType: identity.actionType,
        environment: identity.environment,
        repository: identity.repository,
        sourceSha: identity.sourceSha,
        targetRef: identity.targetRef,
      });
      const expired = auth.expires_at && Date.parse(auth.expires_at) < (nowMs ?? Date.now());
      if (!covers || auth.status !== "active" || expired || auth.used_at) auth = null;
    }
  } else {
    // THE FOURTH INSTANCE OF THE DEFECT FAMILY WAS HERE. This block derived the
    // lookup's target as `... || DEFAULT_TARGET`. A repository.push carries no
    // databaseTarget, environment or targetBranch, so it fell through to
    // `alloy_deployed_primary` — an operator-only environment that
    // exactAuthorizationCovers refuses on its first line — while the mint had
    // recorded the real one. No exact-request authorization for a push could
    // ever resolve, for the delegated path or the Director path alike.
    ({ authorization: auth } = resolveActionAuthorization(action, { nowMs: nowMs ?? Date.now() }));
  }
  if (!auth && grant) {
    // A repository-authorized action carries a single-use grant instead of a
    // mission authorization. It still has to CLEAR: the grant is verified
    // against this action's own parameters, not merely presented. A grant that
    // is expired, already spent, revoked, or pinned to a different head SHA is
    // no authorization at all, and the action falls through to policy_review
    // below exactly as an unauthorized one does.
    const check = grantAuthorizesAction(grant, action, { nowMs: nowMs ?? Date.now() });
    if (check.ok) {
      auth = {
        authorizationId: grant.grant_id,
        kind: "repository_grant",
        actor: grant.approved_by,
        grantedAt: grant.approved_at,
        expiresAt: grant.expires_at,
        singleUse: true,
      };
    } else {
      action.grantRefusal = check.error;
    }
  }
  if (!auth) {
    action.state = "policy_review";
    action.authorizationState = "required";
    action.updated_at = iso(nowMs);
    writeAction(action);
    return { ok: false, error: "authorization_required", action };
  }
  action.state = "authorized";
  action.authorizationState = "authorized";
  action.authorizationId = auth.authorizationId;
  action.updated_at = iso(nowMs);
  writeAction(action);
  return { ok: true, action, authorization: auth };
}

export function executeTrustedHostAction(actionId, { actor = "director", nowMs, grant = null } = {}) {
  let action = readAction(actionId);
  if (!action) return { ok: false, error: "not_found" };
  if (action.state === "completed") return { ok: true, action, already: true };

  if (action.actionType === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    return executeMergeTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    return executeMigrationTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.REPOSITORY_PUSH) {
    return executePushTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.PROMOTION_OPEN_PR) {
    return executeOpenPrTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION) {
    return executeRestoreQaSessionTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY) {
    return executeProvisionQaIdentityTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS) {
    return executeAssignQaAccessTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST) {
    return executeClosePullRequestTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.VACILANDO_APPLY_RECONCILIATION_PLAN) {
    return executeApplyReconciliationPlanTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH) {
    return executeDeleteRemoteBranchTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.VACILANDO_RETIRE_WORKTREE) {
    return executeRetireWorktreeTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.CAPACITY_SET_PROVIDER_CEILING) {
    return executeSetProviderCeilingTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType === ACTION_TYPES.HOST_INSTALL_TOOLKIT) {
    return executeInstallToolkitTrustedHostAction(action, { actor, nowMs, grant });
  }
  if (action.actionType !== ACTION_TYPES.DATABASE_READ_CENSUS) {
    return { ok: false, error: "unknown_action_type", actionType: action.actionType };
  }

  const authz = authorizeTrustedHostAction(actionId, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;

  const absSqlArtifact = action.inputs.queryArtifactAbsolute
    || join(action.inputs.artifactRoot || resolveArtifactRoot(action.inputs), action.inputs.queryArtifactPath);
  let sql = null;
  const rawSql = readFileSync(absSqlArtifact, "utf8");
  sql = sqlFromCensusArtifact(rawSql, absSqlArtifact);
  if (hashSql(sql) !== action.inputs.queryHash) {
    action.state = "failed";
    action.failureReason = "query_hash_mismatch";
    action.completed_at = iso(nowMs);
    action.audit = buildAudit(action, { success: false, failureCode: "query_hash_mismatch" });
    writeAction(action);
    return { ok: false, error: "query_hash_mismatch", action };
  }

  const tmpDir = join(storeDir(), "tmp");
  ensureDir(tmpDir);
  const sqlFile = join(tmpDir, `${action.id}.sql`);
  const outFile = join(tmpDir, `${action.id}.out`);
  const errFile = join(tmpDir, `${action.id}.err`);
  writeFileSync(sqlFile, sql.endsWith(";") ? sql : `${sql};`);

  action.state = "executing";
  action.executionState = "executing";
  action.started_at = iso(nowMs);
  action.hostProcess = { kind: "trusted-host-run-sql" };
  action.retryState.attempts = (action.retryState.attempts || 0) + 1;
  action.updated_at = iso(nowMs);
  writeAction(action);

  try {
    appendTimelineEvent(action.missionId, {
      type: "progress",
      headline: "Director is running an approved database census",
      summary: "Trusted Host Action executing on the control-plane host — worker still has no credentials.",
      visibility: "summary",
      actor: "director",
      detail: { trustedHostActionId: action.id },
      nowMs,
    });
  } catch { /* */ }

  if (!existsSync(RUN_SQL_SH)) {
    action.state = "failed";
    action.failureReason = "host_runtime_missing";
    action.completed_at = iso(nowMs);
    writeAction(action);
    return { ok: false, error: "host_runtime_missing", action };
  }
  try { chmodSync(RUN_SQL_SH, 0o755); } catch { /* */ }

  const originatingRoot = action.inputs.artifactRoot
    || action.inputs.worktreePath
    || resolveArtifactRoot(action.inputs);
  const hostCheckout = findRepoRoot();
  const canonical = resolveCanonicalRepoRoot();
  const envSource = resolveTrustedServerEnvSource();
  const child = spawnSync("bash", [RUN_SQL_SH, sqlFile, outFile, errFile], {
    env: {
      ...process.env,
      ALLOY_CANONICAL_ROOT: canonical,
      ALLOY_REPO: canonical,
      ALLOY_SERVER_ENV_SOURCE: envSource,
      // Toolkit + credentials stay on the Director/canonical host.
      // Do not point these at the originating lane — Identity has no DATABASE_URL.
      VACILANDO_CHECKOUT: hostCheckout,
      ALLOY_WORKTREE: hostCheckout,
      ALLOY_BLOCK_REMOTE_SUPABASE: "",
    },
    timeout: action.inputs.timeoutMs || 180_000,
    encoding: "utf8",
  });

  const errText = redactSecrets(
    (existsSync(errFile) ? readFileSync(errFile, "utf8") : "") || child.stderr || "",
  );
  const outText = existsSync(outFile) ? readFileSync(outFile, "utf8").trim() : "";
  try { unlinkSync(sqlFile); } catch { /* */ }

  if (child.status !== 0) {
    const code = classifySqlChildFailure(
      errText,
      child.error?.code === "ETIMEDOUT" ? "timeout" : "execution_failed",
    );
    const transient = code === "timeout" || /could not connect|timeout|Connection refused/i.test(errText);
    action.failureReason = code;
    action.executionState = "failed";
    action.completed_at = iso(nowMs);
    action.audit = buildAudit(action, {
      success: false,
      failureCode: code,
      authorizingOperator: authz.authorization?.granted_by || null,
    });
    action.state = (transient && action.retryState.attempts < (action.retryState.maxAttempts || 1))
      ? "retrying"
      : "failed";
    action.updated_at = iso(nowMs);
    writeAction(action);
    try {
      appendTimelineEvent(action.missionId, {
        type: "progress",
        headline: code === "trusted_credential_unavailable"
          ? "Trusted credential unavailable on the host"
          : "Database census failed",
        summary: redactSecrets(errText).slice(0, 240) || "Host execution failed.",
        visibility: "summary",
        actor: "director",
        detail: { trustedHostActionId: action.id, code },
        nowMs,
      });
    } catch { /* */ }
    return { ok: false, error: code, detail: redactSecrets(errText).slice(0, 500), action };
  }

  const resultObj = parseTrustedHostSqlOutput(outText);
  if (!resultObj) {
    action.state = "failed";
    action.failureReason = "result_parse_failed";
    action.completed_at = iso(nowMs);
    action.audit = buildAudit(action, { success: false, failureCode: "result_parse_failed" });
    writeAction(action);
    return { ok: false, error: "result_parse_failed", action };
  }

  const queryRel = action.inputs.queryArtifactPath
    || "docs/platform/planning/vacilando-os/qa/access-identity-v2/wave0-authority-census.json";
  const evidenceRel = String(queryRel).replace(/\.json$/i, "") + ".results.json";
  const storeEvidenceAbs = join(storeDir(), `${action.id}.results.json`);
  try {
    writeFileSync(storeEvidenceAbs, JSON.stringify({
      trusted_host_action_id: action.id,
      query_hash: action.inputs.queryHash,
      results: resultObj,
    }, null, 2));
  } catch { /* action.result still holds the census */ }
  const evidenceAbs = join(originatingRoot, evidenceRel);
  try {
    mkdirSync(dirname(evidenceAbs), { recursive: true });
    if (existsSync(evidenceAbs) && evidenceAbs.endsWith(".json")) {
      try {
        const prior = JSON.parse(readFileSync(evidenceAbs, "utf8"));
        const merged = {
          ...prior,
          status: "executed",
          query_hash: action.inputs.queryHash,
          execution: {
            ...(prior.execution || {}),
            executed: true,
            executed_at: iso(nowMs),
            executed_by: "trusted_host_action",
            trusted_host_action_id: action.id,
            authorization_id: action.authorizationId,
            query_hash: action.inputs.queryHash,
            database_target: action.inputs.databaseTarget,
            database_target_fingerprint: databaseTargetFingerprint(action.inputs.databaseTarget),
            blocker: null,
          },
          results: resultObj,
        };
        writeFileSync(evidenceAbs, JSON.stringify(merged, null, 2));
      } catch {
        writeFileSync(evidenceAbs, JSON.stringify({
          trusted_host_action_id: action.id,
          query_hash: action.inputs.queryHash,
          results: resultObj,
        }, null, 2));
      }
    } else {
      writeFileSync(evidenceAbs, JSON.stringify({
        trusted_host_action_id: action.id,
        query_hash: action.inputs.queryHash,
        results: resultObj,
      }, null, 2));
    }
  } catch {
    /* originating worktree write is best-effort; Director store holds the result */
  }

  const auditPath = join(storeDir(), `${action.id}.audit.json`);
  const audit = buildAudit(action, {
    success: true,
    rowCount: 1,
    outputArtifactPath: evidenceRel,
    authorizingOperator: authz.authorization?.granted_by || null,
  });
  writeFileSync(auditPath, JSON.stringify(audit, null, 2));

  action.state = "completed";
  action.executionState = "completed";
  action.completed_at = iso(nowMs);
  action.result = {
    databaseTarget: action.inputs.databaseTarget,
    queryHash: action.inputs.queryHash,
    rowCount: 1,
    census: resultObj,
    evidencePath: evidenceRel,
  };
  action.evidence = [
    { type: "query_artifact", path: action.inputs.queryArtifactPath },
    { type: "query_hash", value: action.inputs.queryHash },
    { type: "validation_report", value: action.inputs.validation },
    { type: "result_json", path: evidenceRel },
    { type: "execution_audit", path: auditPath },
  ];
  action.audit = audit;
  action.failureReason = null;
  action.updated_at = iso(nowMs);
  writeAction(action);
  markAuthorizationUsed(action.missionId, action.authorizationId, { nowMs });

  try {
    attachEvidence({
      missionId: action.missionId,
      assignmentId: action.assignmentId,
      type: "database",
      title: "Wave 0 authority census results (Trusted Host Action)",
      description: "Read-only deployed-database census completed on the trusted host. No credentials entered the worker.",
      fileUri: evidenceRel,
      acceptanceCriteriaIds: ["AC_W0"],
      createdBy: "director",
      nowMs,
    });
  } catch { /* */ }

  try {
    appendTimelineEvent(action.missionId, {
      type: "evidence_added",
      headline: "Database census completed",
      summary: "Results returned to Claude. Paused work can resume.",
      visibility: "summary",
      actor: "director",
      detail: { trustedHostActionId: action.id, evidencePath: evidenceRel },
      nowMs,
    });
  } catch { /* */ }

  return { ok: true, action, result: action.result, audit };
}

/**
 * Director path: request → recognize prior auth → authorize → execute.
 */
export function fulfillDatabaseCensusForMission(missionId, {
  assignmentId = null,
  executionSessionId = null,
  queryArtifactPath = "docs/platform/planning/vacilando-os/qa/access-identity-v2/wave0-authority-census.json",
  worktreePath = null,
  actor = "director",
  nowMs,
  grant = null,
  authorizationId = null,
  exactContext = null,
} = {}) {
  recognizePriorCensusAuthorization(missionId, { nowMs });

  const req = requestTrustedHostAction({
    missionId,
    assignmentId,
    executionSessionId,
    requestedBy: actor,
    actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
    inputs: {
      queryArtifactPath,
      databaseTarget: DEFAULT_TARGET,
      worktreePath,
    },
    nowMs,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) {
    return { ok: true, action: req.action, already: true };
  }

  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) {
    return {
      ok: false,
      error: "authorization_required",
      action: auth.action,
      decisionNeeded: {
        title: "Authorize read-only database census for this mission",
        recommendation: "Authorize read-only database census for this mission.",
        whatDirectorWillDo: [
          "validate the committed query",
          "run it through the trusted host",
          "store the result as evidence",
          "resume Claude",
        ],
      },
    };
  }

  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

export function trustedHostDiagnostics() {
  const envSource = resolveTrustedServerEnvSource();
  const credentialFilePresent = existsSync(envSource);
  ensureDir();
  const recentFailures = [];
  let lastSuccess = null;
  const activeActions = [];
  try {
    for (const f of fsReaddirSafe()) {
      try {
        const a = JSON.parse(readFileSync(join(storeDir(), f), "utf8"));
        if (["requested", "policy_review", "authorized", "executing", "retrying"].includes(a.state)) {
          activeActions.push({ id: a.id, state: a.state, actionType: a.actionType });
        }
        if (a.state === "failed") {
          recentFailures.push({ id: a.id, reason: a.failureReason, at: a.completed_at });
        }
        if (a.state === "completed") {
          if (!lastSuccess || Date.parse(a.completed_at || 0) > Date.parse(lastSuccess.at || 0)) {
            lastSuccess = { id: a.id, at: a.completed_at, actionType: a.actionType };
          }
        }
      } catch { /* */ }
    }
  } catch { /* */ }

  return {
    kind: "trusted_host_diagnostics",
    hostRuntimeAvailable: existsSync(RUN_SQL_SH),
    databaseCredentialAvailable: credentialFilePresent,
    approvedDatabaseTarget: DEFAULT_TARGET,
    registeredActions: listRegisteredActions(),
    activeActions,
    recentFailures: recentFailures.slice(-10),
    lastSuccessfulAction: lastSuccess,
    note: "Secret values are never displayed.",
    directorCapabilities: (() => {
      try {
        const live = directorRegistryFreshness();
        return {
          stale: live.stale,
          loaded_fingerprint: live.loaded.fingerprint,
          current_fingerprint: live.disk.fingerprint,
          loaded_action_keys: live.loaded.actionKeys,
          current_action_keys: live.disk.actionKeys,
        };
      } catch {
        return null;
      }
    })(),
  };
}

function fsReaddirSafe() {
  return readdirSync(storeDir()).filter((f) => f.startsWith("tha_") && f.endsWith(".json"));
}

/**
 * After control-plane restart: stuck "executing" actions cannot be trusted mid-flight.
 * Mark them failed for safe retry (dedupe excludes failed). Never re-expose credentials.
 */
export function reconcileTrustedHostActionsOnBoot({ nowMs } = {}) {
  ensureDir();
  const interrupted = [];
  for (const f of fsReaddirSafe()) {
    try {
      const a = JSON.parse(readFileSync(join(storeDir(), f), "utf8"));
      if (a.state === "executing" || a.state === "retrying") {
        a.state = "failed";
        a.executionState = "interrupted_by_restart";
        a.failureReason = {
          code: "host_restart",
          detail: "Control plane restarted while Trusted Host Action was in flight. Safe to retry.",
        };
        a.completed_at = iso(nowMs);
        a.updated_at = iso(nowMs);
        writeAction(a);
        interrupted.push(a.id);
        try {
          appendTimelineEvent(a.missionId, {
            type: "progress",
            headline: "Trusted Host Action interrupted by restart",
            summary: "Director will not ask for Terminal workarounds. Retry the registered action.",
            visibility: "summary",
            actor: "director",
            detail: { trustedHostActionId: a.id },
            nowMs,
          });
        } catch { /* */ }
      }
    } catch { /* */ }
  }
  return { interrupted };
}

let mergeGhForTests = null;
// Injection seams for the two remote actions added alongside merge. The guard
// in trusted-host-remote-guard treats an injected client as simulated, so a
// test that forgets one is refused rather than reaching the real remote.
let pushGitForTests = null;
let openPrGhForTests = null;

export function setPushGitForTests(fn) {
  pushGitForTests = typeof fn === "function" ? fn : null;
}
export function setOpenPrGhForTests(fn) {
  openPrGhForTests = typeof fn === "function" ? fn : null;
}

let migrationRunnersForTests = null;

export function setTrustedHostMergeGhForTests(fn) {
  mergeGhForTests = typeof fn === "function" ? fn : null;
}

export function setTrustedHostMigrationRunnersForTests(runners = null) {
  migrationRunnersForTests = runners;
}

function payloadHasSecrets(value) {
  const text = typeof value === "string" ? value : (() => {
    try { return JSON.stringify(value); } catch { return ""; }
  })();
  return /postgresql:\/\/|postgres:\/\/|DATABASE_URL|ghp_[A-Za-z0-9]|github_pat_/i.test(text);
}

function failTrustedAction(action, code, detail, { nowMs } = {}) {
  action.state = "failed";
  action.executionState = "failed";
  action.failureReason = code;
  action.completed_at = iso(nowMs);
  action.updated_at = iso(nowMs);
  action.result = { ok: false, code, detail: redactSecrets(detail || code).slice(0, 400) };
  writeAction(action);
  return { ok: false, error: code, detail: action.result.detail, action };
}

function completeTrustedAction(action, result, { nowMs } = {}) {
  action.state = "completed";
  action.executionState = "completed";
  action.completed_at = iso(nowMs);
  action.updated_at = iso(nowMs);
  action.result = result;
  action.failureReason = null;
  writeAction(action);
  return { ok: true, action, result };
}

export function executeMergeTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  // Re-authorized here on purpose: execution must never trust that an earlier
  // call in this same flow already checked. The grant is threaded through so
  // this second check re-derives from the action's own inputs rather than being
  // skipped — the defence stays, it just has the evidence it needs.
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  const out = mergePullRequest(action.inputs, mergeGhForTests ? { gh: mergeGhForTests } : {});
  if (payloadHasSecrets(out)) {
    return failTrustedAction(action, "result_contained_secrets", "Merge result contained secrets and was discarded.", { nowMs });
  }
  if (!out?.ok) {
    return failTrustedAction(action, out?.code || "merge_failed", out?.detail || "Merge failed", { nowMs });
  }
  return completeTrustedAction(action, publicMergeResult(out), { nowMs });
}

/**
 * Classify a trusted-host SQL child's stderr into a NAMED code.
 *
 * A missing executable used to reach the caller as a generic `preflight_failed` / `execution_failed`
 * / `apply_failed`, so the one line that actually mattered -- "psql: command not found" -- never
 * reached anyone who could act on it. That cost several certification runs across a product lane,
 * which spent them re-requesting a capability that could never succeed.
 *
 * `fallback` is the caller's own operation-shaped code and still applies to genuine SQL failures.
 */
function classifySqlChildFailure(errText, fallback) {
  if (/trusted_credential_unavailable/.test(errText)) return "trusted_credential_unavailable";
  if (/trusted_host_dependency_missing/.test(errText)) return "trusted_host_dependency_missing";
  // Defence in depth: the child resolves psql itself now, but an older child or a different missing
  // binary must still surface as a dependency problem rather than as a failed query.
  if (/command not found|No such file or directory/.test(errText)) return "trusted_host_dependency_missing";
  return fallback;
}

function defaultInspectLedger({ version }) {
  const tmpDir = join(storeDir(), "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const sqlFile = join(tmpDir, `ledger-${version}.sql`);
  const outFile = join(tmpDir, `ledger-${version}.out`);
  const errFile = join(tmpDir, `ledger-${version}.err`);
  writeFileSync(sqlFile, ledgerLookupSql(version));
  try { chmodSync(RUN_SQL_SH, 0o755); } catch { /* */ }
  const child = spawnSync("bash", [RUN_SQL_SH, sqlFile, outFile, errFile], {
    env: {
      ...process.env,
      ALLOY_CANONICAL_ROOT: resolveCanonicalRepoRoot(),
      ALLOY_REPO: resolveCanonicalRepoRoot(),
      ALLOY_SERVER_ENV_SOURCE: resolveTrustedServerEnvSource(),
      VACILANDO_CHECKOUT: findRepoRoot(),
      ALLOY_WORKTREE: findRepoRoot(),
      ALLOY_BLOCK_REMOTE_SUPABASE: "",
    },
    timeout: 60_000,
    encoding: "utf8",
  });
  const outText = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  const errText = redactSecrets(existsSync(errFile) ? readFileSync(errFile, "utf8") : (child.stderr || ""));
  try { unlinkSync(sqlFile); } catch { /* */ }
  if (child.status !== 0) {
    return {
      ok: false,
      applied: false,
      code: classifySqlChildFailure(errText, "preflight_failed"),
      detail: errText.slice(0, 400) || "Ledger inspect failed",
    };
  }
  const applied = String(outText).includes(String(version));
  if (!applied) return { applied: false };

  /*
   * RECORDED IS NOT THE SAME AS APPLIED.
   *
   * A certification database was found recording five Enrollment migrations while three of their
   * effects were absent -- indexes missing, a backfill with no trace. Because the executor trusted
   * the version string, every apply reported ok:true and did nothing. Silent and confidently wrong.
   *
   * So a recorded version is verified against evidence only a successful run could have produced.
   * A migration that declares no postcondition keeps the old behaviour rather than blocking every
   * migration the platform has ever applied, and a verifier that cannot RUN is not treated as a
   * failed verifier -- an unreadable probe must not manufacture a mismatch.
   */
  const probe = migrationPostconditionSql(version);
  if (!probe) return { applied: true, verification: "unverifiable" };

  const verified = runLedgerProbe(probe, `verify-${version}`);
  if (!verified.ok) return { applied: true, verification: "unverifiable", detail: verified.detail };
  if (verified.satisfied) return { applied: true, verification: "verified" };

  const expected = migrationPostconditionDescription(version) || "declared postcondition";
  return {
    applied: true,
    inconsistent: true,
    detail:
      `Ledger records ${version} as applied, but its durable postcondition is absent. `
      + `Expected: ${expected}. Observed: the probe returned false. `
      + `The migration was recorded without taking effect; repair the ledger entry and re-apply `
      + `through the governed executor rather than trusting the record.`,
  };
}

/** Run a single-boolean probe through the trusted SQL child. Never throws. */
function runLedgerProbe(sql, label) {
  const tmpDir = join(storeDir(), "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const sqlFile = join(tmpDir, `${label}.sql`);
  const outFile = join(tmpDir, `${label}.out`);
  const errFile = join(tmpDir, `${label}.err`);
  writeFileSync(sqlFile, sql);
  try { chmodSync(RUN_SQL_SH, 0o755); } catch { /* */ }
  const child = spawnSync("bash", [RUN_SQL_SH, sqlFile, outFile, errFile], {
    env: {
      ...process.env,
      ALLOY_CANONICAL_ROOT: resolveCanonicalRepoRoot(),
      ALLOY_REPO: resolveCanonicalRepoRoot(),
      ALLOY_SERVER_ENV_SOURCE: resolveTrustedServerEnvSource(),
      VACILANDO_CHECKOUT: findRepoRoot(),
      ALLOY_WORKTREE: findRepoRoot(),
      ALLOY_BLOCK_REMOTE_SUPABASE: "",
    },
    timeout: 60_000,
    encoding: "utf8",
  });
  const outText = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  const errText = redactSecrets(existsSync(errFile) ? readFileSync(errFile, "utf8") : (child.stderr || ""));
  try { unlinkSync(sqlFile); } catch { /* */ }
  if (child.status !== 0) return { ok: false, detail: errText.slice(0, 300) || "postcondition probe failed" };
  // psql -A -t prints a bare `t` or `f`; anything else is not an answer this may act on.
  const answer = String(outText).replace(/BEGIN|COMMIT/g, "").trim().split(/\s+/).filter(Boolean).pop();
  if (answer !== "t" && answer !== "f") return { ok: false, detail: "postcondition probe returned no boolean" };
  return { ok: true, satisfied: answer === "t" };
}

function defaultApplyMigrationFile({ entry, text }) {
  const tmpDir = join(storeDir(), "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const file = join(tmpDir, `${entry.version}.sql`);
  const outFile = join(tmpDir, `${entry.version}.out`);
  const errFile = join(tmpDir, `${entry.version}.err`);
  writeFileSync(file, text);
  try { chmodSync(APPLY_MIGRATION_SH, 0o755); } catch { /* */ }
  const child = spawnSync("bash", [APPLY_MIGRATION_SH, file, outFile, errFile], {
    env: {
      ...process.env,
      ALLOY_CANONICAL_ROOT: resolveCanonicalRepoRoot(),
      ALLOY_REPO: resolveCanonicalRepoRoot(),
      ALLOY_SERVER_ENV_SOURCE: resolveTrustedServerEnvSource(),
      VACILANDO_CHECKOUT: findRepoRoot(),
      ALLOY_WORKTREE: findRepoRoot(),
      ALLOY_BLOCK_REMOTE_SUPABASE: "",
    },
    timeout: 180_000,
    encoding: "utf8",
  });
  const errText = redactSecrets(existsSync(errFile) ? readFileSync(errFile, "utf8") : (child.stderr || ""));
  try { unlinkSync(file); } catch { /* */ }
  if (child.status !== 0) {
    return { ok: false, code: classifySqlChildFailure(errText, "apply_failed"), detail: errText.slice(0, 400) };
  }
  return { ok: true, ledger: "applied" };
}

export function executeMigrationTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  const runners = migrationRunnersForTests || {};
  const out = applyMigrationBatch(action.inputs, {
    inspectLedger: runners.inspectLedger || defaultInspectLedger,
    applyFile: runners.applyFile || defaultApplyMigrationFile,
    readContent: runners.readContent || readMigrationContent,
    nowMs,
  });
  if (payloadHasSecrets(out)) {
    return failTrustedAction(action, "result_contained_secrets", "Migration result contained secrets and was discarded.", { nowMs });
  }
  if (!out?.ok) {
    const failed = out?.results?.find((r) => !r.ok);
    const publicResult = publicMigrationResult(out);
    const failedAction = failTrustedAction(
      action,
      failed?.code || "apply_failed",
      failed?.detail || "Migration batch stopped on failure.",
      { nowMs },
    );
    if (failedAction.action) {
      failedAction.action.result = {
        ...publicResult,
        ok: false,
        code: failed?.code || "apply_failed",
        detail: failed?.detail || "Migration batch stopped on failure.",
      };
      writeAction(failedAction.action);
    }
    return failedAction;
  }
  const result = { ...publicMigrationResult(out), ok: true };
  action.result = result;
  return completeTrustedAction(action, result, { nowMs });
}

/**
 * Push a reviewed branch. Re-authorized here on purpose: execution must never
 * trust that an earlier call in this same flow already checked.
 */
export function executePushTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  const out = pushBranch(action.inputs, pushGitForTests ? { git: pushGitForTests } : {});
  if (payloadHasSecrets(out)) {
    return failTrustedAction(action, "result_contained_secrets", "Push result contained secrets and was discarded.", { nowMs });
  }
  if (!out?.ok) {
    return failTrustedAction(action, out?.code || "push_failed", out?.detail || "Push failed", { nowMs });
  }
  return completeTrustedAction(action, publicPushResult(out), { nowMs });
}

/**
 * Restore a managed slot's QA browser session.
 *
 * Mirrors the push and open-PR executors exactly, because `applyExecuteResult` requires the
 * `{ ok, action }` shape with `action.state === "completed"` — returning a bare restore result
 * reads to the caller as a failed execution. `executeRestoreQaSessionSync` is used because this
 * path is synchronous: `processGovernedAction` does not await its executor.
 */
export function executeRestoreQaSessionTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  const out = executeRestoreQaSessionSync({
    action,
    grant,
    grantCheck: grantAuthorizesAction,
    nowMs: nowMs || Date.now(),
  });
  if (payloadHasSecrets(out)) {
    return failTrustedAction(action, "result_contained_secrets", "Restore result contained secrets and was discarded.", { nowMs });
  }
  if (!out?.ok) {
    return failTrustedAction(action, out?.failure_code || "restore_failed", out?.failure_detail || "QA session restore failed", { nowMs });
  }
  return completeTrustedAction(action, out, { nowMs });
}

/** Provision the managed QA identity, in the `{ ok, action }` shape applyExecuteResult requires. */
export function executeProvisionQaIdentityTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  const out = executeProvisionQaIdentitySync({
    action, grant, grantCheck: grantAuthorizesAction, nowMs: nowMs || Date.now(),
  });
  if (payloadHasSecrets(out)) {
    return failTrustedAction(action, "result_contained_secrets", "Provisioning result contained secrets and was discarded.", { nowMs });
  }
  if (!out?.ok) {
    return failTrustedAction(action, out?.failure_code || "provision_failed", out?.failure_detail || "QA identity provisioning failed", { nowMs });
  }
  return completeTrustedAction(action, out, { nowMs });
}

/** Assign application access, in the `{ ok, action }` shape applyExecuteResult requires. */
export function executeAssignQaAccessTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  const out = executeAssignQaAccessSync({ action, grant, grantCheck: grantAuthorizesAction, nowMs: nowMs || Date.now() });
  if (payloadHasSecrets(out)) {
    return failTrustedAction(action, "result_contained_secrets", "Assignment result contained secrets and was discarded.", { nowMs });
  }
  if (!out?.ok) {
    return failTrustedAction(action, out?.failure_code || "assign_failed", out?.failure_detail || "QA access assignment failed", { nowMs });
  }
  return completeTrustedAction(action, out, { nowMs });
}

/** Mission-scoped entry point for access assignment; `defaultExecute` dispatches here. */
export function fulfillAssignQaAccessForMission(missionId, {
  assignmentId = null,
  executionSessionId = null,
  inputs = {},
  actor = "director",
  nowMs,
  grant = null,
  authorizationId = null,
  exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId, assignmentId, executionSessionId, requestedBy: actor,
    actionType: ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS, inputs, nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) return { ok: false, error: "authorization_required", action: auth.action };
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

/** Mission-scoped entry point for provisioning; `defaultExecute` dispatches here. */
export function fulfillProvisionQaIdentityForMission(missionId, {
  assignmentId = null,
  executionSessionId = null,
  inputs = {},
  actor = "director",
  nowMs,
  grant = null,
  authorizationId = null,
  exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId, assignmentId, executionSessionId, requestedBy: actor,
    actionType: ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY, inputs, nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) return { ok: false, error: "authorization_required", action: auth.action };
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

/**
 * The mission-scoped entry point the governed processor calls.
 *
 * `defaultExecute` in governed-action-request.mjs dispatches to a `fulfill*ForMission` helper per
 * action and falls through to `action_unavailable` for anything without one. The restore was
 * registered and mode-mapped but had no helper, so it fell through and failed after the operator
 * had already approved it. Modelled on `fulfillRepositoryPushForMission`.
 */
export function fulfillRestoreQaSessionForMission(missionId, {
  assignmentId = null,
  executionSessionId = null,
  inputs = {},
  actor = "director",
  nowMs,
  grant = null,
  authorizationId = null,
  exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId, assignmentId, executionSessionId, requestedBy: actor,
    actionType: ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION, inputs, nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) return { ok: false, error: "authorization_required", action: auth.action };
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

/** Open the promotion pull request, or report the one that already exists. */
export function executeOpenPrTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  const out = openPullRequest(action.inputs, openPrGhForTests ? { gh: openPrGhForTests } : {});
  if (payloadHasSecrets(out)) {
    return failTrustedAction(action, "result_contained_secrets", "Pull request result contained secrets and was discarded.", { nowMs });
  }
  if (!out?.ok) {
    return failTrustedAction(action, out?.code || "open_pr_failed", out?.detail || "Opening the pull request failed", { nowMs });
  }
  return completeTrustedAction(action, publicOpenPrResult(out), { nowMs });
}


export function executeClosePullRequestTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  const out = closePullRequest(action.inputs, {});
  if (payloadHasSecrets(out)) {
    return failTrustedAction(action, "result_contained_secrets", "Result contained secrets and was discarded.", { nowMs });
  }
  if (!out?.ok) return failTrustedAction(action, out?.code || "close_pr_failed", out?.detail || "Closing the pull request failed", { nowMs });
  return completeTrustedAction(action, {
    repository: out.repository, pullRequestNumber: out.pullRequestNumber,
    state: out.state, merged: out.merged,
    state_before: out.state_before, state_after: out.state_after, credentialsExposed: false,
  }, { nowMs });
}

export function executeDeleteRemoteBranchTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  const out = deleteRemoteBranch(action.inputs, {});
  if (payloadHasSecrets(out)) {
    return failTrustedAction(action, "result_contained_secrets", "Result contained secrets and was discarded.", { nowMs });
  }
  if (!out?.ok) return failTrustedAction(action, out?.code || "delete_branch_failed", out?.detail || "Deleting the remote branch failed", { nowMs });
  return completeTrustedAction(action, {
    repository: out.repository, branch: out.branch, deleted: out.deleted,
    deleted_head_sha: out.deleted_head_sha, dependents_at_deletion: out.dependents_at_deletion,
    credentialsExposed: false,
  }, { nowMs });
}


export function executeApplyReconciliationPlanTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);

  // THE EXECUTOR RECOMPUTES. It never trusts the correction list it was handed:
  // an ad hoc list supplied by a caller must not be executable, so the plan is
  // rebuilt from live observation and compared by fingerprint.
  const root = action.inputs?.runtimeRoot || runtimeRoot();
  let fresh;
  try {
    // Gathers reality itself. Accepting it from inputs meant the executor
    // observed whatever the caller described, which is not re-observation.
    fresh = gatherObservation({ root, worktreeParent: action.inputs?.worktreeParent || null });
  } catch (e) {
    return failTrustedAction(action, "observation_failed", String(e?.message || e), { nowMs });
  }
  const rebuilt = buildReconciliationPlan(fresh, { nowMs, planId: action.inputs?.planId });
  if (rebuilt.fingerprint !== action.inputs?.planFingerprint) {
    return failTrustedAction(action, "stale_plan",
      `plan fingerprint ${action.inputs?.planFingerprint} no longer describes observed state (now ${rebuilt.fingerprint})`, { nowMs });
  }
  const out = applyReconciliationPlan(rebuilt, { root, freshObservation: fresh, nowMs });
  if (!out.ok) return failTrustedAction(action, out.error || "apply_failed", out.reason || "reconciliation apply refused", { nowMs });
  return completeTrustedAction(action, {
    plan_id: out.plan_id, plan_fingerprint: out.fingerprint,
    requested: out.requested, applied: out.applied, skipped: out.skipped,
    withheld: out.withheld, unsupported: out.unsupported, credentialsExposed: false,
  }, { nowMs });
}

export function executeRetireWorktreeTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);

  // The executor re-measures every safety gate itself. What the request carries
  // is a claim about a moment that has already passed.
  const root = action.inputs?.runtimeRoot || runtimeRoot();
  let out;
  try {
    out = executeWorktreeRetirement({
      root,
      worktree: action.inputs?.worktree,
      repository: action.inputs?.repository,
      expectedFingerprint: action.inputs?.safetyFingerprint,
      expectedHeadSha: action.inputs?.headSha,
      expectedBranch: action.inputs?.branch,
      worktreeParent: action.inputs?.worktreeParent || null,
      canonicalRoot: action.inputs?.canonicalRoot || null,
      requestingWorktree: action.inputs?.requestingWorktree || null,
      s7State: action.inputs?.s7State || null,
      nowMs,
    });
  } catch (e) {
    return failTrustedAction(action, "retirement_failed", String(e?.message || e), { nowMs });
  }
  if (!out.ok) {
    return failTrustedAction(action, out.error || "retirement_refused",
      out.reason || out.detail || `retirement refused: ${out.error}`, { nowMs });
  }
  return completeTrustedAction(action, {
    worktree: out.worktree, path: out.path, branch: out.branch, head_sha: out.head_sha,
    safety_fingerprint: out.fingerprint, applied: out.applied,
    postconditions: out.postconditions, removal_method: out.removal_method,
    branch_deleted: out.branch_deleted, credentialsExposed: false,
  }, { nowMs });
}

/**
 * Execute the ceiling move by invoking the canonical command.
 *
 * This function adds authority and an audit trail. It adds NO behaviour: the
 * constant key, the range, compare-and-set, readback verification and the
 * change log all belong to `vac capacity set-provider-ceiling`. Re-implementing
 * any of them here would create a second path to the same file that the tests
 * for the first path do not cover, and the more permissive of two such paths is
 * the one that eventually gets used.
 */
export function executeSetProviderCeilingTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);

  const i = action.inputs || {};
  let out;
  try {
    out = executeProviderCeiling({
      expected: Number(i.expected_ceiling ?? i.expectedCeiling),
      requested: Number(i.requested_ceiling ?? i.requestedCeiling),
      rollbackTo: Number(i.rollback_ceiling ?? i.rollbackCeiling),
      reason: i.reason,
      experimentId: i.experiment_id ?? i.experimentId ?? null,
    }, { vacPath: i.vacPath || null });
  } catch (e) {
    return failTrustedAction(action, "ceiling_change_failed", String(e?.message || e), { nowMs });
  }
  if (!out.ok) {
    return failTrustedAction(action, out.error || "ceiling_change_refused",
      out.detail || `provider ceiling change refused: ${out.error}`, { nowMs });
  }
  // A write reported without a readback is exactly the uncertainty this whole
  // capability exists to remove, so it fails rather than reporting success.
  if (out.readback_verified !== true) {
    return failTrustedAction(action, "readback_not_verified",
      `config did not read back as ${i.requested_ceiling}`, { nowMs });
  }
  return completeTrustedAction(action, {
    key: out.key,
    previous_value: out.previous_value,
    new_value: out.new_value,
    rollback_value: out.rollback_value,
    readback_verified: true,
    reason: out.reason,
    experiment_id: out.experiment_id,
    audited_at: out.audited_at,
    credentialsExposed: false,
  }, { nowMs });
}

export function fulfillSetProviderCeilingForMission(missionId, {
  assignmentId = null, executionSessionId = null, inputs = {},
  actor = "director", nowMs, grant = null, authorizationId = null, exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId, assignmentId, executionSessionId, requestedBy: actor,
    actionType: ACTION_TYPES.CAPACITY_SET_PROVIDER_CEILING, inputs, nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) return { ok: false, error: "authorization_required", action: auth.action };
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

/**
 * Converge the installed toolkit onto promoted staging.
 *
 * The restart is NOT done here. The Gateway is the process executing this
 * action; restarting it from inside itself kills the write that records what
 * just happened, and the completion line for an install is the one piece of
 * audit nobody can reconstruct afterwards. The result therefore reports
 * `gateway_restart_required` and leaves reconciliation to a separate bounded
 * step, keeping installed and running as the two distinct facts they are.
 */
export function executeInstallToolkitTrustedHostAction(action, { actor = "director", nowMs, grant = null } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs, grant });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);

  const i = action.inputs || {};
  let out;
  try {
    out = executeToolkitInstall({
      expectedStagingSha: i.expected_staging_sha ?? i.expectedStagingSha ?? null,
    });
  } catch (e) {
    out = { ok: false, error: "install_threw", detail: String(e?.message || "").slice(0, 300) };
  }

  if (!out.ok) {
    action.state = "failed";
    action.executionState = "failed";
    action.failureReason = out.error;
    action.completed_at = iso(nowMs);
    action.updated_at = iso(nowMs);
    writeAction(action);
    return { ok: false, error: out.error, detail: out.detail || null, action };
  }

  action.state = "completed";
  action.executionState = "completed";
  action.result = {
    installed_sha: out.installed_sha,
    previous_sha: out.previous_sha,
    already_converged: out.already_converged,
    readback_verified: out.readback_verified,
    rollback_target: out.rollback_target,
    gateway_restart_required: out.gateway_restart_required,
    credentialsExposed: false,
  };
  action.completed_at = iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  return { ok: true, action };
}

export function fulfillInstallToolkitForMission(missionId, {
  assignmentId = null, executionSessionId = null, inputs = {},
  actor = "director", nowMs, grant = null, authorizationId = null, exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId, assignmentId, executionSessionId, requestedBy: actor,
    actionType: ACTION_TYPES.HOST_INSTALL_TOOLKIT, inputs, nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) return { ok: false, error: "authorization_required", action: auth.action };
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

export function fulfillRetireWorktreeForMission(missionId, {
  assignmentId = null, executionSessionId = null, inputs = {},
  actor = "director", nowMs, grant = null, authorizationId = null, exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId, assignmentId, executionSessionId, requestedBy: actor,
    actionType: ACTION_TYPES.VACILANDO_RETIRE_WORKTREE, inputs, nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) return { ok: false, error: "authorization_required", action: auth.action };
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

export function fulfillApplyReconciliationPlanForMission(missionId, {
  assignmentId = null, executionSessionId = null, inputs = {},
  actor = "director", nowMs, grant = null, authorizationId = null, exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId, assignmentId, executionSessionId, requestedBy: actor,
    actionType: ACTION_TYPES.VACILANDO_APPLY_RECONCILIATION_PLAN, inputs, nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) return { ok: false, error: "authorization_required", action: auth.action };
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

export function fulfillClosePullRequestForMission(missionId, {
  assignmentId = null, executionSessionId = null, inputs = {},
  actor = "director", nowMs, grant = null, authorizationId = null, exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId, assignmentId, executionSessionId, requestedBy: actor,
    actionType: ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST, inputs, nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) return { ok: false, error: "authorization_required", action: auth.action };
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

export function fulfillDeleteRemoteBranchForMission(missionId, {
  assignmentId = null, executionSessionId = null, inputs = {},
  actor = "director", nowMs, grant = null, authorizationId = null, exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId, assignmentId, executionSessionId, requestedBy: actor,
    actionType: ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH, inputs, nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) return { ok: false, error: "authorization_required", action: auth.action };
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

export function fulfillRepositoryPushForMission(missionId, {
  assignmentId = null,
  executionSessionId = null,
  inputs = {},
  actor = "director",
  nowMs,
  grant = null,
  authorizationId = null,
  exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId, assignmentId, executionSessionId, requestedBy: actor,
    actionType: ACTION_TYPES.REPOSITORY_PUSH, inputs, nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) return { ok: false, error: "authorization_required", action: auth.action };
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

export function fulfillPromotionOpenPrForMission(missionId, {
  assignmentId = null,
  executionSessionId = null,
  inputs = {},
  actor = "director",
  nowMs,
  grant = null,
  authorizationId = null,
  exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId, assignmentId, executionSessionId, requestedBy: actor,
    actionType: ACTION_TYPES.PROMOTION_OPEN_PR, inputs, nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) return { ok: false, error: "authorization_required", action: auth.action };
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

export function fulfillRepositoryMergeForMission(missionId, {
  assignmentId = null,
  executionSessionId = null,
  inputs = {},
  actor = "director",
  nowMs,
  grant = null,
  authorizationId = null,
  exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId,
    assignmentId,
    executionSessionId,
    requestedBy: actor,
    actionType: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    inputs,
    nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) {
    return {
      ok: false,
      error: "authorization_required",
      action: auth.action,
    };
  }
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

export function fulfillDatabaseMigrationForMission(missionId, {
  assignmentId = null,
  executionSessionId = null,
  inputs = {},
  actor = "director",
  nowMs,
  grant = null,
  authorizationId = null,
  exactContext = null,
} = {}) {
  const req = requestTrustedHostAction({
    missionId,
    assignmentId,
    executionSessionId,
    requestedBy: actor,
    actionType: ACTION_TYPES.DATABASE_APPLY_MIGRATION,
    inputs,
    nowMs,
    authorizationContext: exactContext,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs, grant, authorizationId, exactContext });
  if (!auth.ok) {
    return {
      ok: false,
      error: "authorization_required",
      action: auth.action,
    };
  }
  return executeTrustedHostAction(req.action.id, { actor, nowMs, grant });
}

export { ACTION_TYPES, listRegisteredActions };
