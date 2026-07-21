/**
 * Repository Runtime — projects worktrees, branches, commit position vs staging,
 * merge readiness, and the staging baseline.
 *
 * Source of truth per field:
 *   canonical root / base_ref / base_sha → alloy-ro root + worker-status
 *   branch / ahead / behind / dirty      → alloy-ro agent-status
 *   merge_readiness                      → DERIVED from initiative.state +
 *                                          git position (behind==0 && !dirty)
 *   PR state / staging deploy            → GAP: the toolkit prints push/PR
 *                                          commands but never executes or tracks
 *                                          them; there is no PR record to read.
 */
import { STATUS } from "./model.mjs";

/** Merge readiness from authoritative git position + initiative gate, honestly. */
export function deriveMergeReadiness(e) {
  const st = e.initiative?.state;
  if (st === "merge_ready" || st === "awaiting_promotion_approval") return "ready";
  if (st === "closed") return "merged";
  if (st === "remediation_required") return "changes_required";
  if (e.behind > 0) return "behind_staging";
  if (e.git === "dirty") return "in_progress";
  if (e.ahead > 0) return "unreviewed"; // has commits, no gate cleared → not "ready"
  return "clean";
}

export function projectRepository(sprintsCtx, raw) {
  const rootInfo = raw.root || {};
  const worktrees = sprintsCtx
    .map((e) => ({
      slot: e.slot,
      worktree: e.worktree,
      branch: e.branch || null,
      branch_expected: e.branch_expected || null,
      branch_drift: Boolean(e.branch && e.branch_expected && e.branch !== e.branch_expected),
      ahead: e.ahead,
      behind: e.behind,
      dirty: e.git === "dirty",
      server: e.server,
      port: e.port,
      merge_readiness: deriveMergeReadiness(e),
      pr: null, // GAP: no PR tracking in the toolkit
    }))
    .sort((a, b) => a.slot - b.slot);

  return {
    canonical: rootInfo.canonical || rootInfo.Canonical || null,
    base_ref: raw.slots?.base || "origin/staging",
    base_sha: raw.slots?.base_sha || null,
    worktrees,
    counts: {
      total: worktrees.length,
      dirty: worktrees.filter((w) => w.dirty).length,
      behind: worktrees.filter((w) => w.behind > 0).length,
      ready: worktrees.filter((w) => w.merge_readiness === "ready").length,
      drift: worktrees.filter((w) => w.branch_drift).length,
    },
  };
}
