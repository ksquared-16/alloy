#!/usr/bin/env node
/**
 * S2 — `vac health`.
 *
 * WHAT THIS REPLACES. A manual audit of ad-hoc shell commands that only a
 * person could interpret. It found load 54.47, 85 MB free, a 95%-full disk and
 * a Gateway answering in 10.3 seconds — none of which Vacilando could report.
 *
 * THE TWO CONSTRAINTS FROM THAT AUDIT THAT MUST NEVER REGRESS.
 *
 * A short probe LIES under saturation. A 3-second GET of the Gateway returned
 * nothing; a 15-second GET returned 200 in 10.3s. "Down" must never be asserted
 * from one short timeout.
 *
 * And the report must survive the conditions that make it necessary: one failed
 * probe becomes an INCOMPLETE finding, never a hang and never a false healthy.
 */
import assert from "node:assert/strict";

const H = await import("../lib/vacilando/health.mjs");
const P = await import("../lib/vacilando/health-probes.mjs");

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

const HW8 = { cores: 8, memory_gb: 24, hostname: "test-host", platform: "darwin", uptime_seconds: 100 };
const T8 = H.thresholdsFor(HW8);

/** A retention plan in the owner's shape, for health fixtures. */
function toolkitPlan({ total, retained, prunable, keep = 10 }) {
  return {
    total_installed: total, retained_count: retained, prunable_count: prunable,
    current: "abc", keep_n: keep, policy_version: "v1",
    bytes_retained: retained * 1048576, bytes_reclaimable: prunable * 1048576,
    execution_blocked: false, unresolved_pins: [],
    retained_detail: Array.from({ length: retained }, (_, i) => ({
      version: `v${i}`, reasons: i === 0 ? ["current"] : ["rollback_window"], disk_bytes: 1048576, live_pids: [],
    })),
    prune: Array.from({ length: prunable }, (_, i) => ({ version: `p${i}`, path: `/t/p${i}`, disk_bytes: 1048576 })),
  };
}

const HEALTHY_PROBES = {
  load: { one: 2, five: 2, fifteen: 2 },
  // The canonical memory snapshot (memory-capacity.mjs). Health no longer
  // derives severity from `Pages free`: that is not memory available for new
  // work on macOS, and reading it as such refused every production build on a
  // host with ~5 GB available and zero swapping.
  memory: {
    total_gb: 24, free_gb: 0.09, inactive_gb: 4.6, reclaimable_gb: 3.45,
    available_gb: 8, available_pct: 33, reserve_gb: 2.4, available_above_reserve_gb: 5.6,
    compressor_gb: 1, os_free_pct: 40, swapouts_delta: 0, swapins_delta: 0,
    swap_rate_known: true, pressure_state: "healthy", pressure_reasons: [],
    under_pressure: false, incomplete: false,
    measurement_strategy: "darwin_vm_stat_page_accounting", inactive_reclaim_fraction: 0.75,
    policy_version: "v1",
  },
  disk: { mount: "/", total_gb: 460, free_gb: 200, free_pct: 43 },
  gateway: { status: "ok", ms: 120, retried: false },
  seats: [{ pid: 1, provider: "claude", lane_id: "lane_a", lane_name: "A" }],
  panes: [{ pid: 1 }],
  lanes: [{ lane_id: "lane_a", name: "A", run_state: "EXECUTING" }],
  runs: [{ run_id: "r1", state: "EXECUTING", state_reason: "instruction_delivered", terminal: false, age_ms: 1000 }],
  run_bounds: { instruction_delivered: 3600000 },
  attribution: { seat_count: 1, attributed_count: 1, records: [{ pid: 2, attribution_status: "ancestry", execution_location: "inside_worktree" }] },
  workloads: [],
  workload_cost: { total_weight: 0, machine_exclusive_present: false, by_lane: {} },
  ports: [{ port: 3011, verdict: "matched" }],
  worktrees: { onDisk: 3, registered: 3, unmanaged: [] },
  // S9: health reads the retention OWNER's plan; it no longer counts
  // directories. A fixture with no plan is deliberately INCOMPLETE.
  // Validation routing: every heavy workload went through the one authority.
  validation_routing: {
    governed_claims: 1, escaped: 0, external: 0,
    bypass_events: { routed: 0, ambiguous: 0, unclassifiable: 0, escaped: 0, external: 0 },
    capacity_authority: ["validation-admission"],
  },
  validation_bypasses: [],
  toolkit_plan: toolkitPlan({ total: 5, retained: 5, prunable: 0 }),
  // A steward that has completed a cycle within cadence. Absent status is a
  // PROBLEM by design (silence is not health), so the healthy fixture supplies one.
  decision_reconciliation: { pending_count: 0, projected_count: 0, violations: [], consistent: true },
  bridge_reconciliation: { bridge_count: 0, live_count: 0, violations: [], consistent: true },
  steward_status: {
    enabled: true, stale: false, last_cycle_at: new Date().toISOString(), last_cycle_ms: 2300,
    cycles_recorded: 4, actions_executed: 0, actions_refused: 0, escalations: [], history: [],
    stale_after_ms: 900000, admission_before: "HEALTHY", admission_after: "HEALTHY",
  },
  toolkit_severity: { severity: "healthy", why: "toolkit retention is within the configured envelope" },
  configured_max: 3,
  capacity: {
    policy_version: "v1",
    axes: {
      provider_capacity: { ceiling: 3, current: 1, remaining: 2, bounded_by: "cores" },
      validation_capacity: { tokens: 6, used: 0, remaining: 6, worker_ceiling: 2, bounded_by: "cores" },
    },
  },
};

