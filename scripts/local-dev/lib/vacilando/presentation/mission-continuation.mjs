/**
 * Director Experience V2 — DX-5.5 Mission Continuation & Recommended Next Actions.
 *
 * Presentation only. Deterministic mappings over existing posture / choices /
 * advance / certification state. Does not invent lifecycle transitions, change
 * mission engine, or calculate recommendations — it explains them.
 */
import { canAdvanceToImplementation } from "../mission-advance.mjs";
import { deriveMissionPosture } from "../mission-posture.mjs";
import { getOpenDeliverableReview, deliverableReviewVm } from "../deliverable-review.mjs";
import { getMission } from "../commands/missions.mjs";

/**
 * @typedef {{
 *   id?: string,
 *   kind: string,
 *   label?: string,
 *   explanation?: string,
 *   missionId?: string,
 * }} PostureChoice
 */

/** Coarse presentation copy for known action kinds (same kinds as posture). */
const KIND_PRESENTATION = {
  advance_implementation: {
    title: "Begin Implementation",
    buttonLabel: "Begin Implementation",
    whyChoose: "Discovery objectives were achieved. No blocking architectural risks remain for opening implementation on this same mission.",
    expectedOutcome: "Implementation roadmap begins. Wave 0 unlocks first when the package defines it.",
    whatHappensNext: "Implementation phases unlock on this mission. Nothing closes.",
    workLaunches: true,
    workersAssigned: true,
    technicalConsequence: "Same mission advances; discovery outputs remain authoritative context.",
  },
  reopen_work: {
    title: "Request More Discovery",
    buttonLabel: "Request More Discovery",
    whyChoose: "Use when the package is incomplete, wrong, or missing material discovery — not when the direction is right and you only want refinements.",
    expectedOutcome: "Discovery reopens. Implementation does not start.",
    whatHappensNext: "Workers resume discovery assignments with the gaps you care about.",
    workLaunches: true,
    workersAssigned: true,
    technicalConsequence: "Completion rejection path / reopen — no implementation advance.",
  },
  park_outcome: {
    title: "Park Mission",
    buttonLabel: "Park Mission",
    whyChoose: "Keep the mission open without launching more work right now.",
    expectedOutcome: "Mission stays open and idle. No worker launches.",
    whatHappensNext: "No new outputs until you return and choose again.",
    workLaunches: false,
    workersAssigned: false,
    technicalConsequence: "No assignments dispatched; mission remains open.",
  },
  certify_completion: {
    title: "Close Without Continuing",
    buttonLabel: "Close Without Continuing",
    whyChoose: "Abandon further work on this mission. Prefer only when you intentionally will not implement, certify further, or expand here.",
    expectedOutcome: "Mission closes. No implementation starts here.",
    whatHappensNext: "Closed mission record; no further assignments.",
    workLaunches: false,
    workersAssigned: false,
    technicalConsequence: "Certifies completion without continuation — end of this mission’s work.",
  },
  certify_completion_accept: {
    title: "Accept and close",
    buttonLabel: "Accept and close",
    whyChoose: "Results are good enough to close the mission.",
    expectedOutcome: "Mission certifies completion and closes.",
    whatHappensNext: "Closed mission; no further work here.",
    workLaunches: false,
    workersAssigned: false,
    technicalConsequence: "Completion certification recorded; mission ends.",
  },
  review_findings: {
    title: "Review Findings",
    buttonLabel: "Review Findings",
    whyChoose: "Read the discovery package and executive outcome before choosing how to continue.",
    expectedOutcome: "You review findings — no mission state change.",
    whatHappensNext: "Opens the existing discovery package / evidence. Not a lifecycle action.",
    workLaunches: false,
    workersAssigned: false,
    presentationOnly: true,
    technicalConsequence: "Navigation / scroll only — no posture mutation.",
  },
  provide_feedback: {
    title: "Provide Feedback",
    buttonLabel: "Provide Feedback",
    whyChoose: "Use when the mission is fundamentally correct but you want refinements before continuing (e.g. add MFA, reorder Billing before Scheduling, simplify a role editor).",
    expectedOutcome: "Director guidance is prepared for refinement. Discovery does not reopen as a full rework by default.",
    whatHappensNext: "Opens the feedback surface. Threaded conversation recording ships in a later slice — this prepares the continuation choice.",
    workLaunches: false,
    workersAssigned: false,
    presentationOnly: true,
    technicalConsequence: "Presentation surface only in DX-5.5 — no new lifecycle state.",
  },
  review_deliverable: {
    title: "Begin Certification",
    buttonLabel: "Begin Certification",
    whyChoose: "Implementation work is ready for your certification decision on the open deliverable.",
    expectedOutcome: "You enter the certification briefing for the current deliverable.",
    whatHappensNext: "Scroll to the deliverable review. Certify or request changes from that surface.",
    workLaunches: false,
    workersAssigned: false,
    technicalConsequence: "Uses existing deliverable review actions — no new cert engine.",
  },
  resume_stalled: {
    title: "Resume Mission",
    buttonLabel: "Resume Mission",
    whyChoose: "Work stopped unexpectedly or assignments are paused — resume so progress can continue.",
    expectedOutcome: "Worker relaunch / resume on the current assignment.",
    whatHappensNext: "Director relaunches the stalled or paused path.",
    workLaunches: true,
    workersAssigned: true,
    technicalConsequence: "Existing resume_stalled / dispatch path.",
  },
  open_mission: {
    title: "Open Mission",
    buttonLabel: "Open Mission",
    whyChoose: "Inspect the mission and choose the next deliberate step.",
    expectedOutcome: "Mission dashboard stays / opens for your review.",
    whatHappensNext: "No automatic launch until you choose a continuation.",
    workLaunches: false,
    workersAssigned: false,
    technicalConsequence: "Navigation only.",
  },
  open_missions: {
    title: "Begin Next Planned Mission",
    buttonLabel: "Begin Next Planned Mission",
    whyChoose: "This initiative is complete. Start or open the next planned mission when you are ready.",
    expectedOutcome: "Missions list opens so you can continue the initiative sequence.",
    whatHappensNext: "No change to this closed mission.",
    workLaunches: false,
    workersAssigned: false,
    presentationOnly: true,
    technicalConsequence: "Navigation to missions home — no lifecycle invent.",
  },
  resolve_blockers: {
    title: "Resolve Blockers",
    buttonLabel: "Resolve Blockers",
    whyChoose: "An assignment is blocked. Work cannot continue until the blocker clears.",
    expectedOutcome: "You inspect blockers and clear the path so work can resume.",
    whatHappensNext: "Open the mission and address the blocked assignment.",
    workLaunches: false,
    workersAssigned: false,
    technicalConsequence: "Presentation of existing blocked posture primary.",
  },
  request_rework: {
    title: "Request Rework",
    buttonLabel: "Request Rework",
    whyChoose: "Implementation or completion was rejected — send work back with direction.",
    expectedOutcome: "Work reopens for correction. Prior rejection stays visible in history.",
    whatHappensNext: "Workers resume with rework intent (same reopen_work kind).",
    workLaunches: true,
    workersAssigned: true,
    technicalConsequence: "Maps to existing reopen_work — no new state.",
  },
};

