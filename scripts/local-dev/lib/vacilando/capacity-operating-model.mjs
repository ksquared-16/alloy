/**
 * THE OPERATING MODEL, IN ONE SHAPE SOMEBODY CAN READ.
 *
 * Health could already answer "is provider capacity fine". It could not answer
 * the question an operator actually has, which is "what is this machine doing
 * and what is it refusing". Those need different things on screen: not just
 * ceilings but how close we are to them, not just a server count but which of
 * those servers is wanted, and — the part that was invisible — who is waiting
 * and why.
 *
 * Two display rules, both learned the hard way:
 *
 *   A number nobody measured is never shown as a number. An unreadable
 *   pressure probe reads as "unknown", never as calm, because a calm-looking
 *   dashboard over a blind probe is worse than an obviously broken one.
 *
 *   Nothing here recomputes a ceiling. Every value is passed through from its
 *   owner, so the screen cannot disagree with the policy that is actually
 *   being enforced. A display that derives its own numbers eventually shows a
 *   comforting one.
 */
import { DEMAND_DIMENSIONS, queuedDemand } from "./capacity-demand.mjs";

export const OPERATING_MODEL_SCHEMA = "vacilando.capacity_operating_model.v1";

export function capacityOperatingModel({
  placement = null,
  fleet = null,
  policy = null,
  pressure = null,
  providerCapacity = null,
  root = undefined,
} = {}) {
  const servers = Array.isArray(fleet?.servers) ? fleet.servers : [];
  const running = servers.filter((s) => s.observed_state === "RUNNING");
  const normal = policy?.dev_server_normal_ceiling ?? null;
  const burst = policy?.dev_server_burst_ceiling ?? null;

  const q = (dimension) => queuedDemand({ dimension, ...(root ? { root } : {}) });

  return {
    schema_version: OPERATING_MODEL_SCHEMA,
    observed_at: new Date().toISOString(),

    lanes: {
      durable: placement?.rollup?.durable ?? null,
      placed: placement?.rollup?.placed ?? null,
      parked: placement?.rollup?.parked ?? null,
      no_worktree: placement?.rollup?.no_worktree ?? null,
      slot_conflicts: placement?.rollup?.slot_conflicts ?? [],
    },

    servers: {
      running: fleet ? running.length : null,
      normal_ceiling: normal,
      burst_ceiling: burst,
      measured_knee: policy?.dev_server_measured_knee ?? null,
      // How far past NORMAL we are. Zero while inside the normal budget, so
      // "using burst" is a visible state rather than something to work out
      // from two numbers.
      using_burst: fleet && Number.isInteger(normal) ? Math.max(0, running.length - normal) : null,
      total_rss_mb: fleet?.rollup?.total_rss_mb ?? null,
      with_active_run: fleet?.rollup?.with_active_run ?? null,
      recovering: servers.filter((s) => s.recovery_state === "RECOVERING").map((s) => s.slot),
      restart_exhausted: servers.filter((s) => s.recovery_state === "RESTART_EXHAUSTED").map((s) => s.slot),
    },

    providers: {
      ceiling: providerCapacity?.ceiling ?? policy?.provider_floor ?? null,
      active: providerCapacity?.counted_from === "live_processes" ? providerCapacity.active : null,
      // A degraded count is not a count. Shown as unknown so nobody reads the
      // fallback `available: ceiling` as free seats.
      countable: providerCapacity ? providerCapacity.counted_from === "live_processes" : null,
    },

    browsers: { ceiling: policy?.browser_concurrency_ceiling ?? null, pool: "automated_only" },
    serialized: {
      validation_jobs: policy?.validation_job_ceiling ?? null,
      heavy_jobs: policy?.heavy_job_ceiling ?? null,
      installs: policy?.install_ceiling ?? null,
    },

    pressure: pressure && pressure.readable !== false
      ? { state: pressure.level_label ?? String(pressure.level), level: pressure.level, thrashing: pressure.thrashing === true }
      : { state: "unknown", level: null, thrashing: null, why: "the pressure probe could not be read" },

    queues: {
      servers: q(DEMAND_DIMENSIONS.SERVER).map(brief),
      providers: q(DEMAND_DIMENSIONS.PROVIDER).map(brief),
    },
  };
}

function brief(r) {
  return {
    request_id: r.request_id, lane_id: r.lane_id,
    position: r.queue_position, waiting_since: r.requested_at,
    blocker: r.blocker,
  };
}
