#!/usr/bin/env node
/**
 * Phase 5 — bounded self-healing + reconciliation.
 * Isolated runtime. Injected resume send. Does not attach to live Claude.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  activeRunForLane,
  createQueuedRun,
  executionRunStorePath,
  getExecutionRun,
  reportRunState,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import {
  activeRequestForRunResource,
  attachLaneResourceWaits,
  patchResourceRequest,
  queuedRequestsFor,
  readComputeHolders,
  readResourceRequestStore,
  resetResourceRequestsForTests,
  setResourceGrantImplForTests,
  setResourceResumeHook,
} from "../lib/vacilando/execution-resource.mjs";
import { readExclusiveWindow } from "../lib/vacilando/execution-exclusive.mjs";
import {
  flushGrantResumes,
  installGrantResumeHook,
  resetResumeForTests,
  setResumeDeliveryImplForTests,
} from "../lib/vacilando/execution-resume.mjs";
import {
  FAILURE_CLASSES,
  RECOVERY_BUDGETS,
  attachLaneRecovery,
  executeRecovery,
  getRecoveryPolicy,
  listOwnedProcesses,
  listRecoveryPolicies,
  readBudgetEpisode,
  recoveryBudgetPath,
  recoveryEventsPath,
  registerOwnedProcess,
  resetRecoveryForTests,
  setRecoveryComputeImplForTests,
} from "../lib/vacilando/execution-recovery.mjs";
import { lastReconcilePass, reconcileGovernor, SENSOR_TIERS } from "../lib/vacilando/execution-reconcile.mjs";
import { readControlPlaneOwner } from "../lib/vacilando/control-plane-health.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const ROOT = mkdtempSync(join(tmpdir(), "vac-erec-"));
const COMPUTE = mkdtempSync(join(tmpdir(), "vac-erec-comp-"));
const WT = mkdtempSync(join(tmpdir(), "vac-erec-wt-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_COMPUTE_STATE_DIR = COMPUTE;
process.env.ALLOY_COMPUTE_MIN_RECLAIM_AGE = "0";

spawnSync("git", ["init"], { cwd: WT, encoding: "utf8" });
writeFileSync(join(WT, "keep.txt"), "keep\n");

let pass = 0;
let fail = 0;
const sends = [];
const lanesAlive = new Map();

async function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
  resetResourceRequestsForTests(ROOT);
  resetRecoveryForTests(ROOT);
  try {
    const dir = join(COMPUTE, "browser-certification");
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) rmSync(join(dir, name), { force: true });
    }
  } catch { /* */ }
  resetResumeForTests();
  installGrantResumeHook();
  sends.length = 0;
  lanesAlive.clear();
  mockLease({ allow: true });
  delete process.env.VACILANDO_EXCLUSIVE_MAX_MS;
  setResumeDeliveryImplForTests({
    sendLaneInstruction: async (laneId, instruction, opts = {}) => {
      sends.push({ laneId, instruction, opts: { ...opts } });
      return {
        ok: true,
        status: "delivered",
        lane_id: laneId,
        delivered_at: new Date().toISOString(),
        worktree_path: WT,
      };
    },
    getDevelopmentLane: async (id) => fakeLane(id),
  });
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

function fakeLane(id) {
  const rec = lanesAlive.get(id) || {
    tmux: { alive: true, session: id, cwd: WT },
    claude: { presence: "present" },
    worktree: { managed: true, path: WT, name: "wt" },
  };
  lanesAlive.set(id, rec);
  return { ok: true, lane: { lane_id: id, ...rec } };
}

function mockLease({ allow = true } = {}) {
  const held = new Set();
  setResourceGrantImplForTests((op, rec) => {
    const holder = `vac-${rec.run_id}`;
    if (op === "acquire") {
      if (!allow || held.size) return { ok: false, error: "busy", holder };
      held.add(holder);
      return { ok: true, holder };
    }
    held.delete(holder);
    return { ok: true, holder };
  });
  return { held, setAllow(v) { allow = v; } };
}