function isAcceptClose(choice) {
  return choice?.kind === "certify_completion" && /accept and close/i.test(choice.label || "");
}

function presentationForKind(kind, { acceptClose = false, rejected = false } = {}) {
  if (kind === "certify_completion" && acceptClose) {
    return KIND_PRESENTATION.certify_completion_accept;
  }
  if (kind === "reopen_work" && rejected) {
    return KIND_PRESENTATION.request_rework;
  }
  return KIND_PRESENTATION[kind] || null;
}

function launchLabels(workLaunches, workersAssigned) {
  return {
    workLaunchesLabel: workLaunches === true
      ? "Work launches"
      : workLaunches === false
        ? "No work launches"
        : "Launch behavior unchanged",
    workersAssignedLabel: workersAssigned === true
      ? "Workers may be assigned"
      : workersAssigned === false
        ? "No workers assigned"
        : "Assignment behavior unchanged",
  };
}

function actionFromChoice(choice, buttonLabel) {
  if (!choice?.kind) return null;
  const kind = choice.kind;
  const missionId = choice.missionId;
  if (kind === "review_findings") {
    return {
      kind,
      label: buttonLabel,
      missionId,
      scrollTo: "mc-exec-summary",
      href: missionId ? `evidence/${missionId}` : "evidence",
    };
  }
  if (kind === "provide_feedback") {
    return { kind, label: buttonLabel, missionId, opensPanel: "provide_feedback" };
  }
  if (kind === "open_missions") {
    return { kind, label: buttonLabel, href: "missions" };
  }
  if (kind === "resolve_blockers" || kind === "request_rework") {
    // Presentation aliases — wire to real kinds
    const real = kind === "request_rework" ? "reopen_work" : "open_mission";
    return { kind: real, label: buttonLabel, missionId, href: missionId ? `missions/${missionId}` : null };
  }
  if (kind === "review_deliverable") {
    return {
      kind,
      label: buttonLabel,
      missionId,
      href: missionId ? `missions/${missionId}` : null,
      scrollTo: "mc-outcome",
    };
  }
  if (["advance_implementation", "reopen_work", "park_outcome", "certify_completion", "resume_stalled", "dispatch_ready"].includes(kind)) {
    return { kind, label: buttonLabel, missionId };
  }
  if (kind === "open_mission" || kind === "open_kickoff") {
    return {
      kind,
      label: buttonLabel,
      missionId,
      href: choice.href || (missionId ? `missions/${missionId}` : null),
    };
  }
  return { kind, label: buttonLabel || choice.label, missionId, href: choice.href || null };
}

