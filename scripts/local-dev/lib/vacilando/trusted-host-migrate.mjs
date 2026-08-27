/**
 * Bounded trusted-host migration apply.
 *
 * Deployment artifacts resolve from an immutable Git revision (object database),
 * never from a developer's working copy. Privileged apply must not depend on,
 * or mutate, `/Users/Kelly/Alloy` or any other dirty checkout.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const CANONICAL_MIGRATION_DIR = "supabase/migrations";
export const ALLOWED_ENVIRONMENTS = Object.freeze(["staging", "certification", "cert"]);
export const BLOCKED_ENVIRONMENTS = Object.freeze([
  "production", "prod", "alloy_production", "alloy_deployed_primary",
]);
export const APPLY_MIGRATION_SH = join(dirname(fileURLToPath(import.meta.url)), "trusted-host-apply-migration.sh");

export const PRIVILEGED_DEPLOYMENT_WORKING_COPY_INVARIANT = Object.freeze({
  id: "privileged_deployment_ignores_developer_working_copy",
  rule: "Privileged governed deployment actions must never depend on or mutate developer working-copy state.",
  dirtyWorktreeIsNotABlocker: true,
  neverMutate: Object.freeze(["reset", "stash", "clean", "checkout", "restore"]),
});

const VERSION_RE = /^(\d{14})_(.+)\.sql$/;
const DEFERRED_VERSIONS = Object.freeze(["20260819130000"]);
const MUTATING_GIT = new Set(["reset", "stash", "clean", "checkout", "restore", "rm"]);

export const ACCESS_IDENTITY_STAGING_MIGRATIONS = Object.freeze([
  { version: "20260818170000", prefix: "20260818170000_w13_collapse_portal_eligible" },
  { version: "20260818180000", prefix: "20260818180000_w61_role_key_fk_restrict_no_cascade" },
  { version: "20260818190000", prefix: "20260818190000_w16_user_roles_role_foreign_key" },
  { version: "20260818220000", prefix: "20260818220000_s3_action_link_token_hash" },
  { version: "20260818230000", prefix: "20260818230000_s3_action_link_token_drop_plaintext" },
  { version: "20260818240000", prefix: "20260818240000_w60_m20_drop_catalog_compatibility_views" },
  { version: "20260819120000", prefix: "20260819120000_w13_i35b_analytics_read_preservation" },
  { version: "20260819140000", prefix: "20260819140000_od8_ops_users_roles_read_preservation" },
  { version: "20260820130000", prefix: "20260820130000_w28_replace_role_permission_grants_rpc" },
  { version: "20260820140000", prefix: "20260820140000_w58_save_role_definition_and_grants" },
]);

function sha256(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

function envName(value) {
  return String(value || "").trim().toLowerCase();
}

function shaEquals(a, b) {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  if (!x || !y) return false;
  const n = Math.min(x.length, y.length, 40);
  return n >= 7 && x.slice(0, n) === y.slice(0, n);
}

function gitOk(result) {
  return Boolean(result) && result.status === 0;
}

function assertNonMutatingGit(args) {
  const cmd = String(args?.[0] || "");
  if (MUTATING_GIT.has(cmd) || (cmd === "worktree" && args[1] === "remove")) {
    throw new Error(`refusing git ${cmd}: privileged apply must not mutate a working copy`);
  }
}

function defaultGit(args, { cwd, timeout = 30_000 } = {}) {
  assertNonMutatingGit(args);
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function moduleRepoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function gitObjectStoreCandidates(root) {
  return [...new Set([
    root,
    process.env.VACILANDO_CHECKOUT,
    process.env.ALLOY_WORKTREE,
    moduleRepoRoot(),
    process.env.ALLOY_CANONICAL_ROOT,
    process.env.ALLOY_REPO,
    "/Users/Kelly/Alloy",
    join(process.env.HOME || "", "Alloy"),
  ].filter(Boolean))];
}

function gitHasCommit(sha, { cwd, git }) {
  if (!cwd || !sha) return false;
  const probe = git(["cat-file", "-e", `${sha}^{commit}`], { cwd });
  return gitOk(probe);
}

function fetchCommitInto(cwd, sha, git) {
  if (!cwd || !sha) return false;
  const noHead = git(["fetch", "--no-write-fetch-head", "--no-tags", "origin", sha], { cwd, timeout: 60_000 });
  if (gitHasCommit(sha, { cwd, git })) return true;
  git(["fetch", "--no-tags", "origin", sha], { cwd, timeout: 60_000 });
  return gitHasCommit(sha, { cwd, git });
}

/**
 * Locate a Git object store that already has `sha`, fetching into a live
 * Vacilando checkout if needed. Never resets, stashes, or cleans a checkout.
 */
