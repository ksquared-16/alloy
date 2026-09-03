/**
 * PROVIDER SEATS ARE A DIFFERENT SCARCITY FROM SERVERS, AND FROM LANES.
 *
 * Twelve lanes can be placed on this host and only three of them can be
 * productively driving a provider at once. Those are not the same number and
 * they do not constrain each other: a lane does not need a seat to exist, to
 * hold a worktree, to keep its history, or to be resumed later. Conflating the
 * two is what makes "we are at capacity" sound like "your work is gone".
 *
 * The reclaim machinery this leans on already exists and is careful —
 * grace-based idleness that deliberately excludes process age, contention as
 * the only trigger, minimal-by-construction deficits. What did not exist was an
 * answer for the lane that arrives when all three seats are busy and none can
 * safely be freed. That answer is a queue, not a failure.
 *
 * TWO SCARCITIES THIS MUST NOT ABSORB. Upstream provider throttling (the 529s)
 * and host memory pressure are real and are reported here, but neither moves
 * the seat ceiling: seats are bounded by policy, and the measured evidence on
 * this host is that provider ceilings are CPU/API-bound rather than
 * memory-bound. Letting a healthy kernel argue for a fourth seat, or letting
 * upstream throttling look like local contention, would be reasoning about one
 * resource from a measurement of another.
 */
import { DEMAND_DIMENSIONS } from "./capacity-demand.mjs";

export const PROVIDER_ARBITRATION_SCHEMA = "vacilando.provider_arbitration.v1";

/**
 * Decide what to do about one lane's request for a provider seat.
 *
 * @param {object} o
 * @param {string} o.laneId            the lane asking
 * @param {object} o.capacity          an `assessProviderCapacity()` result
 * @param {object|null} o.reclaimPlan  a `planReclamation()` result, when the caller has one
 * @param {object|null} o.pressure     host pressure — reported, never a seat input
 * @param {object|null} o.upstream     upstream provider health — reported, never a seat input
 */
export function arbitrateProviderRequest({
  laneId = null,
  capacity = null,
  reclaimPlan = null,
  pressure = null,
  upstream = null,
} = {}) {
  const base = {
    schema_version: PROVIDER_ARBITRATION_SCHEMA,
    decided_at: new Date().toISOString(),
    dimension: DEMAND_DIMENSIONS.PROVIDER,
    lane_id: laneId,
    ceiling: capacity?.ceiling ?? null,
    active: capacity?.active ?? null,
    available: capacity?.available ?? null,
    // Reported so they are visible, and separated so they cannot be mistaken
    // for seat capacity by anything downstream.
    host_pressure: pressure ? { level: pressure.level, readable: pressure.readable !== false } : null,
    upstream_throttled: upstream ? Boolean(upstream.throttled) : null,
    reclaim: null,
    queue_reason: null,
    considered: [],
  };

  // A DEGRADED READ IS NOT FREE CAPACITY. assessProviderCapacity reports
  // `available: ceiling` when live process inspection is unavailable, which is
  // the correct thing for it to say and a trap for anyone who reads
  // `available` before `counted_from`: taken at face value it would admit a
  // full ceiling's worth of seats on a host nobody can see.
  if (!capacity || capacity.degraded === true || capacity.counted_from !== "live_processes") {
    return { ...base, decision: "REFUSE", available: null,
      reason: "provider seats could not be counted from live processes; capacity is unknown and is not being enforced from stale metadata" };
  }

  const holders = Array.isArray(capacity.holders) ? capacity.holders : [];
  const mine = laneId ? holders.find((h) => h.lane_id === laneId) : null;
  if (mine) {
    return { ...base, decision: "ALREADY_RESIDENT",
      reason: `lane already holds a provider seat (pid ${mine.pid ?? "unknown"}, ${mine.seat_state ?? "state unknown"})` };
  }

  if ((capacity.available ?? 0) > 0) {
    return { ...base, decision: "ADMIT",
      reason: `${capacity.active}/${capacity.ceiling} seats in use` };
  }

  // At the ceiling. Only a seat the seat-state owner has positively classified
  // idle AND reclaimable may be taken; this module does not re-derive idleness
  // and must never soften that judgement.
  const chosen = Array.isArray(reclaimPlan?.reclaim) ? reclaimPlan.reclaim[0] : null;
  if (chosen) {
    return { ...base, decision: "RECLAIM_THEN_ADMIT",
      reclaim: {
        lane_id: chosen.lane_id, pid: chosen.pid ?? null,
        agent_session_id: chosen.agent_session_id ?? null,
        idle_ms: chosen.idle_ms ?? null,
        chosen_because: `canonically idle and reclaimable, idle longest of the candidates (${chosen.reclaim_reason ?? "provider_capacity_contention"})`,
      },
      considered: (reclaimPlan.candidates || []).map((c) => ({ lane_id: c.lane_id, rank: c.rank })),
      reason: `${capacity.active}/${capacity.ceiling} seats in use; releasing a canonically idle seat rather than interrupting work` };
  }

  return { ...base, decision: "QUEUE",
    queue_reason: reclaimPlan?.reason ?? "no_reclaimable_seat",
    considered: (reclaimPlan?.candidates || []).map((c) => ({ lane_id: c.lane_id, rank: c.rank })),
    reason: `${capacity.active}/${capacity.ceiling} provider seats in use and no seat is canonically idle and reclaimable`
      + ` — queued rather than interrupting productive work` };
}

/**
 * A lane's provider standing, kept deliberately separate from its existence.
 *
 * The Director's model needs these apart: a lane can be durable without being
 * placed, placed without holding a seat, and hold a seat without executing.
 * Collapsing any pair of those makes "no seat" read as "no lane".
 */
export function providerStanding({ laneId, capacity = null, placed = false, durable = true } = {}) {
  const holders = Array.isArray(capacity?.holders) ? capacity.holders : [];
  const h = laneId ? holders.find((x) => x.lane_id === laneId) : null;
  return {
    lane_id: laneId,
    durable_lane: Boolean(durable),
    placed_lane: Boolean(placed),
    provider_resident: Boolean(h),
    provider_executing: Boolean(h && h.run_state && h.run_state !== "COMPLETE"),
    provider_idle_resumable: Boolean(h && !h.run_state),
    seat_state: h?.seat_state ?? null,
  };
}
