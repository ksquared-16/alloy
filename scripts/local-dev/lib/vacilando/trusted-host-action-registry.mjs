/**
 * Trusted Host Action registry — registered privileged host capabilities only.
 * No arbitrary shell.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReadOnlySql } from "./trusted-host-sql-readonly.mjs";
import { validateMergeInputs } from "./trusted-host-merge.mjs";
import { validatePushInputs } from "./trusted-host-push.mjs";
import { validateOpenPrInputs } from "./trusted-host-open-pr.mjs";
import { validateMigrationInputs } from "./trusted-host-migrate.mjs";
import { validateRestoreQaSessionInputs } from "./qa-session-restore-action.mjs";
import { validateProvisionQaIdentityInputs } from "./qa-identity-provision-action.mjs";
import { validateAssignQaAccessInputs } from "./qa-access-assign-action.mjs";
import {
  validateClosePullRequestInputs,
  validateDeleteRemoteBranchInputs,
} from "./trusted-host-repository-housekeeping.mjs";
import {
  validateProviderCeilingInputs, CEILING_MIN, CEILING_MAX, MANAGED_KEY as PROVIDER_CEILING_KEY,
} from "./trusted-host-provider-ceiling.mjs";
import { validateInstallToolkitInputs, CONVERGENCE_REF } from "./toolkit-convergence.mjs";

export const ACTION_TYPES = Object.freeze({
  DATABASE_READ_CENSUS: "database.read_census",
  REPOSITORY_MERGE_PULL_REQUEST: "repository.merge_pull_request",
  REPOSITORY_PUSH: "repository.push",
  PROMOTION_OPEN_PR: "promotion.open_pr",
  DATABASE_APPLY_MIGRATION: "database.apply_migration",
  ENVIRONMENT_RESTORE_QA_SESSION: "environment.restore_qa_session",
  ENVIRONMENT_PROVISION_QA_IDENTITY: "environment.provision_qa_identity",
  ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS: "environment.assign_qa_identity_access",
  REPOSITORY_CLOSE_PULL_REQUEST: "repository.close_pull_request",
  REPOSITORY_DELETE_REMOTE_BRANCH: "repository.delete_remote_branch",
  VACILANDO_APPLY_RECONCILIATION_PLAN: "vacilando.apply_reconciliation_plan",
  VACILANDO_RETIRE_WORKTREE: "vacilando.retire_worktree",
  CAPACITY_SET_PROVIDER_CEILING: "capacity.set_provider_ceiling",
  HOST_INSTALL_TOOLKIT: "host.install_toolkit",
});

const DEFAULT_TARGET = "alloy_deployed_primary";

function sha256(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

function findRepoRoot() {
  const fromEnv = process.env.VACILANDO_CHECKOUT || process.env.ALLOY_WORKTREE || process.env.ALLOY_REPO;
  if (fromEnv) {
    const root = String(fromEnv).replace(/\/scripts\/local-dev\/?$/, "");
    if (existsSync(join(root, "docs", "platform", "planning"))) return root;
  }
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "web", "package.json")) && existsSync(join(dir, "docs", "platform", "planning"))) {
      return dir;
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return join(process.cwd(), "..", "..");
}

function looksLikeRepoRoot(dir) {
  return existsSync(join(dir, "docs", "platform", "planning"));
}

function walkToRepoRoot(start) {
  let dir = String(start || "");
  if (!dir) return null;
  for (let i = 0; i < 10; i++) {
    if (looksLikeRepoRoot(dir)) {
      try { return realpathSync(dir); } catch { return dir; }
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Artifact root is the originating run/lane worktree, not Director cwd.
 * Walks up from a nested path (e.g. scripts/local-dev) to the repo root.
 */
export function resolveArtifactRoot(inputs = {}) {
  const candidates = [
    inputs.worktreePath,
    inputs.worktree_path,
    inputs.artifactRoot,
    inputs.artifact_root,
  ].filter(Boolean);
  for (const c of candidates) {
    const hit = walkToRepoRoot(c);
    if (hit) return hit;
  }
  return findRepoRoot();
}

