/**
 * Lane execution-capacity lifecycle.
 *
 * Development Lane = permanent specialist identity.
 * Slot = temporary execution capacity.
 *
 * Command: lane.release_execution_capacity
 * HTTP: POST /api/lanes/:id/runtime/release
 *
 * Does not delete the durable lane, worktree, or branch.
 * Does not auto-merge to staging. Does not adopt Runtime.
 * Idle sessions (no in-flight Execution Run) are released when queued work
 * is waiting, so the next lane can start without a manual Release click.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";

import {
  canonicalLaneStoreId,
  getDurableLane,
  isRuntimeAdoptionBlocked,
  listDurableLanes,
  releaseDurableLaneRuntimeBinding,
  setDurableLaneExecutionCapacity,
} from "./development-lane.mjs";
import { activeRunForLane, isTerminalRunState, listExecutionRunsForLane } from "./execution-run.mjs";
import {
  ADMISSION_OCCUPYING,
  admissionForLane,
  evaluateAdmissionQueue,
  queuedAdmissions,
  readAdmissionStore,
  resolveAdmissionWork,
  transitionAdmission,
} from "./execution-admission.mjs";
import { activeAgentSessionForLane, endAgentSession } from "./agent-session.mjs";
import { readResourceRequestStore } from "./execution-resource.mjs";
import { maybeCreateCheckpoint } from "./source-control.mjs";
import { TMUX_SESSION_RE } from "./lanes.mjs";

export const RELEASE_COMMAND = "lane.release_execution_capacity";

const UNSAFE_RUN = new Set([
  "QUEUED",
  "EXECUTING",
  "VALIDATING",
  "WAITING_RESOURCE",
  "RECOVERING",
  "NEEDS_INPUT",
]);

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

function normalizePath(p) {
  const raw = String(p || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  try { return realpathSync(raw); } catch { return resolve(raw); }
}

export function isProtectedWorktree(path) {
  const p = normalizePath(path).toLowerCase();
  if (!p) return false;
  const cwd = normalizePath(process.cwd()).toLowerCase();
  if (cwd && (p === cwd || cwd.startsWith(`${p}/`) || p.startsWith(`${cwd}/`))) return true;
  if (/vacilando-gateway/i.test(p)) return true;
  if (/wt5-vacilando-gateway-v2/.test(p)) return true;
  return false;
}

export function isProtectedSlot(slot) {
  const n = Number(slot);
  const mine = Number(process.env.ALLOY_SLOT || process.env.VACILANDO_SLOT);
  if (Number.isInteger(n) && Number.isInteger(mine) && n === mine) return true;
  return false;
}

function latestRunForLane(laneId, root) {
  const active = activeRunForLane(laneId, root);
  if (active) return active;
  const runs = listExecutionRunsForLane(laneId, root);
  return runs.find((r) => isTerminalRunState(r.state)) || runs[0] || null;
}

function grantedResourcesForLane(laneId, root) {
  const store = readResourceRequestStore(root);
  const id = canonicalLaneStoreId(laneId, root);
  return (store.requests || []).filter((r) =>
    (r.lane_id === laneId || r.lane_id === id) && r.state === "GRANTED"
  );
}

let releaseImpl = null;

export function setReleaseImplForTests(impl = {}) {
  releaseImpl = impl && typeof impl === "object" ? impl : null;
}

export function resetReleaseImplForTests() {
  releaseImpl = null;
}

async function inspectGit(worktreePath, root) {
  if (typeof releaseImpl?.inspectGit === "function") return releaseImpl.inspectGit(worktreePath);
  const { inspectWorktreeGit } = await import("./alloy-dev-adapter.mjs");
  return inspectWorktreeGit(worktreePath);
}

async function checkpointLane(laneId, root, nowMs) {
  if (typeof releaseImpl?.checkpoint === "function") {
    return releaseImpl.checkpoint({ laneId, root, nowMs });
  }
  return maybeCreateCheckpoint({
    laneId,
    origin: "lane.release_execution_capacity",
    summary: "Level 1 checkpoint before releasing execution capacity",
    nowMs,
    root,
  });
}

async function endSession(sessionId, root, nowMs) {
  if (typeof releaseImpl?.endSession === "function") {
    return releaseImpl.endSession({ sessionId, root, nowMs });
  }
  return endAgentSession(sessionId, { reason: "runtime_released", nowMs, root });
}

async function stopSession(tmuxSession) {
  if (typeof releaseImpl?.stopSession === "function") {
    return releaseImpl.stopSession({ tmuxSession });
  }
  const { stopPersistentAgentSession } = await import("./alloy-dev-adapter.mjs");
  return stopPersistentAgentSession({ tmuxSession });
}

async function finishSprint(slot, acknowledgeUncommitted) {
  if (typeof releaseImpl?.finishSprint === "function") {
    return releaseImpl.finishSprint({ slot, acknowledgeUncommitted });
  }
  const { releaseSprintSlot } = await import("./alloy-dev-adapter.mjs");
  return releaseSprintSlot({ slot, acknowledgeUncommitted });
}

async function reevaluateAdmission(root) {
  if (typeof releaseImpl?.evaluateAdmissionQueue === "function") {
    return releaseImpl.evaluateAdmissionQueue({ root });
  }
  return evaluateAdmissionQueue({ root });
}

/**
 * When the 3 provider slots are full but a lane has finished (no in-flight
 * run), release one idle session so the next queued instruction can start.
 */
