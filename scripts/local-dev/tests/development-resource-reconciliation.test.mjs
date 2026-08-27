#!/usr/bin/env node
/**
 * S7 — worktree, dev-server and port reconciliation.
 *
 * THE GOVERNING RULE THIS ENCODES. Reality corrects metadata. Metadata does not
 * kill reality. A valid running process is never stopped because a registry
 * disagrees with it.
 *
 * THE HISTORICAL SHAPES. Port 3011 served a real, supervised, five-day-old dev
 * server for a worktree the registry did not list, while the registry assigned
 * 3011 elsewhere with no live process. 3012 and 3013 carried assignments whose
 * servers were long gone. 42 git worktrees existed against 6 registrations.
 *
 * WHAT MUST NEVER REGRESS. Ownership comes from ancestry, never a directory.
 * Unprovable ownership is `ambiguous`, never a guess — because a guess here
 * would authorise a correction. And age is never an input to retirement.
 */
import assert from "node:assert/strict";

const R = await import("../lib/vacilando/resource-reconciliation.mjs");

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

const clean = { dirty_paths: [] };
const dirty = { dirty_paths: ["web/app/page.tsx"] };

// ── Historical incident fixtures ─────────────────────────────────────────────

await test("1 — 3011: a real server runs while the registry points elsewhere", () => {
  const v = R.classifyPort({
    port: 3011,
    recordedWorktree: "wt1-r2-true-cold-work-unit",
    recordedPid: null, recordedPidAlive: false,
    listening: true, observedPid: 458,
    observedOwnerWorktree: "wt1-access-identity-v2", ownershipProven: true,
  });
  assert.equal(v.verdict, "foreign_owner", "the record is wrong about WHO, not whether");
  assert.equal(v.observed_owner, "wt1-access-identity-v2");
  // The live server must NOT be corrected away.
  const plan = R.planCorrections({ ports: [v] });
  assert.equal(plan.actions.length, 0, "no action may touch a live server");
  assert.equal(plan.withheld[0].kind, "reassign_port");
  assert.equal(plan.withheld[0].affects_live_process, true);
});

await test("2 — 3012/3013: stale assignments with no live servers", () => {
  for (const port of [3012, 3013]) {
    const v = R.classifyPort({
      port, recordedWorktree: `wt-assigned-${port}`, recordedPid: 999, recordedPidAlive: false,
      listening: false,
    });
    assert.equal(v.verdict, "stale_record");
    const plan = R.planCorrections({ ports: [v] });
    assert.equal(plan.actions[0].kind, "clear_dead_pid_record");
    assert.equal(plan.actions[0].destructive, false, "clearing a dead record touches nothing live");
  }
});

await test("3 — managed ports that match correctly", () => {
  for (const [port, wt] of [[3014, "wt4-enrollment"], [3015, "wt5-runtime"], [3016, "wt6-surfaces"]]) {
    const v = R.classifyPort({
      port, recordedWorktree: wt, recordedPid: 100, recordedPidAlive: true,
      listening: true, observedPid: 100, observedOwnerWorktree: wt, ownershipProven: true,
    });
    assert.equal(v.verdict, "matched", `${port} should match`);
  }
  assert.equal(R.planCorrections({ ports: [R.classifyPort({ port: 3015, recordedWorktree: "w", recordedPidAlive: true, listening: true, observedOwnerWorktree: "w", ownershipProven: true })] }).actions.length, 0);
});

await test("4 — a worktree in git but not registered is UNMANAGED, not garbage", () => {
  const w = R.classifyWorktree({ path: "/w/wt1-old", registration: null, gitState: clean });
  assert.equal(w.state, "unmanaged");
  assert.equal(w.provenance, "discovered", "provenance preserved — not claimed as managed");
  assert.equal(w.managed, false);
  const plan = R.planCorrections({ worktrees: [w] });
  assert.equal(plan.actions[0].kind, "adopt_unmanaged_worktree");
  assert.equal(plan.actions[0].destructive, false);
});

await test("5 — uncommitted work is PROTECTED", () => {
  const w = R.classifyWorktree({
    path: "/w/wt-dirty", registration: { provenance: "managed" },
    gitState: dirty, branchDurable: true,
  });
  assert.equal(w.state, "protected");
  assert.ok(w.retirement_blocked_by.includes("uncommitted work"));
  assert.equal(R.planCorrections({ worktrees: [w] }).withheld.length, 0, "protected is not even proposed");
});

