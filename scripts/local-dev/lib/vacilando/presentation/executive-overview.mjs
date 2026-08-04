/**
 * Director Experience V2 — Executive Overview presentation adapters (DX-1 + DX-3).
 *
 * Presentation only. Does not change posture, confidence math, certification,
 * evidence storage, or mission lifecycle. Maps existing authoritative state into
 * L1 Outcome / Executive Summary / Decision cards / Evidence strip shapes.
 */
import { getBrief } from "../mission-brief.mjs";
import { getMission } from "../commands/missions.mjs";
import { deriveMissionPosture } from "../mission-posture.mjs";
import { canAdvanceToImplementation } from "../mission-advance.mjs";
import {
  getOpenDeliverableReview,
  deliverableReviewVm,
} from "../deliverable-review.mjs";
import { listEvidence } from "../evidence.mjs";
import { buildDirectorSummary } from "../director-summary.mjs";
import { listDecisions } from "../decisions.mjs";
import {
  explainedConfidenceVm,
  confidenceGlanceVm,
} from "./explained-confidence.mjs";
import { missionJourneyVm, missionJourneyStripVm } from "./mission-journey.mjs";

export { explainedConfidenceVm, confidenceGlanceVm, missionJourneyVm, missionJourneyStripVm };

/** @typedef {{ id: string, kind: string, label: string, explanation?: string, missionId?: string }} PostureChoice */

const OUTCOME_TONES = {
  accomplished: "success",
  ready_implementation: "success",
  ready_certify_deliverable: "attention",
  needs_discovery: "caution",
  blocked: "warning",
  operator_approval: "attention",
  in_progress: "neutral",
  parked: "neutral",
  needs_work: "caution",
  failed_verification: "danger",
  closed_no_impl: "neutral",
  waiting: "attention",
  unknown: "neutral",
};

/**
 * Coarse, honest presentation copy for known posture choice kinds.
 * Effort/outputs only when known from the kind — never invent estimates.
 */
const CHOICE_PRESENTATION = {
  advance_implementation: {
    title: "Begin implementation",
    buttonLabel: "Begin implementation",
    whyChoose: "Discovery is complete enough to open implementation on this same mission.",
    whatHappensNext: "Implementation phases unlock on this mission. Nothing closes.",
    workLaunches: true,
    expectedOutput: "Next implementation work opens (Wave 0 first when the package defines it).",
  },
  reopen_work: {
    title: "Continue discovery",
    buttonLabel: "Continue discovery",
    whyChoose: "The package is incomplete, wrong, or needs more discovery before you proceed.",
    whatHappensNext: "Discovery reopens. Implementation does not start.",
    workLaunches: true,
    expectedOutput: "Workers resume discovery assignments.",
  },
  park_outcome: {
    title: "Park mission",
    buttonLabel: "Park mission",
    whyChoose: "You want to keep the mission open without launching more work right now.",
    whatHappensNext: "Mission stays open and idle. No worker launches.",
    workLaunches: false,
    expectedOutput: "No new outputs until you return and choose again.",
  },
  certify_completion: {
    title: "Close without implementation",
    buttonLabel: "Close without implementation",
    whyChoose: "You do not want continuation on this mission.",
    whatHappensNext: "Mission closes. No implementation starts here.",
    workLaunches: false,
    expectedOutput: "Closed mission record; no further assignments.",
    /** When label already says Accept and close, override titles below. */
  },
};

function actionFromChoice(choice) {
  if (!choice?.kind) return null;
  const kind = choice.kind;
  const missionId = choice.missionId;
  if (kind === "advance_implementation") {
    return { kind, label: CHOICE_PRESENTATION.advance_implementation.buttonLabel, missionId };
  }
  if (kind === "reopen_work") {
    return { kind, label: CHOICE_PRESENTATION.reopen_work.buttonLabel, missionId };
  }
  if (kind === "park_outcome") {
    return { kind, label: CHOICE_PRESENTATION.park_outcome.buttonLabel, missionId };
  }
  if (kind === "certify_completion") {
    const acceptClose = /accept and close/i.test(choice.label || "");
    return {
      kind,
      label: acceptClose ? "Accept and close" : CHOICE_PRESENTATION.certify_completion.buttonLabel,
      missionId,
    };
  }
  return { kind, label: choice.label, missionId };
}

/**
 * Map posture + review + advance gate → presentation Outcome (no new runtime states).
 * @returns {{ stateId: string, label: string, sentence: string, tone: string, meta: string|null, missingProjection: string|null }}
 */
