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

// finishSprint() USED TO LIVE HERE, and calling it is what retired Runtime
// Performance's worktree during a capacity release. Removing the call was not
// enough: a retirement helper sitting in a capacity module is the next caller
// waiting to be written. Worktree retirement now has exactly one owner,
// lane-worktree-lifecycle.closeDurableLane, and `releaseSprintSlot` has exactly
// one caller in the tree. The test seam below keeps `finishSprint` so a suite
// can still assert that this path NEVER reaches it.

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

  // "Is there capacity to release" is a question about the RUNTIME SESSION, not
  // about the lane's durable slot — which a release no longer discards, because
  // the slot belongs to the lane for its lifetime.
  const capacityState = String(rec.execution_capacity?.state || "").toUpperCase();
  const hasCapacity = Boolean(rec.binding?.tmux_session)
    || (capacityState && capacityState !== "IDLE");
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

  // ONE LANE OWNS ONE WORKTREE FOR THE LIFETIME OF THE LANE.
  //
  // THE DEFECT THIS REMOVES. This called alloy-sprint-finish, which "archives
  // metadata and marks the slot available" — it retires the worktree's MANAGED
  // REGISTRATION. That is a LANE-LIFETIME operation, and it was being run by a
  // CAPACITY-LIFETIME one. The directory survived; its managed identity did not.
  //
  // MEASURED. lane_73a897409906 (Runtime Performance) released capacity at
  // 2026-09-01T23:43:22.454Z; five seconds later wt1-work-unit-grade-a carried
  // ALLOY_WORKER_LIFECYCLE="finished" and its metadata had moved to finished/.
  // The lane stayed open and kept accepting instructions, so the fleet reached
  // the state this module's own header says is impossible: an active lane whose
  // worktree is unmanaged, unknown, slot-less and port-less. Every managed
  // environment operation for that lane then failed — no QA identity, no
  // browser session, no server on 3011.
  //
  // The header already promised "Does not delete the durable lane, worktree, or
  // branch." That was true of the lane record and false of the registration.
  // Releasing capacity now stops the processes and frees the RUNTIME BINDING —
  // the session, the tmux, the admission — and leaves the lane's worktree
  // registered, managed, known and slot-associated, because the lane is still
  // open. Retiring the registration belongs to explicit lane closure, which is
  // the only caller that may still reach alloy-sprint-finish.
  const slotReleased = false;

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

/**
 * TWO FACTS, AND ONLY ONE OF THEM GOVERNS.
 *
 * THE DEFECT. This panel reported RESIDENCY — every agent-bearing pane — and
 * then manufactured a `provider_capacity` blocker from it. Measured on the live
 * host: eight resident agents, ceiling eight, so the operator surface said
 * "8 / 8, All 8 agents are in use" and offered the release control. The
 * admission gate, asked at the same instant, said active_providers 1 of 8,
 * ok true, blockers none — it would have started another lane immediately.
 *
 * Nothing was actually refused: admission never reads this number. But the
 * operator was being told the host was full while the gate disagreed, which is
 * the one thing a capacity panel must never do.
 *
 * The two numbers answer different questions and both are worth showing:
 *
 *   execution capacity  what CONSUMES a provider seat — the admission answer,
 *                       and the only input to "can another lane start?"
 *   resident agents     how many provider processes are alive — operational
 *                       context, never a gate
 *
 * Admission semantics are not re-derived here. `assessSessionStartCapacity` is
 * called and its verdict used as-is, so this panel cannot drift from the gate:
 * if they ever disagree it is because the gate changed, and the panel follows.
 */
