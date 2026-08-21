/**
 * Worker → Director governed-action handoff.
 *
 * A Development Lane that has proven it cannot reach a registered trusted-host
 * capability emits a durable request. Director validates, auto-executes or
 * asks the operator, then returns a bounded result to the same lane.
 *
 * This is not a parallel orchestrator: it sits on execution runs, mission
 * decisions, and trusted-host actions.
 */
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  ACTION_TYPES,
  DEFAULT_TARGET,
  classifyActionAvailability,
  getActionDefinition,
} from "./trusted-host-action-registry.mjs";
import {
  classifyGovernedActionFailure,
  directorRegistryFreshness,
  markDirectorCapabilitiesCurrent,
  operatorDirectorCopy,
  readDirectorCapabilityStatus,
  refreshDirectorCapabilities,
} from "./director-capability-freshness.mjs";
import {
  findAuthorization,
  grantMissionAuthorization,
} from "./trusted-host-authz.mjs";
import {
  fulfillDatabaseCensusForMission,
  fulfillRepositoryMergeForMission,
  fulfillDatabaseMigrationForMission,
  fulfillDatabaseLedgerRepairForMission,
  fulfillApplicationCertifyStagingForMission,
  fulfillApplicationEnsureCertificationPrincipalForMission,
} from "./trusted-host-actions.mjs";
import {
  assertGovernedActionIdentity,
  classifyStoredGovernedCompletion,
  completionNotificationFor,
  continuationSummaryFor,
  invalidateGovernedCompletion,
  stampGovernedIdentity,
} from "./governed-action-integrity.mjs";
import { ACCESS_IDENTITY_STAGING_MIGRATIONS } from "./trusted-host-migrate.mjs";
import { createDecision, listDecisions, answerDecision } from "./decisions.mjs";
import { appendTimelineEvent } from "./timeline.mjs";
import { attachEvidence } from "./evidence.mjs";
import {
  activeRunForLane,
  candidateRuntimeRoots,
  findExecutionRun,
  getExecutionRun as getExecutionRun,
  isTerminalRunState as isTerminalRunState,
  patchRunFields as patchRunFields,
  patchRunResourceWait as patchRunResourceWait,
  publicExecutionRun,
  transitionExecutionRun,
} from "./execution-run.mjs";
import { canonicalLaneStoreId, getDurableLane, missionIdForLane } from "./development-lane.mjs";

export const GOVERNED_ACTION_SCHEMA = "vacilando.governed_action_request.v1";
export const DIRECTOR_GOVERNED_RESOURCE_KEY = "director_governed_action";
export const Q15_CENSUS_ARTIFACT =
  "docs/platform/planning/vacilando-os/qa/access-identity-v2/q15-authority-census.json";

export const GOVERNED_STATUSES = Object.freeze([
  "requested",
  "awaiting_director",
  "awaiting_operator",
  "executing",
  "complete",
  "failed",
  "invalidated",
]);

export const GOVERNED_MODES = Object.freeze([
  "read_only",
  "certification",
  "migration_apply",
  "promotion",
  "privileged_write",
  "other",
]);

export const PENDING_GOVERNED_STATUSES = Object.freeze([
  "requested",
  "awaiting_director",
  "awaiting_control_plane_refresh",
  "awaiting_operator",
  "executing",
]);

const STALE_REGISTRY_FAILURES = new Set([
  "unauthorized_action_key",
  "unsupported_action_key",
  "director_registry_stale",
  "action_unavailable",
  "unknown_action_type",
]);

function secretRe() {
  return /postgresql:\/\/[^\s]+|postgres:\/\/[^\s]+|DATABASE_URL|CERT_OPERATOR_PASSWORD[^\s]*|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi;
}

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

function bound(s, max) {
  const t = String(s || "").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function storePath(root = runtimeRoot()) {
  return join(root, "vacilando", "governed-actions", "requests.json");
}

function auditPath(root = runtimeRoot()) {
  return join(root, "vacilando", "governed-actions", "audit.jsonl");
}

function notifyPath(root = runtimeRoot()) {
  return join(root, "vacilando", "notifications", "events.jsonl");
}

function emptyStore() {
  return { schema_version: GOVERNED_ACTION_SCHEMA, requests: [] };
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function readGovernedActionStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(storePath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    return {
      schema_version: GOVERNED_ACTION_SCHEMA,
      requests: Array.isArray(raw.requests) ? raw.requests : [],
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store, root) {
  atomicWrite(storePath(root), store);
  return store;
}

function newRequestId() {
  return `gar_${randomBytes(7).toString("hex")}`;
}

function redact(text) {
  return String(text || "").replace(secretRe(), "[redacted]");
}

function containsSecret(value) {
  if (value == null) return false;
  const text = typeof value === "string" ? value : (() => {
    try { return JSON.stringify(value); } catch { return ""; }
  })();
  return secretRe().test(text);
}

export function isPendingGovernedStatus(status) {
  return PENDING_GOVERNED_STATUSES.includes(status);
}

export function presentationForGovernedAction(req = {}) {
  const key = req.action_key || "";
  const inputs = req.inputs || {};
  if (req.status === "awaiting_control_plane_refresh") {
    const copy = operatorDirectorCopy("refreshing");
    const mergeN = inputs.pull_request_number || inputs.pullRequestNumber || "";
    return {
      approve_label: key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST ? "Authorize merge" : "Authorize",
      deny_label: "Deny",
      wait_label: copy.lane_label,
      mission_need: copy.mission_label,
      detail: mergeN
        ? `${copy.detail} Merge of PR #${mergeN} will be offered for approval next.`
        : copy.detail,
    };
  }
  if (key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    const n = inputs.pull_request_number || inputs.pullRequestNumber || "";
    const sha = String(inputs.expected_head_sha || inputs.expectedHeadSha || "").slice(0, 12);
    return {
      approve_label: "Authorize merge",
      deny_label: "Deny",
      wait_label: "Waiting on Director — staging merge",
      mission_need: `Needs approval — Merge PR #${n} into staging`,
      detail: `Merge PR #${n} into staging · expected SHA ${sha || "—"} · method ${inputs.merge_method || inputs.mergeMethod || "merge"}`,
    };
  }
  if (key === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    const list = Array.isArray(inputs.migrations) ? inputs.migrations : [];
    const n = list.length || (inputs.expected_version ? 1 : 0);
    const awaiting = req.status === "awaiting_operator";
    return {
      approve_label: "Authorize staging migrations",
      deny_label: "Deny",
      wait_label: "Waiting on Director — staging schema promotion",
      mission_need: awaiting
        ? "Needs approval — Apply Access & Identity staging migrations"
        : "Preparing staging schema promotion",
      detail: `Apply ${n || "ordered"} staging schema migration${n === 1 ? "" : "s"} · stop on first failure`,
    };
  }
  if (key === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER) {
    const versions = inputs.versions || inputs.expected_ledger_versions || [];
    return {
      approve_label: "Authorize repair",
      deny_label: "Stop promotion",
      wait_label: "Waiting on Director — repair staging migration history",
      mission_need: "Needs approval — Repair staging migration history",
      detail: `Remove false ledger records so verified migrations can be applied safely · ${Array.isArray(versions) ? versions.length : 0} version(s)`,
    };
  }
  if (key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING) {
    const mutate = (inputs.write_policy || inputs.writePolicy) === "mutate";
    const awaiting = req.status === "awaiting_operator";
    return {
      approve_label: mutate ? "Authorize staging write certification" : "Authorize staging certification",
      deny_label: "Deny",
      wait_label: "Waiting on Director — staging certification",
      mission_need: mutate && awaiting
        ? "Needs approval — mutating staging application certification"
        : "Certifying staging",
      detail: mutate
        ? "Operator-approved mutating certification against shared staging · isolated fixtures required"
        : "Read-only certification of the promoted staging application · no worker credentials",
    };
  }
  if (key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) {
    const awaiting = req.status === "awaiting_operator";
    return {
      approve_label: "Authorize staging certification principal",
      deny_label: "Deny",
      wait_label: "Waiting on Director — certification principal",
      mission_need: awaiting
        ? "Needs approval — provision or bind staging certification principal"
        : "Ensuring staging certification principal",
      detail: "Create or bind the dedicated non-human staging certification identity. Credentials stay on the trusted host.",
    };
  }
  return {
    approve_label: `Authorize ${req.action_key || "governed action"}`,
    deny_label: "Deny",
    wait_label: "Waiting on Director",
    mission_need: `Needs approval — ${req.action_key || "governed action"}`,
    detail: req.purpose || `${req.action_key} · ${req.target || "trusted host"}`,
  };
}

export function publicGovernedAction(req) {
  if (!req) return null;
  const presentation = presentationForGovernedAction(req);
  return {
    request_id: req.request_id,
    mission_id: req.mission_id,
    lane_id: req.lane_id,
    run_id: req.run_id || null,
    action_key: req.action_key,
    target: req.target || null,
    purpose: req.purpose || null,
    artifact_refs: req.artifact_refs || [],
    requested_mode: req.requested_mode,
    reason_worker_cannot_execute: req.reason_worker_cannot_execute || null,
    operator_approval_required: Boolean(req.operator_approval_required),
    status: req.status,
    integrity: req.integrity || null,
    result_ref: req.result_ref || null,
    failure_reason: req.failure_reason || null,
    failure_code: req.failure_code || null,
    title: req.title || null,
    trusted_host_action_id: req.trusted_host_action_id || null,
    decision_id: req.decision_id || null,
    inputs: req.inputs || {},
    continuation_plan: req.continuation_plan || null,
    continuation_intent: req.continuation_intent || null,
    successor_of: req.successor_of || null,
    revived_from_stale_registry: Boolean(req.revived_from_stale_registry),
    approve_label: presentation.approve_label,
    deny_label: presentation.deny_label,
    wait_label: presentation.wait_label,
    mission_need: presentation.mission_need,
    detail: presentation.detail,
    created_at: req.created_at,
    updated_at: req.updated_at,
  };
}

export function getGovernedAction(requestId, root = runtimeRoot()) {
  if (!requestId) return null;
  return readGovernedActionStore(root).requests.find((r) => r.request_id === requestId) || null;
}

export function listGovernedActions({
  missionId = null,
  laneId = null,
  status = null,
  root = runtimeRoot(),
} = {}) {
  const lane = laneId ? canonicalLaneStoreId(laneId, root) : null;
  return readGovernedActionStore(root).requests.filter((r) => {
    if (missionId && r.mission_id !== missionId) return false;
    if (lane && r.lane_id !== lane && r.lane_id !== laneId) return false;
    if (status && r.status !== status) return false;
    return true;
  });
}

function newestPending(list) {
  const pending = (list || []).filter((r) => isPendingGovernedStatus(r.status));
  if (!pending.length) return null;
  return pending.sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0))[0];
}

export function pendingGovernedActionForLane(laneId, root = runtimeRoot(), actionKey = null) {
  if (!laneId) return null;
  const lane = canonicalLaneStoreId(laneId, root);
  const list = listGovernedActions({ laneId: lane, root })
    .filter((r) => !actionKey || r.action_key === actionKey);
  return newestPending(list);
}

export function latestGovernedActionForMission(missionId, root = runtimeRoot()) {
  if (!missionId) return null;
  const list = listGovernedActions({ missionId, root });
  if (!list.length) return null;
  return [...list].sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0))[0];
}

