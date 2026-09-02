#!/usr/bin/env node
/**
 * LIFECYCLE TRUTH BEFORE CAPACITY TUNING.
 *
 * The host baseline audit found the control plane counting things that were not
 * real. Every case here is one of those, reproduced:
 *
 *  D1  Port 3013 was held for seventeen hours by a PPID-1 fixture —
 *      node -e ...s.end("ok") — started with its cwd inside the lane's
 *      worktree. Ownership was proven by LOCATION, so it read as the lane's
 *      running Next server, consumed one of three server slots, and refused a
 *      real lane its dev server. Being in the right directory is not being the
 *      right process.
 *  D3  The Surfaces lane binding and its registration both said
 *      `agent/claude/6-surfaces-faacca`; the worktree was on
 *      `agent/claude/6-surfaces-followup`. Path, slot and lifecycle agreed, so
 *      the resolver said OK — it had never been told to look at the branch.
 *  D5  wt2-fixture-two held slot 2 and port 3912 while its directory had not
 *      existed for days, and no canonical command could remove it.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-host-truth-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_WORKTREE_ROOT = join(ROOT, "worktrees");
process.env.VACILANDO_DURABLE_LANES = "1";
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
mkdirSync(join(ROOT, "metadata"), { recursive: true });

const L = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");
const { createDurableLane, bindDurableLane } = await import("../lib/vacilando/development-lane.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

function register(name, { slot, path, branch, lifecycle = "active" }) {
  writeFileSync(join(ROOT, "metadata", `${name}.env`), [
    `ALLOY_WORKTREE_SLOT=${slot ?? ""}`,
    `ALLOY_WORKTREE_PATH=${path}`,
    `ALLOY_WORKTREE_BRANCH=${branch}`,
    `PORT=${slot ? 3010 + Number(slot) : ""}`,
    `ALLOY_WORKER_LIFECYCLE=${lifecycle}`,
    "",
  ].join("\n"), "utf8");
}
function seed(name, { slot, worktree, branch, makeDir = true }) {
  const made = createDurableLane({ name, root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const path = join(ROOT, "worktrees", worktree);
  if (makeDir) mkdirSync(path, { recursive: true });
  bindDurableLane(laneId, {
    type: "alloy_local", worktree_path: path, worktree_name: worktree,
    branch, slot, provider: "claude",
  }, { root: ROOT });
  register(worktree, { slot, path, branch });
  return { laneId, path, worktree };
}
/** A git stand-in, so branch truth is testable without a repository. */
const gitSaying = (branch) => () => ({ status: branch === null ? 1 : 0, stdout: branch || "" });

// ---------------------------------------------------------------- D3: branch
test("D3: matching branch identity passes", () => {
  const s = seed("Surfaces OK", { slot: 6, worktree: "wt6-ok", branch: "agent/claude/6-surfaces" });
  const r = L.resolveLaneWorktree(s.laneId, { root: ROOT, gitImpl: gitSaying("agent/claude/6-surfaces") });
  assert.equal(r.ok, true, r.code);
  assert.equal(r.branch_expected, "agent/claude/6-surfaces");
  assert.equal(r.branch_actual, "agent/claude/6-surfaces");
});

test("D3: a drifted branch is OBSERVED, not refused", () => {
  // THIS ASSERTION IS INVERTED FROM WHAT IT ORIGINALLY SAID, DELIBERATELY.
  //
  // It used to require `ok: false` and `lane_branch_drift`. That refusal took
  // the Surfaces lane off the air — "Delivery refused (lane_branch_drift)" — and
  // Runtime Performance with it, on a promote/* branch it created to follow the
  // safe promotion workflow. Both lanes did the right thing and both became
  // unreachable. The recorded branch is display and expectation, not an
  // authorization input; drift is the record trailing the worktree.
  //
  // What survives is the part that was worth having: the mismatch is visible,
  // named on both sides, and reconcilable. See
  // development-lane-branch-reconcile.test.mjs for the full contract.
  const s = seed("Surfaces drift", { slot: 5, worktree: "wt5-drift", branch: "agent/claude/6-surfaces-faacca" });
  const r = L.resolveLaneWorktree(s.laneId, { root: ROOT, gitImpl: gitSaying("agent/claude/6-surfaces-followup") });
  assert.equal(r.ok, true, "a moved branch is not a lifecycle failure");
  assert.equal(r.branch_drift, true, "and it is still visible");
  assert.equal(r.branch_expected, "agent/claude/6-surfaces-faacca");
  assert.equal(r.branch_actual, "agent/claude/6-surfaces-followup");
  assert.equal(r.branch, "agent/claude/6-surfaces-followup", "the branch reported is git's answer");
});

