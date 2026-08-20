/**
 * Vacilando Governor Phase 5 — recovery policy registry.
 *
 * Recovery is an explicit remediation for a known fault class.
 * Reconciliation (execution-reconcile.mjs) detects drift and may invoke
 * a registered policy. Unknown remediations are refused.
 *
 * Never guess destructively. Repair only when evidence proves it is safe.
 * No broad process killing, Git mutation, or Claude session restart.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getExecutionRun,
  isTerminalRunState,
  transitionExecutionRun,
} from "./execution-run.mjs";
import {
  evaluateResourceQueue,
  readComputeHolders,
  readResourceRequestStore,
  releaseResourceRequest,
  setResourceReclaimHook,
} from "./execution-resource.mjs";
import {
  evaluateExclusiveWindow,
  exclusiveGrantRelease,
  readExclusiveWindow,
} from "./execution-exclusive.mjs";
import {
  acquireControlPlaneOwnership,
  pidAlive,
  readControlPlaneOwner,
} from "./control-plane-health.mjs";

export const FAILURE_CLASSES = Object.freeze([
  "RECOVERABLE",
  "AMBIGUOUS",
  "UNRECOVERABLE",
  "REQUIRES_JUDGMENT",
]);

export const RECOVERY_BUDGETS = Object.freeze({
  stale_governor_resource_holder: 1,
  abandoned_browser_cert_lease: 1,
  stale_control_plane_owner: 1,
  stale_slot_pid: 1,
  disposable_cert_process: 1,
  execution_command_timeout: 2,
  exclusive_window_drift: 3,
  resource_queue_drift: 8,
});

const THRASH_LIMIT = 3;
const THRASH_WINDOW_MS = 15 * 60 * 1000;
const THRASH_SKIP_POLICIES = new Set(["resource_queue_drift", "execution_command_timeout"]);
const HERE = dirname(fileURLToPath(import.meta.url));
const COMPUTE_BIN = join(HERE, "..", "..", "alloy-compute");

let computeRecoverImpl = null;
let isolated = false;

export function setRecoveryComputeImplForTests(fn) {
  computeRecoverImpl = typeof fn === "function" ? fn : null;
}

export function setRecoveryIsolatedForTests(value) {
  isolated = Boolean(value);
}

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

export function recoveryBudgetPath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "recovery-budgets.json");
}

export function recoveryEventsPath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "recovery-events.jsonl");
}

export function ownedProcessPath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "owned-processes.json");
}

function readBudgets(root) {
  try {
    const raw = JSON.parse(readFileSync(recoveryBudgetPath(root), "utf8"));
    return raw && typeof raw === "object" ? raw : { schema_version: "vacilando.recovery_budget.v1", episodes: {} };
  } catch {
    return { schema_version: "vacilando.recovery_budget.v1", episodes: {} };
  }
}

function writeBudgets(store, root) {
  atomicWrite(recoveryBudgetPath(root), store);
  return store;
}

export function emitRecoveryEvent(type, rec, root = runtimeRoot(), extra = {}) {
  const line = JSON.stringify({
    type,
    at: iso(),
    policy: rec?.policy || extra.policy || null,
    lane_id: rec?.lane_id || extra.lane_id || null,
    run_id: rec?.run_id || extra.run_id || null,
    request_id: rec?.request_id || extra.request_id || null,
    classification: rec?.classification || extra.classification || null,
    attempt: rec?.attempt || extra.attempt || null,
    verified: extra.verified ?? rec?.verified ?? null,
    ...extra,
  });
  try {
    const path = recoveryEventsPath(root);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${line}\n`, "utf8");
  } catch { /* best-effort */ }
}

export function recentRecoveryActivity(root = runtimeRoot(), { limit = 8 } = {}) {
  try {
    const lines = readFileSync(recoveryEventsPath(root), "utf8").trim().split("\n").filter(Boolean);
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
      try {
        const row = JSON.parse(lines[i]);
        if (row.type === "recovery_verified" || row.type === "recovery_exhausted" || row.type === "recovery_failed") {
          out.push({
            at: row.at,
            lane_id: row.lane_id || null,
            summary: row.summary || operatorSummary(row),
            tone: row.type === "recovery_verified" ? "ok" : "needs",
          });
        }
      } catch { /* skip */ }
    }
    return out;
  } catch {
    return [];
  }
}