export function resolvePathInsideWorktree(root, pathRel) {
  const rel = String(pathRel || "").trim();
  if (!rel) return { ok: false, code: "missing_query_artifact", detail: "queryArtifactPath required" };
  if (rel.includes("\0")) {
    return { ok: false, code: "path_escape", detail: "Artifact path escapes originating worktree" };
  }
  let rootReal;
  try { rootReal = realpathSync(root); } catch { rootReal = resolve(String(root)); }
  const joined = isAbsolute(rel) ? rel : join(rootReal, rel);
  const normalized = normalize(joined);
  let abs;
  try {
    abs = existsSync(normalized) ? realpathSync(normalized) : resolve(normalized);
  } catch {
    abs = resolve(normalized);
  }
  const relToRoot = relative(rootReal, abs);
  if (!relToRoot || relToRoot.startsWith("..") || isAbsolute(relToRoot)) {
    return { ok: false, code: "path_escape", detail: "Artifact path escapes originating worktree" };
  }
  return { ok: true, abs, root: rootReal, relative: relToRoot };
}

export function sqlFromCensusArtifact(raw, abs) {
  if (String(abs || "").endsWith(".json")) {
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    return j.combined_query || j.sql || j.query || null;
  }
  return String(raw || "");
}

/** Canonical Alloy checkout for trusted credentials (never the managed worker env). */
export function resolveCanonicalRepoRoot() {
  const candidates = [
    process.env.ALLOY_CANONICAL_ROOT,
    process.env.ALLOY_REPO,
    join(process.env.HOME || "", "Alloy"),
    "/Users/Kelly/Alloy",
    findRepoRoot(),
  ].filter(Boolean);
  for (const c of candidates) {
    const root = String(c).replace(/\/scripts\/local-dev\/?$/, "");
    if (existsSync(join(root, "web", ".env.local")) || existsSync(join(root, "web", "package.json"))) {
      return root;
    }
  }
  return "/Users/Kelly/Alloy";
}

export function resolveTrustedServerEnvSource() {
  if (process.env.ALLOY_SERVER_ENV_SOURCE && existsSync(process.env.ALLOY_SERVER_ENV_SOURCE)) {
    return process.env.ALLOY_SERVER_ENV_SOURCE;
  }
  const canonical = resolveCanonicalRepoRoot();
  return join(canonical, "web", ".env.local");
}

function defineDatabaseReadCensus() {
  return {
    actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
    version: 1,
    title: "Read-only deployed database census",
    requiredCapability: "trusted_host.database.read",
    riskClass: "privileged_read",
    timeoutMs: 180_000,
    retry: { maxAttempts: 2, backoffMs: 30_000, retryOn: ["connection_failed", "timeout"] },
    inputSchema: {
      required: ["queryArtifactPath", "expectedQueryHash", "databaseTarget"],
    },
    outputSchema: { resultJson: "object" },
    evidenceSchema: ["query_artifact", "query_hash", "validation_report", "result_json", "execution_audit"],
    validateInputs(inputs = {}) {
      const pathRel = inputs.queryArtifactPath || inputs.query_artifact_path;
      if (!pathRel) return { ok: false, code: "missing_query_artifact", detail: "queryArtifactPath required" };
      const root = resolveArtifactRoot(inputs);
      const inside = resolvePathInsideWorktree(root, pathRel);
      if (!inside.ok) return inside;
      const abs = inside.abs;
      if (!existsSync(abs)) {
        return { ok: false, code: "query_artifact_missing", detail: `Missing artifact: ${pathRel}` };
      }
      let sql;
      let expectedHash = inputs.expectedQueryHash || inputs.expected_query_hash;
      const raw = readFileSync(abs, "utf8");
      if (abs.endsWith(".json")) {
        const j = JSON.parse(raw);
        sql = j.combined_query || j.sql || j.query;
        if (!sql) return { ok: false, code: "json_missing_sql", detail: "JSON artifact has no combined_query" };
        if (!expectedHash && j.query_hash) expectedHash = j.query_hash;
        if (!expectedHash && j.combined_query_hash) expectedHash = j.combined_query_hash;
      } else {
        sql = raw;
      }
      const hash = sha256(sql);
      if (expectedHash && expectedHash !== hash) {
        return {
          ok: false,
          code: "query_hash_mismatch",
          detail: "Committed query hash does not match artifact contents.",
          expectedHash,
          actualHash: hash,
        };
      }
      const target = inputs.databaseTarget || inputs.database_target || DEFAULT_TARGET;
      if (target !== DEFAULT_TARGET && target !== "alloy_deployed_primary") {
        return { ok: false, code: "wrong_database_target", detail: `Unsupported target: ${target}` };
      }
      const v = validateReadOnlySql(sql);
      if (!v.ok) return v;
      return {
        ok: true,
        normalized: {
          queryArtifactPath: pathRel,
          queryArtifactAbsolute: abs,
          artifactRoot: inside.root,
          worktreePath: inside.root,
          sql,
          queryHash: hash,
          databaseTarget: DEFAULT_TARGET,
          timeoutMs: Number(inputs.timeoutMs || inputs.timeout || 180_000),
          validation: v,
        },
      };
    },
  };
}

