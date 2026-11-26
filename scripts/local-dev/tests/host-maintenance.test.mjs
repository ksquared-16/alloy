/**
 * DevOps 7 — Weekly Host Maintenance V1.
 *
 * The thing under test is an ORCHESTRATOR, so most of these prove a negative:
 * that it asked an existing owner rather than answering for itself, and that it
 * cannot destroy work by being scheduled.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as M from "../lib/vacilando/host-maintenance.mjs";
import { TRAIN_STATE, CANDIDATE_STATE } from "../lib/vacilando/promotion-train.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");
const codeOf = (f) => readFileSync(join(LIB, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const root = () => mkdtempSync(join(tmpdir(), "maint-"));
const clean = { safe: true, blockers: [], warnings: [], protected_mutations: 0 };
const durable = { durable: true, rows: [], unmeasured: [], failed: [] };
const pass = { pass: true };

/* ── 1 · orchestration, not ownership ────────────────────────────────────── */
test("maintenance uses the existing host, lane, worktree and promotion owners", () => {
  const code = codeOf("host-maintenance.mjs");
  // It delegates the one question DevOps 6 owns.
  assert.ok(code.includes("drainStateForMaintenance"), "must ask DevOps 6 about trains");
  // And it owns no measurement of its own: no process control, no git, no shell.
  for (const forbidden of ["child_process", "spawnSync", "execFileSync", "execSync", "process.kill", "setInterval"]) {
    assert.ok(!code.includes(forbidden), `maintenance must not use ${forbidden}`);
  }
});

test("no second reboot, cleanup or session registry is introduced", () => {
  const code = codeOf("host-maintenance.mjs");
  // Every cleanup operation names an owner that is not this file.
  for (const op of M.CLEANUP_OPERATIONS) {
    assert.ok(op.owner && !op.owner.includes("host-maintenance"), `${op.id} must delegate`);
    assert.ok(op.requires && op.refuses, `${op.id} must say what it requires and refuses`);
  }
  // Cleanup plans; it never performs.
  assert.equal(M.planCleanup({ cleanliness: null }).performs_nothing_itself, true);
  // Session restore consults the lifecycle rather than a list of terminals.
  // Asserted behaviourally, not by keyword: "terminal" also names a terminal
  // PHASE here, and a control that cannot tell those apart would forbid the
  // module from using the ordinary word for a finished state.
  assert.ok(!/tmux|iterm|session_names|sessionRegistry/i.test(code), "no terminal-session registry");
  const restore = M.planSessionRestore({
    lanes: [{ lane_id: "lane_x", restart_context: { next_action: "continue" } }],
  });
  assert.equal(restore.rows[0].lane_id, "lane_x", "the lane is the unit of restore");
  assert.equal(restore.rows[0].disposition, M.RESUME_DISPOSITION.RECREATE);
  // With no lanes there is nothing to restore, because lanes are the authority.
  assert.deepEqual(M.planSessionRestore({}).rows, []);
});

test("the reboot decision returns an intent and cannot restart anything itself", () => {
  const d = M.rebootDecision({ preflight: pass, drain: clean, checkpoint: durable });
  assert.equal(d.may_reboot, true);
  assert.equal(d.intent.mechanism, "shutdown");
  assert.equal(d.intent.restores_gateway_via.includes("launchd"), true);
  // The module names the mechanism and does not hold it.
  assert.ok(!codeOf("host-maintenance.mjs").includes("shutdown -r"), "must not embed an executable command line");
});

/* ── 2 · protected mutations ─────────────────────────────────────────────── */
test("an irreversible governed action in flight blocks the reboot", () => {
  for (const key of ["repository.merge_pull_request", "database.apply_migration", "host.install_toolkit", "database.repair_migration_ledger"]) {
    const drain = M.evaluateDrain({ governedActions: [{ action_key: key, status: "executing", request_id: "gar_1" }] });
    assert.equal(drain.safe, false, `${key} must block`);
    assert.equal(drain.blockers[0].kind, "protected_mutation_in_flight");
    const d = M.rebootDecision({ preflight: pass, drain, checkpoint: durable });
    assert.equal(d.may_reboot, false);
    assert.ok(d.refusals.some((r) => r.gate === "protected_mutation"));
  }
});

