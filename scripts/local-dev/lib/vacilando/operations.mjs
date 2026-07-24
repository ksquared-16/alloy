/**
 * Vacilando — Engineering Operations projection (Product Realization V1, Phase 3).
 *
 * Realizes the Engineering Operations Center over the EXISTING execution runtime:
 * the operator manages WORK, never a provider session, worktree, branch, or port.
 * This is a pure projection over durable mission/package/acceptance state — no new
 * runtime abstraction, no dashboard, no provider-specific behaviour.
 *
 * It answers the operator's real questions about a piece of work:
 *   - What state is this work in?        (honest, engineering states — not provider activity)
 *   - What changed?                       (engineering progress — not "what Claude said")
 *   - Does it need me, and why?           (the ONE interrupting state)
 *   - Is it verified / ready to accept?   (evidence vs acceptance, not "the engine stopped")
 *   - What should I do next?              (the allowed operator actions)
 *
 * The engine (provider) stays beneath the work: it is named only when the engine
 * ITSELF is the problem (auth/error), never as routine state.
 */

// The engineering state vocabulary (Engineering Operations Center, Part III),
// mapped from the durable mission lifecycle. Each state is honest and distinct.
const STATES = {
  preparing:     { label: "Preparing",       tone: "muted", interrupts: false },
  ready:         { label: "Ready to start",  tone: "ok",    interrupts: false },
  executing:     { label: "Executing",       tone: "run",   interrupts: false },
  waiting:       { label: "Paused",          tone: "muted", interrupts: false },
  needs_operator:{ label: "Needs you",       tone: "attn",  interrupts: true  },
  blocked:       { label: "Blocked",         tone: "attn",  interrupts: false },
  verifying:     { label: "Verifying",       tone: "run",   interrupts: false },
  review:        { label: "Ready for review",tone: "ok",    interrupts: false },
  accepted:      { label: "Accepted",        tone: "ok",    interrupts: false },
  closed:        { label: "Closed",          tone: "muted", interrupts: false },
  at_risk:       { label: "Needs another look", tone: "attn", interrupts: false },
};

/** Map a raw mission status → the honest engineering state key. */
export function stateKeyFor(mission, pkg) {
  const s = mission?.status;
  const ready = pkg?.readiness_verdict?.verdict === "Ready" && pkg?.readiness_status === "ready";
  if (s === "completed") return "accepted";
  if (s === "closed") return "closed";
  if (s === "failed" || s === "interrupted") return "at_risk";
  if (s === "blocked") return "blocked";
  if (s === "waiting_for_operator") return "needs_operator";
  if (s === "waiting_for_acceptance") return mission.acceptance_gate ? "review" : "verifying";
  if (s === "starting" || s === "running" || s === "stopping") return "executing";
  if (s === "stopped") return "waiting";
  if (s === "ready" || ready) return "ready";
  return "preparing";
}

// Translate the runtime's provider-flavoured phase ("using Edit") into an
// engineering phase — the operator sees work, not tools.
function engineeringPhase(current_phase) {
  const p = String(current_phase || "").toLowerCase();
  if (!p) return null;
  if (/edit|write|multiedit/.test(p)) return "editing files";
  if (/bash|shell|command/.test(p)) return "running commands";
  if (/read|grep|glob|search/.test(p)) return "reading the code";
  if (/test|vitest|jest/.test(p)) return "running checks";
  if (/starting/.test(p)) return "starting up";
  return "working";
}

/** What changed — engineering artifacts, never provider tokens or transcript. */
function whatChanged(mission, report) {
  const out = [];
  const r = report || mission?.completion_report || null;
  for (const f of (r?.changed_files || [])) out.push(typeof f === "string" ? f : (f.path || f.file || JSON.stringify(f)));
  for (const d of (r?.deliverables || []).filter((x) => x.produced && x.path)) if (!out.includes(d.path)) out.push(d.path);
  return out;
}

/**
 * Assemble the review Director presents when execution finishes: what changed,
 * evidence against acceptance, remaining risks, a recommendation, and the one
 * action requested of the operator. Built from the completion report + the
 * acceptance evaluation — the operator reviews engineering work, not a transcript.
 */
