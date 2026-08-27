#!/usr/bin/env node
/**
 * Source-control governor: posture, explicit checkpoint, conservative sync.
 * Isolated. Fake Git. Does not push, merge, or promote.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDurableLane, resetDevelopmentLanesForTests } from "../lib/vacilando/development-lane.mjs";
import { createQueuedRun, patchRunFields, resetExecutionRunsForTests, transitionExecutionRun } from "../lib/vacilando/execution-run.mjs";
import {
  DURABILITY_PUSH_POLICY,
  PROMOTION_POLICY,
  SCM_POLICY,
  attachLaneSourceControl,
  deriveSourceControlPosture,
  laneNeedsGitSync,
  maybeCreateCheckpoint,
  maybeSyncFromBase,
  resetSourceControlForTests,
  setSourceControlImplForTests,
  validCheckpointMessage,
} from "../lib/vacilando/source-control.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "vac-scm-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

function reset() {
  resetDevelopmentLanesForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  resetSourceControlForTests(ROOT);
}

function laneWithGit(git) {
  const path = join(ROOT, `wt-${Math.random().toString(16).slice(2, 8)}`);
  mkdirSync(path, { recursive: true });
  return createDurableLane({
    name: "Records / Roster",
    origin: "created",
    binding: { worktree_path: path, worktree_name: "wt-records", branch: "agent/claude/2-records", provider: "claude" },
    root: ROOT,
  }).lane;
}

await test("Git posture derived correctly", () => {
  assert.equal(deriveSourceControlPosture({ git: { state: "clean", ahead: 0, behind: 0 } }).posture, "CURRENT");
  assert.equal(deriveSourceControlPosture({ git: { state: "dirty", behind: 0 }, run: { checkpoint_ready: true } }).posture, "CHECKPOINT_DUE");
  assert.equal(deriveSourceControlPosture({ git: { state: "clean", behind: 22 } }).posture, "SYNC_RECOMMENDED");
  assert.equal(deriveSourceControlPosture({ git: { state: "clean", behind: 60 } }).posture, "SYNC_REQUIRED");
  assert.equal(deriveSourceControlPosture({ git: { state: "conflict", conflict: true } }).posture, "CONFLICT");
  assert.equal(deriveSourceControlPosture({ git: { state: "clean", ahead: 0, behind: 0 } }).posture !== "PROMOTION_READY", true);
});

await test("safe checkpoint requires explicit checkpoint_ready", async () => {
  reset();
  const rec = laneWithGit();
  const run = createQueuedRun({ laneId: rec.lane_id, instruction: "implement", worktreePath: rec.binding.worktree_path, root: ROOT });
  transitionExecutionRun(run.run.run_id, "EXECUTING", { root: ROOT });
  setSourceControlImplForTests({
    inspectGit: () => ({ dirty: true, conflict: false }),
    commitCheckpoint: async () => ({ ok: true, sha: "abc" }),
    evaluateSafeCheckpoint: () => ({ ok: true, blockers: [] }),
  });
  // A checkpoint with no path manifest is refused outright. This gate comes
  // first because it is the one whose absence let `git add -A` commit 67
  // unrelated files: without named paths there is no authorization to commit
  // anything, however explicit the request was.
  const noManifest = await maybeCreateCheckpoint({ laneId: rec.lane_id, summary: "feat(records): add roster filter", root: ROOT });
  assert.equal(noManifest.error, "checkpoint_requires_manifest");

  const skipped = await maybeCreateCheckpoint({ laneId: rec.lane_id, summary: "feat(records): add roster filter", paths: ["web/x.ts"], root: ROOT });
  assert.equal(skipped.error, "checkpoint_not_explicit");
  patchRunFields(run.run.run_id, { checkpoint_ready: true, checkpoint_summary: "feat(records): add roster filter" }, { root: ROOT });
  const made = await maybeCreateCheckpoint({ laneId: rec.lane_id, summary: "feat(records): add roster filter", paths: ["web/x.ts"], root: ROOT });
  assert.equal(made.ok, true);
  assert.equal(made.pushed, false);
  assert.equal(made.message, "feat(records): add roster filter");
});

await test("does not commit conflict or garbage messages", async () => {
  reset();
  const rec = laneWithGit();
  const run = createQueuedRun({ laneId: rec.lane_id, instruction: "x", worktreePath: rec.binding.worktree_path, root: ROOT });
  transitionExecutionRun(run.run.run_id, "EXECUTING", { root: ROOT });
  patchRunFields(run.run.run_id, { checkpoint_ready: true, checkpoint_summary: "checkpoint" }, { root: ROOT });
  setSourceControlImplForTests({
    inspectGit: () => ({ dirty: true, conflict: true }),
    commitCheckpoint: async () => ({ ok: true, sha: "nope" }),
    evaluateSafeCheckpoint: () => ({ ok: true, blockers: [] }),
  });
  const conflicted = await maybeCreateCheckpoint({ laneId: rec.lane_id, summary: "feat(ok): real message here", paths: ["web/x.ts"], root: ROOT });
  assert.equal(conflicted.error, "conflict");
  assert.equal(validCheckpointMessage("checkpoint"), false);
  assert.equal(validCheckpointMessage("auto commit"), false);
  assert.equal(validCheckpointMessage("feat(comms): converge provider ingress"), true);
});

await test("dirty mid-phase is left alone", async () => {
  reset();
  const rec = laneWithGit();
  const run = createQueuedRun({ laneId: rec.lane_id, instruction: "mid", worktreePath: rec.binding.worktree_path, root: ROOT });
  transitionExecutionRun(run.run.run_id, "EXECUTING", { root: ROOT });
  const derived = deriveSourceControlPosture({
    git: { state: "dirty", behind: 0, modified: 3 },
    run: { state: "EXECUTING", checkpoint_ready: false },
  });
  assert.equal(derived.posture, "CURRENT");
  let commits = 0;
  setSourceControlImplForTests({
    inspectGit: () => ({ dirty: true, conflict: false }),
    commitCheckpoint: async () => { commits += 1; return { ok: true, sha: "x" }; },
    evaluateSafeCheckpoint: () => ({ ok: true, blockers: [] }),
  });
  await maybeCreateCheckpoint({ laneId: rec.lane_id, root: ROOT });
  assert.equal(commits, 0);
});

await test("conflict-free sync only when clean and not mid-validation", async () => {
  reset();
  const rec = laneWithGit();
  const run = createQueuedRun({ laneId: rec.lane_id, instruction: "sync", worktreePath: rec.binding.worktree_path, root: ROOT });
  transitionExecutionRun(run.run.run_id, "EXECUTING", { root: ROOT });
  let synced = 0;
  setSourceControlImplForTests({
    inspectGit: () => ({ dirty: true, conflict: false }),
    syncWorktree: async () => { synced += 1; return { ok: true }; },
  });
  const dirty = await maybeSyncFromBase({ laneId: rec.lane_id, root: ROOT });
  assert.equal(dirty.skipped, true);
  setSourceControlImplForTests({
    inspectGit: () => ({ dirty: false, conflict: false }),
    syncWorktree: async () => { synced += 1; return { ok: true }; },
  });
  const ok = await maybeSyncFromBase({ laneId: rec.lane_id, root: ROOT });
  assert.equal(ok.ok, true);
  assert.equal(synced, 1);
});

await test("semantic conflict is needs_input and not auto-resolved", async () => {
  reset();
  const rec = laneWithGit();
  setSourceControlImplForTests({
    inspectGit: () => ({ dirty: false, conflict: false }),
    syncWorktree: async () => ({ ok: false, conflict: true, error: "conflict" }),
  });
  const out = await maybeSyncFromBase({ laneId: rec.lane_id, root: ROOT });
  assert.equal(out.needs_input, true);
  assert.equal(out.error, "conflict");
});

await test("durability push and promotion stay operator-gated", () => {
  assert.equal(DURABILITY_PUSH_POLICY.automatic, false);
  assert.equal(PROMOTION_POLICY.automatic, false);
  assert.equal(SCM_POLICY.auto_push, false);
  assert.equal(SCM_POLICY.auto_promote, false);
  assert.equal(SCM_POLICY.checkpoint_requires_explicit, true);
  const attached = attachLaneSourceControl([{
    lane_id: "lane_aaaaaaaaaaaa",
    git: { state: "clean", ahead: 4, behind: 0, branch: "agent/x" },
    execution_run: { state: "COMPLETE" },
  }], ROOT);
  assert.equal(attached[0].source_control.posture, "CURRENT");
  assert.equal(attached[0].source_control.promotion_ready, false);
  assert.equal(attached[0].source_control.durability_push, "operator_gated");
});

await test("resource wait dirty without explicit ready is not committed", async () => {
  reset();
  const rec = laneWithGit();
  const run = createQueuedRun({ laneId: rec.lane_id, instruction: "wait", worktreePath: rec.binding.worktree_path, root: ROOT });
  transitionExecutionRun(run.run.run_id, "EXECUTING", { root: ROOT });
  transitionExecutionRun(run.run.run_id, "WAITING_RESOURCE", { root: ROOT, resource_wait: { key: "browser_certification" } });
  const posture = deriveSourceControlPosture({
    git: { state: "dirty", behind: 0, modified: 4 },
    run: { state: "WAITING_RESOURCE", checkpoint_ready: false },
  });
  assert.equal(posture.posture, "CHECKPOINT_DUE");
  assert.equal(posture.explicit, false);
  let commits = 0;
  setSourceControlImplForTests({
    inspectGit: () => ({ dirty: true }),
    commitCheckpoint: async () => { commits += 1; return { ok: true, sha: "z" }; },
    evaluateSafeCheckpoint: () => ({ ok: true, blockers: [] }),
  });
  // Without a manifest it is refused for that reason; with one, the
  // explicitness gate is what holds. Both refuse, and neither commits.
  assert.equal((await maybeCreateCheckpoint({ laneId: rec.lane_id, root: ROOT })).error, "checkpoint_requires_manifest");
  const out = await maybeCreateCheckpoint({ laneId: rec.lane_id, paths: ["web/x.ts"], root: ROOT });
  assert.equal(out.error, "checkpoint_not_explicit");
  assert.equal(commits, 0);
});

await test("Git merge/ancestry: active diverged, clean active, completed merged, stale worktree, unknown", () => {
  assert.equal(deriveSourceControlPosture({ git: { state: "clean", ahead: 2, behind: 88 } }).posture, "SYNC_REQUIRED");
  assert.equal(deriveSourceControlPosture({ git: { state: "clean", ahead: 0, behind: 0 } }).posture, "CURRENT");
  assert.equal(deriveSourceControlPosture({
    git: { state: "clean", ahead: 0, behind: 88, head_in_base: true },
    lane: { previous_run: { state: "COMPLETE" }, execution_run: null },
  }).posture, "MERGED");
  assert.equal(deriveSourceControlPosture({
    git: { state: "clean", ahead: 0, behind: 204 },
    lane: { previous_run: { state: "COMPLETE" }, execution_run: null, agent_session: { state: "IDLE" } },
  }).posture, "MERGED");
  assert.equal(deriveSourceControlPosture({ git: { state: "unknown" } }).posture, "UNKNOWN");
  assert.equal(laneNeedsGitSync({ execution_run: { state: "EXECUTING" } }), true);
  assert.equal(laneNeedsGitSync({ previous_run: { state: "COMPLETE" } }), false);
  const attached = attachLaneSourceControl([{
    lane_id: "lane_bbbbbbbbbbbb",
    git: { state: "clean", ahead: 0, behind: 88, head_in_base: true, branch: "agent/old" },
    previous_run: { state: "COMPLETE" },
  }], ROOT);
  assert.equal(attached[0].source_control.posture, "MERGED");
  assert.equal(attached[0].source_control.scheduled_sync, false);
});

rmSync(ROOT, { recursive: true, force: true });
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
