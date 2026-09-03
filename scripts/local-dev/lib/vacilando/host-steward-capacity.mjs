/**
 * THE STEWARD GETS CAPACITY FACTS. IT DOES NOT GET A SECOND OPINION.
 *
 * Every number here belongs to somebody else: ceilings to capacity policy,
 * pressure to the memory manager, per-server cost and desired state to fleet
 * observation, waiting work to the demand queue, recovery to the supervisor.
 * This module carries them into one shape and adds NOTHING — no threshold, no
 * fallback default, no "if we cannot read it, assume it is fine". The reason
 * capacity drifted before was not that any single owner was wrong; it was that
 * three places each kept their own slightly different copy.
 *
 * What it does add is the mapping from a capacity fact to an action the
 * steward is already allowed to take. That mapping is deliberately tiny, and
 * every action it can emit is checked against the steward's own autonomous
 * list — so a new capacity idea cannot smuggle in a new power. Anything that
 * would preempt live work is not on the list and cannot be produced here.
 */
import { AUTONOMOUS_ACTIONS } from "./host-steward.mjs";
import { DEMAND_DIMENSIONS, queuedDemand, reconsiderDemand } from "./capacity-demand.mjs";

export const STEWARD_CAPACITY_SCHEMA = "vacilando.host_steward_capacity.v1";

/**
 * One composed view for the steward, with every source named.
 *
 * `complete` is the load-bearing field. A steward acting on a partial picture
 * is more dangerous than one that does nothing, because the missing part is
 * exactly what would have stopped it.
 */
export function stewardCapacityInputs({
  fleet = null,
  policy = null,
  pressure = null,
  supervisor = null,
  root = undefined,
} = {}) {
  const sources = {
    fleet_observation: fleet ? "server-fleet-observation" : null,
    capacity_policy: policy ? "capacity-policy" : null,
    memory_pressure: pressure ? "memory-manager" : null,
    server_demand: "capacity-demand",
    supervisor_state: supervisor ? "alloy-dev-supervise" : null,
  };
  const missing = Object.entries(sources).filter(([, v]) => !v).map(([k]) => k);
  return {
    schema_version: STEWARD_CAPACITY_SCHEMA,
    observed_at: new Date().toISOString(),
    sources,
    missing,
    complete: missing.length === 0,
    servers: fleet?.rollup ?? null,
    ceilings: policy
      ? {
        normal: policy.dev_server_normal_ceiling ?? null,
        burst: policy.dev_server_burst_ceiling ?? null,
        measured_knee: policy.dev_server_measured_knee ?? null,
        providers: policy.provider_floor ?? null,
        browsers: policy.browser_concurrency_ceiling ?? null,
      }
      : null,
    pressure: pressure
      ? { readable: pressure.readable !== false, level: pressure.level, thrashing: pressure.thrashing === true }
      : null,
    queued: {
      servers: queuedDemand({ dimension: DEMAND_DIMENSIONS.SERVER, ...(root ? { root } : {}) }).length,
      providers: queuedDemand({ dimension: DEMAND_DIMENSIONS.PROVIDER, ...(root ? { root } : {}) }).length,
    },
    supervisor: supervisor ?? null,
  };
}

/**
 * Capacity-derived actions, drawn only from what the steward may already do.
 *
 * Two cases, both resting on positive evidence:
 *
 *   - a registered slot whose worktree is gone       -> repair the registration
 *   - a server running against its own STOP order    -> stop it
 *
 * Notably absent: anything that reclaims a large server, an old one, or one
 * whose desired state is merely unknown. Those are the three things a capacity
 * module is most tempted to do and the three the evidence does not support.
 * An active run vetoes every case unconditionally.
 */
export function capacityReleaseActions({ fleet = null } = {}) {
  const servers = Array.isArray(fleet?.servers) ? fleet.servers : [];
  const actions = [];
  const surfaced = [];
  for (const s of servers) {
    if (s.observed_state !== "RUNNING") continue;
    if (s.active_run) {
      surfaced.push({ slot: s.slot, why: `active run ${s.active_run.state}; never preempted automatically` });
      continue;
    }
    if (s.recovery_state === "RECOVERING" || s.recovery_state === "RESTART_EXHAUSTED") {
      surfaced.push({ slot: s.slot, why: `recovery state ${s.recovery_state}; the supervisor owns this` });
      continue;
    }
    if (s.orphaned_registration) {
      actions.push({
        action: "repair_stale_port_registration", slot: s.slot, port: s.port,
        worktree: s.lane_worktree,
        because: "the registered worktree no longer exists on disk",
      });
      continue;
    }
    if (s.reclaimable === true) {
      actions.push({
        action: "stop_terminal_dev_server", slot: s.slot, port: s.port,
        worktree: s.lane_worktree, rss_mb: s.rss_mb,
        because: "running although its operator's last recorded instruction was STOP",
      });
    }
  }
  // A capacity idea must never become a new steward power. If this ever emits
  // something outside the autonomous list, it is a bug in this file, and the
  // safe reading is to surface rather than perform.
  const permitted = actions.filter((a) => AUTONOMOUS_ACTIONS.includes(a.action));
  const rejected = actions.filter((a) => !AUTONOMOUS_ACTIONS.includes(a.action))
    .map((a) => ({ ...a, why: "not an autonomous steward action; surfaced instead of performed" }));
  return { actions: permitted, surfaced: [...surfaced, ...rejected] };
}

/**
 * When capacity frees, offer it to whoever has been waiting longest.
 *
 * The steward does not decide who gets it — it re-runs the same arbitration a
 * fresh request would face. Anything else would make freed capacity follow a
 * different rule from requested capacity.
 */
export function reconsiderOnCapacityFreed({ dimension = DEMAND_DIMENSIONS.SERVER, arbitrate = null, root = undefined } = {}) {
  return reconsiderDemand({ dimension, arbitrate, ...(root ? { root } : {}) });
}