/**
 * Infer recommended kind from existing posture / advance — explain, don't calculate.
 * @returns {string|null}
 */
export function inferRecommendedContinuationKind({
  posture = null,
  advance = null,
  choices = [],
  mission = null,
  reviewVm = null,
} = {}) {
  const raw = Array.isArray(choices) ? choices : [];
  const kinds = new Set(raw.map((c) => c?.kind).filter(Boolean));
  const rejected = Boolean(mission?.completion_rejected_at);
  const p = posture || {};

  if (p.id === "blocked") return "resolve_blockers";
  if (p.id === "paused" || p.id === "worker_silent") {
    if (p.primaryAction?.kind === "resume_stalled") return "resume_stalled";
    return "resume_stalled";
  }
  if (p.id === "completed") return "open_missions";
  if (p.id === "deliverable_review" && reviewVm?.operatorMayApprove) return "review_deliverable";
  if (rejected && kinds.has("reopen_work")) return "reopen_work";

  if (advance?.ok && kinds.has("advance_implementation")) return "advance_implementation";
  if (p.secondaryAction?.kind && kinds.has(p.secondaryAction.kind)) return p.secondaryAction.kind;
  if (/Recommended:\s*Advance/i.test(p.next || "")) return "advance_implementation";

  if (p.id === "awaiting_completion" && kinds.has("certify_completion")) {
    const accept = raw.find((c) => isAcceptClose(c));
    if (accept) return "certify_completion";
  }

  // Discovery/outcome review without an advance path — prefer Request More Discovery
  // so the Director still sees an explicit Recommended Next Action (not a dead end).
  if (
    (p.id === "operator_review" || p.id === "awaiting_completion")
    && !advance?.ok
    && kinds.has("reopen_work")
  ) {
    return "reopen_work";
  }

  if (kinds.has("advance_implementation")) return "advance_implementation";
  if (raw.length === 1) return raw[0].kind;
  return null;
}

function buildPresentationCard(choice, {
  recommendedKind = null,
  rejected = false,
  missionId,
} = {}) {
  const acceptClose = isAcceptClose(choice);
  const base = presentationForKind(choice.kind, { acceptClose, rejected });
  const title = base?.title || choice.label || choice.kind;
  const buttonLabel = base?.buttonLabel || choice.label || title;
  const whyChoose = base?.whyChoose || choice.explanation || "Available option from Director.";
  const expectedOutcome = base?.expectedOutcome || null;
  const whatHappensNext = base?.whatHappensNext || choice.explanation || "";
  const workLaunches = base ? base.workLaunches : null;
  const workersAssigned = base ? base.workersAssigned : null;
  const { workLaunchesLabel, workersAssignedLabel } = launchLabels(workLaunches, workersAssigned);
  const recommended = recommendedKind != null && (
    choice.kind === recommendedKind
    || (recommendedKind === "request_rework" && choice.kind === "reopen_work" && rejected)
    || (recommendedKind === "resolve_blockers" && choice.kind === "open_mission")
  );
  const relationship = recommended
    ? "recommended"
    : (base?.presentationOnly ? "related" : "alternative");
  const pathRelationNote = recommended
    ? "This is the recommended path"
    : relationship === "related"
      ? "Related continuation — does not change mission lifecycle by itself"
      : "Alternative to the recommended path";

  const action = actionFromChoice(
    { ...choice, missionId: choice.missionId || missionId },
    buttonLabel,
  );

  return {
    id: choice.id || choice.kind,
    kind: choice.kind,
    missionId: choice.missionId || missionId,
    title,
    buttonLabel,
    consequence: choice.explanation || whatHappensNext,
    whyChoose,
    why: whyChoose,
    expectedOutcome,
    expectedOutput: expectedOutcome,
    whatHappensNext,
    workLaunches,
    workersAssigned,
    workLaunchesLabel,
    workersAssignedLabel,
    technicalConsequence: base?.technicalConsequence || null,
    presentationOnly: Boolean(base?.presentationOnly),
    relationship,
    pathRelationNote,
    recommended,
    action,
  };
}

