/**
 * DEMAND, NOT OWNERSHIP.
 *
 * When the fleet is full, "no" is not an answer anybody can act on. The lane
 * does not learn whether to wait a minute or give up, the Director does not
 * learn what the machine is holding, and nothing anywhere remembers that the
 * work was ever wanted. So a refusal has to become a RECORD: who asked, for
 * what, why they could not have it, and what would have to change.
 *
 * This is deliberately NOT a second lane registry. It stores no worktree, no
 * port, no process, no lifecycle — those all have owners already. It stores
 * only the fact that someone asked, the decision that was made, and enough
 * identity to find the real owner when the answer changes. A request here
 * confers nothing: admitting one does not reserve a slot, and losing this file
 * loses no resource, only the memory of who was waiting.
 *
 * Bounded on purpose. A queue that grows without limit is how a diagnostic aid
 * becomes an outage, so pending demand is capped and settled demand is trimmed
 * to a short tail — enough to answer "what happened to my request", not a
 * history nobody reads.
 *
 * Dimension-generic because server seats are not the only scarce thing on this
 * host: provider seats queue the same way, against a different ceiling. One
 * mechanism, several dimensions, rather than a parallel implementation each
 * time a new ceiling appears.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export const CAPACITY_DEMAND_SCHEMA = "vacilando.capacity_demand.v1";

export const DEMAND_DIMENSIONS = Object.freeze({
  SERVER: "dev_server",
  PROVIDER: "provider_seat",
  BROWSER: "browser_seat",
});

export const DEMAND_STATES = Object.freeze({
  ADMITTED: "ADMITTED",
  QUEUED: "QUEUED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
});

/** Caps. Small enough that the file stays readable by a human in a hurry. */
export const MAX_QUEUED = 64;
export const SETTLED_TAIL = 32;

const RUNTIME_ROOT = () =>
  process.env.VACILANDO_GATEWAY_ROOT
  || join(homedir(), ".local", "state", "alloy-dev", "gateway");

function storePath(root) {
  return join(root, "vacilando", "capacity-demand", "demand.json");
}

export function readDemand(root = RUNTIME_ROOT()) {
  try {
    const doc = JSON.parse(readFileSync(storePath(root), "utf8"));
    if (Array.isArray(doc?.requests)) return doc;
  } catch { /* a missing or unreadable store is an empty one */ }
  return { schema_version: CAPACITY_DEMAND_SCHEMA, requests: [] };
}

function writeDemand(doc, root) {
  const p = storePath(root);
  mkdirSync(dirname(p), { recursive: true });
  // Written through a temp file: a torn demand store would make the platform
  // forget who was waiting at exactly the moment it is busiest.
  const tmp = `${p}.tmp.${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`);
  renameSync(tmp, p);
  return p;
}

/**
 * Record what a lane asked for and what arbitration answered.
 *
 * One pending request per lane per dimension. A lane that asks twice is still
 * one lane wanting one server; letting it hold two queue positions would let
 * retrying jump the queue, which turns waiting into a race.
 */
export function recordDemand({
  dimension = DEMAND_DIMENSIONS.SERVER,
  laneId = null,
  worktree = null,
  slot = null,
  placement = null,
  reason = null,
  capability = null,
  decision = null,
  root = RUNTIME_ROOT(),
} = {}) {
  const doc = readDemand(root);
  const now = new Date().toISOString();
  const state = stateFor(decision);

  const key = (r) => r.dimension === dimension
    && ((laneId && r.lane_id === laneId) || (!laneId && worktree && r.worktree === worktree));
  const existing = doc.requests.find((r) => key(r) && r.state === DEMAND_STATES.QUEUED);

  const record = {
    request_id: existing?.request_id ?? `cdr_${randomBytes(7).toString("hex")}`,
    schema_version: CAPACITY_DEMAND_SCHEMA,
    dimension,
    lane_id: laneId,
    worktree,
    slot,
    placement,
    reason,
    requested_capability: capability,
    // First ask wins, so waiting is measured from when the lane started
    // waiting rather than from its most recent retry.
    requested_at: existing?.requested_at ?? now,
    updated_at: now,
    state,
    admission_state: decision?.decision ?? null,
    tier: decision?.tier ?? null,
    under_burst: decision?.tier === "burst",
    blocker: state === DEMAND_STATES.QUEUED ? (decision?.queue_reason ?? "capacity") : null,
    blocker_detail: decision?.reason ?? null,
    holder_selected: decision?.reclaim
      ? {
        slot: decision.reclaim.slot, port: decision.reclaim.port,
        worktree: decision.reclaim.lane_worktree ?? null,
        holder_class: decision.reclaim.holder_class ?? null,
        release_method: decision.reclaim.release_method ?? null,
        chosen_because: decision.reclaim.chosen_because ?? null,
      }
      : null,
    ceilings: decision
      ? {
        running: decision.running, normal: decision.normal_ceiling,
        burst: decision.burst_ceiling, measured_knee: decision.measured_knee,
      }
      : null,
  };

  const rest = doc.requests.filter((r) => r.request_id !== record.request_id);
  doc.requests = prune([...rest, record]);
  doc.schema_version = CAPACITY_DEMAND_SCHEMA;
  writeDemand(doc, root);
  return withPosition(record, doc.requests);
}