export function missionOutcomeHeroVm(missionId, {
  posture = null,
  advance = null,
  reviewVm = null,
  progress = null,
} = {}) {
  const p = posture || deriveMissionPosture(missionId);
  const mission = getMission(missionId);
  const adv = advance ?? canAdvanceToImplementation(missionId);
  const openReview = reviewVm || (getOpenDeliverableReview(missionId) ? deliverableReviewVm(missionId) : null);
  const rejected = Boolean(mission?.completion_rejected_at);
  const accepted = progress?.accepted_deliverables;
  const total = progress?.total_deliverables;
  const metaParts = [];
  if (total != null) metaParts.push(`${accepted ?? 0}/${total} assignments accepted`);
  if (p.busy) metaParts.push("Work in progress");
  const meta = metaParts.length ? metaParts.join(" · ") : null;

  if (openReview?.kind === "deliverable_review") {
    if (openReview.operatorMayApprove) {
      return {
        stateId: "ready_certify_deliverable",
        label: "Waiting on Director decision",
        sentence: `Director recommends certifying ${openReview.waveLabel || "this deliverable"}.`,
        tone: OUTCOME_TONES.ready_certify_deliverable,
        meta,
        missingProjection: null,
      };
    }
    if (openReview.stuck) {
      return {
        stateId: "failed_verification",
        label: "Verification incomplete",
        sentence: "Director has not cleared this deliverable yet — re-check before certifying.",
        tone: OUTCOME_TONES.failed_verification,
        meta,
        missingProjection: null,
      };
    }
    return {
      stateId: "waiting",
      label: "Waiting on Director decision",
      sentence: "Director is preparing certification for this deliverable.",
      tone: OUTCOME_TONES.waiting,
      meta,
      missingProjection: null,
    };
  }

  if (p.id === "completed") {
    return {
      stateId: "accomplished",
      label: "Objective achieved",
      sentence: "This mission is complete.",
      tone: OUTCOME_TONES.accomplished,
      meta,
      missingProjection: null,
    };
  }

  if (p.id === "operator_review" || p.id === "awaiting_completion") {
    if (adv?.ok) {
      return {
        stateId: "ready_implementation",
        label: "Ready for implementation",
        sentence: "Discovery finished. Implementation can start on this same mission.",
        tone: OUTCOME_TONES.ready_implementation,
        meta,
        missingProjection: null,
      };
    }
    if (rejected) {
      return {
        stateId: "parked",
        label: "Parked",
        sentence: "Mission is open and idle. Choose when to continue, close, or request more work.",
        tone: OUTCOME_TONES.parked,
        meta,
        missingProjection: null,
      };
    }
    if (p.id === "awaiting_completion") {
      return {
        stateId: "operator_approval",
        label: "Waiting on Director decision",
        sentence: "A worker finished. Read the outcome, then choose the next step deliberately.",
        tone: OUTCOME_TONES.operator_approval,
        meta,
        missingProjection: null,
      };
    }
    return {
      stateId: "needs_discovery",
      label: "Additional discovery recommended",
      sentence: p.detail || "Discovery needs your direction before implementation.",
      tone: OUTCOME_TONES.needs_discovery,
      meta,
      missingProjection: null,
    };
  }

  if (p.id === "paused") {
    return {
      stateId: "parked",
      label: "Parked",
      sentence: "Assignments are paused. Nothing is running.",
      tone: OUTCOME_TONES.parked,
      meta,
      missingProjection: null,
    };
  }

  if (p.status === "blocked" || p.id === "blocked") {
    return {
      stateId: "blocked",
      label: "Blocked",
      sentence: p.detail || "Work cannot continue until a blocker is cleared.",
      tone: OUTCOME_TONES.blocked,
      meta,
      missingProjection: null,
    };
  }

  if (p.busy) {
    return {
      stateId: "in_progress",
      label: "Work in progress",
      sentence: p.detail || "Workers are executing. No decision required yet.",
      tone: OUTCOME_TONES.in_progress,
      meta,
      missingProjection: null,
    };
  }

  if (p.needsYou) {
    return {
      stateId: "operator_approval",
      label: "Waiting on Director decision",
      sentence: p.detail || "Director needs a decision from you.",
      tone: OUTCOME_TONES.operator_approval,
      meta,
      missingProjection: null,
    };
  }

  return {
    stateId: "unknown",
    label: p.label || "Mission status",
    sentence: p.detail || "Status is available below.",
    tone: OUTCOME_TONES.unknown,
    meta,
    missingProjection: "No stronger Outcome mapping for this posture — using posture label.",
  };
}

