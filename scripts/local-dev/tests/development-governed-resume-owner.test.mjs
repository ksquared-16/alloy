#!/usr/bin/env node
/**
 * A RESUME THAT ONLY EXISTS AS A PROMISE HAS NO OWNER.
 *
 * `scheduleAcceptedExecution` already states the doctrine, in this same file:
 * the tick is the durable owner and the immediate kick is an optimisation,
 * "written so that losing it costs nothing... That is the difference between an
 * optimisation and an unowned Promise."
 *
 * The RESUME was the unowned Promise. `executeGovernedAction` assigns
 * `applied.resumePromise` and nothing durable holds it: one caller awaits it
 * in-process, the other calls `.catch(() => {})`. When the action executes
 * inside a short-lived `vac` process, the process exits and the run is never
 * taken out of WAITING_RESOURCE.
 *
 * MEASURED on erun_828e075e3c1ed70a: the retirement completed, and the run sat
 * in WAITING_RESOURCE for over four minutes with a valid `needs_operator_input`
 * wait until a worker resumed it by hand. It could have sat there for ever —
 * `human_indefinite` never expires, so the run does not die, it rests.
 *
 * And the hand resume left `resource_wait` populated on an EXECUTING run: the
 * exit branch in `transitionExecutionRun` was the literal no-op
 * `found.resource_wait = found.resource_wait`, so leaving the wait resolved
 * nothing. An active wait on a running run is the same class of lie as a wait
 * with no reason on a waiting one.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createQueuedRun, getExecutionRun, patchRunResourceWait, reportRunState, transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import { describeWait, isDeclaredWaitReason } from "../lib/vacilando/run-wait.mjs";
import {
  resumeLaneAfterGovernedAction, setGovernedActionResumeImplForTests, tickGovernedActions,
} from "../lib/vacilando/governed-action-request.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  const root = mkdtempSync(join(tmpdir(), "vac-resume-"));
  const prev = process.env.ALLOY_RUNTIME_ROOT;
  process.env.ALLOY_RUNTIME_ROOT = root;
  try { fn(root); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  finally {
    if (prev === undefined) delete process.env.ALLOY_RUNTIME_ROOT; else process.env.ALLOY_RUNTIME_ROOT = prev;
    rmSync(root, { recursive: true, force: true });
  }
}

async function atest(name, fn) {
  const root = mkdtempSync(join(tmpdir(), "vac-resume-"));
  const prev = process.env.ALLOY_RUNTIME_ROOT;
  process.env.ALLOY_RUNTIME_ROOT = root;
  try { await fn(root); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  finally {
    if (prev === undefined) delete process.env.ALLOY_RUNTIME_ROOT; else process.env.ALLOY_RUNTIME_ROOT = prev;
    rmSync(root, { recursive: true, force: true });
  }
}

const LANE = "lane_aaaaaaaaaaaa";

function waitingRun(root, requestId = "gar_probe") {
  const c = createQueuedRun({ laneId: LANE, instruction: "work", origin: "operator", root });
  assert.equal(c.ok, true, `fixture: ${c.error}`);
  reportRunState(c.run.run_id, "executing", { origin: "operator", root });
  const d = describeWait({ reason: "needs_operator_input", resource_id: requestId, waiting_since: Date.now() });
  transitionExecutionRun(c.run.run_id, "WAITING_RESOURCE", {
    reason: "Waiting on Director — worktree retirement", origin: "system", root,
    resource_wait: {
      ...d, resource_key: "director_governed_action", label: "Director",
      summary: "Waiting on Director — worktree retirement",
      governed_request_id: requestId, action_key: "vacilando.retire_worktree",
    },
  });
  return c.run.run_id;
}

/* ── THE INVARIANT ───────────────────────────────────────────────────────── */