export function pendingGovernedActionForMission(missionId, root = runtimeRoot()) {
  if (!missionId) return null;
  return newestPending(listGovernedActions({ missionId, root }));
}

export function pendingGovernedActionForRun(runId, root = runtimeRoot()) {
  if (!runId) return null;
  return newestPending(readGovernedActionStore(root).requests.filter((r) => r.run_id === runId));
}

function putRequest(store, rec) {
  const idx = store.requests.findIndex((r) => r.request_id === rec.request_id);
  if (idx >= 0) store.requests[idx] = rec;
  else store.requests.push(rec);
  if (store.requests.length > 200) store.requests = store.requests.slice(-200);
  return store;
}

function saveRequest(rec, root) {
  const store = readGovernedActionStore(root);
  writeStore(putRequest(store, rec), root);
  return rec;
}

function appendAudit(rec, event, extra = {}, root = runtimeRoot()) {
  const line = {
    schema_version: "vacilando.governed_action_audit.v1",
    at: iso(extra.nowMs),
    event,
    request_id: rec.request_id,
    mission_id: rec.mission_id,
    lane_id: rec.lane_id,
    run_id: rec.run_id || null,
    requesting_worker: rec.requesting_worker || rec.lane_id,
    action_key: rec.action_key,
    target: rec.target || null,
    artifact_refs: rec.artifact_refs || [],
    policy_decision: rec.policy_decision || null,
    operator_approval: rec.operator_approval || null,
    execution_started_at: rec.execution_started_at || null,
    execution_ended_at: rec.execution_ended_at || null,
    result_ref: rec.result_ref || null,
    failure_reason: rec.failure_reason || rec.failure_code || null,
    ...extra.detail,
  };
  try {
    mkdirSync(dirname(auditPath(root)), { recursive: true });
    appendFileSync(auditPath(root), `${JSON.stringify(line)}\n`);
  } catch { /* audit is best-effort */ }
}

function emitNotification(type, rec, { title, body, root = runtimeRoot() } = {}) {
  const event = {
    schema_version: "vacilando.notification.v1",
    notification_id: "ntf_" + randomBytes(8).toString("hex"),
    type,
    channel: "adapter",
    title: title || rec.title || rec.action_key,
    body: body || rec.purpose || "",
    deep_link: `vacilando://governed-action/${rec.request_id}`,
    web_path: rec.mission_id
      ? `#/missions/${encodeURIComponent(rec.mission_id)}`
      : (rec.lane_id ? `#/lanes/${encodeURIComponent(rec.lane_id)}` : "#/lanes"),
    mission_id: rec.mission_id,
    lane_id: rec.lane_id,
    request_id: rec.request_id,
    action_key: rec.action_key,
    mobile_ready: true,
    created_at: iso(),
  };
  try {
    mkdirSync(dirname(notifyPath(root)), { recursive: true });
    appendFileSync(notifyPath(root), `${JSON.stringify(event)}\n`);
  } catch { /* notify best-effort */ }
  return event;
}

function artifactPathFrom(refs = []) {
  const first = Array.isArray(refs) ? refs.find(Boolean) : refs;
  return first ? String(first) : Q15_CENSUS_ARTIFACT;
}

function identityFromInputs(input = {}) {
  const inputs = input.inputs || {};
  const pr = inputs.pull_request_number || inputs.pullRequestNumber || "";
  const sha = inputs.expected_head_sha || inputs.expectedHeadSha || inputs.expected_sha || inputs.expectedSha || "";
  const versions = Array.isArray(inputs.migrations)
    ? inputs.migrations.map((m) => m.version || m.prefix || m.path || "").join(",")
    : "";
  return [pr, sha, versions].filter(Boolean).join(":") || artifactPathFrom(input.artifact_refs);
}

function dedupeKey(input) {
  return [
    input.mission_id,
    input.lane_id,
    input.action_key,
    input.target || "",
    identityFromInputs(input),
  ].join("|");
}

function releaseRunAfterGovernedFailure(rec, { nowMs, root } = {}) {
  if (!rec?.run_id) return;
  const run = getExecutionRun(rec.run_id, root);
  if (!run || isTerminalRunState(run.state)) return;
  const pub = publicGovernedAction(rec);
  if (run.state === "WAITING_RESOURCE") {
    transitionExecutionRun(rec.run_id, "NEEDS_INPUT", {
      reason: rec.failure_reason || rec.failure_code || "Governed action failed",
      origin: "system",
      nowMs,
      root,
      progress: rec.failure_reason || "Director could not finish the governed action",
    });
  }
  patchRunFields(rec.run_id, { governed_action: pub }, { nowMs, root });
  patchRunResourceWait(rec.run_id, null, root);
}

function failRequest(rec, code, reason, { nowMs, root, skipResume = false } = {}) {
  rec.status = "failed";
  rec.failure_code = code;
  rec.failure_reason = bound(reason || code, 500);
  rec.updated_at = iso(nowMs);
  saveRequest(rec, root);
  appendAudit(rec, "failed", { nowMs, detail: { failure_code: code } }, root);
  try {
    appendTimelineEvent(rec.mission_id, {
      type: "blocked",
      headline: "Governed action failed",
      summary: rec.failure_reason,
      visibility: "summary",
      actor: "director",
      detail: { requestId: rec.request_id, failureCode: code },
      nowMs,
    });
  } catch { /* */ }
  let resumePromise = null;
  if (!skipResume) {
    releaseRunAfterGovernedFailure(rec, { nowMs, root });
    resumePromise = resumeLaneAfterFailedGovernedAction(rec.request_id, { nowMs, root });
  }
  return { ok: false, error: code, request: publicGovernedAction(rec), resumePromise };
}

function enterControlPlaneRefresh(rec, { nowMs, root, reason = "director_registry_stale" } = {}) {
  const attempts = Number(rec.control_plane_refresh?.attempts || 0) + 1;
  rec.status = "awaiting_control_plane_refresh";
  rec.failure_code = null;
  rec.failure_reason = null;
  rec.control_plane_refresh = {
    reason,
    started_at: iso(nowMs),
    attempts,
  };
  rec.updated_at = iso(nowMs);
  saveRequest(rec, root);
  appendAudit(rec, "awaiting_control_plane_refresh", { nowMs, extra: { reason, attempts } }, root);
  attachRunWait(rec, { nowMs, root });
  if (attempts > 3) {
    return failRequest(
      rec,
      "director_refresh_failed",
      "Director could not load the current governed capabilities.",
      { nowMs, root },
    );
  }
  Promise.resolve(refreshDirectorCapabilities({
    reason,
    requestId: rec.request_id,
    root,
    nowMs,
  })).catch(() => {});
  return {
    ok: true,
    refreshing: true,
    classification: "director_registry_stale",
    request: publicGovernedAction(rec),
  };
}

export function isRecoverableStaleRegistryFailure(rec) {
  if (!rec) return false;
  if (rec.status === "awaiting_control_plane_refresh") return true;
  if (rec.status !== "failed") return false;
  const code = rec.failure_code || rec.failure_reason;
  if (!STALE_REGISTRY_FAILURES.has(code) && rec.failure_reason !== "unauthorized_action_key") return false;
  const avail = classifyActionAvailability(rec.action_key);
  return avail.code === "available" || avail.code === "director_registry_stale" || Boolean(getActionDefinition(rec.action_key));
}

