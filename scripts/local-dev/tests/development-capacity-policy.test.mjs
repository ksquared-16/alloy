#!/usr/bin/env node
/**
 * S4 — canonical capacity policy.
 *
 * THE INVARIANT THIS EXISTS TO PROTECT. Every growth dimension is bounded by a
 * SECOND resource. Providers by cores and memory; validation by cores and
 * memory pressure; dev servers by slots and RAM; builds by tokens and disk. No
 * major ceiling derives from core count alone.
 *
 * That rule is the whole reason a bigger machine helps. Without it, the Mac mini
 * simply reaches load 90 instead of 54 — more hardware becomes more room to
 * overcommit rather than more useful throughput. The simulation matrix below
 * certifies that scaling behaviour without the mini being present.
 */
import assert from "node:assert/strict";

const P = await import("../lib/vacilando/capacity-policy.mjs");

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

/** A synthetic host. Only what the policy reads. */
const host = (over = {}) => ({
  logical_cores: 8, memory_total_gb: 24, memory_free_gb: 10, memory_free_pct: 40,
  disk_total_gb: 460, disk_free_gb: 200, disk_free_pct: 43,
  load_1m: 2, provider_seats: 0, dev_servers: 0,
  active_workloads: 0, active_validation_weight: 0,
  machine_exclusive_present: false, under_memory_pressure: false,
  swap_rate_known: true, ...over,
});
const policyOf = (over = {}) => P.computeCapacityPolicy(host(over));

// ── Simulation matrix ────────────────────────────────────────────────────────

const PROFILES = {
  "4-core / 8 GB": { logical_cores: 4, memory_total_gb: 8, memory_free_gb: 3 },
  "8-core / 24 GB (this host)": { logical_cores: 8, memory_total_gb: 24, memory_free_gb: 10 },
  "14-core / 64 GB (Mac mini)": { logical_cores: 14, memory_total_gb: 64, memory_free_gb: 40 },
  "many-core / low-memory": { logical_cores: 32, memory_total_gb: 8, memory_free_gb: 4 },
  "high-memory / low-core": { logical_cores: 2, memory_total_gb: 128, memory_free_gb: 100 },
  "low-disk": { logical_cores: 8, memory_total_gb: 24, disk_total_gb: 460, disk_free_gb: 5 },
  "under memory pressure": { logical_cores: 8, memory_total_gb: 24, under_memory_pressure: true, swapouts_delta: 900 },
};

await test("simulation matrix produces a policy for every profile", () => {
  for (const [name, over] of Object.entries(PROFILES)) {
    const p = policyOf(over);
    assert.equal(p.schema_version, P.CAPACITY_POLICY_SCHEMA, `${name} schema`);
    assert.ok(p.axes.provider_capacity.ceiling >= 1, `${name} provider ceiling`);
    assert.ok(p.axes.validation_capacity.tokens >= 2, `${name} tokens`);
    assert.ok(p.axes.validation_capacity.worker_ceiling >= 1, `${name} workers`);
  }
});

await test("the discovery's headline numbers hold on 8 and 14 cores", () => {
  const air = policyOf(PROFILES["8-core / 24 GB (this host)"]);
  assert.equal(air.axes.validation_capacity.tokens, 6, "8 cores -> 6 tokens");
  assert.equal(air.axes.validation_capacity.worker_ceiling, 2, "8 cores -> 2 workers");
  assert.equal(air.axes.provider_capacity.ceiling, 3, "this host keeps its intended 3 providers");

  const mini = policyOf(PROFILES["14-core / 64 GB (Mac mini)"]);
  assert.equal(mini.axes.validation_capacity.tokens, 10, "14 cores -> 10 tokens");
  assert.equal(mini.axes.validation_capacity.worker_ceiling, 3, "14 cores -> 3 workers");
  assert.equal(mini.axes.provider_capacity.ceiling, 4, "mini gains one provider, not five");
});

// ── Required invariants 1–10 ─────────────────────────────────────────────────

await test("1 — capacity grows SUB-LINEARLY with cores", () => {
  const a = policyOf({ logical_cores: 8, memory_total_gb: 256 });
  const b = policyOf({ logical_cores: 16, memory_total_gb: 256 });
  const ratio = b.axes.validation_capacity.tokens / a.axes.validation_capacity.tokens;
  assert.ok(ratio <= 2, "tokens must not more than double when cores double");
  // Providers grow far slower than cores.
  assert.ok(b.axes.provider_capacity.ceiling < 16 / 2, "providers must not track cores");
  const p8 = policyOf({ logical_cores: 8, memory_total_gb: 256 }).axes.provider_capacity.ceiling;
  const p64 = policyOf({ logical_cores: 64, memory_total_gb: 256 }).axes.provider_capacity.ceiling;
  assert.ok(p64 / p8 < 64 / 8, "8x the cores must not give 8x the providers");
});

