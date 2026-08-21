/**
 * Governor — Execution Admission Request.
 *
 * Boundary between “durable work exists” and “an execution environment can
 * be provisioned.” Not a second generic scheduler. Slot/worktree/tmux truth
 * lives in the Alloy development adapter.
 *
 * Creating a durable lane and starting its execution substrate are different
 * operations. A full slot table must not refuse lane creation or work submit.
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { canonicalLaneStoreId, getDurableLane, scarceResourcePriorityForLane } from "./development-lane.mjs";
import { localNodeId } from "./execution-node.mjs";

export const ADMISSION_SCHEMA = "vacilando.execution_admission.v1";
export const ADMISSION_STATES = Object.freeze([
  "QUEUED",
  "ADMITTED",
  "PROVISIONING",
  "ACTIVE",
  "FAILED",
  "CANCELLED",
]);
export const ADMISSION_OPEN = new Set(["QUEUED", "ADMITTED", "PROVISIONING"]);
export const ADMISSION_OCCUPYING = new Set(["PROVISIONING", "ADMITTED", "ACTIVE"]);

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

export function admissionStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "admissions.json");
}

export function admissionEventsPath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "admission-events.jsonl");
}

function emptyStore() {
  return { schema_version: ADMISSION_SCHEMA, requests: [] };
}

export function readAdmissionStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(admissionStorePath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    return {
      schema_version: ADMISSION_SCHEMA,
      requests: Array.isArray(raw.requests) ? raw.requests : [],
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store, root) {
  atomicWrite(admissionStorePath(root), store);
  return store;
}

function newAdmissionId(laneId, nowMs) {
  return "eadm_" + createHash("sha256")
    .update(`${laneId}:${nowMs}:${randomBytes(6).toString("hex")}`)
    .digest("hex")
    .slice(0, 16);
}

export function emitAdmissionEvent(type, rec, root, extra = {}) {
  try {
    const path = admissionEventsPath(root);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({
      at: new Date().toISOString(),
      type,
      admission_id: rec?.admission_id || null,
      lane_id: rec?.lane_id || null,
      run_id: rec?.run_id || null,
      state: rec?.state || null,
      ...extra,
    })}\n`, "utf8");
  } catch { /* best-effort */ }
}

function sortQueued(a, b) {
  const pa = Number(a.priority) || 0;
  const pb = Number(b.priority) || 0;
  if (pb !== pa) return pb - pa;
  const ta = String(a.requested_at || "");
  const tb = String(b.requested_at || "");
  if (ta !== tb) return ta.localeCompare(tb);
  return String(a.admission_id).localeCompare(String(b.admission_id));
}

export function queuedAdmissions(store) {
  return (store?.requests || []).filter((r) => r.state === "QUEUED").sort(sortQueued);
}

export function queuePositionFor(store, rec) {
  if (!rec || rec.state !== "QUEUED") return null;
  const q = queuedAdmissions(store);
  const i = q.findIndex((r) => r.admission_id === rec.admission_id);
  return i >= 0 ? i + 1 : null;
}

export function publicAdmission(rec, store = null) {
  if (!rec) return null;
  return {
    admission_id: rec.admission_id,
    lane_id: rec.lane_id,
    run_id: rec.run_id || null,
    provider: rec.provider || "claude",
    development_adapter: rec.development_adapter || "alloy_local",
    execution_node: rec.execution_node || "local",
    requested_at: rec.requested_at,
    state: rec.state,
    priority: rec.priority || 0,
    queue_position: rec.state === "QUEUED" ? queuePositionFor(store || { requests: [rec] }, rec) : null,
    provisioning_state: rec.provisioning_state || null,
    failure_reason: rec.failure_reason || null,
    provenance: rec.provenance || null,
    delivery: rec.delivery || null,
    updated_at: rec.updated_at,
  };
}

export function getAdmission(admissionId, root = runtimeRoot()) {
  return readAdmissionStore(root).requests.find((r) => r.admission_id === admissionId) || null;
}

export function admissionForLane(laneId, root = runtimeRoot()) {
  const id = canonicalLaneStoreId(laneId, root);
  const list = readAdmissionStore(root).requests.filter((r) => r.lane_id === id || r.lane_id === laneId);
  return [...list].reverse().find((r) => ADMISSION_OPEN.has(r.state) || r.state === "ACTIVE" || r.state === "FAILED") || null;
}

