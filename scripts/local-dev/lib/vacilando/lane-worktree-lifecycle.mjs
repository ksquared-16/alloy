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
import { isManagedSlot, managedSlots } from "./managed-slots.mjs";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { getDurableLane, listDurableLanes, readDevelopmentLaneStore, writeDevelopmentLaneStore } from "./development-lane.mjs";
import { readAllMetadata, resolveRuntimeConfig } from "./workspace-facts.mjs";
import { pidAlive } from "./control-plane-health.mjs";

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

/**
 * A slot number, bounded by the TOPOLOGY OWNER rather than by a literal.
 *
 * This read `n <= 6`, which was true when the host had six slots and silently
 * false from the moment topology moved to twelve. It is not a cosmetic bound:
 * asSlot is the gate on every slot this module handles, so slots 7-12 were
 * being read as `null` in seven places at once — registrations, bindings and
 * the free-slot computation alike.
 *
 * MEASURED CONSEQUENCE, on the live host. `payments` held slot 7 and
 * `troubleshooting` held slot 8, both active and both registered. freeSlots()
 * dropped them from `taken` and reported 7 as the first FREE slot, so creating
 * a lane through the Director tried to adopt a slot a real lane was using. The
 * only reason two lanes did not end up on one port is that alloy-worktree-adopt
 * refuses an assigned slot — a fail-closed guard in the other language caught
 * what this one got wrong.
 *
 * The visible symptom was the opposite of the cause: every lane created through
 * the UI came out with `registered: false` and no slot, which is exactly the
 * Financials failure the registration code above exists to prevent.
 *
 * isManagedSlot was already imported into this module. The bound was available
 * and simply not used.
 */
const asSlot = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && isManagedSlot(n) ? n : null;
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
  if (!resolved.ok) {
    /*
     * A STALE SLOT CLAIM IS THE ONE UNRESOLVABLE STATE THIS CAN REPAIR.
     *
     * THE DEFECT, MEASURED. Slot 8 was claimed by two ACTIVE lane records —
     * Troubleshooting and Documentation & API — while the canonical registry,
     * `metadata/<name>.env`, declared it exactly once, for documentation-api.
     * Troubleshooting's own registration carries no slot line at all.
     *
     * So its `binding.slot` was a CACHED COPY of a binding it no longer held.
     * This function could converge a lane ONTO a slot the registry declares, but
     * had nothing to say when the registry declares none — it refused with
     * `lane_slot_unregistered` and the stale claim survived indefinitely, its
     * only symptom being a bootstrap resolution failure three layers away that
     * described the lane rather than the duplicate.
     *
     * The registry is the authority and this record is its cache, so a cache
     * entry the authority does not back is simply wrong, and clearing it is a
     * correction rather than a decision. It is also the narrowest possible one:
     * the slot is not reassigned, no other lane's record is touched, no
     * registration is written, and the worktree binding itself is left exactly
     * as it is. The lane becomes slotless — which DevOps 1 and 2 both certify is
     * a completely valid state for a lane to be in.
     *
     * ONLY THIS CODE. Every other unresolvable state means something is unknown,
     * and clearing a binding on an unknown is how a lane loses a slot it really
     * holds.
     */
    if (resolved.code === LANE_LIFECYCLE_ERRORS.SLOT_UNREGISTERED && resolved.binding_slot != null) {
      const store = readDevelopmentLaneStore(root);
      const rec = store.lanes?.[resolved.lane_id];
      if (!rec) return { ok: false, error: LANE_LIFECYCLE_ERRORS.LANE_NOT_FOUND };
      const stale = rec.binding?.slot ?? null;
      rec.binding = { ...(rec.binding || {}), slot: null, port: null };
      rec.updated_at = iso(nowMs);
      store.lanes[resolved.lane_id] = rec;
      writeDevelopmentLaneStore(store, root);
      return {
        ok: true,
        changed: true,
        slot: null,
        port: null,
        branch: rec.binding?.branch || null,
        cleared_stale_slot: stale,
        detail: `Slot ${stale} is not registered to this lane's worktree; the stale claim was cleared and the lane is now slotless.`,
      };
    }
    return { ok: false, error: resolved.code, detail: resolved.detail, resolution: resolved };
  }
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

  const worktreeName = resolved.worktree_name || lane.binding?.worktree_name || null;
  /*
   * "I asked for it to stop" and "it stopped" are different claims, and only the
   * second one makes a completed lane's resources genuinely free. The graceful
   * path has already run by this point; this looks.
   */
  let teardown = null;
  try {
    teardown = verifyLaneTeardown(lane.lane_id, {
      root,
      slot,
      port: resolved.port ?? null,
      worktreeName,
    });
  } catch { /* a failed verification must never undo a completed close */ }

  return {
    ok: true,
    command: LANE_CLOSE_COMMAND,
    lane_id: lane.lane_id,
    name: lane.name || null,
    status: LANE_CLOSED,
    worktree_name: worktreeName,
    worktree_path: resolved.worktree_path || lane.binding?.worktree_path || null,
    slot_retired: slot,
    worktree_retired: Boolean(slot != null && retirement?.ok && !retirement.skipped),
    retirement,
    capacity_release: released || null,
    // Reported, never acted on: a survivor is a fact the operator needs, not a
    // licence to kill something this lane may not own.
    teardown_verified: teardown?.ok ?? null,
    teardown_survivors: teardown?.survivors || [],
    teardown_checks: teardown?.checked || null,
  };
}

/**
 * DID THE TEARDOWN ACTUALLY LEAVE NOTHING BEHIND?
 *
 * THE GAP. `closeDurableLane` released capacity, retired the worktree
 * registration and marked the lane closed — and then returned, having never
 * looked. "I asked for it to stop" and "it stopped" are different claims, and
 * only the second one makes a completed lane's resources genuinely free.
 *
 * This VERIFIES and REPORTS. It does not kill: killing arbitrary processes is
 * prohibited, and the graceful path — `alloy-sprint-finish` via
 * `releaseSprintSlot` — has already run by the time this is called. A survivor
 * is a fact the operator needs, not a licence to escalate.
 *
 * Every check is cheap and read-only: the Governor's own owned-process records,
 * `kill -0` on their pids, the lane's pid claim file, and a bind test on the
 * slot's port. No `ps` fan-out and no filesystem walk.
 *
 * A lane does NOT own every resource type. Absence of a dev server is not a
 * finding; a dev server still listening on a retired slot's port is.
 */
