/**
 * OPERATION AUTHORITY for the Surfaces c4 room-Uses fixture runners — the child-side check.
 *
 * WHY. A provider seat ran this fixture's SQL directly against the shared alloy-cert stack while a live hold
 * applied to every lane. The runners loaded dotenv, took QA_RUN_ID on syntax alone and connected to whatever
 * DATABASE_URL they were handed: nothing an executor issued was required. This module is what they now
 * require, and every refusal happens before any env file is loaded, any client is resolved or any
 * connection is attempted.
 *
 * NOT A NEW FRAMEWORK. Steps 1–10 are the shared product restatement of the installed toolkit's authority v2
 * (`./isolatedFixtureAuthorityV2.mjs`, vendored byte-for-byte from the Enrollment and Financials sprints, git blob
 * 20f04ade…, toolkit 20261031-eeaa6dac6860): the executor store root from the passwd home, the authority file by
 * real path, schema v2 (a v1 record → org_unbound), a live in-flight request naming these bytes, the window, the
 * exact binding of request / fixture / operation / run / environment / candidate / digest / npm script / script
 * body / HEAD, the record's organization equal to the environment's AND this registry entry's, the database
 * identity against DATABASE_URL with the child's own environment as the client's, the target-hold disposition
 * re-read from the store, and the PostgREST origin. Surfaces adds only what its registry entry says about THIS
 * program, after those:
 *
 *   11. `mutating` in the (verified) record is this program's;
 *   12. the fixture SQL bytes are the pinned bytes, on disk AND committed at the authorized candidate;
 *   13. the QA run is a real OPEN, unexpired, local run in the executor's ledger for that environment — not a
 *       `qar_…` string — and the persona the executor bound is QA Shared's;
 *   14. the target is never the shared alloy-cert stack (the shared check refuses its port as well).
 *
 * Then, immediately before psql starts, the CONNECTION GATE (`attestSurfacesConnection` / `runAttested`): every
 * step above again (a replay after the execution, or a hold transition, refuses), and the connection target of
 * the EXACT final URL and client environment psql will be handed equals the authority's database identity.
 *
 * THE BOUNDARY, STATED. Executor and child run as the same OS user; nothing here authenticates an issuer
 * cryptographically, and a same-user process rewriting the executor's store is out of reach. This guard
 * only governs THESE runners: it cannot stop anyone with credentials running SQL directly. The
 * connectivity/credential boundary is the platform owner's.
 *
 * Every refusal names a code and fields, never a value read from the record or the environment.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    DATABASE_IDENTITY_SCHEMA,
    FIXTURE_AUTHORITY_REFUSALS as SHARED_REFUSALS,
    trustedGatewayStoreRoot,
    verifyConnectionTarget,
    verifyIsolatedFixtureAuthorityV2,
} from "./isolatedFixtureAuthorityV2.mjs";

export { trustedGatewayStoreRoot };

const WEB = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ROOT = resolve(WEB, "..");

export const FIXTURE_AUTHORITY_REFUSALS = Object.freeze({
    ...SHARED_REFUSALS,
    /* Surfaces: not one of this fixture's registered programs. */
    PROGRAM: "fixture_authority_program_unregistered",
    /* Surfaces: the SQL on disk is not the pinned bytes committed at the authorized candidate. */
    SQL: "fixture_authority_sql_unpinned",
    /* Surfaces: the run is not an OPEN, unexpired, local run of the executor's ledger for this environment. */
    QA_RUN: "fixture_authority_qa_run_unverified",
    /* Surfaces: the persona the executor bound is not QA Shared's. */
    PERSONA_ORG: "fixture_authority_persona_org_unverified",
    /* Surfaces: the shared alloy-cert stack is never this fixture's target. */
    SHARED_TARGET: "fixture_authority_shared_target_refused",
});

/** A741 `QA_ORGS.qa_shared` — the only organization this fixture acts in. */
export const QA_SHARED_ORG_ID = "4acc9386-c485-486f-aa1f-05d83499d142";
/**
 * The registry entries' declared organization (`fixture_org: PERSONA`, `required_org_key: "qa_shared"`): what the
 * executor's `resolveFixtureOrg` issues for a QA Shared persona. An expectation, never a fallback.
 */