function waitProjection(rec) {
  const presentation = presentationForGovernedAction(rec);
  return {
    resource_key: DIRECTOR_GOVERNED_RESOURCE_KEY,
    label: "Director",
    summary: presentation.wait_label || rec.title || "Waiting on Director",
    governed_request_id: rec.request_id,
    action_key: rec.action_key,
    target: rec.target || null,
    purpose: rec.purpose || null,
  };
}

function attachRunWait(rec, { nowMs, root } = {}) {
  if (!rec.run_id) return;
  const run = getExecutionRun(rec.run_id, root);
  if (!run || isTerminalRunState(run.state)) return;
  const publicReq = publicGovernedAction(rec);
  const wait = waitProjection(rec);
  if (run.state === "WAITING_RESOURCE") {
    patchRunResourceWait(rec.run_id, { ...(run.resource_wait || {}), ...wait }, root);
    patchRunFields(rec.run_id, {
      governed_action: publicReq,
      state_reason: presentationForGovernedAction(rec).wait_label || rec.title || "Waiting on Director",
    }, { nowMs, root });
    return;
  }
  if (["EXECUTING", "VALIDATING", "RECOVERING", "NEEDS_INPUT"].includes(run.state)) {
    transitionExecutionRun(rec.run_id, "WAITING_RESOURCE", {
      reason: presentationForGovernedAction(rec).wait_label || rec.title || "Waiting on Director",
      origin: "system",
      nowMs,
      root,
      resource_wait: wait,
    });
    patchRunFields(rec.run_id, { governed_action: publicReq }, { nowMs, root });
  }
}

function resolveStoreRoot(input = {}, explicitRoot = null) {
  if (explicitRoot) return explicitRoot;
  const runId = input.run_id || input.runId;
  if (runId) {
    const found = findExecutionRun(runId);
    if (found?.root) return found.root;
  }
  const laneId = input.lane_id || input.laneId;
  if (laneId) {
    for (const root of candidateRuntimeRoots()) {
      if (getDurableLane(laneId, root)) return root;
    }
  }
  return runtimeRoot();
}

function resolveWorktreePath(input, laneId, run, root) {
  return input.worktree_path
    || input.worktreePath
    || run?.worktree_path
    || getDurableLane(laneId, root)?.binding?.worktree_path
    || null;
}