export function verifyLaneTeardown(laneId, {
  root = runtimeRoot(),
  slot = null,
  port = null,
  worktreeName = null,
  pidAliveImpl = null,
  portInUseImpl = null,
  listOwnedImpl = null,
} = {}) {
  const survivors = [];
  const id = String(laneId || "").trim();
  const alive = pidAliveImpl || pidAlive;
  const listOwned = listOwnedImpl || readOwnedProcessesQuiet;

  // 1. Owned processes this lane's work registered, still alive.
  let ownedChecked = false;
  try {
    for (const p of listOwned(root) || []) {
      ownedChecked = true;
      if (String(p.lane_id || "") !== id) continue;
      if (p.pid != null && alive(p.pid)) {
        survivors.push({ kind: "owned_process", pid: Number(p.pid), id: p.id || null, process_kind: p.kind || null });
      }
    }
    ownedChecked = true;
  } catch { ownedChecked = false; }

  // 2. The lane's PID claim, if one is still on disk with a live process.
  let claimChecked = false;
  if (worktreeName) {
    const claim = join(root, "pids", `${worktreeName}.pid`);
    claimChecked = true;
    try {
      const pid = readFileSync(claim, "utf8").trim();
      if (pid && alive(pid)) survivors.push({ kind: "pid_claim", pid: Number(pid), path: claim });
    } catch { /* absent claim is the expected outcome */ }
  }

  // 3. The slot's port, still answering after the slot was retired.
  const checkPort = portInUseImpl || defaultPortInUse;
  if (port != null && checkPort(port)) {
    survivors.push({ kind: "port", port: Number(port), slot });
  }

  return {
    ok: survivors.length === 0,
    lane_id: id || null,
    slot,
    port,
    verified_at: new Date().toISOString(),
    survivors,
    // Said plainly, because "no survivors" is the claim that matters and it must
    // not be inferred from an empty list that nothing was able to check.
    checked: { owned_processes: ownedChecked, pid_claim: claimChecked, port: port != null },
  };
}

/**
 * The Governor's owned-process store, read directly.
 *
 * NOT imported from `execution-recovery.mjs`, and the reason is load order
 * rather than taste: a static import from here creates a cycle
 * (lane-worktree-lifecycle -> execution-recovery -> execution-resource -> ...)
 * whose observable symptom is `Cannot access 'reclaimHook' before
 * initialization` at module init — four suites crashed on it before this was
 * backed out. Nothing is duplicated except the path: this is a read-only
 * consumer, `registerOwnedProcess` remains the sole writer, and the store's
 * shape is its own module's contract.
 */
function readOwnedProcessesQuiet(root) {
  try {
    const raw = JSON.parse(readFileSync(join(root, "vacilando", "execution-runs", "owned-processes.json"), "utf8"));
    return Array.isArray(raw?.processes) ? raw.processes : [];
  } catch {
    return [];
  }
}

function spawnSyncText(cmd, args, opts) {
  const r = spawnSync(cmd, args, opts);
  return String(r?.stdout || "").trim();
}

