/**
 * Vacilando — Mission store (durable, server-owned).
 *
 * The authoritative record of every engineering MISSION. A mission is the
 * durable identity that survives:
 *   - a single Claude/Cursor provider process
 *   - a single Director request
 *   - a single provider session
 *   - a browser connection
 *   - a Vacilando server restart
 *
 * A provider session is replaceable infrastructure; the mission is the truth.
 * This mirrors the proven Director-request store: an append-only event log
 * (created + updates) projected to current state per mission_id, so the browser
 * is never the source of truth and a refresh/restart always restores the exact
 * status. No process handles or secrets are ever persisted here.
 *
 * Statuses (lifecycle):
 *   draft → ready → starting → running
 *         → waiting_for_operator | blocked | completed | failed
 *         → stopping → stopped
 *         → interrupted  (recovered honestly after a server restart)
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "missions");
const MISSION_LOG = join(DIR, "missions.jsonl");

// Terminal: no further execution is expected without an explicit operator restart.
export const TERMINAL = new Set(["completed", "failed", "stopped"]);
// Live: a mission in one of these states expects a tracked child process to exist.
// After a server restart these cannot be true (the child died) → recovery.
export const LIVE = new Set(["starting", "running", "stopping"]);
// Durable wait states: no live process, correctly persisted across a restart.
export const WAITING = new Set(["waiting_for_operator", "blocked"]);
export const ALL_STATUSES = new Set([
  "draft", "ready", "starting", "running", "waiting_for_operator",
  "waiting_for_acceptance", "blocked", "stopping", "stopped",
  "completed", "closed", "failed", "interrupted",
]);
// Terminal states past which no further execution is expected. `closed` is the
// tidy terminal (accepted + wound down: capacity freed, artifacts preserved).

function ensureDir() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true }); }
function append(ev) { ensureDir(); appendFileSync(MISSION_LOG, JSON.stringify(ev) + "\n", "utf8"); }
const iso = (ms) => new Date(ms).toISOString();

/**
 * Create a durable mission. Starts in "ready" (a real, provisionable mission)
 * unless `draft` is requested. Returns the projected record.
 */
export function createMission({
  slot, worktree, branch = null, provider, title, objective,
  project_id = "alloy", status = "ready", actor = "operator", audit_ref = null, nowMs,
}) {
  const now = nowMs ?? Date.now();
  const id = "msn_" + createHash("sha256").update(`${now}:${slot}:${title}:${objective}:${Math.random()}`).digest("hex").slice(0, 18);
  const rec = {
    schema_version: "vacilando.mission.v1",
    mission_id: id, project_id, worker_slot: slot, worktree: worktree || null, branch: branch || null,
    title: title || "(untitled mission)", objective: objective || "",
    status: ALL_STATUSES.has(status) ? status : "ready",
    provider: provider || null, provider_session_id: null,
    created_at: iso(now), started_at: null, updated_at: iso(now),
    completed_at: null, stopped_at: null, last_activity_at: null,
    current_phase: null, latest_summary: null,
    pending_question: null, pending_approval: null,
    error_code: null, error_message: null,
    active_request_id: null, turn_count: 0,
    audit_ref, actor,
  };
  append({ event: "created", ...rec });
  return rec;
}

/** Append a lifecycle update. Always bumps updated_at. */
export function updateMission(mission_id, patch, { nowMs } = {}) {
  append({ event: "update", mission_id, updated_at: iso(nowMs ?? Date.now()), ...patch });
}

/** Project the append-only log to current mission states (newest first). */
export function readMissions(slot = null, limit = 100) {
  let lines = [];
  try { lines = readFileSync(MISSION_LOG, "utf8").split("\n").filter(Boolean); } catch { return []; }
  const byId = new Map();
  for (const line of lines) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const id = e.mission_id; if (!id) continue;
    if (e.event === "created") { const { event, ...rec } = e; byId.set(id, rec); }
    else { const cur = byId.get(id); if (cur) { const { event, mission_id: _mid, ...p } = e; Object.assign(cur, p); } }
  }
  let out = [...byId.values()];
  if (slot != null) out = out.filter((m) => m.worker_slot === slot);
  out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return out.slice(0, limit);
}

/** Project a single mission by id (or null). */
export function getMission(mission_id) {
  if (!mission_id) return null;
  return readMissions(null, 1000).find((m) => m.mission_id === mission_id) || null;
}

/** Missions currently awaiting operator input (Needs You feed). */
export function missionsWaiting(slot = null) {
  return readMissions(slot, 500).filter((m) => WAITING.has(m.status));
}

/** Count non-terminal missions for a slot (closeout / posture). */
export const activeMissionCount = (slot) =>
  readMissions(slot, 500).filter((m) => !TERMINAL.has(m.status)).length;

/**
 * On server start, any mission left in a LIVE state lost its owning child with
 * the previous process. Project ONE honest state:
 *   - provider_session_id present → "interrupted" (resumable where the provider
 *     supports --resume; the executor decides at resume time)
 *   - no session captured yet     → "interrupted" too, but not resumable —
 *     the caller records that distinction via `resumable`.
 * WAITING / TERMINAL / draft / ready missions are already correct → untouched.
 * Returns the list of recovered missions with their resumability.
 */
export function recoverMissions({ providerResumable = () => false, nowMs } = {}) {
  const now = nowMs ?? Date.now();
  const stuck = readMissions(null, 1000).filter((m) => LIVE.has(m.status));
  const recovered = [];
  for (const m of stuck) {
    const resumable = Boolean(m.provider_session_id) && providerResumable(m.provider);
    updateMission(m.mission_id, {
      status: "interrupted",
      error_code: "interrupted",
      error_message: resumable
        ? "Execution was interrupted by a Vacilando server restart. The provider session was captured — Resume Mission to continue where it left off."
        : "Execution was interrupted by a Vacilando server restart before a provider session was captured. Restart the mission to run it again.",
    }, { nowMs: now });
    recovered.push({ mission_id: m.mission_id, resumable });
  }
  return recovered;
}
