/**
 * ISOLATED FIXTURE AUTHORITY v2 — the product child's check, restated from the installed toolkit.
 *
 * Source of truth (not imported: a product module must not import host toolkit code, so the contract is restated
 * here and pinned by the toolkit's own synthetic vectors):
 *   - toolkit `20261031-eeaa6dac6860` (source commit eeaa6dac68600dee8862962decd42b60169523b9):
 *     `lib/isolated-fixture-execution.mjs` verifyAuthorityCore / verifyFixtureAuthorityV2 (QAFX-AUTH-01, INC-A83E-01)
 *     and `lib/fixture-target-contract.mjs` (database identity, connection target, target hold — INC-A83E-01/03);
 *   - contract `docs/architecture/ISOLATED-FIXTURE-AUTHORITY-V2-CONTRACT.md` at that commit;
 *   - vectors `tests/deterministic/fixtures/isolated-fixture-authority-v2.vectors.json` at that commit, vendored as
 *     `web/tests/qa/fixtures/isolated-fixture-authority-v2.vectors.json` (sha256 pinned by the test).
 * Same schemas, same refusal codes, same order. The only additions are product codes that say why a record that
 * is otherwise the executor's still does not authorize THIS program (`fixture_authority_org_unbound`,
 * `fixture_authority_org_not_registered`, `fixture_api_target_*`).
 *
 * WHY v2. `ALLOY_CERT_FIXTURE_ORG_ID` is an environment variable: anyone who can start the child can set it. The
 * v1 authority record names request, run, environment and candidate, but no organization, so under v1 the org
 * the child acts in is not bound to anything the executor issued. The v2 record carries `fixture_org`, and the
 * record is accepted only through live executor state this module locates itself. A v1 record is therefore
 * refused (`fixture_authority_org_unbound`) — never "accepted with the env org" and never "accepted with a
 * built-in seed org".
 *
 * ORDER (all before any credential, client or connection):
 *   1. the executor's store root, resolved HERE from the OS account's passwd home — never `$HOME`, never
 *      `ALLOY_RUNTIME_ROOT`, never any value of the child's environment;
 *   2. the authority file is directly inside `<root>/vacilando/isolated-fixture/authority/` by real path;
 *   3. schema v2 (a v1 record → org_unbound);
 *   4. live provenance: the executor's own `requests/<request_id>.json` is `in_flight`, carries the same binding
 *      digest, names this file and these bytes (a replay after the execution has no live request);
 *   5. window: issued_at <= now < expires_at;
 *   6. binding: request / fixture / operation / run / environment / candidate / binding digest equal the child's
 *      environment, and fixture / operation / suite / npm script / script body digest / candidate equal what THIS
 *      program is (from the program and its checkout, never from the environment);
 *   7. fixture org: the record's org equals `ALLOY_CERT_FIXTURE_ORG_ID` / `_SOURCE`, and is exactly the org the
 *      program's registry entry declares (id, key, source);
 *   8. database identity: names this environment, and the connection target of `DATABASE_URL` with the child's own
 *      environment as the client's equals it (loopback, never the shared stack);
 *   9. target hold: the disposition is for this target and request, and the record it was issued from is STILL that
 *      intact, clear record, re-read from the store this module located;
 *  10. API target: the PostgREST origin the Supabase client will use is the executor's shape
 *      (`http://127.0.0.1:<port>`, never the shared stack's API port). The v2 identity names the Postgres target
 *      only; it does not name this origin, so this step is a guard, not authority (stated, not hidden).
 *
 * THE BOUNDARY, STATED (as the toolkit states it). Executor and child run as the same OS user and no credential
 * passes between them, so nothing here authenticates an issuer cryptographically. This refuses a manual run, a
 * copied environment, a hand-written record anywhere, a replay after the execution, and a record for another
 * request, operation, suite, candidate, organization, database or held target. A same-user process that rewrites
 * the executor's own store (request, authority and hold together, with recomputed hashes) is tampering with
 * Vacilando state and is not claimed.
 *
 * Every refusal is a code and field NAMES, never a value read from the record or the environment.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { userInfo } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export const TOOLKIT_SOURCE = Object.freeze({ artifact: "20261031-eeaa6dac6860", commit: "eeaa6dac68600dee8862962decd42b60169523b9" });

export const FIXTURE_AUTHORITY_SCHEMA_V1 = "vacilando.isolated_fixture_authority.v1";
export const FIXTURE_AUTHORITY_SCHEMA_V2 = "vacilando.isolated_fixture_authority.v2";
export const DATABASE_IDENTITY_SCHEMA = "vacilando.database_identity.v1";
export const TARGET_HOLD_RECORD_SCHEMA = "vacilando.target_hold_record.v1";
export const TARGET_HOLD_DISPOSITION_SCHEMA = "vacilando.target_hold_disposition.v1";

export const FIXTURE_AUTHORITY_REFUSALS = Object.freeze({
    ABSENT: "fixture_authority_absent",
    UNTRUSTED_ROOT: "fixture_authority_store_root_untrusted",
    ORIGIN: "fixture_authority_not_executor_issued",
    PROVENANCE: "fixture_authority_no_live_request",
    ALTERED: "fixture_authority_altered",
    SCHEMA: "fixture_authority_schema",
    EXPIRED: "fixture_authority_expired",
    NOT_YET: "fixture_authority_not_yet_valid",
    MISMATCH: "fixture_authority_mismatch",
    /* product: an executor-issued v1 record carries no organization, so it cannot authorize one */
    ORG_UNBOUND: "fixture_authority_org_unbound",
    /* product: the record's organization is not the one this program's registry entry declares */
    ORG_NOT_REGISTERED: "fixture_authority_org_not_registered",
});