function sanitizeActionInputs(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  if (raw.sql || raw.statement || raw.body || raw.database_url || raw.databaseUrl || raw.token || raw.argv || raw.shell) {
    return { __rejected: "arbitrary_sql_rejected" };
  }
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    if (/sql|token|password|secret|database_url|argv|shell|command/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

function defaultModeForAction(actionKey, requested) {
  if (requested) return requested;
  if (actionKey === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) return "promotion";
  if (actionKey === ACTION_TYPES.DATABASE_APPLY_MIGRATION) return "migration_apply";
  if (actionKey === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER) return "migration_apply";
  if (actionKey === ACTION_TYPES.APPLICATION_CERTIFY_STAGING) return "certification";
  if (actionKey === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) return "privileged_write";
  return "read_only";
}

function validateRequestShape(input, { root } = {}) {
  const actionKey = String(input.action_key || input.actionKey || "").trim();
  const laneId = String(input.lane_id || input.laneId || "").trim();
  if (!actionKey) return { ok: false, error: "missing_action_key" };
  if (!laneId) return { ok: false, error: "missing_lane_id" };
  const missionId = String(
    input.mission_id || input.missionId || missionIdForLane(laneId, root) || "",
  ).trim();
  if (!missionId) return { ok: false, error: "missing_mission_binding" };
  const mode = defaultModeForAction(
    actionKey,
    String(input.requested_mode || input.requestedMode || "").trim() || null,
  );
  if (!GOVERNED_MODES.includes(mode)) return { ok: false, error: "invalid_mode", requested_mode: mode };
  const reason = bound(input.reason_worker_cannot_execute || input.reasonWorkerCannotExecute, 1000);
  if (!reason) return { ok: false, error: "missing_reason_worker_cannot_execute" };
  const purpose = bound(input.purpose, 1000) || "Governed capability required";
  const defaultTarget = actionKey === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST
    || actionKey === ACTION_TYPES.DATABASE_APPLY_MIGRATION
    || actionKey === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER
    || actionKey === ACTION_TYPES.APPLICATION_CERTIFY_STAGING
    || actionKey === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL
    ? "staging"
    : DEFAULT_TARGET;
  const target = String(input.target || defaultTarget).trim() || defaultTarget;
  const artifactRefs = Array.isArray(input.artifact_refs || input.artifactRefs)
    ? (input.artifact_refs || input.artifactRefs).map(String).filter(Boolean)
    : (input.artifact ? [String(input.artifact)] : []);
  const inputs = sanitizeActionInputs(input.inputs || {});
  if (inputs.__rejected) return { ok: false, error: inputs.__rejected, failure_code: "policy_denied" };
  return {
    ok: true,
    actionKey,
    missionId,
    laneId,
    mode,
    reason,
    purpose,
    target,
    artifactRefs,
    inputs,
    continuationPlan: input.continuation_plan || input.continuationPlan || defaultContinuationPlan(actionKey, inputs),
  };
}

function validateAgainstRegistry(actionKey, target, artifactRefs, mode, { worktreePath, inputs } = {}) {
  const def = getActionDefinition(actionKey);
  if (!def) {
    const avail = classifyActionAvailability(actionKey);
    if (avail.code === "director_registry_stale") {
      return { ok: false, error: "director_registry_stale", failure_code: "director_registry_stale", stale: true };
    }
    return { ok: false, error: "unsupported_action_key", failure_code: "action_unavailable" };
  }
  if (mode === "read_only" && def.riskClass && !/read/i.test(def.riskClass) && actionKey !== ACTION_TYPES.DATABASE_READ_CENSUS) {
    return { ok: false, error: "policy_denied", failure_code: "policy_denied" };
  }
  if (typeof def.validateInputs === "function") {
    const validated = def.validateInputs({
      ...(inputs || {}),
      queryArtifactPath: artifactPathFrom(artifactRefs),
      databaseTarget: target,
      worktreePath,
      worktree_path: worktreePath,
    });
    if (!validated.ok) {
      const readonlyFail = new Set([
        "forbidden_keyword", "forbidden_construct", "writable_cte", "with_without_select",
        "arbitrary_sql_rejected", "arbitrary_command_rejected",
      ]);
      const failure_code = validated.code === "wrong_database_target"
        ? "target_unavailable"
        : (readonlyFail.has(validated.code) ? "policy_denied" : (validated.code || "result_validation_failed"));
      return {
        ok: false,
        error: failure_code,
        failure_code,
        validation: validated,
      };
    }
    return { ok: true, def, normalized: validated.normalized };
  }
  return { ok: true, def, normalized: { databaseTarget: target } };
}

function actionQueryHash(rec) {
  if (rec?.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    return rec.inputs?.expected_head_sha || rec.inputs?.expectedHeadSha || rec.inputs?.head_sha || null;
  }
  if (rec?.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    return rec.inputs?.expected_sha || rec.inputs?.expectedSha || rec.inputs?.dedupeKey || rec.inputs?.dedupe_key || null;
  }
  if (rec?.action_key === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER) {
    return rec.inputs?.queryHash || rec.inputs?.query_hash || rec.inputs?.dedupeKey || null;
  }
  if (rec?.action_key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING) {
    return rec.inputs?.queryHash || rec.inputs?.query_hash || rec.inputs?.dedupeKey
      || [
        rec.inputs?.expected_sha || rec.inputs?.expectedSha,
        rec.inputs?.suite_key || rec.inputs?.suiteKey || "access_identity_v2",
        rec.inputs?.write_policy || rec.inputs?.writePolicy || "read_only",
      ].join(":");
  }
  if (rec?.action_key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) {
    return rec.inputs?.queryHash || rec.inputs?.query_hash || rec.inputs?.dedupeKey
      || [
        rec.inputs?.environment || "staging",
        rec.inputs?.suite_key || rec.inputs?.suiteKey || "access_identity_v2",
        rec.inputs?.mode || "ensure",
      ].join(":");
  }
  return null;
}

function policyDecision(rec, { nowMs } = {}) {
  const auth = findAuthorization({
    missionId: rec.mission_id,
    actionType: rec.action_key,
    databaseTarget: rec.target,
    queryHash: actionQueryHash(rec),
    nowMs: nowMs ?? Date.now(),
  });
  if (auth) {
    return {
      auto_execute: true,
      operator_approval_required: false,
      authorization_id: auth.authorizationId,
      reason: "existing_mission_authorization",
    };
  }
  // Production / deployed-primary reads require an operator grant.
  if (rec.action_key === ACTION_TYPES.DATABASE_READ_CENSUS && rec.target === DEFAULT_TARGET) {
    return {
      auto_execute: false,
      operator_approval_required: true,
      reason: "privileged_read_requires_operator",
    };
  }
  if (rec.action_key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING) {
    const writePolicy = rec.inputs?.write_policy || rec.inputs?.writePolicy || "read_only";
    if (writePolicy === "mutate") {
      return {
        auto_execute: false,
        operator_approval_required: true,
        reason: "staging_mutation_requires_operator",
      };
    }
    return {
      auto_execute: true,
      operator_approval_required: false,
      reason: "policy_read_only_staging_certification",
    };
  }
  if (rec.action_key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) {
    return {
      auto_execute: false,
      operator_approval_required: true,
      reason: "staging_auth_identity_requires_operator",
    };
  }
  return {
    auto_execute: false,
    operator_approval_required: true,
    reason: "policy_default_requires_operator",
  };
}

function requestTitle(rec) {
  if (rec.action_key === ACTION_TYPES.DATABASE_READ_CENSUS) {
    return "Read-only database census";
  }
  if (rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    const n = rec.inputs?.pull_request_number || rec.inputs?.pullRequestNumber || "";
    return n ? `Merge PR #${n} into staging` : "Merge pull request into staging";
  }
  if (rec.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    return "Apply Access & Identity staging migrations";
  }
  if (rec.action_key === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER) {
    return "Repair staging migration history";
  }
  if (rec.action_key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING) {
    return "Certify promoted staging application";
  }
  if (rec.action_key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) {
    return "Ensure staging certification principal";
  }
  return rec.action_key;
}

let executeImpl = null;
let resumeImpl = null;
let startSessionImpl = null;
let sendImpl = null;

export function setGovernedActionExecuteImplForTests(fn) {
  executeImpl = typeof fn === "function" ? fn : null;
}

export function setGovernedActionResumeImplForTests({
  resumeLane = null,
  startLaneAgentSession = null,
  sendLaneInstruction = null,
} = {}) {
  resumeImpl = typeof resumeLane === "function" ? resumeLane : null;
  startSessionImpl = typeof startLaneAgentSession === "function" ? startLaneAgentSession : null;
  sendImpl = typeof sendLaneInstruction === "function" ? sendLaneInstruction : null;
}

export function resetGovernedActionsForTests(root = runtimeRoot()) {
  executeImpl = null;
  resumeImpl = null;
  startSessionImpl = null;
  sendImpl = null;
  writeStore(emptyStore(), root);
}

export function requestGovernedAction(input = {}, {
  nowMs = Date.now(),
  root = null,
  processNow = true,
} = {}) {
  const storeRoot = resolveStoreRoot(input, root);
  const shape = validateRequestShape(input, { root: storeRoot });
  if (!shape.ok) return shape;

  const laneId = canonicalLaneStoreId(shape.laneId, storeRoot) || shape.laneId;
  const runId = input.run_id || input.runId || activeRunForLane(laneId, storeRoot)?.run_id || null;
  const run = runId ? getExecutionRun(runId, storeRoot) : null;
  const worktreePath = resolveWorktreePath(input, laneId, run, storeRoot);
  const artifactRefs = shape.artifactRefs.length
    ? shape.artifactRefs
    : (shape.actionKey === ACTION_TYPES.DATABASE_READ_CENSUS ? [Q15_CENSUS_ARTIFACT] : []);
  const availability = classifyActionAvailability(shape.actionKey);
  if (availability.code === "unsupported_action_key") {
    return { ok: false, error: "unsupported_action_key", failure_code: "action_unavailable" };
  }

  const existing = listGovernedActions({ missionId: shape.missionId, laneId, root: storeRoot })
    .find((r) => isPendingGovernedStatus(r.status) && dedupeKey(r) === dedupeKey({
      mission_id: shape.missionId,
      lane_id: laneId,
      action_key: shape.actionKey,
      target: shape.target,
      artifact_refs: artifactRefs,
      inputs: shape.inputs,
    }));
  if (existing) {
    attachRunWait(existing, { nowMs, root: storeRoot });
    return { ok: true, request: publicGovernedAction(existing), deduped: true };
  }

  const failedMatch = listGovernedActions({ missionId: shape.missionId, laneId, root: storeRoot })
    .find((r) => r.status === "failed"
      && dedupeKey(r) === dedupeKey({
        mission_id: shape.missionId,
        lane_id: laneId,
        action_key: shape.actionKey,
        target: shape.target,
        artifact_refs: artifactRefs,
        inputs: shape.inputs,
      })
      && isRecoverableStaleRegistryFailure(r));
  if (failedMatch) {
    failedMatch.status = "requested";
    failedMatch.failure_code = null;
    failedMatch.failure_reason = null;
    failedMatch.revived_from_stale_registry = true;
    failedMatch.updated_at = iso(nowMs);
    saveRequest(failedMatch, storeRoot);
    appendAudit(failedMatch, "revived_after_director_refresh", { nowMs }, storeRoot);
    attachRunWait(failedMatch, { nowMs, root: storeRoot });
    if (!processNow) return { ok: true, request: publicGovernedAction(failedMatch), revived: true };
    return processGovernedAction(failedMatch.request_id, { nowMs, root: storeRoot, actor: "director" });
  }

  const rec = {
    schema_version: GOVERNED_ACTION_SCHEMA,
    request_id: newRequestId(),
    mission_id: shape.missionId,
    lane_id: laneId,
    run_id: runId,
    worktree_path: worktreePath,
    action_key: shape.actionKey,
    target: shape.target,
    purpose: shape.purpose,
    artifact_refs: artifactRefs,
    requested_mode: shape.mode,
    reason_worker_cannot_execute: shape.reason,
    operator_approval_required: true,
    status: "requested",
    result_ref: null,
    failure_reason: null,
    failure_code: null,
    title: bound(input.title, 120) || requestTitle({ action_key: shape.actionKey, inputs: shape.inputs }),
    requesting_worker: bound(input.requesting_worker || input.requestingWorker, 80) || laneId,
    policy_decision: null,
    operator_approval: null,
    trusted_host_action_id: null,
    decision_id: null,
    execution_started_at: null,
    execution_ended_at: null,
    inputs: shape.inputs || {},
    continuation_plan: shape.continuationPlan || null,
    continuation_intent: bound(input.continuation_intent || input.continuationIntent, 500)
      || (shape.actionKey === ACTION_TYPES.DATABASE_READ_CENSUS
        ? "Continue the current assignment with census evidence."
        : "Continue the current assignment with the governed result."),
    successor_of: bound(input.successor_of || input.successorOf, 80) || null,
    created_at: iso(nowMs),
    updated_at: iso(nowMs),
  };
  saveRequest(rec, storeRoot);
  appendAudit(rec, "requested", { nowMs }, storeRoot);
  attachRunWait(rec, { nowMs, root: storeRoot });

  if (!processNow) return { ok: true, request: publicGovernedAction(rec) };
  return processGovernedAction(rec.request_id, { nowMs, root: storeRoot, actor: "director" });
}

/**
 * WAITING_RESOURCE / director_governed_action seam.
 * Not a local resource-lock. Creates or recovers the governed request.
 */
export function orchestrateDirectorGovernedWait({
  run,
  wait = null,
  reason = null,
  origin = "system",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  if (!run?.run_id) return { ok: false, error: "run_not_found" };
  const fields = wait || run.resource_wait || {};
  const existingId = fields.governed_request_id;
  const wanted = fields.action_key || fields.actionKey || null;
  if (existingId) {
    const rec = getGovernedAction(existingId, root);
    if (rec && isPendingGovernedStatus(rec.status) && (!wanted || rec.action_key === wanted)) {
      attachRunWait(rec, { nowMs, root });
      return { ok: true, request: publicGovernedAction(rec), deduped: true };
    }
  }
  const pendingRun = pendingGovernedActionForRun(run.run_id, root);
  const pending = (pendingRun && (!wanted || pendingRun.action_key === wanted))
    ? pendingRun
    : pendingGovernedActionForLane(run.lane_id, root, wanted);
  if (pending) {
    attachRunWait(pending, { nowMs, root });
    return { ok: true, request: publicGovernedAction(pending), deduped: true };
  }

  const laneId = run.lane_id;
  const rec = getDurableLane(laneId, root);
  const missionId = fields.mission_id || fields.missionId || run.mission_id || rec?.mission_id || null;
  if (!missionId) {
    patchRunFields(run.run_id, {
      state_reason: "Lane has no Mission binding",
    }, { nowMs, root });
    return { ok: false, error: "missing_mission_binding" };
  }

  const request = {
    mission_id: missionId,
    lane_id: laneId,
    run_id: run.run_id,
    action_key: fields.action_key || fields.actionKey || null,
    target: fields.target || null,
    purpose: fields.purpose || null,
    artifact_refs: fields.artifact_refs || fields.artifactRefs || (fields.artifact ? [fields.artifact] : []),
    requested_mode: fields.requested_mode || fields.requestedMode || "read_only",
    reason_worker_cannot_execute: fields.reason_worker_cannot_execute
      || fields.reasonWorkerCannotExecute
      || reason
      || "Lane cannot execute this privileged capability",
    worktree_path: run.worktree_path || rec?.binding?.worktree_path || null,
    title: fields.title || null,
  };
  if (!request.action_key) {
    patchRunFields(run.run_id, { state_reason: "Governed wait missing action_key" }, { nowMs, root });
    return { ok: false, error: "missing_action_key" };
  }
  return requestGovernedAction(request, { nowMs, root, processNow: false });
}

function openApprovalDecision(rec, { nowMs, root } = {}) {
  const presentation = presentationForGovernedAction(rec);
  const isCensus = rec.action_key === ACTION_TYPES.DATABASE_READ_CENSUS;
  const open = listDecisions(rec.mission_id, { status: "open" })
    .find((d) => {
      if (isCensus) return d.defaultAction === "approve_governed_census" || /census/i.test(d.title || "");
      if (rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
        return d.defaultAction === "approve_governed_merge" || /merge pr/i.test(d.title || "");
      }
      if (rec.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
        return d.defaultAction === "approve_governed_migration" || /staging migration/i.test(d.title || "");
      }
      if (rec.action_key === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER) {
        return d.defaultAction === "approve_governed_ledger_repair" || /repair staging migration history/i.test(d.title || "");
      }
      return d.title === rec.title;
    });
  if (open) {
    rec.decision_id = open.decisionId;
    return open;
  }
  if (isCensus) {
    const { decision } = createDecision({
      missionId: rec.mission_id,
      title: rec.title || "Read-only database census",
      situation: [
        "Read-only database census",
        "",
        `Target: ${rec.target}`,
        "",
        "Purpose:",
        rec.purpose,
        "",
        "Artifact:",
        artifactPathFrom(rec.artifact_refs).split("/").pop(),
        "",
        "Data mode:",
        rec.requested_mode === "read_only" ? "Read-only" : rec.requested_mode,
        "No customer content requested",
        "No mutations",
        "",
        rec.reason_worker_cannot_execute,
      ].join("\n"),
      whyThisMatters: rec.purpose,
      currentPlan: "Director executes database.read_census on the trusted host and returns a bounded result to the originating lane. Credentials never enter the worker.",
      discovery: rec.reason_worker_cannot_execute,
      options: [
        {
          optionId: "authorize_mission_census",
          label: "Authorize census",
          description: `Run ${rec.action_key} against ${rec.target}. Read-only. No mutations. Result returns to the same Development Lane.`,
        },
        {
          optionId: "use_cert_only",
          label: "Use cert only",
          description: "Do not read the deployed primary. Keep this on certification environments only.",
        },
        {
          optionId: "deny_production_reads",
          label: "Deny",
          description: "Deny this census. Director will not bounce the worker to retry a capability it cannot access.",
        },
      ],
      recommendation: "authorize_mission_census",
      recommendationReason: "The lane correctly cannot hold deployed-tenant credentials. Director/trusted host is the sanctioned path.",
      defaultAction: "approve_governed_census",
      actor: "director",
      nowMs,
      evidence: rec.artifact_refs || [],
    });
    rec.decision_id = decision.decisionId;
    emitNotification("governed_action_approval_required", rec, {
      title: "Needs approval — read-only census",
      body: `${rec.title} against ${rec.target}`,
      root,
    });
    return decision;
  }

  const n = rec.inputs?.pull_request_number || rec.inputs?.pullRequestNumber;
  const versions = Array.isArray(rec.inputs?.migrations)
    ? rec.inputs.migrations.map((m) => m.version || m).join("\n")
    : (Array.isArray(rec.inputs?.versions) ? rec.inputs.versions.join("\n") : "");
  const isMerge = rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST;
  const isRepair = rec.action_key === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER;
  const { decision } = createDecision({
    missionId: rec.mission_id,
    title: rec.title || presentation.mission_need.replace(/^Needs approval — /, ""),
    situation: isRepair
      ? [
        "Repair staging migration history",
        "",
        "Reason:",
        rec.purpose || "Vacilando recorded A&I migrations that failed or never executed.",
        "",
        "Versions:",
        versions || "(see inputs)",
        "",
        rec.reason_worker_cannot_execute,
        "",
        "This is not arbitrary SQL. Director will delete only exact false ledger rows after evidence of non-execution and a failed schema invariant.",
      ].join("\n")
      : [
      presentation.detail,
      "",
      `Target: ${rec.target}`,
      "",
      "Purpose:",
      rec.purpose,
      "",
      isMerge ? `PR: #${n}` : "Migrations:",
      isMerge ? `Expected SHA: ${rec.inputs?.expected_head_sha || rec.inputs?.expectedHeadSha || ""}` : versions,
      "",
      rec.reason_worker_cannot_execute,
      "",
      "Credentials stay on the trusted host. The Development Lane never receives them.",
    ].join("\n"),
    whyThisMatters: rec.purpose,
    currentPlan: isRepair
      ? "Director removes false ledger records so verified migrations can be applied safely. Schema objects that already exist are left untouched."
      : isMerge
      ? "Director merges the named pull request into staging on the trusted host and returns the merge SHA to the originating lane."
      : "Director applies the approved committed migration files to staging, one at a time, and stops on the first failure.",
    discovery: rec.reason_worker_cannot_execute,
    options: [
      {
        optionId: isRepair
          ? "authorize_ledger_repair"
          : isMerge ? "authorize_staging_merge" : "authorize_staging_migrations",
        label: presentation.approve_label,
        description: presentation.detail,
      },
      {
        optionId: isRepair ? "stop_promotion" : "deny_governed_action",
        label: presentation.deny_label,
        description: isRepair
          ? "Stop promotion. Director will not mutate staging migration history."
          : "Deny this privileged action. Director will not bounce the worker to retry a capability it cannot access.",
      },
    ],
    recommendation: isRepair
      ? "authorize_ledger_repair"
      : isMerge ? "authorize_staging_merge" : "authorize_staging_migrations",
    recommendationReason: isRepair
      ? "False ledger rows block a truthful recovery apply. Repair is the sanctioned path."
      : "The lane correctly cannot hold GitHub or database credentials. Director/trusted host is the sanctioned path.",
    defaultAction: isRepair
      ? "approve_governed_ledger_repair"
      : isMerge ? "approve_governed_merge" : "approve_governed_migration",
    actor: "director",
    nowMs,
    evidence: rec.artifact_refs || [],
  });
  rec.decision_id = decision.decisionId;
  emitNotification("governed_action_approval_required", rec, {
    title: presentation.mission_need,
    body: presentation.detail,
    root,
  });
  return decision;
}

function defaultExecute(rec, { nowMs, actor } = {}) {
  if (rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    return fulfillRepositoryMergeForMission(rec.mission_id, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: rec.inputs || {},
      actor,
      nowMs,
    });
  }
  if (rec.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    return fulfillDatabaseMigrationForMission(rec.mission_id, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: {
        ...(rec.inputs || {}),
        worktree_path: rec.worktree_path,
        worktreePath: rec.worktree_path,
      },
      actor,
      nowMs,
    });
  }
  if (rec.action_key === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER) {
    return fulfillDatabaseLedgerRepairForMission(rec.mission_id, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: rec.inputs || {},
      actor,
      nowMs,
    });
  }
  if (rec.action_key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING) {
    return fulfillApplicationCertifyStagingForMission(rec.mission_id, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: {
        ...(rec.inputs || {}),
        worktree_path: rec.worktree_path,
        worktreePath: rec.worktree_path,
      },
      actor,
      nowMs,
    });
  }
  if (rec.action_key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) {
    return fulfillApplicationEnsureCertificationPrincipalForMission(rec.mission_id, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: {
        ...(rec.inputs || {}),
        worktree_path: rec.worktree_path,
        worktreePath: rec.worktree_path,
      },
      actor,
      nowMs,
    });
  }
  if (rec.action_key !== ACTION_TYPES.DATABASE_READ_CENSUS) {
    return { ok: false, error: "action_unavailable" };
  }
  return fulfillDatabaseCensusForMission(rec.mission_id, {
    assignmentId: rec.run_id || null,
    executionSessionId: rec.run_id || null,
    queryArtifactPath: artifactPathFrom(rec.artifact_refs),
    worktreePath: rec.worktree_path,
    actor,
    nowMs,
  });
}