function presentationOnlyCards(missionId, { includeFeedback = true } = {}) {
  const findings = buildPresentationCard(
    {
      id: "review_findings",
      kind: "review_findings",
      label: "Review Findings",
      missionId,
    },
    { missionId },
  );
  const cards = [findings];
  if (includeFeedback) {
    cards.push(buildPresentationCard(
      {
        id: "provide_feedback",
        kind: "provide_feedback",
        label: "Provide Feedback",
        missionId,
      },
      { missionId },
    ));
  }
  return cards;
}

/**
 * Build continuation decision pack from posture choices + presentation-only actions.
 *
 * @param {string} missionId
 * @param {{ choices?: PostureChoice[], posture?: object, advance?: object, reviewVm?: object|null }} [opts]
 */
export function missionContinuationVm(missionId, {
  choices = null,
  posture = null,
  advance = null,
  reviewVm = null,
} = {}) {
  const p = posture || deriveMissionPosture(missionId);
  const adv = advance ?? canAdvanceToImplementation(missionId);
  const mission = getMission(missionId);
  const rejected = Boolean(mission?.completion_rejected_at);
  const openReview = reviewVm || (getOpenDeliverableReview(missionId)
    ? deliverableReviewVm(missionId)
    : null);

  const raw = Array.isArray(choices) ? choices.filter(Boolean) : (p.choices || []).filter(Boolean);

  // Synthetic choices when posture needs a continuation but has none.
  /** @type {PostureChoice[]} */
  let synthetic = [];
  if (!raw.length) {
    if (p.id === "blocked") {
      synthetic = [{
        id: "resolve_blockers",
        kind: "open_mission",
        label: "Resolve Blockers",
        explanation: p.detail || "Clear the blocker so work can continue.",
        missionId,
        href: `missions/${missionId}`,
      }];
    } else if (p.id === "paused" || (p.id === "worker_silent" && p.needsYou)) {
      synthetic = [{
        id: "resume",
        kind: p.primaryAction?.kind === "resume_stalled" ? "resume_stalled" : "resume_stalled",
        label: "Resume Mission",
        explanation: p.detail || "Resume so progress can continue.",
        missionId,
      }];
    } else if (p.id === "completed") {
      synthetic = [{
        id: "next_mission",
        kind: "open_missions",
        label: "Begin Next Planned Mission",
        explanation: "This initiative is complete.",
        missionId,
      }];
    } else if (p.id === "deliverable_review" && openReview?.operatorMayApprove) {
      synthetic = [{
        id: "begin_cert",
        kind: "review_deliverable",
        label: "Begin Certification",
        explanation: openReview.headline || "Open the certification briefing.",
        missionId,
      }];
    } else if (p.primaryAction?.kind && p.primaryAction.kind !== "review_outcome") {
      synthetic = [{
        id: "primary",
        kind: p.primaryAction.kind,
        label: p.primaryAction.label,
        explanation: p.detail || p.next || "",
        missionId,
        href: p.primaryAction.href,
      }];
    }
  }

  const sourceChoices = raw.length ? raw : synthetic;
  const recommendedKind = inferRecommendedContinuationKind({
    posture: p,
    advance: adv,
    choices: sourceChoices,
    mission,
    reviewVm: openReview,
  });

  // Remap open_mission synthetic for blocked → presentation as resolve_blockers in title only
  const cardsFromChoices = sourceChoices.map((c) => {
    if (p.id === "blocked" && c.kind === "open_mission") {
      const card = buildPresentationCard(
        { ...c, kind: "open_mission" },
        { recommendedKind: "resolve_blockers", missionId },
      );
      const res = KIND_PRESENTATION.resolve_blockers;
      return {
        ...card,
        title: res.title,
        buttonLabel: res.buttonLabel,
        whyChoose: res.whyChoose,
        why: res.whyChoose,
        expectedOutcome: res.expectedOutcome,
        expectedOutput: res.expectedOutcome,
        whatHappensNext: res.whatHappensNext,
        technicalConsequence: res.technicalConsequence,
        recommended: recommendedKind === "resolve_blockers",
        relationship: recommendedKind === "resolve_blockers" ? "recommended" : "alternative",
        pathRelationNote: recommendedKind === "resolve_blockers"
          ? "This is the recommended path"
          : "Alternative to the recommended path",
        action: actionFromChoice({ ...c, kind: "resolve_blockers", missionId }, res.buttonLabel),
      };
    }
    if ((p.id === "paused" || p.id === "worker_silent") && c.kind === "resume_stalled") {
      const card = buildPresentationCard(c, { recommendedKind, missionId });
      const res = KIND_PRESENTATION.resume_stalled;
      return {
        ...card,
        title: res.title,
        buttonLabel: res.buttonLabel,
        whyChoose: res.whyChoose,
        why: res.whyChoose,
        expectedOutcome: res.expectedOutcome,
        expectedOutput: res.expectedOutcome,
      };
    }
    if (rejected && c.kind === "reopen_work") {
      const card = buildPresentationCard(c, { recommendedKind, rejected: true, missionId });
      return card;
    }
    return buildPresentationCard(c, { recommendedKind, rejected, missionId });
  });

  const decisionMoment = Boolean(raw.length)
    || ["operator_review", "awaiting_completion"].includes(p.id)
    || (p.id === "deliverable_review" && openReview?.operatorMayApprove);

  const extras = decisionMoment
    ? presentationOnlyCards(missionId, { includeFeedback: true })
      .filter((extra) => !cardsFromChoices.some((c) => c.kind === extra.kind))
    : (p.id === "completed"
      ? presentationOnlyCards(missionId, { includeFeedback: false })
        .filter((extra) => !cardsFromChoices.some((c) => c.kind === extra.kind))
      : []);

  const cards = [...cardsFromChoices, ...extras];
  const recommended = cards.find((c) => c.recommended) || null;
  const alternatives = cards.filter((c) => !c.recommended);

  const whyRecommended = recommended
    ? (recommended.whyChoose || recommended.why || null)
    : null;
  const expectedOutcome = recommended?.expectedOutcome || recommended?.expectedOutput || null;

  return {
    kind: "mission_continuation",
    missionId,
    sectionTitle: "Recommended Next Action",
    alternativesTitle: "Alternative decisions",
    whyRecommended,
    expectedOutcome,
    recommended,
    alternatives,
    cards,
    primaryAction: recommended?.action || null,
    hasRecommendation: Boolean(recommended),
    postureId: p.id,
    continuationState: mapContinuationStateLabel(p, { advance: adv, rejected, reviewVm: openReview }),
    feedbackSurface: {
      id: "mc-feedback-panel",
      title: "Provide Feedback",
      blurb: "The mission direction is fundamentally correct. Capture refinement notes here — distinct from Request More Discovery. Notes persist as Director Collaboration on this mission.",
      placeholder: "Example: I want MFA added. Billing should move before Scheduling. Keep the architecture but simplify the role editor.",
      captureReady: true,
      captureNote: "Saved notes become durable collaboration entries (Feedback / Implementation Guidance). Not a chat thread.",
      defaultType: "feedback",
    },
  };
}

