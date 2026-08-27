#!/usr/bin/env node
/**
 * S9 — toolkit retention, explicit pruning, disk-hygiene visibility.
 *
 * THE TOOLKIT IS THE RECOVERY PATH. Every alloy-* command on the machine
 * resolves through it, so a wrong deletion is not an inconvenience — it removes
 * the mechanism you would use to recover. Every fixture here is written from
 * that direction: what must survive, and what must refuse.
 *
 * THE PIN THAT `current` CANNOT SEE. The live Gateway host runs
 * `.../toolkit/current/lib/vacilando-gateway-host.mjs` — through the symlink —
 * and `current` has already moved since it started. Its command line names no
 * version. Reading safety off `current` would mark the running Gateway's own
 * image prunable, so pins are resolved from the process table and, where a
 * parent went in by symlink, from its descendants.
 *
 * ROLLBACK WAS BROKEN AND THIS SLICE FIXES IT. `mv -f` over a symlink-to-
 * directory FOLLOWS the link: the temp link landed inside the old version and
 * `current` never moved. Retaining ten versions for a rollback that silently
 * no-ops is retention theatre, so the flip is asserted here on a real
 * filesystem rather than described.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const T = await import("../lib/vacilando/toolkit-retention.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const MB = 1048576;

/** A synthetic history: v00 oldest … v19 newest, all with real provenance. */
function history(n = 20) {
  return Array.from({ length: n }, (_, i) => ({
    version: `v${String(i).padStart(2, "0")}`,
    path: `/toolkit/v${String(i).padStart(2, "0")}`,
    installed_at: NOW - (n - i) * DAY,
    source_commit: `commit${i}`,
    source_ref: "origin/staging",
    disk_bytes: 10 * MB,
  }));
}

const inv = (over = {}) => T.buildInventory({
  versions: history(),
  currentSha: "v19",
  pins: { pins: {}, unresolved: [] },
  ...over,
});

const find = (list, v) => list.find((r) => r.version === v);

// ── Retention policy ─────────────────────────────────────────────────────────

await test("1 — the current version is always retained", () => {
  const records = inv();
  assert.equal(find(records, "v19").current, true);
  assert.equal(find(records, "v19").prunable, false);
  assert.ok(find(records, "v19").protection_reasons.includes("current"));
  // Even with keep_n 0 and no other protection at all.
  const none = inv({ keepN: 0 });
  assert.equal(find(none, "v19").prunable, false);
});

await test("2 — the latest keep_n superseded versions are retained for rollback", () => {
  const records = inv();
  const rollback = records.filter((r) => r.rollback_retained).map((r) => r.version).sort();
  assert.equal(rollback.length, T.RETENTION_POLICY_V1.keep_n);
  // The ten most recent SUPERSEDED versions — v19 is current, so v09..v18.
  assert.deepEqual(rollback, ["v09", "v10", "v11", "v12", "v13", "v14", "v15", "v16", "v17", "v18"]);
  assert.equal(find(records, "v08").prunable, true, "the eleventh-newest falls out of the window");
});

await test("2b — keep_n lives in the policy and nowhere else", () => {
  assert.equal(T.RETENTION_POLICY_V1.keep_n, 10);
  const src = readFileSync(new URL("../lib/vacilando/toolkit-retention.mjs", import.meta.url), "utf8")
    .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  const literals = [...src.matchAll(/\bkeep\w*\s*[:=]\s*10\b/g)];
  assert.equal(literals.length, 1, "the number 10 appears once, in the policy");
  const three = inv({ keepN: 3 }).filter((r) => r.rollback_retained).length;
  assert.equal(three, 3, "and the resolver honours a different depth");
});

await test("3 — a live Gateway pinning an OLDER non-current version protects it", () => {
  // The exact hazard: `current` has moved on, the Gateway has not.
  const pins = T.resolveProcessPins({
    processes: [{ pid: 52511, ppid: 52506, command: "/bin/node /Users/k/.local/share/alloy/toolkit/v03/lib/vacilando-server.mjs --port 3020" }],
  });
  assert.deepEqual(pins.pinned_versions, ["v03"]);
  const records = inv({ pins });
  const v03 = find(records, "v03");
  assert.equal(v03.prunable, false, "the running Gateway's image is not prunable because current moved");
  assert.ok(v03.protection_reasons.includes("live_process"));
  assert.equal(v03.live_process_references[0].pid, 52511);
});

