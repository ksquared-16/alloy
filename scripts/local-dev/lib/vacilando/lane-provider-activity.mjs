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
import {
  detectProviderBusy,
  detectPromptAffordance,
  detectPromptBlocker,
  TURN_FINISHED_RE,
} from "./provider-prompt-readiness.mjs";

export { TURN_FINISHED_RE };

/** How much pane tail is enough to see a footer, a caret, and recent narration. */
export const ACTIVITY_CAPTURE_LINES = 48;

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
/**
 * The agent's own words from a live turn, without TUI chrome.
 *
 * Claude Code writes the turn as `⏺` narration plus short tool rollups
 * (`Ran 19 shell commands`, `Brokered typecheck`). The conversation used to
 * ignore all of that and keep showing the last finished message — so Trust
 * Runtime sat on a completed summary for 90 minutes while the pane was still
 * Forging. Those ⏺ lines are the updates the operator is watching for.
 *
 * Deliberately not a TUI dump: composer carets, footers, and command traces
 * (`⎿  $ …`) stay out.
 */
export function extractLiveTurnProgress(text) {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  const lines = raw.split("\n");
  let lastCooked = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (TURN_FINISHED_RE.test(lines[i])) lastCooked = i;
  }
  const narr = [];
  for (let i = lastCooked + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const spoken = line.match(/^[ \t]*⏺[ \t]+(\S.*)$/);
    if (spoken) {
      narr.push(spoken[1].replace(/\s+$/, ""));
      continue;
    }
    const tool = line.match(/^[ \t]+(Ran \d+ shell commands)\s*$/i)
      || line.match(/^[ \t]+(Brokered \S[^\n]{0,80})$/);
    if (tool && narr.length) narr.push(tool[1].replace(/\s+$/, ""));
  }
  const recent = narr.slice(-8);
  const spinner = detectProviderBusy(raw);
  if (!recent.length && !spinner) return null;
  const parts = [];
  if (recent.length) parts.push(recent.join("\n"));
  if (spinner) parts.push(spinner);
  return {
    summary: parts.join("\n\n"),
    spinner: spinner || null,
    lines: recent,
  };
}

export function paneShowsFinishedTurn(text) {
  return TURN_FINISHED_RE.test(String(text ?? ""));
}

/**
 * Prose still on screen after the agent cooked and returned to a prompt.
 *
 * Only claimed when the pane itself says the turn finished (`Cooked for …`).
 * A quiet prompt between tool calls is not a completion — treating it as one
 * is how a live run gets closed on the previous viewport.
 *
 * The pane is a truncated viewport, so this is a fallback when the session
 * transcript has not been fetched yet — never a TUI dump.
 */
export function extractIdleTurnResult(text) {
  const raw = String(text ?? "");
  if (detectProviderBusy(raw)) return null;
  if (!paneShowsFinishedTurn(raw)) return null;
  const keep = [];
  for (const line of raw.split("\n")) {
    if (/^[ \t]*[─━]{8,}\s*$/.test(line) || /^[ \t]*❯/.test(line)) break;
    if (/auto mode|\? for shortcuts|\bfor agents\b|shift\+tab to cycle/i.test(line)) continue;
    if (TURN_FINISHED_RE.test(line)) continue;
    if (/✔\s+Update installed/i.test(line)) continue;
    if (/^\s*⎿/.test(line)) continue;
    keep.push(line);
  }
  const body = keep.join("\n").trim();
  if (body.length < 40) return null;
  if (/esc to interrupt/i.test(body)) return null;
  return {
    summary: body.length > 4000 ? body.slice(-4000) : body,
    spinner: null,
    lines: [],
    idle_result: true,
    finished_turn: true,
  };
}

export function classifyProviderActivity(text, { provider = null } = {}) {
  const raw = String(text ?? "");
  if (!raw.trim()) return { activity: PROVIDER_ACTIVITY.UNKNOWN, signal: null, live_progress: null };
  const progress = extractLiveTurnProgress(raw);
  const blocker = detectPromptBlocker(raw, { provider });
  if (blocker) {
    return {
      activity: PROVIDER_ACTIVITY.BLOCKED,
      signal: blocker.signal,
      blocker_kind: blocker.kind,
      live_progress: progress,
    };
  }
  const busy = detectProviderBusy(raw);
  if (busy) {
    return { activity: PROVIDER_ACTIVITY.WORKING, signal: busy, live_progress: progress };
  }
  const affordance = detectPromptAffordance(raw);
  if (affordance) {
    return {
      activity: PROVIDER_ACTIVITY.READY,
      signal: affordance,
      live_progress: extractIdleTurnResult(raw),
    };
  }
  return { activity: PROVIDER_ACTIVITY.UNKNOWN, signal: null, live_progress: progress };
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
