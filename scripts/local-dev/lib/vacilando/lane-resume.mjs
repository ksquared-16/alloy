/**
 * LANE RESUME DISPOSITION — what should Vacilando do next with this lane, after
 * the machine comes back?
 *
 * THE MEASURED BLOCKER. Maintenance refuses because 13 active lanes carry no
 * durable next action. That is not a bug in the collector — the lanes genuinely
 * have none — so the fix is coverage, not a weaker gate.
 *
 * NO SECOND STORE. DevOps 4's `lane-memory` is the canonical lane-scoped durable
 * knowledge owner and this writes nothing of its own: it DERIVES a disposition
 * from evidence the control plane already holds and returns a record shaped for
 * that owner. A control asserts this module has no writer and no timer.
 *
 * THE RULE THAT MATTERS. A next action is taken from the strongest canonical
 * source available and is never invented. When no deterministic next action
 * exists, the lane is HELD with the reason — an honest hold is maintenance-safe,
 * because the lane resumes without losing work and nobody is told to do
 * something nobody decided. What is never acceptable is silence, which reads as
 * "no work here" and is how an operator ends up reconstructing ten lanes by hand.
 */

import { observedFact, plannedItem, carryForward } from "./lane-knowledge.mjs";

export const LANE_RESUME_SCHEMA = "vacilando.lane_resume.v1";

/**
 * The three honest answers. `HELD_NEEDS_OPERATOR` is a POSITIVE state, recorded
 * deliberately — not the absence of a record, which is `UNRESOLVED`.
 */
export const DISPOSITION = Object.freeze({
  ACTIONABLE: "ACTIONABLE",
  HELD_NEEDS_OPERATOR: "HELD_NEEDS_OPERATOR",
  UNRESOLVED: "UNRESOLVED",
});

/** Dispositions that satisfy the maintenance checkpoint: a decision was recorded. */
export const DURABLE_DISPOSITIONS = Object.freeze([DISPOSITION.ACTIONABLE, DISPOSITION.HELD_NEEDS_OPERATOR]);

/**
 * WHERE A NEXT ACTION MAY COME FROM, STRONGEST FIRST.
 *
 * Ordered by how directly each source states an intention somebody actually
 * formed. An open run's instruction is a decision in force; a completion report
 * is the lane's own account of where it got to; a handoff is an explicit
 * transfer. Below those there is nothing that is not a guess, and the list
 * stops rather than reaching for one.
 */
export const NEXT_ACTION_SOURCES = Object.freeze([
  Object.freeze({ id: "open_run_instruction", rank: 1, why: "a run that has not finished carries the instruction still in force" }),
  Object.freeze({ id: "completion_report_next_step", rank: 2, why: "the lane's own account of what it finished and what follows" }),
  Object.freeze({ id: "handoff_payload", rank: 3, why: "an explicit transfer states what the receiver should pick up" }),
  Object.freeze({ id: "recorded_next_step", rank: 4, why: "a next step already written to lane-memory by a previous seam" }),
]);

/** Keep a resume record a pointer set, never a transcript. */
export const RESUME_MAX_BYTES = 2048;
const CLIP = 400;

const clip = (v, n = CLIP) => (v == null ? null : String(v).replace(/\s+/g, " ").trim().slice(0, n));

const TERMINAL = Object.freeze(["COMPLETE", "FAILED", "ABANDONED", "CANCELLED"]);
export const isTerminalRun = (state) => TERMINAL.includes(String(state || "").toUpperCase());

/**
 * Derive the disposition from evidence. Pure, and deliberately unwilling to
 * guess.
 *
 * `evidence` is gathered by the caller from the canonical stores. Each branch
 * names the source it used, so a reader can always ask "why does it think that"
 * and get an answer that points at a record rather than at reasoning.
 */