await test("2b — the worker ceiling itself has a second axis", () => {
  // Caught by the simulation matrix: a 32-core / 8 GB host was given a ceiling
  // of 8 workers per job, derived from cores alone.
  const p = policyOf(PROFILES["many-core / low-memory"]);
  assert.equal(p.axes.validation_capacity.worker_ceiling_bounded_by, "memory");
  assert.ok(p.axes.validation_capacity.worker_ceiling < p.axes.validation_capacity.workers_by_cores,
    "memory must cut the core-derived worker ceiling");
  assert.ok(p.constrained_axes.some((c) => c.value === "validation_worker_ceiling"));
  // No major concurrency ceiling may derive from cores alone.
  const rich = policyOf({ logical_cores: 32, memory_total_gb: 256 });
  assert.equal(rich.axes.validation_capacity.worker_ceiling_bounded_by, "cores",
    "with ample memory, cores may bind");
});

await test("2 — adding cores never produces unlimited workers", () => {
  const huge = policyOf({ logical_cores: 512, memory_total_gb: 1024 });
  assert.ok(Number.isFinite(huge.axes.validation_capacity.worker_ceiling));
  assert.ok(Number.isFinite(huge.axes.validation_capacity.tokens));
  // And the ceiling is still bounded by the second axis.
  assert.ok(huge.axes.validation_capacity.tokens <= huge.axes.validation_capacity.by_memory);
});

await test("3 — low RAM constrains a high-core host", () => {
  const p = policyOf(PROFILES["many-core / low-memory"]);
  assert.equal(p.axes.provider_capacity.bounded_by, "memory");
  assert.ok(p.axes.provider_capacity.ceiling < p.axes.provider_capacity.by_cores,
    "memory must cut the core-derived ceiling");
  assert.equal(p.axes.validation_capacity.bounded_by, "memory");
  assert.ok(p.constrained_axes.some((c) => c.value === "provider_capacity"));
});

await test("4 — low disk constrains disk-expanding workloads", () => {
  const p = policyOf(PROFILES["low-disk"]);
  assert.equal(p.axes.disk_headroom.below_reserve, true);
  assert.equal(p.axes.disk_headroom.disk_expanding_classes_available, false);
  assert.ok(P.DISK_EXPANDING_CLASSES.includes("production_build"));
  assert.ok(p.constrained_axes.some((c) => c.value === "disk_headroom"));
  // Disk must NOT silently reduce provider capacity — axes are independent.
  assert.equal(p.axes.provider_capacity.ceiling, policyOf().axes.provider_capacity.ceiling);
});

await test("5 — active memory pressure reduces expensive-work capacity", () => {
  const calm = policyOf();
  const pressed = policyOf(PROFILES["under memory pressure"]);
  assert.ok(pressed.axes.validation_capacity.tokens < calm.axes.validation_capacity.tokens);
  assert.equal(pressed.axes.validation_capacity.bounded_by, "memory_pressure");
  assert.equal(pressed.axes.memory_capacity.under_pressure, true);
  // Pressure is a live RATE, not a lifetime counter.
  assert.equal(pressed.axes.memory_capacity.pressure_signal, "swap_rate");
  // Providers (interactive work) are NOT cut by pressure.
  assert.equal(pressed.axes.provider_capacity.ceiling, calm.axes.provider_capacity.ceiling);
});

await test("6 — provider ceiling and validation budget are independent", () => {
  const busySeats = policyOf({ provider_seats: 3 });
  const busyTokens = policyOf({ active_validation_weight: 6 });
  assert.equal(busySeats.axes.validation_capacity.remaining, busySeats.axes.validation_capacity.tokens,
    "seats in use must not consume validation tokens");
  assert.equal(busyTokens.axes.provider_capacity.remaining, busyTokens.axes.provider_capacity.ceiling,
    "tokens in use must not consume provider seats");
});