export function ensureCommitAvailable(sha, {
  git = defaultGit,
  root = null,
  fetchIfMissing = true,
} = {}) {
  const want = String(sha || "").trim();
  if (!/^[a-f0-9]{7,40}$/i.test(want)) {
    return { ok: false, code: "source_sha_unavailable", detail: "expected_sha is not a Git commit" };
  }
  const candidates = gitObjectStoreCandidates(root);
  for (const cwd of candidates) {
    if (gitHasCommit(want, { cwd, git })) return { ok: true, cwd, fetched: false };
  }
  if (!fetchIfMissing) {
    return {
      ok: false,
      code: "source_sha_unavailable",
      detail: `Commit ${want} is not in the Git object database`,
    };
  }
  const fetchTargets = candidates.filter((c) => c !== "/Users/Kelly/Alloy");
  if (!fetchTargets.length) fetchTargets.push(...candidates);
  for (const cwd of fetchTargets) {
    if (fetchCommitInto(cwd, want, git)) return { ok: true, cwd, fetched: true };
  }
  return {
    ok: false,
    code: "source_sha_unavailable",
    detail: `Commit ${want} could not be resolved from Git objects and was not fetched`,
  };
}

export function assertShaReachableFromStaging(sha, {
  git = defaultGit,
  cwd,
  stagingRef = "origin/staging",
  fetchIfMissing = true,
} = {}) {
  const rev = git(["rev-parse", sha], { cwd });
  if (!gitOk(rev)) {
    return { ok: false, code: "source_sha_unavailable", detail: `SHA ${sha} is not a commit` };
  }
  const fullSha = String(rev.stdout || "").trim();
  let staging = git(["rev-parse", stagingRef], { cwd });
  if (!gitOk(staging) && fetchIfMissing) {
    git(["fetch", "--no-tags", "origin", "staging"], { cwd, timeout: 60_000 });
    staging = git(["rev-parse", stagingRef], { cwd });
  }
  const stagingSha = String(staging.stdout || "").trim();
  if (!gitOk(staging) || !stagingSha) {
    return {
      ok: false,
      code: "source_sha_not_reachable",
      detail: `Cannot resolve ${stagingRef} to test reachability of ${fullSha}`,
    };
  }
  if (shaEquals(fullSha, stagingSha)) {
    return { ok: true, fullSha, stagingSha, relation: "equals_staging" };
  }
  const ancestor = git(["merge-base", "--is-ancestor", fullSha, stagingSha], { cwd });
  if (gitOk(ancestor)) {
    return { ok: true, fullSha, stagingSha, relation: "ancestor_of_staging" };
  }
  return {
    ok: false,
    code: "source_sha_not_reachable",
    detail: "expected_sha is not origin/staging and is not an ancestor of origin/staging",
    fullSha,
    stagingSha,
  };
}

export function parseMigrationFilename(pathRel) {
  const filename = basename(String(pathRel || ""));
  const m = VERSION_RE.exec(filename);
  if (!m) return null;
  return { version: m[1], name: m[2], filename };
}

export function assertCanonicalMigrationPath(pathRel) {
  const rel = String(pathRel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel) return { ok: false, code: "missing_migration_path", detail: "migration_path is required" };
  if (rel.includes("\0") || rel.includes("..")) {
    return { ok: false, code: "path_escape", detail: "Migration path escapes the canonical directory" };
  }
  if (!rel.startsWith(`${CANONICAL_MIGRATION_DIR}/`)) {
    return { ok: false, code: "outside_canonical_directory", detail: "Migration must live under supabase/migrations" };
  }
  const parsed = parseMigrationFilename(rel);
  if (!parsed) {
    return { ok: false, code: "invalid_migration_filename", detail: "Filename must be <14-digit-version>_<name>.sql" };
  }
  return { ok: true, relative: rel, ...parsed };
}

