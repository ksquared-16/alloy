/**
 * ONE OPEN LANE OWNS ONE DURABLE WORKTREE FOR THE LIFETIME OF THE LANE.
 *
 * Execution Runs come and go inside a lane. Capacity is taken and released.
 * Provider sessions start and stop. None of that is the end of the lane, and
 * none of it may retire the lane's worktree.
 *
 * WHAT WENT WRONG. `releaseLaneExecutionCapacity` — a CAPACITY-lifetime
 * operation — called `alloy-sprint-finish`, which is a LANE-lifetime one. On
 * 2026-09-01T23:43:22Z lane_73a897409906 (Runtime Performance) released
 * capacity; five seconds later wt1-work-unit-grade-a carried
 * ALLOY_WORKER_LIFECYCLE="finished" and its metadata had been archived. The
 * lane stayed OPEN and kept accepting instructions, so the fleet held an active
 * lane whose worktree was unmanaged, unknown, slot-less and port-less. Every
 * managed environment operation for that lane then failed, and a governed QA
 * request (gar_97d071ef22861f) was filed against a Slot 1 that no longer
 * existed — an action that could never execute.
 *
 * The first repair removed the WRONG caller. This module adds the RIGHT owner,
 * and the two guards that would have made the damage visible immediately:
 *
 *   closeDurableLane()            the SOLE path that may retire a worktree
 *   assertLaneDispatchable()      no instruction enters an unmanaged worktree
 *   assertManagedLaneEnvironment() no QA action is accepted without a real slot
 *   resolveLaneWorktree()         ONE answer to "what worktree, slot and port
 *                                 does this lane own, and is it managed?"
 *
 * A SURVIVING DIRECTORY IS NOT OWNERSHIP. The incident's directory was intact
 * the whole time; what it had lost was its managed registration. So every check
 * here reads the registration, never merely `existsSync`.
 *
 * ONE SLOT TRUTH. The managed metadata registration (`metadata/<name>.env`,
 * written by alloy-sprint-start / alloy-worktree-adopt) is the AUTHORITY for a
 * lane's slot and port. The durable lane binding is a PROJECTION of it. They
 * diverged because a capacity release nulled `binding.slot` while the registry
 * kept slot 1 — dual truth, which this module resolves in one direction only:
 * registry -> binding, never the reverse.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { getDurableLane, listDurableLanes, readDevelopmentLaneStore, writeDevelopmentLaneStore } from "./development-lane.mjs";
import { readAllMetadata, resolveRuntimeConfig } from "./workspace-facts.mjs";

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

/** Lane statuses. OPEN is spelled ACTIVE in the store; do not invent a third. */
export const LANE_OPEN = "ACTIVE";
export const LANE_CLOSED = "CLOSED";
export const LANE_ARCHIVED = "ARCHIVED";
export const OPEN_LANE_STATUSES = Object.freeze([LANE_OPEN]);

/**
 * Named lifecycle refusals. Each says which invariant failed, so an operator
 * reading one knows what to repair rather than that something was "denied".
 */
export const LANE_LIFECYCLE_ERRORS = Object.freeze({
  LANE_NOT_FOUND: "lane_not_found",
  LANE_NOT_OPEN: "lane_not_open",
  WORKTREE_UNBOUND: "lane_worktree_unbound",
  WORKTREE_MISSING: "lane_worktree_missing",
  WORKTREE_UNREGISTERED: "lane_worktree_unregistered",
  NOT_MANAGED: "lane_worktree_not_managed",
  SLOT_UNREGISTERED: "lane_slot_unregistered",
  SLOT_MISMATCH: "lane_slot_mismatch",
});

const DETAIL = Object.freeze({
  lane_not_found: "No durable lane with that id.",
  lane_not_open: "The lane is closed. A closed lane's worktree has been retired and cannot accept work.",
  lane_worktree_unbound: "The lane has no durable worktree bound to it.",
  lane_worktree_missing: "The lane's worktree directory is gone from disk.",
  lane_worktree_unregistered: "The lane's worktree has no managed registration. Managed worktree registration is required before this operation.",
  lane_worktree_not_managed: "The lane's worktree registration is marked finished, so the worktree is no longer managed. Managed worktree registration is required before this operation.",
  lane_slot_unregistered: "The lane's worktree is registered without a slot, so it has no port or managed environment.",
  lane_slot_mismatch: "The registered slot points at a different worktree than the lane is bound to.",
});