export const FIXTURE_TARGET_REFUSALS = Object.freeze({
    IDENTITY_ABSENT: "database_identity_absent",
    IDENTITY_MALFORMED: "database_identity_malformed",
    IDENTITY_NOT_LOOPBACK: "database_identity_not_loopback",
    IDENTITY_SHARED: "database_identity_shared_target_refused",
    IDENTITY_MISMATCH: "database_identity_mismatch",
    HOLD_ABSENT: "target_hold_record_absent",
    HOLD_UNAVAILABLE: "target_hold_store_unavailable",
    HOLD_REFORGED: "target_hold_record_reforged",
    HOLD_WRONG_TARGET: "target_hold_wrong_target",
    HOLD_INCOMPLETE: "target_hold_record_incomplete",
    HOLD_HELD: "target_hold_held",
    HOLD_CHANGED: "target_hold_changed_since_issue",
    HOLD_DISPOSITION: "target_hold_disposition_invalid",
});

export const CONNECTION_TARGET_REFUSALS = Object.freeze({
    IMPLICIT: "connection_target_implicit",
    OVERRIDE: "connection_target_parameter_override",
    CLIENT_ENV_UNKNOWN: "connection_target_client_env_unknown",
    CLIENT_ENV_OVERRIDE: "connection_target_client_env_override",
});

/* product: the PostgREST origin guard (step 10) */
export const API_TARGET_REFUSALS = Object.freeze({
    MALFORMED: "fixture_api_target_malformed",
    SHARED: "fixture_api_target_shared_refused",
});

/** The shared alloy-cert stack's ports (toolkit CERTIFICATION_DB_PORT; its API port is the stack's own api.port). */
export const SHARED_CERT_DB_PORT = 54422;
export const SHARED_CERT_API_PORT = 54421;

export const CONNECTION_PARAMS_ALLOWED = Object.freeze(["sslmode", "connect_timeout", "application_name"]);
export const CLIENT_ENV_TARGET_KEYS = Object.freeze(["PGHOST", "PGHOSTADDR", "PGPORT", "PGDATABASE", "PGUSER", "PGSERVICE", "PGSERVICEFILE", "PGSYSCONFDIR", "PGOPTIONS", "PGTARGETSESSIONATTRS", "PGLOADBALANCEHOSTS"]);

