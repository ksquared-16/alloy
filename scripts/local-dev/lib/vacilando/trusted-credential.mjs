/**
 * S4 — the trusted credential binding.
 *
 * WHAT THIS IS FOR. S3 established that an environment is canonical only when
 * it names a DISTINCT credential binding, and that `development_certification`
 * had none. This is the store and resolver for that binding — the mechanism by
 * which a trusted executor obtains database authority that no feature lane can
 * reach.
 *
 * THE ONE RULE. Exactly one function in this module can read a secret value,
 * and it exists to hand that value to a child process environment. Everything
 * else — status, metadata, audit, durable records — deals in the REFERENCE.
 * A module where any caller can ask for the value is a module that will
 * eventually log one.
 *
 * WHY A REFERENCE AND NOT A VALUE, EVERYWHERE ELSE. Governed-action inputs,
 * dependency records, run records and audit trails are all readable by workers
 * and are all durable. A credential that reaches any of them has escaped,
 * whatever the intent was. So the durable artefact is always
 * `trusted_secret:<name>` and never the thing it points at.
 *
 * WHAT PREVENTS A FEATURE LANE FROM READING IT. The store lives outside every
 * worktree, at 0600 under a 0700 directory owned by the operator. No lane-
 * reachable command reads it — the resolver refuses unless the caller declares
 * itself the trusted executor path, and the value is injected into a child
 * environment that unsets the inherited database variables first, so a provider
 * process cannot inherit it either.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const TRUSTED_CREDENTIAL_SCHEMA = "vacilando.trusted_credential.v1";

export const CREDENTIAL_FILE_MODE = 0o600;
export const CREDENTIAL_DIR_MODE = 0o700;

/** A reference is a NAME. It is safe to log, store and show an operator. */
export const REFERENCE_RE = /^trusted_secret:[a-z][a-z0-9_]{2,63}$/;

export function referenceIsWellFormed(ref) {
  return REFERENCE_RE.test(String(ref || ""));
}

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim() || join(homedir(), ".local", "state", "alloy-dev");
}

export function credentialDir(root = runtimeRoot()) {
  return join(root, "vacilando", "trusted-secrets");
}

export function credentialPaths(ref, root = runtimeRoot()) {
  const name = String(ref || "").replace(/^trusted_secret:/, "");
  return {
    meta: join(credentialDir(root), `${name}.json`),
    value: join(credentialDir(root), `${name}.env`),
  };
}

/**
 * The invariants, stated so they can be asserted rather than believed.
 */
export const CREDENTIAL_ISOLATION = Object.freeze({
  schema_version: TRUSTED_CREDENTIAL_SCHEMA,
  store_location: "the Vacilando runtime root, outside every git worktree",
  file_mode: "0600 under a 0700 directory",
  readable_by: "the trusted executor path only",
  durable_records_contain: "the reference, never the value",
  child_environment: "value injected into the executor child only, after inherited DATABASE_URL / PGPASSWORD / SUPABASE_SERVICE_ROLE_KEY are unset",
  provider_inheritance: false,
  output_handling: "database URLs are redacted from stdout and stderr before anything is stored",
});

/** Variables an executor child must never inherit from the calling environment. */
export const SCRUBBED_INHERITED_VARS = Object.freeze([
  "DATABASE_URL", "PGPASSWORD", "PGSERVICE", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL",
]);

// ── Metadata: safe for anyone ────────────────────────────────────────────────

/**
 * Everything ABOUT a credential, and nothing OF it.
 *
 * Deliberately cannot return the value even by accident: it reads the metadata
 * file, which never contains one.
 */
export function readCredentialMetadata(ref, { root = runtimeRoot() } = {}) {
  if (!referenceIsWellFormed(ref)) return { ok: false, error: "malformed_reference" };
  const { meta, value } = credentialPaths(ref, root);
  if (!existsSync(meta)) return { ok: false, error: "binding_absent", reference: ref };
  let parsed = null;
  try { parsed = JSON.parse(readFileSync(meta, "utf8")); } catch { return { ok: false, error: "binding_unreadable", reference: ref }; }
  let mode = null;
  let valuePresent = false;
  try { valuePresent = existsSync(value); mode = valuePresent ? (statSync(value).mode & 0o777) : null; } catch { /* reported as unknown */ }
  return {
    ok: true,
    reference: ref,
    environment: parsed.environment ?? null,
    kind: parsed.kind ?? null,
    host_class: parsed.host_class ?? null,
    created_at: parsed.created_at ?? null,
    value_present: valuePresent,
    value_mode: mode,
    // If this is ever true, something has written a secret into metadata.
    metadata_contains_secret: metadataLooksLikeSecret(parsed),
  };
}

