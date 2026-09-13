/**
 * INFRASTRUCTURE PREFLIGHT FOR THE GOVERNED QA ACTIONS.
 *
 * THE GAP THIS CLOSES. The three managed QA actions —
 * `environment.provision_qa_identity`, `environment.assign_qa_identity_access`
 * and `environment.restore_qa_session` — resolve slot, port, worktree and
 * identity from the registries, so `assertManagedLaneEnvironment` refuses a
 * lane whose worktree is registered WITHOUT a Development Slot. A slotless lane
 * could therefore not even file the request, and the answer was an operator
 * moving capacity by hand.
 *
 * DIRECTOR DECISION — OPTION C. Safe Development Slot acquisition is
 * INFRASTRUCTURE SCHEDULING, not a governed decision, exactly as it already is
 * on the promoted dev-server path (`controlMissionLocalServer`). It therefore
 * needs no approval of its own. The QA actions themselves stay governed exactly
 * as they are: this module does not touch their authorization, identity, tenant
 * or secret controls, and nothing here can cause one to execute.
 *
 * THE SEQUENCE, and it is not negotiable:
 *
 *     validate QA request
 *       -> ensure the required lane has a safe Development Slot
 *         -> assert managed lane environment
 *           -> perform the governed QA action
 *
 * If slot acquisition fails the governed QA mutation MUST NOT BEGIN.
 *
 * EVERY JUDGEMENT IS DELEGATED. `ensureLaneSlot` is the sole allocator: it
 * prefers a free slot, then the highest-ranked SAFE donor from
 * `slotReclaimCandidates`, and it never passes `acknowledgeActive`. There is no
 * QA-specific allocator here, no second ranking, and no reclaim approval flow —
 * building any of those would be a way to lose the safety rules that one owner
 * already enforces. What this module adds is the TRIGGER and the AUDIT LINE.
 */
import { ACTION_TYPES } from "./trusted-host-action-registry.mjs";

/**
 * The governed actions that cannot execute without a Development Slot, because
 * each resolves its slot, port and registered QA identity from the registry.
 *
 * `environment.restore_deployed_qa_session` is deliberately NOT here: a deployed
 * target has no lane, no slot and no port, and inventing one for it is the exact
 * near-miss that lets a deployed request be answered with a loopback session.
 */
export const SLOT_DEPENDENT_QA_ACTIONS = Object.freeze([
  ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY,
  ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS,
  ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION,
]);

/** The one refusal, named the same way the dev-server path names it. */
export const NO_DEVELOPMENT_SLOT = "no_development_slot_available";

export function qaActionNeedsDevelopmentSlot(actionKey) {
  return SLOT_DEPENDENT_QA_ACTIONS.includes(String(actionKey ?? "").trim());
}

/**
 * GET THE TARGET LANE A DEVELOPMENT SLOT, IF ONE CAN BE HAD SAFELY.
 *
 * Returns `{ ok: true, required: false }` for anything that is not a
 * slot-dependent QA action — callers may run this unconditionally.
 *
 * On success `moved` says whether capacity actually changed hands, and
 * `movement` carries what an auditor needs: the slot number, the recipient, the
 * donor, the classification the ranking used, and the reason that donor was
 * safe. Informational — it is not a second approval.
 *
 * On failure the caller must not begin the governed QA mutation. The refusal is
 * actionable and the governed request is left alone so it can be retried.
 */