await test("7 — machine-exclusive cannot be a large finite weight", () => {
  const p = policyOf();
  const cap = p.axes.machine_exclusive.capacity;
  assert.equal(typeof cap, "symbol", "exclusivity must not be a number");
  assert.equal(cap, P.EXCLUSIVE);
  assert.equal(Number.isFinite(cap), false);
  // It cannot be summed by accident: coercing a Symbol THROWS, which is a
  // stronger protection than NaN — a stray `+` fails loudly instead of silently
  // producing a number a budget would trust.
  assert.throws(() => Number(cap), TypeError);
  assert.throws(() => cap + 1, TypeError);
  // Available only when nothing else holds validation capacity.
  assert.equal(policyOf().axes.machine_exclusive.available, true);
  assert.equal(policyOf({ active_validation_weight: 2 }).axes.machine_exclusive.available, false);
  assert.equal(policyOf({ machine_exclusive_present: true }).axes.machine_exclusive.available, false);
});

await test("8 — the same snapshot always produces the same policy", () => {
  const snap = host({ logical_cores: 14, memory_total_gb: 64 });
  const a = JSON.stringify(P.computeCapacityPolicy(snap), (k, v) => (typeof v === "symbol" ? "SYM" : v));
  const b = JSON.stringify(P.computeCapacityPolicy(snap), (k, v) => (typeof v === "symbol" ? "SYM" : v));
  assert.equal(a, b, "policy computation must be deterministic");
});

await test("9 — a new policy version changes formulas without touching classifiers", () => {
  const v2 = { ...P.CAPACITY_POLICY_V1, version: "v2", validation_core_fraction: 0.5 };
  const p = P.computeCapacityPolicy(host({ logical_cores: 8, memory_total_gb: 256 }), { policy: v2 });
  assert.equal(p.policy_version, "v2");
  assert.equal(p.axes.validation_capacity.tokens, 4, "0.5 * 8 = 4");
  // The V1 default is untouched.
  assert.equal(policyOf({ memory_total_gb: 256 }).axes.validation_capacity.tokens, 6);
});

await test("10 — health consumes the policy and does not reimplement it", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const health = readFileSync(join(here, "..", "lib", "vacilando", "health.mjs"), "utf8");
  const code = health.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  // The single-owner contract: these formulas must exist in capacity-policy only.
  assert.equal(/Math\.floor\(cores\s*\/\s*3\)/.test(code), false, "provider formula must not live in health");
  assert.equal(/cores\s*\*\s*0\.75/.test(code), false, "token formula must not live in health");
  assert.equal(/Math\.floor\(cores\s*\/\s*4\)/.test(code), false, "worker formula must not live in health");
});

// ── Required negative controls / mutations ───────────────────────────────────

await test("NEGATIVE — one-provider-per-core breaks sub-linear scaling", () => {
  const linear = { ...P.CAPACITY_POLICY_V1, provider_divisor: 1, provider_floor: 1, provider_memory_gb_each: 0.001 };
  const p = P.computeCapacityPolicy(host({ logical_cores: 64, memory_total_gb: 256 }), { policy: linear });
  const sane = policyOf({ logical_cores: 64, memory_total_gb: 256 });
  assert.equal(p.axes.provider_capacity.ceiling, 64, "the mutation does produce one per core");
  assert.ok(sane.axes.provider_capacity.ceiling < 64, "the real policy must not");
  // This is the assertion invariant 1 would fail on if the mutation shipped.
  assert.ok(p.axes.provider_capacity.ceiling / 8 >= 64 / 8, "linear scaling detected");
});

await test("NEGATIVE — removing the memory second axis breaks the many-core fixture", () => {
  // A policy where memory cannot bound providers.
  const noSecondAxis = { ...P.CAPACITY_POLICY_V1, provider_memory_gb_each: 0.0001 };
  const p = P.computeCapacityPolicy(host(PROFILES["many-core / low-memory"]), { policy: noSecondAxis });
  assert.equal(p.axes.provider_capacity.bounded_by, "cores", "memory no longer binds");
  // The real policy DOES bind on memory — invariant 3.
  assert.equal(policyOf(PROFILES["many-core / low-memory"]).axes.provider_capacity.bounded_by, "memory");
});

await test("NEGATIVE — removing the worker ceiling produces an unbounded value", () => {
  // BOTH axes have to be removed to make it unbounded — which is itself the
  // second-axis invariant showing its work: disabling only the core divisor
  // leaves memory still binding the ceiling.
  const coresOnly = { ...P.CAPACITY_POLICY_V1, worker_divisor: 1 };
  const stillBounded = P.computeCapacityPolicy(host({ logical_cores: 512, memory_total_gb: 1024 }), { policy: coresOnly });
  assert.ok(stillBounded.axes.validation_capacity.worker_ceiling < 512,
    "memory alone still bounds a core-only mutation");

  const noCeiling = { ...P.CAPACITY_POLICY_V1, worker_divisor: 1, worker_memory_gb_each: 0.0001 };
  const p = P.computeCapacityPolicy(host({ logical_cores: 512, memory_total_gb: 1024 }), { policy: noCeiling });
  assert.equal(p.axes.validation_capacity.worker_ceiling, 512, "with both axes removed it is one per core");
  const sane = policyOf({ logical_cores: 512, memory_total_gb: 1024 });
  assert.ok(sane.axes.validation_capacity.worker_ceiling < 512 / 3, "the real ceiling stays bounded");
});