/** A port that still accepts a connection is a resource that did not go away. */
function defaultPortInUse(port) {
  try {
    const out = spawnSyncText("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8", timeout: 4000,
    });
    return Boolean(out);
  } catch {
    // lsof exits non-zero when nothing is listening — the common, healthy case.
    return false;
  }
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
    const m = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(\S+))?/);
    if (!m) continue;
    const [, worktree, agent, branch, port, state, pid, path, readiness] = m;
    // READY is optional so a census taken against an older toolkit still parses;
    // when it is absent capability is UNKNOWN, never assumed true. A slot that
    // cannot start a server is not a server slot, and the capacity experiment
    // that counted slot 3 as one learned that by trying.
    const ready = readiness || null;
    servers.push({
      worktree, agent, branch, port: Number(port), state,
      pid: pid === "-" ? null : Number(pid), path,
      readiness: ready,
      server_capable: ready == null ? null : ready === "ready",
      not_server_capable_reason: ready && ready !== "ready" ? ready : null,
      counts_toward_capacity: state === "running",
      reclaimable: state === "unattributable-owner" || state === "stale",
    });
  }
  return {
    ok: true,
    servers,
    running: servers.filter((x) => x.counts_toward_capacity).length,
    reclaimable: servers.filter((x) => x.reclaimable),
    // How many slots could actually serve, which is the number a capacity
    // experiment needs and is not the same as how many are registered.
    server_capable: servers.filter((x) => x.server_capable === true).length,
    not_server_capable: servers
      .filter((x) => x.server_capable === false)
      .map((x) => ({ worktree: x.worktree, reason: x.not_server_capable_reason })),
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
/**
 * The managed slots, from the one owner. This was a literal [1,2,3,4,5,6].
 *
 * A FUNCTION, not a constant, deliberately. A `const` snapshot is evaluated once
 * at import and would go stale the moment topology changed — which is the same
 * "second source of truth" this convergence exists to remove, just with a longer
 * fuse. Callers ask when they need to know.
 */
export function managedSlotSet() {
  return managedSlots();
}

export function freeSlots({ cfg = null, metadata = null } = {}) {
  const conf = cfg || resolveRuntimeConfig();
  const meta = metadata || readAllMetadata(conf);
  const taken = new Set(meta
    .filter((m) => norm(m.lifecycle).toLowerCase() !== "finished")
    .map((m) => asSlot(m.slot))
    .filter((n) => n != null));
  return managedSlots().filter((n) => !taken.has(n));
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
  // EXPLICITLY slotless, as opposed to "pick one for me". `slot: null` means
  // the latter — it is the ordinary creation call — so reclamation needs a way
  // to say "register this WITHOUT a slot" that cannot be confused with it.
  slotless = false,
  // Re-adopt a worktree that is already registered. The canonical writer
  // refuses to overwrite a record without this, which is right for creation and
  // wrong for moving a slot between two worktrees that both already exist.
  force = false,
  toolkitDir = null,
  root = runtimeRoot(),
  cfg = null,
  metadata = null,
} = {}) {
  const name = norm(worktreeName);
  if (!name) return { ok: false, error: "missing_worktree_name" };
  const chosen = slotless ? null : (asSlot(slot) ?? freeSlots({ cfg, metadata })[0] ?? null);

  // A FULL SLOT POOL IS NOT A REASON TO LEAVE A WORKTREE UNKNOWN.
  //
  // WHAT THIS USED TO DO, AND WHAT IT COST. It refused outright: no slot, no
  // registration, nothing written. The lane still got its worktree, its branch,
  // its tmux session and a live Claude — and, having no registration, was
  // refused `lane_worktree_unregistered` on every single message. Measured on
  // the Access & Identity lane, created while all twelve slots were held: pane
  // %24 running claude.exe in the right worktree, and not one instruction able
  // to reach it. That is the exact Financials failure this function was written
  // to prevent, arriving through the other door.
  //
  // The two things had been fused, and they are not the same thing:
  //
  //   REGISTRATION is IDENTITY. It is how the fleet knows whose worktree that
  //   is, and `resolveLaneWorktree` requires it before an instruction may enter.
  //
  //   A SLOT is a RESOURCE — a port and a managed QA environment. Only the
  //   environment actions need it, and `assertManagedLaneEnvironment` already
  //   refuses those separately on `lane_slot_unregistered`.
  //
  // The resolver has always modelled the middle state: a registered worktree
  // with no slot resolves SLOT_UNREGISTERED, and `assertLaneDispatchable`
  // deliberately passes it as `slotless` because delivery needs identity, not a
  // port. What was missing was a WRITER for it. So a full pool now produces a
  // slotless registration rather than nothing: the lane is dispatchable
  // immediately, and it gets no port, no dev server and no QA environment until
  // a slot is actually free — which is true, and says so.
  //
  // This takes no slot from anybody. Nothing is reclaimed, retired or reassigned.
  const bin = join(toolkitDir || join(process.env.HOME || "", ".local", "share", "alloy", "toolkit", "current"), "alloy-worktree-adopt");
  const run = registerImpl || ((cmd, args, opts) => spawnSync(cmd, args, opts));
  const args = chosen == null
    ? ["--no-slot", name, "--provider", provider, ...(force ? ["--force"] : [])]
    : [String(chosen), name, "--provider", provider, ...(force ? ["--force"] : [])];
  const out = run(bin, args, {
    encoding: "utf8", timeout: 60_000, env: { ...process.env, ALLOY_RUNTIME_ROOT: root },
  });
  if (!out || out.status !== 0) {
    return {
      ok: false, error: "registration_failed", slot: chosen,
      slotless: chosen == null,
      detail: String(out?.stderr || out?.error || "alloy-worktree-adopt failed").slice(0, 300),
    };
  }
  if (chosen == null) {
    return {
      ok: true, slot: null, port: null, worktree: name, provider,
      slotless: true,
      reason: slotless ? "slotless_requested" : "no_free_slot",
      // Counted from the topology owner, not asserted. The literal "six" here
      // outlived the six-slot host and would have told an operator with twelve
      // slots something plainly untrue.
      detail: `All ${managedSlots().length} managed slots are held, so this worktree is registered without one: it is dispatchable but has no port, no dev server and no managed QA environment. ${slotHoldersSummary({ cfg, metadata, root })}`,
    };
  }
  return { ok: true, slot: chosen, port: 3010 + chosen, worktree: name, provider, slotless: false };
}

/**
 * WHO IS HOLDING THE SLOTS — because "the pool is full" is not actionable.
 *
 * An operator told only that every slot is taken has to go find out which lane
 * owns which, and whether any of them is a leftover. On this host one was: slot
 * 10 held a registration for `wt10-trust-runtime-enrollment-e2e` that NO durable
 * lane owned, and it was indistinguishable from the eleven live ones. So the
 * unowned holders are named separately, since they are the ones worth freeing.
 */
export function slotHoldersSummary({ cfg = null, metadata = null, root = runtimeRoot() } = {}) {
  try {
    const classified = classifyRegistrations({ root, cfg, metadata });
    if (!classified.ok) return "The registry could not be read to say which slots are held.";
    const held = classified.registrations.filter((r) => r.slot != null);
    const unowned = held.filter((r) => !r.owner_lane_id);
    const holders = held
      .sort((a, b) => a.slot - b.slot)
      .map((r) => `${r.slot}=${r.worktree}${r.owner_lane_id ? "" : " (no owning lane)"}`)
      .join(", ");
    const tail = unowned.length
      ? ` ${unowned.length === 1 ? "One slot is" : `${unowned.length} slots are`} held by a registration no durable lane owns (${unowned.map((r) => `slot ${r.slot}: ${r.worktree}`).join("; ")}) — freeing one of those with alloy-sprint-finish would give this lane a port.`
      : "";
    return `Slots: ${holders}.${tail}`;
  } catch {
    return "The registry could not be read to say which slots are held.";
  }
}

/* ---------------------------------------------------------------------------
 * SLOT RECLAMATION — a held slot is not the same as a used one.
 * ------------------------------------------------------------------------- */