test("D3: branch drift does not block dispatch", () => {
  const s = seed("Drifted", { slot: 4, worktree: "wt4-drift", branch: "agent/claude/4-a" });
  const opts = { root: ROOT, gitImpl: gitSaying("agent/claude/4-b") };
  assert.equal(L.assertLaneDispatchable(s.laneId, opts).ok, true);
  assert.notEqual(L.resolveLaneWorktree(s.laneId, opts).code, "lane_branch_drift");
});

test("D3: spelling differences are not drift", () => {
  const s = seed("Refs", { slot: 3, worktree: "wt3-refs", branch: "agent/claude/3-x" });
  const r = L.resolveLaneWorktree(s.laneId, { root: ROOT, gitImpl: gitSaying("refs/heads/agent/claude/3-x") });
  assert.equal(r.ok, true, r.code);
  assert.equal(r.branch_drift, false, "one branch spelled two ways is one branch");
});

test("D3: an unreadable branch is not asserted to be drift", () => {
  // git failing is not evidence that the branch changed. Fail-closed must not
  // mean fail-noisy on a transient read.
  const s = seed("Unreadable", { slot: 2, worktree: "wt2-unread", branch: "agent/claude/2-x" });
  const r = L.resolveLaneWorktree(s.laneId, { root: ROOT, gitImpl: gitSaying(null) });
  assert.equal(r.branch_drift, false, "a failed read is not a moved branch");
  assert.equal(r.branch_actual, null);
});

// ------------------------------------------------------- D5/D6: registrations
test("D5: a registration whose worktree is gone is the only cleanup candidate", () => {
  rmSync(join(ROOT, "metadata"), { recursive: true, force: true });
  mkdirSync(join(ROOT, "metadata"), { recursive: true });
  const live = seed("Live", { slot: 1, worktree: "wt1-live", branch: "agent/claude/1-live" });
  register("wt2-fixture-two", { slot: 2, path: join(ROOT, "worktrees", "gone-forever"), branch: "agent/cursor/2-fixture" });

  const c = L.classifyRegistrations({ root: ROOT });
  assert.equal(c.ok, true);
  const by = Object.fromEntries(c.registrations.map((r) => [r.worktree, r]));
  assert.equal(by["wt1-live"].class, "active");
  assert.equal(by["wt1-live"].cleanup_candidate, false);
  assert.equal(by["wt2-fixture-two"].class, "stale_missing");
  assert.equal(by["wt2-fixture-two"].cleanup_candidate, true);
  assert.deepEqual(c.candidates.map((x) => x.worktree), ["wt2-fixture-two"]);
  assert.ok(live.path);
});

test("D5: a missing worktree that a lane still owns is NOT a cleanup candidate", () => {
  rmSync(join(ROOT, "metadata"), { recursive: true, force: true });
  mkdirSync(join(ROOT, "metadata"), { recursive: true });
  // Access & Identity's real shape: bound by a live lane, directory gone.
  const s = seed("Owned but absent", { slot: 1, worktree: "wt1-absent", branch: "agent/claude/1-x", makeDir: false });
  const c = L.classifyRegistrations({ root: ROOT });
  const rec = c.registrations.find((r) => r.worktree === "wt1-absent");
  assert.equal(rec.class, "owned");
  assert.equal(rec.cleanup_candidate, false);
  assert.match(rec.reason, /still bound/);
  assert.ok(s.laneId);
});

test("D6: a finished record with no owner is detached history, not garbage", () => {
  rmSync(join(ROOT, "metadata"), { recursive: true, force: true });
  mkdirSync(join(ROOT, "metadata"), { recursive: true });
  register("wt9-finished", {
    slot: 6, path: join(ROOT, "worktrees", "wt9-gone"), branch: "agent/claude/9-x", lifecycle: "finished",
  });
  const c = L.classifyRegistrations({ root: ROOT });
  const rec = c.registrations.find((r) => r.worktree === "wt9-finished");
  assert.equal(rec.class, "detached");
  assert.equal(rec.cleanup_candidate, false);
});