function deferCertifyForPrincipal(rec, out, { nowMs, root, actor }) {
  rec.status = "awaiting_director";
  rec.deferred_reason = "certification_principal_unavailable";
  rec.failure_code = null;
  rec.failure_reason = null;
  rec.updated_at = iso(nowMs);
  saveRequest(rec, root);
  appendAudit(rec, "deferred_for_principal", { nowMs }, root);
  const existing = listGovernedActions({
    missionId: rec.mission_id,
    laneId: rec.lane_id,
    root,
  }).find((r) => r.action_key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL
    && ["requested", "awaiting_director", "awaiting_operator", "executing", "complete"].includes(r.status));
  if (existing?.status === "complete") {
    rec.status = "requested";
    rec.updated_at = iso(nowMs);
    saveRequest(rec, root);
    return processGovernedAction(rec.request_id, { nowMs, root, actor: "director" });
  }
  if (existing && ["requested", "awaiting_director", "awaiting_operator", "executing"].includes(existing.status)) {
    return { ok: true, request: publicGovernedAction(rec), deferred: true, ensure: publicGovernedAction(existing) };
  }
  const ensure = requestGovernedAction({
    mission_id: rec.mission_id,
    lane_id: rec.lane_id,
    run_id: rec.run_id,
    action_key: ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL,
    target: "staging",
    purpose: "Ensure the staging certification principal before application certification",
    reason_worker_cannot_execute: rec.reason_worker_cannot_execute,
    worktree_path: rec.worktree_path,
    inputs: {
      environment: "staging",
      suite_key: rec.inputs?.suite_key || rec.inputs?.suiteKey || "access_identity_v2",
      mode: "ensure",
      source_mission_id: rec.mission_id,
    },
    continuation_intent: rec.continuation_intent,
    continuation_plan: { kind: "retry_certify", certify_request_id: rec.request_id },
  }, { nowMs, root, processNow: true });
  return { ok: true, request: publicGovernedAction(rec), deferred: true, ensure };
}