test("R1. THE DEFECT: leaving WAITING_RESOURCE resolves the wait", (root) => {
  const id = waitingRun(root);
  assert.equal(getExecutionRun(id, root).resource_wait.resolution_state, "waiting");

  transitionExecutionRun(id, "EXECUTING", { reason: "governed_action_complete", origin: "system", root });
  const after = getExecutionRun(id, root);
  assert.equal(after.state, "EXECUTING");
  assert.notEqual(after.resource_wait?.resolution_state, "waiting",
    "an EXECUTING run must never carry a wait that still reads as active");
});

test("R2. a worker's own resume resolves it too, not just the governed one", (root) => {
  // This is how the live run ended up running while waiting: nobody resumed it,
  // so a worker did, and run-status does not go through the governed path.
  const id = waitingRun(root);
  transitionExecutionRun(id, "EXECUTING", { reason: "worker resumed", origin: "agent", root });
  const run = getExecutionRun(id, root);
  assert.equal(run.state, "EXECUTING");
  assert.notEqual(run.resource_wait?.resolution_state, "waiting", "an agent resume left an active wait attached");
  assert.equal(run.resource_wait.resolved_into, "EXECUTING");
});

test("R3. the forensic record survives — resolved, not erased", (root) => {
  /*
   * The earlier repair in this area erased wait evidence on terminal failures
   * and had to be undone. Resolution is a STATE CHANGE, not a delete: an
   * operator investigating a failed run must still see what it was waiting for.
   */
  const id = waitingRun(root, "gar_forensic");
  /*
   * A sweeping origin may not fail a blocked run on its own opinion — "a run
   * waiting on input or a governed decision is blocked, not failed". A real
   * observed execution failure still may, and that is the terminal case whose
   * evidence an operator needs most.
   */
  const out = transitionExecutionRun(id, "FAILED", {
    reason: "the executor died", origin: "governor", root, execution_failure: true,
  });
  assert.notEqual(out?.ok, false, `fixture: ${out?.error} ${out?.detail || ""}`);
  const run = getExecutionRun(id, root);
  assert.equal(run.state, "FAILED");
  assert.ok(run.resource_wait, "the wait must still be there to read");
  assert.equal(run.resource_wait.governed_request_id, "gar_forensic");
  assert.equal(run.resource_wait.reason, "needs_operator_input", "including what it was waiting for");
  assert.notEqual(run.resource_wait.resolution_state, "waiting");
  assert.ok(run.resource_wait.resolved_at, "and when it stopped waiting");
});

test("R4. a run still waiting keeps an active, readable wait", (root) => {
  // The property the previous mission proved live. Resolution on EXIT must not
  // weaken it: while the run is in the wait, the wait is live and classifiable.
  const id = waitingRun(root);
  const run = getExecutionRun(id, root);
  assert.equal(run.state, "WAITING_RESOURCE");
  assert.equal(run.resource_wait.resolution_state, "waiting");
  assert.ok(isDeclaredWaitReason(run.resource_wait.reason));
  const verdict = describeWait({ reason: run.resource_wait.reason, resource_id: "gar_probe", waiting_since: Date.now() });
  assert.equal(verdict.invalid_because, undefined);
  assert.equal(verdict.bound_policy, "human_indefinite");
});

test("R5. an explicit clear still clears", (root) => {
  // Resolution is about EXIT. The owner that genuinely wants the wait gone --
  // the governed resume -- still removes it outright.
  const id = waitingRun(root);
  transitionExecutionRun(id, "EXECUTING", { reason: "governed_action_complete", origin: "system", root });
  patchRunResourceWait(id, null, root);
  assert.equal(getExecutionRun(id, root).resource_wait, null);
});

/* ── THE OWNER ───────────────────────────────────────────────────────────── */

