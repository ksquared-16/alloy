#!/usr/bin/env node
/**
 * THE CONTROL PLANE MUST NOT REWRITE WHAT ALREADY HAPPENED.
 *
 * Three defects, each measured on this host, each about the runtime telling the
 * operator something that was not true:
 *
 *  1. A run went QUEUED -> EXECUTING -> NEEDS_INPUT -> FAILED and the failure
 *     reason printed back was the run's own needs-input reason. "I need a
 *     Director decision" and "execution failed" became the same sentence.
 *  2. gar_f9e6b6cfd1143b was approved and EXECUTED, and a deny arriving three
 *     minutes later rewrote the materialized record from complete/approved to
 *     failed/denied. The append-only audit still held the truth; the record did
 *     not.
 *  3. Two pushes of one commit to DIFFERENT branches collapsed into one
 *     governed request, because the dedupe identity was PR + SHA and a push has
 *     no PR. The second request returned the first's verdict.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-control-plane-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_WORKTREE_ROOT = join(ROOT, "worktrees");
process.env.VACILANDO_DURABLE_LANES = "1";
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
mkdirSync(join(ROOT, "metadata"), { recursive: true });

const {
  requestGovernedAction, denyGovernedAction, approveGovernedAction,
  getGovernedAction, GOVERNED_TERMINAL_ERROR,
} = await import("../lib/vacilando/governed-action-request.mjs");
const { createDurableLane, bindDurableLane } = await import("../lib/vacilando/development-lane.mjs");
const { repositoryStorePath } = await import("../lib/vacilando/repository-registry.mjs");
const { createQueuedRun, transitionExecutionRun, getExecutionRun } =
  await import("../lib/vacilando/execution-run.mjs");
const { reconcileNeedsInputWithoutInput } = await import("../lib/vacilando/operator-input.mjs");
const { reconcileUndeliveredRuns } = await import("../lib/vacilando/execution-stale.mjs");

const REPO = "ksquared-16/alloy";
const SHA = "7d683c6c5d8fe38004d93b34aaec0d30aa596d62";

writeFileSync(repositoryStorePath(ROOT), `${JSON.stringify({
  schema_version: "vacilando.repository.v1",
  repositories: {
    repo_alloy: {
      schema_version: "vacilando.repository.v1",
      repository_id: "repo_alloy", name: "Alloy", profile: "alloy", state: "ACTIVE",
      root: join(ROOT, "r"), git_common_dir: join(ROOT, "r", ".git"),
      worktree_parent: join(ROOT, "worktrees"), default_branch: "origin/staging",
      remote: "git@github.com:ksquared-16/alloy.git",
      created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
    },
  },
}, null, 2)}\n`, "utf8");

const WT = join(ROOT, "worktrees", "wt1-cp");
mkdirSync(WT, { recursive: true });
writeFileSync(join(ROOT, "metadata", "wt1-cp.env"), [
  "ALLOY_WORKTREE_SLOT=1", `ALLOY_WORKTREE_PATH=${WT}`, "PORT=3011",
  "ALLOY_WORKER_LIFECYCLE=active", "",
].join("\n"), "utf8");
const made = createDurableLane({ name: "Control Plane", repository_id: "repo_alloy", root: ROOT });
const LANE = made.lane?.lane_id || made.lane_id;
bindDurableLane(LANE, {
  type: "alloy_local", worktree_path: WT, worktree_name: "wt1-cp",
  branch: "agent/claude/1-cp", slot: 1, provider: "claude",
}, { root: ROOT });

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

function pushRequest(branch, sha = SHA, purpose = "certification push") {
  return requestGovernedAction({
    action_key: "repository.push",
    lane_id: LANE,
    target: "staging",
    purpose,
    reason_worker_cannot_execute: "pushing needs trusted-host credentials",
    worktree_path: WT,
    inputs: { repository: REPO, branch, expectedHeadSha: sha, worktreePath: WT },
  }, { root: ROOT, processNow: false });
}

// -------------------------------------------------------------- NEEDS_INPUT

await test("a run waits in NEEDS_INPUT across governor cycles with no mutation", async () => {
  const made2 = createQueuedRun({ laneId: LANE, instruction: "do the work", root: ROOT });
  const runId = made2.run.run_id;
  assert.equal(getExecutionRun(runId, ROOT).state, "QUEUED");
  transitionExecutionRun(runId, "EXECUTING", { origin: "system", root: ROOT });
  transitionExecutionRun(runId, "NEEDS_INPUT", {
    reason: "Which promotion branch should this land on?", origin: "agent", root: ROOT,
  });
  // A real operator question: an agent report with choices IS actionable input.
  const { patchRunFields } = await import("../lib/vacilando/execution-run.mjs");
  patchRunFields(runId, {
    agent_report: { type: "needs_input", report_id: "arep_cp", message: "Which branch?", choices: [{ id: "a", label: "A" }] },
  }, { root: ROOT });

  // Several governor cycles. Nothing about time makes a question a failure.
  for (let i = 0; i < 4; i += 1) {
    reconcileNeedsInputWithoutInput({ root: ROOT });
    reconcileUndeliveredRuns({ root: ROOT, nowMs: Date.now() });
    const now = getExecutionRun(runId, ROOT);
    assert.equal(now.state, "NEEDS_INPUT", `cycle ${i} moved the run to ${now.state}`);
    assert.equal(now.state_reason, "Which promotion branch should this land on?",
      "the blocker must still be readable, and must not have become a failure reason");
  }

  // The blocker clears; the run finishes normally.
  assert.equal(transitionExecutionRun(runId, "EXECUTING", { reason: "answered", origin: "operator", root: ROOT }).ok, true);
  assert.equal(transitionExecutionRun(runId, "COMPLETE", { reason: "done", origin: "agent", root: ROOT }).ok, true);
  assert.equal(getExecutionRun(runId, ROOT).state, "COMPLETE");
});

await test("stale detection is NOT weakened: an undelivered run still fails", () => {
  const made3 = createQueuedRun({ laneId: LANE, instruction: "second", root: ROOT });
  const runId = made3.run.run_id;
  transitionExecutionRun(runId, "EXECUTING", { origin: "system", root: ROOT });
  const out = reconcileUndeliveredRuns({ root: ROOT, nowMs: Date.now() + 60 * 60 * 1000 });
  assert.equal(out.failed.length, 1, "a genuinely undelivered run must still be collected");
  assert.equal(getExecutionRun(runId, ROOT).state, "FAILED");
});

// ------------------------------------------------------- TERMINAL IMMUTABLE

await test("a late deny cannot rewrite a governed action that already executed", async () => {
  const out = pushRequest("promote/terminal-a");
  const id = out.request.request_id;
  const rec = getGovernedAction(id, ROOT);
  rec.status = "complete";
  rec.execution_started_at = new Date().toISOString();
  rec.operator_approval = { decision: "approved", actor: "operator", at: new Date().toISOString() };
  const { saveGovernedActionForTests } = await import("../lib/vacilando/governed-action-request.mjs")
    .then((m) => ({ saveGovernedActionForTests: m.saveGovernedActionForTests || null }));
  if (saveGovernedActionForTests) saveGovernedActionForTests(rec, ROOT);
  else {
    const p = join(ROOT, "vacilando", "governed-actions", "requests.json");
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const all = raw.requests || raw;
    if (Array.isArray(all)) {
      const i = all.findIndex((x) => x.request_id === id);
      all[i] = rec;
    } else all[id] = rec;
    writeFileSync(p, JSON.stringify(raw, null, 2));
  }

  const denied = denyGovernedAction(id, { actor: "operator", reason: "late deny", root: ROOT });
  assert.equal(denied.ok, false, "a deny after execution must be refused");
  assert.equal(denied.error, GOVERNED_TERMINAL_ERROR);
  assert.equal(denied.terminal_state, "complete");

  const after = getGovernedAction(id, ROOT);
  assert.equal(after.status, "complete", "execution truth is immutable");
  assert.equal(after.operator_approval.decision, "approved", "the operator decision was not rewritten");
});

await test("a late approve cannot resurrect an action that failed IN execution", async () => {
  const out = pushRequest("promote/terminal-b");
  const id = out.request.request_id;
  const p = join(ROOT, "vacilando", "governed-actions", "requests.json");
  const raw = JSON.parse(readFileSync(p, "utf8"));
  const all = raw.requests || raw;
  const rec = Array.isArray(all) ? all.find((x) => x.request_id === id) : all[id];
  rec.status = "failed";
  rec.failure_code = "execution_failed";
  rec.execution_started_at = new Date().toISOString();
  writeFileSync(p, JSON.stringify(raw, null, 2));

  const approved = await approveGovernedAction(id, { actor: "operator", root: ROOT });
  assert.equal(approved.ok, false);
  assert.equal(approved.error, GOVERNED_TERMINAL_ERROR);
  assert.equal(getGovernedAction(id, ROOT).status, "failed");
});

await test("a request that failed BEFORE executing is still reopenable", async () => {
  const out = pushRequest("promote/terminal-c");
  const id = out.request.request_id;
  const p = join(ROOT, "vacilando", "governed-actions", "requests.json");
  const raw = JSON.parse(readFileSync(p, "utf8"));
  const all = raw.requests || raw;
  const rec = Array.isArray(all) ? all.find((x) => x.request_id === id) : all[id];
  rec.status = "failed";
  rec.failure_code = "policy_denied";
  delete rec.execution_started_at;
  writeFileSync(p, JSON.stringify(raw, null, 2));
  // It never ran, so nothing about it is a fact yet.
  const approved = await approveGovernedAction(id, { actor: "operator", root: ROOT });
  assert.notEqual(approved.error, GOVERNED_TERMINAL_ERROR);
});

// ------------------------------------------------------------ PUSH IDENTITY

await test("the same commit on two branches is TWO governed requests", () => {
  const a = pushRequest("promote/a", SHA, "push a");
  const b = pushRequest("promote/b", SHA, "push b");
  assert.equal(a.ok, true, a.error);
  assert.equal(b.ok, true, b.error);
  assert.notEqual(b.request.request_id, a.request.request_id,
    "a branch is part of a push's identity; these are different actions");
  assert.notEqual(b.deduped, true);
});

await test("the exact same push still dedupes", () => {
  const a = pushRequest("promote/same", SHA, "push same");
  const b = pushRequest("promote/same", SHA, "push same");
  assert.equal(b.deduped, true, "an identical proposal is the same work");
  assert.equal(b.request.request_id, a.request.request_id);
});

await test("a different commit on one branch is a different request", () => {
  const other = "1f2e3d4c5b6a798877665544332211009988aabb";
  const a = pushRequest("promote/moved", SHA, "push moved");
  const b = pushRequest("promote/moved", other, "push moved");
  assert.notEqual(b.request.request_id, a.request.request_id, "a moved branch is a different decision");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
