/**
 * OPERATION AUTHORITY for `test:qa:financials-isolated` — the child-side check (QAFX-AUTH-01, Financials H4).
 *
 * The product's copy of the toolkit's `verifyFixtureAuthority` (`lib/isolated-fixture-execution.mjs`, A741
 * candidate bab9c92752479ded535f86e152246e1ae935b349): same schema, same refusal codes, same order. A
 * product module must not import host toolkit code, so the contract is restated here and pinned by test.
 *
 * WHAT IS CHECKED. The executor's state root is resolved HERE, from the OS account's home directory
 * (`os.userInfo()`, the passwd entry — not `$HOME`) at the depth the toolkit's `gatewayStateRoot()` uses by
 * default. Nothing in the child's environment names a root, and nothing in it is taken as one. Then:
 *   1. `ALLOY_QA_AUTHORITY_FILE` is a file directly inside `<root>/vacilando/isolated-fixture/authority/`,
 *      by real path (a symlink into the directory pointing elsewhere is refused);
 *   2. the executor's own request record `requests/<request_id>.json` in the same root is `in_flight`,
 *      carries the same binding digest, names this exact file, and records a sha256 equal to the bytes
 *      read. The environment's `ALLOY_QA_AUTHORITY_SHA256`, if present, must agree — it never stands in
 *      for the request record's;
 *   3. the record's schema holds, `issued_at <= now < expires_at`, and request / fixture / operation /
 *      QA run / environment / candidate / binding digest equal the child's environment;
 *   4. what THIS program is, from the program itself: its own npm script name, the suite, the pinned
 *      package.json script body (its sha256 equals the record's `script_sha256`), and the exact candidate
 *      (the record's `candidate_sha` is this checkout's HEAD);
 *   5. the fixture organization is the one the executor bound from the environment's seed manifest
 *      (`ALLOY_CERT_FIXTURE_ORG_ID`, source `seed_manifest`) and is exactly the certification seed org —
 *      never a persona org, never Firefly, never a shared-stack fallback.
 *
 * THE BOUNDARY, STATED. The executor and this child run as the same OS user, and no credential passes
 * between them, so nothing here authenticates an issuer cryptographically. This refuses a manual run, a
 * copied environment, a hand-written record anywhere, a replay after the execution, and a record for
 * another request, operation, suite or candidate. A same-user process that rewrites the executor's own
 * store (request and authority together) is tampering with Vacilando state, outside what a child can
 * detect; it is not claimed.
 *
 * Every refusal names a code and fields, never a value read from the record or the environment.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { userInfo } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export const FIXTURE_AUTHORITY_SCHEMA = "vacilando.isolated_fixture_authority.v1";
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
    /* Financials-only: the bound fixture organization is not the isolated certification seed org. */
    ORG: "fixture_authority_org_not_the_seed_org",
});

/** What this program is. Restated from the toolkit registry entry `financials_isolated_tests`. */
export const FINANCIALS_ISOLATED_PROGRAM = Object.freeze({
    fixture: "financials_isolated_tests",
    operation: "run",
    suite: "financials",
    npm_script: "test:qa:financials-isolated",
    /* The package.json script body the executor pins by digest (`expectedScriptSha256`). */
    script_body: "node scripts/qa/financialsIsolatedTests.mjs",
});

/** The toolkit's CERTIFICATION_SEED_ORG — the only organization this fixture may act in. */
export const FINANCIALS_FIXTURE_ORG = Object.freeze({
    id: "00000000-0000-4000-8000-000000000001",
    source: "seed_manifest",
});

const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{7,79}$/;
const AUTHORITY_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{7,120}\.json$/;
const SHA_RE = /^[0-9a-f]{40}$/;

const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");

/**
 * The executor's Gateway state root, resolved without the environment: the account's passwd home and the
 * toolkit's default depth (`~/.local/state/alloy-dev/gateway`). `$HOME` and `ALLOY_RUNTIME_ROOT` are
 * caller-controlled in a child and are deliberately not read.
 */
/** @param {{ account?: () => { homedir: string } }} [opts] */
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

/** The pinned script body from this program's own web/package.json, or null. */
export function readOwnScriptBody({ webDir = WEB, readFile = (p) => readFileSync(p, "utf8") } = {}) {
    try {
        const body = JSON.parse(readFile(join(webDir, "package.json")))?.scripts?.[FINANCIALS_ISOLATED_PROGRAM.npm_script];
        return typeof body === "string" ? body : null;
    } catch {
        return null;
    }
}