/** A completed governed request whose run is still parked on it. */
function strandedRequest(root, { requestId = "gar_stranded", runId, status = "complete" } = {}) {
  const dir = join(root, "vacilando", "governed-actions");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "requests.json");
  const store = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : { schema_version: "vacilando.governed_action_request.v1", requests: [] };
  store.requests.push({
    schema_version: "vacilando.governed_action_request.v1",
    request_id: requestId, lane_id: LANE, run_id: runId, status,
    action_key: "vacilando.retire_worktree", target: "staging",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  writeFileSync(file, JSON.stringify(store, null, 2));
  return requestId;
}

async function withStubbedResume(fn) {
  const resumed = [];
  setGovernedActionResumeImplForTests({
    resumeLane: async (requestId) => { resumed.push(requestId); return { ok: true, stubbed: true }; },
  });
  try { await fn(resumed); } finally { setGovernedActionResumeImplForTests({}); }
  return resumed;
}

await (async () => {
  await atest("R6. THE DEFECT: the tick owns the resume nobody was holding", async (root) => {
    /*
     * The live shape: the action is complete, the run is still parked on it, and
     * the only thing that would ever have resumed it was a promise in a process
     * that has exited.
     */
    const runId = waitingRun(root, "gar_stranded");
    strandedRequest(root, { requestId: "gar_stranded", runId });
    const resumed = [];
    setGovernedActionResumeImplForTests({
      resumeLane: async (id) => { resumed.push(id); return { ok: true, stubbed: true }; },
    });
    try {
      tickGovernedActions({ root });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepEqual(resumed, ["gar_stranded"], "a completed action with a parked run must be picked up");
    } finally { setGovernedActionResumeImplForTests({}); }
  });

  await atest("R7. a run that has already resumed is not resumed again", async (root) => {
    const runId = waitingRun(root, "gar_done");
    strandedRequest(root, { requestId: "gar_done", runId });
    transitionExecutionRun(runId, "EXECUTING", { reason: "governed_action_complete", origin: "system", root });
    const resumed = [];
    setGovernedActionResumeImplForTests({
      resumeLane: async (id) => { resumed.push(id); return { ok: true }; },
    });
    try {
      tickGovernedActions({ root });
      tickGovernedActions({ root });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepEqual(resumed, [], "the run is no longer waiting, so there is nothing to own");
    } finally { setGovernedActionResumeImplForTests({}); }
  });

  await atest("R8. a stale completion cannot resume a run waiting on something else", async (root) => {
    /*
     * The run has moved on to a second approval. A late completion for the FIRST
     * must not consume the second wait and leave it with nobody to satisfy it.
     */
    const runId = waitingRun(root, "gar_second");
    strandedRequest(root, { requestId: "gar_first", runId });
    const resumed = [];
    setGovernedActionResumeImplForTests({
      resumeLane: async (id) => { resumed.push(id); return { ok: true }; },
    });
    try {
      tickGovernedActions({ root });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepEqual(resumed, [], "the run is waiting on gar_second; gar_first is not its business");
    } finally { setGovernedActionResumeImplForTests({}); }
    const run = getExecutionRun(runId, root);
    assert.equal(run.state, "WAITING_RESOURCE", "and the newer wait is untouched");
    assert.equal(run.resource_wait.resolution_state, "waiting");
  });

  await atest("R9. the resume itself refuses a wait that is not its own", async (root) => {
    // The same guard at the other end, so neither caller can get it wrong.
    const runId = waitingRun(root, "gar_second");
    strandedRequest(root, { requestId: "gar_first", runId });
    const out = await resumeLaneAfterGovernedAction("gar_first", { root });
    assert.equal(out.ok, true);
    assert.equal(out.stale, true);
    assert.equal(out.run_waiting_on, "gar_second");
    assert.equal(getExecutionRun(runId, root).state, "WAITING_RESOURCE");
  });

  await atest("R10. a request that is not complete is never a resume", async (root) => {
    const runId = waitingRun(root, "gar_pending");
    strandedRequest(root, { requestId: "gar_pending", runId, status: "awaiting_operator" });
    const resumed = [];
    setGovernedActionResumeImplForTests({
      resumeLane: async (id) => { resumed.push(id); return { ok: true }; },
    });
    try {
      tickGovernedActions({ root });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepEqual(resumed, [], "still awaiting approval — the wait is correct and must hold");
    } finally { setGovernedActionResumeImplForTests({}); }
    assert.equal(getExecutionRun(runId, root).state, "WAITING_RESOURCE");
  });
})();

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
