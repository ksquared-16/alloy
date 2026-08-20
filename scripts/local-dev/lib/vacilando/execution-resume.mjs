/**
 * Vacilando Governor Phase 3 — automatic resource-grant resume.
 *
 * Resource grant does not change run state.
 * Continuation delivery is server-owned, exactly-once per grant episode,
 * and uses the existing lane send path. It is not an operator instruction.
 *
 * Automatic Claude continuation is allowed here.
 * Timing certification and broad self-healing are not.
 */
import {
  cwdOwnsRun,
  getExecutionRun,
  isTerminalRunState,
  transitionExecutionRun,
} from "./execution-run.mjs";
import {
  cleanupRunResources,
  emitResourceEvent,
  ensureGrantContinuation,
  getResourceRequest,
  normalizeResourceKey,
  patchResourceRequest,
  readComputeHolders,
  readResourceRequestStore,
  resourceGrantIsInjected,
  resumeStateFor,
  setResourceResumeHook,
} from "./execution-resource.mjs";
import { exclusiveWindowHolds } from "./execution-exclusive.mjs";
import { getDevelopmentLane, sendLaneInstruction } from "./lanes.mjs";

export const CONTINUATION_KIND = "resource_granted";
const RETRYABLE = new Set(["send_in_progress"]);
const UNAVAILABLE = new Set(["pane_unavailable", "lane_not_found", "target_mismatch", "worktree_mismatch"]);

let sendImpl = null;
let getLaneImpl = null;
const inflight = new Set();
const pending = [];

export function setResumeDeliveryImplForTests({ sendLaneInstruction: send, getDevelopmentLane: getLane } = {}) {
  sendImpl = send || null;
  getLaneImpl = getLane || null;
}

export function resetResumeForTests() {
  sendImpl = null;
  getLaneImpl = null;
  inflight.clear();
  pending.length = 0;
}

export async function flushGrantResumes() {
  const batch = pending.splice(0, pending.length);
  if (!batch.length) return [];
  return Promise.all(batch);
}

function schedule(rec, ctx) {
  const key = rec.request_id;
  if (inflight.has(key)) return;
  const p = deliverGrantContinuation(rec, ctx).finally(() => inflight.delete(key));
  inflight.add(key);
  pending.push(p);
}

export function installGrantResumeHook() {
  setResourceResumeHook((rec, ctx) => {
    schedule(rec, ctx);
  });
}

installGrantResumeHook();

function boundSummary(text, max = 200) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function resourceGrantedContinuationText({
  runId,
  resourceKey,
  label,
  holder = null,
  instructionSummary = null,
} = {}) {
  if (resourceKey === "runtime_timing_certification") {
    return [
      `Vacilando execution update for run ${runId}:`,
      "",
      "The exclusive timing window requested for this run is now active.",
      "The machine has been quiesced and the timing-certification resource is granted.",
      "",
      "Run the pending timing certification now.",
      "Do not expand scope.",
      "Release/report the resource when the timing-dependent validation is complete.",
    ].join("\n");
  }
  const name = label || resourceKey || "requested resource";
  const lines = [
    `Vacilando execution update for run ${runId}:`,
    "",
    `The ${name} resource requested for this run`,
    "has been granted and is now available.",
    "",
    `Continue the pending ${name} step for the`,
    "already-approved instruction.",
    "",
    "Do not restart completed work.",
    "Do not expand scope.",
    "After this resource-dependent step, continue the existing run.",
  ];
  if (holder) lines.push("", `Lease holder: ${holder}`);
  if (instructionSummary) {
    const ref = String(instructionSummary).replace(/\s+/g, " ").trim();
    const clipped = ref.length > 200 ? `${ref.slice(0, 199)}…` : ref;
    if (clipped) lines.push("", `Approved instruction (reference): ${clipped}`);
  }
  return lines.join("\n");
}

function latestRequest(rec, root) {
  return getResourceRequest(rec.request_id, root) || rec;
}

function grantStillHeld(rec, root) {
  const def = normalizeResourceKey(rec.resource_key);
  if (def?.class === "MACHINE_EXCLUSIVE") {
    return exclusiveWindowHolds(rec, root);
  }
  if (resourceGrantIsInjected()) return true;
  if (!def?.authority_key || !rec.holder) return true;
  return readComputeHolders(def.authority_key).some((h) => h.holder === rec.holder);
}

