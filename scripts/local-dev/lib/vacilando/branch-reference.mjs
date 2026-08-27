/**
 * Who actually depends on a branch.
 *
 * THE DEFECT THIS REPLACES: branch-deletion evidence serialised every
 * non-terminal Execution Run and asked whether the branch NAME appeared
 * anywhere in the JSON. A run whose instruction text merely mentioned a branch
 * counted as depending on it — and the run doing the deleting always mentions
 * it, so the gate blocked itself. It failed safe, but for a reason that has
 * nothing to do with ownership, and it would block legitimate cleanup forever.
 *
 * Prose is not a reference. Only a STRUCTURED field, in a place that records
 * bindings rather than describes them, establishes that a live resource needs a
 * branch.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** Bases that may establish a reference. Anything not here cannot. */
export const REFERENCE_BASES = Object.freeze([
  "lane_branch_binding",
  "worktree_branch",
  "active_run_bound_worktree",
  "governed_action_source_branch",
]);

/** Explicitly rejected bases, named so the exclusion is visible. */
export const REJECTED_BASES = Object.freeze([
  "substring_match",
  "instruction_mentions_branch",
  "summary_mentions_branch",
  "serialized_json_contains_branch",
]);

const TERMINAL_RUN_STATES = new Set(["COMPLETE", "FAILED", "ABANDONED"]);
const TERMINAL_LANE_STATUS = new Set(["archived", "closed", "deleted", "retired"]);

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
const norm = (v) => String(v ?? "").trim();

/** The branch a worktree is actually on, or null when it cannot be read. */
export function worktreeBranch(worktreePath) {
  if (!worktreePath || !existsSync(worktreePath)) return null;
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: worktreePath, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000,
    }).trim() || null;
  } catch { return null; }
}

/**
 * Every structured reason a live resource depends on this branch.
 *
 * Returns { ok, references[], unknown[] }. `unknown` is NOT `references`:
 * "I could not read the lane store" and "a lane is bound to this branch" are
 * different answers and the caller must be able to tell them apart.
 */
export function resolveBranchReferences({
  branch,
  repository = null,
  lanesPath = null,
  runsPath = null,
  governedActionsPath = null,
} = {}) {
  const target = norm(branch);
  if (!target) return { ok: false, references: [], unknown: ["no_branch_supplied"] };
  const references = [];
  const unknown = [];

  // 1. A lane BOUND to the branch, and the worktree that binding points at.
  const lanesDoc = lanesPath ? readJson(lanesPath) : null;
  if (!lanesDoc) unknown.push("lane_store_unreadable");
  else {
    const raw = lanesDoc.lanes || lanesDoc;
    const lanes = Array.isArray(raw) ? raw : Object.values(raw);
    for (const lane of lanes) {
      if (!lane || TERMINAL_LANE_STATUS.has(String(lane.status || "").toLowerCase())) continue;
      const binding = lane.binding || {};
      if (repository && lane.repository_id && norm(lane.repository_id) !== norm(repository)) continue;
      if (norm(binding.branch) === target) {
        references.push({
          branch: target, repository: lane.repository_id || null,
          resource_type: "lane", resource_id: lane.lane_id,
          basis: "lane_branch_binding", active: true,
        });
        continue;
      }
      const wt = binding.worktree_path || binding.worktreePath || null;
      if (wt && worktreeBranch(wt) === target) {
        references.push({
          branch: target, repository: lane.repository_id || null,
          resource_type: "worktree", resource_id: wt,
          basis: "worktree_branch", active: true,
        });
      }
    }
  }

  // 2. A non-terminal run whose BOUND worktree is on the branch. The run's
  //    instruction text is never consulted.
  const runsDoc = runsPath ? readJson(runsPath) : null;
  if (!runsDoc) unknown.push("run_store_unreadable");
  else {
    const seen = new Set();
    for (const v of Object.values(runsDoc.lanes || {})) {
      const rs = Array.isArray(v) ? v : (v.runs || Object.values(v).find(Array.isArray) || []);
      for (const run of rs) {
        if (!run || TERMINAL_RUN_STATES.has(String(run.state).toUpperCase())) continue;
        const wt = run.worktree_path || null;
        if (!wt || seen.has(wt)) continue;
        seen.add(wt);
        if (worktreeBranch(wt) === target) {
          references.push({
            branch: target, repository: repository || null,
            resource_type: "execution_run", resource_id: run.run_id,
            basis: "active_run_bound_worktree", active: true,
          });
        }
      }
    }
  }

  // 3. A pending governed action whose SOURCE branch input is this branch.
  const gaDoc = governedActionsPath ? readJson(governedActionsPath) : null;
  if (!gaDoc) unknown.push("governed_action_store_unreadable");
  else {
    const rows = Array.isArray(gaDoc) ? gaDoc : (gaDoc.requests || gaDoc.records || Object.values(gaDoc).find(Array.isArray) || []);
    const pending = new Set(["requested", "awaiting_director", "awaiting_operator", "awaiting_control_plane_refresh", "executing"]);
    for (const r of Array.isArray(rows) ? rows : []) {
      if (!r || !pending.has(r.status)) continue;
      const inputs = r.inputs || {};
      const b = inputs.branch || inputs.headBranch || inputs.head_branch || null;
      if (norm(b) !== target) continue;
      if (repository && inputs.repository && norm(inputs.repository) !== norm(repository)) continue;
      references.push({
        branch: target, repository: inputs.repository || null,
        resource_type: "governed_action", resource_id: r.request_id,
        basis: "governed_action_source_branch", active: true,
      });
    }
  }

  return { ok: true, references, unknown };
}

/**
 * true / false / null for the deletion gate.
 *
 * null means the structured stores could not be read — unknown, which the gate
 * treats as unmeasured and escalates. Unknown and referenced are different
 * states, and neither is invented from prose.
 */
export function branchIsReferenced(args = {}) {
  const out = resolveBranchReferences(args);
  if (!out.ok) return null;
  if (out.references.length) return true;
  if (out.unknown.length) return null;
  return false;
}
