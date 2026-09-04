/**
 * Delegated Governance — Director Authority V1.
 *
 * THE DOCTRINE. The operator defines the authority envelope. The Director
 * governs routine execution inside it. The operator handles exceptions.
 *
 * WHAT THE HISTORY SAYS. Across 169 governed actions the operator approved 126
 * and denied 4 — and all four denials were certification fixtures, so human
 * approval has never once stopped a real action here. Meanwhile 22 actions
 * FAILED AFTER being approved, on conditions a machine can check: checks still
 * pending, branch not on the remote, head drifted, SHA abbreviated. In those
 * cases the human decision added latency and then failed anyway. That is the
 * case for delegation, and it is also the case for GATES: the Director must
 * refuse what the operator was never given the means to see.
 *
 * WHAT THIS MODULE IS NOT. It is not a bypass. Every action still becomes a
 * canonical governed action, still carries a content fingerprint, still gets
 * stale protection, and still lands in the ledger. The only thing that changes
 * is WHO is authorised to decide it, and that is recorded explicitly.
 */

export const DIRECTOR_POLICY_VERSION = "director_authority_v1";

/** Who decided. A Director approval is never dressed up as an operator's. */
export const DECISION_ACTORS = Object.freeze(["operator", "director", "policy"]);

export const DIRECTOR_DECISIONS = Object.freeze([
  "director_approved",
  "operator_approval_required",
  "policy_denied",
]);

/**
 * Consequence, not action key, is what authority should track. Two repository
 * operations can sit in different tiers, which is why merge is not filed
 * beside push merely because both touch git.
 */
export const CONSEQUENCE_CLASSES = Object.freeze({
  ROUTINE_REVERSIBLE: "routine_reversible",
  CERTIFIED_PROMOTION: "certified_promotion",
  CONSEQUENTIAL: "consequential",
  IRREVERSIBLE_PRIVILEGED: "irreversible_privileged",
});

/**
 * Environments the Director may ever act in. Production is absent by
 * construction, not by a policy that could be edited to include it.
 */
export const DIRECTOR_ELIGIBLE_ENVIRONMENTS = Object.freeze(["staging", "development_certification"]);

/** Environments that are always the operator's, whatever the action. */
export const OPERATOR_ONLY_ENVIRONMENTS = Object.freeze([
  "production", "prod", "alloy_deployed_primary", "deployed_primary",
]);

/**
 * Action classes that stay with the operator in V1 regardless of gates.
 * These are not here because they are rare — they are here because a wrong
 * decision is expensive, irreversible, or expands what may be decided later.
 */
export const OPERATOR_OWNED_ACTION_KEYS = Object.freeze([
  "database.apply_migration",
  "environment.provision_qa_identity",
  "environment.assign_qa_identity_access",
  "environment.restore_qa_session",
  "credential.provision",
  "credential.bind_trusted_secret",
  "executor.grant_authority",
  "governance.update_policy",
  "repository.force_push",
  "repository.delete",
  "spend.activate_paid_service",
]);

/**
 * Anything that could change what the Director may approve. The delegate
 * cannot enlarge its own delegation, so this is checked BEFORE policy
 * matching — a self-expansion must never be able to find a policy that
 * permits it.
 */
export const SELF_EXPANSION_ACTION_KEYS = Object.freeze([
  "governance.update_policy",
  "governance.delegate_authority",
  "executor.grant_authority",
  "credential.bind_trusted_secret",
]);

/** Paths whose content defines the envelope itself. */
export const GOVERNANCE_POLICY_PATHS = Object.freeze([
  "lib/vacilando/director-authority.mjs",
  "lib/vacilando/trusted-host-authz.mjs",
  "lib/vacilando/governed-grants",
  "lib/vacilando/trusted-credential.mjs",
  "lib/vacilando/executor-authority.mjs",
]);

/* ── Gates ─────────────────────────────────────────────────────────────────
 * A gate is machine-verifiable or it is not a gate. Each reads a NAMED field
 * from evidence and returns true / false / null, where null means "not
 * measured". Null never passes: an unmeasured gate escalates, because the
 * whole point is that the Director acts on evidence rather than on the
 * absence of a reason to worry.
 */

