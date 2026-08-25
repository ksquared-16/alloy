/**
 * Is the agent in this lane actually doing anything right now?
 *
 * WHY THIS DID NOT EXIST. Lane status was derived entirely from the Execution
 * Run. A lane with no run read as idle — "Ready", "No active work" — even with
 * a provider mid-turn in its worktree. Measured across the live host: three of
 * four lanes showed `run: none` while their panes all read `esc to interrupt`,
 * which is Claude saying it is working. The operator could not tell which lanes
 * were running, because the thing being displayed was never the thing they were
 * asking about.
 *
 * A run is Vacilando's record of an instruction. Provider activity is what the
 * agent is doing. They usually agree and they are not the same fact: an agent
 * keeps working after a run is closed, and a queued run has no agent yet.
 *
 * The pane is the only place the second fact exists, so it is read from there —
 * bounded, read-only, and only for lanes that actually have a live pane.
 */
import { detectProviderBusy, detectPromptAffordance, detectPromptBlocker } from "./provider-prompt-readiness.mjs";

/** How much pane tail is enough to see a footer and a caret. */
export const ACTIVITY_CAPTURE_LINES = 24;

export const PROVIDER_ACTIVITY = Object.freeze({
  WORKING: "working",     // mid-turn: it will produce output without being asked
  BLOCKED: "blocked",     // a dialog is waiting on a person
  READY: "ready",         // at a prompt, waiting for an instruction
  UNKNOWN: "unknown",     // a pane exists but says neither
  ABSENT: "absent",       // no pane at all
});

/**
 * Classify one pane's text.
 *
 * Order matters. A blocked pane can also look busy (a spinner behind a modal),
 * and a working pane usually still draws its caret — so the most specific
 * condition wins, and "ready" is only claimed when nothing else is true.
 */
export function classifyProviderActivity(text, { provider = null } = {}) {
  const raw = String(text ?? "");
  if (!raw.trim()) return { activity: PROVIDER_ACTIVITY.UNKNOWN, signal: null };
  const blocker = detectPromptBlocker(raw, { provider });
  if (blocker) {
    return { activity: PROVIDER_ACTIVITY.BLOCKED, signal: blocker.signal, blocker_kind: blocker.kind };
  }
  const busy = detectProviderBusy(raw);
  if (busy) return { activity: PROVIDER_ACTIVITY.WORKING, signal: busy };
  const affordance = detectPromptAffordance(raw);
  if (affordance) return { activity: PROVIDER_ACTIVITY.READY, signal: affordance };
  return { activity: PROVIDER_ACTIVITY.UNKNOWN, signal: null };
}

/**
 * Attach observed activity to each lane.
 *
 * Only lanes with a live pane are captured, so an offline lane costs nothing.
 * A capture failure leaves the lane's activity `unknown` rather than guessing —
 * claiming "ready" for a pane we could not read is how a send gets fired into
 * a modal.
 */
export async function attachLaneProviderActivity(lanes, { capture = null } = {}) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  let read = capture;
  if (!read) {
    try {
      const { capturePaneText } = await import("./lanes.mjs");
      read = (target) => capturePaneText(target, ACTIVITY_CAPTURE_LINES);
    } catch {
      return list;
    }
  }

  return Promise.all(list.map(async (lane) => {
    const target = lane?.tmux?.pane_id || lane?.binding?.tmux_pane || lane?.tmux?.session || null;
    const alive = lane?.tmux?.alive === true || Boolean(lane?.binding?.tmux_pane);
    if (!target || !alive) {
      return { ...lane, provider_activity: { activity: PROVIDER_ACTIVITY.ABSENT, signal: null } };
    }
    try {
      const out = await read(target);
      const text = typeof out === "string" ? out : String(out?.text || "");
      if (!text.trim()) {
        return { ...lane, provider_activity: { activity: PROVIDER_ACTIVITY.UNKNOWN, signal: null } };
      }
      const seen = classifyProviderActivity(text, {
        provider: lane?.preferred_provider || lane?.binding?.provider || null,
      });
      return { ...lane, provider_activity: { ...seen, observed_at: new Date().toISOString() } };
    } catch {
      return { ...lane, provider_activity: { activity: PROVIDER_ACTIVITY.UNKNOWN, signal: null } };
    }
  }));
}

/**
 * Does what the run claims disagree with what the agent is doing?
 *
 * Surfaced rather than silently reconciled: the two facts are both real, and an
 * operator who is told "no active work" while their agent is mid-turn deserves
 * to know which one Vacilando is showing them.
 */
export function activityContradictsRun(lane) {
  const activity = lane?.provider_activity?.activity || null;
  const run = lane?.execution_run?.state || null;
  if (!activity) return null;
  if (activity === PROVIDER_ACTIVITY.WORKING && !run) {
    return { kind: "working_without_run", detail: "The agent is working, but no Execution Run is open for it." };
  }
  if (activity === PROVIDER_ACTIVITY.READY && run === "EXECUTING") {
    return { kind: "idle_while_executing", detail: "The run says executing, but the agent is idle at a prompt." };
  }
  if (activity === PROVIDER_ACTIVITY.ABSENT && run === "EXECUTING") {
    return { kind: "executing_without_provider", detail: "The run says executing, but no agent is running in this lane." };
  }
  return null;
}
