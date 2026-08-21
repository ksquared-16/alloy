/**
 * Governed-action identity and result-schema integrity.
 *
 * A request may not complete, create evidence, resume a worker, or emit a
 * success notification unless the requested action, executed action, and
 * persisted evidence agree — and the result matches that action's schema.
 */
import {
  ACTION_TYPES,
  classifyActionAvailability,
  getActionDefinition,
} from "./trusted-host-action-registry.mjs";

export const INTEGRITY_ERRORS = Object.freeze({
  unsupported: "unsupported_action_key",
  identity: "governed_action_identity_mismatch",
  schema: "governed_action_result_schema_mismatch",
});

export const CERTIFICATION_STATUSES = Object.freeze([
  "certified",
  "certified_read_only",
  "partially_certified",
  "failed",
  "environment_unavailable",
  "principal_unavailable",
]);

const CENSUS_MARKERS = ["census_run_at", "question_ids", "org_count"];
const MERGE_MARKERS = ["merge_sha", "pull_request_number", "staging_sha"];
const CERT_MARKERS = ["suite", "write_policy", "source_sha"];

function keyOf(value) {
  return String(
    value?.action_key
    || value?.actionKey
    || value?.actionType
    || value?.action_type
    || "",
  ).trim();
}

function hasAny(obj, keys) {
  if (!obj || typeof obj !== "object") return false;
  return keys.some((k) => obj[k] != null);
}

export function resultLooksLikeCensus(result) {
  if (!result || typeof result !== "object") return false;
  if (result.census && typeof result.census === "object") return true;
  return hasAny(result, CENSUS_MARKERS);
}

export function resultLooksLikeMerge(result) {
  if (!result || typeof result !== "object") return false;
  return hasAny(result, MERGE_MARKERS);
}

export function resultLooksLikeCertification(result) {
  if (!result || typeof result !== "object") return false;
  if (CERTIFICATION_STATUSES.includes(String(result.status || ""))) return true;
  return hasAny(result, CERT_MARKERS) && result.tests && typeof result.tests === "object";
}

export function validateGovernedResultSchema(actionKey, result) {
  const key = String(actionKey || "").trim();
  if (!key) {
    return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "missing_action_key" };
  }
  if (result == null) {
    return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "missing_result" };
  }
  if (key === ACTION_TYPES.DATABASE_READ_CENSUS) {
    if (resultLooksLikeMerge(result) || resultLooksLikeCertification(result)) {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "census_result_must_not_be_merge_or_certification" };
    }
    if (!resultLooksLikeCensus(result) && !result.resultJson && !result.census) {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "census_result_missing_census" };
    }
    return { ok: true, schema: "census" };
  }
  if (key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    if (resultLooksLikeCensus(result) || resultLooksLikeCertification(result)) {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "merge_result_must_not_be_census_or_certification" };
    }
    if (!resultLooksLikeMerge(result)) {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "merge_result_missing_merge_fields" };
    }
    return { ok: true, schema: "merge" };
  }
  if (key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING) {
    if (resultLooksLikeCensus(result) || resultLooksLikeMerge(result)) {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "certification_result_must_not_be_census_or_merge" };
    }
    if (!CERTIFICATION_STATUSES.includes(String(result.status || ""))) {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "certification_status_invalid" };
    }
    if (result.status === "complete") {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "generic_complete_forbidden" };
    }
    if (!result.suite && !result.tests && !result.evidence_path && !result.evidencePath) {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "certification_result_missing_suite_or_tests" };
    }
    return { ok: true, schema: "certification" };
  }
  if (key === ACTION_TYPES.DATABASE_APPLY_MIGRATION || key === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER) {
    if (resultLooksLikeCensus(result) || resultLooksLikeCertification(result)) {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "migration_result_must_not_be_census_or_certification" };
    }
    if (result.environment == null && !Array.isArray(result.migrations) && !result.repaired) {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "migration_result_missing_fields" };
    }
    return { ok: true, schema: "migration" };
  }
  if (key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) {
    if (resultLooksLikeCensus(result) || resultLooksLikeMerge(result)) {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "principal_result_must_not_be_census_or_merge" };
    }
    if (!result.principal_id && !result.principal?.principal_id && !result.principal_label && !result.principal?.principal_label) {
      return { ok: false, error: INTEGRITY_ERRORS.schema, detail: "principal_result_missing_id" };
    }
    return { ok: true, schema: "certification_principal" };
  }
  return { ok: false, error: INTEGRITY_ERRORS.unsupported, detail: "no_result_schema_for_action" };
}