/**
 * WHICH SLOTS COULD BE GIVEN UP, BEST CANDIDATE FIRST.
 *
 * THE PROBLEM THIS SOLVES. The managed pool is fixed, so a fleet at capacity
 * hands every new lane a slotless registration: dispatchable, but with no port,
 * no dev server and no browser session. Measured on this host — twelve slots,
 * eleven held by lanes, ONE held by a registration no lane owns at all, and two
 * lanes waiting with nothing. The pool was not out of capacity; it was out of
 * FREE capacity, which is a different thing and has a different remedy.
 *
 * A SLOT IS A PORT, NOT A LIFE. Reclaiming one does not close a lane, delete a
 * worktree, touch a branch or discard work: the donor keeps its registration
 * and simply becomes slotless, which is a supported, dispatchable state. It
 * keeps chatting; what it loses is localhost and the QA route. That is what
 * makes offering the choice reasonable rather than destructive.
 *
 * ORDER IS BY HOW LITTLE IS BEING GIVEN UP, and the groups are the operator's:
 *
 *   unowned    a registration NO durable lane owns. Nothing is given up at all.
 *   offline    the lane is closed, retired, or its worktree is gone from disk.
 *   inactive   an open lane with NOTHING WORKING IN IT, oldest activity first.
 *   active     something is working in it. Listed so the operator can see the
 *              whole pool, and refused by `reassignSlot` — a lane mid-turn must
 *              not lose its dev server because someone opened a new tab.
 *
 * "Something is working in it" is three independent claims, not one; see
 * `laneWorkingEvidence`. Keying it on runs alone was measurably wrong.
 *
 * This function DECIDES NOTHING. It ranks, explains, and hands the choice back.
 */
/**
 * A lease with no heartbeat for this long is abandoned. `alloy-stack`'s number,
 * not a second one — if that TTL moves, this reads stale and refuses too much,
 * which is the harmless direction.
 */
const STACK_LEASE_TTL_MS = 12 * 60 * 60 * 1000;

function stackLeaseDir(env = process.env) {
  const base = norm(env.ALLOY_STACK_STATE_DIR) || join(homedir(), ".local", "state", "alloy", "stack");
  return join(base, "leases");
}

/**
 * Is the lane's agent session still alive?
 *
 * NO RECORDED SESSION IS A FACT and reads false. Everything else that is not a
 * clean "no such session" reads TRUE: a tmux we cannot run, a name we cannot
 * verify, a spawn that throws. The one exception is a host with no tmux binary
 * at all: a Vacilando lane IS a tmux session, so "tmux is not installed" answers
 * the question rather than dodging it and reads false. A tmux that is present
 * but will not answer has not earned the right to take a slot away.
 */
function agentSessionAlive(session) {
  const name = norm(session);
  if (!name) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return true;
  try {
    const r = spawnSync("tmux", ["has-session", "-t", name], { timeout: 3000, stdio: "ignore" });
    // No tmux BINARY is a fact: no lane session can exist on this host. Any other
    // failure — a timeout, a server that will not answer — is an unknown, and an
    // unknown must read busy.
    if (r.error) return r.error.code !== "ENOENT";
    return r.status === 0;
  } catch { return true; }
}

/**
 * Does this worktree hold a live lease on the shared local Supabase stack?
 *
 * A lease outranks run state on purpose: certification and QA hold the stack
 * alive across many runs, and their run records are not the claim. An ABSENT
 * lease directory is a fact and reads false; an unreadable one reads true.
 */
function holdsStackLease(worktreePath, { nowMs = Date.now(), env = process.env } = {}) {
  const want = norm(worktreePath);
  if (!want) return false;
  let names;
  try { names = readdirSync(stackLeaseDir(env)); }
  catch (e) { return e?.code !== "ENOENT"; }
  for (const n of names) {
    if (!n.endsWith(".lease")) continue;
    let text;
    try { text = readFileSync(join(stackLeaseDir(env), n), "utf8"); } catch { return true; }
    const field = (k) => norm((text.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]);
    if (field("WORKTREE") !== want) continue;
    // The holder process outranks the clock: a live PID is a live lease however old.
    const pid = Number(field("PID"));
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); return true; }
      catch (e) { if (e?.code === "EPERM") return true; }
    }
    const created = Date.parse(field("CREATED"));
    if (Number.isFinite(created) && nowMs - created < STACK_LEASE_TTL_MS) return true;
  }
  return false;
}

/**
 * WHY IS THIS LANE BUSY? Returns the evidence, or null if nothing is working.
 *
 * THE ONE-SIGNAL VERSION SHIPPED AND WAS WRONG ON 11 OF 12 SLOTS.
 *
 * `busy` used to mean `hasActiveRun(lane)` alone — a run in a non-terminal state
 * at this instant. Measured on the live host the morning after it shipped, that
 * marked ELEVEN of twelve slots reclaimable, including the lane that was running
 * the measurement (open agent, 22 uncommitted files, its own run merely between
 * turns) and the lane holding the shared-stack lease with 63 uncommitted files.
 * Only one slot was protected, because only one happened to have a run mid-flight
 * in that second. Nothing was lost — reclaim is operator-confirmed and busy lanes
 * sort last — but the predicate was fail-OPEN, and ordering is not a safety model.
 *
 * A run between turns is the NORMAL state of a working lane. So three independent
 * claims, ANY of which means busy, each failing closed on its own:
 *
 *   1. a run is in flight            — the original signal, still first
 *   2. its agent session is alive    — the lane is open in tmux with someone in it
 *   3. it holds the shared stack     — certification outlives any single run
 *
 * Deliberately NOT here: uncommitted files. A dirty tree is a reason to WARN an
 * operator, not a claim that work is happening — trees stay dirty for days. The
 * dirty-tree clause belongs to the reconcile predicate, which releases without
 * asking; this function only decides what to show someone who is choosing.
 */