export async function releaseIdleCapacityForQueuedWork({
  root = runtimeRoot(),
  nowMs = Date.now(),
} = {}) {
  const waiting = queuedAdmissions(readAdmissionStore(root)).filter((r) => !resolveAdmissionWork(r, root).stale);
  if (!waiting.length) return { ok: true, released: 0, skipped: "empty_queue" };

  const { assessSessionStartCapacity } = await import("./alloy-dev-adapter.mjs");
  const cap = await (typeof releaseImpl?.assessSessionStartCapacity === "function"
    ? releaseImpl.assessSessionStartCapacity()
    : assessSessionStartCapacity());
  if (cap && cap.ok !== false && cap.available !== false) {
    return { ok: true, released: 0, skipped: "capacity_available" };
  }

  const waitingIds = new Set(waiting.map((r) => r.lane_id));
  const idle = listDurableLanes(root)
    .filter((lane) => {
      if (waitingIds.has(lane.lane_id)) return false;
      if (!lane.binding?.tmux_session) return false;
      if (isProtectedWorktree(lane.binding?.worktree_path)) return false;
      if (isProtectedSlot(lane.binding?.slot)) return false;
      const run = activeRunForLane(lane.lane_id, root);
      if (run && UNSAFE_RUN.has(run.state)) return false;
      const adm = admissionForLane(lane.lane_id, root);
      if (adm && (adm.state === "PROVISIONING" || adm.state === "ADMITTED")) return false;
      return true;
    })
    .sort((a, b) => String(a.updated_at || a.created_at || "").localeCompare(String(b.updated_at || b.created_at || "")));

  for (const lane of idle) {
    const out = await releaseLaneExecutionCapacity(lane.lane_id, {
      origin: "governor_cycle",
      nowMs,
      root,
    });
    if (out?.ok && !out.already_idle) {
      return { ok: true, released: 1, lane_id: lane.lane_id, command: RELEASE_COMMAND };
    }
  }
  return { ok: true, released: 0, skipped: "no_safe_idle_lane" };
}

/**
 * Governed release of temporary execution capacity.
 * Preserves durable lane identity and worktree/branch.
 */
