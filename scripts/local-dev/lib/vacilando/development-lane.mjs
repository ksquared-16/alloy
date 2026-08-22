/**
 * Vacilando Core — durable Development Lane identity.
 *
 * A Development Lane is an operator-owned specialist area. It is not a
 * worktree, branch, tmux session, sprint, or Claude conversation.
 *
 * Runtime binding is Alloy-local for now and is re-validated against the
 * substrate before consequential operations. Binding metadata is not Git/tmux truth.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { localNodeId } from "./execution-node.mjs";
import { normalizeExecutionProvider } from "./execution-providers.mjs";

export const DEVELOPMENT_LANE_SCHEMA = "vacilando.development_lane.v1";
export const DURABLE_LANE_ID_RE = /^lane_[a-f0-9]{12}$/;
export const LANE_NAME_MAX = 80;
export const IDENTITY_TMUX = "alloy-identity";
export const IDENTITY_LANE_NAME = "Access & Identity";
export const IDENTITY_LANE_ID = "lane_955fe041d417";
export const VACILANDO_LANE_NAME = "Vacilando";
export const VACILANDO_LANE_ALIAS = "vacilando";
export const WORK_CLASS_PRODUCT = "product";
export const WORK_CLASS_RUNTIME_SELF = "runtime_self";
export const RUNTIME_SELF_RESOURCE_PRIORITY = -10;

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

export function durableLanesEnabled() {
  if (process.env.VACILANDO_DURABLE_LANES === "0") return false;
  if (process.env.VACILANDO_DURABLE_LANES === "1") return true;
  const root = (process.env.ALLOY_RUNTIME_ROOT || "").trim().replace(/\/+$/, "");
  return /(^|\/)gateway$/.test(root);
}

/** Resolve aliases (legacy tmux id) to the durable store key. */
export function canonicalLaneStoreId(laneId, root = runtimeRoot()) {
  const id = String(laneId || "");
  if (!id) return id;
  if (!durableLanesEnabled()) return id;
  return getDurableLane(id, root)?.lane_id || id;
}

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function developmentLaneStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "lanes", "lanes.json");
}

function emptyStore() {
  return { schema_version: DEVELOPMENT_LANE_SCHEMA, lanes: {} };
}

export function readDevelopmentLaneStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(developmentLaneStorePath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    return {
      schema_version: DEVELOPMENT_LANE_SCHEMA,
      lanes: raw.lanes && typeof raw.lanes === "object" ? raw.lanes : {},
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store, root) {
  atomicWrite(developmentLaneStorePath(root), store);
  return store;
}

export function newDurableLaneId() {
  return `lane_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * A lane's first name comes from its first message.
 *
 * Creating a lane used to demand a name up front, before the operator had said
 * what the lane was for — a form to fill in before a conversation could start.
 * Starting a chat should not require naming it: the opening message already
 * says what this is, and Rename Lane is there when it stops fitting.
 */
export function deriveLaneNameFromInstruction(raw, { max = 48 } = {}) {
  for (const line of String(raw ?? "").split("\n")) {
    const text = line
      .replace(/^\s*#{1,6}\s*/, "")      // markdown heading
      .replace(/^\s*[-*+]\s+/, "")        // bullet
      .replace(/^\s*\d+[.)]\s+/, "")      // ordered item
      .replace(/[`*_>]/g, "")              // inline emphasis / quote marks
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    if (text.length <= max) return text;
    // Cut on a word boundary so the name reads like a phrase, not a truncation.
    const cut = text.slice(0, max);
    const space = cut.lastIndexOf(" ");
    return (space > max * 0.5 ? cut.slice(0, space) : cut).trim() + "…";
  }
  return "";
}

export function validateLaneName(raw) {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "name_empty" };
  if (name.length > LANE_NAME_MAX) return { ok: false, error: "name_too_large" };
  if (/[\u0000-\u001f]/.test(name)) return { ok: false, error: "name_invalid" };
  return { ok: true, name };
}

function coerceSlot(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : fallback;
}

