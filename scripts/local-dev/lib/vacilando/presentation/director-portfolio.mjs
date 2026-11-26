/**
 * Director Experience V2 — DX-7 Director Portfolio (presentation only).
 *
 * Aggregates existing mission list cards + posture into an executive portfolio.
 * Does not invent lifecycle, initiatives, or hierarchy.
 */
import { getMission } from "../commands/missions.mjs";
import { listMissionsV2, projectMissionRow } from "../director-summary.mjs";
import { deriveMissionPosture } from "../mission-posture.mjs";
import { canAdvanceToImplementation } from "../mission-advance.mjs";
import { getMissionConfidence } from "../mission-confidence.mjs";
import { getOpenDeliverableReview } from "../deliverable-review.mjs";
import { listDecisions } from "../decisions.mjs";
import { listAssignments } from "../worker-assignment.mjs";
import { missionContinuationVm } from "./mission-continuation.mjs";
import { executiveCommandCenterVm } from "./executive-command-center.mjs";

function relTime(isoStr) {
  if (!isoStr) return null;
  const t = Date.parse(isoStr);
  if (!Number.isFinite(t)) return String(isoStr);
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Portfolio group ids — derived from posture, not hardcoded mission lists. */
export const PORTFOLIO_GROUPS = Object.freeze([
  {
    id: "needs_attention",
    label: "Needs Your Attention",
    priority: 1,
    blurb: "Decisions, certifications, and recoveries waiting on you.",
  },
  {
    id: "blocked",
    label: "Blocked",
    priority: 2,
    blurb: "Work cannot continue until a blocker clears.",
  },
  {
    id: "ready_implementation",
    label: "Ready for Implementation",
    priority: 3,
    blurb: "Discovery is ready to advance on the same mission.",
  },
  {
    id: "ready_close",
    label: "Ready for Promotion",
    priority: 4,
    blurb: "Results may be certifiable or ready to promote — choose deliberately.",
  },
  {
    id: "waiting",
    label: "Waiting",
    priority: 5,
    blurb: "Paused, queued, or waiting on upstream work.",
  },
  {
    id: "in_progress",
    label: "In Progress",
    priority: 6,
    blurb: "Workers are executing — no decision required yet.",
  },
  {
    id: "completed_recently",
    label: "Recently Finished",
    priority: 7,
    blurb: "Certified or archived missions for quick review.",
  },
]);

const GROUP_BY_ID = Object.fromEntries(PORTFOLIO_GROUPS.map((g) => [g.id, g]));

/**
 * Map posture → one primary portfolio group (deterministic).
 * @param {object} posture
 * @param {{ advance?: object, mission?: object, reviewOpen?: boolean }} [ctx]
 */
export function portfolioGroupForPosture(posture, {
  advance = null,
  mission = null,
  reviewOpen = false,
} = {}) {
  const id = posture?.id || "unknown";
  const completed = id === "completed"
    || mission?.status === "completed"
    || mission?.kickoff_status === "completed"
    || mission?.archived === true;

  if (completed) return "completed_recently";

  if (id === "blocked") return "blocked";

  // Promotion / certify lane — before advance, so close-ready stays distinct.
  if (
    id === "awaiting_completion"
    || mission?.status === "awaiting_completion_approval"
    || mission?.kickoff_status === "awaiting_completion_approval"
  ) {
    return "ready_close";
  }

  // Discovery finished and implementation can begin on the same mission.
  if (
    advance?.ok
    && (
      id === "operator_review"
      || id === "deliverable_review"
      || posture?.secondaryAction?.kind === "advance_implementation"
      || (posture?.choices || []).some((c) => c.kind === "advance_implementation")
    )
  ) {
    return "ready_implementation";
  }

  if (id === "deliverable_review" && reviewOpen) return "ready_close";

  if (posture?.needsYou) return "needs_attention";

  if (
    id === "waiting_dependency"
    || id === "paused"
    || id === "awaiting_kickoff"
    || id === "ready_to_start"
    || id === "idle_after_kickoff"
    || id === "interrupted_idle"
  ) {
    return "waiting";
  }

  if (posture?.busy || id === "executing" || id === "worker_silent") {
    if (id === "worker_silent" && !posture.needsYou) return "in_progress";
    if (posture?.busy) return "in_progress";
  }

  if (id === "operator_review") return "needs_attention";

  return posture?.busy ? "in_progress" : "waiting";
}

function ownerLine(posture, assignments = []) {
  if (posture?.busy) {
    const running = assignments.find((a) => ["running", "verification"].includes(a.status));
    if (running?.workerId) return running.workerId;
    return "Worker active";
  }
  if (posture?.needsYou) return "Director (you)";
  if (posture?.id === "blocked") return "Blocked — Director";
  const ready = assignments.find((a) => a.status === "ready");
  if (ready) return ready.workerId || "Queued";
  return "Unassigned";
}

function isStale(updatedAt, { days = 3 } = {}) {
  if (!updatedAt) return false;
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) > days * 24 * 60 * 60 * 1000;
}