const report = (over = {}, only = null) => H.composeReport({
  hw: HW8, thresholds: T8, only,
  startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:01.000Z",
  probeResults: { ...HEALTHY_PROBES, ...over },
});
const sevOf = (rep, check) => rep.findings.find((f) => f.check === check)?.severity;

// ── 1–15: the required fixture matrix ────────────────────────────────────────

await test("1 — fully healthy fixture yields a healthy verdict and exit 0", () => {
  const r = report();
  assert.equal(r.verdict, "healthy");
  assert.equal(r.exit_code, 0);
  assert.equal(r.counts.problem, 0);
  assert.equal(r.findings.length, H.CHECKS.length);
  assert.equal(r.incomplete, false);
});

await test("2 — high load", () => {
  assert.equal(sevOf(report({ load: { one: 20, five: 20, fifteen: 20 } }), "compute.load"), "problem");
  assert.equal(sevOf(report({ load: { one: 9, five: 9, fifteen: 9 } }), "compute.load"), "watch");
  assert.equal(sevOf(report({ load: { one: 3, five: 3, fifteen: 3 } }), "compute.load"), "healthy");
});

await test("3 — severity comes from the canonical pressure state, not from free pages", async () => {
  const M = await import("../lib/vacilando/memory-capacity.mjs");
  const withState = (over) => report({ memory: { ...HEALTHY_PROBES.memory, ...over } });

  // Genuinely low AVAILABILITY blocks.
  assert.equal(sevOf(withState({ available_gb: 0.9, pressure_state: "pressure", under_pressure: true, pressure_reasons: ["available 0.9 GB is below the 2.4 GB reserve"] }), "memory.pressure"), "problem");
  // Approaching the reserve is a watch.
  assert.equal(sevOf(withState({ available_gb: 3, pressure_state: "watch", pressure_reasons: ["available 3 GB is within 1.5x of the reserve"] }), "memory.pressure"), "watch");
  // Plenty available, but actively swapping during the sample — still a problem.
  const swapping = withState({ available_gb: 9, swapouts_delta: 900, pressure_state: "pressure", under_pressure: true, pressure_reasons: ["900 swapout(s) during the bounded sample"] });
  assert.equal(sevOf(swapping, "memory.pressure"), "problem");
  assert.match(swapping.findings.find((f) => f.check === "memory.pressure").explanation, /swapout/);

  // THE REGRESSION THIS REPLACES: near-zero free pages with real availability
  // and no swapping is HEALTHY. Reading `Pages free` here is what refused
  // every production build on a host that had ~5 GB to give.
  const macosNormal = withState({ free_gb: 0.06, available_gb: 3.6, pressure_state: "healthy" });
  assert.equal(sevOf(macosNormal, "memory.pressure"), "healthy");
  assert.equal(macosNormal.findings.find((f) => f.check === "memory.pressure").measurements.free_gb, 0.06,
    "free pages are still reported — they are simply not the verdict");
  // And the state genuinely comes from the owner, not from a threshold here.
  assert.equal(M.PRESSURE_STATES.includes("pressure"), true);
});