export function lifecycleDetail(code) {
  return DETAIL[code] || "Lane lifecycle invariant not satisfied.";
}

const norm = (v) => String(v ?? "").trim();
const asSlot = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
};
const asPort = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** The managed registration for one worktree name, or null. */
export function registrationForWorktree(name, { cfg = null, metadata = null } = {}) {
  const wanted = norm(name);
  if (!wanted) return null;
  const conf = cfg || resolveRuntimeConfig();
  const meta = metadata || readAllMetadata(conf);
  return meta.find((m) => norm(m.worktree) === wanted) || null;
}

/**
 * THE ONE ANSWER TO "WHAT DOES THIS LANE OWN, AND IS IT STILL MANAGED?"
 *
 * Every dispatch guard, every environment precondition and every lifecycle
 * decision reads this. It never treats a directory on disk, or a stale
 * `binding.worktree_path`, as proof of ownership.
 */
export function resolveLaneWorktree(laneId, { root = runtimeRoot(), cfg = null, metadata = null } = {}) {
  const lane = getDurableLane(String(laneId || "").trim(), root);
  if (!lane) {
    return { ok: false, code: LANE_LIFECYCLE_ERRORS.LANE_NOT_FOUND, detail: lifecycleDetail("lane_not_found"), lane_id: laneId || null };
  }
  const status = norm(lane.status) || LANE_OPEN;
  const binding = lane.binding || {};
  const base = {
    lane_id: lane.lane_id,
    lane_name: lane.name || null,
    lane_status: status,
    lane_open: OPEN_LANE_STATUSES.includes(status),
    worktree_name: binding.worktree_name || null,
    worktree_path: binding.worktree_path || null,
    branch: binding.branch || null,
    tmux_session: binding.tmux_session || null,
    binding_slot: asSlot(binding.slot),
  };

  if (!base.lane_open) {
    return { ...base, ok: false, code: LANE_LIFECYCLE_ERRORS.LANE_NOT_OPEN, detail: lifecycleDetail("lane_not_open") };
  }
  if (!base.worktree_name && !base.worktree_path) {
    return { ...base, ok: false, code: LANE_LIFECYCLE_ERRORS.WORKTREE_UNBOUND, detail: lifecycleDetail("lane_worktree_unbound") };
  }

  const conf = cfg || resolveRuntimeConfig();
  const meta = metadata || readAllMetadata(conf);
  const reg = registrationForWorktree(base.worktree_name, { cfg: conf, metadata: meta })
    // A lane bound only by path still has to be found by REGISTRATION, not by
    // the path existing.
    || meta.find((m) => norm(m.path) && norm(m.path) === norm(base.worktree_path))
    || null;

  const out = {
    ...base,
    registered: Boolean(reg),
    registry: reg
      ? {
        worktree: reg.worktree,
        slot: asSlot(reg.slot),
        port: asPort(reg.port),
        path: reg.path || null,
        branch_expected: reg.branch_expected || null,
        lifecycle: norm(reg.lifecycle).toLowerCase() || null,
        provider: reg.provider || null,
      }
      : null,
    managed: false,
    slot: null,
    port: null,
    slot_source: null,
    divergence: [],
  };

  if (!reg) {
    return { ...out, ok: false, code: LANE_LIFECYCLE_ERRORS.WORKTREE_UNREGISTERED, detail: lifecycleDetail("lane_worktree_unregistered") };
  }
  if (out.registry.lifecycle === "finished") {
    return { ...out, ok: false, code: LANE_LIFECYCLE_ERRORS.NOT_MANAGED, detail: lifecycleDetail("lane_worktree_not_managed") };
  }
  out.managed = true;

  // Mismatch before absence: "the slot is registered to a different worktree"
  // is the more specific answer, and reporting "the directory is gone" for it
  // would send someone to repair the wrong thing.
  if (base.worktree_path && out.registry.path && norm(base.worktree_path) !== norm(out.registry.path)) {
    return {
      ...out,
      ok: false,
      code: LANE_LIFECYCLE_ERRORS.SLOT_MISMATCH,
      detail: `${lifecycleDetail("lane_slot_mismatch")} Lane is bound to ${base.worktree_path}; slot ${out.registry.slot} is registered to ${out.registry.path}.`,
    };
  }
  const path = out.registry.path || base.worktree_path;
  if (path && !existsSync(path)) {
    return { ...out, ok: false, code: LANE_LIFECYCLE_ERRORS.WORKTREE_MISSING, detail: lifecycleDetail("lane_worktree_missing") };
  }

  // ONE SLOT TRUTH: the registration decides, the binding follows.
  out.slot = out.registry.slot;
  out.port = out.registry.port ?? (out.registry.slot ? 3010 + out.registry.slot : null);
  out.slot_source = "worktree_registration";
  if (base.binding_slot != null && out.slot != null && base.binding_slot !== out.slot) {
    out.divergence.push({ field: "slot", binding: base.binding_slot, registry: out.slot });
  } else if (base.binding_slot == null && out.slot != null) {
    out.divergence.push({ field: "slot", binding: null, registry: out.slot });
  }

  if (out.slot == null) {
    return { ...out, ok: false, code: LANE_LIFECYCLE_ERRORS.SLOT_UNREGISTERED, detail: lifecycleDetail("lane_slot_unregistered") };
  }
  return { ...out, ok: true, code: "managed", detail: null };
}

