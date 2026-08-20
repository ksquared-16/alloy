#!/usr/bin/env node
/**
 * Phase 3 — automatic resource-grant resume.
 * Isolated runtime. Injected send/lane discovery. Does not attach to live Claude.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  attachLaneRuns,
  createQueuedRun,
  getExecutionRun,
  lastInstructionFromRun,
  reportRunState,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import {
  activeRequestForRunResource,
  queuedRequestsFor,
  readResourceRequestStore,
  resetResourceRequestsForTests,
  setResourceGrantImplForTests,
} from "../lib/vacilando/execution-resource.mjs";
import {
  deliverGrantContinuation,
  flushGrantResumes,
  installGrantResumeHook,
  reconcileGrantContinuations,
  resetResumeForTests,
  resourceGrantedContinuationText,
  setResumeDeliveryImplForTests,
} from "../lib/vacilando/execution-resume.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const ROOT = mkdtempSync(join(tmpdir(), "vac-eresume-"));
const WT = mkdtempSync(join(tmpdir(), "vac-eresume-wt-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_COMPUTE_STATE_DIR = mkdtempSync(join(tmpdir(), "vac-eresume-comp-"));

let pass = 0;
let fail = 0;
const sends = [];

async function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
  resetResourceRequestsForTests(ROOT);
  resetResumeForTests();
  installGrantResumeHook();
  sends.length = 0;
  mockLease({ allow: true });
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

function fakeLane(id, extra = {}) {
  return {
    ok: true,
    lane: {
      lane_id: id,
      worktree: { managed: true, path: extra.path || WT, name: "wt" },
      tmux: {
        alive: extra.alive !== false,
        cwd: extra.cwd || extra.path || WT,
        command: "2.1.220",
        title: "claude",
        session: id,
      },
      claude: { presence: extra.alive === false ? "absent" : "present" },
    },
  };
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
  return {
    held,
    setAllow(v) { allow = v; },
  };
}

function makeRun(laneId, instruction = "certify", nowMs = Date.now()) {
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

await test("GRANTED + ready creates one continuation bound to the same run/lane/request", async () => {
  const run = makeRun("alloy-comms", "Communications ingress certification");
  waitOn(run, "browser_certification", 10);
  await flushGrantResumes();
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  assert.equal(rec.state, "GRANTED");
  assert.equal(rec.continuation.kind, "resource_granted");
  assert.equal(rec.continuation.delivery_state, "DELIVERED");
  assert.equal(rec.lane_id, "alloy-comms");
  assert.equal(rec.run_id, run.run_id);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].laneId, "alloy-comms");
  assert.match(sends[0].instruction, /Vacilando execution update for run erun_/);
  assert.match(sends[0].instruction, /browser certification/i);
  assert.equal(sends[0].opts.actor, "governor");
  assert.equal("pane" in (sends[0].opts), false);
  assert.equal("target" in (sends[0].opts), false);
  assert.equal(sends[0].opts.dedupeKey, rec.continuation.continuation_id);
});

await test("one continuation per grant episode; duplicate reconcile does not resend", async () => {
  const run = makeRun("alloy-comms");
  waitOn(run, "browser_certification", 10);
  await flushGrantResumes();
  assert.equal(sends.length, 1);
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  const again = await deliverGrantContinuation(rec, { root: ROOT });
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  await reconcileGrantContinuations({ root: ROOT });
  await flushGrantResumes();
  assert.equal(sends.length, 1);
});

await test("run remains WAITING until delivery success; browser resume → VALIDATING", async () => {
  const { setResourceResumeHook } = await import("../lib/vacilando/execution-resource.mjs");
  setResourceResumeHook(() => {});
  const run = makeRun("alloy-records");
  waitOn(run, "browser_certification", 20);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "WAITING_RESOURCE");
  assert.equal(activeRequestForRunResource(run.run_id, "browser_certification", ROOT).state, "GRANTED");
  assert.equal(sends.length, 0);
  const out = await deliverGrantContinuation(
    activeRequestForRunResource(run.run_id, "browser_certification", ROOT),
    { root: ROOT },
  );
  assert.equal(out.ok, true);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "VALIDATING");
  assert.equal(activeRequestForRunResource(run.run_id, "browser_certification", ROOT).state, "GRANTED");
});

await test("failed delivery does not become VALIDATING", async () => {
  setResumeDeliveryImplForTests({
    sendLaneInstruction: async () => ({ ok: false, status: "failed", error: "delivery_failed" }),
    getDevelopmentLane: async (id) => fakeLane(id),
  });
  const run = makeRun("alloy-comms");
  waitOn(run, "browser_certification");
  await flushGrantResumes();
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "WAITING_RESOURCE");
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  assert.equal(rec.continuation.delivery_state, "FAILED");
});

await test("dead target releases the grant and escalates NEEDS_INPUT", async () => {
  setResumeDeliveryImplForTests({
    sendLaneInstruction: async () => ({ ok: false, status: "refused", error: "pane_unavailable" }),
    getDevelopmentLane: async (id) => fakeLane(id, { alive: false }),
  });
  const run = makeRun("alloy-comms");
  waitOn(run, "browser_certification");
  await flushGrantResumes();
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "NEEDS_INPUT");
  assert.equal(activeRequestForRunResource(run.run_id, "browser_certification", ROOT), null);
});

await test("worktree mismatch refuses and does not send to another lane", async () => {
  setResumeDeliveryImplForTests({
    sendLaneInstruction: async (laneId, instruction) => {
      sends.push({ laneId, instruction });
      return { ok: true, status: "delivered", lane_id: laneId };
    },
    getDevelopmentLane: async (id) => fakeLane(id, { path: join(tmpdir(), "other-wt") }),
  });
  const run = makeRun("alloy-comms");
  waitOn(run, "browser_certification");
  await flushGrantResumes();
  assert.equal(sends.length, 0);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "NEEDS_INPUT");
});

await test("terminal run cancels pending continuation and does not send", async () => {
  mockLease({ allow: false });
  const run = makeRun("alloy-comms");
  waitOn(run, "browser_certification");
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  assert.equal(rec.state, "QUEUED");
  transitionExecutionRun(run.run_id, "FAILED", { root: ROOT, origin: "agent", reason: "aborted" });
  const sent = await deliverGrantContinuation(rec, { root: ROOT });
  assert.equal(sent.ok, false);
  assert.equal(sends.length, 0);
});

await test("lost grant prevents send", async () => {
  const { setResourceResumeHook } = await import("../lib/vacilando/execution-resource.mjs");
  setResourceResumeHook(() => {});
  const run = makeRun("alloy-comms");
  waitOn(run, "browser_certification");
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  assert.equal(rec.state, "GRANTED");
  setResourceGrantImplForTests(null);
  const out = await deliverGrantContinuation(rec, { root: ROOT });
  assert.equal(out.error, "grant_lost");
  assert.equal(sends.length, 0);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "WAITING_RESOURCE");
});

await test("ambiguous DELIVERING never blindly duplicates", async () => {
  const { setResourceResumeHook, patchResourceRequest } = await import("../lib/vacilando/execution-resource.mjs");
  setResourceResumeHook(() => {});
  const run = makeRun("alloy-comms");
  waitOn(run, "browser_certification");
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  patchResourceRequest(rec.request_id, {
    continuation: {
      continuation_id: "econ_ambig",
      kind: "resource_granted",
      delivery_state: "DELIVERING",
      grant_episode: rec.granted_at,
      attempt_count: 1,
    },
  }, { root: ROOT });
  const out = await deliverGrantContinuation(rec, { root: ROOT });
  assert.equal(out.ambiguous, true);
  const recon = await reconcileGrantContinuations({ root: ROOT });
  assert.equal(recon.skipped >= 1, true);
  assert.equal(sends.length, 0);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "WAITING_RESOURCE");
});

await test("DELIVERED + stale WAITING repairs without resend", async () => {
  const { setResourceResumeHook, patchResourceRequest } = await import("../lib/vacilando/execution-resource.mjs");
  setResourceResumeHook(() => {});
  const run = makeRun("alloy-comms");
  waitOn(run, "browser_certification");
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  patchResourceRequest(rec.request_id, {
    continuation: {
      continuation_id: "econ_repair",
      kind: "resource_granted",
      delivery_state: "DELIVERED",
      delivered_at: new Date().toISOString(),
      grant_episode: rec.granted_at,
      attempt_count: 1,
    },
  }, { root: ROOT });
  sends.length = 0;
  const recon = await reconcileGrantContinuations({ root: ROOT });
  assert.equal(recon.repaired, 1);
  assert.equal(sends.length, 0);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "VALIDATING");
});

await test("two-lane automatic resume: A release → B grant + exactly one continuation", async () => {
  const a = makeRun("alloy-records", "Records certification", 1);
  const b = makeRun("alloy-comms", "Communications certification", 2);
  waitOn(a, "browser_certification", 10);
  await flushGrantResumes();
  waitOn(b, "browser_certification", 20);
  await flushGrantResumes();
  assert.equal(getExecutionRun(a.run_id, ROOT).state, "VALIDATING");
  assert.equal(getExecutionRun(b.run_id, ROOT).state, "WAITING_RESOURCE");
  assert.equal(activeRequestForRunResource(b.run_id, "browser_certification", ROOT).state, "QUEUED");
  assert.equal(sends.length, 1);
  assert.equal(sends[0].laneId, "alloy-records");
  transitionExecutionRun(a.run_id, "COMPLETE", { root: ROOT, origin: "agent", completion_report: { summary: "done" } });
  await flushGrantResumes();
  assert.equal(getExecutionRun(b.run_id, ROOT).state, "VALIDATING");
  assert.equal(activeRequestForRunResource(b.run_id, "browser_certification", ROOT).state, "GRANTED");
  assert.equal(sends.length, 2);
  assert.equal(sends[1].laneId, "alloy-comms");
  assert.equal(sends.filter((s) => s.laneId === "alloy-comms").length, 1);
  const last = lastInstructionFromRun(getExecutionRun(b.run_id, ROOT));
  assert.equal(last.instruction, "Communications certification");
  assert.equal(last.instruction.includes("Vacilando execution update"), false);
  const attached = attachLaneRuns([{ lane_id: "alloy-comms" }], ROOT, { includeInstruction: true });
  assert.equal(attached[0].last_instruction.instruction, "Communications certification");
});

await test("three-lane FIFO auto-resume without starvation or stolen holder", async () => {
  const a = makeRun("alloy-records", "A", 1);
  const b = makeRun("alloy-comms", "B", 2);
  const c = makeRun("alloy-runtime", "C", 3);
  waitOn(a, "browser_certification", 10);
  await flushGrantResumes();
  waitOn(b, "browser_certification", 20);
  waitOn(c, "browser_certification", 30);
  await flushGrantResumes();
  assert.equal(getExecutionRun(a.run_id, ROOT).state, "VALIDATING");
  const q = queuedRequestsFor(readResourceRequestStore(ROOT), "browser_certification");
  assert.equal(q[0].run_id, b.run_id);
  assert.equal(q[1].run_id, c.run_id);
  transitionExecutionRun(a.run_id, "COMPLETE", { root: ROOT, origin: "agent" });
  await flushGrantResumes();
  assert.equal(getExecutionRun(b.run_id, ROOT).state, "VALIDATING");
  assert.equal(activeRequestForRunResource(c.run_id, "browser_certification", ROOT).state, "QUEUED");
  transitionExecutionRun(b.run_id, "COMPLETE", { root: ROOT, origin: "agent" });
  await flushGrantResumes();
  assert.equal(getExecutionRun(c.run_id, ROOT).state, "VALIDATING");
  assert.equal(sends.map((s) => s.laneId).join(","), "alloy-records,alloy-comms,alloy-runtime");
});

await test("resource remains held after continuation; leaving VALIDATING releases and resumes next", async () => {
  const a = makeRun("alloy-records", "A", 1);
  const b = makeRun("alloy-comms", "B", 2);
  waitOn(a, "browser_certification", 10);
  await flushGrantResumes();
  waitOn(b, "browser_certification", 20);
  assert.equal(activeRequestForRunResource(a.run_id, "browser_certification", ROOT).state, "GRANTED");
  transitionExecutionRun(a.run_id, "EXECUTING", { root: ROOT, origin: "agent", reason: "cert done, more work" });
  await flushGrantResumes();
  assert.equal(activeRequestForRunResource(a.run_id, "browser_certification", ROOT), null);
  assert.equal(getExecutionRun(b.run_id, ROOT).state, "VALIDATING");
});

await test("lane A cannot receive lane B continuation", async () => {
  const a = makeRun("alloy-records", "A", 1);
  const b = makeRun("alloy-comms", "B", 2);
  waitOn(a, "browser_certification", 10);
  await flushGrantResumes();
  waitOn(b, "browser_certification", 20);
  transitionExecutionRun(a.run_id, "COMPLETE", { root: ROOT, origin: "agent" });
  await flushGrantResumes();
  assert.equal(sends.every((s) => s.laneId === "alloy-records" || s.laneId === "alloy-comms"), true);
  assert.equal(sends.filter((s) => s.laneId === "alloy-records").length, 1);
  assert.equal(sends.filter((s) => s.laneId === "alloy-comms").length, 1);
});

await test("continuation copy is bounded and reconstructable", () => {
  const text = resourceGrantedContinuationText({
    runId: "erun_test",
    resourceKey: "browser_certification",
    label: "Browser certification",
    holder: "vac-erun_test",
    instructionSummary: "x".repeat(500),
  });
  assert.match(text, /erun_test/);
  assert.match(text, /Browser certification/);
  assert.equal(text.includes("x".repeat(201)), false);
  assert.equal(text.length < 1200, true);
});

await test("audit events cover grant, continuation, resume, release", async () => {
  const a = makeRun("alloy-records", "A", 1);
  const b = makeRun("alloy-comms", "B", 2);
  waitOn(a, "browser_certification", 10);
  await flushGrantResumes();
  waitOn(b, "browser_certification", 20);
  transitionExecutionRun(a.run_id, "COMPLETE", { root: ROOT, origin: "agent" });
  await flushGrantResumes();
  const types = new Set(events().map((e) => e.type));
  for (const t of ["resource_granted", "continuation_created", "continuation_delivery_started", "continuation_delivered", "run_resumed", "resource_released"]) {
    assert.equal(types.has(t), true, `missing ${t}`);
  }
});

await test("no package-script or permit wiring changes in resume", () => {
  const diff = (rel) => spawnSync("git", ["diff", "--", rel], { cwd: REPO, encoding: "utf8" }).stdout || "";
  assert.equal(diff("web/package.json"), "");
  assert.equal(diff("scripts/local-dev/alloy-compute"), "");
  assert.equal(diff("scripts/local-dev/lib/sprint-ops.sh"), "");
  const src = readFileSync(join(HERE, "../lib/vacilando/execution-resume.mjs"), "utf8");
  assert.equal(src.includes("deliverManagedLaneInstruction"), false);
  assert.match(src, /runtime_timing_certification/);
  assert.match(src, /exactly-once per grant episode/);
});

await test("grant-to-resume stays event-driven and cheap", async () => {
  const t0 = process.hrtime.bigint();
  const run = makeRun("alloy-comms");
  waitOn(run, "browser_certification");
  await flushGrantResumes();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(ms < 100, true, `grant→resume took ${ms.toFixed(1)}ms`);
  const t1 = process.hrtime.bigint();
  await reconcileGrantContinuations({ root: ROOT });
  const reconMs = Number(process.hrtime.bigint() - t1) / 1e6;
  assert.equal(reconMs < 40, true, `reconcile idle took ${reconMs.toFixed(1)}ms`);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
