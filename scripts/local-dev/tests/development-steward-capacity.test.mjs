#!/usr/bin/env node
/**
 * A CAPACITY IDEA MUST NOT BECOME A NEW STEWARD POWER.
 *
 * The steward already has a careful split between what it may do alone and
 * what always needs a person. The risk in handing it capacity facts is that
 * "we are full" becomes a reason to do something it was never allowed to do —
 * stop a big server, reclaim an old one, act on a lane whose state nobody
 * knows. These lock the emitted actions to the steward's own list and lock the
 * evidence to positive facts.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUTONOMOUS_ACTIONS, OPERATOR_ONLY_ACTIONS } from "../lib/vacilando/host-steward.mjs";
import { capacityReleaseActions, stewardCapacityInputs, reconsiderOnCapacityFreed } from "../lib/vacilando/host-steward-capacity.mjs";
import { recordDemand } from "../lib/vacilando/capacity-demand.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const srv = (o) => ({
  slot: 1, port: 3011, lane_worktree: "wt1", observed_state: "RUNNING",
  active_run: null, recovery_state: null, orphaned_registration: false,
  reclaimable: false, large: false, rss_mb: 500, desired_state: "RUNNING", ...o,
});
const fleetOf = (...servers) => ({ servers, rollup: { running: servers.length } });

test("1. every emitted action is one the steward may already take alone", () => {
  const { actions } = capacityReleaseActions({
    fleet: fleetOf(srv({ slot: 2, reclaimable: true }), srv({ slot: 3, orphaned_registration: true })),
  });
  assert.equal(actions.length, 2);
  for (const a of actions) {
    assert.ok(AUTONOMOUS_ACTIONS.includes(a.action), `${a.action} must be autonomous`);
    assert.ok(!OPERATOR_ONLY_ACTIONS.includes(a.action));
  }
});

test("2. a server running against its own STOP order is stopped, with the reason", () => {
  const { actions } = capacityReleaseActions({ fleet: fleetOf(srv({ reclaimable: true })) });
  assert.equal(actions[0].action, "stop_terminal_dev_server");
  assert.match(actions[0].because, /STOP/);
});

test("3. a registration whose worktree is gone is repaired, not killed", () => {
  const { actions } = capacityReleaseActions({ fleet: fleetOf(srv({ orphaned_registration: true })) });
  assert.equal(actions[0].action, "repair_stale_port_registration");
});

test("4. an active run vetoes everything, including an otherwise valid stop", () => {
  // The veto must beat a case that would otherwise fire, or it proves nothing.
  const { actions, surfaced } = capacityReleaseActions({
    fleet: fleetOf(srv({ reclaimable: true, active_run: { run_id: "r1", state: "EXECUTING" } })),
  });
  assert.equal(actions.length, 0, "live work is never preempted automatically");
  assert.match(surfaced[0].why, /active run/);
});

test("5. large, old, or unknown-desired servers produce no action at all", () => {
  // The three things a capacity module is most tempted to reclaim.
  const { actions } = capacityReleaseActions({
    fleet: fleetOf(
      srv({ slot: 4, large: true, rss_mb: 8082 }),
      srv({ slot: 5, desired_state: "UNKNOWN" }),
      srv({ slot: 6, age: "23:50:00" }),
    ),
  });
  assert.equal(actions.length, 0, "size, age and not-knowing are not evidence");
});

test("6. recovery belongs to the supervisor and is left alone", () => {
  for (const recovery_state of ["RECOVERING", "RESTART_EXHAUSTED"]) {
    const { actions, surfaced } = capacityReleaseActions({ fleet: fleetOf(srv({ reclaimable: true, recovery_state })) });
    assert.equal(actions.length, 0, `${recovery_state} must not be acted on here`);
    assert.match(surfaced[0].why, /supervisor/);
  }
});

test("7. a server that is not running yields nothing", () => {
  assert.equal(capacityReleaseActions({ fleet: fleetOf(srv({ observed_state: "DOWN", reclaimable: true })) }).actions.length, 0);
});

test("8. a missing fleet yields no actions rather than an empty-fleet conclusion", () => {
  assert.deepEqual(capacityReleaseActions({}).actions, []);
  assert.deepEqual(capacityReleaseActions({ fleet: null }).actions, []);
});

test("9. inputs name every source and say plainly when the picture is partial", () => {
  const partial = stewardCapacityInputs({ fleet: { rollup: {} }, policy: null, pressure: null, supervisor: null });
  assert.equal(partial.complete, false);
  assert.ok(partial.missing.includes("capacity_policy"));
  assert.ok(partial.missing.includes("memory_pressure"));
});

test("10. inputs carry no threshold of their own — only the policy's", () => {
  const i = stewardCapacityInputs({
    fleet: { rollup: {} }, pressure: { readable: true, level: 1 }, supervisor: {},
    policy: { dev_server_normal_ceiling: 8, dev_server_burst_ceiling: 10, dev_server_measured_knee: 11 },
  });
  assert.equal(i.complete, true);
  assert.deepEqual([i.ceilings.normal, i.ceilings.burst, i.ceilings.measured_knee], [8, 10, 11]);
  const raw = JSON.stringify(i);
  assert.ok(!/"default"|fallback/i.test(raw), "no local default may appear in the composed view");
});

test("11. an unreadable pressure probe is carried as unreadable, not as calm", () => {
  const i = stewardCapacityInputs({ fleet: {}, policy: {}, supervisor: {}, pressure: { readable: false, level: null } });
  assert.equal(i.pressure.readable, false);
});

test("12. freed capacity is offered through the same arbitration a new request faces", () => {
  const root = mkdtempSync(join(tmpdir(), "vac-steward-"));
  try {
    recordDemand({ laneId: "lane_waiting", decision: { decision: "QUEUE", queue_reason: "burst_exhausted" }, root });
    const out = reconsiderOnCapacityFreed({ arbitrate: () => ({ decision: "START", tier: "normal" }), root });
    assert.deepEqual(out.admitted.map((a) => a.lane_id), ["lane_waiting"]);
    assert.equal(out.still_queued, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