async function failUnavailable(rec, run, error, { root, nowMs, origin = "governor" }) {
  patchResourceRequest(rec.request_id, {
    continuation: {
      delivery_state: "FAILED",
      last_error: error,
    },
  }, { root, event: "continuation_failed", extra: { error } });
  cleanupRunResources(rec.run_id, { origin, nowMs, root });
  if (run && !isTerminalRunState(run.state)) {
    transitionExecutionRun(run.run_id, "NEEDS_INPUT", {
      reason: error,
      origin,
      nowMs,
      root,
      completion_report: { summary: error },
    });
  }
  return { ok: false, error, continuation_failed: true };
}

export async function deliverGrantContinuation(rec, {
  root,
  nowMs = Date.now(),
  sendLaneInstruction: send = sendImpl,
  getDevelopmentLane: getLane = getLaneImpl,
} = {}) {
  if (!rec?.request_id) return { ok: false, error: "request_not_found" };
  rec = latestRequest(rec, root);
  if (rec.state !== "GRANTED") return { ok: false, error: "not_granted" };

  const def = normalizeResourceKey(rec.resource_key);
  const resumeTo = def?.resume_state || resumeStateFor(rec.resource_key);
  if (!resumeTo) return { ok: false, error: "resume_unsupported" };

  rec = ensureGrantContinuation(rec, { root, nowMs });
  const cont = rec.continuation;
  if (!cont?.continuation_id) return { ok: false, error: "continuation_missing" };

  if (cont.delivery_state === "DELIVERED") {
    return { ok: true, duplicate: true, request: rec };
  }
  if (cont.delivery_state === "DELIVERING") {
    return { ok: false, error: "delivery_in_flight", ambiguous: true };
  }

  const run = getExecutionRun(rec.run_id, root);
  if (!run) return { ok: false, error: "run_not_found" };
  if (run.lane_id !== rec.lane_id) return { ok: false, error: "lane_mismatch" };
  if (isTerminalRunState(run.state)) {
    cleanupRunResources(rec.run_id, { origin: "system", nowMs, root });
    return { ok: false, error: "run_terminal" };
  }
  if (run.state !== "WAITING_RESOURCE") {
    return { ok: false, error: "run_not_waiting" };
  }

  if (!grantStillHeld(rec, root)) {
    patchResourceRequest(rec.request_id, {
      continuation: { delivery_state: "FAILED", last_error: "grant_lost" },
    }, { root, event: "continuation_failed", extra: { error: "grant_lost" } });
    emitResourceEvent("resource_grant_drift", rec, root, { error: "grant_lost" });
    return { ok: false, error: "grant_lost" };
  }

  rec = patchResourceRequest(rec.request_id, {
    continuation: { delivery_state: "DELIVERING" },
  }, { root, event: "continuation_delivery_started", extra: { continuation_id: cont.continuation_id } }) || rec;

  const sendFn = send || sendLaneInstruction;
  const laneFn = getLane || getDevelopmentLane;
  let lane = null;
  try {
    const found = await laneFn(rec.lane_id, { includeGitFacts: false });
    lane = found?.lane || found;
    if (!found?.ok && !lane?.lane_id) {
      return failUnavailable(rec, run, found?.error || "lane_not_found", { root, nowMs });
    }
  } catch {
    return failUnavailable(rec, run, "lane_not_found", { root, nowMs });
  }

  const wt = lane?.worktree?.path || null;
  if (run.worktree_path && wt && !cwdOwnsRun(run, wt)) {
    return failUnavailable(rec, run, "worktree_mismatch", { root, nowMs });
  }
  if (lane && lane.tmux && lane.tmux.alive === false) {
    return failUnavailable(rec, run, "pane_unavailable", { root, nowMs });
  }

  const text = resourceGrantedContinuationText({
    runId: rec.run_id,
    resourceKey: rec.resource_key,
    label: def?.label || rec.resource_key,
    holder: rec.holder,
    instructionSummary: boundSummary(run.instruction),
  });

  let out;
  try {
    out = await sendFn(rec.lane_id, text, {
      actor: "governor",
      nowMs,
      duplicateWindowMs: 0,
      dedupeKey: cont.continuation_id,
    });
  } catch (e) {
    rec = patchResourceRequest(rec.request_id, {
      continuation: {
        delivery_state: "FAILED",
        last_error: "delivery_failed",
        attempt_count: (cont.attempt_count || 0) + 1,
      },
    }, { root, event: "continuation_failed", extra: { error: "delivery_failed" } }) || rec;
    return { ok: false, error: "delivery_failed", request: rec };
  }

  const err = out?.error || (out?.ok && out.status === "delivered" ? null : (out?.status === "failed" ? "delivery_failed" : "delivery_failed"));
  const attempts = (cont.attempt_count || 0) + 1;

  if (out?.ok && out.status === "delivered") {
    rec = patchResourceRequest(rec.request_id, {
      continuation: {
        delivery_state: "DELIVERED",
        delivered_at: out.delivered_at || new Date(nowMs).toISOString(),
        attempt_count: attempts,
        last_error: null,
      },
    }, { root, event: "continuation_delivered", extra: { continuation_id: cont.continuation_id } }) || rec;

    const stillWaiting = getExecutionRun(rec.run_id, root);
    if (stillWaiting?.state === "WAITING_RESOURCE") {
      const resumed = transitionExecutionRun(rec.run_id, resumeTo, {
        reason: "resource_granted_resume",
        origin: "governor",
        nowMs,
        root,
        phase: resumeTo === "VALIDATING" ? "validation" : undefined,
        progress: `${def?.label || rec.resource_key} granted; run resumed automatically`,
        worktreePath: out.worktree_path || wt,
      });
      emitResourceEvent("run_resumed", rec, root, {
        continuation_id: cont.continuation_id,
        to: resumeTo,
      });
      return { ok: true, delivered: true, request: rec, run: resumed.run, send: out };
    }
    return { ok: true, delivered: true, request: rec, send: out };
  }

  if (err === "duplicate_send") {
    rec = patchResourceRequest(rec.request_id, {
      continuation: {
        delivery_state: "DELIVERED",
        delivered_at: new Date(nowMs).toISOString(),
        attempt_count: attempts,
        last_error: null,
      },
    }, { root, event: "continuation_delivered", extra: { continuation_id: cont.continuation_id, duplicate_send: true } }) || rec;
    const stillWaiting = getExecutionRun(rec.run_id, root);
    if (stillWaiting?.state === "WAITING_RESOURCE") {
      transitionExecutionRun(rec.run_id, resumeTo, {
        reason: "resource_granted_resume",
        origin: "governor",
        nowMs,
        root,
        phase: resumeTo === "VALIDATING" ? "validation" : undefined,
        progress: `${def?.label || rec.resource_key} granted; run resumed automatically`,
      });
      emitResourceEvent("run_resumed", rec, root, { continuation_id: cont.continuation_id, to: resumeTo });
    }
    return { ok: true, delivered: true, duplicate: true, request: rec };
  }

  if (UNAVAILABLE.has(err)) {
    return failUnavailable(rec, run, err, { root, nowMs });
  }

  rec = patchResourceRequest(rec.request_id, {
    continuation: {
      delivery_state: RETRYABLE.has(err) && attempts < 2 ? "PENDING" : "FAILED",
      last_error: err || "delivery_failed",
      attempt_count: attempts,
    },
  }, { root, event: "continuation_failed", extra: { error: err || "delivery_failed" } }) || rec;

  return { ok: false, error: err || "delivery_failed", retryable: RETRYABLE.has(err), request: rec };
}