export function recoveryOwnershipLabel(policy, rec = {}) {
  if (rec.resource_key === "runtime_timing_certification" || policy === "exclusive_window_drift") {
    return "Exclusive timing ownership";
  }
  if (policy === "stale_control_plane_owner") return "Control-plane ownership";
  if (policy === "stale_slot_pid") return "Slot PID ownership";
  if (policy === "disposable_cert_process") return "Disposable certification process";
  if (policy === "execution_command_timeout") return "Instruction delivery";
  if (
    policy === "stale_governor_resource_holder"
    || policy === "abandoned_browser_cert_lease"
    || rec.resource_key === "browser_certification"
  ) {
    return "Browser certification ownership";
  }
  return "Resource ownership";
}

function operatorSummary(row) {
  if (row.type === "recovery_verified") return row.summary || "Recovered automatically";
  if (row.type === "recovery_exhausted") return row.summary || "Recovery exhausted";
  if (row.type === "recovery_failed") return row.summary || "Recovery failed";
  return row.policy || "Recovery event";
}

function readRecoveryEventTail(root, limit = 40) {
  try {
    const lines = readFileSync(recoveryEventsPath(root), "utf8").trim().split("\n").filter(Boolean);
    const out = [];
    for (let i = Math.max(0, lines.length - limit); i < lines.length; i += 1) {
      try { out.push(JSON.parse(lines[i])); } catch { /* skip */ }
    }
    return out;
  } catch {
    return [];
  }
}

function budgetKey(policy, target) {
  return `${policy}:${target}`;
}

export function readBudgetEpisode(policy, target, root = runtimeRoot()) {
  const rec = readBudgets(root).episodes?.[budgetKey(policy, target)] || null;
  return rec;
}

function bumpBudget(policy, target, root, nowMs, { success = false } = {}) {
  const store = readBudgets(root);
  store.episodes = store.episodes || {};
  const key = budgetKey(policy, target);
  const cur = store.episodes[key] || { attempts: 0, successes: 0, first_at: iso(nowMs), last_at: null };
  cur.attempts = (cur.attempts || 0) + 1;
  if (success) cur.successes = (cur.successes || 0) + 1;
  cur.last_at = iso(nowMs);
  cur.policy = policy;
  cur.target = target;
  store.episodes[key] = cur;
  writeBudgets(store, root);
  return cur;
}

function budgetExhausted(policy, target, root) {
  const max = RECOVERY_BUDGETS[policy];
  if (max == null) return true;
  const cur = readBudgetEpisode(policy, target, root);
  return Boolean(cur && cur.attempts >= max);
}

function thrashKey(policy, ctx) {
  const lane = ctx.rec?.lane_id || ctx.lane_id || "host";
  const resource = ctx.rec?.resource_key || ctx.resource_key || ctx.holder || "na";
  return `${policy}:${lane}:${resource}`;
}

function readThrash(policy, ctx, root) {
  return readBudgets(root).thrash?.[thrashKey(policy, ctx)] || null;
}

function bumpThrash(policy, ctx, root, nowMs) {
  if (THRASH_SKIP_POLICIES.has(policy)) return readThrash(policy, ctx, root);
  const store = readBudgets(root);
  store.thrash = store.thrash || {};
  const key = thrashKey(policy, ctx);
  const cur = store.thrash[key] || { successes: 0, first_at: iso(nowMs), last_at: null };
  const first = Date.parse(cur.first_at || "") || 0;
  if (first && nowMs - first >= THRASH_WINDOW_MS) {
    cur.successes = 0;
    cur.first_at = iso(nowMs);
  }
  cur.successes = (cur.successes || 0) + 1;
  cur.last_at = iso(nowMs);
  store.thrash[key] = cur;
  writeBudgets(store, root);
  return cur;
}

function thrashing(policy, ctx, root, nowMs) {
  if (THRASH_SKIP_POLICIES.has(policy)) return false;
  const cur = readThrash(policy, ctx, root);
  if (!cur?.successes || cur.successes < THRASH_LIMIT) return false;
  const first = Date.parse(cur.first_at || "") || 0;
  return Boolean(first && nowMs - first < THRASH_WINDOW_MS);
}