function retryCertifyAfterPrincipal(rec, { nowMs, root, actor }) {
  const certifyId = rec.continuation_plan?.certify_request_id;
  if (!certifyId) return null;
  const certify = getGovernedAction(certifyId, root);
  if (!certify) return null;
  certify.status = "requested";
  certify.failure_code = null;
  certify.failure_reason = null;
  certify.updated_at = iso(nowMs);
  saveRequest(certify, root);
  return processGovernedAction(certify.request_id, { nowMs, root, actor: actor || "director" });
}

function applyExecuteResult(rec, out, { nowMs, root, actor } = {}) {
  if (out?.error === "authorization_required") {
    rec.status = "awaiting_operator";
    rec.operator_approval_required = true;
    rec.trusted_host_action_id = out.action?.id || rec.trusted_host_action_id;
    rec.updated_at = iso(nowMs);
    openApprovalDecision(rec, { nowMs, root });
    saveRequest(rec, root);
    attachRunWait(rec, { nowMs, root });
    appendAudit(rec, "awaiting_operator", { nowMs }, root);
    return { ok: true, request: publicGovernedAction(rec), awaiting_operator: true };
  }
  const status = out?.action?.result?.status || out?.error || out?.action?.failureReason;
  if (rec.action_key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING
    && (status === "principal_unavailable" || out?.error === "principal_unavailable")) {
    return deferCertifyForPrincipal(rec, out, { nowMs, root, actor });
  }
  if (!out?.ok || out.action?.state !== "completed") {
    const code = out?.error === "wrong_database_target"
      ? "target_unavailable"
      : (out?.error === "unknown_action_type" ? "action_unavailable" : "execution_failed");
    return failRequest(rec, code, out?.error || out?.action?.failureReason || "trusted-host execution failed", { nowMs, root });
  }
  const action = out.action;
  if (containsSecret(action.result) || containsSecret(action.inputs)) {
    return failRequest(rec, "result_validation_failed", "Result contained secrets and was not routed to the worker.", { nowMs, root });
  }
  const identity = assertGovernedActionIdentity({
    request: rec,
    action,
    result: action.result,
    evidence: action.result,
  });
  if (!identity.ok) {
    return failRequest(
      rec,
      identity.error,
      identity.detail || identity.error,
      { nowMs, root },
    );
  }
  rec.status = "complete";
  rec.trusted_host_action_id = action.id;
  rec.result = stampGovernedIdentity(action.result, { request: rec, action, nowMs: Date.now() });
  rec.result_ref = rec.result?.evidence_path || rec.result?.evidencePath || action.id;
  rec.execution_ended_at = iso(Date.now());
  rec.updated_at = iso(nowMs);
  rec.failure_code = null;
  rec.failure_reason = null;
  saveRequest(rec, root);
  appendAudit(rec, "complete", { nowMs, detail: { result_ref: rec.result_ref } }, root);
  const notice = completionNotificationFor(rec, rec.result);
  emitNotification("governed_action_complete", rec, {
    title: notice.title,
    body: notice.body,
    root,
  });
  try {
    if (!rec.evidence_attached) {
      attachEvidence({
        missionId: rec.mission_id,
        type: rec.action_key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING ? "browser" : "database",
        title: rec.title || rec.action_key,
        description: `${rec.action_key} against ${rec.target}`,
        fileUri: rec.result_ref,
        createdBy: actor || "director",
        nowMs,
      });
      if (rec.action_key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING) {
        for (const shot of rec.result?.product_review || []) {
          if (!shot?.artifact) continue;
          attachEvidence({
            missionId: rec.mission_id,
            type: "screenshot",
            title: shot.title || shot.id,
            description: shot.path || "",
            fileUri: shot.artifact,
            createdBy: actor || "director",
            nowMs,
          });
        }
      }
      rec.evidence_attached = true;
      saveRequest(rec, root);
    }
  } catch { /* evidence optional */ }
  try {
    appendTimelineEvent(rec.mission_id, {
      type: "progress",
      headline: "Governed action complete",
      summary: `${rec.action_key} finished. Resuming ${rec.lane_id}.`,
      visibility: "summary",
      actor: actor || "director",
      detail: { requestId: rec.request_id, actionId: action.id, laneId: rec.lane_id },
      nowMs,
    });
  } catch { /* */ }
  enqueuePromotionContinuation(rec, { nowMs, root });
  return { ok: true, request: publicGovernedAction(rec), action };
}

function defaultContinuationPlan(actionKey, inputs = {}) {
  if (actionKey !== ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) return null;
  const n = Number(inputs.pull_request_number || inputs.pullRequestNumber || 0);
  if (n !== 475) return null;
  return {
    kind: "staging_schema_promotion",
    migrations: ACCESS_IDENTITY_STAGING_MIGRATIONS,
    purpose: "Apply committed Access & Identity staging migrations",
  };
}

function enqueuePromotionContinuation(rec, { nowMs, root } = {}) {
  if (rec.action_key !== ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) return null;
  const plan = rec.continuation_plan || defaultContinuationPlan(rec.action_key, rec.inputs || {});
  if (!plan) return null;
  if (plan.kind && !/promotion/i.test(String(plan.kind))) return null;
  const mergeSha = rec.result?.merge_sha || rec.result?.staging_sha || rec.result?.mergeSha || null;
  const migrations = Array.isArray(plan.migrations) && plan.migrations.length
    ? plan.migrations
    : ACCESS_IDENTITY_STAGING_MIGRATIONS;
  return requestGovernedAction({
    mission_id: rec.mission_id,
    lane_id: rec.lane_id,
    run_id: rec.run_id,
    action_key: ACTION_TYPES.DATABASE_APPLY_MIGRATION,
    target: "staging",
    purpose: plan.purpose || "Apply committed Access & Identity staging migrations",
    reason_worker_cannot_execute: rec.reason_worker_cannot_execute,
    worktree_path: rec.worktree_path,
    inputs: {
      environment: "staging",
      repository: plan.repository || rec.inputs?.repository,
      expected_sha: mergeSha || rec.inputs?.expected_head_sha,
      worktree_path: rec.worktree_path,
      worktreePath: rec.worktree_path,
      migrations,
    },
    title: "Apply Access & Identity staging migrations",
    continuation_intent: "Schema promotion complete. Begin staging runtime/browser certification.",
  }, { nowMs, root, processNow: true });
}

export function processGovernedAction(requestId, {
  nowMs = Date.now(),
  root = runtimeRoot(),
  actor = "director",
} = {}) {
  const rec = getGovernedAction(requestId, root);
  if (!rec) return { ok: false, error: "request_not_found" };
  if (rec.status === "invalidated") {
    return { ok: false, error: rec.failure_code || "governed_action_identity_mismatch", request: publicGovernedAction(rec) };
  }
  if (rec.status === "complete") {
    const identity = assertGovernedActionIdentity({
      request: rec,
      action: { actionType: rec.action_key, id: rec.trusted_host_action_id, result: rec.result },
      result: rec.result,
      evidence: rec.result,
    });
    if (!identity.ok) {
      invalidateGovernedCompletion(rec, { reason: identity.detail || identity.error, nowMs });
      saveRequest(rec, root);
      appendAudit(rec, "invalidated", { nowMs, detail: { reason: rec.integrity?.reason } }, root);
      return { ok: false, error: identity.error, request: publicGovernedAction(rec) };
    }
    return { ok: true, request: publicGovernedAction(rec), already: true };
  }
  if (rec.status === "failed") {
    if (isRecoverableStaleRegistryFailure(rec) && getActionDefinition(rec.action_key)) {
      rec.status = "requested";
      rec.failure_code = null;
      rec.failure_reason = null;
      rec.revived_from_stale_registry = true;
      rec.updated_at = iso(nowMs);
      saveRequest(rec, root);
      appendAudit(rec, "revived_after_director_refresh", { nowMs }, root);
    } else if (isRecoverableStaleRegistryFailure(rec)) {
      return enterControlPlaneRefresh(rec, { nowMs, root });
    } else {
      return { ok: false, error: rec.failure_code || "failed", request: publicGovernedAction(rec) };
    }
  }
  if (rec.status === "awaiting_operator") {
    attachRunWait(rec, { nowMs, root });
    return { ok: true, request: publicGovernedAction(rec), awaiting_operator: true };
  }
  if (rec.status === "awaiting_control_plane_refresh") {
    if (!getActionDefinition(rec.action_key)) {
      attachRunWait(rec, { nowMs, root });
      return { ok: true, refreshing: true, request: publicGovernedAction(rec) };
    }
  }

  rec.status = "awaiting_director";
  rec.updated_at = iso(nowMs);
  saveRequest(rec, root);
  attachRunWait(rec, { nowMs, root });

  const validated = validateAgainstRegistry(
    rec.action_key,
    rec.target,
    rec.artifact_refs,
    rec.requested_mode,
    { worktreePath: rec.worktree_path, inputs: rec.inputs },
  );
  if (!validated.ok) {
    if (validated.stale || validated.error === "director_registry_stale") {
      return enterControlPlaneRefresh(rec, { nowMs, root });
    }
    return failRequest(rec, validated.failure_code || validated.error, validated.validation?.detail || validated.error, { nowMs, root });
  }

  const policy = policyDecision(rec, { nowMs });
  rec.policy_decision = policy.reason;
  rec.operator_approval_required = Boolean(policy.operator_approval_required);
  saveRequest(rec, root);

  if (policy.operator_approval_required) {
    rec.status = "awaiting_operator";
    rec.updated_at = iso(nowMs);
    openApprovalDecision(rec, { nowMs, root });
    saveRequest(rec, root);
    attachRunWait(rec, { nowMs, root });
    appendAudit(rec, "awaiting_operator", { nowMs }, root);
    return { ok: true, request: publicGovernedAction(rec), awaiting_operator: true };
  }

  return executeGovernedAction(rec.request_id, { nowMs, root, actor });
}

