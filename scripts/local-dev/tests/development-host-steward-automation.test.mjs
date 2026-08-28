/**
 * Host Steward automation.
 *
 * The previous slice proved the steward can decide correctly when asked. These
 * controls are about it deciding correctly when NOBODY asks — on a timer, with
 * no operator watching. That is a different risk: the failure mode is no longer
 * "does nothing" but "quietly does something wrong, repeatedly".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";

const C = await import("../lib/vacilando/host-steward-cycle.mjs");
const RUN = await import("../lib/vacilando/host-steward-run.mjs");
const REG = await import("../lib/vacilando/heavy-command-registry.mjs");
const S = await import("../lib/vacilando/host-steward.mjs");
const RS = await import("../lib/vacilando/execution-run.mjs");

const MIN = 60_000;
const NOW = 1_800_000_000_000;
function root() {
  const r = mkdtempSync(join(tmpdir(), "hsauto-"));
  const p = RS.executionRunStorePath(r);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ lanes: {} }));
  return r;
}
function withRun(r, runId, state) {
  const p = RS.executionRunStorePath(r);
  const j = JSON.parse(readFileSync(p, "utf8"));
  j.lanes.lane_x = [{ run_id: runId, state, worktree_path: "/tmp/wt", updated_at: new Date(NOW - 60 * MIN).toISOString() }];
  writeFileSync(p, JSON.stringify(j));
}
const stubExec = () => "";

/* ── Cadence and serialisation ────────────────────────────────────────────── */

await test("cadence is bounded and documented, never a busy loop", () => {
  assert.ok(C.CADENCE_MS >= 60_000, "a sweep faster than a minute is a busy loop");
  assert.ok(C.CADENCE_MS <= 15 * MIN);
  assert.ok(C.RECHECK_MS < C.CADENCE_MS, "post-action recheck must be sooner than the sweep");
});

await test("NC1 — two mutating cycles cannot overlap", () => {
  const r = root();
  const a = C.acquireCycleLock({ root: r, nowMs: NOW });
  assert.equal(a.ok, true);
  const b = C.acquireCycleLock({ root: r, nowMs: NOW + 1000 });
  assert.equal(b.ok, false);
  assert.equal(b.error, "cycle_already_running");
  C.releaseCycleLock({ root: r, cycleId: a.cycle_id });
  assert.equal(C.acquireCycleLock({ root: r, nowMs: NOW + 2000 }).ok, true);
});

await test("NC2 — a crashed cycle does not wedge the loop forever", () => {
  // A plain boolean flag would leave the steward dead after one crash.
  const r = root();
  C.acquireCycleLock({ root: r, nowMs: NOW });
  const later = C.acquireCycleLock({ root: r, nowMs: NOW + C.CYCLE_TIMEOUT_MS + 1000 });
  assert.equal(later.ok, true);
  assert.equal(later.reclaimed_stale_lock, true);
});

/* ── Anti-thrash ──────────────────────────────────────────────────────────── */

await test("NC3 — a resource acted on enters cooldown and is not acted on again", () => {
  const r = root();
  const key = "test_process:hcmd_1";
  assert.equal(C.inCooldown({ root: r, resourceKey: key, nowMs: NOW }), false);
  C.recordAction({ root: r, resourceKey: key, action: "terminate_terminal_test_process", result: { ok: true }, nowMs: NOW });
  assert.equal(C.inCooldown({ root: r, resourceKey: key, nowMs: NOW + 1000 }), true);
  assert.equal(C.inCooldown({ root: r, resourceKey: key, nowMs: NOW + C.ACTION_COOLDOWN_MS + 1000 }), false);
});

await test("NC4 — repeated failure parks a resource instead of retrying forever", () => {
  const r = root();
  const key = "test_process:hcmd_2";
  for (let i = 0; i < C.MAX_ACTION_ATTEMPTS; i++) {
    C.recordAction({ root: r, resourceKey: key, action: "terminate_terminal_test_process", result: { ok: false }, nowMs: NOW + i });
  }
  assert.equal(C.attemptsExhausted({ root: r, resourceKey: key }), true);
});

