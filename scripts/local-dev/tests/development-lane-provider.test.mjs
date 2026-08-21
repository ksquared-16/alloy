#!/usr/bin/env node
/**
 * Lane provider preference: Claude vs Cursor for the next session/prompt.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDurableLane,
  lanePreferredProvider,
  resetDevelopmentLanesForTests,
  setPreferredLaneProvider,
} from "../lib/vacilando/development-lane.mjs";
import { createNewLaneRequest, setLaneProviderRequest } from "../lib/vacilando/lane-identity-api.mjs";
import { createAdmissionRequest, resetAdmissionsForTests } from "../lib/vacilando/execution-admission.mjs";
import { createQueuedRun, resetExecutionRunsForTests } from "../lib/vacilando/execution-run.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "vac-provider-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_ADMISSION_PROVISION = "0";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetDevelopmentLanesForTests(ROOT);
  resetAdmissionsForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

await test("create lane accepts Cursor and stores it as the preferred provider", async () => {
  const out = await createNewLaneRequest({ name: "Vacilando", provider: "cursor", instruction: "continue" }, { nowMs: Date.now() });
  assert.equal(out.status, 200, out.body?.error);
  assert.equal(lanePreferredProvider(out.body.lane), "cursor");
  assert.equal(out.body.admission?.provider || out.body.lane?.preferred_provider, "cursor");
});

await test("operator can switch a bound lane from Claude to Cursor without typing a path", () => {
  const created = createDurableLane({
    name: "Vacilando",
    binding: { worktree_path: ROOT, worktree_name: "wt-vac", provider: "claude" },
    origin: "created",
    root: ROOT,
  });
  assert.equal(created.ok, true);
  const switched = setLaneProviderRequest(created.lane.lane_id, { provider: "cursor" });
  assert.equal(switched.status, 200);
  assert.equal(switched.body.provider, "cursor");
  assert.equal(switched.body.lane.preferred_provider, "cursor");
  assert.equal(switched.body.lane.binding.provider, "cursor");
  assert.equal(setPreferredLaneProvider(created.lane.lane_id, "openai", { root: ROOT }).error, "unsupported_provider");
});

await test("queued run records the preferred provider", () => {
  const created = createDurableLane({
    name: "Vacilando",
    preferred_provider: "cursor",
    origin: "created",
    root: ROOT,
  });
  const run = createQueuedRun({
    laneId: created.lane.lane_id,
    instruction: "next prompt",
    root: ROOT,
  });
  assert.equal(run.ok, true);
  assert.equal(run.run.provider, "cursor");
  const adm = createAdmissionRequest({
    laneId: created.lane.lane_id,
    runId: run.run.run_id,
    provider: "cursor",
    root: ROOT,
  });
  assert.equal(adm.ok, true, adm.error);
  assert.equal(adm.request.provider, "cursor");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