const MANAGED_BRANCH = /^agent\/(claude|cursor)\/\d+-[a-z0-9][a-z0-9-]*$/;
const FULL_SHA = /^[0-9a-f]{40}$/i;

const DURABLE_BRANCH_STATES = Object.freeze([
  "reachable_from_canonical_remote", "merged", "pushed_not_merged",
]);
/** Mirrors the executor's window; a gate must not read the value it authorises. */
const PROVIDER_CEILING_WINDOW = Object.freeze({ key: "ALLOY_MAX_ACTIVE_PROVIDERS", min: 4, max: 8 });

const NEVER_RETIRE = Object.freeze(["staging", "main", "master", "production"]);

export const GATES = Object.freeze({
  managed_repository: (ev) => (ev.repository == null ? null : ev.managed_repository === true),
  managed_agent_branch: (ev) => (ev.branch == null ? null : MANAGED_BRANCH.test(String(ev.branch))),
  /**
   * Ownership proven by observation instead of by naming convention.
   *
   * managed_agent_branch asks whether a branch is NAMED like agent work.
   * This asks the question the guard actually cares about: is the lane making
   * the request the lane that holds this branch, at this exact commit. A name
   * can be chosen; being checked out on a branch cannot be claimed.
   */
  branch_owned_by_requesting_lane: (ev) =>
    (ev.branch_owned_by_requesting_lane == null ? null : ev.branch_owned_by_requesting_lane === true),
  branch_matches_originating_work: (ev) =>
    (ev.branch == null || ev.originating_branch == null ? null : String(ev.branch) === String(ev.originating_branch)),
  full_exact_sha: (ev) => (ev.source_sha == null ? null : FULL_SHA.test(String(ev.source_sha))),
  target_is_delegated_environment: (ev) =>
    (ev.environment == null ? null : DIRECTOR_ELIGIBLE_ENVIRONMENTS.includes(String(ev.environment).toLowerCase())),
  not_protected_branch_write: (ev) =>
    (ev.branch == null ? null : !["staging", "main", "master", "production"].includes(String(ev.branch).toLowerCase())),
  no_credential_material: (ev) => (ev.credential_material_detected == null ? null : ev.credential_material_detected === false),
  durability_gates_passed: (ev) => (ev.durability_gates_passed == null ? null : ev.durability_gates_passed === true),
  no_governance_exception: (ev) => (ev.governance_exception_active == null ? null : ev.governance_exception_active === false),
  no_operator_hold: (ev) => (ev.operator_hold == null ? null : ev.operator_hold === false),

  /* Provider ceiling. The delegation rests on the move being small, predicted,
   * reversible and measured — remove any one of those and it is an operator
   * decision again. */
  ceiling_within_experimental_window: (ev) =>
    (ev.requested_ceiling == null || ev.expected_ceiling == null ? null
      : [ev.requested_ceiling, ev.expected_ceiling].every(
        (n) => Number.isInteger(n) && n >= PROVIDER_CEILING_WINDOW.min && n <= PROVIDER_CEILING_WINDOW.max)),
  ceiling_key_is_the_managed_one: (ev) =>
    (ev.ceiling_key == null ? null : String(ev.ceiling_key) === PROVIDER_CEILING_WINDOW.key),
  // Compare-and-set is the difference between an experiment and a guess. An
  // agent that has lost track of the live ceiling is precisely the one that
  // must not write.
  ceiling_expectation_measured: (ev) =>
    (ev.expected_ceiling == null || ev.live_ceiling == null ? null
      : Number(ev.expected_ceiling) === Number(ev.live_ceiling)),
  rollback_ceiling_declared: (ev) =>
    (ev.rollback_ceiling == null ? null
      : Number.isInteger(ev.rollback_ceiling)
        && ev.rollback_ceiling >= PROVIDER_CEILING_WINDOW.min
        && ev.rollback_ceiling <= PROVIDER_CEILING_WINDOW.max),
  // Raising capacity on a host already under pressure is how a capacity
  // experiment becomes an outage. Unmeasured headroom escalates.
  host_headroom_measured: (ev) => (ev.host_headroom_ok == null ? null : ev.host_headroom_ok === true),
  // A previous experiment that left an unvalidated ceiling behind must be
  // reconciled by a human before another one starts on top of it.
  no_unvalidated_ceiling_active: (ev) =>
    (ev.unvalidated_ceiling_active == null ? null : ev.unvalidated_ceiling_active === false),
  branch_pushed_to_remote: (ev) => (ev.remote_head_sha == null ? null : String(ev.remote_head_sha).toLowerCase() === String(ev.source_sha || "").toLowerCase()),
  base_is_staging: (ev) => (ev.base_branch == null ? null : String(ev.base_branch).toLowerCase() === "staging"),
  required_checks_successful: (ev) =>
    (ev.required_checks_total == null || ev.required_checks_passing == null ? null
      : ev.required_checks_total > 0
        && ev.required_checks_passing === ev.required_checks_total
        && (ev.required_checks_failing || 0) === 0
        && (ev.required_checks_pending || 0) === 0),
  pull_request_mergeable: (ev) => (ev.pull_request_mergeable == null ? null : ev.pull_request_mergeable === true),
  head_sha_still_matches: (ev) =>
    (ev.pull_request_head_sha == null ? null : String(ev.pull_request_head_sha).toLowerCase() === String(ev.source_sha || "").toLowerCase()),
  no_unresolved_governance_findings: (ev) =>
    (ev.unresolved_governance_findings == null ? null : Number(ev.unresolved_governance_findings) === 0),
  // ── Worktree retirement ──────────────────────────────────────────────────
  // Every one of these is a MEASURED property of the worktree at request time,
  // and every one is measured AGAIN by the executor. A null here escalates, and
  // the executor refuses independently — the Director's yes is permission to
  // try, never a finding that it is still safe.
  retirement_safety_measured: (ev) => (ev.retirement_safety_measured == null ? null : ev.retirement_safety_measured === true),
  retirement_state_is_candidate: (ev) => (ev.retirement_state == null ? null : ev.retirement_state === "candidate"),
  worktree_clean: (ev) => (ev.worktree_dirty_paths == null ? null : Number(ev.worktree_dirty_paths) === 0),
  no_live_worktree_references: (ev) => (ev.live_worktree_references == null ? null : Number(ev.live_worktree_references) === 0),
  branch_durability_proven: (ev) => (ev.branch_durability == null ? null : DURABLE_BRANCH_STATES.includes(String(ev.branch_durability))),
  no_unique_work_at_risk: (ev) => (ev.unique_work_at_risk == null ? null : ev.unique_work_at_risk === false),
  no_untracked_unreproducible: (ev) => (ev.untracked_unreproducible == null ? null : Number(ev.untracked_unreproducible) === 0),
  not_protected_worktree_branch: (ev) => (ev.branch == null ? null : !NEVER_RETIRE.includes(String(ev.branch).toLowerCase())),
  // A worker may not declare itself disposable.
  not_self_retirement: (ev) => (ev.self_retirement == null ? null : ev.self_retirement === false),
  retirement_fingerprint_bound: (ev) => (ev.retirement_fingerprint == null ? null : /^[0-9a-f]{32}$/.test(String(ev.retirement_fingerprint))),
  // Branch deletion never rides along with worktree removal.
  no_implicit_branch_deletion: (ev) => (ev.requests_branch_deletion == null ? null : ev.requests_branch_deletion === false),
  // ── Repository housekeeping ──────────────────────────────────────────────
  pull_request_exists: (ev) => (ev.pull_request_exists == null ? null : ev.pull_request_exists === true),
  pull_request_readable: (ev) => (ev.pull_request_readable == null ? null : ev.pull_request_readable === true),
  pull_request_open: (ev) => (ev.pull_request_open == null ? null : ev.pull_request_open === true),
  pull_request_not_merged: (ev) => (ev.pull_request_not_merged == null ? null : ev.pull_request_not_merged === true),
  head_sha_matches: (ev) => (ev.head_sha_matches == null ? null : ev.head_sha_matches === true),
  head_branch_matches: (ev) => (ev.head_branch_matches == null ? null : ev.head_branch_matches === true),
  head_repository_matches: (ev) => (ev.head_repository_matches == null ? null : ev.head_repository_matches === true),
  base_branch_matches: (ev) => (ev.base_branch_matches == null ? null : ev.base_branch_matches === true),
  no_active_governed_merge: (ev) => (ev.active_governed_merge == null ? null : ev.active_governed_merge === false),
  branch_exists_remotely: (ev) => (ev.branch_exists_remotely == null ? null : ev.branch_exists_remotely === true),
  branch_never_protected_name: (ev) => (ev.branch_never_protected_name == null ? null : ev.branch_never_protected_name === true),
  branch_not_protected: (ev) => (ev.branch_not_protected == null ? null : ev.branch_not_protected === true),
  remote_head_matches: (ev) => (ev.remote_head_matches == null ? null : ev.remote_head_matches === true),
  no_open_pull_request_depends: (ev) => (ev.no_open_pull_request_depends == null ? null : ev.no_open_pull_request_depends === true),
  no_active_lane_reference: (ev) => (ev.active_lane_reference == null ? null : ev.active_lane_reference === false),
  no_unique_work_lost: (ev) => (ev.unique_work_at_risk == null ? null : ev.unique_work_at_risk === false),
  // ── Reconciliation metadata ──────────────────────────────────────────────
  reconciliation_plan_readable: (ev) => (ev.reconciliation_plan_readable == null ? null : ev.reconciliation_plan_readable === true),
  reconciliation_plan_current: (ev) => (ev.reconciliation_plan_current == null ? null : ev.reconciliation_plan_current === true),
  all_corrections_allowlisted: (ev) => (ev.all_corrections_allowlisted == null ? null : ev.all_corrections_allowlisted === true),
  no_destructive_corrections: (ev) => (ev.destructive_corrections == null ? null : ev.destructive_corrections === 0),
  no_foreign_owner_mutation: (ev) => (ev.foreign_owner_mutations == null ? null : ev.foreign_owner_mutations === 0),
  no_ambiguous_owner_mutation: (ev) => (ev.ambiguous_owner_mutations == null ? null : ev.ambiguous_owner_mutations === 0),
  no_live_process_affected: (ev) => (ev.live_process_affecting == null ? null : ev.live_process_affecting === 0),
  metadata_store_known: (ev) => (ev.metadata_store_known == null ? null : ev.metadata_store_known === true),
  certification_suite_passed: (ev) => (ev.certification_suite_passed == null ? null : ev.certification_suite_passed === true),
  // ── Toolkit convergence ──────────────────────────────────────────────────
  // Installing the commit that is ALREADY promoted staging carries no content
  // decision — that was taken at merge by the certified merge gates. What is
  // left is mechanical and entirely measurable, which is what makes it routine
  // rather than an approval. Every gate below is measured from the host and
  // the canonical repository, never claimed by the requester.
  install_source_is_promoted_staging: (ev) =>
    (ev.source_is_promoted_staging == null ? null : ev.source_is_promoted_staging === true),
  install_artifact_provenance_valid: (ev) =>
    (ev.artifact_provenance_valid == null ? null : ev.artifact_provenance_valid === true),
  // Rollback is only real if the tree being replaced still exists afterwards.
  previous_toolkit_retained: (ev) =>
    (ev.previous_toolkit_retained == null ? null : ev.previous_toolkit_retained === true),
  gateway_restart_bounded: (ev) =>
    (ev.gateway_restart_bounded == null ? null : ev.gateway_restart_bounded === true),
  // Converging onto what is already installed is a no-op, and a no-op that
  // restarts the Gateway is not free. Drift must be positively observed.
  toolkit_drift_observed: (ev) => (ev.toolkit_drift == null ? null : ev.toolkit_drift === true),
});