const SECRET_SHAPE = /postgres(?:ql)?:\/\/|password\s*=|eyJ[A-Za-z0-9_-]{20,}\./i;

export function metadataLooksLikeSecret(parsed) {
  try { return SECRET_SHAPE.test(JSON.stringify(parsed ?? {})); } catch { return false; }
}

/**
 * Is this binding usable for this environment, right now?
 *
 * The environment check is the point: a credential registered for
 * `certification` must never satisfy `development_certification`, however
 * similar the names look and however tempting reuse would be.
 */
export function credentialBindingStatus(ref, { environment = null, root = runtimeRoot() } = {}) {
  const meta = readCredentialMetadata(ref, { root });
  if (!meta.ok) return { ok: false, refusal: meta.error, reference: ref };
  if (!meta.value_present) return { ok: false, refusal: "credential_value_absent", reference: ref, environment: meta.environment };
  if (meta.value_mode != null && meta.value_mode !== CREDENTIAL_FILE_MODE) {
    return { ok: false, refusal: "credential_permissions_too_open", reference: ref, mode: meta.value_mode };
  }
  if (environment && meta.environment !== environment) {
    return {
      ok: false, refusal: "environment_binding_mismatch", reference: ref,
      bound_to: meta.environment, requested: environment,
      detail: `${ref} is bound to ${meta.environment}; it cannot satisfy ${environment}`,
    };
  }
  return { ok: true, reference: ref, environment: meta.environment, kind: meta.kind };
}

// ── The one reader ───────────────────────────────────────────────────────────

/**
 * Read the value, for injection into an executor child. Nothing else may call this.
 *
 * `callerIsTrustedExecutor` is required and must be passed explicitly: a
 * default would make this reachable by omission, and the whole isolation
 * argument rests on it being unreachable by accident. The return carries the
 * value under `env`, which the caller passes straight to spawn — it is never
 * returned as a bare string that could be interpolated into a message.
 */
