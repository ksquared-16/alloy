/**
 * Vacilando V3-2 — workspace last-seen markers (operator × workspace).
 * Does not mutate mission history. Smallest durable marker for
 * deterministic "Since your last visit" compression.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "workspace-last-seen");

const DEFAULT_OPERATOR = "kelly";

function safeId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "unknown";
}

function fileFor(operatorId, workspaceId) {
  return join(DIR, safeId(operatorId), `${safeId(workspaceId)}.json`);
}

export function getWorkspaceLastSeen(workspaceId, { operatorId = DEFAULT_OPERATOR } = {}) {
  const ws = String(workspaceId || "").trim();
  if (!ws) return null;
  const file = fileFor(operatorId, ws);
  try {
    if (!existsSync(file)) return null;
    const rec = JSON.parse(readFileSync(file, "utf8"));
    if (!rec || typeof rec !== "object") return null;
    return {
      kind: "workspace_last_seen",
      workspaceId: rec.workspaceId || ws,
      operatorId: rec.operatorId || operatorId,
      eventId: rec.eventId || null,
      at: rec.at || null,
      updatedAt: rec.updatedAt || null,
    };
  } catch {
    return null;
  }
}

/**
 * Persist last successfully viewed message/event position.
 * Non-authoritative for mission progress — operator resume marker only.
 */
export function setWorkspaceLastSeen(workspaceId, {
  eventId = null,
  at = null,
  operatorId = DEFAULT_OPERATOR,
} = {}) {
  const ws = String(workspaceId || "").trim();
  if (!ws) return { ok: false, error: "missing_workspace_id" };
  const eid = eventId ? String(eventId) : null;
  if (!eid && !at) return { ok: false, error: "missing_position" };

  const dir = join(DIR, safeId(operatorId));
  mkdirSync(dir, { recursive: true });
  const rec = {
    schema_version: "vacilando.workspace_last_seen.v1",
    kind: "workspace_last_seen",
    workspaceId: ws,
    operatorId,
    eventId: eid,
    at: at || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(fileFor(operatorId, ws), JSON.stringify(rec, null, 2) + "\n", "utf8");
  return { ok: true, lastSeen: rec };
}