/**
 * Make the lane binding agree with the registration.
 *
 * Registry -> binding only. A projection that can write back to its own source
 * is a second truth model, which is what this mission exists to remove.
 */
export function reconcileLaneSlotBinding(laneId, { root = runtimeRoot(), nowMs = Date.now(), cfg = null, metadata = null } = {}) {
  const resolved = resolveLaneWorktree(laneId, { root, cfg, metadata });
  if (!resolved.ok) return { ok: false, error: resolved.code, detail: resolved.detail, resolution: resolved };
  if (!resolved.divergence.length) return { ok: true, changed: false, slot: resolved.slot, port: resolved.port };

  const store = readDevelopmentLaneStore(root);
  const rec = store.lanes?.[resolved.lane_id];
  if (!rec) return { ok: false, error: LANE_LIFECYCLE_ERRORS.LANE_NOT_FOUND };
  rec.binding = { ...(rec.binding || {}), slot: resolved.slot, port: resolved.port };
  rec.updated_at = iso(nowMs);
  store.lanes[resolved.lane_id] = rec;
  writeDevelopmentLaneStore(store, root);
  return { ok: true, changed: true, slot: resolved.slot, port: resolved.port, divergence: resolved.divergence };
}

/**
 * May an Execution Run or a lane instruction be dispatched into this lane?
 *
 * Fails CLOSED with a named lifecycle error. `repair: true` allows the one
 * unambiguous automatic repair — a registry that already names this lane's
 * worktree with a slot, while the binding has merely forgotten it. Anything
 * ambiguous is reported, never guessed.
 */