export function coerceWorkClass(value, fallback = WORK_CLASS_PRODUCT) {
  const v = String(value || "").trim();
  if (v === WORK_CLASS_RUNTIME_SELF) return WORK_CLASS_RUNTIME_SELF;
  if (v === WORK_CLASS_PRODUCT) return WORK_CLASS_PRODUCT;
  return fallback;
}

export function scarceResourcePriorityForLane(laneId, root = runtimeRoot()) {
  const rec = getDurableLane(laneId, root);
  if (typeof rec?.scarce_resource_priority === "number") return rec.scarce_resource_priority;
  if (rec?.work_class === WORK_CLASS_RUNTIME_SELF) return RUNTIME_SELF_RESOURCE_PRIORITY;
  return 0;
}

function normalizeBinding(binding, { root, previous = null } = {}) {
  if (!binding) return null;
  const nodeId = binding.node_id || localNodeId(root);
  return {
    type: binding.type || previous?.type || "alloy_local",
    node_id: nodeId,
    worktree_path: binding.worktree_path || previous?.worktree_path || null,
    worktree_name: binding.worktree_name || previous?.worktree_name || null,
    branch: binding.branch || previous?.branch || null,
    tmux_session: Object.prototype.hasOwnProperty.call(binding, "tmux_session")
      ? (binding.tmux_session || null)
      : (previous?.tmux_session || null),
    tmux_pane: Object.prototype.hasOwnProperty.call(binding, "tmux_pane")
      ? (binding.tmux_pane || null)
      : (previous?.tmux_pane || null),
    slot: Object.prototype.hasOwnProperty.call(binding, "slot")
      ? coerceSlot(binding.slot, null)
      : coerceSlot(previous?.slot, null),
    provider: normalizeExecutionProvider(binding.provider || previous?.provider, "claude") || "claude",
    stale: false,
    status: "bound",
    last_node_id: previous?.node_id && previous.node_id !== nodeId ? previous.node_id : (previous?.last_node_id || null),
  };
}

export function isDurableLaneId(id) {
  return DURABLE_LANE_ID_RE.test(String(id || ""));
}

export function listDurableLanes(root = runtimeRoot()) {
  return Object.values(readDevelopmentLaneStore(root).lanes || {})
    .filter((l) => l && l.status !== "ARCHIVED");
}

export function getDurableLane(laneId, root = runtimeRoot()) {
  const id = String(laneId || "");
  if (!id) return null;
  const store = readDevelopmentLaneStore(root);
  if (store.lanes[id]) return store.lanes[id];
  for (const rec of Object.values(store.lanes)) {
    if (rec?.status === "ARCHIVED") continue;
    if ((rec.aliases || []).includes(id)) return rec;
    if (rec.binding?.tmux_session === id) return rec;
    if (rec.binding?.worktree_name === id) return rec;
  }
  return null;
}

export function laneAliases(rec) {
  if (!rec) return [];
  const out = new Set([rec.lane_id, ...(rec.aliases || [])]);
  if (rec.binding?.tmux_session) out.add(rec.binding.tmux_session);
  return [...out].filter(Boolean);
}

export function findLaneByBinding({ worktreePath, tmuxSession, root = runtimeRoot() } = {}) {
  const path = worktreePath ? String(worktreePath) : "";
  const session = tmuxSession ? String(tmuxSession) : "";
  for (const rec of listDurableLanes(root)) {
    if (path && rec.binding?.worktree_path === path) return rec;
    if (session && rec.binding?.tmux_session === session) return rec;
  }
  return null;
}

export function isRuntimeAdoptionBlocked(binding = {}) {
  const name = String(binding.worktree_name || binding.name || "");
  const path = String(binding.worktree_path || "");
  const tmux = String(binding.tmux_session || "");
  if (tmux === "alloy-runtime") return true;
  const blob = `${name} ${path}`.toLowerCase();
  // Control-plane hosts only. Product sprints may legally contain "runtime"
  // (e.g. wt5-runtime-performance-ux-completion).
  if (/(^|[/_-])alloy-runtime([/_-]|$)/.test(blob)) return true;
  if (/(^|[/_-])wt-runtime([/_-]|$)/.test(blob)) return true;
  return false;
}

