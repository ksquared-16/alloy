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
import { validateMigrationInputs } from "./trusted-host-migrate.mjs";

export const ACTION_TYPES = Object.freeze({
  DATABASE_READ_CENSUS: "database.read_census",
  REPOSITORY_MERGE_PULL_REQUEST: "repository.merge_pull_request",
  DATABASE_APPLY_MIGRATION: "database.apply_migration",
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

const REGISTRY = new Map([
  [ACTION_TYPES.DATABASE_READ_CENSUS, defineDatabaseReadCensus()],
  [ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST, defineRepositoryMergePullRequest()],
  [ACTION_TYPES.DATABASE_APPLY_MIGRATION, defineDatabaseApplyMigration()],
]);

export function listRegisteredActions() {
  return [...REGISTRY.values()].map((a) => ({
    actionType: a.actionType,
    version: a.version,
    title: a.title,
    riskClass: a.riskClass,
    requiredCapability: a.requiredCapability,
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
