/**
 * OPERATION AUTHORITY for the Financials QA-bound fixtures — the child-side check, AUTHORITY v2 ONLY:
 * `test:qa:financials-isolated` and `dev:qa:financials-historical-draft-fixture`.
 *
 * No framework of its own. Every step of the executor's v2 contract (store root, record location, live request
 * provenance, window, binding, program/candidate/script, organization, database connection identity, target
 * hold, API origin) is the shared product verifier `verifyIsolatedFixtureAuthorityV2`
 * (`./isolatedFixtureAuthorityV2.mjs`, taken byte-identical from Enrollment commit
 * 80eb7446656f89f0c43da01105836e4d1c64aa56, blob 20f04adeb14b, restating toolkit 20261031-eeaa6dac6860 and pinned
 * by its vendored vectors). This module adds only what is Financials':
 *
 *   · the two program descriptors and their registered operations (an unregistered program or operation is
 *     refused before anything is read);
 *   · the organization each program may act in:
 *       - `financials_isolated_tests` — the registry's SEED_ORG (`certification_seed`, source `seed_manifest`);
 *       - `financials_historical_draft` — the org the executor's OWN QA-run ledger
 *         (`<root>/vacilando/qa-runs/runs.json`) binds to the run's persona: the run is OPEN, local, on the
 *         record's environment, binds `ALLOY_QA_PERSONA`, and that persona's `org_key` is a registered QA org.
 *         The seed org is never accepted. The shared verifier then requires the v2 record's `fixture_org` to be
 *         exactly that org (id, key, source);
 *   · a guard (not authority): the PostgREST origin and the database are in the SAME certification-environment
 *     port block (installed `CERTENV_PORT_BASE` 56100, `CERTENV_PORT_BLOCK` 10, 20 blocks). The v2 identity names
 *     the Postgres target only, so without this a sibling environment's API beside this environment's database
 *     would pass. The authoritative fix is an API identity in the v2 record — a platform request, not claimed.
 *
 * PROGRAM PINS. Financials runs TypeScript service calls, not a SQL artifact, so it adopts the platform's explicit
 * non-SQL `program` pin variant (draft contract ISOLATED-FIXTURE-PROGRAM-PINS-CONTRACT.md, objective
 * OPWORK_C86B7CC3C436_SPRINT_94E98241AD37 — not installed): the record's `program_pins` must name this candidate, this
 * script body and every required artifact (FINANCIALS_REQUIRED_ARTIFACTS), its digest must recompute, and each
 * artifact's bytes in this checkout must equal its pin. A record without program pins is refused.
 *
 * FAIL CLOSED. A v1 record — which is what the installed toolkit issues to both Financials entries today, because
 * neither is registered `authority_contract: "v2"` — is refused (`fixture_authority_org_unbound`). There is no v1
 * fallback. Execution resumes only when the platform registers and installs a compatible v2 contract for them.
 *
 * Callers use the verdict's `authority.api_url` and `authority.org_id` — the values that were verified — never a
 * second read of the environment.
 *
 * THE BOUNDARY (as the toolkit states it). Executor and child are the same OS user; nothing authenticates the
 * issuer cryptographically. A same-user rewrite of the executor's own store (request, authority, hold and QA-run
 * ledger together) is tampering with Vacilando state and is not claimed. Refusals name codes and field names,
 * never a value.
 */
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    FIXTURE_AUTHORITY_REFUSALS as SHARED_REFUSALS,
    FIXTURE_AUTHORITY_SCHEMA_V2,
    canonicalJson,
    readOwnHead,
    readOwnScriptBody as readScriptBodyFor,
    sha256,
    trustedGatewayStoreRoot,
    verifyIsolatedFixtureAuthorityV2,
} from "./isolatedFixtureAuthorityV2.mjs";

/** The repository root (artifact paths are repository-relative, as the executor's `git show <sha>:<path>`). */
const REPO = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export { readOwnHead, trustedGatewayStoreRoot };

/** The only schema this child accepts. */
export const FIXTURE_AUTHORITY_SCHEMA = FIXTURE_AUTHORITY_SCHEMA_V2;