export function createDurableLane({
  name,
  description = null,
  binding = null,
  aliases = [],
  mission_id = null,
  origin = "adopted",
  work_class = WORK_CLASS_PRODUCT,
  scarce_resource_priority = null,
  preferred_provider = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const named = validateLaneName(name);
  if (!named.ok) return named;
  if (binding?.worktree_path && (String(binding.worktree_path).includes("..") || /[;|&]/.test(String(binding.worktree_path)))) {
    return { ok: false, error: "path_refused" };
  }
  if (binding?.worktree_path && !existsSync(binding.worktree_path)) {
    return { ok: false, error: "worktree_missing" };
  }
  if (binding?.worktree_path || binding?.tmux_session) {
    const existing = findLaneByBinding({
      worktreePath: binding.worktree_path,
      tmuxSession: binding.tmux_session,
      root,
    });
    if (existing) {
      return {
        ok: false,
        error: "already_connected",
        lane: existing,
        lane_id: existing.lane_id,
        name: existing.name,
      };
    }
  }
  if (isRuntimeAdoptionBlocked(binding || {})) {
    return { ok: false, error: "runtime_adoption_blocked" };
  }
  const rec = {
    schema_version: DEVELOPMENT_LANE_SCHEMA,
    lane_id: newDurableLaneId(),
    name: named.name,
    description: description ? String(description).slice(0, 240) : null,
    status: "ACTIVE",
    created_at: iso(nowMs),
    updated_at: iso(nowMs),
    origin,
    aliases: [...new Set((aliases || []).filter(Boolean))],
    mission_id: mission_id ? String(mission_id) : null,
    mission_bound_at: mission_id ? iso(nowMs) : null,
    work_class: coerceWorkClass(work_class),
    scarce_resource_priority: typeof scarce_resource_priority === "number"
      ? scarce_resource_priority
      : (coerceWorkClass(work_class) === WORK_CLASS_RUNTIME_SELF ? RUNTIME_SELF_RESOURCE_PRIORITY : 0),
    preferred_provider: normalizeExecutionProvider(
      preferred_provider || binding?.provider,
      "claude",
    ) || "claude",
    binding: binding ? normalizeBinding(binding, { root }) : null,
  };
  const store = readDevelopmentLaneStore(root);
  store.lanes[rec.lane_id] = rec;
  writeStore(store, root);
  return { ok: true, lane: rec };
}

export function bindDurableLane(laneId, binding, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found" };
  if (!binding || (!binding.worktree_path && !binding.tmux_session)) {
    return { ok: false, error: "binding_incomplete" };
  }
  if (binding.worktree_path && (String(binding.worktree_path).includes("..") || /[;|&]/.test(String(binding.worktree_path)))) {
    return { ok: false, error: "path_refused" };
  }
  if (isRuntimeAdoptionBlocked(binding)) {
    return { ok: false, error: "runtime_adoption_blocked" };
  }
  const existing = findLaneByBinding({
    worktreePath: binding.worktree_path,
    tmuxSession: binding.tmux_session,
    root,
  });
  if (existing && existing.lane_id !== rec.lane_id) {
    return { ok: false, error: "already_connected", lane: existing };
  }
  rec.binding = normalizeBinding(binding, { root, previous: rec.binding });
  rec.updated_at = iso(nowMs);
  const store = readDevelopmentLaneStore(root);
  store.lanes[rec.lane_id] = rec;
  writeStore(store, root);
  return { ok: true, lane: rec };
}

export function directorRuntimeRoot() {
  const explicit = process.env.ALLOY_DIRECTOR_RUNTIME_ROOT?.trim();
  if (explicit) return explicit;
  const home = join(homedir(), ".local", "state", "alloy-dev");
  const current = (process.env.ALLOY_RUNTIME_ROOT || "").trim().replace(/\/+$/, "");
  if (current === join(home, "gateway")) return home;
  return current || home;
}

function projectMissionsFromLog(logPath) {
  let lines = [];
  try { lines = readFileSync(logPath, "utf8").split("\n").filter(Boolean); } catch { return []; }
  const byId = new Map();
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const id = e.mission_id;
    if (!id) continue;
    if (e.event === "created") {
      const { event: _e, ...rec } = e;
      byId.set(id, rec);
    } else {
      const cur = byId.get(id);
      if (cur) {
        const { event: _ev, mission_id: _mid, ...p } = e;
        Object.assign(cur, p);
      }
    }
  }
  return [...byId.values()];
}

