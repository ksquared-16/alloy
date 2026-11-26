/**
 * Vacilando V3-2 — deterministic Context Compression ("Since your last visit").
 * Adapter over projected timeline + Current State — not an LLM summary.
 * Every line keeps provenance. Unknowns stay unknown.
 */
import { readTimeline } from "../timeline.mjs";
import { getWorkspaceLastSeen } from "./workspace-last-seen.mjs";

const MATERIAL_TYPES = new Set([
  "assignment_started",
  "assignment_completed",
  "deliverable_verified",
  "deliverable_accepted",
  "deliverable_changes_requested",
  "decision_requested",
  "decision_answered",
  "blocker",
  "recovery",
  "validation",
  "evidence_added",
  "mission_completed",
  "mission_archived",
  "commit",
  "phase_started",
  "phase_completed",
  "operator_message",
  "director_response",
]);

function isMaterial(e) {
  if (!e || e.visibility === "debug") return false;
  if (["resource_claim", "resource_release", "context_invalidated", "worker_health", "progress"].includes(e.type)) {
    return false;
  }
  return MATERIAL_TYPES.has(e.type) || e.visibility === "summary";
}

function indexOfLastSeen(events, lastSeen) {
  if (!lastSeen?.eventId && !lastSeen?.at) return -1;
  if (lastSeen.eventId) {
    const i = events.findIndex((e) => e.event_id === lastSeen.eventId);
    if (i >= 0) return i;
  }
  if (lastSeen.at) {
    const t = Date.parse(lastSeen.at);
    if (!Number.isNaN(t)) {
      let idx = -1;
      for (let i = 0; i < events.length; i++) {
        const et = Date.parse(events[i].at || events[i].occurred_at || 0);
        if (!Number.isNaN(et) && et <= t) idx = i;
        else if (!Number.isNaN(et) && et > t) break;
      }
      return idx;
    }
  }
  return -1;
}

function line(text, provenance) {
  return {
    text: String(text).slice(0, 220),
    provenance: provenance || { source: "derived" },
  };
}

/**
 * Build deterministic compression for a workspace since last-seen.
 * @param {object} opts.currentState derived Current State
 * @param {string|null} opts.lastSeenEventId override for tests
 */
export function composeSinceLastVisit(missionId, {
  workspaceId,
  operatorId = "kelly",
  currentState = null,
  lastSeen: lastSeenOverride = undefined,
  events: eventsOverride = null,
} = {}) {
  const lastSeen = lastSeenOverride === undefined
    ? getWorkspaceLastSeen(workspaceId, { operatorId })
    : lastSeenOverride;

  const events = eventsOverride || readTimeline(missionId, { limit: 5000 });
  const firstVisit = !lastSeen?.eventId && !lastSeen?.at;

  if (firstVisit) {
    const lines = [];
    if (currentState?.lastCompleted && currentState.lastCompleted !== "—") {
      lines.push(line(`Last completed: ${currentState.lastCompleted}`, {
        source: "current_state", field: "lastCompleted",
      }));
    }
    if (currentState?.workingOn) {
      lines.push(line(`Working on: ${currentState.workingOn}`, {
        source: "current_state", field: "workingOn",
      }));
    }
    if (currentState?.blockedBy && currentState.blockedBy !== "Nothing") {
      lines.push(line(`Blocked by: ${currentState.blockedBy}`, {
        source: "current_state", field: "blockedBy",
      }));
    } else {
      lines.push(line("No active blocker", { source: "current_state", field: "blockedBy" }));
    }
    if (currentState?.recommendation) {
      lines.push(line(`Recommended next action: ${currentState.recommendation}`, {
        source: "current_state", field: "recommendation",
      }));
    }
    return {
      kind: "since_last_visit",
      title: "Since your last visit",
      firstVisit: true,
      material: lines.length > 0,
      lastSeen: null,
      lines: lines.length
        ? lines
        : [line("First open — no prior visit marker yet.", { source: "last_seen", note: "absent" })],
      recommendation: currentState?.recommendation || null,
    };
  }

  const cut = indexOfLastSeen(events, lastSeen);
  const since = cut >= 0 ? events.slice(cut + 1) : events.slice(-80);
  const material = since.filter(isMaterial);

  const completed = material.filter((e) =>
    ["assignment_completed", "deliverable_accepted", "phase_completed", "mission_completed"].includes(e.type));
  const started = material.filter((e) =>
    ["assignment_started", "phase_started", "mission_started"].includes(e.type));
  const decisions = material.filter((e) =>
    ["decision_requested", "decision_answered"].includes(e.type));
  const blockers = material.filter((e) => e.type === "blocker" || e.type === "recovery");
  const certs = material.filter((e) =>
    ["validation", "deliverable_verified", "evidence_added"].includes(e.type));
  const commits = material.filter((e) => e.type === "commit");

  const lines = [];
  for (const e of completed.slice(-3)) {
    lines.push(line(e.headline || e.summary || "Completed work", {
      source: "timeline", eventId: e.event_id, type: e.type,
    }));
  }
  for (const e of started.slice(-2)) {
    lines.push(line(e.headline || e.summary || "Work started", {
      source: "timeline", eventId: e.event_id, type: e.type,
    }));
  }
  for (const e of decisions.slice(-3)) {
    lines.push(line(e.headline || e.summary || "Decision recorded", {
      source: "timeline", eventId: e.event_id, type: e.type,
    }));
  }
  for (const e of blockers.slice(-2)) {
    lines.push(line(e.headline || e.summary || (e.type === "recovery" ? "Blocker resolved" : "Blocker"), {
      source: "timeline", eventId: e.event_id, type: e.type,
    }));
  }
  for (const e of certs.slice(-2)) {
    lines.push(line(e.headline || e.summary || "Evidence / validation", {
      source: "timeline", eventId: e.event_id, type: e.type,
    }));
  }
  for (const e of commits.slice(-2)) {
    lines.push(line(e.headline || e.summary || "Commit", {
      source: "timeline", eventId: e.event_id, type: e.type,
    }));
  }

  if (currentState?.blockedBy && currentState.blockedBy !== "Nothing") {
    lines.push(line(`Blocked by: ${currentState.blockedBy}`, {
      source: "current_state", field: "blockedBy",
    }));
  } else if (!blockers.length) {
    lines.push(line("No active blocker", { source: "current_state", field: "blockedBy" }));
  }

  if (currentState?.workingOn) {
    lines.push(line(`Now: ${currentState.workingOn}`, {
      source: "current_state", field: "workingOn",
    }));
  }

  if (currentState?.recommendation) {
    lines.push(line(`Recommended next action: ${currentState.recommendation}`, {
      source: "current_state", field: "recommendation",
    }));
  }

  const hasMaterialDelta = completed.length + started.length + decisions.length
    + blockers.length + certs.length + commits.length > 0;

  if (!hasMaterialDelta) {
    return {
      kind: "since_last_visit",
      title: "Since your last visit",
      firstVisit: false,
      material: false,
      lastSeen,
      lines: [line("No material changes since your last visit.", {
        source: "compression", note: "no_material_delta",
      })],
      recommendation: currentState?.recommendation || null,
    };
  }

  // Dedupe identical texts while keeping first provenance
  const seen = new Set();
  const deduped = [];
  for (const l of lines) {
    const k = l.text.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(l);
  }

  return {
    kind: "since_last_visit",
    title: "Since your last visit",
    firstVisit: false,
    material: true,
    lastSeen,
    lines: deduped.slice(0, 10),
    recommendation: currentState?.recommendation || null,
  };
}