export const FIXTURE_AUTHORITY_REFUSALS = Object.freeze({
    ...SHARED_REFUSALS,
    /* Financials-only: the persona org does not agree with the executor's QA-run ledger. */
    PERSONA_ORG: "fixture_authority_persona_org_unverified",
    /* Financials-only: not a registered program, or not one of its registered operations. */
    PROGRAM: "fixture_authority_program_unregistered",
    /* Financials-only guard: the API origin is not in the bound database's environment port block. */
    API_ENVIRONMENT: "fixture_api_target_not_the_bound_environment",
    /* Program pins (platform draft ISOLATED-FIXTURE-PROGRAM-PINS-CONTRACT, objective 94E98241AD37). */
    PINS_ABSENT: "fixture_program_pins_absent",
    PINS_INVALID: "fixture_program_pins_invalid",
    PINS_DIGEST: "fixture_program_pins_digest_mismatch",
    PINS_CANDIDATE: "fixture_program_pins_candidate_mismatch",
    PINS_SCRIPT: "fixture_program_pins_script_mismatch",
    PINS_REQUIRED: "fixture_program_pins_required_artifact_absent",
    PINS_ARTIFACT: "fixture_program_pins_artifact_mismatch",
});

/**
 * The artifacts each program's pins must name (repository-relative), by role. The executor proves each against the
 * bytes committed at the candidate; this child re-proves each against the bytes it is running from. A pin set that
 * omits one of these does not describe this program.
 */
export const FINANCIALS_REQUIRED_ARTIFACTS = Object.freeze({
    financials_isolated_tests: Object.freeze([
        Object.freeze({ role: "entry", path: "web/scripts/qa/financialsIsolatedTests.mjs" }),
        Object.freeze({ role: "authority_verifier", path: "web/scripts/qa/financialsFixtureAuthority.mjs" }),
        Object.freeze({ role: "authority_verifier", path: "web/scripts/qa/isolatedFixtureAuthorityV2.mjs" }),
        Object.freeze({ role: "program", path: "web/scripts/qa/financialsIsolatedBinding.mjs" }),
        Object.freeze({ role: "program", path: "web/scripts/qa/financialsIsolatedProof.mjs" }),
        Object.freeze({ role: "program", path: "web/tests/financials/live/catalogAddCharge.live.test.ts" }),
        Object.freeze({ role: "program", path: "web/tests/financials/live/certEnvironment.ts" }),
        Object.freeze({ role: "program", path: "web/tests/harness/liveSuiteAuthority.mjs" }),
        Object.freeze({ role: "program", path: "web/vitest.config.ts" }),
    ]),
    financials_historical_draft: Object.freeze([
        Object.freeze({ role: "entry", path: "web/scripts/qa/financialsHistoricalDraftFixture.ts" }),
        Object.freeze({ role: "authority_verifier", path: "web/scripts/qa/financialsFixtureAuthority.mjs" }),
        Object.freeze({ role: "authority_verifier", path: "web/scripts/qa/isolatedFixtureAuthorityV2.mjs" }),
        Object.freeze({ role: "program", path: "web/scripts/qa/financialsHistoricalDraftFixtureCore.ts" }),
        Object.freeze({ role: "program", path: "web/scripts/qa/financialsIsolatedBinding.mjs" }),
    ]),
});

/** What a program is. Restated from the toolkit registry (`lib/certification-fixture.mjs`, eeaa6dac6860). */
export const FINANCIALS_ISOLATED_PROGRAM = Object.freeze({
    fixture: "financials_isolated_tests",
    operations: Object.freeze(["run"]),
    suite: "financials",
    npm_script: "test:qa:financials-isolated",
    /* The package.json script body the executor pins by digest (`expectedScriptSha256`). */
    script_body: "node scripts/qa/financialsIsolatedTests.mjs",
    org_binding: "seed_manifest",
});