export const RECOVERY_POLICIES = Object.freeze([
  {
    key: "stale_governor_resource_holder",
    detect: "GRANTED Governor request whose run is missing or terminal",
    diagnose: "holder vac-erun_* and no live dependent run",
    safe_to_repair: "owning run gone/terminal; no live Claude/tmux dependency on the lease",
    repair: "canonical releaseResourceRequest / exclusiveGrantRelease",
    verify: "request no longer GRANTED; compute/exclusive holder gone",
    retry_budget: RECOVERY_BUDGETS.stale_governor_resource_holder,
    escalation: "NEEDS_INPUT",
    classification: "RECOVERABLE",
  },
  {
    key: "abandoned_browser_cert_lease",
    detect: "alloy-compute browser-certification permit with dead pid",
    diagnose: "canonical permit_reclaimable / recover evidence (dead pid + min age), or Governor-minted vac-erun_* with dead pid and no live run",
    safe_to_repair: "pid dead; foreign requires MIN_RECLAIM_AGE; Governor-minted holder skips age because Vacilando owns the holder name",
    repair: "alloy-compute release (Governor-minted dead holder) or alloy-compute recover (foreign dead + min age)",
    verify: "holder absent from compute permits",
    retry_budget: RECOVERY_BUDGETS.abandoned_browser_cert_lease,
    escalation: "observe if recover refuses",
    classification: "RECOVERABLE",
  },
  {
    key: "stale_control_plane_owner",
    detect: "control-plane-owner.json pid dead",
    diagnose: "pidAlive false",
    safe_to_repair: "no live process owns the runtime root",
    repair: "acquireControlPlaneOwnership (canonical replace-stale)",
    verify: "exactly one owner; pid is this process or the caller",
    retry_budget: RECOVERY_BUDGETS.stale_control_plane_owner,
    escalation: "refuse if live foreign pid",
    classification: "RECOVERABLE",
  },
  {
    key: "stale_slot_pid",
    detect: "PID file under isolated runtime pids dir whose pid is dead",
    diagnose: "kill -0 fails",
    safe_to_repair: "dead pid; file is under this runtime root; do not kill processes",
    repair: "unlink pid file only",
    verify: "pid file gone",
    retry_budget: RECOVERY_BUDGETS.stale_slot_pid,
    escalation: "host ~/.local/state/alloy-dev/pids is observe-only",
    classification: "RECOVERABLE",
  },
  {
    key: "disposable_cert_process",
    detect: "Governor-registered owned process whose pid is dead",
    diagnose: "owned-processes.json provenance",
    safe_to_repair: "Vacilando created the record; unknown pids are not mutated",
    repair: "drop registry entry; release any recorded resource",
    verify: "no leftover owned record or governor lease for that pid",
    retry_budget: RECOVERY_BUDGETS.disposable_cert_process,
    escalation: "unknown provenance → observe",
    classification: "RECOVERABLE",
  },
  {
    key: "execution_command_timeout",
    detect: "continuation DELIVERING after crash, or retryable PENDING send failure",
    diagnose: "delivery_state + last_error",
    safe_to_repair: "only definitely-not-delivered PENDING; DELIVERING is AMBIGUOUS",
    repair: "Phase 3 continuation retry for PENDING; escalate DELIVERING",
    verify: "no second send for DELIVERING",
    retry_budget: RECOVERY_BUDGETS.execution_command_timeout,
    escalation: "NEEDS_INPUT",
    classification: "AMBIGUOUS",
  },
  {
    key: "resource_queue_drift",
    detect: "QUEUED terminal run, GRANTED missing lease, idle queue head",
    diagnose: "store vs compute vs run state",
    safe_to_repair: "deterministic JSON/canonical release only",
    repair: "cancel/release/evaluateResourceQueue",
    verify: "no terminal-run active request; queue head evaluated",
    retry_budget: RECOVERY_BUDGETS.resource_queue_drift,
    escalation: "AMBIGUOUS if VALIDATING and lease missing",
    classification: "RECOVERABLE",
  },
  {
    key: "exclusive_window_drift",
    detect: "exclusive window vs owner run/request mismatch",
    diagnose: "machine-exclusive.json + run store",
    safe_to_repair: "Phase 4 evaluateExclusiveWindow invariants",
    repair: "evaluateExclusiveWindow",
    verify: "no exclusive window without a living owner",
    retry_budget: RECOVERY_BUDGETS.exclusive_window_drift,
    escalation: "NEEDS_INPUT on expiry (existing)",
    classification: "RECOVERABLE",
  },
]);

const POLICY_BY_KEY = new Map(RECOVERY_POLICIES.map((p) => [p.key, p]));

export function listRecoveryPolicies() {
  return RECOVERY_POLICIES.map((p) => ({ ...p }));
}

export function getRecoveryPolicy(key) {
  return POLICY_BY_KEY.get(String(key || "")) || null;
}

function governorHolder(runId) {
  return `vac-${runId}`;
}

function isGovernorHolder(holder) {
  return String(holder || "").startsWith("vac-erun_");
}