await test("a cooled-down resource is suppressed from the plan, with a reason", () => {
  const r = root();
  const res = [{
    id: "hcmd_1", resourceClass: "test_process", alloyOwned: true, pid: 1, pgid: 2, command: "node --test x",
    owningRuns: [{ run_id: "e", state: "FAILED", updated_at: new Date(NOW - 60 * MIN).toISOString() }], activeLeases: [],
  }];
  C.recordAction({ root: r, resourceKey: "test_process:hcmd_1", action: "terminate_terminal_test_process", result: { ok: true }, nowMs: NOW });
  const plan = C.buildCyclePlan({ cycleId: "c1", resources: res, root: r, nowMs: NOW + 1000 });
  assert.equal(plan.proposed.length, 0);
  assert.equal(plan.suppressed[0].suppressed_because, "cooldown");
});

/* ── Plan contract and the automatic allowlist ────────────────────────────── */

await test("every proposed action names its canonical executor and postcondition", () => {
  const res = [{
    id: "hcmd_9", resourceClass: "test_process", alloyOwned: true, pid: 1, pgid: 2, command: "node --test x",
    owningRuns: [{ run_id: "e", state: "FAILED", updated_at: new Date(NOW - 60 * MIN).toISOString() }], activeLeases: [],
  }];
  const plan = C.buildCyclePlan({ cycleId: "c1", resources: res, nowMs: NOW });
  const p = plan.proposed[0];
  assert.equal(p.owner, "host-steward-execute");
  assert.equal(p.authority, "automatic");
  assert.ok(p.postcondition.length > 0);
  assert.equal(p.priority, 1, "proven terminal heavy residue is first");
});

await test("NC5 — a non-slot dev server is NEVER automatically signalled", () => {
  // The live wt1 case: alloy-dev-stop could not address it and its group held
  // an unrelated certification process.
  const res = [{
    id: "wt1", resourceClass: "dev_server", alloyOwned: true, pid: 1, pgid: 2, command: "next dev -p 3011",
    owningRuns: [{ run_id: "e", state: "ABANDONED", updated_at: new Date(NOW - 6 * 24 * 60 * MIN).toISOString() }], activeLeases: [],
  }];
  const plan = C.buildCyclePlan({ cycleId: "c1", resources: res, nowMs: NOW });
  assert.equal(plan.proposed.length, 0, "no dev-server stop may be automatic yet");
  assert.match(plan.suppressed[0].suppressed_because, /not certified|authority is operator/);
  assert.equal(C.ACTION_OWNERS.stop_terminal_dev_server.certified, false);
});

await test("NC6 — the steward cannot broaden its own automatic allowlist", () => {
  // Every automatic action must also be one the underlying policy permits.
  for (const [action, owner] of Object.entries(C.ACTION_OWNERS)) {
    if (owner.authority !== "automatic") continue;
    assert.ok(S.AUTONOMOUS_ACTIONS.includes(action), `${action} is automatic here but not in the certified policy`);
  }
  for (const a of S.OPERATOR_ONLY_ACTIONS) {
    assert.ok(!Object.keys(C.ACTION_OWNERS).includes(a), `${a} must not appear as a steward action`);
  }
});

await test("priority is deterministic and is not age", () => {
  assert.equal(C.ACTION_PRIORITY.terminate_terminal_test_process, 1);
  assert.ok(C.ACTION_PRIORITY.reclaim_idle_provider_seat > C.ACTION_PRIORITY.prune_policy_eligible_toolkit);
});

/* ── The cycle, end to end ────────────────────────────────────────────────── */

await test("NC7 — an unreadable run store kills nothing", () => {
  // Ownership unknown must reach the classifier as unknown, not as "no owner".
  const r = mkdtempSync(join(tmpdir(), "hsnostore-"));
  REG.registerHeavyCommand({ root: r, runId: "e", pid: 1, pgid: 999999, command: "node --test x", nowMs: NOW });
  const out = RUN.runStewardCycle({
    root: r, nowMs: NOW + 60 * MIN, groupAlive: () => true, exec: stubExec,
  });
  assert.equal(out.ok, true);
  assert.equal(out.executed.length, 0, "nothing may be terminated when ownership cannot be read");
  assert.equal(out.plan.classifications.unknown_or_foreign, 1);
});