export function resolveMissionRecord(missionId, root = runtimeRoot()) {
  const id = String(missionId || "").trim();
  if (!id) return null;
  const roots = [...new Set([root, directorRuntimeRoot()].filter(Boolean))];
  for (const r of roots) {
    const list = projectMissionsFromLog(join(r, "vacilando", "missions", "missions.jsonl"));
    const hit = list.find((m) => m.mission_id === id);
    if (hit) return hit;
  }
  return null;
}

export function resolveIdentityMissionId(root = runtimeRoot()) {
  const envId = process.env.VACILANDO_IDENTITY_MISSION_ID?.trim();
  if (envId) return envId;
  const roots = [...new Set([root, directorRuntimeRoot()].filter(Boolean))];
  const live = [];
  for (const r of roots) {
    for (const m of projectMissionsFromLog(join(r, "vacilando", "missions", "missions.jsonl"))) {
      if (m?.archived) continue;
      const title = String(m.title || "");
      if (/demo|certification|fixture/i.test(title)) continue;
      if (!/Access & Identity V2/i.test(title)) continue;
      if (/Operational Closeout/i.test(title)) continue;
      if (["completed", "failed", "stopped", "closed"].includes(m.status)) continue;
      live.push(m);
    }
  }
  const exactExecuting = live.find((m) =>
    /^Access & Identity V2$/i.test(String(m.title || ""))
    && (m.status === "executing" || m.status === "running")
  );
  if (exactExecuting) return exactExecuting.mission_id;
  const executing = live.find((m) => m.status === "executing" || m.status === "running");
  return executing?.mission_id || live[0]?.mission_id || null;
}

export function bindLaneMission(laneId, missionId, {
  nowMs = Date.now(),
  root = runtimeRoot(),
  requireExisting = false,
  origin = "operator",
} = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found" };
  const id = String(missionId || "").trim();
  if (!id) return { ok: false, error: "missing_mission_id" };
  if (requireExisting && !resolveMissionRecord(id, root)) {
    return { ok: false, error: "mission_not_found" };
  }
  const previous = rec.mission_id || null;
  rec.mission_id = id;
  rec.mission_bound_at = iso(nowMs);
  rec.mission_bound_origin = origin;
  rec.updated_at = iso(nowMs);
  const store = readDevelopmentLaneStore(root);
  store.lanes[rec.lane_id] = rec;
  writeStore(store, root);
  return { ok: true, lane: rec, previous_mission_id: previous, rebound: Boolean(previous && previous !== id) };
}

export function missionIdForLane(laneId, root = runtimeRoot()) {
  return getDurableLane(laneId, root)?.mission_id || null;
}

/**
 * Bind known persistent lanes to existing durable missions. Does not create missions.
 */