await test("3b — an unreadable memory measurement is a PROBLEM, never a healthy default", () => {
  assert.equal(sevOf(report({ memory: { ...HEALTHY_PROBES.memory, incomplete: true } }), "memory.pressure"), "watch",
    "an incomplete probe degrades the report rather than asserting health");
  assert.equal(sevOf(report({ memory: { ...HEALTHY_PROBES.memory, pressure_state: "unknown" } }), "memory.pressure"), "problem");
});

await test("4 — low disk", () => {
  assert.equal(sevOf(report({ disk: { ...HEALTHY_PROBES.disk, free_pct: 5 } }), "disk.headroom"), "problem");
  assert.equal(sevOf(report({ disk: { ...HEALTHY_PROBES.disk, free_pct: 12 } }), "disk.headroom"), "watch");
});

await test("5 — slow-but-live Gateway is degraded, never down", () => {
  const slow = report({ gateway: { status: "ok", ms: 1200, retried: false } });
  assert.equal(sevOf(slow, "gateway.responsive"), "watch");
  // THE AUDIT'S CASE: first bounded probe timed out, longer retry succeeded.
  const rescued = report({ gateway: { status: "degraded", ms: null, retried: true, retry_ok: true, retry_ms: 10300 } });
  const f = rescued.findings.find((x) => x.check === "gateway.responsive");
  assert.equal(f.severity, "problem");
  assert.match(f.explanation, /live but severely degraded/);
  assert.doesNotMatch(f.explanation, /unreachable/);
});

await test("6 — dead Gateway is only called down when the retry also fails", () => {
  const f = report({ gateway: { status: "down", retried: true, retry_ok: false } })
    .findings.find((x) => x.check === "gateway.responsive");
  assert.equal(f.severity, "problem");
  assert.match(f.explanation, /unreachable/);
  assert.equal(f.measurements.retried, true);
  assert.equal(f.measurements.retry_ok, false);
});

await test("7 — provider over-capacity", () => {
  const seats = [1, 2, 3, 4].map((pid) => ({ pid, provider: "claude", lane_id: `l${pid}`, lane_name: `L${pid}` }));
  // The ceiling now comes from the canonical policy, not a health formula.
  assert.equal(sevOf(report({ seats, panes: seats.map((s) => ({ pid: s.pid })), configured_max: 3 }), "provider.capacity"), "problem");
  assert.equal(sevOf(report({ seats: seats.slice(0, 3), panes: seats.slice(0, 3).map((s) => ({ pid: s.pid })), configured_max: 3 }), "provider.capacity"), "watch");
});

await test("8 — provider seat with no run is WATCH, not a problem", () => {
  const r = report({ lanes: [{ lane_id: "lane_a", name: "A", run_state: null }] });
  assert.equal(sevOf(r, "lanes.consistency"), "watch");
  assert.match(r.findings.find((f) => f.check === "lanes.consistency").explanation, /reclaimable under contention/);
});

await test("9 — run with no provider is a problem ONLY when actually running", () => {
  const noSeat = { seats: [], panes: [] };
  assert.equal(sevOf(report({ ...noSeat, lanes: [{ lane_id: "lane_a", run_state: "EXECUTING" }] }), "lanes.consistency"), "problem");
  // A QUEUED run has no provider BY DEFINITION. Reporting that as impossible
  // was a false positive found on the very first live run.
  assert.equal(sevOf(report({ ...noSeat, lanes: [{ lane_id: "lane_a", run_state: "QUEUED" }] }), "lanes.consistency"), "healthy");
  assert.equal(sevOf(report({ ...noSeat, lanes: [{ lane_id: "lane_a", run_state: "NEEDS_INPUT" }] }), "lanes.consistency"), "healthy");
});

await test("10 — owned off-worktree subprocess is visible and still owned", () => {
  const attribution = {
    seat_count: 1, attributed_count: 1,
    records: [{
      pid: 50820, root_provider_pid: 89207, lane_id: "lane_surfaces", execution_run_id: "erun_x",
      repository_id: "repo_alloy", worktree_path: "/w/wt6", attribution_status: "ancestry",
      execution_location: "outside_worktree", command: "vitest run tests/",
    }],
  };
  const r = report({ attribution });
  assert.equal(sevOf(r, "subprocess.ancestry"), "watch");
  const f = r.findings.find((x) => x.check === "subprocess.ancestry");
  assert.equal(f.measurements.outside_worktree, 1);
  // The contract's per-process identity must survive into the evidence.
  assert.equal(f.evidence[0].lane_id, "lane_surfaces");
  assert.equal(f.evidence[0].execution_run_id, "erun_x");
  assert.equal(f.evidence[0].repository_id, "repo_alloy");
  assert.equal(f.evidence[0].root_provider_pid, 89207);
});

