/**
 * Host Steward V1.
 *
 * The controls are written from the incident: a host reached 90% swap with one
 * core pinned by a test whose run ended four hours earlier, and every resource
 * involved read as structurally healthy. Each test below is a way that could
 * happen again, or a way the fix could itself destroy live work.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";

const S = await import("../lib/vacilando/host-steward.mjs");
const R = await import("../lib/vacilando/heavy-command-registry.mjs");
const X = await import("../lib/vacilando/host-steward-execute.mjs");
const A = await import("../lib/vacilando/host-admission.mjs");

const root = () => mkdtempSync(join(tmpdir(), "steward-"));
const MIN = 60_000;
const NOW = 1_800_000_000_000;

/* ── Ownership model ──────────────────────────────────────────────────────── */

await test("a non-terminal run makes a resource LIVE", () => {
  const a = S.attributeResource({
    resourceClass: "dev_server", alloyOwned: true,
    owningRuns: [{ run_id: "e1", state: "COMPLETE" }, { run_id: "e2", state: "EXECUTING" }],
  });
  assert.equal(a.ownership, S.OWNERSHIP.LIVE);
});

await test("every owning run terminal is RESIDUE, not healthy", () => {
  // The distinction that did not exist: a dev server whose run was ABANDONED
  // six days ago had a parent process and a registry row, and read as fine.
  const a = S.attributeResource({
    resourceClass: "dev_server", alloyOwned: true,
    owningRuns: [{ run_id: "e1", state: "ABANDONED", updated_at: new Date(NOW - 60 * MIN).toISOString() }],
  });
  assert.equal(a.ownership, S.OWNERSHIP.TERMINAL_RUN_RESIDUE);
  assert.equal(a.terminal_state, "ABANDONED");
});

await test("NC1 — an unreadable run store is FOREIGN_UNKNOWN, never residue", () => {
  // A permissive default here kills live work when the store is briefly absent.
  const a = S.attributeResource({ resourceClass: "test_process", alloyOwned: true, owningRuns: null });
  assert.equal(a.ownership, S.OWNERSHIP.FOREIGN_UNKNOWN);
});

await test("NC2 — anything not confidently Alloy-owned is FOREIGN_UNKNOWN", () => {
  assert.equal(S.attributeResource({ resourceClass: "test_process", alloyOwned: false, owningRuns: [] }).ownership, S.OWNERSHIP.FOREIGN_UNKNOWN);
  assert.equal(S.attributeResource({ resourceClass: "test_process", alloyOwned: null, owningRuns: [] }).ownership, S.OWNERSHIP.FOREIGN_UNKNOWN);
});

await test("NC3 — an active lease outranks a terminal run", () => {
  const a = S.attributeResource({
    resourceClass: "dev_server", alloyOwned: true,
    owningRuns: [{ run_id: "e1", state: "COMPLETE" }],
    activeLeases: [{ kind: "browser_qa" }],
  });
  assert.equal(a.ownership, S.OWNERSHIP.LIVE);
});

/* ── Grace ────────────────────────────────────────────────────────────────── */

await test("grace differs by terminal state, and ABANDONED gets none", () => {
  const mk = (state, agoMin) => S.attributeResource({
    resourceClass: "dev_server", alloyOwned: true,
    owningRuns: [{ run_id: "e", state, updated_at: new Date(NOW - agoMin * MIN).toISOString() }],
  });
  assert.equal(S.graceRemainingMs(mk("ABANDONED", 0), { nowMs: NOW }), 0);
  assert.ok(S.graceRemainingMs(mk("COMPLETE", 1), { nowMs: NOW }) > 0, "COMPLETE keeps a window");
  assert.equal(S.graceRemainingMs(mk("COMPLETE", 60), { nowMs: NOW }), 0, "and it expires");
  assert.ok(S.graceRemainingMs(mk("FAILED", 1), { nowMs: NOW }) > 0);
  assert.equal(S.graceRemainingMs(mk("FAILED", 30), { nowMs: NOW }), 0);
});

