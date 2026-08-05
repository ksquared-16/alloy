/**
 * Vacilando — Mission Director Collaboration (DX-6).
 *
 * Persistent executive guidance attached to a mission — not chat, not Slack,
 * not realtime messaging. Append-oriented store with auditable status changes.
 *
 * Does not change mission lifecycle, workers, certification engine, or confidence.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { appendTimelineEvent } from "./timeline.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "collaboration");

export const COLLABORATION_TYPES = Object.freeze([
  "feedback",
  "decision",
  "question",
  "clarification",
  "approval_note",
  "implementation_guidance",
  "revision_request",
  "information",
]);

export const COLLABORATION_STATUSES = Object.freeze([
  "open",
  "addressed",
  "accepted",
  "rejected",
  "superseded",
  "resolved",
]);

export const COLLABORATION_TYPE_LABELS = Object.freeze({
  feedback: "Feedback",
  decision: "Decision",
  question: "Question",
  clarification: "Clarification",
  approval_note: "Approval Note",
  implementation_guidance: "Implementation Guidance",
  revision_request: "Revision Request",
  information: "Information",
});

export const COLLABORATION_STATUS_LABELS = Object.freeze({
  open: "Open",
  addressed: "Addressed",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Superseded",
  resolved: "Resolved",
});

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function storePath(missionId) {
  return join(DIR, `${missionId}.json`);
}

function auditPath(missionId) {
  return join(DIR, `${missionId}.audit.jsonl`);
}

function readStore(missionId) {
  try {
    return JSON.parse(readFileSync(storePath(missionId), "utf8"));
  } catch {
    return {
      schema_version: "vacilando.collaboration.v1",
      mission_id: missionId,
      entries: [],
    };
  }
}

function writeStore(store) {
  ensureDir();
  writeFileSync(storePath(store.mission_id), JSON.stringify(store, null, 2));
  return store;
}

function audit(missionId, event) {
  ensureDir();
  appendFileSync(auditPath(missionId), `${JSON.stringify(event)}\n`);
}

function normalizeType(type) {
  const t = String(type || "feedback").trim().toLowerCase().replace(/\s+/g, "_");
  if (COLLABORATION_TYPES.includes(t)) return t;
  const aliases = {
    provide_feedback: "feedback",
    guidance: "implementation_guidance",
    impl_guidance: "implementation_guidance",
    revision: "revision_request",
    request_revision: "revision_request",
    approve_note: "approval_note",
    approval: "approval_note",
    note: "information",
  };
  if (aliases[t]) return aliases[t];
  throw new Error(`collaboration_unknown_type:${type}`);
}

function normalizeStatus(status) {
  const s = String(status || "open").trim().toLowerCase();
  if (COLLABORATION_STATUSES.includes(s)) return s;
  throw new Error(`collaboration_unknown_status:${status}`);
}

function newEntryId(missionId) {
  return `col_${createHash("sha256")
    .update(`${missionId}:${Date.now()}:${randomBytes(6).toString("hex")}`)
    .digest("hex")
    .slice(0, 16)}`;
}

/**
 * Create a collaboration entry. Mission-scoped; optional deliverable binding.
 */
export function createCollaborationEntry({
  missionId,
  type = "feedback",
  body,
  author = "director",
  status = "open",
  deliverableId = null,
  deliverableLabel = null,
  title = null,
  relatedEntryId = null,
  source = "director_collaboration",
  nowMs,
} = {}) {
  if (!missionId) throw new Error("collaboration_requires_mission_id");
  const text = String(body || "").trim();
  if (!text) throw new Error("collaboration_requires_body");
  const entryType = normalizeType(type);
  const entryStatus = normalizeStatus(status);
  const at = iso(nowMs);
  const entry = {
    schema_version: "vacilando.collaboration_entry.v1",
    id: newEntryId(missionId),
    missionId,
    type: entryType,
    status: entryStatus,
    title: String(title || COLLABORATION_TYPE_LABELS[entryType] || "Collaboration").trim(),
    body: text.slice(0, 4000),
    author: String(author || "director").trim() || "director",
    at,
    updatedAt: at,
    deliverableId: deliverableId || null,
    deliverableLabel: deliverableLabel || null,
    relatedEntryId: relatedEntryId || null,
    source,
    statusHistory: [{ status: entryStatus, at, actor: author }],
  };

  const store = readStore(missionId);
  store.entries.push(entry);
  writeStore(store);
  audit(missionId, {
    event: "create",
    at,
    actor: author,
    entry_id: entry.id,
    type: entry.type,
    status: entry.status,
  });
  try {
    appendTimelineEvent(missionId, {
      type: "collaboration_recorded",
      headline: `${COLLABORATION_TYPE_LABELS[entry.type] || "Collaboration"} recorded`,
      detail: entry.body.slice(0, 180),
      collaborationId: entry.id,
      collaborationType: entry.type,
    });
  } catch {
    /* timeline is best-effort */
  }
  return entry;
}

/**
 * Update status on an existing entry. Audited; does not invent lifecycle states.
 */
export function updateCollaborationStatus(missionId, entryId, status, {
  actor = "director",
  note = null,
  nowMs,
} = {}) {
  if (!missionId || !entryId) return { ok: false, error: "missing_ids" };
  const next = normalizeStatus(status);
  const store = readStore(missionId);
  const entry = store.entries.find((e) => e.id === entryId);
  if (!entry) return { ok: false, error: "not_found" };
  const at = iso(nowMs);
  const prev = entry.status;
  entry.status = next;
  entry.updatedAt = at;
  entry.statusHistory = Array.isArray(entry.statusHistory) ? entry.statusHistory : [];
  entry.statusHistory.push({
    status: next,
    at,
    actor,
    note: note ? String(note).slice(0, 500) : null,
    from: prev,
  });
  writeStore(store);
  audit(missionId, {
    event: "status_change",
    at,
    actor,
    entry_id: entryId,
    from: prev,
    to: next,
    note: note || null,
  });
  return { ok: true, entry };
}

/** List collaboration entries for a mission (chronological). */
export function listCollaboration(missionId, { status = null, type = null, limit = 200 } = {}) {
  if (!missionId) return [];
  let entries = readStore(missionId).entries || [];
  if (status) entries = entries.filter((e) => e.status === status);
  if (type) entries = entries.filter((e) => e.type === type);
  entries = [...entries].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  if (limit > 0 && entries.length > limit) return entries.slice(-limit);
  return entries;
}

export function getCollaborationEntry(missionId, entryId) {
  return listCollaboration(missionId).find((e) => e.id === entryId) || null;
}

export function listCollaborationAudit(missionId, { limit = 100 } = {}) {
  try {
    const lines = readFileSync(auditPath(missionId), "utf8").split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