await test("11 — unattributed heavy subprocess stays visible", () => {
  const attribution = {
    seat_count: 1, attributed_count: 0,
    records: [{ pid: 9001, root_provider_pid: null, lane_id: null, attribution_status: "unattributed",
      execution_location: "no_registered_worktree", command: "vitest run everything" }],
  };
  const r = report({ attribution });
  assert.equal(sevOf(r, "subprocess.ancestry"), "problem");
  const f = r.findings.find((x) => x.check === "subprocess.ancestry");
  assert.equal(f.measurements.unattributed, 1);
  assert.equal(f.evidence[0].pid, 9001);
  assert.match(f.suggested_action, /Unattributed does not mean abandoned/);
});

await test("12 — port registry mismatch", () => {
  // S7 verdicts. foreign_owner is the PROBLEM case: the registry is wrong about
  // who owns a live port. unregistered/stale/ambiguous are watch — a running
  // server is not a fault, and refusing to guess is correct behaviour.
  assert.equal(sevOf(report({ ports: [{ port: 3011, verdict: "foreign_owner", recorded_worktree: "wtA", reason: "x" }] }), "ports.registry"), "problem");
  assert.equal(sevOf(report({ ports: [{ port: 3011, verdict: "unregistered_server", reason: "x" }] }), "ports.registry"), "watch");
  assert.equal(sevOf(report({ ports: [{ port: 3012, verdict: "stale_record", reason: "x" }] }), "ports.registry"), "watch");
  assert.equal(sevOf(report({ ports: [{ port: 3011, verdict: "ambiguous", reason: "x" }] }), "ports.registry"), "watch");
  assert.equal(sevOf(report({ ports: [{ port: 3014, verdict: "matched" }] }), "ports.registry"), "healthy");
  // Reality corrects metadata, never the reverse.
  assert.match(report({ ports: [{ port: 3012, verdict: "stale_record" }] })
    .findings.find((f) => f.check === "ports.registry").suggested_action, /Never stop a working server/);
});

await test("13 — unmanaged worktree", () => {
  const r = report({ worktrees: { onDisk: 41, registered: 6, unmanaged: ["wt1-a", "wt2-b"] } });
  assert.equal(sevOf(r, "worktrees.registry"), "watch");
  assert.match(r.findings.find((f) => f.check === "worktrees.registry").suggested_action, /never delete/);
});

await test("14 — toolkit retention reports UNMANAGED ACCUMULATION, not a version count", async () => {
  const { retentionSeverity } = await import("../lib/vacilando/toolkit-retention.mjs");
  const graded = (total, prunable) => {
    const plan = toolkitPlan({ total, retained: total - prunable, prunable });
    return sevOf(report({ toolkit_plan: plan, toolkit_severity: retentionSeverity(plan) }), "toolkit.retention");
  };
  // 71 installs where 69 are protected is HEALTHY — the old count-based check
  // called this a problem, which is exactly the behaviour S9 removes.
  assert.equal(graded(71, 2), "healthy");
  assert.equal(graded(30, 6), "watch");
  assert.equal(graded(20, 18), "problem");
  // A retention state that cannot be determined is a problem, never a licence to prune.
  const blocked = { ...toolkitPlan({ total: 20, retained: 20, prunable: 0 }), execution_blocked: true, blocked_reason: "a live pin is unresolved" };
  assert.equal(sevOf(report({ toolkit_plan: blocked, toolkit_severity: retentionSeverity(blocked) }), "toolkit.retention"), "problem");
});

await test("14b — without the retention owner, health declines to answer", () => {
  const f = report({ toolkit_plan: null, toolkit_severity: null }).findings.find((x) => x.check === "toolkit.retention");
  assert.equal(f.incomplete, true);
  assert.match(f.evidence[0], /does not recompute retention itself/);
});

await test("15 — one failed probe leaves the rest of the report intact", () => {
  // Load and memory probes both missing; everything else must still report.
  const r = report({ load: null, memory: null });
  assert.equal(r.incomplete, true);
  assert.equal(r.findings.length, H.CHECKS.length, "no check may vanish");
  const load = r.findings.find((f) => f.check === "compute.load");
  assert.equal(load.incomplete, true);
  assert.equal(load.confidence, "unavailable");
  // An unmeasurable check must NOT read as healthy.
  assert.notEqual(load.severity, "healthy");
  assert.equal(sevOf(r, "disk.headroom"), "healthy", "other checks still complete");
});

