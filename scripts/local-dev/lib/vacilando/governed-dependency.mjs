/**
 * Governed dependency routing — a router over existing owners, not a new
 * governance system.
 *
 * THE DOCTRINE. Operators approve governed decisions. Vacilando routes governed
 * execution. Repository, worktree, lane, provider and execution placement are
 * Vacilando's responsibility unless the operator explicitly overrides them. An
 * operator should never be asked "which lane should I send this to?" when the
 * required capability is identifiable and an authorized executor exists or can
 * be created.
 *
 * WHAT EXISTS TODAY. A worker that cannot reach a privileged capability files a
 * governed action; the Director validates it and the TRUSTED HOST executes it
 * in-process; the same lane is then resumed. Across all 66 governed requests on
 * this host the executing lane is always the originating lane, and
 * `resumeLaneAfterGovernedAction` returns a hardcoded `same_lane: true`. That is
 * not a routing decision — it is the absence of one. There is exactly one
 * executor, and when the required capability falls outside it the mission stops
 * and the operator is handed prose.
 *
 * THE REFERENCE INCIDENT, AS THE STORE ACTUALLY RECORDS IT. Both Health & Safety
 * migration requests FAILED at input validation with `environment_not_allowed`:
 * they asked for `development_certification`, and the registered action admits
 * only staging/certification/cert. Neither was ever approved — both carry
 * `operator_approval: null` and `decision_id: null`. The second request's own
 * inputs assert `"gar_62f1af0052c793 applied H1 only"`, which is untrue: that
 * request never executed anything. A worker reasoned from a governed request's
 * existence to its effect, and nothing in the system contradicted it.
 *
 * SO THE ROUTER'S FIRST JOB IS NOT PLACEMENT — IT IS TRUTH. A dependency states
 * what is required, what would prove it satisfied, and which authority may
 * execute it. Nothing resumes on a child's exit code; a parent resumes only when
 * the declared resume conditions are verified from authoritative evidence.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not approve, execute, merge, migrate,
 * kill or create anything. It resolves, and hands the work to the canonical
 * owner: governed actions for approval and execution, S4/S5 for capacity, S6 for
 * every wait, the agent-session lifecycle for providers.
 */
import { createHash, randomBytes } from "node:crypto";

export const GOVERNED_DEPENDENCY_SCHEMA = "vacilando.governed_dependency.v1";

/**
 * The bounded dependency lifecycle.
 *
 * Every non-terminal state names what it waits on and who owns that condition,
 * through the S6 contract. There is no state meaning "stuck".
 */
export const DEPENDENCY_STATES = Object.freeze([
  "DECLARED",
  "WAITING_APPROVAL",
  "READY_TO_ROUTE",
  "WAITING_EXECUTOR",
  "WAITING_CAPACITY",
  "EXECUTING",
  "VERIFYING",
  "SATISFIED",
  "FAILED",
  "CANCELLED",
]);

export const TERMINAL_DEPENDENCY_STATES = Object.freeze(["SATISFIED", "FAILED", "CANCELLED"]);

/**
 * Why a worker could not do this itself.
 *
 * These are NOT interchangeable. "Not approved" is a governance condition an
 * operator resolves; "no executor" is a provisioning condition; "no capacity" is
 * a scheduling condition that resolves itself. Collapsing them is how a
 * provisioning gap gets reported to an operator as a permission problem.
 */
export const CAPABILITY_BOUNDARIES = Object.freeze({
  missing_permission: {
    boundary: "worker lacks permission",
    state: "WAITING_APPROVAL",
    operator_resolvable: true,
  },
  missing_credential: {
    boundary: "worker lacks credential",
    state: "WAITING_EXECUTOR",
    operator_resolvable: false,
  },
  missing_environment_access: {
    boundary: "worker lacks repository or environment access",
    state: "WAITING_EXECUTOR",
    operator_resolvable: false,
  },
  missing_registered_capability: {
    boundary: "worker lacks a registered capability for this action",
    state: "WAITING_EXECUTOR",
    operator_resolvable: false,
  },
  not_approved: {
    boundary: "the action is not approved",
    state: "WAITING_APPROVAL",
    operator_resolvable: true,
  },
  approved_without_executor: {
    boundary: "the action is approved but no executor holds the capability",
    state: "WAITING_EXECUTOR",
    operator_resolvable: false,
  },
  executor_without_capacity: {
    boundary: "an executor exists but capacity is unavailable",
    state: "WAITING_CAPACITY",
    operator_resolvable: false,
  },
});

/** Failure codes the existing governed machinery already emits, mapped to a boundary. */
export const FAILURE_CODE_BOUNDARY = Object.freeze({
  // The registered action exists but refuses this environment. That is a
  // MISSING EXECUTOR for the environment, not a malformed request — the
  // distinction the Health & Safety incident turned on.
  environment_not_allowed: "missing_environment_access",
  production_database_rejected: "missing_environment_access",
  repository_not_allowlisted: "missing_environment_access",
  unsupported_action_key: "missing_registered_capability",
  unauthorized_action_key: "missing_registered_capability",
  unknown_action_type: "missing_registered_capability",
  action_unavailable: "missing_registered_capability",
  policy_denied: "missing_permission",
  missing_mission_binding: "missing_permission",
  repository_profile_forbids_governed_action: "missing_permission",
  missing_credential: "missing_credential",
});

export function boundaryForFailureCode(code) {
  const key = FAILURE_CODE_BOUNDARY[String(code || "")] || null;
  return key ? { key, ...CAPABILITY_BOUNDARIES[key] } : null;
}

// ── S6 waits ─────────────────────────────────────────────────────────────────

