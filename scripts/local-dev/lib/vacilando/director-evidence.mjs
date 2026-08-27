/**
 * Deterministic evidence for Director authority decisions.
 *
 * THE RULE THAT MAKES THIS SAFE: a fact this collector cannot MEASURE is
 * returned as null, and a null gate escalates. So an incomplete collector can
 * only ever produce more operator approvals, never fewer — integrating it
 * cannot regress the current behaviour, only improve on it as measurement
 * improves.
 *
 * Nothing here reads a claim made by the worker. The worker declares what it
 * wants; the evidence is gathered from sources the worker does not control.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repositoryStorePath } from "./repository-registry.mjs";
import { governedActionStorePath } from "./governed-action-request.mjs";
import { executionRunStorePath } from "./execution-run.mjs";
import { developmentLaneStorePath } from "./development-lane.mjs";
import { branchIsReferenced } from "./branch-reference.mjs";
import { isSafeCorrection, WITHHELD_CORRECTION_KINDS } from "./reconciliation-apply.mjs";
import {
  measureClosePullRequestGates,
  measureDeleteRemoteBranchGates,
  isNeverDeletable,
} from "./trusted-host-repository-housekeeping.mjs";

const PROTECTED = ["staging", "main", "master", "production"];

/** Files whose presence in a diff means credential material is moving. */
const CREDENTIAL_PATTERNS = [
  /(^|\/)\.env(\.|$)/i, /(^|\/)id_(rsa|ed25519)(\.|$)/i, /\.pem$/i, /\.p12$/i, /\.pfx$/i,
  /(^|\/)service-account.*\.json$/i, /(^|\/)credentials(\.|$)/i, /\.keystore$/i,
];

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).trim();
  } catch { return null; }
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

/** Is this a repository Vacilando manages? Read from the registry, not the request. */
export function managedRepository(remoteOrName, stateRoot) {
  // Ask the registry for its own path. Hand-joining it was wrong in exactly
  // the way that matters here: a missed file reads as "not a managed
  // repository", which is a REFUSAL, so the bug hid as conservatism.
  let path = null;
  try { path = repositoryStorePath(stateRoot); } catch { path = null; }
  const reg = path ? readJson(path) : null;
  // The registry stores repositories as an object keyed by repository_id;
  // older snapshots used an array. Accept both, and return null if neither
  // shape yields entries, because "cannot tell" must escalate.
  const raw = reg?.repositories;
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);
  if (!list.length) return null;
  const want = String(remoteOrName || "").toLowerCase();
  if (!want) return null;
  return list.some((r) =>
    String(r.remote_normalized || "").toLowerCase().includes(want)
    || String(r.remote || "").toLowerCase().includes(want)
    || String(r.name || "").toLowerCase() === want);
}

/**
 * Does this change carry credential material? Measured against the real diff.
 * If the diff cannot be computed the answer is null, never "no".
 */
export function credentialMaterialInRange(worktree, baseRef, headSha) {
  if (!worktree || !existsSync(worktree) || !headSha) return null;
  const files = git(["diff", "--name-only", `${baseRef}...${headSha}`], worktree);
  if (files == null) return null;
  const list = files.split("\n").map((s) => s.trim()).filter(Boolean);
  return list.some((f) => CREDENTIAL_PATTERNS.some((re) => re.test(f)));
}

/** The remote's actual head for a branch. Null when the remote cannot be read. */
export function remoteHead(worktree, branch) {
  if (!worktree || !existsSync(worktree) || !branch) return null;
  const out = git(["ls-remote", "origin", `refs/heads/${branch}`], worktree);
  if (out == null || out === "") return out === "" ? "" : null;
  return out.split(/\s+/)[0] || null;
}

