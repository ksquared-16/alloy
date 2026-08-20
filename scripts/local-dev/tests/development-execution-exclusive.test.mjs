#!/usr/bin/env node
/**
 * Phase 4 — machine-exclusive window, quiescence, quietness, writer-preference.
 * Isolated runtime. Injected resume send. Does not attach to live Claude.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  activeRunForLane,
  createQueuedRun,
  executionRunStorePath,
  getExecutionRun,
  reportRunState,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import {
  activeRequestForRunResource,
  attachLaneResourceWaits,
  developmentResourceSnapshot,
  evaluateResourceQueue,
  normalizeResourceKey,
  queuedRequestsFor,
  readResourceRequestStore,
  releaseResourceRequest,
  resetResourceRequestsForTests,
  setResourceGrantImplForTests,
} from "../lib/vacilando/execution-resource.mjs";
import {
  EXCLUSIVE_CONFLICT_MATRIX,
  emergencyReleaseExclusive,
  evaluateExclusiveWindow,
  exclusiveBlocksNewGrant,
  exclusiveQuietnessReport,
  readExclusiveWindow,
  reconcileExclusiveWindow,
  setExclusiveProcessScanForTests,
} from "../lib/vacilando/execution-exclusive.mjs";
import {
  flushGrantResumes,
  installGrantResumeHook,
  resetResumeForTests,
  setResumeDeliveryImplForTests,
} from "../lib/vacilando/execution-resume.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const ROOT = mkdtempSync(join(tmpdir(), "vac-eex-"));
const WT = mkdtempSync(join(tmpdir(), "vac-eex-wt-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_COMPUTE_STATE_DIR = mkdtempSync(join(tmpdir(), "vac-eex-comp-"));

let pass = 0;
let fail = 0;
const sends = [];
const lanesAlive = new Map();

async function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
  resetResourceRequestsForTests(ROOT);
  resetResumeForTests();
  installGrantResumeHook();
  sends.length = 0;
  lanesAlive.clear();
  mockLease({ allow: true });
  setExclusiveProcessScanForTests(null);
  delete process.env.VACILANDO_EXCLUSIVE_MAX_MS;
  delete process.env.VACILANDO_EXCLUSIVE_RESERVE_MAX_MS;
  delete process.env.VACILANDO_EXCLUSIVE_QUIET_HOLD_MS;
  setResumeDeliveryImplForTests({
    sendLaneInstruction: async (laneId, instruction, opts = {}) => {
      sends.push({ laneId, instruction, opts: { ...opts } });
      return {
        ok: true,
        status: "delivered",
        lane_id: laneId,
        delivered_at: new Date().toISOString(),
        worktree_path: WT,
      };
    },
    getDevelopmentLane: async (id) => fakeLane(id),
  });
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

function fakeLane(id) {
  const rec = lanesAlive.get(id) || {
    tmux: { alive: true, session: id, cwd: WT },
    claude: { presence: "present" },
    worktree: { managed: true, path: WT, name: "wt" },
  };
  lanesAlive.set(id, rec);
  return { ok: true, lane: { lane_id: id, ...rec } };
}

function mockLease({ allow = true } = {}) {
  const held = new Set();
  setResourceGrantImplForTests((op, rec) => {
    const holder = `vac-${rec.run_id}`;
    if (op === "acquire") {
      if (!allow || held.size) return { ok: false, error: "busy", holder };
      held.add(holder);
      return { ok: true, holder };
    }
    held.delete(holder);
    return { ok: true, holder };
  });
  return { held, setAllow(v) { allow = v; } };
}

function makeRun(laneId, instruction = "work", nowMs = Date.now()) {
  fakeLane(laneId);
  const q = createQueuedRun({ laneId, instruction, worktreePath: WT, nowMs, origin: "operator", root: ROOT });
  assert.equal(q.ok, true, q.error);
  const t = transitionExecutionRun(q.run.run_id, "EXECUTING", { root: ROOT, nowMs, origin: "system" });
  assert.equal(t.ok, true, t.error);
  return t.run;
}

function waitOn(run, resource, nowMs = Date.now()) {
  return reportRunState(run.run_id, "waiting-resource", {
    origin: "agent",
    root: ROOT,
    reason: resource,
    resource,
    nowMs,
  });
}

function events() {
  try {
    return readFileSync(join(ROOT, "vacilando/execution-runs/resource-events.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function attach(ids) {
  return attachLaneResourceWaits(ids.map((id) => ({
    lane_id: id,
    label: id === "alloy-runtime" ? "Runtime Performance" : id === "alloy-comms" ? "Communications" : "Records / Roster",
    tmux: lanesAlive.get(id)?.tmux,
    claude: lanesAlive.get(id)?.claude,
    worktree: lanesAlive.get(id)?.worktree,
    execution_run: activeRunForLane(id, ROOT),
  })), ROOT);
}

await test("runtime_timing_certification has real MACHINE_EXCLUSIVE authority separate from validate and browser-cert", async () => {
  const timing = normalizeResourceKey("runtime_timing_certification");
  const validate = normalizeResourceKey("validate");
  const browser = normalizeResourceKey("browser_certification");
  assert.equal(timing.class, "MACHINE_EXCLUSIVE");
  assert.equal(timing.wired, true);
  assert.equal(timing.governor_mutable, true);
  assert.match(timing.authority, /machine-exclusive/);
  assert.equal(validate.class, "EXCLUSIVE_NAMED");
  assert.equal(browser.class, "EXCLUSIVE_NAMED");
  assert.notEqual(timing.authority, validate.authority);
  const a = makeRun("alloy-runtime", "t1", 1);
  const b = makeRun("alloy-identity", "t2", 2);
  waitOn(a, "runtime_timing_certification", 10);
  waitOn(b, "runtime_timing_certification", 20);
  await flushGrantResumes();
  assert.equal(activeRequestForRunResource(a.run_id, "runtime_timing_certification", ROOT).state, "GRANTED");
  assert.equal(activeRequestForRunResource(b.run_id, "runtime_timing_certification", ROOT).state, "QUEUED");
});

await test("conflict matrix: known conflicts block grant; safe work does not; no process killing", async () => {
  const by = Object.fromEntries(EXCLUSIVE_CONFLICT_MATRIX.map((r) => [r.activity, r]));
  assert.equal(by.browser_certification.conflicts, true);
  assert.equal(by.validate.conflicts, true);
  assert.equal(by.unmanaged_heavy.conflicts, true);
  assert.equal(by.dev_servers.conflicts, false);
  assert.equal(by.docker_stack.conflicts, false);
  assert.equal(by.claude_tmux.conflicts, false);
  assert.equal(by.git.conflicts, false);
  assert.equal(by.focused_unit_tests.conflicts, false);
  const src = readFileSync(join(HERE, "../lib/vacilando/execution-exclusive.mjs"), "utf8");
  assert.equal(src.includes("terminateUnbrokeredHeavyProcesses"), false);
  assert.equal(/\bprocess\.kill\s*\(/.test(src), false);
  assert.equal(src.includes("SIGKILL"), false);

  const holder = makeRun("alloy-records", "browser", 1);
  waitOn(holder, "browser_certification", 10);
  const runtime = makeRun("alloy-runtime", "timing", 2);
  waitOn(runtime, "runtime_timing_certification", 20);
  assert.equal(activeRequestForRunResource(runtime.run_id, "runtime_timing_certification", ROOT).state, "QUEUED");
  const report = exclusiveQuietnessReport(ROOT);
  assert.equal(report.quiet, false);
  assert.equal(report.blockers.some((b) => b.type === "browser_certification"), true);

  const light = makeRun("alloy-identity", "docs", 3);
  assert.equal(activeRunForLane("alloy-identity", ROOT).state, "EXECUTING");
  assert.equal(exclusiveBlocksNewGrant("browser_certification", ROOT), true);
});

await test("unmanaged conflicting process blocks grant and is not killed; grant proceeds after it ends", async () => {
  let live = [{ pid: 4242, command: "npx tsc --noEmit" }];
  setExclusiveProcessScanForTests(() => live);
  const run = makeRun("alloy-runtime");
  waitOn(run, "runtime_timing_certification", 10);
  const rec = activeRequestForRunResource(run.run_id, "runtime_timing_certification", ROOT);
  assert.equal(rec.state, "QUEUED");
  assert.match(rec.state_reason || "", /Unmanaged conflicting process/);
  assert.equal(readExclusiveWindow(ROOT)?.phase, "DRAINING_CONFLICTS");
  assert.equal(sends.length, 0);
  live = [];
  evaluateExclusiveWindow(ROOT, 20);
  await flushGrantResumes();
  assert.equal(activeRequestForRunResource(run.run_id, "runtime_timing_certification", ROOT).state, "GRANTED");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "VALIDATING");
  assert.equal(sends.length, 1);
});

await test("writer-preference: current holder may finish; no new conflicting grants; exclusive does not starve", async () => {
  const records = makeRun("alloy-records", "records cert", 1);
  const comms = makeRun("alloy-comms", "comms cert", 2);
  const runtime = makeRun("alloy-runtime", "timing", 3);
  waitOn(records, "browser_certification", 10);
  waitOn(comms, "browser_certification", 20);
  waitOn(runtime, "runtime_timing_certification", 30);
  assert.equal(activeRequestForRunResource(records.run_id, "browser_certification", ROOT).state, "GRANTED");
  assert.equal(activeRequestForRunResource(comms.run_id, "browser_certification", ROOT).state, "QUEUED");
  assert.equal(activeRequestForRunResource(runtime.run_id, "runtime_timing_certification", ROOT).state, "QUEUED");
  assert.equal(readExclusiveWindow(ROOT).phase, "DRAINING_CONFLICTS");
  const extra = makeRun("alloy-access", "late cert", 4);
  waitOn(extra, "browser_certification", 40);
  assert.equal(activeRequestForRunResource(extra.run_id, "browser_certification", ROOT).state, "QUEUED");

  releaseResourceRequest(
    activeRequestForRunResource(records.run_id, "browser_certification", ROOT).request_id,
    { origin: "system", root: ROOT, expectedRunId: records.run_id, nowMs: 50 },
  );
  await flushGrantResumes();
  assert.equal(activeRequestForRunResource(comms.run_id, "browser_certification", ROOT).state, "QUEUED");
  assert.equal(activeRequestForRunResource(runtime.run_id, "runtime_timing_certification", ROOT).state, "GRANTED");
  assert.equal(getExecutionRun(runtime.run_id, ROOT).state, "VALIDATING");
  assert.equal(sends.filter((s) => s.laneId === "alloy-runtime").length, 1);
  assert.equal(sends.some((s) => s.laneId === "alloy-comms"), false);
  assert.match(sends.find((s) => s.laneId === "alloy-runtime").instruction, /exclusive timing window/i);
  evaluateExclusiveWindow(ROOT, 60);
  await flushGrantResumes();
  assert.equal(sends.filter((s) => s.laneId === "alloy-runtime").length, 1);
});

await test("quiescence marks waiters without destroying sessions or worktrees", async () => {
  const records = makeRun("alloy-records", "records", 1);
  const comms = makeRun("alloy-comms", "comms", 2);
  const runtime = makeRun("alloy-runtime", "timing", 3);
  waitOn(records, "browser_certification", 10);
  waitOn(comms, "browser_certification", 20);
  waitOn(runtime, "runtime_timing_certification", 30);
  const before = JSON.parse(JSON.stringify({
    records: lanesAlive.get("alloy-records"),
    comms: lanesAlive.get("alloy-comms"),
    runtime: lanesAlive.get("alloy-runtime"),
  }));
  const lanes = attach(["alloy-records", "alloy-comms", "alloy-runtime"]);
  assert.equal(lanes[1].runtime_posture.state, "QUIESCED");
  assert.equal(lanes[2].runtime_posture.state, "EXCLUSIVE_OWNER");
  assert.equal(lanes[0].runtime_posture?.state, undefined);
  assert.equal(lanes[1].tmux.alive, true);
  assert.equal(lanes[1].claude.presence, "present");
  assert.equal(lanes[1].worktree.path, WT);
  assert.equal(activeRunForLane("alloy-comms", ROOT).state, "WAITING_RESOURCE");
  const after = {
    records: lanesAlive.get("alloy-records"),
    comms: lanesAlive.get("alloy-comms"),
    runtime: lanesAlive.get("alloy-runtime"),
  };
  assert.deepEqual(after, before);
});

await test("quietness is required before grant; continuation is exactly once; run → VALIDATING", async () => {
  setExclusiveProcessScanForTests(() => [{ pid: 7, command: "next build" }]);
  const run = makeRun("alloy-runtime");
  const t0 = process.hrtime.bigint();
  waitOn(run, "runtime_timing_certification", 10);
  const reservedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(readExclusiveWindow(ROOT).phase, "DRAINING_CONFLICTS");
  assert.equal(sends.length, 0);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "WAITING_RESOURCE");
  setExclusiveProcessScanForTests(() => []);
  const t1 = process.hrtime.bigint();
  evaluateExclusiveWindow(ROOT, 20);
  await flushGrantResumes();
  const grantResumeMs = Number(process.hrtime.bigint() - t1) / 1e6;
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "VALIDATING");
  assert.equal(sends.length, 1);
  evaluateExclusiveWindow(ROOT, 30);
  await flushGrantResumes();
  assert.equal(sends.length, 1);
  assert.equal(reservedMs < 80, true, `reserve took ${reservedMs.toFixed(1)}ms`);
  assert.equal(grantResumeMs < 80, true, `quiet→resume took ${grantResumeMs.toFixed(1)}ms`);
});

await test("explicit release lifts exclusive window and re-evaluates the browser-cert queue", async () => {
  const records = makeRun("alloy-records", "records", 1);
  const comms = makeRun("alloy-comms", "comms", 2);
  const runtime = makeRun("alloy-runtime", "timing", 3);
  waitOn(records, "browser_certification", 10);
  waitOn(comms, "browser_certification", 20);
  waitOn(runtime, "runtime_timing_certification", 30);
  releaseResourceRequest(
    activeRequestForRunResource(records.run_id, "browser_certification", ROOT).request_id,
    { origin: "system", root: ROOT, nowMs: 40 },
  );
  await flushGrantResumes();
  const granted = activeRequestForRunResource(runtime.run_id, "runtime_timing_certification", ROOT);
  const t0 = process.hrtime.bigint();
  transitionExecutionRun(runtime.run_id, "COMPLETE", { root: ROOT, origin: "agent", nowMs: 50 });
  await flushGrantResumes();
  const resumeNextMs = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(readExclusiveWindow(ROOT), null);
  assert.equal(activeRequestForRunResource(comms.run_id, "browser_certification", ROOT).state, "GRANTED");
  assert.equal(getExecutionRun(comms.run_id, ROOT).state, "VALIDATING");
  assert.equal(sends.some((s) => s.laneId === "alloy-comms"), true);
  assert.equal(resumeNextMs < 80, true, `release→next grant took ${resumeNextMs.toFixed(1)}ms`);
  assert.ok(granted);
});

await test("owner disappearance and timeout release exclusive without leaving the machine stuck", async () => {
  const run = makeRun("alloy-runtime", "timing", 1);
  waitOn(run, "runtime_timing_certification", 10);
  await flushGrantResumes();
  assert.equal(readExclusiveWindow(ROOT)?.phase, "EXCLUSIVE_ACTIVE");
  writeFileSync(executionRunStorePath(ROOT), `${JSON.stringify({ schema_version: "vacilando.execution_run.v1", lanes: {} }, null, 2)}\n`);
  reconcileExclusiveWindow(ROOT, 20);
  assert.equal(readExclusiveWindow(ROOT), null);

  process.env.VACILANDO_EXCLUSIVE_MAX_MS = "50";
  const run2 = makeRun("alloy-runtime", "timing-2", 30);
  waitOn(run2, "runtime_timing_certification", 30);
  await flushGrantResumes();
  assert.equal(readExclusiveWindow(ROOT)?.phase, "EXCLUSIVE_ACTIVE");
  evaluateExclusiveWindow(ROOT, 90);
  assert.equal(readExclusiveWindow(ROOT), null);
  assert.equal(getExecutionRun(run2.run_id, ROOT).state, "NEEDS_INPUT");
});

await test("manual emergency release is audited and does not kill processes", async () => {
  const run = makeRun("alloy-runtime");
  waitOn(run, "runtime_timing_certification", 10);
  await flushGrantResumes();
  const refused = emergencyReleaseExclusive({ confirm: false, root: ROOT, nowMs: 20 });
  assert.equal(refused.ok, false);
  const out = emergencyReleaseExclusive({ confirm: true, actor: "operator", root: ROOT, nowMs: 30 });
  assert.equal(out.ok, true);
  assert.equal(readExclusiveWindow(ROOT), null);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "NEEDS_INPUT");
  assert.equal(events().some((e) => e.type === "exclusive_emergency_released" && e.actor === "operator"), true);
});

await test("three-lane Records/Communications/Runtime scenario keeps sessions alive", async () => {
  const records = makeRun("alloy-records", "Records / Roster cert", 1);
  const comms = makeRun("alloy-comms", "Communications ingress", 2);
  const runtime = makeRun("alloy-runtime", "Runtime timing", 3);
  waitOn(records, "browser_certification", 10);
  waitOn(comms, "browser_certification", 20);
  waitOn(runtime, "runtime_timing_certification", 30);
  const lanes1 = attach(["alloy-records", "alloy-comms", "alloy-runtime"]);
  assert.equal(lanes1[0].tmux.alive, true);
  assert.equal(lanes1[1].runtime_posture.state, "QUIESCED");
  releaseResourceRequest(
    activeRequestForRunResource(records.run_id, "browser_certification", ROOT).request_id,
    { origin: "system", root: ROOT, nowMs: 40 },
  );
  await flushGrantResumes();
  assert.equal(getExecutionRun(runtime.run_id, ROOT).state, "VALIDATING");
  assert.equal(activeRequestForRunResource(comms.run_id, "browser_certification", ROOT).state, "QUEUED");
  transitionExecutionRun(runtime.run_id, "COMPLETE", { root: ROOT, origin: "agent", nowMs: 50 });
  await flushGrantResumes();
  assert.equal(getExecutionRun(comms.run_id, ROOT).state, "VALIDATING");
  const lanes2 = attach(["alloy-records", "alloy-comms", "alloy-runtime"]);
  assert.equal(lanes2[0].tmux.alive, true);
  assert.equal(lanes2[1].tmux.alive, true);
  assert.equal(lanes2[2].tmux.alive, true);
  assert.equal(lanes2[1].claude.presence, "present");
  assert.equal(lanes2[0].runtime_posture, undefined);
});

await test("package scripts, permits, caps, and generalized recovery stay unchanged", () => {
  const diff = (rel) => spawnSync("git", ["diff", "--", rel], { cwd: REPO, encoding: "utf8" }).stdout || "";
  assert.equal(diff("web/package.json"), "");
  assert.equal(diff("scripts/local-dev/alloy-compute"), "");
  assert.equal(diff("scripts/local-dev/lib/sprint-ops.sh"), "");
  assert.equal(diff("scripts/local-dev/lib/browser-cert-lease.mjs"), "");
  assert.equal(diff("scripts/local-dev/lib/lock.sh"), "");
  assert.equal(diff("scripts/local-dev/vac-run"), "");
  const pkg = JSON.parse(readFileSync(join(REPO, "web/package.json"), "utf8"));
  assert.match(String(pkg.scripts.typecheck), /tsc/);
  assert.match(String(pkg.scripts.build), /next build/);
  const exclusive = readFileSync(join(HERE, "../lib/vacilando/execution-exclusive.mjs"), "utf8");
  assert.equal(exclusive.includes("stale lease reclaim"), false);
  assert.equal(exclusive.includes("session restart"), false);
  assert.equal(exclusive.includes("disk cleanup"), false);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