export function listMigrationsAtSha({ root, sha, git = defaultGit, gitCwd = null } = {}) {
  if (!sha) return [];
  const store = gitCwd
    ? { ok: true, cwd: gitCwd }
    : ensureCommitAvailable(sha, { git, root, fetchIfMissing: false });
  if (!store.ok) return [];
  const out = git(["ls-tree", "-r", "--name-only", sha, CANONICAL_MIGRATION_DIR], { cwd: store.cwd });
  if (!gitOk(out)) return [];
  return String(out.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.endsWith(".sql"))
    .sort();
}

export function readMigrationContent({
  root,
  sha,
  relative,
  git = defaultGit,
  gitCwd = null,
  currentStagingSha = null,
  fetchIfMissing = true,
} = {}) {
  const inside = assertCanonicalMigrationPath(relative);
  if (!inside.ok) return inside;
  if (!sha) {
    return { ok: false, code: "source_sha_unavailable", detail: "expected_sha is required to resolve a committed migration" };
  }
  const store = gitCwd
    ? { ok: true, cwd: gitCwd }
    : ensureCommitAvailable(sha, { git, root, fetchIfMissing });
  if (!store.ok) return store;
  const show = git(["show", `${sha}:${inside.relative}`], { cwd: store.cwd });
  if (!gitOk(show) || show.stdout == null) {
    return {
      ok: false,
      code: "migration_missing_at_sha",
      detail: `Migration ${inside.relative} is not present at ${sha}`,
    };
  }
  const text = String(show.stdout);
  if (currentStagingSha && !shaEquals(currentStagingSha, sha)) {
    const live = git(["show", `${currentStagingSha}:${inside.relative}`], { cwd: store.cwd });
    if (!gitOk(live) || live.stdout == null) {
      return {
        ok: false,
        code: "migration_changed_since_approval",
        detail: `Migration ${inside.relative} is missing on current staging ${currentStagingSha}`,
      };
    }
    if (sha256(String(live.stdout)) !== sha256(text)) {
      return {
        ok: false,
        code: "migration_changed_since_approval",
        detail: `Migration ${inside.relative} changed on staging after approval`,
      };
    }
  }
  return {
    ok: true,
    text,
    source: "git_object",
    gitCwd: store.cwd,
    relative: inside.relative,
  };
}

function locatePrefix(root, prefix, sha, { git, gitCwd } = {}) {
  const want = String(prefix || "").replace(/\.sql$/, "");
  const listed = listMigrationsAtSha({ root, sha, git, gitCwd });
  return listed.find((f) => basename(f).startsWith(want) || f.startsWith(want)) || null;
}

export function resolveMigrationEntry(item = {}, {
  root,
  expectedSha,
  git = defaultGit,
  gitCwd = null,
  currentStagingSha = null,
  fetchIfMissing = true,
} = {}) {
  const version = String(item.version || item.expected_version || "").trim();
  let pathRel = String(item.path || item.migration_path || "").trim().replace(/\\/g, "/");
  if (!pathRel && (item.prefix || version)) {
    pathRel = locatePrefix(root, item.prefix || version, expectedSha, { git, gitCwd }) || "";
  }
  if (!pathRel) {
    return {
      ok: false,
      code: "migration_not_found",
      detail: `No committed migration matches ${item.prefix || version}`,
    };
  }
  const inside = assertCanonicalMigrationPath(pathRel);
  if (!inside.ok) return inside;
  if (version && version !== inside.version) {
    return {
      ok: false,
      code: "version_filename_mismatch",
      detail: `expected_version ${version} does not match ${inside.filename}`,
    };
  }
  if (DEFERRED_VERSIONS.includes(inside.version)) {
    return {
      ok: false,
      code: "deferred_migration_excluded",
      detail: `${inside.version} is deferred and not part of this promotion.`,
    };
  }
  const content = readMigrationContent({
    root,
    sha: expectedSha,
    relative: inside.relative,
    git,
    gitCwd,
    currentStagingSha,
    fetchIfMissing,
  });
  if (!content.ok) return content;
  if (item.fileSha || item.file_sha || item.expectedHash || item.expected_hash) {
    const expectedHash = String(item.fileSha || item.file_sha || item.expectedHash || item.expected_hash);
    if (sha256(content.text) !== expectedHash) {
      return {
        ok: false,
        code: "artifact_hash_mismatch",
        detail: `Committed blob hash for ${inside.relative} does not match the approved artifact`,
      };
    }
  }
  return {
    ok: true,
    entry: {
      version: inside.version,
      path: inside.relative,
      filename: inside.filename,
      fileSha: sha256(content.text),
      bytes: Buffer.byteLength(content.text, "utf8"),
      source: "git_object",
    },
  };
}