function defineRepositoryMergePullRequest() {
  return {
    actionType: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    version: 1,
    title: "Merge pull request into staging",
    requiredCapability: "trusted_host.repository.merge",
    riskClass: "privileged_write",
    timeoutMs: 180_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["repository", "pullRequestNumber", "targetBranch", "expectedHeadSha", "mergeMethod"],
    },
    outputSchema: { mergeSha: "string", stagingSha: "string" },
    evidenceSchema: ["pull_request", "expected_head_sha", "checks", "merge_sha", "execution_audit"],
    validateInputs(inputs = {}) {
      const v = validateMergeInputs(inputs);
      if (!v.ok) return v;
      return { ok: true, normalized: v.normalized };
    },
  };
}

function defineRepositoryPush() {
  return {
    actionType: ACTION_TYPES.REPOSITORY_PUSH,
    version: 1,
    title: "Push a reviewed branch to the remote",
    requiredCapability: "trusted_host.repository.push",
    riskClass: "privileged_write",
    timeoutMs: 180_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["repository", "branch", "expectedHeadSha", "worktreePath"],
    },
    outputSchema: { pushedSha: "string", remoteRef: "string" },
    evidenceSchema: ["repository", "branch", "expected_head_sha", "remote_ref", "execution_audit"],
    validateInputs(inputs = {}) {
      const v = validatePushInputs({
        ...inputs,
        worktree_path: inputs.worktree_path || inputs.worktreePath,
      });
      if (!v.ok) return v;
      return { ok: true, normalized: v.normalized };
    },
  };
}

function definePromotionOpenPr() {
  return {
    actionType: ACTION_TYPES.PROMOTION_OPEN_PR,
    version: 1,
    title: "Open a promotion pull request into staging",
    requiredCapability: "trusted_host.promotion.open_pr",
    riskClass: "privileged_write",
    timeoutMs: 120_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["repository", "base", "headBranch", "expectedHeadSha", "title"],
    },
    outputSchema: { pullRequestNumber: "number", url: "string" },
    evidenceSchema: ["repository", "base", "head_branch", "expected_head_sha", "pull_request", "execution_audit"],
    validateInputs(inputs = {}) {
      const v = validateOpenPrInputs(inputs);
      if (!v.ok) return v;
      return { ok: true, normalized: v.normalized };
    },
  };
}