export const FINANCIALS_HISTORICAL_DRAFT_PROGRAM = Object.freeze({
    fixture: "financials_historical_draft",
    operations: Object.freeze(["ensure", "verify", "reset", "count"]),
    suite: "financials",
    npm_script: "dev:qa:financials-historical-draft-fixture",
    script_body: "tsx --tsconfig tsconfig.json scripts/qa/financialsHistoricalDraftFixture.ts",
    org_binding: "persona",
});

/** Toolkit `QA_ORGS` (lib/qa-plan-registry.mjs), the only organizations a persona-bound fixture may act in. */
export const QA_PERSONA_ORGS = Object.freeze({
    qa_shared: "4acc9386-c485-486f-aa1f-05d83499d142",
    qa_secondary: "ad53fee2-2570-460f-9300-f0e106c473b6",
});

/** Toolkit `CERTIFICATION_SEED_ORG` as the executor issues it (`resolveFixtureOrg`, seed branch). */
export const FINANCIALS_FIXTURE_ORG = Object.freeze({
    id: "00000000-0000-4000-8000-000000000001",
    key: "certification_seed",
    source: "seed_manifest",
});

/** Installed certification-environment port allocation (`lib/certification-environments.mjs`). */
export const CERTENV_PORT_BASE = 56100;
export const CERTENV_PORT_BLOCK = 10;
export const CERTENV_PORT_BLOCKS = 20;

const PROGRAMS = [FINANCIALS_ISOLATED_PROGRAM, FINANCIALS_HISTORICAL_DRAFT_PROGRAM];
const qaRunsPath = (root) => join(root, "vacilando", "qa-runs", "runs.json");
/* Never matches a record: a persona program whose ledger proves no org is refused, never given a default. */
const UNRESOLVED_ORG = Object.freeze({ id: "", key: "", source: "persona" });

/**
 * The pinned script body from this program's own web/package.json, or null.
 *
 * @param {{ webDir?: string, readFile?: (p: string) => string, program?: typeof FINANCIALS_ISOLATED_PROGRAM | typeof FINANCIALS_HISTORICAL_DRAFT_PROGRAM }} [opts]
 */
export function readOwnScriptBody({ webDir, readFile, program = FINANCIALS_ISOLATED_PROGRAM } = {}) {
    return readScriptBodyFor(program.npm_script, { ...(webDir ? { webDir } : {}), ...(readFile ? { readFile } : {}) });
}

/** The certenv port block a loopback port belongs to, or null outside the band. */
export function certenvBlockOf(port) {
    const p = Number(port);
    if (!Number.isInteger(p) || p < CERTENV_PORT_BASE || p >= CERTENV_PORT_BASE + CERTENV_PORT_BLOCK * CERTENV_PORT_BLOCKS) return null;
    return Math.floor((p - CERTENV_PORT_BASE) / CERTENV_PORT_BLOCK);
}

/**
 * The guard: the API origin's port and the database's port are two different ports of ONE environment block.
 * Both URLs have already passed the shared verifier's shape and identity checks.
 */
export function apiInBoundEnvironment(apiUrl, dbUrl) {
    let api;
    let db;
    try {
        api = Number(new URL(String(apiUrl)).port);
        db = Number(new URL(String(dbUrl)).port);
    } catch {
        return false;
    }
    const a = certenvBlockOf(api);
    return a !== null && a === certenvBlockOf(db) && api !== db;
}

/**
 * The persona org as the executor's own QA-run ledger binds it (toolkit `resolveFixtureOrg`, persona branch:
 * `QA_ORGS[persona.org_key]`), or null. The environment's run, environment, persona and org are assertions; the
 * shared verifier separately requires each to equal the executor's record.
 */