/**
 * The one wait reason S6 did not already carry.
 *
 * BOUNDED ON PURPOSE. "No executor holds this capability" does not resolve by
 * waiting — it resolves by someone provisioning one. So the wait expires and the
 * dependency fails truthfully, naming what must be provisioned, rather than
 * sitting non-terminal forever. Approval waits use the existing
 * `needs_operator_input`, which is explicitly `human_indefinite`, because a
 * question for a person legitimately waits for the person.
 */
export const EXECUTOR_WAIT_REASON = "waiting_for_executor_authority";
export const EXECUTOR_WAIT_SPEC = Object.freeze({
  resource_type: "executor_authority",
  owner: "governed-dependency",
  policy: "bounded",
  bound_ms: 30 * 60 * 1000,
});

/** Which S6 reason expresses each waiting dependency state. */
export const STATE_WAIT_REASON = Object.freeze({
  WAITING_APPROVAL: "needs_operator_input",
  WAITING_EXECUTOR: EXECUTOR_WAIT_REASON,
  WAITING_CAPACITY: "waiting_for_execution_capacity",
});

// ── Governance identity ──────────────────────────────────────────────────────

/**
 * A canonical, order-independent fingerprint of WHAT is being asked for.
 *
 * WHY A HASH AND NOT A SUBJECT KEY. `governedActionSubjectKey` already keys a
 * migration on its version list — and both Health & Safety requests carry the
 * same three filenames against DIFFERENT source SHAs (95a76983 and 0f0cf156).
 * They therefore produce the same subject key while being materially different
 * actions. An approval matched on the subject alone would authorise source the
 * operator never saw. The content hash includes the source SHA, the environment
 * and every migration entry, so a changed commit changes the identity.
 */
