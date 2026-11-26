/**
 * Vacilando — Operational Presence (Product Realization: Operational Presence).
 *
 * Director should remain quietly PRESENT through the engineering lifecycle — never
 * verbose, never chatty, never disappearing. The engineering state is usually
 * correct; the operator experience is where presence was missing. This is the single
 * voice that answers, at every stage, the questions the operator should never have to
 * ask: what is Director waiting for, what is the worker doing, who has the next move,
 * is the system alive, did anything change.
 *
 * It is a PURE projection over durable state (like counsel.mjs / shared-understanding.mjs)
 * — no new runtime, no store, no polling. Presence is EVENT-DRIVEN: the line changes
 * only when a meaningful transition changes the inputs. Silence (a stable line) is
 * correct when nothing meaningful changed — presence removes uncertainty, it does not
 * fill time.
 */

// The honest sub-steps between "Start" and the engine actually producing work — the
// state that was missing, experienced as dead air. Each maps to a REAL executor step
// (identity/env resolve → provider precheck → spawn → dispatch), so nothing is theatre.
export const LAUNCH_STEPS = [
  { key: "preparing", label: "Preparing worker", phases: ["preparing worker", "starting provider turn", "starting up", "starting"] },
  { key: "verifying", label: "Verifying environment", phases: ["verifying environment"] },
  { key: "attaching", label: "Attaching engine", phases: ["attaching engine"] },
  { key: "dispatching", label: "Dispatching work", phases: ["dispatching work", "provider turn"] },
];
const LAUNCH_PHASE_SET = new Set(LAUNCH_STEPS.flatMap((s) => s.phases));
const norm = (p) => String(p || "").trim().toLowerCase();

/** Is this mission still coming online (dispatched, engine not yet producing)? */
export function isLaunching(mission) {
  const s = mission?.status;
  if (!["starting", "running", "stopping"].includes(s)) return false;
  const phaseIsLaunch = LAUNCH_PHASE_SET.has(norm(mission.current_phase));
  // Attached the moment the worker produces its first activity for THIS turn.
  const attached = !!mission.last_activity_at && !phaseIsLaunch;
  return phaseIsLaunch || !attached;
}

/** The launch sequence for the work band: ordered steps + which one is current. */
export function launchSequence(mission) {
  const p = norm(mission?.current_phase);
  let idx = LAUNCH_STEPS.findIndex((s) => s.phases.includes(p));
  if (idx < 0) idx = 0; // status "starting" before a phase is stamped
  return {
    current: LAUNCH_STEPS[idx].key,
    steps: LAUNCH_STEPS.map((s, i) => ({ key: s.key, label: s.label, done: i < idx, active: i === idx })),
  };
}

/** A running turn's current EVENT — coarse and meaningful, never twitchy tool-by-tool. */
export function executionEvent(mission) {
  const p = norm(mission?.current_phase);
  if (/write|edit|multiedit/.test(p)) return { key: "writing", label: "writing the deliverable" };
  if (/test|vitest|jest|check|verif/.test(p)) return { key: "verifying", label: "verifying the work" };
  if (/bash|shell|command/.test(p)) return { key: "working", label: "working through the code" };
  if (/read|grep|glob|search|ls/.test(p)) return { key: "exploring", label: "exploring the code" };
  return { key: "oriented", label: "getting oriented" };
}

/**
 * The single presence line + phase for a mission RIGHT NOW. Inputs are the durable
 * mission/package plus already-composed pieces (stage, stateKey, questions, counsel,
 * review) — presence never recomputes them, it voices them.
 *
 * Returns { phase, line, launch } where `phase` is the presence phase (understanding,
 * preparing, ready, launching, executing, needs_operator, blocked, at_risk, reviewing,
 * accepted, closed) and `launch` is the launch sequence (only when phase === launching).
 */
export function composePresence({ mission, stage, stateKey, questions = [], counsel = null, review = null } = {}) {
  const m = mission || {};
  const s = m.status;

  // Understanding — Director is actively thinking, and says so, then asks immediately.
  // Only when a real question exists: an empty "I'm understanding…" would be dead air.
  const preStart = !["starting", "running", "stopping", "completed", "closed", "waiting_for_acceptance", "waiting_for_operator", "blocked", "failed", "interrupted"].includes(s);
  if (preStart && questions.length > 0) {
    const line = questions.length > 1
      ? "I'm working through a few open points before I can prepare this — the first is below."
      : "I'm trying to understand one thing before I can prepare this.";
    return { phase: "understanding", line, launch: null };
  }

  // Terminal / interrupting lifecycle states — presence acknowledges, never just flips a chip.
  if (s === "closed") return { phase: "closed", line: "This work is complete. I've preserved everything we learned and released it.", launch: null };
  if (s === "completed") return { phase: "accepted", line: "Accepted — this is done, and it's part of what we know now.", launch: null };
  if (s === "waiting_for_acceptance") return { phase: "reviewing", line: "I've reviewed the evidence against what we agreed — here's what matters.", launch: null };
  if (s === "waiting_for_operator") return { phase: "needs_operator", line: "I need one thing from you before this can go on.", launch: null };
  if (s === "blocked") return { phase: "blocked", line: "This is blocked on something in the work — let's clear it before it goes on.", launch: null };
  if (s === "failed" || s === "interrupted") return { phase: "at_risk", line: "The last run didn't finish cleanly — let's take a look before sending it again.", launch: null };

  // Launching vs Executing — the missing distinction. Until the worker produces its
  // first activity, Director is bringing it online; only after does it "execute".
  if (["starting", "running", "stopping"].includes(s)) {
    if (isLaunching(m)) {
      return { phase: "launching", line: "Bringing a worker online and attaching the engine — a moment.", launch: launchSequence(m) };
    }
    const ev = executionEvent(m);
    const line = ev.key === "oriented"
      ? "The worker's attached and getting oriented."
      : `The worker's attached and ${ev.label}.`;
    return { phase: "executing", line, launch: null };
  }

  // At rest before start — a prepared contract awaiting the operator. Ready speaks a
  // clear belief; not-yet-ready keeps the confidence-qualified counsel (the send-back).
  if (stateKey === "ready") {
    return { phase: "ready", line: counsel?.closing || "I believe we're ready to start.", launch: null };
  }
  return { phase: "preparing", line: counsel?.closing || "I'm assembling the execution contract.", launch: null };
}
