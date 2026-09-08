#!/usr/bin/env node
/**
 * SEATS, LANES AND SERVERS ARE THREE DIFFERENT SCARCITIES.
 *
 * The failure this guards against is not "refused when it should admit" — it
 * is admitting on a measurement of the wrong resource, or on no measurement at
 * all. The sharpest case is a degraded read: the capacity owner correctly
 * reports `available: ceiling` when it cannot see the host, and anything that
 * checks `available` before `counted_from` will cheerfully admit a full
 * ceiling's worth of seats onto a machine nobody can observe.
 */
import assert from "node:assert/strict";
import { arbitrateProviderRequest, providerStanding } from "../lib/vacilando/provider-arbitration.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const live = (active, holders = []) => ({
  ok: active < 3, degraded: false, counted_from: "live_processes",
  ceiling: 3, active, available: Math.max(0, 3 - active), holders,
});
const DEGRADED = {
  ok: false, degraded: true, counted_from: "unavailable",
  ceiling: 3, active: 0, available: 3, holders: [],
};
const HEALTHY = { readable: true, level: 1 };

test("1. below the ceiling a seat is simply admitted", () => {
  const d = arbitrateProviderRequest({ laneId: "lane_a", capacity: live(1), pressure: HEALTHY });
  assert.equal(d.decision, "ADMIT");
  assert.equal(d.available, 2);
});

test("2. a degraded read is refused, not treated as three free seats", () => {
  // assessProviderCapacity reports available:3 here, correctly and by design.
  // Reading that number before counted_from is the trap.
  const d = arbitrateProviderRequest({ laneId: "lane_a", capacity: DEGRADED, pressure: HEALTHY });
  assert.equal(d.decision, "REFUSE");
  assert.equal(d.available, null, "a number nobody measured must not be reported as capacity");
  assert.match(d.reason, /could not be counted|stale metadata/);
});

test("3. a missing capacity reading is refused too", () => {
  assert.equal(arbitrateProviderRequest({ laneId: "lane_a", capacity: null }).decision, "REFUSE");
});

test("4. a lane already holding a seat is told so, not admitted twice", () => {
  const d = arbitrateProviderRequest({ laneId: "lane_a", capacity: live(2, [{ lane_id: "lane_a", pid: 42, seat_state: "active" }]) });
  assert.equal(d.decision, "ALREADY_RESIDENT");
});

test("5. at the ceiling a canonically idle seat is released rather than work interrupted", () => {
  const d = arbitrateProviderRequest({
    laneId: "lane_new", capacity: live(3, [{ lane_id: "lane_busy" }, { lane_id: "lane_idle" }, { lane_id: "lane_x" }]),
    reclaimPlan: { reclaim: [{ lane_id: "lane_idle", pid: 99, idle_ms: 900000, reclaim_reason: "provider_capacity_contention" }], candidates: [{ lane_id: "lane_idle", rank: 1 }] },
  });
  assert.equal(d.decision, "RECLAIM_THEN_ADMIT");
  assert.equal(d.reclaim.lane_id, "lane_idle");
  assert.match(d.reclaim.chosen_because, /idle/);
});

test("6. at the ceiling with nothing canonically idle, the request QUEUES", () => {
  const d = arbitrateProviderRequest({
    laneId: "lane_new", capacity: live(3),
    reclaimPlan: { reclaim: [], reason: "no_reclaimable_seat", candidates: [] },
  });
  assert.equal(d.decision, "QUEUE");
  assert.equal(d.queue_reason, "no_reclaimable_seat");
  assert.match(d.reason, /interrupting productive work/);
});

test("7. with no reclaim plan at all, the answer is QUEUE — never a guess", () => {
  const d = arbitrateProviderRequest({ laneId: "lane_new", capacity: live(3) });
  assert.equal(d.decision, "QUEUE");
  assert.equal(d.reclaim, null, "this module must not derive idleness of its own");
});

test("8. a healthy kernel does not argue for a fourth seat", () => {
  // Provider ceilings are CPU/API-bound on this host; server memory evidence
  // must never raise them. Reported, never consulted.
  const d = arbitrateProviderRequest({ laneId: "lane_new", capacity: live(3), pressure: HEALTHY });
  assert.equal(d.decision, "QUEUE");
  assert.equal(d.host_pressure.level, 1, "pressure is still reported");
  assert.equal(d.ceiling, 3);
});

test("9. upstream throttling is reported but is not local contention", () => {
  const d = arbitrateProviderRequest({ laneId: "lane_a", capacity: live(1), upstream: { throttled: true } });
  assert.equal(d.decision, "ADMIT", "a 529 upstream does not mean this host has no seat");
  assert.equal(d.upstream_throttled, true);
});

test("10. lane existence, placement and seat residency are three separate facts", () => {
  const cap = live(3, [{ lane_id: "lane_a", run_state: "EXECUTING", seat_state: "active" }]);
  const resident = providerStanding({ laneId: "lane_a", capacity: cap, placed: true });
  assert.deepEqual(
    [resident.durable_lane, resident.placed_lane, resident.provider_resident, resident.provider_executing],
    [true, true, true, true],
  );
  const parked = providerStanding({ laneId: "lane_z", capacity: cap, placed: false });
  assert.deepEqual(
    [parked.durable_lane, parked.placed_lane, parked.provider_resident],
    [true, false, false],
    "a lane with no seat and no slot is still a lane",
  );
});

test("11. a resident seat with no run is idle-resumable, not executing", () => {
  const cap = live(3, [{ lane_id: "lane_a", run_state: null, seat_state: "idle" }]);
  const s = providerStanding({ laneId: "lane_a", capacity: cap, placed: true });
  assert.equal(s.provider_executing, false);
  assert.equal(s.provider_idle_resumable, true);
});

test("12. twelve placed lanes and three seats is a supported state, not an error", () => {
  const cap = live(3, [{ lane_id: "l1" }, { lane_id: "l2" }, { lane_id: "l3" }]);
  const placedWithoutSeat = Array.from({ length: 9 }, (_, i) =>
    providerStanding({ laneId: `p${i}`, capacity: cap, placed: true }));
  assert.ok(placedWithoutSeat.every((s) => s.placed_lane && !s.provider_resident));
  assert.equal(cap.ceiling, 3);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