export function assertGovernedActionIdentity({
  request = null,
  action = null,
  result = null,
  evidence = null,
  requireLoaded = true,
} = {}) {
  const requested = keyOf(request) || keyOf(action);
  const executed = keyOf(action) || keyOf(result) || requested;
  const evidenceKey = keyOf(evidence) || keyOf(result);
  const avail = classifyActionAvailability(requested);
  if (avail.code === "unsupported_action_key" || !getActionDefinition(requested)) {
    return {
      ok: false,
      error: INTEGRITY_ERRORS.unsupported,
      requested_action_key: requested || null,
      executed_action_key: executed || null,
      evidence_action_key: evidenceKey || null,
    };
  }
  if (requireLoaded && avail.code === "director_registry_stale") {
    return {
      ok: false,
      error: "director_registry_stale",
      requested_action_key: requested,
      executed_action_key: executed,
      evidence_action_key: evidenceKey || null,
    };
  }
  if (executed && requested && executed !== requested) {
    return {
      ok: false,
      error: INTEGRITY_ERRORS.identity,
      requested_action_key: requested,
      executed_action_key: executed,
      evidence_action_key: evidenceKey || null,
    };
  }
  if (evidenceKey && requested && evidenceKey !== requested) {
    return {
      ok: false,
      error: INTEGRITY_ERRORS.identity,
      requested_action_key: requested,
      executed_action_key: executed,
      evidence_action_key: evidenceKey,
    };
  }
  const payload = result || evidence || action?.result || null;
  if (payload) {
    const schema = validateGovernedResultSchema(requested, payload);
    if (!schema.ok) {
      return {
        ok: false,
        error: schema.error,
        detail: schema.detail,
        requested_action_key: requested,
        executed_action_key: executed,
        evidence_action_key: evidenceKey || null,
      };
    }
  }
  return {
    ok: true,
    requested_action_key: requested,
    executed_action_key: executed || requested,
    evidence_action_key: evidenceKey || requested,
  };
}

export function stampGovernedIdentity(result, {
  request = null,
  action = null,
  nowMs = Date.now(),
} = {}) {
  const def = getActionDefinition(keyOf(request) || keyOf(action));
  const identity = assertGovernedActionIdentity({ request, action, result, requireLoaded: false });
  const stamp = {
    ...(result && typeof result === "object" ? result : {}),
    request_id: request?.request_id || result?.request_id || null,
    action_key: identity.requested_action_key || keyOf(request) || keyOf(action),
    action_schema_version: def?.version || 1,
    executor_version: def?.version || 1,
    target: request?.target || action?.inputs?.databaseTarget || action?.inputs?.environment || result?.target || null,
    execution_id: action?.id || result?.execution_id || request?.trusted_host_action_id || null,
    result_schema: identity.ok
      ? (validateGovernedResultSchema(identity.requested_action_key, result).schema || null)
      : null,
    identity_checked_at: new Date(nowMs).toISOString(),
  };
  return stamp;
}

export function completionNotificationFor(rec, result = null) {
  const key = rec?.action_key;
  const payload = result || rec?.result || {};
  const label = rec?.title || key;
  if (key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    const n = payload.pull_request_number || rec?.inputs?.pull_request_number || rec?.inputs?.pullRequestNumber;
    const sha = String(payload.merge_sha || payload.staging_sha || "").slice(0, 12);
    return {
      title: `${label}`,
      body: n
        ? `PR #${n} merged to staging${sha ? ` at ${sha}` : ""}.`
        : "Pull request merged to staging.",
    };
  }
  if (key === ACTION_TYPES.DATABASE_READ_CENSUS) {
    const census = payload.census || payload;
    const orgs = census.org_count;
    return {
      title: `${label}`,
      body: orgs != null
        ? `Read-only census complete (${orgs} org${orgs === 1 ? "" : "s"}).`
        : "Read-only census complete.",
    };
  }
  if (key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING) {
    const status = payload.status || "unknown";
    const tests = payload.tests || {};
    return {
      title: `${label}`,
      body: `Staging certification ${status}`
        + (tests.passed != null
          ? ` · ${tests.passed} passed / ${tests.failed || 0} failed / ${tests.skipped || 0} skipped`
          : "")
        + ".",
    };
  }
  if (key === ACTION_TYPES.DATABASE_APPLY_MIGRATION || key === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER) {
    return {
      title: `${label}`,
      body: payload.detail || "Staging schema promotion finished.",
    };
  }
  if (key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) {
    return {
      title: `${label}`,
      body: "Staging certification principal is bound on the trusted host.",
    };
  }
  return {
    title: `${label}`,
    body: `${key} finished.`,
  };
}

