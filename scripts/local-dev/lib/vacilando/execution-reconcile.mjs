/**
 * Vacilando Governor Phase 5 — reconciliation pass.
 *
 * Compare desired Governor state to substrate and repair deterministic drift.
 * Known fault classes invoke a registered recovery policy. This is not a
 * workspace doctor and does not invent remediations.
 *
 * Sensor tiers:
 *   1. cheap local JSON / pid existence
 *   2. targeted compute permit / exclusive window
 *   3. doctor — not used on this pass
 */
import {
  getExecutionRun,
  isTerminalRunState,
} from "./execution-run.mjs";
import {
  queuedRequestsFor,
  readComputeHolders,
  readResourceRequestStore,
} from "./execution-resource.mjs";
import {
  evaluateExclusiveWindow,
  readExclusiveWindow,
} from "./execution-exclusive.mjs";
import { reconcileGrantContinuations } from "./execution-resume.mjs";
import {
  executeRecovery,
  listOwnedProcesses,
  scanStaleSlotPidFiles,
} from "./execution-recovery.mjs";
import { pidAlive, readControlPlaneOwner } from "./control-plane-health.mjs";

const ACTIVE = new Set(["REQUESTED", "QUEUED", "GRANTED"]);
let lastCheapMs = 0;
let lastPass = {
  repaired: 0,
  recovered: 0,
  skipped: 0,
  failed: 0,
  ms: 0,
  at: null,
};

export const SENSOR_TIERS = Object.freeze({
  1: "cheap local JSON / pid existence / exclusive window / run store",
  2: "targeted alloy-compute permit status and canonical recover",
  3: "workspace doctor — not used on the Governor hot path",
});

export function lastReconcilePass() {
  return { ...lastPass };
}