function defineRetireWorktree() {
  return {
    actionType: ACTION_TYPES.VACILANDO_RETIRE_WORKTREE,
    version: 1,
    title: "Retire a Vacilando worktree through Git",
    requiredCapability: "trusted_host.vacilando.retire_worktree",
    riskClass: "privileged_write",
    timeoutMs: 120_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["repository", "worktree", "branch", "headSha", "safetyFingerprint", "s7State"],
    },
    outputSchema: { applied: "array", postconditions: "object" },
    evidenceSchema: ["worktree", "branch", "head_sha", "safety_fingerprint", "gates", "execution_audit"],
    validateInputs(inputs = {}) {
      const worktree = String(inputs.worktree || "").trim();
      const branch = String(inputs.branch || "").trim();
      const headSha = String(inputs.headSha || "").trim();
      const fingerprint = String(inputs.safetyFingerprint || "").trim();
      if (!String(inputs.repository || "").trim()) return { ok: false, code: "missing_repository" };
      if (!worktree) return { ok: false, code: "missing_worktree" };
      if (worktree.includes("/") || worktree.includes("..")) return { ok: false, code: "invalid_worktree_identity" };
      if (!branch) return { ok: false, code: "missing_branch" };
      // An abbreviated SHA once passed every local check and died inside the
      // provider. Bind on the full object name or not at all.
      if (!/^[0-9a-f]{40}$/.test(headSha)) return { ok: false, code: "invalid_head_sha" };
      if (!/^[0-9a-f]{32}$/.test(fingerprint)) return { ok: false, code: "invalid_safety_fingerprint" };
      if (!String(inputs.s7State || "").trim()) return { ok: false, code: "missing_s7_state" };
      // Branch deletion is a different action with a different blast radius. A
      // retirement request that also asks to delete a branch is malformed, not
      // convenient.
      if (inputs.deleteBranch != null || inputs.deleteRemoteBranch != null) {
        return { ok: false, code: "branch_deletion_is_a_separate_action" };
      }
      return {
        ok: true,
        normalized: {
          repository: String(inputs.repository).trim(),
          worktree, branch, headSha, safetyFingerprint: fingerprint,
          s7State: String(inputs.s7State).trim(),
          worktreeParent: inputs.worktreeParent || null,
          canonicalRoot: inputs.canonicalRoot || null,
          requestingWorktree: inputs.requestingWorktree || null,
          // Normalisation DROPS anything it does not name. Omitting this sent
          // the executor to its runtimeRoot() fallback, which is where the
          // undefined helper above was hiding.
          runtimeRoot: inputs.runtimeRoot || null,
        },
      };
    },
  };
}

function defineApplyReconciliationPlan() {
  return {
    actionType: ACTION_TYPES.VACILANDO_APPLY_RECONCILIATION_PLAN,
    version: 1,
    title: "Apply safe Vacilando reconciliation metadata corrections",
    requiredCapability: "trusted_host.vacilando.apply_reconciliation_plan",
    riskClass: "privileged_write",
    timeoutMs: 120_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["planId", "planFingerprint", "generatedAt", "policyVersion", "corrections"],
    },
    outputSchema: { applied: "array", skipped: "array", withheld: "array" },
    evidenceSchema: ["plan_id", "plan_fingerprint", "corrections", "withheld", "execution_audit"],
    validateInputs(inputs = {}) {
      const planId = String(inputs.planId || "").trim();
      const fingerprint = String(inputs.planFingerprint || "").trim();
      const corrections = Array.isArray(inputs.corrections) ? inputs.corrections : null;
      const withheld = Array.isArray(inputs.withheld) ? inputs.withheld : [];
      if (!planId) return { ok: false, code: "missing_plan_id" };
      if (!/^[0-9a-f]{32}$/.test(fingerprint)) return { ok: false, code: "invalid_plan_fingerprint" };
      if (!corrections) return { ok: false, code: "missing_corrections" };
      if (!String(inputs.policyVersion || "").trim()) return { ok: false, code: "missing_policy_version" };
      if (!String(inputs.generatedAt || "").trim()) return { ok: false, code: "missing_generated_at" };
      // The executor recomputes the plan itself; an ad hoc correction list
      // supplied by a caller must never be executable, so the fingerprint is
      // required and re-derived downstream.
      return {
        ok: true,
        normalized: {
          planId, planFingerprint: fingerprint, generatedAt: String(inputs.generatedAt),
          policyVersion: String(inputs.policyVersion), corrections, withheld,
          runtimeRoot: inputs.runtimeRoot || null,
          dedupeKey: `reconcile:${planId}#${fingerprint.slice(0, 12)}`,
        },
      };
    },
  };
}

