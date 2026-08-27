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
    const refs = activeLaneReference(stateRoot, br);
    evidence.active_lane_reference = refs;
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

/** Does any non-terminal run or lane still name this branch? */
function activeLaneReference(stateRoot, branch) {
  if (!branch) return null;
  let runsPath = null;
  try { runsPath = executionRunStorePath(stateRoot); } catch { runsPath = null; }
  const runs = runsPath ? readJson(runsPath) : null;
  if (!runs?.lanes) return null;                               // cannot tell -> escalate
  const terminal = new Set(["COMPLETE", "FAILED", "ABANDONED"]);
  for (const v of Object.values(runs.lanes)) {
    const rs = Array.isArray(v) ? v : (v.runs || Object.values(v).find(Array.isArray) || []);
    for (const r of rs) {
      if (!r || terminal.has(String(r.state).toUpperCase())) continue;
      if (JSON.stringify(r).includes(branch)) return true;
    }
  }
  return false;
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