export async function ensureQaDevelopmentSlot(laneId, {
  actionKey = null,
  root = null,
  // The same seams the ranking and the move take, so a caller can state this
  // module's verdict in a test without depending on the machine it runs on.
  ensure = null,
  resolve = null,
  activeRun = null,
  sessionAlive = null,
  leaseHeld = null,
  environmentInUse = null,
} = {}) {
  if (actionKey != null && !qaActionNeedsDevelopmentSlot(actionKey)) {
    return { ok: true, required: false, moved: false };
  }
  const lane = String(laneId ?? "").trim();
  if (!lane) {
    return {
      ok: false,
      required: true,
      moved: false,
      error: "missing_lane_id",
      detail: "A governed QA action is filed against a lane; there is no lane to give a slot to.",
    };
  }

  const L = await import("./lane-worktree-lifecycle.mjs");
  const resolveFn = resolve || L.resolveLaneWorktree;
  const resolution = resolveFn(lane, root ? { root } : {});
  const worktree = resolution?.worktree_name || null;

  /*
   * A LANE WITH NO WORKTREE NEEDS PROVISIONING, NOT CAPACITY.
   *
   * Closed, unbound and unknown lanes are somebody else's refusal to make, and
   * `assertManagedLaneEnvironment` makes it in words that name the real missing
   * prerequisite. Inventing a slot-shaped answer here would replace a correct
   * diagnosis with a misleading one, so the preflight steps aside and lets the
   * governed validation speak.
   */
  if (!worktree) {
    return {
      ok: true,
      required: true,
      moved: false,
      deferred_to_lifecycle: resolution?.code || "lane_worktree_unbound",
      lane_id: lane,
    };
  }

  const ensureFn = ensure || L.ensureLaneSlot;
  const got = await ensureFn({
    worktreeName: worktree,
    ...(root ? { root } : {}),
    activeRun,
    sessionAlive,
    leaseHeld,
    environmentInUse,
  });

  if (!got?.ok) {
    return {
      ok: false,
      required: true,
      moved: false,
      // `no_safe_slot` is the allocator's word for "every slot belongs to a lane
      // that is working". To a caller holding a QA request the actionable name
      // is the one the dev-server path already uses.
      error: got?.error === "no_safe_slot" ? NO_DEVELOPMENT_SLOT : (got?.error || NO_DEVELOPMENT_SLOT),
      detail: got?.detail || "Could not acquire a Development Slot for this lane.",
      lane_id: lane,
      worktree,
      candidates: got?.candidates || null,
    };
  }

  const moved = got.acquired !== "already_held";
  const out = {
    ok: true,
    required: true,
    moved,
    acquired: got.acquired,
    slot: got.slot ?? null,
    port: got.port ?? null,
    lane_id: lane,
    worktree,
  };
  if (!moved) return out;

  // OBSERVABLE, BECAUSE A CAPACITY CHANGE NOBODY CAN AUDIT IS THE PROBLEM.
  out.movement = {
    slot: got.slot ?? null,
    recipient_lane: lane,
    recipient_worktree: worktree,
    classification: got.acquired === "free" ? "free" : (got.donor?.group || null),
    donor_lane: got.donor?.lane_id || null,
    donor_lane_name: got.donor?.lane_name || null,
    donor_worktree: got.donor?.worktree || null,
    reason: got.acquired === "free"
      ? `Slot ${got.slot} was unused; nothing was taken from any lane.`
      : (got.donor?.reason || null),
  };
  return out;
}

/**
 * FILE A GOVERNED ACTION WITH THE INFRASTRUCTURE PREFLIGHT IN FRONT OF IT.
 *
 * The single door every filing path uses, so the preflight cannot be forgotten
 * by the next caller that files a QA action. Non-QA actions pass straight
 * through: the preflight is a no-op for them by action key.
 *
 * The governed request is filed ONLY after the lane has a slot. A request that
 * could never execute is not a request, it is an operator card asking approval
 * for something impossible — which is exactly what gar_97d071ef22861f was.
 */
export async function fileGovernedActionWithQaSlotPreflight(input = {}, opts = {}) {
  const actionKey = input.action_key || input.actionKey || null;
  const laneId = input.lane_id || input.laneId || null;
  const pre = await ensureQaDevelopmentSlot(laneId, {
    actionKey,
    root: opts.root ?? null,
  });
  if (!pre.ok) {
    return {
      ok: false,
      error: pre.error,
      failure_code: pre.error,
      detail: pre.detail,
      slot_preflight: pre,
    };
  }

  const { requestGovernedAction, getGovernedAction, saveGovernedActionRecord } =
    await import("./governed-action-request.mjs");
  const out = requestGovernedAction(input, opts);
  if (!pre.moved) return out;

  // The movement is recorded ON the request it was performed for, so the audit
  // trail of the QA action says where its capacity came from.
  if (out?.ok && out.request?.request_id) {
    try {
      const rec = getGovernedAction(out.request.request_id, opts.root || undefined);
      if (rec) {
        rec.slot_preflight = { acquired: pre.acquired, ...pre.movement };
        saveGovernedActionRecord(rec, opts.root || undefined);
        out.request.slot_preflight = rec.slot_preflight;
      }
    } catch { /* visibility must never be the reason a filed request fails */ }
  }
  return { ...out, slot_preflight: pre };
}
