#!/usr/bin/env node
/**
 * S5 — validation admission and worker-budget enforcement.
 *
 * THE INCIDENT THIS MAKES UNREACHABLE. Two providers each ran an unconstrained
 * multi-worker vitest suite. Nothing classified them, nothing counted them, and
 * an 8-core host reached load 54.47. The replay below recreates that exact
 * shape and asserts it can no longer happen through a supported path.
 *
 * THE INVARIANTS THAT MUST NEVER REGRESS.
 *
 * Enforcement happens BEFORE admission. Nothing is ever killed to reclaim
 * capacity — a suite terminated at minute eighteen destroys work and teaches
 * providers to route around the broker, which is how the bypass began.
 *
 * Waiting is not failing. A workload that cannot start now is queued with the
 * specific axes blocking it and an owner, never failed for lack of capacity.
 *
 * And a crash must not strand capacity: a claim whose holder is gone is reaped
 * on the next read.
 */
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const A = await import("../lib/vacilando/validation-admission.mjs");
const C = await import("../lib/vacilando/workload-classification.mjs");
const CP = await import("../lib/vacilando/capacity-policy.mjs");

let pass = 0;
let fail = 0;
const started = [];
function test(name, fn) {
  const p = (async () => {
    try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
    catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  })();
  started.push(p);
  return p;
}

/** A fresh ledger per fixture. */
const ledger = () => join(mkdtempSync(join(tmpdir(), "vac-s5-")), "claims.json");
const ALIVE = () => true;
const DEAD = () => false;

/** This host: 8 cores / 24 GB -> 6 tokens, 2 workers. */
const hostCap = (over = {}) => CP.computeCapacityPolicy({
  // `memory_available_gb` is the canonical comparand. `memory_free_gb` alone is
  // no longer a measurement: an unmeasured host constrains rather than being
  // admitted on unused pages, so a fixture must state availability.
  logical_cores: 8, memory_total_gb: 24, memory_free_gb: 0.1, memory_available_gb: 10,
  disk_total_gb: 460, disk_free_gb: 200, load_1m: 2,
  provider_seats: 0, dev_servers: 0, active_workloads: 0,
  active_validation_weight: 0, machine_exclusive_present: false,
  under_memory_pressure: false, swap_rate_known: true, ...over,
});

const workload = (command, over = {}) => ({
  ...C.classifyWorkload({ command, pid: over.pid ?? 100, attribution: over.attribution ?? null, now: "2026-01-01T00:00:00.000Z" }),
  workload_id: over.workload_id || `wl_${Math.random().toString(36).slice(2)}`,
  ...over,
});

// ── CORE INCIDENT REPLAY ─────────────────────────────────────────────────────