test("a read census does not block a reboot", () => {
  const drain = M.evaluateDrain({ governedActions: [{ action_key: "database.read_census", status: "executing" }] });
  assert.equal(drain.safe, true, "losing a read costs time, not correctness");
});

test("there is no override on the reboot gate", () => {
  const src = readFileSync(join(LIB, "host-maintenance.mjs"), "utf8");
  const fn = src.slice(src.indexOf("export function rebootDecision"));
  const sig = fn.slice(0, fn.indexOf("}", fn.indexOf("{")));
  for (const w of ["force", "override", "approved_anyway", "skip"]) {
    assert.ok(!sig.includes(w), `rebootDecision must accept no ${w}`);
  }
});

/* ── 3 · safe work drains ────────────────────────────────────────────────── */
test("a host with nothing in flight is safe to reboot", () => {
  const drain = M.evaluateDrain({ runs: [{ run_id: "r1", state: "COMPLETE" }], trains: [], queue: [] });
  assert.equal(drain.safe, true);
  assert.equal(M.rebootDecision({ preflight: pass, drain, checkpoint: durable }).may_reboot, true);
});

test("an executing run blocks, a waiting run only warns", () => {
  const exec = M.evaluateDrain({ runs: [{ run_id: "r1", state: "EXECUTING", lane_id: "lane_a" }] });
  assert.equal(exec.safe, false);
  assert.equal(exec.blockers[0].kind, "run_executing");
  const waiting = M.evaluateDrain({ runs: [{ run_id: "r2", state: "WAITING_RESOURCE" }] });
  assert.equal(waiting.safe, true, "a run waiting on a resource loses nothing to a reboot");
  assert.equal(waiting.warnings[0].kind, "run_waiting");
});

/* ── 4 · dirty and undurable work survives ───────────────────────────────── */
test("a dirty worktree defers maintenance and is never cleaned", () => {
  const drain = M.evaluateDrain({ worktrees: [{ name: "wt-a", dirty: true }] });
  assert.equal(drain.safe, false);
  assert.equal(drain.blockers[0].kind, "dirty_worktree");
  // And no cleanup operation may target it.
  const op = M.CLEANUP_OPERATIONS.find((o) => o.id === "reclaim_worktrees");
  assert.match(op.refuses, /dirty/);
  assert.match(op.refuses, /undurable/);
  assert.match(op.refuses, /unmeasured/);
});

test("undurable commits block maintenance", () => {
  const drain = M.evaluateDrain({ worktrees: [{ name: "wt-b", undurable: true }] });
  assert.equal(drain.safe, false);
  assert.equal(drain.blockers[0].kind, "undurable_commits");
});

/* ── 5 · worktree cleanup goes through DevOps 3 ──────────────────────────── */
test("reclaimable worktree cleanup is planned from the DevOps 3 inventory", async () => {
  const WL = await import("../lib/vacilando/worktree-lifecycle.mjs");
  const inv = WL.inventoryWorktreeLifecycle({
    evaluations: [{ name: "old-promo", path: "/x/alloy-promotions/old-promo" }],
    supersededBy: { "old-promo": "abc1234" },
  });
  assert.equal(inv.rows[0].state, WL.WORKTREE_LIFECYCLE.SUPERSEDED);
  const cleanliness = M.assessCleanliness({ worktreeLifecycle: inv });
  const plan = M.planCleanup({ cleanliness });
  const reclaim = plan.intents.find((i) => i.id === "reclaim_worktrees");
  assert.ok(reclaim, "a superseded worktree becomes a reclaim intent");
  assert.equal(reclaim.count, inv.reclaimable);
  assert.match(reclaim.owner, /worktree-lifecycle/);
});

test("an unmeasured worktree inventory produces no cleanup at all", () => {
  const plan = M.planCleanup({ cleanliness: M.assessCleanliness({}) });
  assert.ok(plan.skipped.some((s) => s.id === "reclaim_worktrees" && /unmeasured/.test(s.why)));
});