export function createAdmissionRequest({
  laneId,
  runId = null,
  provider = "claude",
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const id = canonicalLaneStoreId(laneId, root);
  if (!id) return { ok: false, error: "invalid_lane_id" };
  if (String(provider || "claude") !== "claude") {
    return { ok: false, error: "unsupported_provider" };
  }
  const store = readAdmissionStore(root);
  const existing = (store.requests || []).find((r) => r.lane_id === id && ADMISSION_OPEN.has(r.state));
  if (existing) return { ok: true, request: existing, existing: true };
  const rec = {
    schema_version: ADMISSION_SCHEMA,
    admission_id: newAdmissionId(id, nowMs),
    lane_id: id,
    run_id: runId || null,
    provider: "claude",
    development_adapter: "alloy_local",
    execution_node: localNodeId(root),
    requested_at: iso(nowMs),
    updated_at: iso(nowMs),
    state: "QUEUED",
    priority: scarceResourcePriorityForLane(id, root),
    provisioning_state: null,
    failure_reason: null,
    provenance: null,
    delivery: { state: "pending", delivered_at: null },
  };
  store.requests.push(rec);
  writeStore(store, root);
  emitAdmissionEvent("admission_queued", rec, root);
  return { ok: true, request: rec };
}

export function transitionAdmission(admissionId, toState, {
  reason = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
  provenance = undefined,
  provisioning_state = undefined,
} = {}) {
  const store = readAdmissionStore(root);
  const rec = (store.requests || []).find((r) => r.admission_id === admissionId);
  if (!rec) return { ok: false, error: "admission_not_found" };
  const to = String(toState || "").toUpperCase();
  if (!ADMISSION_STATES.includes(to)) return { ok: false, error: "invalid_state" };
  rec.state = to;
  rec.updated_at = iso(nowMs);
  if (reason != null) rec.failure_reason = reason;
  if (provenance !== undefined) rec.provenance = provenance;
  if (provisioning_state !== undefined) rec.provisioning_state = provisioning_state;
  writeStore(store, root);
  emitAdmissionEvent(`admission_${to.toLowerCase()}`, rec, root, { reason });
  return { ok: true, request: rec };
}

export function prioritizeAdmission(admissionId, {
  origin = "operator",
  nowMs = Date.now(),
  root = runtimeRoot(),
  expectedLaneId = null,
} = {}) {
  if (origin !== "operator") return { ok: false, error: "operator_only" };
  const store = readAdmissionStore(root);
  const rec = (store.requests || []).find((r) => r.admission_id === admissionId);
  if (!rec) return { ok: false, error: "admission_not_found" };
  if (expectedLaneId && rec.lane_id !== expectedLaneId
      && canonicalLaneStoreId(rec.lane_id, root) !== canonicalLaneStoreId(expectedLaneId, root)) {
    return { ok: false, error: "lane_mismatch" };
  }
  if (rec.state !== "QUEUED") return { ok: false, error: "not_queued" };
  rec.priority = 1;
  rec.updated_at = iso(nowMs);
  writeStore(store, root);
  emitAdmissionEvent("admission_prioritized", rec, root, { origin: "operator" });
  const next = readAdmissionStore(root);
  return { ok: true, request: rec, queue_position: queuePositionFor(next, rec) };
}

export function attachLaneAdmissions(lanes, root = runtimeRoot()) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  const store = readAdmissionStore(root);
  return list.map((lane) => {
    const id = lane?.lane_id;
    const rec = [...(store.requests || [])].reverse().find((r) =>
      (r.lane_id === id || r.lane_id === canonicalLaneStoreId(id, root))
      && (ADMISSION_OPEN.has(r.state) || r.state === "ACTIVE" || r.state === "FAILED")
    ) || null;
    if (!rec) return lane;
    const pub = publicAdmission(rec, store);
    const run = lane.execution_run;
    const nextRun = run && rec.state === "QUEUED" && run.state === "QUEUED"
      ? { ...run, admission: pub, state_reason: run.state_reason || "waiting_for_execution_capacity" }
      : run;
    return { ...lane, admission: pub, execution_run: nextRun || run };
  });
}

let capacityImpl = null;
let provisionImpl = null;
let deliverImpl = null;
let bindImpl = null;
let rollbackImpl = null;
let startSessionImpl = null;
const provisioningInflight = new Set();

export function setAdmissionImplForTests(impl = {}) {
  capacityImpl = typeof impl.canProvisionNow === "function" ? impl.canProvisionNow : null;
  provisionImpl = typeof impl.provisionLaneBinding === "function" ? impl.provisionLaneBinding : null;
  deliverImpl = typeof impl.deliverQueuedRun === "function" ? impl.deliverQueuedRun : null;
  bindImpl = typeof impl.bindDurableLane === "function" ? impl.bindDurableLane : null;
  rollbackImpl = typeof impl.rollbackCreated === "function" ? impl.rollbackCreated : null;
  startSessionImpl = typeof impl.startProviderOnBinding === "function" ? impl.startProviderOnBinding : null;
}

export function resetAdmissionImplForTests() {
  capacityImpl = null;
  provisionImpl = null;
  deliverImpl = null;
  bindImpl = null;
  rollbackImpl = null;
  startSessionImpl = null;
  provisioningInflight.clear();
}

