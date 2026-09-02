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
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
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
  BRANCH_DRIFT: "lane_branch_drift",
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
  lane_branch_drift: "The lane's recorded branch no longer matches the branch its worktree is on.",
});

export function lifecycleDetail(code) {
  return DETAIL[code] || "Lane lifecycle invariant not satisfied.";
}

const norm = (v) => String(v ?? "").trim();
/** One spelling of a branch name: no refs/heads/, no origin/, no whitespace. */
export function normalizeBranchName(b) {
  const v = String(b ?? "").trim().replace(/^refs\/heads\//, "").replace(/^origin\//, "");
  return v || null;
}

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
export function resolveLaneWorktree(laneId, { root = runtimeRoot(), cfg = null, metadata = null, gitImpl = null } = {}) {
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
    branch_expected: null,
    branch_actual: null,
    branch_created_on: null,
    branch_drift: false,
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

  // A LANE CHANGING BRANCH IS NORMAL WORK, NOT A LIFECYCLE FAILURE.
  //
  // WHAT I GOT WRONG. I made branch drift a fail-closed refusal, and it took the
  // Surfaces lane off the air: "Delivery refused (lane_branch_drift)". Runtime
  // Performance went dark the same way, on `promote/runtime-performance-group2`
  // — a promotion branch it created to do exactly what Alloy's safe promotion
  // workflow asks for. Both lanes did the right thing and both stopped being
  // reachable.
  //
  // This codebase had already learned this lesson one layer down. From
  // execution-run-send: a push delegation used to be pinned to the lane's own
  // working branch, "so the pin made the correct workflow unreachable" — S15
  // refused a push of promote/s15-delegation-cert against the lane branch. I
  // reproduced that mistake at the delivery layer.
  //
  // The recorded branch is NOT an authorization input. Governed push identity
  // comes from the request's own inputs and is pinned at execution by
  // repository, exact branch, exact head SHA, worktree and protected-ref
  // refusal. What the recorded branch feeds is display and session expectation.
  // So drift is an OBSERVATION to reconcile, never a reason to refuse delivery.
  //
  // Each field keeps one authority: slot and port from the registration, and the
  // branch from git, because the worktree's HEAD is the only thing that knows
  // what branch a lane is on. The registration's ALLOY_WORKTREE_BRANCH stays as
  // the branch the worktree was CREATED on — an origin record worth keeping, not
  // a live constraint.
  const createdOn = normalizeBranchName(out.registry.branch_expected);
  const boundBranch = normalizeBranchName(base.branch);
  const actualBranch = normalizeBranchName(actualWorktreeBranch(path, { git: gitImpl }));
  out.branch_created_on = createdOn;
  out.branch_expected = boundBranch;
  out.branch_actual = actualBranch;
  out.branch = actualBranch || boundBranch;
  out.branch_drift = Boolean(boundBranch && actualBranch && boundBranch !== actualBranch);
  if (out.branch_drift) {
    out.divergence.push({ field: "branch", binding: boundBranch, actual: actualBranch });
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
 * What branch is this worktree ACTUALLY on?
 *
 * Read, never inferred. `git -C <path> rev-parse --abbrev-ref HEAD` is the only
 * thing that knows; a detached HEAD returns "HEAD" and is reported as such
 * rather than being smoothed into a name.
 */
export function actualWorktreeBranch(worktreePath, { git = null } = {}) {
  const path = norm(worktreePath);
  if (!path || !existsSync(path)) return null;
  const run = git || ((args) => spawnSync("git", ["-C", path, ...args], { encoding: "utf8", timeout: 10_000 }));
  const out = run(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!out || out.status !== 0) return null;
  const b = String(out.stdout || "").trim();
  // A DETACHED HEAD IS NOT A BRANCH CALLED "HEAD".
  //
  // `rev-parse --abbrev-ref HEAD` answers the literal string "HEAD" when the
  // worktree is detached, and I wrote that string into a lane's binding as its
  // branch before catching it. Runtime Performance's worktree was detached at a
  // staging commit and its record briefly read `branch: "HEAD"`. A detached
  // worktree is on no branch, which is unknown rather than moved — so it reads
  // like an unreadable git: nothing is recorded, nothing is blocked, and the
  // branch already on file is kept.
  if (!b || b === "HEAD") return null;
  return b;
}

/**
 * Make the lane binding agree with the registration.
 *
 * Registry -> binding only. A projection that can write back to its own source
 * is a second truth model, which is what this mission exists to remove.
 */
export function reconcileLaneSlotBinding(laneId, { root = runtimeRoot(), nowMs = Date.now(), cfg = null, metadata = null, gitImpl = null } = {}) {
  const resolved = resolveLaneWorktree(laneId, { root, cfg, metadata, gitImpl });
  if (!resolved.ok) return { ok: false, error: resolved.code, detail: resolved.detail, resolution: resolved };
  if (!resolved.divergence.length) {
    return { ok: true, changed: false, slot: resolved.slot, port: resolved.port, branch: resolved.branch };
  }

  const store = readDevelopmentLaneStore(root);
  const rec = store.lanes?.[resolved.lane_id];
  if (!rec) return { ok: false, error: LANE_LIFECYCLE_ERRORS.LANE_NOT_FOUND };
  const next = { ...(rec.binding || {}), slot: resolved.slot, port: resolved.port };
  // THE BRANCH FOLLOWS THE WORKTREE. Only ever git -> binding: a lane that
  // checked out a new branch has told us what it is on, and the record catches
  // up. Nothing here touches the checkout, and an unreadable git changes
  // nothing rather than blanking a branch we still know.
  if (resolved.branch_actual && resolved.branch_actual !== normalizeBranchName(next.branch)) {
    next.branch = resolved.branch_actual;
  }
  rec.binding = next;
  rec.updated_at = iso(nowMs);
  store.lanes[resolved.lane_id] = rec;
  writeDevelopmentLaneStore(store, root);
  return {
    ok: true, changed: true, slot: resolved.slot, port: resolved.port,
    branch: next.branch, divergence: resolved.divergence,
  };
}

/**
 * Bring one lane's recorded branch back in line with its worktree.
 *
 * The supported repair for the refusal that took Surfaces off the air, and the
 * same thing dispatch now does for itself. Reported rather than silent: the
 * caller is told what moved.
 */
export function reconcileLaneBranch(laneId, { root = runtimeRoot(), nowMs = Date.now(), cfg = null, metadata = null, gitImpl = null } = {}) {
  const resolved = resolveLaneWorktree(laneId, { root, cfg, metadata, gitImpl });
  if (!resolved.ok) return { ok: false, error: resolved.code, detail: resolved.detail, resolution: resolved };
  if (!resolved.branch_drift) {
    return { ok: true, changed: false, branch: resolved.branch, lane_id: resolved.lane_id };
  }
  const store = readDevelopmentLaneStore(root);
  const rec = store.lanes?.[resolved.lane_id];
  if (!rec) return { ok: false, error: LANE_LIFECYCLE_ERRORS.LANE_NOT_FOUND };
  const from = normalizeBranchName(rec.binding?.branch);
  rec.binding = { ...(rec.binding || {}), branch: resolved.branch_actual };
  rec.updated_at = iso(nowMs);
  store.lanes[resolved.lane_id] = rec;
  writeDevelopmentLaneStore(store, root);
  return {
    ok: true, changed: true, lane_id: resolved.lane_id,
    from, to: resolved.branch_actual, branch_created_on: resolved.branch_created_on,
  };
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
  gitImpl = null,
  nowMs = Date.now(),
} = {}) {
  let resolved = resolveLaneWorktree(laneId, { root, cfg, metadata, gitImpl });

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
    // A moved branch and a forgotten slot are both the record trailing the
    // truth, and both are repaired the same way: read the fact, write it down,
    // carry on. Delivery is never refused for either.
    const fixed = reconcileLaneSlotBinding(laneId, { root, nowMs, cfg, metadata, gitImpl });
    resolved = resolveLaneWorktree(laneId, { root, cfg, metadata, gitImpl });
    return { ok: true, resolution: resolved, repaired: true, reconciled: fixed?.divergence || null };
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
  const drifted = lanes.filter((l) => l.branch_drift).map((l) => ({
    lane_id: l.lane_id, lane_name: l.lane_name,
    recorded: l.branch_expected, actual: l.branch_actual, created_on: l.branch_created_on,
  }));
  const ownedNames = new Set(lanes.map((l) => norm(l.worktree_name)).filter(Boolean));
  const orphans = metadata
    .filter((m) => norm(m.lifecycle).toLowerCase() !== "finished")
    .filter((m) => !ownedNames.has(norm(m.worktree)))
    .map((m) => ({ worktree: m.worktree, slot: asSlot(m.slot), port: asPort(m.port), path: m.path || null, lifecycle: m.lifecycle || null }));
  return { lanes, orphans, branch_drift: drifted, metadata_count: metadata.length };
}

/**
 * WHAT DOES THE HOST ACTUALLY HAVE A DEV SERVER FOR?
 *
 * Deliberately NOT a second implementation of the rule. `alloy-dev-status` is
 * the canonical classifier — it owns the port, PID-file, ownership and
 * process-shape logic — so this reads ITS verdict rather than recomputing one.
 * A second implementation is how the shell and the JS policy came to disagree
 * about how many servers exist in the first place.
 */
export function devServerCensus({ toolkitDir = null, root = runtimeRoot(), spawn = null } = {}) {
  const bin = join(toolkitDir || join(process.env.HOME || "", ".local", "share", "alloy", "toolkit", "current"), "alloy-dev-status");
  const run = spawn || ((cmd, args, opts) => spawnSync(cmd, args, opts));
  const out = run(bin, [], { encoding: "utf8", timeout: 30_000, env: { ...process.env, ALLOY_RUNTIME_ROOT: root } });
  if (!out || out.status !== 0) return { ok: false, error: "dev_status_unavailable", servers: [] };
  const servers = [];
  for (const line of String(out.stdout || "").split("\n")) {
    const m = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)/);
    if (!m) continue;
    const [, worktree, agent, branch, port, state, pid, path] = m;
    servers.push({
      worktree, agent, branch, port: Number(port), state,
      pid: pid === "-" ? null : Number(pid), path,
      counts_toward_capacity: state === "running",
      reclaimable: state === "unattributable-owner" || state === "stale",
    });
  }
  return {
    ok: true,
    servers,
    running: servers.filter((x) => x.counts_toward_capacity).length,
    reclaimable: servers.filter((x) => x.reclaimable),
  };
}