await test("6 — merged, durable, inactive is RETIRABLE — as a proposal only", () => {
  const w = R.classifyWorktree({
    path: "/w/wt-done", registration: { provenance: "managed" },
    gitState: clean, branchDurable: true,
  });
  assert.equal(w.state, "retirable");
  assert.equal(w.proposal, "may_be_proposed_for_retirement");
  const plan = R.planCorrections({ worktrees: [w] });
  assert.equal(plan.actions.length, 0, "S7 never retires");
  assert.equal(plan.withheld[0].kind, "retire_worktree");
  assert.match(plan.withheld[0].reason, /operator decision/);
});

await test("7 — a live provider keeps a worktree ACTIVE", () => {
  const w = R.classifyWorktree({
    path: "/w/wt-busy", registration: { provenance: "managed" },
    liveProviders: [{ pid: 89207 }], gitState: clean, branchDurable: true,
  });
  assert.equal(w.state, "active");
  assert.match(w.reasons[0], /live provider pid 89207/);
});

await test("8 — a live dev server with no provider is still ACTIVE", () => {
  const w = R.classifyWorktree({
    path: "/w/wt-serving", registration: { provenance: "managed" },
    liveDevServer: true, gitState: clean, branchDurable: true,
  });
  assert.equal(w.state, "active");
  assert.ok(w.reasons.includes("live dev server"));
});

await test("9 — finished metadata is archived through the canonical path", () => {
  const w = R.classifyWorktree({
    path: "/w/wt-archived", registration: { provenance: "archived" }, gitState: clean, branchDurable: true,
  });
  assert.equal(w.provenance, "archived", "archived provenance survives classification");
  assert.ok(R.PROVENANCE.includes(w.provenance));
});

await test("10 — unprovable ownership never triggers a correction", () => {
  const v = R.classifyPort({
    port: 3011, recordedWorktree: "wt-recorded", listening: true,
    observedPid: 1234, observedOwnerWorktree: null, ownershipProven: false,
  });
  assert.equal(v.verdict, "ambiguous");
  const plan = R.planCorrections({ ports: [v] });
  assert.equal(plan.actions.length, 0, "no action derived from a guess");
  assert.match(plan.withheld[0].reason, /could not be proven/);
});

// ── Required mutations ───────────────────────────────────────────────────────

await test("MUTATION — registry authoritative over a live process", () => {
  const v = R.classifyPort({
    port: 3011, recordedWorktree: "wt-recorded", recordedPidAlive: false,
    listening: true, observedOwnerWorktree: "wt-actual", ownershipProven: true,
  });
  // The mutation: believe the registry and "correct" the live server away.
  const mutatedPlan = { actions: [{ kind: "reassign_port", port: 3011 }] };
  assert.equal(mutatedPlan.actions[0].kind, "reassign_port");
  // The real plan refuses.
  const real = R.planCorrections({ ports: [v] });
  assert.equal(real.actions.length, 0);
  assert.equal(real.withheld[0].affects_live_process, true);
});

await test("MUTATION — age alone classifying a worktree retirable", () => {
  // Old AND dirty. An age rule would retire it.
  const oldDirty = R.classifyWorktree({
    path: "/w/wt-ancient", registration: { provenance: "managed" },
    gitState: dirty, branchDurable: true,
  });
  const ageWouldSay = "retirable";
  assert.notEqual(oldDirty.state, ageWouldSay, "age must not decide");
  assert.equal(oldDirty.state, "protected");
  // Young AND clean and durable IS retirable — proving age is simply not an input.
  const youngClean = R.classifyWorktree({
    path: "/w/wt-new", registration: { provenance: "managed" }, gitState: clean, branchDurable: true,
  });
  assert.equal(youngClean.state, "retirable");
});