const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{7,79}$/;
const AUTHORITY_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{7,120}\.json$/;
const TARGET_KEY_RE = /^[a-z0-9][a-z0-9._-]{2,62}$/;
const GAR_RE = /^gar_[0-9a-f]{14}$/;
const SHA40_RE = /^[0-9a-f]{40}$/;
const SHA64_RE = /^[0-9a-f]{64}$/;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Canonical JSON: keys sorted at every depth (toolkit canonicalJson). */
export function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
    return JSON.stringify(value === undefined ? null : value);
}

/* ── store root ─────────────────────────────────────────────────────────────────────────────── */

/**
 * The executor's Gateway state root, resolved without the environment: the account's passwd home at the toolkit's
 * default depth (`~/.local/state/alloy-dev/gateway`). `$HOME` and `ALLOY_RUNTIME_ROOT` are caller-controlled in a
 * child and are deliberately not read.
 * @param {{ account?: () => { homedir: string } }} [opts]
 */
export function trustedGatewayStoreRoot({ account = () => userInfo() } = {}) {
    let home;
    try {
        home = String(account()?.homedir || "");
    } catch {
        return null;
    }
    if (!home.startsWith("/")) return null;
    return join(home, ".local", "state", "alloy-dev", "gateway");
}

const storeDir = (root) => join(root, "vacilando", "isolated-fixture");
const authorityDir = (root) => join(storeDir(root), "authority");
const requestPath = (root, id) => join(storeDir(root), "requests", `${id}.json`);
const holdPath = (root, key) => join(root, "vacilando", "target-holds", `${key}.json`);

/* ── database identity and connection target (toolkit fixture-target-contract.mjs) ──────────── */

/** @returns {{ ok: true, identity: Record<string, unknown> & { digest: string } } | { ok: false, code: string }} */
export function databaseIdentityOf(url, environmentId) {
    const R = FIXTURE_TARGET_REFUSALS;
    const raw = String(url || "").trim();
    if (!raw) return { ok: false, code: R.IDENTITY_ABSENT };
    if (!TARGET_KEY_RE.test(String(environmentId || ""))) return { ok: false, code: R.IDENTITY_MALFORMED };
    let u;
    try {
        u = new URL(raw);
    } catch {
        return { ok: false, code: R.IDENTITY_MALFORMED };
    }
    if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return { ok: false, code: R.IDENTITY_MALFORMED };
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host) return { ok: false, code: R.IDENTITY_MALFORMED };
    const port = u.port ? Number(u.port) : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, code: R.IDENTITY_MALFORMED };
    let database;
    let role;
    try {
        database = decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres";
        role = decodeURIComponent(u.username) || "postgres";
    } catch {
        return { ok: false, code: R.IDENTITY_MALFORMED };
    }
    const body = { schema: DATABASE_IDENTITY_SCHEMA, environment_id: String(environmentId), scheme: "postgres", host, port, database, role };
    return { ok: true, identity: { ...body, digest: sha256(canonicalJson(body)) } };
}

