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
 * Does not auto-release on Execution Run COMPLETE.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";

import {
  canonicalLaneStoreId,
  getDurableLane,
  isRuntimeAdoptionBlocked,
  releaseDurableLaneRuntimeBinding,
  setDurableLaneExecutionCapacity,
} from "./development-lane.mjs";
import { activeRunForLane, isTerminalRunState, listExecutionRunsForLane, transitionExecutionRun } from "./execution-run.mjs";
import {
  ADMISSION_OCCUPYING,
  admissionForLane,
  evaluateAdmissionQueue,
  transitionAdmission,
} from "./execution-admission.mjs";
import { activeAgentSessionForLane, endAgentSession } from "./agent-session.mjs";
import { readResourceRequestStore } from "./execution-resource.mjs";
import { maybeCreateCheckpoint } from "./source-control.mjs";
import { TMUX_SESSION_RE } from "./lanes.mjs";

export const RELEASE_COMMAND = "lane.release_execution_capacity";

const UNSAFE_RUN = new Set([
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
 * Is this lane's open admission a claim it cannot possibly be granted?
 *
 * Proof, not inference. All of these must hold:
 *   - the lane has no runtime binding, so provisioning cannot start
 *   - an admission is open (QUEUED / ADMITTED / PROVISIONING)
 *   - the run behind it never started
 * A lane that is merely waiting its turn WITH a binding is untouched.
 */
export function staleAdmissionFacts(rec, { root = runtimeRoot() } = {}) {
  if (!rec?.lane_id) return { stale: false, reason: "lane_not_found" };
  const bound = rec.binding?.slot != null || Boolean(rec.binding?.tmux_session) || Boolean(rec.binding?.worktree_path);
  if (bound) return { stale: false, reason: "lane_is_bound" };
  const adm = admissionForLane(rec.lane_id, root);
  const state = String(adm?.state || "").toUpperCase();
  if (!adm || !["QUEUED", "ADMITTED", "PROVISIONING"].includes(state)) {
    return { stale: false, reason: "no_open_admission" };
  }
  const run = latestRunForLane(rec.lane_id, root);
  if (run?.started_at) return { stale: false, reason: "run_started" };
  if (run && UNSAFE_RUN.has(run.state)) return { stale: false, reason: "unsafe_in_flight" };
  return {
    stale: true,
    admission_id: adm.admission_id,
    admission_state: state,
    requested_at: adm.requested_at || null,
    run_id: run?.run_id || null,
    run_state: run?.state || null,
    reason: "lane_has_no_runtime_binding",
  };
}

/**
 * Cancel a proven-dead admission through the canonical capacity owner
 * (execution-admission), and fail its run with the same reason so the ledger
 * and the queue tell one story. Never invents a second capacity store.
 */
export function cancelUnprovisionableAdmission(rec, {
  origin = "operator",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const facts = staleAdmissionFacts(rec, { root });
  if (!facts.stale) return { cancelled: false, ...facts };
  const out = transitionAdmission(facts.admission_id, "CANCELLED", {
    reason: facts.reason,
    nowMs,
    root,
  });
  if (!out.ok) return { cancelled: false, ...facts, error: out.error };
  let runClosed = null;
  if (facts.run_id && facts.run_state && !isTerminalRunState(facts.run_state)) {
    const failed = transitionExecutionRun(facts.run_id, "FAILED", {
      reason: "unprovisionable_admission",
      origin,
      nowMs,
      root,
      completion_report: {
        summary: "Queued for capacity this lane cannot receive: no runtime binding. Admission cancelled; instruction preserved.",
      },
    });
    runClosed = failed.ok ? failed.run.state : null;
  }
  return {
    cancelled: true,
    admission_id: facts.admission_id,
    prior_admission_state: facts.admission_state,
    requested_at: facts.requested_at,
    run_id: facts.run_id,
    run_state: runClosed || facts.run_state,
    reason: facts.reason,
  };
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
    // A lane with no runtime binding cannot be provisioned. If it is ALSO
    // holding an open admission, that admission is a claim on capacity it can
    // never receive — and this early return was the reason nothing ever cleared
    // it. Observed: two lanes reading "Queued for capacity" for three days.
    const stale = cancelUnprovisionableAdmission(rec, { origin, nowMs, root });
    if (stale?.cancelled) {
      try { await reevaluateAdmission(root); } catch { /* queue re-evaluates on the next tick */ }
    }
    return {
      ok: true,
      already_idle: true,
      command: RELEASE_COMMAND,
      lane_id: rec.lane_id,
      execution_capacity: { state: "IDLE" },
      ...(stale?.cancelled ? { stale_admission_cancelled: stale } : {}),
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
          // A checkpoint now requires an explicit path manifest, so this path
          // no longer commits on the lane's behalf. Say what to run instead —
          // the alternative was the automatic broad commit this replaced.
          const detail = ck?.error === "checkpoint_requires_manifest"
            ? "This lane has uncommitted work and Vacilando no longer commits it automatically. Run vac checkpoint-create with the paths to keep, or release after committing by hand."
            : (ck?.detail || ck?.error || "checkpoint_failed");
          return {
            ok: false,
            error: "source_control_gate",
            command: RELEASE_COMMAND,
            detail,
            checkpoint_error: ck?.error || null,
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
  if (Number.isInteger(Number(slot)) && Number(slot) >= 1) {
    const finished = await finishSprint(slot, Boolean(run?.checkpoint_ready));
    if (!finished?.ok) {
      setDurableLaneExecutionCapacity(rec.lane_id, {
        state: rec.execution_capacity?.state || "RUNNING",
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
  // Same live count the admission gate uses, so the number the operator READS
  // is the number that decides whether their lane starts.
  let providerPanes = null;
  try {
    const { listTmuxPanesRaw, parseTmuxPaneLines } = await import("./lanes.mjs");
    const raw = await listTmuxPanesRaw();
    if (raw?.ok) providerPanes = parseTmuxPaneLines(raw.stdout);
  } catch { /* metadata fallback */ }
  const provision = assessProvisionCapacity({ root, ...(providerPanes ? { providerPanes } : {}) });
  const { summarizeExecutionCapacity } = await import("../../apps/vacilando/public/gateway-view.mjs");
  const ui = summarizeExecutionCapacity(lanes, {
    max_active: provision.max_providers,
    max_providers: provision.max_providers,
  });
  // ONE authoritative number, and it is the LIVE one.
  //
  // `ui.active` counts lane posture: lanes whose run is in an occupying state.
  // A lane can hold a live provider with NO active run — Runtime Performance
  // did exactly that: pid 24584 alive in its worktree, run `none`, so posture
  // counted 2 while three real Claude processes held all three seats. Admission
  // gates on this number, so Vacilando believed a seat was free and would have
  // started a fourth provider over the ceiling.
  //
  // Provider capacity is about PROCESSES, so the process count decides.
  const holders = provision.provider_holders || [];
  const liveActive = Number.isFinite(provision.active_providers)
    ? provision.active_providers
    : holders.length;
  // Live processes only. Taking max(ui.active) re-introduced ghost occupancy:
  // leftover RUNNING claims and status-only NEEDS_INPUT lanes inflated the
  // count, Vacilando reported 0 seats, and Trust/Surfaces could not start.
  const active = Math.max(liveActive, holders.length);
  const available = Math.max(0, provision.max_providers - active);
  return {
    ...ui,
    active,
    max_active: provision.max_providers,
    occupied_slots: provision.occupied_slots,
    free_slots: provision.free_slots,
    active_providers: provision.active_providers,
    provider_holders: holders,
    counted_from: provision.counted_from || null,
    // Lanes whose posture occupies a seat, kept for display — never for the
    // arithmetic that gates admission.
    posture_active: ui.active || 0,
    available,
    blockers: available > 0
      ? (provision.blockers || []).filter((b) => b !== "provider_capacity")
      : Array.from(new Set(["provider_capacity", ...(provision.blockers || [])])),
  };
}