function laneWorkingEvidence(lane, hasActiveRun, {
  nowMs = Date.now(), env = process.env, sessionAlive = null, leaseHeld = null,
  environmentInUse = null,
} = {}) {
  // Each probe is wrapped the way the run probe already is: one that THROWS must
  // mean busy, never propagate and take the whole ranking down with it.
  const session = sessionAlive || agentSessionAlive;
  const lease = leaseHeld || ((wp) => holdsStackLease(wp, { nowMs, env }));
  const envInUse = environmentInUse || (() => "its local environment could not be read");
  const ask = (fn, arg) => { try { return fn(arg); } catch { return true; } };

  // Phrasing note: C4/R2 assert on "run in flight". The evidence string carries
  // that exact phrase so those controls keep certifying the run signal itself
  // rather than being rewritten to match a new wording.
  if (hasActiveRun(lane.lane_id)) return "there is a run in flight";
  if (ask(lease, lane.worktree_path)) return "it holds a lease on the shared local stack";

  /*
   * A RESIDENT AGENT SESSION NO LONGER PROTECTS A SLOT, AND THAT WAS THE
   * COUPLING THAT MADE SLOTS STICK.
   *
   * The old rule protected whenever the tmux session was alive, so a lane that
   * had stopped working kept its port forever and the operator had to run
   * `alloy-sprint-finish` — ending a sprint — merely to free local capacity.
   *
   * What actually depends on the slot is the ENVIRONMENT: a dev server this
   * lane owns, or a QA browser bound to it. Reassigning under either would
   * break real work. Reassigning under a session that is merely resident does
   * not: development-slot-yield-session-survival starts a real tmux session,
   * runs a real reassignment, and proves the same pane process is still alive
   * afterwards. The lane keeps its worktree, branch, history and registration
   * and becomes slotless — a supported, dispatchable state.
   */
  const inUse = ask(envInUse, lane.slot ?? lane.binding_slot ?? null);
  if (inUse) return typeof inUse === "string" ? inUse : "its local environment is in use";
  return null;
}

/**
 * DOES THIS SLOT'S LOCAL ENVIRONMENT ACTUALLY HOLD ANYTHING?
 *
 * A Development Slot owns a deterministic port, the dev server on it, and the
 * browser QA context keyed to it. It does not own the lane, the branch, the
 * worktree or the resident agent process — those outlive it, which is the whole
 * point of the elastic model.
 *
 * OBSERVED ONCE PER RANKING. `observeServerFleet` walks the process tree; doing
 * that once per lane would turn ranking twelve slots into twelve scans.
 *
 * `ownership_state`, NOT `observed_state`. The observer distinguishes a server
 * this lane OWNS from a foreign process that merely holds the port and from an
 * unattributable listener. Only the first is a reason to keep the slot — letting
 * a stray process pin another lane's slot open is the bug this distinction
 * exists to prevent, and `observed_state` cannot tell them apart.
 */
async function slotEnvironmentProbe({ root = runtimeRoot() } = {}) {
  let owned = null;
  try {
    const { observeServerFleet } = await import("./server-fleet-observation.mjs");
    owned = new Set(
      (observeServerFleet({ root })?.servers || [])
        .filter((r) => r.ownership_state === "owned_running")
        .map((r) => Number(r.slot)),
    );
  } catch { owned = null; }

  return (slot) => {
    const n = asSlot(slot);
    if (n == null) return false;
    // Unreadable is busy. A slot whose environment cannot be inspected is not a
    // slot we may take.
    if (owned === null) return "its local environment could not be read";
    if (owned.has(n)) return "it owns a running dev server on its port";
    // A QA browser bound to the slot is a live dependency; a captured storage
    // file is NOT, and must never pin a slot open on its own.
    try {
      const pidPath = join(root, "browser-pids", `${n}.pid`);
      if (existsSync(pidPath)) {
        const pid = Number(String(readFileSync(pidPath, "utf8")).trim());
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); return "a QA browser is open on its slot"; }
          catch (e) { if (e?.code === "EPERM") return "a QA browser is open on its slot"; }
        }
      }
    } catch { return "its local environment could not be read"; }
    return false;
  };
}

/*
 * `warm` sits between `inactive` and `active` deliberately. A warm lane has a
 * live agent session whose slot environment is idle: the slot may move and the
 * session survives, proven directly by
 * development-slot-yield-session-survival. A lane with no session at all is
 * still the quieter thing to take, so warm is offered only after inactive.
 */
export const SLOT_RECLAIM_GROUPS = Object.freeze(["unowned", "offline", "inactive", "warm", "active"]);