function personaOrgFromLedger(env, { storeRoot, readFile }) {
    /* Nothing is read for an execution that names no authority record: the shared check refuses it first. */
    if (!storeRoot || !env.ALLOY_QA_AUTHORITY_FILE || env.ALLOY_CERT_FIXTURE_ORG_SOURCE !== "persona") return null;
    let runs;
    try {
        runs = JSON.parse(readFile(qaRunsPath(storeRoot)))?.runs;
    } catch {
        return null;
    }
    const runId = String(env.ALLOY_QA_RUN_ID || "");
    const run = runs && typeof runs === "object" && runId ? runs[runId] : null;
    if (!run || run.run_id !== runId || run.state !== "OPEN" || run.target?.kind !== "local" || !run.target?.key || run.target.key !== env.ALLOY_QA_ENVIRONMENT_ID) return null;
    const persona = (Array.isArray(run.personas) ? run.personas : []).find((p) => p?.persona_key && p.persona_key === env.ALLOY_QA_PERSONA);
    const key = persona && Object.prototype.hasOwnProperty.call(QA_PERSONA_ORGS, persona.org_key) ? persona.org_key : null;
    const id = key ? QA_PERSONA_ORGS[key] : null;
    if (!id || id === FINANCIALS_FIXTURE_ORG.id) return null;
    return { id, key, source: "persona" };
}

const PIN_PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\/-]{0,200}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;

/** The program pins' digest: sha256 of canonical JSON of `{ variant, candidate_sha, script_sha256, artifacts }`. */
export function programPinsDigest(p) {
    return sha256(canonicalJson({ variant: p.variant, candidate_sha: p.candidate_sha, script_sha256: p.script_sha256, artifacts: p.artifacts }));
}

/**
 * The record's `program_pins`, re-read from the SAME bytes the shared verifier accepted (the in-flight request's
 * recorded sha256), then judged: explicit `program` variant, no SQL, 1–32 well-formed unique artifacts, the digest
 * recomputed, candidate = `ALLOY_QA_CANDIDATE_SHA` = this checkout's HEAD, script digest = this program's own body,
 * every required artifact named, and every named artifact's bytes here equal to its pin.
 */
function verifyProgramPins(env, P, { storeRoot, readFile, realpath, readHead, readScriptBody, readArtifact }) {
    const R = FIXTURE_AUTHORITY_REFUSALS;
    let pins;
    try {
        const real = realpath(String(env.ALLOY_QA_AUTHORITY_FILE));
        const text = readFile(real);
        const a = JSON.parse(text);
        const req = JSON.parse(readFile(join(storeRoot, "vacilando", "isolated-fixture", "requests", `${a.request_id}.json`)));
        if (req?.authority?.sha256 !== sha256(text)) return { ok: false, code: R.ALTERED };
        pins = a.program_pins;
    } catch {
        return { ok: false, code: R.ALTERED };
    }
    if (pins == null) return { ok: false, code: R.PINS_ABSENT };
    const arts = pins?.artifacts;
    const shapeOk = typeof pins === "object" && !Array.isArray(pins) && pins.variant === "program" && !("sql" in pins)
        && HEX40.test(String(pins.candidate_sha || "")) && HEX64.test(String(pins.script_sha256 || "")) && HEX64.test(String(pins.digest || ""))
        && Array.isArray(arts) && arts.length >= 1 && arts.length <= 32
        && arts.every((x) => x && typeof x.role === "string" && PIN_PATH_RE.test(String(x.path || "")) && !String(x.path).split("/").includes("..") && HEX64.test(String(x.sha256 || "")))
        && new Set(arts.map((x) => x.path)).size === arts.length;
    if (!shapeOk) return { ok: false, code: R.PINS_INVALID };
    if (programPinsDigest(pins) !== pins.digest) return { ok: false, code: R.PINS_DIGEST };
    if (pins.candidate_sha !== env.ALLOY_QA_CANDIDATE_SHA || pins.candidate_sha !== readHead()) return { ok: false, code: R.PINS_CANDIDATE };
    const body = readScriptBody();
    if (body !== P.script_body || pins.script_sha256 !== sha256(body)) return { ok: false, code: R.PINS_SCRIPT };
    const named = new Map(arts.map((x) => [x.path, x]));
    const missing = FINANCIALS_REQUIRED_ARTIFACTS[P.fixture].filter((r) => named.get(r.path)?.role !== r.role).map((r) => r.path);
    if (missing.length) return { ok: false, code: R.PINS_REQUIRED, fields: missing };
    const drifted = arts.filter((x) => {
        let bytes;
        try {
            bytes = readArtifact(x.path);
        } catch {
            return true;
        }
        /* The bytes, not a decoded string: the executor pins `git show <candidate>:<path>` output. */
        return createHash("sha256").update(bytes).digest("hex") !== x.sha256;
    }).map((x) => x.path);
    if (drifted.length) return { ok: false, code: R.PINS_ARTIFACT, fields: drifted };
    return { ok: true, digest: pins.digest };
}