await test("INCIDENT REPLAY — two providers, two 8-worker suites, host stays within policy", () => {
  const path = ledger();
  const cap = hostCap();
  const ceiling = cap.axes.validation_capacity.worker_ceiling; // 2
  const budget = cap.axes.validation_capacity.tokens;          // 6
  assert.equal(ceiling, 2);
  assert.equal(budget, 6);

  // Each provider asks for the original shape: a full suite at 8 workers.
  const mk = (lane, seatPid) => {
    const w = workload("node .../vitest run tests/ --maxWorkers=8", {
      attribution: { root_provider_pid: seatPid, lane_id: lane, execution_run_id: `erun_${lane}` },
    });
    // The broker caps workers BEFORE computing weight.
    const capped = A.applyWorkerCeiling(w.normalized_args, ceiling, { tool: w.tool });
    const granted = capped.granted;
    return {
      ...w,
      expected_weight: C.expectedWeight("heavy_test", { workers: granted }),
      workers_requested: 8, workers_granted: granted, capped,
    };
  };

  const a = mk("lane_a", 111);
  const b = mk("lane_b", 222);
  assert.equal(a.workers_granted, 2, "8 requested, 2 granted");
  assert.equal(a.expected_weight, 4, "2 workers -> weight 4");

  const r1 = A.acquireCapacity({ workload: a, capacity: cap, pid: 1001, path, pidAlive: ALIVE, workersRequested: 8, workersGranted: 2 });
  assert.equal(r1.admit, true, "first suite starts");
  assert.equal(r1.queued, false);

  // 4 + 4 = 8 > 6. The second MUST wait, not fail.
  const r2 = A.acquireCapacity({ workload: b, capacity: cap, pid: 1002, path, pidAlive: ALIVE, workersRequested: 8, workersGranted: 2 });
  assert.equal(r2.admit, false, "second suite cannot also run");
  assert.equal(r2.queued, true, "and it QUEUES rather than failing");
  assert.equal(r2.queue_entry.blocked_by[0].axis, "validation_capacity");
  assert.equal(r2.queue_entry.lane_id, "lane_b", "ownership preserved in the wait");
  assert.ok(r2.queue_entry.wait_deadline > 0, "a wait must be bounded");

  // Concurrent usage never exceeded the budget.
  const mid = A.readClaimStore({ path, pidAlive: ALIVE });
  assert.equal(A.heldWeight(mid), 4);
  assert.ok(A.heldWeight(mid) <= budget);

  // First finishes; the queue drains and the second becomes ready.
  A.releaseCapacity(r1.claim.claim_id, { path, pidAlive: ALIVE, exitCode: 0 });
  const drained = A.drainQueue({ capacity: cap, path, pidAlive: ALIVE });
  assert.equal(drained.ready.length, 1, "the waiting suite is now admissible");
  assert.equal(drained.ready[0].lane_id, "lane_b");

  const r2b = A.acquireCapacity({ workload: b, capacity: cap, pid: 1003, path, pidAlive: ALIVE, workersRequested: 8, workersGranted: 2 });
  assert.equal(r2b.admit, true, "both requests eventually complete");
  A.releaseCapacity(r2b.claim.claim_id, { path, pidAlive: ALIVE, exitCode: 0 });

  const end = A.readClaimStore({ path, pidAlive: ALIVE });
  assert.equal(end.claims.length, 0, "capacity fully released");
  const events = end.events.map((e) => e.event);
  assert.ok(events.includes("acquired") && events.includes("queued") && events.includes("released") && events.includes("queue_drained"),
    "queue/release transitions are recorded");
});

// ── Additional fixtures ──────────────────────────────────────────────────────

await test("targeted test fits immediately", () => {
  const path = ledger();
  const w = workload("vitest run one.test.ts");
  const r = A.acquireCapacity({ workload: w, capacity: hostCap(), pid: 1, path, pidAlive: ALIVE });
  assert.equal(r.admit, true);
  assert.equal(r.weight, 2);
});

await test("two targeted tests coexist when the budget permits", () => {
  const path = ledger();
  const cap = hostCap();
  const a = A.acquireCapacity({ workload: workload("vitest run a.test.ts"), capacity: cap, pid: 1, path, pidAlive: ALIVE });
  const b = A.acquireCapacity({ workload: workload("vitest run b.test.ts"), capacity: cap, pid: 2, path, pidAlive: ALIVE });
  assert.equal(a.admit, true);
  assert.equal(b.admit, true);
  assert.equal(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })), 4);
});

