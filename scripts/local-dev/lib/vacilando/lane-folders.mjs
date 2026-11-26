/**
 * Lane folders — organising durable work without changing what it is.
 *
 * A folder is a label for grouping lanes in the list. It is NOT a lifecycle, a
 * capacity concept, or a container that owns anything: deleting a folder never
 * deletes a lane, and a lane in no folder is entirely normal — most are.
 *
 * WHY FOLDERS ARE FIRST-CLASS RECORDS rather than a string on each lane.
 * Renaming touches one record instead of every member, an empty folder can
 * exist (you make it, then file lanes into it), and the identity survives a
 * rename so a collapsed-state preference does not break when the name changes.
 *
 * WHAT THIS MUST NOT BREAK. The lane list is ordered by attention: active and
 * needs-input work comes first. Folders group WITHIN that truth — a folder is
 * ranked by the most urgent lane inside it, so filing a blocked lane away
 * cannot bury it, and a collapsed folder carries a badge so it cannot hide
 * something that wants the operator.
 */
import { randomUUID } from "node:crypto";

import {
  canonicalLaneStoreId,
  readDevelopmentLaneStore,
  writeDevelopmentLaneStore,
} from "./development-lane.mjs";

export const LANE_FOLDER_SCHEMA = "vacilando.lane_folder.v1";
export const LANE_FOLDER_NAME_MAX = 60;
export const LANE_FOLDER_MAX = 64;

/** Control characters would make a folder name unreadable and unsearchable. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f]/;

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

export function validateFolderName(raw) {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "folder_name_empty" };
  if (name.length > LANE_FOLDER_NAME_MAX) return { ok: false, error: "folder_name_too_large" };
  if (CONTROL_CHARS.test(name)) return { ok: false, error: "folder_name_invalid" };
  return { ok: true, name };
}

function foldersOf(store) {
  return store.folders && typeof store.folders === "object" ? store.folders : {};
}

export function publicLaneFolder(rec, { laneCount = 0 } = {}) {
  if (!rec) return null;
  return {
    schema_version: LANE_FOLDER_SCHEMA,
    folder_id: rec.folder_id,
    name: rec.name,
    repository_id: rec.repository_id || null,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    lane_count: laneCount,
  };
}

export function listLaneFolders(root = undefined, { repositoryId = undefined } = {}) {
  const store = readDevelopmentLaneStore(root);
  const folders = foldersOf(store);
  const counts = new Map();
  for (const lane of Object.values(store.lanes || {})) {
    if (lane?.folder_id) counts.set(lane.folder_id, (counts.get(lane.folder_id) || 0) + 1);
  }
  return Object.values(folders)
    .filter((f) => repositoryId === undefined || (f.repository_id || null) === (repositoryId || null))
    .map((f) => publicLaneFolder(f, { laneCount: counts.get(f.folder_id) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getLaneFolder(folderId, root = undefined) {
  const store = readDevelopmentLaneStore(root);
  return foldersOf(store)[String(folderId || "")] || null;
}

export function createLaneFolder({ name, repositoryId = null, nowMs = Date.now(), root = undefined } = {}) {
  const named = validateFolderName(name);
  if (!named.ok) return named;
  const store = readDevelopmentLaneStore(root);
  const folders = foldersOf(store);
  // Names are unique WITHIN a repository. "Active" under one repository and
  // "Active" under another are different folders, and refusing the second would
  // make the first repository's names global.
  const scope = repositoryId ? String(repositoryId) : null;
  if (Object.values(folders).some((f) => (f.repository_id || null) === scope
      && f.name.toLowerCase() === named.name.toLowerCase())) {
    return { ok: false, error: "folder_name_taken" };
  }
  if (Object.keys(folders).length >= LANE_FOLDER_MAX) {
    return { ok: false, error: "folder_limit_reached", limit: LANE_FOLDER_MAX };
  }
  const rec = {
    schema_version: LANE_FOLDER_SCHEMA,
    folder_id: `lfld_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    name: named.name,
    repository_id: scope,
    created_at: iso(nowMs),
    updated_at: iso(nowMs),
  };
  store.folders = { ...folders, [rec.folder_id]: rec };
  writeDevelopmentLaneStore(store, root);
  return { ok: true, folder: publicLaneFolder(rec) };
}

export function renameLaneFolder(folderId, name, { nowMs = Date.now(), root = undefined } = {}) {
  const named = validateFolderName(name);
  if (!named.ok) return named;
  const store = readDevelopmentLaneStore(root);
  const folders = foldersOf(store);
  const rec = folders[String(folderId || "")];
  if (!rec) return { ok: false, error: "folder_not_found" };
  const clash = Object.values(folders).some(
    (f) => f.folder_id !== rec.folder_id && f.name.toLowerCase() === named.name.toLowerCase(),
  );
  if (clash) return { ok: false, error: "folder_name_taken" };
  rec.name = named.name;
  rec.updated_at = iso(nowMs);
  store.folders = folders;
  writeDevelopmentLaneStore(store, root);
  return { ok: true, folder: publicLaneFolder(rec) };
}

/**
 * Delete the folder, not the work.
 *
 * Every lane filed in it is simply unfiled — the lane, its runs, its worktree
 * and its branch are untouched. A folder is a label; removing a label cannot
 * remove what it labelled.
 */
export function deleteLaneFolder(folderId, { nowMs = Date.now(), root = undefined } = {}) {
  const store = readDevelopmentLaneStore(root);
  const folders = foldersOf(store);
  const id = String(folderId || "");
  if (!folders[id]) return { ok: false, error: "folder_not_found" };
  const unfiled = [];
  for (const lane of Object.values(store.lanes || {})) {
    if (lane?.folder_id === id) {
      lane.folder_id = null;
      lane.updated_at = iso(nowMs);
      unfiled.push(lane.lane_id);
    }
  }
  delete folders[id];
  store.folders = folders;
  writeDevelopmentLaneStore(store, root);
  return { ok: true, deleted: id, unfiled_lanes: unfiled };
}

/** File a lane into a folder, or pass null to take it out of one. */
export function assignLaneToFolder(laneId, folderId, { nowMs = Date.now(), root = undefined } = {}) {
  const store = readDevelopmentLaneStore(root);
  const id = canonicalLaneStoreId(laneId, root);
  const lane = store.lanes?.[id] || store.lanes?.[String(laneId || "")];
  if (!lane) return { ok: false, error: "lane_not_found" };
  if (folderId != null && folderId !== "") {
    const folder = foldersOf(store)[String(folderId)];
    if (!folder) return { ok: false, error: "folder_not_found" };
    // Filing is organisational and must stay inside one repository. Allowing a
    // cross-repository file would make a folder look like a way to move a lane
    // between execution boundaries — which it is not.
    if ((folder.repository_id || null) !== (lane.repository_id || null)) {
      return { ok: false, error: "folder_repository_mismatch",
        folder_repository_id: folder.repository_id || null, lane_repository_id: lane.repository_id || null };
    }
    lane.folder_id = String(folderId);
  } else {
    lane.folder_id = null;
  }
  lane.updated_at = iso(nowMs);
  writeDevelopmentLaneStore(store, root);
  return { ok: true, lane_id: lane.lane_id, folder_id: lane.folder_id };
}

export function resetLaneFoldersForTests(root = undefined) {
  const store = readDevelopmentLaneStore(root);
  store.folders = {};
  for (const lane of Object.values(store.lanes || {})) lane.folder_id = null;
  writeDevelopmentLaneStore(store, root);
}
