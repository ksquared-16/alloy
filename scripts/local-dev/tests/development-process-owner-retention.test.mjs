#!/usr/bin/env node
/**
 * A RUN IS THE REQUESTER. A PROCESS CAN BE THE OWNER. THEY END AT DIFFERENT TIMES.
 *
 * MEASURED. The criterion-12 soak acquired `gateway_host_mutation`
 * ereq_381b2f3aa73f7165 at 12:42:00.289Z and the Governor released it 2.4
 * seconds later — soak process alive, start identity matching, claim valid. Its
 * requesting run had reached FAILED seven minutes EARLIER, so ordinary
 * run-lifecycle logic said "terminal run, reclaim its resources", which for a
 * run-owned resource is exactly right.
 *
 * The giveaway was in the event log, two lines on the same request:
 *
 *     resource_survived_run   agent      ← cleanupRunResources RETAINED it
 *     resource_released       governor   ← the reconcile loop released it anyway
 *
 * One path retaining while another releases is not a fix, it is a race with
 * extra steps. These controls hold every release path to the same law, and hold
 * the reclamation that must still work so the fix cannot become an immortal lock.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-owner-retain-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando", "execution-runs"), { recursive: true });

const E = await import("../lib/vacilando/execution-run.mjs");
const R = await import("../lib/vacilando/execution-resource.mjs");
const M = await import("../lib/vacilando/gateway-host-mutation.mjs");
const { reconcileGovernor } = await import("../lib/vacilando/execution-reconcile.mjs");

const LANE = "lane_db3431e755a8";
const DEAD_PID = 2147480000;
const startIdentity = (pid) => {
  try { return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }).trim() || null; }
  catch { return null; }
};

let seq = 0;
function stageRun(state) {
  const runId = `erun_retain${String(seq += 1).padStart(11, "0")}`;
  writeFileSync(join(ROOT, "vacilando", "execution-runs", "runs.json"), JSON.stringify({
    schema_version: E.EXECUTION_RUN_SCHEMA,
    lanes: { [LANE]: { current_run_id: state === "EXECUTING" ? runId : null, runs: [{ run_id: runId, lane_id: LANE, state, transitions: [] }] } },
  }, null, 2));
  return runId;
}
function claim(runId, processOwner) {
  const res = M.acquireGatewayHostMutation({
    runId, laneId: LANE, reason: "retention control", origin: "agent", processOwner, root: ROOT,
  });
  assert.equal(res.ok && res.granted, true, `claim staged: ${JSON.stringify({ok:res.ok,granted:res.granted,error:res.error,state:res.state,holder:res.holder&&res.holder.request_id})}`);
  return res.request.request_id;
}
const held = () => Boolean(M.gatewayHostMutationHolder(ROOT));
const events = () => {
  try { return readFileSync(join(ROOT, "vacilando", "execution-runs", "resource-events.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse); }
  catch { return []; }
};
const releasedByGovernor = () => events().filter((e) => e.type === "resource_released" && e.origin === "governor").length;

let pass = 0;
let fail = 0;
async function test(name, fn) {
  // Total isolation per control: the resource store is exclusive-named with
  // capacity 1, so a claim left by one control silently queues the next.
  try { rmSync(join(ROOT, "vacilando"), { recursive: true, force: true }); } catch { /* */ }
  mkdirSync(join(ROOT, "vacilando", "execution-runs"), { recursive: true });
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const live = { pid: process.pid, started_at: startIdentity(process.pid), kind: "host_soak", label: "control" };

// ── the exact real defect shape ──────────────────────────────────────────────
await test("REPRO. grant → Governor reconciliation → owner alive → still GRANTED", async () => {
  const runId = stageRun("FAILED");           // terminal BEFORE the claim, as it was
  claim(runId, live);
  assert.equal(held(), true, "granted");
  await reconcileGovernor({ root: ROOT, depth: "targeted", reason: "control" });
  await reconcileGovernor({ root: ROOT, depth: "cheap", reason: "control" });
  assert.equal(held(), true, "a live process owner survives the Governor pass that used to take it");
  assert.equal(releasedByGovernor(), 0, "and no governor release is emitted at all");
});

// ── A/B: live owner, either run state ────────────────────────────────────────
for (const state of ["EXECUTING", "FAILED"]) {
  await test(`${state === "EXECUTING" ? "A" : "B"}. live process + ${state} run → retained`, async () => {
    claim(stageRun(state), live);
    await reconcileGovernor({ root: ROOT, depth: "targeted", reason: "control" });
    assert.equal(held(), true);
  });
}

await test("C. an UNVERIFIED process owner is retained — unknown fails closed", async () => {
  claim(stageRun("FAILED"), { pid: process.pid, started_at: null, kind: "host_soak", label: "control" });
  const h = R.processOwnerHealth((R.readResourceRequestStore(ROOT).requests || []).find((r) => r.resource_key === "gateway_host_mutation"));
  assert.equal(h.health, "unverified", "no start identity means unverified, not dead");
  await reconcileGovernor({ root: ROOT, depth: "targeted", reason: "control" });
  assert.equal(held(), true, "never take a resource on a guess");
});

