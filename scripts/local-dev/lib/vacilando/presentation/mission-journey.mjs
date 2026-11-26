/**
 * Director Experience V2 — DX-4 Mission Journey (presentation only).
 *
 * Operational story from brief phases, posture, certification, and decisions.
 * Does not change lifecycle, timeline storage, or posture derivation.
 */
import { getBrief } from "../mission-brief.mjs";
import { getMission } from "../commands/missions.mjs";
import { phaseDeliverableGroups, listAssignments } from "../worker-assignment.mjs";
import { deriveMissionPosture } from "../mission-posture.mjs";
import {
  getOpenDeliverableReview,
  getLatestAcceptedDeliverableReview,
  listDeliverableReviews,
  deliverableReviewVm,
} from "../deliverable-review.mjs";
import { listDecisions } from "../decisions.mjs";

/** Stage kinds that exist because an operator must decide something. */
const OPERATOR_GATE_KINDS = new Set(["kickoff", "certification", "decision_gate", "implementation"]);

function statusFromPhaseGroup(g) {
  if (g.status === "complete") return "complete";
  if (g.status === "running") return "current";
  if (g.status === "blocked") return "blocked";
  if (g.status === "ready" && g.assignments?.length) return "current";
  return "upcoming";
}

function phaseOutcome(g) {
  const total = g.assignments?.length || 0;
  const done = g.assignments?.filter((a) => a.status === "complete").length || 0;
  if (!total) return "No assignments in this phase yet";
  if (done === total) return `${done} of ${total} assignments accepted`;
  if (done === 0) return `${total} assignment${total === 1 ? "" : "s"} ready or in progress`;
  return `${done} of ${total} assignments accepted`;
}

/**
 * Resolve the label the operator actually chose on an answered decision.
 * Decisions store `chosen_option_id` + `options[]` — there is no denormalised label field,
 * so read the option, then the free-text response, then the recorded recommendation.
 */
function chosenOptionLabel(decision) {
  if (!decision) return null;
  const options = decision.options || [];
  const chosen = options.find((o) => o.optionId === decision.chosen_option_id);
  if (chosen?.label) return chosen.label;
  if (typeof decision.response === "string" && decision.response.trim()) return decision.response.trim();
  const recommended = options.find((o) => o.optionId === decision.recommendation);
  if (recommended?.label) return recommended.label;
  if (typeof decision.recommendation === "string" && decision.recommendation.trim()) {
    return decision.recommendation.trim();
  }
  return null;
}

/**
 * Decisions are bound to phases only through `affectedAssignments`. Without this the
 * journey would attach one mission-wide decision to every completed phase.
 */
function decisionsForPhase(phaseId, decisions, assignments) {
  if (!phaseId) return [];
  const inPhase = new Set(
    (assignments || []).filter((a) => a.phaseId === phaseId).map((a) => a.assignmentId),
  );
  if (!inPhase.size) return [];
  return (decisions || []).filter((d) => (d.affectedAssignments || []).some((id) => inPhase.has(id)));
}

/** Open decisions that belong to no phase — mission-level gates. */
function unscopedDecisions(decisions) {
  return (decisions || []).filter((d) => !(d.affectedAssignments || []).length);
}

/**
 * Label the decision a completed phase actually produced — decisions store only.
 * Never invent unsupported gates: with no phase-bound decision, state the plain fact
 * that the phase was accepted rather than borrowing an unrelated one.
 */
function decisionProducedForPhase(phaseId, group, { decisions = [], assignments = [] } = {}) {
  const answered = decisionsForPhase(phaseId, decisions, assignments)
    .filter((d) => d.status === "answered" || d.status === "resolved");
  const label = chosenOptionLabel(answered[answered.length - 1]);
  if (label) return label;
  return `${group?.title || "Phase"} accepted — work continued`;
}

function kickoffComplete(missionId, mission, assignments) {
  if (assignments.length > 0) return true;
  if (mission?.started_at || mission?.status === "running" || mission?.status === "completed") return true;
  const posture = deriveMissionPosture(missionId);
  return !["draft", "awaiting_kickoff_approval"].includes(posture.status) && posture.id !== "ready_to_start";
}

/**
 * @returns {object} Mission Journey VM
 */