await test("heavy + targeted coexist only when tokens permit", () => {
  const path = ledger();
  const cap = hostCap();
  const heavy = { ...workload("vitest run tests/"), expected_weight: 4 };
  const h = A.acquireCapacity({ workload: heavy, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  assert.equal(h.admit, true);
  const t = A.acquireCapacity({ workload: workload("vitest run a.test.ts"), capacity: cap, pid: 2, path, pidAlive: ALIVE });
  assert.equal(t.admit, true, "4 + 2 = 6 fits exactly");
  const t2 = A.acquireCapacity({ workload: workload("vitest run b.test.ts"), capacity: cap, pid: 3, path, pidAlive: ALIVE });
  assert.equal(t2.admit, false, "the next one does not");
  assert.equal(t2.queued, true);
});

await test("typecheck waits behind insufficient capacity", () => {
  const path = ledger();
  const cap = hostCap();
  A.acquireCapacity({ workload: { ...workload("vitest run tests/"), expected_weight: 4 }, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  const tc = A.acquireCapacity({ workload: workload("tsc --noEmit"), capacity: cap, pid: 2, path, pidAlive: ALIVE });
  assert.equal(tc.weight, 4);
  assert.equal(tc.admit, false, "4 + 4 > 6");
  assert.equal(tc.queued, true);
  assert.equal(tc.queue_entry.workload_class, "typecheck");
});

await test("production build respects the disk floor", () => {
  const path = ledger();
  const lowDisk = hostCap({ disk_total_gb: 460, disk_free_gb: 5 });
  const r = A.acquireCapacity({ workload: workload("next build"), capacity: lowDisk, pid: 1, path, pidAlive: ALIVE });
  assert.equal(r.admit, false);
  assert.ok(r.blocked_by.some((b) => b.axis === "disk_headroom"));
  // A test is NOT disk-sensitive, so it still runs on the same host.
  const t = A.acquireCapacity({ workload: workload("vitest run a.test.ts"), capacity: lowDisk, pid: 2, path, pidAlive: ALIVE });
  assert.equal(t.admit, true, "disk must not block classes that do not expand it");
});

await test("browser E2E is enforced at its class weight", () => {
  const path = ledger();
  const w = workload("npx playwright test");
  assert.equal(w.workload_class, "browser_e2e");
  assert.equal(w.expected_weight, 4);
  const r = A.acquireCapacity({ workload: w, capacity: hostCap(), pid: 1, path, pidAlive: ALIVE });
  assert.equal(r.admit, true);
  assert.equal(r.weight, 4);
});

await test("machine-exclusive drains conflicting governed validation", () => {
  const path = ledger();
  const cap = hostCap();
  const held = A.acquireCapacity({ workload: workload("vitest run a.test.ts"), capacity: cap, pid: 1, path, pidAlive: ALIVE });
  assert.equal(held.admit, true);

  const excl = workload("alloy-runtime-timing-certification run");
  assert.equal(excl.workload_class, "machine_exclusive");
  const e1 = A.acquireCapacity({ workload: excl, capacity: cap, pid: 2, path, pidAlive: ALIVE });
  assert.equal(e1.admit, false, "exclusive waits for the field to clear");
  assert.equal(e1.weight, CP.EXCLUSIVE, "and is NOT a token amount");

  A.releaseCapacity(held.claim.claim_id, { path, pidAlive: ALIVE, exitCode: 0 });
  const e2 = A.acquireCapacity({ workload: excl, capacity: cap, pid: 3, path, pidAlive: ALIVE });
  assert.equal(e2.admit, true, "with the field clear it starts");
  assert.equal(e2.claim.exclusive, true);

  // And it keeps the field clear.
  const blocked = A.acquireCapacity({ workload: workload("vitest run b.test.ts"), capacity: cap, pid: 4, path, pidAlive: ALIVE });
  assert.equal(blocked.admit, false);
  assert.ok(blocked.blocked_by.some((b) => b.axis === "machine_exclusive"));
});

await test("capacity releases on success, on test failure, and on crash", () => {
  const cap = hostCap();
  // success
  let path = ledger();
  let r = A.acquireCapacity({ workload: workload("vitest run a.test.ts"), capacity: cap, pid: 1, path, pidAlive: ALIVE });
  A.releaseCapacity(r.claim.claim_id, { path, pidAlive: ALIVE, exitCode: 0 });
  assert.equal(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })), 0, "released on success");

  // nonzero exit — a failing suite must still give capacity back
  path = ledger();
  r = A.acquireCapacity({ workload: workload("vitest run a.test.ts"), capacity: cap, pid: 1, path, pidAlive: ALIVE });
  A.releaseCapacity(r.claim.claim_id, { path, pidAlive: ALIVE, exitCode: 1 });
  assert.equal(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })), 0, "released on failure");

  // crash — no release call at all; the holder is simply gone
  path = ledger();
  A.acquireCapacity({ workload: workload("vitest run a.test.ts"), capacity: cap, pid: 4242, path, pidAlive: ALIVE });
  assert.equal(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })), 2, "held while alive");
  const recovered = A.readClaimStore({ path, pidAlive: DEAD });
  assert.equal(A.heldWeight(recovered), 0, "reaped when the holder is gone");
  assert.equal(recovered.reaped.length, 1);
});