/* ── 6 · the drain sees an active promotion train ────────────────────────── */
test("an in-flight promotion train blocks maintenance through the DevOps 6 owner", () => {
  const drain = M.evaluateDrain({ trains: [{ train_id: "tr1", state: TRAIN_STATE.VALIDATING }] });
  assert.equal(drain.safe, false);
  assert.equal(drain.blockers[0].kind, "promotion_train_in_flight");
  assert.equal(drain.blockers[0].owner, "promotion-train");
});

test("a landed train and a waiting queue do not block maintenance", () => {
  const drain = M.evaluateDrain({
    trains: [{ train_id: "tr1", state: TRAIN_STATE.LANDED }],
    queue: [{ sha: "aaa", state: CANDIDATE_STATE.READY_FOR_STAGING }],
  });
  assert.equal(drain.safe, true);
  assert.equal(drain.train.queued_candidates, 1);
});

/* ── 7 · accepted async governed actions must be durable ─────────────────── */
test("an accepted async execution is a checkpoint requirement, and unmeasured blocks", () => {
  assert.ok(M.CHECKPOINT_REQUIREMENTS.some((r) => r.id === "accepted_executions_durable"));
  const c = M.evaluateCheckpoint({ measurements: { lane_next_action_recorded: true } });
  assert.equal(c.durable, false);
  assert.ok(c.unmeasured.includes("accepted_executions_durable"));
  assert.equal(M.rebootDecision({ preflight: pass, drain: clean, checkpoint: c }).may_reboot, false);
});

test("a fully measured checkpoint is durable", () => {
  const measurements = Object.fromEntries(M.CHECKPOINT_REQUIREMENTS.map((r) => [r.id, true]));
  const c = M.evaluateCheckpoint({ measurements });
  assert.equal(c.durable, true);
  assert.equal(M.rebootDecision({ preflight: pass, drain: clean, checkpoint: c }).may_reboot, true);
});

test("a failed checkpoint requirement is reported apart from an unmeasured one", () => {
  const measurements = Object.fromEntries(M.CHECKPOINT_REQUIREMENTS.map((r) => [r.id, true]));
  measurements.worktree_durability_known = false;
  const c = M.evaluateCheckpoint({ measurements });
  assert.deepEqual(c.failed, ["worktree_durability_known"]);
  assert.deepEqual(c.unmeasured, []);
});

/* ── 8 · the window survives a process restart ───────────────────────────── */
test("an open maintenance window is resumed, not reopened, after a restart", () => {
  const r = root();
  const w = M.openMaintenanceWindow({ root: r, nowMs: Date.parse("2026-09-13T03:00:00Z"), generation: "gen_a" });
  const draining = M.advanceMaintenance(w, { phase: M.PHASE.DRAINING, root: r });
  assert.ok(existsSync(M.maintenanceStatePath(r)), "the window is on disk, not in memory");

  // A fresh process reads the same file and finds work in progress.
  const reread = M.readMaintenanceWindow({ root: r });
  assert.equal(reread.maintenance_id, draining.maintenance_id);
  assert.equal(reread.phase, M.PHASE.DRAINING);
  const due = M.maintenanceDue({ root: r, nowMs: Date.parse("2026-09-13T05:30:00Z") });
  assert.equal(due.due, true);
  assert.equal(due.resuming, true, "an interrupted maintenance resumes rather than starting a second one");
});

test("a maintenance attempt is idempotent within its period", () => {
  const r = root();
  const at = Date.parse("2026-09-13T03:00:00Z");
  M.openMaintenanceWindow({ root: r, nowMs: at });
  M.advanceMaintenance(M.readMaintenanceWindow({ root: r }), { phase: M.PHASE.NORMAL, root: r, nowMs: at + 60000 });
  // Same hour, next week's period not reached: not due again.
  const again = M.maintenanceDue({ root: r, nowMs: at + 3 * 24 * 3600_000 });
  assert.equal(again.due, false);
  assert.equal(again.reason, "within_period");
});

test("a deferred attempt still consumes its period rather than spinning", () => {
  const r = root();
  const at = Date.parse("2026-09-13T03:00:00Z");
  const w = M.openMaintenanceWindow({ root: r, nowMs: at });
  M.advanceMaintenance(w, { phase: M.PHASE.CONSTRAINED, root: r, nowMs: at + 4 * 3600_000 });
  const next = M.maintenanceDue({ root: r, nowMs: at + 24 * 3600_000 });
  assert.equal(next.due, false, "last_attempt_ms, not last_success_ms");
});