export function executeGovernedAction(requestId, {
  nowMs = Date.now(),
  root = runtimeRoot(),
  actor = "director",
} = {}) {
  const rec = getGovernedAction(requestId, root);
  if (!rec) return { ok: false, error: "request_not_found" };
  rec.status = "executing";
  rec.execution_started_at = rec.execution_started_at || iso(nowMs);
  rec.updated_at = iso(nowMs);
  saveRequest(rec, root);
  attachRunWait(rec, { nowMs, root });
  appendAudit(rec, "executing", { nowMs }, root);

  const runExecute = executeImpl || defaultExecute;
  let out;
  try {
    out = runExecute(rec, { nowMs, actor, root });
  } catch (e) {
    out = { ok: false, error: "execution_threw", detail: String(e && e.message || e) };
  }
  const applied = applyExecuteResult(rec, out, { nowMs, root, actor });
  if (applied.ok && rec.status === "complete") {
    if (rec.action_key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL
      && rec.continuation_plan?.kind === "retry_certify") {
      applied.retry = retryCertifyAfterPrincipal(rec, { nowMs, root, actor });
    } else {
      applied.resumePromise = resumeLaneAfterGovernedAction(rec.request_id, { nowMs, root, actor });
    }
  }
  return applied;
}

export async function approveGovernedAction(requestId, {
  actor = "operator",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const rec = getGovernedAction(requestId, root);
  if (!rec) return { ok: false, error: "request_not_found" };
  if (rec.status === "complete") return { ok: true, request: publicGovernedAction(rec), already: true };
  if (rec.status === "failed") {
    rec.status = "awaiting_director";
    rec.failure_code = null;
    rec.failure_reason = null;
  }

  grantMissionAuthorization({
    missionId: rec.mission_id,
    actionType: rec.action_key,
    databaseTarget: rec.target,
    actor,
    queryHash: actionQueryHash(rec),
    sourceDecisionId: rec.decision_id,
    note: `Operator approved governed action ${rec.action_key}.`,
    nowMs,
  });
  rec.operator_approval = {
    decision: "approved",
    actor,
    at: iso(nowMs),
  };
  rec.operator_approval_required = false;
  rec.policy_decision = "operator_approved";
  rec.updated_at = iso(nowMs);
  if (rec.decision_id) {
    try {
      answerDecision({
        missionId: rec.mission_id,
        decisionId: rec.decision_id,
        chosenOptionId: rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST
          ? "authorize_staging_merge"
          : rec.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION
            ? "authorize_staging_migrations"
            : rec.action_key === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER
              ? "authorize_ledger_repair"
              : "authorize_mission_census",
        response: rec.action_key === ACTION_TYPES.DATABASE_READ_CENSUS
          ? "Operator approved read-only census."
          : `Operator approved ${rec.action_key}.`,
        actor,
        nowMs,
      });
    } catch { /* decision close is best-effort */ }
  }
  saveRequest(rec, root);
  appendAudit(rec, "operator_approved", { nowMs }, root);
  const out = executeGovernedAction(rec.request_id, { nowMs, root, actor: "director" });
  if (out?.resumePromise) {
    const resume = await out.resumePromise;
    const { resumePromise: _p, ...rest } = out;
    return { ...rest, resume };
  }
  return out;
}

export function denyGovernedAction(requestId, {
  actor = "operator",
  reason = "approval_denied",
  code = "approval_denied",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const rec = getGovernedAction(requestId, root);
  if (!rec) return { ok: false, error: "request_not_found" };
  rec.operator_approval = {
    decision: "denied",
    actor,
    at: iso(nowMs),
    reason,
  };
  if (rec.decision_id) {
    try {
      answerDecision({
        missionId: rec.mission_id,
        decisionId: rec.decision_id,
        chosenOptionId: code === "policy_denied" ? "use_cert_only" : "deny_production_reads",
        response: reason,
        actor,
        nowMs,
      });
    } catch { /* */ }
  }
  const out = failRequest(rec, code, reason, { nowMs, root, skipResume: true });
  if (rec.run_id) {
    const run = getExecutionRun(rec.run_id, root);
    if (run && !isTerminalRunState(run.state) && ["WAITING_RESOURCE", "NEEDS_INPUT", "EXECUTING"].includes(run.state)) {
      transitionExecutionRun(rec.run_id, "FAILED", {
        reason: rec.failure_reason,
        origin: "system",
        nowMs,
        root,
        completion_report: rec.failure_reason,
      });
    }
  }
  return { ok: true, denied: true, request: out.request, error: code };
}

export function recoverMisclassifiedStaleGovernedRequests({
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const store = readGovernedActionStore(root);
  const out = [];
  for (const rec of store.requests) {
    if (!isRecoverableStaleRegistryFailure(rec)) continue;
    if (getActionDefinition(rec.action_key)) {
      rec.status = "requested";
      rec.failure_code = null;
      rec.failure_reason = null;
      rec.revived_from_stale_registry = true;
      rec.updated_at = iso(nowMs);
      saveRequest(rec, root);
      appendAudit(rec, "revived_after_director_refresh", { nowMs }, root);
      out.push(processGovernedAction(rec.request_id, { nowMs, root, actor: "director" }));
      continue;
    }
    if (rec.status === "awaiting_control_plane_refresh") continue;
    out.push(enterControlPlaneRefresh(rec, { nowMs, root }));
  }
  return out;
}

export function tickGovernedActions({
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const drift = directorRegistryFreshness();
  const stored = readDirectorCapabilityStatus(root);
  if (drift.stale && stored.state !== "refreshing") {
    Promise.resolve(refreshDirectorCapabilities({
      reason: "registry_drift",
      root,
      nowMs,
    })).catch(() => {});
  } else if (!drift.stale) {
    markDirectorCapabilitiesCurrent({ root, nowMs, reason: "tick" });
  }
  const recovered = recoverMisclassifiedStaleGovernedRequests({ nowMs, root });
  const pending = readGovernedActionStore(root).requests.filter((r) =>
    r.status === "requested"
    || r.status === "awaiting_director"
    || (r.status === "awaiting_control_plane_refresh" && Boolean(getActionDefinition(r.action_key)))
  );
  const out = [...recovered];
  const seen = new Set(recovered.map((r) => r?.request?.request_id).filter(Boolean));
  for (const rec of pending) {
    if (seen.has(rec.request_id)) continue;
    out.push(processGovernedAction(rec.request_id, { nowMs, root, actor: "director" }));
  }
  return out;
}

export function continuationTextForGovernedAction(rec, action = null) {
  const evidencePath = rec.result_ref
    || action?.result?.evidence_path
    || action?.result?.evidencePath
    || null;
  const isMigration = rec.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION
    || rec.action_key === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER;
  const isCertify = rec.action_key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING;
  const isMerge = rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST;
  const summary = continuationSummaryFor(rec, action);
  return redact([
    "[VACILANDO GOVERNED ACTION COMPLETE]",
    `Request: ${rec.request_id}`,
    `Action: ${rec.action_key}`,
    `Target: ${rec.target}`,
    action?.id ? `Trusted host action: ${action.id}` : null,
    evidencePath ? `Result file (read this in the current worktree): ${evidencePath}` : null,
    "",
    "Director executed this on the trusted host.",
    "You did NOT receive hosted database credentials or any privileged secret.",
    isCertify
      ? "Do not request staging URLs, operator passwords, cookies, or environment secrets. Consume this evidence and continue program reconciliation."
      : isMigration
      ? "Do not infer schema from the migration ledger. Resume staging runtime certification from this evidence."
      : isMerge
      ? "Do not retry the merge. The pull request is on staging. Continue from this evidence."
      : "Do not retry the census from this lane. Read the result file and continue.",
    rec.run_id ? `When this assignment is finished, report: vac run-status ${rec.run_id} complete --summary "..."${rec.lane_id ? ` --lane ${rec.lane_id}` : ""}` : null,
    "",
    "Bounded result summary:",
    JSON.stringify(summary, null, 2),
    "",
    rec.continuation_intent
      || (isCertify
        ? "Resume the same Access & Identity lane. Use the certification evidence. Do not discover the staging URL or operator credentials."
        : isMigration
        ? "Resume the same Access & Identity lane at staging runtime/browser certification. Do not continue migration implementation."
        : isMerge
        ? "Resume the same lane. The merge completed; continue remaining assigned work."
        : "Continue the current assignment using this evidence."),
  ].filter((line) => line != null).join("\n"));
}

export function continuationTextForFailedGovernedAction(rec) {
  return redact([
    "[VACILANDO GOVERNED ACTION FAILED]",
    `Request: ${rec.request_id}`,
    `Action: ${rec.action_key}`,
    `Target: ${rec.target}`,
    rec.failure_code ? `Failure: ${rec.failure_code}` : null,
    rec.failure_reason || null,
    "",
    "Director could not complete this trusted-host action.",
    "The merge into staging already succeeded. Do not retry the merge.",
    "The current Execution Run is still open. Wait for the next operator instruction in this lane, then continue the assignment.",
  ].filter((line) => line != null).join("\n"));
}

export async function resumeLaneAfterFailedGovernedAction(requestId, {
  nowMs = Date.now(),
  root = runtimeRoot(),
  actor = "director",
} = {}) {
  const rec = getGovernedAction(requestId, root);
  if (!rec || rec.status !== "failed") {
    return { ok: false, error: "request_not_failed" };
  }
  const pendingNext = pendingGovernedActionForLane(rec.lane_id, root);
  if (pendingNext && pendingNext.request_id !== rec.request_id) {
    attachRunWait(pendingNext, { nowMs, root });
    return { ok: true, deferred: true, waiting_on: pendingNext.request_id };
  }
  releaseRunAfterGovernedFailure(rec, { nowMs, root });
  const { sendLaneInstruction } = await import("./lanes.mjs");
  const { startLaneAgentSession } = await import("./agent-session-lifecycle.mjs");
  const text = continuationTextForFailedGovernedAction(rec);
  const send = sendImpl || sendLaneInstruction;
  const start = startSessionImpl || startLaneAgentSession;
  let delivered = await send(rec.lane_id, text, {
    origin: "director",
    source: "governed_action_failed",
    runId: rec.run_id,
  });
  let startedSession = null;
  if (!delivered?.ok) {
    startedSession = await start({ laneId: rec.lane_id, nowMs, root });
    delivered = await send(rec.lane_id, text, {
      origin: "director",
      source: "governed_action_failed",
      runId: rec.run_id,
      fresh_session: true,
    });
  }
  rec.failure_notified_at = iso(nowMs);
  rec.resume_delivery = {
    ok: Boolean(delivered?.ok),
    error: delivered?.error || null,
    fresh_session: Boolean(startedSession?.ok),
    failed: true,
  };
  rec.updated_at = iso(nowMs);
  saveRequest(rec, root);
  appendAudit(rec, "failed_notified", { nowMs, detail: rec.resume_delivery }, root);
  return {
    ok: Boolean(delivered?.ok),
    request: publicGovernedAction(rec),
    delivered,
    startedSession,
    same_lane: true,
  };
}

export async function resumeLaneAfterGovernedAction(requestId, {
  nowMs = Date.now(),
  root = runtimeRoot(),
  actor = "director",
} = {}) {
  const rec = getGovernedAction(requestId, root);
  if (!rec || rec.status !== "complete") {
    return { ok: false, error: "request_not_complete" };
  }
  if (rec.resumed_at && rec.resume_delivery?.ok) {
    return { ok: true, request: publicGovernedAction(rec), already: true, same_lane: true };
  }
  const identity = assertGovernedActionIdentity({
    request: rec,
    action: { actionType: rec.action_key, id: rec.trusted_host_action_id, result: rec.result },
    result: rec.result,
    evidence: rec.result,
  });
  if (!identity.ok) {
    invalidateGovernedCompletion(rec, { reason: identity.detail || identity.error, nowMs });
    saveRequest(rec, root);
    appendAudit(rec, "invalidated", { nowMs, detail: { reason: rec.integrity?.reason } }, root);
    return { ok: false, error: identity.error, request: publicGovernedAction(rec) };
  }
  if (resumeImpl) return resumeImpl(requestId, { nowMs, root, actor });
  const pendingNext = pendingGovernedActionForLane(rec.lane_id, root);
  if (pendingNext && pendingNext.request_id !== rec.request_id) {
    attachRunWait(pendingNext, { nowMs, root });
    return { ok: true, deferred: true, waiting_on: pendingNext.request_id };
  }
  const { sendLaneInstruction } = await import("./lanes.mjs");
  const { startLaneAgentSession } = await import("./agent-session-lifecycle.mjs");
  const { getTrustedHostAction } = await import("./trusted-host-actions.mjs");
  const action = rec.trusted_host_action_id ? getTrustedHostAction(rec.trusted_host_action_id) : null;
  const text = continuationTextForGovernedAction(rec, action);

  if (rec.run_id) {
    const run = getExecutionRun(rec.run_id, root);
    if (run && run.state === "WAITING_RESOURCE") {
      transitionExecutionRun(rec.run_id, "EXECUTING", {
        reason: "governed_action_complete",
        origin: "system",
        nowMs,
        root,
        progress: `${rec.action_key} complete — resuming worker`,
      });
      patchRunFields(rec.run_id, { governed_action: publicGovernedAction(rec) }, { nowMs, root });
      patchRunResourceWait(rec.run_id, null, root);
    }
  }

  const send = sendImpl || sendLaneInstruction;
  const start = startSessionImpl || startLaneAgentSession;
  let delivered = await send(rec.lane_id, text, {
    origin: "director",
    source: "governed_action_resume",
    runId: rec.run_id,
  });
  let startedSession = null;
  if (!delivered?.ok) {
    startedSession = await start({ laneId: rec.lane_id, nowMs, root });
    delivered = await send(rec.lane_id, text, {
      origin: "director",
      source: "governed_action_resume",
      runId: rec.run_id,
      fresh_session: true,
    });
  }
  rec.resumed_at = iso(nowMs);
  rec.resume_delivery = {
    ok: Boolean(delivered?.ok),
    error: delivered?.error || null,
    fresh_session: Boolean(startedSession?.ok),
  };
  rec.updated_at = iso(nowMs);
  saveRequest(rec, root);
  appendAudit(rec, "resumed", { nowMs, detail: rec.resume_delivery }, root);
  emitNotification("governed_action_worker_resumed", rec, {
    title: `${rec.title || rec.action_key} — worker resumed`,
    body: `Continuing ${rec.lane_id} with ${rec.action_key} results.`,
    root,
  });
  return {
    ok: Boolean(delivered?.ok),
    request: publicGovernedAction(rec),
    delivered,
    startedSession,
    same_lane: true,
    same_worktree: true,
  };
}

export function attachLaneGovernedActions(lanes, root = runtimeRoot()) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  return list.map((lane) => {
    const pending = pendingGovernedActionForLane(lane?.lane_id, root)
      || pendingGovernedActionForRun(lane?.execution_run?.run_id, root);
    if (!pending) return lane;
    const pub = publicGovernedAction(pending);
    const run = lane.execution_run
      ? {
        ...lane.execution_run,
        governed_action: pub,
        resource_wait: {
          ...(lane.execution_run.resource_wait || {}),
          ...waitProjection(pending),
        },
      }
      : null;
    return {
      ...lane,
      governed_action: pub,
      execution_run: run,
    };
  });
}

export function applyGovernedActionToPublicRun(run, root = runtimeRoot()) {
  if (!run?.run_id && !run?.lane_id) return run;
  const pending = pendingGovernedActionForRun(run.run_id, root)
    || pendingGovernedActionForLane(run.lane_id, root);
  if (!pending) {
    return run.governed_action ? run : { ...run, governed_action: run.governed_action || null };
  }
  return {
    ...run,
    governed_action: publicGovernedAction(pending),
    resource_wait: {
      ...(run.resource_wait || {}),
      ...waitProjection(pending),
    },
  };
}

export function handleGovernedDecisionAnswer(missionId, chosenOptionId, {
  actor = "operator",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const pending = pendingGovernedActionForMission(missionId, root);
  if (!pending) return { ok: false, error: "no_pending_governed_action" };
  if (chosenOptionId === "authorize_mission_census" || chosenOptionId === "approve_read_only_census") {
    return approveGovernedAction(pending.request_id, { actor, nowMs, root });
  }
  if (chosenOptionId === "use_cert_only") {
    return denyGovernedAction(pending.request_id, {
      actor,
      code: "policy_denied",
      reason: "Operator required certification-only; deployed primary read denied.",
      nowMs,
      root,
    });
  }
  if (chosenOptionId === "deny_production_reads") {
    return denyGovernedAction(pending.request_id, {
      actor,
      code: "approval_denied",
      reason: "Operator denied production reads.",
      nowMs,
      root,
    });
  }
  return { ok: false, error: "unhandled_option", chosenOptionId };
}

export function reconcileGovernedActionIntegrity({
  root = runtimeRoot(),
  nowMs = Date.now(),
} = {}) {
  const store = readGovernedActionStore(root);
  const report = {
    audited: store.requests.length,
    invalidated: [],
    intact: [],
    skipped: [],
  };
  for (const rec of store.requests) {
    if (rec.status === "invalidated") {
      report.skipped.push({ request_id: rec.request_id, action_key: rec.action_key, reason: "already_invalidated" });
      continue;
    }
    const cls = classifyStoredGovernedCompletion(rec);
    if (cls.skipped) {
      report.skipped.push({ request_id: rec.request_id, action_key: rec.action_key, reason: cls.reason });
      continue;
    }
    if (cls.ok) {
      report.intact.push({ request_id: rec.request_id, action_key: rec.action_key });
      continue;
    }
    invalidateGovernedCompletion(rec, { reason: cls.reason, nowMs });
    saveRequest(rec, root);
    appendAudit(rec, "invalidated", { nowMs, detail: { reason: cls.reason } }, root);
    report.invalidated.push({
      request_id: rec.request_id,
      action_key: rec.action_key,
      reason: cls.reason,
      result_ref: rec.result_ref || null,
    });
  }
  return report;
}

export { publicExecutionRun, redact as redactGovernedSecrets, containsSecret as governedPayloadHasSecrets };