/**
 * @typedef {import("./isolatedFixtureAuthorityV2.mjs").VerifiedFixtureAuthority & {
 *   fixture: string, operation: string, npm_script: string, org_source: string, api_url: string, program_pins_digest: string
 * }} FinancialsFixtureAuthority
 * @typedef {{ ok: true, authority: FinancialsFixtureAuthority, code?: undefined, fields?: undefined } | { ok: false, code: string, fields?: string[], authority?: undefined }} FinancialsAuthorityVerdict
 */

/**
 * The child-side check. Returns `{ ok: true, authority }` or `{ ok: false, code, fields? }`.
 *
 * `program` and `operation` are what the CALLING program is and was invoked to do (from its own registered
 * argv) — never from `env`. `storeRoot`, `nowMs`, `readFile`, `realpath`, `readHead` and `readScriptBody` default
 * to the trusted resolutions and are parameters for tests only.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ program?: typeof FINANCIALS_ISOLATED_PROGRAM | typeof FINANCIALS_HISTORICAL_DRAFT_PROGRAM, operation?: string, storeRoot?: string | null, nowMs?: number, readFile?: (p: string) => string, realpath?: (p: string) => string, readHead?: () => string | null, readScriptBody?: () => string | null, readArtifact?: (repoRelativePath: string) => string | Buffer }} [opts]
 * @returns {FinancialsAuthorityVerdict}
 */
export function verifyFinancialsFixtureAuthority(env = {}, {
    program = FINANCIALS_ISOLATED_PROGRAM,
    operation = "run",
    storeRoot = trustedGatewayStoreRoot(),
    nowMs = Date.now(),
    readFile = (p) => readFileSync(p, "utf8"),
    realpath = (p) => realpathSync(p),
    readHead = () => readOwnHead(),
    readScriptBody = () => readOwnScriptBody({ program }),
    readArtifact = (rel) => readFileSync(join(REPO, rel)),
} = {}) {
    const R = FIXTURE_AUTHORITY_REFUSALS;
    const P = program;
    if (!PROGRAMS.includes(P) || !P.operations.includes(operation)) return { ok: false, code: R.PROGRAM };

    const ledgerOrg = P.org_binding === "persona" ? personaOrgFromLedger(env, { storeRoot, readFile }) : null;
    const org = P.org_binding === "persona" ? (ledgerOrg ?? UNRESOLVED_ORG) : FINANCIALS_FIXTURE_ORG;
    const v = verifyIsolatedFixtureAuthorityV2(env, {
        program: { fixture: P.fixture, operation, suite: P.suite, npm_script: P.npm_script, script_body: P.script_body },
        org,
        storeRoot,
        nowMs,
        readFile,
        realpath,
        readHead,
        readScriptBody,
    });
    if (!v.ok) {
        /* A genuine record whose org is not the one the executor's QA-run ledger binds: say which proof failed. */
        if (P.org_binding === "persona" && v.code === R.ORG_NOT_REGISTERED) return { ok: false, code: R.PERSONA_ORG };
        return v;
    }
    if (!apiInBoundEnvironment(env.SUPABASE_URL, env.DATABASE_URL)) return { ok: false, code: R.API_ENVIRONMENT };
    const pins = verifyProgramPins(env, P, { storeRoot, readFile, realpath, readHead, readScriptBody, readArtifact });
    if (!pins.ok) return pins;
    return {
        ok: true,
        authority: {
            ...v.authority,
            fixture: P.fixture,
            operation,
            npm_script: P.npm_script,
            org_source: org.source,
            /* The verified PostgREST origin: the one value a caller may hand its client. */
            api_url: new URL(String(env.SUPABASE_URL)).origin,
            program_pins_digest: pins.digest,
        },
    };
}