await test("NEGATIVE — treating exclusivity as a finite number is detectable", () => {
  const finite = 999999;
  assert.notEqual(typeof finite, "symbol");
  assert.equal(Number.isFinite(finite), true);
  // The real policy's value fails both, which is what invariant 7 asserts.
  assert.equal(Number.isFinite(policyOf().axes.machine_exclusive.capacity), false);
});

await test("NEGATIVE — hardcoding this MacBook breaks the Mac mini simulation", () => {
  // A "policy" that returns this host's numbers regardless of hardware.
  const hardcoded = () => ({ tokens: 6, workers: 2, providers: 3 });
  const mini = policyOf(PROFILES["14-core / 64 GB (Mac mini)"]);
  assert.notEqual(mini.axes.validation_capacity.tokens, hardcoded().tokens,
    "the mini must not inherit this MacBook's token budget");
  assert.notEqual(mini.axes.validation_capacity.worker_ceiling, hardcoded().workers);
  assert.notEqual(mini.axes.provider_capacity.ceiling, hardcoded().providers);
});

await test("NEGATIVE — a duplicated formula in health is caught by the single-owner test", () => {
  // Demonstrate the detector the single-owner test relies on.
  const withDuplicate = "const max = Math.max(1, Math.floor(cores / 3));";
  assert.equal(/Math\.floor\(cores\s*\/\s*3\)/.test(withDuplicate), true, "the detector fires on a duplicate");
});

// ── Host capability, observed cost, architecture ─────────────────────────────

await test("host capability records its measurement sources and honest unknowns", () => {
  const fakeOs = { cpus: () => new Array(8), totalmem: () => 24 * 1073741824, arch: () => "x64", platform: () => "darwin" };
  const cap = P.hostCapability({ os: fakeOs, sysctl: () => "" });
  assert.equal(cap.logical_cores, 8);
  assert.equal(cap.cores_source, "os.cpus");
  assert.equal(cap.memory_source, "os.totalmem");
  // sysctl.proc_translated is ABSENT on a native process AND on real Intel, so
  // absent must mean unknown, never "native".
  assert.equal(cap.process_translated, null);
  assert.equal(cap.physical_cores, null);
  assert.equal(cap.physical_cores_source, "unavailable");
  const translated = P.hostCapability({ os: fakeOs, sysctl: (k) => (k === "sysctl.proc_translated" ? "1" : "") });
  assert.equal(translated.process_translated, true);
});

await test("observed cost is diagnostic and never reweights silently", () => {
  const workloads = [{ workload_id: "w1", workload_class: "targeted_test", expected_weight: 2 }];
  const observations = [{ workload_id: "w1", observed_workers: 12, peak_rss_bytes: 500e6 }];
  const d = P.observedCostDiagnostics({ workloads, observations });
  assert.equal(d.declared_total_weight, 2);
  assert.equal(d.observed_implied_weight, 24);
  assert.equal(d.v1_weights_look_optimistic, true);
  assert.equal(d.diagnostic_pressure, 12);
  assert.equal(d.action, "diagnostic_only_no_reweighting");
  assert.match(d.notes[0].note, /observed 12 workers/);
  // The workload record itself is untouched.
  assert.equal(workloads[0].expected_weight, 2);
});

await test("an unrunnable workload is not evidence the host lacks capacity", () => {
  // The S3 live case: @rolldown/binding-darwin-x64 missing under Rosetta.
  const b = P.executionBlockedReason({
    exitCode: 1, durationMs: 859,
    stderr: "Error: Cannot find native binding ... Cannot find module '@rolldown/binding-darwin-x64'",
  });
  assert.equal(b.blocked, true);
  assert.equal(b.reason, "native_binding_missing");
  assert.equal(b.capacity_related, false, "a missing binding is not scarcity");
  const ok = P.executionBlockedReason({ exitCode: 0, durationMs: 40000, stderr: "" });
  assert.equal(ok.blocked, false);
});