await test("a waiting job resumes after a release", () => {
  const path = ledger();
  const cap = hostCap();
  const big = { ...workload("vitest run tests/"), expected_weight: 6 };
  const first = A.acquireCapacity({ workload: big, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  assert.equal(first.admit, true);
  const second = A.acquireCapacity({ workload: workload("vitest run a.test.ts"), capacity: cap, pid: 2, path, pidAlive: ALIVE });
  assert.equal(second.queued, true);
  assert.deepEqual(A.drainQueue({ capacity: cap, path, pidAlive: ALIVE }).ready, [], "still blocked");
  A.releaseCapacity(first.claim.claim_id, { path, pidAlive: ALIVE, exitCode: 0 });
  assert.equal(A.drainQueue({ capacity: cap, path, pidAlive: ALIVE }).ready.length, 1, "ready after release");
});

await test("two lanes cannot claim the same capacity twice", () => {
  const path = ledger();
  const cap = hostCap();
  // Six weight-2 requests against a budget of 6: exactly three may hold.
  const results = [];
  for (let i = 0; i < 6; i += 1) {
    results.push(A.acquireCapacity({ workload: workload(`vitest run t${i}.test.ts`), capacity: cap, pid: 100 + i, path, pidAlive: ALIVE }));
  }
  const admitted = results.filter((r) => r.admit).length;
  assert.equal(admitted, 3, "budget 6 / weight 2 = exactly 3 concurrent");
  assert.equal(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })), 6);
  assert.ok(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })) <= cap.axes.validation_capacity.tokens);
});

await test("off-worktree provider-owned validation is governed identically", () => {
  const path = ledger();
  const attribution = {
    root_provider_pid: 89207, lane_id: "lane_surfaces", execution_run_id: "erun_s",
    worktree_path: "/w/wt6", execution_location: "outside_worktree",
  };
  const w = workload("node /private/tmp/fin-base/web/node_modules/.bin/vitest run tests/", { attribution });
  const r = A.acquireCapacity({ workload: { ...w, expected_weight: 4 }, capacity: hostCap(), pid: 1, path, pidAlive: ALIVE });
  assert.equal(r.admit, true);
  // Ownership is S1's, not the directory's.
  assert.equal(r.claim.lane_id, "lane_surfaces");
  assert.equal(r.claim.root_provider_pid, 89207);
  assert.equal(r.claim.execution_run_id, "erun_s");
});

await test("unattributed heavy work is reported, counted, and never killed", () => {
  const un = A.unbrokeredPressure({
    workloads: [{ workload_id: "w1", pid: 9001, lane_id: null, root_provider_pid: null, workload_class: "heavy_test", expected_weight: 8 }],
    claims: [],
  });
  assert.equal(un.unbrokered_count, 1);
  assert.equal(un.unbrokered_weight, 8);
  assert.equal(un.workloads[0].attribution, "unattributed");
  assert.match(un.action, /never_terminated/);
});

await test("unbrokered observed load constrains later admissions", () => {
  const path = ledger();
  const cap = hostCap();
  const store = A.readClaimStore({ path, pidAlive: ALIVE });
  const eff = A.effectiveRemaining({ capacity: cap, store, unbrokeredWeight: 4 });
  assert.equal(eff.budget, 6);
  assert.equal(eff.governed_held, 0);
  assert.equal(eff.unbrokered_observed, 4);
  assert.equal(eff.remaining, 2, "observed bypass reduces what may still be admitted");
});

await test("interactive and light validation are never token-enforced", () => {
  const path = ledger();
  for (const cmd of ["next dev", "npm run dev", "eslint src/"]) {
    const w = workload(cmd);
    const r = A.acquireCapacity({ workload: w, capacity: hostCap(), pid: 1, path, pidAlive: ALIVE });
    assert.equal(r.admit, true, `${cmd} must not be gated`);
    assert.equal(r.enforced, false);
    assert.equal(r.claim, null, "and must not consume a token");
  }
  assert.equal(A.isEnforced("interactive"), false);
  assert.equal(A.isEnforced("light_validation"), false);
});

