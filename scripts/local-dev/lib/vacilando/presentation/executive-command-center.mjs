/**
 * Director Experience V2 — DX-8 Executive Command Center (presentation only).
 *
 * Surfaces existing mission actions across the portfolio so the Director can act
 * without opening every mission. Does not invent lifecycle, engines, or states.
 *
 * Responsibilities:
 *   Portfolio     → Where should I look?
 *   Command Center → What should I do?
 *   Mission page  → What is happening?
 */
import { listEvidence } from "../evidence.mjs";
import { missionContinuationVm } from "./mission-continuation.mjs";
import { getMissionConfidence } from "../mission-confidence.mjs";

/** Action lanes — derived from posture / recommendation, not hardcoded missions. */
export const COMMAND_LANES = Object.freeze([
  {
    id: "needs_decision",
    label: "Needs Your Decision",
    priority: 1,
    blurb: "Approvals and choices that unblock work.",
  },
  {
    id: "blocked",
    label: "Blocked",
    priority: 2,
    blurb: "Work cannot continue until a blocker clears.",
  },
  {
    id: "ready_promote",
    label: "Ready to Promote",
    priority: 3,
    blurb: "Certification or promotion candidates.",
  },
  {
    id: "waiting_review",
    label: "Waiting on Review",
    priority: 4,
    blurb: "Findings, deliverables, or certification briefings to read.",
  },
  {
    id: "waiting_others",
    label: "Waiting on Others",
    priority: 5,
    blurb: "Queued, paused, or in progress — no Director action required yet.",
  },
  {
    id: "completed_recently",
    label: "Recently Completed",
    priority: 6,
    blurb: "Finished work for quick confirmation.",
  },
]);

const LANE_BY_ID = Object.fromEntries(COMMAND_LANES.map((l) => [l.id, l]));

/** Action kinds that are Director decisions (approve / choose path). */
const DECISION_KINDS = new Set([
  "advance_implementation",
  "open_decision",
  "answer_decision",
  "dispatch_ready",
  "resume_stalled",
  "reopen_work",
  "park_outcome",
  "certify_completion",
  "reject_completion",
]);

const REVIEW_KINDS = new Set([
  "review_deliverable",
  "review_outcome",
  "review_findings",
  "recheck_deliverable",
]);

/**
 * Map portfolio card + recommended action → command lane (deterministic).
 */
export function commandLaneForCard(card, { actionKind = null } = {}) {
  const groupId = card?.groupId || "";
  const kind = actionKind || card?.nextAction?.kind || card?.primaryAction?.kind || "";
  const postureId = card?.postureId || "";

  if (groupId === "completed_recently" || postureId === "completed") {
    return "completed_recently";
  }
  if (groupId === "blocked" || postureId === "blocked") {
    return "blocked";
  }
  if (groupId === "ready_close") {
    return "ready_promote";
  }
  if (
    groupId === "ready_implementation"
    || kind === "advance_implementation"
  ) {
    return "needs_decision";
  }
  if (REVIEW_KINDS.has(kind) || postureId === "deliverable_review") {
    return "waiting_review";
  }
  if (
    groupId === "needs_attention"
    || card?.needsYou
    || DECISION_KINDS.has(kind)
    || postureId === "operator_review"
    || postureId === "decision_required"
  ) {
    return "needs_decision";
  }
  if (groupId === "waiting" || groupId === "in_progress") {
    return "waiting_others";
  }
  return card?.needsYou ? "needs_decision" : "waiting_others";
}

/**
 * Priority score for Command Center ordering (higher = sooner). Explainable bands only.
 */
export function commandPriorityScore(card) {
  let score = 0;
  const lane = card.laneId || commandLaneForCard(card);
  if (lane === "needs_decision") score += 100;
  if (lane === "blocked") score += 90;
  if (lane === "ready_promote") score += 80;
  if (lane === "waiting_review") score += 70;
  if (lane === "waiting_others") score += 20;
  if (card.stale) score += 15;
  if (card.needsYou) score += 10;
  const kind = card.primaryAction?.kind || "";
  if (kind === "advance_implementation") score += 8;
  if (kind === "certify_completion") score += 6;
  if (kind === "review_deliverable") score += 5;
  return score;
}

function evidenceSummary(missionId) {
  try {
    const items = listEvidence(missionId) || [];
    if (!items.length) {
      return { available: false, count: 0, label: "No evidence attached yet" };
    }
    const screens = items.filter((e) => /screenshot|image|ui/i.test(e.type || e.title || "")).length;
    return {
      available: true,
      count: items.length,
      label: screens
        ? `${items.length} artifact${items.length === 1 ? "" : "s"} · ${screens} UI`
        : `${items.length} artifact${items.length === 1 ? "" : "s"} available`,
    };
  } catch {
    return { available: false, count: 0, label: "Evidence unavailable" };
  }
}

function actionTitleForKind(kind, fallback) {
  const map = {
    advance_implementation: "Approve Implementation",
    certify_completion: "Approve Promotion",
    review_deliverable: "Review Certification",
    review_outcome: "Review Outcome",
    review_findings: "Review Findings",
    reopen_work: "Continue Discovery",
    park_outcome: "Park Mission",
    resume_stalled: "Resume Work",
    dispatch_ready: "Start Work",
    provide_feedback: "Provide Feedback",
    open_mission: "Open Mission",
    open_decision: "Open Decision",
  };
  return map[kind] || fallback || "Take action";
}

/**
 * Build one Command Center action card from a portfolio mission card.
 */