/** @returns {{ ok: true, identity: Record<string, unknown> & { digest: string } } | { ok: false, code: string, fields?: string[] }} */
export function connectionTargetOf(url, environmentId, { clientEnv } = {}) {
    const R = FIXTURE_TARGET_REFUSALS;
    const K = CONNECTION_TARGET_REFUSALS;
    const raw = String(url || "").trim();
    if (!raw) return { ok: false, code: R.IDENTITY_ABSENT };
    if (!clientEnv || typeof clientEnv !== "object" || Array.isArray(clientEnv)) return { ok: false, code: K.CLIENT_ENV_UNKNOWN };
    const envOverrides = CLIENT_ENV_TARGET_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(clientEnv, k) && clientEnv[k] !== undefined);
    if (envOverrides.length) return { ok: false, code: K.CLIENT_ENV_OVERRIDE, fields: envOverrides };
    let u;
    try {
        u = new URL(raw);
    } catch {
        return { ok: false, code: R.IDENTITY_MALFORMED };
    }
    if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return { ok: false, code: R.IDENTITY_MALFORMED };
    if (u.hash || raw.includes("#") || /[,%]/.test(u.host)) return { ok: false, code: R.IDENTITY_MALFORMED };
    const implicit = [["host", u.hostname], ["port", u.port], ["database", u.pathname.replace(/^\//, "")], ["role", u.username]].filter(([, v]) => !v).map(([k]) => k);
    if (implicit.length) return { ok: false, code: K.IMPLICIT, fields: implicit };
    if (u.pathname.slice(1).includes("/")) return { ok: false, code: R.IDENTITY_MALFORMED };
    const overriding = [...new Set(u.searchParams.keys())].filter((p) => !CONNECTION_PARAMS_ALLOWED.includes(p));
    if (overriding.length) return { ok: false, code: K.OVERRIDE, fields: overriding.sort() };
    return databaseIdentityOf(raw, environmentId);
}

/** The gate's identity check: the configuration's target IS the authority's identity, loopback, not the shared stack. */
export function verifyConnectionTarget(authorityIdentity, { url, clientEnv } = {}) {
    const R = FIXTURE_TARGET_REFUSALS;
    if (!authorityIdentity || authorityIdentity.schema !== DATABASE_IDENTITY_SCHEMA || !SHA64_RE.test(String(authorityIdentity.digest || ""))) return { ok: false, code: R.IDENTITY_ABSENT };
    const own = connectionTargetOf(url, authorityIdentity.environment_id, { clientEnv });
    if (!own.ok) return own;
    if (!LOOPBACK.has(own.identity.host)) return { ok: false, code: R.IDENTITY_NOT_LOOPBACK };
    if (own.identity.port === SHARED_CERT_DB_PORT) return { ok: false, code: R.IDENTITY_SHARED };
    if (own.identity.digest !== authorityIdentity.digest) return { ok: false, code: R.IDENTITY_MISMATCH };
    return { ok: true, identity: own.identity };
}

/* ── target hold (toolkit fixture-target-contract.mjs) ──────────────────────────────────────── */

export function targetHoldRecordDigest(rec) {
    const { record_sha256: _omit, ...body } = rec;
    return sha256(canonicalJson(body));
}

function readTargetHoldRecord(root, targetKey, readFile) {
    const R = FIXTURE_TARGET_REFUSALS;
    if (!root || !TARGET_KEY_RE.test(String(targetKey || ""))) return { ok: false, code: R.HOLD_UNAVAILABLE };
    let text;
    try {
        text = readFile(holdPath(root, targetKey));
    } catch (e) {
        return { ok: false, code: /** @type {{ code?: string }} */ (e)?.code === "ENOENT" ? R.HOLD_ABSENT : R.HOLD_UNAVAILABLE };
    }
    try {
        return { ok: true, record: JSON.parse(text) };
    } catch {
        return { ok: false, code: R.HOLD_UNAVAILABLE };
    }
}

function validateTargetHoldRecord(rec, targetKey) {
    const R = FIXTURE_TARGET_REFUSALS;
    if (!rec || rec.schema !== TARGET_HOLD_RECORD_SCHEMA) return { ok: false, code: R.HOLD_REFORGED };
    if (!SHA64_RE.test(String(rec.record_sha256 || "")) || targetHoldRecordDigest(rec) !== rec.record_sha256) return { ok: false, code: R.HOLD_REFORGED };
    if (rec.target_key !== targetKey || rec.scope?.kind !== "target" || rec.scope?.target_key !== targetKey) return { ok: false, code: R.HOLD_WRONG_TARGET };
    if (!["clear", "held"].includes(rec.state)
        || !["operator", "objective"].includes(rec.owner?.kind) || !String(rec.owner?.id || "").trim()
        || !String(rec.evidence?.ref || "").trim() || !GAR_RE.test(String(rec.governed_request_id || ""))
        || !Number.isInteger(rec.revision) || rec.revision < 1) return { ok: false, code: R.HOLD_INCOMPLETE };
    return { ok: true, record: rec };
}

/** The child's re-read: the disposition is for this target and request, and its record is STILL that clear record. */
export function verifyTargetHoldDisposition(disposition, { storeRoot, targetKey, requestId, readFile = (p) => readFileSync(p, "utf8") } = {}) {
    const R = FIXTURE_TARGET_REFUSALS;
    const d = disposition;
    if (!d || d.schema !== TARGET_HOLD_DISPOSITION_SCHEMA || d.state !== "clear"
        || !Number.isInteger(d.record?.revision) || !SHA64_RE.test(String(d.record?.record_sha256 || ""))) return { ok: false, code: R.HOLD_DISPOSITION };
    if (d.target_key !== targetKey) return { ok: false, code: R.HOLD_WRONG_TARGET };
    if (!requestId || d.request_id !== requestId) return { ok: false, code: R.HOLD_DISPOSITION };
    const read = readTargetHoldRecord(storeRoot, targetKey, readFile);
    if (!read.ok) return read;
    const v = validateTargetHoldRecord(read.record, targetKey);
    if (!v.ok) return v;
    if (v.record.state !== "clear") return { ok: false, code: R.HOLD_HELD };
    if (v.record.revision !== d.record.revision || v.record.record_sha256 !== d.record.record_sha256) return { ok: false, code: R.HOLD_CHANGED };
    return { ok: true };
}

/* ── the program's own facts ────────────────────────────────────────────────────────────────── */

/** The script body this program's own web/package.json declares for `npmScript`, or null. */
export function readOwnScriptBody(npmScript, { webDir = WEB, readFile = (p) => readFileSync(p, "utf8") } = {}) {
    try {
        const body = JSON.parse(readFile(join(webDir, "package.json")))?.scripts?.[npmScript];
        return typeof body === "string" ? body : null;
    } catch {
        return null;
    }
}

/** This checkout's HEAD, or null. */
export function readOwnHead({ webDir = WEB } = {}) {
    try {
        const out = execFileSync("git", ["rev-parse", "HEAD"], { cwd: webDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 }).trim().toLowerCase();
        return SHA40_RE.test(out) ? out : null;
    } catch {
        return null;
    }
}

/** Step 10: the PostgREST origin is the executor's shape and never the shared stack's API. */
export function verifyApiTarget(raw) {
    const A = API_TARGET_REFUSALS;
    let u;
    try {
        u = new URL(String(raw ?? ""));
    } catch {
        return { ok: false, code: A.MALFORMED };
    }
    if (u.protocol !== "http:" || u.hostname !== "127.0.0.1" || !u.port || u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return { ok: false, code: A.MALFORMED };
    if (Number(u.port) === SHARED_CERT_API_PORT) return { ok: false, code: A.SHARED };
    return { ok: true };
}

/* ── the check ──────────────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {{ fixture: string, operation: string, suite: string, npm_script: string, script_body: string }} FixtureProgram
 * @typedef {{ id: string, key: string, source: string }} RegisteredFixtureOrg
 * @typedef {{
 *   request_id: string, qa_run_id: string, environment_id: string, candidate_sha: string, expires_at: string,
 *   org_id: string, org_key: string, database_identity_digest: string, hold_revision: number
 * }} VerifiedFixtureAuthority
 * @typedef {{ ok: true, authority: VerifiedFixtureAuthority } | { ok: false, code: string, fields?: string[] }} FixtureAuthorityVerdict
 */

/**
 * Steps 1–10. `program` and `org` are what the caller IS (code); `storeRoot`, `readHead` and `readScriptBody`
 * default to the trusted resolutions above and are parameters for tests only — never values of `env`.
 *
 * @param {Readonly<Record<string, string | undefined>>} env
 * @param {{ program: FixtureProgram, org: RegisteredFixtureOrg, storeRoot?: string | null, nowMs?: number,
 *   readFile?: (p: string) => string, realpath?: (p: string) => string, readHead?: () => string | null,
 *   readScriptBody?: () => string | null }} opts
 * @returns {FixtureAuthorityVerdict}
 */
export function verifyIsolatedFixtureAuthorityV2(env, {
    program,
    org,
    storeRoot = trustedGatewayStoreRoot(),
    nowMs = Date.now(),
    readFile = (p) => readFileSync(p, "utf8"),
    realpath = (p) => realpathSync(p),
    readHead = () => readOwnHead(),
    readScriptBody = () => readOwnScriptBody(program.npm_script),
}) {
    const R = FIXTURE_AUTHORITY_REFUSALS;
    if (!storeRoot) return { ok: false, code: R.UNTRUSTED_ROOT };
    const path = String(env.ALLOY_QA_AUTHORITY_FILE || "");
    if (!path) return { ok: false, code: R.ABSENT };
    const name = basename(path);
    if (!AUTHORITY_FILE_RE.test(name)) return { ok: false, code: R.ORIGIN };
    let real;
    let dir;
    try {
        real = realpath(path);
        dir = realpath(authorityDir(storeRoot));
    } catch {
        return { ok: false, code: R.ABSENT };
    }
    if (real !== join(dir, name)) return { ok: false, code: R.ORIGIN };
    let text;
    try {
        text = readFile(real);
    } catch {
        return { ok: false, code: R.ABSENT };
    }
    let a;
    try {
        a = JSON.parse(text);
    } catch {
        return { ok: false, code: R.ALTERED };
    }
    if (a?.schema === FIXTURE_AUTHORITY_SCHEMA_V1) return { ok: false, code: R.ORG_UNBOUND };
    if (a?.schema !== FIXTURE_AUTHORITY_SCHEMA_V2) return { ok: false, code: R.SCHEMA };
    if (!REQUEST_ID_RE.test(String(a.request_id || ""))) return { ok: false, code: R.SCHEMA };
    /* The executor names its records `<request id>.<random>.json`. */
    if (!name.startsWith(`${a.request_id}.`)) return { ok: false, code: R.ORIGIN };

    /* Live provenance: the executor's own in-flight request names this file and these bytes. */
    let req;
    try {
        req = JSON.parse(readFile(requestPath(storeRoot, a.request_id)));
    } catch {
        return { ok: false, code: R.PROVENANCE };
    }
    if (req?.state !== "in_flight" || !a.binding_digest || req.binding_digest !== a.binding_digest || req.authority?.file !== name) return { ok: false, code: R.PROVENANCE };
    if (typeof req.authority?.sha256 !== "string" || req.authority.sha256 !== sha256(text)) return { ok: false, code: R.ALTERED };
    if (env.ALLOY_QA_AUTHORITY_SHA256 && env.ALLOY_QA_AUTHORITY_SHA256 !== req.authority.sha256) return { ok: false, code: R.ALTERED };

    if (!(Date.parse(a.issued_at) <= nowMs)) return { ok: false, code: R.NOT_YET };
    if (!(Date.parse(a.expires_at) > nowMs)) return { ok: false, code: R.EXPIRED };

    const fromEnv = [
        ["request_id", env.ALLOY_QA_REQUEST_ID], ["fixture", env.ALLOY_CERT_FIXTURE], ["operation", env.ALLOY_CERT_OPERATION],
        ["qa_run_id", env.ALLOY_QA_RUN_ID], ["environment_id", env.ALLOY_QA_ENVIRONMENT_ID], ["candidate_sha", env.ALLOY_QA_CANDIDATE_SHA],
        ["binding_digest", env.ALLOY_QA_BINDING_DIGEST],
    ];
    const body = readScriptBody();
    const fromProgram = [
        ["fixture", program.fixture], ["operation", program.operation], ["suite", program.suite], ["npm_script", program.npm_script],
        ["script_sha256", body === program.script_body ? sha256(body) : null],
        ["candidate_sha", readHead()],
    ];
    const bad = [...new Set([...fromEnv, ...fromProgram].filter(([k, v]) => !v || a[k] !== v).map(([k]) => /** @type {string} */ (k)))];
    /* Invoked through npm, it must be this script; another lifecycle event is another program. */
    if (env.npm_lifecycle_event && env.npm_lifecycle_event !== program.npm_script) bad.push("npm_lifecycle_event");
    if (bad.length) return { ok: false, code: R.MISMATCH, fields: bad };

    /* The organization: the executor's record, the environment's copy of it, and this program's registry entry. */
    const fo = a.fixture_org;
    if (!fo?.id || env.ALLOY_CERT_FIXTURE_ORG_ID !== fo.id || env.ALLOY_CERT_FIXTURE_ORG_SOURCE !== fo.source) return { ok: false, code: R.MISMATCH, fields: ["fixture_org"] };
    if (fo.id !== org.id || fo.key !== org.key || fo.source !== org.source) return { ok: false, code: R.ORG_NOT_REGISTERED };

    /* Which database, from the configuration this child holds. */
    if (a.database_identity?.environment_id !== a.environment_id) return { ok: false, code: R.MISMATCH, fields: ["database_identity"] };
    const id = verifyConnectionTarget(a.database_identity, { url: env.DATABASE_URL, clientEnv: env });
    if (!id.ok) return id;

    /* The target is clear, from the record the disposition names, re-read now. */
    const hold = verifyTargetHoldDisposition(a.target_hold_disposition, { storeRoot, targetKey: a.environment_id, requestId: a.request_id, readFile });
    if (!hold.ok) return hold;

    /* The PostgREST origin (a guard: the v2 identity names the Postgres target, not this origin). */
    const api = verifyApiTarget(env.SUPABASE_URL);
    if (!api.ok) return api;

    return {
        ok: true,
        authority: {
            request_id: a.request_id, qa_run_id: a.qa_run_id, environment_id: a.environment_id, candidate_sha: a.candidate_sha,
            expires_at: a.expires_at, org_id: fo.id, org_key: fo.key, database_identity_digest: id.identity.digest,
            hold_revision: a.target_hold_disposition.record.revision,
        },
    };
}

/* ── the Enrollment program (registry entry `enrollment_isolated_tests`, toolkit eeaa6dac6860) ── */

export const ENROLLMENT_ISOLATED_PROGRAM = Object.freeze({
    fixture: "enrollment_isolated_tests",
    operation: "run",
    suite: "enrollment",
    npm_script: "test:qa:enrollment-isolated",
    script_body: "node scripts/qaEnrollmentIsolatedTests.mjs",
});

/** The entry's declared `fixture_org` (SEED_ORG = CERTIFICATION_SEED_ORG, binding seed_manifest). An expectation, never a fallback. */
export const ENROLLMENT_REGISTERED_FIXTURE_ORG = Object.freeze({
    id: "00000000-0000-4000-8000-000000000001",
    key: "certification_seed",
    source: "seed_manifest",
});

/**
 * @param {Readonly<Record<string, string | undefined>>} env
 * @param {Omit<Parameters<typeof verifyIsolatedFixtureAuthorityV2>[1], "program" | "org">} [opts]
 * @returns {FixtureAuthorityVerdict}
 */
export function verifyEnrollmentFixtureAuthority(env, opts = {}) {
    return verifyIsolatedFixtureAuthorityV2(env, { ...opts, program: ENROLLMENT_ISOLATED_PROGRAM, org: ENROLLMENT_REGISTERED_FIXTURE_ORG });
}