function defineRepositoryClosePullRequest() {
  return {
    actionType: ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST,
    version: 1,
    title: "Close a disposable pull request without merging",
    requiredCapability: "trusted_host.repository.close_pull_request",
    riskClass: "privileged_write",
    timeoutMs: 60_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["repository", "pullRequestNumber", "expectedHeadBranch", "expectedHeadSha"],
    },
    outputSchema: { pullRequestNumber: "number", state: "string", merged: "boolean" },
    evidenceSchema: ["repository", "pull_request", "expected_head_sha", "state_before", "state_after", "execution_audit"],
    validateInputs(inputs = {}) {
      const v = validateClosePullRequestInputs(inputs);
      if (!v.ok) return v;
      return { ok: true, normalized: v.normalized };
    },
  };
}

function defineRepositoryDeleteRemoteBranch() {
  return {
    actionType: ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH,
    version: 1,
    title: "Delete a disposable remote branch",
    requiredCapability: "trusted_host.repository.delete_remote_branch",
    riskClass: "privileged_write",
    timeoutMs: 60_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["repository", "branch", "expectedHeadSha"],
    },
    outputSchema: { branch: "string", deleted: "boolean" },
    evidenceSchema: ["repository", "branch", "expected_head_sha", "remote_head_sha", "dependents", "execution_audit"],
    validateInputs(inputs = {}) {
      const v = validateDeleteRemoteBranchInputs(inputs);
      if (!v.ok) return v;
      return { ok: true, normalized: v.normalized };
    },
  };
}

/**
 * Move the provider ceiling — and nothing else.
 *
 * The predecessor of this action was "let the agent edit a host config file",
 * which the permission boundary refused, correctly: that capability reaches
 * every setting on the machine and records nothing about why a number moved.
 * The effect below is small enough to be read in one sentence and therefore
 * small enough to be approved or refused on its merits.
 *
 * The managed key is NOT an input. As a parameter this becomes a general host
 * config writer wearing a narrow name, and the whole distinction that makes it
 * approvable collapses.
 */
function defineCapacitySetProviderCeiling() {
  return {
    actionType: ACTION_TYPES.CAPACITY_SET_PROVIDER_CEILING,
    version: 1,
    title: `Move ${PROVIDER_CEILING_KEY} within ${CEILING_MIN}-${CEILING_MAX}`,
    requiredCapability: "trusted_host.capacity.set_provider_ceiling",
    riskClass: "privileged_write",
    timeoutMs: 60_000,
    // Never retried. A compare-and-set that failed because the live value moved
    // must be re-measured by the caller, not re-attempted against a prediction
    // already known to be stale.
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["expected_ceiling", "requested_ceiling", "rollback_ceiling", "reason"],
    },
    outputSchema: { key: "string", previous_value: "number", new_value: "number", readback_verified: "boolean" },
    evidenceSchema: [
      "key", "expected_ceiling", "requested_ceiling", "rollback_ceiling",
      "previous_value", "new_value", "readback_verified", "execution_audit",
    ],
    validateInputs(inputs = {}) {
      return validateProviderCeilingInputs(inputs);
    },
  };
}

/**
 * Converge the installed toolkit onto promoted staging.
 *
 * The ref is NOT an input. As a parameter this becomes "install any commit
 * onto this host", which is a far larger capability wearing a narrow name —
 * the same trap the provider ceiling avoided by refusing to accept its key.
 *
 * Not retried. A compare-and-set that failed because staging moved must be
 * re-measured by the caller; re-attempting against a prediction already known
 * to be stale is how a host ends up running a commit nobody chose.
 */
