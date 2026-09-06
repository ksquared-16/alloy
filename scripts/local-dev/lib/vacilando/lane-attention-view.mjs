/**
 * "IS THERE NEW OUTPUT I HAVE NOT SEEN?" — a view state, not an execution state.
 *
 * THE PROBLEM. When a provider finishes a turn and leaves output for the
 * Director, the lane goes back to `ready`. A lane holding unread completed work
 * and a lane that is simply idle then look identical, so finished work is
 * discovered by opening lanes one at a time to check.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not add an execution or run
 * state. `ready` is still `ready`; nothing here is written to the run store,
 * and no scheduler or capacity decision consults it. Presentation must never
 * become a source of execution truth — that is how a display concern ends up
 * deciding whether a provider is busy.
 *
 * WHERE THE TRUTH ALREADY LIVES. `lane-notifications.mjs` already records one
 * durable record per meaningful lane event with a `seen_at` acknowledgement,
 * and already treats opening a lane as the acknowledgement
 * (`markLaneNotificationsSeen`). That IS the viewed cursor. This module derives
 * a view state from it and owns no storage of its own, so unread state survives
 * a Gateway restart because the notification store does, and it clears through
 * the one mechanism that already clears it.
 *
 * THE DISTINCTION THAT MUST NOT COLLAPSE.
 *
 *   has_unread_output   Is there new provider output I have not seen?
 *   director_category   Do I have an obligation? (needs_answer/stuck/attention/completed)
 *
 * A provider can finish something genuinely useful that needs reading and needs
 * no reply. Merging those two would either nag about work that wants nothing,
 * or hide work that does. They are computed separately here and returned
 * separately.
 */
import {
  DIRECTOR_CATEGORIES,
  directorCategoryForRunState,
  listNotifications,
} from "./lane-notifications.mjs";

export const ATTENTION_VIEW_SCHEMA = "vacilando.lane_attention_view.v1";

/**
 * Notification event types that represent COMPLETED PROVIDER OUTPUT.
 *
 * Narrow on purpose. A lane is not "unread" because a governed action changed
 * status or a server restarted; it is unread because a provider finished a turn
 * and left something to read. Anything not on this list is activity, and
 * activity belongs in lane history.
 */
export const OUTPUT_EVENT_TYPES = Object.freeze(["complete", "failed", "abandoned", "needs_input"]);

/** Presentation treatments, so every surface marks unread the same way. */
export const UNREAD_TREATMENT = Object.freeze({
  marker: "dot",
  label_suffix: "New",
  emphasis: "bold_title",
  // Colour alone is not a treatment: it fails for a reader who cannot
  // distinguish it and it disappears against a busy list.
  colour_only: false,
});

const isUnseen = (n) => !n.seen_at;

/**
 * Does this lane hold provider output the Director has not seen?
 *
 * `notifications` is the already-projected list for the lane. Passing it in
 * keeps this pure and keeps the store read in one place at the call site.
 */
export function laneAttentionView({
  laneId = null,
  notifications = [],
  runState = null,
} = {}) {
  const forLane = notifications.filter((n) => !laneId || n.lane_id === laneId);
  const outputs = forLane.filter((n) => OUTPUT_EVENT_TYPES.includes(String(n.event_type || "")));
  const unread = outputs.filter(isUnseen);

  // The obligation, computed from the run state through the existing owner —
  // NOT from whether anything is unread.
  const category = directorCategoryForRunState(runState);

  return {
    schema_version: ATTENTION_VIEW_SCHEMA,
    lane_id: laneId,
    has_unread_output: unread.length > 0,
    unread_count: unread.length,
    unread_since: unread.length
      ? unread.map((n) => n.created_at).filter(Boolean).sort()[0] ?? null
      : null,
    latest_unread_summary: unread.length ? (unread[unread.length - 1].summary ?? null) : null,
    // Independent, and returned alongside so a surface cannot accidentally
    // derive one from the other.
    director_category: category,
    requires_director: category === "needs_answer" || category === "stuck",
    treatment: unread.length ? UNREAD_TREATMENT : null,
    // The presentation label a lane list can render directly.
    label: unread.length
      ? `${labelForRunState(runState)} · ${UNREAD_TREATMENT.label_suffix}`
      : labelForRunState(runState),
  };
}

function labelForRunState(runState) {
  const s = String(runState || "").toUpperCase();
  if (s === "EXECUTING") return "Working";
  if (s === "NEEDS_INPUT") return "Needs you";
  if (s === "COMPLETE") return "Completed";
  if (s === "FAILED" || s === "ABANDONED") return "Stopped";
  if (s === "VALIDATING") return "Validating";
  return "Ready";
}

/**
 * The view for every lane, from one read of the store.
 *
 * Reading once and partitioning is not an optimisation — it is what keeps every
 * lane's unread state consistent with the same instant, so a list cannot show
 * one lane's answer from before an acknowledgement and another's from after.
 */
export function allLaneAttentionViews({ lanes = [], root = undefined } = {}) {
  let all = [];
  try { all = listNotifications({ root, limit: 500 }) || []; }
  catch { all = []; }
  const byLane = new Map();
  for (const n of all) {
    if (!n.lane_id) continue;
    if (!byLane.has(n.lane_id)) byLane.set(n.lane_id, []);
    byLane.get(n.lane_id).push(n);
  }
  return lanes.map((l) => laneAttentionView({
    laneId: l.lane_id,
    notifications: byLane.get(l.lane_id) || [],
    runState: l.run_state ?? l.execution_run?.state ?? null,
  }));
}

/** Scoreboard rollup: how many lanes hold unread output, and how many want a hand. */
export function attentionRollup(views = []) {
  return {
    schema_version: ATTENTION_VIEW_SCHEMA,
    lanes: views.length,
    with_unread_output: views.filter((v) => v.has_unread_output).length,
    requiring_director: views.filter((v) => v.requires_director).length,
    by_category: Object.fromEntries(
      DIRECTOR_CATEGORIES.map((c) => [c, views.filter((v) => v.director_category === c).length]),
    ),
  };
}