/**
 * A REGISTRATION WHOSE RESOURCE IS GONE.
 *
 * THE DEFECT THIS CLOSES. wt2-fixture-two held slot 2 and port 3912 in the
 * registry while its directory — under a deleted /tmp fixture root — had not
 * existed for days. `vac worktree-retire` could not see it, because that command
 * works from directories and this one has none. `vac reconcile` offered only
 * adoptions. So the only way to remove it was to delete a file by hand, which is
 * exactly what a registry is supposed to make unnecessary.
 *
 * This classifies rather than deletes, and it FAILS CLOSED in every direction
 * that matters:
 *
 *   active            the directory exists — never a cleanup candidate
 *   owned             a durable lane is bound to it — never a cleanup candidate
 *   unreadable        the registry could not be read at all; a transient
 *                     filesystem error must never read as "gone"
 *   detached          no directory, no owning lane, and the registration says
 *                     it was finished — historical, keep
 *   stale_missing     no directory, no owning lane, still marked active — the
 *                     only class this proposes removing
 *
 * `apply` is required to change anything, every decision carries its evidence,
 * and the removed file is recorded so the action is auditable after the fact.
 */
export const REGISTRATION_CLASSES = Object.freeze([
  "active", "owned", "detached", "stale_missing", "unreadable",
]);

