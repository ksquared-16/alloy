/**
 * PLACEMENT IS NOT EXISTENCE.
 *
 * Fourteen durable lanes, twelve runtime slots. That gap is permanent and it is
 * not a fault — it is what lets a lane be created, worked on, set aside and
 * resumed without competing for a scarce runtime resource the whole time. The
 * bug is not the gap; the bug is a model that has no word for the lanes in it,
 * so "no slot" comes out sounding like "no lane".
 *
 * Three conditions, deliberately distinct:
 *
 *   PLACED       the lane owns a managed slot, and everything runtime follows
 *                from that: a port, a QA route, a server it may start.
 *   PARKED       the lane is durable and holds no slot. It keeps its identity,
 *                its branch and worktree if it has them, its history, its runs,
 *                its uncommitted work, and its eligibility to be placed later.
 *   NO_WORKTREE  the lane exists but has no working tree at all. NOT a kind of
 *                parked — parked means "not on the host right now", this means
 *                "there is nothing to put on it", and the dispositions differ.
 *
 * A PARKED lane must never be given a fabricated slot, port, server or QA
 * route. An invented port is worse than an absent one: absent is legible, and
 * invented sends someone to a URL that will never answer.
 *
 * This composes and stores nothing. Lanes come from the lane registry, slots
 * from the registration metadata, worktree truth from the filesystem.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const LANE_PLACEMENT_SCHEMA = "vacilando.lane_placement.v1";

export const PLACEMENT = Object.freeze({
  PLACED: "PLACED",
  PARKED: "PARKED",
  NO_WORKTREE: "NO_WORKTREE",
});

const RUNTIME_ROOT = () =>
  process.env.VACILANDO_GATEWAY_ROOT
  || join(homedir(), ".local", "state", "alloy-dev", "gateway");

/** Registrations, keyed by worktree name. The registry owns slot ownership. */
export function readRegistrations(metaDir) {
  const out = new Map();
  let files = [];
  try { files = readdirSync(metaDir).filter((f) => f.endsWith(".env")); } catch { return out; }
  for (const f of files) {
    let txt = "";
    try { txt = readFileSync(join(metaDir, f), "utf8"); } catch { continue; }
    const pick = (k) => {
      const m = txt.match(new RegExp(`^${k}="?([^"\\n]*)"?`, "m"));
      return m ? m[1] : null;
    };
    out.set(f.replace(/\.env$/, ""), {
      slot: Number(pick("ALLOY_WORKTREE_SLOT")) || null,
      branch: pick("ALLOY_WORKTREE_BRANCH"),
      port: Number(pick("PORT")) || null,
    });
  }
  return out;
}

export function readLanes(root = RUNTIME_ROOT()) {
  try {
    const doc = JSON.parse(readFileSync(join(root, "vacilando", "lanes", "lanes.json"), "utf8"));
    const l = doc?.lanes ?? doc;
    return Array.isArray(l) ? l : Object.values(l || {});
  } catch { return []; }
}

/**
 * Classify one lane.
 *
 * A registration is what makes a lane PLACED — not a running server, and not a
 * port answering. A lane whose server is stopped is still placed; it owns the
 * slot and nobody else may have it.
 */
export function classifyLane(lane, { registrations, worktreesRoot }) {
  const binding = lane?.binding || {};
  const name = binding.worktree_name || null;
  const path = binding.worktree_path || (name ? join(worktreesRoot, name) : null);
  const exists = path ? existsSync(path) : false;
  const reg = name ? registrations.get(name) || null : null;

  let placement;
  if (!name) placement = PLACEMENT.NO_WORKTREE;
  else if (!exists) placement = PLACEMENT.NO_WORKTREE;
  else if (reg && reg.slot) placement = PLACEMENT.PLACED;
  else placement = PLACEMENT.PARKED;

  const placed = placement === PLACEMENT.PLACED;
  return {
    lane_id: lane?.lane_id ?? null,
    title: lane?.title ?? null,
    status: lane?.status ?? null,
    worktree: name,
    worktree_path: path,
    worktree_exists: exists,
    placement,
    // Runtime facts exist ONLY when placed. Null, never a plausible-looking
    // number: an invented port sends someone to a URL that will never answer.
    slot: placed ? reg.slot : null,
    port: placed ? reg.port : null,
    registered_branch: reg?.branch ?? null,
    // What a parked lane keeps. Stated positively because the whole point of
    // the state is that nothing is lost by being in it.
    retains: placement === PLACEMENT.NO_WORKTREE
      ? ["lane identity", "history", "runs"]
      : ["lane identity", "branch", "worktree", "history", "runs", "uncommitted work", "placement eligibility"],
    placement_eligible: placement === PLACEMENT.PARKED,
    disposition_required: placement === PLACEMENT.NO_WORKTREE,
  };
}

export function classifyLanes({
  root = RUNTIME_ROOT(),
  worktreesRoot = join(homedir(), "Code", "alloy-worktrees"),
  lanes = null,
  registrations = null,
} = {}) {
  const regs = registrations || readRegistrations(join(root, "metadata"));
  const items = lanes || readLanes(root);
  const rows = items.map((l) => classifyLane(l, { registrations: regs, worktreesRoot }));
  const count = (p) => rows.filter((r) => r.placement === p).length;
  return {
    schema_version: LANE_PLACEMENT_SCHEMA,
    observed_at: new Date().toISOString(),
    lanes: rows,
    rollup: {
      durable: rows.length,
      placed: count(PLACEMENT.PLACED),
      parked: count(PLACEMENT.PARKED),
      no_worktree: count(PLACEMENT.NO_WORKTREE),
      // Two slots claimed by the same lane, or one slot claimed twice, is a
      // registry fault rather than a capacity fact — surfaced, not smoothed.
      slot_conflicts: slotConflicts(rows),
    },
  };
}

function slotConflicts(rows) {
  const bySlot = new Map();
  for (const r of rows) {
    if (!r.slot) continue;
    if (!bySlot.has(r.slot)) bySlot.set(r.slot, []);
    bySlot.get(r.slot).push(r.lane_id);
  }
  return [...bySlot.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([slot, ids]) => ({ slot, lane_ids: ids }));
}
