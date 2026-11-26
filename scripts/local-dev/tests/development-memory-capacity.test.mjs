#!/usr/bin/env node
/**
 * The canonical memory measurement for capacity admission.
 *
 * THE DEFECT. S4 derived available memory from macOS `Pages free`. That is not
 * memory available for new work — macOS keeps free pages near zero on purpose
 * and holds reclaimable memory on the inactive queue. Live on this host:
 * 0.07 GB free, 4.60 GB inactive, ~5.35 GB available by macOS's own accounting,
 * zero swapouts in a bounded sample, and the OS reporting 39% free. S4 read
 * 0.07, compared it to a 2.4 GB reserve, and refused every production build.
 * Cleanup could never fix that, because the number meant something else.
 *
 * WHAT MUST NOT REGRESS. The axis still blocks. It blocks on live evidence —
 * availability below reserve, actual swapping, or the OS's own pressure signal
 * — and never again on a page counter that answers a different question.
 * Compressed memory is never available; lifetime counters are never pressure.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const M = await import("../lib/vacilando/memory-capacity.mjs");
const C = await import("../lib/vacilando/capacity-policy.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const GB = 1073741824;

/**
 * Source with comments stripped.
 *
 * A guard that scans raw text fails on the comment PROMISING not to do the
 * thing — this suite's own comments say "Pages free" precisely because the code
 * must not. Scan code, never prose.
 */
function codeOnly(url) {
  return readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
}
const PAGE = 16384;
const pages = (g) => Math.round((g * GB) / PAGE);

/** vm_stat text in the real shape, from real category names. */
function vmStat({ free = 0.07, active = 4.72, inactive = 4.6, speculative = 0.11, wired = 2.87, compressor = 11.09, purgeable = 0.001, fileBacked = 3.42, anon = 6.02, swapouts = 253668662, swapins = 242385982 } = {}) {
  return [
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
    `Pages free:                                ${pages(free)}.`,
    `Pages active:                            ${pages(active)}.`,
    `Pages inactive:                          ${pages(inactive)}.`,
    `Pages speculative:                         ${pages(speculative)}.`,
    "Pages throttled:                              0.",
    `Pages wired down:                        ${pages(wired)}.`,
    `Pages purgeable:                             ${pages(purgeable)}.`,
    `File-backed pages:                       ${pages(fileBacked)}.`,
    `Anonymous pages:                         ${pages(anon)}.`,
    `Pages occupied by compressor:            ${pages(compressor)}.`,
    `Swapins:                              ${swapins}.`,
    `Swapouts:                             ${swapouts}.`,
  ].join("\n");
}
const pressureText = (pct) => `System-wide memory free percentage: ${pct}%\n`;
const snap = (over = {}) => M.memorySnapshot({
  platform: "darwin", totalBytes: 24 * GB, vmStatText: vmStat(over.vm || {}),
  memoryPressureText: pressureText(over.osPct ?? 39),
  swapoutsDelta: over.swapouts ?? 0, swapRateKnown: over.swapKnown ?? true,
  reserveFraction: 0.10,
  ...(over.snapshot || {}),
});

// ── The measurement ──────────────────────────────────────────────────────────

await test("1 — page size comes from vm_stat's own header, never assumed", () => {
  const p = M.parseVmStat(vmStat());
  assert.equal(p.pageSize, 16384);
  // memory_pressure on this host claims 4096 while vm_stat reports 16384.
  // Mixing them is wrong by a factor of four in either direction.
  assert.equal(M.parseVmStat("Mach Virtual Memory Statistics: (page size of 4096 bytes)\nPages free: 100.").pageSize, 4096);
  assert.equal(M.parseVmStat("garbage"), null);
});

await test("2 — available is free + speculative + purgeable + DISCOUNTED inactive", () => {
  const parts = M.darwinAvailableBytes(M.parseVmStat(vmStat()));
  const expected = parts.free_bytes + parts.speculative_bytes + parts.purgeable_bytes
    + parts.inactive_bytes * M.MEMORY_POLICY_V1.inactive_reclaim_fraction;
  assert.equal(parts.available_bytes, expected);
  assert.equal(parts.reclaimable_bytes, parts.inactive_bytes * 0.75);
  // It is a DISCOUNT, not a rename: strictly less than free + all of inactive.
  assert.ok(parts.available_bytes < parts.free_bytes + parts.inactive_bytes + parts.speculative_bytes);
});