export function assertLaneDispatchable(laneId, {
  root = runtimeRoot(),
  cfg = null,
  metadata = null,
  repair = true,
  requireSlot = false,
  nowMs = Date.now(),
} = {}) {
  let resolved = resolveLaneWorktree(laneId, { root, cfg, metadata });

  // WHAT THIS GUARD IS AND IS NOT.
  //
  // It exists because a lane kept its `binding.worktree_path`, its directory
  // and its tmux session after its registration was archived, and instructions
  // kept being delivered into it. So the rule is about a lane that CLAIMS a
  // worktree: if it names one, that worktree must still be registered and
  // managed.
  //
  // It is NOT a provisioning gate. A lane that has not been provisioned yet has
  // no worktree to claim, and its send is queued for admission — refusing that
  // would break the ordinary way a lane comes into existence. And a caller that
  // is not addressing a durable lane at all is a different subsystem's problem,
  // not this invariant's.
  if (resolved.code === LANE_LIFECYCLE_ERRORS.LANE_NOT_FOUND) {
    return { ok: true, skipped: "not_a_durable_lane", resolution: resolved };
  }
  if (resolved.code === LANE_LIFECYCLE_ERRORS.WORKTREE_UNBOUND) {
    return { ok: true, skipped: "unprovisioned", resolution: resolved };
  }
  // A registered, managed worktree that has not been given a slot is still a
  // managed worktree; only the environment actions need the slot itself.
  if (!resolved.ok && resolved.code === LANE_LIFECYCLE_ERRORS.SLOT_UNREGISTERED && !requireSlot) {
    return { ok: true, resolution: resolved, repaired: false, slotless: true };
  }
  if (resolved.ok && resolved.divergence.length && repair) {
    reconcileLaneSlotBinding(laneId, { root, nowMs, cfg, metadata });
    resolved = resolveLaneWorktree(laneId, { root, cfg, metadata });
    return { ok: true, resolution: resolved, repaired: true };
  }
  if (resolved.ok) return { ok: true, resolution: resolved, repaired: false };
  return { ok: false, error: resolved.code, detail: resolved.detail, resolution: resolved };
}

/**
 * Preconditions for the managed environment actions — QA identity provisioning,
 * access assignment and browser-session restore.
 *
 * All three resolve slot, port, worktree and identity from the registries at
 * EXECUTION time, so a request accepted against an unregistered slot is a
 * governed action that can never execute. gar_97d071ef22861f was exactly that.
 * Refuse it at acceptance, naming the missing prerequisite.
 */
export function assertManagedLaneEnvironment(laneId, { root = runtimeRoot(), cfg = null, metadata = null } = {}) {
  const resolved = resolveLaneWorktree(laneId, { root, cfg, metadata });
  if (resolved.ok) return { ok: true, resolution: resolved };
  const code = resolved.code;
  const needsRegistration = code === LANE_LIFECYCLE_ERRORS.WORKTREE_UNREGISTERED
    || code === LANE_LIFECYCLE_ERRORS.NOT_MANAGED
    || code === LANE_LIFECYCLE_ERRORS.WORKTREE_UNBOUND;
  return {
    ok: false,
    error: code,
    detail: needsRegistration
      ? "Managed worktree registration is required before this managed environment action."
      : resolved.detail,
    resolution: resolved,
  };
}

let closeImpl = null;
/** Test seam. The retirement side effect is a toolkit subprocess in production. */
export function setLaneCloseImplForTests(impl = {}) {
  closeImpl = impl && typeof impl === "object" ? impl : null;
}
export function resetLaneCloseImplForTests() {
  closeImpl = null;
}

async function retireWorktreeRegistration({ slot, acknowledgeUncommitted }) {
  if (typeof closeImpl?.finishSprint === "function") {
    return closeImpl.finishSprint({ slot, acknowledgeUncommitted });
  }
  const { releaseSprintSlot } = await import("./alloy-dev-adapter.mjs");
  return releaseSprintSlot({ slot, acknowledgeUncommitted });
}

async function releaseCapacity(laneId, { root, nowMs, origin }) {
  if (typeof closeImpl?.releaseCapacity === "function") {
    return closeImpl.releaseCapacity({ laneId, root, nowMs, origin });
  }
  const { releaseLaneExecutionCapacity } = await import("./lane-execution-capacity.mjs");
  return releaseLaneExecutionCapacity(laneId, { origin, nowMs, root });
}

export const LANE_CLOSE_COMMAND = "lane.close";

/**
 * THE SOLE AUTHORITY THAT MAY RETIRE A LANE'S WORKTREE.
 *
 * This lane is permanently closing. Only here may the durable slot/port be
 * released, `alloy-sprint-finish` be invoked, metadata be archived into
 * `finished/`, the worktree stop being managed, and the lane stop accepting
 * Execution Runs.
 *
 * Nothing else — not run completion, not capacity release, not provider
 * teardown, not tmux cleanup, not a dev-server stop, not a WAITING run — may do
 * any of that. If you find a second caller of `releaseSprintSlot`, one of you is
 * the bug.
 */