export function deriveResumeDisposition({
  laneId,
  openRun = null,
  latestRun = null,
  handoff = null,
  recordedNextStep = null,
  branch = null,
  candidate = null,
  blockedOn = null,
  nowMs = Date.now(),
} = {}) {
  const base = {
    schema: LANE_RESUME_SCHEMA,
    lane_id: laneId,
    branch: clip(branch, 120),
    candidate: clip(candidate, 60),
    blocker: clip(blockedOn, 200),
    derived_at: new Date(nowMs).toISOString(),
  };

  if (openRun && !isTerminalRun(openRun.state)) {
    return {
      ...base,
      disposition: DISPOSITION.ACTIONABLE,
      source: "open_run_instruction",
      next_action: clip(openRun.instruction),
      run_id: openRun.run_id ?? null,
      run_state: String(openRun.state || "").toUpperCase() || null,
      reason: "a run is still in flight; its instruction is the decision in force",
    };
  }

  const reportNext = latestRun?.completion_report?.next_step
    ?? latestRun?.completion_report?.next_action
    ?? latestRun?.agent_report?.next_step
    ?? null;
  if (reportNext) {
    return {
      ...base,
      disposition: DISPOSITION.ACTIONABLE,
      source: "completion_report_next_step",
      next_action: clip(reportNext),
      run_id: latestRun?.run_id ?? null,
      run_state: String(latestRun?.state || "").toUpperCase() || null,
      reason: "the lane's last run recorded what should happen next",
    };
  }

  if (handoff?.payload?.next_action || handoff?.payload?.next_step) {
    return {
      ...base,
      disposition: DISPOSITION.ACTIONABLE,
      source: "handoff_payload",
      next_action: clip(handoff.payload.next_action || handoff.payload.next_step),
      handoff_id: handoff.handoff_id ?? null,
      reason: "an explicit handoff states what the receiver picks up",
    };
  }

  if (recordedNextStep) {
    return {
      ...base,
      disposition: DISPOSITION.ACTIONABLE,
      source: "recorded_next_step",
      next_action: clip(recordedNextStep),
      reason: "a previous lifecycle seam already recorded a next step",
    };
  }

  /*
   * NOTHING CANONICAL SAYS WHAT IS NEXT.
   *
   * The tempting move is to summarise the last completion report into an
   * imperative and call it a next action. That is invention: a report says what
   * happened, and turning it into what should happen next is a decision nobody
   * made. So the lane is HELD with the evidence that exists, which is safe —
   * maintenance may proceed, the lane resumes in a held state, and an operator
   * is told precisely what is missing.
   */
  if (latestRun) {
    return {
      ...base,
      disposition: DISPOSITION.HELD_NEEDS_OPERATOR,
      source: "no_next_action_recorded",
      next_action: null,
      run_id: latestRun.run_id ?? null,
      run_state: String(latestRun.state || "").toUpperCase() || null,
      last_summary: clip(latestRun.completion_report?.summary ?? latestRun.state_reason, 300),
      reason: `the last run reached ${String(latestRun.state || "an unknown state").toUpperCase()} and recorded no next step; the lane holds rather than being given an invented one`,
      needs: "an operator or a dispatched instruction to say what this lane does next",
    };
  }

  return {
    ...base,
    disposition: DISPOSITION.UNRESOLVED,
    source: "no_evidence",
    next_action: null,
    reason: "this lane has no runs, no handoff and no recorded next step; there is not enough evidence even to hold it safely",
    needs: "any canonical record of what this lane was doing",
  };
}

/**
 * The record as lane-memory should hold it.
 *
 * DevOps 4's vocabulary is used rather than a parallel one: the next action is
 * PLANNED (intent, not fact), the run and branch observations are
 * CURRENT_OBSERVATION and therefore rot, and a held lane carries a
 * CARRY_FORWARD naming what it is waiting for. Durable decisions are NOT written
 * here — they live where DevOps 4 put them, and a resume record that restated
 * them would be the second store this mission must not create.
 */
export function resumeRecordFor(disposition, { nowMs = Date.now() } = {}) {
  const facts = {
    // Observations rot. A branch or a run state read now is true now, and the
    // reader is told so rather than discovering it later.
    branch: disposition.branch ? observedFact(disposition.branch, { source: "git worktree", nowMs }) : null,
    run_state: disposition.run_state ? observedFact(disposition.run_state, { source: "execution-run", nowMs }) : null,
  };
  const record = {
    schema: LANE_RESUME_SCHEMA,
    lane_id: disposition.lane_id,
    disposition: disposition.disposition,
    source: disposition.source,
    reason: disposition.reason,
    observations: facts,
    planned: disposition.next_action
      ? plannedItem({ description: disposition.next_action, why: disposition.reason })
      : null,
    carry_forward: disposition.disposition === DISPOSITION.HELD_NEEDS_OPERATOR
      ? carryForward({ description: disposition.needs, why_deferred: disposition.reason, owner: "operator" })
      : null,
    // Pointers, never content.
    refs: {
      run_id: disposition.run_id ?? null,
      handoff_id: disposition.handoff_id ?? null,
      candidate: disposition.candidate ?? null,
    },
    blocker: disposition.blocker ?? null,
    updated_at: new Date(nowMs).toISOString(),
  };
  const json = JSON.stringify(record);
  if (json.length > RESUME_MAX_BYTES) {
    record.planned = record.planned ? { ...record.planned, description: clip(record.planned.description, 200) } : null;
    record.truncated = true;
  }
  return record;
}

/* ── C: the lifecycle seams ─────────────────────────────────────────────── */

