#!/usr/bin/env node
/**
 * ONE LANE OWNS ONE WORKTREE FOR THE LIFETIME OF THE LANE.
 *
 * A lane runs many Execution Runs. Finishing a run — or releasing the capacity
 * a run was using — must NOT retire the lane's worktree. The worktree is the
 * lane's execution home: it anchors the branch, the registration, the slot, the
 * port, the managed QA identity, the browser session and the retained work.
 * Those are not rebuilt between missions.
 *
 * THE INCIDENT THIS LOCKS OUT. lane_73a897409906 (Runtime Performance) released
 * execution capacity at 2026-09-01T23:43:22.454Z. Five seconds later
 * wt1-work-unit-grade-a carried ALLOY_WORKER_LIFECYCLE="finished" and its
 * metadata had been archived to finished/. The lane stayed OPEN and kept
 * accepting instructions, so the fleet held an active lane whose worktree was
 * unmanaged, unknown, slot-less and port-less — and every managed environment
 * operation for that lane failed.
 *
 * The cause was a scope confusion, not a bug in the retirement itself:
 * releaseLaneExecutionCapacity (capacity lifetime) called alloy-sprint-finish
 * (worktree lifetime). lane-execution-capacity's own header already promised
 * "Does not delete the durable lane, worktree, or branch" — true of the lane
 * record, false of the registration.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-lane-lifetime-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const {
  releaseLaneExecutionCapacity,
  setReleaseImplForTests,
  resetReleaseImplForTests,
} = await import("../lib/vacilando/lane-execution-capacity.mjs");
const {
  createDurableLane,
  bindDurableLane,
  getDurableLane,
  resetDevelopmentLanesForTests,
} = await import("../lib/vacilando/development-lane.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetDevelopmentLanesForTests(ROOT);
  resetReleaseImplForTests();
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** Records every lifecycle side effect the release path attempts. */
function trackRelease() {
  const calls = { finish: [], stop: [], endSession: [], checkpoint: [] };
  setReleaseImplForTests({
    inspectGit: () => ({ ok: true, dirty: false, conflict: false, ahead: 0, behind: 0 }),
    checkpoint: (a) => { calls.checkpoint.push(a); return { ok: true, created: false }; },
    endSession: (a) => { calls.endSession.push(a); return { ok: true }; },
    stopSession: ({ tmuxSession }) => { calls.stop.push(tmuxSession); return { ok: true }; },
    finishSprint: ({ slot }) => { calls.finish.push(slot); return { ok: true }; },
    evaluateAdmissionQueue: () => ({ ok: true }),
  });
  return calls;
}

function seedLane(name, { slot = 1, tmux = "alloy-runtime-performance" } = {}) {
  const made = createDurableLane({ name, root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const path = join(ROOT, "Code", "alloy-worktrees", "wt1-work-unit-grade-a");
  mkdirSync(path, { recursive: true });
  bindDurableLane(laneId, {
    type: "alloy_local",
    worktree_path: path,
    worktree_name: "wt1-work-unit-grade-a",
    branch: "agent/claude/5-work-unit-grade-a",
    tmux_session: tmux,
    slot,
    provider: "claude",
  }, { root: ROOT });
  return { laneId, path };
}

await test("releasing capacity does NOT retire the lane's worktree registration", async () => {
  const calls = trackRelease();
  const { laneId, path } = seedLane("Runtime Performance");
  const out = await releaseLaneExecutionCapacity(laneId, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  // The exact regression: alloy-sprint-finish archives the metadata and marks
  // the slot available. A capacity release may never reach it.
  assert.deepEqual(calls.finish, [], "capacity release must not run sprint-finish");
  // Processes still stop — that IS what releasing capacity means.
  assert.deepEqual(calls.stop, ["alloy-runtime-performance"]);
  // And the lane keeps its worktree.
  const kept = getDurableLane(laneId, ROOT);
  assert.equal(kept.binding.worktree_path, path, "the lane keeps its worktree");
  assert.equal(kept.binding.worktree_name, "wt1-work-unit-grade-a");
  assert.equal(kept.binding.branch, "agent/claude/5-work-unit-grade-a");
});

await test("the lane survives many runs: release twice, same worktree both times", async () => {
  trackRelease();
  const { laneId, path } = seedLane("Runtime Performance");
  await releaseLaneExecutionCapacity(laneId, { root: ROOT });
  const afterFirst = getDurableLane(laneId, ROOT);
  assert.equal(afterFirst.binding.worktree_path, path);

  // A later run rebinds the SAME worktree — no second worktree is created.
  bindDurableLane(laneId, {
    ...afterFirst.binding,
    tmux_session: "alloy-runtime-performance",
    slot: 1,
  }, { root: ROOT });
  await releaseLaneExecutionCapacity(laneId, { root: ROOT });
  const afterSecond = getDurableLane(laneId, ROOT);
  assert.equal(afterSecond.binding.worktree_path, path, "run 2 uses the same worktree");
  assert.equal(afterSecond.binding.worktree_name, "wt1-work-unit-grade-a");
});

await test("the lane record itself is never deleted by a capacity release", async () => {
  trackRelease();
  const { laneId } = seedLane("Runtime Performance");
  const out = await releaseLaneExecutionCapacity(laneId, { root: ROOT });
  assert.equal(out.lane_deleted, false);
  const kept = getDurableLane(laneId, ROOT);
  assert.ok(kept, "the durable lane survives");
  assert.equal(kept.name, "Runtime Performance");
  assert.equal(kept.execution_capacity.state, "IDLE", "capacity is idle, not finished");
});

await test("idle is a NONTERMINAL state — the lane can still be used", async () => {
  trackRelease();
  const { laneId } = seedLane("Runtime Performance");
  await releaseLaneExecutionCapacity(laneId, { root: ROOT });
  const kept = getDurableLane(laneId, ROOT);
  // The vocabulary matters: a released lane is IDLE, never "finished" or
  // "closed". Only explicit lane closure is terminal.
  assert.equal(kept.execution_capacity.state, "IDLE");
  assert.notEqual(kept.execution_capacity.state, "FINISHED");
  assert.notEqual(kept.status, "CLOSED");
  assert.equal(kept.status, "ACTIVE", "the lane remains open for the next run");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