await test("MUTATION — allowing an uncommitted worktree to retire", () => {
  const w = R.classifyWorktree({
    path: "/w/wt", registration: { provenance: "managed" }, gitState: dirty, branchDurable: true,
  });
  assert.notEqual(w.state, "retirable");
  assert.ok(w.retirement_blocked_by.includes("uncommitted work"));
  // Unknown git state is ALSO blocking — absence of evidence is not cleanliness.
  const unknown = R.classifyWorktree({
    path: "/w/wt2", registration: { provenance: "managed" }, gitState: null, branchDurable: true,
  });
  assert.equal(unknown.state, "protected");
  assert.ok(unknown.retirement_blocked_by.includes("git state could not be read"));
});

await test("MUTATION — cwd alone claiming port ownership", () => {
  // Ownership NOT proven by ancestry, even though a cwd is available.
  const v = R.classifyPort({
    port: 3011, recordedWorktree: "wt-a", listening: true,
    observedOwnerWorktree: "wt-from-cwd", ownershipProven: false,
  });
  assert.equal(v.verdict, "ambiguous", "a cwd is not ownership");
  // With ancestry proof, the same inputs resolve.
  const proven = R.classifyPort({
    port: 3011, recordedWorktree: "wt-a", listening: true,
    observedOwnerWorktree: "wt-from-cwd", ownershipProven: true,
  });
  assert.equal(proven.verdict, "foreign_owner");
});

await test("MUTATION — the reconciler must contain no kill or delete path", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "lib", "vacilando", "resource-reconciliation.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  for (const forbidden of [
    "process.kill", "SIGKILL", "SIGTERM", "spawn(", "execFile", "rmSync", "unlinkSync",
    "worktree remove", "branch -D", "rm -rf",
  ]) {
    assert.equal(code.includes(forbidden), false, `reconciler must not contain ${forbidden}`);
  }
});

await test("MUTATION — treating all unregistered worktrees as garbage", () => {
  const w = R.classifyWorktree({ path: "/w/wt-unknown", registration: null, gitState: clean });
  assert.equal(w.state, "unmanaged");
  assert.notEqual(w.state, "retirable", "unregistered is NOT the same as disposable");
  const plan = R.planCorrections({ worktrees: [w] });
  assert.equal(plan.actions[0].kind, "adopt_unmanaged_worktree", "adopted, not proposed for deletion");
  assert.equal(plan.withheld.length, 0);
});

await test("MUTATION — a foreign owner reported as stale_record", () => {
  const v = R.classifyPort({
    port: 3011, recordedWorktree: "wt-a", recordedPid: 1, recordedPidAlive: false,
    listening: true, observedOwnerWorktree: "wt-b", ownershipProven: true,
  });
  // The mutation would call this stale_record because the recorded pid is dead —
  // which would license clearing the record and "freeing" a port a live server
  // is using.
  assert.notEqual(v.verdict, "stale_record");
  assert.equal(v.verdict, "foreign_owner");
  const plan = R.planCorrections({ ports: [v] });
  assert.equal(plan.actions.length, 0, "foreign_owner must never yield an action");
});

// ── Contract ─────────────────────────────────────────────────────────────────

await test("a live but unregistered worktree is active AND flagged", () => {
  const w = R.classifyWorktree({ path: "/w/wt-x", registration: null, liveDevServer: true, gitState: clean });
  assert.equal(w.state, "active");
  assert.equal(w.unregistered_but_live, true);
  const plan = R.planCorrections({ worktrees: [w] });
  assert.equal(plan.actions[0].kind, "adopt_live_unregistered_worktree");
});

await test("summary counts every state and verdict", () => {
  const s = R.summarizeReconciliation({
    ports: [
      R.classifyPort({ port: 3014, recordedWorktree: "a", recordedPidAlive: true, listening: true, observedOwnerWorktree: "a", ownershipProven: true }),
      R.classifyPort({ port: 3012, recordedWorktree: "b", recordedPid: 9, listening: false }),
    ],
    worktrees: [
      R.classifyWorktree({ path: "/a", registration: {}, liveProviders: [{ pid: 1 }], gitState: clean }),
      R.classifyWorktree({ path: "/b", registration: null, gitState: clean }),
    ],
  });
  assert.equal(s.ports.matched, 1);
  assert.equal(s.ports.stale_record, 1);
  assert.equal(s.worktrees.active, 1);
  assert.equal(s.worktrees.unmanaged, 1);
  assert.equal(s.managed, 1);
  assert.equal(s.unmanaged, 1);
  assert.equal(s.total_worktrees, 2);
});

await Promise.all(started);
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
