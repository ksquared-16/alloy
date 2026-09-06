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
 * WHAT IS HONESTLY NOT YET MEASURED. Per-lane authorization, dependency
 * readiness and the deterministic next action are not derivable from any
 * existing store today: no owner records "this lane is authorized to do X
 * next". They are therefore reported as NULL, which the planner treats as
 * `unknown` and refuses to dispatch. That is the fail-closed answer, and it is
 * stated here rather than defaulted to `true` to make a plan look decisive.
 */
import { listDurableLanes } from "./development-lane.mjs";
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

export function observeCandidates({ root, now = Date.now() } = {}) {
  const lanes = listDurableLanes(root) || [];
  let findingsView = null;
  try { findingsView = findingsForSteward(root); } catch { findingsView = null; }
  const constraints = constraintsFor(findingsView);

  return lanes.map((lane) => {
    let run = null;
    try { run = activeRunForLane(lane.lane_id, root); } catch { run = null; }
    const state = run?.state ?? null;
    return schedulableCandidate({
      laneId: lane.lane_id,
      missionId: lane.mission_id ?? null,
      runState: state,
      // NOT MEASURED. No owner records per-lane authorization for a next step,
      // so this stays null and the planner refuses rather than assuming.
      authorized: null,
      dependenciesReady: null,
      directorJudgmentRequired: null,
      priorityClass: "planned",
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
} = {}) {
  const candidates = observeCandidates({ root, now });
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
    dispatch_enabled: false,
    dispatch_note: "Phase 5 ships the planner and the explanation. Autonomous dispatch is not enabled: "
      + "per-lane authorization, dependency readiness and the deterministic next action have no owner yet, "
      + "so every candidate is UNKNOWN and correctly refuses to run.",
  };
}
