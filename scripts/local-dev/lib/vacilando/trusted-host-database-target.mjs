/**
 * Which database a governed migration is actually allowed to touch.
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE ──
 *
 * `environment` was accepted by request validation and then never consulted
 * again. `CERTIFICATION_ENVIRONMENTS` gated GIT eligibility only — which ref a
 * SHA may be proven against, and whether a migration absent from staging is
 * drift — while `resolveTrustedServerEnvSource()` takes no environment argument
 * at all. The apply child then ran `psql "$DATABASE_URL"` against whichever
 * `.env.local` the trusted host happened to have.
 *
 * On a host where that URL is a deployed pooler, a request labelled
 * `certification` would have written to the deployed database. It was caught
 * because the apply failed for an unrelated reason first; nothing in the path
 * would have stopped it.
 *
 * So the environment now selects the target, explicitly, in one place, and the
 * selection is recorded in the action result. A target is never inferred from
 * whichever credential file exists.
 *
 * ── FAIL CLOSED, IN BOTH DIRECTIONS ──
 *
 * An unknown environment refuses before dispatch. A certification request whose
 * resolved URL looks like deployed infrastructure refuses before the first
 * statement. And a staging request that resolves to the local certification
 * stack refuses too — a migration silently applied to a throwaway database
 * reports success while changing nothing that matters, which is the quieter and
 * more expensive half of the same bug.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/** Canonical target classes. An environment alias resolves to exactly one. */
export const TARGET_CLASS = Object.freeze({
  CERTIFICATION: "certification_local",
  STAGING: "staging_deployed",
  DEPLOYED_PRIMARY: "deployed_primary",
});

/*
 * ONE VOCABULARY, ONE REGISTRY.
 *
 * This map is the only place an environment or target NAME becomes a database.
 * It has to admit every name the governed action layer accepts, because a name
 * that clears governance and then dies here is not a safety control — it is a
 * broken contract, and it presents as an unexplained failure at the worst
 * moment.
 *
 * That is not hypothetical. `database.apply_promoted_migration` validates its
 * `target` against `PRODUCTION_APPLY_TARGETS` and then passes that same target
 * through as the environment. `alloy_deployed_primary` cleared every governed
 * check, reached the apply child, and was refused here as unknown — three
 * production migration attempts, no database ever contacted, and a failure that
 * surfaced as "the outcome could not be established" rather than as "nobody
 * taught the resolver this name". The registry is kept whole instead.
 */
const ENVIRONMENT_TO_CLASS = Object.freeze({
  certification: TARGET_CLASS.CERTIFICATION,
  cert: TARGET_CLASS.CERTIFICATION,
  staging: TARGET_CLASS.STAGING,
  // The registered deployed primary, named as `database.apply_promoted_migration`
  // and `database.repair_migration_ledger` name it. Kept in step with
  // PRODUCTION_APPLY_TARGETS / LEDGER_REPAIR_TARGETS by test rather than by
  // import: those lists answer "which action may touch this", which is a
  // different question from "which database is this", and an import between
  // them would be a cycle.
  alloy_deployed_primary: TARGET_CLASS.DEPLOYED_PRIMARY,
});

/**
 * Hosts that mean "this is a developer machine, not deployed infrastructure".
 * Deliberately an allowlist: a new local alias is a deliberate addition, whereas
 * a denylist of deployed hostnames is one forgotten provider away from wrong.
 */
const LOCAL_HOSTS = Object.freeze(["127.0.0.1", "localhost", "::1", "0.0.0.0"]);

/**
 * The certification stack's Postgres port.
 *
 * The migration runner speaks psql, so this is the DATABASE port and never the
 * Kong/API port — a URL pointing at the API gateway would fail in a way that
 * looks like a credential problem.
 */
export const CERTIFICATION_DB_PORT = 54422;

export function normalizeEnvironmentName(environment) {
  return String(environment ?? "").trim().toLowerCase();
}

