/**
 * Vacilando — Mission timeline (Director Execution System V2 §13).
 *
 * Append-only JSONL system of record for meaningful mission state changes.
 * Mission Detail / Director summaries should prefer timeline + brief state over
 * asking the live worker (§23).
 *
 * Persistence: ~/.local/state/alloy-dev/vacilando/timeline/<missionId>.jsonl
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "timeline");

export const TIMELINE_EVENT_TYPES = new Set([
  "mission_created",
  "mission_started",
  "phase_started",
  "phase_completed",
  "assignment_started",
  "assignment_completed",
  "deliverable_verified",
  "deliverable_accepted",
  "deliverable_changes_requested",
  "discovery",
  "progress",
  "blocker",
  "decision_requested",
  "decision_answered",
  "operator_message",
  "director_response",
  "improvement_captured",
  "worker_health",
  "recovery",
  "commit",
  "validation",
  "evidence_added",
  "mission_completed",
  "context_invalidated",
  "resource_claim",
  "resource_release",
  "mission_archived",
  "mission_restored",
  "mission_compiled",
  "compilation_reuse",
  "compilation_conflict",
  "compilation_ready",
  "compilation_blocked",
  "compilation_decision",
  "director_execution_started",
]);

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function fileFor(missionId) {
  return join(DIR, `${missionId}.jsonl`);
}

/**
 * Append a timeline event. Returns the durable record.
 * `visibility` defaults to "summary" for kickoff/approve/phase transitions.
 */
export function appendTimelineEvent(missionId, {
  type,
  summary,
  headline = null,
  visibility = "summary",
  phaseId = null,
  assignmentId = null,
  decisionId = null,
  evidenceIds = null,
  actor = "system",
  detail = null,
  nowMs,
} = {}) {
  if (!missionId) throw new Error("timeline_requires_mission_id");
  if (!TIMELINE_EVENT_TYPES.has(type)) throw new Error(`timeline_unknown_type:${type}`);
  const now = nowMs ?? Date.now();
  const event_id = "tle_" + createHash("sha256").update(`${missionId}:${type}:${now}:${Math.random()}`).digest("hex").slice(0, 16);
  const rec = {
    schema_version: "vacilando.timeline_event.v1",
    event_id,
    mission_id: missionId,
    type,
    headline: headline || String(summary || "").trim() || type,
    summary: String(summary || "").trim() || type,
    visibility,
    phase_id: phaseId,
    assignment_id: assignmentId,
    decision_id: decisionId,
    evidence_ids: Array.isArray(evidenceIds) ? evidenceIds : null,
    actor,
    detail: detail && typeof detail === "object" ? detail : null,
    at: iso(now),
    occurred_at: iso(now),
  };
  ensureDir();
  appendFileSync(fileFor(missionId), JSON.stringify(rec) + "\n", "utf8");
  return rec;
}

/** Read all timeline events for a mission (oldest first). */
export function readTimeline(missionId, { limit = 500 } = {}) {
  if (!missionId) return [];
  let lines = [];
  try {
    lines = readFileSync(fileFor(missionId), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch { /* skip */ }
  }
  return out.slice(Math.max(0, out.length - limit));
}

/** Summary-visibility events only (for Mission Detail / Director strip). */
export function readTimelineSummary(missionId, { limit = 50 } = {}) {
  return readTimeline(missionId, { limit: 1000 })
    .filter((e) => e.visibility === "summary" || e.visibility == null)
    .slice(-limit);
}

/** Prefer structured timeline for a short Director status line (§16 / §23). */
export function summarizeFromTimeline(missionId) {
  const events = readTimelineSummary(missionId, { limit: 20 });
  if (!events.length) return null;
  const last = events[events.length - 1];
  return {
    latest_summary: last.summary,
    latest_type: last.type,
    latest_at: last.at,
    event_count: events.length,
  };
}
