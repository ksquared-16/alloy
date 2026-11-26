/**
 * Governor — source-control health and policy.
 *
 * Level 1 local checkpoint: may automate at an explicit coherent boundary.
 * Level 2 durability push: NOT autonomous (commit never implies push).
 * Level 3 sync from base: conservative; clean + scheduled + conflict-free.
 * Level 4 promotion: never automatic in this slice.
 *
 * Does not run expensive Git on every UI poll. Derives posture from cached
 * git facts plus a cheap JSON store. Does not parse TUI prose.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { canonicalLaneStoreId, getDurableLane } from "./development-lane.mjs";
import { activeRunForLane, patchRunFields } from "./execution-run.mjs";

export const SOURCE_CONTROL_SCHEMA = "vacilando.source_control.v1";
export const SCM_POSTURES = Object.freeze([
  "CURRENT",
  "CHECKPOINT_DUE",
  "SYNC_RECOMMENDED",
  "SYNC_REQUIRED",
  "CONFLICT",
  "PROMOTION_READY",
  "MERGED",
  "UNKNOWN",
]);

export const SCM_POLICY = Object.freeze({
  behind_recommend: 20,
  behind_require: 50,
  behind_block: 100,
  dirty_supporting_files: 20,
  dirty_supporting_ms: 2 * 60 * 60 * 1000,
  auto_push: false,
  auto_promote: false,
  auto_conflict_resolve: false,
  checkpoint_requires_explicit: true,
});

export const DURABILITY_PUSH_POLICY = Object.freeze({
  automatic: false,
  reason: "Alloy managed-sprint doctrine: commit never implies push; push/PR/merge require explicit operator authorization.",
  doctrine: "docs/platform/governance/managed-sprint-operations.md",
});

export const PROMOTION_POLICY = Object.freeze({
  automatic: false,
  reason: "Level 4 promotion (PR, merge, deploy) is operator/policy gated.",
});

const GARBAGE_MESSAGE = /^(checkpoint(\s+\d+)?|auto[ -]?commit|wip|tmp|temp)$/i;

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function sourceControlStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "source-control.json");
}

export function sourceControlEventsPath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "source-control-events.jsonl");
}

function emptyStore() {
  return { schema_version: SOURCE_CONTROL_SCHEMA, lanes: {} };
}

export function readSourceControlStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(sourceControlStorePath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    return {
      schema_version: SOURCE_CONTROL_SCHEMA,
      lanes: raw.lanes && typeof raw.lanes === "object" ? raw.lanes : {},
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store, root) {
  atomicWrite(sourceControlStorePath(root), store);
  return store;
}

export function emitScmEvent(type, rec, root, extra = {}) {
  try {
    const path = sourceControlEventsPath(root);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({
      at: new Date().toISOString(),
      type,
      lane_id: rec?.lane_id || extra.lane_id || null,
      run_id: rec?.run_id || extra.run_id || null,
      ...extra,
    })}\n`, "utf8");
  } catch { /* best-effort */ }
}

function laneRec(store, laneId) {
  const id = String(laneId || "");
  if (!store.lanes[id]) {
    store.lanes[id] = {
      lane_id: id,
      last_checkpoint_at: null,
      last_checkpoint_sha: null,
      last_checkpoint_summary: null,
      last_sync_at: null,
      last_base_observed: null,
      scheduled_sync: false,
      promotion_ready: false,
      last_posture: "CURRENT",
    };
  }
  return store.lanes[id];
}

export function getLaneSourceControl(laneId, root = runtimeRoot()) {
  const id = canonicalLaneStoreId(laneId, root);
  return readSourceControlStore(root).lanes[id] || null;
}

export function validCheckpointMessage(raw) {
  const t = String(raw || "").trim();
  if (!t || t.length < 8) return false;
  const first = t.split(/\n/)[0].trim();
  return !GARBAGE_MESSAGE.test(first);
}

export function boundCheckpointMessage(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ").split(/\n/)[0].trim().slice(0, 72);
}

/** True when Git drift is actionable before more work on this lane. */
export function laneNeedsGitSync(lane) {
  const runState = String(lane?.execution_run?.state || "");
  if (["EXECUTING", "VALIDATING", "WAITING_RESOURCE", "NEEDS_INPUT", "RECOVERING", "QUEUED"].includes(runState)) {
    return true;
  }
  const sess = String(lane?.agent_session?.state || "");
  return ["ACTIVE", "STARTING", "VERIFYING", "RESTARTING", "HANDOFF"].includes(sess);
}

