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
  const reg = readJson(path || join(stateRoot, "repositories.json"))
    || readJson(join(stateRoot, "repositories.json"));
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
  if (rec?.action_key === "promotion.open_pr") {
    evidence.remote_head_sha = remoteHead(wt, branch);
  }
  if (branch != null) {
    evidence.protected_branch = PROTECTED.includes(String(branch).toLowerCase());
  }
  return evidence;
}
