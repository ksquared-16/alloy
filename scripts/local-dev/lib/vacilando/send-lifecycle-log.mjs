/**
 * WHAT THE PRE-SEND RECONCILER DECIDED, WRITTEN DOWN.
 *
 * `reconcileLaneBeforeSend` answers one question on every operator message —
 * "is the run this lane is holding genuinely stale?" — and returns
 * `stale_run_closed` to the caller, which renders it as "Previous run was stale
 * and was closed". The answer was never stored anywhere.
 *
 * That made the behaviour unverifiable, and worse, it made it LOOK verifiable.
 * Two attempts to confirm the lifecycle fix counted the string
 * `stale_run_closed` inside execution-run records and reported a live positive.
 * The matches were prose: the phrase appeared in a run's own instruction text
 * and in the agent report quoting it. No such field is persisted on a run at
 * all, so the measurement was of my own writing.
 *
 * A DECISION LOG, NOT A SECOND RUN-STATE SYSTEM. Nothing here is authority for
 * anything. It records what was already decided, in the same append-only
 * `<root>/vacilando/*.jsonl` shape `checkpoint-adoptions.jsonl` uses, so the
 * question can be answered from runtime data rather than from text search.
 *
 * IT MAY NEVER CHANGE THE ANSWER. Every write is wrapped and swallowed by its
 * caller: a full disk, a read-only root or a serialisation failure must not
 * turn a send into a refusal. Telemetry that can break the thing it observes is
 * worse than no telemetry.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const SEND_LIFECYCLE_SCHEMA = "vacilando.send_lifecycle_decision.v1";
export const SEND_LIFECYCLE_FILE = "send-lifecycle-decisions.jsonl";

/** Same default the sibling append-only logs use, so one root holds all of them. */
function defaultRoot() {
  return join(process.env.HOME || "", ".local", "state", "alloy-dev", "gateway");
}

export function sendLifecycleLogPath(root) {
  return join(root || defaultRoot(), "vacilando", SEND_LIFECYCLE_FILE);
}

/**
 * Record one pre-send decision.
 *
 * The fields are exactly what "was this lane's run closed, and was that right?"
 * needs: which lane, which run, what the run was doing BEFORE the decision, the
 * decision itself, why, and when. `phase` is the load-bearing one — a close is
 * only defensible against a STRANDED run, and only readable afterwards if the
 * phase that justified it was recorded at the time.
 */
export function recordSendLifecycleDecision({
  laneId = null,
  runId = null,
  phase = null,
  phaseReason = null,
  staleRunClosed = false,
  reason = null,
  abandoned = null,
  nowMs = Date.now(),
  root = null,
} = {}) {
  const entry = {
    schema_version: SEND_LIFECYCLE_SCHEMA,
    at: new Date(nowMs).toISOString(),
    lane_id: laneId,
    run_id: runId,
    // The phase BEFORE the decision, not after: afterwards a closed run is
    // TERMINAL either way, which is precisely the information that was lost.
    prior_phase: phase,
    prior_phase_reason: phaseReason,
    stale_run_closed: Boolean(staleRunClosed),
    reason,
    abandoned_count: Array.isArray(abandoned) ? abandoned.length : (abandoned ?? null),
  };
  try {
    const path = sendLifecycleLogPath(root);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(entry)}\n`);
    return { ok: true, path, entry };
  } catch (error) {
    // Deliberately swallowed by the caller. See the header: an unwritable log
    // must never turn a send into a refusal.
    return { ok: false, error: String(error?.message || error).slice(0, 200), entry };
  }
}

/**
 * Read decisions back, newest last.
 *
 * Structured rows only. A caller that wants to know whether a lane's last send
 * closed a stale run reads `stale_run_closed` from a row — never a substring of
 * somebody's prose, which is the mistake this file exists to make impossible.
 */
export function readSendLifecycleDecisions({ laneId = null, limit = 50, root = null } = {}) {
  const path = sendLifecycleLogPath(root);
  if (!existsSync(path)) return [];
  let lines = [];
  try { lines = readFileSync(path, "utf8").split("\n").filter(Boolean); } catch { return []; }
  const rows = [];
  for (const line of lines) {
    let row = null;
    try { row = JSON.parse(line); } catch { continue; }
    if (row?.schema_version !== SEND_LIFECYCLE_SCHEMA) continue;
    if (laneId && row.lane_id !== laneId) continue;
    rows.push(row);
  }
  return limit > 0 ? rows.slice(-limit) : rows;
}

/** The one question an operator actually asks, answered from data. */
export function lastSendDecisionForLane(laneId, { root = null } = {}) {
  const rows = readSendLifecycleDecisions({ laneId, limit: 0, root });
  return rows.length ? rows[rows.length - 1] : null;
}