export function continuationSummaryFor(rec, action = null) {
  const key = rec?.action_key;
  const result = action?.result || rec?.result || {};
  if (key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    return {
      ok: result.ok !== false,
      pull_request_number: result.pull_request_number || null,
      merge_sha: result.merge_sha || null,
      staging_sha: result.staging_sha || null,
      repository: result.repository || rec?.inputs?.repository || null,
      target_branch: result.target_branch || rec?.inputs?.target_branch || "staging",
    };
  }
  if (key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING) {
    return {
      ok: result.ok ?? null,
      status: result.status || null,
      environment: "staging",
      source_sha: result.source_sha || null,
      write_policy: result.write_policy || null,
      tests: result.tests || null,
      runtime: result.runtime || null,
      product_review: result.product_review || null,
      evidence_path: rec.result_ref || result.evidence_path || null,
    };
  }
  if (key === ACTION_TYPES.DATABASE_APPLY_MIGRATION || key === ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER) {
    return {
      ok: result.ok ?? null,
      environment: result.environment || rec.target,
      repaired: result.repaired || null,
      refused: result.refused || null,
      already: result.already || null,
      migrations: result.migrations || null,
    };
  }
  if (key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) {
    return {
      ok: result.ok ?? null,
      principal_id: result.principal_id || result.principal?.principal_id || null,
      principal_label: result.principal_label || result.principal?.principal_label || null,
    };
  }
  const census = result.census || {};
  const questions = census.questions && typeof census.questions === "object" ? census.questions : null;
  return {
    census_run_at: census.census_run_at || null,
    format: census.format || null,
    org_count: census.org_count ?? null,
    database: census.database || null,
    question_ids: census.question_ids || null,
    question_row_counts: questions
      ? Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, q?.row_count ?? null]))
      : null,
  };
}

export function classifyStoredGovernedCompletion(rec, action = null) {
  if (!rec || rec.status !== "complete") {
    return { ok: true, skipped: true, reason: rec?.status || "missing" };
  }
  const result = rec.result || action?.result || null;
  const identity = assertGovernedActionIdentity({
    request: rec,
    action: action || { actionType: rec.action_key, id: rec.trusted_host_action_id, result },
    result,
    evidence: result,
    requireLoaded: false,
  });
  if (!identity.ok) {
    return {
      ok: false,
      error: identity.error,
      reason: identity.error === INTEGRITY_ERRORS.unsupported
        ? "unsupported_action_execution / action identity mismatch"
        : (identity.detail || identity.error),
      request_id: rec.request_id,
      action_key: rec.action_key,
    };
  }
  if (rec.action_key === ACTION_TYPES.APPLICATION_CERTIFY_STAGING && !result?.action_key) {
    return {
      ok: false,
      error: INTEGRITY_ERRORS.identity,
      reason: "unsupported_action_execution / action identity mismatch",
      request_id: rec.request_id,
      action_key: rec.action_key,
    };
  }
  return { ok: true, request_id: rec.request_id, action_key: rec.action_key };
}

export function invalidateGovernedCompletion(rec, {
  reason = "unsupported_action_execution / action identity mismatch",
  nowMs = Date.now(),
} = {}) {
  rec.status = "invalidated";
  rec.integrity = {
    state: "invalidated",
    reason,
    at: new Date(nowMs).toISOString(),
  };
  rec.failure_code = rec.failure_code || INTEGRITY_ERRORS.identity;
  rec.failure_reason = reason;
  rec.updated_at = new Date(nowMs).toISOString();
  return rec;
}
