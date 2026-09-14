/**
 * RESTING BETWEEN GOVERNED STEPS IS A CONDITION, NOT AN ACCIDENT.
 *
 * Three separate consumers each decided, on their own terms, what an open run
 * meant — and all three read the same ordinary situation as a problem:
 *
 *   THE GOVERNOR abandons a NEEDS_INPUT run whenever
 *   `actionableOperatorInputForRun` returns null, with no grace period and no
 *   regard for a governed action that just settled. Measured specimen:
 *   NEEDS_INPUT at 15:12:06.937, ABANDONED at 15:12:09.356 — 2.4 SECONDS —
 *   after a governed pull request was refused for a credential-shaped body.
 *   Eleven of eighteen abandonments in the store carry that reason.
 *
 *   THE PRE-SEND RECONCILER closes an EXECUTING run whose `state_reason` is
 *   `governed_action_complete` once it is past the settle window, so a lane
 *   sitting between two governed steps is called stale on the next ordinary
 *   message. That is the "Previous run was stale and was closed" text an
 *   operator sees on almost every send.
 *
 *   THE LANE VIEW renders `agent_idle_run_open` as "Finalizing". It is telling
 *   the truth about the facts it is given; the facts simply have no way to say
 *   "this run is at rest between steps" rather than "this run is mid-turn".
 *
 * None of those three is individually wrong. What was missing is a single
 * authoritative answer to "what IS this run doing", so each invented its own.
 *
 * DERIVED, NOT STORED. There is no new persistent state and no new transition:
 * a phase is computed from facts the platform already keeps — the run state,
 * its state_reason, the governed request attached to it, the session, and the
 * existing stale classification. A stored RESTING would be one more thing that
 * can be wrong, and would need its own reconciler.
 *
 * NO TIMER HIDES A MISSING TRANSITION. RESTING is not "stale, but wait longer".
 * It is a positive reading of positive facts: the last thing this run did was
 * finish a governed step, and its lane still holds the session that will
 * continue it.
 */
import { classifyExecutionRunStale, setLaneLifecyclePhaseImpl, STALE_SETTLE_MS } from "./execution-stale.mjs";

/**
 * The five conditions every consumer needs to tell apart.
 *
 * Deliberately small. The previous vocabulary — active / stale / ambiguous —
 * could not distinguish "waiting on the Director" from "abandoned by its
 * worker", and that is precisely the distinction all three defects turned on.
 */
export const LIFECYCLE_PHASES = Object.freeze({
  ACTIVE: "ACTIVE",
  GOVERNED_WAIT: "GOVERNED_WAIT",
  RESTING: "RESTING",
  TERMINAL: "TERMINAL",
  STRANDED: "STRANDED",
});

const TERMINAL_STATES = new Set(["COMPLETE", "FAILED", "ABANDONED", "CANCELLED"]);

/** Governed request states in which a human or the Director still owes an answer. */
export const GOVERNED_LIVE_STATUSES = Object.freeze([
  "requested", "awaiting_director", "awaiting_operator", "executing", "approved",
]);

/**
 * How long a just-settled governed step keeps a run unambiguously at rest.
 *
 * This is NOT the thing that makes RESTING work — RESTING is not time-boxed,
 * which is the whole repair for the pre-send reconciler. It bounds only the
 * governor's grace: a NEEDS_INPUT run is never collected within it, so a worker
 * or operator that is about to act is not raced by a reconciler tick. Two and a
 * half seconds was the measured margin; minutes is the right order.
 */
export const GOVERNOR_GRACE_MS = 5 * 60 * 1000;

const parseMs = (v) => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

/** A governed request that still owes this run an answer. */
export function governedWaitIsLive(governed) {
  if (!governed) return false;
  return GOVERNED_LIVE_STATUSES.includes(String(governed.status || governed.state || ""));
}

/**
 * Did this run's last meaningful step finish, leaving it between steps?
 *
 * Two independent readings, because either alone has a blind spot: the run's
 * own `state_reason`, and the most recent transition INTO execution having been
 * caused by a governed action completing. A run resumed by a governed action
 * and then re-reported by its worker keeps the first and loses the second.
 */
export function restingOnGovernedStep(run) {
  if (!run) return false;
  if (run.state_reason === "governed_action_complete") return true;
  const transitions = Array.isArray(run.transitions) ? run.transitions : [];
  const last = [...transitions].reverse().find((t) => t?.to_state === "EXECUTING");
  return Boolean(last && last.reason === "governed_action_complete");
}

/**
 * What is this run actually doing?
 *
 * @param {object} run                 the execution run record
 * @param {object} facts
 * @param {object|null} facts.governed the governed request attached to this run, if any
 * @param {boolean} facts.session_alive does the lane still hold the session that would continue it
 * @param {number}  facts.now_ms
 * @param {object}  facts.stale        an existing classifyExecutionRunStale result, if already computed
 * @returns {{phase:string, reason:string, evidence:object}}
 */