function normalizeMigrationList(inputs, ctx) {
  const raw = Array.isArray(inputs.migrations) && inputs.migrations.length
    ? inputs.migrations
    : [{
      version: inputs.expected_version || inputs.expectedVersion,
      path: inputs.migration_path || inputs.migrationPath,
      prefix: inputs.prefix,
    }];
  const versions = raw.map((item) => String(item.version || item.expected_version || "").trim()).filter(Boolean);
  const seenRaw = new Set();
  for (const v of versions) {
    if (seenRaw.has(v)) {
      return { ok: false, code: "version_collision", detail: `Duplicate version ${v}` };
    }
    seenRaw.add(v);
  }
  const list = [];
  const seen = new Set();
  for (const item of raw) {
    const resolved = resolveMigrationEntry(item, ctx);
    if (!resolved.ok) return resolved;
    if (seen.has(resolved.entry.version)) {
      return { ok: false, code: "version_collision", detail: `Duplicate version ${resolved.entry.version}` };
    }
    seen.add(resolved.entry.version);
    list.push(resolved.entry);
  }
  if (!list.length) return { ok: false, code: "missing_migrations", detail: "No migrations supplied" };
  for (let i = 1; i < list.length; i++) {
    if (list[i].version <= list[i - 1].version) {
      return { ok: false, code: "illegal_sort_order", detail: `${list[i].version} does not follow ${list[i - 1].version}` };
    }
  }
  return { ok: true, list };
}

export function validateMigrationInputs(inputs = {}, {
  repoRoot = null,
  git = defaultGit,
  fetchIfMissing = true,
  stagingRef = "origin/staging",
} = {}) {
  if (inputs.sql || inputs.statement || inputs.body || inputs.database_url || inputs.databaseUrl) {
    return { ok: false, code: "arbitrary_sql_rejected", detail: "Arbitrary SQL is not a registered trusted-host action." };
  }
  const environment = envName(inputs.environment || inputs.target || "staging");
  if (BLOCKED_ENVIRONMENTS.includes(environment) || environment === "production") {
    return { ok: false, code: "production_database_rejected", detail: "Production database targets are not registered." };
  }
  if (!ALLOWED_ENVIRONMENTS.includes(environment)) {
    return { ok: false, code: "environment_not_allowed", detail: `environment must be one of: ${ALLOWED_ENVIRONMENTS.join(", ")}` };
  }
  const expectedSha = String(inputs.expected_sha || inputs.expectedSha || "").trim().toLowerCase();
  if (!/^[a-f0-9]{7,40}$/.test(expectedSha)) {
    return { ok: false, code: "missing_expected_sha", detail: "expected_sha is required" };
  }
  const preview = Array.isArray(inputs.migrations) && inputs.migrations.length
    ? inputs.migrations
    : [{
      version: inputs.expected_version || inputs.expectedVersion,
      path: inputs.migration_path || inputs.migrationPath,
    }];
  const previewVersions = new Set();
  for (const item of preview) {
    const pathRel = String(item.path || item.migration_path || "").trim();
    if (pathRel) {
      const inside = assertCanonicalMigrationPath(pathRel);
      if (!inside.ok) return inside;
    }
    const version = String(item.version || item.expected_version || "").trim();
    if (version) {
      if (previewVersions.has(version)) {
        return { ok: false, code: "version_collision", detail: `Duplicate version ${version}` };
      }
      previewVersions.add(version);
    }
  }
  const root = repoRoot
    || inputs.worktree_path
    || inputs.worktreePath
    || process.env.VACILANDO_CHECKOUT
    || process.env.ALLOY_WORKTREE
    || process.cwd();
  const store = ensureCommitAvailable(expectedSha, { git, root, fetchIfMissing });
  if (!store.ok) return store;
  const reach = assertShaReachableFromStaging(expectedSha, {
    git,
    cwd: store.cwd,
    stagingRef,
    fetchIfMissing,
  });
  if (!reach.ok) return reach;
  const migrations = normalizeMigrationList(inputs, {
    root,
    expectedSha,
    git,
    gitCwd: store.cwd,
    currentStagingSha: reach.stagingSha,
    fetchIfMissing,
  });
  if (!migrations.ok) return migrations;
  return {
    ok: true,
    normalized: {
      actionType: "database.apply_migration",
      environment,
      repository: String(inputs.repository || inputs.repo || "").trim() || null,
      expectedSha: reach.fullSha || expectedSha,
      stagingSha: reach.stagingSha,
      stagingRelation: reach.relation,
      gitCwd: store.cwd,
      artifactSource: "git_object",
      worktreePath: root,
      migrations: migrations.list,
      dedupeKey: `migrate:${environment}:${expectedSha.slice(0, 12)}:${migrations.list.map((m) => m.version).join(",")}`,
    },
  };
}