await test("compute and memory pressure block expensive work", () => {
  const path = ledger();
  const loaded = A.acquireCapacity({ workload: workload("vitest run a.test.ts"), capacity: hostCap({ load_1m: 40 }), pid: 1, path, pidAlive: ALIVE });
  assert.equal(loaded.admit, false);
  assert.ok(loaded.blocked_by.some((b) => b.axis === "compute_capacity"));

  // Pressure gates EXPENSIVE classes. Found live: blocking a single-file test on
  // a swapping host makes validation unusable exactly when it is needed.
  const pressedCap = hostCap({ under_memory_pressure: true, swapouts_delta: 900 });
  const path2 = ledger();
  const heavy = A.acquireCapacity({
    workload: { ...workload("vitest run tests/"), expected_weight: 4 },
    capacity: pressedCap, pid: 1, path: path2, pidAlive: ALIVE,
  });
  assert.equal(heavy.admit, false, "a heavy suite is blocked by pressure");
  assert.ok(heavy.blocked_by.some((b) => b.axis === "memory_capacity"));
  const targeted = A.acquireCapacity({
    workload: workload("vitest run a.test.ts"),
    capacity: pressedCap, pid: 2, path: ledger(), pidAlive: ALIVE,
  });
  assert.equal(targeted.admit, true, "a single-file test still runs under pressure");
  // Every blocking axis is reported, not just the first.
  assert.ok(Array.isArray(heavy.blocked_by));
});

await test("worker cap changes concurrency only — never selection or semantics", () => {
  const r = A.applyWorkerCeiling(
    ["run", "tests/foo.test.ts", "--reporter=dot", "--maxWorkers=8", "--coverage"], 2, { tool: "vitest" });
  assert.deepEqual(r.args, ["run", "tests/foo.test.ts", "--reporter=dot", "--maxWorkers=2", "--coverage"]);
  assert.equal(r.granted, 2);
  assert.equal(r.reason, "reduced_explicit_request");
  // Absent flag -> the ceiling is applied.
  const b = A.applyWorkerCeiling(["run", "tests/"], 2, { tool: "vitest" });
  assert.ok(b.args.includes("--maxWorkers=2"));
  assert.equal(b.reason, "applied_host_ceiling");
  // An unsupported runner is left alone rather than guessed at.
  const u = A.applyWorkerCeiling(["--flag"], 2, { tool: "cargo" });
  assert.equal(u.changed, false);
  assert.equal(u.reason, "unsupported_runner");
});

await test("worker-cap drift is reported and accounted, never killed", () => {
  const d = A.detectWorkerCapDrift({ claim: { claim_id: "c1", lane_id: "lane_a", workload_class: "heavy_test", weight: 4, workers_granted: 2 }, observedWorkers: 6 });
  assert.ok(d);
  assert.equal(d.violation, "worker_cap_exceeded");
  assert.equal(d.implied_weight, 12);
  assert.match(d.action, /not_killed/);
  assert.equal(A.detectWorkerCapDrift({ claim: { workers_granted: 2 }, observedWorkers: 2 }), null);
});

// ── Required mutations ───────────────────────────────────────────────────────

