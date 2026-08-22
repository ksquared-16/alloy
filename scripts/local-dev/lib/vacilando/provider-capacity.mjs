/**
 * Provider capacity — the canonical owner of "how much computation is running".
 *
 * THE DISTINCTION THIS EXISTS TO ENFORCE. Vacilando has two different scarce
 * things and they were being counted as one:
 *
 *   DURABLE WORK is a lane and its worktree — a conversation, its run history,
 *   its branch and its files. It costs disk. It is not scarce, it does not
 *   expire, and there is no reason to cap it at six. A worktree that nobody is
 *   working in consumes nothing that another lane needs.
 *
 *   ACTIVE COMPUTATION is a provider process — a real Claude or Cursor agent,
 *   running, attached to a lane. THIS is scarce: it is CPU, memory, and a seat
 *   against the model. It is the only thing the concurrency ceiling governs.
 *
 * Counting the first as if it were the second is what refused a new lane while
 * one agent was running: five worktrees claimed slots, four were counted as
 * "active providers" against a ceiling of three, and exactly one of them had a
 * process in it.
 *
 * WHAT COUNTS. A provider consumes capacity when a live process is correlated
 * to a lane AND that lane is in a state that needs the process to be thinking.
 * A parked conversation does not: see provider-suspension.mjs, which puts the
 * process down and keeps the work.
 *
 * WHAT DOES NOT COUNT. A worktree on disk. A slot number. A metadata file. A
 * shell. A `node` script. A tmux pane with no agent in it. A dead process. The
 * same process seen through two panes. A terminal run. A lane that is merely
 * offline. None of these are computation.
 *
 * SEPARATELY GOVERNED. Ports, browsers, databases and exclusive validation
 * leases are runtime resources with their own broker (execution-resource.mjs).
 * They are not provider capacity and must never be added to this number.
 */

/** Run states whose work genuinely needs a thinking provider. */
export const ACTIVE_RUN_STATES = Object.freeze(["EXECUTING", "VALIDATING", "RECOVERING"]);
/** Session states where the process is allocated and coming up. */
export const STARTING_SESSION_STATES = Object.freeze(["STARTING", "RESTARTING", "VERIFYING", "HANDOFF"]);
/** Durable-but-parked: the work is real, the process is not needed. */
export const PARKED_RUN_STATES = Object.freeze(["NEEDS_INPUT", "WAITING_RESOURCE", "QUEUED"]);

export const DEFAULT_MAX_ACTIVE_PROVIDERS = 3;