export function ledgerLookupSql(version) {
  const v = String(version || "").replace(/'/g, "");
  return `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${v}';`;
}

export function applyMigrationBatch(normalized, {
  inspectLedger = null,
  applyFile = null,
  readContent = readMigrationContent,
  nowMs = Date.now(),
} = {}) {
  const results = [];
  for (const entry of normalized.migrations) {
    const latest = readContent({
      root: normalized.worktreePath,
      sha: normalized.expectedSha,
      relative: entry.path,
      gitCwd: normalized.gitCwd,
      currentStagingSha: normalized.stagingSha,
    });
    if (!latest.ok) {
      results.push({ ok: false, version: entry.version, path: entry.path, code: latest.code, detail: latest.detail });
      return { ok: false, stopped: true, environment: normalized.environment, expectedSha: normalized.expectedSha, results };
    }
    if (sha256(latest.text) !== entry.fileSha) {
      results.push({
        ok: false,
        version: entry.version,
        path: entry.path,
        code: "artifact_hash_mismatch",
        detail: "Committed migration blob does not match the approved artifact hash.",
      });
      return { ok: false, stopped: true, environment: normalized.environment, expectedSha: normalized.expectedSha, results };
    }
    const ledger = inspectLedger
      ? inspectLedger({ version: entry.version, environment: normalized.environment })
      : { applied: false };
    if (ledger?.ok === false) {
      results.push({
        ok: false,
        version: entry.version,
        path: entry.path,
        code: ledger.code || "preflight_failed",
        detail: ledger.detail || "Migration preflight failed.",
      });
      return { ok: false, stopped: true, environment: normalized.environment, expectedSha: normalized.expectedSha, results };
    }
    if (ledger?.inconsistent) {
      results.push({
        ok: false,
        version: entry.version,
        path: entry.path,
        code: "ledger_mismatch",
        detail: ledger.detail || "Ledger says applied but schema evidence is inconsistent.",
      });
      return { ok: false, stopped: true, environment: normalized.environment, expectedSha: normalized.expectedSha, results };
    }
    if (ledger?.applied) {
      results.push({
        ok: true,
        idempotent: true,
        version: entry.version,
        path: entry.path,
        environment: normalized.environment,
        ledger: "applied",
        applied_at: new Date(nowMs).toISOString(),
      });
      continue;
    }
    const applied = applyFile
      ? applyFile({
        entry,
        text: latest.text,
        environment: normalized.environment,
        expectedSha: normalized.expectedSha,
      })
      : { ok: false, code: "apply_runner_missing", detail: "Trusted-host apply runner was not provided." };
    if (!applied?.ok) {
      results.push({
        ok: false,
        version: entry.version,
        path: entry.path,
        code: applied?.code || "apply_failed",
        detail: applied?.detail || "Migration apply failed",
      });
      return { ok: false, stopped: true, environment: normalized.environment, expectedSha: normalized.expectedSha, results };
    }
    results.push({
      ok: true,
      idempotent: Boolean(applied.idempotent),
      version: entry.version,
      path: entry.path,
      environment: normalized.environment,
      ledger: applied.ledger || "applied",
      applied_at: new Date(nowMs).toISOString(),
    });
  }
  return {
    ok: true,
    stopped: false,
    environment: normalized.environment,
    expectedSha: normalized.expectedSha,
    results,
    credentialsExposed: false,
    artifactSource: "git_object",
  };
}

export function publicMigrationResult(result) {
  if (!result) return null;
  return {
    environment: result.environment,
    expected_sha: result.expectedSha,
    stopped: Boolean(result.stopped),
    artifact_source: result.artifactSource || "git_object",
    migrations: (result.results || []).map((r) => ({
      version: r.version,
      path: r.path,
      ok: r.ok,
      idempotent: Boolean(r.idempotent),
      ledger: r.ledger || null,
      code: r.code || null,
      detail: r.detail || null,
      applied_at: r.applied_at || null,
    })),
  };
}