export function runLifecyclePhase(run, facts = {}) {
  const nowMs = facts.now_ms || Date.now();
  const evidence = {
    state: run?.state || null,
    state_reason: run?.state_reason || null,
    governed_status: facts.governed?.status || facts.governed?.state || null,
    session_alive: facts.session_alive !== false,
    resting_on_governed_step: restingOnGovernedStep(run),
  };

  if (!run || TERMINAL_STATES.has(String(run.state))) {
    return { phase: LIFECYCLE_PHASES.TERMINAL, reason: "terminal_state", evidence };
  }

  /*
   * A LIVE GOVERNED WAIT OUTRANKS EVERYTHING.
   *
   * It is the one condition where nothing about the run itself will change
   * until somebody else acts, and it is exactly what was being collected. It is
   * checked first so that no later rule — silence, settle windows, a missing
   * input model — can reach a run that is legitimately waiting.
   */
  if (governedWaitIsLive(facts.governed)) {
    return { phase: LIFECYCLE_PHASES.GOVERNED_WAIT, reason: "governed_action_live", evidence };
  }
  if (run.state === "WAITING_RESOURCE" && run.resource_wait?.resource_key === "director_governed_action") {
    return { phase: LIFECYCLE_PHASES.GOVERNED_WAIT, reason: "waiting_on_director", evidence };
  }

  const stale = facts.stale || classifyExecutionRunStale(run, { ...facts, now_ms: nowMs });

  /*
   * RESTING, AND NOT TIME-BOXED.
   *
   * The existing classifier already protects a just-resumed run — but only for
   * one settle window, after which an ordinary pause between governed steps
   * became "stale". Twenty minutes is a plausible gap between two steps of the
   * same piece of work, so the window was the defect rather than its size.
   *
   * What bounds RESTING instead is OWNERSHIP: the lane still holds the session
   * that will continue this run. A run whose session is gone is not resting, it
   * is stranded, and the rule below says so.
   */
  if (evidence.resting_on_governed_step) {
    if (evidence.session_alive) {
      return { phase: LIFECYCLE_PHASES.RESTING, reason: "between_governed_steps", evidence };
    }
    const idleFor = nowMs - (parseMs(run.updated_at) ?? nowMs);
    if (idleFor < STALE_SETTLE_MS) {
      return { phase: LIFECYCLE_PHASES.RESTING, reason: "between_governed_steps_settling", evidence };
    }
    return { phase: LIFECYCLE_PHASES.STRANDED, reason: "resting_without_session", evidence };
  }

  if (stale.class === "stale" || stale.class === "ambiguous") {
    return { phase: LIFECYCLE_PHASES.STRANDED, reason: stale.reason, evidence };
  }
  return { phase: LIFECYCLE_PHASES.ACTIVE, reason: stale.reason, evidence };
}

/**
 * May the governor collect this run for having nothing to act on?
 *
 * Three refusals, each tied to one of the measured failures.
 */
export function governorMayCollect(run, facts = {}) {
  const nowMs = facts.now_ms || Date.now();
  const { phase, reason } = runLifecyclePhase(run, { ...facts, now_ms: nowMs });
  if (phase === LIFECYCLE_PHASES.GOVERNED_WAIT) {
    return { collect: false, why: `a governed action is live (${reason})` };
  }
  if (phase === LIFECYCLE_PHASES.RESTING) {
    return { collect: false, why: `the run is resting between governed steps (${reason})` };
  }
  // The grace the 2.4-second specimen did not get.
  const enteredAt = parseMs(run?.updated_at);
  if (enteredAt != null && (nowMs - enteredAt) < GOVERNOR_GRACE_MS) {
    return { collect: false, why: "within the grace period after entering this state" };
  }
  return { collect: true, why: `phase ${phase} (${reason})` };
}

/** May the pre-send reconciler close this run as stale? */
export function sendMayCloseAsStale(run, facts = {}) {
  const { phase, reason } = runLifecyclePhase(run, facts);
  if (phase === LIFECYCLE_PHASES.RESTING || phase === LIFECYCLE_PHASES.GOVERNED_WAIT) {
    return { close: false, why: `${phase} is not stale (${reason})` };
  }
  if (phase === LIFECYCLE_PHASES.TERMINAL || phase === LIFECYCLE_PHASES.ACTIVE) {
    return { close: false, why: `${phase} (${reason})` };
  }
  return { close: true, why: `${phase} (${reason})` };
}

/**
 * What the lane should say it is doing.
 *
 * "Finalizing" was never wrong about its inputs — it means "the agent is idle
 * and the run is open", which is true of a resting run too. Given a phase, the
 * lane can say the more useful thing without a timer and without the operator
 * sending anything.
 */
export function lanePresentationForPhase(phase) {
  switch (phase) {
    case LIFECYCLE_PHASES.GOVERNED_WAIT: return { key: "governed_wait", label: "Waiting on Director", group: "active" };
    case LIFECYCLE_PHASES.RESTING: return { key: "resting", label: "Resting", group: "idle" };
    case LIFECYCLE_PHASES.TERMINAL: return { key: "complete", label: "Complete", group: "idle" };
    case LIFECYCLE_PHASES.STRANDED: return { key: "stranded", label: "Needs attention", group: "attention" };
    default: return { key: "active", label: "Working", group: "active" };
  }
}

/*
 * Register the derivation with the lane view.
 *
 * `execution-stale.mjs` cannot import this module — it is imported BY it — so
 * the phase is handed over rather than fetched. Any consumer that loads this
 * module (the governor and the pre-send reconciler both do) enables the phase
 * on lane listings; a process that loads neither simply renders as before.
 */
setLaneLifecyclePhaseImpl(runLifecyclePhase);