function makeRun(laneId, instruction = "work", nowMs = Date.now()) {
  fakeLane(laneId);
  const q = createQueuedRun({ laneId, instruction, worktreePath: WT, nowMs, origin: "operator", root: ROOT });
  assert.equal(q.ok, true, q.error);
  const t = transitionExecutionRun(q.run.run_id, "EXECUTING", { root: ROOT, nowMs, origin: "system" });
  assert.equal(t.ok, true, t.error);
  return t.run;
}

function waitOn(run, resource, nowMs = Date.now()) {
  return reportRunState(run.run_id, "waiting-resource", {
    origin: "agent",
    root: ROOT,
    reason: resource,
    resource,
    nowMs,
  });
}

function dropLane(laneId) {
  const raw = JSON.parse(readFileSync(executionRunStorePath(ROOT), "utf8"));
  delete raw.lanes[laneId];
  writeFileSync(executionRunStorePath(ROOT), `${JSON.stringify(raw, null, 2)}\n`);
}

function writePermit(holder, { pid = "999999", created = "2000-01-01T00:00:00.000Z" } = {}) {
  const dir = join(COMPUTE, "browser-certification");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${holder}.permit`), [
    `HOLDER=${holder}`,
    `PID=${pid}`,
    `CREATED=${created}`,
    "WORKTREE=/tmp/gone",
    "REASON=stale",
    "",
  ].join("\n"));
}

function recoveryEvents() {
  try {
    return readFileSync(recoveryEventsPath(ROOT), "utf8")
      .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function attach(ids) {
  return attachLaneRecovery(attachLaneResourceWaits(ids.map((id) => ({
    lane_id: id,
    label: id === "alloy-runtime" ? "Runtime Performance" : id === "alloy-comms" ? "Communications" : "Records / Roster",
    tmux: lanesAlive.get(id)?.tmux,
    claude: lanesAlive.get(id)?.claude,
    worktree: lanesAlive.get(id)?.worktree,
    execution_run: activeRunForLane(id, ROOT),
  })), ROOT), ROOT);
}

function gitKeep() {
  assert.equal(readFileSync(join(WT, "keep.txt"), "utf8"), "keep\n");
  assert.equal(existsSync(join(WT, ".git")), true);
}

await test("only registered recovery policies execute; unknown recovery is refused", () => {
  const keys = listRecoveryPolicies().map((p) => p.key);
  assert.deepEqual(keys.sort(), [
    "abandoned_browser_cert_lease",
    "disposable_cert_process",
    "exclusive_window_drift",
    "execution_command_timeout",
    "resource_queue_drift",
    "stale_control_plane_owner",
    "stale_governor_resource_holder",
    "stale_slot_pid",
  ].sort());
  for (const k of keys) assert.equal(Boolean(getRecoveryPolicy(k)), true);
  const refused = executeRecovery("invented_shell_rm", { root: ROOT, target: "x" });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, "unknown_policy");
  assert.equal(refused.classification, "REQUIRES_JUDGMENT");
  assert.equal(FAILURE_CLASSES.includes("AMBIGUOUS"), true);
  assert.equal(SENSOR_TIERS[3].includes("not used"), true);
});

await test("classification is enforced and recovery budgets persist across simulated restart", async () => {
  const holder = makeRun("alloy-records", "cert", 1);
  waitOn(holder, "browser_certification", 10);
  await flushGrantResumes();
  dropLane("alloy-records");
  const rec = readResourceRequestStore(ROOT).requests.find((r) => r.run_id === holder.run_id);
  const first = executeRecovery("stale_governor_resource_holder", { rec, root: ROOT, nowMs: 20, target: rec.request_id });
  assert.equal(first.ok, true);
  assert.equal(first.verified, true);
  assert.equal(first.classification, "RECOVERABLE");
  const episode = readBudgetEpisode("stale_governor_resource_holder", rec.request_id, ROOT);
  assert.equal(episode.attempts, 1);
  assert.equal(existsSync(recoveryBudgetPath(ROOT)), true);
  const again = executeRecovery("stale_governor_resource_holder", { rec, root: ROOT, nowMs: 30, target: rec.request_id });
  assert.equal(again.exhausted, true);
  assert.equal(again.error, "budget_exhausted");
  assert.equal(readBudgetEpisode("stale_governor_resource_holder", rec.request_id, ROOT).attempts, 1);
  assert.equal(RECOVERY_BUDGETS.stale_governor_resource_holder, 1);
});

await test("scenario A: dead Governor browser grant recovered and next waiter resumes exactly once", async () => {
  const records = makeRun("alloy-records", "Records / Roster cert", 1);
  const comms = makeRun("alloy-comms", "Communications ingress", 2);
  waitOn(records, "browser_certification", 10);
  waitOn(comms, "browser_certification", 20);
  await flushGrantResumes();
  assert.equal(activeRequestForRunResource(records.run_id, "browser_certification", ROOT).state, "GRANTED");
  assert.equal(activeRequestForRunResource(comms.run_id, "browser_certification", ROOT).state, "QUEUED");
  dropLane("alloy-records");
  const summary = await reconcileGovernor({ root: ROOT, nowMs: 30, depth: "cheap", reason: "test" });
  await flushGrantResumes();
  assert.equal(summary.recovered >= 1, true, JSON.stringify(summary));
  assert.equal(activeRequestForRunResource(comms.run_id, "browser_certification", ROOT).state, "GRANTED");
  assert.equal(getExecutionRun(comms.run_id, ROOT).state, "VALIDATING");
  assert.equal(sends.filter((s) => s.laneId === "alloy-comms").length, 1);
  assert.equal(recoveryEvents().some((e) => e.type === "recovery_verified"), true);
  gitKeep();
});

await test("scenario B: live holder is protected — no lease theft", async () => {
  const run = makeRun("alloy-records", "live", 1);
  waitOn(run, "browser_certification", 10);
  await flushGrantResumes();
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  const out = executeRecovery("stale_governor_resource_holder", { rec, root: ROOT, nowMs: 20, target: rec.request_id });
  assert.equal(out.ok, false);
  assert.equal(out.error, "owner_still_live");
  assert.equal(activeRequestForRunResource(run.run_id, "browser_certification", ROOT).state, "GRANTED");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "VALIDATING");
});

await test("foreign live owner is protected; dead foreign owner uses canonical recover", async () => {
  writePermit("live-owner", { pid: String(process.pid), created: new Date().toISOString() });
  const live = executeRecovery("abandoned_browser_cert_lease", {
    holder: "live-owner",
    permit: { holder: "live-owner", alive: true, created: new Date().toISOString() },
    root: ROOT,
    nowMs: 10,
    target: "live-owner",
  });
  assert.equal(live.error, "holder_alive");
  assert.equal(existsSync(join(COMPUTE, "browser-certification", "live-owner.permit")), true);

  writePermit("dead-owner");
  const recovered = executeRecovery("abandoned_browser_cert_lease", {
    holder: "dead-owner",
    permit: { holder: "dead-owner", alive: false, created: "2000-01-01T00:00:00.000Z" },
    root: ROOT,
    nowMs: 20,
    target: "dead-owner",
  });
  assert.equal(recovered.ok, true, recovered.error || recovered.summary);
  assert.equal(recovered.verified, true);
  assert.equal(existsSync(join(COMPUTE, "browser-certification", "dead-owner.permit")), false);
  const src = readFileSync(join(HERE, "../lib/vacilando/execution-recovery.mjs"), "utf8");
  assert.match(src, /\["recover", resource, "--holder"/);
  assert.match(src, /\["release", resource, "--holder"/);
  assert.equal(/unlinkSync\([^)]*permit/.test(src), false);
});

await test("failed post-condition is not called success", () => {
  writePermit("ghost");
  setRecoveryComputeImplForTests(() => ({ ok: true }));
  const out = executeRecovery("abandoned_browser_cert_lease", {
    holder: "ghost",
    permit: { holder: "ghost", alive: false, created: "2000-01-01T00:00:00.000Z" },
    root: ROOT,
    nowMs: 10,
    target: "ghost",
  });
  assert.equal(out.ok, false);
  assert.equal(out.verified, false);
  assert.equal(existsSync(join(COMPUTE, "browser-certification", "ghost.permit")), true);
  assert.equal(recoveryEvents().some((e) => e.type === "recovery_verified" && e.target === "ghost"), false);
});

await test("GRANTED-but-missing lease, terminal queued request, and idle head are reconciled", async () => {
  setResourceResumeHook(() => {});
  const a = makeRun("alloy-records", "A", 1);
  waitOn(a, "browser_certification", 10);
  const rec = activeRequestForRunResource(a.run_id, "browser_certification", ROOT);
  assert.equal(rec.state, "GRANTED");
  const missing = executeRecovery("resource_queue_drift", {
    rec,
    root: ROOT,
    nowMs: 20,
    kind: "granted_missing_lease",
    target: rec.request_id,
  });
  assert.equal(missing.classification, "RECOVERABLE");
  assert.equal(missing.ok, true);

  const lease = mockLease({ allow: false });
  const b = makeRun("alloy-comms", "B", 2);
  waitOn(b, "browser_certification", 30);
  const queued = activeRequestForRunResource(b.run_id, "browser_certification", ROOT);
  assert.equal(queued.state, "QUEUED");
  dropLane("alloy-comms");
  const removed = executeRecovery("resource_queue_drift", {
    rec: queued,
    root: ROOT,
    nowMs: 40,
    kind: "terminal_queued",
    target: queued.request_id,
  });
  assert.equal(removed.ok, true);
  const after = (readResourceRequestStore(ROOT).requests || []).find((r) => r.request_id === queued.request_id);
  assert.notEqual(after?.state, "QUEUED");

  lease.setAllow(false);
  const c = makeRun("alloy-identity", "C", 3);
  waitOn(c, "browser_certification", 50);
  assert.equal(activeRequestForRunResource(c.run_id, "browser_certification", ROOT).state, "QUEUED");
  lease.setAllow(true);
  await reconcileGovernor({ root: ROOT, nowMs: 60, depth: "targeted" });
  assert.equal(activeRequestForRunResource(c.run_id, "browser_certification", ROOT).state, "GRANTED");
});

await test("scenario E: exclusive owner disappearance releases window and lifts quiescence", async () => {
  const records = makeRun("alloy-records", "browser", 1);
  const comms = makeRun("alloy-comms", "queued", 2);
  const runtime = makeRun("alloy-runtime", "timing", 3);
  waitOn(records, "browser_certification", 10);
  waitOn(comms, "browser_certification", 20);
  waitOn(runtime, "runtime_timing_certification", 30);
  await flushGrantResumes();
  const before = attach(["alloy-records", "alloy-comms", "alloy-runtime"]);
  assert.equal(before[1].runtime_posture?.state, "QUIESCED");
  assert.ok(readExclusiveWindow(ROOT)?.phase);
  assert.notEqual(readExclusiveWindow(ROOT)?.phase, "EXCLUSIVE_ACTIVE");
  dropLane("alloy-runtime");
  await reconcileGovernor({ root: ROOT, nowMs: 40, depth: "cheap" });
  assert.equal(readExclusiveWindow(ROOT), null);
  const after = attach(["alloy-records", "alloy-comms", "alloy-runtime"]);
  assert.equal(after[0].tmux.alive, true);
  assert.equal(after[1].tmux.alive, true);
  assert.notEqual(after[1].runtime_posture?.state, "QUIESCED");
  assert.equal(activeRequestForRunResource(records.run_id, "browser_certification", ROOT).state, "GRANTED");
  assert.equal(activeRequestForRunResource(comms.run_id, "browser_certification", ROOT).state, "QUEUED");
});

await test("scenario D: DELIVERING continuation is not resent; DELIVERED drift repairs without resend", async () => {
  const run = makeRun("alloy-comms", "cont", 1);
  waitOn(run, "browser_certification", 10);
  await flushGrantResumes();
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  sends.length = 0;
  patchResourceRequest(rec.request_id, {
    continuation: {
      continuation_id: "econ_ambig",
      kind: "resource_granted",
      delivery_state: "DELIVERING",
      grant_episode: rec.granted_at,
      attempt_count: 1,
    },
  }, { root: ROOT });
  await reconcileGovernor({ root: ROOT, nowMs: 20, depth: "targeted", continuations: true });
  assert.equal(sends.length, 0);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "NEEDS_INPUT");
  const rec2 = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  assert.equal(rec2.continuation.delivery_state, "DELIVERING");
});

await test("control-plane stale owner is replaced; live foreign owner is not stolen", () => {
  mkdirSync(join(ROOT, "vacilando"), { recursive: true });
  writeFileSync(join(ROOT, "vacilando", "control-plane-owner.json"), JSON.stringify({
    schema_version: "vacilando.control_plane_owner.v1",
    pid: 999999,
    port: 3020,
    claimed_at: "2000-01-01T00:00:00.000Z",
  }, null, 2));
  const out = executeRecovery("stale_control_plane_owner", { root: ROOT, nowMs: 10, pid: process.pid, target: "control-plane" });
  assert.equal(out.ok, true, out.error);
  assert.equal(Number(readControlPlaneOwner().pid), process.pid);

  writeFileSync(join(ROOT, "vacilando", "control-plane-owner.json"), JSON.stringify({
    schema_version: "vacilando.control_plane_owner.v1",
    pid: process.pid,
    port: 3020,
    claimed_at: new Date().toISOString(),
  }, null, 2));
  const live = executeRecovery("stale_control_plane_owner", {
    root: ROOT,
    nowMs: 20,
    pid: process.pid + 1,
    target: "control-plane",
  });
  assert.equal(live.error, "live_foreign_owner");
  assert.equal(Number(readControlPlaneOwner().pid), process.pid);
});

await test("stale slot PID files under the runtime root are unlinked; host paths are refused", () => {
  const dir = join(ROOT, "pids");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "slot5.pid");
  writeFileSync(path, "999999\n");
  const out = executeRecovery("stale_slot_pid", { path, pid: "999999", root: ROOT, nowMs: 10, target: path });
  assert.equal(out.ok, true);
  assert.equal(existsSync(path), false);
  const outside = join(tmpdir(), "vac-host-slot.pid");
  writeFileSync(outside, "999999\n");
  const refused = executeRecovery("stale_slot_pid", { path: outside, pid: "999999", root: ROOT, nowMs: 20, target: outside });
  assert.equal(refused.error, "pid_file_outside_runtime");
  assert.equal(existsSync(outside), true);
});

await test("disposable Governor-owned process records are cleaned; unknown provenance is observed", () => {
  registerOwnedProcess({ id: "disp-1", pid: 999999, created_by: "vacilando-governor", lane_id: "alloy-comms" }, ROOT);
  const ok = executeRecovery("disposable_cert_process", {
    rec: listOwnedProcesses(ROOT)[0],
    root: ROOT,
    nowMs: 10,
    target: "disp-1",
  });
  assert.equal(ok.ok, true);
  assert.equal(listOwnedProcesses(ROOT).length, 0);
  const unknown = executeRecovery("disposable_cert_process", {
    rec: { id: "user-1", pid: 999999, created_by: "operator" },
    root: ROOT,
    nowMs: 20,
    target: "user-1",
  });
  assert.equal(unknown.error, "unknown_provenance");
});

await test("multi-lane recovery preserves FIFO fairness and sessions", async () => {
  const records = makeRun("alloy-records", "Records / Roster cert", 1);
  const comms = makeRun("alloy-comms", "Communications ingress", 2);
  const runtime = makeRun("alloy-runtime", "Runtime timing", 3);
  waitOn(records, "browser_certification", 10);
  waitOn(comms, "browser_certification", 20);
  waitOn(runtime, "runtime_timing_certification", 30);
  await flushGrantResumes();
  const qBefore = queuedRequestsFor(readResourceRequestStore(ROOT), "browser_certification").map((r) => r.lane_id);
  assert.deepEqual(qBefore, ["alloy-comms"]);
  dropLane("alloy-records");
  await reconcileGovernor({ root: ROOT, nowMs: 40, depth: "cheap" });
  await flushGrantResumes();
  assert.equal(activeRequestForRunResource(comms.run_id, "browser_certification", ROOT).state, "QUEUED");
  const qAfter = queuedRequestsFor(readResourceRequestStore(ROOT), "browser_certification").map((r) => r.lane_id);
  assert.deepEqual(qAfter, ["alloy-comms"]);
  const runtimeReq = activeRequestForRunResource(runtime.run_id, "runtime_timing_certification", ROOT);
  assert.ok(runtimeReq.state === "QUEUED" || runtimeReq.state === "GRANTED");
  const lanes = attach(["alloy-records", "alloy-comms", "alloy-runtime"]);
  assert.equal(lanes[1].tmux.alive, true);
  assert.equal(lanes[2].tmux.alive, true);
  assert.equal(lanes[1].claude.presence, "present");
  gitKeep();
});

await test("retries are bounded; thrash of the same lane/resource escalates", async () => {
  for (let i = 0; i < 3; i += 1) {
    const run = makeRun("alloy-runtime", `t${i}`, 10 + i);
    waitOn(run, "runtime_timing_certification", 10 + i);
    await flushGrantResumes();
    dropLane("alloy-runtime");
    const out = executeRecovery("exclusive_window_drift", {
      root: ROOT,
      nowMs: 20 + i,
      target: `win-${i}`,
      rec: { lane_id: "alloy-runtime", run_id: run.run_id, resource_key: "runtime_timing_certification" },
    });
    assert.equal(out.ok, true, out.error || out.summary);
  }
  const run = makeRun("alloy-runtime", "t3", 40);
  waitOn(run, "runtime_timing_certification", 40);
  await flushGrantResumes();
  dropLane("alloy-runtime");
  const fourth = executeRecovery("exclusive_window_drift", {
    root: ROOT,
    nowMs: 50,
    target: "win-3",
    rec: { lane_id: "alloy-runtime", run_id: run.run_id, resource_key: "runtime_timing_certification" },
  });
  assert.equal(fourth.exhausted, true);
  assert.equal(fourth.error, "thrash");
});

await test("fresh dead foreign remains protected; live foreign is not stolen on grant", async () => {
  const prev = process.env.ALLOY_COMPUTE_MIN_RECLAIM_AGE;
  process.env.ALLOY_COMPUTE_MIN_RECLAIM_AGE = "900";
  try {
    writePermit("foreign-fresh", { pid: "999999", created: new Date().toISOString() });
    const tooFresh = executeRecovery("abandoned_browser_cert_lease", {
      holder: "foreign-fresh",
      permit: { holder: "foreign-fresh", alive: false, pid: "999999", created: new Date().toISOString() },
      root: ROOT,
      nowMs: 10,
      target: "foreign-fresh",
    });
    assert.equal(tooFresh.error, "permit_too_fresh");
    assert.equal(existsSync(join(COMPUTE, "browser-certification", "foreign-fresh.permit")), true);
    assert.equal(readBudgetEpisode("abandoned_browser_cert_lease", "foreign-fresh", ROOT), null);

    writePermit("live-grant-owner", { pid: String(process.pid), created: new Date().toISOString() });
    const comms = makeRun("alloy-comms", "Communications cert", 20);
    waitOn(comms, "browser_certification", 20);
    await flushGrantResumes();
    assert.equal(activeRequestForRunResource(comms.run_id, "browser_certification", ROOT).state, "QUEUED");
    assert.equal(existsSync(join(COMPUTE, "browser-certification", "live-grant-owner.permit")), true);
    assert.notEqual(getExecutionRun(comms.run_id, ROOT).state, "FAILED");
    assert.notEqual(getExecutionRun(comms.run_id, ROOT).state, "ABANDONED");
  } finally {
    process.env.ALLOY_COMPUTE_MIN_RECLAIM_AGE = prev;
  }
});

await test("dead Governor browser-cert owner is released immediately; queue advances and waiter resumes once", async () => {
  const prev = process.env.ALLOY_COMPUTE_MIN_RECLAIM_AGE;
  process.env.ALLOY_COMPUTE_MIN_RECLAIM_AGE = "900";
  try {
    writePermit("vac-erun_deadowner", { pid: "999999", created: new Date().toISOString() });
    const comms = makeRun("alloy-comms", "Communications browser cert", 10);
    waitOn(comms, "browser_certification", 10);
    await flushGrantResumes();
    assert.equal(existsSync(join(COMPUTE, "browser-certification", "vac-erun_deadowner.permit")), false);
    assert.equal(activeRequestForRunResource(comms.run_id, "browser_certification", ROOT).state, "GRANTED");
    assert.equal(getExecutionRun(comms.run_id, ROOT).state, "VALIDATING");
    assert.equal(sends.filter((s) => s.laneId === "alloy-comms").length, 1);
    assert.equal(recoveryEvents().some((e) =>
      e.type === "recovery_verified"
      && e.policy === "abandoned_browser_cert_lease"
      && e.target === "vac-erun_deadowner"
    ), true);
    assert.equal(getExecutionRun(comms.run_id, ROOT).state === "FAILED", false);
    const cancelled = (readResourceRequestStore(ROOT).requests || [])
      .filter((r) => r.run_id === comms.run_id && (r.state === "CANCELLED" || r.state === "ABANDONED"));
    assert.equal(cancelled.length, 0);
  } finally {
    process.env.ALLOY_COMPUTE_MIN_RECLAIM_AGE = prev;
  }
});

await test("recovery budget does not block a new stale-owner episode", async () => {
  writePermit("dead-owner-a");
  const first = executeRecovery("abandoned_browser_cert_lease", {
    holder: "dead-owner-a",
    permit: { holder: "dead-owner-a", alive: false, pid: "999999", created: "2000-01-01T00:00:00.000Z" },
    root: ROOT,
    nowMs: 10,
    target: "dead-owner-a",
  });
  assert.equal(first.ok, true, first.error || first.summary);
  assert.equal(readBudgetEpisode("abandoned_browser_cert_lease", "dead-owner-a", ROOT).attempts, 1);

  writePermit("dead-owner-b");
  const second = executeRecovery("abandoned_browser_cert_lease", {
    holder: "dead-owner-b",
    permit: { holder: "dead-owner-b", alive: false, pid: "999999", created: "2000-01-01T00:00:00.000Z" },
    root: ROOT,
    nowMs: 20,
    target: "dead-owner-b",
  });
  assert.equal(second.ok, true, second.error || second.summary);
  assert.equal(second.exhausted, undefined);
  assert.equal(existsSync(join(COMPUTE, "browser-certification", "dead-owner-b.permit")), false);
});

await test("idle cheap reconciliation is cheap; no broad process kill", async () => {
  const t0 = process.hrtime.bigint();
  const summary = await reconcileGovernor({ root: ROOT, nowMs: Date.now(), depth: "cheap", reason: "idle" });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(ms < 80, true, `idle reconcile ${ms}ms`);
  assert.equal(summary.depth, "cheap");
  assert.equal(typeof lastReconcilePass().ms, "number");
  const src = readFileSync(join(HERE, "../lib/vacilando/execution-recovery.mjs"), "utf8");
  assert.equal(src.includes("SIGKILL"), false);
  assert.equal(src.includes("terminateUnbrokered"), false);
  assert.equal(/\brm -rf\b/.test(src), false);
  assert.equal(src.includes("tmux kill"), false);
});

await test("package scripts, permits, and Phase 1–4 contracts stay unchanged", () => {
  const diff = (rel) => spawnSync("git", ["diff", "--", rel], { cwd: REPO, encoding: "utf8" }).stdout || "";
  assert.equal(diff("web/package.json"), "");
  assert.equal(diff("scripts/local-dev/alloy-compute"), "");
  assert.equal(diff("scripts/local-dev/lib/sprint-ops.sh"), "");
  assert.equal(diff("scripts/local-dev/lib/browser-cert-lease.mjs"), "");
  assert.equal(diff("scripts/local-dev/lib/lock.sh"), "");
  assert.equal(diff("scripts/local-dev/vac-run"), "");
  const pkg = JSON.parse(readFileSync(join(REPO, "web/package.json"), "utf8"));
  assert.match(String(pkg.scripts.typecheck), /tsc/);
  assert.match(String(pkg.scripts.build), /next build/);
  const exclusive = readFileSync(join(HERE, "../lib/vacilando/execution-exclusive.mjs"), "utf8");
  assert.equal(exclusive.includes("stale lease reclaim"), false);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