export async function reconcileGrantContinuations({
  root,
  nowMs = Date.now(),
  sendLaneInstruction: send,
  getDevelopmentLane: getLane,
} = {}) {
  const store = readResourceRequestStore(root);
  const summary = { delivered: 0, repaired: 0, skipped: 0, failed: 0 };
  for (const rec of store.requests || []) {
    if (rec.state !== "GRANTED") continue;
    const run = getExecutionRun(rec.run_id, root);
    if (!run || isTerminalRunState(run.state)) {
      summary.skipped += 1;
      continue;
    }
    const st = rec.continuation?.delivery_state;
    if (st === "DELIVERED" && run.state === "WAITING_RESOURCE") {
      const to = resumeStateFor(rec.resource_key);
      if (to) {
        transitionExecutionRun(run.run_id, to, {
          reason: "resource_granted_resume",
          origin: "governor",
          nowMs,
          root,
          phase: to === "VALIDATING" ? "validation" : undefined,
          progress: "Repaired run state after confirmed continuation delivery",
        });
        emitResourceEvent("run_resumed", rec, root, { continuation_id: rec.continuation.continuation_id, repaired: true });
        summary.repaired += 1;
      } else {
        summary.skipped += 1;
      }
      continue;
    }
    if (st === "DELIVERING") {
      summary.skipped += 1;
      continue;
    }
    if (run.state === "WAITING_RESOURCE" && (!st || st === "PENDING")) {
      const out = await deliverGrantContinuation(rec, { root, nowMs, sendLaneInstruction: send, getDevelopmentLane: getLane });
      if (out.ok && out.delivered) summary.delivered += 1;
      else if (out.ambiguous) summary.skipped += 1;
      else summary.failed += 1;
      continue;
    }
    summary.skipped += 1;
  }
  return summary;
}