function computeDir() {
  return process.env.ALLOY_COMPUTE_STATE_DIR?.trim()
    || join(homedir(), ".local", "state", "alloy", "compute");
}

function pidDir(root) {
  if (process.env.ALLOY_PIDS_DIR?.trim()) return process.env.ALLOY_PIDS_DIR.trim();
  return join(root, "pids");
}

function hostPidsDir() {
  return join(homedir(), ".local", "state", "alloy-dev", "pids");
}

function permitAgeSeconds(created) {
  const t = Date.parse(created || "");
  if (!Number.isFinite(t)) return -1;
  return Math.floor((Date.now() - t) / 1000);
}

function minReclaimAge() {
  const n = Number(process.env.ALLOY_COMPUTE_MIN_RECLAIM_AGE);
  return Number.isFinite(n) && n >= 0 ? n : 900;
}

function escalateRun(runId, reason, { root, nowMs, origin = "governor" }) {
  const run = getExecutionRun(runId, root);
  if (!run || isTerminalRunState(run.state)) return null;
  if (run.state === "NEEDS_INPUT") return run;
  const okFrom = ["EXECUTING", "WAITING_RESOURCE", "VALIDATING", "RECOVERING", "QUEUED"];
  if (!okFrom.includes(run.state)) return run;
  try {
    return transitionExecutionRun(run.run_id, "NEEDS_INPUT", {
      reason,
      origin,
      nowMs,
      root,
      completion_report: { summary: reason },
    }).run;
  } catch {
    return run;
  }
}