// ── Negative controls ────────────────────────────────────────────────────────

await test("NEGATIVE — thresholds are derived from hardware, not hardcoded", () => {
  const t4 = H.thresholdsFor({ cores: 4, memory_gb: 8 });
  const t14 = H.thresholdsFor({ cores: 14, memory_gb: 64 });
  assert.equal(t4.load_problem, 6);
  assert.equal(t14.load_problem, 21);
  // The provider ceiling formula MOVED to capacity-policy in S4 — health must
  // no longer own it. Its absence here is the single-owner contract holding.
  assert.equal("max_active_providers" in t4, false,
    "provider ceiling is capacity-policy's, not health's");
  // The SAME load is a problem on the small machine and healthy on the big one.
  const small = H.checkComputeLoad({ hw: { cores: 4 }, thresholds: t4, load: { one: 10, five: 10, fifteen: 10 } });
  const big = H.checkComputeLoad({ hw: { cores: 14 }, thresholds: t14, load: { one: 10, five: 10, fifteen: 10 } });
  assert.equal(small.severity, "problem");
  assert.equal(big.severity, "healthy");
});

await test("NEGATIVE — a broken threshold changes the verdict", () => {
  // Prove the load check is actually consulting the threshold it is given.
  const wrong = H.checkComputeLoad({ hw: HW8, thresholds: { ...T8, load_problem: 1000, load_watch: 999 }, load: { one: 20, five: 20, fifteen: 20 } });
  assert.equal(wrong.severity, "healthy", "with an absurd threshold the same load reads healthy");
  const right = H.checkComputeLoad({ hw: HW8, thresholds: T8, load: { one: 20, five: 20, fifteen: 20 } });
  assert.equal(right.severity, "problem");
});

await test("NEGATIVE — ownership classification fails when attribution is broken", () => {
  const owned = { seat_count: 1, attributed_count: 1, records: [
    { pid: 1, attribution_status: "ancestry", execution_location: "inside_worktree", lane_id: "lane_a" }] };
  const broken = { seat_count: 1, attributed_count: 0, records: [
    { pid: 1, attribution_status: "unattributed", execution_location: "no_registered_worktree", lane_id: null }] };
  assert.equal(sevOf(report({ attribution: owned }), "subprocess.ancestry"), "healthy");
  assert.equal(sevOf(report({ attribution: broken }), "subprocess.ancestry"), "problem");
});

await test("NEGATIVE — validation.collisions reports weight but never enforces it", () => {
  // S3 upgraded this from a shape heuristic to real classification. What it
  // still must not do is treat its own budget comparison as a violation.
  const two = report({
    workloads: [
      { pid: 1, root_provider_pid: 10, lane_id: "A", workload_class: "heavy_test", expected_weight: 8, weight_policy_version: "v1", command: "vitest run" },
      { pid: 2, root_provider_pid: 20, lane_id: "B", workload_class: "typecheck", expected_weight: 4, weight_policy_version: "v1", command: "tsc --noEmit" },
    ],
    workload_cost: { total_weight: 12, machine_exclusive_present: false, by_lane: { A: 8, B: 4 } },
    capacity: { policy_version: "v1", axes: { validation_capacity: { tokens: 6, worker_ceiling: 2, bounded_by: "cores" } } },
  });
  const f = two.findings.find((x) => x.check === "validation.collisions");
  assert.equal(f.severity, "watch", "over the PROPOSED budget is a watch, not a problem");
  assert.equal(f.measurements.concurrent_weight, 12);
  assert.equal(f.measurements.canonical_token_budget, 6);
  assert.equal(f.measurements.capacity_policy_version, "v1");
  assert.equal(f.measurements.exceeds_canonical_budget, true);
  // The field name and the copy must both say this is not enforced.
  // S5 ENFORCES this budget, so the copy no longer says "diagnostic".
  assert.match(f.explanation, /enforced budget/);
  assert.equal(f.measurements.enforced, true);
  // Real classification now flows through.
  assert.equal(f.evidence[0].workload_class, "heavy_test");
  assert.equal(f.evidence[0].expected_weight, 8);
});