/** PROMOTION_READY is never inferred from cleanliness. */
export function deriveSourceControlPosture({
  git = {},
  run = null,
  scm = null,
  nowMs = Date.now(),
  lane = null,
} = {}) {
  if (git.conflict === true || git.state === "conflict") {
    return { posture: "CONFLICT", reason: "unresolved_conflict" };
  }
  if (git.state === "unknown" || git.state === "missing") {
    return { posture: "UNKNOWN", reason: "git_unknown" };
  }
  if (scm?.promotion_ready === true) {
    return { posture: "PROMOTION_READY", reason: "explicit_promotion_review" };
  }
  const behind = Number(git.behind);
  const ahead = Number(git.ahead);
  const dirty = git.state === "dirty";
  const modified = Number(git.modified) || 0;
  const lastCommitMs = git.last_commit_at ? Date.parse(git.last_commit_at) : NaN;
  const dirtyAge = Number.isFinite(lastCommitMs) ? nowMs - lastCommitMs : 0;
  const merged = git.head_in_base === true && (!Number.isFinite(ahead) || ahead === 0);
  const active = lane == null ? true : laneNeedsGitSync(lane);

  if (merged) {
    return { posture: "MERGED", reason: "head_is_ancestor_of_base", behind: Number.isFinite(behind) ? behind : 0 };
  }
  if (!active && Number.isFinite(behind) && behind > 0 && (!Number.isFinite(ahead) || ahead === 0)) {
    return { posture: "MERGED", reason: "inactive_base_drift", behind };
  }

  if (active && Number.isFinite(behind) && behind >= SCM_POLICY.behind_require) {
    return {
      posture: "SYNC_REQUIRED",
      reason: behind >= SCM_POLICY.behind_block ? "material_base_drift" : "high_base_drift",
      behind,
    };
  }
  if (active && Number.isFinite(behind) && behind >= SCM_POLICY.behind_recommend) {
    return { posture: "SYNC_RECOMMENDED", reason: "moderate_base_drift", behind };
  }

  const explicitReady = Boolean(run?.checkpoint_ready);
  if (dirty && explicitReady) {
    return { posture: "CHECKPOINT_DUE", reason: "checkpoint_ready", explicit: true };
  }
  if (dirty && (modified >= SCM_POLICY.dirty_supporting_files || dirtyAge >= SCM_POLICY.dirty_supporting_ms)) {
    return { posture: "CHECKPOINT_DUE", reason: "bounded_dirty_accumulation", explicit: false };
  }
  if (dirty && (run?.state === "WAITING_RESOURCE" || run?.checkpoint_requested)) {
    return { posture: "CHECKPOINT_DUE", reason: "safe_boundary_dirty", explicit: Boolean(run?.checkpoint_ready) };
  }
  return {
    posture: "CURRENT",
    reason: dirty ? "dirty_coherent_in_progress" : "clean",
    behind: Number.isFinite(behind) ? behind : 0,
    durability_push_recommended: Number(git.ahead) > 0 && SCM_POLICY.auto_push === false,
  };
}

export function publicSourceControl(lane, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  if (!lane?.lane_id) return null;
  const scm = getLaneSourceControl(lane.lane_id, root);
  const git = lane.git && typeof lane.git === "object" ? lane.git : {};
  const derived = deriveSourceControlPosture({ git, run: lane.execution_run, scm, nowMs, lane });
  return {
    posture: derived.posture,
    reason: derived.reason,
    branch: git.branch || lane.binding?.branch || null,
    ahead: git.ahead || 0,
    behind: git.behind || 0,
    dirty: git.state === "dirty",
    last_checkpoint_at: scm?.last_checkpoint_at || null,
    last_sync_at: scm?.last_sync_at || null,
    scheduled_sync: Boolean(scm?.scheduled_sync) || derived.posture === "SYNC_RECOMMENDED" || derived.posture === "SYNC_REQUIRED",
    durability_push: "operator_gated",
    durability_push_recommended: Boolean(derived.durability_push_recommended),
    promotion_ready: false,
    explicit_checkpoint: Boolean(derived.explicit),
    head_in_base: git.head_in_base ?? null,
  };
}

export function attachLaneSourceControl(lanes, root = runtimeRoot(), nowMs = Date.now()) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  const store = readSourceControlStore(root);
  let dirtyStore = false;
  const out = list.map((lane) => {
    const source_control = publicSourceControl(lane, { nowMs, root });
    if (!source_control) return lane;
    const rec = laneRec(store, lane.lane_id);
    if (rec.last_posture !== source_control.posture) {
      rec.last_posture = source_control.posture;
      rec.updated_at = iso(nowMs);
      if (source_control.posture === "SYNC_RECOMMENDED" || source_control.posture === "SYNC_REQUIRED") {
        rec.scheduled_sync = true;
        emitScmEvent("base_drift_detected", rec, root, { posture: source_control.posture, behind: source_control.behind });
        emitScmEvent("sync_scheduled", rec, root, { posture: source_control.posture });
      }
      dirtyStore = true;
    }
    return { ...lane, source_control };
  });
  if (dirtyStore) writeStore(store, root);
  return out;
}

