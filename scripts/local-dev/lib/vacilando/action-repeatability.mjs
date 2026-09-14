/**
 * "DO IT AGAIN" AND "MAKE SURE IT IS DONE" ARE DIFFERENT REQUESTS.
 *
 * The dedupe layer could not tell them apart, so it answered both the same way:
 * a completed trusted-host action was replayed for any later request of the
 * same type in the same Execution Run.
 *
 * MEASURED. `environment.execute_registered_reconciliation` was filed twice in
 * erun_dc7857293e0e0502. Both requests came back `complete — Succeeded`, and
 * both carried `result_ref tha_5975676b98005f` — one execution, answered twice.
 * The runner's own diagnostic gave it away: the first opened `DELETE 0` against
 * an empty tenant, and a genuine second execution opens `DELETE 4`, tearing
 * down its own rows. Filed from a NEW run the same inputs produced
 * `tha_8d0e582f32d2ee` and really ran. An idempotency certification therefore
 * could not be performed inside one run at all.
 *
 * THE FIX IS NOT "STOP REUSING COMPLETED RESULTS". Reuse is what makes a retry
 * safe, and retries are the common case: a delivery repeats, a process
 * restarts, an operator clicks twice. Withdrawing it globally would trade a
 * certification problem for a correctness one.
 *
 * What was missing is the SEMANTICS OF THE REQUEST. Some governed requests mean
 * "ensure this postcondition" — the branch is at this SHA, the migration is
 * applied, the ceiling is this number — and answering a second one from the
 * first result is exactly right. Others mean "perform another occurrence", and
 * for those a NEW request is a new occurrence by definition.
 *
 * OCCURRENCE IDENTITY IS RUNTIME-OWNED. It is the governed request id, which
 * `authorizationContext.requestId` already carries and which a caller cannot
 * manufacture — the field is documented in `requestTrustedHostAction` as
 * "CARRIED, NOT INVENTED". A retry of the same request keeps its id and reuses;
 * a new request has a new id and executes. No `dedupeKey` is exposed, and none
 * is needed: a caller inventing execution identity is the thing this must not
 * become.
 */

/** What a repeated governed request MEANS for this action type. */
export const REPEATABILITY = Object.freeze({
  /** A repeat asks for the same postcondition. Replaying the finished result is correct. */
  REUSE_CORRECT: "REUSE_CORRECT",
  /** A new request is a new occurrence and must actually execute. */
  REEXECUTE_REQUIRED: "REEXECUTE_REQUIRED",
  /** Only the operation's own context can say. Fails closed to re-execution. */
  CONTEXT_DEPENDENT: "CONTEXT_DEPENDENT",
});

/**
 * Every registered action, with the reason for its classification.
 *
 * Classified by what a repeat MEANS, never by risk class: `repository.push` is
 * a privileged write and is safely reusable, while `restore_qa_session` is a
 * comparatively mild action that must mint again. Risk says how much damage a
 * mistake does; it says nothing about whether a second request is a second
 * occurrence.
 */