export async function summarizeHostExecutionCapacity(lanes, {
  root = runtimeRoot(),
  // Seams, in the shape this codebase already uses for `activeRun` and
  // `listPanesImpl`: a test must be able to STATE the world — n resident, m
  // consuming — instead of depending on the machine it happens to run on. ES
  // module bindings are read-only, so there is no monkey-patching alternative.
  assessProvision = null,
  assessAdmission = null,
} = {}) {
  const adapter = await import("./alloy-dev-adapter.mjs");
  const assessProvisionCapacity = assessProvision || adapter.assessProvisionCapacity;
  const assessSessionStartCapacity = assessAdmission || adapter.assessSessionStartCapacity;
  // Same live count the admission gate uses, so the number the operator READS
  // is the number that decides whether their lane starts.
  let providerPanes = null;
  try {
    const { discoverLivePanes } = await import("./lanes.mjs");
    // `discoverLivePanes` is the canonical boundary: it distinguishes "no tmux
    // server" (zero panes — a fact) from "tmux could not answer" (unknown).
    // Reading the raw exit code here treated a fresh host with no server as
    // unknown, which degrades capacity to a refusal and blocks every start.
    const seen = await discoverLivePanes();
    if (seen.ok) providerPanes = seen.panes;
  } catch { /* metadata fallback */ }
  const provision = assessProvisionCapacity({ root, ...(providerPanes ? { providerPanes } : {}) });
  // THE ADMISSION VERDICT, ASKED OF THE GATE ITSELF. Not recomputed from its
  // parts: re-wiring panes, lanes, sessions, ceiling, runStateFor and
  // suspensions here would be a second definition of provider liveness, and a
  // second definition is exactly what this change exists to remove.
  let admissionCap = null;
  try { admissionCap = await assessSessionStartCapacity({ root }); } catch { admissionCap = null; }
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
  // RESIDENCY: live provider processes. Reported, never a gate.
  const residentHolders = provision.provider_holders || [];
  const resident = Number.isFinite(provision.active_providers)
    ? provision.active_providers
    : residentHolders.length;

  // EXECUTION CAPACITY: what the gate counts. Falling back to residency when
  // the gate could not be asked is deliberate and conservative — it can only
  // over-report consumption, and over-reporting shows a blocker that admission
  // would also refuse to clear while it is in that state.
  const max = Number(admissionCap?.max_providers) || provision.max_providers;
  const consuming = Number.isFinite(admissionCap?.active_providers)
    ? admissionCap.active_providers
    : Math.max(resident, residentHolders.length);
  const available = Math.max(0, max - consuming);

  // Holders listed beside the count must be the ones the count is about, or the
  // panel names eight agents under the number one.
  // A holder with no tmux session name would render as an absolute path. The
  // name is already known — residency carries it, and so do the lanes — so
  // resolve it rather than showing the operator a filesystem path.
  const nameByPath = new Map(residentHolders
    .filter((h) => h?.path)
    .map((h) => [String(h.path).replace(/\/+$/, ""), h.name || null]));
  const nameByLane = new Map((Array.isArray(lanes) ? lanes : [])
    .filter((l) => l?.lane_id)
    .map((l) => [l.lane_id, l.label || l.name || null]));
  const consumingHolders = Array.isArray(admissionCap?.occupying)
    ? admissionCap.occupying.map((o) => {
      const path = o.cwd || null;
      const name = o.session
        || nameByLane.get(o.lane_id)
        || (path ? nameByPath.get(String(path).replace(/\/+$/, "")) : null)
        || (path ? String(path).split("/").filter(Boolean).pop() : null)
        || null;
      return { name, path, lane_id: o.lane_id || null };
    })
    : residentHolders;

  return {
    ...ui,
    active: consuming,
    max_active: max,
    occupied_slots: provision.occupied_slots,
    free_slots: provision.free_slots,
    active_providers: consuming,
    provider_holders: consumingHolders,
    counted_from: admissionCap ? "admission" : (provision.counted_from || null),
    // Operational context. Named differently from the governing number on
    // purpose — calling both of them "providers" is how they were confused.
    resident_providers: resident,
    resident_holders: residentHolders,
    resident_counted_from: provision.counted_from || null,
    // Lanes whose posture occupies a seat, kept for display — never for the
    // arithmetic that gates admission.
    posture_active: ui.active || 0,
    available,
    degraded: Boolean(admissionCap?.degraded),
    // THE BLOCKER BELONGS TO ADMISSION. It used to be manufactured here from
    // residency, which is how the panel came to claim "full" over a gate that
    // was open.
    blockers: available > 0
      ? (provision.blockers || []).filter((b) => b !== "provider_capacity")
      : Array.from(new Set(["provider_capacity", ...(provision.blockers || []).filter((b) => b !== "provider_capacity")])),
  };
}