let commitImpl = null;
let syncImpl = null;
let inspectImpl = null;
let lifecycleCheckImpl = null;

export function setSourceControlImplForTests(impl = {}) {
  commitImpl = typeof impl.commitCheckpoint === "function" ? impl.commitCheckpoint : null;
  syncImpl = typeof impl.syncWorktree === "function" ? impl.syncWorktree : null;
  inspectImpl = typeof impl.inspectGit === "function" ? impl.inspectGit : null;
  lifecycleCheckImpl = typeof impl.evaluateSafeCheckpoint === "function" ? impl.evaluateSafeCheckpoint : null;
}

export function resetSourceControlImplForTests() {
  commitImpl = null;
  syncImpl = null;
  inspectImpl = null;
  lifecycleCheckImpl = null;
}

export function resetSourceControlForTests(root = runtimeRoot()) {
  writeStore(emptyStore(), root);
  try {
    const p = sourceControlEventsPath(root);
    if (existsSync(p)) writeFileSync(p, "", "utf8");
  } catch { /* */ }
  resetSourceControlImplForTests();
}

async function inspectGit(worktreePath) {
  if (inspectImpl) return inspectImpl(worktreePath);
  const { inspectWorktreeGit } = await import("./alloy-dev-adapter.mjs");
  return inspectWorktreeGit(worktreePath);
}

async function lifecycleOk(lane, run, root) {
  if (lifecycleCheckImpl) return lifecycleCheckImpl({ lane, run, root });
  try {
    const { evaluateSafeCheckpoint } = await import("./agent-session-lifecycle.mjs");
    return evaluateSafeCheckpoint({ lane, run, root });
  } catch {
    return { ok: true, blockers: [] };
  }
}