/**
 * V1 delegated policies.
 *
 * Deliberately small. Push and open-PR are 70 of the operator's 126 approvals
 * and their gates are fully deterministic. Merge is written but DISABLED: it
 * is 42 more approvals and it is the one that lands content in staging, so it
 * should be switched on by an explicit operator decision, not by shipping it.
 */
export const DELEGATED_POLICIES_V1 = Object.freeze([
  Object.freeze({
    policy_id: "routine_managed_branch_push_v1",
    label: "Routine managed-branch push",
    action_key: "repository.push",
    environments: Object.freeze(["staging", "development_certification"]),
    consequence_class: CONSEQUENCE_CLASSES.ROUTINE_REVERSIBLE,
    enabled: true,
    // WHY NO TEST GATE HERE. Publishing a managed branch deploys nothing,
    // merges nothing, and changes no environment — CI runs ON the branch after
    // it exists. Requiring a green suite before a push enforces a QUALITY
    // property at a boundary that carries no CONSEQUENCE, and it would make
    // this policy unusable, because there is no recorded suite result at
    // request time. What a push can actually do wrong is covered below:
    // write to a protected branch, carry credential material, come from an
    // unmanaged repository, or move under an ambiguous SHA. History rewrites
    // and force pushes are a different action key and stay operator-owned.
    gates: Object.freeze([
      "managed_repository", "branch_owned_by_requesting_lane", "full_exact_sha",
      "not_protected_branch_write", "no_credential_material",
      "no_governance_exception", "no_operator_hold",
    ]),
  }),
  Object.freeze({
    policy_id: "routine_certified_promotion_v1",
    label: "Routine certified promotion",
    action_key: "promotion.open_pr",
    environments: Object.freeze(["staging"]),
    consequence_class: CONSEQUENCE_CLASSES.CERTIFIED_PROMOTION,
    enabled: true,
    // Opening a PR also changes nothing in staging — it is the mechanism by
    // which CI and review HAPPEN. Certification is required at MERGE, where
    // content actually lands, and that policy demands required_checks_successful.
    // What matters here is that the branch genuinely exists on the remote at
    // the exact SHA being proposed, which is measurable and was the cause of a
    // real head_branch_not_on_remote failure in this history.
    gates: Object.freeze([
      "managed_repository", "branch_owned_by_requesting_lane", "full_exact_sha",
      "base_is_staging", "branch_pushed_to_remote",
      "no_governance_exception", "no_operator_hold",
    ]),
  }),
  Object.freeze({
    policy_id: "routine_repository_housekeeping_v1",
    label: "Routine repository housekeeping — close disposable pull request",
    action_key: "repository.close_pull_request",
    environments: Object.freeze(["staging"]),
    consequence_class: CONSEQUENCE_CLASSES.ROUTINE_REVERSIBLE,
    enabled: true,
    // Closing an unmerged PR changes no branch and no environment, and a PR
    // can be reopened — which is why this is routine_reversible. What it must
    // never do is close something that is no longer the thing that was
    // approved, so identity is gated field by field against real GitHub state.
    gates: Object.freeze([
      "managed_repository", "pull_request_readable", "pull_request_exists",
      "pull_request_open", "pull_request_not_merged",
      "head_sha_matches", "head_branch_matches", "head_repository_matches", "base_branch_matches",
      "no_active_governed_merge", "no_governance_exception", "no_operator_hold",
    ]),
  }),
  Object.freeze({
    policy_id: "routine_repository_housekeeping_v1",
    label: "Routine repository housekeeping — delete disposable remote branch",
    action_key: "repository.delete_remote_branch",
    environments: Object.freeze(["staging"]),
    consequence_class: CONSEQUENCE_CLASSES.ROUTINE_REVERSIBLE,
    enabled: true,
    // Deleting a branch is recoverable only while its commits are reachable,
    // so "no unique work at risk" is a REQUIRED measured gate rather than an
    // assumption, and age is never evidence of disposability.
    gates: Object.freeze([
      "managed_repository", "branch_exists_remotely", "branch_never_protected_name",
      "branch_not_protected", "not_protected_branch_write", "remote_head_matches", "full_exact_sha",
      "no_open_pull_request_depends", "no_active_lane_reference", "no_unique_work_lost",
      "no_governance_exception", "no_operator_hold",
    ]),
  }),
  Object.freeze({
    policy_id: "routine_reconciliation_metadata_v1",
    label: "Routine reconciliation metadata",
    action_key: "vacilando.apply_reconciliation_plan",
    environments: Object.freeze(["staging", "development_certification"]),
    consequence_class: CONSEQUENCE_CLASSES.ROUTINE_REVERSIBLE,
    enabled: true,
    // Metadata-only, and reversible because the records describe observed
    // reality rather than change it. Withheld retirement findings may EXIST in
    // the plan and stay untouched; what may never happen is one of them moving
    // into the executable set, which the fingerprint binds both halves against.
    gates: Object.freeze([
      "reconciliation_plan_readable", "reconciliation_plan_current",
      "all_corrections_allowlisted", "no_destructive_corrections",
      "no_foreign_owner_mutation", "no_ambiguous_owner_mutation",
      "no_live_process_affected", "metadata_store_known",
      "no_governance_exception", "no_operator_hold",
    ]),
  }),
  Object.freeze({
    policy_id: "routine_provider_ceiling_experiment_v1",
    label: "Provider capacity experiment — move one ceiling inside the tested window",
    action_key: "capacity.set_provider_ceiling",
    // Never staging. This changes how many providers this HOST will run; there
    // is no deployed environment in which the setting means anything, and
    // listing one would invite the action to be claimed under it.
    environments: Object.freeze(["development_certification"]),
    consequence_class: CONSEQUENCE_CLASSES.ROUTINE_REVERSIBLE,
    enabled: true,
    // WHY A CAPACITY WRITE IS DELEGABLE AT ALL. The refused predecessor was
    // "edit a host config file", which reaches every setting on the machine.
    // What is delegated here is one key, inside a window whose ends were both
    // chosen by the operator, from a value the caller correctly predicted, with
    // the restore value named in the same request. Reversal needs no cleverness
    // and no history: it is another call with the numbers swapped.
    //
    // It is worth being explicit that this does NOT let the agent enlarge its
    // own authority — the ceiling governs how many providers may run, not what
    // any of them may do, which is why it is absent from
    // SELF_EXPANSION_ACTION_KEYS. It does let the agent ask for more of the
    // machine, so headroom is a measured gate rather than a courtesy.
    gates: Object.freeze([
      "ceiling_key_is_the_managed_one", "ceiling_within_experimental_window",
      "ceiling_expectation_measured", "rollback_ceiling_declared",
      "host_headroom_measured", "no_unvalidated_ceiling_active",
      "no_governance_exception", "no_operator_hold",
    ]),
  }),
  Object.freeze({
    policy_id: "routine_worktree_retirement_v1",
    label: "Routine worktree retirement — disposable worktree, branch retained",
    action_key: "vacilando.retire_worktree",
    environments: Object.freeze(["staging", "development_certification"]),
    consequence_class: CONSEQUENCE_CLASSES.ROUTINE_REVERSIBLE,
    enabled: true,
    // WHY A DESTRUCTIVE ACTION IS DELEGATED AT ALL. Removing a worktree whose
    // every commit is reachable from the canonical remote destroys nothing —
    // the content survives in Git, and the worktree is a checkout, not the work.
    // That is the entire basis, and it collapses the moment durability is not
    // proven, which is why branch_durability_proven and no_unique_work_at_risk
    // are separate gates: one asks whether the branch is recoverable, the other
    // whether THIS tree holds commits nothing else has.
    //
    // The branch is never deleted here. A worktree can be safely disposable
    // while its branch is still the only home of unmerged work, so retirement
    // and deletion are governed apart and no gate below implies the other.
    gates: Object.freeze([
      "retirement_safety_measured", "retirement_state_is_candidate",
      "worktree_clean", "no_live_worktree_references",
      "branch_durability_proven", "no_unique_work_at_risk",
      "no_untracked_unreproducible", "not_protected_worktree_branch",
      "not_self_retirement", "retirement_fingerprint_bound",
      "no_implicit_branch_deletion",
      "no_governance_exception", "no_operator_hold",
    ]),
  }),
  Object.freeze({
    policy_id: "routine_toolkit_convergence_v1",
    label: "Routine toolkit convergence — install promoted staging",
    action_key: "host.install_toolkit",
    // Never staging: this changes what THIS HOST runs. There is no deployed
    // environment in which installing a local toolkit means anything, and
    // naming one would invite the action to be claimed under it.
    environments: Object.freeze(["development_certification"]),
    consequence_class: CONSEQUENCE_CLASSES.ROUTINE_REVERSIBLE,
    enabled: true,
    // WHY THIS IS ROUTINE. A lane sat blocked indefinitely because promoted
    // staging held a capability the installed toolkit did not, and the only
    // path from promoted to installed went through a human. The content
    // decision was already taken at merge; what a human added here was a
    // measurement — is this really staging, can we go back — which is exactly
    // the click the attention model exists to remove.
    //
    // Reversibility is the whole basis and it is structural, not a promise:
    // the layout keeps one immutable tree per commit and `current` is a
    // symlink, so rollback is flipping it back. previous_toolkit_retained
    // proves the target still exists rather than assuming the layout was not
    // pruned. A failed install never replaces a healthy current, because the
    // flip happens after the tree is built, not before.
    gates: Object.freeze([
      "install_source_is_promoted_staging", "install_artifact_provenance_valid",
      "toolkit_drift_observed", "previous_toolkit_retained", "gateway_restart_bounded",
      "no_governance_exception", "no_operator_hold",
    ]),
  }),
  Object.freeze({
    policy_id: "certified_staging_merge_v1",
    label: "Certified staging merge",
    action_key: "repository.merge_pull_request",
    environments: Object.freeze(["staging"]),
    consequence_class: CONSEQUENCE_CLASSES.CERTIFIED_PROMOTION,
    // Merge is where content becomes everyone else's problem, so it does not
    // inherit push's tier and never will: it carries the strictest gate set
    // here, and every one of them is measured from GitHub rather than claimed.
    //
    // TURNED ON under the Director Attention Model, and the order matters.
    // This shipped OFF because nothing collected pull-request state, so all ten
    // gates below were unmeasured and every merge escalated. That approval was
    // not supplying judgement — the operator was reading the same PR page the
    // collector now reads and clicking approve, which cost an interruption and
    // added no safety. director-evidence now measures head sha, base branch,
    // mergeability, check counts, the certification suite and unresolved review
    // findings directly. The safeguard was built first; only then was the
    // approval removed. If that measurement ever regresses, these gates go
    // unmeasured and merges escalate again on their own.
    enabled: true,
    gates: Object.freeze([
      "managed_repository", "full_exact_sha", "base_is_staging",
      "required_checks_successful", "pull_request_mergeable", "head_sha_still_matches",
      "no_unresolved_governance_findings", "certification_suite_passed",
      "no_governance_exception", "no_operator_hold",
    ]),
  }),
]);