function mapContinuationStateLabel(posture, { advance, rejected, reviewVm }) {
  if (posture?.id === "blocked") return "blocked";
  if (posture?.id === "paused") return "parked";
  if (posture?.id === "completed") return "completed_initiative";
  if (rejected) return "implementation_rejected";
  if (posture?.id === "deliverable_review" && reviewVm?.operatorMayApprove) return "implementation_complete";
  if (posture?.id === "awaiting_completion") return "certification_ready";
  if (advance?.ok) return "discovery_complete";
  if (posture?.id === "operator_review") return "discovery_review";
  return posture?.id || "unknown";
}

/**
 * Back-compat wrapper used by DX-1…DX-3 call sites — same shape, DX-5.5 copy.
 */
export function missionDecisionCardsVm(missionId, opts = {}) {
  const pack = missionContinuationVm(missionId, opts);
  return {
    kind: "mission_decision_cards",
    missionId: pack.missionId,
    recommended: pack.recommended,
    alternatives: pack.alternatives,
    cards: pack.cards,
    primaryAction: pack.primaryAction,
    hasRecommendation: pack.hasRecommendation,
    sectionTitle: pack.sectionTitle,
    alternativesTitle: pack.alternativesTitle,
    whyRecommended: pack.whyRecommended,
    expectedOutcome: pack.expectedOutcome,
    continuationState: pack.continuationState,
    feedbackSurface: pack.feedbackSurface,
  };
}
