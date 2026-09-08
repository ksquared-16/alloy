#!/usr/bin/env node
/**
 * RESIDENCY IS NOT OCCUPANCY, AND HEALTH MUST SAY SO.
 *
 * THE DEFECT THIS COVERS, measured live on 2026-09-06. `vac health` returned
 * `verdict: problem` on two provider checks while the host was ~78% idle:
 *
 *   provider.capacity  "More provider seats are live than the ceiling allows"  (9 pids)
 *   provider.seats     "9 seats hold capacity against a ceiling of 4"
 *
 * The truth at that moment was 9 resident, 2 executing, 7 idle_reclaimable, and
 * provider_admission_waiting = 0 — capacity denied to nobody.
 *
 * Two separate mistakes:
 *
 *   1. Counting live PROCESSES against the productive ceiling. Capacity V2
 *      established that a resident idle session is the resting state of a
 *      persistent agent, not a consumed seat. `lanes.consistency` already called
 *      the identical condition "normal, and reclaimable under contention", so
 *      three checks gave one condition two verdicts.
 *   2. Measuring against the DERIVED floor(cores/3) = 4 while its sibling used
 *      the configured 8. Capacity V2 retired that heuristic against direct
 *      measurement, and a health check that contradicts promoted doctrine
 *      teaches its reader to ignore health.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { checkProviderCapacity, checkProviderSeats } from "../lib/vacilando/health.mjs";

/** The live shape: 9 resident, 2 executing, 7 reclaimable, nobody waiting. */
const CAPACITY = { axes: { provider_capacity: { ceiling: 4, bounded_by: "cores" } }, policy_version: "v1" };
const NINE_SEATS = Array.from({ length: 9 }, (_, i) => ({ pid: 900 + i, provider: "claude", lane_name: `lane${i}` }));
const SUMMARY = { counts: { active: 2 }, idle_reclaimable: 7, holding_capacity: 9 };

test("nine resident providers with two executing is HEALTHY, not a problem", () => {
    const f = checkProviderCapacity({
        capacity: CAPACITY, seats: NINE_SEATS, configuredMax: 8, holdingCapacity: 2,
    });
    assert.equal(f.severity, "healthy", "a mostly-idle fleet must not read as a saturated host");
    assert.equal(f.measurements.active_seats, 2, "occupancy is what is executing");
    assert.equal(f.measurements.resident_seats, 9, "residency stays reported — its absence is what hid this");
});

test("occupancy above the ceiling is still a problem", () => {
    // The fix must not make the check unable to fire.
    const f = checkProviderCapacity({
        capacity: CAPACITY, seats: NINE_SEATS, configuredMax: 8, holdingCapacity: 9,
    });
    assert.equal(f.severity, "problem");
});

test("the configured ceiling wins over the retired derived heuristic", () => {
    // derived says 4, configured says 8; at 6 executing the answer differs.
    const f = checkProviderCapacity({
        capacity: CAPACITY, seats: NINE_SEATS, configuredMax: 8, holdingCapacity: 6,
    });
    assert.equal(f.measurements.max_active, 8, "Capacity V2 certified 8; derived 4 is not authoritative");
    assert.equal(f.severity, "healthy");
});

test("reclaimable excess with nobody waiting is a WATCH, not a problem", () => {
    const f = checkProviderSeats({
        seats: [], summary: SUMMARY, waitingOnProviderCapacity: [], reclaimsInFlight: [], ceiling: 8,
    });
    assert.notEqual(f.severity, "problem", "excess that denies nobody is not a problem");
    assert.equal(f.severity, "watch", "but it stays visible");
});

test("blocked admissions beside reclaimable idle seats IS a problem", () => {
    // The failure actually worth waking someone for, and it must still fire.
    const f = checkProviderSeats({
        seats: [], summary: SUMMARY,
        waitingOnProviderCapacity: [{ lane_id: "lane_waiting" }],
        reclaimsInFlight: [], ceiling: 8,
    });
    assert.equal(f.severity, "problem");
    assert.match(f.explanation || "", /blocked on provider capacity/);
});

test("active occupancy above the ceiling is a problem even with nobody waiting", () => {
    // A ceiling that is not honoured is a problem regardless of who is queued.
    const f = checkProviderSeats({
        seats: [], summary: { counts: { active: 9 }, idle_reclaimable: 0, holding_capacity: 9 },
        waitingOnProviderCapacity: [], reclaimsInFlight: [], ceiling: 8,
    });
    assert.equal(f.severity, "problem");
    assert.match(f.explanation || "", /actively executing against a ceiling/);
});