await test("NC4 — a live resource has infinite grace and can never be reconciled", () => {
  const a = S.attributeResource({ resourceClass: "dev_server", alloyOwned: true, owningRuns: [{ state: "EXECUTING" }] });
  assert.equal(S.graceRemainingMs(a, { nowMs: NOW }), Infinity);
});

/* ── Planning ─────────────────────────────────────────────────────────────── */

const residueTest = (over = {}) => ({
  id: "r1", resourceClass: "test_process", alloyOwned: true, pid: 111, pgid: 222,
  command: "node --test foo.test.mjs",
  owningRuns: [{ run_id: "e1", state: "FAILED", updated_at: new Date(NOW - 60 * MIN).toISOString() }],
  activeLeases: [], ...over,
});

await test("terminal-run test residue past grace is reconciled autonomously", () => {
  const d = S.planResourceAction(residueTest(), { nowMs: NOW });
  assert.equal(d.decision, "reconcile");
  assert.equal(d.action, "terminate_terminal_test_process");
});

await test("NC5 — a live-owned test is PRESERVED", () => {
  const d = S.planResourceAction(residueTest({ owningRuns: [{ run_id: "e1", state: "EXECUTING" }] }), { nowMs: NOW });
  assert.equal(d.decision, "preserve");
  assert.equal(d.action, null);
});

await test("NC6 — a fresh progress heartbeat prevents termination", () => {
  const d = S.planResourceAction(residueTest({ lastProgressAt: NOW - 5000, progressGraceMs: 10 * MIN }), { nowMs: NOW });
  assert.equal(d.decision, "wait");
  assert.equal(d.action, null);
});

await test("NC7 — a foreign process is never actioned, only surfaced", () => {
  const d = S.planResourceAction(residueTest({ alloyOwned: false }), { nowMs: NOW });
  assert.equal(d.decision, "surface");
  assert.equal(d.action, null);
});

await test("NC8 — operator-only actions can never enter the autonomous set", () => {
  for (const a of S.OPERATOR_ONLY_ACTIONS) {
    assert.ok(!S.AUTONOMOUS_ACTIONS.includes(a), `${a} must never be autonomous`);
  }
  const plan = S.buildStewardPlan([residueTest({ resourceClass: "worktree" })], { nowMs: NOW });
  assert.equal(plan.autonomous.length, 0);
  assert.equal(plan.surfaced.length, 1);
});

await test("the plan fingerprint binds the decisions", () => {
  const p1 = S.buildStewardPlan([residueTest()], { nowMs: NOW });
  const p2 = S.buildStewardPlan([residueTest({ owningRuns: [{ run_id: "e1", state: "EXECUTING" }] })], { nowMs: NOW });
  assert.match(p1.fingerprint, /^[0-9a-f]{32}$/);
  assert.notEqual(p1.fingerprint, p2.fingerprint);
});

/* ── Heavy-command ownership: the actual defect ───────────────────────────── */

await test("a backgrounded, unclassifiable command is STILL registered with its group", () => {
  // The 198 ungoverned commands were unclassifiable for ROUTING. Routing and
  // ownership are different questions, and conflating them is what severed the
  // lifecycle.
  const r = root();
  const out = R.registerHeavyCommand({
    root: r, runId: "erun_x", laneId: "lane_y", pid: 100, pgid: 200,
    command: "bash run-durability.sh 2>&1 | tail -6",
    resourceClass: "unclassifiable", routingDecision: "report_unclassifiable", nowMs: NOW,
  });
  assert.equal(out.ok, true);
  assert.equal(out.registration.pgid, 200);
  assert.equal(out.registration.routing_decision, "report_unclassifiable");
});

await test("NC9 — a registration without a process group is refused", () => {
  // Registering only a pid records the shell and misses the test.
  const r = root();
  assert.equal(R.registerHeavyCommand({ root: r, runId: "e", pid: 1, command: "x", nowMs: NOW }).ok, false);
});