/* ── 9/10 · generation ───────────────────────────────────────────────────── */
test("the runtime generation is derived from boot time, so a reboot changes it", async () => {
  const H = await import("../lib/vacilando/control-plane-health.mjs");
  const a = H.currentRuntimeGeneration();
  assert.equal(H.currentRuntimeGeneration(), a, "stable within one incarnation");
  const b = H.resetRuntimeGenerationForTests();
  assert.notEqual(a, b, "a new incarnation is a new generation");
});

test("an unchanged generation means the host did not reboot, whatever else passed", () => {
  const c = M.certifyPostBoot({
    preGeneration: "gen_x", postGeneration: "gen_x",
    expectedToolkit: "tk1", runningToolkit: "tk1",
    staleOwnedCount: 0, slotConflicts: 0, admission: "HEALTHY",
    recoveryBacklog: 0, invariants: { verdict: "PASS", blocks_integration: false }, diskFreeGb: 100,
  });
  assert.equal(c.certified, false);
  assert.deepEqual(c.failed, ["generation_changed"]);
  assert.equal(c.phase, M.PHASE.CONSTRAINED);
});

test("previous-generation ownership cannot become current", async () => {
  const H = await import("../lib/vacilando/control-plane-health.mjs");
  const gen = H.currentRuntimeGeneration();
  assert.equal(H.ownershipIsCurrent({ runtime_generation: "gen_old", pid: process.pid }, { generation: gen }), false);
  assert.equal(H.ownershipIsCurrent({ runtime_generation: null, pid: process.pid }, { generation: gen }), false,
    "a record written before generations existed cannot prove it is current");
  assert.equal(H.ownershipIsCurrent({ runtime_generation: gen, pid: process.pid }, { generation: gen }), true);
  assert.equal(H.ownershipIsCurrent({ runtime_generation: gen, pid: 999999 }, { generation: gen }), false,
    "our own generation with a dead pid is our own exited process");
});

test("stale previous-generation ownership fails post-boot certification", () => {
  const c = M.certifyPostBoot({
    preGeneration: "gen_a", postGeneration: "gen_b",
    expectedToolkit: "tk1", runningToolkit: "tk1",
    staleOwnedCount: 3, slotConflicts: 0, admission: "HEALTHY",
    recoveryBacklog: 0, invariants: { verdict: "PASS", blocks_integration: false }, diskFreeGb: 100,
  });
  assert.equal(c.certified, false);
  assert.ok(c.failed.includes("no_stale_generation_ownership"));
});

/* ── 11 · session resume ─────────────────────────────────────────────────── */
test("resume uses canonical lane context, and recreates when a session cannot survive", () => {
  const plan = M.planSessionRestore({
    lanes: [
      { lane_id: "lane_a", restart_context: { next_action: "continue DevOps 7", worktree: "/w/a", branch: "agent/a" } },
      { lane_id: "lane_b", restart_context: { next_action: "run gate 2" } },
    ],
    sessionLifecycle: (l) => (l.lane_id === "lane_a" ? { resumable: true, session_id: "sess_a" } : { resumable: false }),
  });
  assert.equal(plan.by_disposition.RESUME, 1);
  assert.equal(plan.by_disposition.RECREATE, 1);
  assert.equal(plan.operator_reconstruction_required, 0);
  assert.equal(plan.rows[1].next_action, "run gate 2");
});

test("a lane with no durable next action is honestly unresumable", () => {
  const plan = M.planSessionRestore({ lanes: [{ lane_id: "lane_c", restart_context: {} }] });
  assert.equal(plan.rows[0].disposition, M.RESUME_DISPOSITION.NEEDS_OPERATOR);
  assert.equal(plan.operator_reconstruction_required, 1);
});

test("a blocked lane is held with its blocker, not restarted into it", () => {
  const plan = M.planSessionRestore({ lanes: [{ lane_id: "lane_d", blocked_on: "operator_approval", restart_context: { next_action: "x" } }] });
  assert.equal(plan.rows[0].disposition, M.RESUME_DISPOSITION.HOLD);
  assert.match(plan.rows[0].basis, /operator_approval/);
});