function defineHostInstallToolkit() {
  return {
    actionType: ACTION_TYPES.HOST_INSTALL_TOOLKIT,
    version: 1,
    title: `Install the promoted ${CONVERGENCE_REF} toolkit`,
    requiredCapability: "trusted_host.host.install_toolkit",
    riskClass: "privileged_write",
    timeoutMs: 300_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["expected_staging_sha", "reason"],
    },
    outputSchema: {
      installed_sha: "string", previous_sha: "string",
      already_converged: "boolean", readback_verified: "boolean",
    },
    evidenceSchema: [
      "installed_toolkit_sha", "promoted_staging_sha", "toolkit_drift",
      "artifact_provenance_valid", "previous_toolkit_retained",
      "gateway_restart_bounded", "execution_audit",
    ],
    validateInputs(inputs = {}) {
      return validateInstallToolkitInputs(inputs);
    },
  };
}

function defineDatabaseApplyMigration() {
  return {
    actionType: ACTION_TYPES.DATABASE_APPLY_MIGRATION,
    version: 1,
    title: "Apply committed staging migration",
    requiredCapability: "trusted_host.database.migrate",
    riskClass: "privileged_write",
    timeoutMs: 300_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["environment", "expectedSha", "migrations"],
    },
    outputSchema: { environment: "string", migrations: "array" },
    evidenceSchema: ["migration_path", "expected_sha", "ledger", "execution_audit"],
    validateInputs(inputs = {}) {
      const v = validateMigrationInputs(inputs, {
        repoRoot: inputs.worktreePath || inputs.worktree_path || inputs.artifactRoot,
      });
      if (!v.ok) return v;
      return { ok: true, normalized: v.normalized };
    },
  };
}

/**
 * Restore a managed slot's QA browser session.
 *
 * The request carries a lane id and nothing else. Slot, worktree, port, base URL, Supabase project,
 * storage path and the QA identity are all resolved by the trusted executor from the canonical
 * registries, so there is no input through which a caller could aim this at another identity, tenant
 * or host. It always requires an operator grant: this is a service-role action, and an agent that
 * could approve its own is not governed at all.
 */
function defineEnvironmentRestoreQaSession() {
  return {
    actionType: ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION,
    version: 1,
    title: "Restore a managed slot's QA browser session",
    requiredCapability: "trusted_host.environment.restore_qa_session",
    riskClass: "privileged_write",
    alwaysRequiresOperatorApproval: true,
    timeoutMs: 240_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: { required: ["laneId"] },
    outputSchema: { status: "string", verified: "boolean", verified_at: "string" },
    evidenceSchema: ["lane_id", "slot", "registered_identity", "storage_written", "verified", "execution_audit"],
    validateInputs(inputs = {}) {
      return validateRestoreQaSessionInputs(inputs);
    },
  };
}

/**
 * Provision the managed QA identity a slot is registered to.
 *
 * Separate from the restore on purpose: creating an account and signing into one are different
 * decisions, so they get different approvals. Restoration must never quietly create a user.
 */
function defineEnvironmentProvisionQaIdentity() {
  return {
    actionType: ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY,
    version: 1,
    title: "Provision a managed QA identity for a registered slot",
    requiredCapability: "trusted_host.environment.provision_qa_identity",
    riskClass: "privileged_write",
    alwaysRequiresOperatorApproval: true,
    timeoutMs: 180_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: { required: ["laneId"] },
    outputSchema: { status: "string", mutated: "boolean", occurrences: "number" },
    evidenceSchema: ["lane_id", "slot", "registered_identity", "mutated", "occurrences", "execution_audit"],
    validateInputs(inputs = {}) {
      return validateProvisionQaIdentityInputs(inputs);
    },
  };
}

/**
 * Grant a managed QA identity its application access.
 *
 * Separate from provisioning: creating an account and granting it a place in the application are
 * different decisions, and collapsing them would let one approval imply another.
 */