export function resetAdmissionsForTests(root = runtimeRoot()) {
  writeStore(emptyStore(), root);
  try {
    const p = admissionEventsPath(root);
    if (existsSync(p)) writeFileSync(p, "", "utf8");
  } catch { /* */ }
  resetAdmissionImplForTests();
}

async function canProvisionNow(root) {
  if (capacityImpl) return capacityImpl({ root });
  const { assessProvisionCapacity } = await import("./alloy-dev-adapter.mjs");
  return assessProvisionCapacity({ root });
}

async function provisionBinding(lane, run, rec) {
  if (provisionImpl) return provisionImpl({ lane, run, admission: rec });
  const { provisionLaneBinding } = await import("./alloy-dev-adapter.mjs");
  return provisionLaneBinding({ lane, run, admission: rec });
}

async function bindLane(laneId, binding, { nowMs, root }) {
  if (bindImpl) return bindImpl(laneId, binding, { nowMs, root });
  const { bindDurableLane } = await import("./development-lane.mjs");
  return bindDurableLane(laneId, binding, { nowMs, root });
}

async function deliverRun(runRef, { lane, root, nowMs }) {
  if (deliverImpl) return deliverImpl(runRef, { lane, root, nowMs });
  const { deliverExistingQueuedRun } = await import("./execution-run-send.mjs");
  return deliverExistingQueuedRun(runRef.run_id, {
    root,
    nowMs,
    worktreePath: lane?.binding?.worktree_path || null,
  });
}

/**
 * Admit the FIFO head when the adapter says capacity is available.
 * Does not steal ACTIVE/PROVISIONING capacity.
 */