export function ensureKnownLaneMissionBindings({ nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const rec = getDurableLane(IDENTITY_LANE_ID, root)
    || getDurableLane(IDENTITY_TMUX, root)
    || listDurableLanes(root).find((l) => l.name === IDENTITY_LANE_NAME);
  if (!rec) return { ok: true, bound: false, skipped: "no_identity_lane" };
  if (rec.mission_id) return { ok: true, bound: true, skipped: "already_bound", lane: rec };
  const missionId = resolveIdentityMissionId(root);
  if (!missionId) return { ok: false, error: "identity_mission_not_found" };
  return bindLaneMission(rec.lane_id, missionId, {
    nowMs,
    root,
    requireExisting: true,
    origin: "backfill",
  });
}

export function renameDurableLane(laneId, name, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found" };
  const named = validateLaneName(name);
  if (!named.ok) return named;
  const previous = rec.name;
  rec.name = named.name;
  rec.updated_at = iso(nowMs);
  const store = readDevelopmentLaneStore(root);
  store.lanes[rec.lane_id] = rec;
  writeStore(store, root);
  return { ok: true, lane: rec, previous_name: previous, substrate_mutated: false };
}

export function setLanePreferredProvider(laneId, provider, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found" };
  const next = normalizeExecutionProvider(provider, "");
  if (!next) return { ok: false, error: "unsupported_provider" };
  rec.preferred_provider = next;
  rec.updated_at = iso(nowMs);
  const store = readDevelopmentLaneStore(root);
  store.lanes[rec.lane_id] = rec;
  writeStore(store, root);
  return { ok: true, lane: rec };
}

export function setDurableLaneExecutionCapacity(laneId, capacity, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found" };
  rec.execution_capacity = capacity && typeof capacity === "object" ? { ...capacity } : null;
  rec.updated_at = iso(nowMs);
  const store = readDevelopmentLaneStore(root);
  store.lanes[rec.lane_id] = rec;
  writeStore(store, root);
  return { ok: true, lane: rec };
}

/**
 * Free temporary slot/tmux ownership. Keep durable identity and worktree/branch.
 * Does not delete Git worktrees or branches.
 */
export function releaseDurableLaneRuntimeBinding(laneId, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found" };
  const previousSlot = rec.binding?.slot ?? null;
  rec.binding = {
    type: rec.binding?.type || "alloy_local",
    node_id: rec.binding?.node_id || null,
    worktree_path: rec.binding?.worktree_path || null,
    worktree_name: rec.binding?.worktree_name || null,
    branch: rec.binding?.branch || null,
    tmux_session: null,
    tmux_pane: null,
    slot: null,
    provider: normalizeExecutionProvider(rec.binding?.provider, "claude") || "claude",
    stale: true,
    status: "idle",
    last_node_id: rec.binding?.node_id || rec.binding?.last_node_id || null,
  };
  rec.execution_capacity = {
    state: "IDLE",
    released_at: iso(nowMs),
    slot: null,
  };
  rec.updated_at = iso(nowMs);
  const store = readDevelopmentLaneStore(root);
  store.lanes[rec.lane_id] = rec;
  writeStore(store, root);
  return { ok: true, lane: rec, previous_slot: previousSlot };
}

function remapJsonFile(path, from, to) {
  if (!existsSync(path) || from === to) return false;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const text = JSON.stringify(raw);
    if (!text.includes(from)) return false;
    const next = JSON.parse(JSON.stringify(raw));
    if (next.lanes && next.lanes[from] && !next.lanes[to]) {
      next.lanes[to] = next.lanes[from];
      delete next.lanes[from];
      if (Array.isArray(next.lanes[to]?.runs)) {
        for (const run of next.lanes[to].runs) {
          if (run && run.lane_id === from) run.lane_id = to;
        }
      }
      if (Array.isArray(next.lanes[to]?.sessions)) {
        for (const s of next.lanes[to].sessions) {
          if (s && s.lane_id === from) s.lane_id = to;
        }
      }
    }
    atomicWrite(path, next);
    return true;
  } catch {
    return false;
  }
}