function stateFor(decision) {
  const k = decision?.decision;
  if (k === "START" || k === "RECLAIM_THEN_START" || k === "ALREADY_RUNNING") return DEMAND_STATES.ADMITTED;
  if (k === "QUEUE") return DEMAND_STATES.QUEUED;
  if (k === "REFUSE") return DEMAND_STATES.REJECTED;
  return DEMAND_STATES.QUEUED;
}

/**
 * Bounded. Queued demand is kept oldest-first up to the cap; settled demand is
 * kept only as a short tail so a request can be explained after the fact.
 *
 * When the cap is hit the NEWEST queued request is dropped, not the oldest —
 * dropping the oldest would silently punish whoever has waited longest.
 */
function prune(requests) {
  const queued = requests
    .filter((r) => r.state === DEMAND_STATES.QUEUED)
    .sort((a, b) => String(a.requested_at).localeCompare(String(b.requested_at)))
    .slice(0, MAX_QUEUED);
  const settled = requests
    .filter((r) => r.state !== DEMAND_STATES.QUEUED)
    .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
    .slice(-SETTLED_TAIL);
  return [...queued, ...settled];
}

function withPosition(record, all) {
  if (record.state !== DEMAND_STATES.QUEUED) return { ...record, queue_position: null, queue_depth: null };
  const q = all
    .filter((r) => r.state === DEMAND_STATES.QUEUED && r.dimension === record.dimension)
    .sort((a, b) => String(a.requested_at).localeCompare(String(b.requested_at)));
  return {
    ...record,
    queue_position: q.findIndex((r) => r.request_id === record.request_id) + 1,
    queue_depth: q.length,
  };
}

/** Everything still waiting on a dimension, oldest first, with positions. */
export function queuedDemand({ dimension = DEMAND_DIMENSIONS.SERVER, root = RUNTIME_ROOT() } = {}) {
  const doc = readDemand(root);
  return doc.requests
    .filter((r) => r.state === DEMAND_STATES.QUEUED && r.dimension === dimension)
    .sort((a, b) => String(a.requested_at).localeCompare(String(b.requested_at)))
    .map((r, i, arr) => ({ ...r, queue_position: i + 1, queue_depth: arr.length }));
}

export function settleDemand({ requestId, state, note = null, root = RUNTIME_ROOT() } = {}) {
  const doc = readDemand(root);
  const r = doc.requests.find((x) => x.request_id === requestId);
  if (!r) return null;
  r.state = state;
  r.updated_at = new Date().toISOString();
  if (note) r.blocker_detail = note;
  doc.requests = prune(doc.requests);
  writeDemand(doc, root);
  return r;
}

/**
 * Re-offer waiting demand when capacity comes back.
 *
 * Oldest first, and it STOPS at the first request that still cannot be served.
 * Continuing past it would serve a newer lane ahead of an older one purely
 * because the older one wanted something bigger — the queue would silently stop
 * being a queue. Re-arbitration is supplied by the caller so this module keeps
 * making no capacity decisions of its own.
 */
export function reconsiderDemand({
  dimension = DEMAND_DIMENSIONS.SERVER,
  arbitrate = null,
  root = RUNTIME_ROOT(),
  limit = 8,
} = {}) {
  if (typeof arbitrate !== "function") {
    return { reconsidered: 0, admitted: [], still_queued: queuedDemand({ dimension, root }).length };
  }
  const admitted = [];
  let reconsidered = 0;
  for (const r of queuedDemand({ dimension, root }).slice(0, limit)) {
    reconsidered += 1;
    const decision = arbitrate(r);
    const state = stateFor(decision);
    if (state !== DEMAND_STATES.ADMITTED) break;
    settleDemand({ requestId: r.request_id, state, note: decision?.reason ?? null, root });
    admitted.push({ request_id: r.request_id, lane_id: r.lane_id, decision });
  }
  return { reconsidered, admitted, still_queued: queuedDemand({ dimension, root }).length };
}