export function commandActionCardVm(portfolioCard, {
  continuation = null,
  confidence = null,
  enrich = true,
} = {}) {
  const missionId = portfolioCard.missionId;
  const cont = enrich
    ? (continuation || missionContinuationVm(missionId, {}))
    : continuation;
  const conf = confidence || portfolioCard.confidence || (enrich ? getMissionConfidence(missionId) : null);

  const recommended = cont?.recommended || null;
  const primary = recommended?.action
    || portfolioCard.nextAction
    || portfolioCard.primaryAction
    || { kind: "open_mission", label: "Open mission", href: `missions/${missionId}`, missionId };

  const actionKind = primary.kind || recommended?.kind || "";
  const laneId = commandLaneForCard(portfolioCard, { actionKind });
  const evidence = enrich ? evidenceSummary(missionId) : { available: false, count: 0, label: "—" };

  const reason = portfolioCard.blocker
    || portfolioCard.outcome?.sentence
    || portfolioCard.directorState
    || portfolioCard.statusLabel
    || "Requires Director attention";

  const expectedOutcome = recommended?.expectedOutcome
    || recommended?.whatHappensNext
    || (actionKind === "advance_implementation"
      ? "Implementation begins on this same mission."
      : actionKind === "certify_completion"
        ? "Mission certifies and closes (or promotes)."
        : actionKind === "review_deliverable" || actionKind === "review_findings"
          ? "You review evidence — no automatic lifecycle change."
          : "Follow the recommended mission action.");

  const timeSensitivity = portfolioCard.stale
    ? "Stale — needs attention"
    : portfolioCard.updatedLabel
      ? `Updated ${portfolioCard.updatedLabel}`
      : null;

  const title = actionTitleForKind(
    actionKind,
    recommended?.buttonLabel || portfolioCard.recommendation || primary.label,
  );

  return {
    kind: "command_action_card",
    missionId,
    title: portfolioCard.title,
    actionTitle: title,
    laneId,
    laneLabel: LANE_BY_ID[laneId]?.label || laneId,
    phase: portfolioCard.phase || portfolioCard.statusLabel,
    reason,
    recommendation: recommended?.buttonLabel
      || portfolioCard.recommendation
      || primary.label
      || title,
    expectedOutcome,
    confidence: {
      percent: conf?.percent ?? portfolioCard.confidence?.percent ?? null,
      bandLabel: conf?.bandLabel || portfolioCard.confidence?.bandLabel || null,
    },
    blocker: portfolioCard.blocker || null,
    evidence,
    timeSensitivity,
    stale: Boolean(portfolioCard.stale),
    needsYou: Boolean(portfolioCard.needsYou),
    postureId: portfolioCard.postureId,
    groupId: portfolioCard.groupId,
    primaryAction: {
      kind: primary.kind,
      label: recommended?.buttonLabel || primary.label || title,
      missionId,
      href: primary.href || `missions/${missionId}`,
      scrollTo: primary.scrollTo || null,
      reviewId: primary.reviewId || null,
    },
    secondaryAction: portfolioCard.secondaryAction || null,
  };
}

/**
 * Compose Executive Command Center from an existing Director Portfolio VM.
 * Reuses portfolio cards — does not re-walk lifecycle.
 *
 * @param {object} portfolio — result of directorPortfolioVm()
 * @param {{ enrichLimit?: number }} [opts] — rich continuation only for top N actionable cards
 */
export function executiveCommandCenterVm(portfolio, { enrichLimit = 12 } = {}) {
  const sourceCards = (portfolio?.cards || []).filter(Boolean);
  // First pass: light cards (no continuation) for lane assignment + sort
  let light = sourceCards.map((c) => commandActionCardVm(c, { enrich: false }));
  light.sort((a, b) => commandPriorityScore(b) - commandPriorityScore(a));

  const actionable = light.filter((c) => c.laneId !== "waiting_others" && c.laneId !== "completed_recently");
  const enrichIds = new Set(actionable.slice(0, enrichLimit).map((c) => c.missionId));

  const cards = light.map((c) => {
    if (!enrichIds.has(c.missionId)) return c;
    const src = sourceCards.find((s) => s.missionId === c.missionId);
    return src ? commandActionCardVm(src, { enrich: true }) : c;
  });
  cards.sort((a, b) => commandPriorityScore(b) - commandPriorityScore(a));

  const byLane = new Map(COMMAND_LANES.map((l) => [l.id, []]));
  for (const c of cards) {
    if (!byLane.has(c.laneId)) byLane.set(c.laneId, []);
    byLane.get(c.laneId).push(c);
  }

  const lanes = COMMAND_LANES
    .map((l) => ({
      ...l,
      count: (byLane.get(l.id) || []).length,
      cards: byLane.get(l.id) || [],
    }))
    .filter((l) => l.count > 0 || ["needs_decision", "blocked"].includes(l.id));

  const needsAction = cards.filter((c) =>
    ["needs_decision", "blocked", "ready_promote", "waiting_review"].includes(c.laneId));

  const lead = needsAction.length
    ? `${needsAction.length} action${needsAction.length === 1 ? "" : "s"} ready`
    : "Nothing requires action — review portfolio below";

  return {
    kind: "executive_command_center",
    sectionTitle: "Executive Command Center",
    lead,
    question: "What can you do right now — without opening every mission?",
    lanes,
    needsAction: needsAction.slice(0, 10),
    cards,
    counts: {
      needsDecision: (byLane.get("needs_decision") || []).length,
      blocked: (byLane.get("blocked") || []).length,
      readyPromote: (byLane.get("ready_promote") || []).length,
      waitingReview: (byLane.get("waiting_review") || []).length,
      waitingOthers: (byLane.get("waiting_others") || []).length,
      completedRecently: (byLane.get("completed_recently") || []).length,
      actionable: needsAction.length,
    },
    empty: needsAction.length === 0,
  };
}