test("processes that merely existed before the reboot are not restored", () => {
  for (const subject of ["dev servers", "QA browser sessions", "owned process records"]) {
    assert.equal(M.survivalFor(subject).class, M.SURVIVAL.DO_NOT_RESTORE, `${subject} must not be restored`);
  }
  assert.equal(M.survivalFor("development lane identity").class, M.SURVIVAL.PERSIST);
  assert.equal(M.survivalFor("governed action execution claims").class, M.SURVIVAL.RECONCILE);
  assert.equal(M.survivalFor("promotion train state").class, M.SURVIVAL.RECONCILE);
});

/* ── 12/13/14 · the post-boot gate ───────────────────────────────────────── */
test("slot conflicts block a healthy completion", () => {
  const c = M.certifyPostBoot({
    preGeneration: "a", postGeneration: "b", expectedToolkit: "tk", runningToolkit: "tk",
    staleOwnedCount: 0, slotConflicts: 1, admission: "HEALTHY", recoveryBacklog: 0,
    invariants: { verdict: "PASS", blocks_integration: false }, diskFreeGb: 100,
  });
  assert.equal(c.certified, false);
  assert.ok(c.failed.includes("no_slot_conflicts"));
});

test("admission is restored only when certification passes", () => {
  const good = M.certifyPostBoot({
    preGeneration: "a", postGeneration: "b", expectedToolkit: "tk", runningToolkit: "tk",
    staleOwnedCount: 0, slotConflicts: 0, admission: "HEALTHY", recoveryBacklog: 0,
    invariants: { verdict: "PASS", blocks_integration: false }, diskFreeGb: 100,
  });
  assert.equal(good.certified, true);
  assert.equal(good.admission_restored, true);
  assert.equal(good.phase, M.PHASE.NORMAL);

  const bad = M.certifyPostBoot({
    preGeneration: "a", postGeneration: "b", expectedToolkit: "tk", runningToolkit: "tk",
    staleOwnedCount: 0, slotConflicts: 0, admission: "PROBLEM", recoveryBacklog: 0,
    invariants: { verdict: "PASS", blocks_integration: false }, diskFreeGb: 100,
  });
  assert.equal(bad.admission_restored, false);
  assert.equal(bad.phase, M.PHASE.CONSTRAINED);
});

test("a failed post-boot certification never silently returns to NORMAL", () => {
  const c = M.certifyPostBoot({ preGeneration: "a", postGeneration: "b" });
  assert.equal(c.certified, false);
  assert.equal(c.phase, M.PHASE.CONSTRAINED);
  assert.notEqual(c.phase, M.PHASE.NORMAL);
  assert.ok(c.unmeasured.length > 0, "and it says exactly what it could not prove");
  assert.match(c.reason, /incomplete/);
});

test("a failing Critical Invariant blocks the host returning to normal", () => {
  const c = M.certifyPostBoot({
    preGeneration: "a", postGeneration: "b", expectedToolkit: "tk", runningToolkit: "tk",
    staleOwnedCount: 0, slotConflicts: 0, admission: "HEALTHY", recoveryBacklog: 0,
    invariants: { verdict: "FAIL", blocks_integration: true }, diskFreeGb: 100,
  });
  assert.equal(c.certified, false);
  assert.ok(c.failed.includes("critical_invariants"));
});

test("an UNMEASURED invariant pack blocks exactly as a failing one does", () => {
  const c = M.certifyPostBoot({
    preGeneration: "a", postGeneration: "b", expectedToolkit: "tk", runningToolkit: "tk",
    staleOwnedCount: 0, slotConflicts: 0, admission: "HEALTHY", recoveryBacklog: 0,
    invariants: { verdict: "UNMEASURED", blocks_integration: true }, diskFreeGb: 100,
  });
  assert.equal(c.certified, false);
  assert.ok(c.unmeasured.includes("critical_invariants"));
});

test("a toolkit mismatch after boot fails certification", () => {
  const c = M.certifyPostBoot({
    preGeneration: "a", postGeneration: "b", expectedToolkit: "tk_new", runningToolkit: "tk_old",
    staleOwnedCount: 0, slotConflicts: 0, admission: "HEALTHY", recoveryBacklog: 0,
    invariants: { verdict: "PASS", blocks_integration: false }, diskFreeGb: 100,
  });
  assert.equal(c.certified, false);
  assert.ok(c.failed.includes("toolkit_identity"));
});

