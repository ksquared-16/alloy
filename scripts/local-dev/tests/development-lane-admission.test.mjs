#!/usr/bin/env node
/**
 * Queued lane creation + Execution Admission Request.
 * Isolated runtime. Fake Alloy toolkit — does not call alloy-sprint-start.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DURABLE_LANE_ID_RE, bindDurableLane, createDurableLane, getDurableLane, resetDevelopmentLanesForTests } from "../lib/vacilando/development-lane.mjs";
import {
  admissionForLane,
  attachLaneAdmissions,
  createAdmissionRequest,
  evaluateAdmissionQueue,
  prioritizeAdmission,
  queuedAdmissions,
  readAdmissionStore,
  resetAdmissionsForTests,
  setAdmissionImplForTests,
} from "../lib/vacilando/execution-admission.mjs";
import { activeRunForLane, createQueuedRun, getExecutionRun, resetExecutionRunsForTests } from "../lib/vacilando/execution-run.mjs";
import { createNewLaneRequest } from "../lib/vacilando/lane-identity-api.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "vac-admit-"));
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
}

await test("durable lane can be created with capacity", async () => {
  reset();
  let provisioned = 0;
  let delivered = 0;
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: true, available: true }),
    provisionLaneBinding: ({ lane }) => {
      provisioned += 1;
      const path = join(ROOT, "wt-processing");
      mkdirSync(path, { recursive: true });
      return {
        ok: true,
        created: { by_vacilando: true, worktree_name: "wt-processing", worktree_path: path, slot: 4 },
        pre_existing: [],
        binding: { worktree_path: path, worktree_name: "wt-processing", slot: 4, provider: "claude", branch: "agent/claude/4-processing" },
      };
    },
    deliverQueuedRun: async (runRef) => {
      delivered += 1;
      const run = getExecutionRun(runRef.run_id, ROOT);
      assert.equal(run.state, "QUEUED");
      return { ok: true, already_delivered: false };
    },
  });
  const out = await createNewLaneRequest({ name: "Processing", instruction: "Implement billing ledger." });
  assert.equal(out.status, 200);
  assert.match(out.body.lane.lane_id, DURABLE_LANE_ID_RE);
  assert.equal(provisioned, 1);
  assert.equal(delivered, 1);
  assert.equal(admissionForLane(out.body.lane.lane_id, ROOT).state, "ACTIVE");
  assert.equal(getDurableLane(out.body.lane.lane_id, ROOT).binding.worktree_name, "wt-processing");
});

await test("durable lane can be created without capacity", async () => {
  reset();
  setAdmissionImplForTests({ canProvisionNow: () => ({ ok: false, available: false }) });
  const out = await createNewLaneRequest({ name: "Processing", instruction: "Initial work ready" });
  assert.equal(out.status, 200);
  assert.equal(out.body.ok, true);
  assert.match(out.body.lane.lane_id, DURABLE_LANE_ID_RE);
  assert.equal(out.body.execution_run.state, "QUEUED");
  assert.equal(out.body.admission.state, "QUEUED");
  assert.equal(getDurableLane(out.body.lane.lane_id, ROOT).binding, null);
});

await test("no-capacity creates queued admission and does not spawn substrate", async () => {
  reset();
  let provisioned = 0;
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: false }),
    provisionLaneBinding: () => { provisioned += 1; return { ok: true, binding: {} }; },
  });
  const out = await createNewLaneRequest({ name: "Processing", instruction: "do the thing" });
  assert.equal(provisioned, 0);
  assert.equal(getDurableLane(out.body.lane.lane_id, ROOT).binding, null);
});

await test("queued lane persists restart", async () => {
  reset();
  setAdmissionImplForTests({ canProvisionNow: () => ({ ok: false }) });
  const out = await createNewLaneRequest({ name: "Processing", instruction: "persist me" });
  const id = out.body.lane.lane_id;
  const stored = JSON.parse(readFileSync(join(ROOT, "vacilando", "lanes", "lanes.json"), "utf8"));
  assert.ok(stored.lanes[id]);
  const adm = JSON.parse(readFileSync(join(ROOT, "vacilando", "execution-runs", "admissions.json"), "utf8"));
  assert.equal(adm.requests[0].lane_id, id);
  assert.equal(adm.requests[0].state, "QUEUED");
  assert.equal(getDurableLane(id, ROOT).name, "Processing");
});

await test("FIFO admission", async () => {
  reset();
  setAdmissionImplForTests({ canProvisionNow: () => ({ ok: false }) });
  const a = await createNewLaneRequest({ name: "Alpha", instruction: "first" });
  const b = await createNewLaneRequest({ name: "Beta", instruction: "second" });
  const q = queuedAdmissions(readAdmissionStore(ROOT));
  assert.equal(q[0].lane_id, a.body.lane.lane_id);
  assert.equal(q[1].lane_id, b.body.lane.lane_id);
  assert.equal(q[0].requested_at <= q[1].requested_at, true);
});

await test("priority override does not steal active capacity", async () => {
  reset();
  let n = 0;
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: n === 0 }),
    provisionLaneBinding: ({ lane }) => {
      n += 1;
      const path = join(ROOT, `wt-${n}`);
      mkdirSync(path, { recursive: true });
      return { ok: true, created: { by_vacilando: true }, pre_existing: [], binding: { worktree_path: path, worktree_name: `wt-${n}`, slot: n, provider: "claude" } };
    },
    deliverQueuedRun: async () => ({ ok: true }),
  });
  const first = await createNewLaneRequest({ name: "First", instruction: "active now" });
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: false }),
    provisionLaneBinding: () => { n += 1; return { ok: true, binding: {} }; },
    deliverQueuedRun: async () => ({ ok: true }),
  });
  const second = await createNewLaneRequest({ name: "Second", instruction: "queued" });
  const third = await createNewLaneRequest({ name: "Third", instruction: "also queued" });
  assert.equal(admissionForLane(first.body.lane.lane_id, ROOT).state, "ACTIVE");
  const pri = prioritizeAdmission(admissionForLane(third.body.lane.lane_id, ROOT).admission_id, { origin: "operator", root: ROOT });
  assert.equal(pri.ok, true);
  assert.equal(pri.queue_position, 1);
  assert.equal(admissionForLane(first.body.lane.lane_id, ROOT).state, "ACTIVE");
  assert.equal(admissionForLane(second.body.lane.lane_id, ROOT).state, "QUEUED");
});

await test("capacity release triggers admission of FIFO head", async () => {
  reset();
  setAdmissionImplForTests({ canProvisionNow: () => ({ ok: false }) });
  const a = await createNewLaneRequest({ name: "Older", instruction: "first in line" });
  const b = await createNewLaneRequest({ name: "Newer", instruction: "second" });
  let delivered = [];
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: true }),
    provisionLaneBinding: ({ lane }) => {
      const path = join(ROOT, lane.name);
      mkdirSync(path, { recursive: true });
      return { ok: true, created: { by_vacilando: true }, pre_existing: [], binding: { worktree_path: path, worktree_name: lane.name, provider: "claude" } };
    },
    deliverQueuedRun: async (runRef) => {
      delivered.push(runRef.run_id);
      return { ok: true };
    },
  });
  const out = await evaluateAdmissionQueue({ root: ROOT });
  assert.equal(out.admitted, 1);
  assert.equal(out.lane_id, a.body.lane.lane_id);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0], a.body.execution_run.run_id);
  assert.equal(admissionForLane(b.body.lane.lane_id, ROOT).state, "QUEUED");
});

await test("provisioning uses injected canonical toolkit seam", async () => {
  reset();
  const calls = [];
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: true }),
    provisionLaneBinding: (args) => {
      calls.push(args);
      const path = join(ROOT, "wt-toolkit");
      mkdirSync(path, { recursive: true });
      return { ok: true, created: { toolkit: "alloy-sprint-start", by_vacilando: true }, pre_existing: [], binding: { worktree_path: path, worktree_name: "wt-toolkit", provider: "claude" } };
    },
    deliverQueuedRun: async () => ({ ok: true }),
  });
  await createNewLaneRequest({ name: "Toolkit", instruction: "use alloy-sprint-start" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].lane.name, "Toolkit");
});

await test("partial failure preserves durable lane and run", async () => {
  reset();
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: true }),
    provisionLaneBinding: () => ({ ok: false, error: "tmux_failed", created: { worktree_name: "wt-x" }, pre_existing: [] }),
  });
  const out = await createNewLaneRequest({ name: "Fragile", instruction: "keep me" });
  assert.equal(out.status, 200);
  const rec = getDurableLane(out.body.lane.lane_id, ROOT);
  assert.ok(rec);
  assert.equal(rec.status, "ACTIVE");
  assert.equal(activeRunForLane(rec.lane_id, ROOT).state, "QUEUED");
  assert.equal(admissionForLane(rec.lane_id, ROOT).state, "FAILED");
});

await test("original run delivered exactly once", async () => {
  reset();
  const ids = [];
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: true }),
    provisionLaneBinding: ({ lane }) => {
      const path = join(ROOT, "wt-once");
      mkdirSync(path, { recursive: true });
      return { ok: true, created: { by_vacilando: true }, pre_existing: [], binding: { worktree_path: path, worktree_name: "wt-once", provider: "claude" } };
    },
    deliverQueuedRun: async (runRef) => {
      ids.push(runRef.run_id);
      return { ok: true };
    },
  });
  const out = await createNewLaneRequest({ name: "Once", instruction: "exactly once" });
  await evaluateAdmissionQueue({ root: ROOT });
  assert.equal(ids.length, 1);
  assert.equal(ids[0], out.body.execution_run.run_id);
});

await test("create refuses arbitrary worktree/path/branch input", async () => {
  reset();
  const path = await createNewLaneRequest({ name: "X", instruction: "nope", worktree_path: "/tmp/evil" });
  assert.equal(path.status, 400);
  assert.equal(path.body.error, "path_refused");
  const branch = await createNewLaneRequest({ name: "X", instruction: "nope", branch: "agent/evil" });
  assert.equal(branch.status, 400);
  const slot = await createNewLaneRequest({ name: "X", instruction: "nope", slot: 3 });
  assert.equal(slot.status, 400);
});

await test("substrate fields stay refused in every workspace mode", async () => {
  reset();
  for (const mode of ["new_worktree", "connect_existing", "planning"]) {
    for (const field of ["slot", "tmux_session", "port", "command", "argv", "cwd", "path", "worktree"]) {
      const out = await createNewLaneRequest({ name: "X", workspace_mode: mode, [field]: "3" });
      assert.equal(out.status, 400, `${mode} accepted ${field}`);
      assert.equal(out.body.error, "path_refused");
      assert.deepEqual(out.body.fields, [field]);
    }
  }
});

await test("a workspace field is refused outside the mode that uses it", async () => {
  reset();
  const branchOnPlanning = await createNewLaneRequest({ name: "X", workspace_mode: "planning", branch: "agent/x" });
  assert.equal(branchOnPlanning.body.error, "path_refused");
  const pathOnNew = await createNewLaneRequest({ name: "X", workspace_mode: "new_worktree", worktree_path: "/tmp/evil" });
  assert.equal(pathOnNew.body.error, "path_refused");
  const baseOnConnect = await createNewLaneRequest({
    name: "X", workspace_mode: "connect_existing", worktree_path: "/tmp/ok", base_ref: "origin/staging",
  });
  assert.equal(baseOnConnect.body.error, "path_refused");
  assert.deepEqual(baseOnConnect.body.fields, ["base_ref"]);
});

await test("the wizard's own new-worktree request is NOT refused", async () => {
  // The reported defect: the Add lane sheet sends the branch it previewed and
  // was answered "That path contains characters Vacilando will not open."
  reset();
  const out = await createNewLaneRequest({
    name: "ui", provider: "claude", workspace_mode: "new_worktree", branch: "agent/vui", base_ref: "origin/staging",
  });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.lane.name, "ui");
});

await test("an unusable branch or base ref is named before a lane is created", async () => {
  reset();
  const bad = await createNewLaneRequest({ name: "X", workspace_mode: "new_worktree", branch: "agent/../evil" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, "invalid_branch_name");
  const badBase = await createNewLaneRequest({ name: "X", workspace_mode: "new_worktree", base_ref: "origin/staging;rm -rf /" });
  assert.equal(badBase.body.error, "invalid_base_ref");
  const relative = await createNewLaneRequest({ name: "X", workspace_mode: "connect_existing", worktree_path: "../../etc" });
  assert.equal(relative.body.error, "path_refused");
});

await test("idle durable lane allowed without an Execution Run", async () => {
  reset();
  const out = await createNewLaneRequest({ name: "Billing" });
  assert.equal(out.status, 200);
  assert.equal(out.body.execution_run, null);
  assert.equal(out.body.admission, null);
  assert.equal(getDurableLane(out.body.lane.lane_id, ROOT).name, "Billing");
  assert.equal(activeRunForLane(out.body.lane.lane_id, ROOT), null);
});

await test("duplicate specialist names are allowed and never routed by name", async () => {
  reset();
  const a = await createNewLaneRequest({ name: "Processing" });
  const b = await createNewLaneRequest({ name: "Processing" });
  assert.notEqual(a.body.lane.lane_id, b.body.lane.lane_id);
  assert.equal(a.body.lane.name, "Processing");
  assert.equal(b.body.lane.name, "Processing");
});

await test("list overlay shows queued admission", async () => {
  reset();
  setAdmissionImplForTests({ canProvisionNow: () => ({ ok: false }) });
  const out = await createNewLaneRequest({ name: "Queued Overlay", instruction: "wait" });
  const lanes = attachLaneAdmissions([{ lane_id: out.body.lane.lane_id, execution_run: { state: "QUEUED", run_id: out.body.execution_run.run_id } }], ROOT);
  assert.equal(lanes[0].admission.state, "QUEUED");
  assert.equal(lanes[0].admission.queue_position, 1);
});

await test("bindDurableLane refuses a second owner of the same worktree", () => {
  reset();
  const path = join(ROOT, "shared-wt");
  mkdirSync(path, { recursive: true });
  const a = createDurableLane({ name: "A", origin: "created", binding: { worktree_path: path, worktree_name: "shared-wt" }, root: ROOT });
  const b = createDurableLane({ name: "B", origin: "created", root: ROOT });
  const bound = bindDurableLane(b.lane.lane_id, { worktree_path: path, worktree_name: "shared-wt" }, { root: ROOT });
  assert.equal(bound.ok, false);
  assert.equal(bound.error, "already_connected");
  assert.equal(a.ok, true);
});

rmSync(ROOT, { recursive: true, force: true });
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
