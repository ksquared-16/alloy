/**
 * S3 — executor authority for governed database operations.
 *
 * WHAT THE INVENTORY FOUND, AND WHY IT CHANGES THE ANSWER.
 *
 * The registered migration capability validates `environment` against an
 * allowlist — staging, certification, cert — and then executes through
 * trusted-host-apply-migration.sh, which takes DATABASE_URL from ONE place:
 * `$ALLOY_SERVER_ENV_SOURCE`, defaulting to the canonical checkout's
 * web/.env.local. Measured on this host: one DATABASE_URL, hosted, and no
 * per-environment key of any kind.
 *
 * So all three allowed environments execute against the SAME database. The
 * environment input is a LABEL, not an authority boundary. Adding
 * `development_certification` to that allowlist would not have routed anything
 * anywhere new — it would have relabelled the same connection, which is exactly
 * the "do not simply add another string to an allowlist" failure.
 *
 * IT IS ALSO A LIVE HAZARD, INDEPENDENT OF THIS SLICE. A migration approved
 * today for "certification" applies to whatever that single DATABASE_URL names.
 * The operator approving it reads one environment on the card and gets another.
 * `assertEnvironmentAuthority` closes that: an environment whose credential is
 * not provably its own cannot be executed against, whatever the allowlist says.
 *
 * THE MODEL. An environment is canonical when it names a DISTINCT credential
 * binding. Aliases normalize onto their canonical id BEFORE governance identity
 * is computed, so equivalent names cannot manufacture false approval
 * differences — and a name that is NOT an alias, and has no binding, is
 * `unprovisioned`: routable, approvable, and refused at execution with the
 * exact provisioning step named.
 *
 * NOTHING HERE HOLDS A CREDENTIAL. This module reasons about credential
 * REFERENCES. It never reads a secret, never passes one, and never logs one.
 */

export const EXECUTOR_AUTHORITY_SCHEMA = "vacilando.executor_authority.v1";

/**
 * Canonical environments.
 *
 * `credential_ref` is a NAME, resolved by the trusted host at execution time
 * and never by anything a worker can reach. `distinct_binding: false` records
 * the measured truth that this environment shares the single ambient
 * DATABASE_URL rather than owning one.
 */
export const ENVIRONMENT_REGISTRY = Object.freeze({
  staging: {
    canonical: "staging",
    aliases: ["stage"],
    credential_ref: "ambient:ALLOY_SERVER_ENV_SOURCE#DATABASE_URL",
    distinct_binding: false,
    provisioned: true,
    write_capability: "trusted_host.database.migrate",
    read_capability: "trusted_host.database.read",
  },
  certification: {
    canonical: "certification",
    // `cert` was already accepted by the registry and means the same thing.
    aliases: ["cert"],
    credential_ref: "ambient:ALLOY_SERVER_ENV_SOURCE#DATABASE_URL",
    distinct_binding: false,
    provisioned: true,
    write_capability: "trusted_host.database.migrate",
    read_capability: "trusted_host.database.read",
  },
  development_certification: {
    canonical: "development_certification",
    aliases: ["dev_certification", "development-certification", "devcert"],
    // Named, and deliberately absent. Naming the reference is what makes the
    // provisioning step a single, auditable operator action instead of an
    // argument about which string to add where.
    credential_ref: "trusted_secret:development_certification_database",
    distinct_binding: true,
    provisioned: false,
    write_capability: "trusted_host.database.migrate",
    read_capability: "trusted_host.database.read",
  },
});

/** Production is named so it can be refused by name, not merely omitted. */
export const FORBIDDEN_ENVIRONMENTS = Object.freeze([
  "production", "prod", "alloy_production", "alloy_deployed_primary", "live",
]);

const ALIAS_INDEX = (() => {
  const m = new Map();
  for (const [id, spec] of Object.entries(ENVIRONMENT_REGISTRY)) {
    m.set(id, id);
    for (const a of spec.aliases || []) m.set(a, id);
  }
  return m;
})();

