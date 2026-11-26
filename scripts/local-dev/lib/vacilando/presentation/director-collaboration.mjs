/**
 * Director Experience V2 — DX-6 Director Collaboration (presentation).
 *
 * Executive notes over the mission-scoped collaboration store, plus projected
 * answered decisions for institutional memory. Not chat bubbles.
 */
import {
  listCollaboration,
  COLLABORATION_TYPE_LABELS,
  COLLABORATION_STATUS_LABELS,
  COLLABORATION_TYPES,
  COLLABORATION_STATUSES,
} from "../mission-collaboration.mjs";
import { listDecisions } from "../decisions.mjs";

function formatWhen(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (!Number.isFinite(d.getTime())) return String(isoStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function openStatuses(status) {
  return status === "open" || status === "addressed";
}

/**
 * Project durable decision records into collaboration presentation cards
 * (read-only — does not write into the collaboration store).
 */
export function projectDecisionsAsCollaboration(missionId) {
  const out = [];
  for (const d of listDecisions(missionId, { status: null })) {
    const answered = d.status === "answered" || d.chosen_option_id || d.response;
    const status = answered ? "accepted" : "open";
    const chosen = (d.options || []).find((o) => (o.optionId || o.id) === d.chosen_option_id);
    const body = [
      d.recommendationReason || d.situation || "",
      chosen ? `Chosen: ${chosen.label}` : (d.recommendation ? `Recommendation: ${d.recommendation}` : ""),
      d.response ? `Director response: ${String(d.response).slice(0, 280)}` : "",
    ].filter(Boolean).join("\n\n").trim() || d.title;
    out.push({
      id: `decision:${d.decisionId}`,
      missionId,
      type: "decision",
      typeLabel: "Decision",
      status,
      statusLabel: COLLABORATION_STATUS_LABELS[status],
      title: d.title || "Product decision",
      body: body.slice(0, 800),
      author: d.created_by || "director",
      at: d.answered_at || d.created_at || null,
      recordedLabel: formatWhen(d.answered_at || d.created_at),
      deliverableId: null,
      deliverableLabel: null,
      source: "decision_runtime",
      projected: true,
      open: openStatuses(status),
      statusActions: [],
    });
  }
  return out;
}

function presentEntry(entry) {
  const type = entry.type;
  const status = entry.status;
  return {
    id: entry.id,
    missionId: entry.missionId,
    type,
    typeLabel: COLLABORATION_TYPE_LABELS[type] || type,
    status,
    statusLabel: COLLABORATION_STATUS_LABELS[status] || status,
    title: entry.title || COLLABORATION_TYPE_LABELS[type] || "Collaboration",
    body: entry.body,
    author: entry.author,
    at: entry.at,
    updatedAt: entry.updatedAt || entry.at,
    recordedLabel: formatWhen(entry.at),
    deliverableId: entry.deliverableId || null,
    deliverableLabel: entry.deliverableLabel || null,
    relatedEntryId: entry.relatedEntryId || null,
    source: entry.source || "director_collaboration",
    projected: false,
    open: openStatuses(status),
    statusHistory: entry.statusHistory || [],
    statusActions: projectedStatusActions(status),
  };
}

function projectedStatusActions(status) {
  const transitions = {
    open: ["addressed", "accepted", "rejected", "resolved"],
    addressed: ["accepted", "rejected", "resolved", "superseded"],
    accepted: ["superseded", "resolved"],
    rejected: ["superseded", "open"],
    superseded: [],
    resolved: [],
  };
  return (transitions[status] || []).map((s) => ({
    status: s,
    label: COLLABORATION_STATUS_LABELS[s],
  }));
}

/**
 * Full collaboration section VM for Mission Dashboard.
 */
export function directorCollaborationVm(missionId, { includeProjectedDecisions = true } = {}) {
  const stored = listCollaboration(missionId).map(presentEntry);
  const projected = includeProjectedDecisions
    ? projectDecisionsAsCollaboration(missionId)
    : [];
  // Prefer stored entries; add projected decisions not already mirrored by title+time
  const cards = [...stored];
  for (const p of projected) {
    const dup = stored.some((s) => s.type === "decision" && s.title === p.title
      && Math.abs(Date.parse(s.at || 0) - Date.parse(p.at || 0)) < 60_000);
    if (!dup) cards.push(p);
  }
  cards.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));

  const open = cards.filter((c) => c.open);
  const resolved = cards.filter((c) => !c.open);
  const unresolvedRevision = cards.filter((c) => c.type === "revision_request" && c.open);
  const acceptedGuidance = cards.filter((c) =>
    (c.type === "implementation_guidance" || c.type === "feedback") && c.status === "accepted");
  const rejectedGuidance = cards.filter((c) =>
    (c.type === "implementation_guidance" || c.type === "feedback") && c.status === "rejected");

  return {
    kind: "director_collaboration",
    missionId,
    sectionTitle: "Director Collaboration",
    empty: cards.length === 0,
    emptyMessage: "No collaboration recorded yet. Provide Feedback or record a Decision to start institutional memory for this initiative.",
    cards,
    open,
    resolved,
    unresolvedRevision,
    acceptedGuidance,
    rejectedGuidance,
    summary: {
      total: cards.length,
      open: open.length,
      resolved: resolved.length,
      revisionOpen: unresolvedRevision.length,
    },
    composeTypes: COLLABORATION_TYPES.map((t) => ({
      id: t,
      label: COLLABORATION_TYPE_LABELS[t],
    })),
    statuses: COLLABORATION_STATUSES.map((s) => ({
      id: s,
      label: COLLABORATION_STATUS_LABELS[s],
    })),
    composer: {
      title: "Add collaboration",
      blurb: "Persistent executive guidance for this mission — not a chat thread. What you record becomes part of the initiative’s memory.",
      placeholder: "Example: Use canonical Person identity. Do not duplicate parent identities. Simplify the role editor before implementation.",
      defaultType: "feedback",
      defaultStatus: "open",
    },
  };
}

/** Compact L1 strip after Recommended Next Action. */
export function collaborationStripVm(missionId) {
  const full = directorCollaborationVm(missionId);
  const preview = full.cards.slice(-3).reverse();
  return {
    kind: "collaboration_strip",
    missionId,
    sectionTitle: "Director Collaboration",
    empty: full.empty,
    openCount: full.summary.open,
    totalCount: full.summary.total,
    revisionOpen: full.summary.revisionOpen,
    preview,
    headline: full.empty
      ? "No guidance recorded yet"
      : full.summary.open
        ? `${full.summary.open} open · ${full.summary.total} total`
        : `${full.summary.total} recorded · all addressed`,
  };
}