export function configuredProviderCeiling(env = process.env) {
  const raw = Number(env.ALLOY_MAX_ACTIVE_PROVIDERS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_ACTIVE_PROVIDERS;
}

function normalizePath(p) {
  return String(p || "").replace(/\/+$/, "");
}

/**
 * Is this pane running a recognised agent?
 *
 * Deliberately the same contract lane presence uses. A shell is not an agent. A
 * `node` script running inside a worktree is not an agent — that one mattered:
 * a background node process was being counted as a Claude seat.
 */
export function paneRunsProvider(pane) {
  if (!pane || pane.dead) return null;
  const cmd = String(pane.command || "");
  const title = String(pane.title || "");
  if (/cursor[- ]?agent/i.test(cmd) || /cursor[- ]?agent/i.test(title)) return "cursor";
  if (/claude/i.test(cmd) || /claude/i.test(title)) return "claude";
  // Both TUIs report their own semver as the process name.
  if (/^\d+\.\d+\.\d+$/.test(cmd)) return "claude";
  return null;
}

/**
 * One entry per PROCESS, correlated to the lane that owns it.
 *
 * Deduplication is by pid where tmux reports one, falling back to pane id. A
 * split window shows the same agent through two panes; counting it twice would
 * consume a seat that does not exist.
 */
export function correlateProviderProcesses({ panes = [], lanes = [], sessions = [] } = {}) {
  const byWorktree = new Map();
  const byTmux = new Map();
  for (const lane of lanes) {
    const wt = normalizePath(lane?.binding?.worktree_path || lane?.worktree?.path);
    if (wt) byWorktree.set(wt, lane);
    const tmux = String(lane?.binding?.tmux_session || lane?.tmux?.session || "");
    if (tmux) byTmux.set(tmux, lane);
  }
  const sessionByLane = new Map();
  for (const s of sessions) {
    if (s?.lane_id) sessionByLane.set(s.lane_id, s);
  }

  const seen = new Map();
  for (const pane of panes) {
    const provider = paneRunsProvider(pane);
    if (!provider) continue;
    const key = pane.pid ? `pid:${pane.pid}` : `pane:${pane.pane_id || ""}`;
    if (!key || key === "pane:") continue;
    if (seen.has(key)) continue;

    const cwd = normalizePath(pane.cwd);
    // Prefer the worktree the process is IN; fall back to the tmux session it
    // lives in. A pane deep inside a worktree still belongs to that worktree.
    let lane = byWorktree.get(cwd) || null;
    if (!lane && cwd) {
      for (const [wt, candidate] of byWorktree) {
        if (cwd.startsWith(`${wt}/`)) { lane = candidate; break; }
      }
    }
    if (!lane) lane = byTmux.get(String(pane.session || "")) || null;

    seen.set(key, {
      key,
      pid: pane.pid || null,
      pane_id: pane.pane_id || null,
      tmux_session: pane.session || null,
      provider,
      worktree_path: cwd || null,
      lane_id: lane?.lane_id || null,
      lane_name: lane?.name || lane?.label || null,
      session_state: lane ? (sessionByLane.get(lane.lane_id)?.state || null) : null,
      run_state: lane?.execution_run?.state || null,
    });
  }
  return [...seen.values()];
}

/**
 * Does this correlated process consume capacity right now?
 *
 * The table the Director set: computation is consumed while the agent has to
 * think. A parked conversation, a queued instruction with no process, a
 * finished run, an idle session — none of them do.
 */
export function processConsumesCapacity(proc, { suspended = false } = {}) {
  if (!proc) return false;
  if (suspended) return false;
  const run = proc.run_state || null;
  const session = proc.session_state || null;
  if (STARTING_SESSION_STATES.includes(session)) return true;
  if (ACTIVE_RUN_STATES.includes(run)) return true;
  // A live agent with no run is a session someone left open. It is genuinely
  // holding a seat, so it counts — and `Release execution capacity` is how the
  // operator gets it back.
  if (!run && session === "ACTIVE") return true;
  if (PARKED_RUN_STATES.includes(run)) return false;
  if (["COMPLETE", "FAILED", "ABANDONED"].includes(run)) return false;
  return Boolean(session === "ACTIVE");
}

/**
 * The capacity verdict.
 *
 * `degraded` is explicit and load-bearing: when live process inspection is
 * unavailable we say so rather than quietly guessing, and the fallback is
 * conservative — an unknown status is not an active provider.
 */
export function assessProviderCapacity({
  panes = null,
  lanes = [],
  sessions = [],
  suspendedLaneIds = [],
  ceiling = configuredProviderCeiling(),
} = {}) {
  if (!Array.isArray(panes)) {
    return {
      ok: false,
      degraded: true,
      counted_from: "unavailable",
      ceiling,
      active: 0,
      available: ceiling,
      processes: [],
      holders: [],
      blockers: [],
      note: "Live process inspection unavailable; provider capacity is not being enforced from stale metadata.",
    };
  }
  const suspended = new Set(suspendedLaneIds || []);
  const processes = correlateProviderProcesses({ panes, lanes, sessions });
  const counted = processes.filter((p) => processConsumesCapacity(p, { suspended: suspended.has(p.lane_id) }));
  const active = counted.length;
  const available = Math.max(0, ceiling - active);
  return {
    ok: available > 0,
    degraded: false,
    counted_from: "live_processes",
    ceiling,
    active,
    available,
    processes,
    holders: counted.map((p) => ({
      lane_id: p.lane_id,
      name: p.lane_name || p.worktree_path,
      worktree_path: p.worktree_path,
      pid: p.pid,
      provider: p.provider,
      run_state: p.run_state,
      session_state: p.session_state,
    })),
    blockers: available > 0 ? [] : ["provider_capacity"],
  };
}

/**
 * Which lane the operator could safely free next, for the refusal message.
 * A parked conversation first: suspending it interrupts nothing.
 */
export function suggestCapacityRelease(capacity) {
  const holders = capacity?.holders || [];
  const parked = holders.find((h) => ["NEEDS_INPUT", "WAITING_RESOURCE"].includes(h.run_state));
  if (parked) return { ...parked, why: "parked_awaiting_input", interrupts: false };
  const idle = holders.find((h) => !h.run_state);
  if (idle) return { ...idle, why: "session_open_without_work", interrupts: false };
  return null;
}
