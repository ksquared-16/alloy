/**
 * Vacilando — Mission archive (preserve history, hide from active work).
 *
 * Archived missions remain fully inspectable (timeline, evidence, decisions,
 * sessions, improvements). They are excluded from the default Missions list,
 * Needs Me, and active worker/usage rollups.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { getMission, updateMission, readMissions } from "./commands/missions.mjs";
import { getBrief } from "./mission-brief.mjs";
import { appendTimelineEvent } from "./timeline.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const ARCHIVE_DIR = join(RUNTIME_ROOT, "vacilando", "mission-archive");
const INDEX_FILE = join(ARCHIVE_DIR, "index.json");

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

export const ARCHIVE_CLASSES = Object.freeze([
  "runtime_validation",
  "superseded_draft",
  "accepted_certification_record",
  "demo_seed",
  "recovery_validation",
  "mock_provider_proof",
]);

function ensureDir() {
  if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
}

function readIndex() {
  try {
    return JSON.parse(readFileSync(INDEX_FILE, "utf8"));
  } catch {
    return { schema_version: "vacilando.mission_archive_index.v1", entries: [] };
  }
}

function writeIndex(idx) {
  ensureDir();
  writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2));
  return idx;
}

export function isMissionArchived(missionId) {
  if (!missionId) return false;
  const m = getMission(missionId);
  if (m?.archived === true) return true;
  const idx = readIndex();
  return (idx.entries || []).some((e) => e.missionId === missionId && e.status === "archived");
}

export function getArchiveEntry(missionId) {
  return (readIndex().entries || []).find((e) => e.missionId === missionId) || null;
}

/**
 * Archive a mission (non-destructive). Preserves all durable artifacts.
 */
export function archiveMission(missionId, {
  reason = "Runtime validation history",
  archiveClass = "runtime_validation",
  classification = null,
  actor = "director",
  nowMs,
} = {}) {
  if (!missionId) throw new Error("archive_requires_mission_id");
  const brief = getBrief(missionId);
  const mission = getMission(missionId);
  const title = brief?.title || mission?.title || missionId;
  const entry = {
    missionId,
    title,
    archiveClass: ARCHIVE_CLASSES.includes(archiveClass) ? archiveClass : "runtime_validation",
    classification: classification || archiveClass,
    reason: String(reason || "").trim(),
    status: "archived",
    readOnly: true,
    archived_at: iso(nowMs),
    archived_by: actor,
    prior_status: mission?.status || null,
    prior_kickoff_status: mission?.kickoff_status || null,
    contentHash: brief?.contentHash || null,
  };

  updateMission(missionId, {
    archived: true,
    archived_at: entry.archived_at,
    archive_reason: entry.reason,
    archive_class: entry.archiveClass,
    archive_read_only: true,
  }, { nowMs });

  const idx = readIndex();
  idx.entries = (idx.entries || []).filter((e) => e.missionId !== missionId);
  idx.entries.unshift(entry);
  writeIndex(idx);

  try {
    appendTimelineEvent(missionId, {
      type: "mission_archived",
      headline: "Mission archived",
      summary: `Archived for history — ${entry.reason}`,
      visibility: "summary",
      actor,
      detail: { archiveClass: entry.archiveClass, classification: entry.classification },
      nowMs,
    });
  } catch { /* timeline optional */ }

  ensureDir();
  writeFileSync(join(ARCHIVE_DIR, `${missionId}.json`), JSON.stringify(entry, null, 2));
  return entry;
}

export function restoreMission(missionId, { actor = "operator", nowMs } = {}) {
  if (!missionId) throw new Error("restore_requires_mission_id");
  const entry = getArchiveEntry(missionId);
  updateMission(missionId, {
    archived: false,
    archived_at: null,
    archive_reason: null,
    archive_class: null,
    archive_read_only: false,
    status: entry?.prior_status && entry.prior_status !== "interrupted"
      ? entry.prior_status
      : "stopped",
  }, { nowMs });
  const idx = readIndex();
  idx.entries = (idx.entries || []).map((e) =>
    e.missionId === missionId
      ? { ...e, status: "restored", restored_at: iso(nowMs), restored_by: actor }
      : e);
  writeIndex(idx);
  try {
    appendTimelineEvent(missionId, {
      type: "mission_restored",
      headline: "Mission restored to active work",
      summary: "Operator restored this mission from archive",
      visibility: "summary",
      actor,
      nowMs,
    });
  } catch { /* */ }
  return { ok: true, missionId };
}

