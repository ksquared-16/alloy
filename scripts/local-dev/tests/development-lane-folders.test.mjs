#!/usr/bin/env node
/**
 * Lane folders — organisation that cannot lie about work.
 *
 * A folder groups lanes in the list. Three things must stay true no matter how
 * the operator files things:
 *
 *   1. Deleting a folder deletes NO work. The lanes inside it, their worktrees,
 *      their branches and their runs survive; they simply become unfiled.
 *   2. Filing a lane cannot bury it. The list is ordered by attention, so a
 *      folder is ranked by its most urgent lane — dropping a blocked lane into
 *      "Later" must not push it under a folder where nothing is happening.
 *   3. A collapsed folder cannot hide a lane that is asking for the operator.
 *      The header carries the needs-you count even when its rows are not drawn.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = mkdtempSync(join(tmpdir(), "vac-folders-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";

const {
  createLaneFolder,
  renameLaneFolder,
  deleteLaneFolder,
  assignLaneToFolder,
  listLaneFolders,
  validateFolderName,
  LANE_FOLDER_NAME_MAX,
} = await import("../lib/vacilando/lane-folders.mjs");
const {
  createDurableLane,
  getDurableLane,
  publicDurableLane,
  readDevelopmentLaneStore,
  renameDurableLane,
  resetDevelopmentLanesForTests,
} = await import("../lib/vacilando/development-lane.mjs");
const { groupLanesByFolder, renderLaneList, readCollapsedFolders, writeCollapsedFolders, UNFILED_FOLDER_ID } =
  await import("../apps/vacilando/public/gateway-view.mjs");

const WT = mkdtempSync(join(tmpdir(), "vac-folders-wt-"));
function worktree(name) {
  const p = join(WT, name);
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, ".keep"), "", "utf8");
  return p;
}

function freshLane(name, wtName) {
  const out = createDurableLane({
    name,
    binding: { worktree_path: worktree(wtName), tmux_session: `alloy-${wtName}` },
  });
  assert.equal(out.ok, true, `lane ${name}: ${out.error}`);
  return out.lane;
}

function reset() {
  resetDevelopmentLanesForTests();
}

// ---------------------------------------------------------------- name rules

test("a folder name is trimmed, collapsed and bounded", () => {
  assert.deepEqual(validateFolderName("  Ship   this  week "), { ok: true, name: "Ship this week" });
  assert.equal(validateFolderName("   ").error, "folder_name_empty");
  assert.equal(validateFolderName("x".repeat(LANE_FOLDER_NAME_MAX + 1)).error, "folder_name_too_large");
});

test("a control character in a folder name is refused, not silently stored", () => {
  const name = `Ship${String.fromCharCode(7)}week`;
  assert.equal(validateFolderName(name).error, "folder_name_invalid");
});

// ------------------------------------------------------------------- storage

test("folders persist in the lane store and survive a re-read", () => {
  reset();
  const made = createLaneFolder({ name: "Runtime" });
  assert.equal(made.ok, true);
  const store = readDevelopmentLaneStore();
  assert.equal(store.folders[made.folder.folder_id].name, "Runtime");
  assert.deepEqual(listLaneFolders().map((f) => f.name), ["Runtime"]);
});

test("an unrelated lane write does not erase the folders", () => {
  // readDevelopmentLaneStore drops every top-level key it does not name, and
  // every lane mutation writes the whole store back. If folders were not part
  // of that normalisation, renaming a lane would silently delete them all.
  reset();
  const folder = createLaneFolder({ name: "Runtime" }).folder;
  const lane = freshLane("Surfaces", "wt-survive");
  assignLaneToFolder(lane.lane_id, folder.folder_id);
  assert.equal(renameDurableLane(lane.lane_id, "Surfaces V2").ok, true);
  assert.equal(listLaneFolders().length, 1);
  assert.equal(getDurableLane(lane.lane_id).folder_id, folder.folder_id);
});

test("a second folder with the same name is refused", () => {
  reset();
  assert.equal(createLaneFolder({ name: "Runtime" }).ok, true);
  assert.equal(createLaneFolder({ name: "runtime" }).error, "folder_name_taken");
});

test("creating a lane does not put it in a folder", () => {
  reset();
  const lane = freshLane("Surfaces", "wt-surfaces-1");
  assert.equal(lane.folder_id, null);
  assert.equal(publicDurableLane(lane).folder_id, null);
});

test("filing a lane is recorded on the lane and counted on the folder", () => {
  reset();
  const folder = createLaneFolder({ name: "Runtime" }).folder;
  const lane = freshLane("Surfaces", "wt-surfaces-2");
  const out = assignLaneToFolder(lane.lane_id, folder.folder_id);
  assert.equal(out.ok, true);
  assert.equal(getDurableLane(lane.lane_id).folder_id, folder.folder_id);
  assert.equal(listLaneFolders()[0].lane_count, 1);
});

test("filing into a folder that does not exist is refused", () => {
  reset();
  const lane = freshLane("Surfaces", "wt-surfaces-3");
  assert.equal(assignLaneToFolder(lane.lane_id, "lfld_nope").error, "folder_not_found");
  assert.equal(getDurableLane(lane.lane_id).folder_id, null);
});

test("passing no folder takes a lane back out", () => {
  reset();
  const folder = createLaneFolder({ name: "Runtime" }).folder;
  const lane = freshLane("Surfaces", "wt-surfaces-4");
  assignLaneToFolder(lane.lane_id, folder.folder_id);
  assert.equal(assignLaneToFolder(lane.lane_id, null).ok, true);
  assert.equal(getDurableLane(lane.lane_id).folder_id, null);
});

test("renaming a folder keeps its identity and its members", () => {
  reset();
  const folder = createLaneFolder({ name: "Runtime" }).folder;
  const lane = freshLane("Surfaces", "wt-surfaces-5");
  assignLaneToFolder(lane.lane_id, folder.folder_id);
  const out = renameLaneFolder(folder.folder_id, "Runtime performance");
  assert.equal(out.ok, true);
  assert.equal(out.folder.folder_id, folder.folder_id);
  assert.equal(getDurableLane(lane.lane_id).folder_id, folder.folder_id);
});

// ------------------------------------------------- deleting a folder is safe

test("deleting a folder unfiles its lanes and destroys no work", () => {
  reset();
  const folder = createLaneFolder({ name: "Later" }).folder;
  const a = freshLane("Surfaces", "wt-del-a");
  const b = freshLane("Trust", "wt-del-b");
  assignLaneToFolder(a.lane_id, folder.folder_id);
  assignLaneToFolder(b.lane_id, folder.folder_id);

  const out = deleteLaneFolder(folder.folder_id);
  assert.equal(out.ok, true);
  assert.deepEqual(out.unfiled_lanes.sort(), [a.lane_id, b.lane_id].sort());

  for (const lane of [a, b]) {
    const rec = getDurableLane(lane.lane_id);
    assert.ok(rec, "the lane still exists");
    assert.equal(rec.folder_id, null);
    assert.equal(rec.binding.worktree_path, lane.binding.worktree_path);
    assert.equal(rec.status, "ACTIVE");
  }
  assert.deepEqual(listLaneFolders(), []);
});

test("deleting a folder that does not exist changes nothing", () => {
  reset();
  createLaneFolder({ name: "Later" });
  assert.equal(deleteLaneFolder("lfld_nope").error, "folder_not_found");
  assert.equal(listLaneFolders().length, 1);
});

// -------------------------------------------------------------- the lane list

const FOLDERS = [
  { folder_id: "lfld_quiet", name: "Later" },
  { folder_id: "lfld_busy", name: "Runtime" },
];

function laneVm(id, { folder_id = null, run = null, updated = 1000 } = {}) {
  return {
    lane_id: id,
    label: id,
    folder_id,
    execution_run: run,
    last_activity_ms: updated,
    observed_at: new Date(updated).toISOString(),
    claude: { presence: "absent" },
    tmux: { alive: false },
  };
}

test("a folder is ranked by its most urgent lane, so filing cannot bury work", () => {
  const lanes = [
    laneVm("idle-one", { folder_id: "lfld_busy", updated: 5000 }),
    laneVm("blocked", { folder_id: "lfld_quiet", run: { state: "NEEDS_INPUT", state_reason: "which port?" }, updated: 1000 }),
  ];
  const groups = groupLanesByFolder(lanes, FOLDERS);
  const order = groups.filter((g) => g.lanes.length).map((g) => g.folder_id);
  assert.equal(order[0], "lfld_quiet", "the folder holding the blocked lane comes first");
});

test("an empty folder still appears, so lanes can be filed into it", () => {
  const groups = groupLanesByFolder([laneVm("solo")], FOLDERS);
  const ids = groups.map((g) => g.folder_id);
  assert.ok(ids.includes("lfld_quiet"));
  assert.ok(ids.includes("lfld_busy"));
  assert.ok(ids.includes(UNFILED_FOLDER_ID));
});

test("a lane filed into a folder the store forgot is still shown, unfiled", () => {
  const groups = groupLanesByFolder([laneVm("orphan", { folder_id: "lfld_gone" })], FOLDERS);
  const unfiled = groups.find((g) => g.folder_id === UNFILED_FOLDER_ID);
  assert.deepEqual(unfiled.lanes.map((l) => l.lane_id), ["orphan"]);
});

test("a collapsed folder reports its needs-you count on the header", () => {
  const lanes = [laneVm("blocked", { folder_id: "lfld_quiet", run: { state: "NEEDS_INPUT", state_reason: "which port?" } })];
  const groups = groupLanesByFolder(lanes, FOLDERS, { collapsed: new Set(["lfld_quiet"]) });
  const g = groups.find((x) => x.folder_id === "lfld_quiet");
  assert.equal(g.collapsed, true);
  assert.equal(g.needs_attention, 1);
});

test("a collapsed folder draws no lane rows but still shows the badge", () => {
  const lanes = [laneVm("blocked", { folder_id: "lfld_quiet", run: { state: "NEEDS_INPUT", state_reason: "which port?" } })];
  const html = renderLaneList(lanes, null, { folders: FOLDERS, collapsedFolders: new Set(["lfld_quiet"]) });
  assert.equal(html.includes('data-gw-lane="blocked"'), false, "the row is not drawn");
  assert.ok(html.includes("needs you"), "the header still says the operator is wanted");
});

test("once any folder exists, unfiled lanes get their own header", () => {
  // The regression this closes: with no header of its own, an unfiled lane was
  // drawn directly beneath the last folder's header, so a folder whose badge
  // said 1 appeared to contain 2 lanes.
  const lanes = [laneVm("filed", { folder_id: "lfld_busy" }), laneVm("loose")];
  const html = renderLaneList(lanes, null, { folders: FOLDERS, collapsedFolders: new Set() });
  assert.ok(html.includes('data-gw-folder-toggle="__unfiled__"'), "the unfiled group is labelled");
  assert.ok(html.includes("No folder"));
  // Unfiled is not a folder, so it cannot be renamed or deleted.
  assert.equal(html.includes('data-gw-folder-rename="__unfiled__"'), false);
  assert.equal(html.includes('data-gw-folder-delete="__unfiled__"'), false);
});

test("an unfiled group with no lanes is not drawn at all", () => {
  const html = renderLaneList([laneVm("filed", { folder_id: "lfld_busy" })], null, {
    folders: FOLDERS,
    collapsedFolders: new Set(),
  });
  assert.equal(html.includes('data-gw-folder="__unfiled__"'), false);
});

test("with no folders the list keeps its plain shape", () => {
  const html = renderLaneList([laneVm("solo")], null, { folders: [], collapsedFolders: new Set() });
  assert.equal(html.includes("gw-folder-h"), false);
  assert.ok(html.includes('data-gw-lane="solo"'));
});

test("the list always offers a way to make a folder", () => {
  const html = renderLaneList([laneVm("solo")], null, { folders: [], collapsedFolders: new Set() });
  assert.ok(html.includes("data-gw-folder-new"));
});

test("collapse is a stored preference and round-trips", () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
  };
  assert.deepEqual([...readCollapsedFolders(storage)], []);
  writeCollapsedFolders(new Set(["lfld_quiet"]), storage);
  assert.deepEqual([...readCollapsedFolders(storage)], ["lfld_quiet"]);
});

test("a corrupt collapse preference is read as nothing collapsed", () => {
  const storage = { getItem: () => "{not json", setItem: () => {} };
  assert.deepEqual([...readCollapsedFolders(storage)], []);
});
