#!/usr/bin/env node
/**
 * Durable state backup/restore + host rebind + Vacilando specialist lane.
 * Isolated roots only. Does not mutate live Gateway state or Git worktrees.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.VACILANDO_SKIP_NODE_PROBE = "1";
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_ADMISSION_PROVISION = "0";

const ROOT = mkdtempSync(join(tmpdir(), "vac-durable-"));
const DEST = mkdtempSync(join(tmpdir(), "vac-restore-"));
const BAK = mkdtempSync(join(tmpdir(), "vac-bak-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const {
  DURABLE_LANE_ID_RE,
  HOST_REBIND_CONTRACT,
  VACILANDO_LANE_NAME,
  WORK_CLASS_RUNTIME_SELF,
  bindDurableLane,
  createDurableLane,
  ensureVacilandoSpecialistLane,
  findVacilandoSpecialistLane,
  getDurableLane,
  listDurableLanes,
  rebindDurableLane,
  resetDevelopmentLanesForTests,
  scarceResourcePriorityForLane,
} = await import("../lib/vacilando/development-lane.mjs");
const { ensureLocalNode, getLocalNode, localNodeId, publicExecutionNode, resetExecutionNodeForTests } = await import("../lib/vacilando/execution-node.mjs");
const {
  STATE_FAMILIES,
  assertLaneIdentitiesPreserved,
  backupDurableState,
  laneIdentitySnapshot,
  restoreDurableState,
  verifyBackup,
} = await import("../lib/vacilando/durable-state.mjs");
const { createQueuedRun, listExecutionRunsForLane, resetExecutionRunsForTests } = await import("../lib/vacilando/execution-run.mjs");
const { createAdmissionRequest, resetAdmissionsForTests } = await import("../lib/vacilando/execution-admission.mjs");

const WT_A = join(ROOT, "wt-product");
const WT_B = join(DEST, "wt-rebind");
mkdirSync(WT_A, { recursive: true });
mkdirSync(WT_B, { recursive: true });

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
  resetExecutionNodeForTests(ROOT);
}

await test("state families classify lane identity as authoritative", () => {
  const lanes = STATE_FAMILIES.find((f) => f.id === "development_lanes");
  assert.equal(lanes.class, "AUTHORITATIVE");
  assert.equal(lanes.backup, true);
  const node = STATE_FAMILIES.find((f) => f.id === "execution_node");
  assert.equal(node.class, "EPHEMERAL");
  assert.equal(node.backup, false);
  const secrets = STATE_FAMILIES.find((f) => f.id === "api_token");
  assert.equal(secrets.backup, false);
});

await test("Vacilando specialist lane uses the same durable identity model", () => {
  reset();
  const first = ensureVacilandoSpecialistLane({ root: ROOT });
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.match(first.lane.lane_id, DURABLE_LANE_ID_RE);
  assert.equal(first.lane.name, VACILANDO_LANE_NAME);
  assert.equal(first.lane.work_class, WORK_CLASS_RUNTIME_SELF);
  assert.ok(first.lane.scarce_resource_priority < 0);
  const again = ensureVacilandoSpecialistLane({ root: ROOT });
  assert.equal(again.created, false);
  assert.equal(again.lane.lane_id, first.lane.lane_id);
  assert.equal(findVacilandoSpecialistLane(ROOT).lane_id, first.lane.lane_id);
});

await test("runtime_self work is lower scarce-resource priority than product work", () => {
  reset();
  const product = createDurableLane({
    name: "Communications",
    binding: { worktree_path: WT_A, worktree_name: "wt-product" },
    root: ROOT,
  });
  const vac = ensureVacilandoSpecialistLane({ root: ROOT });
  assert.ok(product.ok && vac.ok);
  assert.equal(scarceResourcePriorityForLane(product.lane.lane_id, ROOT), 0);
  assert.ok(scarceResourcePriorityForLane(vac.lane.lane_id, ROOT) < 0);
  const admP = createAdmissionRequest({ laneId: product.lane.lane_id, root: ROOT });
  const admV = createAdmissionRequest({ laneId: vac.lane.lane_id, root: ROOT });
  assert.ok(admP.request.priority > admV.request.priority);
});

await test("binding records node_id rather than assuming the local host", () => {
  reset();
  const node = ensureLocalNode({ root: ROOT, name: "source-host" });
  const created = createDurableLane({
    name: "Access & Identity",
    binding: { worktree_path: WT_A, worktree_name: "wt-product", tmux_session: "alloy-identity", slot: 1 },
    root: ROOT,
  });
  assert.equal(created.lane.binding.node_id, node.node_id);
  assert.equal(created.lane.binding.status, "bound");
  assert.equal(created.lane.binding.stale, false);
});

await test("host rebind keeps lane_id and does not mutate git", () => {
  reset();
  const created = createDurableLane({
    name: "Communications",
    binding: { worktree_path: WT_A, tmux_session: "alloy-communications", slot: 3 },
    root: ROOT,
  });
  const laneId = created.lane.lane_id;
  const extra = join(ROOT, "wt-fresh");
  mkdirSync(extra, { recursive: true });
  const rebound = rebindDurableLane(laneId, {
    worktree_path: extra,
    worktree_name: "wt-fresh",
    tmux_session: "alloy-communications-2",
    slot: 2,
  }, { root: ROOT });
  assert.equal(rebound.ok, true);
  assert.equal(rebound.lane.lane_id, laneId);
  assert.equal(rebound.git_mutated, false);
  assert.equal(rebound.lane.binding.worktree_path, extra);
  assert.equal(HOST_REBIND_CONTRACT.implemented, true);
  assert.equal(getDurableLane(laneId, ROOT).name, "Communications");
});

await test("backup/restore preserves lane ids and historical runs; invalidates host bindings", () => {
  reset();
  const product = createDurableLane({
    name: "Access & Identity",
    aliases: ["alloy-identity"],
    binding: { worktree_path: WT_A, tmux_session: "alloy-identity", slot: 1 },
    root: ROOT,
  });
  const vac = ensureVacilandoSpecialistLane({ root: ROOT });
  const run = createQueuedRun({
    laneId: product.lane.lane_id,
    instruction: "Prove durable identity survives restore.",
    root: ROOT,
  });
  assert.equal(run.ok, true);
  const before = laneIdentitySnapshot(ROOT);
  const sourceNode = localNodeId(ROOT);

  const bak = backupDurableState({ sourceRoot: ROOT, backupRoot: BAK });
  assert.equal(bak.ok, true);
  assert.equal(verifyBackup(bak.path).ok, true);
  const manifest = JSON.parse(readFileSync(join(bak.path, "MANIFEST.json"), "utf8"));
  assert.ok(!manifest.copied_roots.includes("node.json"));
  assert.ok(!manifest.copied_roots.includes("api-token"));

  const restored = restoreDurableState({ backupPath: bak.path, destRoot: DEST });
  assert.equal(restored.ok, true);
  assert.equal(restored.git_mutated, false);
  assert.notEqual(restored.node_id, sourceNode);
  const after = laneIdentitySnapshot(DEST);
  const preserved = assertLaneIdentitiesPreserved(before, after);
  assert.equal(preserved.ok, true, JSON.stringify(preserved));

  const destProduct = getDurableLane(product.lane.lane_id, DEST);
  assert.equal(destProduct.name, "Access & Identity");
  assert.equal(destProduct.binding.stale, true);
  assert.equal(destProduct.binding.tmux_session, null);
  assert.equal(destProduct.binding.slot, null);
  assert.equal(destProduct.binding.status, "stale");

  const destVac = getDurableLane(vac.lane.lane_id, DEST);
  assert.equal(destVac.name, VACILANDO_LANE_NAME);
  assert.equal(destVac.work_class, WORK_CLASS_RUNTIME_SELF);

  const runs = listExecutionRunsForLane(product.lane.lane_id, DEST);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].run_id, run.run.run_id);
  assert.equal(runs[0].lane_id, product.lane.lane_id);
});

await test("restored lane can receive a fresh binding without becoming a new lane", () => {
  const lanes = listDurableLanes(DEST);
  const product = lanes.find((l) => l.name === "Access & Identity");
  assert.ok(product);
  const rebound = bindDurableLane(product.lane_id, {
    worktree_path: WT_B,
    worktree_name: "wt-rebind",
    tmux_session: "alloy-identity",
    slot: 1,
  }, { root: DEST });
  assert.equal(rebound.ok, true);
  assert.equal(rebound.lane.lane_id, product.lane_id);
  assert.equal(rebound.lane.binding.stale, false);
  assert.equal(rebound.lane.binding.worktree_path, WT_B);
  assert.equal(rebound.lane.binding.node_id, localNodeId(DEST));
  assert.equal(listDurableLanes(DEST).filter((l) => l.name === "Access & Identity").length, 1);
});

await test("restore does not mutate git in the isolated worktree", () => {
  execFileSync("git", ["init", "-q"], { cwd: WT_B });
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: WT_B, encoding: "utf8" });
  assert.equal(status, "");
});

await test("Gateway modules can read restored state", () => {
  const lanes = listDurableLanes(DEST);
  assert.ok(lanes.some((l) => l.name === VACILANDO_LANE_NAME));
  assert.ok(lanes.some((l) => l.name === "Access & Identity"));
  const node = publicExecutionNode(getLocalNode(DEST));
  assert.match(node.node_id, /^node_/);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
rmSync(ROOT, { recursive: true, force: true });
rmSync(DEST, { recursive: true, force: true });
rmSync(BAK, { recursive: true, force: true });
process.exit(0);