/**
 * Alias → canonical id. MUST run before governance identity is computed.
 *
 * If `cert` and `certification` hashed differently, an approval for one would
 * not satisfy the other and the operator would be asked the same question
 * twice for the same action. Conversely a name that is NOT a known alias must
 * NOT be folded onto something that looks close: `development_certification` is
 * its own environment, and quietly normalizing it onto `certification` would
 * approve work against the wrong database.
 */
export function normalizeEnvironmentId(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!s) return null;
  return ALIAS_INDEX.get(s) || s;
}

export function isKnownEnvironment(raw) {
  const id = normalizeEnvironmentId(raw);
  return Boolean(id && ENVIRONMENT_REGISTRY[id]);
}

export function environmentSpec(raw) {
  const id = normalizeEnvironmentId(raw);
  return id ? (ENVIRONMENT_REGISTRY[id] || null) : null;
}

/** Every reason an environment may not be executed against. */
export const AUTHORITY_REFUSALS = Object.freeze([
  "environment_forbidden", "environment_unknown", "environment_unprovisioned",
  "environment_binding_not_distinct", "capability_mismatch",
]);

/**
 * May this capability execute against this environment, right now?
 *
 * THE STRICT CHECK. `requireDistinctBinding` refuses an environment that shares
 * the ambient connection. It defaults ON for any environment declaring
 * `distinct_binding: true`, and is offered for the others so an operator can
 * turn on the honest behaviour for staging/certification once those are
 * separated — today, enabling it would refuse them, which is the truth about
 * this host and not something to hide behind a default.
 */
export function assertEnvironmentAuthority({
  environment,
  capability,
  mode = "write",
  requireDistinctBinding = null,
  credentialAvailable = null,
} = {}) {
  const raw = String(environment || "").trim().toLowerCase();
  if (FORBIDDEN_ENVIRONMENTS.includes(raw)) {
    return { ok: false, refusal: "environment_forbidden", detail: `${raw} is never a governed migration target` };
  }
  const id = normalizeEnvironmentId(environment);
  const spec = id ? ENVIRONMENT_REGISTRY[id] : null;
  if (!spec) {
    return {
      ok: false, refusal: "environment_unknown", environment: id,
      detail: `${id} is not a registered environment; register it with a credential reference rather than adding it to an allowlist`,
    };
  }

  const wanted = mode === "read" ? spec.read_capability : spec.write_capability;
  if (capability && capability !== wanted) {
    return { ok: false, refusal: "capability_mismatch", environment: id, detail: `${id} ${mode} is owned by ${wanted}, not ${capability}` };
  }

  // The registry declares the DEFAULT platform state; a live binding check can
  // override it upward but never downward. `provisioned: false` means "this
  // environment requires a binding and the platform does not ship one" — if a
  // host has actually registered it, `credentialAvailable: true` is the
  // evidence that settles it. An explicit `false` always refuses, whatever the
  // registry says, because a missing credential is a fact about this machine.
  if (credentialAvailable === false || (!spec.provisioned && credentialAvailable !== true)) {
    return {
      ok: false, refusal: "environment_unprovisioned", environment: id,
      credential_ref: spec.credential_ref,
      // The exact provisioning step, so the gap is one action rather than a discussion.
      must_be_provisioned: [`a trusted-host credential registered as \`${spec.credential_ref}\`, readable only by the trusted executor`],
      detail: `${id} has no provisioned credential binding`,
    };
  }

  const strict = requireDistinctBinding == null ? spec.distinct_binding === true : requireDistinctBinding === true;
  if (strict && spec.distinct_binding !== true) {
    return {
      ok: false, refusal: "environment_binding_not_distinct", environment: id,
      detail: `${id} resolves to the ambient ${spec.credential_ref}; a migration labelled ${id} cannot be proven to reach ${id}`,
    };
  }

  return {
    ok: true, environment: id, capability: wanted, mode,
    credential_ref: spec.credential_ref,
    distinct_binding: spec.distinct_binding === true,
  };
}