await test("3 — compressed memory is NEVER counted as available", () => {
  const modest = M.darwinAvailableBytes(M.parseVmStat(vmStat({ compressor: 1 })));
  const huge = M.darwinAvailableBytes(M.parseVmStat(vmStat({ compressor: 18 })));
  assert.equal(modest.available_bytes, huge.available_bytes, "compression does not change availability");
  assert.ok(huge.compressor_bytes > modest.compressor_bytes, "but it is reported");
  assert.equal(M.MEMORY_POLICY_V1.count_compressor, false);
});

await test("4 — we report substantially LESS than macOS's own accounting", () => {
  const parts = M.darwinAvailableBytes(M.parseVmStat(vmStat()));
  const macos = 24 * GB - (parts.active_bytes + parts.wired_bytes + parts.compressor_bytes);
  assert.ok(parts.available_bytes < macos, "conservative by construction");
  const ratio = parts.available_bytes / macos;
  assert.ok(ratio > 0.5 && ratio < 0.8, `discounted to ${(ratio * 100).toFixed(0)}% of the OS view`);
  // And enormously more than the old reading, which is the defect being fixed.
  assert.ok(parts.available_bytes > parts.free_bytes * 20);
});

// ── Required negative controls ───────────────────────────────────────────────

await test("NEGATIVE 1 — tiny free + large inactive + zero swapout + healthy OS must NOT block", () => {
  // The exact live shape that produced the false refusal.
  const s = snap();
  assert.equal(s.free_gb < 0.2, true, "free pages are genuinely near zero");
  assert.ok(s.available_gb > s.reserve_gb, `available ${s.available_gb} exceeds reserve ${s.reserve_gb}`);
  assert.equal(s.under_pressure, false);
  assert.equal(M.memoryAdmits(s).admits, true);
});

await test("NEGATIVE 2 — plenty of nominal availability + ACTIVE swapouts must still block", () => {
  const s = snap({ vm: { free: 6, inactive: 8 }, swapouts: 4200 });
  assert.ok(s.available_gb > s.reserve_gb * 3, "availability looks comfortable");
  assert.equal(s.pressure_state, "pressure");
  assert.equal(s.under_pressure, true, "live swapping outranks a comfortable number");
  assert.equal(M.memoryAdmits(s).admits, false);
  assert.match(M.memoryAdmits(s).reason, /swapout/);
});

await test("NEGATIVE 3 — high compression alone is a WATCH, never free RAM", () => {
  const s = snap({ vm: { compressor: 20 } });
  assert.equal(s.compressor_gb > 19, true);
  assert.equal(s.pressure_state, "watch");
  assert.equal(s.under_pressure, false, "compression is a warning, not a block");
  assert.ok(s.pressure_reasons.some((r) => /compressor/.test(r)));
  // And it did not inflate availability.
  assert.equal(snap({ vm: { compressor: 20 } }).available_gb, snap({ vm: { compressor: 1 } }).available_gb);
});

await test("NEGATIVE 4 — LIFETIME swap counts create no current pressure", () => {
  // 253 million lifetime swapouts, zero in the sample.
  const s = snap({ vm: { swapouts: 253668662 }, swapouts: 0 });
  assert.equal(s.under_pressure, false);
  assert.equal(s.swapouts_delta, 0);
  assert.equal(s.pressure_reasons.some((r) => /swapout/.test(r)), false);
});

await test("NEGATIVE 5 — genuinely low availability below reserve must block", () => {
  const s = snap({ vm: { free: 0.05, inactive: 0.3, speculative: 0 } });
  assert.ok(s.available_gb < s.reserve_gb);
  assert.equal(s.pressure_state, "pressure");
  assert.equal(M.memoryAdmits(s).admits, false);
  assert.match(M.memoryAdmits(s).reason, /below the .* reserve/);
});

await test("NEGATIVE 6 — unreadable data degrades CONSERVATIVELY, never optimistically", () => {
  const blind = M.memorySnapshot({ platform: "darwin", totalBytes: 24 * GB, vmStatText: null });
  assert.equal(blind.incomplete, true);
  assert.equal(blind.pressure_state, "unknown");
  assert.equal(blind.under_pressure, true, "unknown is treated as pressure, not as healthy");
  assert.equal(M.memoryAdmits(blind).admits, false);
  // An unreadable OS pressure line only lowers confidence.
  const noPressureLine = M.memorySnapshot({ platform: "darwin", totalBytes: 24 * GB, vmStatText: vmStat(), memoryPressureText: null, swapRateKnown: true, swapoutsDelta: 0 });
  assert.equal(noPressureLine.incomplete, false);
  assert.equal(noPressureLine.os_free_pct, null);
  assert.equal(noPressureLine.under_pressure, false);
});

