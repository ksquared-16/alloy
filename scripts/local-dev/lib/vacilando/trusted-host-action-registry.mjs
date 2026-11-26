/**
 * Trusted Host Action registry — registered privileged host capabilities only.
 * No arbitrary shell.
 */
import { createHash } from "node:crypto";
import { resolveReconciliationRequest } from "./reconciliation-registry.mjs";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReadOnlySql } from "./trusted-host-sql-readonly.mjs";
import { ALLOY_REPOSITORY_ID, environmentSourceFor, getRepository as getRepositoryRecord } from "./repository-registry.mjs";
import { validateMergeInputs } from "./trusted-host-merge.mjs";
import { validatePushInputs } from "./trusted-host-push.mjs";
import { validateRepositoryMetadataInputs } from "./trusted-host-repository-metadata.mjs";
import { validateOpenPrInputs } from "./trusted-host-open-pr.mjs";
import { validateProductionMigrationInputs } from "./trusted-host-production-migrate.mjs";
import { validateLedgerRepairInputs } from "./trusted-host-ledger-repair.mjs";
import { validateMigrationInputs, validateMigrationRequestCore } from "./trusted-host-migrate.mjs";
import { validateRestoreDeployedQaSessionInputs } from "./deployed-qa-session-restore-action.mjs";
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
import { ALLOWED_ENVIRONMENTS } from "./trusted-host-migrate.mjs";
import { validateLaneDispatchInputs, DISPATCH_PURPOSES } from "./lane-dispatch.mjs";
import { validateRegisterDeveloperApplicationInputs } from "./trusted-host-register-application.mjs";

export const ACTION_TYPES = Object.freeze({
  DATABASE_READ_CENSUS: "database.read_census",
  REPOSITORY_MERGE_PULL_REQUEST: "repository.merge_pull_request",
  REPOSITORY_PUSH: "repository.push",
  PROMOTION_OPEN_PR: "promotion.open_pr",
  DATABASE_APPLY_MIGRATION: "database.apply_migration",
  DATABASE_APPLY_PROMOTED_MIGRATION: "database.apply_promoted_migration",
  DATABASE_REPAIR_MIGRATION_LEDGER: "database.repair_migration_ledger",
  REPOSITORY_PROMOTE_METADATA: "repository.promote_metadata",
  ENVIRONMENT_RESTORE_QA_SESSION: "environment.restore_qa_session",
  ENVIRONMENT_RESTORE_DEPLOYED_QA_SESSION: "environment.restore_deployed_qa_session",
  ENVIRONMENT_PROVISION_QA_IDENTITY: "environment.provision_qa_identity",
  ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS: "environment.assign_qa_identity_access",
  REPOSITORY_CLOSE_PULL_REQUEST: "repository.close_pull_request",
  REPOSITORY_DELETE_REMOTE_BRANCH: "repository.delete_remote_branch",
  VACILANDO_APPLY_RECONCILIATION_PLAN: "vacilando.apply_reconciliation_plan",
  REPOSITORY_TRANSFER_FILES: "repository.transfer_files",
  VACILANDO_RETIRE_WORKTREE: "vacilando.retire_worktree",
  CAPACITY_SET_PROVIDER_CEILING: "capacity.set_provider_ceiling",
  HOST_INSTALL_TOOLKIT: "host.install_toolkit",
  LANE_DISPATCH_MEASUREMENT_INSTRUCTION: "lane.dispatch_measurement_instruction",
  ENVIRONMENT_EXECUTE_REGISTERED_RECONCILIATION: "environment.execute_registered_reconciliation",
  PLATFORM_REGISTER_DEVELOPER_APPLICATION: "platform.register_developer_application",
});

/**
 * Actions whose EXECUTION consumes a persisted artifact reference.
 *
 * Declared in one place so a structural control can prove no artifact-bearing
 * action is registered without it, which is the defect class this closes: a
 * filer writing one field and an executor reading another, with nothing in
 * between that could notice.
 */