function canonicalComputeRecover(resource, holder) {
  if (computeRecoverImpl) return computeRecoverImpl(resource, holder);
  try {
    execFileSync(COMPUTE_BIN, ["recover", resource, "--holder", holder], {
      encoding: "utf8",
      timeout: 8000,
      env: { ...process.env, ALLOY_COMPUTE_STATE_DIR: computeDir() },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (e) {
    const err = String(e.stderr || e.message || e);
    if (/still running|evidence of life|only .*s old/i.test(err)) {
      return { ok: false, error: "live_or_fresh", detail: err.slice(0, 300) };
    }
    return { ok: false, error: "recover_failed", detail: err.slice(0, 300) };
  }
}

function canonicalComputeRelease(resource, holder) {
  try {
    execFileSync(COMPUTE_BIN, ["release", resource, "--holder", holder], {
      encoding: "utf8",
      timeout: 8000,
      env: { ...process.env, ALLOY_COMPUTE_STATE_DIR: computeDir() },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (e) {
    const err = String(e.stderr || e.message || e);
    return { ok: false, error: "release_failed", detail: err.slice(0, 300) };
  }
}

const handlers = {
  stale_governor_resource_holder(ctx) {
    const { rec, root, nowMs } = ctx;
    const run = getExecutionRun(rec.run_id, root);
    const gone = !run || isTerminalRunState(run.state);
    if (!gone) {
      return { ok: false, classification: "RECOVERABLE", error: "owner_still_live", verified: false, consume_budget: false };
    }
    if (!isGovernorHolder(rec.holder || governorHolder(rec.run_id))) {
      return { ok: false, classification: "REQUIRES_JUDGMENT", error: "not_governor_holder", verified: false };
    }
    const before = {
      request_state: rec.state,
      holder: rec.holder,
      exclusive: Boolean(readExclusiveWindow(root)),
    };
    if (rec.resource_key === "runtime_timing_certification") {
      exclusiveGrantRelease(rec, root, nowMs);
    }
    const rel = releaseResourceRequest(rec.request_id, {
      origin: "governor",
      nowMs,
      root,
      expectedRunId: rec.run_id,
    });
    if (rec.resource_key === "browser_certification") {
      evaluateResourceQueue("browser_certification", root, nowMs);
    }
    evaluateExclusiveWindow(root, nowMs);
    const afterReq = (readResourceRequestStore(root).requests || []).find((r) => r.request_id === rec.request_id);
    const holders = rec.resource_key === "browser_certification"
      ? readComputeHolders("browser-certification")
      : [];
    const stillGranted = afterReq?.state === "GRANTED";
    const stillHeld = holders.some((h) => h.holder === rec.holder);
    const exclusiveGone = rec.resource_key !== "runtime_timing_certification" || !readExclusiveWindow(root);
    const verified = rel?.ok !== false && !stillGranted && !stillHeld && exclusiveGone;
    return {
      ok: verified,
      verified,
      classification: verified ? "RECOVERABLE" : "UNRECOVERABLE",
      summary: verified
        ? rec.resource_key === "browser_certification"
          ? "Recovered stale browser-cert ownership"
          : "Recovered stale exclusive-window ownership"
        : "Stale governor holder repair did not verify",
      before,
      after: { request_state: afterReq?.state || null, compute_holders: holders.map((h) => h.holder) },
      lane_id: rec.lane_id,
      run_id: rec.run_id,
      request_id: rec.request_id,
    };
  },

  abandoned_browser_cert_lease(ctx) {
    const { holder, permit, root, nowMs } = ctx;
    if (isGovernorHolder(holder) && getExecutionRun(String(holder).replace(/^vac-/, ""), root)) {
      const run = getExecutionRun(String(holder).replace(/^vac-/, ""), root);
      if (run && !isTerminalRunState(run.state)) {
        return { ok: false, classification: "RECOVERABLE", error: "governor_run_live", verified: false, consume_budget: false };
      }
    }
    const livePid = permit?.pid ? pidAlive(permit.pid) : false;
    if (permit?.alive || livePid) {
      return { ok: false, classification: "RECOVERABLE", error: "holder_alive", verified: false, consume_budget: false };
    }
    const current = readComputeHolders("browser-certification").find((h) => h.holder === holder);
    if (current?.alive) {
      return { ok: false, classification: "RECOVERABLE", error: "holder_alive", verified: false, consume_budget: false };
    }
    const governorMinted = isGovernorHolder(holder);
    if (!governorMinted) {
      const age = permitAgeSeconds(permit?.created || current?.created);
      if (age >= 0 && age < minReclaimAge()) {
        return { ok: false, classification: "RECOVERABLE", error: "permit_too_fresh", verified: false, consume_budget: false };
      }
    }
    const out = governorMinted
      ? canonicalComputeRelease("browser-certification", holder)
      : canonicalComputeRecover("browser-certification", holder);
    if (!out.ok) {
      return {
        ok: false,
        verified: false,
        classification: out.error === "live_or_fresh" ? "RECOVERABLE" : "AMBIGUOUS",
        error: out.error,
        summary: "Canonical reclaim refused",
        consume_budget: out.error === "live_or_fresh" ? false : undefined,
      };
    }
    const holders = readComputeHolders("browser-certification");
    const verified = !holders.some((h) => h.holder === holder);
    if (verified) evaluateResourceQueue("browser_certification", root, nowMs);
    return {
      ok: verified,
      verified,
      classification: verified ? "RECOVERABLE" : "UNRECOVERABLE",
      summary: verified
        ? governorMinted
          ? "Released abandoned Governor browser-cert lease via alloy-compute"
          : "Recovered abandoned browser-cert lease via alloy-compute"
        : "Canonical reclaim ran but holder remained",
      lane_id: ctx.lane_id || null,
    };
  },

  stale_control_plane_owner(ctx) {
    const existing = readControlPlaneOwner();
    if (!existing?.pid) return { ok: true, verified: true, classification: "RECOVERABLE", skipped: true, consume_budget: false };
    if (pidAlive(existing.pid) && Number(existing.pid) !== Number(ctx.pid || process.pid)) {
      return { ok: false, verified: false, classification: "RECOVERABLE", error: "live_foreign_owner", consume_budget: false };
    }
    if (pidAlive(existing.pid) && Number(existing.pid) === Number(ctx.pid || process.pid)) {
      return { ok: true, verified: true, classification: "RECOVERABLE", skipped: true, consume_budget: false };
    }
    const got = acquireControlPlaneOwnership({ pid: ctx.pid || process.pid, port: ctx.port || null });
    const owner = readControlPlaneOwner();
    const verified = Boolean(got.ok && owner && Number(owner.pid) === Number(ctx.pid || process.pid));
    return {
      ok: verified,
      verified,
      classification: got.ok === false && got.error === "control_plane_owned" ? "RECOVERABLE" : (verified ? "RECOVERABLE" : "UNRECOVERABLE"),
      summary: verified ? "Replaced stale control-plane owner" : "Control-plane owner not repaired",
      replaced_stale: Boolean(got.replaced_stale),
      after: { pid: owner?.pid || null },
    };
  },

  stale_slot_pid(ctx) {
    const { path, pid, root } = ctx;
    const dir = pidDir(root);
    if (!String(path || "").startsWith(dir)) {
      return { ok: false, verified: false, classification: "REQUIRES_JUDGMENT", error: "pid_file_outside_runtime", consume_budget: false };
    }
    if (pidAlive(pid)) {
      return { ok: false, verified: false, classification: "RECOVERABLE", error: "pid_alive", consume_budget: false };
    }
    try { unlinkSync(path); } catch { /* */ }
    const verified = !existsSync(path);
    return {
      ok: verified,
      verified,
      classification: verified ? "RECOVERABLE" : "UNRECOVERABLE",
      summary: verified ? "Removed stale slot PID file" : "Stale PID file remained",
    };
  },

  disposable_cert_process(ctx) {
    const { rec, root, nowMs } = ctx;
    if (!rec?.created_by || rec.created_by !== "vacilando-governor") {
      return { ok: false, verified: false, classification: "REQUIRES_JUDGMENT", error: "unknown_provenance", consume_budget: false };
    }
    if (rec.pid && pidAlive(rec.pid)) {
      return { ok: false, verified: false, classification: "RECOVERABLE", error: "process_alive", consume_budget: false };
    }
    const store = readOwned(root);
    store.processes = (store.processes || []).filter((p) => p.id !== rec.id);
    writeOwned(store, root);
    if (rec.resource_request_id) {
      releaseResourceRequest(rec.resource_request_id, { origin: "governor", nowMs, root });
    }
    const still = (readOwned(root).processes || []).some((p) => p.id === rec.id);
    return {
      ok: !still,
      verified: !still,
      classification: "RECOVERABLE",
      summary: "Cleaned Governor-owned disposable process record",
      lane_id: rec.lane_id || null,
      run_id: rec.run_id || null,
    };
  },

  execution_command_timeout(ctx) {
    const { rec, root, nowMs } = ctx;
    const st = rec.continuation?.delivery_state;
    if (st === "DELIVERING") {
      escalateRun(rec.run_id, "continuation delivery is ambiguous after interruption", { root, nowMs });
      return {
        ok: true,
        verified: true,
        classification: "AMBIGUOUS",
        resent: false,
        summary: "Held ambiguous continuation; did not resend",
        lane_id: rec.lane_id,
        run_id: rec.run_id,
      };
    }
    return {
      ok: false,
      verified: false,
      classification: "RECOVERABLE",
      error: "not_ambiguous_timeout",
    };
  },

  resource_queue_drift(ctx) {
    const { rec, root, nowMs, kind } = ctx;
    if (kind === "terminal_queued") {
      const rel = releaseResourceRequest(rec.request_id, { origin: "governor", nowMs, root, expectedRunId: rec.run_id });
      const after = (readResourceRequestStore(root).requests || []).find((r) => r.request_id === rec.request_id);
      const verified = after?.state !== "QUEUED" && after?.state !== "GRANTED";
      return {
        ok: rel.ok && verified,
        verified,
        classification: "RECOVERABLE",
        summary: "Removed queued request for a terminal run",
        lane_id: rec.lane_id,
        run_id: rec.run_id,
      };
    }
    if (kind === "granted_missing_lease") {
      const run = getExecutionRun(rec.run_id, root);
      if (run?.state === "VALIDATING" || rec.continuation?.delivery_state === "DELIVERED") {
        escalateRun(rec.run_id, "granted resource lease is missing; cannot prove whether work used it", { root, nowMs });
        return {
          ok: true,
          verified: true,
          classification: "AMBIGUOUS",
          summary: "Escalated missing lease during validation",
          lane_id: rec.lane_id,
          run_id: rec.run_id,
        };
      }
      const rel = releaseResourceRequest(rec.request_id, { origin: "governor", nowMs, root, expectedRunId: rec.run_id });
      evaluateResourceQueue(rec.resource_key, root, nowMs);
      return {
        ok: rel.ok,
        verified: rel.ok,
        classification: "RECOVERABLE",
        summary: "Reconciled GRANTED request with missing canonical lease",
        lane_id: rec.lane_id,
        run_id: rec.run_id,
      };
    }
    if (kind === "idle_head") {
      evaluateResourceQueue(ctx.resource_key, root, nowMs);
      return {
        ok: true,
        verified: true,
        skipped: true,
        consume_budget: false,
        classification: "RECOVERABLE",
        summary: "Re-evaluated idle resource queue head",
      };
    }
    return { ok: false, verified: false, classification: "REQUIRES_JUDGMENT", error: "unknown_drift_kind" };
  },

  exclusive_window_drift(ctx) {
    const { root, nowMs } = ctx;
    const before = readExclusiveWindow(root);
    evaluateExclusiveWindow(root, nowMs);
    const after = readExclusiveWindow(root);
    const owner = after?.run_id ? getExecutionRun(after.run_id, root) : null;
    const verified = !after || (owner && !isTerminalRunState(owner.state));
    const mutated = Boolean(before) && (!after || before.phase !== after.phase || before.run_id !== after.run_id);
    return {
      ok: verified,
      verified,
      skipped: !mutated,
      consume_budget: mutated,
      classification: "RECOVERABLE",
      summary: before && !after
        ? "Released exclusive window for a missing owner"
        : "Exclusive window reconciled",
      lane_id: before?.lane_id || after?.lane_id || null,
      run_id: before?.run_id || after?.run_id || null,
    };
  },
};

function readOwned(root) {
  try {
    const raw = JSON.parse(readFileSync(ownedProcessPath(root), "utf8"));
    return { schema_version: "vacilando.owned_process.v1", processes: Array.isArray(raw?.processes) ? raw.processes : [] };
  } catch {
    return { schema_version: "vacilando.owned_process.v1", processes: [] };
  }
}

function writeOwned(store, root) {
  atomicWrite(ownedProcessPath(root), store);
}

export function registerOwnedProcess(rec, root = runtimeRoot()) {
  if (!rec?.id) return { ok: false, error: "missing_id" };
  const store = readOwned(root);
  store.processes = (store.processes || []).filter((p) => p.id !== rec.id);
  store.processes.push({
    ...rec,
    created_by: "vacilando-governor",
    created_at: rec.created_at || iso(),
  });
  writeOwned(store, root);
  return { ok: true, process: rec };
}

export function listOwnedProcesses(root = runtimeRoot()) {
  return readOwned(root).processes || [];
}

export function executeRecovery(policyKey, ctx = {}) {
  const def = getRecoveryPolicy(policyKey);
  if (!def) {
    emitRecoveryEvent("recovery_failed", { policy: policyKey }, ctx.root, {
      classification: "REQUIRES_JUDGMENT",
      error: "unknown_policy",
      summary: "Unknown recovery refused",
    });
    return { ok: false, error: "unknown_policy", classification: "REQUIRES_JUDGMENT" };
  }
  const fn = handlers[policyKey];
  if (typeof fn !== "function") {
    return { ok: false, error: "handler_missing", classification: "REQUIRES_JUDGMENT" };
  }
  const root = ctx.root || runtimeRoot();
  const nowMs = ctx.nowMs || Date.now();
  const target = ctx.target || ctx.rec?.request_id || ctx.holder || ctx.path || ctx.rec?.id || policyKey;
  emitRecoveryEvent("recovery_detected", { policy: policyKey, lane_id: ctx.rec?.lane_id, run_id: ctx.rec?.run_id }, root, {
    classification: def.classification,
    target,
    resource_key: ctx.rec?.resource_key || ctx.resource_key || null,
  });
  emitRecoveryEvent("recovery_classified", { policy: policyKey }, root, {
    classification: def.classification,
    target,
  });
  if (thrashing(policyKey, ctx, root, nowMs)) {
    emitRecoveryEvent("recovery_exhausted", { policy: policyKey, lane_id: ctx.rec?.lane_id, run_id: ctx.rec?.run_id }, root, {
      classification: "REQUIRES_JUDGMENT",
      target,
      summary: "Recovery thrash threshold reached",
    });
    if (ctx.rec?.run_id) escalateRun(ctx.rec.run_id, "recovery is thrashing", { root, nowMs });
    return { ok: false, error: "thrash", classification: "REQUIRES_JUDGMENT", exhausted: true };
  }
  if (budgetExhausted(policyKey, target, root) && policyKey !== "resource_queue_drift") {
    emitRecoveryEvent("recovery_exhausted", { policy: policyKey, lane_id: ctx.rec?.lane_id, run_id: ctx.rec?.run_id }, root, {
      classification: "UNRECOVERABLE",
      target,
      summary: "Recovery budget exhausted",
    });
    if (ctx.rec?.run_id) escalateRun(ctx.rec.run_id, `recovery budget exhausted for ${policyKey}`, { root, nowMs });
    return { ok: false, error: "budget_exhausted", classification: "UNRECOVERABLE", exhausted: true };
  }
  emitRecoveryEvent("recovery_attempted", { policy: policyKey, lane_id: ctx.rec?.lane_id, run_id: ctx.rec?.run_id }, root, {
    target,
    resource_key: ctx.rec?.resource_key || null,
  });
  let result;
  try {
    result = fn({ ...ctx, root, nowMs });
  } catch (e) {
    result = { ok: false, verified: false, classification: "UNRECOVERABLE", error: String(e?.message || e) };
  }
  const consume = result?.consume_budget !== false && !result?.skipped;
  const success = Boolean(result?.ok && result?.verified && consume);
  let episode = readBudgetEpisode(policyKey, target, root) || { attempts: 0 };
  if (consume) {
    episode = bumpBudget(policyKey, target, root, nowMs, { success });
    if (success) bumpThrash(policyKey, ctx, root, nowMs);
  }
  result.attempt = episode.attempts;
  result.policy = policyKey;
  if (success) {
    emitRecoveryEvent("recovery_verified", {
      policy: policyKey,
      lane_id: result.lane_id || ctx.rec?.lane_id,
      run_id: result.run_id || ctx.rec?.run_id,
    }, root, {
      classification: result.classification,
      verified: true,
      attempt: episode.attempts,
      target,
      summary: result.summary || "Recovered automatically",
      resource_key: ctx.rec?.resource_key || null,
    });
  } else if (result?.exhausted) {
    /* already emitted */
  } else if (result?.skipped) {
    /* quiet deterministic no-op */
  } else {
    emitRecoveryEvent("recovery_failed", { policy: policyKey, lane_id: ctx.rec?.lane_id, run_id: ctx.rec?.run_id }, root, {
      classification: result?.classification || "UNRECOVERABLE",
      verified: false,
      attempt: episode.attempts,
      target,
      error: result?.error || null,
      summary: result?.summary || "Recovery failed",
    });
  }
  return result;
}

function installBrowserCertReclaimHook() {
  setResourceReclaimHook(({ holders, root, nowMs }) => {
    for (const h of holders || []) {
      if (!h?.holder || h.alive) continue;
      executeRecovery("abandoned_browser_cert_lease", {
        holder: h.holder,
        permit: h,
        root,
        nowMs,
        target: h.holder,
      });
    }
  });
}

installBrowserCertReclaimHook();

export function attachLaneRecovery(lanes, root = runtimeRoot()) {
  const list = Array.isArray(lanes) ? lanes : [];
  const activity = recentRecoveryActivity(root, { limit: 16 });
  const events = readRecoveryEventTail(root, 50);
  return list.map((lane) => {
    const runId = lane.execution_run?.run_id;
    const mineEvents = events.filter((e) =>
      e.lane_id === lane.lane_id
      || (lane.aliases || []).includes(e.lane_id)
      || (runId && e.run_id === runId)
    );
    const last = mineEvents[mineEvents.length - 1];
    const lastAt = last?.at ? Date.parse(last.at) : 0;
    const recovering = last?.type === "recovery_attempted" && lastAt > Date.now() - 8000;
    const mine = activity.filter((a) =>
      a.lane_id === lane.lane_id || (lane.aliases || []).includes(a.lane_id)
    ).slice(0, 3);
    if (!mine.length && !recovering) return lane;
    const reason = recovering
      ? recoveryOwnershipLabel(last.policy, { resource_key: last.resource_key })
      : (mine[0]?.summary || "Recovered automatically");
    const posture = recovering
      ? { state: "RECOVERING", reason }
      : lane.runtime_posture;
    let run = lane.execution_run;
    if (run && recovering) {
      run = { ...run, runtime_posture: { state: "RECOVERING", reason } };
    }
    return {
      ...lane,
      runtime_posture: posture || lane.runtime_posture,
      execution_run: run,
      recent_system_activity: mine,
    };
  });
}

export function resetRecoveryForTests(root = runtimeRoot()) {
  isolated = true;
  computeRecoverImpl = null;
  try {
    writeBudgets({ schema_version: "vacilando.recovery_budget.v1", episodes: {}, thrash: {} }, root);
  } catch { /* */ }
  try { writeOwned({ schema_version: "vacilando.owned_process.v1", processes: [] }, root); } catch { /* */ }
  try {
    const p = recoveryEventsPath(root);
    if (existsSync(p)) writeFileSync(p, "", "utf8");
  } catch { /* */ }
}

export function scanStaleSlotPidFiles(root = runtimeRoot()) {
  const dir = pidDir(root);
  const host = hostPidsDir();
  const auto = dir !== host || isolated || String(dir).startsWith(root);
  if (!auto || !existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".pid") || name.endsWith(".provider.pid")) continue;
    const path = join(dir, name);
    let pid = "";
    try { pid = readFileSync(path, "utf8").trim(); } catch { continue; }
    if (!pidAlive(pid)) out.push({ path, pid, name });
  }
  return out;
}