export function requestCheckpoint(laneId, {
  origin = "governor",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const id = canonicalLaneStoreId(laneId, root);
  const run = activeRunForLane(id, root);
  emitScmEvent("checkpoint_requested", { lane_id: id, run_id: run?.run_id }, root, { origin });
  if (run?.run_id) {
    patchRunFields(run.run_id, { checkpoint_requested: true }, { nowMs, root });
  }
  return { ok: true, requested: true, will_commit: Boolean(run?.checkpoint_ready) };
}

/**
 * Local checkpoint commit only when checkpoint_ready was explicitly reported
 * and independent Git/lifecycle verification passes. Never pushes.
 */
export async function maybeCreateCheckpoint({
  laneId,
  origin = "governor",
  summary = null,
  paths = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
  requireExplicit = SCM_POLICY.checkpoint_requires_explicit,
} = {}) {
  const id = canonicalLaneStoreId(laneId, root);
  const rec = getDurableLane(id, root);
  const run = activeRunForLane(id, root);
  const path = rec?.binding?.worktree_path || run?.worktree_path;
  emitScmEvent("checkpoint_requested", { lane_id: id, run_id: run?.run_id }, root, { origin });

  // THE GATE THAT WASN'T. This used to read
  // `requireExplicit && !run?.checkpoint_ready`, and the only caller that
  // reached it was `vac run-status --checkpoint-ready`, which set that very flag
  // moments earlier in the same call. The check could not refuse the one path it
  // existed to govern, and 67 unrelated files went into a lane branch twice.
  //
  // A checkpoint is now a manifest operation. Without an explicit list of paths
  // there is no authorization to commit anything, and there is no flag that
  // restores the old behaviour — see checkpoint-create for the sanctioned owner.
  const manifest = Array.isArray(paths) ? paths.map(String).filter(Boolean) : [];
  if (!manifest.length) {
    emitScmEvent("checkpoint_refused", { lane_id: id, run_id: run?.run_id }, root, {
      error: "checkpoint_requires_manifest",
      origin,
    });
    return {
      ok: false,
      skipped: true,
      error: "checkpoint_requires_manifest",
      detail: "A checkpoint must name the paths it commits. Use vac checkpoint-create.",
    };
  }
  if (requireExplicit && !run?.checkpoint_ready) {
    return { ok: false, skipped: true, error: "checkpoint_not_explicit" };
  }
  if (!path) return { ok: false, error: "missing_worktree" };

  const life = await lifecycleOk(rec || { lane_id: id }, run, root);
  if (life && life.ok === false) {
    emitScmEvent("checkpoint_failed", { lane_id: id, run_id: run?.run_id }, root, {
      error: "unsafe_lifecycle",
      blockers: life.blockers,
    });
    return { ok: false, error: "unsafe_lifecycle", blockers: life.blockers };
  }

  const git = await inspectGit(path);
  if (git?.conflict) {
    emitScmEvent("checkpoint_failed", { lane_id: id }, root, { error: "conflict" });
    return { ok: false, error: "conflict" };
  }
  if (!git?.dirty) return { ok: false, skipped: true, error: "clean" };
  if (git?.ambiguous) {
    emitScmEvent("checkpoint_failed", { lane_id: id }, root, { error: "ambiguous_git" });
    return { ok: false, error: "ambiguous_git" };
  }

  const message = boundCheckpointMessage(summary || run?.checkpoint_summary || "");
  if (!validCheckpointMessage(message)) {
    emitScmEvent("checkpoint_failed", { lane_id: id }, root, { error: "invalid_message" });
    return { ok: false, error: "invalid_message" };
  }

  let committed;
  try {
    if (commitImpl) committed = await commitImpl({ path, message, laneId: id, paths: manifest });
    else {
      const { commitWorktreeCheckpoint } = await import("./alloy-dev-adapter.mjs");
      committed = await commitWorktreeCheckpoint({ path, message, paths: manifest });
    }
  } catch (e) {
    committed = { ok: false, error: String(e && e.message || e) };
  }
  if (!committed?.ok) {
    emitScmEvent("checkpoint_failed", { lane_id: id }, root, { error: committed?.error || "commit_failed" });
    return { ok: false, error: committed?.error || "commit_failed" };
  }

  const store = readSourceControlStore(root);
  const row = laneRec(store, id);
  row.last_checkpoint_at = iso(nowMs);
  row.last_checkpoint_sha = committed.sha || null;
  row.last_checkpoint_summary = message;
  row.updated_at = iso(nowMs);
  writeStore(store, root);
  if (run?.run_id) {
    patchRunFields(run.run_id, {
      checkpoint_ready: false,
      checkpoint_summary: message,
    }, { nowMs, root });
  }
  emitScmEvent("checkpoint_created", row, root, { sha: committed.sha, message, origin });
  return { ok: true, sha: committed.sha, message, pushed: false };
}

export async function maybeSyncFromBase({
  laneId,
  nowMs = Date.now(),
  root = runtimeRoot(),
  force = false,
} = {}) {
  const id = canonicalLaneStoreId(laneId, root);
  const rec = getDurableLane(id, root);
  const run = activeRunForLane(id, root);
  const path = rec?.binding?.worktree_path;
  const name = rec?.binding?.worktree_name;
  if (!path || !name) return { ok: false, error: "missing_worktree" };

  const git = await inspectGit(path);
  if (git?.conflict) {
    emitScmEvent("sync_conflict", { lane_id: id }, root, { kind: "preexisting" });
    return { ok: false, error: "conflict", needs_input: true };
  }
  if (git?.dirty && !force) return { ok: false, skipped: true, error: "dirty" };
  if (run && ["VALIDATING", "RECOVERING"].includes(run.state) && !force) {
    return { ok: false, skipped: true, error: "unsafe_phase" };
  }

  emitScmEvent("sync_started", { lane_id: id }, root, { worktree: name });
  let synced;
  try {
    if (syncImpl) synced = await syncImpl({ worktreeName: name, path });
    else {
      const { syncWorktreeFromBase } = await import("./alloy-dev-adapter.mjs");
      synced = await syncWorktreeFromBase({ worktreeName: name });
    }
  } catch (e) {
    synced = { ok: false, error: String(e && e.message || e) };
  }
  if (!synced?.ok) {
    if (synced?.conflict) {
      emitScmEvent("sync_conflict", { lane_id: id }, root, { kind: "semantic_or_unknown" });
      return { ok: false, error: "conflict", needs_input: true };
    }
    emitScmEvent("sync_failed", { lane_id: id }, root, { error: synced?.error || "sync_failed" });
    return { ok: false, error: synced?.error || "sync_failed" };
  }
  const store = readSourceControlStore(root);
  const row = laneRec(store, id);
  row.last_sync_at = iso(nowMs);
  row.scheduled_sync = false;
  row.last_base_observed = synced.base_head || row.last_base_observed;
  row.updated_at = iso(nowMs);
  writeStore(store, root);
  emitScmEvent("sync_completed", row, root);
  return { ok: true, synced: true };
}
