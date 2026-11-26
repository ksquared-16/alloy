#!/usr/bin/env node
/**
 * ARBITRATION IS A SAFETY ORDERING, AND THESE TESTS ARE ABOUT THE ORDER.
 *
 * Any implementation can return "start" when there is room and "no" when there
 * is not. What matters is what happens at the boundary: whether a server nobody
 * asked for gets reclaimed BEFORE real headroom is spent, whether a lane's own
 * working server can be taken to satisfy someone else, and whether the twelfth
 * server can ever be admitted by a machine that is feeling fine at the moment
 * it is asked.
 *
 * Synthetic fleets throughout, deliberately: this must be provable at levels
 * this host will never actually sit at, and provable when the observation is
 * blind.
 */
import assert from "node:assert/strict";
import { arbitrateServerRequest } from "../lib/vacilando/server-arbitration.mjs";
import { CAPACITY_POLICY_V1 } from "../lib/vacilando/capacity-policy.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const HEALTHY = { readable: true, level: 1, level_label: "normal", thrashing: false };
const WARN = { readable: true, level: 2, level_label: "warn", thrashing: false };
const BLIND = { readable: false, level: null, thrashing: false };

/** n running servers on slots 1..n, none reclaimable unless overridden. */
function fleet(n, overrides = {}) {
  const servers = [];
  for (let i = 1; i <= 12; i += 1) {
    const up = i <= n;
    servers.push({
      lane_worktree: `wt${i}`, slot: i, port: 3010 + i,
      pid: up ? 1000 + i : null,
      rss_mb: up ? 500 : 0, age: up ? "01:00:00" : null,
      desired_state: up ? "RUNNING" : "STOPPED",
      observed_state: up ? "RUNNING" : "DOWN",
      ownership_state: up ? "owned_running" : "stopped",
      recovery_state: null, large: false,
      recycle_eligible: false, recycle_blocked_reason: null,
      reclaimable: false,
      ...(overrides[i] || {}),
    });
  }
  return { servers, rollup: { running: n } };
}

const NORMAL = CAPACITY_POLICY_V1.dev_server_normal_ceiling;
const BURST = CAPACITY_POLICY_V1.dev_server_burst_ceiling;

test("1. below the normal ceiling a start needs no arbitration at all", () => {
  const d = arbitrateServerRequest({ requesterSlot: 9, fleet: fleet(4), pressure: HEALTHY, slotBound: 12 });
  assert.equal(d.decision, "START");
  assert.equal(d.tier, "normal");
  assert.equal(d.reclaim, null, "nothing may be stopped to satisfy a request that already fits");
});

test("2. a lane that is already serving is answered as such, not admitted again", () => {
  // Otherwise a lane with a server could ask twice and consume burst headroom
  // for a port it is already listening on.
  const d = arbitrateServerRequest({ requesterSlot: 3, fleet: fleet(NORMAL), pressure: HEALTHY, slotBound: 12 });
  assert.equal(d.decision, "ALREADY_RUNNING");
  assert.equal(d.tier, null);
});

test("3. at the ceiling, a server running against its own STOP order is reclaimed before burst is spent", () => {
  // THE CENTRAL ORDERING CLAIM. Burst is real memory; this costs nothing.
  const f = fleet(NORMAL, { 5: { desired_state: "STOPPED", reclaimable: true, rss_mb: 2200 } });
  const d = arbitrateServerRequest({ requesterSlot: 11, fleet: f, pressure: HEALTHY, slotBound: 12 });
  assert.equal(d.decision, "RECLAIM_THEN_START");
  assert.equal(d.reclaim.slot, 5);
  assert.equal(d.tier, "normal", "after reclaiming, the start is an ordinary one — not a burst");
});

test("4. burst is spent only when there is nothing free to reclaim", () => {
  const d = arbitrateServerRequest({ requesterSlot: 11, fleet: fleet(NORMAL), pressure: HEALTHY, slotBound: 12 });
  assert.equal(d.decision, "START");
  assert.equal(d.tier, "burst");
  assert.match(d.reason, new RegExp(`${NORMAL + 1}`), "the burst server must be named");
});

test("5. a large server its lane still WANTS is never taken to satisfy someone else", () => {
  // The whole reason recycling is not implemented yet. 8 GB and idle-looking is
  // not evidence of idleness, and this is the request that would take it.
  const f = fleet(NORMAL, { 6: { rss_mb: 8082, large: true, desired_state: "RUNNING", reclaimable: false } });
  const d = arbitrateServerRequest({ requesterSlot: 11, fleet: f, pressure: HEALTHY, slotBound: 12 });
  assert.notEqual(d.decision, "RECLAIM_THEN_START");
  assert.equal(d.reclaim, null, "size is not permission");
});