function defineEnvironmentAssignQaIdentityAccess() {
  return {
    actionType: ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS,
    version: 1,
    title: "Assign staging application access to a managed QA identity",
    requiredCapability: "trusted_host.environment.assign_qa_identity_access",
    riskClass: "privileged_write",
    alwaysRequiresOperatorApproval: true,
    timeoutMs: 120_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: { required: ["laneId"] },
    outputSchema: { status: "string", org_id: "string", role: "string" },
    evidenceSchema: ["lane_id", "slot", "registered_identity", "user_id", "org_id", "role", "execution_audit"],
    validateInputs(inputs = {}) {
      return validateAssignQaAccessInputs(inputs);
    },
  };
}

const REGISTRY = new Map([
  [ACTION_TYPES.DATABASE_READ_CENSUS, defineDatabaseReadCensus()],
  [ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION, defineEnvironmentRestoreQaSession()],
  [ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY, defineEnvironmentProvisionQaIdentity()],
  [ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS, defineEnvironmentAssignQaIdentityAccess()],
  [ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST, defineRepositoryMergePullRequest()],
  [ACTION_TYPES.REPOSITORY_PUSH, defineRepositoryPush()],
  [ACTION_TYPES.PROMOTION_OPEN_PR, definePromotionOpenPr()],
  [ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST, defineRepositoryClosePullRequest()],
  [ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH, defineRepositoryDeleteRemoteBranch()],
  [ACTION_TYPES.VACILANDO_APPLY_RECONCILIATION_PLAN, defineApplyReconciliationPlan()],
  [ACTION_TYPES.VACILANDO_RETIRE_WORKTREE, defineRetireWorktree()],
  [ACTION_TYPES.DATABASE_APPLY_MIGRATION, defineDatabaseApplyMigration()],
  [ACTION_TYPES.CAPACITY_SET_PROVIDER_CEILING, defineCapacitySetProviderCeiling()],
  [ACTION_TYPES.HOST_INSTALL_TOOLKIT, defineHostInstallToolkit()],
]);

export function listRegisteredActions() {
  return [...REGISTRY.values()].map((a) => ({
    actionType: a.actionType,
    version: a.version,
    title: a.title,
    riskClass: a.riskClass,
    requiredCapability: a.requiredCapability,
    // Surfaced so a lane discovering an action also learns what it must supply.
    // Without this, discovery tells you an action exists and nothing about how
    // to propose it, and the next thing you see is a validation refusal.
    requiredInputs: a.inputSchema?.required || [],
  }));
}

export function getActionDefinition(actionType) {
  if (loadedOverride && !loadedOverride.actionKeys.includes(actionType)) return null;
  return REGISTRY.get(actionType) || null;
}

const REGISTRY_FILE = fileURLToPath(import.meta.url);
const PROCESS_STARTED_AT = new Date().toISOString();
const PROCESS_STARTED_MS = Date.now();
const SOURCE_AT_LOAD = (() => {
  try { return readFileSync(REGISTRY_FILE, "utf8"); } catch { return ""; }
})();
const SOURCE_HASH_AT_LOAD = sha256(SOURCE_AT_LOAD).slice(0, 16);

let loadedOverride = null;

function parseActionKeysFromSource(src) {
  const text = String(src || "");
  const block = text.match(/export const ACTION_TYPES = Object\.freeze\(\{([\s\S]*?)\}\);/)
    || text.match(/export const ACTION_TYPES = Object\.freeze\(\{([\s\S]*?)\}\);/);
  if (!block) return [];
  return [...block[1].matchAll(/:\s*"([a-z][a-z0-9_.]+)"/g)].map((m) => m[1]);
}

export function registryFilePath() {
  return REGISTRY_FILE;
}