export async function releaseLaneExecutionCapacity(laneId, {
  origin = "operator",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const id = String(laneId || "").trim();
  if (!id) return { ok: false, error: "invalid_lane_id", command: RELEASE_COMMAND };
  const rec = getDurableLane(id, root);
  if (!rec) return { ok: false, error: "lane_not_found", command: RELEASE_COMMAND };

  if (isRuntimeAdoptionBlocked(rec.binding || rec)) {
    return { ok: false, error: "runtime_adoption_blocked", command: RELEASE_COMMAND };
  }
  const path = rec.binding?.worktree_path || null;
  if (isProtectedWorktree(path)) {
    return { ok: false, error: "protected_worktree", command: RELEASE_COMMAND };
  }
  const slot = rec.binding?.slot ?? null;
  if (isProtectedSlot(slot)) {
    return { ok: false, error: "protected_worktree", command: RELEASE_COMMAND, detail: "current_sprint_slot" };
  }

  const hasCapacity = rec.binding?.slot != null || Boolean(rec.binding?.tmux_session);
  if (!hasCapacity) {
    return {
      ok: true,
      already_idle: true,
      command: RELEASE_COMMAND,
      lane_id: rec.lane_id,
      execution_capacity: { state: "IDLE" },
    };
  }

  const run = latestRunForLane(rec.lane_id, root);
  if (run && UNSAFE_RUN.has(run.state)) {
    return {
      ok: false,
      error: "unsafe_in_flight",
      command: RELEASE_COMMAND,
      run_state: run.state,
    };
  }
  const cont = run?.resource_wait?.continuation_state;
  if (cont === "PENDING" || cont === "DELIVERING") {
    return { ok: false, error: "unsafe_in_flight", command: RELEASE_COMMAND, detail: "continuation_pending" };
  }

  const granted = grantedResourcesForLane(rec.lane_id, root);
  if (granted.length) {
    return {
      ok: false,
      error: "granted_resource",
      command: RELEASE_COMMAND,
      resources: granted.map((r) => r.resource_key),
    };
  }

  if (path) {
    const git = await inspectGit(path, root);
    if (git?.conflict || git?.ambiguous) {
      return {
        ok: false,
        error: "source_control_gate",
        command: RELEASE_COMMAND,
        posture: git.conflict ? "CONFLICT" : "AMBIGUOUS",
      };
    }
    if (git?.dirty) {
      if (run?.checkpoint_ready) {
        const ck = await checkpointLane(rec.lane_id, root, nowMs);
        if (!ck?.ok) {
          return {
            ok: false,
            error: "source_control_gate",
            command: RELEASE_COMMAND,
            detail: ck?.error || "checkpoint_failed",
          };
        }
      } else {
        return {
          ok: false,
          error: "source_control_gate",
          command: RELEASE_COMMAND,
          detail: "dirty_without_checkpoint",
          push_gated: true,
        };
      }
    }
  }

  setDurableLaneExecutionCapacity(rec.lane_id, {
    state: "FINISHING",
    started_at: iso(nowMs),
    origin,
  }, { nowMs, root });

  const session = activeAgentSessionForLane(rec.lane_id, root);
  if (session?.agent_session_id) {
    await endSession(session.agent_session_id, root, nowMs);
  }

  const tmux = rec.binding?.tmux_session;
  if (tmux && TMUX_SESSION_RE.test(String(tmux))) {
    const stopped = await stopSession(tmux);
    if (!stopped?.ok && !stopped?.already_gone) {
      setDurableLaneExecutionCapacity(rec.lane_id, {
        state: rec.execution_capacity?.state || "RUNNING",
        error: stopped.error || "tmux_kill_failed",
      }, { nowMs, root });
      return { ok: false, error: stopped.error || "tmux_kill_failed", command: RELEASE_COMMAND };
    }
  }

  let slotReleased = false;
  const managedSlot = Number.isInteger(Number(slot)) && Number(slot) >= 1
    && String(rec.binding?.provider || "claude") !== "cursor";
  if (managedSlot) {
    const finished = await finishSprint(slot, Boolean(run?.checkpoint_ready));
    if (!finished?.ok) {
      setDurableLaneExecutionCapacity(rec.lane_id, {
        state: rec.binding?.tmux_session ? "RUNNING" : "IDLE",
        error: finished.error || "sprint_finish_failed",
      }, { nowMs, root });
      return { ok: false, error: finished.error || "sprint_finish_failed", command: RELEASE_COMMAND };
    }
    slotReleased = true;
  }

  const released = releaseDurableLaneRuntimeBinding(rec.lane_id, { nowMs, root });
  if (!released.ok) return { ...released, command: RELEASE_COMMAND };

  const adm = admissionForLane(rec.lane_id, root);
  if (adm && ADMISSION_OCCUPYING.has(adm.state)) {
    transitionAdmission(adm.admission_id, "CANCELLED", {
      reason: "runtime_released",
      nowMs,
      root,
    });
  }

  const admission = await reevaluateAdmission(root);

  return {
    ok: true,
    command: RELEASE_COMMAND,
    lane_id: rec.lane_id,
    name: rec.name,
    worktree_path: released.lane?.binding?.worktree_path || path,
    branch: released.lane?.binding?.branch || rec.binding?.branch || null,
    previous_slot: released.previous_slot,
    slot_released: slotReleased,
    execution_capacity: { state: "IDLE" },
    lane_deleted: false,
    git_mutated: Boolean(run?.checkpoint_ready),
    auto_merged: false,
    runtime_adopted: false,
    admission,
  };
}

export async function summarizeHostExecutionCapacity(lanes, { root = runtimeRoot() } = {}) {
  const { assessProvisionCapacity } = await import("./alloy-dev-adapter.mjs");
  const provision = assessProvisionCapacity({ root });
  const { summarizeExecutionCapacity } = await import("../../apps/vacilando/public/gateway-view.mjs");
  const ui = summarizeExecutionCapacity(lanes, {
    max_active: provision.max_providers,
    max_providers: provision.max_providers,
  });
  const available = provision.available ? ui.available : 0;
  return {
    ...ui,
    max_active: provision.max_providers,
    occupied_slots: provision.occupied_slots,
    free_slots: provision.free_slots,
    active_providers: provision.active_providers,
    available,
    blockers: provision.blockers || [],
  };
}