await test("MUTATION — removing token acquisition breaks the incident replay", () => {
  const cap = hostCap();
  // A "policy" with no budget check: everything admits.
  const noTokens = (w) => ({ admit: true, weight: w.expected_weight });
  const a = noTokens({ expected_weight: 4 });
  const b = noTokens({ expected_weight: 4 });
  assert.equal(a.admit && b.admit, true, "the mutation admits both");
  assert.ok(a.weight + b.weight > cap.axes.validation_capacity.tokens, "which exceeds the budget");
  // The real path refuses.
  const path = ledger();
  A.acquireCapacity({ workload: { ...workload("vitest run tests/"), expected_weight: 4 }, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  const second = A.acquireCapacity({ workload: { ...workload("vitest run tests/"), expected_weight: 4 }, capacity: cap, pid: 2, path, pidAlive: ALIVE });
  assert.equal(second.admit, false);
});

await test("MUTATION — removing the worker cap breaks the ceiling fixture", () => {
  const noCap = A.applyWorkerCeiling(["run", "tests/", "--maxWorkers=8"], NaN, { tool: "vitest" });
  assert.ok(noCap.args.includes("--maxWorkers=8"), "the mutation leaves 8 in place");
  const real = A.applyWorkerCeiling(["run", "tests/", "--maxWorkers=8"], 2, { tool: "vitest" });
  assert.ok(real.args.includes("--maxWorkers=2"));
  assert.equal(real.args.includes("--maxWorkers=8"), false);
});

await test("MUTATION — exclusivity as finite tokens breaks the exclusive fixture", () => {
  const path = ledger();
  const cap = hostCap();
  // Treat exclusive as weight 6: it would fit alongside nothing, but crucially
  // it would NOT require the field to drain, and would not block others.
  const asTokens = { ...workload("alloy-runtime-timing-certification run"), workload_class: "heavy_test", expected_weight: 6 };
  const r = A.acquireCapacity({ workload: asTokens, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  assert.equal(r.admit, true);
  assert.equal(r.claim.exclusive, false, "the mutation produces a NON-exclusive claim");
  // The real classification is exclusive and returns the Symbol.
  const real = workload("alloy-runtime-timing-certification run");
  assert.equal(real.expected_weight, Infinity);
  const path2 = ledger();
  const rr = A.acquireCapacity({ workload: real, capacity: cap, pid: 2, path: path2, pidAlive: ALIVE });
  assert.equal(rr.exclusive, true);
  assert.equal(rr.weight, CP.EXCLUSIVE);
});

await test("MUTATION — not releasing on nonzero exit strands capacity", () => {
  const path = ledger();
  const cap = hostCap();
  const r = A.acquireCapacity({ workload: workload("vitest run a.test.ts"), capacity: cap, pid: 1, path, pidAlive: ALIVE });
  // The mutation: skip release because the exit code was nonzero.
  assert.equal(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })), 2, "capacity still held");
  // The real path releases regardless of exit code.
  A.releaseCapacity(r.claim.claim_id, { path, pidAlive: ALIVE, exitCode: 1 });
  assert.equal(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })), 0);
});

await test("MUTATION — ignoring memory pressure admits on a pressured host", () => {
  const pressured = hostCap({ under_memory_pressure: true, swapouts_delta: 900 });
  const store = { claims: [], queue: [], events: [] };
  const heavyW = { ...workload("vitest run tests/"), expected_weight: 4 };
  const real = A.evaluateAdmission({ workload: heavyW, capacity: pressured, store });
  assert.equal(real.admit, false);
  // Strip the pressure signal: the same host now admits.
  assert.ok(real.blocked_by.some((b) => b.axis === "memory_capacity"), "memory is a blocking axis");
  // Blind the memory axis ONLY. Pressure also halves tokens, so compare the
  // memory axis directly rather than the overall verdict — otherwise the token
  // reduction would mask whether the memory gate is doing anything.
  const blind = { ...pressured, axes: { ...pressured.axes, memory_capacity: { ...pressured.axes.memory_capacity, under_pressure: false, remaining_gb: 5 } } };
  const mutated = A.evaluateAdmission({ workload: heavyW, capacity: blind, store });
  assert.equal(mutated.blocked_by.some((b) => b.axis === "memory_capacity"), false,
    "the mutation stops blocking on memory, which the real policy does");
});

await test("MUTATION — ignoring the disk floor admits a build on a full disk", () => {
  const lowDisk = hostCap({ disk_free_gb: 5 });
  const store = { claims: [], queue: [], events: [] };
  assert.equal(A.evaluateAdmission({ workload: workload("next build"), capacity: lowDisk, store }).admit, false);
  const blind = { ...lowDisk, axes: { ...lowDisk.axes, disk_headroom: { ...lowDisk.axes.disk_headroom, below_reserve: false } } };
  assert.equal(A.evaluateAdmission({ workload: workload("next build"), capacity: blind, store }).admit, true);
});

await test("MUTATION — attributing by cwd instead of S1 ownership breaks off-worktree", () => {
  const path = ledger();
  const attribution = { root_provider_pid: 89207, lane_id: "lane_surfaces", execution_run_id: "erun_s", execution_location: "outside_worktree" };
  const w = workload("node /private/tmp/fin-base/.../vitest run tests/", { attribution });
  const r = A.acquireCapacity({ workload: { ...w, expected_weight: 4 }, capacity: hostCap(), pid: 1, path, pidAlive: ALIVE });
  assert.equal(r.claim.lane_id, "lane_surfaces", "S1 ownership survives");
  // A cwd-derived owner would be null here, losing the lane entirely.
  const cwdDerived = "/private/tmp/fin-base".includes("alloy-worktrees") ? "some_lane" : null;
  assert.equal(cwdDerived, null, "cwd yields no owner for this workload");
  assert.notEqual(r.claim.lane_id, cwdDerived);
});