export const ACTION_REPEATABILITY = Object.freeze({
  // ── ensure-a-postcondition. A second request wants the same end state.
  "repository.push": { class: "REUSE_CORRECT", why: "the branch is at this SHA — a repeat asks for the same end state" },
  "promotion.open_pr": { class: "REUSE_CORRECT", why: "a pull request exists for this head; a second one would be a duplicate" },
  "repository.merge_pull_request": { class: "REUSE_CORRECT", why: "the PR is merged — merging again is not a second occurrence, it is an error" },
  "repository.close_pull_request": { class: "REUSE_CORRECT", why: "the PR is closed; closing a closed PR asks for the state it already has" },
  "repository.delete_remote_branch": { class: "REUSE_CORRECT", why: "the branch is gone; a repeat asks for absence, which is already true" },
  "repository.promote_metadata": { class: "REUSE_CORRECT", why: "the metadata is at this content; a repeat asks for the same content" },
  "database.apply_migration": { class: "REUSE_CORRECT", why: "the ledger contains this version — re-applying is precisely what must not happen" },
  "database.apply_promoted_migration": { class: "REUSE_CORRECT", why: "as apply_migration: the postcondition is a ledger identity, not an event" },
  "database.repair_migration_ledger": { class: "REUSE_CORRECT", why: "the ledger is repaired to a stated shape" },
  "host.install_toolkit": { class: "REUSE_CORRECT", why: "the installed toolkit is at this SHA, and the action is compare-and-swap on that" },
  "capacity.set_provider_ceiling": { class: "REUSE_CORRECT", why: "the ceiling is this number" },
  "environment.provision_qa_identity": { class: "REUSE_CORRECT", why: "the identity exists; provisioning twice would fork it" },
  "environment.assign_qa_identity_access": { class: "REUSE_CORRECT", why: "the identity holds this access" },
  "platform.register_developer_application": { class: "REUSE_CORRECT", why: "the application is registered under this slug" },
  "vacilando.retire_worktree": { class: "REUSE_CORRECT", why: "the worktree is retired; its keyless-reuse hazard is held by normalized-input comparison, not by repeatability" },

  // ── perform-another-occurrence. A new request is a new event.
  "environment.execute_registered_reconciliation": {
    class: "REEXECUTE_REQUIRED",
    why: "a fixture seed is a teardown followed by a rebuild — the measured specimen where one execution answered two requests",
  },
  "vacilando.apply_reconciliation_plan": { class: "REEXECUTE_REQUIRED", why: "applying a plan is an event against state that has since moved" },
  "environment.restore_qa_session": { class: "REEXECUTE_REQUIRED", why: "a session is minted and expires; replaying a mint reports a dead session as live" },
  "environment.restore_deployed_qa_session": { class: "REEXECUTE_REQUIRED", why: "as restore_qa_session — already the reason this one carries resultKeeps: false" },
  "lane.dispatch_measurement_instruction": { class: "REEXECUTE_REQUIRED", why: "each dispatch is an instruction actually delivered to a lane" },

  // ── only the operation can say.
  "database.read_census": {
    class: "CONTEXT_DEPENDENT",
    why: "a census is a measurement AT A TIME — a before/after needs two, while a retry of one wants the same answer",
  },
});

/** Actions whose classification is not declared are treated as the cautious case. */
export const UNDECLARED_DEFAULT = REPEATABILITY.CONTEXT_DEPENDENT;

export function repeatabilityFor(actionType) {
  const row = ACTION_REPEATABILITY[String(actionType)];
  if (!row) return { class: UNDECLARED_DEFAULT, why: "no declared repeatability; treated as context-dependent", declared: false };
  return { ...row, declared: true };
}

/**
 * May this request adopt a COMPLETED trusted-host action?
 *
 * @param {object} args
 * @param {string} args.actionType
 * @param {object} args.existing            the completed action a naive match found
 * @param {string|null} args.requestId      the governed request id of THIS request
 * @param {boolean|null} args.reuseAuthorized  an operation's own answer, for CONTEXT_DEPENDENT
 * @returns {{reuse:boolean, disposition:string, why:string}}
 */
export function completedReuseDecision({ actionType, existing, requestId = null, reuseAuthorized = null } = {}) {
  const { class: kind, why } = repeatabilityFor(actionType);
  const existingRequestId = existing?.authorizationIdentity?.requestId ?? null;

  /*
   * A RETRY IS THE SAME REQUEST, AND IT ALWAYS REUSES.
   *
   * Checked FIRST, for every classification. Delivery repeats, processes
   * restart, an operator clicks twice — and none of those is a second
   * occurrence of anything. Putting this ahead of the classification is what
   * keeps repeatability from costing retry safety.
   */
  if (requestId && existingRequestId && requestId === existingRequestId) {
    return { reuse: true, disposition: "retry_reuse", why: "the same governed request, delivered again" };
  }

  if (kind === REPEATABILITY.REUSE_CORRECT) {
    return { reuse: true, disposition: "completed_result_reuse", why };
  }

  if (kind === REPEATABILITY.REEXECUTE_REQUIRED) {
    return { reuse: false, disposition: "new_occurrence", why };
  }

  // CONTEXT_DEPENDENT: the operation may authorise reuse explicitly. Silence is
  // not authorisation — an unanswered question resolves to executing again,
  // which is the recoverable direction for every action in this class.
  if (reuseAuthorized === true) {
    return { reuse: true, disposition: "completed_result_reuse", why: `${why} (reuse authorised by the operation)` };
  }
  return { reuse: false, disposition: "new_occurrence", why: `${why} (reuse not authorised; failing closed)` };
}

/** Every action type this module knows about, for contract tests and inventories. */
export function declaredActionTypes() {
  return Object.keys(ACTION_REPEATABILITY).sort();
}