await test("S4 computes and explains but cannot enforce", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "lib", "vacilando", "capacity-policy.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  for (const forbidden of ["process.kill", "SIGKILL", "SIGTERM", "execFile", "spawn(", "writeFileSync"]) {
    assert.equal(code.includes(forbidden), false, `capacity-policy must not contain ${forbidden}`);
  }
  assert.equal(policyOf().enforcement, "none_s4_is_advisory");
});

await test("every constrained axis explains itself", () => {
  const p = policyOf(PROFILES["many-core / low-memory"]);
  assert.ok(p.constrained_axes.length > 0);
  for (const c of p.constrained_axes) {
    assert.ok(c.value, "constrained axis must name itself");
    assert.ok(typeof c.reason === "string" && c.reason.length > 10, "and must explain why");
  }
});

// ── normal / burst / measured knee ──────────────────────────────────────────
//
// The dev-server ceiling used to be min(slots, RAM / 8 GB-per-server). On the
// 48 GB mini that produced SIX while the host demonstrably ran EIGHT under
// authenticated compilation, a brokered typecheck and two browser
// certifications with zero swap. The 8 GB figure was what a heavily exercised
// UI server reaches after hours, not what a server costs: fresh ones measured
// 390-440 MB, and eight under real load totalled 11-14 GB.
//
// The staircase then found the envelope directly — 8, 9 and 10 held zero swap;
// 11 was where swap appeared and grew; 12 accelerated to ~2.3 GB with macOS
// expanding the swapfile. These lock that in so the numbers cannot drift back
// to an assumption.
// Injected policy, so these assert the FORMULA rather than whatever topology
// this machine happens to have configured. Reading managedSlotCount() here made
// the result depend on ambient environment — a stale VACILANDO_PORT in one shell
// silently moved the slot bound and failed these for the wrong reason.
const DETERMINISTIC = Object.freeze({
  ...P.CAPACITY_POLICY_V1,
  dev_server_slots: 12,
});
const devCap = (o) => {
  const out = P.computeCapacityPolicy(host(o), { policy: DETERMINISTIC });
  const find = (x) => { for (const k of Object.keys(x || {})) {
    if (k === "dev_server_capacity") return x[k];
    if (x[k] && typeof x[k] === "object") { const r = find(x[k]); if (r) return r; }
  } };
  return find(out);
};

test("a big host offers the measured NORMAL ceiling, not an assumed one", () => {
  const d = devCap({ logical_cores: 12, memory_total_gb: 48, dev_servers: 0 });
  assert.equal(d.normal_ceiling, 8, "8 is the certified heavy-use baseline");
  assert.equal(d.ceiling, 8, "the headline ceiling is the normal one");
});

test("burst is offered above normal but stops below the measured knee", () => {
  const d = devCap({ logical_cores: 12, memory_total_gb: 48, dev_servers: 0 });
  assert.equal(d.burst_ceiling, 10, "10 was the highest level with zero swap");
  assert.equal(d.measured_knee, 11, "11 is where swap first appeared");
  assert.ok(d.burst_ceiling < d.measured_knee, "burst must never reach the knee");
});

test("burst state and headroom are reported, not recomputed by consumers", () => {
  const at6 = devCap({ logical_cores: 12, memory_total_gb: 48, dev_servers: 6 });
  assert.equal(at6.using_burst, false);
  assert.equal(at6.normal_remaining, 2);
  assert.equal(at6.burst_remaining, 4);
  const at9 = devCap({ logical_cores: 12, memory_total_gb: 48, dev_servers: 9 });
  assert.equal(at9.using_burst, true, "nine is above normal, so it is burst");
  assert.equal(at9.normal_remaining, 0);
  assert.equal(at9.burst_remaining, 1);
});

test("a small host is still bounded by its own second axis", () => {
  // POSITIVE CONTROL. Without this, raising the measured ceilings would silently
  // offer eight servers on a laptop that cannot hold them, and every assertion
  // above would still pass.
  const d = devCap({ logical_cores: 4, memory_total_gb: 8, dev_servers: 0 });
  assert.ok(d.normal_ceiling <= 4, `small host must stay small, got ${d.normal_ceiling}`);
  assert.ok(d.burst_ceiling <= d.by_memory || d.burst_ceiling <= d.by_slots,
    "burst is clamped by the same two axes as normal");
});

test("the measured working set replaced the assumption", () => {
  assert.equal(P.CAPACITY_POLICY_V1.dev_server_memory_gb_each, 2,
    "2 GB is the measured steady-state working set; 8 GB was a worst-case mistaken for a cost");
});

await Promise.all(started);
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
