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
/**
 * Environments where a migration SHA may be proven against a sanctioned
 * remote-tracking ref other than origin/staging.
 *
 * Certification runs migrations for work that has NOT landed on staging yet —
 * that is the point of certifying it. Requiring staging-ancestry there makes
 * the gate unsatisfiable for exactly the commits certification exists to test,
 * so the check was passing by never being reachable rather than by being safe.
 */
export const CERTIFICATION_ENVIRONMENTS = Object.freeze(["certification", "cert"]);
/**
 * The ONLY refs a certification SHA may be proven against. Remote-tracking
 * only: a ref that exists solely in this checkout proves nothing about what
 * anyone else can see, and "the working copy has this commit" is the assertion
 * this gate exists to refuse.
 */
/*
 * `**`, NOT `*`. git for-each-ref matches patterns with wildmatch in PATHNAME
 * mode, so a single star does not cross a slash. Agent branches are two levels
 * deep (agent/claude/4-thing), so `refs/remotes/origin/agent/*` matches exactly
 * ZERO of the 169 agent refs in this repository, while
 * `refs/remotes/origin/promotion/*` matches its one-level refs and looks like
 * proof the pattern works. Written with a single star this gate stays as
 * unsatisfiable as the staging-only check it replaces, and silently so —
 * for-each-ref returns success with no rows, which reads as "no sanctioned ref
 * matched" rather than "the pattern was wrong".
 */
export const CERTIFICATION_SANCTIONED_REF_GLOBS = Object.freeze([
  "refs/remotes/origin/staging",
  "refs/remotes/origin/agent/**",
  "refs/remotes/origin/promotion/**",
]);
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

/**
 * Reachability, environment-aware.
 *
 * STAGING AND PRODUCTION SEMANTICS DO NOT MOVE. The staging test runs FIRST and
 * unconditionally, and its result is returned verbatim on success. On failure,
 * anything that is not certification gets the original failure object back
 * unchanged — same code, same detail — so nothing downstream can tell this
 * function was introduced.
 *
 * Only for certification/cert does a second chance exist, and only against the
 * sanctioned remote-tracking globs. Never local refs, never tags, never a
 * symbolic HEAD, never arbitrary origin/*, and never the working copy's own
 * HEAD merely because the object is present.
 */
