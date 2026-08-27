#!/usr/bin/env node
/**
 * Phase 1 — Execution Run store, state machine, managed send, worker report.
 * Isolated runtime only. Does not attach to live Claude or mutate resource leases.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXECUTION_RUN_MAX_PER_LANE,
  activeRunForLane,
  attachLaneRuns,
  createQueuedRun,
  executionEnvelope,
  executionRunEventsPath,
  executionRunStorePath,
  findExecutionRun,
  inspectLaneRun,
  lastInstructionFromRun,
  getExecutionRun,
  isLegalRunTransition,
  listExecutionRunsForLane,
  publicExecutionRun,
  readExecutionRunStore,
  reportRunState,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import { deliverManagedLaneInstruction, laneInstructionHttpStatus } from "../lib/vacilando/execution-run-send.mjs";
import { resetLaneSendStateForTests, sendLaneInstruction, wouldDuplicateLaneSend } from "../lib/vacilando/lanes.mjs";
import { recordDeliveredInstruction, attachLaneInstructions } from "../lib/vacilando/lane-runtime.mjs";
import { stopAllOutputWatches } from "../lib/vacilando/lane-notify.mjs";
import { getCommand } from "../lib/vacilando/commands/registry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = mkdtempSync(join(tmpdir(), "vac-erun-"));
const WT = mkdtempSync(join(tmpdir(), "vac-erun-wt-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "0";

const IDENTITY_WT = "/Users/Kelly/Code/alloy-worktrees/wt1-access-identity-v2";
const WT_ROOT = "/Users/Kelly/Code/alloy-worktrees";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
  resetLaneSendStateForTests();
  stopAllOutputWatches();
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  } finally {
    stopAllOutputWatches();
  }
}

function paneLine({
  session = "alloy-identity",
  window = "0",
  pane = "0",
  paneId = "%1",
  pid = "7093",
  dead = "0",
  command = "2.1.220",
  cwd = IDENTITY_WT,
  title = "_ Access Identity V2",
} = {}) {
  return [session, window, pane, paneId, pid, dead, "0", "1786985224", command, cwd, title].join("|");
}

function recordingTmux() {
  const calls = [];
  const tmux = async (argv, opts = {}) => {
    calls.push({ argv: [...argv], input: opts.input ?? null });
    return { ok: true, stdout: "", stderr: "" };
  };
  return { tmux, calls };
}

function sendOpts({ stdout, extra = {} } = {}) {
  const rec = recordingTmux();
  return {
    listPanes: async () => ({ ok: true, stdout: stdout ?? paneLine() + "\n" }),
    gitFacts: async () => ({ git: "clean", ahead_behind: "45/0", branch: "agent/claude/1-access-identity-v2" }),
    metadata: [],
    worktreeRoot: WT_ROOT,
    cfg: { worktree_root: WT_ROOT },
    nowMs: Date.now(),
    tmux: rec.tmux,
    calls: rec.calls,
    writeAudit: (ev) => ({ id: "evt_test", ...ev }),
    root: ROOT,
    worktreePath: WT,
    ...extra,
  };
}

function quietGet() {
  return async () => ({ ok: true, text: "", fingerprint: "test-fp", captured_at: new Date().toISOString() });
}

function deliveredSend(payloads = []) {
  return async (laneId, instruction) => {
    payloads.push({ laneId, instruction });
    return {
      ok: true,
      schema_version: "vacilando.lane.send.v1",
      lane_id: laneId,
      status: "delivered",
      error: null,
      delivered_at: new Date().toISOString(),
      instruction_size: String(instruction).length,
      audit_id: "evt_test",
      worktree_path: WT,
    };
  };
}

async function startRun(instruction = "Finish the remaining Records/Roster work and validate it.", extra = {}) {
  const payloads = [];
  const out = await deliverManagedLaneInstruction("alloy-identity", instruction, {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: deliveredSend(payloads),
    nowMs: extra.nowMs || Date.now(),
    getOutput: extra.getOutput || quietGet(),
    notifyIntervalMs: 60_000,
  });
  return { out, payloads };
}

await test("successful operator instruction creates exactly one run bound to the lane", async () => {
  const { out, payloads } = await startRun();
  assert.equal(out.ok, true);
  assert.equal(out.status, "delivered");
  assert.equal(out.execution_run.state, "EXECUTING");
  assert.equal(out.execution_run.lane_id, "alloy-identity");
  assert.equal(out.execution_run.instruction, "Finish the remaining Records/Roster work and validate it.");
  assert.equal(listExecutionRunsForLane("alloy-identity", ROOT).length, 1);
  assert.equal(payloads.length, 1);
  assert.match(payloads[0].instruction, /Vacilando run erun_/);
  assert.match(payloads[0].instruction, /Approved instruction/);
  assert.match(payloads[0].instruction, /Finish the remaining Records\/Roster work/);
  assert.equal(payloads[0].instruction.includes("vac run-status"), true);
});

await test("operator instruction is stored exactly; envelope is delivery-only", async () => {
  const text = "Do not bury this prompt.";
  const { out, payloads } = await startRun(text);
  assert.equal(out.execution_run.instruction, text);
  assert.equal(payloads[0].instruction.startsWith("You are executing Vacilando run"), true);
  assert.equal(out.execution_run.instruction.includes("You are executing"), false);
});

await test("successful delivery transitions QUEUED → EXECUTING with timestamps", async () => {
  const now = Date.parse("2026-08-18T15:00:00.000Z");
  const { out } = await startRun("go", { nowMs: now });
  const run = listExecutionRunsForLane("alloy-identity", ROOT)[0];
  assert.equal(run.state, "EXECUTING");
  assert.equal(run.created_at, "2026-08-18T15:00:00.000Z");
  assert.equal(run.started_at, "2026-08-18T15:00:00.000Z");
  assert.equal(run.completed_at, null);
  const steps = run.transitions.map((t) => `${t.from_state}->${t.to_state}`);
  assert.deepEqual(steps, ["null->QUEUED", "QUEUED->EXECUTING"]);
  assert.equal(run.transitions[1].origin, "operator");
  assert.equal(run.transitions[1].reason, "instruction_delivered");
});

await test("failed delivery does not become EXECUTING; evidence is retained as FAILED", async () => {
  const out = await deliverManagedLaneInstruction("alloy-identity", "please deliver", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: async (laneId) => ({
      ok: false,
      schema_version: "vacilando.lane.send.v1",
      lane_id: laneId,
      status: "failed",
      error: "delivery_failed",
      delivered_at: new Date().toISOString(),
      instruction_size: 14,
      audit_id: "evt_test",
    }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "delivery_failed");
  assert.equal(out.execution_run.state, "FAILED");
  assert.equal(out.execution_run.started_at, null);
  assert.equal(activeRunForLane("alloy-identity", ROOT), null);
  const run = listExecutionRunsForLane("alloy-identity", ROOT)[0];
  assert.equal(run.state, "FAILED");
  assert.match(run.completion_report.summary, /delivery_failed/);
});

await test("duplicate send does not create a duplicate run", async () => {
  const opts = sendOpts({ extra: { duplicateWindowMs: 8000, nowMs: 1_700_000_000_000 } });
  const first = await sendLaneInstruction("alloy-identity", "same instruction", opts);
  assert.equal(first.ok, true);
  const second = await deliverManagedLaneInstruction("alloy-identity", "same instruction", {
    ...opts,
    nowMs: 1_700_000_000_100,
    duplicateWindowMs: 8000,
  });
  assert.equal(second.ok, false);
  assert.equal(second.error, "duplicate_send");
  assert.equal(listExecutionRunsForLane("alloy-identity", ROOT).length, 0);
  assert.equal(wouldDuplicateLaneSend("alloy-identity", "same instruction", 1_700_000_000_100, 8000), true);
});

await test("one active run per lane; second instruction is refused", async () => {
  await startRun("first job");
  const second = await deliverManagedLaneInstruction("alloy-identity", "second job", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: deliveredSend(),
    getOutput: quietGet(),
    notifyIntervalMs: 60_000,
  });
  assert.equal(second.ok, false);
  assert.equal(second.error, "current_run_active");
  assert.equal(laneInstructionHttpStatus(second), 409);
  assert.equal(listExecutionRunsForLane("alloy-identity", ROOT).length, 1);
});

await test("operator follow-up after grace closes leftover executing work", async () => {
  const { out } = await startRun("first job");
  const firstId = out.run_id;
  const second = await deliverManagedLaneInstruction("alloy-identity", "second job", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: deliveredSend(),
    getOutput: quietGet(),
    notifyIntervalMs: 60_000,
    nowMs: Date.now() + 30_000,
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.stale_run_closed, true);
  assert.notEqual(second.run_id, firstId);
  assert.equal(getExecutionRun(firstId, ROOT).state, "COMPLETE");
  assert.equal(getExecutionRun(firstId, ROOT).state_reason, "operator_follow_up");
  assert.equal(activeRunForLane("alloy-identity", ROOT).instruction, "second job");
});

await test("NEEDS_INPUT continues the same run instead of creating another", async () => {
  const { out } = await startRun("original");
  const id = out.run_id;
  const { submitAgentReport } = await import("../lib/vacilando/execution-run-report.mjs");
  const need = submitAgentReport(id, {
    type: "needs_input",
    message: "Which fixture?",
    cwd: WT,
    laneId: "alloy-identity",
    root: ROOT,
  });
  assert.equal(need.ok, true, need.error);
  assert.equal(need.run.state, "NEEDS_INPUT");
  const payloads = [];
  const cont = await deliverManagedLaneInstruction("alloy-identity", "Use the loopback fixture.", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: deliveredSend(payloads),
    getOutput: quietGet(),
    notifyIntervalMs: 60_000,
  });
  assert.equal(cont.ok, true);
  assert.equal(cont.run_id, id);
  assert.equal(cont.execution_run.state, "EXECUTING");
  assert.equal(listExecutionRunsForLane("alloy-identity", ROOT).length, 1);
  assert.equal(payloads[0].instruction, "Use the loopback fixture.");
  assert.equal(cont.execution_run.instruction, "original");
});

await test("legal transitions accepted; illegal rejected; terminals hold", async () => {
  const created = createQueuedRun({ laneId: "alloy-identity", instruction: "x", worktreePath: WT, root: ROOT });
  const id = created.run.run_id;
  assert.equal(isLegalRunTransition("QUEUED", "EXECUTING"), true);
  // QUEUED -> NEEDS_INPUT is legal since the ready-pane repair: an instruction
  // that could not be delivered because the pane showed a modal needs the
  // operator, and must not be forced through EXECUTING to say so.
  assert.equal(isLegalRunTransition("QUEUED", "NEEDS_INPUT"), true);
  assert.equal(isLegalRunTransition("QUEUED", "VALIDATING"), false);
  assert.equal(isLegalRunTransition("QUEUED", "COMPLETE"), false);
  assert.equal(transitionExecutionRun(id, "VALIDATING", { root: ROOT }).error, "illegal_transition");
  assert.equal(transitionExecutionRun(id, "EXECUTING", { root: ROOT, origin: "operator" }).ok, true);
  assert.equal(transitionExecutionRun(id, "VALIDATING", { root: ROOT, origin: "agent" }).ok, true);
  assert.equal(transitionExecutionRun(id, "WAITING_RESOURCE", { root: ROOT, reason: "validate lease", resource_wait: { key: "validate" } }).ok, true);
  assert.equal(transitionExecutionRun(id, "EXECUTING", { root: ROOT }).ok, true);
  assert.equal(transitionExecutionRun(id, "RECOVERING", { root: ROOT }).ok, true);
  assert.equal(transitionExecutionRun(id, "FAILED", { root: ROOT, origin: "agent", reason: "boom" }).ok, true);
  const term = transitionExecutionRun(id, "EXECUTING", { root: ROOT });
  assert.equal(term.ok, false);
  assert.equal(term.error, "illegal_transition");
  const again = createQueuedRun({ laneId: "alloy-identity", instruction: "y", worktreePath: WT, root: ROOT });
  assert.equal(again.ok, true);
  const id2 = again.run.run_id;
  assert.equal(transitionExecutionRun(id2, "EXECUTING", { root: ROOT }).ok, true);
  assert.equal(transitionExecutionRun(id2, "COMPLETE", { root: ROOT, completion_report: { summary: "done" } }).ok, true);
  assert.equal(transitionExecutionRun(id2, "FAILED", { root: ROOT }).error, "illegal_transition");
});

await test("transition audit is retained with who/when/why", async () => {
  const { out } = await startRun("audit me");
  reportRunState(out.run_id, "validating", { reason: "typecheck", origin: "agent", root: ROOT });
  reportRunState(out.run_id, "complete", { summary: "certified", origin: "agent", root: ROOT });
  const run = listExecutionRunsForLane("alloy-identity", ROOT)[0];
  assert.ok(run.transitions.length >= 4);
  const last = run.transitions.at(-1);
  assert.equal(last.from_state, "VALIDATING");
  assert.equal(last.to_state, "COMPLETE");
  assert.equal(last.origin, "agent");
  assert.equal(last.reason, null);
  assert.ok(last.occurred_at);
  const events = readFileSync(executionRunEventsPath(ROOT), "utf8");
  assert.match(events, /execution_run.complete/);
  assert.equal(events.includes("You are executing"), false);
});

await test("lane A cannot report lane B run; stale and unknown ids are rejected", async () => {
  const a = await startRun("a");
  const b = await deliverManagedLaneInstruction("alloy-other", "b", {
    root: ROOT,
    worktreePath: join(WT, "other"),
    sendLaneInstruction: deliveredSend(),
    getOutput: quietGet(),
    notifyIntervalMs: 60_000,
  });
  assert.equal(b.ok, true);
  const cross = reportRunState(a.out.run_id, "complete", { origin: "agent", root: ROOT, expectedLaneId: "alloy-other" });
  assert.equal(cross.error, "lane_mismatch");
  assert.equal(reportRunState("erun_missing", "complete", { root: ROOT }).error, "run_not_found");
  reportRunState(a.out.run_id, "complete", { origin: "agent", root: ROOT, summary: "a done" });
  const stale = reportRunState(a.out.run_id, "validating", { origin: "agent", root: ROOT });
  assert.equal(stale.error, "illegal_transition");
});

await test("worker report requires worktree ownership", async () => {
  const { out } = await startRun("owned");
  const mismatch = reportRunState(out.run_id, "complete", {
    origin: "agent",
    root: ROOT,
    cwd: "/tmp/not-this-worktree",
    summary: "nope",
  });
  assert.equal(mismatch.error, "worktree_mismatch");
  mkdirSync(join(WT, "src"), { recursive: true });
  const ok = reportRunState(out.run_id, "complete", {
    origin: "agent",
    root: ROOT,
    cwd: join(WT, "src"),
    summary: "EXECUTION_RUN_CERTIFIED",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.run.state, "COMPLETE");
});

await test("vac run-status reports from the owning worktree and refuses others", async () => {
  const { out } = await startRun("cli");
  const cli = join(HERE, "../vac-run-status.mjs");
  const good = spawnSync(process.execPath, [cli, out.run_id, "complete", "--summary", "cli-ok"], {
    cwd: WT,
    env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT },
    encoding: "utf8",
  });
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /COMPLETE/);
  const { out: other } = await startRun("cli-2");
  const bad = spawnSync(process.execPath, [cli, other.run_id, "complete", "--summary", "stolen"], {
    cwd: tmpdir(),
    env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT },
    encoding: "utf8",
  });
  assert.equal(bad.status, 4);
  assert.match(bad.stderr, /worktree_mismatch/);
});

await test("active and completed runs survive reread; history is bounded", async () => {
  const { out } = await startRun("persist me");
  const again = readExecutionRunStore(ROOT);
  assert.equal(again.lanes["alloy-identity"].runs[0].run_id, out.run_id);
  assert.equal(again.lanes["alloy-identity"].runs[0].run_id, out.run_id);
  assert.equal(existsSync(executionRunStorePath(ROOT)), true);
  reportRunState(out.run_id, "complete", { root: ROOT, origin: "agent", summary: "done" });
  for (let i = 0; i < EXECUTION_RUN_MAX_PER_LANE + 3; i++) {
    const r = await deliverManagedLaneInstruction("alloy-identity", `job ${i}`, {
      root: ROOT,
      worktreePath: WT,
      sendLaneInstruction: deliveredSend(),
      nowMs: Date.now() + i,
      getOutput: quietGet(),
      notifyIntervalMs: 60_000,
    });
    assert.equal(r.ok, true);
    reportRunState(r.run_id, "complete", { root: ROOT, origin: "agent", summary: `done ${i}` });
  }
  assert.equal(listExecutionRunsForLane("alloy-identity", ROOT).length, EXECUTION_RUN_MAX_PER_LANE);
});

await test("queued run last instruction is visible before pane delivery", () => {
  const last = lastInstructionFromRun({
    run_id: "erun_queued",
    state: "QUEUED",
    instruction: "queued hello",
    updated_at: "2026-08-22T00:44:08.360Z",
  });
  assert.equal(last.status, "queued");
  assert.equal(last.instruction, "queued hello");
  const failed = lastInstructionFromRun({ state: "FAILED", instruction: "x" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.instruction, "x");
});

await test("last-instruction UX is preserved and overlays from a started run", async () => {
  recordDeliveredInstruction("alloy-identity", {
    instruction: "legacy last instruction",
    status: "delivered",
    delivered_at: "2026-08-17T20:00:00.000Z",
  }, ROOT);
  const before = attachLaneRuns(attachLaneInstructions([{ lane_id: "alloy-identity" }], ROOT), ROOT, { includeInstruction: true });
  assert.equal(before[0].last_instruction?.instruction, "legacy last instruction");
  const { out } = await startRun("new managed instruction");
  const after = attachLaneRuns([{ lane_id: "alloy-identity", last_instruction: before[0].last_instruction }], ROOT, { includeInstruction: true });
  assert.equal(after[0].execution_run.run_id, out.run_id);
  assert.equal(after[0].last_instruction.instruction, "new managed instruction");
  assert.equal(after[0].execution_run.instruction, "new managed instruction");
});

await test("WAITING_RESOURCE persists without acquiring a lease", async () => {
  const { out } = await startRun("wait");
  const wait = reportRunState(out.run_id, "waiting-resource", {
    origin: "agent",
    root: ROOT,
    reason: "validate lease held elsewhere",
    resource: "validate",
  });
  assert.equal(wait.run.state, "WAITING_RESOURCE");
  assert.equal(wait.run.resource_wait.resource_key, "validate");
  assert.equal(activeRunForLane("alloy-identity", ROOT).state, "WAITING_RESOURCE");
});

await test("inspect is read-only; browser has no arbitrary run mutation command", async () => {
  const { out } = await startRun("inspect");
  const view = inspectLaneRun("alloy-identity", ROOT);
  assert.equal(view.ok, true);
  assert.equal(view.execution_run.run_id, out.run_id);
  assert.ok(Array.isArray(view.execution_run.transitions));
  const inspect = getCommand("execution_run.inspect");
  assert.equal(inspect.risk, "low");
  assert.equal(getCommand("execution_run.set"), null);
  assert.equal(getCommand("run.set"), null);
  const send = getCommand("lane.send_instruction");
  assert.match(String(send.run), /deliverManagedLaneInstruction/);
});

await test("attachLaneRuns is a cheap sync JSON read", async () => {
  await startRun("perf");
  const lanes = [{ lane_id: "alloy-identity", label: "Access Identity V2" }];
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) attachLaneRuns(lanes, ROOT);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(ms < 50, true, `attachLaneRuns 200x took ${ms.toFixed(1)}ms`);
});

await test("envelope helper stays small and does not change product scope", () => {
  const text = executionEnvelope("erun_abc", "Ship it.");
  assert.equal(text.split("\n").length <= 20, true);
  assert.match(text, /erun_abc/);
  assert.match(text, /Ship it\./);
  assert.match(text, /governed-action/);
  assert.match(text, /run-status/);
  assert.match(text, /complete --summary/);
  assert.equal(/fair queue|self-heal|lease grant/i.test(text), false);
});

await test("findExecutionRun uses the isolated runtime root", () => {
  const created = createQueuedRun({ laneId: "alloy-identity", instruction: "x", worktreePath: WT, root: ROOT });
  const found = findExecutionRun(created.run.run_id);
  assert.equal(found.root, ROOT);
  assert.equal(found.run.run_id, created.run.run_id);
  assert.equal(publicExecutionRun(found.run).instruction, undefined);
});

await test("resource-governance files stay frozen outside their owning slice", () => {
  // Phase 1 froze these. S5 (validation admission) deliberately extends
  // `vac-run` — the instruction was to use the EXISTING wrapper rather than
  // invent a parallel CLI — so vac-run is no longer in the frozen set.
  //
  // Validation path convergence is the OWNING SLICE for `alloy-validate` and
  // `lib/lock.sh`: its whole purpose is to remove the second capacity regime
  // those two carried — a host-wide mutex and a counted heavy-job budget — and
  // point them at S5. Both leave the frozen set for the same reason vac-run did.
  // What replaces the freeze is stronger than it was: the convergence suite
  // asserts by name that neither budget can come back, and that every semantic
  // alloy-validate legitimately owns survived.
  //
  // Worth stating plainly: this guard compares the working tree to HEAD, so it
  // only ever catches UNCOMMITTED edits. Committing would have turned it green
  // on its own. Removing the entry deliberately is the honest form of the change.
  const files = [
    "web/package.json",
    "scripts/local-dev/alloy-compute",
    "scripts/local-dev/lib/sprint-ops.sh",
    "scripts/local-dev/lib/browser-cert-lease.sh",
    "scripts/local-dev/lib/browser-cert-lease.mjs",
    "scripts/local-dev/lib/machine-capacity.sh",
    "scripts/local-dev/lib/actuation-core.sh",
    "scripts/workspace/doctor.mjs",
  ];
  const repo = join(HERE, "../../..");
  const existing = files.filter((p) => existsSync(join(repo, p)));
  assert.ok(existing.length >= 6, `expected resource files present, got ${existing.join(",")}`);
  const diff = spawnSync("git", ["diff", "--name-only", "HEAD", "--", ...existing], { cwd: repo, encoding: "utf8" });
  assert.equal(diff.status, 0, diff.stderr);
  assert.equal(diff.stdout.trim(), "", diff.stdout);
  const pkg = readFileSync(join(repo, "web/package.json"), "utf8");
  assert.match(pkg, /typescript\/bin\/tsc/);
  assert.equal(pkg.includes("vac run typecheck"), false);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