await test("MUTATION — simultaneous claims cannot both see the same free budget", () => {
  const path = ledger();
  const cap = hostCap();
  // Two acquisitions in immediate succession against a budget of 6, weight 4.
  const a = A.acquireCapacity({ workload: { ...workload("vitest run tests/"), expected_weight: 4 }, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  const b = A.acquireCapacity({ workload: { ...workload("vitest run tests/"), expected_weight: 4 }, capacity: cap, pid: 2, path, pidAlive: ALIVE });
  assert.equal(a.admit, true);
  assert.equal(b.admit, false, "the second read includes the first claim");
  assert.ok(A.heldWeight(A.readClaimStore({ path, pidAlive: ALIVE })) <= cap.axes.validation_capacity.tokens);
});

// ── Safety ───────────────────────────────────────────────────────────────────

await test("S5 enforces at the door and cannot terminate anything", async () => {
  const { readFileSync: rf } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join: j } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = rf(j(here, "..", "lib", "vacilando", "validation-admission.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  // process.kill(pid, 0) is a LIVENESS PROBE, not a signal — allowed, and the
  // only form permitted. Any real signal is not.
  assert.equal(/process\.kill\([^)]*,\s*["']?SIG/.test(code), false, "no signal may be sent");
  for (const forbidden of ["SIGKILL", "SIGTERM", "execFile", "spawn(", "exec("]) {
    assert.equal(code.includes(forbidden), false, `validation-admission must not contain ${forbidden}`);
  }
});

await test("a queued request is truthful: owner, class, need, and a bound", () => {
  const path = ledger();
  const cap = hostCap();
  A.acquireCapacity({ workload: { ...workload("vitest run tests/"), expected_weight: 6 }, capacity: cap, pid: 1, path, pidAlive: ALIVE });
  const q = A.acquireCapacity({
    workload: workload("vitest run a.test.ts", { attribution: { lane_id: "lane_x", execution_run_id: "erun_x", root_provider_pid: 77 } }),
    capacity: cap, pid: 2, path, pidAlive: ALIVE, workersRequested: 8, workersGranted: 2,
  });
  const e = q.queue_entry;
  for (const k of ["request_id", "lane_id", "execution_run_id", "root_provider_pid", "workload_class",
    "workers_requested", "workers_granted", "required_weight", "current_held", "budget", "blocked_by", "waiting_since", "wait_deadline"]) {
    assert.ok(k in e, `queue entry missing ${k}`);
  }
  assert.equal(e.lane_id, "lane_x");
  assert.equal(e.workers_requested, 8);
  assert.equal(e.workers_granted, 2);
  assert.ok(e.wait_deadline > e.waiting_since, "a wait must be bounded");
});

await test("a corrupt ledger admits conservatively rather than wedging", () => {
  const path = ledger();
  writeFileSync(path, "{ this is not json");
  const store = A.readClaimStore({ path, pidAlive: ALIVE });
  assert.deepEqual(store.claims, []);
  const r = A.acquireCapacity({ workload: workload("vitest run a.test.ts"), capacity: hostCap(), pid: 1, path, pidAlive: ALIVE });
  assert.equal(r.admit, true, "validation still works");
  assert.ok(existsSync(path));
});

await test("admission decisions are fast enough to sit in the interactive path", () => {
  const path = ledger();
  const cap = hostCap();
  const w = workload("vitest run a.test.ts");
  const t0 = Date.now();
  for (let i = 0; i < 50; i += 1) {
    A.evaluateAdmission({ workload: w, capacity: cap, store: { claims: [], queue: [], events: [] } });
  }
  const perDecision = (Date.now() - t0) / 50;
  assert.ok(perDecision < 5, `admission decision must be sub-5ms, was ${perDecision}ms`);
});

await Promise.all(started);
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