/**
 * Enrich a mission row into a portfolio card (presentation).
 * Default path stays light (posture-derived). Pass `{ rich: true }` for focus cards.
 */
export function portfolioMissionCardVm(row, {
  posture = null,
  advance = null,
  confidence = null,
  continuation = null,
  rich = false,
} = {}) {
  const missionId = row.missionId || row.mission_id;
  const p = posture || deriveMissionPosture(missionId);
  const adv = advance ?? canAdvanceToImplementation(missionId);
  const mission = getMission(missionId);
  const openReview = getOpenDeliverableReview(missionId);
  const groupId = portfolioGroupForPosture(p, {
    advance: adv,
    mission,
    reviewOpen: Boolean(openReview?.operatorMayApprove),
  });
  const assignments = listAssignments(missionId);
  const openDecisions = listDecisions(missionId, { status: "open" });
  const proj = row.title ? row : projectMissionRow(missionId, mission);
  const title = proj.title || mission?.title || "Mission";
  const updatedAt = proj.updated_at || mission?.updated_at || null;
  const accepted = assignments.filter((a) => a.status === "complete").length;
  const total = assignments.length;
  const deliverablesLabel = total
    ? `${accepted} of ${total} assignments`
    : "No assignments yet";
  const phaseLabel = p.busy ? "Active phase" : (p.label || "No worker running");

  const blocker = p.id === "blocked"
    ? (p.detail || "An assignment is blocked.")
    : assignments.find((a) => a.status === "blocked")?.blocker?.message
      || (openDecisions[0] ? `Open decision: ${openDecisions[0].title}` : null);

  let recommendation = (p.needsYou ? p.next : null)
    || (adv?.ok ? "Begin Implementation" : null)
    || p.primaryAction?.label
    || "Watch progress";
  let nextAction = p.primaryAction
    || { kind: "open_mission", label: "Open mission", href: `missions/${missionId}`, missionId };

  if (rich) {
    const cont = continuation || missionContinuationVm(missionId, {
      choices: p.choices || [],
      posture: p,
      advance: adv,
    });
    recommendation = cont.recommended?.buttonLabel
      || cont.recommended?.title
      || recommendation;
    nextAction = cont.primaryAction || nextAction;
  }

  const conf = confidence || (rich ? getMissionConfidence(missionId) : null);
  const stale = isStale(updatedAt) && !p.busy && p.needsYou;

  return {
    kind: "portfolio_mission_card",
    missionId,
    title,
    groupId,
    groupLabel: GROUP_BY_ID[groupId]?.label || groupId,
    phase: phaseLabel,
    outcome: {
      label: p.label || "Status",
      sentence: p.detail || p.next || "",
      tone: p.id === "blocked" ? "blocked"
        : p.needsYou ? "caution"
          : p.busy ? "neutral"
            : (mission?.status === "completed" || mission?.archived ? "positive" : "neutral"),
    },
    recommendation,
    blocker,
    owner: ownerLine(p, assignments),
    confidence: {
      percent: conf?.percent ?? null,
      bandLabel: conf?.bandLabel || null,
    },
    nextAction: {
      kind: nextAction.kind,
      label: nextAction.label || recommendation,
      missionId,
      href: nextAction.href || `missions/${missionId}`,
      scrollTo: nextAction.scrollTo || null,
      reviewId: nextAction.reviewId || null,
    },
    postureId: p.id,
    statusLabel: p.label,
    needsYou: Boolean(p.needsYou),
    busy: Boolean(p.busy),
    stale,
    updatedAt,
    updatedLabel: relTime(updatedAt),
    workersLine: p.workersLine || null,
    deliverablesLabel,
    directorState: p.next,
    archived: mission?.archived === true,
    primaryAction: nextAction,
    secondaryAction: p.secondaryAction || null,
  };
}

/**
 * Priority score for "15 minutes — what first?" (higher = sooner).
 */
export function portfolioPriorityScore(card) {
  let score = 0;
  if (card.groupId === "needs_attention") score += 100;
  if (card.groupId === "blocked") score += 90;
  if (card.groupId === "ready_implementation") score += 80;
  if (card.groupId === "ready_close") score += 70;
  if (card.stale) score += 25;
  if (card.needsYou) score += 20;
  if (card.groupId === "waiting") score += 10;
  if (card.groupId === "in_progress") score += 5;
  // Fresher updates slightly preferred within a band
  const t = Date.parse(card.updatedAt || 0);
  if (Number.isFinite(t)) score += Math.min(10, Math.floor((Date.now() - t) / (6 * 3600_000)) * -1 + 5);
  return score;
}

