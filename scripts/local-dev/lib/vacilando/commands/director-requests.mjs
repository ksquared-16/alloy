/**
 * Vacilando — Director request store (durable, server-owned).
 *
 * The authoritative record of every confirmed Director send. A request record is
 * created BEFORE provider execution (status "queued") and updated through its
 * lifecycle. Append-only event log (created + updates) projected to current
 * state per request_id — so the browser is never the source of truth and a
 * refresh/restart always restores the exact status.
 *
 * Statuses: queued → starting → worker-running → worker-responded
 *           | authentication-required | timed-out | failed | cancelled
 *           | interrupted (recovered honestly after a server restart)
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "director");
const REQ_LOG = join(DIR, "requests.jsonl");

export const TERMINAL = new Set(["worker-responded", "authentication-required", "failed", "cancelled", "timed-out"]);
export const REQUEST_TYPES = new Set(["quick-ask", "worker-instruction"]);

function ensureDir() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true }); }
function append(ev) { ensureDir(); appendFileSync(REQ_LOG, JSON.stringify(ev) + "\n", "utf8"); }
const iso = (ms) => new Date(ms).toISOString();

/** Create a durable request (status: queued) BEFORE any provider work. */
export function createRequest({ slot, worktree, provider, instruction, request_type = "worker-instruction", mission_id = null, project_id = "alloy", retry_of = null, actor = "operator", audit_ref = null, nowMs }) {
  const now = nowMs ?? Date.now();
  const id = "req_" + createHash("sha256").update(`${now}:${slot}:${instruction}:${Math.random()}`).digest("hex").slice(0, 18);
  const rec = {
    schema_version: "vacilando.director-request.v1",
    request_id: id, worker_slot: slot, worktree: worktree || null, project_id, mission_id,
    request_type: REQUEST_TYPES.has(request_type) ? request_type : "worker-instruction",
    instruction, provider: provider || null, provider_session_id: null,
    status: "queued", created_at: iso(now), queued_at: iso(now), started_at: null, updated_at: iso(now),
    completed_at: null, failed_at: null, response: null, error_code: null, error_message: null,
    duration_ms: null, usage: null, retry_of_request_id: retry_of, audit_ref, actor,
  };
  append({ event: "created", ...rec });
  return rec;
}

/** Append a lifecycle update for a request. */
export function updateRequest(request_id, patch, { nowMs } = {}) {
  append({ event: "update", request_id, updated_at: iso(nowMs ?? Date.now()), ...patch });
}

/** Project the append-only log to current request states. */
export function readRequests(slot = null, limit = 60) {
  let lines = [];
  try { lines = readFileSync(REQ_LOG, "utf8").split("\n").filter(Boolean); } catch { return []; }
  const byId = new Map();
  for (const line of lines) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const id = e.request_id; if (!id) continue;
    if (e.event === "created") { const { event, ...rec } = e; byId.set(id, rec); }
    else { const cur = byId.get(id); if (cur) { const { event, request_id, ...patch } = e; Object.assign(cur, patch); } }
  }
  let out = [...byId.values()];
  if (slot != null) out = out.filter((r) => r.worker_slot === slot);
  out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); // newest first
  return out.slice(0, limit);
}

export const pendingCount = (slot) => readRequests(slot, 300).filter((r) => !TERMINAL.has(r.status)).length;

/**
 * On server start, any request left non-terminal was interrupted (its background
 * turn died with the process). Mark them honestly — never leave a fake "running".
 */
export function recoverInterrupted({ nowMs } = {}) {
  const stuck = readRequests(null, 500).filter((r) => !TERMINAL.has(r.status));
  for (const r of stuck) {
    updateRequest(r.request_id, { status: "failed", error_code: "interrupted", error_message: "Execution was interrupted by a Vacilando server restart. Retry to run again.", failed_at: iso(nowMs ?? Date.now()) }, { nowMs });
  }
  return stuck.length;
}