export function governedContentHash(action = {}) {
  const inputs = action.inputs || {};
  const migrations = Array.isArray(inputs.migrations)
    ? inputs.migrations.map((m) => (typeof m === "string"
      ? m
      : `${m?.version || ""}:${m?.path || m?.migration_path || ""}`)).sort()
    : [];
  const canonical = JSON.stringify({
    action_key: action.action_key || action.actionKey || null,
    // ONE environment field, resolved. A governed request carries both a
    // `target` (which defaults to "staging" whether or not anyone chose it) and
    // an `inputs.environment` (which is what actually gets touched). Hashing
    // both makes a defaulted field part of the action's identity, so the same
    // action proposed through two entry points hashes differently and a valid
    // approval stops matching. The resolved environment is the meaningful one.
    environment: normalizeEnvironment(inputs.environment || action.target || null),
    expected_sha: String(inputs.expectedSha || inputs.expected_sha || "").toLowerCase() || null,
    pull_request: inputs.pullRequestNumber ?? inputs.pull_request_number ?? null,
    branch: inputs.branch || inputs.headBranch || null,
    repository: inputs.repository || null,
    migrations,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * What the action is ABOUT, at the same grain the governed-action store uses.
 *
 * Deliberately identical to `governedActionSubjectKey` in
 * governed-action-request.mjs — a test asserts the two agree on the real
 * fixtures, so this is one notion read cheaply rather than a second one drifting
 * quietly. It is reproduced here because the approval resolver is synchronous
 * and that module is a large import with its own execution machinery.
 *
 * The subject is NOT the identity. The content hash is. The subject only decides
 * whether two requests are about the same thing, which is what makes the
 * difference between "approve the latest version of this?" and an approval for
 * an unrelated migration being offered as though it were close.
 */
export function dependencySubjectKey(action = {}) {
  const inputs = action.inputs || {};
  const key = action.action_key || action.actionKey || null;
  if (key === "database.apply_migration") {
    const versions = Array.isArray(inputs.migrations)
      ? inputs.migrations.map((m) => String(m?.version || m)).filter(Boolean).sort()
      : [];
    if (!versions.length) return null;
    return `migration:${versions.join(",")}`;
  }
  if (key === "repository.merge_pull_request") {
    const n = inputs.pull_request_number ?? inputs.pullRequestNumber ?? null;
    const sha = String(inputs.expected_head_sha || inputs.expectedHeadSha || "").toLowerCase();
    if (n == null) return null;
    return `merge:#${n}@${sha.slice(0, 40)}`;
  }
  if (key === "repository.push" || key === "promotion.open_pr") {
    const branch = String(inputs.branch || inputs.headBranch || inputs.head_branch || "").trim();
    if (!branch) return null;
    return `${key === "repository.push" ? "push" : "open_pr"}:${branch}`;
  }
  return null;
}

export function normalizeEnvironment(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return null;
  return s;
}

/**
 * How an existing approval relates to what is required NOW.
 *
 * `equivalent_subject` is the load-bearing verdict: same action on the same
 * nominal subject, different content. It must never satisfy, and it must not be
 * reported as "unapproved" either — the honest operator question is small and
 * specific: "the approved request differs from the latest; approve the latest?"
 */
export const APPROVAL_VERDICTS = Object.freeze([
  "exact", "equivalent_subject", "unrelated", "absent", "superseded", "denied",
]);

export function classifyApproval({ required, approved = null, supersededBy = null } = {}) {
  if (!approved) return { verdict: "absent", satisfies: false, reason: "no approval exists for this action" };
  if (approved.denied === true || approved.status === "denied") {
    return { verdict: "denied", satisfies: false, reason: "the operator denied this action" };
  }
  const requiredHash = required?.content_hash || governedContentHash(required || {});
  const approvedHash = approved.content_hash || governedContentHash(approved);
  if (approved.action_key && required?.action_key && approved.action_key !== required.action_key) {
    return { verdict: "unrelated", satisfies: false, reason: "the approval is for a different action" };
  }
  if (requiredHash !== approvedHash) {
    return {
      verdict: "equivalent_subject",
      satisfies: false,
      reason: "an approval exists for this action on the same subject, but the content differs",
      approved_content_hash: approvedHash,
      required_content_hash: requiredHash,
      // The SMALLEST operator decision — about content, never about placement.
      operator_question: "The approved request differs from the latest request. Approve the latest version?",
    };
  }
  if (supersededBy && supersededBy !== approved.request_id) {
    return {
      verdict: "superseded",
      satisfies: false,
      reason: `a later request ${supersededBy} supersedes this approval`,
      superseded_by: supersededBy,
      operator_question: "The approved request differs from the latest request. Approve the latest version?",
    };
  }
  return { verdict: "exact", satisfies: true, reason: "the approved action matches by content hash", content_hash: requiredHash };
}

/**
 * Has this exact action already been executed?
 *
 * The fingerprint is content + environment, so a retry of the same action is
 * recognised and a materially different action is not. Idempotency is proven,
 * never assumed from a matching label.
 */
export function executionFingerprint(action = {}) {
  return `${governedContentHash(action)}:${normalizeEnvironment(action?.inputs?.environment || action?.target) || "unknown"}`;
}

export function alreadyExecuted(fingerprint, ledger = []) {
  return ledger.find((e) => e?.execution_fingerprint === fingerprint && e?.state === "SATISFIED") || null;
}

// ── Executor resolution ──────────────────────────────────────────────────────

/**
 * Executor kinds, in the order the doctrine prefers them.
 *
 * The order is a safety ordering, not a convenience one: reuse an authority that
 * already exists before minting a new one, and create a bounded context only
 * when nothing existing can do the work.
 */
export const EXECUTOR_KINDS = Object.freeze([
  "owning_lane",
  "dormant_lane",
  "trusted_host",
  "authorized_lane",
  "new_bounded_context",
]);

const KIND_RANK = Object.fromEntries(EXECUTOR_KINDS.map((k, i) => [k, i]));

/**
 * Can this candidate execute this dependency?
 *
 * Every rejection is returned with its reason. A resolver that reports only its
 * winner cannot be audited, and "no executor found" with no list of who was
 * considered is exactly the answer that sends an operator hunting for a lane.
 */
export function evaluateExecutorCandidate(candidate, dependency) {
  const reasons = [];
  const need = dependency.required_executor_capabilities || [];
  const has = candidate.capabilities || [];
  const missing = need.filter((c) => !has.includes(c));
  if (missing.length) reasons.push({ gate: "capability", detail: `does not hold ${missing.join(", ")}` });

  const env = normalizeEnvironment(dependency.target_environment);
  const envs = candidate.environments || null;
  if (env && Array.isArray(envs) && !envs.map(normalizeEnvironment).includes(env)) {
    reasons.push({ gate: "environment", detail: `holds ${envs.join(", ")} but not ${env}` });
  }

  if (dependency.originating_repository_id && candidate.repository_id
    && candidate.repository_id !== dependency.originating_repository_id
    && candidate.cross_repository !== true) {
    reasons.push({ gate: "repository", detail: `bound to ${candidate.repository_id}, not ${dependency.originating_repository_id}` });
  }

  if (candidate.requires_credential && candidate.credential_available !== true) {
    reasons.push({ gate: "credential", detail: "the required credential is not available to this executor" });
  }

  // Governance restrictions are absolute and are checked last so the reason
  // reads as a policy refusal rather than a capability gap.
  if (candidate.governance_blocked) {
    reasons.push({ gate: "governance", detail: String(candidate.governance_blocked) });
  }

  if (!KIND_RANK[candidate.kind] && KIND_RANK[candidate.kind] !== 0) {
    reasons.push({ gate: "kind", detail: `unknown executor kind ${candidate.kind}` });
  }

  return { candidate_id: candidate.executor_id || candidate.lane_id || candidate.kind, kind: candidate.kind, eligible: reasons.length === 0, rejected_for: reasons };
}

/**
 * Choose the executor. Deterministically, and with the evidence.
 *
 * The operator is not an input to this function, and neither is any worker-
 * authored placement — see `declareGovernedDependency`, which strips those.
 */
export function resolveExecutor(dependency, { candidates = [], now = Date.now() } = {}) {
  const evaluated = candidates.map((c) => ({ ...evaluateExecutorCandidate(c, dependency), candidate: c }));
  const eligible = evaluated.filter((e) => e.eligible);

  if (!eligible.length) {
    // What would have to be true for an executor to exist. This is the answer
    // that replaces "send this to another lane".
    const requirements = [];
    const needed = dependency.required_executor_capabilities || [];
    if (needed.length) requirements.push(`an executor registered for ${needed.join(", ")}`);
    if (dependency.target_environment) requirements.push(`authority over the ${dependency.target_environment} environment`);
    const credentialGaps = evaluated.filter((e) => e.rejected_for.some((r) => r.gate === "credential"));
    if (credentialGaps.length) requirements.push("a credential available to a trusted executor, never to the worker");
    return {
      ok: false,
      executor: null,
      reason: candidates.length ? "no_eligible_executor" : "no_executor_candidates",
      must_be_provisioned: requirements,
      evidence: evaluated.map(stripCandidate),
      considered: evaluated.length,
    };
  }

  eligible.sort((a, b) =>
    (KIND_RANK[a.candidate.kind] - KIND_RANK[b.candidate.kind])
    || ((b.candidate.preference_score || 0) - (a.candidate.preference_score || 0))
    || String(a.candidate_id).localeCompare(String(b.candidate_id)));

  const chosen = eligible[0];
  return {
    ok: true,
    executor: chosen.candidate,
    selected_because: selectionRationale(chosen.candidate, dependency),
    runner_up: eligible[1] ? stripCandidate(eligible[1]) : null,
    evidence: evaluated.map(stripCandidate),
    considered: evaluated.length,
    resolved_at: now,
  };
}

function stripCandidate(e) {
  return {
    candidate_id: e.candidate_id,
    kind: e.kind,
    eligible: e.eligible,
    rejected_for: e.rejected_for,
    lane_id: e.candidate?.lane_id ?? null,
    environments: e.candidate?.environments ?? null,
  };
}

function selectionRationale(candidate, dependency) {
  switch (candidate.kind) {
    case "owning_lane":
      return `${candidate.lane_id} already owns this capability and domain and is safe to use`;
    case "dormant_lane":
      return `${candidate.lane_id} is a dormant canonical lane holding this capability and can be resumed`;
    case "trusted_host":
      return `the trusted host holds ${(dependency.required_executor_capabilities || []).join(", ")} for ${dependency.target_environment}`;
    case "authorized_lane":
      return `${candidate.lane_id} is an authorized execution context that can be reused`;
    case "new_bounded_context":
      return "no existing context holds this capability; Vacilando can create a bounded one";
    default:
      return "selected by capability match";
  }
}

// ── The dependency record ────────────────────────────────────────────────────

/**
 * Fields a worker may NOT author.
 *
 * The worker declares what is required. Vacilando resolves where it executes.
 * A worker that could name its own executor could route a privileged action to
 * whichever context it liked, which is the whole policy this module exists to
 * enforce — so these are stripped rather than validated, and their presence is
 * recorded as a rejected override.
 */
export const WORKER_FORBIDDEN_FIELDS = Object.freeze([
  "assigned_lane_id", "assigned_execution_run_id", "executor", "executor_kind",
  "target_lane_id", "route_to", "provider", "worktree_path",
]);

export function newDependencyId() {
  return `gdep_${randomBytes(7).toString("hex")}`;
}

/**
 * Build the canonical dependency from a worker's declaration.
 *
 * `resume_conditions` are mandatory. A dependency with nothing that would prove
 * it satisfied cannot ever be verified, and would resume its parent on the only
 * evidence left — that a child process exited — which is precisely the failure
 * this contract forbids.
 */
export function declareGovernedDependency(input = {}, { now = Date.now(), dependencyId = null } = {}) {
  const rejectedOverrides = WORKER_FORBIDDEN_FIELDS.filter((f) => input[f] != null && input[f] !== "");
  if (!input.originating_run_id) return { ok: false, error: "missing_originating_run_id" };
  if (!input.requested_capability) return { ok: false, error: "missing_requested_capability" };
  const conditions = normalizeResumeConditions(input.resume_conditions);
  if (!conditions.length) return { ok: false, error: "missing_resume_conditions" };

  const action = {
    action_key: input.governed_action_key || input.action_key || null,
    target: input.target_environment || null,
    inputs: input.action_inputs || {},
  };

  return {
    ok: true,
    dependency: {
      schema_version: GOVERNED_DEPENDENCY_SCHEMA,
      dependency_id: dependencyId || newDependencyId(),
      originating_run_id: input.originating_run_id,
      originating_lane_id: input.originating_lane_id ?? null,
      originating_repository_id: input.originating_repository_id ?? null,
      requested_capability: input.requested_capability,
      target_environment: normalizeEnvironment(input.target_environment),
      governed_action_key: action.action_key,
      governed_action_id: input.governed_action_id ?? null,
      governed_action_state: input.governed_action_state ?? null,
      approval_identity: null,
      content_hash: governedContentHash(action),
      execution_fingerprint: executionFingerprint(action),
      required_executor_capabilities: normalizeCapabilities(input.required_executor_capabilities),
      action_inputs: action.inputs,
      dependency_state: "DECLARED",
      created_at: now,
      waiting_since: null,
      wait: null,
      assigned_execution_run_id: null,
      assigned_lane_id: null,
      executor: null,
      executor_evidence: null,
      resume_conditions: conditions,
      verification_result: null,
      terminal_result: null,
      failure_reason: null,
      capability_boundary: input.capability_boundary
        ? boundaryForFailureCode(input.capability_boundary) || { key: input.capability_boundary }
        : null,
      // Recorded, not honoured. An attempted override is a governance event.
      rejected_worker_overrides: rejectedOverrides,
    },
  };
}

function normalizeCapabilities(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => String(v).trim()).filter(Boolean);
}

/**
 * Resume conditions as structured predicates.
 *
 * A string is accepted and becomes a named predicate, because a worker under
 * pressure will write prose; what is never accepted is an EMPTY set.
 */
export function normalizeResumeConditions(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((c, i) => {
    if (typeof c === "string") return { id: `rc_${i + 1}`, kind: "assertion", subject: c, description: c };
    if (!c || typeof c !== "object") return null;
    return {
      id: c.id || `rc_${i + 1}`,
      kind: c.kind || "assertion",
      subject: c.subject ?? null,
      description: c.description || `${c.kind || "assertion"} ${c.subject ?? ""}`.trim(),
    };
  }).filter(Boolean);
}

// ── Routing ──────────────────────────────────────────────────────────────────

/**
 * Resolve a dependency one step, deterministically and without side effects.
 *
 * The caller performs the transition through the canonical owners. Nothing here
 * approves, executes, spawns or resumes — it decides what should happen next and
 * says why, so the decision can be replayed and audited.
 */
export function routeGovernedDependency(dependency, {
  approval = null,
  supersededBy = null,
  candidates = [],
  capacity = null,
  ledger = [],
  now = Date.now(),
} = {}) {
  const step = (state, extra = {}) => ({
    ...dependency,
    dependency_state: state,
    waiting_since: STATE_WAIT_REASON[state] ? (dependency.waiting_since ?? now) : dependency.waiting_since,
    wait: STATE_WAIT_REASON[state]
      ? { reason: STATE_WAIT_REASON[state], resource_id: dependency.dependency_id, waiting_since: dependency.waiting_since ?? now }
      : null,
    ...extra,
  });

  // Idempotency BEFORE anything else. A dependency whose exact action already
  // succeeded must not be executed a second time by a duplicate delivery.
  const prior = alreadyExecuted(dependency.execution_fingerprint, ledger);
  if (prior) {
    return {
      dependency: step("SATISFIED", {
        terminal_result: { ok: true, idempotent: true, satisfied_by: prior.dependency_id },
        verification_result: prior.verification_result ?? null,
      }),
      action: "reuse_prior_execution",
      detail: `this exact action was already executed and verified by ${prior.dependency_id}`,
    };
  }

  // ── governance first: nothing routes before it is approved ────────────────
  const verdict = classifyApproval({
    required: { action_key: dependency.governed_action_key, content_hash: dependency.content_hash, inputs: dependency.action_inputs },
    approved: approval,
    supersededBy,
  });
  if (!verdict.satisfies) {
    return {
      dependency: step("WAITING_APPROVAL", {
        approval_identity: approval ? { request_id: approval.request_id ?? null, content_hash: verdict.approved_content_hash ?? null, verdict: verdict.verdict } : null,
        capability_boundary: boundaryForFailureCode("not_approved"),
      }),
      action: "await_operator_approval",
      approval: verdict,
      // The only question an operator is ever asked here is about CONTENT.
      operator_question: verdict.operator_question || null,
      detail: verdict.reason,
    };
  }

  // ── executor ──────────────────────────────────────────────────────────────
  const resolution = resolveExecutor(dependency, { candidates, now });
  if (!resolution.ok) {
    return {
      dependency: step("WAITING_EXECUTOR", {
        approval_identity: { request_id: approval?.request_id ?? null, content_hash: dependency.content_hash, verdict: "exact" },
        executor_evidence: resolution.evidence,
        capability_boundary: boundaryForFailureCode("environment_not_allowed") && dependency.capability_boundary
          ? dependency.capability_boundary
          : { key: "approved_without_executor", ...CAPABILITY_BOUNDARIES.approved_without_executor },
        failure_reason: null,
      }),
      action: "await_executor_authority",
      required_capability: dependency.required_executor_capabilities,
      target_environment: dependency.target_environment,
      must_be_provisioned: resolution.must_be_provisioned,
      evidence: resolution.evidence,
      detail: resolution.reason,
    };
  }

  // ── capacity: S4 ceiling, S5 admission ────────────────────────────────────
  if (capacity && capacity.available === false) {
    return {
      dependency: step("WAITING_CAPACITY", {
        executor: publicExecutor(resolution.executor),
        executor_evidence: resolution.evidence,
        assigned_lane_id: resolution.executor.lane_id ?? null,
        capability_boundary: { key: "executor_without_capacity", ...CAPABILITY_BOUNDARIES.executor_without_capacity },
      }),
      action: "await_capacity",
      detail: capacity.reason || "provider capacity is unavailable for the selected executor",
      executor: publicExecutor(resolution.executor),
    };
  }

  return {
    dependency: step("READY_TO_ROUTE", {
      approval_identity: { request_id: approval?.request_id ?? null, content_hash: dependency.content_hash, verdict: "exact" },
      executor: publicExecutor(resolution.executor),
      executor_evidence: resolution.evidence,
      assigned_lane_id: resolution.executor.lane_id ?? null,
    }),
    action: "dispatch_to_executor",
    executor: publicExecutor(resolution.executor),
    selected_because: resolution.selected_because,
    detail: resolution.selected_because,
  };
}

function publicExecutor(c) {
  if (!c) return null;
  return {
    kind: c.kind,
    executor_id: c.executor_id ?? c.lane_id ?? c.kind,
    lane_id: c.lane_id ?? null,
    repository_id: c.repository_id ?? null,
    environments: c.environments ?? null,
    capabilities: c.capabilities ?? [],
  };
}

// ── Verification and continuation ────────────────────────────────────────────

/**
 * Did the declared resume conditions actually become true?
 *
 * NOT "did the child exit 0". The evidence reader is injected and must return a
 * verdict per condition from an authoritative read. An unreadable condition is
 * `unverified`, which is NOT satisfied — the parent stays blocked, because
 * "we could not check" has to cost the same as "it is not there".
 */
/**
 * What counts as PROOF, per condition kind.
 *
 * S1 accepted any `{ present }` verdict. That was the loophole the Health &
 * Safety incident walked through: a `head: true` count probe reported a MISSING
 * table as PRESENT, and a Director was told H1 had landed. The probe answered
 * confidently without reading a single row.
 *
 * So for database facts the verdict must now carry HOW it was obtained and WHAT
 * came back. A method that is structurally incapable of proving existence is
 * rejected outright — its `present: true` is discarded and the condition reads
 * as unverified, which keeps the parent blocked.
 */
export const PROOF_REQUIRED_KINDS = Object.freeze(["relation_exists", "permission_exists", "column_exists", "grant_exists"]);

/** Methods that cannot prove existence, whatever they claim. */
export const REJECTED_EVIDENCE_METHODS = Object.freeze([
  "head_count", "head", "count_only", "exists_probe", "select_count", "estimate",
]);

export const ACCEPTED_EVIDENCE_METHOD = "real_read";

/**
 * Normalise one evidence verdict against the contract.
 *
 * Returns three-valued presence. `null` means unproven — which is deliberately
 * the same outcome as a probe that could not run, because "we asked something
 * that cannot answer" and "we could not ask" are equally not-evidence.
 */
export function normalizeEvidenceVerdict(condition, verdict) {
  const kind = condition?.kind || "assertion";
  const method = verdict?.method ?? null;

  if (method && REJECTED_EVIDENCE_METHODS.includes(String(method))) {
    return {
      present: null,
      method,
      rejected: true,
      detail: `\`${method}\` cannot prove existence; a count answers the same for a present and an absent relation`,
    };
  }

  if (PROOF_REQUIRED_KINDS.includes(kind)) {
    // A probe that FAILED is unreadable, not rejected. Both leave the fact
    // unproven and both keep the parent blocked, but they are different
    // problems: one needs the probe fixed, the other needs a probe that is
    // capable of answering at all.
    if (!method && (verdict?.error || verdict?.present == null) && !("rows" in (verdict || {}))) {
      return { present: null, method: null, rejected: false, unreadable: true, detail: verdict?.detail ?? verdict?.error ?? "evidence could not be read" };
    }
    if (method !== ACCEPTED_EVIDENCE_METHOD) {
      return { present: null, method, rejected: true, detail: `${kind} requires a ${ACCEPTED_EVIDENCE_METHOD}; got ${method || "no stated method"}` };
    }
    // A real read that returned nothing is a NEGATIVE, not an unknown — the
    // read happened and the row was not there.
    const rows = Array.isArray(verdict?.rows) ? verdict.rows : null;
    if (rows == null) {
      return { present: null, method, rejected: true, detail: "a real read must carry the rows it read" };
    }
    return { present: rows.length > 0, method, rows_read: rows.length, source: verdict?.source ?? null, detail: verdict?.detail ?? null };
  }

  const p = verdict?.present;
  return {
    present: p === true ? true : p === false ? false : null,
    method: method ?? null,
    source: verdict?.source ?? null,
    detail: verdict?.detail ?? verdict?.error ?? null,
  };
}

export async function verifyResumeConditions(dependency, { readEvidence = null, now = Date.now() } = {}) {
  const conditions = dependency.resume_conditions || [];
  if (!conditions.length) {
    return { ok: false, verified: false, reason: "no_resume_conditions", checked: [], verified_at: now };
  }
  if (typeof readEvidence !== "function") {
    return { ok: false, verified: false, reason: "no_evidence_reader", checked: [], verified_at: now };
  }
  const checked = [];
  for (const condition of conditions) {
    let verdict;
    try {
      verdict = await readEvidence(condition, dependency);
    } catch (err) {
      verdict = { present: null, error: err?.message || String(err) };
    }
    // Three-valued on purpose: true, false, and "could not be proven" — and
    // the contract decides which, not the probe's own opinion of itself.
    const normalized = normalizeEvidenceVerdict(condition, verdict);
    checked.push({
      id: condition.id,
      kind: condition.kind,
      subject: condition.subject,
      present: normalized.present,
      method: normalized.method,
      evidence_unreadable: normalized.unreadable === true,
      rows_read: normalized.rows_read ?? null,
      evidence_rejected: normalized.rejected === true,
      source: normalized.source ?? null,
      detail: normalized.detail ?? null,
    });
  }
  const allTrue = checked.every((c) => c.present === true);
  const unreadable = checked.filter((c) => c.present === null);
  const rejected = checked.filter((c) => c.evidence_rejected);
  return {
    ok: true,
    verified: allTrue,
    reason: allTrue ? "all_conditions_verified"
      : rejected.length ? "evidence_does_not_prove"
        : unreadable.length ? "evidence_unreadable"
          : "conditions_not_met",
    checked,
    unreadable: unreadable.map((c) => c.id),
    rejected_evidence: rejected.map((c) => ({ id: c.id, method: c.method, detail: c.detail })),
    verified_at: now,
  };
}

/**
 * Decide whether the originating run may resume.
 *
 * The single rule: verified evidence, or nothing. A successful child with an
 * unverified condition leaves the parent blocked and says which condition
 * failed — a failure mode that reads as "almost done" is worse than one that
 * reads as "not done".
 */
export function continuationDecision(dependency, verification, { terminal = null, now = Date.now() } = {}) {
  if (terminal && terminal.ok === false) {
    return {
      dependency: {
        ...dependency,
        dependency_state: "FAILED",
        terminal_result: terminal,
        failure_reason: terminal.error || terminal.failure_reason || "dependent_execution_failed",
        verification_result: verification ?? null,
      },
      resume_parent: false,
      // Explicit, so an operator is never left guessing whether to try again.
      retryable: terminal.retryable === true,
      operator_message: operatorFailureMessage(dependency, terminal),
    };
  }
  if (!verification?.verified) {
    return {
      dependency: {
        ...dependency,
        dependency_state: "VERIFYING",
        terminal_result: terminal ?? null,
        verification_result: verification ?? null,
      },
      resume_parent: false,
      retryable: true,
      operator_message: verification?.reason === "evidence_unreadable"
        ? `The dependent action reported success, but ${(verification.unreadable || []).join(", ")} could not be read. ${dependency.originating_lane_id || "The originating run"} stays blocked until the evidence is readable.`
        : `The dependent action reported success, but the required state is not present: ${(verification?.checked || []).filter((c) => c.present !== true).map((c) => c.subject).join(", ")}.`,
    };
  }
  return {
    dependency: {
      ...dependency,
      dependency_state: "SATISFIED",
      terminal_result: terminal ?? { ok: true },
      verification_result: verification,
      satisfied_at: now,
    },
    resume_parent: true,
    // Resolved through the EXISTING run path — S6's wait resolution, not a new one.
    resume_via: "canonical_run_path",
    resolves_wait: dependency.wait?.reason ?? null,
    retryable: false,
  };
}

function operatorFailureMessage(dependency, terminal) {
  const what = dependency.requested_capability || dependency.governed_action_key || "the governed action";
  const why = terminal?.error || terminal?.failure_reason || "it failed";
  return `${what} could not be completed on ${dependency.target_environment || "the target environment"}: ${why}. `
    + `${dependency.originating_lane_id || "The originating run"} remains blocked with the dependency recorded; `
    + `${terminal?.retryable === true ? "this can be retried." : "this needs a decision before it can be retried."}`;
}

// ── Operator presentation ────────────────────────────────────────────────────

/**
 * What the operator is shown.
 *
 * The rule this encodes: the operator is asked about GOVERNANCE and told about
 * ROUTING. There is no branch of this function that asks which lane should run
 * the work.
 */
export function operatorView(dependency, { step = null } = {}) {
  const lines = [];
  const title = dependency.originating_lane_name || dependency.originating_lane_id || "Blocked run";
  lines.push(title);
  lines.push(`Blocked: ${dependency.requested_capability}`);
  switch (dependency.dependency_state) {
    case "WAITING_APPROVAL":
      lines.push("", "Governed action:", step?.operator_question || "Awaiting approval");
      break;
    case "WAITING_EXECUTOR":
      lines.push("", "Governed action:", "Approved", "", "Vacilando:",
        `No authorized executor holds ${(dependency.required_executor_capabilities || []).join(", ")} for ${dependency.target_environment}.`,
        ...(step?.must_be_provisioned || []).map((r) => `  needs: ${r}`));
      break;
    case "WAITING_CAPACITY":
      lines.push("", "Governed action:", "Approved", "", "Vacilando:",
        `Routed to ${dependency.executor?.executor_id}; waiting for capacity…`);
      break;
    case "READY_TO_ROUTE":
    case "EXECUTING":
      lines.push("", "Governed action:", "Approved", "", "Vacilando:",
        `Routing to ${dependency.executor?.executor_id}…`, "", "Executing…");
      break;
    case "SATISFIED": {
      const checks = (dependency.verification_result?.checked || []).map((c) => `✓ ${c.subject}`);
      lines.push("", "Governed action:", "Approved", "", "Vacilando:",
        `Routed to ${dependency.executor?.executor_id || "the authorized executor"}`, "", "Verified:", ...checks,
        "", `Resuming ${title}…`);
      break;
    }
    case "FAILED":
      lines.push("", "Failed:", dependency.failure_reason || "the dependent execution failed");
      break;
    default:
      lines.push("", `State: ${dependency.dependency_state}`);
  }
  return lines.join("\n");
}

/** Summary for health and for the lane surface. */
export function summarizeDependencies(deps = []) {
  const counts = Object.fromEntries(DEPENDENCY_STATES.map((s) => [s, 0]));
  for (const d of deps) counts[d.dependency_state] = (counts[d.dependency_state] || 0) + 1;
  return {
    schema_version: GOVERNED_DEPENDENCY_SCHEMA,
    counts,
    total: deps.length,
    blocked_on_operator: deps.filter((d) => d.dependency_state === "WAITING_APPROVAL").length,
    blocked_on_provisioning: deps.filter((d) => d.dependency_state === "WAITING_EXECUTOR").length,
    // The doctrine's acceptance criterion, as a number: how many dependencies
    // are stopped for a reason Vacilando should have resolved itself.
    unrouted_but_routable: deps.filter((d) => d.dependency_state === "READY_TO_ROUTE").length,
  };
}

// ── Live executor candidates, from the existing owners ───────────────────────

/**
 * Enumerate who could execute this, from canonical sources only.
 *
 * THE TRUSTED HOST is a candidate for whatever the action registry says it can
 * do, in the environments that action admits. Its environment list comes from
 * the registered action itself, so a capability the host does not hold for an
 * environment simply is not offered — which is how the Health & Safety case
 * resolves to "no executor" rather than to a validation error.
 *
 * LANES are candidates only when something has actually granted them the
 * capability. A lane is not an executor because it exists, or because it is
 * near the work, or because it happens to be free. Today nothing grants a lane
 * `trusted_host.database.migrate`, and this function says so instead of
 * inventing an executor to avoid an awkward answer.
 */
export async function enumerateExecutorCandidates(dependency, {
  root = undefined,
  lanes = null,
  actionDefinitionFor = null,
  laneCapabilitiesFor = null,
  seatStates = null,
} = {}) {
  const candidates = [];

  // ---- the trusted host ----
  let definition = null;
  try {
    const getDef = actionDefinitionFor || (await import("./trusted-host-action-registry.mjs")).getActionDefinition;
    definition = dependency.governed_action_key ? getDef(dependency.governed_action_key) : null;
  } catch { definition = null; }

  if (definition) {
    candidates.push({
      kind: "trusted_host",
      executor_id: "trusted_host",
      capabilities: [definition.requiredCapability].filter(Boolean),
      environments: await trustedHostEnvironmentsFor(dependency.governed_action_key),
      requires_credential: true,
      // The host holds its own credentials; that is the point of it. A worker
      // never does, and must never be offered as the fallback.
      credential_available: true,
      repository_id: dependency.originating_repository_id ?? null,
      cross_repository: true,
      preference_score: 10,
    });
  }

  // ---- lanes with a GRANTED capability ----
  let laneList = lanes;
  if (!Array.isArray(laneList)) {
    try {
      const { listDurableLanes } = await import("./development-lane.mjs");
      laneList = listDurableLanes(root);
    } catch { laneList = []; }
  }
  const seatByLane = new Map((seatStates || []).map((s) => [s.lane_id, s]));
  for (const lane of laneList || []) {
    const caps = typeof laneCapabilitiesFor === "function"
      ? (laneCapabilitiesFor(lane) || [])
      : declaredLaneCapabilities(lane);
    if (!caps.length) continue;
    const seat = seatByLane.get(lane.lane_id) || null;
    const dormant = seat?.state === "dormant";
    candidates.push({
      kind: dormant ? "dormant_lane" : "owning_lane",
      executor_id: lane.lane_id,
      lane_id: lane.lane_id,
      lane_name: lane.name || null,
      repository_id: lane.repository_id ?? null,
      capabilities: caps,
      environments: lane.governed_environments || null,
      requires_credential: false,
      credential_available: true,
      // A live seat mid-turn is a worse host for someone else's work than a
      // dormant lane that exists to be resumed.
      preference_score: dormant ? 5 : (seat?.state === "idle" ? 8 : 3),
    });
  }

  return candidates;
}

/**
 * What a lane is actually authorized to execute.
 *
 * Deliberately narrow. Only an explicit declaration counts — never a repository
 * binding, a slot number, or proximity to the work. Returning [] is the correct
 * and common answer.
 */
export function declaredLaneCapabilities(lane) {
  const declared = lane?.governed_capabilities || lane?.capabilities || null;
  if (!Array.isArray(declared)) return [];
  return declared.map((c) => String(c).trim()).filter(Boolean);
}

/** Environments a registered trusted-host action admits, read from its own module. */
export async function trustedHostEnvironmentsFor(actionKey) {
  try {
    const { ACTION_TYPES } = await import("./trusted-host-action-registry.mjs");
    if (actionKey === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
      const { ALLOWED_ENVIRONMENTS } = await import("./trusted-host-migrate.mjs");
      return [...ALLOWED_ENVIRONMENTS];
    }
    if (actionKey === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST
      || actionKey === ACTION_TYPES.REPOSITORY_PUSH
      || actionKey === ACTION_TYPES.PROMOTION_OPEN_PR) {
      return ["staging"];
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * The approval that actually governs this dependency, and what supersedes it.
 *
 * Reads the existing governed-action store. Only a request whose status is
 * `complete` — the store's word for executed under approval — or which carries
 * an explicit operator approval counts. A request that merely EXISTS approves
 * nothing: both Health & Safety requests exist, and neither was ever approved.
 */
/**
 * When a governed request was filed.
 *
 * The store's field is `created_at`. S1 sorted on `requested_at`, which does
 * not exist on a real record — so every comparison saw "" and "latest" fell
 * back to whatever order the file happened to be in. Supersession is decided by
 * this ordering, so on the live store it was being decided by luck. The live
 * run is what exposed it; no fixture would have, because the fixtures carried
 * the field the code was looking for.
 */
export function requestFiledAt(request) {
  return String(request?.created_at || request?.requested_at || request?.updated_at || "");
}

export function resolveApprovalFromStore(dependency, requests = []) {
  const wantSubject = dependencySubjectKey({
    action_key: dependency.governed_action_key,
    inputs: dependency.action_inputs,
  });
  // Same action AND same subject. Matching on the action key alone offered a
  // completed staging migration of ten unrelated files as "an approval for this
  // action, with different content" — which reads to an operator as though the
  // right thing had nearly been approved. An unrelated approval must resolve to
  // NO approval, not to a near miss.
  const sameAction = requests.filter((r) => r.action_key === dependency.governed_action_key
    && (wantSubject == null || dependencySubjectKey(r) === wantSubject));
  const withHash = sameAction.map((r) => ({ ...r, content_hash: governedContentHash(r) }));
  const isApproved = (r) => Boolean(r.operator_approval) || r.status === "complete";

  // The most recent request on this action, approved or not. Supersession is
  // computed for EVERY branch, including the exact-match one: an approval that
  // matches by content is still stale if a later, materially different request
  // has since been filed on the same subject. Checking it only on the fallback
  // path let an exact-but-superseded approval through, which is the quietest
  // possible way to execute the wrong version.
  const latest = [...withHash]
    .sort((a, b) => requestFiledAt(b).localeCompare(requestFiledAt(a)))[0] || null;
  const supersedes = (approval) => (approval && latest
    && latest.request_id !== approval.request_id
    && latest.content_hash !== approval.content_hash
    ? latest.request_id
    : null);

  const exact = withHash.find((r) => r.content_hash === dependency.content_hash && isApproved(r));
  if (exact) return { approval: exact, supersededBy: supersedes(exact) };

  // An approval for the same nominal subject but different content. Surfaced so
  // the operator question can be the small one, about content — never a request
  // to choose a lane.
  const approvedAny = withHash
    .filter(isApproved)
    .sort((a, b) => requestFiledAt(b).localeCompare(requestFiledAt(a)))[0] || null;
  return { approval: approvedAny, supersededBy: supersedes(approvedAny) };
}