export function resolveForExecutorChild(ref, {
  environment = null,
  root = runtimeRoot(),
  callerIsTrustedExecutor = false,
  envVar = "DATABASE_URL",
} = {}) {
  if (callerIsTrustedExecutor !== true) {
    return { ok: false, refusal: "caller_is_not_trusted_executor", reference: ref };
  }
  const status = credentialBindingStatus(ref, { environment, root });
  if (!status.ok) return { ...status, ok: false };
  const { value } = credentialPaths(ref, root);
  let text = "";
  try { text = readFileSync(value, "utf8"); } catch { return { ok: false, refusal: "credential_unreadable", reference: ref }; }
  const line = text.split("\n").map((l) => l.trim()).find((l) => l.startsWith(`${envVar}=`));
  if (!line) return { ok: false, refusal: "credential_missing_variable", reference: ref, expected: envVar };
  const secret = line.slice(envVar.length + 1).replace(/^["']|["']$/g, "");
  if (!secret) return { ok: false, refusal: "credential_empty", reference: ref };
  return {
    ok: true,
    reference: ref,
    environment: status.environment,
    // The ONLY place a value exists, shaped for spawn and nothing else.
    env: { [envVar]: secret },
    // What the caller may safely record.
    durable_record: { credential_reference: ref, environment: status.environment },
  };
}

/**
 * The environment an executor child should be given.
 *
 * Inherited database variables are removed BEFORE the resolved one is added, so
 * a stale ambient DATABASE_URL can never survive alongside — or worse, instead
 * of — the environment-bound credential.
 */
export function executorChildEnv(baseEnv, resolved) {
  const out = { ...baseEnv };
  for (const v of SCRUBBED_INHERITED_VARS) delete out[v];
  for (const v of PG_DERIVED_VARS) delete out[v];
  if (resolved?.ok) {
    Object.assign(out, resolved.env);
    // psql does NOT read DATABASE_URL. Passing the URL as `-d <url>` would work
    // and would also put the credential in the process listing, which is
    // exactly what this module exists to prevent. The libpq PG* variables are
    // read natively and live only in the child's environment.
    Object.assign(out, pgVarsFromUrl(resolved.env[Object.keys(resolved.env)[0]]));
  }
  return out;
}

/** libpq variables derived from a connection URL. Environment only, never argv. */
export const PG_DERIVED_VARS = Object.freeze(["PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGPASSWORD", "PGSSLMODE"]);

export function pgVarsFromUrl(url) {
  let u = null;
  try { u = new URL(String(url || "")); } catch { return {}; }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return {};
  const out = {};
  if (u.hostname) out.PGHOST = decodeURIComponent(u.hostname);
  if (u.port) out.PGPORT = u.port;
  if (u.username) out.PGUSER = decodeURIComponent(u.username);
  if (u.password) out.PGPASSWORD = decodeURIComponent(u.password);
  const db = u.pathname.replace(/^\//, "");
  if (db) out.PGDATABASE = decodeURIComponent(db);
  const ssl = u.searchParams.get("sslmode");
  if (ssl) out.PGSSLMODE = ssl;
  return out;
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Write a binding.
 *
 * The value arrives from a provider function so it never has to be a parameter
 * anyone can see in a call site, a shell history, or a process listing. The
 * metadata file is written separately and is asserted to contain no secret
 * shape before either file lands.
 */
export function registerCredential({
  reference,
  environment,
  kind = "postgres_url",
  hostClass = null,
  readValue = null,
  root = runtimeRoot(),
  now = Date.now(),
} = {}) {
  if (!referenceIsWellFormed(reference)) return { ok: false, error: "malformed_reference" };
  if (!environment) return { ok: false, error: "environment_required" };
  if (typeof readValue !== "function") return { ok: false, error: "no_value_provider" };

  const secret = readValue();
  if (!secret || typeof secret !== "string" || !secret.trim()) return { ok: false, error: "empty_value" };

  const meta = {
    schema_version: TRUSTED_CREDENTIAL_SCHEMA,
    reference,
    environment,
    kind,
    host_class: hostClass,
    created_at: new Date(now).toISOString(),
  };
  if (metadataLooksLikeSecret(meta)) return { ok: false, error: "metadata_would_contain_secret" };

  const paths = credentialPaths(reference, root);
  mkdirSync(dirname(paths.meta), { recursive: true, mode: CREDENTIAL_DIR_MODE });
  try { chmodSync(dirname(paths.meta), CREDENTIAL_DIR_MODE); } catch { /* pre-existing dir */ }

  const tmp = `${paths.value}.${process.pid}.tmp`;
  writeFileSync(tmp, `DATABASE_URL=${secret}\n`, { mode: CREDENTIAL_FILE_MODE });
  chmodSync(tmp, CREDENTIAL_FILE_MODE);
  renameSync(tmp, paths.value);
  chmodSync(paths.value, CREDENTIAL_FILE_MODE);

  writeFileSync(paths.meta, `${JSON.stringify(meta, null, 2)}\n`, { mode: CREDENTIAL_FILE_MODE });
  chmodSync(paths.meta, CREDENTIAL_FILE_MODE);

  // Return the REFERENCE and the metadata. Never an echo of what was written.
  return { ok: true, reference, environment, kind, created_at: meta.created_at, value_mode: CREDENTIAL_FILE_MODE };
}

// ── Redaction ────────────────────────────────────────────────────────────────

const URL_SHAPE = /\b(postgres(?:ql)?:\/\/)[^\s"']+/gi;

/** Scrub anything URL-shaped before it is stored, shown or logged. */
export function redactDatabaseUrls(text) {
  return String(text ?? "").replace(URL_SHAPE, "$1[redacted]");
}

// ── Reachability proof ───────────────────────────────────────────────────────

/**
 * Is the store outside every worktree a feature lane can see?
 *
 * A lane's provider runs inside its worktree. If the credential store were ever
 * placed under one — or under the canonical checkout — a lane could read it
 * with an ordinary file read and no policy would have been violated on the way.
 */
export function storeIsOutsideWorktrees(root = runtimeRoot(), {
  worktreeRoots = [join(homedir(), "Code", "alloy-worktrees"), join(homedir(), "Alloy")],
} = {}) {
  const dir = resolve(credentialDir(root));
  const offenders = worktreeRoots
    .map((w) => resolve(w))
    .filter((w) => dir === w || dir.startsWith(`${w}/`));
  return { ok: offenders.length === 0, dir, offenders };
}

// ── Result parsing ───────────────────────────────────────────────────────────

/**
 * Count only real result rows.
 *
 * THE DEFECT THIS EXISTS FOR. The first verification probe bound its subject
 * with a PREPARE/EXECUTE pair, and psql echoed the command tag `PREPARE` to
 * stdout. The parser counted that non-empty line as a row, so EVERY probe
 * returned present=true — including `table_that_certainly_does_not_exist_xyz`.
 * It was caught by a negative control, not by the code, and it is precisely the
 * false positive that once told a Director a missing table had landed.
 *
 * Requiring a marker column makes the mistake structurally impossible: a psql
 * command tag, a NOTICE, a blank line or a row-count footer can never begin
 * with it, so only a row the query itself produced is ever counted.
 */
export const ROW_MARKER = "VACROW";

export function parseMarkedRows(stdout, { marker = ROW_MARKER, separator = "|" } = {}) {
  return String(stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => l.startsWith(marker + separator))
    .map((l) => ({ columns: l.split(separator).slice(1) }));
}
