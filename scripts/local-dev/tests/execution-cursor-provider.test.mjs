#!/usr/bin/env node
/**
 * Cursor is a supported execution provider. Adopting a worktree does not
 * mint a new lane type. Binding Vacilando to Cursor keeps lane_id.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.VACILANDO_SKIP_NODE_PROBE = "1";
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_ADMISSION_PROVISION = "0";

const ROOT = mkdtempSync(join(tmpdir(), "vac-cursor-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.HOME = ROOT;
process.env.ALLOY_CONFIG_FILE = join(ROOT, ".config", "alloy-dev", "config");

const WT4 = join(ROOT, "Code", "alloy-worktrees", "wt4-enrollment-phase2-participant-anchor");
const WT1 = join(ROOT, "Code", "alloy-worktrees", "wt1-vacilando-mac-mini-readiness");
mkdirSync(WT4, { recursive: true });
mkdirSync(WT1, { recursive: true });
mkdirSync(join(ROOT, "metadata"), { recursive: true });
mkdirSync(join(ROOT, ".config", "alloy-dev"), { recursive: true });
writeFileSync(join(ROOT, ".config", "alloy-dev", "config"), [
  `ALLOY_REPO="${ROOT}/Alloy"`,
  `ALLOY_WORKTREE_ROOT="${ROOT}/Code/alloy-worktrees"`,
  `ALLOY_RUNTIME_ROOT="${ROOT}"`,
  "",
].join("\n"));
writeFileSync(join(ROOT, "metadata", "wt4-enrollment-phase2-participant-anchor.env"), [
  'ALLOY_WORKTREE_NAME="wt4-enrollment-phase2-participant-anchor"',
  'ALLOY_WORKTREE_SLOT="4"',
  `ALLOY_WORKTREE_PATH="${WT4}"`,
  'ALLOY_WORKTREE_BRANCH="agent/claude/4-enrollment-phase2-participant-anchor"',
  'ALLOY_AGENT="claude"',
  'ALLOY_SPRINT_NAME="enrollment-phase2-participant-anchor"',
  'ALLOY_WORKER_LIFECYCLE="active"',
  "",
].join("\n"));
writeFileSync(join(ROOT, "metadata", "wt1-vacilando-mac-mini-readiness.env"), [
  'ALLOY_WORKTREE_NAME="wt1-vacilando-mac-mini-readiness"',
  'ALLOY_WORKTREE_SLOT="1"',
  `ALLOY_WORKTREE_PATH="${WT1}"`,
  'ALLOY_WORKTREE_BRANCH="agent/cursor/1-vacilando-mac-mini-readiness"',
  'ALLOY_AGENT="cursor"',
  'ALLOY_SPRINT_NAME="vacilando-mac-mini-readiness"',
  'ALLOY_WORKER_LIFECYCLE="active"',
  "",
].join("\n"));

const { normalizeExecutionProvider } = await import("../lib/vacilando/execution-providers.mjs");
const { createAdmissionRequest, resetAdmissionsForTests } = await import("../lib/vacilando/execution-admission.mjs");
const { createDurableLane, ensureVacilandoSpecialistLane, resetDevelopmentLanesForTests } = await import("../lib/vacilando/development-lane.mjs");
const { cmdAdoptWorktree, cmdAttachCursorSession } = await import("../lib/vacilando/commands/node-ops.mjs");
const { resetAgentSessionsForTests, activeAgentSessionForLane } = await import("../lib/vacilando/agent-session.mjs");
const {
  attachLaneAgentSessions,
  startLaneAgentSession,
  setAgentSessionLifecycleImplForTests,
  resetAgentSessionLifecycleForTests,
} = await import("../lib/vacilando/agent-session-lifecycle.mjs");
const { resetAlloyAdapterImplForTests, setAlloyAdapterImplForTests } = await import("../lib/vacilando/alloy-dev-adapter.mjs");

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

await test("cursor is a supported execution provider; openai is not", () => {
  assert.equal(normalizeExecutionProvider("cursor"), "cursor");
  assert.equal(normalizeExecutionProvider("cursor-agent"), "cursor");
  assert.equal(normalizeExecutionProvider("claude"), "claude");
  assert.equal(normalizeExecutionProvider("openai"), null);
});

await test("admission accepts cursor and refuses unknown providers", () => {
  resetDevelopmentLanesForTests(ROOT);
  resetAdmissionsForTests(ROOT);
  const lane = createDurableLane({ name: "Vacilando", work_class: "runtime_self", root: ROOT });
  const ok = createAdmissionRequest({ laneId: lane.lane.lane_id, provider: "cursor", root: ROOT });
  assert.equal(ok.ok, true);
  assert.equal(ok.request.provider, "cursor");
  const no = createAdmissionRequest({ laneId: lane.lane.lane_id, provider: "openai", root: ROOT });
  assert.equal(no.ok, false);
  assert.equal(no.error, "unsupported_provider");
});

await test("adopting enrollment worktree creates a durable lane without git mutation", () => {
  resetDevelopmentLanesForTests(ROOT);
  const out = cmdAdoptWorktree({
    name: "Enrollment",
    worktree: "wt4-enrollment-phase2-participant-anchor",
    root: ROOT,
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.created, true);
  assert.equal(out.git_mutated, false);
  assert.equal(out.lane.name, "Enrollment");
  assert.equal(out.lane.binding.worktree_name, "wt4-enrollment-phase2-participant-anchor");
  assert.equal(out.lane.binding.provider, "claude");
  assert.equal(out.lane.binding.slot, 4);
  const again = cmdAdoptWorktree({
    name: "Enrollment",
    worktree: "wt4-enrollment-phase2-participant-anchor",
    root: ROOT,
  });
  assert.equal(again.already_connected, true);
  assert.equal(again.lane.lane_id, out.lane.lane_id);
});

await test("Vacilando lane binds this Cursor worktree without becoming a new lane", () => {
  resetDevelopmentLanesForTests(ROOT);
  try { resetAgentSessionsForTests(ROOT); } catch { /* optional */ }
  const vac = ensureVacilandoSpecialistLane({ root: ROOT });
  const laneId = vac.lane.lane_id;
  const out = cmdAttachCursorSession({
    laneId,
    worktree: "wt1-vacilando-mac-mini-readiness",
    providerSessionId: "7ec93a3d-0d28-4b05-b78b-86761d3048f8",
    root: ROOT,
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.lane.lane_id, laneId);
  assert.equal(out.lane.binding.provider, "cursor");
  assert.equal(out.lane.binding.worktree_name, "wt1-vacilando-mac-mini-readiness");
  assert.equal(out.session.provider, "cursor");
  assert.equal(out.session.provider_session_id, "7ec93a3d-0d28-4b05-b78b-86761d3048f8");
  assert.equal(out.session.state, "ACTIVE");
  assert.equal(activeAgentSessionForLane(laneId, ROOT).lane_id, laneId);
});