/**
 * Build decision cards from existing posture choices (same kinds / missionIds).
 * @param {string} missionId
 * @param {{ choices?: PostureChoice[], posture?: object, advance?: object }} [opts]
 */
export function missionDecisionCardsVm(missionId, {
  choices = null,
  posture = null,
  advance = null,
} = {}) {
  const p = posture || deriveMissionPosture(missionId);
  const adv = advance ?? canAdvanceToImplementation(missionId);
  const raw = Array.isArray(choices) ? choices : (p.choices || []);
  const recommendedKind = (() => {
    if (adv?.ok && raw.some((c) => c.kind === "advance_implementation")) {
      return "advance_implementation";
    }
    if (p.secondaryAction?.kind && raw.some((c) => c.kind === p.secondaryAction.kind)) {
      return p.secondaryAction.kind;
    }
    if (/Recommended:\s*Advance/i.test(p.next || "")) return "advance_implementation";
    return null;
  })();

  const cards = raw.filter(Boolean).map((c) => {
    const base = CHOICE_PRESENTATION[c.kind] || null;
    const acceptClose = c.kind === "certify_completion" && /accept and close/i.test(c.label || "");
    const title = acceptClose
      ? "Accept and close"
      : (base?.title || c.label);
    const buttonLabel = acceptClose
      ? "Accept and close"
      : (base?.buttonLabel || c.label);
    const whyChoose = acceptClose
      ? "Results are good enough to close the mission."
      : (base?.whyChoose || c.explanation || "Available option from Director.");
    const whatHappensNext = acceptClose
      ? "Mission certifies completion and closes."
      : (base?.whatHappensNext || c.explanation || "");
    const workLaunches = base ? base.workLaunches : null;
    const expectedOutput = acceptClose
      ? "Closed mission; no further work here."
      : (base?.expectedOutput || null);
    const recommended = recommendedKind != null && c.kind === recommendedKind;
    return {
      id: c.id,
      kind: c.kind,
      missionId: c.missionId || missionId,
      title,
      buttonLabel,
      consequence: c.explanation || whatHappensNext,
      whyChoose,
      whatHappensNext,
      workLaunches,
      workLaunchesLabel: workLaunches === true
        ? "Work launches"
        : workLaunches === false
          ? "No work launches"
          : "Launch behavior unchanged",
      expectedOutput,
      recommended,
      action: actionFromChoice({ ...c, label: buttonLabel, missionId: c.missionId || missionId }),
    };
  });

  const recommended = cards.find((c) => c.recommended) || null;
  return {
    kind: "mission_decision_cards",
    missionId,
    recommended,
    alternatives: cards.filter((c) => !c.recommended),
    cards,
    primaryAction: recommended?.action || null,
    hasRecommendation: Boolean(recommended),
  };
}

/**
 * L1 executive summary blocks — deterministic from existing sources (no LLM).
 */
export function executiveOverviewVm(missionId, {
  posture = null,
  outcomeHero = null,
  decisions = null,
  directorSummary = null,
  progress = null,
} = {}) {
  const brief = getBrief(missionId);
  const p = posture || deriveMissionPosture(missionId);
  const hero = outcomeHero || missionOutcomeHeroVm(missionId, { posture: p, progress });
  const dec = decisions || missionDecisionCardsVm(missionId, { posture: p });
  const summary = directorSummary || buildDirectorSummary(missionId);
  const answers = summary?.answers || summary || {};
  const openDecisions = listDecisions(missionId, { status: "open" });

  const purposeRaw = (brief?.objective || brief?.title || hero.sentence || "Mission objective unavailable.").trim();
  const purpose = purposeRaw.length > 220
    ? `${purposeRaw.slice(0, 217).replace(/\s+\S*$/, "")}…`
    : purposeRaw;

  const discovered = [];
  const changed = answers.what_changed || summary?.what_changed;
  if (changed && typeof changed === "string" && changed.trim()) discovered.push(changed.trim());
  if (progress?.total_deliverables != null) {
    discovered.push(
      `${progress.accepted_deliverables ?? 0} of ${progress.total_deliverables} assignments accepted`,
    );
  }
  if (!discovered.length && answers.where_are_we) discovered.push(String(answers.where_are_we));

  const risks = [];
  if (answers.are_we_blocked || summary?.are_we_blocked) {
    risks.push(String(answers.blocked_detail || summary?.blocked_detail || "Work is blocked."));
  }
  for (const d of openDecisions.slice(0, 2)) {
    risks.push(`Open decision: ${d.title}`);
  }
  if (!risks.length) risks.push("None material recorded");

  const decisionSentence = dec.recommended
    ? `Recommended: ${dec.recommended.title}`
    : openDecisions.length
      ? `Resolve required decisions (${openDecisions.length} open)`
      : dec.cards?.length
        ? "Choose the next mission step"
        : p.needsYou
          ? "A Director decision is required"
          : "None — work can continue without a new decision";

  const doNext = dec.recommended
    ? dec.recommended.buttonLabel
    : dec.cards?.find((c) => c.kind === "reopen_work")?.buttonLabel
      || dec.cards?.[0]?.buttonLabel
      || (openDecisions.length ? "Resolve required decisions" : (p.next || "Watch progress"));

  return {
    kind: "executive_overview",
    missionId,
    purpose,
    outcome: {
      stateId: hero.stateId,
      label: hero.label,
      sentence: hero.sentence,
    },
    discovered: discovered.slice(0, 3),
    risks: risks.slice(0, 3),
    decisionSentence,
    doNext,
    blocks: [
      { id: "mission", label: "Mission", text: purpose },
      { id: "outcome", label: "Outcome", text: `${hero.label}. ${hero.sentence}` },
      { id: "discovered", label: "Discovered / delivered", text: discovered.slice(0, 3).join(" · ") },
      { id: "risks", label: "Risks remaining", text: risks.slice(0, 3).join(" · ") },
      { id: "decision", label: "Your decision", text: decisionSentence },
      { id: "next", label: "Do next", text: doNext },
    ],
  };
}