test("D5: the plan changes nothing until apply is asked for", () => {
  rmSync(join(ROOT, "metadata"), { recursive: true, force: true });
  mkdirSync(join(ROOT, "metadata"), { recursive: true });
  register("wt2-stale", { slot: 2, path: join(ROOT, "worktrees", "not-there"), branch: "b" });
  const dry = L.reconcileStaleRegistrations({ root: ROOT });
  assert.equal(dry.applied, false);
  assert.equal(dry.plan.length, 1);
  assert.equal(dry.plan[0].worktree, "wt2-stale");
  assert.ok(dry.plan[0].evidence, "every decision carries its evidence");
  // Still there.
  assert.equal(L.classifyRegistrations({ root: ROOT }).candidates.length, 1);

  const applied = L.reconcileStaleRegistrations({ root: ROOT, apply: true, actor: "operator" });
  assert.equal(applied.applied, true);
  assert.equal(applied.removed.length, 1);
  assert.equal(applied.actor, "operator");
  assert.equal(L.classifyRegistrations({ root: ROOT }).registrations.length, 0);
});

test("D5: a worktree that reappears between plan and apply is refused", () => {
  rmSync(join(ROOT, "metadata"), { recursive: true, force: true });
  mkdirSync(join(ROOT, "metadata"), { recursive: true });
  const back = join(ROOT, "worktrees", "came-back");
  register("wt2-flaky", { slot: 2, path: back, branch: "b" });
  assert.equal(L.reconcileStaleRegistrations({ root: ROOT }).plan.length, 1);
  // The directory returns — a transient read must never cost a live registration.
  mkdirSync(back, { recursive: true });
  const applied = L.reconcileStaleRegistrations({ root: ROOT, apply: true });
  assert.equal(applied.removed.length, 0, "a registration whose worktree came back must survive");
  // Two independent protections: apply re-classifies from scratch, AND each
  // step re-checks the directory at the moment it would act.
  assert.equal(L.classifyRegistrations({ root: ROOT }).registrations.length, 1);
  assert.equal(L.classifyRegistrations({ root: ROOT }).candidates.length, 0);
});

test("D5: an ABSENT registry is refused, never read as an empty one", () => {
  // readAllMetadata returns [] for a directory that does not exist, which at
  // that layer is indistinguishable from "no registrations". Acting on that
  // reading is how a transient filesystem failure becomes a cleanup decision.
  const out = L.classifyRegistrations({
    root: ROOT,
    cfg: { metadata_dir: join(ROOT, "no-such-registry-dir") },
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "registry_unreadable");
  assert.deepEqual(out.registrations, []);
  const rec = L.reconcileStaleRegistrations({
    root: ROOT, apply: true, cfg: { metadata_dir: join(ROOT, "no-such-registry-dir") },
  });
  assert.equal(rec.ok, false);
  assert.equal(rec.applied, false, "an unreadable registry must remove nothing");
});

// ------------------------------------------------------------------ D1 shape
test("D1: the dev-server census reads the canonical classifier, not a copy", () => {
  const out = L.devServerCensus({
    spawn: () => ({
      status: 0,
      stdout: [
        "NAME AGENT BRANCH PORT STATE PID PATH",
        "---",
        "wt1-a claude agent/claude/1 3011 unattributable-owner 999 /w/wt1-a",
        "wt4-b claude agent/claude/4 3014 running 64766 /w/wt4-b",
        "wt2-c cursor agent/cursor/2 3912 missing-worktree - /w/wt2-c",
      ].join("\n"),
    }),
  });
  assert.equal(out.ok, true);
  assert.equal(out.running, 1, "only an attributable server counts toward capacity");
  const names = out.reclaimable.map((s) => s.worktree);
  assert.deepEqual(names, ["wt1-a"], "the fixture is reclaimable; the real server is not");
  assert.equal(out.servers.find((s) => s.worktree === "wt4-b").counts_toward_capacity, true);
  assert.equal(out.servers.find((s) => s.worktree === "wt1-a").counts_toward_capacity, false);
});

test("D1: an unavailable classifier reports unavailable, never zero servers", () => {
  const out = L.devServerCensus({ spawn: () => ({ status: 1, stdout: "" }) });
  assert.equal(out.ok, false);
  assert.equal(out.error, "dev_status_unavailable");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
