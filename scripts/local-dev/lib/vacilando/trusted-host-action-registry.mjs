/**
 * Trusted Host Action registry — registered privileged host capabilities only.
 * No arbitrary shell.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateReadOnlySql } from "./trusted-host-sql-readonly.mjs";

export const ACTION_TYPES = Object.freeze({
  DATABASE_READ_CENSUS: "database.read_census",
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

/** Canonical Alloy checkout for trusted credentials (never the managed worker env). */
export function resolveCanonicalRepoRoot() {
  const candidates = [
    process.env.ALLOY_CANONICAL_ROOT,
    process.env.ALLOY_REPO,
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
    timeoutMs: 60_000,
    retry: { maxAttempts: 2, backoffMs: 30_000, retryOn: ["connection_failed", "timeout"] },
    inputSchema: {
      required: ["queryArtifactPath", "expectedQueryHash", "databaseTarget"],
    },
    outputSchema: { resultJson: "object" },
    evidenceSchema: ["query_artifact", "query_hash", "validation_report", "result_json", "execution_audit"],
    validateInputs(inputs = {}) {
      const pathRel = inputs.queryArtifactPath || inputs.query_artifact_path;
      if (!pathRel) return { ok: false, code: "missing_query_artifact", detail: "queryArtifactPath required" };
      const root = findRepoRoot();
      const abs = join(root, pathRel);
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
          sql,
          queryHash: hash,
          databaseTarget: DEFAULT_TARGET,
          timeoutMs: Number(inputs.timeoutMs || inputs.timeout || 60_000),
          validation: v,
        },
      };
    },
  };
}

const REGISTRY = new Map([
  [ACTION_TYPES.DATABASE_READ_CENSUS, defineDatabaseReadCensus()],
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
  return REGISTRY.get(actionType) || null;
}

export function hashSql(sql) {
  return sha256(sql);
}

export { DEFAULT_TARGET, findRepoRoot };