export async function closeDurableLane(laneId, {
  actor = "operator",
  reason = null,
  acknowledgeUncommitted = false,
  root = runtimeRoot(),
  nowMs = Date.now(),
} = {}) {
  const id = String(laneId || "").trim();
  const lane = getDurableLane(id, root);
  if (!lane) return { ok: false, error: LANE_LIFECYCLE_ERRORS.LANE_NOT_FOUND, command: LANE_CLOSE_COMMAND };
  const status = norm(lane.status) || LANE_OPEN;
  if (!OPEN_LANE_STATUSES.includes(status)) {
    return { ok: true, already_closed: true, command: LANE_CLOSE_COMMAND, lane_id: lane.lane_id, status };
  }

  // Closing is a superset of releasing: stop the processes first, through the
  // ordinary capacity path, so a close cannot skip its safety gates (dirty
  // worktree, granted resources, unsafe in-flight run).
  const released = await releaseCapacity(lane.lane_id, { root, nowMs, origin: `lane_close:${actor}` });
  if (released && released.ok === false) {
    return { ...released, ok: false, command: LANE_CLOSE_COMMAND, phase: "capacity_release" };
  }

  const resolved = resolveLaneWorktree(lane.lane_id, { root });
  const slot = resolved.slot ?? asSlot(lane.binding?.slot) ?? null;
  let retirement = { ok: true, skipped: true, reason: "no_registered_slot" };
  if (slot != null) {
    retirement = await retireWorktreeRegistration({ slot, acknowledgeUncommitted });
    if (!retirement?.ok) {
      return {
        ok: false,
        error: retirement?.error || "worktree_retirement_failed",
        command: LANE_CLOSE_COMMAND,
        phase: "worktree_retirement",
        lane_id: lane.lane_id,
      };
    }
  }

  const store = readDevelopmentLaneStore(root);
  const rec = store.lanes?.[lane.lane_id] || lane;
  rec.status = LANE_CLOSED;
  rec.closed_at = iso(nowMs);
  rec.closed_by = actor;
  rec.close_reason = reason || null;
  rec.binding = {
    ...(rec.binding || {}),
    // The worktree is retired: the lane no longer owns a slot or a port, and
    // saying so is the point of closing.
    slot: null,
    port: null,
    tmux_session: null,
    tmux_pane: null,
    status: "closed",
    stale: true,
  };
  rec.execution_capacity = { state: "IDLE", released_at: iso(nowMs), slot: null };
  rec.updated_at = iso(nowMs);
  store.lanes[lane.lane_id] = rec;
  writeDevelopmentLaneStore(store, root);

  return {
    ok: true,
    command: LANE_CLOSE_COMMAND,
    lane_id: lane.lane_id,
    name: lane.name || null,
    status: LANE_CLOSED,
    worktree_name: resolved.worktree_name || lane.binding?.worktree_name || null,
    worktree_path: resolved.worktree_path || lane.binding?.worktree_path || null,
    slot_retired: slot,
    worktree_retired: Boolean(slot != null && retirement?.ok && !retirement.skipped),
    retirement,
    capacity_release: released || null,
  };
}

/** Fleet view: every lane, with its canonical resolution. For audit and cleanup. */
export function auditLaneWorktrees({ root = runtimeRoot(), cfg = null } = {}) {
  const conf = cfg || resolveRuntimeConfig();
  const metadata = readAllMetadata(conf);
  const lanes = listDurableLanes(root).map((l) => resolveLaneWorktree(l.lane_id, { root, cfg: conf, metadata }));
  const ownedNames = new Set(lanes.map((l) => norm(l.worktree_name)).filter(Boolean));
  const orphans = metadata
    .filter((m) => norm(m.lifecycle).toLowerCase() !== "finished")
    .filter((m) => !ownedNames.has(norm(m.worktree)))
    .map((m) => ({ worktree: m.worktree, slot: asSlot(m.slot), port: asPort(m.port), path: m.path || null, lifecycle: m.lifecycle || null }));
  return { lanes, orphans, metadata_count: metadata.length };
}
