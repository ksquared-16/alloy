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
export function correlateProviderProcesses({ panes = [], lanes = [], sessions = [], runStateFor = null } = {}) {
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
    // PID is the true process identity; pane id distinguishes panes when tmux
    // did not report one. Falling back to session+cwd matters because dropping
    // an agent we cannot key is the UNSAFE direction for a capacity count — it
    // would under-report seats and let the ceiling be exceeded.
    const key = pane.pid
      ? `pid:${pane.pid}`
      : (pane.pane_id ? `pane:${pane.pane_id}` : `where:${pane.session || ""}|${normalizePath(pane.cwd)}`);
    if (key === "where:|") continue;
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
      // A DURABLE lane record carries no execution_run — that projection lives
      // in the run store. Without resolving it every attributed process looked
      // idle and the count fell to zero, which is the unsafe direction: the
      // ceiling would never bind at all.
      run_state: lane?.execution_run?.state
        || (lane && typeof runStateFor === "function" ? runStateFor(lane.lane_id) : null)
        || null,
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
export function processConsumesCapacity(proc, { suspended = false, seatState = null } = {}) {
  if (!proc) return false;
  if (suspended) return false;
  // ── S8 ────────────────────────────────────────────────────────────────────
  //
  // When a canonical seat state has been resolved, IT governs, and it says
  // something the legacy rule below does not: a live provider idling at a
  // prompt still holds the resource. S4 derives the provider ceiling from
  // memory per LIVE PROCESS, so an idle agent costs its six gigabytes exactly
  // like a working one — the legacy rule counted "is it thinking", which is a
  // different question from the one the ceiling was built to answer.
  //
  // This was NOT safe to say before S8. Counting an idle seat without a way to
  // yield it deadlocks: three quiet agents and a fourth lane that can never
  // start. Contention-driven reclamation is what makes the honest count
  // survivable, which is why the two land together.
  //
  // Callers that resolve no seat state keep the legacy rule unchanged.
  if (seatState) return seatState !== "dormant";
  const run = proc.run_state || null;
  const session = proc.session_state || null;
  if (STARTING_SESSION_STATES.includes(session)) return true;
  if (ACTIVE_RUN_STATES.includes(run)) return true;
  // An agent we cannot attribute to any lane is still a real process on the
  // machine. We cannot say it is idle — we cannot say anything about it — so
  // the conservative reading is that it holds a seat. This is the only case
  // where "unknown" counts, and it counts because the PROCESS is known even
  // though its work is not.
  if (!proc.lane_id) return true;
  // Everything else does not, per the governing table: QUEUED without a
  // provider, IDLE/READY, COMPLETE, FAILED, offline, parked.
  //
  // I had this wrong: a live agent with no run was counted as consuming, on the
  // reasoning that the process is real. But capacity is defined by computation
  // being NEEDED, not by a process existing — an idle session between turns is
  // exactly the READY row, and counting it made a leftover pane hold a seat
  // that nothing was using. `Release execution capacity` reclaims the process
  // itself; the ceiling is not the mechanism for that.
  return false;
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
  runStateFor = null,
  seatStates = null,
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
  const processes = correlateProviderProcesses({ panes, lanes, sessions, runStateFor });
  // S8: a resolved seat state, when the caller has one, decides whether the
  // process holds the resource. Keyed by lane, because that is the only
  // identity a seat and a lane share.
  const stateByLane = new Map();
  for (const s of seatStates || []) {
    if (s?.lane_id) stateByLane.set(s.lane_id, s.state);
  }
  const counted = processes.filter((p) => processConsumesCapacity(p, {
    suspended: suspended.has(p.lane_id),
    seatState: stateByLane.get(p.lane_id) || null,
  }));
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
    seat_states: seatStates || null,
    holders: counted.map((p) => ({
      lane_id: p.lane_id,
      seat_state: stateByLane.get(p.lane_id) || null,
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

// ── S8: resolving canonical seat state from live evidence ────────────────────

/**
 * When did anything meaningful last happen on this lane?
 *
 * MEANINGFUL, NOT MERELY RECENT. Process start time is deliberately absent: an
 * agent alive since Tuesday that answered an instruction a minute ago is not
 * idle, and one started an hour ago that has never been spoken to is. Age of
 * the process says nothing about whether its seat is wanted.
 *
 * The sources are the durable ones — the run ledger, the session record, the
 * lane — plus the observed pane, so a turn that produced no run still counts
 * as interaction.
 */
export function lastMeaningfulActivityAt({ lane = null, session = null, runs = [], observedAt = null } = {}) {
  const stamps = [];
  const push = (v) => {
    const t = typeof v === "number" ? v : Date.parse(v || "");
    if (Number.isFinite(t)) stamps.push(t);
  };
  for (const r of runs || []) {
    push(r?.updated_at); push(r?.completed_at); push(r?.started_at); push(r?.created_at);
  }
  push(session?.resumed_at); push(session?.oriented_at); push(session?.last_orientation_attempt_at);
  push(session?.updated_at); push(session?.started_at);
  push(lane?.updated_at);
  push(observedAt);
  return stamps.length ? Math.max(...stamps) : null;
}

/**
 * Resolve the canonical seat state for every provider on this host.
 *
 * Every expensive input is INJECTED so the caller decides what it can afford:
 * `activityFor` captures panes, `descendantsFor` reads S1 attribution,
 * `claimsFor` reads the S5 ledger. Anything not supplied is reported as
 * unknown, and unknown never becomes `idle` — the resolver refuses to conclude
 * "nothing is happening" from "we did not look".
 */
export async function observeProviderSeats({
  panes = null,
  lanes = [],
  sessions = [],
  runStateFor = null,
  runsFor = null,
  activityFor = null,
  descendantsFor = null,
  claimsFor = null,
  deliveryInFlightFor = null,
  now = Date.now(),
  graceMs = null,
} = {}) {
  const { classifySeat, configuredIdleGrace, IDLE_GRACE_POLICY_V1 } = await import("./provider-seat-state.mjs");
  const grace = Number.isFinite(graceMs) ? graceMs : configuredIdleGrace();
  const seats = [];
  const seen = new Set();

  const processes = Array.isArray(panes)
    ? correlateProviderProcesses({ panes, lanes, sessions, runStateFor })
    : [];

  // tmux's own record of when this session last produced OUTPUT.
  //
  // This is the signal S8 needed and the durable stores could not give: an
  // agent can work, finish a turn and sit at a prompt without any Vacilando run
  // ever opening, and the lane record would still read as a day old. It is
  // interaction, not process age — the pane that has printed nothing for nine
  // days is exactly the seat worth yielding, and the one that printed a second
  // ago is not, however long its process has been alive.
  const paneActivityMs = new Map();
  for (const pane of panes || []) {
    if (!Number.isFinite(pane?.session_activity)) continue;
    const ms = pane.session_activity * 1000;
    for (const key of [pane.pane_id, pane.pid == null ? null : String(pane.pid)]) {
      if (!key) continue;
      paneActivityMs.set(key, Math.max(paneActivityMs.get(key) || 0, ms));
    }
  }

  for (const proc of processes) {
    const lane = lanes.find((l) => l.lane_id === proc.lane_id) || null;
    const session = sessions.find((s) => s.lane_id === proc.lane_id) || null;
    const runs = typeof runsFor === "function" ? (runsFor(proc.lane_id) || []) : [];
    const activityRec = typeof activityFor === "function" ? await activityFor(proc) : null;
    const descendants = typeof descendantsFor === "function" ? descendantsFor(proc) : null;
    const claims = typeof claimsFor === "function" ? (claimsFor(proc) || []) : [];
    const active = runs.find((r) => ACTIVE_RUN_STATES.includes(r.state))
      || runs.find((r) => !["COMPLETE", "FAILED", "CANCELLED"].includes(r.state))
      || null;

    if (proc.lane_id) seen.add(proc.lane_id);
    seats.push(classifySeat({
      lane_id: proc.lane_id,
      lane_name: proc.lane_name,
      provider: proc.provider,
      pid: proc.pid,
      tmux_session: proc.tmux_session,
      worktree_path: proc.worktree_path,
      agent_session_id: session?.agent_session_id || null,
      session_state: proc.session_state || session?.state || null,
      run: active,
      activity: activityRec?.activity || null,
      blocker_kind: activityRec?.blocker_kind || null,
      descendants: descendants || [],
      descendants_known: descendants != null,
      validation_claims: claims,
      delivery_in_flight: typeof deliveryInFlightFor === "function" ? Boolean(deliveryInFlightFor(proc)) : false,
      pending_operator_interaction: active?.state === "NEEDS_INPUT",
      last_meaningful_activity_at: lastMeaningfulActivityAt({
        lane, session, runs,
        // NOT the time we looked. Observing a quiet pane is not interaction
        // with it — passing the observation timestamp here made every readable
        // seat permanently "active one second ago", which quietly made `idle`
        // unreachable on a live host.
        observedAt: paneActivityMs.get(proc.pane_id) ?? paneActivityMs.get(proc.pid == null ? "" : String(proc.pid)) ?? null,
      }),
    }, { now, graceMs: grace, policy: IDLE_GRACE_POLICY_V1 }));
  }

  // Dormant lanes are not processes, so no pane will produce them — but an
  // operator asking "where did my seats go" must be able to see that the work
  // is intact and resumable, not gone.
  for (const lane of lanes) {
    if (seen.has(lane.lane_id)) continue;
    const session = sessions.find((s) => s.lane_id === lane.lane_id) || null;
    if (session?.state !== "SUSPENDED") continue;
    seats.push(classifySeat({
      lane_id: lane.lane_id,
      lane_name: lane.name || null,
      provider: lane.preferred_provider || lane.binding?.provider || session?.provider || null,
      pid: null,
      activity: "absent",
      session_state: "SUSPENDED",
      agent_session_id: session.agent_session_id,
      worktree_path: lane.binding?.worktree_path || null,
      dormant_since: session.dormant_since || session.suspended_at || null,
      resume_count: session.resume_count || 0,
      last_resume_result: session.last_resume_result || null,
    }, { now, graceMs: grace }));
  }

  return seats;
}

/**
 * Assemble the live inputs a seat classification needs, on this host, now.
 *
 * Bounded and best-effort by design. Every probe that fails degrades to
 * "unknown", and unknown never yields `idle` — so a machine where `ps` or tmux
 * is unavailable simply never reclaims anything, which is the safe direction.
 */
export async function observeLiveSeats({ root = undefined, now = Date.now(), graceMs = null } = {}) {
  const [{ listDurableLanes }, { listCurrentAgentSessions }, { listTmuxPanesRaw, parseTmuxPaneLines, capturePaneText },
    { listExecutionRunsForLane }, { classifyProviderActivity, ACTIVITY_CAPTURE_LINES }] = await Promise.all([
    import("./development-lane.mjs"),
    import("./agent-session.mjs"),
    import("./lanes.mjs"),
    import("./execution-run.mjs"),
    import("./lane-provider-activity.mjs"),
  ]);

  const lanes = listDurableLanes(root);
  const sessions = listCurrentAgentSessions(root);
  let panes = null;
  try {
    const raw = await listTmuxPanesRaw();
    if (raw?.ok) panes = parseTmuxPaneLines(raw.stdout);
  } catch { panes = null; }

  // S1 is the authority on descendants. No process table means no claim about
  // what a seat owns — reported as unknown, never as none.
  let index = null;
  let rows = null;
  try {
    const { probeProcessTable } = await import("./health-probes.mjs");
    const { parseProcessTable, buildProcessIndex } = await import("./process-attribution.mjs");
    const text = await probeProcessTable({});
    if (text) {
      rows = parseProcessTable(text);
      index = buildProcessIndex(rows);
    }
  } catch { index = null; rows = null; }

  // S5 is the authority on validation claims.
  let claims = [];
  try {
    const { readClaimStore } = await import("./validation-admission.mjs");
    claims = readClaimStore({ root }).claims || [];
  } catch { claims = []; }

  const { resolveOwningSeat } = await import("./process-attribution.mjs");
  const { looksLikeValidation } = await import("./health-probes.mjs");

  return observeProviderSeats({
    panes, lanes, sessions,
    runStateFor: (laneId) => {
      try {
        const runs = listExecutionRunsForLane(laneId, root) || [];
        return runs.find((r) => ACTIVE_RUN_STATES.includes(r.state))?.state || null;
      } catch { return null; }
    },
    runsFor: (laneId) => {
      try { return listExecutionRunsForLane(laneId, root) || []; } catch { return []; }
    },
    activityFor: async (proc) => {
      const target = proc.pane_id || proc.tmux_session;
      if (!target) return null;
      try {
        const out = await capturePaneText(target, ACTIVITY_CAPTURE_LINES);
        const text = typeof out === "string" ? out : String(out?.text || "");
        if (!text.trim()) return null;
        return { ...classifyProviderActivity(text, { provider: proc.provider }), observed_at: now };
      } catch { return null; }
    },
    descendantsFor: (proc) => {
      // tmux reports pane_pid as a STRING, and the process table parses pids as
      // NUMBERS. An unconverted compare made every seat report "descendants
      // unknown", which is conservative but wrong — no seat could ever be idle.
      const pid = Number(proc.pid);
      if (!index || !rows || !Number.isInteger(pid)) return null;
      const seatPids = new Set([pid]);
      return rows.filter((r) => r.pid !== pid
        && looksLikeValidation(r.command)
        && resolveOwningSeat(r.pid, index, seatPids).seat_pid === pid);
    },
    claimsFor: (proc) => claims.filter((c) => c.lane_id === proc.lane_id || c.root_provider_pid === proc.pid),
    now, graceMs,
  });
}

/**
 * A waiting admission needs a seat. Free the minimum number, or free none.
 *
 * This is the ONLY thing that reclaims a provider. It is called from the
 * admission path when the ceiling has actually bound — never on a schedule,
 * never from a sweep, and never with an empty `waiting` list.
 */
export async function reclaimForWaitingAdmission({
  waiting = [],
  availableSeats = 0,
  root = undefined,
  nowMs = Date.now(),
  origin = "provider-capacity",
} = {}) {
  if (!waiting.length) {
    return { ok: true, reclaimed: [], plan: { reason: "no_contention", reclaim: [] } };
  }
  const { planReclamation } = await import("./provider-seat-state.mjs");
  const seats = await observeLiveSeats({ root, now: nowMs });
  const plan = planReclamation({
    seats,
    contention: { waiting, available_seats: availableSeats },
    now: nowMs,
  });
  if (!plan.reclaim.length) return { ok: true, reclaimed: [], plan, seats };

  const { reclaimIdleProviderSeat } = await import("./provider-suspension.mjs");
  const reclaimed = [];
  const refused = [];
  for (const target of plan.reclaim) {
    const out = await reclaimIdleProviderSeat({
      laneId: target.lane_id,
      reclaimedFor: target.reclaimed_for,
      origin,
      nowMs,
      root,
      // The recheck reads the machine again, for this lane only, at the last
      // possible moment. A plan is evidence, never permission.
      recheckSeat: async ({ laneId }) => {
        const fresh = await observeLiveSeats({ root, now: Date.now() });
        return fresh.find((s) => s.lane_id === laneId) || null;
      },
    });
    if (out.ok) reclaimed.push({ lane_id: target.lane_id, reclaimed_for: target.reclaimed_for, rank: target.rank });
    else refused.push({ lane_id: target.lane_id, error: out.error, observed_state: out.observed_state ?? null });
  }
  return { ok: true, reclaimed, refused, plan, seats };
}