await test("residual query finds a live group whose run ended", () => {
  const r = root();
  R.registerHeavyCommand({ root: r, runId: "erun_x", pid: 100, pgid: 200, command: "node --test a.mjs", nowMs: NOW });
  const res = R.residualHeavyCommands({
    root: r, runStateFor: () => "FAILED", groupAlive: (g) => g === 200, nowMs: NOW + 60 * MIN,
  });
  assert.equal(res.length, 1);
  assert.equal(res[0].owning_run_state, "FAILED");
});

await test("NC10 — a closed registration is never reconciled again", () => {
  const r = root();
  const reg = R.registerHeavyCommand({ root: r, runId: "e", pid: 1, pgid: 200, command: "node --test a.mjs", nowMs: NOW });
  R.closeHeavyCommand({ root: r, id: reg.id, disposition: "completed", nowMs: NOW });
  assert.equal(R.residualHeavyCommands({ root: r, runStateFor: () => "FAILED", groupAlive: () => true }).length, 0);
});

await test("NC11 — a dead group is not residue, however terminal its run", () => {
  const r = root();
  R.registerHeavyCommand({ root: r, runId: "e", pid: 1, pgid: 200, command: "node --test a.mjs", nowMs: NOW });
  assert.equal(R.residualHeavyCommands({ root: r, runStateFor: () => "FAILED", groupAlive: () => false }).length, 0);
});

/* ── Executor safety ──────────────────────────────────────────────────────── */