/* ── 15 · the report ─────────────────────────────────────────────────────── */
test("the maintenance report is bounded and carries no raw output", () => {
  const w = M.openMaintenanceWindow({ nowMs: Date.now(), generation: "gen_a", toolkit: "tk1" });
  const report = M.maintenanceReport(
    { ...w, post_reboot_generation: "gen_b", toolkit_after: "tk1", updates: [{ kind: "tooling_patch", applied: true }, { kind: "claude_code", applied: false, class: "CANARY_REQUIRED" }] },
    {
      cleanup: { performed: [{ id: "reclaim_worktrees", count: 3, disk_mb: 1200 }] },
      certification: { certified: true, checks: [{ id: "critical_invariants", outcome: "PASS" }] },
      restore: { by_disposition: { RESUME: 1, RECREATE: 4, HOLD: 2 } },
    },
  );
  assert.ok(JSON.stringify(report).length <= M.REPORT_MAX_BYTES, "the report is bounded");
  assert.equal(report.worktrees_reclaimed, 3);
  assert.equal(report.disk_reclaimed_mb, 1200);
  assert.equal(report.sessions_recreated, 4);
  assert.equal(report.lanes_blocked, 2);
  assert.deepEqual(report.updates_applied, ["tooling_patch"]);
  assert.deepEqual(report.updates_deferred, ["claude_code:CANARY_REQUIRED"]);
  assert.equal(report.health_outcome, "CERTIFIED");
  const text = JSON.stringify(report);
  assert.ok(!/stdout|stderr|\$ /.test(text), "no raw command output in durable evidence");
});

test("an oversized report is truncated rather than allowed to grow", () => {
  const warnings = Array.from({ length: 40 }, (_, i) => ({ kind: "w".repeat(120), detail: `${i}`.repeat(120) }));
  const report = M.maintenanceReport({ maintenance_id: "m1" }, { drain: { warnings } });
  assert.ok(JSON.stringify(report).length <= M.REPORT_MAX_BYTES);
});

/* ── 17 · bounded defer ──────────────────────────────────────────────────── */
test("maintenance defers while blocked and gives up to the operator, never forcing", () => {
  const r = root();
  const at = Date.parse("2026-09-13T03:00:00Z");
  let w = M.openMaintenanceWindow({ root: r, nowMs: at });
  const drain = M.evaluateDrain({ governedActions: [{ action_key: "database.apply_migration", status: "executing" }] });

  const first = M.deferMaintenance(w, { root: r, nowMs: at + 15 * 60000, drain });
  assert.equal(first.deferred, true);
  assert.equal(first.exhausted, false);
  assert.equal(first.window.phase, M.PHASE.DEFERRED);
  assert.equal(first.window.defers, 1);
  assert.ok(first.retry_at);

  // Past the four-hour window: attention, not force.
  const last = M.deferMaintenance(first.window, { root: r, nowMs: at + 5 * 3600_000, drain });
  assert.equal(last.deferred, false);
  assert.equal(last.exhausted, true);
  assert.equal(last.operator_attention, true);
  assert.equal(last.window.phase, M.PHASE.CONSTRAINED);
  assert.match(last.reason, /rather than forcing a reboot/);
  // The blockers are recorded so the operator does not have to rediscover them.
  assert.ok(last.window.last_blockers.some((b) => b.includes("apply_migration")));
});

test("the defer count is bounded independently of elapsed time", () => {
  const at = Date.parse("2026-09-13T03:00:00Z");
  let w = M.openMaintenanceWindow({ nowMs: at });
  w.defers = M.MAINTENANCE_POLICY.max_defers;
  const r = M.deferMaintenance(w, { nowMs: at + 60000, drain: { blockers: [] } });
  assert.equal(r.exhausted, true);
});

