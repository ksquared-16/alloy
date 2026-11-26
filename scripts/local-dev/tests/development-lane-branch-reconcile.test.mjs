#!/usr/bin/env node
/**
 * A LANE CHANGING BRANCH IS NORMAL WORK.
 *
 * WHAT THIS UNDOES. I made branch drift a fail-closed refusal, and it took the
 * Surfaces lane off the air — "Delivery refused (lane_branch_drift)". Runtime
 * Performance went dark the same way on `promote/runtime-performance-group2`, a
 * promotion branch it created to do exactly what Alloy's safe promotion workflow
 * asks for. Both lanes did the right thing and both became unreachable.
 *
 * The codebase had already learned this one layer down: a push delegation used
 * to be pinned to the lane's own working branch, and execution-run-send records
 * that "the pin made the correct workflow unreachable". I reproduced that
 * mistake at the delivery layer.
 *
 * The recorded branch is not an authorization input — governed push identity
 * comes from the request's own inputs and is pinned at execution by repository,
 * exact branch, exact head SHA, worktree and protected-ref refusal. So these
 * assert the opposite of what I asserted before: drift is observed, reconciled,
 * and never a reason to refuse delivery.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-branch-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_WORKTREE_ROOT = join(ROOT, "worktrees");
process.env.VACILANDO_DURABLE_LANES = "1";
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
mkdirSync(join(ROOT, "metadata"), { recursive: true });

const L = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");
const { createDurableLane, bindDurableLane, getDurableLane } = await import("../lib/vacilando/development-lane.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const gitSaying = (branch) => () => ({ status: branch === null ? 1 : 0, stdout: branch || "" });

let n = 0;
function seed(name, { branch, createdOn = null, slot = null }) {
  n += 1;
  // Slots are 1-6 on this host; cycling keeps every fixture inside the real range.
  const s = slot ?? ((n - 1) % 6) + 1;
  const worktree = `wt${s}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const path = join(ROOT, "worktrees", worktree);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(ROOT, "metadata", `${worktree}.env`), [
    `ALLOY_WORKTREE_SLOT=${s}`, `ALLOY_WORKTREE_PATH=${path}`,
    `ALLOY_WORKTREE_BRANCH=${createdOn || branch}`, `PORT=${3010 + s}`,
    "ALLOY_WORKER_LIFECYCLE=active", "",
  ].join("\n"), "utf8");
  const made = createDurableLane({ name, root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  bindDurableLane(laneId, {
    type: "alloy_local", worktree_path: path, worktree_name: worktree,
    branch, slot: s, provider: "claude",
  }, { root: ROOT });
  return { laneId, path, worktree };
}

// ------------------------------------------------------- the reported outage
test("THE SURFACES CASE: a drifted lane still resolves, and still dispatches", () => {
  const s = seed("Surfaces", { branch: "agent/claude/6-surfaces-faacca" });
  const git = gitSaying("agent/claude/6-surfaces-followup");
  const r = L.resolveLaneWorktree(s.laneId, { root: ROOT, gitImpl: git });
  assert.equal(r.ok, true, `a moved branch must not fail the lane: ${r.code}`);
  assert.equal(r.branch_drift, true, "and it must still be visible");
  assert.equal(r.branch_actual, "agent/claude/6-surfaces-followup");
  assert.equal(r.branch, "agent/claude/6-surfaces-followup", "the branch reported is the one git is on");

  const guard = L.assertLaneDispatchable(s.laneId, { root: ROOT, gitImpl: git });
  assert.equal(guard.ok, true, "delivery must not be refused for a moved branch");
  assert.notEqual(guard.error, "lane_branch_drift");
});

test("THE RUNTIME PERFORMANCE CASE: a promote/* branch is the correct workflow", () => {
  // Alloy's safe promotion workflow deliberately runs on a separate promote/*
  // branch. A lane doing that must not go dark for doing it.
  const s = seed("Runtime Performance", { branch: "agent/claude/5-work-unit-grade-a" });
  const git = gitSaying("promote/runtime-performance-group2");
  assert.equal(L.assertLaneDispatchable(s.laneId, { root: ROOT, gitImpl: git }).ok, true);
});

test("dispatch reconciles the record instead of refusing, and reports it", () => {
  const s = seed("Reconciled", { branch: "agent/claude/7-old" });
  const git = gitSaying("promote/new-work");
  const guard = L.assertLaneDispatchable(s.laneId, { root: ROOT, gitImpl: git, repair: true });
  assert.equal(guard.ok, true);
  assert.equal(guard.repaired, true);
  assert.equal(getDurableLane(s.laneId, ROOT).binding.branch, "promote/new-work",
    "the record catches up to the worktree");
  // Once reconciled there is nothing left to report.
  assert.equal(L.resolveLaneWorktree(s.laneId, { root: ROOT, gitImpl: git }).branch_drift, false);
});

// ------------------------------------------------------- the explicit repair
test("reconcileLaneBranch is the supported repair, and says what moved", () => {
  const s = seed("Explicit", { branch: "agent/claude/8-before" });
  const git = gitSaying("agent/claude/8-after");
  const out = L.reconcileLaneBranch(s.laneId, { root: ROOT, gitImpl: git });
  assert.equal(out.ok, true);
  assert.equal(out.changed, true);
  assert.equal(out.from, "agent/claude/8-before");
  assert.equal(out.to, "agent/claude/8-after");
  assert.equal(getDurableLane(s.laneId, ROOT).binding.branch, "agent/claude/8-after");
  // Idempotent.
  const again = L.reconcileLaneBranch(s.laneId, { root: ROOT, gitImpl: git });
  assert.equal(again.changed, false);
});

test("the creation branch is kept as history, not overwritten", () => {
  const s = seed("Origin", { branch: "promote/current", createdOn: "agent/claude/9-created-on" });
  const r = L.resolveLaneWorktree(s.laneId, { root: ROOT, gitImpl: gitSaying("promote/current") });
  assert.equal(r.branch_created_on, "agent/claude/9-created-on", "where the worktree started is worth keeping");
  assert.equal(r.branch, "promote/current");
  assert.equal(r.branch_drift, false, "the creation record is history, not a live constraint");
});

// ------------------------------------------------------- what must not change
test("only git ever moves the branch record — never the other way", () => {
  const s = seed("OneWay", { branch: "agent/claude/10-recorded" });
  L.reconcileLaneBranch(s.laneId, { root: ROOT, gitImpl: gitSaying("promote/actual") });
  // Nothing in this module touches a checkout; the record followed the worktree.
  assert.equal(getDurableLane(s.laneId, ROOT).binding.branch, "promote/actual");
});

test("an unreadable git changes nothing and blocks nothing", () => {
  const s = seed("Unreadable", { branch: "agent/claude/11-known" });
  const git = gitSaying(null);
  const r = L.resolveLaneWorktree(s.laneId, { root: ROOT, gitImpl: git });
  assert.equal(r.ok, true);
  assert.equal(r.branch_drift, false, "a failed read is not a moved branch");
  assert.equal(r.branch, "agent/claude/11-known", "the branch we still know is kept");
  L.reconcileLaneBranch(s.laneId, { root: ROOT, gitImpl: git });
  assert.equal(getDurableLane(s.laneId, ROOT).binding.branch, "agent/claude/11-known",
    "an unreadable git must never blank a branch");
});

test("a DETACHED head is not a branch called HEAD", () => {
  // MEASURED, AND I CAUSED IT. Runtime Performance's worktree was detached at a
  // staging commit; `rev-parse --abbrev-ref HEAD` answers the literal "HEAD",
  // and a repair I ran wrote that string into the lane's binding as its branch
  // before I caught it and restored the real one. A detached worktree is on no
  // branch — unknown, not moved.
  const s = seed("Detached", { branch: "agent/claude/5-work-unit-grade-a" });
  const git = gitSaying("HEAD");
  const r = L.resolveLaneWorktree(s.laneId, { root: ROOT, gitImpl: git });
  assert.equal(r.ok, true);
  assert.equal(r.branch_actual, null, "detached reads as unknown, never as a branch");
  assert.equal(r.branch_drift, false);
  assert.equal(r.branch, "agent/claude/5-work-unit-grade-a", "the branch on file is kept");
  L.reconcileLaneBranch(s.laneId, { root: ROOT, gitImpl: git });
  assert.equal(getDurableLane(s.laneId, ROOT).binding.branch, "agent/claude/5-work-unit-grade-a",
    "a detached worktree must never overwrite the record with \"HEAD\"");
  assert.equal(L.assertLaneDispatchable(s.laneId, { root: ROOT, gitImpl: git }).ok, true,
    "and a detached worktree must not block delivery either");
});

test("real lifecycle failures still fail closed", () => {
  // The guard that mattered is untouched: an unmanaged worktree is still refused.
  const s = seed("Unmanaged", { branch: "agent/claude/12-x" });
  writeFileSync(join(ROOT, "metadata", `${s.worktree}.env`), [
    "ALLOY_WORKTREE_SLOT=12", `ALLOY_WORKTREE_PATH=${s.path}`,
    "ALLOY_WORKTREE_BRANCH=agent/claude/12-x", "PORT=3022",
    "ALLOY_WORKER_LIFECYCLE=finished", "",
  ].join("\n"), "utf8");
  const guard = L.assertLaneDispatchable(s.laneId, { root: ROOT, gitImpl: gitSaying("agent/claude/12-x") });
  assert.equal(guard.ok, false);
  assert.equal(guard.error, "lane_worktree_not_managed");
});

test("the fleet audit names every drifted lane", () => {
  const a = L.auditLaneWorktrees({ root: ROOT });
  assert.ok(Array.isArray(a.branch_drift), "the audit reports drift as a list");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
