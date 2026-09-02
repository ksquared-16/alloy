#!/usr/bin/env node
/**
 * ONE OPEN LANE OWNS ONE DURABLE WORKTREE FOR THE LIFETIME OF THE LANE.
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
 * operation for that lane failed. A governed QA request (gar_97d071ef22861f)
 * was even accepted against a Slot 1 that no longer existed.
 *
 * The cause was a scope confusion: releaseLaneExecutionCapacity (capacity
 * lifetime) called alloy-sprint-finish (worktree lifetime).
 *
 * Removing that call was half the repair. These tests cover the other half:
 * the explicit owner that MAY retire a worktree, the dispatch guard that stops
 * work entering an unmanaged one, the environment preconditions that refuse an
 * impossible governed action, the single slot truth, and the blocked-run rule
 * that keeps NEEDS_INPUT from being swept into FAILED.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-lane-lifetime-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_WORKTREE_ROOT = join(ROOT, "Code", "alloy-worktrees");
process.env.VACILANDO_DURABLE_LANES = "1";
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
mkdirSync(join(ROOT, "metadata"), { recursive: true });

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
const L = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");
const { validateProvisionQaIdentityInputs } = await import("../lib/vacilando/qa-identity-provision-action.mjs");
const { validateAssignQaAccessInputs } = await import("../lib/vacilando/qa-access-assign-action.mjs");
const { validateRestoreQaSessionInputs } = await import("../lib/vacilando/qa-session-restore-action.mjs");
const { transitionExecutionRun, createQueuedRun, getExecutionRun } =
  await import("../lib/vacilando/execution-run.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetDevelopmentLanesForTests(ROOT);
  resetReleaseImplForTests();
  L.resetLaneCloseImplForTests();
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** The managed worktree registration — the file alloy-sprint-start writes. */
function registerWorktree(name, { slot, port = null, path, branch, lifecycle = "" }) {
  writeFileSync(join(ROOT, "metadata", `${name}.env`), [
    `ALLOY_WORKTREE_SLOT=${slot ?? ""}`,
    `ALLOY_WORKTREE_PATH=${path}`,
    `ALLOY_WORKTREE_BRANCH=${branch}`,
    `PORT=${port ?? (slot ? 3010 + Number(slot) : "")}`,
    `ALLOY_AGENT=claude`,
    `ALLOY_WORKER_LIFECYCLE=${lifecycle}`,
    "",
  ].join("\n"), "utf8");
}
function unregisterWorktree(name) {
  try { rmSync(join(ROOT, "metadata", `${name}.env`), { force: true }); } catch { /* */ }
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

function seedLane(name, {
  slot = 1,
  tmux = "alloy-runtime-performance",
  worktree = "wt1-work-unit-grade-a",
  branch = "agent/claude/5-work-unit-grade-a",
  register = true,
  lifecycle = "",
} = {}) {
  const made = createDurableLane({ name, root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const path = join(ROOT, "Code", "alloy-worktrees", worktree);
  mkdirSync(path, { recursive: true });
  bindDurableLane(laneId, {
    type: "alloy_local",
    worktree_path: path,
    worktree_name: worktree,
    branch,
    tmux_session: tmux,
    slot,
    provider: "claude",
  }, { root: ROOT });
  if (register) registerWorktree(worktree, { slot, path, branch, lifecycle });
  else unregisterWorktree(worktree);
  return { laneId, path, worktree };
}

// ---------------------------------------------------------------------------
// A — REUSE. One lane, many runs, one worktree.
// ---------------------------------------------------------------------------

await test("A. releasing capacity does NOT retire the lane's worktree registration", async () => {
  const calls = trackRelease();
  const { laneId, path, worktree } = seedLane("Runtime Performance");
  const out = await releaseLaneExecutionCapacity(laneId, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  // The exact regression: alloy-sprint-finish archives the metadata and marks
  // the slot available. A capacity release may never reach it.
  assert.deepEqual(calls.finish, [], "capacity release must not run sprint-finish");
  // Processes still stop — that IS what releasing capacity means.
  assert.deepEqual(calls.stop, ["alloy-runtime-performance"]);
  // And the lane keeps its worktree, managed, with its slot.
  const kept = getDurableLane(laneId, ROOT);
  assert.equal(kept.binding.worktree_path, path);
  assert.equal(kept.binding.worktree_name, worktree);
  assert.equal(kept.binding.branch, "agent/claude/5-work-unit-grade-a");
  const resolved = L.resolveLaneWorktree(laneId, { root: ROOT });
  assert.equal(resolved.ok, true, resolved.code);
  assert.equal(resolved.managed, true, "the worktree is still managed");
  assert.equal(resolved.slot, 1);
  assert.equal(resolved.port, 3011);
});

await test("A. the lane survives many runs: release twice, same worktree both times", async () => {
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
  assert.equal(L.resolveLaneWorktree(laneId, { root: ROOT }).ok, true);
});

await test("A. the lane record itself is never deleted by a capacity release", async () => {
  trackRelease();
  const { laneId } = seedLane("Runtime Performance");
  const out = await releaseLaneExecutionCapacity(laneId, { root: ROOT });
  assert.equal(out.lane_deleted, false);
  const kept = getDurableLane(laneId, ROOT);
  assert.ok(kept, "the durable lane survives");
  assert.equal(kept.name, "Runtime Performance");
  assert.equal(kept.execution_capacity.state, "IDLE", "capacity is idle, not finished");
});

await test("A. idle is a NONTERMINAL state — the lane can still be used", async () => {
  trackRelease();
  const { laneId } = seedLane("Runtime Performance");
  await releaseLaneExecutionCapacity(laneId, { root: ROOT });
  const kept = getDurableLane(laneId, ROOT);
  // The vocabulary matters: a released lane is IDLE, never "finished" or
  // "closed". Only explicit lane closure is terminal.
  assert.equal(kept.execution_capacity.state, "IDLE");
  assert.notEqual(kept.execution_capacity.state, "FINISHED");
  assert.equal(kept.status, "ACTIVE", "the lane remains open for the next run");
});

// ---------------------------------------------------------------------------
// B / C — THE SOLE RETIREMENT AUTHORITY.
// ---------------------------------------------------------------------------

await test("C. explicit lane close is the ONLY path that retires the worktree", async () => {
  trackRelease();
  const { laneId, worktree } = seedLane("Disposable");
  const finished = [];
  L.setLaneCloseImplForTests({
    releaseCapacity: () => ({ ok: true }),
    finishSprint: ({ slot }) => { finished.push(slot); unregisterWorktree(worktree); return { ok: true }; },
  });
  const out = await L.closeDurableLane(laneId, { root: ROOT, actor: "operator", reason: "mission finished" });
  assert.equal(out.ok, true, out.error);
  assert.deepEqual(finished, [1], "close, and only close, retires the worktree");
  assert.equal(out.worktree_retired, true);
  const closed = getDurableLane(laneId, ROOT);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.binding.slot, null, "a closed lane owns no slot");
  assert.equal(closed.binding.port, null);
  assert.equal(closed.closed_by, "operator");
});

await test("C. a closed lane retires exactly once and accepts no further dispatch", async () => {
  trackRelease();
  const { laneId, worktree } = seedLane("Disposable");
  const finished = [];
  L.setLaneCloseImplForTests({
    releaseCapacity: () => ({ ok: true }),
    finishSprint: ({ slot }) => { finished.push(slot); unregisterWorktree(worktree); return { ok: true }; },
  });
  await L.closeDurableLane(laneId, { root: ROOT });
  const again = await L.closeDurableLane(laneId, { root: ROOT });
  assert.equal(again.ok, true);
  assert.equal(again.already_closed, true, "closing twice retires nothing twice");
  assert.deepEqual(finished, [1]);
  const guard = L.assertLaneDispatchable(laneId, { root: ROOT });
  assert.equal(guard.ok, false, "a closed lane cannot be dispatched into");
  assert.equal(guard.error, "lane_not_open");
});

await test("C. close runs the capacity gates first — it cannot skip them", async () => {
  const { laneId } = seedLane("Dirty");
  L.setLaneCloseImplForTests({
    releaseCapacity: () => ({ ok: false, error: "source_control_gate", detail: "dirty_without_checkpoint" }),
    finishSprint: () => { throw new Error("must not retire a worktree with uncommitted work"); },
  });
  const out = await L.closeDurableLane(laneId, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "source_control_gate");
  assert.equal(out.phase, "capacity_release");
  assert.equal(getDurableLane(laneId, ROOT).status, "ACTIVE", "a refused close leaves the lane open");
});

// ---------------------------------------------------------------------------
// D — DISPATCH GUARD.
// ---------------------------------------------------------------------------

await test("D. dispatch into an unmanaged worktree fails closed and is named", async () => {
  const { laneId, worktree } = seedLane("Runtime Performance");
  // Exactly the incident: registration archived, directory and binding intact.
  registerWorktree(worktree, {
    slot: 1, path: join(ROOT, "Code", "alloy-worktrees", worktree),
    branch: "agent/claude/5-work-unit-grade-a", lifecycle: "finished",
  });
  const guard = L.assertLaneDispatchable(laneId, { root: ROOT });
  assert.equal(guard.ok, false);
  assert.equal(guard.error, "lane_worktree_not_managed");
  assert.match(guard.detail, /Managed worktree registration is required/);
  assert.equal(guard.resolution.managed, false);
});

await test("D. a surviving directory is not ownership", async () => {
  const { laneId, worktree } = seedLane("Runtime Performance", { register: false });
  // The directory exists; the registration does not.
  const guard = L.assertLaneDispatchable(laneId, { root: ROOT });
  assert.equal(guard.ok, false);
  assert.equal(guard.error, "lane_worktree_unregistered");
  unregisterWorktree(worktree);
});

await test("D. a stale binding.worktree_path is not ownership", async () => {
  const { laneId, worktree } = seedLane("Runtime Performance");
  // The slot is registered to a DIFFERENT worktree than the lane is bound to.
  registerWorktree(worktree, {
    slot: 1, path: join(ROOT, "Code", "alloy-worktrees", "wt1-someone-else"),
    branch: "agent/claude/5-work-unit-grade-a",
  });
  const guard = L.assertLaneDispatchable(laneId, { root: ROOT });
  assert.equal(guard.ok, false);
  assert.equal(guard.error, "lane_slot_mismatch");
});

await test("D. dispatch is not a provisioning gate", async () => {
  // A lane that has not been provisioned yet has no worktree to claim. Its send
  // is queued for admission; refusing it would break how lanes come into being.
  const made = createDurableLane({ name: "Brand New", root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const guard = L.assertLaneDispatchable(laneId, { root: ROOT });
  assert.equal(guard.ok, true);
  assert.equal(guard.skipped, "unprovisioned");
});

// ---------------------------------------------------------------------------
// E — ENVIRONMENT PRECONDITIONS.
// ---------------------------------------------------------------------------

await test("E. QA actions refuse an unregistered slot BEFORE a governed action exists", async () => {
  const { laneId, worktree } = seedLane("Runtime Performance");
  registerWorktree(worktree, {
    slot: 1, path: join(ROOT, "Code", "alloy-worktrees", worktree),
    branch: "agent/claude/5-work-unit-grade-a", lifecycle: "finished",
  });
  // gar_97d071ef22861f was accepted in exactly this state and could never run.
  for (const validate of [validateProvisionQaIdentityInputs, validateAssignQaAccessInputs, validateRestoreQaSessionInputs]) {
    const out = validate({ laneId });
    assert.equal(out.ok, false, `${validate.name} must refuse an unmanaged lane`);
    assert.equal(out.error, "lane_worktree_not_managed");
    assert.match(out.detail, /Managed worktree registration is required/);
  }
});

await test("E. QA actions accept a managed, slot-registered lane", async () => {
  const { laneId } = seedLane("Runtime Performance");
  for (const validate of [validateProvisionQaIdentityInputs, validateAssignQaAccessInputs, validateRestoreQaSessionInputs]) {
    const out = validate({ laneId });
    assert.equal(out.ok, true, `${validate.name}: ${out.error} ${out.detail || ""}`);
    assert.equal(out.normalized.laneId, laneId);
  }
});

await test("E. a registered worktree with no slot has no managed environment", async () => {
  const { laneId, worktree } = seedLane("Slotless", { slot: null });
  registerWorktree(worktree, {
    slot: "", path: join(ROOT, "Code", "alloy-worktrees", worktree), branch: "agent/claude/x",
  });
  const env = L.assertManagedLaneEnvironment(laneId, { root: ROOT });
  assert.equal(env.ok, false);
  assert.equal(env.error, "lane_slot_unregistered");
  // But an ordinary instruction is not blocked by the absence of a QA slot.
  assert.equal(L.assertLaneDispatchable(laneId, { root: ROOT }).ok, true);
});

// ---------------------------------------------------------------------------
// F — BLOCKED IS NOT FAILED.
// ---------------------------------------------------------------------------

await test("F. NEEDS_INPUT is nonterminal and cannot be swept into FAILED", () => {
  const { laneId } = seedLane("Waiting");
  const made = createQueuedRun({ laneId, instruction: "do the thing", origin: "operator", root: ROOT });
  const runId = made.run.run_id;
  transitionExecutionRun(runId, "EXECUTING", { origin: "system", root: ROOT });
  const blocked = transitionExecutionRun(runId, "NEEDS_INPUT", {
    reason: "Waiting on a governed merge approval", origin: "agent", root: ROOT,
  });
  assert.equal(blocked.ok, true);
  assert.equal(getExecutionRun(runId, ROOT).state, "NEEDS_INPUT");

  // A background sweep may not turn the blocker into a failure — that is how a
  // run reported its own needs-input reason back as a failure reason.
  for (const origin of ["system", "governor"]) {
    const swept = transitionExecutionRun(runId, "FAILED", {
      reason: "Waiting on a governed merge approval", origin, root: ROOT,
    });
    assert.equal(swept.ok, false, `${origin} must not fail a blocked run`);
    assert.equal(swept.error, "blocked_run_not_failed");
  }
  assert.equal(getExecutionRun(runId, ROOT).state, "NEEDS_INPUT", "still blocked, still alive");
});

await test("F. a blocked run resumes and completes normally", () => {
  const { laneId } = seedLane("Waiting");
  const made = createQueuedRun({ laneId, instruction: "do the thing", origin: "operator", root: ROOT });
  const runId = made.run.run_id;
  transitionExecutionRun(runId, "EXECUTING", { origin: "system", root: ROOT });
  transitionExecutionRun(runId, "NEEDS_INPUT", { reason: "needs a decision", origin: "agent", root: ROOT });
  // The blocker clears.
  const resumed = transitionExecutionRun(runId, "EXECUTING", { reason: "decision answered", origin: "operator", root: ROOT });
  assert.equal(resumed.ok, true);
  const done = transitionExecutionRun(runId, "COMPLETE", { reason: "done", origin: "agent", root: ROOT });
  assert.equal(done.ok, true);
  assert.equal(getExecutionRun(runId, ROOT).state, "COMPLETE");
});

await test("F. an OBSERVED execution failure is still allowed from a blocked state", () => {
  const { laneId } = seedLane("Waiting");
  const made = createQueuedRun({ laneId, instruction: "x", origin: "operator", root: ROOT });
  const runId = made.run.run_id;
  transitionExecutionRun(runId, "EXECUTING", { origin: "system", root: ROOT });
  transitionExecutionRun(runId, "NEEDS_INPUT", { reason: "blocked", origin: "agent", root: ROOT });
  // The worker itself reporting a failure is a report, not a sweep.
  const byAgent = transitionExecutionRun(runId, "FAILED", { reason: "the build died", origin: "agent", root: ROOT });
  assert.equal(byAgent.ok, true, "a worker may report a genuine failure while blocked");
});

await test("F. a governor that OBSERVED a delivery failure may still fail the run", () => {
  const { laneId } = seedLane("Waiting");
  const made = createQueuedRun({ laneId, instruction: "x", origin: "operator", root: ROOT });
  const runId = made.run.run_id;
  transitionExecutionRun(runId, "EXECUTING", { origin: "system", root: ROOT });
  transitionExecutionRun(runId, "NEEDS_INPUT", { reason: "blocked", origin: "agent", root: ROOT });
  const observed = transitionExecutionRun(runId, "FAILED", {
    reason: "cursor_delivery_unavailable", origin: "governor", root: ROOT, execution_failure: true,
  });
  assert.equal(observed.ok, true, "an observed delivery failure is a real failure");
});

// ---------------------------------------------------------------------------
// G — ONE SLOT TRUTH, AND SAFE REPAIR.
// ---------------------------------------------------------------------------

await test("G. registry and binding converge on one slot, registry first", async () => {
  trackRelease();
  const { laneId } = seedLane("Runtime Performance");
  // The exact residual from the repair: the registry says slot 1, the durable
  // binding has forgotten it.
  await releaseLaneExecutionCapacity(laneId, { root: ROOT });
  const store = JSON.parse(readFileSync(join(ROOT, "vacilando", "lanes", "lanes.json"), "utf8"));
  store.lanes[laneId].binding.slot = null;
  store.lanes[laneId].binding.port = null;
  writeFileSync(join(ROOT, "vacilando", "lanes", "lanes.json"), JSON.stringify(store, null, 2));

  const before = L.resolveLaneWorktree(laneId, { root: ROOT });
  assert.equal(before.slot, 1, "the registration is the authority");
  assert.equal(before.slot_source, "worktree_registration");
  assert.deepEqual(before.divergence, [{ field: "slot", binding: null, registry: 1 }]);

  const fixed = L.reconcileLaneSlotBinding(laneId, { root: ROOT });
  assert.equal(fixed.ok, true);
  assert.equal(fixed.changed, true);
  const after = getDurableLane(laneId, ROOT);
  assert.equal(after.binding.slot, 1, "binding now agrees with the registry");
  assert.equal(after.binding.port, 3011);
  assert.deepEqual(L.resolveLaneWorktree(laneId, { root: ROOT }).divergence, []);
});

await test("G. dispatch repairs the unambiguous case and reports the ambiguous one", () => {
  const { laneId } = seedLane("Runtime Performance");
  const store = JSON.parse(readFileSync(join(ROOT, "vacilando", "lanes", "lanes.json"), "utf8"));
  store.lanes[laneId].binding.slot = null;
  writeFileSync(join(ROOT, "vacilando", "lanes", "lanes.json"), JSON.stringify(store, null, 2));
  const repaired = L.assertLaneDispatchable(laneId, { root: ROOT, repair: true });
  assert.equal(repaired.ok, true);
  assert.equal(repaired.repaired, true);
  assert.equal(getDurableLane(laneId, ROOT).binding.slot, 1);

  // Ambiguity is reported, never guessed: the slot names another worktree.
  const other = seedLane("Ambiguous", { slot: 2, worktree: "wt2-other", branch: "agent/claude/2-other", tmux: "alloy-other" });
  registerWorktree("wt2-other", {
    slot: 2, path: join(ROOT, "Code", "alloy-worktrees", "wt2-elsewhere"), branch: "agent/claude/2-other",
  });
  const guard = L.assertLaneDispatchable(other.laneId, { root: ROOT, repair: true });
  assert.equal(guard.ok, false);
  assert.equal(guard.error, "lane_slot_mismatch");
});

// ---------------------------------------------------------------------------
// H — THE REST OF THE FLEET IS UNAFFECTED.
// ---------------------------------------------------------------------------

await test("H. healthy managed lanes are untouched by another lane's close", async () => {
  const healthy = seedLane("Communications", { slot: 3, worktree: "wt3-comms", branch: "agent/claude/3-comms", tmux: "alloy-comms" });
  const doomed = seedLane("Disposable", { slot: 2, worktree: "wt2-disposable", branch: "agent/claude/2-disposable", tmux: "alloy-disposable" });
  L.setLaneCloseImplForTests({
    releaseCapacity: () => ({ ok: true }),
    finishSprint: ({ slot }) => { unregisterWorktree("wt2-disposable"); return { ok: true, slot }; },
  });
  await L.closeDurableLane(doomed.laneId, { root: ROOT });
  const still = L.resolveLaneWorktree(healthy.laneId, { root: ROOT });
  assert.equal(still.ok, true, still.code);
  assert.equal(still.slot, 3);
  assert.equal(still.port, 3013);
  assert.equal(getDurableLane(healthy.laneId, ROOT).status, "ACTIVE");
});

await test("H. the fleet audit names owners and orphans without guessing", async () => {
  seedLane("Communications", { slot: 3, worktree: "wt3-comms", branch: "agent/claude/3-comms", tmux: "alloy-comms" });
  // A registered worktree that no lane owns.
  registerWorktree("wt2-fixture-two", {
    slot: 2, port: 3912, path: join(ROOT, "Code", "alloy-worktrees", "wt2-fixture-two"), branch: "fixture-two",
  });
  const audit = L.auditLaneWorktrees({ root: ROOT });
  const orphanNames = audit.orphans.map((o) => o.worktree);
  assert.ok(orphanNames.includes("wt2-fixture-two"), "an unowned registration is reported as an orphan");
  assert.ok(!orphanNames.includes("wt3-comms"), "an owned worktree is not an orphan");
  const comms = audit.lanes.find((l) => l.lane_name === "Communications");
  assert.equal(comms.ok, true);
  assert.equal(comms.slot, 3);
  unregisterWorktree("wt2-fixture-two");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