export function missionJourneyVm(missionId) {
  const brief = getBrief(missionId);
  const mission = getMission(missionId);
  const posture = deriveMissionPosture(missionId);
  const groups = phaseDeliverableGroups(missionId);
  const assignments = listAssignments(missionId);
  const openReview = getOpenDeliverableReview(missionId);
  const reviewVm = openReview ? deliverableReviewVm(missionId) : null;
  const acceptedReview = getLatestAcceptedDeliverableReview(missionId);
  const reviews = typeof listDeliverableReviews === "function"
    ? listDeliverableReviews(missionId, { includeSuperseded: false })
    : [];
  const openDecisions = listDecisions(missionId, { status: "open" });
  const allDecisions = listDecisions(missionId, {});

  const stages = [];

  // --- Mission (kickoff) ---
  const kickoffDone = kickoffComplete(missionId, mission, assignments);
  stages.push({
    id: "mission_kickoff",
    title: "Mission",
    kind: "kickoff",
    status: kickoffDone ? "complete" : (posture.id === "ready_to_start" || posture.status === "awaiting_kickoff_approval" ? "current" : "upcoming"),
    outcome: kickoffDone
      ? (brief?.objective ? "Execution approved — work may proceed" : "Mission started")
      : "Waiting for Director to approve execution",
    decisionProduced: kickoffDone ? "Start mission" : null,
    decisionWaiting: kickoffDone ? null : "Approve execution",
    decisionNext: kickoffDone ? (groups[0]?.title ? `Begin ${groups[0].title}` : "Begin first phase") : null,
  });

  // --- Brief plan phases (authoritative work phases) ---
  let sawCurrent = stages.some((s) => s.status === "current");
  for (const g of groups) {
    let st = statusFromPhaseGroup(g);
    if (st === "current" && sawCurrent) st = "upcoming";
    if (st === "current") sawCurrent = true;
    // If kickoff not done, phases stay upcoming
    if (!kickoffDone && st !== "complete") st = "upcoming";
    const complete = st === "complete";
    const waiting = st === "current"
      ? (decisionsForPhase(g.phaseId, openDecisions, assignments)[0] || unscopedDecisions(openDecisions)[0] || null)
      : null;
    stages.push({
      id: g.phaseId || `phase_${g.order}`,
      title: g.title || `Phase ${g.order}`,
      kind: "plan_phase",
      status: st,
      outcome: phaseOutcome(g),
      decisionProduced: complete
        ? decisionProducedForPhase(g.phaseId, g, { decisions: allDecisions, assignments })
        : null,
      decisionWaiting: waiting?.title || null,
      decisionNext: complete ? null : (st === "current" ? "Complete this phase’s assignments" : null),
      meta: {
        order: g.order,
        progress: g.progress,
        assignmentCount: g.assignments?.length || 0,
      },
    });
  }

  const anyReview = Boolean(openReview || acceptedReview);
  const allPlanComplete = groups.length > 0 && groups.every((g) => g.status === "complete");

  // --- Certification (only when a review is open/accepted, or all plan work is done) ---
  if (anyReview || (allPlanComplete && assignments.length)) {
    let certStatus = "upcoming";
    if (openReview) {
      certStatus = "current";
    } else if (acceptedReview || (reviews || []).some((r) => r.certification_state === "accepted" || r.state === "accepted")) {
      certStatus = "complete";
    } else if (allPlanComplete && !sawCurrent) {
      certStatus = "current";
    }

    if (certStatus === "current") {
      for (const s of stages) {
        if (s.status === "current") s.status = "upcoming";
      }
      sawCurrent = true;
    }

    const wave = reviewVm?.waveLabel || acceptedReview?.wave_label || "deliverable";
    stages.push({
      id: "certification",
      title: "Certification",
      kind: "certification",
      status: certStatus,
      outcome: openReview
        ? (reviewVm?.operatorMayApprove
          ? `Director recommends certifying ${wave}`
          : `Director verifying ${wave}`)
        : acceptedReview
          ? `You certified ${acceptedReview.wave_label || wave}`
          : allPlanComplete
            ? "Deliverable certification available when Director is ready"
            : "Certification follows completed work",
      decisionProduced: certStatus === "complete" ? `Certify ${wave}` : null,
      decisionWaiting: openReview
        ? (reviewVm?.operatorMayApprove ? `Certify ${wave}` : "Have Director re-check")
        : null,
      decisionNext: certStatus === "complete" ? "Continue mission" : null,
    });
  }

  // --- Director decision (mission-level gate) ---
  const advanceChoice = (posture.choices || []).some((c) => c.kind === "advance_implementation")
    || posture.secondaryAction?.kind === "advance_implementation"
    || posture.primaryAction?.kind === "advance_implementation";
  const missionDecisionOpen = ["operator_review", "awaiting_completion"].includes(posture.id)
    || (posture.needsYou && (posture.choices || []).length > 0);
  if (missionDecisionOpen || posture.id === "completed") {
    let decStatus = "upcoming";
    if (missionDecisionOpen) {
      for (const s of stages) {
        if (s.status === "current") s.status = "upcoming";
      }
      decStatus = "current";
      sawCurrent = true;
    } else if (posture.id === "completed") {
      decStatus = "complete";
    }

    const recommended = (posture.choices || []).find((c) => c.kind === "advance_implementation")
      || (posture.secondaryAction?.kind === "advance_implementation" ? posture.secondaryAction : null);

    stages.push({
      id: "director_decision",
      title: "Director decision",
      kind: "decision_gate",
      status: decStatus,
      outcome: missionDecisionOpen
        ? (posture.detail || "Director needs a mission-level choice")
        : "Mission-level decision resolved",
      decisionProduced: decStatus === "complete" || posture.id === "completed"
        ? "Mission decision recorded"
        : null,
      decisionWaiting: missionDecisionOpen
        ? (recommended?.label || posture.choices?.[0]?.label || "Choose next step")
        : null,
      decisionNext: null,
      gates: (posture.choices || []).map((c) => ({
        kind: c.kind,
        label: c.label,
        explanation: c.explanation,
      })),
    });
  }

  // --- Advance to implementation (only when posture offers it or already advanced) ---
  const implStarted = Boolean(
    mission?.implementation_started_at
    || mission?.advanced_to_implementation_at
    || mission?.stage === "implementation"
  );
  if (advanceChoice || implStarted) {
    stages.push({
      id: "implementation_advance",
      title: "Advance to implementation",
      kind: "implementation",
      status: implStarted
        ? (posture.id === "completed" ? "complete" : (sawCurrent ? "upcoming" : "current"))
        : (advanceChoice && !missionDecisionOpen ? "current" : "upcoming"),
      outcome: implStarted
        ? "Implementation opened on this mission"
        : "Ready to open implementation on this same mission",
      decisionProduced: implStarted ? "Begin implementation" : null,
      decisionWaiting: advanceChoice && !implStarted ? "Begin implementation" : null,
      decisionNext: null,
    });
    if (stages[stages.length - 1].status === "current") {
      for (const s of stages.slice(0, -1)) {
        if (s.status === "current") s.status = "upcoming";
      }
      sawCurrent = true;
    }
  }

  // --- Complete ---
  if (posture.id === "completed") {
    stages.push({
      id: "complete",
      title: "Complete",
      kind: "complete",
      status: "complete",
      outcome: "Mission closed",
      decisionProduced: "Accept and close",
      decisionWaiting: null,
      decisionNext: null,
    });
  }

  // Ensure exactly one "current" when possible
  const currents = stages.filter((s) => s.status === "current");
  if (currents.length > 1) {
    let keep = true;
    for (const s of stages) {
      if (s.status !== "current") continue;
      if (keep) {
        keep = false;
        continue;
      }
      s.status = "upcoming";
    }
  }
  if (!stages.some((s) => s.status === "current") && kickoffDone && posture.id !== "completed") {
    const next = stages.find((s) => s.status === "upcoming" || s.status === "blocked");
    if (next && next.kind !== "complete") next.status = "current";
  }

  const current = stages.find((s) => s.status === "current") || null;
  const completedCount = stages.filter((s) => s.status === "complete").length;

  return {
    kind: "mission_journey",
    missionId,
    title: brief?.title || mission?.title || missionId,
    currentStageId: current?.id || null,
    currentTitle: current?.title || null,
    youAreHereLabel: current ? `You are here — ${current.title}` : "Journey position unavailable",
    completedCount,
    totalCount: stages.length,
    stages,
    rail: stages.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      current: s.status === "current",
      // Spec §10.2 — decision gates render as diamonds on the rail.
      gate: Boolean(s.decisionWaiting) || (OPERATOR_GATE_KINDS.has(s.kind) && Boolean(s.decisionProduced)),
      gateLabel: s.decisionWaiting || s.decisionProduced || null,
      gatePending: Boolean(s.decisionWaiting),
    })),
    openDecisionTitle: openDecisions[0]?.title || current?.decisionWaiting || null,
    nextAfterHere: current?.decisionWaiting || current?.decisionNext || posture.next || null,
  };
}

/** Compact strip for Overview L1 */
export function missionJourneyStripVm(missionId) {
  const full = missionJourneyVm(missionId);
  return {
    kind: "mission_journey_strip",
    missionId,
    youAreHereLabel: full.youAreHereLabel,
    currentTitle: full.currentTitle,
    currentStageId: full.currentStageId,
    nextAfterHere: full.nextAfterHere,
    rail: full.rail,
    stageCount: full.totalCount,
    completedCount: full.completedCount,
  };
}