// ── Credential boundary ──────────────────────────────────────────────────────

/**
 * The credential model, stated so it can be audited rather than assumed.
 *
 * The originating worker never holds, sees, or can request the credential: it
 * declares a dependency and waits. The trusted host resolves the reference in
 * its own process, and the child that touches the database unsets it before it
 * can be inherited any further.
 */
export const CREDENTIAL_BOUNDARY = Object.freeze({
  schema_version: EXECUTOR_AUTHORITY_SCHEMA,
  origin: "trusted host process only; resolved from a credential REFERENCE, never from a worker-supplied value",
  receiving_process: "the registered trusted-host action child (trusted-host-apply-migration.sh)",
  lifetime: "one action invocation; the child unsets DATABASE_URL, PGPASSWORD and SUPABASE_SERVICE_ROLE_KEY before it exits",
  environment_scoped: "by credential_ref per environment; today staging and certification share one ambient reference, which is why distinct-binding enforcement exists",
  inheritable_by_provider_processes: false,
  why_the_feature_lane_cannot_obtain_it: [
    "the lane declares a dependency and never invokes the capability",
    "the capability is registered to the trusted host, not to any lane",
    "worker-authored placement fields are stripped at declaration, so a lane cannot nominate itself as executor",
    "the credential reference resolves inside the trusted host process, which no lane is an ancestor of",
  ],
  audited_by: [
    "governed-action audit trail records the action, environment and approval identity",
    "the executor child redacts any postgres URL from stderr before it is stored",
    "credential ABSENCE is a distinct exit code (42, trusted_credential_unavailable) rather than a generic failure",
  ],
});

/**
 * WRITE AND READ ARE SEPARATE CAPABILITIES.
 *
 * The simpler design — one process holding both — was rejected. Verification
 * exists to contradict the thing that just executed, and evidence produced
 * under the same authority that performed the write is weaker evidence. Keeping
 * them apart also lets routing say which capability owns each step, and lets a
 * read be granted where a write must not be.
 */
export const AUTHORITY_SEPARATION = Object.freeze({
  decision: "separate",
  write: "trusted_host.database.migrate",
  read: "trusted_host.database.read",
  rationale: "verification must be able to contradict execution; least privilege lets a verifier exist without write authority",
});

// ── Migration content integrity ──────────────────────────────────────────────

export const INTEGRITY_FIELDS = Object.freeze([
  "repository", "source_sha", "migrations", "environment", "content_hash", "approval_identity",
]);

/**
 * Bind execution to the EXACT approved content.
 *
 * The Health & Safety incident had two requests with identical migration
 * filenames and different source SHAs. Filenames matching is not content
 * matching, and "latest" is never what was approved — so every field is
 * compared, and any mismatch refuses.
 */
export function bindExecutionToApproval({ approved = null, observed = null } = {}) {
  if (!approved) return { ok: false, refusal: "no_approved_action", mismatches: [] };
  if (!observed) return { ok: false, refusal: "no_observed_source", mismatches: [] };
  const mismatches = [];
  const cmp = (field, a, b) => {
    const x = JSON.stringify(a ?? null);
    const y = JSON.stringify(b ?? null);
    if (x !== y) mismatches.push({ field, approved: a ?? null, observed: b ?? null });
  };
  cmp("repository", approved.repository, observed.repository);
  cmp("source_sha", String(approved.source_sha || "").toLowerCase(), String(observed.source_sha || "").toLowerCase());
  // Order-independent: the SET of migrations is the identity, not their order.
  cmp("migrations", [...(approved.migrations || [])].sort(), [...(observed.migrations || [])].sort());
  cmp("environment", normalizeEnvironmentId(approved.environment), normalizeEnvironmentId(observed.environment));
  cmp("content_hash", approved.content_hash, observed.content_hash);
  cmp("approval_identity", approved.approval_identity, observed.approval_identity);
  return mismatches.length
    ? { ok: false, refusal: "content_does_not_match_approval", mismatches }
    : { ok: true, bound: { ...approved } };
}