/**
 * Compose Director Portfolio for Mission Control landing.
 */
export function directorPortfolioVm({ filter = "active" } = {}) {
  const includeHistory = filter === "archived" || filter === "history" || filter === "all";
  const allRows = listMissionsV2({ includeArchived: true });
  let rows;
  if (filter === "archived" || filter === "history") {
    rows = allRows.filter((r) => {
      const m = getMission(r.mission_id);
      return m?.archived === true || r.status === "completed";
    });
  } else if (filter === "all") {
    rows = allRows;
  } else {
    // Active portfolio: live missions + a short recently-finished strip
    const active = allRows.filter((r) => {
      const m = getMission(r.mission_id);
      return m?.archived !== true && r.status !== "completed";
    });
    const finished = allRows
      .filter((r) => {
        const m = getMission(r.mission_id);
        return m?.archived === true || r.status === "completed";
      })
      .sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0))
      .slice(0, 5);
    const seen = new Set();
    rows = [];
    for (const r of [...active, ...finished]) {
      const id = r.mission_id || r.missionId;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(r);
    }
  }

  const cards = rows.map((r) => portfolioMissionCardVm(r, { rich: false }));
  cards.sort((a, b) => portfolioPriorityScore(b) - portfolioPriorityScore(a));

  // Enrich only the focus strip with continuation + confidence (15-minute lane).
  const focusIds = new Set(cards.filter((c) => c.groupId !== "completed_recently").slice(0, 5).map((c) => c.missionId));
  for (let i = 0; i < cards.length; i += 1) {
    if (!focusIds.has(cards[i].missionId)) continue;
    cards[i] = portfolioMissionCardVm(
      { mission_id: cards[i].missionId, missionId: cards[i].missionId, title: cards[i].title, updated_at: cards[i].updatedAt },
      { rich: true },
    );
  }
  cards.sort((a, b) => portfolioPriorityScore(b) - portfolioPriorityScore(a));

  const byGroup = new Map(PORTFOLIO_GROUPS.map((g) => [g.id, []]));
  for (const c of cards) {
    if (!byGroup.has(c.groupId)) byGroup.set(c.groupId, []);
    byGroup.get(c.groupId).push(c);
  }

  const groups = PORTFOLIO_GROUPS
    .map((g) => ({
      ...g,
      count: (byGroup.get(g.id) || []).length,
      missions: byGroup.get(g.id) || [],
    }))
    .filter((g) => g.count > 0 || ["needs_attention", "blocked", "in_progress"].includes(g.id));

  const counts = {
    active: cards.filter((c) => c.groupId !== "completed_recently").length,
    needsAttention: (byGroup.get("needs_attention") || []).length,
    blocked: (byGroup.get("blocked") || []).length,
    waiting: (byGroup.get("waiting") || []).length,
    inProgress: (byGroup.get("in_progress") || []).length,
    readyImplementation: (byGroup.get("ready_implementation") || []).length,
    readyClose: (byGroup.get("ready_close") || []).length,
    completedRecently: (byGroup.get("completed_recently") || []).length,
  };

  const focus = cards
    .filter((c) => c.groupId !== "completed_recently")
    .slice(0, 5);

  const focusLead = counts.needsAttention
    ? `${counts.needsAttention} need${counts.needsAttention === 1 ? "s" : ""} you`
    : counts.blocked
      ? `${counts.blocked} blocked`
      : counts.readyImplementation
        ? `${counts.readyImplementation} ready to implement`
        : "Nothing urgent — review progress";

  const needsInbox = cards
    .filter((c) => c.needsYou)
    .slice(0, 8)
    .map((c) => ({
      title: c.recommendation || c.directorState || c.statusLabel,
      missionId: c.missionId,
      missionTitle: c.title,
      urgency: c.stale ? "Stale" : "Needs you",
      type: c.postureId,
      primaryAction: c.nextAction,
    }));

  const portfolioBase = {
    kind: "director_portfolio",
    filter: filter || "active",
    sectionTitle: "Director Portfolio",
    focusLead,
    focusQuestion: "If you only have 15 minutes — start here.",
    counts,
    groups,
    focus,
    needsInbox,
    cards,
    empty: cards.length === 0,
    emptyState: cards.length === 0
      ? {
          title: includeHistory ? "No history yet" : "No active missions",
          body: includeHistory
            ? "Certified and archived missions will appear here."
            : "Create a Mission Brief to start work. The Portfolio becomes your home as missions accumulate.",
          primaryAction: { kind: "nav", label: "Create Mission", href: "kickoff" },
        }
      : null,
  };

  return {
    ...portfolioBase,
    // DX-8 — action inbox over the same cards (Portfolio unchanged).
    commandCenter: executiveCommandCenterVm(portfolioBase),
  };
}