export async function slotReclaimCandidates({
  root = runtimeRoot(),
  cfg = null,
  metadata = null,
  nowMs = Date.now(),
  activeRun = null,
  // The same seam as `activeRun`, for the same reason: a test must be able to
  // state what is alive rather than depend on the tmux and lease state of the
  // machine it happens to run on.
  sessionAlive = null,
  leaseHeld = null,
  environmentInUse = null,
  // The lane asking for a slot must never be offered its own. It has none to
  // give — that is why it is asking — and listing it would invite a choice that
  // resolves to nothing.
  excludeWorktree = null,
} = {}) {
  const excluded = norm(excludeWorktree);
  const conf = cfg || resolveRuntimeConfig();
  const meta = metadata || readAllMetadata(conf);
  const audit = auditLaneWorktrees({ root, cfg: conf, metadata: meta });

  // A run store that cannot be read must make every lane look BUSY, never free.
  // Guessing "idle" here is precisely how a lane mid-turn loses its dev server.
  let activeRunForLane = null;
  if (!activeRun) {
    try { ({ activeRunForLane } = await import("./execution-run.mjs")); }
    catch { activeRunForLane = null; }
  }
  // FAIL CLOSED AROUND THE CALL, NOT AROUND ONE SOURCE. The first cut guarded
  // only the imported reader, so an injected probe that threw propagated out and
  // took the whole ranking with it — the one shape where "I cannot tell" must
  // mean BUSY rather than an exception.
  const probe = activeRun || ((laneId) => (activeRunForLane ? Boolean(activeRunForLane(laneId, root)) : true));
  const hasActiveRun = (laneId) => { try { return Boolean(probe(laneId)); } catch { return true; } };
  const envInUse = environmentInUse || await slotEnvironmentProbe({ root });

  const out = [];

  // A CLOSED LANE IS UNOWNED, AND SAYING "no lane owns this" WOULD BE A LIE.
  // `listDurableLanes` excludes retired lanes, so a closed lane's registration
  // arrives here as an orphan. That classification is right — nothing LIVE owns
  // the slot — but the operator is choosing what to take, and "nobody owns it"
  // reads very differently from "the lane you closed still holds it". The
  // retired records are consulted so the reason can say which it is.
  const retired = new Map();
  try {
    for (const l of listDurableLanes(root, { includeRetired: true })) {
      const n = norm(l?.binding?.worktree_name);
      if (n) retired.set(n, l);
    }
  } catch { /* an unreadable store only costs the nicer wording */ }

  for (const o of audit.orphans) {
    if (o.slot == null) continue;
    const closed = retired.get(norm(o.worktree)) || null;
    out.push({
      slot: o.slot, port: o.port, worktree: o.worktree, path: o.path,
      group: "unowned", holder_kind: closed ? "closed_lane" : "orphan",
      lane_id: closed?.lane_id ?? null, lane_name: closed?.name ?? null,
      last_activity_ms: closed ? (Date.parse(closed.updated_at || "") || 0) : null,
      reclaimable: true,
      reason: closed
        ? `${closed.name || o.worktree} is closed and still holds slot ${o.slot}.`
        : `No Development Lane owns ${o.worktree}; its slot is held by a registration alone.`,
    });
  }

  for (const l of audit.lanes) {
    // Read the slot from the REGISTRATION, not from the resolution. A lane whose
    // worktree is gone from disk resolves early with `slot: null` — and it is
    // still occupying that slot in the registry, which makes it one of the best
    // candidates rather than an invisible one.
    const heldSlot = asSlot(l.slot) ?? asSlot(l.registry?.slot);
    if (heldSlot == null) continue;
    const open = l.lane_open === true;
    const missing = Boolean(l.worktree_path) && !existsSync(l.worktree_path);
    const finished = norm(l.registry?.lifecycle).toLowerCase() === "finished";
    const offline = !open || finished || missing;
    const working = offline
      ? null
      : laneWorkingEvidence(l, hasActiveRun, { nowMs, sessionAlive, leaseHeld, environmentInUse: envInUse });
    const resident = offline || working
      ? false
      : (() => { try { return Boolean((sessionAlive || agentSessionAlive)(l.tmux_session)); } catch { return true; } })();
    const group = offline ? "offline" : (working ? "active" : (resident ? "warm" : "inactive"));
    out.push({
      slot: heldSlot, port: l.port ?? asPort(l.registry?.port), worktree: l.worktree_name, path: l.worktree_path,
      group, holder_kind: "lane",
      lane_id: l.lane_id, lane_name: l.lane_name,
      last_activity_ms: laneLastActivityMs(l.lane_id, root),
      reclaimable: group !== "active",
      reason: group === "offline"
        ? (missing ? `${l.lane_name} has no worktree on disk.`
          : finished ? `${l.lane_name}'s registration is marked finished.`
            : `${l.lane_name} is closed.`)
        : group === "active"
          ? `${l.lane_name} is working — ${working}. Taking its slot would pull the dev server out from under it.`
          : group === "warm"
            ? `${l.lane_name} has an agent session open but nothing using its slot. It keeps running, registered and dispatchable, without one.`
            : `${l.lane_name} is open with nothing running.`,
    });
  }

  const ranked = excluded ? out.filter((c) => norm(c.worktree) !== excluded) : out;
  const rank = (c) => SLOT_RECLAIM_GROUPS.indexOf(c.group);
  ranked.sort((a, b) => {
    const g = rank(a) - rank(b);
    if (g !== 0) return g;
    // Within a group: least recently active first — the least disruptive to take.
    const aa = a.last_activity_ms ?? 0;
    const bb = b.last_activity_ms ?? 0;
    if (aa !== bb) return aa - bb;
    return a.slot - b.slot;
  });
  return { ok: true, candidates: ranked, free: freeSlots({ cfg: conf, metadata: meta }) };
}

/** Most recent meaningful timestamp for a lane, for ordering only. */
function laneLastActivityMs(laneId, root) {
  try {
    const lane = getDurableLane(laneId, root);
    const t = Date.parse(lane?.updated_at || "");
    return Number.isFinite(t) ? t : 0;
  } catch { return 0; }
}

/**
 * MOVE ONE SLOT FROM ONE WORKTREE TO ANOTHER.
 *
 * Two calls to the canonical writer and nothing else: the donor is re-adopted
 * WITHOUT a slot, the recipient is adopted WITH it. There is no third registry,
 * no direct metadata write, and no retirement — `alloy-sprint-finish` closes a
 * worktree, and that is emphatically not what this is.
 *
 * FAILS CLOSED ON EVERY AMBIGUITY. A donor with a run in flight, a donor that
 * does not hold the slot it is said to hold, a recipient that already has one,
 * a missing worktree: each is refused by name rather than resolved by guessing.
 * The donor is demoted FIRST, because adopting the recipient onto a slot the
 * registry still shows as taken is exactly what `alloy-worktree-adopt` refuses.
 */
/**
 * GET THIS LANE A DEVELOPMENT SLOT, IF ONE CAN BE HAD SAFELY.
 *
 * THE GAP THIS CLOSES. Yield made slots movable and the ranking made it safe to
 * choose one, but the trigger stayed manual: a slotless lane asked to start a
 * dev server hit `metadata missing ALLOY_WORKTREE_SLOT` and an operator had to
 * go and find it capacity by hand.
 *
 * This adds ONLY the trigger. Every judgement is delegated to the promoted
 * owners: `freeSlots` says what is unused, `slotReclaimCandidates` ranks who may
 * give one up, `reassignSlot` performs the move and RE-RANKS at mutation time.
 * Nothing here decides safety for itself.
 *
 * THE ONE THING THIS MUST NEVER DO is take a slot from a working lane, so
 * `acknowledgeActive` is deliberately NOT passed. `reassignSlot` refuses a donor
 * that became active between ranking and mutation, and that refusal is allowed
 * to stand: an automatic acquirer that could override it would be a lane-killer
 * with a convenience name. If nothing is safely available the caller is told so
 * and the work stays durable — waiting is a correct outcome here, not a failure.
 */