export const SURFACES_REGISTERED_FIXTURE_ORG = Object.freeze({ id: QA_SHARED_ORG_ID, key: "qa_shared", source: "persona" });
/** Shared targets this fixture never runs against (the isolated resolver's own exclusion). */
export const SHARED_TARGET_KEYS = Object.freeze(["alloy-cert"]);

const ENTRY = Object.freeze({ ensure: "Ensure", reset: "Reset", census: "Census" });
const program = (operation, { mutating, sql_sha256 }) => Object.freeze({
    fixture: `surfaces_room_uses_${operation}`,
    operation,
    suite: "surfaces",
    npm_script: `dev:qa:surfaces-room-uses-fixture-${operation}`,
    script_body: `node scripts/qaSurfacesRoomUsesFixture${ENTRY[operation]}.mjs`,
    sql_path: `certification/fixtures/qa-surfaces-room-uses-${operation}.sql`,
    sql_sha256,
    mutating,
});
/**
 * One program per runner. ensure/reset are registered in the installed toolkit (`surfaces_room_uses_ensure` /
 * `_reset`, authority v2) with exactly these SQL pins. census is NOT registered: the executor issues no authority
 * for it, so it refuses here by construction until the platform registers it (handoff v4).
 */
export const SURFACES_ROOM_USES_PROGRAMS = Object.freeze({
    ensure: program("ensure", { mutating: true, sql_sha256: "95a4906215c04c121c3cbf4bd2ae281e0d06f3365d155fe0ad72f8cca476c139" }),
    reset: program("reset", { mutating: true, sql_sha256: "7fc6f68a588024c946717589050666e6e91fe20c8b71fcce2469d9ef6bb2c349" }),
    census: program("census", { mutating: false, sql_sha256: "6d35ea1c8668a7e923f2b534285b607b03707cfc1941e773e061e86e1ff91a80" }),
});

const SHA_RE = /^[0-9a-f]{40}$/;
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const qaRunsPath = (root) => join(root, "vacilando", "qa-runs", "runs.json");
const authorityDir = (root) => join(root, "vacilando", "isolated-fixture", "authority");

/** sha256 of the SQL on disk and of the blob committed at `candidate`, or nulls. */
export function readSqlDigests(p, candidate) {
    let disk = null;
    let committed = null;
    try { disk = sha256(readFileSync(join(ROOT, p.sql_path))); } catch { /* absent */ }
    try {
        if (SHA_RE.test(String(candidate || ""))) {
            committed = sha256(execFileSync("git", ["show", `${candidate}:${p.sql_path}`], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 }));
        }
    } catch { /* not at the candidate */ }
    return { disk, committed };
}

/**
 * Steps 1–14. Returns `{ ok: true, authority }` or `{ ok: false, code, fields? }`. Reads only the executor's store
 * (located by the shared module, never from `env`) and this program's own files; never an env file, never a
 * database. `storeRoot`, `nowMs`, `readFile`, `realpath`, `readHead`, `readScriptBody` and `readSql` are test seams.
 */
