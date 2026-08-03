/**
 * Recommendation engine — every unhealthy finding → actionable recommendation.
 */

const CATALOG = {
  "disk.utilization": (f) => ({
    action_id: "worktree_gc",
    title: "Reclaim regenerable worktree artifacts",
    command: "alloy-engineering-doctor --fix worktree_gc --yes",
    estimated_reclaim_gb: null,
    risk: "low",
    detail: "Runs alloy-worktree-gc --force (node_modules/.next only on merged/clean trees).",
  }),
  "docker.reclaimable": (f) => ({
    action_id: "docker_prune",
    title: "Prune unused Docker data",
    command: "alloy-engineering-doctor --fix docker_prune --yes",
    estimated_reclaim_gb: f.metrics?.reclaimable_gb ?? null,
    risk: "low",
    detail: "docker system prune -f (unused containers/networks/images dangling). Does not remove volumes.",
  }),
  "docker.unavailable": () => ({
    action_id: "docker_recover",
    title: "Recover Docker Desktop",
    command: "alloy-docker-doctor --recover",
    estimated_reclaim_gb: 0,
    risk: "low",
    detail: "Relaunch Docker Desktop via the sanctioned doctor.",
  }),
  "node.npm_cache": (f) => ({
    action_id: "npm_cache_clean",
    title: "Clean npm cache",
    command: "alloy-engineering-doctor --fix npm_cache_clean --yes",
    estimated_reclaim_gb: f.metrics?.gb ?? null,
    risk: "low",
    detail: "npm cache clean --force — regenerable.",
  }),
  "node.pnpm_cache": (f) => ({
    action_id: "pnpm_store_prune",
    title: "Prune pnpm store",
    command: "alloy-engineering-doctor --fix pnpm_store_prune --yes",
    estimated_reclaim_gb: f.metrics?.gb ?? null,
    risk: "low",
    detail: "pnpm store prune — removes unreferenced packages.",
  }),
  "node.worktree_node_modules": (f) => ({
    action_id: "worktree_gc",
    title: "GC worktree node_modules",
    command: "alloy-engineering-doctor --fix worktree_gc --yes",
    estimated_reclaim_gb: f.metrics?.gb ?? null,
    risk: "low",
    detail: "Safe regenerable reclaim via alloy-worktree-gc.",
  }),
  "git.worktree_gc": (f) => ({
    action_id: "worktree_gc",
    title: "Run worktree GC (artifacts) or prune-merged (full trees)",
    command: "alloy-worktree-prune-merged   # dry-run; add --yes to delete merged trees",
    estimated_reclaim_gb: f.metrics?.reclaimable_gb ?? null,
    risk: "low",
    detail: "GC strips node_modules/.next. prune-merged removes entire worktrees whose HEAD is in origin/staging.",
  }),
  "ide.orphan.cursor_backup_local": (f) => ({
    action_id: "remove_cursor_backup_local",
    title: "Remove CursorBackupLocal orphan",
    command: "alloy-engineering-doctor --fix remove_cursor_backup_local --yes",
    estimated_reclaim_gb: f.metrics?.gb ?? null,
    risk: "low",
    detail: "Deletes ~/CursorBackupLocal backup DB only — never the live Application Support state.vscdb.",
  }),
  "ide.orphan.ide_backup_state_vscdb": (f) => ({
    action_id: "report_only",
    title: "Review orphan IDE backup DB",
    command: null,
    estimated_reclaim_gb: f.metrics?.gb ?? null,
    risk: "medium",
    detail: `Inspect ${f.metrics?.path} before deleting — may be an intentional archive.`,
  }),
  "large_files.cursor_backup": (f) => ({
    action_id: "remove_cursor_backup_local",
    title: "Remove CursorBackupLocal",
    command: "alloy-engineering-doctor --fix remove_cursor_backup_local --yes",
    estimated_reclaim_gb: f.metrics?.gb ?? null,
    risk: "low",
    detail: "Orphaned backup — not the live Cursor DB.",
  }),
  "ide.cursor_size": (f) => ({
    action_id: "cursor_cached_data_clean",
    title: "Clear Cursor CachedData",
    command: "alloy-engineering-doctor --fix cursor_cached_data_clean --yes",
    estimated_reclaim_gb: Math.round(((f.metrics?.cached_data_bytes || 0) / 1024 ** 3) * 10) / 10,
    risk: "low",
    detail: "Clears regenerable CachedData only — not chat/state DB.",
  }),
};

export function buildRecommendations(findings) {
  const recs = [];
  const seen = new Set();
  for (const f of findings) {
    if (f.severity === "healthy") continue;
    const factory = CATALOG[f.id];
    if (!factory) {
      recs.push({
        finding_id: f.id,
        subsystem: f.subsystem,
        severity: f.severity,
        title: `Address: ${f.title}`,
        reason: f.reason,
        action_id: null,
        command: null,
        estimated_reclaim_gb: null,
        risk: "unknown",
        detail: "No automated executor yet — investigate manually.",
      });
      continue;
    }
    const base = factory(f);
    if (base.action_id && seen.has(base.action_id)) {
      // merge reclaim estimates
      const existing = recs.find((r) => r.action_id === base.action_id);
      if (existing && base.estimated_reclaim_gb != null) {
        existing.estimated_reclaim_gb = Math.max(
          existing.estimated_reclaim_gb || 0,
          base.estimated_reclaim_gb || 0,
        );
      }
      continue;
    }
    if (base.action_id) seen.add(base.action_id);
    recs.push({
      finding_id: f.id,
      subsystem: f.subsystem,
      severity: f.severity,
      reason: f.reason,
      ...base,
    });
  }

  const rank = { critical: 0, warning: 1, info: 2 };
  recs.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));

  const potential = recs.reduce((sum, r) => sum + (Number(r.estimated_reclaim_gb) || 0), 0);
  return {
    recommendations: recs,
    potential_recovery_gb: Math.round(potential * 10) / 10,
  };
}