/*
 * D, E and K assert the DECISION rather than the queue machinery around it: a
 * hand-written store states each owner-health case exactly, with no dependence
 * on grant ordering or capacity. The law under test is "which health retains and
 * which reclaims", and these are the four answers it can give.
 */
function stageStore(processOwner, { runState = "FAILED", resourceKey = "gateway_host_mutation" } = {}) {
  const runId = stageRun(runState);
  writeFileSync(join(ROOT, "vacilando", "execution-runs", "resource-requests.json"), JSON.stringify({
    schema_version: "vacilando.resource_request.v1",
    requests: [{
      request_id: "ereq_control00000001", run_id: runId, lane_id: LANE,
      resource_key: resourceKey, resource_class: "EXCLUSIVE_NAMED",
      state: "GRANTED", granted_at: new Date().toISOString(), released_at: null,
      holder: `vac-${runId}`, origin: "agent",
      ...(processOwner ? { process_owner: processOwner } : {}),
    }],
  }, null, 2));
  return runId;
}
const only = () => (R.readResourceRequestStore(ROOT).requests || [])[0];

await test("D. a DEAD process owner is reclaimed — this must not become an immortal lock", async () => {
  stageStore({ pid: DEAD_PID, started_at: "Sat Sep 12 05:00:00 2026", kind: "host_soak" });
  assert.equal(R.processOwnerHealth(only()).health, "stale_owner", "a pid that is gone is stale");
  assert.equal(R.processOwnerHolds(only()), false, "so it does not hold");
  await reconcileGovernor({ root: ROOT, depth: "targeted", reason: "control" });
  assert.notEqual(only()?.state, "GRANTED", "and the Governor reclaims it, as it always did");
});

await test("E. PID reuse is refused — start identity, not the number", () => {
  stageStore({ pid: process.pid, started_at: "Wed Jan  1 00:00:00 2020", kind: "host_soak" });
  const h = R.processOwnerHealth(only());
  assert.equal(h.health, "stale_owner",
    "a LIVE pid whose start identity differs is a stranger that inherited the number");
  assert.equal(R.processOwnerHolds(only()), false, "so it cannot keep the claim alive");
});

await test("K. an ordinary RUN-owned resource is unaffected", async () => {
  // No process owner at all: the run owns it, so run terminality is still the
  // right reason to reclaim. The fix must not have made every claim survive.
  stageStore(null, { resourceKey: "browser_certification" });
  assert.equal(R.processOwnerHolds(only()), false, "no process owner means run ownership");
  await reconcileGovernor({ root: ROOT, depth: "targeted", reason: "control" });
  assert.notEqual(only()?.state, "GRANTED", "a run-owned claim for a terminal run is still reclaimed");
});

// ── I/J: the two paths that disagreed ────────────────────────────────────────
await test("I. the Governor pass cannot release a live process-owned claim", () => {
  const src = readFileSync(new URL("../lib/vacilando/execution-reconcile.mjs", import.meta.url), "utf8");
  const loop = src.slice(src.indexOf("for (const rec of requests) {"));
  const guardAt = loop.indexOf("processOwnerHolds(rec)");
  const terminalAt = loop.indexOf("isTerminalRunState(run.state)");
  assert.ok(guardAt > 0, "the loop checks process ownership");
  assert.ok(guardAt < terminalAt, "and does so BEFORE any run-terminality rule can act");
});

await test("J. cleanupRunResources still retains, and now agrees with the Governor", async () => {
  const runId = stageRun("FAILED");
  claim(runId, live);
  R.cleanupRunResources(runId, { origin: "system", root: ROOT });
  assert.equal(held(), true, "it retained before the fix too — that was never the defect");
  await reconcileGovernor({ root: ROOT, depth: "targeted", reason: "control" });
  assert.equal(held(), true, "and the Governor no longer contradicts it");
  const kinds = events().map((e) => `${e.type}:${e.origin || ""}`);
  assert.ok(kinds.some((k) => k.startsWith("resource_survived_run")), "the retention is still recorded");
  assert.ok(!kinds.some((k) => k === "resource_released:governor"),
    "the two-line contradiction from the incident must not reappear");
});

await test("L. no second store, lease or TTL was introduced", () => {
  const reconcile = readFileSync(new URL("../lib/vacilando/execution-reconcile.mjs", import.meta.url), "utf8");
  const loop = reconcile.slice(reconcile.indexOf("for (const rec of requests) {"), reconcile.indexOf("if (depth !== \"cheap\")"));
  const code = loop.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/ttl|expires_at|lease_until|setTimeout|Date\.now\(\) \+/i.test(code),
    "retention is decided by owner health, never by a clock");
  const resource = readFileSync(new URL("../lib/vacilando/execution-resource.mjs", import.meta.url), "utf8");
  assert.equal((resource.match(/export function processOwnerHolds/g) || []).length, 1,
    "one definition of who owns a lifetime, consumed by every path");
  // Every guarded path must consult that one definition rather than re-deriving it.
  for (const rel of ["../lib/vacilando/execution-reconcile.mjs", "../lib/vacilando/execution-recovery.mjs"]) {
    assert.match(readFileSync(new URL(rel, import.meta.url), "utf8"), /processOwnerHolds\(/, `${rel} uses it`);
  }
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
