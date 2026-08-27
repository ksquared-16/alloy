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

export const GATES = Object.freeze({
  managed_repository: (ev) => (ev.repository == null ? null : ev.managed_repository === true),
  managed_agent_branch: (ev) => (ev.branch == null ? null : MANAGED_BRANCH.test(String(ev.branch))),
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
  certification_suite_passed: (ev) => (ev.certification_suite_passed == null ? null : ev.certification_suite_passed === true),
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
      "managed_repository", "managed_agent_branch", "full_exact_sha",
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
      "managed_repository", "managed_agent_branch", "full_exact_sha",
      "base_is_staging", "branch_pushed_to_remote",
      "no_governance_exception", "no_operator_hold",
    ]),
  }),
  Object.freeze({
    policy_id: "certified_staging_merge_v1",
    label: "Certified staging merge",
    action_key: "repository.merge_pull_request",
    environments: Object.freeze(["staging"]),
    consequence_class: CONSEQUENCE_CLASSES.CERTIFIED_PROMOTION,
    // OFF until the operator turns it on. Merge is where content becomes
    // everyone else's problem, so it does not inherit push's tier.
    enabled: false,
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