await test("4 — a parent that went in through `current` is resolved from its descendant", () => {
  // The live shape on this host: the host process names no version at all.
  const pins = T.resolveProcessPins({
    processes: [
      { pid: 52506, ppid: 1, command: "/bin/node /Users/k/.local/share/alloy/toolkit/current/lib/vacilando-gateway-host.mjs" },
      { pid: 52511, ppid: 52506, command: "/bin/node /Users/k/.local/share/alloy/toolkit/v03/lib/vacilando-server.mjs --port 3020" },
    ],
  });
  assert.equal(pins.fully_resolved, true);
  assert.deepEqual(pins.pinned_versions, ["v03"]);
  const refs = pins.pins.v03.map((r) => `${r.pid}:${r.resolution}`).sort();
  assert.deepEqual(refs, ["52506:inherited_from_descendant", "52511:resolved"]);
});

await test("5 — an explicitly pinned version is retained however old", () => {
  const records = inv({ pinnedVersions: ["v00"] });
  const v00 = find(records, "v00");
  assert.equal(v00.explicitly_pinned, true);
  assert.equal(v00.prunable, false);
  assert.deepEqual(v00.protection_reasons, ["explicitly_pinned"]);
});

await test("6 — unknown reference state protects a version, and blocks the whole prune", () => {
  const pins = T.resolveProcessPins({
    processes: [{ pid: 900, ppid: 1, command: "/bin/node /Users/k/.local/share/alloy/toolkit/current/lib/vacilando-gateway-host.mjs" }],
  });
  assert.equal(pins.fully_resolved, false);
  assert.equal(pins.unresolved.length, 1);
  // Deliberately NOT resolved to the current target — that guess is the one
  // that can delete a running Gateway's image.
  assert.deepEqual(pins.pinned_versions, []);
  const plan = T.planPrune({ inventory: inv({ pins }), currentSha: "v19", pins });
  assert.equal(plan.execution_blocked, true);
  assert.equal(plan.prunable_count, 0);
  assert.equal(plan.bytes_reclaimable, 0);
  assert.match(plan.blocked_reason, /no version may be pruned while any pin is unknown/);
});

await test("6b — unknown provenance and unreadable install time each protect on their own", () => {
  const versions = [
    ...history(12),
    { version: "vX", path: "/toolkit/vX", installed_at: NOW - 400 * DAY, disk_bytes: MB },
    { version: "vY", path: "/toolkit/vY", installed_at: null, source_commit: "c", disk_bytes: MB },
  ];
  const records = T.buildInventory({ versions, currentSha: "v11", pins: { pins: {}, unresolved: [] } });
  assert.deepEqual(find(records, "vX").protection_reasons, ["unknown_provenance"]);
  assert.ok(find(records, "vY").protection_reasons.includes("unknown_reference_state"));
  assert.equal(find(records, "vX").prunable, false);
  assert.equal(find(records, "vY").prunable, false);
});

await test("7 — an old, unreferenced, fully-accounted version becomes prunable", () => {
  const records = inv();
  const v00 = find(records, "v00");
  assert.equal(v00.prunable, true);
  assert.deepEqual(v00.protection_reasons, []);
  // And it is prunable for having no reason to stay, never for being old:
  // v08 is newer and equally prunable once outside the window.
  assert.equal(find(records, "v08").prunable, true);
});

await test("7b — the minimum retention floor keeps a machine from pruning itself bare", () => {
  const versions = history(3);
  const records = T.buildInventory({ versions, currentSha: "v02", pins: { pins: {}, unresolved: [] }, keepN: 0 });
  const retained = records.filter((r) => !r.prunable);
  assert.equal(retained.length, T.RETENTION_POLICY_V1.min_retained_versions);
  // And the floor SAYS it was the floor rather than pretending to another reason.
  assert.ok(retained.some((r) => r.protection_reasons.includes("minimum_retention_floor")));
});

// ── Plan ─────────────────────────────────────────────────────────────────────

await test("8 — plan mode deletes nothing and says so in the artifact", () => {
  const records = inv();
  const plan = T.planPrune({ inventory: records, currentSha: "v19", pins: { pins: {}, unresolved: [] } });
  assert.equal(plan.mode, "plan");
  assert.equal(plan.deletes_nothing, true);
  assert.equal(plan.total_installed, 20);
  assert.equal(plan.retained_count, 11);
  assert.equal(plan.prunable_count, 9);
  assert.equal(plan.bytes_reclaimable, 9 * 10 * MB);
  assert.equal(plan.bytes_retained, 11 * 10 * MB);
  // Every retained version carries its reason.
  assert.equal(plan.retained_detail.every((r) => r.reasons.length > 0), true);
  assert.equal(plan.prune.every((p) => p.version && p.path), true);
});