export async function evaluateAdmissionQueue({
  root = runtimeRoot(),
  nowMs = Date.now(),
} = {}) {
  const store = readAdmissionStore(root);
  const head = queuedAdmissions(store)[0];
  if (!head) return { ok: true, admitted: 0, skipped: "empty" };
  if (provisioningInflight.has(head.admission_id)) {
    return { ok: true, admitted: 0, skipped: "inflight" };
  }
  const peek = getDurableLane(head.lane_id, root);
  const alreadyBoundPeek = Boolean(peek?.binding?.worktree_path || peek?.binding?.tmux_session);
  const cap = alreadyBoundPeek
    ? await (async () => {
      const { assessSessionStartCapacity } = await import("./alloy-dev-adapter.mjs");
      return assessSessionStartCapacity();
    })()
    : await canProvisionNow(root);
  const available = cap && typeof cap === "object"
    ? cap.ok !== false && cap.available !== false
    : Boolean(cap);
  if (!available) {
    return { ok: true, admitted: 0, skipped: alreadyBoundPeek ? "no_session_capacity" : "no_capacity", capacity: cap };
  }
  provisioningInflight.add(head.admission_id);
  try {
    transitionAdmission(head.admission_id, "PROVISIONING", {
      nowMs,
      root,
      provisioning_state: "starting",
    });
    const lane = getDurableLane(head.lane_id, root);
    if (!lane) {
      transitionAdmission(head.admission_id, "FAILED", {
        reason: "lane_missing",
        nowMs,
        root,
        provisioning_state: "failed",
      });
      return { ok: false, error: "lane_missing", admission_id: head.admission_id };
    }
    const alreadyBound = Boolean(lane.binding?.worktree_path || lane.binding?.tmux_session);
    if (alreadyBound) {
      let started;
      try {
        started = startSessionImpl
          ? await startSessionImpl({ lane, admission: head, root, nowMs })
          : await (await import("./agent-session-lifecycle.mjs")).startLaneAgentSession({
            laneId: lane.lane_id,
            nowMs,
            root,
          });
      } catch (e) {
        started = { ok: false, error: String(e && e.message || e), skip_queue: true };
      }
      if (!started?.ok || started.queued) {
        transitionAdmission(head.admission_id, "QUEUED", {
          nowMs,
          root,
          provisioning_state: null,
          reason: started?.queued ? "waiting_for_execution_capacity" : (started?.error || "session_start_pending"),
        });
        return { ok: true, admitted: 0, skipped: started?.queued ? "waiting_for_execution_capacity" : (started?.error || "session_start_pending") };
      }
      transitionAdmission(head.admission_id, "ADMITTED", {
        nowMs,
        root,
        provisioning_state: started.adopted ? "adopted" : "session_starting",
      });
      let delivery = { ok: true, deferred: true };
      if (head.run_id && started.adopted) {
        delivery = await deliverRun({ run_id: head.run_id, lane_id: lane.lane_id }, { lane, root, nowMs });
      }
      const rec = getAdmission(head.admission_id, root);
      if (rec) {
        rec.delivery = {
          state: delivery?.already_delivered || (delivery?.ok && !delivery?.deferred) ? "delivered" : "pending",
          delivered_at: delivery?.ok && !delivery?.deferred ? iso(nowMs) : null,
          error: delivery?.ok || delivery?.deferred ? null : (delivery?.error || null),
        };
        rec.state = delivery?.ok && !delivery?.deferred ? "ACTIVE" : "ADMITTED";
        rec.updated_at = iso(nowMs);
        const next = readAdmissionStore(root);
        const hit = next.requests.find((r) => r.admission_id === rec.admission_id);
        if (hit) Object.assign(hit, rec);
        writeStore(next, root);
      }
      return {
        ok: true,
        admitted: 1,
        admission_id: head.admission_id,
        lane_id: lane.lane_id,
        run_id: head.run_id,
        delivery,
        existing_binding: true,
      };
    }
    let provisioned;
    try {
      provisioned = await provisionBinding(lane, { run_id: head.run_id }, head);
    } catch (e) {
      provisioned = { ok: false, error: String(e && e.message || e) };
    }
    if (!provisioned?.ok) {
      if (provisioned?.skip_queue) {
        transitionAdmission(head.admission_id, "QUEUED", {
          nowMs,
          root,
          provisioning_state: null,
          reason: null,
        });
        return { ok: true, admitted: 0, skipped: "provision_disabled" };
      }
      const created = provisioned?.created || null;
      if (created && rollbackImpl) {
        try { await rollbackImpl({ created, lane, root }); } catch { /* never destroy blindly */ }
      }
      transitionAdmission(head.admission_id, "FAILED", {
        reason: provisioned?.error || "provision_failed",
        nowMs,
        root,
        provisioning_state: "failed",
        provenance: {
          created: created || null,
          pre_existing: provisioned?.pre_existing || [],
          rolled_back: Boolean(created && rollbackImpl),
        },
      });
      emitAdmissionEvent("provision_failed", head, root, { error: provisioned?.error || "provision_failed" });
      return {
        ok: false,
        error: provisioned?.error || "provision_failed",
        admission_id: head.admission_id,
        lane_preserved: true,
      };
    }
    const binding = provisioned.binding || provisioned;
    const bound = await bindLane(lane.lane_id, binding, { nowMs, root });
    if (!bound?.ok) {
      transitionAdmission(head.admission_id, "FAILED", {
        reason: bound?.error || "bind_failed",
        nowMs,
        root,
        provisioning_state: "failed",
        provenance: { created: provisioned.created || binding, pre_existing: provisioned.pre_existing || [] },
      });
      return { ok: false, error: bound?.error || "bind_failed", lane_preserved: true };
    }
    transitionAdmission(head.admission_id, "ADMITTED", {
      nowMs,
      root,
      provisioning_state: "bound",
      provenance: {
        created: provisioned.created || binding,
        pre_existing: provisioned.pre_existing || [],
      },
    });
    let started = { ok: true, deferred: true };
    if (startSessionImpl || !provisionImpl) {
      try {
        started = startSessionImpl
          ? await startSessionImpl({ lane: bound.lane, admission: head, root, nowMs })
          : await (await import("./agent-session-lifecycle.mjs")).startLaneAgentSession({
            laneId: lane.lane_id,
            nowMs,
            root,
          });
      } catch (e) {
        started = { ok: false, error: String(e && e.message || e) };
      }
    }
    let delivery = { ok: true, skipped: true };
    if (head.run_id && started?.ok && !started.queued) {
      delivery = await deliverRun({ run_id: head.run_id, lane_id: lane.lane_id }, {
        lane: bound.lane,
        root,
        nowMs,
      });
    }
    const rec = getAdmission(head.admission_id, root);
    if (rec) {
      rec.delivery = {
        state: delivery?.already_delivered || delivery?.ok ? "delivered" : (delivery?.deferred ? "pending" : "failed"),
        delivered_at: delivery?.ok && !delivery?.deferred ? iso(nowMs) : null,
        error: delivery?.ok ? null : (delivery?.error || null),
      };
      rec.state = "ACTIVE";
      rec.updated_at = iso(nowMs);
      const next = readAdmissionStore(root);
      const hit = next.requests.find((r) => r.admission_id === rec.admission_id);
      if (hit) Object.assign(hit, rec);
      writeStore(next, root);
      emitAdmissionEvent("admission_active", rec, root, { delivery: rec.delivery.state });
    }
    return {
      ok: true,
      admitted: 1,
      admission_id: head.admission_id,
      lane_id: lane.lane_id,
      run_id: head.run_id,
      delivery,
      binding: bound.lane?.binding || binding,
    };
  } finally {
    provisioningInflight.delete(head.admission_id);
  }
}