export function verifySurfacesFixtureAuthority(env = {}, {
    program: p,
    storeRoot = trustedGatewayStoreRoot(),
    nowMs = Date.now(),
    readFile = (f) => readFileSync(f, "utf8"),
    realpath,
    readHead,
    readScriptBody,
    readSql = (candidate) => readSqlDigests(p, candidate),
} = {}) {
    const R = FIXTURE_AUTHORITY_REFUSALS;
    if (!p || !Object.values(SURFACES_ROOM_USES_PROGRAMS).includes(p)) return { ok: false, code: R.PROGRAM };

    /* 1–10 — the shared v2 check, with this program and this registry entry's organization. The authority text it
       reads (and proves against the live request's digest) is kept, so step 11 reads those bytes and no others. */
    const seen = new Map();
    const tap = (f) => {
        const text = readFile(f);
        seen.set(f, text);
        return text;
    };
    const seams = { storeRoot, nowMs, readFile: tap, ...(realpath ? { realpath } : {}), ...(readHead ? { readHead } : {}), ...(readScriptBody ? { readScriptBody } : {}) };
    const shared = verifyIsolatedFixtureAuthorityV2(env, { ...seams, program: p, org: SURFACES_REGISTERED_FIXTURE_ORG });
    if (!shared.ok) return shared;
    const a = shared.authority;

    /* 11 — a non-mutating grant never admits a mutating program (nor the reverse). */
    const name = basename(String(env.ALLOY_QA_AUTHORITY_FILE || ""));
    const verified = [...seen.entries()].find(([f]) => basename(f) === name && f.endsWith(join("vacilando", "isolated-fixture", "authority", name)));
    let record = null;
    try { record = verified ? JSON.parse(verified[1]) : null; } catch { record = null; }
    if (!record || record.request_id !== a.request_id || record.mutating !== p.mutating) return { ok: false, code: R.MISMATCH, fields: ["mutating"] };

    /* 12 — the SQL that would run is the pinned SQL committed at the authorized candidate. */
    const sql = readSql(a.candidate_sha);
    const sqlBad = [];
    if (sql?.disk !== p.sql_sha256) sqlBad.push("sql_on_disk");
    if (sql?.committed !== p.sql_sha256) sqlBad.push("sql_at_candidate");
    if (sqlBad.length) return { ok: false, code: R.SQL, fields: sqlBad };

    /* 13 — the QA run as the executor's ledger holds it, and the persona it bound. */
    let runs;
    try {
        runs = JSON.parse(readFile(qaRunsPath(storeRoot)))?.runs;
    } catch {
        return { ok: false, code: R.QA_RUN };
    }
    const run = runs && typeof runs === "object" && Object.prototype.hasOwnProperty.call(runs, a.qa_run_id) ? runs[a.qa_run_id] : null;
    const leaseMs = Date.parse(run?.lease_expires_at || "");
    if (!run || run.run_id !== a.qa_run_id || run.state !== "OPEN" || !(leaseMs > nowMs)
        || run.target?.kind !== "local" || run.target?.key !== a.environment_id) {
        return { ok: false, code: R.QA_RUN };
    }
    const persona = (Array.isArray(run.personas) ? run.personas : []).find((x) => x?.persona_key && x.persona_key === env.ALLOY_QA_PERSONA);
    if (!persona || persona.org_key !== SURFACES_REGISTERED_FIXTURE_ORG.key || a.org_id !== QA_SHARED_ORG_ID) return { ok: false, code: R.PERSONA_ORG };

    /* 14 — never the shared stack. */
    if (SHARED_TARGET_KEYS.includes(String(a.environment_id)) || SHARED_TARGET_KEYS.includes(String(run.target?.key))) {
        return { ok: false, code: R.SHARED_TARGET };
    }

    return { ok: true, authority: { ...a, operation: p.operation, mutating: p.mutating } };
}

/**
 * THE CONNECTION GATE, immediately before psql starts. Re-runs steps 1–14 (live provenance and the hold are
 * re-read now), then resolves the connection target of the EXACT final `url` and the EXACT `clientEnv` psql will
 * be given, and requires it to be the database the re-verified authority names (loopback, never the shared stack).
 */
export function attestSurfacesConnection(env, { url, clientEnv, ...opts }) {
    const again = verifySurfacesFixtureAuthority(env, opts);
    if (!again.ok) return again;
    const a = again.authority;
    const target = verifyConnectionTarget(
        { schema: DATABASE_IDENTITY_SCHEMA, environment_id: a.environment_id, digest: a.database_identity_digest },
        { url, clientEnv },
    );
    if (!target.ok) return target;
    return { ok: true, authority: a, target_digest: target.identity.digest };
}

/**
 * The gate with no window after it: freezes one copy of the configuration, attests it, and hands `connect` exactly
 * that copy. → the gate's refusal (connect never called), or `{ ok: true, authority, target_digest, result }`.
 */
export function runAttested(env, { url, clientEnv, connect, ...opts }) {
    const frozen = Object.freeze({ url: String(url ?? ""), clientEnv: Object.freeze({ ...clientEnv }) });
    const verdict = attestSurfacesConnection(env, { ...opts, url: frozen.url, clientEnv: frozen.clientEnv });
    if (!verdict.ok) return verdict;
    return { ...verdict, result: connect(frozen) };
}