await test("NC12 — a group containing an unowned member is REFUSED", () => {
  // Exactly the wt1 case: the dev-server group also held `alloy-certify serve`,
  // and terminating the group wholesale would have taken it too.
  const ps = () => "100 200 node --test a.mjs\n101 200 bash certification/alloy-certify serve\n";
  const killed = [];
  const out = X.terminateOwnedGroup({
    pgid: 200, expectPattern: /node --test/, ps, kill: (s, t) => { killed.push([s, t]); return true; }, sleep: () => {},
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "group_contains_unowned_members");
  assert.deepEqual(killed, [], "nothing may be signalled when the group is not wholly ours");
});

await test("NC13 — an unreadable process table refuses rather than guesses", () => {
  const out = X.terminateOwnedGroup({ pgid: 200, ps: () => null, kill: () => true, sleep: () => {} });
  assert.equal(out.ok, false);
  assert.equal(out.error, "process_table_unreadable");
});

await test("a wholly-owned group is terminated and verified absent", () => {
  let alive = true;
  const ps = () => (alive ? "100 200 node --test a.mjs\n" : "");
  const signals = [];
  const out = X.terminateOwnedGroup({
    pgid: 200, expectPattern: /node --test/,
    ps, kill: (s, t) => { signals.push([s, t]); if (s === "TERM") alive = false; return true; }, sleep: () => {},
  });
  assert.equal(out.ok, true);
  assert.deepEqual(signals[0], ["TERM", -200], "the group is signalled, not a lone pid");
  assert.deepEqual(out.remaining, []);
});

await test("NC14 — a stale steward plan applies NOTHING", () => {
  const plan = S.buildStewardPlan([residueTest()], { nowMs: NOW });
  const out = X.applyStewardPlan({
    plan,
    freshResources: [residueTest({ owningRuns: [{ run_id: "e1", state: "EXECUTING" }] })],
    nowMs: NOW,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "stale_steward_plan");
  assert.deepEqual(out.applied, []);
});

await test("NC15 — the executor never invents a dev-server stop", () => {
  const plan = S.buildStewardPlan([residueTest({ id: "d1", resourceClass: "dev_server" })], { nowMs: NOW });
  const out = X.applyStewardPlan({ plan, nowMs: NOW });
  assert.equal(out.applied_count, 0);
  assert.equal(out.refused[0].error, "no_dev_server_stop_capability");
});

await test("NC16 — seats, ports and toolkit are delegated, never reimplemented here", () => {
  const src = readFileSync(new URL("../lib/vacilando/host-steward-execute.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const forbidden of ["rm -rf", "rmSync", "rimraf", "worktree remove", "branch -D", "docker", "supabase"]) {
    assert.ok(!code.includes(forbidden), `the steward executor must not contain ${forbidden}`);
  }
  const plan = S.buildStewardPlan([residueTest({ id: "s1", resourceClass: "provider_seat" })], { nowMs: NOW });
  const out = X.applyStewardPlan({ plan, nowMs: NOW });
  assert.equal(out.refused[0].error, "delegated_to_canonical_owner");
});

await test("NC17 — the policy module contains no signalling at all", () => {
  const src = readFileSync(new URL("../lib/vacilando/host-steward.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const forbidden of ["process.kill", "execFileSync", "spawn", "SIGTERM", "SIGKILL"]) {
    assert.ok(!code.includes(forbidden), `the steward policy must not contain ${forbidden}`);
  }
});

/* ── Host Admission V2 ────────────────────────────────────────────────────── */

const GB = 1073741824;
const host = (over = {}) => ({
  totalBytes: 24 * GB, freeBytes: 6 * GB, availableBytes: 10 * GB, compressorBytes: 1 * GB,
  swapTotalBytes: 16 * GB, swapUsedBytes: 1 * GB, pressureState: "normal",
  residueFootprintBytes: 0, loadAvg: [2, 2, 2], cores: 8, ...over,
});

await test("FIXTURE healthy high-cache macOS is HEALTHY", () => {
  const v = A.classifyHostAdmission(host());
  assert.equal(v.state, "HEALTHY");
  assert.equal(v.admitted, true);
});

await test("FIXTURE low free alone does NOT fail a healthy Mac", () => {
  // The mistake that is easier and worse than the one being fixed.
  const v = A.classifyHostAdmission(host({ freeBytes: 0.1 * GB }));
  assert.equal(v.admitted, true);
  assert.equal(v.state, "WATCH");
  assert.ok(v.reasons.some((r) => /ordinary on macOS/.test(r)));
});

await test("FIXTURE compressed but ample swap stays admitted", () => {
  const v = A.classifyHostAdmission(host({ compressorBytes: 4 * GB, freeBytes: 0.2 * GB, swapUsedBytes: 2 * GB }));
  assert.equal(v.admitted, true);
});

await test("FIXTURE near-full swap + extreme compressor is NOT_ADMITTED", () => {
  // The measured incident: 0.11 GB free, 8.3 GB compressor, 14.9/16.4 GB swap.
  const v = A.classifyHostAdmission(host({
    freeBytes: 0.11 * GB, availableBytes: 4.81 * GB, compressorBytes: 8.3 * GB,
    swapTotalBytes: 16 * GB, swapUsedBytes: 14.9 * GB, loadAvg: [6, 9, 11],
  }));
  assert.equal(v.state, "NOT_ADMITTED");
  assert.equal(v.admitted, false);
  assert.ok(v.reasons.length > 0);
});

await test("FIXTURE terminal-run residue dominating the compressor cannot read HEALTHY", () => {
  const v = A.classifyHostAdmission(host({ residueFootprintBytes: 0.5 * GB, compressorBytes: 1 * GB }));
  assert.notEqual(v.state, "HEALTHY");
  assert.ok(v.reasons.some((r) => /residue/.test(r)));
});

await test("FIXTURE recovery after cleanup returns to admitted", () => {
  const before = A.classifyHostAdmission(host({
    freeBytes: 0.11 * GB, availableBytes: 4.81 * GB, compressorBytes: 8.3 * GB, swapUsedBytes: 14.9 * GB,
  }));
  const after = A.classifyHostAdmission(host({
    freeBytes: 1.5 * GB, availableBytes: 8 * GB, compressorBytes: 3 * GB, swapUsedBytes: 6 * GB,
  }));
  assert.equal(before.admitted, false);
  assert.equal(after.admitted, true);
});

await test("NC18 — an unmeasured signal cannot produce HEALTHY", () => {
  const v = A.classifyHostAdmission(host({ swapTotalBytes: null, swapUsedBytes: null }));
  assert.notEqual(v.state, "HEALTHY");
  assert.ok(v.unknown_signals.includes("swap_headroom"));
});

await test("NC19 — thresholds are declared, not derived from a measurement", () => {
  const src = readFileSync(new URL("../lib/vacilando/host-admission.mjs", import.meta.url), "utf8");
  const i = src.indexOf("ADMISSION_POLICY_V2");
  const block = src.slice(i, src.indexOf("});", i));
  for (const m of block.matchAll(/:\s*([0-9.]+),/g)) {
    const n = Number(m[1]);
    assert.ok(n > 0 && n <= 2, `threshold ${n} should be a declared fraction/multiple`);
  }
});

/* ── The synthetic stalled heavy test: end-to-end recovery ────────────────── */

await test("CERTIFICATION — a stalled heavy test whose run fails is found and reconciled", async () => {
  const r = root();
  // 1. A run starts a heavy command that will not finish.
  const child = spawn("node", ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  child.unref();
  const pgid = child.pid; // detached: the child leads its own group
  try {
    const reg = R.registerHeavyCommand({
      root: r, runId: "erun_stall", laneId: "lane_z", pid: child.pid, pgid,
      command: "node --test stalled.test.mjs", resourceClass: "heavy_test",
      routingDecision: "report_unclassifiable", nowMs: NOW,
    });
    assert.equal(reg.ok, true);

    // 2. The owning run terminates.
    const alive = (g) => { try { process.kill(g, 0); return true; } catch { return false; } };
    assert.equal(alive(pgid), true, "the process group outlives its run");

    // 3. Grace expires and the steward discovers it.
    const residual = R.residualHeavyCommands({
      root: r, runStateFor: () => "FAILED", groupAlive: alive, nowMs: NOW + 60 * MIN,
    });
    assert.equal(residual.length, 1, "the residual query must find what ps could not attribute");

    const resources = residual.map((x) => R.asStewardResource(x));
    const plan = S.buildStewardPlan(resources, { nowMs: NOW + 60 * MIN });
    assert.equal(plan.autonomous.length, 1);
    assert.equal(plan.autonomous[0].action, "terminate_terminal_test_process");

    // 4. The steward terminates the exact group.
    const out = X.applyStewardPlan({ plan, freshResources: resources, root: r, nowMs: NOW + 60 * MIN });
    assert.equal(out.ok, true);
    assert.equal(out.applied_count, 1, JSON.stringify(out.refused));

    // 5. The resource is gone.
    await new Promise((res) => setTimeout(res, 500));
    assert.equal(alive(pgid), false, "the process group must be absent after reconciliation");

    // 6. The audit records the recovery.
    const closed = R.listHeavyCommands({ root: r }).find((c) => c.id === reg.id);
    assert.equal(closed.disposition, "reconciled");
  } finally {
    try { process.kill(-pgid, "SIGKILL"); } catch { /* already gone */ }
    try { process.kill(pgid, "SIGKILL"); } catch { /* already gone */ }
  }
});

await test("CERTIFICATION — an ACTIVE-owned equivalent is preserved, not killed", async () => {
  const r = root();
  const child = spawn("node", ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  child.unref();
  const pgid = child.pid;
  try {
    R.registerHeavyCommand({ root: r, runId: "erun_live", pid: child.pid, pgid, command: "node --test live.test.mjs", nowMs: NOW });
    const alive = (g) => { try { process.kill(g, 0); return true; } catch { return false; } };
    const residual = R.residualHeavyCommands({ root: r, runStateFor: () => "EXECUTING", groupAlive: alive, nowMs: NOW + 60 * MIN });
    const plan = S.buildStewardPlan(residual.map((x) => R.asStewardResource(x)), { nowMs: NOW + 60 * MIN });
    assert.equal(plan.autonomous.length, 0);
    assert.equal(plan.preserved.length, 1);
    const out = X.applyStewardPlan({ plan, root: r, nowMs: NOW + 60 * MIN });
    assert.equal(out.applied_count, 0);
    assert.equal(alive(pgid), true, "a live-owned process must survive a steward cycle");
  } finally {
    try { process.kill(pgid, "SIGKILL"); } catch { /* already gone */ }
  }
});

await test("NC20 — terminal residue INSIDE its grace window waits, it does not act", () => {
  // A surviving mutation found this gap: the grace helper was tested directly,
  // but nothing asserted the PLANNER honours it. Without this, a dev server
  // whose run completed one minute ago is killed instantly instead of after
  // the window that exists so the next run can reuse a warm server.
  const oneMinuteAgo = new Date(NOW - 1 * MIN).toISOString();
  for (const [state, cls] of [["COMPLETE", "dev_server"], ["FAILED", "test_process"]]) {
    const d = S.planResourceAction({
      id: "g1", resourceClass: cls, alloyOwned: true, pid: 1, pgid: 2, command: "node x",
      owningRuns: [{ run_id: "e", state, updated_at: oneMinuteAgo }], activeLeases: [],
    }, { nowMs: NOW });
    assert.equal(d.decision, "wait", `${state} within grace must wait`);
    assert.equal(d.action, null);
    assert.ok(d.grace_remaining_ms > 0);
  }
  // And the same resource past its window does act.
  const past = new Date(NOW - 60 * MIN).toISOString();
  const after = S.planResourceAction({
    id: "g1", resourceClass: "dev_server", alloyOwned: true, pid: 1, pgid: 2, command: "node x",
    owningRuns: [{ run_id: "e", state: "COMPLETE", updated_at: past }], activeLeases: [],
  }, { nowMs: NOW });
  assert.equal(after.decision, "reconcile");
});

/* ── The routing bypass now carries ownership ─────────────────────────────── */

const V = await import("../lib/vacilando/validation-routing.mjs");

await test("NC21 — a routing bypass carries the process group, not just a pid", () => {
  const rec = V.bypassRecord({
    kind: "heavy_test", command: "bash run-durability.sh 2>&1 | tail -6",
    decision: "report_unclassifiable", pid: 100, pgid: 200, run_id: "erun_x", lane_id: "lane_y",
  });
  assert.equal(rec.pgid, 200, "a pid names one process; what outlives a run is a group");
  assert.equal(rec.run_id, "erun_x");
  assert.equal(V.bypassIsOwnable(rec), true);
});

await test("NC22 — a bypass with no process group is visibly unownable, never silently dropped", () => {
  const rec = V.bypassRecord({ kind: "heavy_test", command: "x", decision: "report_unclassifiable", pid: 1 });
  assert.equal(V.bypassIsOwnable(rec), false);
  const out = R.registerFromBypass({ root: root(), record: rec });
  assert.equal(out.ok, false);
  assert.equal(out.error, "bypass_without_process_group");
});

await test("an ungoverned bypass becomes a reconcilable registration", () => {
  // End of the chain that broke: unclassifiable -> allowed -> owned -> found.
  const r = root();
  const rec = V.bypassRecord({
    kind: "heavy_test", command: "bash run-durability.sh 2>&1 | tail -6",
    decision: "report_unclassifiable", pid: 100, pgid: 200, run_id: "erun_x", lane_id: "lane_y", now: NOW,
  });
  assert.equal(R.registerFromBypass({ root: r, record: rec, nowMs: NOW }).ok, true);
  const residual = R.residualHeavyCommands({ root: r, runStateFor: () => "ABANDONED", groupAlive: (g) => g === 200, nowMs: NOW + 60 * MIN });
  assert.equal(residual.length, 1);
  const plan = S.buildStewardPlan(residual.map((x) => R.asStewardResource(x)), { nowMs: NOW + 60 * MIN });
  assert.equal(plan.autonomous.length, 1);
  assert.equal(plan.autonomous[0].action, "terminate_terminal_test_process");
});