export function artifactContractFor(def) {
  if (!def || def.requiresArtifactRef !== true) return null;
  const keys = Array.isArray(def.artifactInputKeys) && def.artifactInputKeys.length
    ? def.artifactInputKeys.map(String)
    : [];
  return keys.length ? { actionType: def.actionType, inputKeys: keys } : null;
}

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
  /*
   * THE REGISTERED PROJECT IS ASKED FIRST.
   *
   * This resolved Alloy by guessing: two environment variables, then
   * ~/Alloy, then a literal /Users/Kelly/Alloy, then whatever repository the
   * process happened to start in. Every one of those is a machine-shaped
   * assumption about ONE project, sitting in generic runtime, and the literal
   * is another person's home directory.
   *
   * The registry is the authority on where a project lives, so it answers
   * first. The old candidates remain BELOW it, unchanged: an unseeded registry
   * on a fresh host must still resolve, and S0 changes ownership rather than
   * behaviour.
   */
  let registered = null;
  try {
    const rec = getRepositoryRecord(ALLOY_REPOSITORY_ID);
    registered = rec?.root || null;
  } catch { registered = null; }
  /*
   * S3: THE PERSON-SPECIFIC LITERAL IS GONE.
   *
   * `/Users/Kelly/Alloy` sat in this list and was also the final `return` --
   * another operator's home directory, in generic runtime, as the answer of
   * last resort. S0 put the registry above it and left it below; the registry
   * now holds Alloy's real root on this host and on every seeded host, so the
   * guess has nothing left to do that is not a guess about somebody else's
   * filesystem.
   *
   * `~/Alloy` stays: it is THIS operator's home, and an unseeded host must
   * still resolve. What is removed is the part that could only ever be right
   * for one person.
   */
  const candidates = [
    process.env.ALLOY_CANONICAL_ROOT,
    process.env.ALLOY_REPO,
    registered,
    join(process.env.HOME || "", "Alloy"),
    findRepoRoot(),
  ].filter(Boolean);
  for (const c of candidates) {
    const root = String(c).replace(/\/scripts\/local-dev\/?$/, "");
    if (existsSync(join(root, "web", ".env.local")) || existsSync(join(root, "web", "package.json"))) {
      return root;
    }
  }
  /*
   * FAIL CLOSED RATHER THAN NAME A STRANGER'S DIRECTORY. Returning a path that
   * exists on nobody's machine made every downstream read fail somewhere far
   * from here, with a message about a missing file rather than about an
   * unresolvable project. The registry is the authority; when it and every
   * candidate come up empty there is no canonical root, and saying so is the
   * honest answer.
   */
  return null;
}

/**
 * The server environment file belonging to ONE project, or null.
 *
 * This is the generic form, and the one new code should call. It asks the
 * registry where the project lives and what its profile says its environment
 * file is, and answers NULL when the project has neither. A repository-only
 * project has no credentials, and a path that does not exist is a worse answer
 * than no path: it sends a consumer looking for a file, finding none, and
 * falling through to whatever the next candidate happens to be — which is how
 * every project ended up sharing Alloy's.
 */
export function projectEnvSource(repositoryId) {
  let rec = null;
  try { rec = getRepositoryRecord(repositoryId); } catch { rec = null; }
  if (!rec) return null;
  return environmentSourceFor(rec) || null;
}

/**
 * Alloy's server environment file, for the trusted host's own credentials.
 *
 * WHAT CHANGED IS THE OWNER, NOT THE VALUE. This resolved by reading
 * `ALLOY_SERVER_ENV_SOURCE` and otherwise guessing a canonical root; the
 * project record now answers first, and the guess chain remains below it so an
 * unseeded host still resolves exactly as it did.
 *
 * `ALLOY_SERVER_ENV_SOURCE` IS DEPRECATED. It is kept as a per-host override
 * for an operator who has already set it, and it is NOT generic runtime
 * authority any more: it can only ever name Alloy's file, because only this
 * Alloy-specific function reads it. Its removal belongs with the rest of the
 * `ALLOY_`-prefixed runtime variables in **S3**, alongside `ALLOY_RUNTIME_ROOT`
 * and the `/Users/Kelly/Alloy` fallbacks — a project with an environment gets
 * it from `projectEnvSource` before then.
 *
 * @deprecated-input ALLOY_SERVER_ENV_SOURCE — removal assigned to S3.
 */