test("6. a requester's own stale server is not counted as the room it asked for", () => {
  // Reclaiming the requester's own slot would satisfy the request by stopping
  // the thing the request is about.
  const f = fleet(NORMAL, { 7: { desired_state: "STOPPED", reclaimable: true } });
  const d = arbitrateServerRequest({ requesterSlot: 7, fleet: f, pressure: HEALTHY, slotBound: 12 });
  assert.ok(d.reclaim === null || d.reclaim.slot !== 7, "must not reclaim the requester to serve the requester");
});

test("7. at the burst ceiling the answer is QUEUE — the knee is never admitted into", () => {
  const d = arbitrateServerRequest({ requesterSlot: 12, fleet: fleet(BURST), pressure: HEALTHY, slotBound: 12 });
  assert.equal(d.decision, "QUEUE");
  assert.equal(d.queue_reason, "burst_exhausted");
  assert.equal(d.measured_knee, CAPACITY_POLICY_V1.dev_server_measured_knee);
});

test("8. past the burst ceiling a safe reclaim still works — queueing is the fallback, not the rule", () => {
  const f = fleet(BURST, { 2: { desired_state: "STOPPED", reclaimable: true } });
  const d = arbitrateServerRequest({ requesterSlot: 12, fleet: f, pressure: HEALTHY, slotBound: 12 });
  assert.equal(d.decision, "RECLAIM_THEN_START");
  assert.equal(d.reclaim.slot, 2);
});

test("9. a warned kernel withholds burst but does not withhold a free reclaim", () => {
  const queued = arbitrateServerRequest({ requesterSlot: 11, fleet: fleet(NORMAL), pressure: WARN, slotBound: 12 });
  assert.equal(queued.decision, "QUEUE");
  assert.equal(queued.queue_reason, "pressure_constrained");

  const f = fleet(NORMAL, { 4: { desired_state: "STOPPED", reclaimable: true } });
  const reclaimed = arbitrateServerRequest({ requesterSlot: 11, fleet: f, pressure: WARN, slotBound: 12 });
  assert.equal(reclaimed.decision, "RECLAIM_THEN_START",
    "stopping a server that should not be running frees memory; pressure is no reason to refuse it");
});

test("10. a blind pressure probe is never read as a healthy host", () => {
  const d = arbitrateServerRequest({ requesterSlot: 11, fleet: fleet(NORMAL), pressure: BLIND, slotBound: 12 });
  assert.equal(d.decision, "QUEUE");
  assert.equal(d.pressure_readable, false);
});

test("11. a blind FLEET observation refuses rather than inventing capacity", () => {
  // An unobserved fleet is not an empty one. This is the same error class as
  // reading a failed pressure probe as calm.
  const d = arbitrateServerRequest({ requesterSlot: 3, fleet: null, pressure: HEALTHY, slotBound: 12 });
  assert.equal(d.decision, "REFUSE");
  assert.match(d.reason, /unknown|could not be observed/);
});

test("12. the topology bound outranks the burst ceiling", () => {
  const d = arbitrateServerRequest({ requesterSlot: 7, fleet: fleet(6), pressure: HEALTHY, slotBound: 6 });
  assert.ok(d.burst_ceiling <= 6, "arbitration may never authorise more servers than there are slots");
});

test("12b. the bound is honoured in the shape its canonical owner actually returns", () => {
  // resolveManagedSlotCount() returns { count, source }. Passing that straight
  // through — the obvious call site — made Number.isInteger false and silently
  // dropped the bound. A ceiling that fails open is the one that must not.
  const d = arbitrateServerRequest({
    requesterSlot: 7, fleet: fleet(6), pressure: HEALTHY,
    slotBound: { count: 6, source: "host-config" },
  });
  assert.ok(d.burst_ceiling <= 6, "the object form of the bound must bind exactly as the integer form does");
});

test("13. holders arbitration refuses to touch are reported, not silently ignored", () => {
  const f = fleet(NORMAL, {
    3: { ownership_state: "unmanaged_listener" },
    4: { ownership_state: "unattributable_listener" },
    5: { ownership_state: "foreign_port_owner" },
  });
  const d = arbitrateServerRequest({ requesterSlot: 11, fleet: f, pressure: HEALTHY, slotBound: 12 });
  const slots = d.needs_operator.map((x) => x.slot).sort();
  assert.deepEqual(slots, [3, 4, 5], "all three classes must surface, including unattributable_listener");
  for (const x of d.needs_operator) assert.ok(x.why_not_reclaimed, "each must say why it was left alone");
  assert.equal(d.reclaim, null, "and none of them may be reclaimed");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