export function remapGovernorLaneIdentity(fromId, toId, root = runtimeRoot()) {
  const from = String(fromId || "");
  const to = String(toId || "");
  if (!from || !to || from === to) return { ok: true, remapped: [] };
  const base = join(root, "vacilando");
  const remapped = [];
  for (const rel of [
    ["execution-runs", "runs.json"],
    ["execution-runs", "agent-sessions.json"],
    ["lane-runtime", "sends.json"],
  ]) {
    const p = join(base, ...rel);
    if (remapJsonFile(p, from, to)) remapped.push(rel.join("/"));
  }
  const admissionPath = join(base, "execution-runs", "admissions.json");
  if (existsSync(admissionPath)) {
    try {
      const raw = JSON.parse(readFileSync(admissionPath, "utf8"));
      let changed = false;
      for (const rec of raw.requests || []) {
        if (rec?.lane_id === from) {
          rec.lane_id = to;
          changed = true;
        }
      }
      if (changed) {
        atomicWrite(admissionPath, raw);
        remapped.push("admissions.json");
      }
    } catch { /* */ }
  }
  const reqPath = join(base, "execution-runs", "resource-requests.json");
  if (existsSync(reqPath)) {
    try {
      const raw = JSON.parse(readFileSync(reqPath, "utf8"));
      let changed = false;
      for (const rec of raw.requests || []) {
        if (rec?.lane_id === from) {
          rec.lane_id = to;
          changed = true;
        }
      }
      if (changed) {
        atomicWrite(reqPath, raw);
        remapped.push("resource-requests.json");
      }
    } catch { /* */ }
  }
  const exclusivePath = join(base, "execution-runs", "machine-exclusive.json");
  if (existsSync(exclusivePath)) {
    try {
      const raw = JSON.parse(readFileSync(exclusivePath, "utf8"));
      if (raw?.window?.lane_id === from) {
        raw.window.lane_id = to;
        atomicWrite(exclusivePath, raw);
        remapped.push("machine-exclusive.json");
      }
    } catch { /* */ }
  }
  const handoffPath = join(base, "execution-runs", "agent-handoffs.json");
  if (existsSync(handoffPath)) {
    try {
      const raw = JSON.parse(readFileSync(handoffPath, "utf8"));
      let changed = false;
      for (const rec of Object.values(raw?.handoffs || {})) {
        if (rec?.lane_id === from) {
          rec.lane_id = to;
          changed = true;
        }
      }
      if (changed) {
        atomicWrite(handoffPath, raw);
        remapped.push("agent-handoffs.json");
      }
    } catch { /* */ }
  }
  return { ok: true, remapped };
}

