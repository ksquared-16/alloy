#!/usr/bin/env node
/**
 * Lane execution-capacity release.
 * Isolated runtime. Injected Alloy toolkit / tmux — does not finish live slots.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  bindDurableLane,
  createDurableLane,
  developmentLaneStorePath,
  getDurableLane,
  resetDevelopmentLanesForTests,
} from "../lib/vacilando/development-lane.mjs";
import {
  createQueuedRun,
  getExecutionRun,
  patchRunFields,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import {
  admissionForLane,
  createAdmissionRequest,
  queuedAdmissions,
  readAdmissionStore,
  resetAdmissionsForTests,
  setAdmissionImplForTests,
  transitionAdmission,
} from "../lib/vacilando/execution-admission.mjs";
import { createAgentSession, resetAgentSessionsForTests } from "../lib/vacilando/agent-session.mjs";
import { resetResourceRequestsForTests } from "../lib/vacilando/execution-resource.mjs";
import { resetSourceControlForTests } from "../lib/vacilando/source-control.mjs";
import {
  isProtectedWorktree,
  releaseIdleCapacityForQueuedWork,
  releaseLaneExecutionCapacity,
  resetReleaseImplForTests,
  setReleaseImplForTests,
} from "../lib/vacilando/lane-execution-capacity.mjs";
import { createNewLaneRequest } from "../lib/vacilando/lane-identity-api.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "vac-release-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_ADMISSION_PROVISION = "0";

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
  resetAdmissionsForTests(ROOT);
  resetAgentSessionsForTests(ROOT);
  resetResourceRequestsForTests(ROOT);
  resetSourceControlForTests(ROOT);
  resetReleaseImplForTests();
}

function injectSafeRelease({ finish = [], stop = [], checkpoint = [], git = { dirty: false, conflict: false } } = {}) {
  setReleaseImplForTests({
    inspectGit: async () => git,
    checkpoint: async () => {
      checkpoint.push("ck");
      return { ok: true, sha: "abc1234" };
    },
    stopSession: ({ tmuxSession }) => {
      stop.push(tmuxSession);
      return { ok: true, tmux_session: tmuxSession };
    },
    finishSprint: ({ slot }) => {
      finish.push(slot);
      return { ok: true, slot };
    },
  });
  return { finish, stop, checkpoint };
}

function seedBoundLane(name, { slot = 4, tmux = "alloy-processing", instruction = "follow-up work" } = {}) {
  const path = join(ROOT, `wt-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${slot}`);
  mkdirSync(path, { recursive: true });
  const created = createDurableLane({ name, origin: "created", root: ROOT });
  assert.equal(created.ok, true);
  const bound = bindDurableLane(created.lane.lane_id, {
    worktree_path: path,
    worktree_name: `wt-${slot}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    branch: `agent/claude/${slot}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    slot,
    tmux_session: tmux,
    provider: "claude",
  }, { root: ROOT });
  assert.equal(bound.ok, true, bound.error);
  const run = createQueuedRun({
    laneId: created.lane.lane_id,
    instruction,
    worktreePath: path,
    root: ROOT,
  });
  assert.equal(run.ok, true, run.error);
  assert.equal(transitionExecutionRun(run.run.run_id, "EXECUTING", { origin: "system", root: ROOT }).ok, true);
  assert.equal(transitionExecutionRun(run.run.run_id, "COMPLETE", { origin: "agent", root: ROOT, completion_report: { summary: "done" } }).ok, true);
  createAgentSession({ laneId: created.lane.lane_id, runId: run.run.run_id, root: ROOT });
  const adm = createAdmissionRequest({ laneId: created.lane.lane_id, runId: run.run.run_id, root: ROOT });
  transitionAdmission(adm.request.admission_id, "ACTIVE", { root: ROOT });
  return { lane: getDurableLane(created.lane.lane_id, ROOT), path, run: getExecutionRun(run.run.run_id, ROOT) };
}

await test("release keeps durable lane and worktree, frees slot", async () => {
  reset();
  const calls = injectSafeRelease();
  const seeded = seedBoundLane("Disposable Cert", { slot: 4, tmux: "alloy-disposable-cert" });
  const id = seeded.lane.lane_id;
  const out = await releaseLaneExecutionCapacity(id, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.lane_deleted, false);
  assert.equal(out.runtime_adopted, false);
  assert.equal(out.auto_merged, false);
  const kept = getDurableLane(id, ROOT);
  assert.equal(kept.name, "Disposable Cert");
  assert.equal(kept.binding.worktree_path, seeded.path);
  assert.equal(kept.binding.branch.startsWith("agent/claude/"), true);
  assert.equal(kept.binding.slot, null);
  assert.equal(kept.binding.tmux_session, null);
  assert.equal(kept.execution_capacity.state, "IDLE");
  assert.deepEqual(calls.finish, [4]);
  assert.deepEqual(calls.stop, ["alloy-disposable-cert"]);
  assert.equal(calls.checkpoint.length, 0);
});

await test("release does not mutate Git when worktree is clean", async () => {
  reset();
  const calls = injectSafeRelease({ git: { dirty: false, conflict: false } });
  const seeded = seedBoundLane("Clean Tree", { slot: 6, tmux: "alloy-clean-tree" });
  const out = await releaseLaneExecutionCapacity(seeded.lane.lane_id, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.git_mutated, false);
  assert.equal(calls.checkpoint.length, 0);
});

await test("dirty worktree without checkpoint blocks release", async () => {
  reset();
  injectSafeRelease({ git: { dirty: true, conflict: false } });
  const seeded = seedBoundLane("Dirty Tree", { slot: 6, tmux: "alloy-dirty-tree" });
  const out = await releaseLaneExecutionCapacity(seeded.lane.lane_id, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "source_control_gate");
  const kept = getDurableLane(seeded.lane.lane_id, ROOT);
  assert.equal(kept.binding.slot, 6);
  assert.equal(kept.name, "Dirty Tree");
});

await test("explicit checkpoint_ready allows Level 1 checkpoint then release", async () => {
  reset();
  const calls = injectSafeRelease({ git: { dirty: true, conflict: false } });
  const seeded = seedBoundLane("Ready Checkpoint", { slot: 6, tmux: "alloy-ready-checkpoint" });
  patchRunFields(seeded.run.run_id, { checkpoint_ready: true }, { root: ROOT });
  const out = await releaseLaneExecutionCapacity(seeded.lane.lane_id, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(calls.checkpoint.length, 1);
  assert.equal(getDurableLane(seeded.lane.lane_id, ROOT).binding.slot, null);
});

await test("in-flight Execution Run blocks release", async () => {
  reset();
  injectSafeRelease();
  const path = join(ROOT, "wt-inflight");
  mkdirSync(path, { recursive: true });
  const created = createDurableLane({ name: "Inflight", origin: "created", root: ROOT });
  bindDurableLane(created.lane.lane_id, {
    worktree_path: path, worktree_name: "wt-inflight", slot: 6, tmux_session: "alloy-inflight", provider: "claude",
  }, { root: ROOT });
  const run = createQueuedRun({
    laneId: created.lane.lane_id,
    instruction: "still working",
    worktreePath: path,
    root: ROOT,
  });
  assert.equal(run.ok, true, run.error);
  transitionExecutionRun(run.run.run_id, "EXECUTING", { origin: "system", root: ROOT });
  const out = await releaseLaneExecutionCapacity(created.lane.lane_id, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "unsafe_in_flight");
  assert.equal(getDurableLane(created.lane.lane_id, ROOT).binding.slot, 6);
});

await test("Runtime adoption remains blocked", async () => {
  reset();
  injectSafeRelease();
  const path = join(ROOT, "wt-runtime");
  mkdirSync(path, { recursive: true });
  const created = createDurableLane({ name: "Specialist", origin: "created", root: ROOT });
  const store = JSON.parse(readFileSync(developmentLaneStorePath(ROOT), "utf8"));
  store.lanes[created.lane.lane_id].binding = {
    type: "alloy_local",
    worktree_path: path,
    worktree_name: "wt-runtime",
    tmux_session: "alloy-runtime",
    slot: 6,
    provider: "claude",
  };
  writeFileSync(developmentLaneStorePath(ROOT), `${JSON.stringify(store, null, 2)}\n`);
  const out = await releaseLaneExecutionCapacity(created.lane.lane_id, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "runtime_adoption_blocked");
});

await test("this Gateway worktree is protected", async () => {
  assert.equal(isProtectedWorktree("/Users/Kelly/Code/alloy-worktrees/wt5-vacilando-gateway-v2"), true);
  reset();
  injectSafeRelease();
  const created = createDurableLane({ name: "Gateway Self", origin: "created", root: ROOT });
  const store = JSON.parse(readFileSync(developmentLaneStorePath(ROOT), "utf8"));
  store.lanes[created.lane.lane_id].binding = {
    type: "alloy_local",
    worktree_path: process.cwd(),
    worktree_name: "wt5-vacilando-gateway-v2",
    tmux_session: "alloy-vacilando-gateway-v2",
    slot: 5,
    provider: "claude",
  };
  writeFileSync(developmentLaneStorePath(ROOT), `${JSON.stringify(store, null, 2)}\n`);
  const out = await releaseLaneExecutionCapacity(created.lane.lane_id, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "protected_worktree");
});

await test("release admits the next queued lane automatically", async () => {
  reset();
  let provisioned = 0;
  let started = 0;
  let delivered = 0;
  injectSafeRelease();
  const running = seedBoundLane("Communications Cert", { slot: 3, tmux: "alloy-communications-cert" });
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: false, available: false }),
  });
  const queued = await createNewLaneRequest({ name: "Processing Cert", instruction: "queued work after release" });
  assert.equal(queued.body.admission.state, "QUEUED");
  assert.equal(queuedAdmissions(readAdmissionStore(ROOT)).length >= 1, true);
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: true, available: true }),
    provisionLaneBinding: ({ lane }) => {
      provisioned += 1;
      const path = join(ROOT, "wt-processing-next");
      mkdirSync(path, { recursive: true });
      return {
        ok: true,
        created: { by_vacilando: true, worktree_path: path, worktree_name: "wt-processing-next", slot: 3 },
        pre_existing: [],
        binding: {
          worktree_path: path,
          worktree_name: "wt-processing-next",
          slot: 3,
          provider: "claude",
          branch: "agent/claude/3-processing-next",
          tmux_session: "alloy-processing-next",
        },
      };
    },
    startProviderOnBinding: () => {
      started += 1;
      return { ok: true, tmux_session: "alloy-processing-next", created: { tmux: true, provider: true } };
    },
    deliverQueuedRun: async () => {
      delivered += 1;
      return { ok: true, already_delivered: false };
    },
  });
  const out = await releaseLaneExecutionCapacity(running.lane.lane_id, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(getDurableLane(running.lane.lane_id, ROOT).name, "Communications Cert");
  assert.equal(getDurableLane(running.lane.lane_id, ROOT).binding.slot, null);
  const next = getDurableLane(queued.body.lane.lane_id, ROOT);
  assert.equal(next.name, "Processing Cert");
  assert.equal(provisioned, 1);
  assert.equal(started, 1);
  assert.equal(delivered, 1);
  assert.equal(admissionForLane(queued.body.lane.lane_id, ROOT).state, "ACTIVE");
});

await test("Create New Lane still works with and without capacity", async () => {
  reset();
  setAdmissionImplForTests({ canProvisionNow: () => ({ ok: false, available: false }) });
  const none = await createNewLaneRequest({ name: "No Capacity Lane", instruction: "wait" });
  assert.equal(none.status, 200);
  assert.equal(none.body.admission.state, "QUEUED");
  assert.equal(getDurableLane(none.body.lane.lane_id, ROOT).binding, null);
  reset();
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: true, available: true }),
    provisionLaneBinding: ({ lane }) => {
      const path = join(ROOT, "wt-with-cap");
      mkdirSync(path, { recursive: true });
      return {
        ok: true,
        created: { by_vacilando: true },
        pre_existing: [],
        binding: { worktree_path: path, worktree_name: "wt-with-cap", slot: 6, provider: "claude" },
      };
    },
    deliverQueuedRun: async () => ({ ok: true }),
  });
  const yes = await createNewLaneRequest({ name: "With Capacity Lane", instruction: "go" });
  assert.equal(yes.status, 200);
  assert.equal(getDurableLane(yes.body.lane.lane_id, ROOT).binding.slot, 6);
});

await test("idle session is released so queued work can cycle in", async () => {
  reset();
  const calls = injectSafeRelease();
  const occupier = seedBoundLane("Idle Occupier", { slot: 2, tmux: "alloy-idle-occupier" });
  const waiting = createDurableLane({ name: "Waiting Lane", origin: "created", root: ROOT });
  const path = join(ROOT, "wt-waiting-cycle");
  mkdirSync(path, { recursive: true });
  bindDurableLane(waiting.lane.lane_id, {
    worktree_path: path,
    worktree_name: "wt-waiting-cycle",
    provider: "claude",
  }, { root: ROOT });
  const run = createQueuedRun({
    laneId: waiting.lane.lane_id,
    instruction: "fourth lane work",
    worktreePath: path,
    root: ROOT,
  });
  createAdmissionRequest({ laneId: waiting.lane.lane_id, runId: run.run.run_id, root: ROOT });
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: false, available: false }),
    assessSessionStartCapacity: async () => ({ ok: false, available: false }),
    startProviderOnBinding: async () => ({ ok: false, queued: true }),
  });
  setReleaseImplForTests({
    inspectGit: async () => ({ dirty: false, conflict: false }),
    stopSession: ({ tmuxSession }) => {
      calls.stop.push(tmuxSession);
      return { ok: true, tmux_session: tmuxSession };
    },
    finishSprint: ({ slot }) => {
      calls.finish.push(slot);
      return { ok: true, slot };
    },
    assessSessionStartCapacity: async () => ({ ok: false, available: false }),
  });
  const out = await releaseIdleCapacityForQueuedWork({ root: ROOT });
  assert.equal(out.released, 1, JSON.stringify(out));
  assert.equal(out.lane_id, occupier.lane.lane_id);
  assert.equal(getDurableLane(occupier.lane.lane_id, ROOT).binding.tmux_session, null);
  assert.equal(admissionForLane(waiting.lane.lane_id, ROOT).state, "QUEUED");
});

await test("queued run is not released as idle capacity", async () => {
  reset();
  const occupier = seedBoundLane("Starting Occupier", { slot: 2, tmux: "alloy-starting-occupier" });
  const run = createQueuedRun({
    laneId: occupier.lane.lane_id,
    instruction: "operator send implies start",
    worktreePath: occupier.lane.binding.worktree_path,
    root: ROOT,
  });
  createAdmissionRequest({
    laneId: occupier.lane.lane_id,
    runId: run.run.run_id,
    root: ROOT,
  });
  transitionAdmission(admissionForLane(occupier.lane.lane_id, ROOT).admission_id, "ADMITTED", {
    reason: "session_starting",
    root: ROOT,
    provisioning_state: "session_starting",
  });
  const waiting = createDurableLane({ name: "Stale Waiter", origin: "created", root: ROOT });
  const path = join(ROOT, "wt-stale-waiter");
  mkdirSync(path, { recursive: true });
  bindDurableLane(waiting.lane.lane_id, {
    worktree_path: path,
    worktree_name: "wt-stale-waiter",
    provider: "claude",
  }, { root: ROOT });
  const waitRun = createQueuedRun({
    laneId: waiting.lane.lane_id,
    instruction: "old cert fixture",
    worktreePath: path,
    root: ROOT,
  });
  createAdmissionRequest({ laneId: waiting.lane.lane_id, runId: waitRun.run.run_id, root: ROOT });
  setReleaseImplForTests({
    inspectGit: async () => ({ dirty: false, conflict: false }),
    stopSession: () => {
      throw new Error("must not kill a lane with a queued run");
    },
    finishSprint: () => {
      throw new Error("must not finish a lane with a queued run");
    },
    assessSessionStartCapacity: async () => ({ ok: false, available: false }),
  });
  const out = await releaseIdleCapacityForQueuedWork({ root: ROOT });
  assert.equal(out.released, 0, JSON.stringify(out));
  assert.equal(getDurableLane(occupier.lane.lane_id, ROOT).binding.tmux_session, "alloy-starting-occupier");
  assert.equal(getExecutionRun(run.run.run_id, ROOT).state, "QUEUED");
});

await test("cursor lanes skip alloy-sprint-finish so a missing Claude slot does not stick FINISHING", async () => {
  reset();
  const lane = seedBoundLane("Vacilando Cursor", { slot: 1, tmux: "alloy-vacilando" });
  bindDurableLane(lane.lane.lane_id, {
    ...getDurableLane(lane.lane.lane_id, ROOT).binding,
    provider: "cursor",
  }, { root: ROOT });
  const finish = [];
  setReleaseImplForTests({
    inspectGit: async () => ({ dirty: false, conflict: false }),
    stopSession: () => ({ ok: true, tmux_session: "alloy-vacilando" }),
    finishSprint: ({ slot }) => {
      finish.push(slot);
      return { ok: false, error: "error: no managed agent in slot 1\n" };
    },
  });
  const out = await releaseLaneExecutionCapacity(lane.lane.lane_id, { origin: "operator", root: ROOT });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual(finish, []);
  assert.equal(getDurableLane(lane.lane.lane_id, ROOT).execution_capacity.state, "IDLE");
});

await test("operator does not supply a slot number to create or release", async () => {
  reset();
  setAdmissionImplForTests({ canProvisionNow: () => ({ ok: false }) });
  const slot = await createNewLaneRequest({ name: "X", instruction: "nope", slot: 3 });
  assert.equal(slot.status, 400);
  const src = readFileSync(new URL("../apps/vacilando/public/gateway-view.mjs", import.meta.url), "utf8");
  assert.equal(/name="slot"/.test(src), false);
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