await test("NEGATIVE 7 — health and S4 admission consume the SAME snapshot", async () => {
  const H = await import("../lib/vacilando/health.mjs");
  const s = snap();
  const cap = C.computeCapacityPolicy(C.hostCapability({
    os: { cpus: () => new Array(8), totalmem: () => 24 * GB, arch: () => "arm64", platform: () => "darwin" },
    memory: s, disk: { total_gb: 460, free_gb: 44, free_pct: 9.6 }, load: { one: 5 },
  }));
  const finding = H.checkMemoryPressure({ hw: { memory_gb: 24 }, thresholds: {}, memory: s });
  // Same available number, same pressure state, from one owner.
  assert.equal(cap.axes.memory_capacity.available_gb, s.available_gb);
  assert.equal(finding.measurements.available_gb, s.available_gb);
  assert.equal(cap.axes.memory_capacity.pressure_state, finding.measurements.pressure_state);
  assert.equal(cap.axes.memory_capacity.under_pressure, s.under_pressure);
  // Neither recomputes availability of its own.
  const capSrc = codeOnly(new URL("../lib/vacilando/capacity-policy.mjs", import.meta.url));
  assert.equal(/Pages\s+free/.test(capSrc), false, "the policy does not parse memory itself");
});

await test("NEGATIVE 8 — moving only Pages free, with availability constant, must not flip admission", () => {
  // Free pages migrate to and from the inactive queue constantly. If admission
  // tracked that, it would oscillate for no real reason.
  const a = snap({ vm: { free: 0.05, inactive: 4.62 } });
  const b = snap({ vm: { free: 1.50, inactive: 3.17 } });
  const delta = Math.abs(a.available_gb - b.available_gb);
  assert.ok(delta < 0.5, `availability barely moved (${delta.toFixed(2)} GB) though free pages moved 1.45 GB`);
  assert.equal(a.under_pressure, b.under_pressure);
  assert.equal(M.memoryAdmits(a).admits, M.memoryAdmits(b).admits);
});

// ── Gating rules ─────────────────────────────────────────────────────────────

await test("5 — ANY blocking condition is enough; they are not required together", () => {
  // Swap alone.
  assert.equal(snap({ swapouts: 5 }).under_pressure, true);
  // OS percentage alone.
  assert.equal(snap({ osPct: 4 }).under_pressure, true);
  // Reserve alone.
  assert.equal(snap({ vm: { free: 0.01, inactive: 0.2, speculative: 0 } }).under_pressure, true);
  // All healthy together.
  assert.equal(snap().under_pressure, false);
});

await test("6 — watch sits between healthy and blocked without blocking", () => {
  const watch = snap({ osPct: 15 });
  assert.equal(watch.pressure_state, "watch");
  assert.equal(watch.under_pressure, false);
  assert.equal(M.memoryAdmits(watch).admits, true);
});

// ── Cross-platform ───────────────────────────────────────────────────────────

await test("7 — macOS math does not silently become the policy elsewhere", () => {
  const linux = M.memorySnapshot({
    platform: "linux", totalBytes: 16 * GB, swapRateKnown: true, swapoutsDelta: 0,
    meminfoText: "MemTotal:       16000000 kB\nMemFree:          200000 kB\nMemAvailable:    9000000 kB\nCached:          6000000 kB\n",
  });
  assert.equal(linux.measurement_strategy, "linux_meminfo_available");
  assert.equal(linux.measurement_source, "/proc/meminfo MemAvailable");
  assert.ok(linux.available_gb > 8, "the kernel's own answer is used, not vm_stat arithmetic");

  const other = M.memorySnapshot({ platform: "freebsd", totalBytes: 8 * GB, osFreeBytes: 2 * GB, swapRateKnown: false });
  assert.equal(other.measurement_strategy, "generic_os_freemem");
  assert.equal(other.confidence, "best_effort", "the portable fallback says it is weaker");

  // A darwin snapshot never claims a linux strategy and vice versa.
  assert.equal(snap().measurement_strategy, "darwin_vm_stat_page_accounting");
  assert.equal(snap().platform, "darwin");
});