/**
 * WHERE A RESUME RECORD IS UPDATED — six moments, all of which already exist.
 *
 * Not on every message and not on a timer: a record rewritten constantly is a
 * log, and a record rewritten by a poll is a second loop to supervise. These are
 * the points at which what the lane should do next actually CHANGES.
 */
export const LIFECYCLE_SEAMS = Object.freeze([
  Object.freeze({ id: "assignment_accepted", owner: "execution-run createQueuedRun", changes: "a new instruction becomes the decision in force" }),
  Object.freeze({ id: "instruction_established", owner: "lane-dispatch", changes: "the lane is told what to do" }),
  Object.freeze({ id: "blocker_discovered", owner: "execution-run reportRunState waiting-resource", changes: "the lane cannot proceed and must say why" }),
  Object.freeze({ id: "candidate_certified", owner: "promotion-train / lane-memory promotionCheckpoint", changes: "a candidate exists and the next action moves to promotion" }),
  Object.freeze({ id: "handoff_or_closeout", owner: "execution-run-report completion", changes: "the run states what follows it" }),
  Object.freeze({ id: "lane_parked_or_resumed", owner: "development-lane", changes: "the lane stops or restarts, and its disposition changes with it" }),
]);

/* ── D: the fleet inventory ─────────────────────────────────────────────── */

/**
 * Classify every active lane. Read-only: it derives and reports, and writes
 * nothing.
 *
 * The target is not thirteen green records. It is thirteen HONEST dispositions,
 * and a held lane counts — it is a decision that was recorded, which is the
 * thing maintenance actually needs.
 */
export function inventoryLaneResume({ lanes = [], evidenceFor = () => ({}), nowMs = Date.now() } = {}) {
  const rows = [];
  for (const lane of lanes) {
    if (!lane?.lane_id) continue;
    const ev = evidenceFor(lane) || {};
    rows.push(deriveResumeDisposition({ laneId: lane.lane_id, nowMs, ...ev, branch: ev.branch ?? lane.branch ?? null }));
  }
  const by = {};
  for (const r of rows) by[r.disposition] = (by[r.disposition] || 0) + 1;
  return {
    schema: LANE_RESUME_SCHEMA,
    lanes: rows.length,
    by_disposition: by,
    durable: rows.filter((r) => DURABLE_DISPOSITIONS.includes(r.disposition)).length,
    unresolved: rows.filter((r) => r.disposition === DISPOSITION.UNRESOLVED).map((r) => r.lane_id),
    // Complete means every lane has a recorded decision, not that every lane has work.
    complete: rows.length > 0 && rows.every((r) => DURABLE_DISPOSITIONS.includes(r.disposition)),
    rows,
  };
}

/* ── G: what a reboot may do with each disposition ──────────────────────── */

/**
 * Map a resume disposition onto DevOps 7's session-restore vocabulary.
 *
 * The load-bearing line is the second: a lane whose durable disposition is HELD
 * must NOT be started by a reboot. Automatically resuming a lane nobody decided
 * the next step for is exactly the invention this module refuses one layer down;
 * it would be no better for happening at boot.
 */
export function sessionDispositionFor(resume) {
  switch (resume?.disposition) {
    case DISPOSITION.ACTIONABLE:
      return { action: "RECREATE", may_start: true, reason: "a durable next action exists; a session can be recreated from it" };
    case DISPOSITION.HELD_NEEDS_OPERATOR:
      return { action: "HOLD", may_start: false, reason: "the lane is deliberately held; a reboot must not start work nobody decided" };
    case DISPOSITION.UNRESOLVED:
      return { action: "NEEDS_OPERATOR", may_start: false, reason: "there is not enough evidence to resume or to hold safely" };
    default:
      return { action: "NEEDS_OPERATOR", may_start: false, reason: "no resume disposition was recorded" };
  }
}

/* ── E: independence from ephemeral ownership ───────────────────────────── */

/**
 * A resume record must survive losing the worktree, the slot and the session.
 *
 * Asserted by construction rather than by promise: the record carries no path,
 * no slot number, no pid and no session id, and a control checks that. The lane
 * id is the one identifier that outlives all three — the property DevOps 3 and
 * DevOps 4 already established, applied here.
 */
export const EPHEMERAL_KEYS = Object.freeze(["worktree_path", "worktree", "slot", "pid", "session_id", "agent_session_id", "port", "browser_profile"]);

export function resumeRecordIsPortable(record = {}) {
  const offenders = [];
  const walk = (obj, path = "") => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      const here = path ? `${path}.${k}` : k;
      if (EPHEMERAL_KEYS.includes(k)) offenders.push(here);
      if (v && typeof v === "object") walk(v, here);
    }
  };
  walk(record);
  return { portable: offenders.length === 0, offenders };
}