export function resolveTrustedServerEnvSource() {
  if (process.env.ALLOY_SERVER_ENV_SOURCE && existsSync(process.env.ALLOY_SERVER_ENV_SOURCE)) {
    return process.env.ALLOY_SERVER_ENV_SOURCE;
  }
  const registered = projectEnvSource(ALLOY_REPOSITORY_ID);
  if (registered && existsSync(registered)) return registered;
  // S3: the canonical root may now be null rather than a stranger's directory,
  // so there is a case with no answer. Null propagates instead of throwing on
  // join(null, ...), and a caller with no env source refuses where it reads.
  const canonical = resolveCanonicalRepoRoot();
  return canonical ? join(canonical, "web", ".env.local") : null;
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
    /*
     * THE FIELD THE EXECUTOR ACTUALLY READS, DECLARED.
     *
     * `executeGovernedAction` resolves this action's query with
     * `artifactPathFrom(rec.artifact_refs)` — the PERSISTED refs, never
     * `inputs.queryArtifactPath`. Before this declaration nothing connected the
     * two, so a request could be filed with a perfectly good
     * `inputs.queryArtifactPath` and empty `artifact_refs`, and be refused with
     * "queryArtifactPath required" — naming the one field the filer had in fact
     * supplied.
     *
     * `artifactInputKeys` are the spellings a caller may use; the filer
     * normalises whichever it finds into `artifact_refs` before the request is
     * persisted, so filing and execution can never read different fields.
     */
    requiresArtifactRef: true,
    artifactInputKeys: ["queryArtifactPath", "query_artifact_path"],
    /*
     * THE CONTEXT THAT AUTHORISES REUSE IS THE QUERY ITSELF.
     *
     * A census is a measurement at a time, which is why its repeatability is
     * CONTEXT_DEPENDENT rather than simply reusable: a before/after comparison
     * genuinely needs two. But the dedupe match that reaches this point already
     * required an identical `queryHash` — the same question, asked again, in
     * the same run. That is a retry, and the answer keeps.
     *
     * Declared here rather than assumed in the classification, so the reason
     * lives with the action that knows it.
     */
    reuseAuthorized: () => true,
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
      // THE DATABASE IS NAMED, NEVER ASSUMED.
      //
      // This fell back to DEFAULT_TARGET, so a census that named no database
      // still ran — against the deployed primary. Only one target is supported
      // today, which is exactly why the default looked harmless: the moment a
      // second one exists, silence would pick the privileged one. A privileged
      // read must say what it is reading.
      const target = inputs.databaseTarget || inputs.database_target;
      if (!target) {
        return { ok: false, code: "missing_database_target", detail: "databaseTarget required" };
      }
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
      // base_ref and expected_commits are advertised as required so a lane
      // reading `--contract repository.push` is told what a candidate must
      // declare, rather than discovering it from a refusal.
      required: ["repository", "branch", "expectedHeadSha", "worktreePath", "base_ref", "expected_commits"],
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
    /*
     * THIS ACTION REMOVES SOMETHING.
     *
     * Declared, so the framework can refuse to replay a finished one that
     * cannot say what it acted on, and so a control can ask the registry which
     * actions carry that weight instead of inferring it from a title.
     * `riskClass: privileged_write` is shared with every action that writes a
     * row; deleting a checkout is not the same kind of write.
     */
    destructive: true,
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
          /*
           * THE SEMANTIC IDENTITY OF ONE RETIREMENT.
           *
           * Without this the dedupe predicate in requestTrustedHostAction
           * collapsed to `undefined === undefined`, and sameActionOwnership
           * compares only session, assignment and lane — never the worktree. So
           * ANY completed retirement satisfied ANY later retirement request.
           *
           * MEASURED 2026-09-13: thirteen retirements, thirteen distinct content
           * fingerprints, two trusted-host actions. Eleven requests returned
           * wt-branch-fix's result verbatim — including
           * `filesystem_path_absent: true` — for worktrees still on disk.
           *
           * Keyed the way `apply_reconciliation_plan` is: the thing being acted
           * on, plus the content the decision was made against. A different
           * worktree, a moved branch or a restated safety fingerprint is a
           * different retirement and gets its own action. Only an identical
           * re-request of the same intent may dedupe.
           */
          dedupeKey: `retire_worktree:${worktree}@${headSha.slice(0, 12)}#${fingerprint.slice(0, 12)}`,
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

/**
 * EXECUTE A REGISTERED RECONCILIATION — a key, an environment, and a boolean.
 *
 * Deliberately NOT a script runner. `vacilando.apply_reconciliation_plan` is the neighbouring
 * capability and is a different thing entirely: it applies Vacilando METADATA corrections from a
 * plan the executor recomputes. Using it to move children between enrollment stages would launder
 * product data through a governance capability, so this is its own registration with its own
 * capability, its own approval, and its own allowlist.
 *
 * The caller cannot express a command. There is no path input, no shell string, no executable and
 * no environment variables: which script runs, which environments it may touch and what a dry run
 * means are all resolved from `reconciliation-registry.mjs`, a frozen table reviewed like any other
 * promoted code. `dry_run` is REQUIRED and not defaulted — a missing boolean on an apply-capable
 * capability is the one ambiguity that could turn a look into a write.
 */
function defineEnvironmentExecuteRegisteredReconciliation() {
  return {
    actionType: ACTION_TYPES.ENVIRONMENT_EXECUTE_REGISTERED_RECONCILIATION,
    version: 1,
    title: "Execute a registered reconciliation against a permitted environment",
    requiredCapability: "trusted_host.environment.execute_registered_reconciliation",
    riskClass: "privileged_write",
    alwaysRequiresOperatorApproval: true,
    timeoutMs: 600_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: { required: ["reconciliation_key", "target_environment", "dry_run"] },
    outputSchema: { dry_run: "boolean", counts: "object", refusals: "array", exit_code: "number" },
    evidenceSchema: [
      "reconciliation_registered", "environment_permitted", "runner_resolved_from_registry",
      "dry_run_declared", "execution_audit",
    ],
    validateInputs(inputs = {}) {
      const resolved = resolveReconciliationRequest(inputs);
      if (!resolved.ok) return { ok: false, code: resolved.code, detail: resolved.detail };
      return { ok: true, normalized: { ...resolved.normalized, runtimeRoot: inputs.runtimeRoot || null } };
    },
  };
}

function defineTransferFiles() {
  return {
    actionType: ACTION_TYPES.REPOSITORY_TRANSFER_FILES,
    version: 1,
    title: "Transfer approved files from one project repository to another",
    requiredCapability: "trusted_host.repository.transfer_files",
    riskClass: "privileged_write",
    timeoutMs: 300_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    /*
     * BOTH PROJECTS ARE REQUIRED INPUTS, and that is the governance point.
     *
     * A transfer writes into a repository that is NOT necessarily the one
     * hosting the running Vacilando code, so authorizing against "the current
     * repository" would authorize the wrong thing entirely. The Director sees
     * the source it reads from and the destination it writes into, by project,
     * before approving. The destination is the one that matters: that is where
     * bytes land.
     */
    inputSchema: {
      required: ["sourceRepositoryId", "destinationRepositoryId", "planId", "planFingerprint", "entries"],
    },
    outputSchema: { applied: "array", summary: "object" },
    evidenceSchema: [
      "plan_id", "plan_fingerprint", "source_project", "destination_project",
      "summary", "applied", "git_effect", "execution_audit",
    ],
    validateInputs(inputs = {}) {
      const source = String(inputs.sourceRepositoryId || "").trim();
      const destination = String(inputs.destinationRepositoryId || "").trim();
      const planId = String(inputs.planId || "").trim();
      const fingerprint = String(inputs.planFingerprint || "").trim();
      const entries = Array.isArray(inputs.entries) ? inputs.entries : null;
      if (!source) return { ok: false, code: "missing_source_repository" };
      if (!destination) return { ok: false, code: "missing_destination_repository" };
      if (source === destination) return { ok: false, code: "source_and_destination_identical" };
      if (!planId) return { ok: false, code: "missing_plan_id" };
      if (!/^[0-9a-f]{32}$/.test(fingerprint)) return { ok: false, code: "invalid_plan_fingerprint" };
      if (!entries || !entries.length) return { ok: false, code: "missing_entries" };
      /*
       * AN EXPLICIT MANIFEST, OR NOTHING. "Move the Vacilando files" must not be
       * expressible here: every entry names one source and one destination, and
       * a wildcard is not a path. The executor re-derives the fingerprint from
       * these entries and refuses when it does not match what was approved, so
       * a caller cannot widen an approved plan by editing the list.
       */
      for (const e of entries) {
        const from = String(e?.source || "").trim();
        const to = String(e?.destination || "").trim();
        if (!from || !to) return { ok: false, code: "entry_missing_path" };
        if (/[*?]|\*\*/.test(from) || /[*?]/.test(to)) return { ok: false, code: "entry_is_a_pattern_not_a_path" };
        if (from.split("/").includes("..") || to.split("/").includes("..")) {
          return { ok: false, code: "entry_path_traversal" };
        }
      }
      return {
        ok: true,
        normalized: {
          sourceRepositoryId: source,
          destinationRepositoryId: destination,
          planId,
          planFingerprint: fingerprint,
          mode: "copy",
          entries: entries.map((e) => ({
            source: String(e.source).trim(),
            destination: String(e.destination).trim(),
            replace_approved: e.replace_approved === true,
            expected_sha256: e.expected_sha256 ? String(e.expected_sha256) : null,
          })),
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

/**
 * Place ONE bounded read-only certification task into ONE idle lane.
 *
 * The purpose is an allowlisted enum rather than free text, for the same reason
 * the ceiling key is not an input: as an open field this becomes "instruct any
 * lane to do anything", which is remote control wearing a narrow name.
 */
function defineLaneDispatchMeasurementInstruction() {
  return {
    actionType: ACTION_TYPES.LANE_DISPATCH_MEASUREMENT_INSTRUCTION,
    version: 1,
    title: `Dispatch a bounded ${DISPATCH_PURPOSES[0]} task to one lane`,
    requiredCapability: "trusted_host.lane.dispatch_measurement_instruction",
    riskClass: "privileged_write",
    timeoutMs: 60_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["purpose", "target_lane_id", "measurement_id", "source_mission_id", "instruction"],
    },
    outputSchema: {
      target_lane_id: "string", run_id: "string",
      measurement_id: "string", mutated_target_state: "boolean",
    },
    evidenceSchema: [
      "dispatch_purpose_allowlisted", "dispatch_mission_authorized",
      "dispatch_target_eligible", "dispatch_target_not_busy",
      "dispatch_instruction_read_only", "dispatch_bound_to_measurement", "execution_audit",
    ],
    validateInputs(inputs = {}) {
      return validateLaneDispatchInputs(inputs);
    },
  };
}

/**
 * Apply a promoted migration to the PRODUCTION deployed primary.
 *
 * A SEPARATE REGISTRATION, not a flag on the staging one. Two actions cannot be
 * confused by an operator reading an approval card, and an approval minted for
 * a staging apply can never be spent on the production database — which is
 * exactly the substitution this boundary exists to refuse. The staging action
 * keeps refusing production in its own body; nothing here loosens it.
 *
 * `alloy_deployed_primary` stays production-classed. This does not make it less
 * protected; it gives the protection an authorized operator.
 */
/**
 * Reconcile the canonical migration ledger with schema that is already there.
 *
 * A SEPARATE CAPABILITY, and deliberately a narrow one. It writes the sentence
 * "this migration ran" and must never be what makes that sentence true, so it
 * registers a version only when independent governed evidence — the hosted
 * parity gap and a physical-state census — already proves the effects present
 * and matching. It applies nothing, creates nothing, and accepts no SQL.
 */
/**
 * THE ONLY ACTION THAT WRITES main, AND IT IS NOT A PRODUCT RELEASE.
 *
 * repository.push, promotion.open_pr and repository.merge_pull_request all
 * refuse main deliberately, and none of that changes. This exists because
 * GitHub resolves scheduled workflows from the DEFAULT branch only, so a
 * workflow definition has to reach main for the scheduler to see it at all -
 * while the code it tests stays on staging.
 *
 * Operator approval is required and delegation is off. It writes the release
 * branch; that is not something to delegate in a first version, whatever the
 * file size.
 */
function defineRepositoryPromoteMetadata() {
  return {
    actionType: ACTION_TYPES.REPOSITORY_PROMOTE_METADATA,
    version: 1,
    title: "Promote repository-operational metadata to main (no product release)",
    requiredCapability: "trusted_host.repository.promote_metadata",
    riskClass: "privileged_write",
    operatorApprovalRequired: true,
    delegable: false,
    timeoutMs: 120_000,
    // One attempt. The mutation is compare-and-swapped against an approved main;
    // a retry that cannot see why it failed would be re-running a decision.
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: [
        "repository", "target_branch", "candidate_sha",
        "base_ref", "expected_commits", "expected_files", "main_before",
        // The executor cannot find the certified candidate without it, and a
        // missing path must be a refusal the FILER sees, not one discovered
        // after an operator has already approved the write.
        "worktree_path",
      ],
    },
    outputSchema: {
      main_before: "string", main_after: "string", commit: "string",
      files: "array", product_files_changed: "boolean",
    },
    evidenceSchema: [
      "main_before", "main_after", "candidate", "expected_files",
      "actual_files", "promotion_class", "execution_audit",
    ],
    validateInputs(inputs = {}) {
      const v = validateRepositoryMetadataInputs(inputs);
      if (!v.ok) return v;
      // main_before is the compare-and-swap anchor and is required here rather
      // than only at mutation time, so an operator never approves a promotion
      // that does not say which main it is promoting onto.
      if (!String(inputs.main_before || inputs.mainBefore || "").trim()) {
        return { ok: false, code: "missing_main_before",
          detail: "a metadata promotion is approved ONTO a specific main; main_before is required" };
      }
      // Checked at REQUEST time for the same reason: an operator approving a
      // write to the release branch should not be the one to discover that the
      // worktree holding the candidate was never named.
      if (!String(inputs.worktree_path || inputs.worktreePath || "").trim()) {
        return { ok: false, code: "missing_worktree_path",
          detail: "name the worktree holding the certified candidate; the executor resolves the candidate there" };
      }
      return { ok: true, normalized: v.normalized };
    },
  };
}

function defineDatabaseRepairMigrationLedger() {
  return {
    actionType: ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER,
    version: 1,
    title: "Reconcile the migration ledger with already-applied schema",
    requiredCapability: "trusted_host.database.repair_ledger",
    riskClass: "privileged_write",
    operatorApprovalRequired: true,
    delegable: false,
    timeoutMs: 300_000,
    // ONE ATTEMPT. The write is atomic and self-verifying; a retry policy that
    // cannot see why it failed would be re-running a decision, not a command.
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["target", "expectedSha", "migrations", "expectedLedger"],
    },
    outputSchema: {
      target: "string", requested: "array", inserted: "array",
      pre_state: "object", post_state: "object", recensus_required: "boolean",
    },
    evidenceSchema: [
      "expected_sha", "ledger_pre_state", "ledger_post_state",
      "physical_state_proof", "parity_gap", "execution_audit",
    ],
    validateInputs(inputs = {}) {
      return validateLedgerRepairInputs(inputs, {
        core: validateMigrationRequestCore,
        repoRoot: inputs.worktreePath || inputs.worktree_path || inputs.artifactRoot,
      });
    },
  };
}

function defineDatabaseApplyPromotedMigration() {
  return {
    actionType: ACTION_TYPES.DATABASE_APPLY_PROMOTED_MIGRATION,
    version: 1,
    title: "Apply a promoted migration to the deployed primary",
    requiredCapability: "trusted_host.database.migrate_production",
    riskClass: "privileged_write",
    // Production mutation is never delegable and never satisfied by a policy
    // gate. The single human decision in this whole loop is this one.
    operatorApprovalRequired: true,
    delegable: false,
    timeoutMs: 600_000,
    // ONE ATTEMPT. A migration that may have partially executed must not be
    // replayed by a retry policy that cannot know whether it ran.
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["target", "expectedSha", "migrations"],
    },
    outputSchema: { target: "string", migrations: "array", recensus_required: "boolean" },
    evidenceSchema: [
      "migration_path", "expected_sha", "ledger", "execution_audit",
      "parity_before", "parity_gap", "director_approval", "post_apply_census_required",
    ],
    validateInputs(inputs = {}) {
      return validateProductionMigrationInputs(inputs, {
        repoRoot: inputs.worktreePath || inputs.worktree_path || inputs.artifactRoot,
      });
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
      // Read from the constant the validator compares against, so discovery and
      // refusal can never disagree about what `environment` accepts.
      enums: { environment: [...ALLOWED_ENVIRONMENTS] },
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
/**
 * The deployed sibling.
 *
 * Deliberately a SEPARATE registration rather than an optional field on the local one. Two actions
 * cannot be confused by an operator reading a card, and an approval for a loopback slot session can
 * never be spent on a public host — which is exactly the substitution this capability exists to
 * prevent.
 */
function defineEnvironmentRestoreDeployedQaSession() {
  return {
    actionType: ACTION_TYPES.ENVIRONMENT_RESTORE_DEPLOYED_QA_SESSION,
    version: 1,
    title: "Restore a managed QA browser session on a deployed target",
    requiredCapability: "trusted_host.environment.restore_deployed_qa_session",
    riskClass: "privileged_write",
    alwaysRequiresOperatorApproval: true,
    /*
     * THE RESULT DOES NOT KEEP.
     *
     * A census result is an answer to a pinned question and stays true; this action's result
     * describes a browser session that expires in about an hour. Reusing a completed one replayed
     * `verified: true` with a stale `verified_at` while the storage-state file the browser reads
     * was never rewritten — success reported against an artifact that no longer existed. In-flight
     * reuse is unaffected, so two concurrent requests still cannot both mint.
     */
    resultKeeps: false,
    timeoutMs: 300_000,
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    // One key. Not a URL, not a project, not a cookie domain, not an account.
    inputSchema: { required: ["deployed_target"] },
    outputSchema: { status: "string", verified: "boolean", verified_at: "string", target_key: "string" },
    evidenceSchema: [
      "deployed_target_registered", "deployed_base_is_https", "trusted_env_source_readable",
      "deployment_states_its_project", "project_backing_proven", "storage_destination_is_deployed",
      "execution_audit",
    ],
    validateInputs(inputs = {}) {
      return validateRestoreDeployedQaSessionInputs(inputs);
    },
  };
}

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

function definePlatformRegisterDeveloperApplication() {
  return {
    actionType: ACTION_TYPES.PLATFORM_REGISTER_DEVELOPER_APPLICATION,
    version: 1,
    title: "Register one platform developer application",
    requiredCapability: "trusted_host.database.write",
    riskClass: "privileged_write",
    timeoutMs: 120_000,
    // NOT retried automatically. The function is duplicate-safe — a retry that
    // asks for the state already on disk succeeds and says `duplicate` — but a
    // registration is a catalog identity, and re-running one without a person
    // seeing the first outcome is how two near-identical applications appear.
    retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
    inputSchema: {
      required: ["slug", "name", "publisher", "databaseTarget"],
    },
    // No artifact. The caller supplies values from closed vocabularies; the
    // executor owns the statement. There is nothing to hash and no path to any
    // other table.
    requiresArtifactRef: false,
    outputSchema: { resultJson: "object" },
    evidenceSchema: [
      "application_id", "application_key", "application_status", "ownership_mode",
      "application_environment", "distribution_mode", "audit_id", "duplicate", "execution_audit",
    ],
    validateInputs(inputs = {}) {
      return validateRegisterDeveloperApplicationInputs(inputs);
    },
  };
}

const REGISTRY = new Map([
  [ACTION_TYPES.DATABASE_READ_CENSUS, defineDatabaseReadCensus()],
  [ACTION_TYPES.PLATFORM_REGISTER_DEVELOPER_APPLICATION, definePlatformRegisterDeveloperApplication()],
  [ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION, defineEnvironmentRestoreQaSession()],
  [ACTION_TYPES.ENVIRONMENT_RESTORE_DEPLOYED_QA_SESSION, defineEnvironmentRestoreDeployedQaSession()],
  [ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY, defineEnvironmentProvisionQaIdentity()],
  [ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS, defineEnvironmentAssignQaIdentityAccess()],
  [ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST, defineRepositoryMergePullRequest()],
  [ACTION_TYPES.REPOSITORY_PUSH, defineRepositoryPush()],
  [ACTION_TYPES.PROMOTION_OPEN_PR, definePromotionOpenPr()],
  [ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST, defineRepositoryClosePullRequest()],
  [ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH, defineRepositoryDeleteRemoteBranch()],
  [ACTION_TYPES.VACILANDO_APPLY_RECONCILIATION_PLAN, defineApplyReconciliationPlan()],
  [ACTION_TYPES.REPOSITORY_TRANSFER_FILES, defineTransferFiles()],
  [ACTION_TYPES.VACILANDO_RETIRE_WORKTREE, defineRetireWorktree()],
  [ACTION_TYPES.DATABASE_APPLY_MIGRATION, defineDatabaseApplyMigration()],
  [ACTION_TYPES.DATABASE_APPLY_PROMOTED_MIGRATION, defineDatabaseApplyPromotedMigration()],
  [ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER, defineDatabaseRepairMigrationLedger()],
  [ACTION_TYPES.REPOSITORY_PROMOTE_METADATA, defineRepositoryPromoteMetadata()],
  [ACTION_TYPES.CAPACITY_SET_PROVIDER_CEILING, defineCapacitySetProviderCeiling()],
  [ACTION_TYPES.HOST_INSTALL_TOOLKIT, defineHostInstallToolkit()],
  [ACTION_TYPES.LANE_DISPATCH_MEASUREMENT_INSTRUCTION, defineLaneDispatchMeasurementInstruction()],
  [ACTION_TYPES.ENVIRONMENT_EXECUTE_REGISTERED_RECONCILIATION, defineEnvironmentExecuteRegisteredReconciliation()],
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
    /*
     * WHICH INPUTS WAS NEVER THE HARD PART. WHICH VALUES IS.
     *
     * Discovery said `database.apply_migration` requires `environment` and
     * stopped there. A worker filing against the certification database had no
     * way to learn that `environment` is an enum of three strings, so when the
     * request did not visibly execute it went looking for the accepted values —
     * found `DIRECTOR_ELIGIBLE_ENVIRONMENTS`, which is a DIFFERENT contract
     * describing who may approve rather than what may be targeted — and filed
     * `development_certification`. That request failed `environment_not_allowed`,
     * which is the one refusal this field makes impossible to earn by accident.
     *
     * Only enums that the validator actually enforces belong here; a value list
     * that drifts from the check is worse than no list at all, so each entry is
     * read from the same frozen constant the validator compares against.
     */
    acceptedValues: a.inputSchema?.enums || null,
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