// ── Contract ─────────────────────────────────────────────────────────────────

await test("8 — the snapshot exposes every field the contract requires", () => {
  const s = snap();
  for (const f of ["total_gb", "free_gb", "inactive_gb", "reclaimable_gb", "available_gb", "reserve_gb",
    "available_above_reserve_gb", "compressor_gb", "swapins_delta", "swapouts_delta",
    "pressure_state", "measurement_source", "measurement_strategy", "confidence", "incomplete"]) {
    assert.ok(f in s, `missing ${f}`);
  }
  assert.equal(s.available_above_reserve_gb, Number((s.available_gb - s.reserve_gb).toFixed(2)));
  assert.equal(s.policy_version, "v1");
});

// ── Mutations on the real source ─────────────────────────────────────────────

await test("MUTATION — counting the compressor as available admits a swapping host", () => {
  const parts = M.darwinAvailableBytes(M.parseVmStat(vmStat({ free: 0.05, inactive: 0.2, compressor: 18 })));
  const mutated = parts.available_bytes + parts.compressor_bytes;
  assert.ok(mutated / GB > 2.4, "the mutation clears the reserve on compressed bytes alone");
  assert.ok(parts.available_bytes / GB < 2.4, "the real model does not");
});

await test("MUTATION — counting 100% of inactive is the rename this correction forbids", () => {
  const parts = M.darwinAvailableBytes(M.parseVmStat(vmStat()));
  const naive = parts.free_bytes + parts.inactive_bytes;
  assert.ok(naive > parts.available_bytes, "the mutation is more optimistic than the real model");
  assert.equal(M.MEMORY_POLICY_V1.inactive_reclaim_fraction < 1, true);
  const src = readFileSync(new URL("../lib/vacilando/memory-capacity.mjs", import.meta.url), "utf8");
  assert.match(src, /inactive_reclaim_fraction/);
});

await test("MUTATION — using the lifetime swap counter as a rate blocks a healthy host", () => {
  const s = snap({ vm: { swapouts: 253668662 }, swapouts: 0 });
  // The mutation: treat the lifetime total as the delta.
  const mutated = M.classifyPressure({ availableBytes: 4 * GB, reserveBytes: 2.4 * GB, swapoutsDelta: 253668662, swapRateKnown: true });
  assert.equal(mutated.blocking, true, "the mutation blocks forever on ancient history");
  assert.equal(s.under_pressure, false);
});

await test("MUTATION — requiring EVERY signal to be bad lets a swapping host through", () => {
  const swapping = { availableBytes: 9 * GB, reserveBytes: 2.4 * GB, swapoutsDelta: 5000, swapRateKnown: true, osFreePct: 45 };
  // The mutation: block only when availability AND swap AND the OS all agree.
  const mutatedBlocks = swapping.availableBytes < swapping.reserveBytes && swapping.swapoutsDelta > 0 && swapping.osFreePct < 10;
  assert.equal(mutatedBlocks, false, "the mutation admits a host that is actively swapping");
  assert.equal(M.classifyPressure(swapping).blocking, true);
});

await test("MUTATION — reverting the axis to Pages free reproduces the original refusal", () => {
  const s = snap();
  const cap = C.computeCapacityPolicy(C.hostCapability({
    os: { cpus: () => new Array(8), totalmem: () => 24 * GB, arch: () => "arm64", platform: () => "darwin" },
    memory: s, disk: { total_gb: 460, free_gb: 44, free_pct: 9.6 }, load: { one: 5 },
  }));
  assert.ok(cap.axes.memory_capacity.remaining_gb > 0, "the corrected axis admits");
  // The mutation: compare free pages instead.
  const mutatedRemaining = s.free_gb - s.reserve_gb;
  assert.ok(mutatedRemaining < 0, "the old comparison refuses the very same host");
  assert.ok(Math.abs(mutatedRemaining + 2.3) < 0.4, "by roughly the 2.3 GB the incident reported");
});

