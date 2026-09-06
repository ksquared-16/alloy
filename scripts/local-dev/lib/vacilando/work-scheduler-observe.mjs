/**
 * Build scheduling candidates from the owners that already hold the facts.
 *
 * Split from the planner for the reason every other Vacilando contract is: the
 * planner stays pure and totally testable, and this is the only place that
 * touches a store. The planner imports nothing at all — a control asserts that
 * — so it cannot quietly start deciding whether a run exists.
 *
 * WHAT EACH FACT COMES FROM, AND FROM NOWHERE ELSE:
 *
 *   durable lanes        development-lane.listDurableLanes
 *   run state            execution-run.activeRunForLane
 *   seat classification  provider-seat-state (active/attentive/idle/dormant/blocked)
 *   findings constraint  operational-findings.findingsForSteward
 *   unread output        lane-attention-view, over the notification store
 *
 * PHASE 6 CLOSED THE GAP THAT LEFT EVERY CANDIDATE UNKNOWN. Per-lane
 * authorization, dependency readiness and the deterministic next action now
 * come from `authorized-next-step`, which derives them from durable lane memory
 * and REVALIDATES them against live truth at the moment of asking. A lane with
 * no memory, a stale checkpoint, or an authorization with no provenance still
 * resolves UNKNOWN and still refuses to dispatch — the gap is closed by
 * supplying evidence, never by defaulting the absence of it to `true`.
 */
import { listDurableLanes } from "./development-lane.mjs";
import { authorizedNextStep, candidateFieldsFor } from "./authorized-next-step.mjs";
import { getLaneMemory } from "./lane-memory.mjs";
import { activeRunForLane } from "./execution-run.mjs";
import { findingsForSteward } from "./operational-findings.mjs";
import { allLaneAttentionViews, attentionRollup } from "./lane-attention-view.mjs";
import {
  planSchedule,
  schedulableCandidate,
  schedulerScoreboard,
} from "./work-scheduler.mjs";

export const SCHEDULER_OBSERVE_SCHEMA = "vacilando.work_scheduler_observe.v1";

/** Run states that mean the lane is productively occupied right now. */
const OCCUPYING = new Set(["EXECUTING", "VALIDATING", "RECOVERING", "NEEDS_INPUT", "WAITING_RESOURCE"]);

/**
 * Findings that constrain a lane.
 *
 * `blocks` is reserved for severities the findings owner already calls
 * constraining. Everything else is carried as context so a plan can explain a
 * degraded lane without refusing to run it.
 */
function constraintsFor(findingsView) {
  const rows = findingsView?.affecting_operation || [];
  return rows.map((f) => ({
    id: f.id,
    severity: f.severity,
    blocks: f.severity === "blocks_work" || f.severity === "control_plane",
  }));
}

export function observeCandidates({ root, now = Date.now(), liveTruth = {} } = {}) {
  const lanes = listDurableLanes(root) || [];
  let findingsView = null;
  try { findingsView = findingsForSteward(root); } catch { findingsView = null; }
  const constraints = constraintsFor(findingsView);

  return lanes.map((lane) => {
    let run = null;
    try { run = activeRunForLane(lane.lane_id, root); } catch { run = null; }
    const state = run?.state ?? null;

    // The authorization contract, revalidated against the live facts that could
    // have moved under the checkpoint. `live` is passed EXPLICITLY, including
    // the empty-object cases, because an undefined fact is unmeasurable and the
    // contract must be able to tell that from a measured absence.
    let memory = null;
    try { memory = getLaneMemory(lane.lane_id, root); } catch { memory = null; }
    const contract = authorizedNextStep({
      record: memory,
      live: {
        lane_id: lane.lane_id,
        run_state: state,
        staging_sha: liveTruth.staging_sha,
        dependency_states: liveTruth.dependency_states,
        finding_statuses: liveTruth.finding_statuses,
      },
      now,
    });
    const fields = candidateFieldsFor(contract);

    return schedulableCandidate({
      laneId: lane.lane_id,
      missionId: lane.mission_id ?? null,
      runState: state,
      ...fields,
      priorityClass: contract.authorization === "AUTHORIZED" && fields.nextAction
        ? "mission_continuation"
        : "planned",
      seatState: OCCUPYING.has(String(state)) ? "active" : null,
      readySince: run?.updated_at ?? lane.created_at ?? null,
      lastProgressAt: run?.updated_at ?? null,
      // Findings are global-to-operation today, so every lane carries the same
      // constraint set. A per-lane finding index would narrow this.
      findingConstraints: constraints,
      resourceDimensions: ["provider_seat"],
    });
  });
}

/**
 * The read-only scheduling view: what is running, what could run, and why the
 * rest is not. Probes nothing and starts nothing.
 */
export function observeScheduling({
  root,
  now = Date.now(),
  capacity = null,
  hostBand = null,
  liveTruth = {},
} = {}) {
  const candidates = observeCandidates({ root, now, liveTruth });
  const plan = planSchedule({ candidates, capacity, hostBand, now });
  const views = allLaneAttentionViews({
    lanes: candidates.map((c) => ({ lane_id: c.lane_id, run_state: c.run_state })),
    root,
  });
  return {
    schema_version: SCHEDULER_OBSERVE_SCHEMA,
    observed_at: new Date(now).toISOString(),
    ...schedulerScoreboard({ candidates, capacity, hostBand, plan }),
    attention: attentionRollup(views),
    lanes_with_unread_output: views.filter((v) => v.has_unread_output).map((v) => v.lane_id),
    lanes_requiring_director: views.filter((v) => v.requires_director).map((v) => v.lane_id),
    // Named so a reader is not left wondering why nothing is eligible.
    // Phase 6 supplies the evidence; enabling dispatch is a separate, evidenced
    // decision and is not taken here.
    dispatch_enabled: false,
    dispatch_note: "The authorization contract is wired and consumed. Dispatch stays disabled until the "
      + "§14 enablement evidence is met on real lanes; a lane with no memory, a stale checkpoint or an "
      + "unprovenanced authorization still resolves UNKNOWN and refuses.",
    authorization_summary: authorizationSummary(candidates, root, now, liveTruth),
  };
}

/** How the authorization contract resolved for each lane — the §18 scoreboard input. */
function authorizationSummary(candidates, root, now, liveTruth) {
  const out = { AUTHORIZED: 0, REQUIRES_DIRECTOR: 0, PROHIBITED: 0, UNKNOWN: 0, no_memory: 0 };
  for (const c of candidates) {
    let memory = null;
    try { memory = getLaneMemory(c.lane_id, root); } catch { memory = null; }
    if (!memory) { out.no_memory += 1; out.UNKNOWN += 1; continue; }
    const contract = authorizedNextStep({
      record: memory,
      live: {
        lane_id: c.lane_id, run_state: c.run_state,
        staging_sha: liveTruth.staging_sha,
        dependency_states: liveTruth.dependency_states,
        finding_statuses: liveTruth.finding_statuses,
      },
      now,
    });
    out[contract.authorization] = (out[contract.authorization] || 0) + 1;
  }
  return out;
}