export async function reconcileGovernor({
  root,
  nowMs = Date.now(),
  reason = "manual",
  depth = "cheap",
  continuations = false,
} = {}) {
  const t0 = process.hrtime.bigint();
  const summary = {
    repaired: 0,
    recovered: 0,
    skipped: 0,
    failed: 0,
    actions: [],
    reason,
    depth,
  };

  const store = readResourceRequestStore(root);
  const requests = store.requests || [];

  for (const rec of requests) {
    if (!ACTIVE.has(rec.state)) continue;
    const run = getExecutionRun(rec.run_id, root);
    if (run && !isTerminalRunState(run.state)) continue;
    if (rec.state === "GRANTED" && String(rec.holder || "").startsWith("vac-erun_")) {
      const out = executeRecovery("stale_governor_resource_holder", {
        rec,
        root,
        nowMs,
        target: rec.request_id,
      });
      if (out.ok && out.verified) {
        summary.recovered += 1;
        summary.actions.push(out.policy);
      } else if (out.exhausted) summary.failed += 1;
      else summary.skipped += 1;
      continue;
    }
    if (rec.state === "QUEUED" || rec.state === "REQUESTED") {
      const drift = executeRecovery("resource_queue_drift", {
        rec,
        root,
        nowMs,
        kind: "terminal_queued",
        target: rec.request_id,
      });
      if (drift.ok) summary.repaired += 1;
      else summary.failed += 1;
    }
  }

  const exclusive = readExclusiveWindow(root);
  if (exclusive?.phase) {
    const owner = exclusive.run_id ? getExecutionRun(exclusive.run_id, root) : null;
    if (!owner || isTerminalRunState(owner?.state)) {
      const out = executeRecovery("exclusive_window_drift", {
        root,
        nowMs,
        target: exclusive.window_id || exclusive.request_id,
        lane_id: exclusive.lane_id,
        run_id: exclusive.run_id,
        resource_key: "runtime_timing_certification",
        rec: {
          lane_id: exclusive.lane_id,
          run_id: exclusive.run_id,
          resource_key: "runtime_timing_certification",
        },
      });
      if (out.ok) summary.repaired += 1;
      else summary.failed += 1;
    } else {
      evaluateExclusiveWindow(root, nowMs);
    }
  }

  if (depth !== "cheap") {
    const compute = readComputeHolders("browser-certification");
    const latest = readResourceRequestStore(root).requests || [];
    const grantedBrowser = latest.filter((r) => r.resource_key === "browser_certification" && r.state === "GRANTED");
    for (const rec of grantedBrowser) {
      const held = compute.some((h) => h.holder === rec.holder);
      if (!held && rec.holder) {
        const out = executeRecovery("resource_queue_drift", {
          rec,
          root,
          nowMs,
          kind: "granted_missing_lease",
          target: rec.request_id,
        });
        if (out.ok) summary.repaired += 1;
        else summary.failed += 1;
      }
    }
    for (const h of compute) {
      const runId = h.governor ? String(h.holder || "").replace(/^vac-/, "") : null;
      const govRun = runId ? getExecutionRun(runId, root) : null;
      if (h.governor && govRun && !isTerminalRunState(govRun.state)) continue;
      if (h.governor && latest.some((r) => r.holder === h.holder && r.state === "GRANTED")) continue;
      if (h.alive && !h.governor) {
        summary.skipped += 1;
        continue;
      }
      if (h.alive) continue;
      const out = executeRecovery("abandoned_browser_cert_lease", {
        holder: h.holder,
        permit: h,
        root,
        nowMs,
        target: h.holder,
      });
      if (out.ok && out.verified) summary.recovered += 1;
      else summary.skipped += 1;
    }

    const stillGranted = (readResourceRequestStore(root).requests || [])
      .some((r) => r.resource_key === "browser_certification" && r.state === "GRANTED");
    if (!stillGranted) {
      const q = queuedRequestsFor(readResourceRequestStore(root), "browser_certification");
      const liveForeign = readComputeHolders("browser-certification").some((h) => h.alive && !h.governor);
      if (q[0] && !liveForeign) {
        const out = executeRecovery("resource_queue_drift", {
          root,
          nowMs,
          kind: "idle_head",
          resource_key: "browser_certification",
          target: `idle:${q[0].request_id}`,
        });
        if (out.ok && !out.skipped) summary.repaired += 1;
      }
    }

    for (const rec of readResourceRequestStore(root).requests || []) {
      if (rec.state !== "GRANTED") continue;
      if (rec.continuation?.delivery_state !== "DELIVERING") continue;
      const run = getExecutionRun(rec.run_id, root);
      if (run?.state === "NEEDS_INPUT" || run?.state === "FAILED") continue;
      const out = executeRecovery("execution_command_timeout", {
        rec,
        root,
        nowMs,
        target: rec.continuation.continuation_id || rec.request_id,
      });
      if (out.ok) summary.repaired += 1;
    }

    for (const proc of listOwnedProcesses(root)) {
      if (proc.pid && pidAlive(proc.pid)) continue;
      const out = executeRecovery("disposable_cert_process", {
        rec: proc,
        root,
        nowMs,
        target: proc.id,
      });
      if (out.ok) summary.recovered += 1;
    }

    const owner = readControlPlaneOwner();
    if (owner?.pid && !pidAlive(owner.pid)) {
      const out = executeRecovery("stale_control_plane_owner", {
        root,
        nowMs,
        pid: process.pid,
        target: "control-plane",
      });
      if (out.ok && !out.skipped) summary.recovered += 1;
    }

    for (const file of scanStaleSlotPidFiles(root)) {
      const out = executeRecovery("stale_slot_pid", {
        path: file.path,
        pid: file.pid,
        root,
        nowMs,
        target: file.path,
      });
      if (out.ok) summary.recovered += 1;
      else summary.skipped += 1;
    }
  }

  if (continuations) {
    try {
      await reconcileGrantContinuations({ root, nowMs });
    } catch { /* Phase 3 already conservative */ }
  }

  try {
    const { reconcileStaleExecutionRuns } = await import("./execution-stale.mjs");
    const stale = reconcileStaleExecutionRuns({ root, nowMs });
    if (stale?.count > 0) {
      summary.repaired += stale.count;
      summary.actions.push("stale_execution_run");
    }
  } catch { /* stale-run pass must not fail resource reconcile */ }

  try {
    const { releaseIdleCapacityForQueuedWork } = await import("./lane-execution-capacity.mjs");
    const released = await releaseIdleCapacityForQueuedWork({ root, nowMs });
    if (released?.released > 0) {
      summary.repaired += released.released;
      summary.actions.push("idle_capacity_cycle");
    }
  } catch { /* idle release must not fail the resource pass */ }

  try {
    const { evaluateAdmissionQueue } = await import("./execution-admission.mjs");
    const admitted = await evaluateAdmissionQueue({ root, nowMs });
    if (admitted?.admitted > 0) summary.repaired += admitted.admitted;
  } catch { /* admission must not fail the resource pass */ }

  try {
    const { reconcilePendingOrientation, tickAutomaticSessionRotation } = await import("./agent-session-lifecycle.mjs");
    const orient = await reconcilePendingOrientation({ root, nowMs });
    if (orient?.retried > 0) summary.repaired += orient.retried;
    const rot = await tickAutomaticSessionRotation({ root, nowMs });
    if (rot?.considered > 0) summary.repaired += rot.considered;
  } catch { /* orientation retry / auto-rotation must not fail the resource pass */ }

  summary.ms = Number(process.hrtime.bigint() - t0) / 1e6;
  lastPass = { ...summary, at: new Date(nowMs).toISOString() };
  lastCheapMs = nowMs;
  return summary;
}

export async function maybeReconcileGovernor(opts = {}) {
  const now = opts.nowMs || Date.now();
  if (opts.reason === "lanes_poll" && now - lastCheapMs < 3000) {
    return { skipped: true, ...lastPass };
  }
  return reconcileGovernor({ ...opts, nowMs: now, depth: opts.depth || "cheap" });
}