await test("REGRESSION GUARD — the old `Pages free` admission path is unreachable", () => {
  // The shape this correction removes: Pages free -> free_gb -> memoryBelowReserve.
  // The first cut left it reachable through a fallback, so any caller passing a
  // legacy memory object silently got the behaviour that refused every build.
  const legacy = { free_gb: 0.06, free_pct: 0.25, compressor_gb: 11, swapouts_delta: 0, swap_rate_known: true };
  const cap = C.computeCapacityPolicy(C.hostCapability({
    os: { cpus: () => new Array(8), totalmem: () => 24 * GB, arch: () => "arm64", platform: () => "darwin" },
    memory: legacy, disk: { total_gb: 460, free_gb: 44, free_pct: 9.6 }, load: { one: 5 },
  }));
  // It does NOT quietly compare 0.06 against the reserve and report -2.34.
  assert.equal(cap.axes.memory_capacity.available_gb, null);
  assert.equal(cap.axes.memory_capacity.unmeasured, true);
  assert.equal(cap.axes.memory_capacity.remaining_gb, null, "no remaining figure is invented from free pages");
  assert.equal(cap.axes.memory_capacity.under_pressure, true, "an unmeasured host constrains, conservatively");
  const gateReason = cap.constrained_axes.find((c) => c.value === "memory_capacity" || c.reason?.includes("could not be measured"));
  assert.ok(gateReason, "and it says so as a constrained axis");
  assert.match(gateReason.reason, /could not be measured/);

  // A real snapshot still works normally.
  const good = C.computeCapacityPolicy(C.hostCapability({
    os: { cpus: () => new Array(8), totalmem: () => 24 * GB, arch: () => "arm64", platform: () => "darwin" },
    memory: snap(), disk: { total_gb: 460, free_gb: 44, free_pct: 9.6 }, load: { one: 5 },
  }));
  assert.ok(good.axes.memory_capacity.remaining_gb > 0);
  assert.equal(good.axes.memory_capacity.unmeasured, false);
});

await test("REGRESSION GUARD — the policy never reads a memory page counter itself", () => {
  const src = codeOnly(new URL("../lib/vacilando/capacity-policy.mjs", import.meta.url));
  assert.equal(/Pages\s+free/.test(src), false, "no page counter is parsed in code");
  assert.equal(/vm_stat/.test(src), false);
  // `memory_free_gb` survives for REPORTING only. It is never the comparand.
  assert.equal(/memory_free_gb\s*<|free_gb\s*<\s*memoryReserveGb/.test(src), false);
  assert.match(src, /memoryAvailableGb\s*<\s*memoryReserveGb/, "availability is what the reserve is compared against");
  // And there is no fallback from availability back to free pages. Scoped to
  // the ASSIGNMENT of memoryAvailableGb — `memory_free_gb` still appears twice
  // as a reported field, which is correct and must not trip this guard.
  const assignment = src.slice(src.indexOf("const memoryAvailableGb"), src.indexOf("const memoryUnmeasured"));
  assert.equal(/memory_free_gb/.test(assignment), false, "availability never falls back to free pages");
  assert.match(assignment, /memory_available_gb.*:\s*null/s, "a missing measurement yields null, not a substitute");
});

// ── a probe that cannot run must not look like a calm host ──────────────────
//
// memoryPressure called execFile("sysctl", …) by bare name. sysctl lives in
// /usr/sbin, which is not on every PATH this code runs under, and execFile
// returns "" when it cannot resolve the binary — which parses to level null,
// reports "unknown", and yields thrashing:false. So on any caller without
// /usr/sbin the module reported a calm machine no matter what the kernel said,
// and auto-reclaim could never fire. MEASURED: bare sysctl does not resolve in
// a lane shell here, while /usr/sbin/sysctl -n kern.memorystatus_vm_pressure_level
// returns 1 immediately. Identical in shape to the lsof fix in read-core.
await test("the pressure probe resolves sysctl by absolute path", async () => {
  const src = readFileSync(new URL("../lib/vacilando/memory-manager.mjs", import.meta.url), "utf8");
  assert.match(src, /\/usr\/sbin\/sysctl/, "an absolute path must be tried first");
  assert.doesNotMatch(src, /run\("sysctl"/, "no bare-name sysctl call may remain");
});

await test("pressure says whether it could actually read the kernel", async () => {
  // Without this flag a blind probe and a healthy host are the same object, and
  // burst admission cannot tell which one it is holding.
  const M = await import("../lib/vacilando/memory-manager.mjs");
  const p = await M.memoryPressure({});
  assert.equal(typeof p.readable, "boolean", "readable must always be present");
  if (p.readable) assert.notEqual(p.level, null, "readable implies a level");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