const norm = (v) => String(v ?? "").trim().toLowerCase();

/** Does this request change the envelope itself? */
export function isSelfExpansion(request = {}) {
  const key = norm(request.action_key);
  if (SELF_EXPANSION_ACTION_KEYS.map(norm).includes(key)) return true;
  const inputs = request.inputs || {};
  const paths = []
    .concat(Array.isArray(inputs.migrations) ? inputs.migrations : [])
    .concat(Array.isArray(inputs.paths) ? inputs.paths : [])
    .concat(Array.isArray(inputs.changed_files) ? inputs.changed_files : [])
    .map((p) => (typeof p === "string" ? p : p?.path || p?.migration_path || ""));
  return paths.some((p) => GOVERNANCE_POLICY_PATHS.some((g) => String(p).includes(g)));
}

export function environmentOf(request = {}) {
  const inputs = request.inputs || {};
  return norm(inputs.environment || inputs.base || inputs.targetBranch || request.target) || null;
}

export function isOperatorOnlyEnvironment(env) {
  return OPERATOR_ONLY_ENVIRONMENTS.map(norm).includes(norm(env));
}

/**
 * The one canonical policy decision.
 *
 * Order matters and is deliberate: the things that must ALWAYS escalate are
 * checked before any policy can be matched, so no policy — present or added
 * later — can be the reason a self-expansion or a production action was
 * approved by the delegate.
 */