await test("NC8 — an ACTIVE-owned process survives an automatic cycle", () => {
  const r = root();
  withRun(r, "erun_live", "EXECUTING");
  REG.registerHeavyCommand({ root: r, runId: "erun_live", pid: 1, pgid: 999998, command: "node --test x", nowMs: NOW });
  const out = RUN.runStewardCycle({ root: r, nowMs: NOW + 60 * MIN, groupAlive: () => true, exec: stubExec });
  assert.equal(out.executed.length, 0);
  assert.equal(out.plan.classifications.live, 1);
});

await test("NC9 — a terminal resource still inside grace survives", () => {
  const r = root();
  const p = RS.executionRunStorePath(r);
  const j = JSON.parse(readFileSync(p, "utf8"));
  j.lanes.lane_x = [{ run_id: "erun_recent", state: "COMPLETE", updated_at: new Date(NOW - 1 * MIN).toISOString() }];
  writeFileSync(p, JSON.stringify(j));
  REG.registerHeavyCommand({ root: r, runId: "erun_recent", pid: 1, pgid: 999997, command: "node --test x", nowMs: NOW - 1 * MIN });
  const out = RUN.runStewardCycle({ root: r, nowMs: NOW, groupAlive: () => true, exec: stubExec });
  assert.equal(out.executed.length, 0);
  assert.equal(out.plan.classifications.within_grace, 1);
});

await test("NC10 — one failed resource does not abort observation of the others", () => {
  const r = root();
  withRun(r, "erun_dead", "FAILED");
  // Two residues; the first cannot be verified gone, the second can.
  REG.registerHeavyCommand({ root: r, runId: "erun_dead", pid: 1, pgid: 111111, command: "node --test a", nowMs: NOW });
  REG.registerHeavyCommand({ root: r, runId: "erun_dead", pid: 2, pgid: 222222, command: "node --test b", nowMs: NOW });
  const out = RUN.runStewardCycle({
    root: r, nowMs: NOW + 60 * MIN,
    groupAlive: () => true, // nothing ever dies -> every postcondition fails
    exec: stubExec,
  });
  assert.equal(out.ok, true, "the cycle must complete");
  assert.equal(out.plan.proposed.length, 2, "both resources were still observed and planned");
  assert.equal(out.executed.length, 0);
  assert.equal(out.refused.length, 2, "each failure is recorded separately");
});

await test("a cycle records an auditable history entry", () => {
  const r = root();
  withRun(r, "erun_dead", "FAILED");
  RUN.runStewardCycle({ root: r, nowMs: NOW + 60 * MIN, groupAlive: () => false, exec: stubExec });
  const st = C.stewardStatus({ root: r, nowMs: NOW + 60 * MIN + 1000 });
  assert.equal(st.cycles_recorded, 1);
  assert.ok(st.last_cycle_id);
  assert.equal(st.stale, false);
});

await test("NC11 — a steward that has not run is itself a finding", () => {
  const r = root();
  assert.equal(C.stewardStatus({ root: r, nowMs: NOW }).stale, true, "silence is not health");
});

await test("NC12 — memory pressure alone never proposes stopping a live dev server", () => {
  const r = root();
  withRun(r, "erun_live", "EXECUTING");
  REG.registerHeavyCommand({ root: r, runId: "erun_live", pid: 1, pgid: 333333, command: "next dev", nowMs: NOW });
  // A NOT_ADMITTED host with only live resources must take no action at all.
  const out = RUN.runStewardCycle({ root: r, nowMs: NOW + 60 * MIN, groupAlive: () => true, exec: stubExec });
  assert.equal(out.plan.proposed.length, 0);
  assert.equal(out.executed.length, 0);
});

await test("dry run and a real cycle use the same planner", () => {
  const r = root();
  withRun(r, "erun_dead", "FAILED");
  REG.registerHeavyCommand({ root: r, runId: "erun_dead", pid: 1, pgid: 444444, command: "node --test x", nowMs: NOW });
  const dry = RUN.runStewardCycle({ root: r, nowMs: NOW + 60 * MIN, dryRun: true, groupAlive: () => true, exec: stubExec });
  assert.equal(dry.dry_run, true);
  assert.equal(dry.plan.proposed.length, 1);
  assert.equal(C.stewardStatus({ root: r, nowMs: NOW }).cycles_recorded, 0, "a dry run writes no history");
});