/** This checkout's HEAD, or null. */
export function readOwnHead({ webDir = WEB } = {}) {
    try {
        const out = execFileSync("git", ["rev-parse", "HEAD"], { cwd: webDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 }).trim().toLowerCase();
        return SHA_RE.test(out) ? out : null;
    } catch {
        return null;
    }
}

/**
 * The child-side check. Returns `{ ok: true, authority }` or `{ ok: false, code, fields? }`.
 *
 * `storeRoot` defaults to the trusted resolution above; tests pass a synthetic root. It is a parameter of
 * the CALLER (code), never a value of `env`.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ storeRoot?: string | null, nowMs?: number, readFile?: (p: string) => string, realpath?: (p: string) => string, readHead?: () => string | null, readScriptBody?: () => string | null }} [opts]
 */
export function verifyFinancialsFixtureAuthority(env = {}, {
    storeRoot = trustedGatewayStoreRoot(),
    nowMs = Date.now(),
    readFile = (p) => readFileSync(p, "utf8"),
    realpath = (p) => realpathSync(p),
    readHead = () => readOwnHead(),
    readScriptBody = () => readOwnScriptBody(),
} = {}) {
    const R = FIXTURE_AUTHORITY_REFUSALS;
    const P = FINANCIALS_ISOLATED_PROGRAM;
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
    if (a?.schema !== FIXTURE_AUTHORITY_SCHEMA) return { ok: false, code: R.SCHEMA };
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
    if (req?.state !== "in_flight" || !a.binding_digest || req.binding_digest !== a.binding_digest || req.authority?.file !== name) {
        return { ok: false, code: R.PROVENANCE };
    }
    if (typeof req.authority?.sha256 !== "string" || req.authority.sha256 !== sha256(text)) return { ok: false, code: R.ALTERED };
    if (env.ALLOY_QA_AUTHORITY_SHA256 && env.ALLOY_QA_AUTHORITY_SHA256 !== req.authority.sha256) return { ok: false, code: R.ALTERED };

    if (!(Date.parse(a.issued_at) <= nowMs)) return { ok: false, code: R.NOT_YET };
    if (!(Date.parse(a.expires_at) > nowMs)) return { ok: false, code: R.EXPIRED };

    /* The executor's binding, as the environment carries it. */
    const fromEnv = [
        ["request_id", env.ALLOY_QA_REQUEST_ID], ["fixture", env.ALLOY_CERT_FIXTURE], ["operation", env.ALLOY_CERT_OPERATION],
        ["qa_run_id", env.ALLOY_QA_RUN_ID], ["environment_id", env.ALLOY_QA_ENVIRONMENT_ID], ["candidate_sha", env.ALLOY_QA_CANDIDATE_SHA],
        ["binding_digest", env.ALLOY_QA_BINDING_DIGEST],
    ];
    /* What this program is — from the program, never from the environment. */
    const body = readScriptBody();
    const fromProgram = [
        ["fixture", P.fixture], ["operation", P.operation], ["suite", P.suite], ["npm_script", P.npm_script],
        ["script_sha256", body === P.script_body ? sha256(body) : null],
        ["candidate_sha", readHead()],
    ];
    const bad = [...new Set([...fromEnv, ...fromProgram].filter(([k, v]) => !v || a[k] !== v).map(([k]) => k))];
    /* Invoked through npm, it must be this script; a different lifecycle event is another program. */
    if (env.npm_lifecycle_event && env.npm_lifecycle_event !== P.npm_script) bad.push("npm_lifecycle_event");
    if (bad.length) return { ok: false, code: R.MISMATCH, fields: bad };

    if (env.ALLOY_CERT_FIXTURE_ORG_ID !== FINANCIALS_FIXTURE_ORG.id || env.ALLOY_CERT_FIXTURE_ORG_SOURCE !== FINANCIALS_FIXTURE_ORG.source) {
        return { ok: false, code: R.ORG };
    }
    return {
        ok: /** @type {const} */ (true),
        authority: {
            request_id: a.request_id, fixture: a.fixture, operation: a.operation, npm_script: a.npm_script,
            candidate_sha: a.candidate_sha, expires_at: a.expires_at, org_id: FINANCIALS_FIXTURE_ORG.id,
        },
    };
}