/** Files changed, so a governance-policy edit can be SEEN rather than trusted. */
export function changedFiles(worktree, baseRef, headSha) {
  if (!worktree || !existsSync(worktree) || !headSha) return null;
  const out = git(["diff", "--name-only", `${baseRef}...${headSha}`], worktree);
  return out == null ? null : out.split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * Gather what can be proven for a governed request.
 *
 * Deliberately returns null for anything not measurable here — including the
 * durability and certification gates, which need a recorded validation result
 * rather than an assumption. Until those are wired, push and open-PR escalate
 * exactly as they do today.
 */
export function collectDirectorEvidence(rec, {
  stateRoot,
  worktree = null,
  baseRef = "origin/staging",
  durabilityGatesPassed = null,
  certificationSuitePassed = null,
  operatorHold = false,
  governanceExceptionActive = false,
} = {}) {
  const inputs = rec?.inputs || {};
  const branch = inputs.branch || inputs.headBranch || inputs.head_branch || null;
  const sha = inputs.expectedHeadSha || inputs.expected_head_sha || inputs.expectedSha || null;
  const repository = inputs.repository || null;
  const environment = String(inputs.environment || inputs.base || inputs.targetBranch || rec?.target || "").toLowerCase() || null;
  const wt = worktree || rec?.worktree_path || null;

  const evidence = {
    repository,
    managed_repository: repository ? managedRepository(repository, stateRoot) : null,
    branch,
    source_sha: sha,
    environment,
    base_branch: (inputs.base || inputs.targetBranch || null),
    credential_material_detected: credentialMaterialInRange(wt, baseRef, sha),
    changed_files: changedFiles(wt, baseRef, sha),
    remote_head_sha: null,
    // Not assumptions: these must be supplied from a recorded result, or the
    // gate stays unmeasured and the action escalates.
    durability_gates_passed: durabilityGatesPassed,
    certification_suite_passed: certificationSuitePassed,
    governance_exception_active: governanceExceptionActive === true,
    operator_hold: operatorHold === true,
  };
  // Repository housekeeping measures REAL GitHub state. Anything unreadable
  // stays null, and a null gate escalates — a cleanup that cannot be proven
  // safe is never a cleanup the Director performs.
  // Reconciliation metadata. Everything here is derived from the PLAN the
  // request carries; whether that plan still describes reality is re-checked by
  // the executor, and its fingerprint is a gate in its own right.
  if (rec?.action_key === "vacilando.apply_reconciliation_plan") {
    const corrections = Array.isArray(inputs.corrections) ? inputs.corrections : null;
    const withheld = Array.isArray(inputs.withheld) ? inputs.withheld : [];
    evidence.reconciliation_plan_readable = corrections != null && Boolean(inputs.planFingerprint);
    // Currency is asserted by the request and PROVEN again at execution; an
    // absent fingerprint leaves this unmeasured, which escalates.
    evidence.reconciliation_plan_current = /^[0-9a-f]{32}$/.test(String(inputs.planFingerprint || "")) ? true : null;
    if (corrections) {
      evidence.all_corrections_allowlisted = corrections.every((c) => isSafeCorrection(c?.kind));
      evidence.destructive_corrections = corrections.filter((c) => WITHHELD_CORRECTION_KINDS.includes(c?.kind)).length;
      evidence.live_process_affecting = corrections.filter((c) => c?.affects_live_process === true).length;
    }
    // Withheld findings may EXIST. What must be zero is any of them appearing
    // among the corrections, which the two counts above already establish.
    evidence.foreign_owner_mutations = corrections ? corrections.filter((c) => c?.kind === "reassign_port").length : null;
    evidence.ambiguous_owner_mutations = corrections ? corrections.filter((c) => c?.kind === "any_correction").length : null;
    evidence.withheld_count = withheld.length;
    evidence.metadata_store_known = Boolean(stateRoot);
  }
  if (rec?.action_key === "repository.close_pull_request") {
    try {
      const n = {
        repository,
        pullRequestNumber: Number(inputs.pullRequestNumber ?? inputs.pull_request_number),
        expectedHeadBranch: inputs.expectedHeadBranch || inputs.headBranch || null,
        expectedHeadSha: sha,
        expectedBaseBranch: inputs.expectedBaseBranch || inputs.base || null,
        expectedHeadRepository: inputs.expectedHeadRepository || null,
      };
      Object.assign(evidence, measureClosePullRequestGates(n));
    } catch { /* unmeasured -> escalates */ }
    // A governed merge still legitimately targeting this PR blocks closure.
    evidence.active_governed_merge = activeGovernedMergeFor(stateRoot, repository, inputs.pullRequestNumber ?? inputs.pull_request_number);
  }
  if (rec?.action_key === "repository.delete_remote_branch") {
    const br = inputs.branch || inputs.branchName || null;
    evidence.branch = br;
    evidence.branch_never_protected_name = br == null ? null : !isNeverDeletable(br);
    try {
      Object.assign(evidence, measureDeleteRemoteBranchGates({ repository, branch: br, expectedHeadSha: sha }));
    } catch { /* unmeasured -> escalates */ }
    // STRUCTURED REFERENCES ONLY. The previous implementation serialised every
    // non-terminal run and asked whether the branch NAME appeared in the JSON,
    // so a run whose instruction text merely mentioned the branch counted as
    // depending on it — including the run doing the deleting, which meant the
    // gate blocked itself. Prose is not a reference.
    let lanesPath = null; let runsPath = null; let gaPath2 = null;
    try { lanesPath = developmentLaneStorePath(stateRoot); } catch { lanesPath = null; }
    try { runsPath = executionRunStorePath(stateRoot); } catch { runsPath = null; }
    try { gaPath2 = governedActionStorePath(stateRoot); } catch { gaPath2 = null; }
    evidence.active_lane_reference = branchIsReferenced({
      branch: br, repository, lanesPath, runsPath, governedActionsPath: gaPath2,
      excludeGovernedActionId: rec?.request_id || null,
    });
    // Unique work is only "not at risk" when the branch head is reachable from
    // the canonical branch. Unreachable or unmeasurable stays null.
    evidence.unique_work_at_risk = uniqueWorkAtRisk(wt, sha);
  }
  if (rec?.action_key === "promotion.open_pr") {
    evidence.remote_head_sha = remoteHead(wt, branch);
  }
  if (branch != null) {
    evidence.protected_branch = PROTECTED.includes(String(branch).toLowerCase());
  }
  return evidence;
}

/** Is a governed merge still legitimately targeting this pull request? */
function activeGovernedMergeFor(stateRoot, repository, prNumber) {
  if (!prNumber) return null;
  // Ask the owner. Reconstructing a canonical Vacilando store path by hand is
  // how this gate came back unmeasured in the first place.
  let gaPath = null;
  try { gaPath = governedActionStorePath(stateRoot); } catch { gaPath = null; }
  const db = gaPath ? readJson(gaPath) : null;
  const rows = Array.isArray(db) ? db : (db?.requests || db?.records || (db && Object.values(db).find(Array.isArray)) || null);
  if (!Array.isArray(rows)) return null;                       // cannot tell -> escalate
  const pending = ["requested", "awaiting_director", "awaiting_operator", "awaiting_control_plane_refresh", "executing"];
  return rows.some((r) => r
    && r.action_key === "repository.merge_pull_request"
    && pending.includes(r.status)
    && Number(r.inputs?.pullRequestNumber ?? r.inputs?.pull_request_number) === Number(prNumber));
}


/** Would deleting this head lose work no canonical branch can reach? */
function uniqueWorkAtRisk(worktree, sha) {
  if (!worktree || !existsSync(worktree) || !sha) return null;
  const merged = git(["merge-base", "--is-ancestor", sha, "origin/staging"], worktree);
  if (merged !== null) return false;                           // reachable from staging
  const branches = git(["branch", "-r", "--contains", sha], worktree);
  if (branches == null) return null;                           // unmeasurable -> escalate
  const others = branches.split("\n").map((x) => x.trim()).filter((x) => x && !/->/.test(x));
  // Reachable only from the branch about to be deleted means the commits go
  // with it. That is exactly the case a human should decide.
  return others.length <= 1;
}