export async function ensureLaneSlot({
  worktreeName,
  provider = "claude",
  root = runtimeRoot(),
  cfg = null,
  metadata = null,
  toolkitDir = null,
  nowMs = Date.now(),
  // The same seams the ranking and the move take, so this is testable without
  // depending on the machine it runs on.
  activeRun = null,
  sessionAlive = null,
  leaseHeld = null,
  environmentInUse = null,
} = {}) {
  const name = norm(worktreeName);
  if (!name) return { ok: false, error: "missing_worktree_name" };
  const conf = cfg || resolveRuntimeConfig();
  const meta = metadata || readAllMetadata(conf);

  const reg = registrationForWorktree(name, { cfg: conf, metadata: meta });
  if (!reg) {
    return { ok: false, error: "not_registered", detail: `${name} has no managed registration.` };
  }
  const held = asSlot(reg.slot);
  if (held != null) {
    return { ok: true, slot: held, port: reg.port ?? null, acquired: "already_held", worktree: name };
  }

  // 1. An unused slot is always preferable to taking one from somebody.
  const free = freeSlots({ cfg: conf, metadata: meta });
  if (free.length) {
    const slot = free[0];
    const taken = await registerCreatedWorktree({
      worktreeName: name, provider: reg.provider || provider, slot,
      force: true, toolkitDir, root, cfg: conf, metadata: meta,
    });
    if (!taken.ok || taken.slot !== slot) {
      return { ok: false, error: "free_slot_adopt_failed", detail: taken.detail || `did not take free slot ${slot}`, slot };
    }
    return { ok: true, slot, port: taken.port ?? null, acquired: "free", worktree: name };
  }

  // 2. Otherwise the highest-ranked SAFE candidate — the ranking already orders
  //    these least-costly first, so "the first reclaimable one" is the answer.
  const ranked = await slotReclaimCandidates({
    root, cfg: conf, metadata: meta, nowMs,
    activeRun, sessionAlive, leaseHeld, environmentInUse,
    excludeWorktree: name,
  });
  const candidate = ranked.candidates.find((c) => c.reclaimable);
  if (!candidate) {
    return {
      ok: false,
      error: "no_safe_slot",
      detail: "Every Development Slot is in use by a lane that is working. The instruction is preserved; nothing was taken.",
      candidates: ranked.candidates,
    };
  }

  const moved = await reassignSlot({
    fromWorktree: candidate.worktree, toWorktree: name, provider,
    root, cfg: conf, metadata: meta, toolkitDir, nowMs,
    activeRun, sessionAlive, leaseHeld, environmentInUse,
    // NOT acknowledged. A donor that turned active since ranking keeps its slot.
  });
  if (!moved.ok) {
    return { ok: false, error: "reclaim_failed", detail: moved.detail || moved.error, donor: candidate.worktree, reclaim_result: moved };
  }
  return {
    ok: true, slot: moved.slot, port: moved.port ?? null,
    acquired: "reclaimed", worktree: name,
    // The donor is named with the CLASSIFICATION the ranking used and the
    // REASON it judged the donor safe, because an automatic capacity movement
    // that cannot be audited afterwards is not one anybody should trust.
    donor: {
      worktree: candidate.worktree,
      lane_id: candidate.lane_id ?? null,
      lane_name: candidate.lane_name || null,
      group: candidate.group,
      reason: candidate.reason || null,
    },
  };
}

export async function reassignSlot({
  fromWorktree,
  toWorktree,
  provider = "claude",
  root = runtimeRoot(),
  cfg = null,
  metadata = null,
  toolkitDir = null,
  acknowledgeActive = false,
  activeRun = null,
  // The SAME seams the ranking takes. This function re-ranks at mutation time —
  // that is the point of it — so without these its verdict cannot be stated
  // either, and a test of "a warm donor yields" would silently be testing the
  // machine it runs on instead.
  sessionAlive = null,
  leaseHeld = null,
  environmentInUse = null,
  nowMs = Date.now(),
} = {}) {
  const donor = norm(fromWorktree);
  const recipient = norm(toWorktree);
  if (!donor || !recipient) return { ok: false, error: "missing_worktree_name" };
  if (donor === recipient) return { ok: false, error: "same_worktree" };

  const conf = cfg || resolveRuntimeConfig();
  const meta = metadata || readAllMetadata(conf);
  const donorReg = registrationForWorktree(donor, { cfg: conf, metadata: meta });
  if (!donorReg) return { ok: false, error: "donor_not_registered", detail: `${donor} has no managed registration.` };
  const slot = asSlot(donorReg.slot);
  if (slot == null) return { ok: false, error: "donor_has_no_slot", detail: `${donor} holds no slot to give.` };

  const recipientReg = registrationForWorktree(recipient, { cfg: conf, metadata: meta });
  if (recipientReg && asSlot(recipientReg.slot) != null) {
    return { ok: false, error: "recipient_already_slotted", detail: `${recipient} already holds slot ${asSlot(recipientReg.slot)}.` };
  }

  // RE-EVALUATED HERE, AT MUTATION TIME. The operator chose from a list that
  // was true when it was rendered; a lane can start a turn between the render
  // and the click, and the stale answer must never be the one that decides.
  const ranked = await slotReclaimCandidates({
    root, cfg: conf, metadata: meta, nowMs, activeRun,
    sessionAlive, leaseHeld, environmentInUse,
    excludeWorktree: recipient,
  });
  const chosen = ranked.candidates.find((c) => norm(c.worktree) === donor);
  if (chosen && !chosen.reclaimable && !acknowledgeActive) {
    return { ok: false, error: "donor_active", detail: chosen.reason, candidate: chosen };
  }

  // 1. The donor gives up the port and KEEPS its registration.
  const demoted = await registerCreatedWorktree({
    worktreeName: donor, provider: donorReg.provider || provider,
    slotless: true, force: true, toolkitDir, root, cfg: conf, metadata: meta,
  });
  if (!demoted.ok || demoted.slot != null) {
    return { ok: false, error: "donor_demote_failed", detail: demoted.detail || "the donor did not give up its slot", donor_result: demoted };
  }

  // 2. The recipient takes it. Re-read the registry: step 1 just changed it.
  const taken = await registerCreatedWorktree({
    worktreeName: recipient, provider, slot, force: Boolean(recipientReg),
    toolkitDir, root, metadata: null, cfg: conf,
  });
  if (!taken.ok || taken.slot !== slot) {
    return {
      ok: false, error: "recipient_adopt_failed",
      detail: taken.detail || `${recipient} did not take slot ${slot}; ${donor} is now slotless and the slot is free.`,
      recipient_result: taken, freed_slot: slot,
    };
  }

  try { reconcileLaneSlotBinding(chosen?.lane_id || "", { root, nowMs, cfg: conf }); } catch { /* binding follows on next resolve */ }

  return {
    ok: true, slot, port: taken.port,
    from: { worktree: donor, lane_id: chosen?.lane_id ?? null, lane_name: chosen?.lane_name ?? null, group: chosen?.group ?? null },
    to: { worktree: recipient, provider },
  };
}