export function classifyRegistrations({ root = runtimeRoot(), cfg = null, metadata = null } = {}) {
  let conf;
  let meta;
  try {
    conf = cfg || resolveRuntimeConfig();
    // AN ABSENT REGISTRY IS NOT AN EMPTY ONE. `readAllMetadata` returns [] for a
    // directory that does not exist, which at this layer is indistinguishable
    // from "there are no registrations" — and acting on that reading would
    // propose removing nothing, or worse, teach a caller that the registry is
    // empty. A registry we cannot read is refused outright.
    if (!metadata && !existsSync(conf.metadata_dir)) {
      return { ok: false, error: "registry_unreadable", detail: `no registry directory at ${conf.metadata_dir}`, registrations: [] };
    }
    meta = metadata || readAllMetadata(conf);
    if (!Array.isArray(meta)) {
      return { ok: false, error: "registry_unreadable", detail: "the registry did not read as a list", registrations: [] };
    }
  } catch (e) {
    // A registry we could not read is not a registry full of dead entries.
    return { ok: false, error: "registry_unreadable", detail: String(e?.message || e), registrations: [] };
  }
  const owners = new Map();
  for (const lane of listDurableLanes(root)) {
    const n = norm(lane?.binding?.worktree_name);
    if (n) owners.set(n, lane.lane_id);
  }
  const registrations = meta.map((m) => {
    const name = norm(m.worktree);
    const path = norm(m.path);
    const lifecycle = norm(m.lifecycle).toLowerCase();
    const owner = owners.get(name) || null;
    const present = path ? existsSync(path) : null;
    let klass;
    let reason;
    if (present === null) { klass = "unreadable"; reason = "the registration records no path, so its resource cannot be located"; }
    else if (present) { klass = "active"; reason = "the worktree directory exists"; }
    else if (owner) { klass = "owned"; reason = `a durable lane (${owner}) is still bound to this worktree`; }
    else if (lifecycle === "finished") { klass = "detached"; reason = "no directory and no owning lane, but the registration is already marked finished"; }
    else { klass = "stale_missing"; reason = "no directory, no owning lane, and still marked active"; }
    return {
      worktree: name, path: path || null, slot: asSlot(m.slot), port: asPort(m.port),
      lifecycle: lifecycle || null, owner_lane_id: owner, directory_present: present,
      class: klass, reason,
      cleanup_candidate: klass === "stale_missing",
    };
  });
  return { ok: true, registrations, candidates: registrations.filter((r) => r.cleanup_candidate) };
}

