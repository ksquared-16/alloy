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
import { createHash, randomBytes } from "node:crypto";
import { describeWait } from "./run-wait.mjs";
import { evaluateDirectorAuthority } from "./director-authority.mjs";
import { collectDirectorEvidence } from "./director-evidence.mjs";
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
  grantExactRequestAuthorization,
} from "./trusted-host-authz.mjs";
import {
  fulfillRepositoryPushForMission,
  fulfillClosePullRequestForMission,
  fulfillApplyReconciliationPlanForMission,
  fulfillRetireWorktreeForMission,
  fulfillDeleteRemoteBranchForMission,
  fulfillRestoreQaSessionForMission,
  fulfillProvisionQaIdentityForMission,
  fulfillAssignQaAccessForMission,
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
import { laneSlot, qaIdentityForSlot } from "./browser-auth.mjs";
import {
  consumeGrant,
  getGrant,
  grantIsValidFor,
  mintGrant,
  resolveGovernedAuthoritySync,
} from "./governed-repository-authority.mjs";
import { inspectPullRequest, readMergeInputIdentity } from "./trusted-host-merge.mjs";
import {
  consumeMissionDelegation,
  findCoveringDelegation,
} from "./mission-delegation.mjs";

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

/**
 * THE canonical location of the governed-action request store.
 *
 * Exported because a Director evidence collector hand-joined this path, missed
 * the "vacilando" segment, and read nothing — which surfaced as an UNMEASURED
 * gate and refused a cleanup. A missed file reads as "cannot tell", so that
 * bug wore the costume of caution. Callers ask the owner now.
 */
export function governedActionStorePath(root = runtimeRoot()) {
  return storePath(root);
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

/**
 * Resolve a lane's slot and registered QA identity FOR DISPLAY ONLY.
 *
 * Consults the same registry the executor uses, so the approval names the account it will act on.
 * Never throws: a control that cannot resolve a name must still render, falling back to generic
 * wording rather than breaking the surface the operator approves from.
 */
function resolveSlotIdentityForDisplay(laneId) {
  try {
    if (!laneId) return { identity: null, slot: null };
    const lane = getDurableLane(laneId);
    const slot = lane ? laneSlot(lane) : null;
    if (!Number.isInteger(Number(slot))) return { identity: null, slot: null };
    return { identity: qaIdentityForSlot(Number(slot)) || null, slot: Number(slot) };
  } catch {
    return { identity: null, slot: null };
  }
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
  if (key === ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS) {
    /*
     * Says what access is granted, to whom, and where. "Staging admin" is the whole substance of
     * this approval, so it belongs in the label rather than behind it.
     */
    const lane = inputs.laneId || inputs.lane_id || req.lane_id || "";
    const resolved = resolveSlotIdentityForDisplay(lane);
    const identity = req.registered_identity || resolved.identity || "the slot's registered QA identity";
    const slot = req.slot || resolved.slot || "";
    return {
      approve_label: "Authorize QA access assignment",
      deny_label: "Deny",
      wait_label: "Waiting on Director — QA access assignment",
      mission_need: `Needs approval — Assign staging admin access${slot ? ` for Slot ${slot}` : ""}`,
      detail: `Assign staging admin access to ${identity}${slot ? ` for Slot ${slot}` : ""} in the canonical staging organization · lane ${lane} · one user_roles row · organization derived from existing staging admins, never supplied · no production or customer access`,
    };
  }
  if (key === ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY) {
    /*
     * Names the account being created and the slot it belongs to. Provisioning creates an account;
     * restoring signs into one. Two different decisions, so the words must not be interchangeable.
     */
    const lane = inputs.laneId || inputs.lane_id || req.lane_id || "";
    /*
     * The identity is RESOLVED for display, not read off the request.
     *
     * The request carries only a lane id - deliberately, so a caller cannot name a target - which
     * left the control saying "the slot's registered QA identity". An approval that does not name
     * the account being created is not an informed approval, so the same registry the executor uses
     * is consulted here. It is display only: nothing downstream reads these values.
     */
    const resolved = resolveSlotIdentityForDisplay(lane);
    const identity = req.registered_identity || inputs.registered_identity || resolved.identity || "the slot's registered QA identity";
    const slot = req.slot || inputs.slot || resolved.slot || "";
    return {
      approve_label: "Authorize QA identity provisioning",
      deny_label: "Deny",
      wait_label: "Waiting on Director — QA identity provisioning",
      mission_need: `Needs approval — Provision managed QA identity${slot ? ` for Slot ${slot}` : ""}`,
      detail: `Create the managed, non-production QA account ${identity}${slot ? ` for Slot ${slot}` : ""} in hosted staging · lane ${lane} · no email is sent · no human-managed password is created · creates no browser session`,
    };
  }
  if (key === ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION) {
    /*
     * Without this branch the restore fell through to the census presentation and asked the operator
     * to "Authorize census — Read-only database census · Data mode: Read-only" for an action that
     * mints a Supabase session. Approving one thing while shown another is the specific hazard the
     * subject-matching rules elsewhere in this file exist to prevent, so a privileged action must
     * never inherit another action's words.
     *
     * The label names the identity and the slot, because those are the two facts that decide whether
     * this approval is the right one.
     */
    const lane = inputs.laneId || inputs.lane_id || req.lane_id || "";
    const resolved = resolveSlotIdentityForDisplay(lane);
    const identity = req.registered_identity || inputs.registered_identity || resolved.identity || "the slot's registered QA identity";
    const slot = req.slot || inputs.slot || resolved.slot || "";
    return {
      approve_label: "Authorize QA session restore",
      deny_label: "Deny",
      wait_label: "Waiting on Director — QA session restore",
      mission_need: `Needs approval — Restore QA session${slot ? ` on Slot ${slot}` : ""}`,
      detail: `Restore the browser session for ${identity}${slot ? ` on Slot ${slot}` : ""} · lane ${lane} · single-use magic link minted and redeemed inside the trusted host · no password created or shown`,
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
  if (key === ACTION_TYPES.DATABASE_READ_CENSUS) {
    return {
      approve_label: "Authorize census",
      deny_label: "Deny",
      wait_label: "Waiting on Director",
      mission_need: "Needs approval — read-only census",
      detail: `Read-only database census · Target: ${req.target || DEFAULT_TARGET} · Data mode: Read-only`,
    };
  }
  if (key === ACTION_TYPES.VACILANDO_RETIRE_WORKTREE) {
    const wt = inputs.worktree || inputs.worktree_path || inputs.worktreePath || req.title || "a worktree";
    return {
      approve_label: "Authorize worktree retirement",
      deny_label: "Deny",
      wait_label: "Waiting on Director — worktree retirement",
      mission_need: `Needs approval — Retire ${wt}`,
      detail: `Remove the worktree ${wt} via git worktree remove · no --force · branch is not deleted`,
    };
  }
  /*
   * Census copy used to be the default. Restore, retire, and every new action then asked the
   * operator to "Authorize census" for something that was not a census. A privileged action must
   * never inherit another action's words.
   */
  const title = req.title || key || "governed action";
  return {
    approve_label: "Authorize",
    deny_label: "Deny",
    wait_label: "Waiting on Director",
    mission_need: `Needs approval — ${title}`,
    detail: title,
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
  // THE CARD THE DIRECTOR ACTUALLY READS. These two lines carried the narrow
  // vocabulary, so a merge proposed with `pull_request` / `head_sha` produced a
  // card with no Pull request row and no Head commit row — the two facts that
  // identify what is being merged. Same parser as the grant and the executor.
  const mergeId = mergeIdentityFor(req);
  const sha = String(mergeId.expectedHeadSha || "");
  const number = mergeId.pullRequestNumber;

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
    factRow("Branch", snap?.headRefName ? `${snap.headRefName} → ${mergeId.targetBranch || req.target}` : null),
    factRow("Target branch", mergeId.targetBranch || req.target || null),
    factRow("Head commit", sha ? sha.slice(0, 12) : null),
    factRow("Merge method", mergeId.mergeMethod),
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

/**
 * The canonical identity of WHAT an operator is being asked to approve.
 *
 * A request id is not enough. It names a row; it says nothing about the content
 * that row currently points at. If the branch moves, the commit changes, or the
 * migration set is edited after the approval card is drawn, the id still
 * matches and the operator's tap would approve something they never read.
 *
 * So the decision binds to the content: the action, the normalised environment,
 * the repository, the branch, the source commit, the pull request, and the
 * migration set. Both halves compute it from this one function — the card
 * renders what the server produced, and the server recomputes it at decision
 * time. A fingerprint the client invented would prove nothing.
 */
export function governedContentFingerprint(req) {
  if (!req) return null;
  const inputs = req.inputs || {};
  const migrations = Array.isArray(inputs.migrations)
    ? inputs.migrations.map((m) => (typeof m === "string" ? m : `${m?.version || ""}:${m?.path || m?.migration_path || ""}`)).sort()
    : [];
  // Fields that get a normalisation rule of their own. Everything ELSE in
  // inputs still contributes verbatim below — an allowlist here would mean
  // that for an action whose content lives in an unlisted field (a census IS
  // its query) the fingerprint could not tell two different requests apart,
  // and the protection would be theatre for exactly that action.
  const normalised = new Set([
    "environment", "repository", "branch", "headBranch", "head_branch",
    "expectedHeadSha", "expected_sha", "expectedSha",
    "pullRequestNumber", "pull_request_number", "migrations",
  ]);
  const rest = {};
  for (const key of Object.keys(inputs).sort()) {
    if (normalised.has(key)) continue;
    rest[key] = canonicalForFingerprint(inputs[key]);
  }
  const canonical = JSON.stringify({
    action_key: req.action_key || null,
    // Normalised so `cert` and `certification` cannot read as different
    // content, and `development_certification` cannot read as the same.
    environment: String(inputs.environment || req.target || "").trim().toLowerCase() || null,
    repository: inputs.repository || null,
    branch: inputs.branch || inputs.headBranch || inputs.head_branch || null,
    source_sha: String(inputs.expectedHeadSha || inputs.expected_sha || inputs.expectedSha || "").toLowerCase() || null,
    pull_request: inputs.pullRequestNumber ?? inputs.pull_request_number ?? null,
    migrations,
    rest,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 32);
}

/**
 * Deep key-sorted value, so an object that serialises in a different key order
 * is not mistaken for different content. Array order is PRESERVED — for
 * anything but the migration set, order is meaning.
 */
function canonicalForFingerprint(value) {
  if (Array.isArray(value)) return value.map(canonicalForFingerprint);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonicalForFingerprint(value[k]);
    return out;
  }
  return value ?? null;
}

/**
 * Shared by approve and deny.
 *
 * Deny is checked too, deliberately: denying content the operator did not read
 * is a smaller harm than approving it, but it is still a decision recorded
 * against the wrong thing, and a stale deny would let the real request slip
 * through unnoticed.
 */
export function rejectStaleDecision(rec, expectedFingerprint) {
  if (!expectedFingerprint) return null;
  const current = governedContentFingerprint(rec);
  if (current === expectedFingerprint) return null;
  return {
    ok: false,
    error: "stale_content",
    detail: "The request changed after this approval card was shown. Nothing was approved or denied; review the current request.",
    presented_fingerprint: expectedFingerprint,
    current_fingerprint: current,
    request: publicGovernedAction(rec),
  };
}

/**
 * THE NAME OF THE THING BEING DECIDED.
 *
 * An approval was announced to the operator as "approve gar_4dc7b4d8bcd0e0".
 * Nothing in the UI carried that string, so there was no way to tell which
 * visible item it meant — and a governed action the operator cannot NAME is a
 * governed action the operator cannot find. The request id is diagnostic
 * metadata; it is never the operator's concept of the work.
 *
 * The label answers one question: what am I being asked to approve? It is
 * derived deterministically from canonical inputs, so the same request always
 * produces the same words, and it never falls back to an identifier.
 */
export function operatorLabel(rec) {
  if (!rec) return null;
  const inputs = rec.inputs || {};
  const work = operatorWorkTitle(rec);
  const key = rec.action_key;
  const target = rec.target || DEFAULT_TARGET;
  const pr = inputs.pull_request_number ?? inputs.pullRequestNumber ?? null;
  const branch = inputs.branch || inputs.head_branch || inputs.headBranch || "";

  if (key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    if (work && pr) return `Merge ${work} — PR #${pr}`;
    if (pr) return `Merge PR #${pr} to ${target}`;
    return `Merge pull request to ${target}`;
  }
  if (key === ACTION_TYPES.REPOSITORY_PUSH) {
    if (work) return `Push ${work} branch`;
    return branch ? `Push ${branch}` : "Push a reviewed branch";
  }
  if (key === ACTION_TYPES.PROMOTION_OPEN_PR) {
    const base = inputs.base || target;
    if (work) return `Open PR for ${work}`;
    return branch ? `Open PR ${branch} → ${base}` : `Open promotion PR into ${base}`;
  }
  if (key === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    // Never hardcode a work name here. The label used to read "Apply Access &
    // Identity staging migrations" for EVERY migration set, which named the
    // wrong work for every caller but one.
    const list = Array.isArray(inputs.migrations) ? inputs.migrations : [];
    if (work) return `Apply ${work} migrations`;
    const n = list.length || (inputs.expected_version ? 1 : 0);
    return n
      ? `Apply ${n} ${target} migration${n === 1 ? "" : "s"}`
      : `Apply ${target} migrations`;
  }
  if (key === ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY) {
    const slot = operatorSlotHint(rec);
    return `Provision managed QA identity${slot ? ` for Slot ${slot}` : ""}`;
  }
  if (key === ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS) {
    const slot = operatorSlotHint(rec);
    return `Assign staging admin access${slot ? ` for Slot ${slot}` : ""}`;
  }
  if (key === ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION) {
    const slot = operatorSlotHint(rec);
    return `Restore QA browser session${slot ? ` on Slot ${slot}` : ""}`;
  }
  if (key === ACTION_TYPES.VACILANDO_APPLY_RECONCILIATION_PLAN) {
    const n = Array.isArray(inputs.corrections) ? inputs.corrections.length : 0;
    return n ? `Apply Vacilando reconciliation metadata — ${n} correction${n === 1 ? "" : "s"}` : "Apply Vacilando reconciliation metadata";
  }
  if (key === ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST) {
    const n = inputs.pull_request_number ?? inputs.pullRequestNumber ?? null;
    if (work && n) return `Close ${work} PR #${n}`;
    return n ? `Close pull request #${n}` : "Close a pull request";
  }
  if (key === ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH) {
    const b = inputs.branch || inputs.branchName || "";
    if (work) return `Delete ${work} branch`;
    return b ? `Delete remote branch ${b}` : "Delete a remote branch";
  }
  if (key === ACTION_TYPES.DATABASE_READ_CENSUS) {
    if (work) return `Read-only census — ${work}`;
    return `Read-only database census on ${target}`;
  }
  // An unregistered key still gets words rather than an identifier.
  return work || (key ? String(key).replace(/[._]/g, " ") : "Governed action");
}

/** An explicit human work name, when the caller supplied one. Never invented. */
function operatorWorkTitle(rec) {
  const raw = rec?.work_title || rec?.inputs?.workTitle || rec?.inputs?.work_title || null;
  const t = raw == null ? "" : String(raw).trim();
  return t && t.length <= 80 ? t : null;
}

function operatorSlotHint(rec) {
  const lane = rec?.inputs?.laneId || rec?.inputs?.lane_id || rec?.lane_id || "";
  const resolved = typeof resolveSlotIdentityForDisplay === "function"
    ? resolveSlotIdentityForDisplay(lane)
    : null;
  return rec?.slot || resolved?.slot || "";
}

/**
 * The card, as a hierarchy rather than a sentence: what it is, then why, then
 * the facts, and the request id LAST and small. The order here is the order the
 * operator reads, so presentation cannot drift from the contract.
 */
export function operatorApprovalCard(rec) {
  if (!rec) return null;
  const inputs = rec.inputs || {};
  const presentation = presentationForGovernedAction(rec);
  const context = [];
  const push = (label, value) => { if (value) context.push({ label, value: String(value) }); };
  if (rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) push("Action", `Merge to ${rec.target || DEFAULT_TARGET}`);
  else if (rec.action_key === ACTION_TYPES.REPOSITORY_PUSH) push("Action", "Push to the remote");
  else if (rec.action_key === ACTION_TYPES.PROMOTION_OPEN_PR) push("Action", `Open a pull request into ${inputs.base || rec.target || DEFAULT_TARGET}`);
  else push("Action", rec.target ? `${rec.action_key} · ${rec.target}` : rec.action_key);
  const sha = String(inputs.expectedHeadSha || inputs.expected_head_sha || inputs.expectedSha || "");
  push("Commit", sha ? sha.slice(0, 12) : "");
  push("Branch", inputs.branch || inputs.headBranch || inputs.head_branch || "");
  push("Repository", inputs.repository || "");
  return {
    label: operatorLabel(rec),
    decision: "Approval required",
    context,
    reason: rec.purpose || rec.reason_worker_cannot_execute || null,
    approve_label: presentation.approve_label,
    deny_label: presentation.deny_label,
    // Diagnostic only. Rendered small, beneath the controls, never as the name.
    request_id_debug: `Request ${rec.request_id}`,
  };
}

/**
 * EVERY pending approval on this host, ordered deterministically.
 *
 * The operator should not have to know which lane originated a request. They
 * had no way to reach one at all: the only approval surface lived inside a lane
 * you already had to be looking at.
 *
 * Order: work that is actively blocked first, then oldest, then request id as a
 * final tiebreak so the list never reshuffles between two renders.
 */
export function pendingApprovals({ root = runtimeRoot() } = {}) {
  const rows = listGovernedActions({ root })
    .filter((r) => r && PENDING_GOVERNED_STATUSES.includes(r.status) && r.status !== "executing");
  const blocking = (r) => (r.run_id ? 0 : 1);
  const filedAt = (r) => Date.parse(r.created_at || "") || 0;
  rows.sort((a, b) =>
    blocking(a) - blocking(b)
    || filedAt(a) - filedAt(b)
    || String(a.request_id).localeCompare(String(b.request_id)));
  return rows.map((r) => ({ ...publicGovernedAction(r), operator_card: operatorApprovalCard(r) }));
}

export function publicGovernedAction(req) {
  if (!req) return null;
  const presentation = presentationForGovernedAction(req);
  return {
    request_id: req.request_id,
    // The identity the operator is actually deciding about. The card renders
    // this and hands it back; the server recomputes and compares.
    content_fingerprint: governedContentFingerprint(req),
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
    // The operator's name for this decision. The id is diagnostic only.
    operator_label: operatorLabel(req),
    operator_card: operatorApprovalCard(req),
    director_approval: req.director_approval || null,
    director_decision: req.director_decision || null,
    escalation_reason: req.escalation_reason || null,
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

/**
 * The most recently RESOLVED governed action for a lane.
 *
 * The approval card exists only while a request is PENDING, so the moment a
 * Director approves, it disappears — identically whether the action succeeded
 * or failed. Hiding a resolved card was the right fix for a stale button; it
 * still leaves the operator with silence. "Unsure if the authorize push click
 * actually worked" is the consequence, and the answer was in the record the
 * whole time.
 */
export function lastResolvedGovernedActionForLane(laneId, root = runtimeRoot()) {
  if (!laneId) return null;
  const lane = canonicalLaneStoreId(laneId, root);
  const resolved = listGovernedActions({ laneId: lane, root })
    .filter((r) => r.status === "complete" || r.status === "failed");
  if (!resolved.length) return null;
  return resolved.sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0))[0];
}

/**
 * What actually happened, in the terms the operator asked in.
 *
 * Read from the trusted-host RESULT rather than restating the request, because
 * the question is never "what did I ask for" — it is "did it land". Bounded, and
 * it names only identifiers that are already public.
 */
export function governedOutcomeFor(req) {
  if (!req || (req.status !== "complete" && req.status !== "failed")) return null;
  const ok = req.status === "complete";
  const r = req.result || {};
  let detail = null;
  if (ok) {
    if (req.action_key === ACTION_TYPES.REPOSITORY_PUSH && r.pushedSha) {
      detail = `${r.branch || "branch"} is on the remote at ${String(r.pushedSha).slice(0, 12)}${r.idempotent ? " (already there)" : ""}`;
    } else if (req.action_key === ACTION_TYPES.PROMOTION_OPEN_PR && r.pullRequestNumber) {
      detail = `pull request #${r.pullRequestNumber} into ${r.base || "staging"}${r.reused ? " (already open)" : ""}`;
    } else if (req.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST && (r.merge_sha || r.mergeSha)) {
      detail = `merged as ${String(r.merge_sha || r.mergeSha).slice(0, 12)}`;
    }
  }
  return {
    ok,
    action_key: req.action_key,
    title: req.title || req.action_key,
    at: req.updated_at || null,
    approved_by: req.operator_approval?.actor || null,
    detail: detail || (ok ? "completed" : bound(req.failure_reason || req.failure_code, 240)),
    failure_code: ok ? null : (req.failure_code || null),
  };
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
    // Inspectable authority: what the mission delegated, and the Director's own
    // sentence that delegated it. Present only when delegation supplied the
    // approval; `delegation_declined` says why it did not when it could have.
    mission_delegation: rec.mission_delegation || null,
    delegation_declined: rec.delegation_declined || null,
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

function waitProjection(rec, { nowMs } = {}) {
  const presentation = presentationForGovernedAction(rec);
  // A GOVERNED WAIT IS AN S6 WAIT, NOT A CAPTION.
  //
  // This used to return presentation fields only — resource_key, label,
  // summary — with no schema, reason, owner, waiting_since, deadline or bound
  // policy. describeWait() answers a missing reason with bound_policy
  // "invalid", which is exactly how health came to report
  // "Waiting on Director — staging merge" as an unowned wait nothing could
  // resolve. The text was never the problem; the missing envelope was.
  //
  // The reason is needs_operator_input because that is what this IS: a
  // question for a person. Its policy is human_indefinite, so it has no
  // deadline BY DESIGN and must never be counted stale for waiting.
  const descriptor = describeWait({
    reason: "needs_operator_input",
    resource_id: rec.request_id,
    waiting_since: nowMs ?? Date.now(),
    now: nowMs ?? Date.now(),
  });
  return {
    ...descriptor,
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
  const wait = waitProjection(rec, { nowMs });
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

/**
 * THE ONE PLACE THAT SAYS WHERE A GOVERNED ACTION RUNS.
 *
 * THE DEFECT THIS REMOVES. `repository.push` advertises `worktreePath` among
 * its inputs, and the registry's own validateInputs reads
 * `inputs.worktree_path || inputs.worktreePath`. This resolver did not: it read
 * only the TOP-LEVEL payload and then fell through to the run's bound worktree.
 * The request record's worktree_path therefore won, and the action was built
 * with it — overwriting inputs.worktreePath entirely.
 *
 * MEASURED: gar_1e5d2e1dab9f7e supplied inputs.worktreePath = the promotion
 * worktree at d9beb0c29, was executed against the lane's worktree at
 * 033d76bd7c4d, and was refused `head_drift` — "the branch moved after this
 * push was proposed" — for a branch that never moved. Re-proposing the
 * identical push with a TOP-LEVEL worktree_path succeeded immediately against
 * the same branch and the same SHA. The caller had followed the advertised
 * schema and the reader could not see it.
 *
 * An EXPLICIT path now always beats the run-bound fallback, whichever of the
 * two advertised locations it arrives in. The fallback is unchanged and still
 * serves every request that supplies no path at all.
 */
function resolveWorktreePath(input, laneId, run, root) {
  const inputs = input?.inputs || {};
  return input.worktree_path
    || input.worktreePath
    // The location the registered action schema actually advertises.
    || inputs.worktree_path
    || inputs.worktreePath
    || run?.worktree_path
    || getDurableLane(laneId, root)?.binding?.worktree_path
    || null;
}

/**
 * Strip anything that looks like an arbitrary payload.
 *
 * `body` is on the blanket reject list because it is how a SQL or HTTP payload
 * would arrive. A promotion pull request legitimately HAS a body — its
 * description — so the exception is granted to that one action and nowhere
 * else, and the text is still bounded and secret-scanned by
 * validateOpenPrInputs before it reaches GitHub. Widening the blanket rule for
 * everyone would have been the easy fix and the wrong one.
 */
function sanitizeActionInputs(raw, actionKey = null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const bodyAllowed = actionKey === ACTION_TYPES.PROMOTION_OPEN_PR;
  if (raw.sql || raw.statement || (raw.body && !bodyAllowed)
    || raw.database_url || raw.databaseUrl || raw.token || raw.argv || raw.shell) {
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
  /*
   * A privileged_write action must not inherit the read_only default. `validateAgainstRegistry`
   * refuses any non-read risk class in read_only mode, so an action added to the registry without
   * a mode here is registered, discoverable, proposable — and then denied with `policy_denied`,
   * which reads as "the operator's policy forbids this" rather than "nobody assigned it a mode".
   * That cost a full delivery cycle to diagnose once; the fallthrough is the hazard, not this line.
   */
  // "other" is the existing GOVERNED_MODES member for a privileged action that is neither a
  // promotion nor a migration. Inventing a mode name instead fails `invalid_mode`, and widening the
  // enum would add governance vocabulary for one action that already has a home.
  if (actionKey === ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION) return "other";
  if (actionKey === ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY) return "other";
  if (actionKey === ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS) return "other";
  if (actionKey === ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST) return "other";
  if (actionKey === ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH) return "other";
  if (actionKey === ACTION_TYPES.VACILANDO_APPLY_RECONCILIATION_PLAN) return "other";
  if (actionKey === ACTION_TYPES.VACILANDO_RETIRE_WORKTREE) return "other";
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
  const inputs = sanitizeActionInputs(input.inputs || {}, actionKey);
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
    // SEMANTICS UNCHANGED, VOCABULARY SHARED. A merge authorization is still
    // keyed on the head SHA alone, so an approval still stops applying the
    // moment the branch moves. What changes is only that every spelling of that
    // SHA now resolves to the same value, so `head_sha` no longer produces a
    // different hash from `expected_head_sha` for the same commit.
    return mergeIdentityFor(rec).expectedHeadSha;
  }
  if (rec?.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    return rec.inputs?.expected_sha || rec.inputs?.expectedSha || rec.inputs?.dedupeKey || rec.inputs?.dedupe_key || null;
  }
  return null;
}

/**
 * CAN THE MISSION'S OWN WORDS SATISFY THIS APPROVAL?
 *
 * Called ONLY where the ordinary evaluation has already concluded that a live
 * operator approval would be required. It can therefore never widen anything:
 * the worst it can do is decline, leaving the behaviour exactly as it was.
 *
 * It answers with the CONCRETE request in hand — repository, PR, head SHA,
 * target, method, check state, and whether reconciliation found unrelated
 * commits — so an intent captured at orientation is only spent on an execution
 * proven to be inside it. The identity comes from the shared parsers, never
 * re-derived here.
 *
 * A match does not execute anything and does not bypass the grant: the request
 * still travels the normal governed path and the trusted host still validates
 * its own PR/SHA/target/method binding.
 */
function missionDelegationDecision(rec, { nowMs, evidence = null } = {}) {
  const actionKey = rec?.action_key;
  const identity = readMergeInputIdentity(rec?.inputs || {});
  const inputs = rec?.inputs || {};
  const repository = inputs.repository || inputs.repo || null;
  if (!repository) return { ok: false, error: "no_repository" };

  // Checks. `true` only when observed green; unknown is NOT green, because a
  // card that has not looked must never read as "fine".
  let checksGreen = null;
  const snapChecks = rec?.proposal_snapshot?.checks || null;
  if (snapChecks) {
    checksGreen = (snapChecks.failing || []).length === 0
      && (snapChecks.pending || []).length === 0
      && (snapChecks.unknown || []).length === 0;
  } else if (inputs.required_checks_green === true || inputs.requiredChecksGreen === true) {
    checksGreen = true;
  }

  // Unrelated content found during reconciliation disqualifies delegated
  // authority outright: a mission that delegated ITS work never delegated
  // whatever else landed on the branch.
  const changed = Array.isArray(evidence?.unrelated_commits)
    ? evidence.unrelated_commits.length
    : Number(inputs.unrelated_commits || 0);

  const targetBranch = actionKey === ACTION_TYPES.PROMOTION_OPEN_PR
    ? (inputs.base || inputs.baseBranch || rec.target)
    : (identity.targetBranch || inputs.target_branch || inputs.targetBranch || rec.target);

  return findCoveringDelegation({
    missionId: rec.mission_id || null,
    laneId: rec.lane_id || null,
    actionKey,
    repository,
    targetBranch,
    branch: inputs.branch || inputs.headBranch || inputs.head_branch || null,
    mergeMethod: actionKey === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST ? identity.mergeMethod : null,
    checksGreen,
    unrelatedCommits: changed,
  }, { root: runtimeRoot(), nowMs });
}

/**
 * Wrap a decision that would require a live click. Returns the delegated
 * decision when the mission already authorised exactly this, and the original
 * decision otherwise — including the reason it did NOT apply, so the approval
 * card can explain why it is still asking.
 */
function withMissionDelegation(rec, decision, { nowMs, evidence = null } = {}) {
  if (!decision?.operator_approval_required) return decision;
  let out;
  try {
    out = missionDelegationDecision(rec, { nowMs, evidence });
  } catch (e) {
    // A broken delegation path must never approve. Fall through to the operator.
    return { ...decision, delegation_error: String(e?.message || e) };
  }
  if (!out?.ok) {
    return { ...decision, delegation_declined: out?.error || "no_delegation" };
  }
  return {
    auto_execute: true,
    operator_approval_required: false,
    reason: "mission_delegation",
    authorized_by: "mission_delegation",
    delegation_id: out.delegation.delegation_id,
    delegation_mission_clause: out.delegation.mission_clause,
    delegation_action_key: out.delegation.action_key,
    delegation_target_branch: out.delegation.target_branch,
  };
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
  // DELEGATED GOVERNANCE. The Director may decide only what an explicit
  // policy covers, on evidence gathered from sources the worker does not
  // control. Anything unmatched, unmeasured or consequential falls through to
  // the operator below — this can only ever produce MORE escalations than the
  // policy set allows, never fewer.
  try {
    const evidence = collectDirectorEvidence(rec, {
      stateRoot: runtimeRoot(),
      worktree: rec.worktree_path || null,
    });
    if (Array.isArray(evidence.changed_files) && evidence.changed_files.length) {
      // Let a governance-policy edit be SEEN rather than declared.
      rec = { ...rec, inputs: { ...(rec.inputs || {}), changed_files: evidence.changed_files } };
    }
    const verdict = evaluateDirectorAuthority({
      request: { ...rec, content_fingerprint: governedContentFingerprint(rec) },
      evidence,
      nowMs: nowMs ?? Date.now(),
    });
    if (verdict.decision === "director_approved") {
      return {
        auto_execute: true,
        operator_approval_required: false,
        reason: "director_approved",
        director_decision: verdict,
      };
    }
    if (verdict.decision === "policy_denied") {
      return withMissionDelegation(rec, {
        auto_execute: false,
        operator_approval_required: true,
        reason: "policy_denied_requires_operator",
        director_decision: verdict,
      }, { nowMs, evidence });
    }
    return withMissionDelegation(rec, {
      auto_execute: false,
      operator_approval_required: true,
      reason: "policy_default_requires_operator",
      director_decision: verdict,
    }, { nowMs, evidence });
  } catch {
    // A broken evaluator must never approve. Fall through to the operator.
  }
  return withMissionDelegation(rec, {
    auto_execute: false,
    operator_approval_required: true,
    reason: "policy_default_requires_operator",
  }, { nowMs });
}

function requestTitle(rec) {
  if (rec.action_key === ACTION_TYPES.DATABASE_READ_CENSUS) {
    return "Read-only database census";
  }
  if (rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    const id = mergeIdentityFor(rec);
    const into = id.targetBranch || rec.target || "staging";
    return id.pullRequestNumber
      ? `Merge PR #${id.pullRequestNumber} into ${into}`
      : "Merge pull request into staging";
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
  // AN ABBREVIATED SHA CANNOT BE APPROVED INTO ANYTHING.
  //
  // A merge was requested with expectedHeadSha "d40f469b4". The operator pressed
  // Approve three times; every attempt died inside GitHub with "Could not coerce
  // value to GitObjectID", and because a failed request leaves the pending list,
  // the operator was left hunting for a request that no longer appeared anywhere.
  // Asking a human to authorize something that cannot possibly succeed is the
  // defect — so the request is refused HERE, when the worker files it, rather
  // than after a decision has been spent on it.
  const shaInput = input.inputs || input.input || {};
  const declaredSha = shaInput.expectedHeadSha || shaInput.expected_head_sha || shaInput.expectedSha || shaInput.expected_sha || null;
  if (declaredSha != null && String(declaredSha).trim() !== "") {
    const sha = String(declaredSha).trim();
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      return {
        ok: false,
        error: "abbreviated_source_sha",
        failure_code: "invalid_request_inputs",
        detail: `expectedHeadSha must be the full 40-character commit SHA; received "${sha}" (${sha.length} characters). An abbreviated SHA is ambiguous and is rejected by the merge API, so it can never be approved.`,
      };
    }
  }

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

/**
 * What a Decision is ABOUT, as a comparable key.
 *
 * A Decision for a merge is not a standing permission to merge; it names one
 * pull request at one head SHA. Reuse therefore has to be scoped to the
 * subject, not merely to the action type — see openApprovalDecision.
 *
 * Returns null when the action has no identifiable subject, and a null subject
 * never matches another null: unknown is not the same as equal.
 */
export function governedActionSubjectKey(rec) {
  if (!rec) return null;
  const inputs = rec.inputs || {};
  if (rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    const n = inputs.pull_request_number ?? inputs.pullRequestNumber ?? null;
    const sha = String(inputs.expected_head_sha || inputs.expectedHeadSha || "").toLowerCase();
    if (n == null) return null;
    return `merge:#${n}@${sha.slice(0, 40)}`;
  }
  if (rec.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    const versions = Array.isArray(inputs.migrations)
      ? inputs.migrations.map((m) => String(m?.version || m)).filter(Boolean).sort()
      : [];
    if (!versions.length) return null;
    return `migration:${versions.join(",")}`;
  }
  if (rec.action_key === ACTION_TYPES.DATABASE_READ_CENSUS) {
    const artifact = artifactPathFrom(rec.artifact_refs) || "";
    if (!rec.target) return null;
    return `census:${rec.target}:${artifact.split("/").pop()}`;
  }
  return null;
}

/**
 * The subject an EXISTING decision was opened for.
 *
 * Prefers the structured marker written below. Decisions created before that
 * marker existed are read from the situation text this same function composes,
 * so an already-open decision is still matched correctly rather than being
 * treated as subject-less and reused for anything.
 */
export function decisionSubjectKey(decision) {
  if (!decision) return null;
  const marked = (Array.isArray(decision.evidence) ? decision.evidence : [])
    .find((e) => e && typeof e === "object" && e.governed_action_subject);
  if (marked) return String(marked.governed_action_subject);

  const text = String(decision.situation || "");
  const pr = text.match(/^PR: #(\d+)\s*$/m);
  if (pr) {
    const sha = text.match(/^Expected SHA: ([0-9a-fA-F]{7,40})\s*$/m);
    return `merge:#${pr[1]}@${String(sha ? sha[1] : "").toLowerCase()}`;
  }
  return null;
}

/**
 * Evidence plus a structural record of what this decision is about, so matching
 * never has to depend on parsing the prose above it.
 */
function decisionEvidenceWithSubject(rec) {
  const base = Array.isArray(rec?.artifact_refs) ? rec.artifact_refs.slice() : [];
  const subject = governedActionSubjectKey(rec);
  if (!subject) return base;
  base.push({
    governed_action_subject: subject,
    action_key: rec.action_key,
    request_id: rec.request_id,
  });
  return base;
}

function subjectsMatch(decision, rec) {
  const want = governedActionSubjectKey(rec);
  const have = decisionSubjectKey(decision);
  // Unknown on either side is not a match. Reusing a decision whose subject we
  // cannot read is exactly the failure this guards against.
  return Boolean(want) && Boolean(have) && want === have;
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
  // A DECISION IS ABOUT A SUBJECT, NOT ABOUT A CAPABILITY.
  //
  // This used to reuse any open decision of the right action type. Within one
  // mission that meant a second merge request adopted the first one's decision:
  // PR #531 bound itself to the open decision titled "Merge PR #529", and #529
  // was already merged. The Director was shown an approval labelled for a
  // finished PR, approving it could not produce the #531 merge, and the stale
  // request sat on the shared decision indefinitely. Three approvals failed to
  // land that way.
  //
  // Reuse now requires the same subject — same PR at the same head SHA, same
  // migration set, same census artifact. A different SHA is a different
  // decision, exactly as the single-use grant already treats it.
  const open = listDecisions(rec.mission_id, { status: "open" })
    .find((d) => {
      const typeMatches = isCensus
        ? d.defaultAction === "approve_governed_census" || /census/i.test(d.title || "")
        : rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST
          ? d.defaultAction === "approve_governed_merge" || /merge pr/i.test(d.title || "")
          : rec.action_key === ACTION_TYPES.DATABASE_APPLY_MIGRATION
            ? d.defaultAction === "approve_governed_migration" || /staging migration/i.test(d.title || "")
            : d.title === rec.title;
      if (!typeMatches) return false;
      return subjectsMatch(d, rec);
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
      evidence: decisionEvidenceWithSubject(rec),
    });
    rec.decision_id = decision.decisionId;
    emitNotification("governed_action_approval_required", rec, {
      title: "Needs approval — read-only census",
      body: `${rec.title} against ${rec.target}`,
      root,
    });
    return decision;
  }

  // THE APPROVAL CARD SHOWS WHAT WILL ACTUALLY BE MERGED.
  //
  // This read the narrow vocabulary, so a merge proposed with `pull_request`
  // rendered "PR: #" with nothing after it. The Director would then be asked to
  // authorise a privileged staging merge whose PR number, the core identity of
  // the decision, was simply missing from the card. It is the same parser the
  // grant is pinned to, so the card and the grant cannot disagree.
  const mergeId = mergeIdentityFor(rec);
  const n = mergeId.pullRequestNumber;
  const versions = Array.isArray(rec.inputs?.migrations)
    ? rec.inputs.migrations.map((m) => m.version || m).join("\n")
    : "";
  const isMerge = rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST;
  const repository = String(rec.inputs?.repository || rec.inputs?.repo || "").trim();
  // Shown as its own lines so the operator reads the full merge identity —
  // repository, PR, expected SHA, target branch and merge method — rather than
  // inferring it from a title.
  const mergeIdentityLines = isMerge
    ? [
      repository ? `Repository: ${repository}` : null,
      `PR: #${n ?? "unknown"}`,
      `Expected SHA: ${mergeId.expectedHeadSha || "unknown"}`,
      `Target branch: ${mergeId.targetBranch || rec.target || "staging"}`,
      `Merge method: ${mergeId.mergeMethod}`,
    ].filter(Boolean).join("\n")
    : "Migrations:";
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
      mergeIdentityLines,
      isMerge ? "" : versions,
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
    evidence: decisionEvidenceWithSubject(rec),
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
/**
 * THE MERGE IDENTITY OF A REQUEST, FROM THE ONE PARSER THAT OWNS IT.
 *
 * Grant issuance and trusted execution were converged onto
 * readMergeInputIdentity. Three consumers were not: actionQueryHash,
 * requestTitle and openApprovalDecision each kept the older, narrower
 * vocabulary. Execution was safe, but the OPERATOR CARD was not: a merge
 * proposed with `pull_request` rendered "PR: #" — the Director could be asked
 * to authorise a privileged merge whose core identity was blank.
 *
 * Every consumer now reads through here, so the approval display, the grant and
 * the executor cannot describe different merges.
 */
function mergeIdentityFor(rec) {
  return readMergeInputIdentity(rec?.inputs || {});
}

function proposalForRequest(rec) {
  const mergeIdentity = mergeIdentityFor(rec);
  return {
    proposal_id: rec.request_id,
    action_key: rec.action_key,
    repository_id: rec.authority?.repository_id || null,
    // Read through the SAME normalizer the executor uses. These two lines used
    // to carry their own shorter spelling list, so a lane that wrote
    // `pull_request` / `head_sha` — spellings the executor resolves fine — got a
    // grant pinned to null and a `grant_pull_request_mismatch` it could never
    // satisfy. See readMergeInputIdentity for the measured incident.
    pull_request_number: mergeIdentity.pullRequestNumber,
    expected_head_sha: mergeIdentity.expectedHeadSha,
    // Normalized the way validateMergeInputs will normalize them, so the grant
    // pins the values the action is actually built from. Comparing an unset
    // merge_method against the action's defaulted "merge" would make every
    // grant look stale.
    target_branch: mergeIdentity.targetBranch || rec.target || "staging",
    merge_method: mergeIdentity.mergeMethod,
    // Present for a push or a promotion; null for a merge, whose identity is
    // the pull request number rather than a branch name.
    branch: rec.inputs?.branch || rec.inputs?.head_branch || rec.inputs?.headBranch || null,
    run_id: rec.run_id || null,
    lane_id: rec.lane_id || null,
    requested_by: rec.requesting_worker || null,
  };
}

/**
 * A repository-authorized request needs a live grant at execute time.
 *
 * Approval mints one. Execution used to bounce `authorization_required` without presenting it,
 * which left `awaiting_operator` with `operator_approval` already set — the UI then hid the
 * button, so a second click was impossible. If that grant later expired, remint against the
 * same proposal rather than asking the operator to decide again.
 */
function ensureRepositoryGrant(rec, { actor, nowMs, root } = {}) {
  if (rec.mission_id) return { ok: true };
  const proposal = proposalForRequest(rec);
  const existing = rec.grant_id ? getGrant(rec.grant_id, root) : null;
  if (existing && grantIsValidFor(existing, proposal, { nowMs }).ok) return { ok: true, grant: existing };
  const minted = mintGrant({
    proposal,
    approvedBy: actor || rec.operator_approval?.actor || "operator",
    nowMs,
    root,
  });
  if (!minted.ok) return minted;
  rec.grant_id = minted.grant.grant_id;
  rec.grant_expires_at = minted.grant.expires_at;
  rec.updated_at = iso(nowMs);
  saveRequest(rec, root);
  return { ok: true, grant: minted.grant, reminted: true };
}

function defaultExecute(rec, { nowMs, actor, root } = {}) {
  const scope = authorityScopeFor(rec);
  // Director-derived authority for THIS exact request, if any was minted.
  const authorizationId = rec.director_approval?.authorization_id || null;
  const exactContext = authorizationId ? {
    requestId: rec.request_id,
    contentFingerprint: rec.director_approval?.content_fingerprint || null,
    environment: rec.director_decision?.environment || null,
    repository: rec.inputs?.repository || null,
    // A merge's SHA comes from the shared parser, which also knows `head_sha`.
    // Without it a merge proposed that way carried a null sourceSha into the
    // authorization context — not a security hole (a null never matches, so it
    // escalates rather than over-authorises) but the same silent substitution:
    // the caller supplied the SHA and the reader could not see it.
    sourceSha: (rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST
      ? mergeIdentityFor(rec).expectedHeadSha
      : null)
      || rec.inputs?.expectedHeadSha || rec.inputs?.expected_head_sha || rec.inputs?.expectedSha || null,
  } : null;
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
      authorizationId,
      exactContext,
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
      authorizationId,
      exactContext,
    });
  }
  if (rec.action_key === ACTION_TYPES.VACILANDO_RETIRE_WORKTREE) {
    return fulfillRetireWorktreeForMission(scope, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      // The REQUESTING worktree comes from the record, never from inputs — a
      // worker that could name its own requester could name someone else's and
      // retire the tree it is running in.
      inputs: { ...(rec.inputs || {}), requestingWorktree: rec.worktree_path || null },
      actor,
      nowMs,
      grant,
      authorizationId,
      exactContext,
    });
  }
  if (rec.action_key === ACTION_TYPES.VACILANDO_APPLY_RECONCILIATION_PLAN) {
    return fulfillApplyReconciliationPlanForMission(scope, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: rec.inputs || {},
      actor,
      nowMs,
      grant,
      authorizationId,
      exactContext,
    });
  }
  if (rec.action_key === ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST) {
    return fulfillClosePullRequestForMission(scope, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: rec.inputs || {},
      actor,
      nowMs,
      grant,
      authorizationId,
      exactContext,
    });
  }
  if (rec.action_key === ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH) {
    return fulfillDeleteRemoteBranchForMission(scope, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: rec.inputs || {},
      actor,
      nowMs,
      grant,
      authorizationId,
      exactContext,
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
      authorizationId,
      exactContext,
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
      authorizationId,
      exactContext,
    });
  }
  if (rec.action_key === ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS) {
    return fulfillAssignQaAccessForMission(scope, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: { ...(rec.inputs || {}), worktree_path: rec.worktree_path, worktreePath: rec.worktree_path },
      actor,
      nowMs,
      grant,
      authorizationId,
      exactContext,
    });
  }
  if (rec.action_key === ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY) {
    return fulfillProvisionQaIdentityForMission(scope, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: { ...(rec.inputs || {}), worktree_path: rec.worktree_path, worktreePath: rec.worktree_path },
      actor,
      nowMs,
      grant,
      authorizationId,
      exactContext,
    });
  }
  if (rec.action_key === ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION) {
    return fulfillRestoreQaSessionForMission(scope, {
      assignmentId: rec.run_id || null,
      executionSessionId: rec.run_id || null,
      inputs: { ...(rec.inputs || {}), worktree_path: rec.worktree_path, worktreePath: rec.worktree_path },
      actor,
      nowMs,
      grant,
      authorizationId,
      exactContext,
    });
  }
  /*
   * Anything without a branch above lands here. That fallthrough is why a registered, mode-mapped,
   * operator-APPROVED restore still failed `action_unavailable`: the action existed everywhere
   * except in this dispatch, and the error names the registry rather than the missing branch.
   */
  if (rec.action_key !== ACTION_TYPES.DATABASE_READ_CENSUS) {
    return { ok: false, error: "action_unavailable" };
  }
  // THE LIVE DEFECT. Every other fulfill*ForMission call below presents the grant and
  // Director authorization. Census did not. A repository-authorized census therefore
  // bounced `authorization_required` on every approval: the operator's click minted a
  // grant, execution never saw it, and the request returned to awaiting_operator with
  // operator_approval already recorded. The UI then hid the button.
  return fulfillDatabaseCensusForMission(scope, {
    assignmentId: rec.run_id || null,
    executionSessionId: rec.run_id || null,
    queryArtifactPath: artifactPathFrom(rec.artifact_refs),
    worktreePath: rec.worktree_path,
    actor,
    nowMs,
    grant,
    authorizationId,
    exactContext,
  });
}

function applyExecuteResult(rec, out, { nowMs, root, actor } = {}) {
  if (out?.error === "authorization_required") {
    // The operator already decided. Bouncing here hid the button (laneAwaitingOperatorApproval
    // skips any record with operator_approval) and left the census card stuck. Fail so the
    // refusal is visible; tick recovery is for the already-stuck records, not a new loop.
    if (rec.operator_approval?.decision === "approved") {
      const refused = out.action?.grantRefusal || out.error;
      return failRequest(
        rec,
        "authorization_required",
        `Operator approved, but the trusted host still refused (${refused}).`,
        { nowMs, root },
      );
    }
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
  // A RESOLVED WAIT IS NOT A LIVE WAIT. The failure path already released the
  // run; success did not, so a completed governed action left "Waiting on
  // Director" sitting on the record as though it were still true. Seventeen
  // terminal runs were carrying wait text for work that had long since landed.
  if (rec.run_id) {
    try { patchRunResourceWait(rec.run_id, null, root); } catch { /* the run may be gone */ }
  }
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
    // THE LIVE DEFECT, SECOND HALF. Approval records operator_approval and then executes.
    // If execution bounced, status stayed awaiting_operator with a decision already made.
    // Tick ignored that status, and the UI hid the button. Resume execution; do not re-ask.
    if (rec.operator_approval?.decision === "approved") {
      if (!getActionDefinition(rec.action_key)) {
        attachRunWait(rec, { nowMs, root });
        return { ok: true, request: publicGovernedAction(rec), awaiting_operator: true };
      }
      // Census is the live bounce: execution never saw the grant, the button hid, and
      // tick ignored awaiting_operator. Resume that. Do not silently execute a
      // destructive already-approved action (worktree retirement) that may have
      // inherited the census button label.
      if (rec.action_key !== ACTION_TYPES.DATABASE_READ_CENSUS) {
        attachRunWait(rec, { nowMs, root });
        return { ok: true, request: publicGovernedAction(rec), awaiting_operator: true };
      }
      const grant = ensureRepositoryGrant(rec, {
        actor: rec.operator_approval.actor || actor,
        nowMs,
        root,
      });
      if (!grant.ok) {
        return failRequest(rec, grant.error || "grant_missing", grant.error || "Could not remint the operator grant.", { nowMs, root });
      }
      return executeGovernedAction(rec.request_id, { nowMs, root, actor });
    }
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
  // WHY VACILANDO DID NOT ASK, RECORDED WHERE THE OPERATOR CAN READ IT.
  //
  // A delegated authorisation is spent HERE, at the moment it satisfies this
  // one request, so it can never be replayed for another PR or another head.
  // The mission's own words travel with it: the operator inspects the sentence
  // the Director actually wrote, not the runtime's paraphrase of it.
  if (policy.authorized_by === "mission_delegation" && policy.delegation_id) {
    const spent = consumeMissionDelegation(policy.delegation_id, {
      requestId: rec.request_id,
      nowMs,
      root: runtimeRoot(),
    });
    if (!spent.ok) {
      // The delegation went away between the decision and here. Fail closed:
      // the operator is asked, exactly as they would have been without it.
      rec.policy_decision = "policy_default_requires_operator";
      rec.operator_approval_required = true;
      rec.delegation_declined = spent.error;
    } else {
      rec.mission_delegation = {
        delegation_id: policy.delegation_id,
        action_key: policy.delegation_action_key,
        target_branch: policy.delegation_target_branch,
        mission_clause: policy.delegation_mission_clause,
        authorized_by: "mission_delegation",
        at: iso(nowMs),
      };
    }
  } else if (policy.delegation_declined) {
    // Say why the mission did NOT cover this, so "it asked me again" has an
    // answer that is not "unknown".
    rec.delegation_declined = policy.delegation_declined;
  }
  // A DIRECTOR APPROVAL IS NEVER DRESSED UP AS THE OPERATOR'S. It is recorded
  // in its own field, naming the policy and the evidence that authorised it,
  // so the ledger can always answer WHO decided and on what grounds. The
  // escalation verdict is kept too, so an approval that reached the operator
  // can say why it had to.
  if (policy.director_decision) {
    rec.director_decision = policy.director_decision;
    if (policy.director_decision.decision === "director_approved") {
      rec.director_approval = {
        decision: "approved",
        actor: "director",
        policy: policy.director_decision.matched_policy,
        policy_version: policy.director_decision.policy_version,
        content_fingerprint: policy.director_decision.content_fingerprint,
        at: policy.director_decision.evaluated_at,
      };
      // THE DECISION IS FINAL, SO EXECUTION AUTHORITY MAY NOW BE DERIVED.
      //
      // V1 authorised the decision and not the execution, so a Director-
      // approved push still stopped at the trusted host and interrupted the
      // operator anyway. This mints authority for ONE exact content identity:
      // request id, content fingerprint, action, normalised environment,
      // repository, source SHA and deciding policy. It expires, it is refused
      // outright for operator-only environments, and it is VERIFIED again at
      // the execution boundary rather than merely presented.
      const dInputs = rec.inputs || {};
      const dGranted = grantExactRequestAuthorization({
        missionId: rec.mission_id,
        requestId: rec.request_id,
        contentFingerprint: policy.director_decision.content_fingerprint,
        actionType: rec.action_key,
        environment: policy.director_decision.environment,
        repository: dInputs.repository || null,
        sourceSha: dInputs.expectedHeadSha || dInputs.expected_head_sha || dInputs.expectedSha || null,
        decisionId: rec.decision_id || null,
        decisionActor: "director",
        policyId: policy.director_decision.matched_policy,
        policyVersion: policy.director_decision.policy_version,
        nowMs: nowMs ?? Date.now(),
      });
      if (dGranted && dGranted.ok && dGranted.authorization) {
        rec.director_approval.authorization_id = dGranted.authorization.authorizationId;
      } else if (dGranted && dGranted.error) {
        // Failing to derive authority is the safe direction: the action simply
        // escalates at the execution boundary, exactly as it did before.
        rec.director_approval.authorization_error = dGranted.error;
      }
    } else {
      rec.escalation_reason = policy.director_decision.escalation_reason || null;
    }
  }
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

/**
 * Repair approval records that reality or a mislabelled decision has stranded.
 *
 * TWO THINGS STRAND A GOVERNED MERGE.
 *
 * The first is that the merge already happened. A request pinned to a PR that
 * is now merged at the expected head has nothing left to authorize — the state
 * the Director would be approving already exists. Leaving it `awaiting_operator`
 * is not caution, it is a queue entry that can never be satisfied, and while it
 * shares a decision it blocks the requests behind it. It is resolved here as
 * complete/idempotent, WITHOUT minting a grant: no privileged mutation is
 * performed, so no authorization is created.
 *
 * The second is a decision that names a different subject, from the reuse bug
 * openApprovalDecision now prevents. Records already written that way are
 * detached and given a decision that names what they actually are.
 *
 * Deliberately NOT done here: denying anything. A merge that already landed is
 * satisfied, not refused, and recording it as denied would be false.
 */
export async function reconcileGovernedApprovals({
  root = runtimeRoot(),
  nowMs = Date.now(),
  inspect = null,
  laneId = null,
} = {}) {
  const store = readGovernedActionStore(root);
  const pending = store.requests.filter((r) => {
    if (r.status !== "awaiting_operator" && r.status !== "awaiting_director") return false;
    if (laneId && canonicalLaneStoreId(r.lane_id, root) !== canonicalLaneStoreId(laneId, root)) return false;
    return true;
  });

  const satisfied = [];
  const rebound = [];
  const unchanged = [];

  let inspectFn = inspect;
  if (!inspectFn) {
    const mod = await import("./trusted-host-merge.mjs");
    inspectFn = (inputs) => {
      const seen = mod.inspectPullRequest(inputs);
      return mod.evaluateMergeReadiness(seen);
    };
  }

  for (const rec of pending) {
    if (rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
      let verdict = null;
      try {
        verdict = inspectFn(rec.inputs || {});
      } catch (err) {
        // An unreachable remote is not evidence of anything; leave the record be.
        unchanged.push({ request_id: rec.request_id, reason: "inspect_failed", detail: String(err?.message || err) });
        continue;
      }
      if (verdict?.ok && verdict.idempotent && verdict.code === "already_merged") {
        rec.status = "complete";
        rec.operator_approval_required = false;
        rec.policy_decision = "already_satisfied";
        rec.result = {
          ...(rec.result || {}),
          idempotent: true,
          code: "already_merged",
          merge_sha: verdict.mergeSha || null,
          staging_sha: verdict.stagingSha || null,
        };
        rec.updated_at = iso(nowMs);
        // Close the decision only when it actually described THIS request.
        if (rec.decision_id && rec.mission_id) {
          const d = listDecisions(rec.mission_id, { status: "open" })
            .find((x) => x.decisionId === rec.decision_id);
          if (d && subjectsMatch(d, rec)) {
            try {
              answerDecision({
                missionId: rec.mission_id,
                decisionId: rec.decision_id,
                chosenOptionId: "authorize_staging_merge",
                response: `Already merged as ${verdict.mergeSha || "the recorded merge commit"}; no action was required.`,
                actor: "system",
                nowMs,
              });
            } catch { /* decision close is best-effort */ }
          } else if (d) {
            // The decision belongs to a different subject. Releasing it is the
            // whole point; closing it would answer someone else's question.
            rec.decision_id = null;
          }
        }
        saveRequest(rec, root);
        appendAudit(rec, "reconciled_already_merged", { nowMs, merge_sha: verdict.mergeSha || null }, root);
        satisfied.push({ request_id: rec.request_id, merge_sha: verdict.mergeSha || null });
        continue;
      }
    }

    // Still live: make sure the decision bound to it names the right subject.
    //
    // Searched across ALL decisions, not just open ones: reconciling an earlier
    // request in this same pass can close the very decision this one is wrongly
    // bound to, and a binding to a CLOSED decision that was never about this
    // request is no better than a binding to an open one.
    if (rec.decision_id && rec.mission_id) {
      const d = listDecisions(rec.mission_id)
        .find((x) => x.decisionId === rec.decision_id);
      if (!d || !subjectsMatch(d, rec)) {
        const wrong = rec.decision_id;
        rec.decision_id = null;
        const opened = openApprovalDecision(rec, { nowMs, root });
        rec.updated_at = iso(nowMs);
        saveRequest(rec, root);
        appendAudit(rec, "reconciled_decision_rebound", {
          nowMs,
          from_decision_id: wrong,
          to_decision_id: opened?.decisionId || rec.decision_id || null,
          subject: governedActionSubjectKey(rec),
        }, root);
        rebound.push({
          request_id: rec.request_id,
          from_decision_id: wrong,
          to_decision_id: opened?.decisionId || rec.decision_id || null,
        });
        continue;
      }
    }
    unchanged.push({ request_id: rec.request_id, reason: "no_repair_needed" });
  }

  return { ok: true, satisfied, rebound, unchanged };
}

export async function approveGovernedAction(requestId, {
  actor = "operator",
  nowMs = Date.now(),
  root = runtimeRoot(),
  expectedFingerprint = null,
} = {}) {
  const rec = getGovernedAction(requestId, root);
  if (!rec) return { ok: false, error: "request_not_found" };
  // STALE CONTENT. The operator approved what the card showed them. If the
  // content moved since, the id still matches and approving would authorise
  // something they never saw — so the decision is refused and the current
  // request is returned so the card can redraw with the truth.
  const stale = rejectStaleDecision(rec, expectedFingerprint);
  if (stale) return stale;
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
  expectedFingerprint = null,
} = {}) {
  const rec = getGovernedAction(requestId, root);
  if (!rec) return { ok: false, error: "request_not_found" };
  const stale = rejectStaleDecision(rec, expectedFingerprint);
  if (stale) return stale;
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
    || (r.status === "awaiting_operator"
      && r.operator_approval?.decision === "approved"
      && r.action_key === ACTION_TYPES.DATABASE_READ_CENSUS)
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

/**
 * The result envelope for ONE action type.
 *
 * THE DEFECT THIS REPLACES. This was hardcoded to the census shape: it read
 * `action.result.census` whatever the action was, so a completed
 * `repository.push` reported itself back to the lane as
 *
 *   { census_run_at: null, org_count: null, question_ids: null, keys: [] }
 *
 * — a null-filled census envelope for an action that had just published a
 * commit, under the instruction "Do not retry the census from this lane". Every
 * field the lane needed (the ref, the SHA, whether it was already there) was
 * absent, and every field present was meaningless.
 *
 * A MISMATCH IS AN ERROR, NOT A BLANK. When the result does not carry the shape
 * its action type requires, this says so. Rendering nulls turns a wiring fault
 * into something that merely looks like nothing happened, which is how the
 * original defect survived a successful push.
 */
export function governedResultEnvelope(actionKey, result = {}) {
  const r = result && typeof result === "object" ? result : {};
  if (actionKey === ACTION_TYPES.REPOSITORY_PUSH) {
    const sha = r.pushedSha || r.pushed_sha || null;
    const ref = r.remoteRef || r.remote_ref || (r.branch ? `refs/heads/${r.branch}` : null);
    if (!sha || !ref) {
      return { ok: false, error: "result_envelope_mismatch", expected: "repository.push", got: Object.keys(r).slice(0, 12) };
    }
    return {
      ok: true,
      summary: {
        repository: r.repository || null,
        remote_ref: ref,
        pushed_sha: sha,
        state: r.idempotent ? "already_present" : "pushed",
      },
    };
  }
  if (actionKey === ACTION_TYPES.PROMOTION_OPEN_PR) {
    const n = r.pullRequestNumber ?? r.pull_request_number ?? null;
    if (!n) {
      return { ok: false, error: "result_envelope_mismatch", expected: "promotion.open_pr", got: Object.keys(r).slice(0, 12) };
    }
    return {
      ok: true,
      summary: {
        repository: r.repository || null,
        pull_request_number: n,
        url: r.url || null,
        base: r.base || null,
        head_branch: r.headBranch || r.head_branch || null,
        state: r.reused ? "already_open" : "opened",
      },
    };
  }
  if (actionKey === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    const sha = r.merge_sha || r.mergeSha || null;
    if (!sha) {
      return { ok: false, error: "result_envelope_mismatch", expected: "repository.merge_pull_request", got: Object.keys(r).slice(0, 12) };
    }
    return {
      ok: true,
      summary: {
        repository: r.repository || null,
        pull_request_number: r.pull_request_number ?? r.pullRequestNumber ?? null,
        merge_sha: sha,
        staging_sha: r.staging_sha || r.stagingSha || null,
        state: r.idempotent ? "already_merged" : "merged",
      },
    };
  }
  if (actionKey === ACTION_TYPES.DATABASE_READ_CENSUS) {
    const census = r.census && typeof r.census === "object" ? r.census : null;
    if (!census) {
      return { ok: false, error: "result_envelope_mismatch", expected: "database.read_census", got: Object.keys(r).slice(0, 12) };
    }
    const questions = census.questions && typeof census.questions === "object" ? census.questions : null;
    return {
      ok: true,
      summary: {
        census_run_at: census.census_run_at || null,
        format: census.format || null,
        org_count: census.org_count ?? null,
        database: census.database || null,
        question_ids: census.question_ids || null,
        question_row_counts: questions
          ? Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, q?.row_count ?? null]))
          : null,
        keys: Object.keys(census).slice(0, 20),
      },
    };
  }
  return { ok: true, summary: { note: "completed", keys: Object.keys(r).slice(0, 12) } };
}

/**
 * Which credentials the lane did NOT receive, named for the action that ran.
 *
 * A push never involves database credentials, and saying so is not merely
 * imprecise — the sentence exists to tell the lane exactly what it still does
 * not hold, so naming the wrong secret weakens it.
 */
function credentialIsolationLine(actionKey) {
  if (actionKey === ACTION_TYPES.REPOSITORY_PUSH
    || actionKey === ACTION_TYPES.PROMOTION_OPEN_PR
    || actionKey === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    return "You did NOT receive GitHub credentials or any privileged secret.";
  }
  return "You did NOT receive hosted database credentials or any privileged secret.";
}

/** What a lane must NOT do again, phrased for the action that actually ran. */
function doNotRetryLine(actionKey) {
  if (actionKey === ACTION_TYPES.REPOSITORY_PUSH) {
    return "Do not push from this lane. The commit is already on the remote.";
  }
  if (actionKey === ACTION_TYPES.PROMOTION_OPEN_PR) {
    return "Do not open another pull request from this lane. The one below is the promotion.";
  }
  if (actionKey === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    return "Do not retry the merge from this lane. It already landed.";
  }
  return "Do not retry the census from this lane. Read the result file and continue.";
}

export function continuationTextForGovernedAction(rec, action = null) {
  const evidencePath = rec.result_ref || action?.result?.evidencePath || null;
  const envelope = governedResultEnvelope(rec.action_key, action?.result || rec.result || {});
  return redact([
    "[VACILANDO GOVERNED ACTION COMPLETE]",
    `Request: ${rec.request_id}`,
    `Action: ${rec.action_key}`,
    `Target: ${rec.target}`,
    action?.id ? `Trusted host action: ${action.id}` : null,
    evidencePath ? `Result file (read this in the current worktree): ${evidencePath}` : null,
    "",
    "Director executed this on the trusted host.",
    credentialIsolationLine(rec.action_key),
    doNotRetryLine(rec.action_key),
    rec.run_id ? `When this assignment is finished, report: vac run-status ${rec.run_id} complete --summary "..."${rec.lane_id ? ` --lane ${rec.lane_id}` : ""}` : null,
    "",
    envelope.ok ? "Bounded result summary:" : "RESULT ENVELOPE MISMATCH — the trusted-host result did not carry the shape this action produces. Report this rather than acting on it:",
    JSON.stringify(envelope.ok ? envelope.summary : envelope, null, 2),
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
    const hydrated = {
      ...lane,
      execution_run: hydrateGovernedOnRun(lane.execution_run, root),
      previous_run: hydrateGovernedOnRun(lane.previous_run, root),
    };
    const pending = pendingGovernedActionForLane(hydrated?.lane_id, root)
      || pendingGovernedActionForRun(hydrated?.execution_run?.run_id, root);
    if (!pending) {
      // A resolved approval must not keep advertising itself from the run
      // snapshot. Runtime Performance's push completed; previous_run still
      // said awaiting_operator, so Authorize push stayed on screen and the
      // click looked like a no-op (already complete + "Census authorized").
      // Hiding the resolved card stops a stale button; it does not tell the
      // operator what happened. Report the last resolved decision alongside it,
      // so an approval that has just vanished from the screen still has an
      // answer on the screen.
      //
      // THE COMMUNICATIONS FOLLOW-ON. The 200-request store evicted
      // gar_260730c554bcc9 after PR #510 merged. hydrate then found no record
      // and kept the frozen awaiting_operator snapshot, so a closed lane kept
      // saying "Needs approval" for a merge that had already landed.
      const outcome = governedOutcomeFor(lastResolvedGovernedActionForLane(hydrated?.lane_id, root));
      const next = {
        ...hydrated,
        governed_action: null,
        execution_run: dropOrphanPendingGoverned(hydrated.execution_run),
        previous_run: dropOrphanPendingGoverned(hydrated.previous_run),
      };
      return outcome ? { ...next, last_governed_outcome: outcome } : next;
    }
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
      ...hydrated,
      governed_action: pub,
      execution_run: withAction(hydrated.execution_run),
      previous_run: hydrated.execution_run ? hydrated.previous_run : withAction(hydrated.previous_run),
    };
  });
}

function dropOrphanPendingGoverned(run) {
  if (!run?.governed_action) return run || null;
  if (!isPendingGovernedStatus(run.governed_action.status)) return run;
  return { ...run, governed_action: null };
}

function hydrateGovernedOnRun(run, root) {
  if (!run?.governed_action?.request_id) return run || null;
  const rec = getGovernedAction(run.governed_action.request_id, root);
  if (!rec) return dropOrphanPendingGoverned(run);
  return { ...run, governed_action: publicGovernedAction(rec) };
}

export function applyGovernedActionToPublicRun(run, root = runtimeRoot()) {
  if (!run?.run_id && !run?.lane_id) return run;
  const hydrated = hydrateGovernedOnRun(run, root);
  const pending = pendingGovernedActionForRun(hydrated?.run_id, root)
    || pendingGovernedActionForLane(hydrated?.lane_id, root);
  if (!pending) {
    if (hydrated?.governed_action) {
      return { ...hydrated, governed_action: null };
    }
    return hydrated;
  }
  return {
    ...hydrated,
    governed_action: publicGovernedAction(pending),
    resource_wait: {
      ...(hydrated.resource_wait || {}),
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