/** Parse a connection URL into just the parts needed to judge it. No secrets. */
export function describeConnection(url) {
  const raw = String(url ?? "");
  if (!raw) return { ok: false, code: "connection_source_empty" };
  const match = /^[a-z+]+:\/\/(?:[^@/]*@)?([^/:?]+)(?::(\d+))?/i.exec(raw);
  if (!match) return { ok: false, code: "connection_source_unparseable" };
  const host = match[1];
  const port = match[2] ? Number(match[2]) : null;
  return { ok: true, host, port, isLocal: LOCAL_HOSTS.includes(host) };
}

/**
 * Resolve the target class for a requested environment.
 *
 * Returns a refusal rather than a default: "I do not know what database this
 * means" must never resolve to whichever one was configured.
 */
export function resolveTrustedDatabaseTarget(environment, { repoRoot = null } = {}) {
  const env = normalizeEnvironmentName(environment);
  if (!env) {
    return { ok: false, code: "target_resolution_failed", detail: "No environment was supplied." };
  }
  const targetClass = ENVIRONMENT_TO_CLASS[env];
  if (!targetClass) {
    return {
      ok: false,
      code: "target_resolution_failed",
      detail: `environment '${env}' has no registered database target`,
    };
  }

  if (targetClass === TARGET_CLASS.CERTIFICATION) {
    // The sanctioned local stack, named by the same workdir `alloy-stack` owns.
    const workdir = repoRoot ? join(repoRoot, "certification") : null;
    return {
      ok: true,
      environment: env,
      targetClass,
      // Human-readable and secret-free; safe to record in an audit row.
      targetId: `alloy-cert@127.0.0.1:${CERTIFICATION_DB_PORT}`,
      connectionSourceKind: "local_certification_stack",
      expectedHostIsLocal: true,
      expectedPort: CERTIFICATION_DB_PORT,
      workdir: workdir && existsSync(workdir) ? workdir : null,
    };
  }

  if (targetClass === TARGET_CLASS.DEPLOYED_PRIMARY) {
    return {
      ok: true,
      environment: env,
      targetClass,
      targetId: "deployed_primary",
      connectionSourceKind: "trusted_server_env",
      expectedHostIsLocal: false,
      expectedPort: null,
      workdir: null,
    };
  }

  return {
    ok: true,
    environment: env,
    targetClass,
    targetId: "deployed_staging",
    connectionSourceKind: "trusted_server_env",
    expectedHostIsLocal: false,
    expectedPort: null,
    workdir: null,
  };
}

/**
 * The guard. Prove the connection actually matches the class before any SQL.
 *
 * This is the check that would have stopped the incident: the request said
 * certification, the resolved URL was a deployed pooler, and nothing compared
 * the two.
 */
export function assertTargetMatchesEnvironment(environment, connectionUrl, { repoRoot = null } = {}) {
  const env = normalizeEnvironmentName(environment);
  const target = resolveTrustedDatabaseTarget(environment, { repoRoot });
  if (!target.ok) return target;

  const conn = describeConnection(connectionUrl);
  if (!conn.ok) {
    return { ok: false, code: "target_assertion_failed", detail: `Connection source is unusable: ${conn.code}`, target };
  }

  if (target.targetClass === TARGET_CLASS.CERTIFICATION) {
    if (!conn.isLocal) {
      return {
        ok: false,
        code: "target_environment_mismatch",
        detail: `certification requested but the resolved database host '${conn.host}' is not local`,
        target,
      };
    }
    if (conn.port !== target.expectedPort) {
      return {
        ok: false,
        code: "target_environment_mismatch",
        detail: `certification requested but the resolved database port ${conn.port ?? "<none>"} is not ${target.expectedPort}`,
        target,
      };
    }
    return { ok: true, target, host: conn.host, port: conn.port };
  }

  // A DEPLOYED target must not quietly land on the throwaway stack. Applying a
  // migration to a disposable database reports success while changing nothing
  // that matters — the quieter and more expensive half of the same bug.
  if (conn.isLocal && conn.port === CERTIFICATION_DB_PORT) {
    return {
      ok: false,
      code: "target_environment_mismatch",
      detail: `${env} requested but the resolved database is the local certification stack`,
      target,
    };
  }
  return { ok: true, target, host: conn.host, port: conn.port };
}