export function adoptLegacyIdentityLane({
  observation = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const existing = getDurableLane(IDENTITY_TMUX, root) || findLaneByBinding({
    tmuxSession: IDENTITY_TMUX,
    worktreePath: observation?.worktree?.path,
    root,
  });
  if (existing) return { ok: true, lane: existing, migrated: false };
  const created = createDurableLane({
    name: IDENTITY_LANE_NAME,
    origin: "migrated",
    aliases: [IDENTITY_TMUX],
    nowMs,
    root,
    binding: {
      type: "alloy_local",
      worktree_path: observation?.worktree?.path || null,
      worktree_name: observation?.worktree?.name || "wt1-access-identity-v2",
      branch: observation?.git?.branch || null,
      tmux_session: IDENTITY_TMUX,
      tmux_pane: observation?.tmux?.pane_id || null,
      slot: observation?.slot ?? 1,
      provider: normalizeExecutionProvider(observation?.provider, "claude") || "claude",
    },
  });
  if (!created.ok) return created;
  remapGovernorLaneIdentity(IDENTITY_TMUX, created.lane.lane_id, root);
  return { ok: true, lane: created.lane, migrated: true };
}

export function connectExistingWork({
  candidate,
  name,
  startClaude = false,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  if (!candidate?.worktree_path && !candidate?.tmux_session) {
    return { ok: false, error: "candidate_incomplete" };
  }
  const path = String(candidate.worktree_path || "");
  if (path && (path.includes("..") || /[;|&]/.test(path))) {
    return { ok: false, error: "path_refused" };
  }
  if (isRuntimeAdoptionBlocked(candidate)) {
    return { ok: false, error: "runtime_adoption_blocked" };
  }
  const bound = findLaneByBinding({
    worktreePath: candidate.worktree_path,
    tmuxSession: candidate.tmux_session,
    root,
  });
  if (bound) {
    return {
      ok: false,
      error: "already_connected",
      lane: bound,
      lane_id: bound.lane_id,
      name: bound.name,
    };
  }
  const aliases = [];
  if (candidate.tmux_session) aliases.push(candidate.tmux_session);
  const created = createDurableLane({
    name: name || candidate.suggested_name || candidate.worktree_name,
    origin: "adopted",
    aliases,
    nowMs,
    root,
    binding: {
      worktree_path: candidate.worktree_path,
      worktree_name: candidate.worktree_name,
      branch: candidate.branch,
      tmux_session: candidate.tmux_session || null,
      tmux_pane: candidate.tmux_pane || null,
      slot: candidate.slot,
      provider: normalizeExecutionProvider(candidate.provider, "claude") || "claude",
    },
  });
  if (!created.ok) return created;
  if (candidate.tmux_session) {
    remapGovernorLaneIdentity(candidate.tmux_session, created.lane.lane_id, root);
  }
  return {
    ok: true,
    lane: created.lane,
    start_claude: Boolean(startClaude),
    start_claude_implemented: false,
    substrate_mutated: false,
  };
}

export function validateRuntimeBinding(rec, observation) {
  const blockers = [];
  const binding = rec?.binding;
  if (binding?.stale || binding?.status === "stale" || binding?.status === "unbound") {
    blockers.push({ code: "binding_stale", detail: "Execution binding is stale and must be rebound on this node" });
  }
  if (!binding?.worktree_path) blockers.push({ code: "missing_worktree", detail: "Lane has no worktree binding" });
  else if (!existsSync(binding.worktree_path)) blockers.push({ code: "worktree_missing", detail: "Bound worktree path does not exist" });
  if (observation?.worktree?.path && binding?.worktree_path && observation.worktree.path !== binding.worktree_path) {
    blockers.push({ code: "worktree_mismatch", detail: "Live pane cwd is not the bound worktree" });
  }
  if (binding?.tmux_session && observation?.tmux?.session && observation.tmux.session !== binding.tmux_session) {
    blockers.push({ code: "tmux_mismatch", detail: "Live tmux session does not match binding" });
  }
  return { ok: blockers.length === 0, blockers, binding };
}

/**
 * Mark host-specific binding fields invalid without deleting the lane.
 * Keeps last-known worktree/branch as historical context.
 */
export function invalidateStaleExecutionBindings({
  root = runtimeRoot(),
  nowMs = Date.now(),
  reason = "host_rebinding",
  currentNodeId = null,
} = {}) {
  const store = readDevelopmentLaneStore(root);
  let invalidated = 0;
  for (const rec of Object.values(store.lanes || {})) {
    if (!rec || rec.status === "ARCHIVED") continue;
    if (!rec.binding) continue;
    const nodeMatch = currentNodeId && rec.binding.node_id === currentNodeId && rec.binding.stale !== true;
    if (nodeMatch && reason !== "restored_onto_different_node") continue;
    rec.binding = {
      ...rec.binding,
      tmux_session: null,
      tmux_pane: null,
      slot: null,
      stale: true,
      status: "stale",
      last_node_id: rec.binding.node_id || rec.binding.last_node_id || null,
      node_id: null,
      invalidated_at: iso(nowMs),
      invalidated_reason: reason,
    };
    rec.updated_at = iso(nowMs);
    store.lanes[rec.lane_id] = rec;
    invalidated += 1;
  }
  writeStore(store, root);
  return { ok: true, invalidated };
}

/**
 * Same durable lane, new execution substrate on the current node.
 * Does not create a new lane. Does not mutate Git.
 */
export function rebindDurableLane(laneId, binding, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found" };
  const out = bindDurableLane(laneId, binding, { nowMs, root });
  if (!out.ok) return out;
  return { ...out, lane_id: rec.lane_id, substrate_mutated: false, git_mutated: false };
}

export function findVacilandoSpecialistLane(root = runtimeRoot()) {
  for (const rec of listDurableLanes(root)) {
    if ((rec.aliases || []).includes(VACILANDO_LANE_ALIAS)) return rec;
    if (rec.work_class === WORK_CLASS_RUNTIME_SELF && rec.name === VACILANDO_LANE_NAME) return rec;
  }
  return null;
}

/**
 * Permanent specialist lane for Vacilando-runtime work. Same identity model
 * as other specialist lanes — not a special-cased object type.
 */
export function ensureVacilandoSpecialistLane({
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const existing = findVacilandoSpecialistLane(root);
  if (existing) {
    let dirty = false;
    if (existing.work_class !== WORK_CLASS_RUNTIME_SELF) {
      existing.work_class = WORK_CLASS_RUNTIME_SELF;
      dirty = true;
    }
    if (typeof existing.scarce_resource_priority !== "number"
        || existing.scarce_resource_priority > RUNTIME_SELF_RESOURCE_PRIORITY) {
      existing.scarce_resource_priority = RUNTIME_SELF_RESOURCE_PRIORITY;
      dirty = true;
    }
    const aliases = new Set(existing.aliases || []);
    if (!aliases.has(VACILANDO_LANE_ALIAS)) {
      aliases.add(VACILANDO_LANE_ALIAS);
      existing.aliases = [...aliases];
      dirty = true;
    }
    if (dirty) {
      existing.updated_at = iso(nowMs);
      const store = readDevelopmentLaneStore(root);
      store.lanes[existing.lane_id] = existing;
      writeStore(store, root);
    }
    return { ok: true, lane: existing, created: false };
  }
  return {
    ...createDurableLane({
      name: VACILANDO_LANE_NAME,
      description: "Owns Vacilando development-runtime improvements. Lower scarce-resource priority than Alloy product work.",
      origin: "created",
      aliases: [VACILANDO_LANE_ALIAS],
      work_class: WORK_CLASS_RUNTIME_SELF,
      scarce_resource_priority: RUNTIME_SELF_RESOURCE_PRIORITY,
      nowMs,
      root,
    }),
    created: true,
  };
}

export function publicDurableLane(rec) {
  if (!rec) return null;
  return {
    lane_id: rec.lane_id,
    name: rec.name,
    description: rec.description,
    status: rec.status,
    aliases: rec.aliases || [],
    binding: rec.binding,
    origin: rec.origin,
    work_class: rec.work_class || WORK_CLASS_PRODUCT,
    scarce_resource_priority: typeof rec.scarce_resource_priority === "number"
      ? rec.scarce_resource_priority
      : (rec.work_class === WORK_CLASS_RUNTIME_SELF ? RUNTIME_SELF_RESOURCE_PRIORITY : 0),
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    mission_id: rec.mission_id || null,
    mission_bound_at: rec.mission_bound_at || null,
    preferred_provider: normalizeExecutionProvider(rec.preferred_provider || rec.binding?.provider, "claude") || "claude",
    execution_capacity: rec.execution_capacity || null,
  };
}

export function resetDevelopmentLanesForTests(root = runtimeRoot()) {
  writeStore(emptyStore(), root);
}

/**
 * Host-portability rebind: same durable lane, new execution substrate.
 * Not remote workload migration.
 */
export const HOST_REBIND_CONTRACT = Object.freeze({
  implemented: true,
  retains: [
    "durable lane_id",
    "operator name",
    "aliases",
    "work_class",
    "historical Execution Runs",
    "historical Agent Sessions",
  ],
  invalidates: [
    "tmux session",
    "slot",
    "pane",
    "live node claim",
  ],
});

export const FUTURE_REBIND_CONTRACT = Object.freeze({
  implemented: false,
  requires: [
    "no active Execution Run or an explicit continuation policy",
    "no GRANTED scarce resource",
    "no DELIVERING continuation",
    "old runtime binding detached",
    "new binding uniquely owned",
  ],
  retains: [
    "durable lane_id",
    "operator name",
    "historical Execution Runs",
    "historical Agent Sessions",
    "cost/usage history",
    "notification identity",
  ],
});