/**
 * A LANE THAT HAS A WORKTREE MUST END UP REGISTERED, WHATEVER CREATED IT.
 *
 * THE DEFECT THIS CLOSES. Registration happened in exactly one place — the
 * `new_worktree` branch of lane creation — and only if it succeeded on the first
 * try. Everything else produced a bound, unregistered, permanently undeliverable
 * lane, and nothing ever went back:
 *
 *   - creation with no free slot registered nothing and moved on;
 *   - `connect_existing` never called registration at all;
 *   - a durable restore onto a new host carries lanes and bindings, and the slot
 *     registry is host-local state no backup carries.
 *
 * In every one of those the operator's experience is identical and gives them
 * nothing to act on: an agent that is demonstrably running, and a lane that says
 * it is unregistered.
 *
 * So registration is repaired AT THE POINT OF USE rather than only at creation.
 * A creation path can be missed; a send cannot. This runs before the dispatch
 * guard, does nothing at all when the lane is already registered, and is the
 * reason a newly created lane does not need creation to have gone perfectly.
 *
 * IT STILL NEVER GUESSES OWNERSHIP. It repairs exactly one condition —
 * WORKTREE_UNREGISTERED, on a directory that exists, for a worktree no other
 * open lane claims. A missing directory, a finished registration, a slot
 * mismatch or a contested worktree are reported and left alone: those are
 * genuine ambiguities, and adopting through them is how a lane would quietly
 * take over another lane's work.
 */
export async function ensureLaneWorktreeRegistered(laneId, {
  root = runtimeRoot(),
  cfg = null,
  metadata = null,
  gitImpl = null,
  toolkitDir = null,
  nowMs = Date.now(),
} = {}) {
  const resolved = resolveLaneWorktree(laneId, { root, cfg, metadata, gitImpl });
  if (resolved.code !== LANE_LIFECYCLE_ERRORS.WORKTREE_UNREGISTERED) {
    // Includes the healthy case and every ambiguous one. Not this function's
    // business, and reported as untouched rather than as a failure.
    return { ok: true, changed: false, reason: resolved.code || "managed", resolution: resolved };
  }
  const name = norm(resolved.worktree_name);
  const path = norm(resolved.worktree_path);
  if (!name || !path) {
    return { ok: false, changed: false, error: LANE_LIFECYCLE_ERRORS.WORKTREE_UNBOUND, detail: lifecycleDetail("lane_worktree_unbound"), resolution: resolved };
  }
  if (!existsSync(path)) {
    return { ok: false, changed: false, error: LANE_LIFECYCLE_ERRORS.WORKTREE_MISSING, detail: lifecycleDetail("lane_worktree_missing"), resolution: resolved };
  }
  // A worktree two open lanes both claim is a conflict to report, never one to
  // resolve by registering it to whichever lane happened to send first.
  const contender = listDurableLanes(root).find((l) => l.lane_id !== resolved.lane_id
    && OPEN_LANE_STATUSES.includes(norm(l.status) || LANE_OPEN)
    && (norm(l.binding?.worktree_name) === name
      || (norm(l.binding?.worktree_path) && norm(l.binding.worktree_path) === path)));
  if (contender) {
    return {
      ok: false, changed: false, error: "worktree_claimed_by_another_lane",
      detail: `${name} is also bound to ${contender.lane_id} (${contender.name || "unnamed"}); registration would decide an ownership question this cannot answer.`,
      resolution: resolved,
    };
  }
  const lane = getDurableLane(resolved.lane_id, root);
  const provider = norm(lane?.binding?.provider) || norm(lane?.preferred_provider) || "claude";
  const registered = await registerCreatedWorktree({ worktreeName: name, provider, toolkitDir, root, cfg, metadata });
  if (!registered.ok) {
    return { ok: false, changed: false, error: registered.error, detail: registered.detail || null, resolution: resolved };
  }
  // Re-read from disk: the metadata this just wrote is not in whatever snapshot
  // the caller handed in, and reconciling against a stale one would write the
  // absence back onto the binding.
  const reconciled = reconcileLaneSlotBinding(resolved.lane_id, { root, nowMs, gitImpl });
  return {
    ok: true,
    changed: true,
    lane_id: resolved.lane_id,
    worktree: name,
    slot: registered.slot ?? null,
    port: registered.port ?? null,
    slotless: Boolean(registered.slotless),
    detail: registered.detail || null,
    reconciled: reconciled?.ok ? reconciled : null,
    resolution: resolveLaneWorktree(resolved.lane_id, { root, gitImpl }),
  };
}