export function evaluateDirectorAuthority({
  request = {},
  evidence = {},
  policies = DELEGATED_POLICIES_V1,
  nowMs = Date.now(),
} = {}) {
  const base = {
    governed_action_id: request.request_id || null,
    action: request.action_key || null,
    content_fingerprint: request.content_fingerprint || null,
    environment: environmentOf(request),
    matched_policy: null,
    policy_version: DIRECTOR_POLICY_VERSION,
    deterministic_evidence: {},
    decision_actor: "policy",
    evaluated_at: new Date(nowMs).toISOString(),
  };
  const escalate = (reason, extra = {}) => ({
    ...base, ...extra,
    decision: "operator_approval_required",
    escalation_reason: reason,
  });

  // 1. An operator's NO is final. A delegate cannot overturn it.
  if (norm(request.operator_approval?.decision) === "denied") {
    return escalate("The operator denied this action. A delegated authority cannot overturn an operator decision.");
  }
  if (evidence.operator_hold === true) {
    return escalate("An operator hold is active on this work.");
  }

  // 2. Self-expansion. Checked before policy matching so it can never match one.
  if (isSelfExpansion(request)) {
    return escalate("This changes the delegated-authority policy itself. The Director cannot approve an expansion of its own authority.");
  }

  // 3. Environment. Production never inherits staging authority.
  const env = base.environment;
  if (isOperatorOnlyEnvironment(env)) {
    return escalate(`This targets ${env}, which is always an operator decision.`);
  }

  // 4. Action classes reserved to the operator in V1.
  if (OPERATOR_OWNED_ACTION_KEYS.map(norm).includes(norm(request.action_key))) {
    return escalate(`${request.action_key} is reserved to the operator in ${DIRECTOR_POLICY_VERSION}.`);
  }

  // 5. Find a policy. UNKNOWN IS ESCALATION — never default allow.
  const candidates = (policies || []).filter((p) => norm(p.action_key) === norm(request.action_key));
  if (!candidates.length) {
    return escalate(`No delegated policy covers ${request.action_key || "this action"}. Unknown actions escalate.`);
  }
  const enabled = candidates.filter((p) => p.enabled === true);
  if (!enabled.length) {
    return escalate(`The policy for ${request.action_key} exists but is not enabled. Enabling it is an operator decision.`);
  }
  const policy = enabled.find((p) => (p.environments || []).map(norm).includes(norm(env)));
  if (!policy) {
    return escalate(`No delegated policy covers ${request.action_key} in ${env || "an unnamed environment"}.`);
  }

  // 6. Gates. Every one must be measured AND true.
  const results = {};
  const unmeasured = [];
  const failed = [];
  for (const name of policy.gates) {
    const gate = GATES[name];
    if (typeof gate !== "function") { unmeasured.push(name); results[name] = null; continue; }
    let value = null;
    try { value = gate(evidence); } catch { value = null; }
    results[name] = value;
    if (value === null) unmeasured.push(name);
    else if (value !== true) failed.push(name);
  }
  const common = {
    matched_policy: policy.policy_id,
    consequence_class: policy.consequence_class,
    deterministic_evidence: results,
  };
  if (failed.length) {
    return {
      ...base, ...common,
      decision: "policy_denied",
      escalation_reason: `Required gate${failed.length === 1 ? "" : "s"} did not pass: ${failed.join(", ")}.`,
      failed_gates: failed,
    };
  }
  if (unmeasured.length) {
    return escalate(
      `Required gate${unmeasured.length === 1 ? " was" : "s were"} not measured: ${unmeasured.join(", ")}. An unmeasured gate is not a passed gate.`,
      { ...common, unmeasured_gates: unmeasured },
    );
  }
  return {
    ...base, ...common,
    decision: "director_approved",
    decision_actor: "director",
    escalation_reason: null,
  };
}

/**
 * A Director decision is bound to the content it read, exactly like an
 * operator's. If the content moved, the decision does not carry over.
 */
export function directorDecisionValidFor(decision, currentFingerprint) {
  if (!decision || decision.decision !== "director_approved") return false;
  if (!decision.content_fingerprint || !currentFingerprint) return false;
  return decision.content_fingerprint === currentFingerprint;
}

/** What the operator reads in history. Names the work, the policy, the evidence. */
export function directorAuditEntry(decision, { label = null } = {}) {
  if (!decision) return null;
  const passed = Object.entries(decision.deterministic_evidence || {})
    .filter(([, v]) => v === true).map(([k]) => k.replace(/_/g, " "));
  return {
    headline: decision.decision === "director_approved" ? "Director authorized" : "Needs the operator",
    label,
    policy: decision.matched_policy,
    policy_version: decision.policy_version,
    evidence: passed,
    escalation_reason: decision.escalation_reason,
    actor: decision.decision_actor,
    at: decision.evaluated_at,
  };
}