export function listArchivedMissions({ limit = 200 } = {}) {
  const idx = readIndex();
  return (idx.entries || [])
    .filter((e) => e.status === "archived")
    .slice(0, limit);
}

/** Classify Access & Identity / runtime validation missions for closeout. */
export function classifyMissionForCloseout(missionId) {
  const brief = getBrief(missionId);
  const mission = getMission(missionId);
  const title = `${brief?.title || mission?.title || ""} ${brief?.objective || ""}`.toLowerCase();
  const id = missionId || "";

  if (/untitled|validation sprint|kickoff preview|demo/.test(title)) {
    return {
      classification: "runtime_validation",
      archiveClass: "demo_seed",
      reason: "Demo / kickoff / untitled validation mission",
    };
  }
  if (/operational closeout|claude provider|certification|director certification|runtime/.test(title)) {
    return {
      classification: "accepted_certification_record",
      archiveClass: "accepted_certification_record",
      reason: "Runtime / Claude Provider certification mission",
    };
  }
  if (/access\s*&\s*identity|access and identity|authority path|authority model|identity roles/.test(title)) {
    return {
      classification: "runtime_validation",
      archiveClass: "runtime_validation",
      reason: "Access & Identity proof / seeded validation — not active production",
    };
  }
  if (/access\s*&\s*roles|access and roles/.test(title)) {
    return {
      classification: "superseded_draft",
      archiveClass: "superseded_draft",
      reason: "Earlier Access & Roles workstream — superseded for Runtime V1 closeout",
    };
  }
  if (mission?.archived) {
    return { classification: "accepted_certification_record", archiveClass: mission.archive_class || "runtime_validation", reason: mission.archive_reason || "Already archived" };
  }
  return { classification: "ambiguous", archiveClass: "runtime_validation", reason: `Ambiguous — archived for clean active workspace (${id})` };
}

function looksLikeValidationMission(missionId) {
  const brief = getBrief(missionId);
  const mission = getMission(missionId);
  const t = `${brief?.title || mission?.title || ""} ${brief?.objective || mission?.objective || ""}`.toLowerCase();
  return /access|identity|authority|roles|kickoff preview|untitled|certification|demo|closeout|claude provider|validation sprint|runtime validation|mission dashboard|continuous improvement/.test(t);
}

/**
 * Archive validation / certification / demo missions only. Never deletes.
 * Does not archive unrelated real Alloy missions (ambiguous titles stay active).
 */
export function archiveValidationMissionsForCloseout({ actor = "director", nowMs } = {}) {
  const briefDir = join(RUNTIME_ROOT, "vacilando", "mission-briefs");
  const ids = new Set();
  if (existsSync(briefDir)) {
    for (const name of readdirSync(briefDir).filter((n) => n.endsWith(".json"))) {
      const id = name.replace(/\.json$/, "");
      if (looksLikeValidationMission(id)) ids.add(id);
    }
  }
  for (const m of readMissions(null, 1000)) {
    if (looksLikeValidationMission(m.mission_id)) ids.add(m.mission_id);
  }

  const archived = [];
  const skipped = [];
  for (const id of ids) {
    if (isMissionArchived(id)) {
      skipped.push({ missionId: id, reason: "already_archived" });
      continue;
    }
    if (!getMission(id) && !getBrief(id)) {
      skipped.push({ missionId: id, reason: "missing" });
      continue;
    }
    const cls = classifyMissionForCloseout(id);
    if (cls.classification === "ambiguous" && !looksLikeValidationMission(id)) {
      skipped.push({ missionId: id, reason: "ambiguous_not_validation", classification: cls.classification });
      continue;
    }
    const entry = archiveMission(id, {
      reason: cls.reason,
      archiveClass: cls.archiveClass,
      classification: cls.classification,
      actor,
      nowMs,
    });
    archived.push(entry);
  }
  return { ok: true, archived, skipped, count: archived.length };
}

export function archiveInventoryHash(entries) {
  const payload = JSON.stringify(entries.map((e) => ({ id: e.missionId, class: e.archiveClass, at: e.archived_at })));
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