/* ── scheduling ──────────────────────────────────────────────────────────── */
test("the weekly slot is measured, configurable and low-frequency", () => {
  assert.equal(M.MAINTENANCE_POLICY.weekday, 0, "Sunday: 7 admission events in 24 days");
  assert.equal(M.MAINTENANCE_POLICY.hour_local, 3);
  assert.equal(M.MAINTENANCE_POLICY.period_ms, 7 * 24 * 3600_000);
  // The defer window must fit inside the measured dead zone (Sun 00:00-07:00).
  assert.ok(M.MAINTENANCE_POLICY.hour_local + M.MAINTENANCE_POLICY.defer_window_ms / 3600_000 <= 7,
    "a fully deferred attempt must still finish inside quiet hours");
  // No polling: the recheck is a multiple of the steward's own cycle.
  assert.ok(M.MAINTENANCE_POLICY.defer_recheck_ms >= 5 * 60_000);
});

test("maintenance is not due outside its slot or inside its period", () => {
  const sunday3 = Date.parse("2026-09-13T03:30:00");
  assert.equal(M.maintenanceDue({ window: null, nowMs: sunday3 }).due, true);
  const sunday9 = Date.parse("2026-09-13T09:30:00");
  assert.equal(M.maintenanceDue({ window: null, nowMs: sunday9 }).reason, "outside_slot");
  const wednesday3 = Date.parse("2026-09-16T03:30:00");
  assert.equal(M.maintenanceDue({ window: null, nowMs: wednesday3 }).reason, "outside_slot");
});

test("closed phases stop new heavy work and new trains", () => {
  for (const p of [M.PHASE.DRAINING, M.PHASE.READY_TO_REBOOT, M.PHASE.REBOOTING, M.PHASE.RECOVERING, M.PHASE.VERIFYING]) {
    assert.ok(M.CLOSED_TO_NEW_WORK.includes(p), `${p} must not admit new work`);
  }
  assert.ok(!M.CLOSED_TO_NEW_WORK.includes(M.PHASE.NORMAL));
  assert.ok(!M.CLOSED_TO_NEW_WORK.includes(M.PHASE.MAINTENANCE_PENDING), "pending still admits; draining is where it stops");
});

/* ── G · update policy ───────────────────────────────────────────────────── */
test("updates are classified, and anything unrecognised is never automatic", () => {
  assert.equal(M.classifyUpdate("tooling_patch").class, M.UPDATE_CLASS.AUTO_SAFE);
  assert.equal(M.classifyUpdate("claude_code").class, M.UPDATE_CLASS.CANARY_REQUIRED);
  assert.equal(M.classifyUpdate("macos_major").class, M.UPDATE_CLASS.MANUAL_DEFERRED);
  assert.equal(M.classifyUpdate("node_major").class, M.UPDATE_CLASS.MANUAL_DEFERRED);
  const unknown = M.classifyUpdate("something_new_next_year");
  assert.equal(unknown.class, M.UPDATE_CLASS.MANUAL_DEFERRED);
  assert.match(unknown.why, /never applied automatically/);
});

test("the canary policy is a seam, and without it canary updates are not applied", () => {
  const seam = M.canarySeam();
  assert.equal(seam.implemented_here, false);
  assert.equal(seam.owner, "DevOps 9");
  assert.match(seam.behaviour_without_it, /not applied/);
});

/* ── E · cleanliness ─────────────────────────────────────────────────────── */
test("cleanliness is composed from existing projections and reports what it could not see", () => {
  const partial = M.assessCleanliness({ worktreeLifecycle: { worktrees: 10, reclaimable: 2, blocked: 1, by_state: {} } });
  assert.equal(partial.complete, false);
  assert.ok(partial.unmeasured.includes("disk"));
  assert.ok(partial.unmeasured.includes("control_plane"));
  const wt = partial.sections.find((s) => s.section === "worktrees");
  assert.equal(wt.measured, true);
  assert.equal(wt.reclaimable, 2);
});

/* ── O · DevOps 8 seam ───────────────────────────────────────────────────── */
test("the configuration audit seam runs after the host is proven and gates nothing", () => {
  const seam = M.configurationAuditSeam();
  assert.equal(seam.owner, "DevOps 8");
  assert.equal(seam.implemented_here, false);
  assert.equal(seam.gates_admission, false, "prompt hygiene must never block a reboot");
  assert.equal(seam.runs_in_phase, M.PHASE.VERIFYING);
  const withAudit = M.configurationAuditSeam({ audit: { findings: [{ id: "dup" }], clean: false } });
  assert.match(withAudit.reported_as, /1 configuration finding/);
});

