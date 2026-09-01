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

import { canonicalLaneStoreId, getDurableLane, listDurableLanes, scarceResourcePriorityForLane } from "./development-lane.mjs";
import { localNodeId } from "./execution-node.mjs";
import { normalizeExecutionProvider } from "./execution-providers.mjs";
import { activeAgentSessionForLane } from "./agent-session.mjs";
import { activeRunForLane, getExecutionRun, isTerminalRunState } from "./execution-run.mjs";

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
/**
 * Bounded provider bootstrap. Retries are cheap and a transient failure should
 * not strand work, but an admission that cannot start a provider must end in a
 * truthful FAILED rather than retrying forever or sitting silently admitted.
 */
export const BOOTSTRAP_MAX_ATTEMPTS = 3;
/**
 * How long an admission may sit admitted-without-a-provider before it counts as
 * stranded. Session start is asynchronous, so a just-admitted entry legitimately
 * has no session yet — requeuing it immediately would fight the normal startup
 * sequence. Surfaces had been stranded for hours; a minute is ample.
 */
export const STRANDED_ADMISSION_MS = 60_000;
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
  provider = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const id = canonicalLaneStoreId(laneId, root);
  if (!id) return { ok: false, error: "invalid_lane_id" };
  const lane = getDurableLane(id, root);
  const resolved = normalizeExecutionProvider(
    provider || lane?.binding?.provider,
    "claude",
  );
  if (!resolved) return { ok: false, error: "unsupported_provider" };
  const store = readAdmissionStore(root);
  const existing = (store.requests || []).find((r) => r.lane_id === id && ADMISSION_OPEN.has(r.state));
  if (existing) return { ok: true, request: existing, existing: true };
  const rec = {
    schema_version: ADMISSION_SCHEMA,
    admission_id: newAdmissionId(id, nowMs),
    lane_id: id,
    run_id: runId || null,
    provider: resolved,
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

/**
 * One outcome for a bootstrap that did not produce a provider, used by both the
 * already-bound and the freshly-provisioned paths.
 *
 * They had drifted: the already-bound path returned to QUEUED forever with no
 * attempt count, and the freshly-provisioned path marked the admission ACTIVE
 * even though nothing had started. Neither could end. Retries are now bounded,
 * counted and observable in both.
 */
function recordFailedBootstrap(head, started, { root, nowMs }) {
  const attempts = Number(getAdmission(head.admission_id, root)?.bootstrap_attempts || 0) + 1;
  const exhausted = !started?.queued && attempts >= BOOTSTRAP_MAX_ATTEMPTS;
  transitionAdmission(head.admission_id, exhausted ? "FAILED" : "QUEUED", {
    nowMs,
    root,
    provisioning_state: exhausted ? "failed" : null,
    reason: started?.queued
      ? "waiting_for_execution_capacity"
      : (started?.error || "session_start_pending"),
  });
  // A capacity wait is not a bootstrap failure — it must not burn an attempt.
  patchAdmissionFields(head.admission_id, {
    bootstrap_attempts: started?.queued ? attempts - 1 : attempts,
    last_bootstrap_error: started?.error || null,
    last_bootstrap_at: iso(nowMs),
  }, root);
  emitAdmissionEvent(exhausted ? "bootstrap_exhausted" : "bootstrap_retry", head, root, {
    attempts,
    error: started?.error || null,
  });
  return { exhausted, attempts };
}

/** Narrow field patch for bootstrap bookkeeping; never changes state. */
export function patchAdmissionFields(admissionId, fields = {}, root = runtimeRoot()) {
  const store = readAdmissionStore(root);
  const rec = (store.requests || []).find((r) => r.admission_id === admissionId);
  if (!rec) return { ok: false, error: "admission_not_found" };
  for (const key of ["bootstrap_attempts", "last_bootstrap_error", "last_bootstrap_at"]) {
    if (fields[key] !== undefined) rec[key] = fields[key];
  }
  writeStore(store, root);
  return { ok: true, request: rec };
}

/**
 * Admitted, but with no provider running.
 *
 * The state this exists to end: an admission marked ACTIVE or ADMITTED whose
 * lane has no live agent session and whose run never started. Nothing in the
 * ordinary queue sweep looks at non-QUEUED admissions, so such an entry was
 * invisible forever. Returning it to QUEUED makes the existing governor
 * reconsider it on the very next tick — no second scheduler, no special case.
 */
export function reconcileAdmittedWithoutProvider({ root = runtimeRoot(), nowMs = Date.now() } = {}) {
  const store = readAdmissionStore(root);
  const requeued = [];
  for (const rec of store.requests || []) {
    if (!["ACTIVE", "ADMITTED"].includes(rec.state)) continue;
    if (Number(rec.bootstrap_attempts || 0) >= BOOTSTRAP_MAX_ATTEMPTS) continue;
    const since = Date.parse(rec.updated_at || rec.requested_at || "");
    if (!Number.isFinite(since) || (nowMs - since) < STRANDED_ADMISSION_MS) continue;
    let session = null;
    try { session = activeAgentSessionForLane(rec.lane_id, root); } catch { session = null; }
    // A suspended provider is a deliberate, durable state — not a stranding.
    if (session && session.state !== "ENDED" && session.state !== "FAILED") continue;
    let run = null;
    try { run = rec.run_id ? getExecutionRun(rec.run_id, root) : null; } catch { run = null; }
    if (!run) continue;
    if (run.started_at || run.delivery?.acknowledged === true) continue;
    if (isTerminalRunState(run.state)) continue;
    requeued.push({ admission_id: rec.admission_id, lane_id: rec.lane_id, run_id: rec.run_id, from: rec.state });
  }
  for (const item of requeued) {
    transitionAdmission(item.admission_id, "QUEUED", {
      root,
      nowMs,
      provisioning_state: null,
      reason: "admitted_without_provider",
    });
    emitAdmissionEvent("admitted_without_provider_requeued", { ...item }, root, { from: item.from });
  }
  return { ok: true, requeued };
}

/**
 * Admitted, provider up, instruction still undelivered.
 *
 * Delivery is attempted once when the session starts. If the readiness gate
 * defers it — the agent was mid-turn, or the pane was briefly unreadable — the
 * run stays QUEUED with `waiting_for_ready_prompt`, and nothing tried again:
 * the queue sweep only looks at QUEUED *admissions*, and this one is ADMITTED.
 * Observed live on Surfaces: provider running and oriented for minutes, pane at
 * an actionable prompt, instruction never sent.
 *
 * Re-attempts through the canonical send path, which is idempotent (it answers
 * `already_delivered` once acknowledged) and enforces readiness itself.
 */
export async function reconcilePendingDelivery({ root = runtimeRoot(), nowMs = Date.now() } = {}) {
  const store = readAdmissionStore(root);
  const delivered = [];
  for (const rec of store.requests || []) {
    if (!["ACTIVE", "ADMITTED"].includes(rec.state)) continue;
    if (!rec.run_id) continue;
    let run = null;
    try { run = getExecutionRun(rec.run_id, root); } catch { run = null; }
    if (!run || run.state !== "QUEUED") continue;
    if (run.delivery?.acknowledged === true || run.started_at) continue;
    let session = null;
    try { session = activeAgentSessionForLane(rec.lane_id, root); } catch { session = null; }
    // Only when a provider is actually up and oriented — otherwise this is the
    // bootstrap path's job, not delivery's.
    if (!session || session.state !== "ACTIVE" || !session.oriented_at) continue;
    try {
      // Through the same helper the admission path uses, so it honours the
      // existing test seam and there is one delivery route, not two.
      const lane = getDurableLane(rec.lane_id, root);
      const out = await deliverRun({ run_id: rec.run_id, lane_id: rec.lane_id }, { lane, root, nowMs });
      if (out?.ok) {
        delivered.push({ admission_id: rec.admission_id, lane_id: rec.lane_id, run_id: rec.run_id });
        emitAdmissionEvent("pending_delivery_retried", rec, root, { run_id: rec.run_id });
      }
    } catch { /* the next tick tries again */ }
  }
  return { ok: true, delivered };
}

/**
 * A QUEUED run that no admission record points at.
 *
 * reconcilePendingDelivery only walks admission REQUESTS, so a run that was
 * created QUEUED while its request was never made — or whose request was closed
 * out from under it — is invisible to every delivery path and waits forever.
 * Observed on Runtime Performance: run QUEUED on `waiting_for_agent_session`,
 * an ACTIVE and oriented session sitting at a ready caret in its own worktree,
 * and no admission row anywhere. It could not start and nothing would ever
 * start it.
 *
 * A lane that already owns an eligible provider needs NO new seat, so it is
 * delivered directly rather than queued behind provider capacity — queueing it
 * there is what made a full host block a lane that was not asking for a seat.
 */
export async function reconcileOrphanedQueuedRuns({ root = runtimeRoot(), nowMs = Date.now() } = {}) {
  const store = readAdmissionStore(root);
  const claimed = new Set(
    (store.requests || [])
      .filter((r) => ["QUEUED", "ACTIVE", "ADMITTED"].includes(r.state) && r.run_id)
      .map((r) => r.run_id),
  );
  const delivered = [];
  const queued = [];
  let lanes = [];
  try { lanes = listDurableLanes(root) || []; } catch { lanes = []; }
  for (const lane of lanes) {
    let run = null;
    try { run = activeRunForLane(lane.lane_id, root); } catch { run = null; }
    if (!run || run.state !== "QUEUED") continue;
    if (claimed.has(run.run_id)) continue;
    if (run.delivery?.acknowledged === true || run.started_at) continue;

    let session = null;
    try { session = activeAgentSessionForLane(lane.lane_id, root); } catch { session = null; }
    const ownsProvider = Boolean(session && session.state === "ACTIVE" && session.oriented_at);
    if (ownsProvider) {
      try {
        const out = await deliverRun({ run_id: run.run_id, lane_id: lane.lane_id }, { lane, root, nowMs });
        if (out?.ok) {
          delivered.push({ lane_id: lane.lane_id, run_id: run.run_id });
          continue;
        }
      } catch { /* fall through to queueing it truthfully */ }
    }
    // No provider of its own: give it a real admission row so it waits in the
    // queue with a position instead of waiting nowhere.
    try {
      const req = createAdmissionRequest({
        laneId: lane.lane_id,
        runId: run.run_id,
        provider: lane.preferred_provider || lane.binding?.provider || "claude",
        nowMs,
        root,
      });
      if (req?.ok) queued.push({ lane_id: lane.lane_id, run_id: run.run_id });
    } catch { /* the next tick tries again */ }
  }
  return { ok: true, delivered, queued };
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

/**
 * Live pane facts for the capacity check. Best-effort: if tmux cannot be read
 * the assessment falls back to metadata, which is stale-prone but never worse
 * than what it replaced.
 */
async function hostProviderPanes() {
  try {
    const { discoverLivePanes } = await import("./lanes.mjs");
    // `discoverLivePanes` is the canonical boundary: it distinguishes "no tmux
    // server" (zero panes — a fact) from "tmux could not answer" (unknown).
    // Reading the raw exit code here treated a fresh host with no server as
    // unknown, which degrades capacity to a refusal and blocks every start.
    const seen = await discoverLivePanes();
    return seen.ok ? seen.panes : null;
  } catch {
    return null;
  }
}

/**
 * The provider-capacity verdict, from live processes correlated to lanes.
 *
 * Before asking, free any seat that is only being held by a parked
 * conversation: a lane waiting on the operator past its grace period does not
 * need its process, and holding one is what kept a queued lane from starting.
 */
async function canProvisionNow(root) {
  if (capacityImpl) return capacityImpl({ root });
  // Free any seat held only by a parked conversation first — a lane waiting on
  // the operator past its grace period does not need its process, and holding
  // one is what kept queued work from starting.
  try {
    const { listDurableLanes } = await import("./development-lane.mjs");
    const { reconcileParkedProviders } = await import("./provider-suspension.mjs");
    await reconcileParkedProviders({ lanes: listDurableLanes(root) || [], root });
  } catch { /* seats stay held; admission just waits */ }
  // ONE assessment for every caller. assessSessionStartCapacity delegates to the
  // canonical provider-capacity owner and honours the adapter's pane seam, so
  // the governor, the session lifecycle and the tests all read one number.
  const { assessSessionStartCapacity } = await import("./alloy-dev-adapter.mjs");
  return assessSessionStartCapacity({ root });
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
  // Before choosing a head, return any admission that is "admitted" with no
  // provider to the queue. This is also the Gateway-restart reconciliation:
  // the first tick after a restart re-drives work that was stranded by a
  // bootstrap failure, rather than leaving it invisible.
  try { reconcileAdmittedWithoutProvider({ root, nowMs }); } catch { /* the sweep is best-effort */ }
  // And re-attempt any instruction whose delivery was deferred on readiness.
  try { await reconcilePendingDelivery({ root, nowMs }); } catch { /* next tick */ }
  try { await reconcileOrphanedQueuedRuns({ root, nowMs }); } catch { /* next tick */ }
  const store = readAdmissionStore(root);
  const head = queuedAdmissions(store)[0];
  if (!head) return { ok: true, admitted: 0, skipped: "empty" };
  if (provisioningInflight.has(head.admission_id)) {
    return { ok: true, admitted: 0, skipped: "inflight" };
  }
  const peek = getDurableLane(head.lane_id, root);
  const alreadyBoundPeek = Boolean(peek?.binding?.worktree_path || peek?.binding?.tmux_session);
  // Two call sites, ONE accounting. Starting a session on an existing binding
  // and provisioning a new one are separately injectable — they are different
  // operations with different failure modes — but both now resolve to the same
  // canonical provider-capacity owner, so they can no longer disagree about how
  // many agents are running.
  const cap = alreadyBoundPeek
    ? await (async () => {
      const { assessSessionStartCapacity } = await import("./alloy-dev-adapter.mjs");
      return assessSessionStartCapacity({ root });
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
        const outcome = recordFailedBootstrap(head, started, { root, nowMs });
        return {
          ok: !outcome.exhausted,
          admitted: 0,
          admission_id: head.admission_id,
          lane_id: lane.lane_id,
          bootstrap_attempts: outcome.attempts,
          error: outcome.exhausted ? (started?.error || "provider_bootstrap_failed") : undefined,
          skipped: outcome.exhausted
            ? undefined
            : (started?.queued ? "waiting_for_execution_capacity" : (started?.error || "session_start_pending")),
        };
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
    // A bootstrap that did NOT start a provider must not become ACTIVE.
    //
    // This branch set rec.state = "ACTIVE" unconditionally a few lines below,
    // so a failed session start left the admission terminally "admitted" with
    // no process, no delivery, and out of the QUEUED set that
    // evaluateAdmissionQueue looks at — nothing ever reconsidered it. Observed
    // live on Surfaces: bound, ACTIVE, zero sessions, its instruction never
    // delivered. The already-bound branch above already returns to QUEUED here;
    // this one now does the same, with a bounded attempt count so a lane cannot
    // retry forever either.
    if (!started?.ok || started.queued) {
      const outcome = recordFailedBootstrap(head, started, { root, nowMs });
      return {
        ok: !outcome.exhausted,
        admitted: 0,
        admission_id: head.admission_id,
        lane_id: lane.lane_id,
        bootstrap_attempts: outcome.attempts,
        error: outcome.exhausted ? (started?.error || "provider_bootstrap_failed") : undefined,
        skipped: outcome.exhausted ? undefined : (started?.error || "session_start_pending"),
        binding: bound.lane?.binding || binding,
      };
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
