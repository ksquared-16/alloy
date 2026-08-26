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

const HEALTHY_PROBES = {
  load: { one: 2, five: 2, fifteen: 2 },
  memory: { free_gb: 8, free_pct: 33, compressor_gb: 1, swapouts_delta: 0, swap_rate_known: true },
  disk: { mount: "/", total_gb: 460, free_gb: 200, free_pct: 43 },
  gateway: { status: "ok", ms: 120, retried: false },
  seats: [{ pid: 1, provider: "claude", lane_id: "lane_a", lane_name: "A" }],
  panes: [{ pid: 1 }],
  lanes: [{ lane_id: "lane_a", name: "A", run_state: "EXECUTING" }],
  runs: [{ run_id: "r1", state: "EXECUTING", state_reason: "instruction_delivered", terminal: false, age_ms: 1000 }],
  run_bounds: { instruction_delivered: 3600000 },
  attribution: { seat_count: 1, attributed_count: 1, records: [{ pid: 2, attribution_status: "ancestry", execution_location: "inside_worktree" }] },
  heavy_descendants: [],
  ports: [{ port: 3011, verdict: "matched" }],
  worktrees: { onDisk: 3, registered: 3, unmanaged: [] },
  toolkit: { installed: 5, current: "abc" },
  configured_max: 3,
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

await test("3 — low memory and ACTIVE swap pressure", () => {
  assert.equal(sevOf(report({ memory: { ...HEALTHY_PROBES.memory, free_pct: 1, free_gb: 0.2 } }), "memory.pressure"), "problem");
  assert.equal(sevOf(report({ memory: { ...HEALTHY_PROBES.memory, free_pct: 10 } }), "memory.pressure"), "watch");
  // Plenty free, but actively swapping during the sample — still a problem.
  const swapping = report({ memory: { ...HEALTHY_PROBES.memory, free_pct: 40, swapouts_delta: 900, swap_rate_known: true } });
  assert.equal(sevOf(swapping, "memory.pressure"), "problem");
  assert.match(swapping.findings.find((f) => f.check === "memory.pressure").explanation, /actively swapping/);
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
  assert.equal(sevOf(report({ ports: [{ port: 3011, verdict: "unregistered-server", registered: "wtA", serving: "pid 428" }] }), "ports.registry"), "problem");
  assert.equal(sevOf(report({ ports: [{ port: 3012, verdict: "stale-record", registered: "wtB", serving: null }] }), "ports.registry"), "watch");
  // S2 observes only.
  assert.match(report({ ports: [{ port: 3012, verdict: "stale-record" }] })
    .findings.find((f) => f.check === "ports.registry").suggested_action, /observes only/);
});

await test("13 — unmanaged worktree", () => {
  const r = report({ worktrees: { onDisk: 41, registered: 6, unmanaged: ["wt1-a", "wt2-b"] } });
  assert.equal(sevOf(r, "worktrees.registry"), "watch");
  assert.match(r.findings.find((f) => f.check === "worktrees.registry").suggested_action, /never delete/);
});

await test("14 — excessive toolkit retention", () => {
  assert.equal(sevOf(report({ toolkit: { installed: 71, current: "x" } }), "toolkit.retention"), "problem");
  assert.equal(sevOf(report({ toolkit: { installed: 25, current: "x" } }), "toolkit.retention"), "watch");
  assert.equal(sevOf(report({ toolkit: { installed: 8, current: "x" } }), "toolkit.retention"), "healthy");
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
  assert.equal(t4.max_active_providers, 1);
  assert.equal(t14.max_active_providers, 4);
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

await test("NEGATIVE — validation.collisions refuses to claim S3's knowledge", () => {
  const two = report({ heavy_descendants: [
    { pid: 1, root_provider_pid: 10, lane_name: "A", command: "vitest run" },
    { pid: 2, root_provider_pid: 20, lane_name: "B", command: "vitest run" },
  ] });
  const f = two.findings.find((x) => x.check === "validation.collisions");
  assert.equal(f.severity, "watch");
  assert.equal(f.confidence, "approximate_pending_s3", "must be marked approximate until S3");
  assert.match(f.explanation, /cannot be decided yet/);
  // It must NOT invent a weighted cost.
  assert.equal("weighted_cost" in f.measurements, false);
  assert.equal("tokens" in f.measurements, false);
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
