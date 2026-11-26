#!/usr/bin/env node
/**
 * Durable Development Lane identity + Connect Existing Work.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DURABLE_LANE_ID_RE,
  IDENTITY_LANE_NAME,
  IDENTITY_TMUX,
  adoptLegacyIdentityLane,
  canonicalLaneStoreId,
  connectExistingWork,
  createDurableLane,
  findLaneByBinding,
  getDurableLane,
  isRuntimeAdoptionBlocked,
  listDurableLanes,
  remapGovernorLaneIdentity,
  renameDurableLane,
  resetDevelopmentLanesForTests,
  validateLaneName,
} from "../lib/vacilando/development-lane.mjs";
import { candidateIdFor, parseCandidateId } from "../lib/vacilando/alloy-dev-adapter.mjs";
import { activeRunForLane, createQueuedRun } from "../lib/vacilando/execution-run.mjs";
import { createAgentSession, listAgentSessionsForLane } from "../lib/vacilando/agent-session.mjs";
import { connectExistingWorkRequest } from "../lib/vacilando/lane-identity-api.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "vac-durable-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";

const WT_A = join(ROOT, "wt1-access-identity-v2");
const WT_B = join(ROOT, "wt3-communications-inbound-sms");
const WT_RUNTIME = join(ROOT, "wt5-runtime-performance-ux");
mkdirSync(WT_A, { recursive: true });
mkdirSync(WT_B, { recursive: true });
mkdirSync(WT_RUNTIME, { recursive: true });

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
}

await test("lane id independent of name", () => {
  reset();
  const a = createDurableLane({ name: "Communications", binding: { worktree_path: WT_B, worktree_name: "wt3-communications-inbound-sms" }, root: ROOT });
  assert.equal(a.ok, true);
  assert.match(a.lane.lane_id, DURABLE_LANE_ID_RE);
  const renamed = renameDurableLane(a.lane.lane_id, "Ops Comms", { root: ROOT });
  assert.equal(renamed.lane.lane_id, a.lane.lane_id);
  assert.equal(renamed.lane.name, "Ops Comms");
});

await test("lane id independent of tmux and worktree", () => {
  reset();
  const a = createDurableLane({
    name: "Access & Identity",
    aliases: ["alloy-identity"],
    binding: { worktree_path: WT_A, worktree_name: "wt1-access-identity-v2", tmux_session: "alloy-identity" },
    root: ROOT,
  });
  assert.notEqual(a.lane.lane_id, "alloy-identity");
  assert.notEqual(a.lane.lane_id, "wt1-access-identity-v2");
  assert.equal(getDurableLane("alloy-identity", ROOT).lane_id, a.lane.lane_id);
});

await test("rename does not mutate substrate", () => {
  reset();
  const a = createDurableLane({ name: "Access Identity V2", binding: { worktree_path: WT_A, tmux_session: "alloy-identity" }, root: ROOT });
  const out = renameDurableLane(a.lane.lane_id, "Access & Identity", { root: ROOT });
  assert.equal(out.ok, true);
  assert.equal(out.substrate_mutated, false);
  assert.equal(out.lane.binding.tmux_session, "alloy-identity");
  assert.equal(out.lane.binding.worktree_path, WT_A);
});

await test("duplicate names are allowed and are not identity", () => {
  reset();
  const extra = join(ROOT, "wt-extra");
  mkdirSync(extra, { recursive: true });
  const a = createDurableLane({ name: "Communications", binding: { worktree_path: WT_B }, root: ROOT });
  const b = createDurableLane({ name: "Communications", binding: { worktree_path: extra }, root: ROOT });
  assert.equal(a.ok && b.ok, true);
  assert.notEqual(a.lane.lane_id, b.lane.lane_id);
});

await test("durable identity survives restart (reload store)", () => {
  reset();
  const a = createDurableLane({ name: "Access & Identity", binding: { worktree_path: WT_A }, root: ROOT });
  const again = getDurableLane(a.lane.lane_id, ROOT);
  assert.equal(again.name, "Access & Identity");
  assert.equal(listDurableLanes(ROOT).length, 1);
});

await test("existing alloy-identity migrates without recreation", () => {
  reset();
  const first = adoptLegacyIdentityLane({
    observation: {
      worktree: { path: WT_A, name: "wt1-access-identity-v2" },
      git: { branch: "agent/claude/1-access-identity-v2" },
      tmux: { pane_id: "%1", session: IDENTITY_TMUX },
      slot: 1,
    },
    root: ROOT,
  });
  assert.equal(first.ok, true);
  assert.equal(first.migrated, true);
  assert.equal(first.lane.name, IDENTITY_LANE_NAME);
  const second = adoptLegacyIdentityLane({ observation: { worktree: { path: WT_A }, tmux: { session: IDENTITY_TMUX } }, root: ROOT });
  assert.equal(second.migrated, false);
  assert.equal(second.lane.lane_id, first.lane.lane_id);
});

await test("Execution Run remains attached after remap", () => {
  reset();
  const created = adoptLegacyIdentityLane({
    observation: { worktree: { path: WT_A, name: "wt1-access-identity-v2" }, tmux: { session: IDENTITY_TMUX }, slot: 1 },
    root: ROOT,
  });
  const run = createQueuedRun({ laneId: IDENTITY_TMUX, instruction: "hello", worktreePath: WT_A, root: ROOT });
  assert.equal(run.ok, true);
  remapGovernorLaneIdentity(IDENTITY_TMUX, created.lane.lane_id, ROOT);
  const active = activeRunForLane(created.lane.lane_id, ROOT);
  assert.equal(active?.run_id, run.run.run_id);
  assert.equal(activeRunForLane(IDENTITY_TMUX, ROOT)?.run_id, run.run.run_id);
});

await test("Agent Session remains attached after remap", () => {
  reset();
  const created = adoptLegacyIdentityLane({
    observation: { worktree: { path: WT_A }, tmux: { session: IDENTITY_TMUX } },
    root: ROOT,
  });
  const sess = createAgentSession({ laneId: IDENTITY_TMUX, root: ROOT });
  assert.equal(sess.ok, true);
  remapGovernorLaneIdentity(IDENTITY_TMUX, created.lane.lane_id, ROOT);
  const list = listAgentSessionsForLane(created.lane.lane_id, ROOT);
  assert.equal(list.some((s) => s.agent_session_id === sess.session.agent_session_id), true);
});

await test("candidate ids are names not paths", () => {
  assert.equal(candidateIdFor("wt3-communications-inbound-sms"), "cand_wt3-communications-inbound-sms");
  assert.equal(parseCandidateId("cand_wt3-communications-inbound-sms"), "wt3-communications-inbound-sms");
  assert.equal(parseCandidateId("/tmp/evil"), null);
  assert.equal(candidateIdFor("../etc"), null);
});

await test("arbitrary filesystem path refused", async () => {
  const out = await connectExistingWorkRequest({ candidate_id: "cand_wt3-communications-inbound-sms", name: "Communications", worktree_path: "/tmp/evil" });
  assert.equal(out.body.error, "path_refused");
  const slash = await connectExistingWorkRequest({ candidate_id: "cand_/tmp/x", name: "X" });
  assert.equal(slash.body.error, "path_refused");
});

await test("existing tmux/worktree adopted without substrate mutation", () => {
  reset();
  const out = connectExistingWork({
    candidate: {
      worktree_path: WT_B,
      worktree_name: "wt3-communications-inbound-sms",
      branch: "agent/claude/3-communications-inbound-sms",
      tmux_session: null,
      slot: 3,
      suggested_name: "Communications",
    },
    name: "Communications",
    root: ROOT,
  });
  assert.equal(out.ok, true);
  assert.equal(out.substrate_mutated, false);
  assert.equal(out.start_claude_implemented, false);
  assert.equal(out.lane.name, "Communications");
  assert.match(out.lane.lane_id, DURABLE_LANE_ID_RE);
});

await test("already-connected candidate refused", () => {
  reset();
  const first = connectExistingWork({
    candidate: { worktree_path: WT_B, worktree_name: "wt3-communications-inbound-sms" },
    name: "Communications",
    root: ROOT,
  });
  const second = connectExistingWork({
    candidate: { worktree_path: WT_B, worktree_name: "wt3-communications-inbound-sms" },
    name: "Communications 2",
    root: ROOT,
  });
  assert.equal(second.ok, false);
  assert.equal(second.error, "already_connected");
  assert.equal(second.lane_id, first.lane.lane_id);
  assert.equal(findLaneByBinding({ worktreePath: WT_B, root: ROOT }).lane_id, first.lane.lane_id);
});

await test("control-plane runtime adoption is blocked; product runtime sprints are not", () => {
  assert.equal(isRuntimeAdoptionBlocked({ tmux_session: "alloy-runtime" }), true);
  assert.equal(isRuntimeAdoptionBlocked({ worktree_name: "wt-runtime", worktree_path: join(ROOT, "wt-runtime") }), true);
  assert.equal(isRuntimeAdoptionBlocked({
    worktree_name: "wt5-runtime-performance-ux-completion",
    worktree_path: WT_RUNTIME,
  }), false);
  reset();
  const blocked = connectExistingWork({
    candidate: { worktree_path: join(ROOT, "wt-runtime"), worktree_name: "wt-runtime", tmux_session: "alloy-runtime" },
    name: "Runtime Host",
    root: ROOT,
  });
  assert.equal(blocked.error, "runtime_adoption_blocked");
  mkdirSync(WT_RUNTIME, { recursive: true });
  const allowed = connectExistingWork({
    candidate: { worktree_path: WT_RUNTIME, worktree_name: "wt5-runtime-performance-ux-completion" },
    name: "Runtime Performance + UX Completion",
    root: ROOT,
  });
  assert.equal(allowed.ok, true, allowed.error);
});

await test("canonicalLaneStoreId maps alias after migrate", () => {
  reset();
  const created = adoptLegacyIdentityLane({
    observation: { worktree: { path: WT_A }, tmux: { session: IDENTITY_TMUX } },
    root: ROOT,
  });
  assert.equal(canonicalLaneStoreId(IDENTITY_TMUX, ROOT), created.lane.lane_id);
  assert.equal(canonicalLaneStoreId(created.lane.lane_id, ROOT), created.lane.lane_id);
});

await test("validateLaneName", () => {
  assert.equal(validateLaneName("").ok, false);
  assert.equal(validateLaneName("Access & Identity").ok, true);
  assert.equal(validateLaneName("x".repeat(81)).ok, false);
});

rmSync(ROOT, { recursive: true, force: true });

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
