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
  fulfillRepositoryPushForMission,
  fulfillPromotionOpenPrForMission,
  fulfillDatabaseCensusForMission,
  fulfillRepositoryMergeForMission,
  fulfillDatabaseMigrationForMission,
} from "./trusted-host-actions.mjs";
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
import {
  consumeGrant,
  getGrant,
  mintGrant,
  resolveGovernedAuthoritySync,
} from "./governed-repository-authority.mjs";
import { inspectPullRequest } from "./trusted-host-merge.mjs";

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
]);

export const GOVERNED_MODES = Object.freeze([
  "read_only",
  "certification",
  "migration_apply",
  "promotion",
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
  return /postgresql:\/\/[^\s]+|postgres:\/\/[^\s]+|DATABASE_URL|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi;
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
  if (key === ACTION_TYPES.REPOSITORY_PUSH) {
    const b = inputs.branch || inputs.head_branch || inputs.headBranch || "";
    const sha = String(inputs.expected_head_sha || inputs.expectedHeadSha || "").slice(0, 12);
    return {
      approve_label: "Authorize push",
      deny_label: "Deny",
      wait_label: "Waiting on Director — branch push",
      mission_need: `Needs approval — Push ${b || "a reviewed branch"}`,
      detail: `Push ${b} at ${sha || "—"} to the remote · non-force · single ref`,
    };
  }
  if (key === ACTION_TYPES.PROMOTION_OPEN_PR) {
    const b = inputs.head_branch || inputs.headBranch || inputs.branch || "";
    const base = inputs.base || req.target || "staging";
    const sha = String(inputs.expected_head_sha || inputs.expectedHeadSha || "").slice(0, 12);
    return {
      approve_label: "Authorize pull request",
      deny_label: "Deny",
      wait_label: "Waiting on Director — promotion pull request",
      mission_need: `Needs approval — Open ${b} → ${base}`,
      detail: `Open a pull request from ${b} at ${sha || "—"} into ${base}`,
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
  return {
    approve_label: "Authorize census",
    deny_label: "Deny",
    wait_label: "Waiting on Director",
    mission_need: "Needs approval — read-only census",
    detail: `Read-only database census · Target: ${req.target || DEFAULT_TARGET} · Data mode: Read-only`,
  };
}

/**
 * The facts a Director weighs before authorizing a merge, as structured rows.
 *
 * WHY STRUCTURED AND NOT A SENTENCE. The card used to be one line — "Merge PR
 * #508 into staging · expected SHA 4cffed0abe32 · method merge". That is enough
 * to identify the action and not enough to DECIDE it: it never said what the PR
 * was called, whether CI was green, how much it changed, or what merging would
 * do that could not be undone. A Director approving from a phone had to leave
 * the app to find out.
 *
 * Everything here is either pinned in the request or captured from a read-only
 * inspection at request time. Nothing is a credential, and nothing is inferred.
 */
export const GRANT_TTL_MINUTES = 30;

const MERGE_CONSEQUENCES = Object.freeze([
  "The pull request is merged into the target branch on GitHub.",
  "The target branch moves for everyone, not just this lane.",
  "Vacilando cannot undo this. Reverting is a separate, human decision.",
]);

function factRow(label, value) {
  if (value === null || value === undefined || value === "") return null;
  return { label, value: String(value) };
}

const PUSH_CONSEQUENCES = Object.freeze([
  "The named commit is published to the remote branch, visible to everyone.",
  "Nothing is force-pushed and no other branch is touched.",
  "The branch can be moved again afterwards, but this commit cannot be unpublished.",
]);

const OPEN_PR_CONSEQUENCES = Object.freeze([
  "A pull request is opened against the canonical promotion branch.",
  "It does not merge anything — merging is a separate decision.",
  "An open pull request for the same branch is reused rather than duplicated.",
]);

/** The facts a Director weighs before authorizing a push. */
function pushProposal(req) {
  const i = req.inputs || {};
  const sha = String(i.expected_head_sha || i.expectedHeadSha || "");
  const branch = i.branch || i.head_branch || i.headBranch || null;
  const facts = [
    factRow("Repository", i.repository || null),
    factRow("Branch", branch),
    factRow("Commit", sha ? sha.slice(0, 12) : null),
    factRow("Remote ref", branch ? `refs/heads/${branch}` : null),
    factRow("Force", "no — non-fast-forward is refused"),
    factRow("Commits reviewed", Array.isArray(i.expected_commits || i.expectedCommits)
      ? (i.expected_commits || i.expectedCommits).length : null),
    factRow("Requested by", req.requesting_worker || req.lane_id || null),
  ].filter(Boolean);
  return {
    kind: "repository_push",
    headline: branch ? `Push ${branch} to the remote` : "Push a reviewed branch",
    url: null,
    facts,
    reason: req.reason_worker_cannot_execute || null,
    consequences: [...PUSH_CONSEQUENCES],
    authorization_note: `Approving creates a single-use authorization pinned to commit ${sha.slice(0, 12) || "—"}, valid for ${GRANT_TTL_MINUTES} minutes. If the branch moves, it stops working and this has to be decided again.`,
    grant_ttl_minutes: GRANT_TTL_MINUTES,
    snapshot_available: true,
  };
}

/** The facts a Director weighs before opening a promotion pull request. */
function openPrProposal(req) {
  const i = req.inputs || {};
  const sha = String(i.expected_head_sha || i.expectedHeadSha || "");
  const head = i.head_branch || i.headBranch || i.branch || null;
  const base = i.base || req.target || "staging";
  const facts = [
    factRow("Repository", i.repository || null),
    factRow("From", head),
    factRow("Into", base),
    factRow("Commit", sha ? sha.slice(0, 12) : null),
    factRow("Title", i.title || null),
    factRow("Merges anything", "no — opening a pull request only"),
    factRow("Requested by", req.requesting_worker || req.lane_id || null),
  ].filter(Boolean);
  return {
    kind: "promotion_open_pr",
    headline: head ? `Open ${head} → ${base}` : "Open a promotion pull request",
    url: null,
    facts,
    reason: req.reason_worker_cannot_execute || null,
    consequences: [...OPEN_PR_CONSEQUENCES],
    authorization_note: `Approving creates a single-use authorization pinned to commit ${sha.slice(0, 12) || "—"}, valid for ${GRANT_TTL_MINUTES} minutes.`,
    grant_ttl_minutes: GRANT_TTL_MINUTES,
    snapshot_available: true,
  };
}

export function governedProposalFor(req = {}) {
  if (req.action_key === ACTION_TYPES.REPOSITORY_PUSH) return pushProposal(req);
  if (req.action_key === ACTION_TYPES.PROMOTION_OPEN_PR) return openPrProposal(req);
  if (req.action_key !== ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) return null;
  const i = req.inputs || {};
  const snap = req.proposal_snapshot || null;
  const sha = String(i.expected_head_sha || i.expectedHeadSha || "");
  const number = i.pull_request_number || i.pullRequestNumber || null;

  // CI is reported as what was OBSERVED, including "not checked" — a card that
  // silently omits the check state reads as "fine" when it means "unknown".
  let ci = "not checked at proposal time";
  if (snap?.checks) {
    const c = snap.checks;
    const failing = (c.failing || []).length;
    const pending = (c.pending || []).length;
    const unknown = (c.unknown || []).length;
    ci = failing ? `${failing} failing`
      : pending ? `${pending} still running`
        : unknown ? `${unknown} unknown`
          : "all required checks green";
  }

  const facts = [
    factRow("Repository", i.repository || i.repo || null),
    factRow("Pull request", number ? `#${number}` : null),
    factRow("Title", snap?.title || null),
    factRow("Branch", snap?.headRefName ? `${snap.headRefName} → ${i.target_branch || i.targetBranch || req.target}` : null),
    factRow("Target branch", i.target_branch || i.targetBranch || req.target || null),
    factRow("Head commit", sha ? sha.slice(0, 12) : null),
    factRow("Merge method", i.merge_method || i.mergeMethod || "merge"),
    factRow("Continuous integration", ci),
    factRow("Mergeable", snap?.mergeable || null),
    factRow("Changed files", Number.isFinite(snap?.changedFiles) ? snap.changedFiles : null),
    factRow("Lines", Number.isFinite(snap?.additions) && Number.isFinite(snap?.deletions)
      ? `+${snap.additions} / −${snap.deletions}` : null),
    factRow("Requested by", req.requesting_worker || req.lane_id || null),
  ].filter(Boolean);

  return {
    kind: "repository_merge",
    headline: number ? `Merge PR #${number} into ${i.target_branch || i.targetBranch || req.target}` : "Merge pull request",
    url: snap?.url || null,
    facts,
    reason: req.reason_worker_cannot_execute || null,
    consequences: [...MERGE_CONSEQUENCES],
    // Stated before approval so the Director knows what approving creates.
    authorization_note: `Approving creates a single-use authorization pinned to commit ${sha.slice(0, 12) || "—"}, valid for ${GRANT_TTL_MINUTES} minutes. If the branch moves, it stops working and this has to be decided again.`,
    grant_ttl_minutes: GRANT_TTL_MINUTES,
    snapshot_at: snap?.observed_at || null,
    snapshot_available: Boolean(snap),
  };
}

/**
 * Read-only look at the pull request, captured once when the proposal is made.
 *
 * Best effort on purpose: a Director must still be able to see and decide the
 * proposal when GitHub is unreachable. When it fails the card says the facts
 * were not captured rather than showing blanks that read as zeroes.
 */
function capturePullRequestSnapshot(rec, { gh = null } = {}) {
  if (rec?.action_key !== ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) return null;
  // Never reach the network from the test runner. Tests inject `gh`.
  if (!gh && process.env.NODE_TEST_CONTEXT) return null;
  try {
    const out = inspectPullRequest(rec.inputs || {}, gh ? { gh } : {});
    if (!out?.ok || !out.pr) return null;
    const pr = out.pr;
    return {
      title: pr.title || null,
      url: pr.url || null,
      state: pr.state || null,
      mergeable: pr.mergeable || null,
      merge_state: pr.mergeStateStatus || null,
      headRefName: pr.headRefName || null,
      changedFiles: pr.changedFiles ?? null,
      additions: pr.additions ?? null,
      deletions: pr.deletions ?? null,
      checks: pr.checks || null,
      observed_at: iso(Date.now()),
    };
  } catch {
    return null;
  }
}

export function publicGovernedAction(req) {
  if (!req) return null;
  const presentation = presentationForGovernedAction(req);
  return {
    request_id: req.request_id,
    mission_id: req.mission_id,
    // What vouched for this action, so the approval card can say so instead of
    // leaving a repository-authorized request looking unattributed.
    authority: req.authority || (req.mission_id ? { kind: "mission", mission_id: req.mission_id } : null),
    grant_id: req.grant_id || null,
    proposal: governedProposalFor(req),
    grant_expires_at: req.grant_expires_at || null,
    lane_id: req.lane_id,
    run_id: req.run_id || null,
    action_key: req.action_key,
    target: req.target || null,
    purpose: req.purpose || null,
    artifact_refs: req.artifact_refs || [],
    requested_mode: req.requested_mode,
    reason_worker_cannot_execute: req.reason_worker_cannot_execute || null,
    operator_approval_required: Boolean(req.operator_approval_required),
    operator_approval: req.operator_approval || null,
    status: req.status,
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

export function pendingGovernedActionForLane(laneId, root = runtimeRoot()) {
  if (!laneId) return null;
  const lane = canonicalLaneStoreId(laneId, root);
  return newestPending(listGovernedActions({ laneId: lane, root }));
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
  if (actionKey === ACTION_TYPES.REPOSITORY_PUSH) return "promotion";
  if (actionKey === ACTION_TYPES.PROMOTION_OPEN_PR) return "promotion";
  if (actionKey === ACTION_TYPES.DATABASE_APPLY_MIGRATION) return "migration_apply";
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
  // A lane with no Mission is not automatically ungoverned.
  //
  // A provider on an authorized run reached repository.merge_pull_request and
  // this refused with `missing_mission_binding`, leaving nothing for a Director
  // to approve — the only route left was merging by hand outside Vacilando.
  // The refusal was right; having nothing on the other side of it was the bug.
  //
  // Authority may instead come from the lane's REPOSITORY, and only when its
  // profile actually carries governed promotion. A generic repository has no
  // promotion policy and stays exactly as fail-closed as before: this widens
  // where authority may come from, never what may be done without it.
  let repositoryAuthority = null;
  if (!missionId) {
    // Resolve here rather than requiring every caller to thread it. Both entry
    // points — the CLI and the WAITING_RESOURCE orchestrator — reach this one
    // function, and a caller that forgot to pass authority would have failed
    // closed for the wrong reason.
    const authority = input.__authority || resolveGovernedAuthoritySync(laneId, { root });
    if (!authority || authority.ok !== true) {
      return {
        ok: false,
        error: authority?.error || "missing_mission_binding",
        detail: authority?.detail || null,
        repository_id: authority?.repository_id || null,
      };
    }
    if (authority.kind !== "repository") return { ok: false, error: "missing_mission_binding" };
    repositoryAuthority = authority;
  }
  const mode = defaultModeForAction(
    actionKey,
    String(input.requested_mode || input.requestedMode || "").trim() || null,
  );
  const authorityRecord = repositoryAuthority
    ? {
      kind: "repository",
      repository_id: repositoryAuthority.repository_id,
      repository_name: repositoryAuthority.repository_name || null,
      profile: repositoryAuthority.profile || null,
      canonical_branch: repositoryAuthority.canonical_branch || null,
    }
    : { kind: "mission", mission_id: missionId };
  if (!GOVERNED_MODES.includes(mode)) return { ok: false, error: "invalid_mode", requested_mode: mode };
  const reason = bound(input.reason_worker_cannot_execute || input.reasonWorkerCannotExecute, 1000);
  if (!reason) return { ok: false, error: "missing_reason_worker_cannot_execute" };
  const purpose = bound(input.purpose, 1000) || "Governed capability required";
  const defaultTarget = actionKey === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST
    || actionKey === ACTION_TYPES.DATABASE_APPLY_MIGRATION
    || actionKey === ACTION_TYPES.REPOSITORY_PUSH
    || actionKey === ACTION_TYPES.PROMOTION_OPEN_PR
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
    // null, never "", so every `if (missionId)` downstream reads the same way.
    missionId: missionId || null,
    // Present when a repository, not a mission, is vouching for this action.
    authority: authorityRecord,
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
      // Only override when the RUN actually knows its worktree. Spreading
      // `undefined` here erased a path the caller had supplied in `inputs`,
      // which surfaced as `invalid_worktree_path` on a perfectly valid request.
      ...(worktreePath ? { worktreePath, worktree_path: worktreePath } : {}),
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
  if (rec?.action_key === ACTION_TYPES.REPOSITORY_PUSH
    || rec?.action_key === ACTION_TYPES.PROMOTION_OPEN_PR) {
    // A push or a promotion is a decision about one COMMIT. Keying on the head
    // SHA is what makes an approval stop applying the moment the branch moves.
    return rec.inputs?.expected_head_sha || rec.inputs?.expectedHeadSha || null;
  }
  if (rec?.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    return rec.inputs?.expected_head_sha || rec.inputs?.expectedHeadSha || rec.inputs?.head_sha || null;
  }
  if (rec?.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    return rec.inputs?.expected_sha || rec.inputs?.expectedSha || rec.inputs?.dedupeKey || rec.inputs?.dedupe_key || null;
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
  if (rec.action_key === ACTION_TYPES.REPOSITORY_PUSH) {
    const b = rec.inputs?.branch || rec.inputs?.head_branch || rec.inputs?.headBranch || "";
    return b ? `Push ${b} to the remote` : "Push a reviewed branch";
  }
  if (rec.action_key === ACTION_TYPES.PROMOTION_OPEN_PR) {
    const b = rec.inputs?.head_branch || rec.inputs?.headBranch || rec.inputs?.branch || "";
    return b ? `Open a staging pull request for ${b}` : "Open a promotion pull request";
  }
  if (rec.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    return "Apply Access & Identity staging migrations";
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
    // What vouched for this action. A repository-authorized request has no
    // mission, so this is the only place the audit trail can name its source.
    authority: shape.authority || null,
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
  // Capture the pull request's facts ONCE, at the moment the proposal is made,
  // so the Director decides against what was true then and the head-SHA pin
  // catches anything that moves afterwards.
  const snapshot = capturePullRequestSnapshot(rec, { gh: input.__gh || null });
  if (snapshot) rec.proposal_snapshot = snapshot;
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
  if (existingId) {
    const rec = getGovernedAction(existingId, root);
    if (rec && isPendingGovernedStatus(rec.status)) {
      attachRunWait(rec, { nowMs, root });
      return { ok: true, request: publicGovernedAction(rec), deduped: true };
    }
  }
  const pending = pendingGovernedActionForRun(run.run_id, root)
    || pendingGovernedActionForLane(run.lane_id, root);
  if (pending) {
    attachRunWait(pending, { nowMs, root });
    return { ok: true, request: publicGovernedAction(pending), deduped: true };
  }

  const laneId = run.lane_id;
  const rec = getDurableLane(laneId, root);
  const missionId = fields.mission_id || fields.missionId || run.mission_id || rec?.mission_id || null;
  const authority = fields.__authority
    || (missionId ? null : resolveGovernedAuthoritySync(laneId, { root }));
  if (!missionId && !(authority && authority.ok === true && authority.kind === "repository")) {
    // Say WHICH authority is missing. "Lane has no Mission binding" sent the
    // Director looking for a mission to repair, when the real answer is that
    // this repository's profile does not carry governed promotion at all.
    const detail = authority?.error === "repository_profile_forbids_governed_action"
      ? `This repository's ${authority.profile} profile does not carry governed promotion.`
      : "Lane has no Mission binding and no repository that can authorize this action.";
    patchRunFields(run.run_id, { state_reason: detail }, { nowMs, root });
    return { ok: false, error: authority?.error || "missing_mission_binding", detail };
  }

  const request = {
    mission_id: missionId,
    // Which authority vouched for this action, recorded on the request so the
    // approval card and the audit trail can say so.
    authority: missionId
      ? { kind: "mission", mission_id: missionId }
      : {
        kind: "repository",
        repository_id: authority.repository_id,
        repository_name: authority.repository_name || null,
        profile: authority.profile || null,
        canonical_branch: authority.canonical_branch || null,
      },
    lane_id: laneId,
    run_id: run.run_id,
    action_key: fields.action_key || fields.actionKey || null,
    target: fields.target || null,
    purpose: fields.purpose || null,
    artifact_refs: fields.artifact_refs || fields.artifactRefs || (fields.artifact ? [fields.artifact] : []),
    // Defer to the action's own default instead of hardcoding read_only.
    // A merge is privileged_write, so forcing read_only here made every merge
    // raised through the WAITING_RESOURCE seam fail `policy_denied` before a
    // Director ever saw it — the CLI path never hit this because it sends its
    // own mode. Census still resolves to read_only, which is its default.
    requested_mode: fields.requested_mode || fields.requestedMode || null,
    reason_worker_cannot_execute: fields.reason_worker_cannot_execute
      || fields.reasonWorkerCannotExecute
      || reason
      || "Lane cannot execute this privileged capability",
    worktree_path: run.worktree_path || rec?.binding?.worktree_path || null,
    title: fields.title || null,
    // Forwarded, because a merge or a migration IS its inputs. Dropping them
    // here left the request with nothing to validate and it failed as
    // `missing_repository` — which reads like a registry problem rather than
    // the plumbing gap it was. Census carries its parameters in artifact_refs
    // and so never noticed.
    inputs: fields.inputs || fields.action_inputs || {},
  };
  if (!request.action_key) {
    patchRunFields(run.run_id, { state_reason: "Governed wait missing action_key" }, { nowMs, root });
    return { ok: false, error: "missing_action_key" };
  }
  return requestGovernedAction(request, { nowMs, root, processNow: false });
}

function openApprovalDecision(rec, { nowMs, root } = {}) {
  const presentation = presentationForGovernedAction(rec);

  // A repository-authorized request has no Mission, and the Decision store is
  // mission-scoped by construction — createDecision throws without one. Two
  // things follow, and both matter.
  //
  // First, do NOT fall through to listDecisions(null): that scans EVERY
  // mission's open decisions, and the merge branch below matches on
  // `defaultAction === "approve_governed_merge"` alone. This request would have
  // silently adopted an unrelated mission's open merge decision, so approving
  // one would have approved the other.
  //
  // Second, no parallel approval system is invented here. The governed action
  // record IS the approval surface — `awaiting_operator` plus `operator_approval`
  // is what the Director approves, exactly as a mission-bound request does. The
  // Decision is the extra mission-side view, and its absence costs nothing.
  if (!rec.mission_id) {
    emitNotification("governed_action_approval_required", rec, {
      title: presentation.mission_need,
      body: presentation.detail,
      root,
    });
    return null;
  }

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
    : "";
  const isMerge = rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST;
  const { decision } = createDecision({
    missionId: rec.mission_id,
    title: rec.title || presentation.mission_need.replace(/^Needs approval — /, ""),
    situation: [
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
    currentPlan: isMerge
      ? "Director merges the named pull request into staging on the trusted host and returns the merge SHA to the originating lane."
      : "Director applies the approved committed migration files to staging, one at a time, and stops on the first failure.",
    discovery: rec.reason_worker_cannot_execute,
    options: [
      {
        optionId: isMerge ? "authorize_staging_merge" : "authorize_staging_migrations",
        label: presentation.approve_label,
        description: presentation.detail,
      },
      {
        optionId: "deny_governed_action",
        label: "Deny",
        description: "Deny this privileged action. Director will not bounce the worker to retry a capability it cannot access.",
      },
    ],
    recommendation: isMerge ? "authorize_staging_merge" : "authorize_staging_migrations",
    recommendationReason: "The lane correctly cannot hold GitHub or database credentials. Director/trusted host is the sanctioned path.",
    defaultAction: isMerge ? "approve_governed_merge" : "approve_governed_migration",
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

/**
 * The key the trusted-host stores are partitioned by.
 *
 * A mission when there is one; otherwise the repository that vouched. Same
 * store, same states, same execution path — only the authority differs, which
 * is the whole point of this change.
 */
function authorityScopeFor(rec) {
  return rec?.mission_id || rec?.authority?.repository_id || null;
}

/** Everything a Director actually weighs, in the shape the grant is pinned to. */
function proposalForRequest(rec) {
  return {
    proposal_id: rec.request_id,
    action_key: rec.action_key,
    repository_id: rec.authority?.repository_id || null,
    pull_request_number: rec.inputs?.pull_request_number ?? rec.inputs?.pullRequestNumber ?? null,
    expected_head_sha: rec.inputs?.expected_head_sha || rec.inputs?.expectedHeadSha || null,
    // Normalized the way validateMergeInputs will normalize them, so the grant
    // pins the values the action is actually built from. Comparing an unset
    // merge_method against the action's defaulted "merge" would make every
    // grant look stale.
    target_branch: rec.target || "staging",
    merge_method: rec.inputs?.merge_method || rec.inputs?.mergeMethod || "merge",
    // Present for a push or a promotion; null for a merge, whose identity is
    // the pull request number rather than a branch name.
    branch: rec.inputs?.branch || rec.inputs?.head_branch || rec.inputs?.headBranch || null,
    run_id: rec.run_id || null,
    lane_id: rec.lane_id || null,
    requested_by: rec.requesting_worker || null,
  };
}

function defaultExecute(rec, { nowMs, actor, root } = {}) {
  const scope = authorityScopeFor(rec);
  // Present only on the repository-authorized path. A mission-bound request is
  // authorized exactly as before and never looks at this.
  const grant = rec.grant_id ? getGrant(rec.grant_id, root) : null;

  if (rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    return fulfillRepositoryMergeForMission(scope, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: rec.inputs || {},
      actor,
      nowMs,
      grant,
    });
  }
  if (rec.action_key === ACTION_TYPES.REPOSITORY_PUSH) {
    return fulfillRepositoryPushForMission(scope, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: { ...(rec.inputs || {}), worktree_path: rec.worktree_path, worktreePath: rec.worktree_path },
      actor,
      nowMs,
      grant,
    });
  }
  if (rec.action_key === ACTION_TYPES.PROMOTION_OPEN_PR) {
    return fulfillPromotionOpenPrForMission(scope, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: rec.inputs || {},
      actor,
      nowMs,
      grant,
    });
  }
  if (rec.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    return fulfillDatabaseMigrationForMission(scope, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: {
        ...(rec.inputs || {}),
        worktree_path: rec.worktree_path,
        worktreePath: rec.worktree_path,
      },
      actor,
      nowMs,
      grant,
    });
  }
  if (rec.action_key !== ACTION_TYPES.DATABASE_READ_CENSUS) {
    return { ok: false, error: "action_unavailable" };
  }
  return fulfillDatabaseCensusForMission(scope, {
    assignmentId: rec.run_id || null,
    executionSessionId: rec.run_id || null,
    queryArtifactPath: artifactPathFrom(rec.artifact_refs),
    worktreePath: rec.worktree_path,
    actor,
    nowMs,
  });
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
  rec.status = "complete";
  rec.trusted_host_action_id = action.id;
  rec.result = action.result || null;
  rec.result_ref = action.result?.evidencePath || action.id;
  rec.execution_ended_at = iso(nowMs);
  rec.updated_at = iso(nowMs);
  rec.failure_code = null;
  rec.failure_reason = null;
  saveRequest(rec, root);
  appendAudit(rec, "complete", { nowMs, detail: { result_ref: rec.result_ref } }, root);
  emitNotification("governed_action_complete", rec, {
    title: `${rec.title || rec.action_key} complete`,
    body: "Director finished the trusted-host action and is resuming the originating lane.",
    root,
  });
  try {
    attachEvidence({
      missionId: rec.mission_id,
      type: "database",
      title: rec.title || rec.action_key,
      description: `${rec.action_key} against ${rec.target}`,
      fileUri: rec.result_ref,
      createdBy: actor || "director",
      nowMs,
    });
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
  if (rec.status === "complete") return { ok: true, request: publicGovernedAction(rec), already: true };
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
  // Spend the grant the moment it is used for anything other than a refusal.
  // Single-use is the property that makes this an authorization for ONE merge
  // rather than standing permission: a retry, a replay, or a second tap needs a
  // fresh Director decision. `already` covers the double-click, so consuming
  // twice reads as done rather than as a second execution.
  if (rec.grant_id && out?.error !== "authorization_required") {
    const spent = consumeGrant(rec.grant_id, { by: actor || "director", nowMs, root });
    appendAudit(rec, "grant_consumed", { nowMs, grant_id: rec.grant_id, already: Boolean(spent.already) }, root);
  }
  const applied = applyExecuteResult(rec, out, { nowMs, root, actor });
  if (applied.ok && rec.status === "complete") {
    applied.resumePromise = resumeLaneAfterGovernedAction(rec.request_id, { nowMs, root, actor });
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

  // WHICH AUTHORIZATION THIS APPROVAL CREATES.
  //
  // A mission-bound request keeps grantMissionAuthorization exactly as it was:
  // mission scoped, reusable within the mission, unchanged behaviour.
  //
  // A repository-authorized request must NOT get that. A mission authorization
  // is keyed only by action type and target, so approving one merge would leave
  // standing permission to merge that branch again — including a head SHA the
  // Director never saw. It gets a single-use grant pinned to this exact
  // proposal instead: this PR, this head SHA, this target, this method, this
  // run. A different SHA is a different decision.
  if (rec.mission_id) {
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
  } else {
    const minted = mintGrant({
      proposal: proposalForRequest(rec),
      approvedBy: actor,
      nowMs,
      root,
    });
    if (!minted.ok) {
      // Refuse loudly rather than executing unauthorized. self_approval_refused
      // lands here: the provider that asked cannot be the identity that approves.
      appendAudit(rec, "approval_refused", { nowMs, error: minted.error }, root);
      return { ok: false, error: minted.error, request: publicGovernedAction(rec) };
    }
    rec.grant_id = minted.grant.grant_id;
    rec.grant_expires_at = minted.grant.expires_at;
  }
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
  const census = action?.result?.census || {};
  const evidencePath = rec.result_ref
    || action?.result?.evidencePath
    || null;
  const questions = census.questions && typeof census.questions === "object" ? census.questions : null;
  const rowCounts = questions
    ? Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, q?.row_count ?? null]))
    : null;
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
    "Do not retry the census from this lane. Read the result file and continue.",
    rec.run_id ? `When this assignment is finished, report: vac run-status ${rec.run_id} complete --summary "..."${rec.lane_id ? ` --lane ${rec.lane_id}` : ""}` : null,
    "",
    "Bounded result summary:",
    JSON.stringify({
      census_run_at: census.census_run_at || null,
      format: census.format || null,
      org_count: census.org_count ?? null,
      database: census.database || null,
      question_ids: census.question_ids || null,
      question_row_counts: rowCounts,
      keys: Object.keys(census).slice(0, 20),
    }, null, 2),
    "",
    rec.continuation_intent || "Continue the current assignment using this evidence.",
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
  if (resumeImpl) return resumeImpl(requestId, { nowMs, root, actor });
  const rec = getGovernedAction(requestId, root);
  if (!rec || rec.status !== "complete") {
    return { ok: false, error: "request_not_complete" };
  }
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
    title: "Worker resumed",
    body: `Continuing ${rec.lane_id} with governed-action results.`,
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
    const withAction = (r) => (r
      ? {
        ...r,
        governed_action: pub,
        resource_wait: {
          ...(r.resource_wait || {}),
          ...waitProjection(pending),
        },
      }
      : null);
    // AN APPROVAL OUTLIVES THE TURN THAT ASKED FOR IT.
    //
    // A lane whose run has finished has `execution_run: null` — attachLaneRuns
    // only reports a non-terminal run as active. Attaching the pending request
    // to the active run alone left an `awaiting_operator` approval reachable
    // nowhere: Communications filed a merge request for PR #510, closed its
    // turn, and the Director had a decision to make with no card to make it on.
    // The request is the LANE's, so it is attached wherever the lane's run is.
    return {
      ...lane,
      governed_action: pub,
      execution_run: withAction(lane.execution_run),
      previous_run: lane.execution_run ? lane.previous_run : withAction(lane.previous_run),
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

export { publicExecutionRun, redact as redactGovernedSecrets, containsSecret as governedPayloadHasSecrets };