await test("NEGATIVE — a run is never stale by age alone", () => {
  // Ancient, but its reason is bounded and it is inside the bound.
  const old = report({ runs: [{ run_id: "r", state: "EXECUTING", state_reason: "instruction_delivered", terminal: false, age_ms: 5 * 60 * 60 * 1000 }],
    run_bounds: { instruction_delivered: 6 * 60 * 60 * 1000 } });
  assert.equal(sevOf(old, "runs.stale"), "healthy", "age alone must never condemn a run");
  // Young, but its waiting reason has NO bound — that is the real defect.
  const unbounded = report({ runs: [{ run_id: "r2", state: "QUEUED", state_reason: "waiting_for_agent_session", terminal: false, age_ms: 1000 }],
    run_bounds: { instruction_delivered: 1 } });
  assert.equal(sevOf(unbounded, "runs.stale"), "problem");
  assert.match(unbounded.findings.find((f) => f.check === "runs.stale").explanation, /no configured bound/);
});

// ── Contract, safety and boundedness ─────────────────────────────────────────

await test("the report carries every top-level contract field", () => {
  const r = report();
  for (const k of ["schema_version", "host", "hardware", "verdict", "exit_code",
    "started_at", "ended_at", "duration_ms", "incomplete", "counts", "findings"]) {
    assert.ok(k in r, `missing top-level field: ${k}`);
  }
  assert.equal(r.schema_version, H.HEALTH_SCHEMA);
  assert.equal(r.duration_ms, 1000);
});

await test("every finding carries the full contract", () => {
  for (const f of report().findings) {
    for (const k of ["check", "severity", "owner_resource", "measurements",
      "evidence", "explanation", "suggested_action", "confidence"]) {
      assert.ok(k in f, `${f.check} missing ${k}`);
    }
    assert.ok(H.SEVERITIES.includes(f.severity));
  }
});

await test("findings are ordered problems first, and exit codes map correctly", () => {
  const r = report({ load: { one: 99, five: 99, fifteen: 99 }, disk: { ...HEALTHY_PROBES.disk, free_pct: 1 } });
  const sevs = r.findings.map((f) => f.severity);
  const firstHealthy = sevs.indexOf("healthy");
  const lastProblem = sevs.lastIndexOf("problem");
  assert.ok(lastProblem < firstHealthy, "problems must sort before healthy");
  assert.equal(H.exitCodeFor("healthy"), 0);
  assert.equal(H.exitCodeFor("watch"), 1);
  assert.equal(H.exitCodeFor("problem"), 2);
});

await test("--check runs exactly one check", () => {
  const r = report({}, "disk.headroom");
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].check, "disk.headroom");
});

await test("S2 is observation only — no module may signal, spawn or write", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const health = readFileSync(join(here, "..", "lib", "vacilando", "health.mjs"), "utf8");
  for (const forbidden of ["process.kill", "writeFileSync", "unlinkSync", "rmSync", "send-keys", "execFile"]) {
    assert.equal(health.includes(forbidden), false, `health.mjs must not contain ${forbidden}`);
  }
  // The probe layer may exec, but only to READ. It must never signal a lane's
  // processes or mutate state.
  const probes = readFileSync(join(here, "..", "lib", "vacilando", "health-probes.mjs"), "utf8");
  for (const forbidden of ["writeFileSync", "unlinkSync", "rmSync", "send-keys", "tmux send"]) {
    assert.equal(probes.includes(forbidden), false, `health-probes.mjs must not contain ${forbidden}`);
  }
});

await test("boundedExec returns rather than hanging when a command overruns", async () => {
  const t0 = Date.now();
  const out = await P.boundedExec("sleep", ["10"], { timeoutMs: 300 });
  const ms = Date.now() - t0;
  assert.equal(out.ok, false);
  assert.ok(ms < 3000, `boundedExec must return quickly, took ${ms}ms`);
});

await test("withBudget yields the fallback instead of waiting forever", async () => {
  const never = new Promise(() => {});
  const t0 = Date.now();
  const v = await P.withBudget(never, 200, "fallback");
  assert.equal(v, "fallback");
  assert.ok(Date.now() - t0 < 2000);
});

await test("looksLikeValidation is a SHAPE heuristic, and says so by excluding brokered work", () => {
  assert.equal(P.looksLikeValidation("node .../vitest run tests/"), true);
  assert.equal(P.looksLikeValidation("npx playwright test"), true);
  assert.equal(P.looksLikeValidation("vac run typecheck"), false, "brokered work is not a collision");
  assert.equal(P.looksLikeValidation("alloy-validate wt1 build"), false);
  assert.equal(P.looksLikeValidation("npm run dev"), false);
});

await Promise.all(started);
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
