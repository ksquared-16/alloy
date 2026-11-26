#!/usr/bin/env node
/**
 * Shared Gateway host mutation is exclusively owned.
 *
 * Two lanes each ran the Gateway installer against this machine and silently
 * undid one another. These assertions prove that cannot happen again, and that
 * the invariant is the ORDINARY resource governor rather than a second lock.
 *
 * Isolated runtime only. Never touches the live Gateway, launchd, or Tailscale.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createQueuedRun,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import {
  activeRequestForRunResource,
  cleanupRunResources,
  listResourceRegistry,
  normalizeResourceKey,
  readResourceRequestStore,
  resetResourceRequestsForTests,
} from "../lib/vacilando/execution-resource.mjs";
import {
  GATEWAY_HOST_MUTATION_RESOURCE,
  acquireGatewayHostMutation,
  assertGatewayHostMutationAllowed,
  gatewayHostMutationHolder,
  releaseGatewayHostMutation,
} from "../lib/vacilando/gateway-host-mutation.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "vac-ghm-"));
const WT = mkdtempSync(join(tmpdir(), "vac-ghm-wt-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const LANE_A = "lane_aaaaaaaaaaaa";
const LANE_B = "lane_bbbbbbbbbbbb";

let pass = 0;
let fail = 0;

async function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
  resetResourceRequestsForTests(ROOT);
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

function makeRun(laneId, nowMs = Date.now()) {
  const q = createQueuedRun({
    laneId,
    instruction: "gateway host work",
    worktreePath: WT,
    nowMs,
    origin: "operator",
    root: ROOT,
  });
  assert.equal(q.ok, true, q.error);
  const t = transitionExecutionRun(q.run.run_id, "EXECUTING", { root: ROOT, nowMs, origin: "system" });
  assert.equal(t.ok, true, t.error);
  return t.run;
}

const acquire = (run, reason) => acquireGatewayHostMutation({
  runId: run.run_id,
  laneId: run.lane_id,
  reason,
  root: ROOT,
});

await test("the resource is registered as a queueable exclusive named resource", async () => {
  const def = normalizeResourceKey(GATEWAY_HOST_MUTATION_RESOURCE);
  assert.ok(def, "gateway_host_mutation must resolve");
  assert.equal(def.class, "EXCLUSIVE_NAMED");
  assert.equal(def.capacity, 1);
  assert.equal(def.queueable, true);
  assert.equal(def.governor_mutable, true);
  // Reuse, not a parallel system: it must live in the one registry.
  assert.ok(listResourceRegistry().some((r) => r.key === GATEWAY_HOST_MUTATION_RESOURCE));
  // Aliases keep the operator-facing spelling usable.
  assert.equal(normalizeResourceKey("gateway-host-mutation").key, GATEWAY_HOST_MUTATION_RESOURCE);
});

await test("two concurrent lanes cannot both mutate the shared Gateway host", async () => {
  const a = makeRun(LANE_A);
  const b = makeRun(LANE_B);

  const first = acquire(a, "install Gateway from canonical toolkit");
  assert.equal(first.ok, true);
  assert.equal(first.granted, true, "first lane must be granted");

  const second = acquire(b, "reinstall Gateway");
  assert.equal(second.ok, true);
  assert.equal(second.granted, false, "second lane must NOT be granted");
  assert.equal(second.state, "QUEUED", "second lane waits rather than proceeding");

  // Exactly one GRANTED record for the resource, ever.
  const granted = (readResourceRequestStore(ROOT).requests || [])
    .filter((r) => r.resource_key === GATEWAY_HOST_MUTATION_RESOURCE && r.state === "GRANTED");
  assert.equal(granted.length, 1);
  assert.equal(granted[0].run_id, a.run_id);
});

await test("the blocked lane is told who holds it, so ownership is visible", async () => {
  const a = makeRun(LANE_A);
  const b = makeRun(LANE_B);
  acquire(a, "install");
  const second = acquire(b, "install");
  assert.equal(second.holder.run_id, a.run_id);
  assert.equal(second.holder.lane_id, LANE_A);
  assert.ok(second.holder.granted_at, "grant time is auditable");
});

await test("the installer guard fails closed for a foreign run and passes for the holder", async () => {
  const a = makeRun(LANE_A);
  const b = makeRun(LANE_B);
  acquire(a, "install");

  const foreign = assertGatewayHostMutationAllowed({ runId: b.run_id, root: ROOT });
  assert.equal(foreign.ok, false, "a competing run must be refused");
  assert.equal(foreign.error, "gateway_host_mutation_held");
  assert.match(foreign.detail, /Wait for release/);

  const owner = assertGatewayHostMutationAllowed({ runId: a.run_id, root: ROOT });
  assert.equal(owner.ok, true, "the holder may proceed");

  // An unowned host stays operable by hand — this guards concurrency, not humans.
  releaseGatewayHostMutation({ runId: a.run_id, root: ROOT });
  assert.equal(assertGatewayHostMutationAllowed({ root: ROOT }).ok, true);
});

await test("release hands the resource to the waiting lane", async () => {
  const a = makeRun(LANE_A);
  const b = makeRun(LANE_B);
  acquire(a, "install");
  acquire(b, "install");

  const rel = releaseGatewayHostMutation({ runId: a.run_id, root: ROOT });
  assert.equal(rel.ok, true, rel.error);

  const bReq = activeRequestForRunResource(b.run_id, GATEWAY_HOST_MUTATION_RESOURCE, ROOT);
  assert.equal(bReq.state, "GRANTED", "the queued lane is granted on release");
  assert.equal(gatewayHostMutationHolder(ROOT).run_id, b.run_id);
});

await test("an abandoned owner does not hold the host forever", async () => {
  const a = makeRun(LANE_A);
  const b = makeRun(LANE_B);
  acquire(a, "install");
  acquire(b, "install");

  // ABANDONED is the state that stranded work before; it must release.
  const t = transitionExecutionRun(a.run_id, "ABANDONED", {
    root: ROOT,
    origin: "system",
    reason: "owner_gone",
  });
  assert.equal(t.ok, true, t.error);
  cleanupRunResources(a.run_id, { root: ROOT });

  const holder = gatewayHostMutationHolder(ROOT);
  assert.notEqual(holder?.run_id, a.run_id, "an abandoned run must not still hold the host");
  assert.equal(assertGatewayHostMutationAllowed({ runId: b.run_id, root: ROOT }).ok, true);
});

await test("re-acquiring is idempotent for the same run", async () => {
  const a = makeRun(LANE_A);
  const first = acquire(a, "install");
  const again = acquire(a, "install");
  assert.equal(again.granted, true);
  assert.equal(again.request.request_id, first.request.request_id, "no duplicate request");
  const all = (readResourceRequestStore(ROOT).requests || [])
    .filter((r) => r.resource_key === GATEWAY_HOST_MUTATION_RESOURCE);
  assert.equal(all.length, 1);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