export function assembleReview(mission, pkg, acceptanceLatest) {
  const report = mission?.completion_report || null;
  const changed = whatChanged(mission, report);
  const evidence = (acceptanceLatest?.criteria || []).map((c) => ({
    criterion: c.statement, status: c.status,
    detail: (c.evidence || []).map((e) => e.detail).filter(Boolean).join("; ") || null,
  }));
  const risks = [
    ...((report?.deviations_from_package || []).map((d) => (typeof d === "string" ? d : d.detail || JSON.stringify(d)))),
    ...((report?.unresolved_items || []).map((u) => (typeof u === "string" ? u : u.detail || JSON.stringify(u)))),
  ];
  const gate = acceptanceLatest?.gate || (mission?.acceptance_gate ?? null);
  let recommendation, requested_action;
  if (gate === "pass") {
    recommendation = "The evidence satisfies every acceptance criterion. This is ready to accept.";
    requested_action = "accept";
  } else if (gate === "needs_operator") {
    const n = evidence.filter((e) => e.status === "operator_review").length;
    recommendation = `Automated checks pass, but ${n} ${n === 1 ? "criterion needs" : "criteria need"} your judgment before I'd call it done.`;
    requested_action = "review";
  } else if (gate === "fail") {
    const miss = (acceptanceLatest?.missing_evidence || []).length;
    recommendation = `Acceptance is not yet met${miss ? ` — ${miss} ${miss === 1 ? "criterion is" : "criteria are"} unmet` : ""}. This needs another pass before it can be accepted.`;
    requested_action = "send_back";
  } else {
    recommendation = "Execution finished; I'm checking the evidence against acceptance.";
    requested_action = "wait";
  }
  return {
    summary: report?.implementation_summary || mission?.latest_summary || null,
    what_changed: changed, evidence, risks, gate, recommendation, requested_action,
  };
}

/**
 * The work-centric operational view for one piece of work. Pure over durable state.
 */
export function composeOperations({ mission, package: pkg, acceptance }) {
  if (!mission) return null;
  const key = stateKeyFor(mission, pkg);
  const st = STATES[key];
  const acceptanceLatest = (acceptance && acceptance.length) ? acceptance[0] : null;

  // Progress — engineering movement, not provider activity.
  const progress = { phase: null, headline: null, what_changed: [] };
  if (key === "executing") {
    progress.phase = engineeringPhase(mission.current_phase);
    progress.headline = mission.latest_summary || null;
    progress.what_changed = whatChanged(mission);
  } else if (key === "review" || key === "accepted" || key === "closed") {
    progress.headline = mission.completion_report?.implementation_summary || mission.latest_summary || null;
    progress.what_changed = whatChanged(mission);
  }

  // Needs-operator — the ONE state that legitimately interrupts.
  const needs_operator = key === "needs_operator"
    ? { kind: mission.error_code === "auth" ? "authentication" : "decision", prompt: mission.pending_question || "This work needs your input to continue." }
    : null;

  // Two healths, reported separately (never conflated).
  const execution = key === "at_risk" ? "at_risk" : key === "blocked" ? "blocked" : key === "executing" ? "progressing" : "ok";
  const health = { execution, operational: "ok" };

  // The engine stays beneath the work — surfaced ONLY when it is the problem.
  const engine_problem = (mission.status === "failed" && (mission.error_code === "auth" || mission.error_code === "provider_error"))
    ? { code: mission.error_code, message: mission.error_message || "The engine needs attention." }
    : null;

  const review = (key === "review" || key === "accepted") ? assembleReview(mission, pkg, acceptanceLatest) : null;

  // Allowed operator actions for this state — the work's next step, not substrate.
  const actions = [];
  if (key === "ready") actions.push("start");
  if (key === "executing") actions.push("stop");
  if (key === "needs_operator") actions.push("reply", "stop");
  if (key === "blocked" || key === "at_risk") actions.push("reply", "restart");
  if (key === "review") actions.push(review?.requested_action === "send_back" ? "reply" : "accept", "close");
  if (key === "accepted") actions.push("close");

  return {
    schema_version: "vacilando.operations.v1",
    state: { key, label: st.label, tone: st.tone, interrupts: st.interrupts },
    is_active: ["executing", "verifying", "needs_operator", "blocked"].includes(key),
    progress,
    needs_operator,
    health,
    engine_problem,
    review,
    actions,
    // Operator-facing reassurance: while an engine runs the work, the provider
    // window is irrelevant — the system owns the state.
    engine_note: key === "executing" ? "An engine is running this — you can close the provider window." : null,
  };
}

export { STATES };