/** Compact evidence preview for L1 (full gallery remains a later slice). */
export function evidenceStripVm(missionId, { limit = 3 } = {}) {
  const artifacts = listEvidence(missionId).slice(0, limit).map((a) => ({
    id: a.evidenceId || a.id,
    title: a.title || "Evidence",
    proves: a.description || a.proves || "",
    type: a.type || "artifact",
  }));
  return {
    kind: "evidence_strip",
    missionId,
    artifacts,
    empty: artifacts.length === 0,
    galleryHref: `evidence/${missionId}`,
  };
}

/**
 * Compose Executive L1 package for Mission Dashboard.
 */
export function composeExecutiveL1(missionId, {
  posture = null,
  progress = null,
  directorSummary = null,
  missionConfidence = null,
} = {}) {
  const p = posture || deriveMissionPosture(missionId);
  const advance = canAdvanceToImplementation(missionId);
  const reviewVm = getOpenDeliverableReview(missionId) ? deliverableReviewVm(missionId) : null;
  const outcome = missionOutcomeHeroVm(missionId, { posture: p, advance, reviewVm, progress });
  const decisions = missionDecisionCardsVm(missionId, {
    choices: p.choices || [],
    posture: p,
    advance,
  });
  const overview = executiveOverviewVm(missionId, {
    posture: p,
    outcomeHero: outcome,
    decisions,
    directorSummary,
    progress,
  });
  const evidence = evidenceStripVm(missionId);
  const confidence = confidenceGlanceVm(missionId, {
    reviewVm,
    missionConfidence,
    decisions,
  });
  // Prefer nested explained panel as the L1 authority
  const explained = confidence.explained
    || explainedConfidenceVm(missionId, { reviewVm, missionConfidence, decisions });
  const journey = missionJourneyStripVm(missionId);

  // Prefer recommended decision action over vague "Review outcome"
  let primaryAction = decisions.primaryAction;
  if (!primaryAction && reviewVm?.operatorMayApprove && reviewVm?.actions?.approve) {
    primaryAction = {
      kind: "review_deliverable",
      label: `Certify ${reviewVm.waveLabel || "deliverable"}`,
      href: `missions/${missionId}`,
      missionId,
      scrollTo: "mc-outcome",
    };
  }
  // When mission choices exist but none is recommended, still avoid "Review outcome"
  // as the only primary — surface Continue discovery / first card instead.
  if (!primaryAction && decisions.cards.length) {
    const prefer = decisions.cards.find((c) => c.kind === "reopen_work")
      || decisions.cards.find((c) => c.kind === "advance_implementation")
      || decisions.cards[0];
    primaryAction = prefer?.action || null;
  }
  if (!primaryAction && p.primaryAction?.kind && p.primaryAction.kind !== "review_outcome") {
    primaryAction = p.primaryAction;
  }
  if (!primaryAction && p.secondaryAction) {
    primaryAction = p.secondaryAction;
  }

  return {
    kind: "executive_l1",
    missionId,
    outcome,
    overview,
    decisions,
    evidence,
    confidence: explained,
    journey,
    primaryAction,
    depthHint: "Technical depth holds local app, workers, usage, work inventory, and confidence calculation.",
  };
}