await test("Start Session on a Cursor-bound lane attaches without Claude capacity", async () => {
  resetDevelopmentLanesForTests(ROOT);
  resetAgentSessionsForTests(ROOT);
  resetAgentSessionLifecycleForTests();
  resetAlloyAdapterImplForTests();
  setAlloyAdapterImplForTests({
    listPanes: () => {
      throw new Error("Cursor start must not inspect Claude tmux panes");
    },
  });
  setAgentSessionLifecycleImplForTests({
    startRuntime: async () => {
      throw new Error("Cursor start must not spawn tmux Claude");
    },
    spawnClaude: () => {
      throw new Error("Cursor start must not spawn Claude");
    },
  });
  const vac = ensureVacilandoSpecialistLane({ root: ROOT });
  const bound = cmdAttachCursorSession({
    laneId: vac.lane.lane_id,
    worktree: "wt1-vacilando-mac-mini-readiness",
    providerSessionId: "conv-cursor-1",
    root: ROOT,
  });
  assert.equal(bound.ok, true, bound.error);
  const start = await startLaneAgentSession({ laneId: vac.lane.lane_id, root: ROOT });
  assert.equal(start.ok, true, start.error);
  assert.equal(start.provider, "cursor");
  assert.equal(start.adopted, true);
  assert.equal(start.queued, undefined);
  const [projected] = attachLaneAgentSessions([{
    lane_id: vac.lane.lane_id,
    durable: true,
    binding: bound.lane.binding,
    worktree: { path: WT1 },
    claude: { presence: "absent" },
    tmux: { alive: false },
  }], ROOT);
  assert.equal(projected.runtime, "online");
  assert.equal(projected.agent_session?.provider, "cursor");
  assert.equal(projected.agent_session?.state, "ACTIVE");
  assert.equal(projected.start_session, null);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
rmSync(ROOT, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
