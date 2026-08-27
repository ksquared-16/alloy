/**
 * Attribute existing lanes to the Alloy repository.
 *
 * Every lane that existed before the registry belongs to Alloy — that is a
 * historical fact, not a guess. But it must be PROVEN per lane rather than
 * assumed in bulk, because a lane whose worktree resolves to some other Git
 * object store would be silently mis-attributed, and mis-attribution is how a
 * provider ends up running in the wrong repository.
 *
 * WHAT THIS MUST NOT TOUCH. Lane ids, names, folders, bindings, run history,
 * agent sessions, questions, structured reports, audit records. It writes
 * exactly one field, `repository_id`, and only where it is currently absent.
 *
 * FAIL CLOSED. A lane that cannot be attributed safely is left UNATTRIBUTED and
 * reported. It is not defaulted to Alloy — defaulting is the failure mode this
 * exists to prevent.
 */
import { existsSync } from "node:fs";

import {
  ALLOY_REPOSITORY_ID,
  ensureAlloyRepository,
  getRepository,
  inspectGitPath,
} from "./repository-registry.mjs";
import {
  listDurableLanes,
  publicDurableLane,
  setLaneRepository,
} from "./development-lane.mjs";

/**
 * A fingerprint of everything migration is forbidden to change.
 *
 * Taken before and after, it turns "nothing else changed" from a claim into a
 * comparison.
 */
export function laneInvariantSnapshot({ root = undefined } = {}) {
  const out = {};
  for (const rec of listDurableLanes(root)) {
    out[rec.lane_id] = {
      name: rec.name,
      status: rec.status,
      folder_id: rec.folder_id || null,
      worktree_path: rec.binding?.worktree_path || null,
      tmux_session: rec.binding?.tmux_session || null,
      branch: rec.binding?.branch || null,
      slot: rec.binding?.slot ?? null,
      mission_id: rec.mission_id || null,
      preferred_provider: rec.preferred_provider || null,
      aliases: [...(rec.aliases || [])].sort(),
      created_at: rec.created_at,
    };
  }
  return out;
}

export function diffInvariants(before, after) {
  const changed = [];
  for (const [laneId, was] of Object.entries(before)) {
    const now = after[laneId];
    if (!now) { changed.push({ lane_id: laneId, field: "*", reason: "lane_disappeared" }); continue; }
    for (const [k, v] of Object.entries(was)) {
      const b = JSON.stringify(v);
      const a = JSON.stringify(now[k]);
      if (b !== a) changed.push({ lane_id: laneId, field: k, before: v, after: now[k] });
    }
  }
  for (const laneId of Object.keys(after)) {
    if (!before[laneId]) changed.push({ lane_id: laneId, field: "*", reason: "lane_appeared" });
  }
  return changed;
}

/**
 * Can this lane be proven to belong to Alloy?
 *
 * Three honest outcomes:
 *  - bound to a worktree that resolves to Alloy's Git object store  → attribute
 *  - bound to nothing at all (a planning or unprovisioned lane)     → attribute,
 *    because it predates the registry and has no competing evidence
 *  - bound to a worktree resolving elsewhere, or to a path that no longer
 *    exists                                                        → REFUSE
 */
export async function attributionForLane(rec, { alloy, git = null } = {}) {
  const path = rec?.binding?.worktree_path || null;
  if (!path) {
    return { ok: true, repository_id: ALLOY_REPOSITORY_ID, evidence: "pre_registry_unbound_lane" };
  }
  if (!existsSync(path)) {
    // The binding names a path that is gone. We cannot prove which repository
    // it belonged to, so we do not claim one.
    return { ok: false, reason: "worktree_missing", path };
  }
  const info = await inspectGitPath(path, { git });
  if (!info.ok) return { ok: false, reason: info.error, path };
  if (info.git_common_dir !== alloy.git_common_dir) {
    return { ok: false, reason: "different_git_object_store", path, git_common_dir: info.git_common_dir };
  }
  return { ok: true, repository_id: ALLOY_REPOSITORY_ID, evidence: "git_common_dir_match", git_common_dir: info.git_common_dir };
}

/**
 * Backfill. Idempotent: a lane that already carries an attribution is skipped,
 * so running this on every Gateway start is safe and cheap.
 */
export async function migrateLanesToAlloy({
  root = undefined,
  git = null,
  dryRun = false,
  nowMs = Date.now(),
} = {}) {
  const ensured = await ensureAlloyRepository({ root, git, nowMs, persist: !dryRun });
  if (!ensured.ok) return { ok: false, error: ensured.error, detail: ensured.root || null };
  // In a dry run the record may not be on disk, so compare against the one we
  // would have written rather than reading back nothing.
  const alloy = getRepository(ALLOY_REPOSITORY_ID, root)
    || (dryRun ? ensured.repository : null);
  if (!alloy) return { ok: false, error: "alloy_repository_missing" };

  const before = laneInvariantSnapshot({ root });
  const attributed = [];
  const skipped = [];
  const refused = [];

  for (const rec of listDurableLanes(root)) {
    if (rec.repository_id) { skipped.push({ lane_id: rec.lane_id, repository_id: rec.repository_id }); continue; }
    const verdict = await attributionForLane(rec, { alloy, git });
    if (!verdict.ok) {
      refused.push({ lane_id: rec.lane_id, name: rec.name, ...verdict });
      continue;
    }
    if (!dryRun) {
      const set = setLaneRepository(rec.lane_id, verdict.repository_id, { expectCurrent: null, nowMs, root });
      if (!set.ok) { refused.push({ lane_id: rec.lane_id, reason: set.error }); continue; }
    }
    attributed.push({ lane_id: rec.lane_id, name: rec.name, evidence: verdict.evidence });
  }

  const after = laneInvariantSnapshot({ root });
  const drift = diffInvariants(before, after);

  return {
    ok: true,
    dry_run: dryRun,
    repository_id: ALLOY_REPOSITORY_ID,
    repository_created: ensured.created === true,
    attributed,
    skipped,
    refused,
    // Empty means migration touched nothing it was forbidden to touch.
    invariant_drift: drift,
    lane_count: Object.keys(after).length,
  };
}

/** Lanes with no repository attribution — surfaced rather than hidden. */
export function unattributedLanes({ root = undefined } = {}) {
  return listDurableLanes(root)
    .filter((r) => !r.repository_id)
    .map((r) => publicDurableLane(r));
}