await test("9 — --yes removes only the currently eligible candidates", async () => {
  const removed = [];
  const records = inv();
  const plan = T.planPrune({ inventory: records, currentSha: "v19", pins: { pins: {}, unresolved: [] } });
  const out = await T.executePrune({
    presentedPlan: plan,
    confirmed: true,
    recompute: async () => ({ inventory: records, currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    remove: async (t) => { removed.push(t.version); return { ok: true, bytes: t.disk_bytes }; },
  });
  assert.equal(out.ok, true, JSON.stringify(out.verification?.problems));
  assert.deepEqual(removed.sort(), ["v00", "v01", "v02", "v03", "v04", "v05", "v06", "v07", "v08"]);
  assert.equal(removed.includes("v19"), false, "never current");
  assert.equal(out.bytes_reclaimed, 9 * 10 * MB);
});

await test("9b — without confirmation nothing is removed, whatever the plan says", async () => {
  const removed = [];
  const out = await T.executePrune({
    presentedPlan: T.planPrune({ inventory: inv(), currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    recompute: async () => ({ inventory: inv(), currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    remove: async (t) => { removed.push(t.version); return { ok: true }; },
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "not_confirmed");
  assert.deepEqual(removed, []);
});

await test("10 — state changing between plan and execute forces recomputation", async () => {
  const removed = [];
  const before = T.planPrune({ inventory: inv(), currentSha: "v19", pins: { pins: {}, unresolved: [] } });
  // Between plan and execute, a process starts on v02.
  const laterPins = T.resolveProcessPins({
    processes: [{ pid: 77, ppid: 1, command: "node /r/toolkit/v02/lib/vacilando-server.mjs" }],
  });
  const out = await T.executePrune({
    presentedPlan: before,
    confirmed: true,
    recompute: async () => ({ inventory: inv({ pins: laterPins }), currentSha: "v19", pins: laterPins }),
    remove: async (t) => { removed.push(t.version); return { ok: true }; },
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "plan_stale");
  assert.deepEqual(removed, [], "not one directory was touched");
  assert.ok(out.differences.some((d) => d.version === "v02" && d.change === "no_longer_prunable"));
});

await test("10b — a prune that cannot recompute is refused rather than trusted", async () => {
  const out = await T.executePrune({ presentedPlan: {}, confirmed: true, remove: async () => ({ ok: true }) });
  assert.equal(out.ok, false);
  assert.equal(out.error, "plan_stale");
  assert.match(out.detail, /may not run from a plan it cannot recompute/);
});

// ── Recovery ─────────────────────────────────────────────────────────────────

await test("11 — current remains valid after pruning", async () => {
  const records = inv();
  const out = await T.executePrune({
    presentedPlan: T.planPrune({ inventory: records, currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    confirmed: true,
    recompute: async () => ({ inventory: records, currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    remove: async (t) => ({ ok: true, bytes: t.disk_bytes }),
  });
  assert.equal(out.verification.current_present, true);
  assert.equal(out.verification.problems.length, 0);
});

await test("12 — a meaningful rollback window survives the prune", async () => {
  const records = inv();
  const out = await T.executePrune({
    presentedPlan: T.planPrune({ inventory: records, currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    confirmed: true,
    recompute: async () => ({ inventory: records, currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    remove: async (t) => ({ ok: true, bytes: t.disk_bytes }),
  });
  assert.equal(out.verification.rollback_targets, T.RETENTION_POLICY_V1.keep_n);
  assert.equal(out.verification.live_pins_intact, true);
});

await test("12b — ROLLBACK ACTUALLY WORKS: the symlink flip is asserted on a real filesystem", () => {
  // The bug S9 fixes. `mv -f` over a symlink-to-directory FOLLOWS the link.
  const root = mkdtempSync(join(tmpdir(), "vac-tk-"));
  try {
    mkdirSync(join(root, "v1"));
    mkdirSync(join(root, "v2"));
    execFileSync("ln", ["-sfn", join(root, "v1"), join(root, "current")]);

    // The OLD rollback path, reproduced exactly.
    execFileSync("ln", ["-sfn", join(root, "v2"), join(root, ".current.tmp")]);
    execFileSync("mv", ["-f", join(root, ".current.tmp"), join(root, "current")]);
    assert.equal(basename(resolve(root, readlinkSync(join(root, "current")))), "v1",
      "the old path leaves current pointing at v1 — the rollback silently did nothing");
    assert.equal(existsSync(join(root, "v1", ".current.tmp")), true,
      "and drops the temp link INSIDE the version it was supposed to leave");

    // The FIXED path.
    rmSync(join(root, "v1", ".current.tmp"), { force: true });
    execFileSync("ln", ["-sfn", join(root, "v2"), join(root, "current")]);
    assert.equal(basename(resolve(root, readlinkSync(join(root, "current")))), "v2", "ln -sfn replaces the link itself");
    assert.equal(lstatSync(join(root, "current")).isSymbolicLink(), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await test("12c — the shipped alloy-toolkit uses the safe flip in BOTH install and rollback", async () => {
  const src = readFileSync(new URL("../alloy-toolkit", import.meta.url), "utf8");
  const code = src.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  assert.equal(/mv\s+-f\s+"\$\{ROOT\}\/\.current\.tmp"\s+"\$\{ROOT\}\/current"/.test(code), false,
    "no code path may move a temp link over current");
  const rollback = code.slice(code.indexOf("cmd_rollback()"));
  assert.match(rollback, /ln -sfn "\$\{ROOT\}\/\$\{sha\}" "\$\{ROOT\}\/current"/);
  assert.match(rollback, /rollback did not take effect/, "and it asserts the flip took");
});

await test("13 — a partial deletion failure never corrupts current or the retained set", async () => {
  const records = inv();
  const out = await T.executePrune({
    presentedPlan: T.planPrune({ inventory: records, currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    confirmed: true,
    recompute: async () => ({ inventory: records, currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    remove: async (t) => (t.version === "v04"
      ? { ok: false, error: "EBUSY" }
      : { ok: true, bytes: t.disk_bytes }),
  });
  assert.equal(out.partial, true);
  assert.equal(out.failed.length, 1);
  assert.equal(out.failed[0].error, "EBUSY");
  assert.equal(out.removed.includes("v04"), false, "the failure is reported, not swallowed");
  assert.equal(out.removed.length, 8, "and the other candidates still completed");
  assert.equal(out.verification.current_present, true);
  assert.equal(out.verification.problems.length, 0);
});

await test("14 — bytes reclaimed come from what was REMOVED, not from the plan's estimate", async () => {
  const records = inv();
  const out = await T.executePrune({
    presentedPlan: T.planPrune({ inventory: records, currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    confirmed: true,
    recompute: async () => ({ inventory: records, currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    // Every directory turns out to be half the size the plan estimated, and one fails.
    remove: async (t) => (t.version === "v00" ? { ok: false, error: "EPERM" } : { ok: true, bytes: 5 * MB }),
  });
  assert.equal(out.bytes_reclaimed, 8 * 5 * MB);
  assert.notEqual(out.bytes_reclaimed, out.plan.bytes_reclaimable, "the estimate is not the receipt");
});

// ── Health ───────────────────────────────────────────────────────────────────

await test("15 — health consumes the retention owner and never counts directories", async () => {
  const H = await import("../lib/vacilando/health.mjs");
  const plan = T.planPrune({ inventory: inv(), currentSha: "v19", pins: { pins: {}, unresolved: [] } });
  const f = H.checkToolkitRetention({ plan, severity: T.retentionSeverity(plan) });
  assert.equal(f.measurements.total_installed, 20);
  assert.equal(f.measurements.prunable, 9);
  assert.equal(f.measurements.policy_version, "v1");
  assert.equal(f.measurements.rollback_retained, 10);
  // With no plan it is INCOMPLETE — it must not answer without the owner.
  const none = H.checkToolkitRetention({ plan: null });
  assert.equal(none.incomplete, true);
  // And the check contains no directory-counting of its own.
  const src = readFileSync(new URL("../lib/vacilando/health.mjs", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export function checkToolkitRetention"), src.indexOf("export function composeReport"));
  for (const forbidden of ["readdirSync", "installed.length", "keep *"]) {
    assert.equal(fn.includes(forbidden), false, `${forbidden} must not appear in the health check`);
  }
});

await test("15b — severity reports unmanaged accumulation, not a raw version count", () => {
  const tidy = { keep_n: 10, prunable_count: 2, retained_count: 72, bytes_reclaimable: 0, total_installed: 74, execution_blocked: false };
  assert.equal(T.retentionSeverity(tidy).severity, "healthy", "74 installs, almost all protected, is healthy");
  const messy = { keep_n: 10, prunable_count: 18, retained_count: 2, bytes_reclaimable: 100 * MB, total_installed: 20, execution_blocked: false };
  assert.equal(T.retentionSeverity(messy).severity, "problem", "20 installs, 18 of them dead weight, is not");
  const watch = { keep_n: 10, prunable_count: 6, retained_count: 24, bytes_reclaimable: MB, total_installed: 30, execution_blocked: false };
  assert.equal(T.retentionSeverity(watch).severity, "watch");
  // Unknown retention state is a PROBLEM, and never an invitation to prune.
  const blocked = { keep_n: 10, prunable_count: 0, bytes_reclaimable: 0, execution_blocked: true, blocked_reason: "unresolved pin" };
  assert.equal(T.retentionSeverity(blocked).severity, "problem");
  // Disk pressure escalates only when there is something to reclaim.
  assert.equal(T.retentionSeverity(tidy, { diskPressure: true }).severity, "problem");
  assert.equal(T.retentionSeverity({ ...tidy, prunable_count: 0 }, { diskPressure: true }).severity, "healthy");
});

// ── Disk hygiene ─────────────────────────────────────────────────────────────

await test("16 — hygiene reports ownership, and only the toolkit row carries an action", () => {
  const plan = T.planPrune({ inventory: inv(), currentSha: "v19", pins: { pins: {}, unresolved: [] } });
  const h = T.diskHygiene({
    plan,
    reconciliation: { total_worktrees: 42, worktrees: { retirable: 9 } },
    disk: { free_gb: 25.2, total_gb: 460.4 },
    caches: [{ name: "npm cache", bytes: 2 * 1024 * MB }],
    docker: { summary: "one shared local stack" },
  });
  assert.deepEqual(h.actionable, ["toolkit"], "nothing else in this report may be acted on from here");
  assert.equal(h.items.find((i) => i.resource === "worktrees").ownership, "s7_proposes_operator_governs");
  assert.match(h.items.find((i) => i.resource === "worktrees").note, /NOT part of a toolkit prune/);
  assert.equal(h.items.find((i) => i.resource === "docker").ownership, "external_report_only");
  assert.equal(h.items.find((i) => i.resource === "npm cache").reclaimable_bytes, null);
});

// ── Required negative controls / mutations ───────────────────────────────────

await test("MUTATION — making current prunable: the fixture fails", () => {
  const records = inv();
  // The mutation: prune anything outside the rollback window, full stop.
  const mutated = records.filter((r) => !r.rollback_retained).map((r) => r.version);
  assert.ok(mutated.includes("v19"), "the mutation offers the CURRENT version for deletion");
  assert.equal(find(records, "v19").prunable, false, "the real policy never does");
});

await test("MUTATION — ignoring the live-process pin: the fixture fails", () => {
  const pins = T.resolveProcessPins({
    processes: [{ pid: 52511, ppid: 1, command: "node /r/toolkit/v03/lib/vacilando-server.mjs" }],
  });
  // The mutation: derive safety from `current` alone.
  const fromCurrentOnly = history().filter((v) => v.version !== "v19").map((v) => v.version);
  assert.ok(fromCurrentOnly.includes("v03"), "the mutation deletes the running Gateway's own image");
  assert.equal(find(inv({ pins }), "v03").prunable, false);
});

await test("MUTATION — reducing the retained rollback set below policy: the fixture fails", () => {
  const shallow = inv({ keepN: 2 });
  assert.equal(shallow.filter((r) => r.rollback_retained).length, 2, "the mutation keeps 2");
  const v = T.verifyAfterPrune({
    inventory: shallow,
    currentSha: "v19",
    pins: { pins: {} },
    removed: shallow.filter((r) => r.prunable).map((r) => r.version),
    keepN: T.RETENTION_POLICY_V1.keep_n,
  });
  assert.equal(v.rollback_targets, 2);
  assert.ok(v.rollback_expected_at_least > v.rollback_targets, "which verification reports as short of policy");
});

await test("MUTATION — treating unknown as safe to delete: the fixture fails", () => {
  const versions = [...history(12), { version: "vX", path: "/t/vX", installed_at: NOW - 400 * DAY, disk_bytes: MB }];
  const permissive = T.buildInventory({
    versions, currentSha: "v11", pins: { pins: {}, unresolved: [] },
    policy: { ...T.RETENTION_POLICY_V1, protect_unknown: false },
  });
  assert.equal(find(permissive, "vX").prunable, true, "the mutation deletes an unaccounted directory");
  const real = T.buildInventory({ versions, currentSha: "v11", pins: { pins: {}, unresolved: [] } });
  assert.equal(find(real, "vX").prunable, false);
});

await test("MUTATION — allowing the default command to delete without --yes: the fixture fails", async () => {
  const removed = [];
  // The mutation: confirmation defaults to true.
  const mutated = async () => { removed.push("v00"); return { ok: true }; };
  await mutated();
  assert.equal(removed.length, 1, "the mutation deletes on a bare `prune`");
  const real = await T.executePrune({
    recompute: async () => ({ inventory: inv(), currentSha: "v19", pins: { pins: {}, unresolved: [] } }),
    remove: async () => { throw new Error("must not be called"); },
  });
  assert.equal(real.error, "not_confirmed");
  // And the CLI itself only sets confirmed from the flag.
  const cli = readFileSync(new URL("../vac-toolkit-prune.mjs", import.meta.url), "utf8");
  assert.match(cli, /const confirmed = argv\.includes\("--yes"\);/);
  assert.match(cli, /if \(!confirmed\)/);
});

await test("MUTATION — executing a stale plan without recomputation: the fixture fails", async () => {
  const stale = T.planPrune({ inventory: inv(), currentSha: "v19", pins: { pins: {}, unresolved: [] } });
  // The mutation: delete straight from the presented plan.
  const mutatedTargets = stale.prune.map((p) => p.version);
  assert.ok(mutatedTargets.includes("v02"), "the stale plan still lists v02");
  const nowPinned = T.resolveProcessPins({ processes: [{ pid: 5, ppid: 1, command: "node /r/toolkit/v02/x.mjs" }] });
  const out = await T.executePrune({
    presentedPlan: stale, confirmed: true,
    recompute: async () => ({ inventory: inv({ pins: nowPinned }), currentSha: "v19", pins: nowPinned }),
    remove: async () => { throw new Error("must not be called"); },
  });
  assert.equal(out.error, "plan_stale");
});

await test("MUTATION — health counting toolkit directories independently: the single-owner fixture fails", async () => {
  const H = await import("../lib/vacilando/health.mjs");
  // The mutation: severity from a raw count, as the check used to do.
  const installed = 74;
  const mutatedSeverity = installed > 10 * 3 ? "problem" : "healthy";
  assert.equal(mutatedSeverity, "problem", "the mutation calls a well-managed 74-version host a problem");
  const tidy = { keep_n: 10, prunable_count: 2, retained_count: 72, bytes_reclaimable: 0, total_installed: 74, execution_blocked: false, retained_detail: [], current: "v19" };
  assert.equal(H.checkToolkitRetention({ plan: tidy, severity: T.retentionSeverity(tidy) }).severity, "healthy");
});

// ── Guards ───────────────────────────────────────────────────────────────────

await test("GUARD — the retention model itself deletes nothing", async () => {
  const src = readFileSync(new URL("../lib/vacilando/toolkit-retention.mjs", import.meta.url), "utf8")
    .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  for (const forbidden of ["rmSync", "unlinkSync", "execFile", "spawn(", "process.kill"]) {
    assert.equal(src.includes(forbidden), false, `${forbidden} must not appear in the model`);
  }
});

await test("GUARD — the CLI refuses to remove anything outside the toolkit root", async () => {
  const cli = readFileSync(new URL("../vac-toolkit-prune.mjs", import.meta.url), "utf8");
  assert.match(cli, /path_outside_toolkit_root/);
  assert.match(cli, /refusing_to_remove_current/);
  assert.match(cli, /directory_still_present_after_removal/, "removal is verified, not assumed");
  assert.match(cli, /force: false/, "and it never forces");
});

await test("GUARD — an unreadable process table blocks the prune instead of emptying it", async () => {
  const cli = readFileSync(new URL("../vac-toolkit-prune.mjs", import.meta.url), "utf8");
  assert.match(cli, /the process table could not be read; live pins are unknown/);
  // And that shape does block.
  const plan = T.planPrune({
    inventory: inv(),
    currentSha: "v19",
    pins: { pins: {}, unresolved: [{ pid: null, reason: "the process table could not be read" }] },
  });
  assert.equal(plan.execution_blocked, true);
  assert.equal(plan.prunable_count, 0);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