/* ── N · failure safety ──────────────────────────────────────────────────── */
test("maintenance that never reaches reboot leaves a diagnosable window", () => {
  const r = root();
  const at = Date.parse("2026-09-13T03:00:00Z");
  const w = M.openMaintenanceWindow({ root: r, nowMs: at, generation: "gen_a" });
  M.advanceMaintenance(w, { phase: M.PHASE.READY_TO_REBOOT, root: r, nowMs: at + 60000 });
  const rec = M.readMaintenanceWindow({ root: r });
  assert.ok(rec.ready_at, "ready_at is recorded even though the reboot never happened");
  assert.equal(rec.reboot_initiated_at, null);
  assert.equal(M.isTerminalPhase(rec.phase), false, "so the next cycle resumes it");
});

test("the window records the timestamps the reboot owner requires", () => {
  const r = root();
  const at = Date.parse("2026-09-13T03:00:00Z");
  let w = M.openMaintenanceWindow({ root: r, nowMs: at, generation: "gen_a", toolkit: "tk1" });
  w = M.advanceMaintenance(w, { phase: M.PHASE.READY_TO_REBOOT, root: r, nowMs: at + 60000 });
  w = M.advanceMaintenance(w, { phase: M.PHASE.REBOOTING, root: r, nowMs: at + 90000 });
  assert.ok(w.requested_at && w.ready_at && w.reboot_initiated_at);
  assert.equal(w.reason, "weekly scheduled maintenance");
  assert.equal(w.pre_reboot_generation, "gen_a");
});

test("a partially failed cleanup does not stop the rest of the cycle", () => {
  const cleanliness = M.assessCleanliness({
    worktreeLifecycle: { worktrees: 4, reclaimable: 1, blocked: 0, reclaimable_disk_mb: 40, by_state: {} },
  });
  const plan = M.planCleanup({ cleanliness, allow: ["reclaim_worktrees"] });
  assert.equal(plan.intents.length, 1);
  assert.ok(plan.skipped.length > 0, "the rest are skipped with reasons, not failed");
  for (const s of plan.skipped) assert.ok(s.why, "every skip says why");
});

/* ── the steward cycle carries the weekly cadence ────────────────────────── */
test("the weekly cadence rides the existing Host Steward cycle, not a new timer", async () => {
  const S = await import("../lib/vacilando/host-steward-cycle.mjs");
  const r = root();
  assert.equal(S.MAINTENANCE_CADENCE_MS, 7 * 24 * 3600_000);
  assert.equal(S.maintenanceCadenceDue({ root: r }).due, true, "never run in this root");

  S.recordMaintenanceAttempt({ root: r, outcome: "DEFERRED" });
  const now = Date.now();
  assert.equal(S.maintenanceCadenceDue({ root: r, nowMs: now }).due, false);
  assert.equal(S.maintenanceCadenceDue({ root: r, nowMs: now + S.MAINTENANCE_CADENCE_MS + 1000 }).due, true);

  // THE DEFECT THIS PINS. The steward's readState projects an explicit field
  // list and DROPS anything it does not name. The first wiring wrote
  // maintenance_last_attempt_ms successfully and read back null for ever: a
  // maintenance that ran every five minutes and believed it never had.
  const raw = JSON.parse(readFileSync(S.stewardStatePath(r), "utf8"));
  assert.ok(raw.maintenance_last_attempt_ms, "written to disk");
  assert.ok(S.maintenanceCadenceDue({ root: r, nowMs: now }).last_ms, "and survives the projection");
});

test("recording an attempt does not disturb the steward's own hygiene state", async () => {
  const S = await import("../lib/vacilando/host-steward-cycle.mjs");
  const r = root();
  S.recordHygieneCycle({ root: r, nowMs: 1000, summary: { reclaimed: 2 } });
  S.recordMaintenanceAttempt({ root: r, nowMs: 2000 });
  const h = S.hygieneDue({ root: r, nowMs: 2000, cadenceMs: S.HYGIENE_CADENCE_MS });
  assert.equal(h.last_ms, 1000, "hygiene's record survives a maintenance write");
});