export function assertShaReachableForEnvironment(sha, {
  environment = "staging",
  git = defaultGit,
  cwd,
  stagingRef = "origin/staging",
  fetchIfMissing = true,
} = {}) {
  const primary = assertShaReachableFromStaging(sha, { git, cwd, stagingRef, fetchIfMissing });
  if (primary.ok) return primary;

  const env = String(environment || "").trim().toLowerCase();
  if (!CERTIFICATION_ENVIRONMENTS.includes(env)) return primary;
  // A SHA that is not a commit at all is not made into one by the environment.
  if (primary.code === "source_sha_unavailable") return primary;

  if (fetchIfMissing) {
    git(["fetch", "--no-tags", "--prune", "origin"], { cwd, timeout: 60_000 });
  }
  const rev = git(["rev-parse", sha], { cwd });
  if (!gitOk(rev)) return primary;
  const fullSha = String(rev.stdout || "").trim();

  const listed = git(
    ["for-each-ref", "--format=%(refname) %(objectname)", ...CERTIFICATION_SANCTIONED_REF_GLOBS],
    { cwd },
  );
  if (!gitOk(listed)) return primary;

  for (const line of String(listed.stdout || "").split("\n")) {
    const [refname, tip] = line.trim().split(/\s+/);
    if (!refname || !tip) continue;
    // Belt and braces: the globs already scope to remote-tracking refs, but a
    // pattern is a filter and this is an assertion.
    if (!refname.startsWith("refs/remotes/")) continue;
    if (refname.endsWith("/HEAD")) continue;
    if (shaEquals(fullSha, tip)) {
      return {
        ok: true, fullSha, stagingSha: primary.stagingSha ?? null,
        relation: "equals_sanctioned_certification_ref", sanctionedRef: refname, environment: env,
      };
    }
    if (gitOk(git(["merge-base", "--is-ancestor", fullSha, tip], { cwd }))) {
      return {
        ok: true, fullSha, stagingSha: primary.stagingSha ?? null,
        relation: "ancestor_of_sanctioned_certification_ref", sanctionedRef: refname, environment: env,
      };
    }
  }
  return {
    ...primary,
    detail: `${primary.detail}; and it is not reachable from any sanctioned certification ref (${CERTIFICATION_SANCTIONED_REF_GLOBS.join(", ")})`,
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
  environment = "staging",
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
      /*
       * ABSENT ON STAGING IS NOT DRIFT — IN CERTIFICATION.
       *
       * This guard asks "is the migration I approved still the migration that
       * will run?". Comparing against staging answers that for a staging
       * apply. For a certification apply of unmerged work the file is absent
       * from staging BY DEFINITION — that is what is being certified — so the
       * guard failed on a condition certification can never satisfy, the same
       * shape as the staging-ancestry check one layer up.
       *
       * A NEW migration is not a CHANGED one. What must still fail everywhere
       * is the case below: present on staging and different.
       */
      if (!CERTIFICATION_ENVIRONMENTS.includes(envName(environment))) {
        return {
          ok: false,
          code: "migration_changed_since_approval",
          detail: `Migration ${inside.relative} is missing on current staging ${currentStagingSha}`,
        };
      }
    } else if (sha256(String(live.stdout)) !== sha256(text)) {
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
  environment = "staging",
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
    environment,
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
  const reach = assertShaReachableForEnvironment(expectedSha, {
    environment,
    git,
    cwd: store.cwd,
    stagingRef,
    fetchIfMissing,
  });
  if (!reach.ok) return reach;
  const migrations = normalizeMigrationList(inputs, {
    environment,
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

/**
 * A migration's DURABLE POSTCONDITION -- the evidence that it actually ran.
 *
 * ── WHY A LEDGER ROW IS NOT PROOF ──
 *
 * The executor treated "the version string is in schema_migrations" as "this migration is applied",
 * and skipped it as idempotent. A certification database was found recording five Enrollment
 * migrations while three of their effects were absent: the indexes did not exist and the anchor
 * backfill had left no trace. Every apply reported ok:true and did nothing, which is the worst
 * possible shape -- silent, and confidently wrong.
 *
 * So a recorded version is now CHECKED against something only a successful run could have produced.
 * These are deliberately EXPLICIT per migration rather than generic SQL inference: a generic guess
 * about what a migration "should" have done is another thing that can be wrong quietly, and the
 * author of a migration is the one who knows its postcondition.
 *
 * Each entry returns a single boolean column. Absent from this map = unverifiable, and an
 * unverifiable migration keeps the old behaviour (a recorded version is trusted) rather than
 * blocking every migration the platform has ever applied.
 */
export const MIGRATION_POSTCONDITIONS = {
  // The acquisition Opportunity became optional on the participation.
  "20260827160000": {
    describe: "opportunity_customer_members.opportunity_id is nullable",
    sql: `SELECT (NOT a.attnotnull) FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname='public' AND c.relname='opportunity_customer_members'
             AND a.attname='opportunity_id' AND a.attnum>0 AND NOT a.attisdropped;`,
  },
  // The episode-scoped context-free uniqueness index exists (either the original name or the
  // successor that narrowed its predicate -- both satisfy this migration's intent).
  "20260827170000": {
    describe: "a context-free participation uniqueness index exists",
    sql: `SELECT EXISTS (
            SELECT 1 FROM pg_class i
             WHERE i.relname IN ('uq_ocm_active_context_free_participation','uq_ocm_active_context_free_episode')
          );`,
  },
  // The backfill's only durable trace: at least one journey anchored to a participation. Checked
  // only when there is an enrollment journey to anchor, so an empty tenant is not a false alarm.
  "20260827180000": {
    describe: "enrollment journeys are anchored to a participation (or none exist to anchor)",
    sql: `SELECT (
            (SELECT count(*) FROM public.process_instances
              WHERE process_key='enrollment' AND subject_type='child') = 0
            OR EXISTS (
              SELECT 1 FROM public.process_instances
               WHERE process_key='enrollment' AND context_type='enrollment_participation')
          );`,
  },
  // The governed requirement exception owner, with the index that makes it idempotent.
  "20260901120000": {
    describe: "enrollment_requirement_exceptions exists with its active-unique index",
    sql: `SELECT (
            to_regclass('public.enrollment_requirement_exceptions') IS NOT NULL
            AND EXISTS (SELECT 1 FROM pg_class WHERE relname='uq_enrollment_requirement_exception_active')
          );`,
  },
  // Enrolled releases the active context-free slot.
  "20260902090000": {
    describe: "uq_ocm_active_context_free_episode exists",
    sql: `SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname='uq_ocm_active_context_free_episode');`,
  },
};

/** The postcondition probe for a version, or null when the migration declares none. */
export function migrationPostconditionSql(version) {
  const entry = MIGRATION_POSTCONDITIONS[String(version || "").trim()];
  return entry ? entry.sql : null;
}

export function migrationPostconditionDescription(version) {
  const entry = MIGRATION_POSTCONDITIONS[String(version || "").trim()];
  return entry ? entry.describe : null;
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
      // The runtime re-read applies the SAME environment rule as validation.
      // Reading it here under staging semantics would re-introduce the failure
      // at execution time, after the request had already been approved.
      environment: normalized.environment,
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
