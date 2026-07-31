/**
 * Engineering Health — regression for 2026-07-31 disk-full incident.
 *
 * Root causes that day:
 *  - Disk at ~100% / ~2 GB free
 *  - ~/CursorBackupLocal/state.vscdb (~13 GB orphan backup)
 *  - Managed worktree node_modules (~64 GB aggregate; ~13 GB GC-reclaimable)
 *  - Docker unused images reclaimable
 *  - npm cache weight
 *
 * The toolkit must detect each class so the incident cannot recur unnoticed.
 */
import assert from "node:assert/strict";
import { evaluateAll, scoreSubsystems, estimateDaysToFull } from "../lib/engineering-health/evaluators.mjs";
import { buildRecommendations } from "../lib/engineering-health/recommendations.mjs";
import { listActions, executeAction } from "../lib/engineering-health/executors/actions.mjs";
import { formatDoctorReport } from "../lib/engineering-health/presentation/doctor.mjs";
import { parseDockerSize } from "../lib/engineering-health/collectors/docker.mjs";

const GB = 1024 ** 3;

/** Synthetic snapshot mirroring the incident. */
const incidentSnapshot = {
  disk: {
    ok: true,
    volume: {
      capacity_pct: 100,
      available_gb: 2.5,
      used_gb: 413,
      total_gb: 460,
      available_bytes: 2.5 * GB,
      used_bytes: 413 * GB,
    },
  },
  docker: {
    ok: true,
    available: true,
    reclaimable_gb: 7.6,
    reclaimable_bytes: 7.6 * GB,
    system_df: {
      images: { reclaimable: "7.608GB (22%)" },
      build_cache: { reclaimable: "0B" },
    },
  },
  node: {
    ok: true,
    npm_cache: { path: "/Users/x/.npm/_cacache", bytes: 1.5 * GB, gb: 1.5 },
    pnpm_cache: { path: null, bytes: 0, gb: 0 },
    worktree_node_modules: {
      count: 40,
      bytes: 45 * GB,
      gb: 45,
      samples: [{ worktree: "wt3-runtime-v1-polish", bytes: 0.9 * GB }],
    },
  },
  ide_caches: {
    ok: true,
    cursor: { total_gb: 10, total_bytes: 10 * GB, cached_data_bytes: 0.3 * GB },
    claude: { total_gb: 7.8, vm_bundle_bytes: 6 * GB },
    orphans: [{
      kind: "cursor_backup_local",
      path: "/Users/x/CursorBackupLocal/state.vscdb",
      bytes: 13.24 * GB,
      reason: "Orphaned Cursor backup database/directory — not the live Application Support DB.",
    }],
  },
  git_repos: {
    ok: true,
    worktree_root_gb: 64,
    worktree_gc: {
      reclaimable_worktrees: 17,
      kept: 43,
      reclaimable_bytes: 13 * GB,
      reclaimable_mb: 13418,
    },
  },
  processes: { ok: true, top_rss: [], zombie_count: 0 },
  services: {
    ok: true,
    docker: { available: true },
    toolkit: { alloy_dev_installed: true },
    supabase: { running_containers: 8 },
  },
  large_files: {
    ok: true,
    files: [{
      path: "/Users/x/CursorBackupLocal/state.vscdb",
      allocated_bytes: 13.24 * GB,
      gb: 13.2,
    }],
  },
};

const findings = evaluateAll(incidentSnapshot);
const ids = new Set(findings.map((f) => f.id));

assert.ok(ids.has("disk.utilization"), "must detect disk pressure");
assert.equal(findings.find((f) => f.id === "disk.utilization").severity, "critical");

assert.ok(ids.has("ide.orphan.cursor_backup_local"), "must detect CursorBackupLocal orphan");
assert.equal(findings.find((f) => f.id === "ide.orphan.cursor_backup_local").severity, "critical");

assert.ok(ids.has("docker.reclaimable"), "must detect Docker reclaimable");
assert.ok(
  ["warning", "info", "critical"].includes(findings.find((f) => f.id === "docker.reclaimable").severity),
);

assert.ok(ids.has("node.worktree_node_modules"), "must detect worktree node_modules pressure");
assert.ok(ids.has("git.worktree_gc"), "must detect worktree GC reclaim opportunity");

const { recommendations, potential_recovery_gb } = buildRecommendations(findings);
assert.ok(recommendations.some((r) => r.action_id === "remove_cursor_backup_local"));
assert.ok(recommendations.some((r) => r.action_id === "worktree_gc"));
assert.ok(recommendations.some((r) => r.action_id === "docker_prune"));
assert.ok(potential_recovery_gb >= 20, `expected large potential recovery, got ${potential_recovery_gb}`);

const score = scoreSubsystems(findings);
assert.ok(score.overall < 80, `incident overall should be degraded, got ${score.overall}`);
assert.ok(score.subsystems.disk?.status === "critical");
assert.ok(score.subsystems.caches?.status === "critical");

const text = formatDoctorReport({
  score,
  findings,
  recommendations,
  potential_recovery_gb,
  generated_at: new Date().toISOString(),
});
assert.match(text, /Engineering Health/);
assert.match(text, /CursorBackupLocal|Orphan IDE backup/i);
assert.match(text, /Potential recovery/);

// Executors refuse without confirm
const refused = executeAction("worktree_gc", { confirm: false });
assert.equal(refused.ok, false);
assert.equal(refused.error, "refused_without_confirm");
assert.ok(listActions().includes("remove_cursor_backup_local"));
assert.ok(listActions().includes("docker_prune"));

// Docker size parser
assert.ok(parseDockerSize("7.608GB") > 7 * GB);
assert.equal(parseDockerSize("0B"), 0);

// Growth prediction
const history = [
  { at: new Date(Date.now() - 10 * 86400000).toISOString(), used_bytes: 400 * GB, available_bytes: 60 * GB },
  { at: new Date().toISOString(), used_bytes: 450 * GB, available_bytes: 10 * GB },
];
const pred = estimateDaysToFull(history, { available_bytes: 10 * GB });
assert.ok(pred);
assert.ok(pred.gb_per_day > 0);
assert.ok(pred.days_to_full != null);

console.log(JSON.stringify({
  ok: true,
  finding_ids: [...ids].sort(),
  overall: score.overall,
  potential_recovery_gb,
  recommendation_actions: recommendations.map((r) => r.action_id).filter(Boolean),
}, null, 2));
