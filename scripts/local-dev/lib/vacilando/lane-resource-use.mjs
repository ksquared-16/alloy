/**
 * LANE RESOURCE USE — the attacher.
 *
 * "How much of this machine is that lane holding?" had no answer anywhere. Home
 * and System reported HOST totals, and the operator's actual question — which
 * lane is the one eating the Mac mini — could only be answered by reading `ps`
 * by hand and recognising the worktree in a command line.
 *
 * WHAT MAKES THIS TRUSTWORTHY RATHER THAN A GUESS. Every part of the chain
 * already had a canonical owner, and this joins them rather than inventing a
 * fourth:
 *
 *   lane            → development-lane
 *   provider seat   → provider-capacity.observeProviderSeats (pane → lane)
 *   process tree    → process-attribution (ancestry, not cwd)
 *   resident memory → health-probes.probeProcessMemory
 *
 * Ancestry is the link that holds. The alternative — matching a worktree path
 * in a command line — is exactly what failed before: the workload that consumed
 * half the host ran from /private/tmp and belonged to no worktree at all, while
 * its process tree ran straight back to a provider seat.
 *
 * WHAT IT REFUSES TO DO. It reports memory and declares CPU absent. It does not
 * estimate, apportion a host total, or divide load average by lane count. A
 * lane it cannot measure is UNKNOWN, never zero.
 */
import { laneResourceUse } from "./process-attribution.mjs";

export const LANE_RESOURCE_SCHEMA = "vacilando.lane_resource_use.v1";

/**
 * A SHORT MEMO, BECAUSE THE LANE LIST POLLS.
 *
 * This attacher costs two `ps -A` sweeps, and observeLiveSeats already runs a
 * third of its own. At poll frequency that is three full process-table reads a
 * second on a Mac mini whose capacity history includes a load average of 54.
 * Resource use does not change meaningfully inside a few seconds, and this is a
 * READING, not a control input — so it is computed at most once per window and
 * shared by every poll inside it.
 */
export const LANE_RESOURCE_TTL_MS = 5000;
let memo = { at: 0, rows: null };

/** Certification and tests need a deterministic starting point. */
export function resetLaneResourceCache() {
  memo = { at: 0, rows: null };
}

/**
 * Attach `resource_use` to each lane. Never throws: resource visibility is
 * secondary to lane discovery, and a lane list that fails because `ps` was slow
 * is a worse product than a lane list with one field missing.
 */
export async function attachLaneResourceUse(lanes = [], {
  observeSeats = null,
  readProcessTable = null,
  readProcessMemory = null,
  nowMs = Date.now(),
} = {}) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  const fresh = memo.rows && (nowMs - memo.at) < LANE_RESOURCE_TTL_MS;
  if (fresh && !observeSeats && !readProcessTable && !readProcessMemory) {
    return applyRows(list, memo.rows);
  }
  try {
    const { probeProcessTable, probeProcessMemory } = await import("./health-probes.mjs");
    const { parseProcessTable } = await import("./process-attribution.mjs");

    // The two reads are independent; run them together rather than in series.
    const [text, memoryByPid] = await Promise.all([
      readProcessTable ? readProcessTable() : probeProcessTable({}),
      readProcessMemory ? readProcessMemory() : probeProcessMemory({}),
    ]);
    if (!text) return list;
    const processes = parseProcessTable(text);

    // observeLiveSeats is the entry point that GATHERS: it reads tmux panes,
    // agent sessions and run state, then correlates. observeProviderSeats is
    // the pure correlator underneath it and returns nothing when handed no
    // panes — which is how this first read zero seats on a host with two live
    // provider panes in front of it.
    let seats = [];
    if (observeSeats) {
      seats = await observeSeats(list);
    } else {
      const { observeLiveSeats } = await import("./provider-capacity.mjs");
      const observed = await observeLiveSeats({});
      seats = Array.isArray(observed) ? observed : (observed?.seats || observed?.processes || []);
    }

    const rows = laneResourceUse({ seats, processes, memoryByPid, nowMs });
    memo = { at: nowMs, rows };
    return applyRows(list, rows);
  } catch {
    return list;
  }
}

function applyRows(lanes, rows) {
  const byLane = new Map(rows.map((r) => [r.lane_id, r]));
  return lanes.map((l) => {
    const r = byLane.get(l?.lane_id);
    return r ? { ...l, resource_use: { schema_version: LANE_RESOURCE_SCHEMA, ...r } } : l;
  });
}
