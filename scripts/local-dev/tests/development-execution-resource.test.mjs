#!/usr/bin/env node
/**
 * Phase 2 — resource registry, request ownership, FIFO queue, grant/release.
 * Isolated runtime + compute dirs. Does not attach to live Claude.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  activeRunForLane,
  createQueuedRun,
  isLegalRunTransition,
  reportRunState,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import {
  DEV_SERVER_CAP,
  activeRequestForRunResource,
  attachLaneResourceWaits,
  cleanupRunResources,
  developmentResourceSnapshot,
  ensureResourceRequest,
  evaluateResourceQueue,
  listResourceRegistry,
  normalizeResourceKey,
  prioritizeResourceRequest,
  queuedRequestsFor,
  queuePositionFor,
  readComputeHolders,
  readResourceRequestStore,
  releaseResourceRequest,
  resourceRequestEventsPath,
  resourceRequestStorePath,
  resetResourceRequestsForTests,
  setResourceGrantImplForTests,
} from "../lib/vacilando/execution-resource.mjs";
import { acquireBrowserCertLease, releaseBrowserCertLease } from "../lib/browser-cert-lease.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const ROOT = mkdtempSync(join(tmpdir(), "vac-eres-"));
const COMPUTE = mkdtempSync(join(tmpdir(), "vac-ecomp-"));
const WT = mkdtempSync(join(tmpdir(), "vac-eres-wt-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_COMPUTE_STATE_DIR = COMPUTE;

let pass = 0;
let fail = 0;
let sendCalls = 0;

async function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
  resetResourceRequestsForTests(ROOT);
  setResourceGrantImplForTests(null);
  sendCalls = 0;
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

function makeRun(laneId, instruction = "work", nowMs = Date.now()) {
  const q = createQueuedRun({ laneId, instruction, worktreePath: WT, nowMs, origin: "operator", root: ROOT });
  assert.equal(q.ok, true, q.error);
  const t = transitionExecutionRun(q.run.run_id, "EXECUTING", { root: ROOT, nowMs, origin: "system" });
  assert.equal(t.ok, true, t.error);
  return t.run;
}

function waitOn(run, resource, nowMs = Date.now(), extra = {}) {
  return reportRunState(run.run_id, "waiting-resource", {
    origin: extra.origin || "agent",
    root: ROOT,
    reason: extra.reason || resource,
    resource,
    nowMs,
    cwd: extra.cwd,
    expectedLaneId: extra.expectedLaneId,
  });
}

function mockLease({ allow = true, busyIfHeld = true } = {}) {
  const held = new Set();
  const log = [];
  setResourceGrantImplForTests((op, rec) => {
    const holder = `vac-${rec.run_id}`;
    log.push({ op, run_id: rec.run_id, holder });
    if (op === "acquire") {
      if (!allow) return { ok: false, error: "busy", holder };
      if (busyIfHeld && held.size) return { ok: false, error: "busy", holder };
      held.add(holder);
      return { ok: true, holder };
    }
    held.delete(holder);
    return { ok: true, holder };
  });
  return {
    log,
    held,
    setAllow(v) { allow = v; },
  };
}

function events() {
  try {
    return readFileSync(resourceRequestEventsPath(ROOT), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function gitDiff(rel) {
  return spawnSync("git", ["diff", "--", rel], { cwd: REPO, encoding: "utf8" }).stdout || "";
}

await test("existing authority maps to the correct resource class", () => {
  const by = Object.fromEntries(listResourceRegistry().map((r) => [r.key, r]));
  assert.equal(by.browser_certification.class, "EXCLUSIVE_NAMED");
  assert.equal(by.validate.class, "EXCLUSIVE_NAMED");
  assert.equal(by.dev_servers.class, "CAPACITY_LIMITED");
  assert.equal(by.runtime_timing_certification.class, "MACHINE_EXCLUSIVE");
  assert.equal(by.runtime_timing_certification.authority, "vacilando machine-exclusive window");
  assert.equal(by.runtime_timing_certification.governor_mutable, true);
  assert.equal(by.full_typecheck.wired, false);
  assert.equal(by.heavy_next_dev.wired, false);
  assert.equal(normalizeResourceKey("browser-certification").key, "browser_certification");
});

await test("unavailable/unwired authority is represented honestly", () => {
  const snap = developmentResourceSnapshot(ROOT);
  const timing = snap.resources.find((r) => r.key === "runtime_timing_certification");
  const full = snap.resources.find((r) => r.key === "full_typecheck");
  const heavy = snap.resources.find((r) => r.key === "heavy_next_dev");
  assert.equal(timing.health, "available");
  assert.equal(timing.wired, true);
  assert.equal(timing.governor_mutable, true);
  assert.equal(timing.authority || normalizeResourceKey("runtime_timing_certification").authority, "vacilando machine-exclusive window");
  assert.equal(full.health, "unwired");
  assert.equal(heavy.health, "unwired");
  assert.equal(heavy.capacity, 2);
});

await test("validate lease is not treated as machine-exclusive", () => {
  const v = normalizeResourceKey("validate");
  assert.equal(v.class, "EXCLUSIVE_NAMED");
  assert.notEqual(v.class, "MACHINE_EXCLUSIVE");
  assert.equal(v.queueable, false);
  assert.match(v.notes || v.phase2_mutability, /NOT machine-exclusive|read-only/i);
});

await test("server cap remains 3; compute permit wiring unchanged", () => {
  assert.equal(DEV_SERVER_CAP, 3);
  assert.equal(normalizeResourceKey("dev_servers").capacity, 3);
  const src = readFileSync(join(HERE, "../lib/sprint-ops.sh"), "utf8");
  assert.match(src, /ALLOY_MAX_RUNNING_SERVERS="\$\{ALLOY_MAX_RUNNING_SERVERS:-3\}"/);
  const pkg = readFileSync(join(REPO, "web/package.json"), "utf8");
  const json = JSON.parse(pkg);
  assert.match(String(json.scripts.typecheck), /tsc/);
  assert.match(String(json.scripts.build), /next build/);
  assert.equal(gitDiff("web/package.json"), "");
  assert.equal(gitDiff("scripts/local-dev/vac-run"), "");
  assert.equal(gitDiff("scripts/local-dev/alloy-compute"), "");
  assert.equal(gitDiff("scripts/local-dev/lib/sprint-ops.sh"), "");
  assert.equal(gitDiff("scripts/local-dev/lib/browser-cert-lease.mjs"), "");
  // `lib/lock.sh` LEAVES THIS FREEZE, DELIBERATELY.
  //
  // Validation-lock heartbeat integrity is this change's owning slice, and the
  // measured defect lived in exactly this file: alloy-validate moved to the S5
  // broker and stopped taking the validate mutex, while a heartbeat loop from
  // the old mutex model survived it — writing every fifteen seconds into a lock
  // directory that is never created, printing a shell error into the middle of
  // real validation output, and still exiting 0.
  //
  // As the guard in development-execution-run already records, this compares the
  // working tree to HEAD and so only catches UNCOMMITTED edits; committing turns
  // it green on its own. Removing the entry deliberately is the honest form. The
  // replacement is stronger: tests/test-validation-heartbeat.sh asserts the live
  // lease, the abandoned lease, the expired heartbeat and the foreign refresher
  // by name.
});

await test("WAITING_RESOURCE creates one request bound to the run/lane", () => {
  mockLease({ allow: false });
  const run = makeRun("alloy-records", "certify records");
  const out = waitOn(run, "browser_certification");
  assert.equal(out.ok, true);
  assert.equal(out.run.state, "WAITING_RESOURCE");
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  assert.ok(rec);
  assert.equal(rec.lane_id, "alloy-records");
  assert.equal(rec.run_id, run.run_id);
  assert.equal(rec.resource_key, "browser_certification");
  assert.equal(rec.state, "QUEUED");
  assert.equal(readResourceRequestStore(ROOT).requests.length, 1);
  assert.equal(out.run.resource_wait.request_id, rec.request_id);
  assert.equal(out.run.resource_wait.request_state, "QUEUED");
});

await test("duplicate report does not duplicate the request", () => {
  mockLease({ allow: false });
  const run = makeRun("alloy-comms");
  waitOn(run, "browser_certification", 1_000);
  waitOn(run, "browser_certification", 2_000);
  waitOn(run, "browser_certification", 3_000);
  assert.equal(readResourceRequestStore(ROOT).requests.length, 1);
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  assert.equal(rec.state, "QUEUED");
});

await test("cross-lane mutation is refused", () => {
  mockLease({ allow: false });
  const run = makeRun("alloy-records");
  const bad = ensureResourceRequest({
    runId: run.run_id,
    laneId: "alloy-comms",
    resourceKey: "browser_certification",
    root: ROOT,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "lane_mismatch");
  const cwd = reportRunState(run.run_id, "waiting-resource", {
    origin: "agent",
    root: ROOT,
    resource: "browser_certification",
    cwd: join(tmpdir(), "someone-else"),
  });
  assert.equal(cwd.ok, false);
  assert.equal(cwd.error, "worktree_mismatch");
});

await test("unknown resource is refused and does not create a request", () => {
  const run = makeRun("alloy-identity");
  const out = ensureResourceRequest({
    runId: run.run_id,
    laneId: "alloy-identity",
    resourceKey: "not_a_real_resource",
    root: ROOT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "unsupported_resource");
  assert.equal(readResourceRequestStore(ROOT).requests.length, 0);
});

await test("FIFO ordering and stable tie-break; queue position is derived", () => {
  mockLease({ allow: false });
  const a = makeRun("alloy-records", "a", 1000);
  const b = makeRun("alloy-comms", "b", 1000);
  waitOn(a, "browser_certification", 5_000);
  waitOn(b, "browser_certification", 6_000);
  const store = readResourceRequestStore(ROOT);
  const q = queuedRequestsFor(store, "browser_certification");
  assert.equal(q.length, 2);
  assert.equal(q[0].run_id, a.run_id);
  assert.equal(q[1].run_id, b.run_id);
  assert.equal(queuePositionFor(store, q[0]), 1);
  assert.equal(queuePositionFor(store, q[1]), 2);
  const c = makeRun("alloy-identity", "c", 1000);
  waitOn(c, "browser_certification", 6_000);
  const q2 = queuedRequestsFor(readResourceRequestStore(ROOT), "browser_certification");
  const sameTime = q2.filter((r) => r.requested_at === q2[1].requested_at);
  assert.equal(sameTime.length >= 2, true);
  assert.equal(sameTime[0].request_id < sameTime[1].request_id, true);
});

await test("release advances the next request; current holder is not stolen", () => {
  const lease = mockLease({ allow: true });
  const a = makeRun("alloy-records", "a", 1);
  const b = makeRun("alloy-comms", "b", 2);
  waitOn(a, "browser_certification", 10);
  waitOn(b, "browser_certification", 20);
  const ra = activeRequestForRunResource(a.run_id, "browser_certification", ROOT);
  const rb = activeRequestForRunResource(b.run_id, "browser_certification", ROOT);
  assert.equal(ra.state, "GRANTED");
  assert.equal(rb.state, "QUEUED");
  assert.equal(queuePositionFor(readResourceRequestStore(ROOT), rb), 1);
  assert.equal(activeRunForLane("alloy-records", ROOT).state, "WAITING_RESOURCE");
  assert.equal(activeRunForLane("alloy-records", ROOT).resource_wait.ready_to_resume, true);
  assert.equal(activeRunForLane("alloy-comms", ROOT).resource_wait.ready_to_resume, false);
  const steal = ensureResourceRequest({
    runId: b.run_id,
    laneId: "alloy-comms",
    resourceKey: "browser_certification",
    root: ROOT,
  });
  assert.equal(steal.request.state, "QUEUED");
  assert.equal(activeRequestForRunResource(a.run_id, "browser_certification", ROOT).state, "GRANTED");
  const rel = releaseResourceRequest(ra.request_id, { origin: "system", root: ROOT, expectedRunId: a.run_id });
  assert.equal(rel.ok, true);
  assert.equal(rel.request.state, "RELEASED");
  const rb2 = activeRequestForRunResource(b.run_id, "browser_certification", ROOT);
  assert.equal(rb2.state, "GRANTED");
  assert.equal(lease.held.size, 1);
  assert.equal([...lease.held][0], `vac-${b.run_id}`);
});

await test("immediate reacquire does not starve a waiter already in queue", () => {
  mockLease({ allow: true });
  const a = makeRun("alloy-records", "a", 1);
  const b = makeRun("alloy-comms", "b", 2);
  waitOn(a, "browser_certification", 10);
  waitOn(b, "browser_certification", 20);
  const ra = activeRequestForRunResource(a.run_id, "browser_certification", ROOT);
  releaseResourceRequest(ra.request_id, { origin: "system", root: ROOT });
  assert.equal(activeRequestForRunResource(b.run_id, "browser_certification", ROOT).state, "GRANTED");
  transitionExecutionRun(a.run_id, "EXECUTING", { root: ROOT, origin: "agent" });
  waitOn(a, "browser_certification", 30);
  const ra2 = activeRequestForRunResource(a.run_id, "browser_certification", ROOT);
  assert.equal(ra2.state, "QUEUED");
  assert.equal(activeRequestForRunResource(b.run_id, "browser_certification", ROOT).state, "GRANTED");
});

await test("cancellation removes a queued request", () => {
  mockLease({ allow: false });
  const a = makeRun("alloy-records");
  waitOn(a, "browser_certification");
  const rec = activeRequestForRunResource(a.run_id, "browser_certification", ROOT);
  const out = releaseResourceRequest(rec.request_id, { origin: "operator", root: ROOT, expectedLaneId: "alloy-records" });
  assert.equal(out.request.state, "CANCELLED");
  assert.equal(activeRequestForRunResource(a.run_id, "browser_certification", ROOT), null);
  assert.equal(queuedRequestsFor(readResourceRequestStore(ROOT), "browser_certification").length, 0);
});

await test("one EXCLUSIVE_NAMED holder; grant failure does not claim GRANTED", () => {
  const lease = mockLease({ allow: false });
  const a = makeRun("alloy-records");
  waitOn(a, "browser_certification");
  const rec = activeRequestForRunResource(a.run_id, "browser_certification", ROOT);
  assert.equal(rec.state, "QUEUED");
  assert.equal(events().some((e) => e.type === "resource_grant_failed"), true);
  lease.setAllow(true);
  ensureResourceRequest({
    runId: a.run_id,
    laneId: "alloy-records",
    resourceKey: "browser_certification",
    root: ROOT,
  });
  assert.equal(activeRequestForRunResource(a.run_id, "browser_certification", ROOT).state, "GRANTED");
  const granted = (readResourceRequestStore(ROOT).requests || []).filter((r) => r.resource_key === "browser_certification" && r.state === "GRANTED");
  assert.equal(granted.length, 1);
});

await test("release ownership is verified; wrong run cannot release", () => {
  mockLease({ allow: true });
  const a = makeRun("alloy-records");
  waitOn(a, "browser_certification");
  const rec = activeRequestForRunResource(a.run_id, "browser_certification", ROOT);
  const bad = releaseResourceRequest(rec.request_id, { origin: "agent", root: ROOT, expectedRunId: "erun_other" });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "run_mismatch");
  assert.equal(activeRequestForRunResource(a.run_id, "browser_certification", ROOT).state, "GRANTED");
});

await test("COMPLETE and FAILED clean queued/granted requests; lane run is not destroyed as a session", () => {
  mockLease({ allow: true });
  const a = makeRun("alloy-records", "a");
  const b = makeRun("alloy-comms", "b");
  waitOn(a, "browser_certification", 10);
  waitOn(b, "browser_certification", 20);
  assert.equal(activeRequestForRunResource(a.run_id, "browser_certification", ROOT).state, "GRANTED");
  const done = transitionExecutionRun(a.run_id, "FAILED", { root: ROOT, origin: "agent", reason: "aborted" });
  assert.equal(done.ok, true);
  assert.equal(activeRequestForRunResource(a.run_id, "browser_certification", ROOT), null);
  assert.equal(activeRequestForRunResource(b.run_id, "browser_certification", ROOT).state, "GRANTED");
  const c = makeRun("alloy-runtime", "timing");
  waitOn(c, "runtime_timing_certification");
  assert.equal(activeRequestForRunResource(c.run_id, "runtime_timing_certification", ROOT).state, "QUEUED");
  const fin = transitionExecutionRun(c.run_id, "FAILED", { root: ROOT, origin: "agent" });
  assert.equal(fin.ok, true);
  assert.equal(activeRequestForRunResource(c.run_id, "runtime_timing_certification", ROOT), null);
  assert.equal(activeRunForLane("alloy-comms", ROOT).state, "WAITING_RESOURCE");
});

await test("WAITING_RESOURCE for validate does not acquire a browser-cert lease", () => {
  const lease = mockLease({ allow: true });
  const run = makeRun("alloy-identity");
  const out = waitOn(run, "validate", Date.now(), { reason: "validate lease held elsewhere" });
  assert.equal(out.run.state, "WAITING_RESOURCE");
  assert.equal(out.run.resource_wait.resource_key, "validate");
  const rec = activeRequestForRunResource(run.run_id, "validate", ROOT);
  assert.equal(rec.state, "REQUESTED");
  assert.equal(lease.log.length, 0);
  assert.equal(readComputeHolders("browser-certification").length, 0);
});

await test("MACHINE_EXCLUSIVE timing grants after quietness and stays separate from validate", () => {
  const run = makeRun("alloy-runtime");
  waitOn(run, "runtime_timing_certification");
  const rec = activeRequestForRunResource(run.run_id, "runtime_timing_certification", ROOT);
  assert.equal(rec.state, "GRANTED");
  assert.equal(rec.resource_class, "MACHINE_EXCLUSIVE");
  const snap = developmentResourceSnapshot(ROOT);
  const row = snap.resources.find((r) => r.key === "runtime_timing_certification");
  const validate = snap.resources.find((r) => r.key === "validate");
  assert.equal(row.health, "held");
  assert.notEqual(validate.class, "MACHINE_EXCLUSIVE");
  assert.equal(snap.machine_exclusive.active, true);
  assert.equal(snap.machine_exclusive.owner_lane_id, "alloy-runtime");
});

await test("operator prioritize is FIFO inside the priority class and does not steal", () => {
  mockLease({ allow: false });
  const a = makeRun("alloy-records", "a", 1);
  const b = makeRun("alloy-comms", "b", 2);
  waitOn(a, "browser_certification", 10);
  waitOn(b, "browser_certification", 20);
  const rb = activeRequestForRunResource(b.run_id, "browser_certification", ROOT);
  const out = prioritizeResourceRequest(rb.request_id, { origin: "operator", expectedLaneId: "alloy-comms", root: ROOT });
  assert.equal(out.ok, true);
  assert.equal(out.queue_position, 1);
  const q = queuedRequestsFor(readResourceRequestStore(ROOT), "browser_certification");
  assert.equal(q[0].run_id, b.run_id);
  assert.equal(q[1].run_id, a.run_id);
  const agent = prioritizeResourceRequest(rb.request_id, { origin: "agent", root: ROOT });
  assert.equal(agent.ok, false);

  resetExecutionRunsForTests(ROOT);
  mockLease({ allow: true });
  const holder = makeRun("alloy-records", "holder", 1);
  const waiter = makeRun("alloy-comms", "waiter", 2);
  waitOn(holder, "browser_certification", 10);
  waitOn(waiter, "browser_certification", 20);
  assert.equal(activeRequestForRunResource(holder.run_id, "browser_certification", ROOT).state, "GRANTED");
  const pri = prioritizeResourceRequest(
    activeRequestForRunResource(waiter.run_id, "browser_certification", ROOT).request_id,
    { origin: "operator", expectedLaneId: "alloy-comms", root: ROOT },
  );
  assert.equal(pri.ok, true);
  assert.equal(activeRequestForRunResource(holder.run_id, "browser_certification", ROOT).state, "GRANTED");
  assert.equal(activeRequestForRunResource(waiter.run_id, "browser_certification", ROOT).state, "QUEUED");
});

await test("stale foreign owner is surfaced and not auto-reclaimed without recovery", () => {
  mockLease({ allow: true });
  mkdirSync(join(COMPUTE, "browser-certification"), { recursive: true });
  writeFileSync(join(COMPUTE, "browser-certification", "dead.permit"), [
    "HOLDER=dead-owner",
    "PID=999999",
    "CREATED=0",
    "WORKTREE=/tmp/gone",
    "REASON=stale",
    "",
  ].join("\n"));
  const run = makeRun("alloy-comms");
  waitOn(run, "browser_certification");
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  assert.equal(rec.state, "QUEUED");
  assert.match(rec.state_reason || "", /stale owner/);
  assert.equal(events().some((e) => e.type === "resource_blocked_stale_owner"), true);
});

await test("disposable two-lane browser-cert queue uses the real lease authority", () => {
  setResourceGrantImplForTests(null);
  const foreign = acquireBrowserCertLease({ wait: false, holder: "foreign-proof", reason: "phase2-hold" });
  assert.equal(foreign.ok, true, foreign.error);
  const a = makeRun("alloy-records", "A wait", 1);
  const b = makeRun("alloy-comms", "B wait", 2);
  waitOn(a, "browser_certification", 10);
  waitOn(b, "browser_certification", 20);
  const ra = activeRequestForRunResource(a.run_id, "browser_certification", ROOT);
  const rb = activeRequestForRunResource(b.run_id, "browser_certification", ROOT);
  assert.notEqual(ra.request_id, rb.request_id);
  assert.equal(ra.state, "QUEUED");
  assert.equal(rb.state, "QUEUED");
  assert.equal(queuePositionFor(readResourceRequestStore(ROOT), ra), 1);
  assert.equal(queuePositionFor(readResourceRequestStore(ROOT), rb), 2);
  releaseBrowserCertLease("foreign-proof");
  ensureResourceRequest({
    runId: a.run_id,
    laneId: "alloy-records",
    resourceKey: "browser_certification",
    root: ROOT,
  });
  const ra2 = activeRequestForRunResource(a.run_id, "browser_certification", ROOT);
  const rb2 = activeRequestForRunResource(b.run_id, "browser_certification", ROOT);
  assert.equal(ra2.state, "GRANTED");
  assert.equal(rb2.state, "QUEUED");
  const holders = readComputeHolders("browser-certification");
  assert.equal(holders.some((h) => h.holder === `vac-${a.run_id}`), true);
  assert.equal(activeRunForLane("alloy-records", ROOT).state, "WAITING_RESOURCE");
  assert.equal(activeRunForLane("alloy-comms", ROOT).state, "WAITING_RESOURCE");
  releaseResourceRequest(ra2.request_id, { origin: "system", root: ROOT, expectedRunId: a.run_id });
  const rb3 = activeRequestForRunResource(b.run_id, "browser_certification", ROOT);
  assert.equal(rb3.state, "GRANTED");
  const after = readComputeHolders("browser-certification");
  assert.equal(after.some((h) => h.holder === `vac-${b.run_id}`), true);
  assert.equal(after.some((h) => h.holder === `vac-${a.run_id}`), false);
  cleanupRunResources(b.run_id, { origin: "system", root: ROOT });
  assert.equal(readComputeHolders("browser-certification").length, 0);
});

await test("real-world bottleneck classes are representable together", () => {
  mockLease({ allow: true });
  const records = makeRun("alloy-records", "Records / Roster cert");
  const comms = makeRun("alloy-comms", "Communications ingress");
  const runtime = makeRun("alloy-runtime", "Runtime timing");
  waitOn(records, "browser_certification", 10);
  waitOn(comms, "browser_certification", 20);
  waitOn(runtime, "runtime_timing_certification", 30);
  const lanes = attachLaneResourceWaits([
    { lane_id: "alloy-records", label: "Records / Roster", execution_run: activeRunForLane("alloy-records", ROOT) },
    { lane_id: "alloy-comms", label: "Communications", execution_run: activeRunForLane("alloy-comms", ROOT) },
    { lane_id: "alloy-runtime", label: "Runtime Performance", execution_run: activeRunForLane("alloy-runtime", ROOT) },
  ], ROOT);
  assert.equal(lanes[0].execution_run.resource_wait.ready_to_resume, true);
  assert.equal(lanes[1].execution_run.resource_wait.queue_position, 1);
  assert.equal(lanes[2].execution_run.resource_wait.resource_key, "runtime_timing_certification");
  const snap = developmentResourceSnapshot(ROOT);
  const browser = snap.resources.find((r) => r.key === "browser_certification");
  const timing = snap.resources.find((r) => r.key === "runtime_timing_certification");
  assert.equal(browser.holders[0].lane_id, "alloy-records");
  assert.equal(browser.queue.length, 1);
  assert.equal(timing.queue.length, 1);
  assert.equal(timing.health, "draining");
  assert.equal(lanes[1].runtime_posture?.state, "QUIESCED");
  assert.equal(lanes[2].runtime_posture?.state, "EXCLUSIVE_OWNER");
  assert.equal(snap.machine_exclusive.phase, "DRAINING_CONFLICTS");
});

await test("Phase 2 does not send Claude continuation; no idle Governor timers", () => {
  const src = readFileSync(join(HERE, "../lib/vacilando/execution-resource.mjs"), "utf8");
  assert.equal(src.includes("sendLaneInstruction"), false);
  assert.equal(src.includes("deliverManagedLaneInstruction"), false);
  assert.equal(src.includes("setInterval"), false);
  assert.equal(src.includes("setTimeout"), false);
  assert.match(src, /Automatic Claude continuation is not/);
  mockLease({ allow: true });
  const a = makeRun("alloy-records");
  const b = makeRun("alloy-comms");
  waitOn(a, "browser_certification", 10);
  waitOn(b, "browser_certification", 20);
  releaseResourceRequest(
    activeRequestForRunResource(a.run_id, "browser_certification", ROOT).request_id,
    { origin: "system", root: ROOT },
  );
  assert.equal(sendCalls, 0);
  const types = new Set(events().map((e) => e.type));
  for (const t of ["resource_queued", "resource_granted", "resource_released"]) {
    assert.equal(types.has(t), true, `missing ${t}`);
  }
  assert.equal(events().some((e) => /continu/.test(e.type)), false);
});

await test("Execution Run state machine is unchanged", () => {
  assert.equal(isLegalRunTransition("WAITING_RESOURCE", "EXECUTING"), true);
  assert.equal(isLegalRunTransition("WAITING_RESOURCE", "COMPLETE"), false);
  assert.equal(isLegalRunTransition("WAITING_RESOURCE", "FAILED"), true);
  mockLease({ allow: true });
  const run = makeRun("alloy-identity");
  waitOn(run, "browser_certification");
  assert.equal(activeRunForLane("alloy-identity", ROOT).state, "WAITING_RESOURCE");
  const back = transitionExecutionRun(run.run_id, "EXECUTING", { root: ROOT, origin: "agent" });
  assert.equal(back.ok, true);
  assert.equal(back.run.state, "EXECUTING");
});

await test("resource snapshot and queue recompute stay cheap", () => {
  mockLease({ allow: false });
  for (const id of ["alloy-records", "alloy-comms", "alloy-runtime"]) {
    waitOn(makeRun(id), id === "alloy-runtime" ? "runtime_timing_certification" : "browser_certification");
  }
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) developmentResourceSnapshot(ROOT);
  const snapMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) queuedRequestsFor(readResourceRequestStore(ROOT), "browser_certification");
  const qMs = Number(process.hrtime.bigint() - t1) / 1e6;
  assert.equal(snapMs < 80, true, `snapshot 200x took ${snapMs.toFixed(1)}ms`);
  assert.equal(qMs < 40, true, `queue 200x took ${qMs.toFixed(1)}ms`);
  const snapSrc = readFileSync(join(HERE, "../lib/vacilando/execution-resource.mjs"), "utf8");
  const fn = snapSrc.slice(snapSrc.indexOf("export function developmentResourceSnapshot"), snapSrc.indexOf("export function resetResourceRequestsForTests"));
  assert.equal(fn.includes("execFile"), false);
  assert.equal(fn.includes("alloy-compute"), false);
  assert.ok(existsSync(resourceRequestStorePath(ROOT)));
});

await test("audit events include run, lane, resource, timestamp, origin", () => {
  mockLease({ allow: true });
  const run = makeRun("alloy-records");
  waitOn(run, "browser_certification");
  const rec = activeRequestForRunResource(run.run_id, "browser_certification", ROOT);
  releaseResourceRequest(rec.request_id, { origin: "operator", root: ROOT });
  const rows = events();
  for (const row of rows) {
    assert.ok(row.run_id);
    assert.ok(row.lane_id);
    assert.ok(row.resource_key);
    assert.ok(row.at);
    assert.ok(row.origin);
  }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