/* ── The cadence certification, in-process ────────────────────────────────── */

await test("CERTIFICATION — a real process is reconciled by a cycle nobody asked for", async () => {
  const r = root();
  withRun(r, "erun_dead", "FAILED");
  const child = spawn("node", ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  child.unref();
  const pgid = child.pid;
  try {
    REG.registerHeavyCommand({
      root: r, runId: "erun_dead", pid: child.pid, pgid,
      command: "node --test stalled.test.mjs", resourceClass: "heavy_test", nowMs: NOW,
    });
    const alive = (g) => { try { process.kill(-Number(g), 0); return true; } catch { return false; } };
    assert.equal(alive(pgid), true);

    // No cleanup command. Only the cycle the timer would have run.
    const out = RUN.runStewardCycle({ root: r, nowMs: NOW + 60 * MIN, groupAlive: alive, exec: stubExec });

    assert.equal(out.executed.length, 1, JSON.stringify(out.refused));
    assert.equal(out.executed[0].postcondition_verified, true);
    await new Promise((res) => setTimeout(res, 400));
    assert.equal(alive(pgid), false, "the process group must be gone");

    const st = C.stewardStatus({ root: r, nowMs: NOW + 61 * MIN });
    assert.equal(st.history.length, 1);
    assert.equal(st.history[0].action, "terminate_terminal_test_process");
  } finally {
    try { process.kill(-pgid, "SIGKILL"); } catch { /* gone */ }
  }
});

await test("NC13 — a resource parked after repeated failure is suppressed from the PLAN", () => {
  // A surviving mutation found this: attemptsExhausted was tested directly but
  // nothing asserted the planner honours it, so a permanently failing resource
  // would have been retried on every sweep forever.
  const r = root();
  const key = "test_process:hcmd_p";
  for (let i = 0; i < C.MAX_ACTION_ATTEMPTS; i++) {
    C.recordAction({ root: r, resourceKey: key, action: "terminate_terminal_test_process", result: { ok: false }, nowMs: NOW + i });
  }
  const res = [{
    id: "hcmd_p", resourceClass: "test_process", alloyOwned: true, pid: 1, pgid: 2, command: "node --test x",
    owningRuns: [{ run_id: "e", state: "FAILED", updated_at: new Date(NOW - 60 * MIN).toISOString() }], activeLeases: [],
  }];
  // Past cooldown, so only the parking rule can suppress it.
  const plan = C.buildCyclePlan({ cycleId: "c1", resources: res, root: r, nowMs: NOW + C.ACTION_COOLDOWN_MS + 10_000 });
  assert.equal(plan.proposed.length, 0);
  assert.match(plan.suppressed[0].suppressed_because, /parked for the operator/);
});

await test("NC14 — a throwing executor does not abort the cycle", () => {
  // The try/catch around execution was unreachable from any test, so a mutation
  // that replaced it with `throw` survived. A health loop must survive its own
  // remediation failing.
  const r = root();
  withRun(r, "erun_dead", "FAILED");
  REG.registerHeavyCommand({ root: r, runId: "erun_dead", pid: 1, pgid: 555555, command: "node --test a", nowMs: NOW });
  // Observation must SUCCEED so the resource is planned, and the failure must
  // occur during execution — otherwise the execute-stage catch is unreachable
  // and a mutation replacing it with `throw` survives, as one did.
  let calls = 0;
  const out = RUN.runStewardCycle({
    root: r, nowMs: NOW + 60 * MIN, exec: stubExec,
    groupAlive: () => { calls += 1; if (calls > 1) throw new Error("process table exploded"); return true; },
  });
  assert.ok(calls > 1, "the failure must land after planning, inside execution");
  assert.equal(out.ok, true, "the cycle must complete despite the failure");
  assert.equal(out.plan.proposed.length, 1, "the resource was observed and planned");
  assert.ok(out.problems.some((p) => p.stage === "execute"), "the execute failure is recorded per-resource");
  assert.equal(out.refused.length, 1);
});