export function readDiskActionKeys(filePath = REGISTRY_FILE) {
  try {
    return parseActionKeysFromSource(readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

export function loadedActionKeys() {
  if (loadedOverride?.actionKeys) return [...loadedOverride.actionKeys];
  return [...REGISTRY.keys()];
}

function fingerprintForKeys(keys, extra = "") {
  const payload = `${[...keys].sort().join("\n")}\n${extra}`;
  return sha256(payload).slice(0, 16);
}

export function diskRegistrySnapshot(filePath = REGISTRY_FILE) {
  let source = "";
  try { source = readFileSync(filePath, "utf8"); } catch { source = ""; }
  const actionKeys = parseActionKeysFromSource(source);
  return {
    fingerprint: fingerprintForKeys(actionKeys),
    sourceHash: sha256(source).slice(0, 16),
    actionKeys,
    sourcePath: filePath,
  };
}

export function loadedRegistrySnapshot() {
  const actionKeys = loadedActionKeys();
  if (loadedOverride) {
    return {
      fingerprint: loadedOverride.fingerprint || fingerprintForKeys(actionKeys),
      actionKeys,
      loadedAt: loadedOverride.loadedAt || PROCESS_STARTED_AT,
      startedAt: PROCESS_STARTED_AT,
      startedMs: PROCESS_STARTED_MS,
    };
  }
  return {
    fingerprint: fingerprintForKeys(actionKeys),
    sourceHash: SOURCE_HASH_AT_LOAD,
    actionKeys,
    loadedAt: PROCESS_STARTED_AT,
    startedAt: PROCESS_STARTED_AT,
    startedMs: PROCESS_STARTED_MS,
  };
}

/**
 * Distinguish a genuinely unknown action from a Director process that
 * started before the current on-disk registry.
 */
export function classifyActionAvailability(actionKey) {
  const key = String(actionKey || "").trim();
  const loaded = loadedActionKeys();
  const disk = loadedOverride?.diskKeys || readDiskActionKeys();
  if (loaded.includes(key)) {
    return { code: "available", actionKey: key, loaded: true, onDisk: disk.includes(key) };
  }
  if (disk.includes(key)) {
    return { code: "director_registry_stale", actionKey: key, loaded: false, onDisk: true };
  }
  return { code: "unsupported_action_key", actionKey: key, loaded: false, onDisk: false };
}

export function directorRegistryFreshness() {
  const loaded = loadedRegistrySnapshot();
  if (loadedOverride?.diskKeys) {
    const diskKeys = loadedOverride.diskKeys;
    const missingFromLoaded = diskKeys.filter((k) => !loaded.actionKeys.includes(k));
    return {
      stale: missingFromLoaded.length > 0,
      loaded,
      disk: { fingerprint: fingerprintForKeys(diskKeys), actionKeys: diskKeys, sourcePath: REGISTRY_FILE },
      missingFromLoaded,
      processStartedAt: PROCESS_STARTED_AT,
      processAgeMs: Date.now() - PROCESS_STARTED_MS,
    };
  }
  const disk = diskRegistrySnapshot();
  const missingFromLoaded = disk.actionKeys.filter((k) => !loaded.actionKeys.includes(k));
  const sourceChanged = Boolean(disk.sourceHash) && disk.sourceHash !== SOURCE_HASH_AT_LOAD;
  return {
    stale: missingFromLoaded.length > 0 || sourceChanged,
    loaded,
    disk,
    missingFromLoaded,
    processStartedAt: PROCESS_STARTED_AT,
    processAgeMs: Date.now() - PROCESS_STARTED_MS,
  };
}

export function setLoadedRegistryForTests(partial = null) {
  loadedOverride = partial
    ? {
      actionKeys: [...(partial.actionKeys || [])],
      diskKeys: partial.diskKeys ? [...partial.diskKeys] : null,
      fingerprint: partial.fingerprint || fingerprintForKeys(partial.actionKeys || []),
      loadedAt: partial.loadedAt || new Date().toISOString(),
    }
    : null;
  return loadedRegistrySnapshot();
}

export function hashSql(sql) {
  return sha256(sql);
}

export { DEFAULT_TARGET, findRepoRoot };