export function reconcileStaleRegistrations({
  root = runtimeRoot(),
  cfg = null,
  metadata = null,
  apply = false,
  actor = "operator",
  nowMs = Date.now(),
} = {}) {
  const classified = classifyRegistrations({ root, cfg, metadata });
  if (!classified.ok) return { ...classified, applied: false };
  const conf = cfg || resolveRuntimeConfig();
  const plan = classified.candidates.map((c) => ({
    worktree: c.worktree, slot: c.slot, port: c.port, path: c.path,
    action: "remove_registration",
    file: join(conf.metadata_dir, `${c.worktree}.env`),
    evidence: c.reason,
  }));
  if (!apply) {
    return { ok: true, applied: false, plan, classified: classified.registrations, planned_at: iso(nowMs) };
  }
  const removed = [];
  const refused = [];
  for (const step of plan) {
    // Re-check at the moment of action: the plan may be seconds old, and a
    // worktree that came back must not be removed on a stale reading.
    if (step.path && existsSync(step.path)) {
      refused.push({ ...step, refused: "directory_reappeared" });
      continue;
    }
    try { rmSync(step.file, { force: true }); removed.push(step); }
    catch (e) { refused.push({ ...step, refused: String(e?.message || e) }); }
  }
  return { ok: true, applied: true, removed, refused, actor, applied_at: iso(nowMs) };
}

/**
 * WHICH MANAGED SLOTS ARE FREE?
 *
 * Slots 1-6 are the host's permanent worktree homes, on ports 3011-3016. A slot
 * is taken when a registration names it; everything else is available.
 */
export const MANAGED_SLOTS = Object.freeze([1, 2, 3, 4, 5, 6]);

export function freeSlots({ cfg = null, metadata = null } = {}) {
  const conf = cfg || resolveRuntimeConfig();
  const meta = metadata || readAllMetadata(conf);
  const taken = new Set(meta
    .filter((m) => norm(m.lifecycle).toLowerCase() !== "finished")
    .map((m) => asSlot(m.slot))
    .filter((n) => n != null));
  return MANAGED_SLOTS.filter((n) => !taken.has(n));
}

let registerImpl = null;
/** Test seam: registration is a toolkit subprocess in production. */
export function setRegisterImplForTests(impl) { registerImpl = impl || null; }
export function resetRegisterImplForTests() { registerImpl = null; }

/**
 * REGISTER A WORKTREE VACILANDO JUST CREATED.
 *
 * THE DEFECT THIS CLOSES. A lane created through the Vacilando wizard got a git
 * worktree, a branch, a durable binding, a tmux session and a running Claude —
 * and no slot and no registration, because worktree creation lives in JS and the
 * registration writer is `alloy-worktree-adopt` in the shell. Two ways for a
 * worktree to come into existence, only one of which registers it.
 *
 * Measured on the Financials lane: worktree present, branch agent/financials,
 * pane %17 running claude.exe in the right directory, `slot: null`, no
 * metadata/<name>.env — so every send was refused `lane_worktree_unregistered`
 * and the operator saw a lane whose agent "never became available". The agent
 * was fine; nothing could reach it.
 *
 * This calls the CANONICAL writer rather than writing metadata here. A second
 * registration path is how the two diverged in the first place.
 */
export async function registerCreatedWorktree({
  worktreeName,
  provider = "claude",
  slot = null,
  toolkitDir = null,
  root = runtimeRoot(),
  cfg = null,
  metadata = null,
} = {}) {
  const name = norm(worktreeName);
  if (!name) return { ok: false, error: "missing_worktree_name" };
  const chosen = asSlot(slot) ?? freeSlots({ cfg, metadata })[0] ?? null;
  if (chosen == null) {
    // Saying this is the point. A lane created with no slot left is a lane that
    // cannot run, and the operator has to be told at creation rather than
    // discovering it on the first message.
    return { ok: false, error: "no_free_slot", detail: "All six managed slots are registered; free one before creating another lane that needs a worktree." };
  }
  const bin = join(toolkitDir || join(process.env.HOME || "", ".local", "share", "alloy", "toolkit", "current"), "alloy-worktree-adopt");
  const run = registerImpl || ((cmd, args, opts) => spawnSync(cmd, args, opts));
  const out = run(bin, [String(chosen), name, "--provider", provider], {
    encoding: "utf8", timeout: 60_000, env: { ...process.env, ALLOY_RUNTIME_ROOT: root },
  });
  if (!out || out.status !== 0) {
    return {
      ok: false, error: "registration_failed", slot: chosen,
      detail: String(out?.stderr || out?.error || "alloy-worktree-adopt failed").slice(0, 300),
    };
  }
  return { ok: true, slot: chosen, port: 3010 + chosen, worktree: name, provider };
}