// ── Idempotency ──────────────────────────────────────────────────────────────

/**
 * Has this exact governed action already executed successfully here?
 *
 * The platform does not rely on the migrations claiming to be idempotent. The
 * key is content + environment, so a rerun of the same action converges on the
 * existing result and a DIFFERENT content hash is never mistaken for a repeat.
 */
export function executionKey({ content_hash, environment }) {
  return `${content_hash}@${normalizeEnvironmentId(environment) || "unknown"}`;
}

export function priorExecution(key, ledger = []) {
  return ledger.find((e) => e?.execution_key === key && e?.ok === true) || null;
}

export function idempotentExecutionDecision({ content_hash, environment, ledger = [], rerunPermitted = false }) {
  const key = executionKey({ content_hash, environment });
  const prior = priorExecution(key, ledger);
  if (!prior) return { execute: true, key, reason: "no_prior_execution" };
  if (rerunPermitted) return { execute: true, key, reason: "capability_permits_rerun", prior };
  return { execute: false, key, reason: "already_executed", prior, converged_on: prior.result_ref ?? null };
}

// ── Real-read verification capability ────────────────────────────────────────

/**
 * The bounded read the verifier is allowed to perform.
 *
 * Deliberately a fixed, named set rather than arbitrary SQL: a verification
 * capability that can run any query is a database capability wearing a smaller
 * name. Each probe states the relation it reads and what a row means.
 */
export const VERIFICATION_PROBES = Object.freeze({
  relation_exists: {
    reads: "information_schema.tables",
    row_means: "the relation exists in the target database",
    capability: "trusted_host.database.read",
  },
  permission_exists: {
    reads: "permission_definitions",
    row_means: "the permission key is defined",
    capability: "trusted_host.database.read",
  },
  grant_exists: {
    reads: "role_permission_grants",
    row_means: "the permission is granted to the role",
    capability: "trusted_host.database.read",
  },
});

/**
 * Shape a verifier result into the proof contract S2 already enforces.
 *
 * An error is `unreadable`. Zero rows after a query that RAN is negative.
 * Neither ever becomes positive — that conversion is the exact defect that told
 * a Director H1 had landed when the table did not exist.
 */
export function realReadVerdict({ probe, ran = false, rows = null, error = null }) {
  const spec = VERIFICATION_PROBES[probe] || null;
  if (error || !ran) {
    return { method: null, present: null, unreadable: true, detail: error ? String(error).slice(0, 200) : "the probe did not run" };
  }
  if (!Array.isArray(rows)) {
    return { method: null, present: null, unreadable: true, detail: "a real read must carry the rows it read" };
  }
  return {
    method: "real_read",
    rows,
    rows_read: rows.length,
    // Zero rows from a query that ran is a NEGATIVE, not an unknown.
    present: rows.length > 0,
    source: spec ? `select:${spec.reads}` : null,
    capability: spec?.capability ?? null,
  };
}

/** The Health & Safety verification contract, as a first-class object. */
export const HEALTH_SAFETY_VERIFICATION = Object.freeze([
  { id: "rc_table", kind: "relation_exists", subject: "person_health_facts" },
  { id: "rc_view", kind: "permission_exists", subject: "health.view" },
  { id: "rc_manage", kind: "permission_exists", subject: "health.manage" },
]);

/** What an operator is told, without any implementation or credential detail. */
export function operatorExecutorLabel(environment) {
  const id = normalizeEnvironmentId(environment);
  const spec = id ? ENVIRONMENT_REGISTRY[id] : null;
  if (!spec) return "No registered executor";
  return spec.provisioned
    ? `Trusted ${id.replace(/_/g, "/")} database executor`
    : `Trusted ${id.replace(/_/g, "/")} database executor — not yet provisioned`;
}
