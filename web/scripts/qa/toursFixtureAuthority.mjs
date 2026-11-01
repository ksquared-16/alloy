/**
 * OPERATION AUTHORITY for the Tours QA-bound fixture `tours_certification` — the child-side check, AUTHORITY v2
 * ONLY, with the API identity and program pins required.
 *
 * No framework of its own. Every step of the executor's v2 contract (store root, record location, live request
 * provenance, window, binding, program/candidate/script, organization, database connection identity, API identity,
 * target hold) is the shared product verifier `verifyIsolatedFixtureAuthorityV2` (`./isolatedFixtureAuthorityV2.mjs`,
 * byte-identical to Financials candidate 470f8594968d7686a32e6a2390eeebc466f6fdca, sha256 e25649c2…: toolkit
 * 20261031-eeaa6dac6860 plus the API identity restated from platform candidate 4b55fc0b7322 — pinned by the vendored
 * vectors). The registry shape adopted is the one the installed toolkit already registers for a persona-bound,
 * preview-bound program: `financials_historical_draft` (`fixture_org: persona`, `preview: true`,
 * `authority_contract: "v2"`, program `pins`, `api_identity: "required"`), plus Surfaces' `required_org_key`. This
 * module adds only what is Tours':
 *
 *   · the program and its operations, exactly as the installed (v1) entry registers them: `ensure` (mutating),
 *     `count` (read-only census), `reset` (mutating, bounded). An unregistered operation is refused before anything
 *     is read;
 *   · the organization: the persona org `qa_shared` (source `persona`), the only org the fixture's site `qa_north`
 *     belongs to — an expectation the record must meet, never a fallback. The seed org is never accepted;
 *   · `requireApi: true`, always: every client the fixture builds calls the environment's Supabase API, so the record
 *     MUST carry `api_identity` naming `ALLOY_QA_ENVIRONMENT_ID`, and the exact origin handed to the client must be
 *     that identity (`api_identity_*`);
 *   · PROGRAM PINS (`variant: "program"`, no SQL): the record's `program_pins` must name this candidate, this script
 *     body and every required artifact (TOURS_REQUIRED_ARTIFACTS), its digest must recompute, and each artifact's
 *     bytes in this checkout must equal its pin. A record without pins is refused. Same rule, same codes as
 *     Financials' and Enrollment's (financialsFixtureAuthority.mjs at 470f8594, enrollmentFixtureAuthority.mjs):
 *     restated here rather than imported so no product's checkout depends on another's unmerged module.
 *
 * FAIL CLOSED. The installed toolkit (20261101-2aa8b30d6dd8) registers `tours_certification` without
 * `authority_contract`, so it issues a v1 record (no organization): today every execution is refused
 * (`fixture_authority_org_unbound`). There is no v1 fallback and no relaxed mode. Registration is the platform's
 * (handoff: certification/tours-calendar-forms/fixture/TOURS-FIXTURE-RUN-PACKET.md §9).
 *
 * Callers use the verdict's `authority.api_url`, `authority.org_id` and `authority.qa_run_id` — the values that were
 * verified — never a second read of the environment. IMMEDIATELY BEFORE a client exists, a caller attests the exact
 * configuration it hands over with `runAttestedToursConnection`: `{ url, clientEnv, apiOrigin }` frozen once, the
 * whole check re-run on that copy, and `connect` handed exactly that copy.
 *
 * THE BOUNDARY (as the toolkit states it). Executor and child are the same OS user; nothing authenticates the
 * issuer cryptographically. Refusals name codes and field names, never a value.
 */
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    API_IDENTITY_REFUSALS,
    FIXTURE_AUTHORITY_REFUSALS as SHARED_REFUSALS,
    canonicalJson,
    readOwnHead,
    readOwnScriptBody,
    runAttestedConnection,
    sha256,
    trustedGatewayStoreRoot,
    verifyIsolatedFixtureAuthorityV2,
} from "./isolatedFixtureAuthorityV2.mjs";

/** The repository root (artifact paths are repository-relative, as the executor's `git show <sha>:<path>`). */
const REPO = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export { API_IDENTITY_REFUSALS };

export const TOURS_FIXTURE_REFUSALS = Object.freeze({
    ...SHARED_REFUSALS,
    PROGRAM: "fixture_authority_program_unregistered",
    PINS_ABSENT: "fixture_program_pins_absent",
    PINS_INVALID: "fixture_program_pins_invalid",
    PINS_DIGEST: "fixture_program_pins_digest_mismatch",
    PINS_CANDIDATE: "fixture_program_pins_candidate_mismatch",
    PINS_SCRIPT: "fixture_program_pins_script_mismatch",
    PINS_REQUIRED: "fixture_program_pins_required_artifact_absent",
    PINS_ARTIFACT: "fixture_program_pins_artifact_mismatch",
});

/** What the program is: installed registry entry `tours_certification`, its three operations unchanged. */
export const TOURS_FIXTURE_PROGRAM = Object.freeze({
    fixture: "tours_certification",
    operations: Object.freeze({
        ensure: Object.freeze({ args: Object.freeze(["--ensure"]), mutating: true }),
        count: Object.freeze({ args: Object.freeze(["--count"]), mutating: false, census: true }),
        reset: Object.freeze({ args: Object.freeze(["--reset"]), mutating: true, reset: true }),
    }),
    suite: "tours",
    npm_script: "dev:qa:tours-fixture",
    script_body: "tsx --tsconfig tsconfig.json scripts/qaToursFixture.ts",
    reserved_namespace: "tours-cert.alloy.invalid",
});

/**
 * The entry's org: the persona org the executor's `resolveFixtureOrg` issues for a bp_v2 persona (toolkit `QA_ORGS`,
 * `qa_shared`), and the org `sharedQaRegistry` places `qa_north` in. An expectation, never a fallback.
 */
export const TOURS_REGISTERED_FIXTURE_ORG = Object.freeze({
    id: "4acc9386-c485-486f-aa1f-05d83499d142",
    key: "qa_shared",
    source: "persona",
});

/**
 * The artifacts the pins must name (repository-relative), by role, in this order. The executor proves each against
 * the bytes committed at the candidate; this child re-proves each against the bytes it is running from.
 */
export const TOURS_REQUIRED_ARTIFACTS = Object.freeze([
    Object.freeze({ role: "entry", path: "web/scripts/qaToursFixture.ts" }),
    Object.freeze({ role: "authority_verifier", path: "web/scripts/qa/toursFixtureAuthority.mjs" }),
    Object.freeze({ role: "authority_verifier", path: "web/scripts/qa/isolatedFixtureAuthorityV2.mjs" }),
    Object.freeze({ role: "program", path: "web/lib/qa/toursFixture/toursCertificationFixture.ts" }),
    Object.freeze({ role: "program", path: "web/lib/qa/toursFixture/toursCertificationFixturePorts.ts" }),
    Object.freeze({ role: "program", path: "web/lib/qa/toursFixture/toursFixtureForms.ts" }),
    Object.freeze({ role: "program", path: "web/lib/qa/sharedQaRegistry.ts" }),
]);

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
 * every required artifact named with its role, and every named artifact's bytes here equal to its pin.
 */
function verifyProgramPins(env, { storeRoot, readFile, realpath, readHead, readScriptBody, readArtifact }) {
    const R = TOURS_FIXTURE_REFUSALS;
    let pins;
    try {
        const text = readFile(realpath(String(env.ALLOY_QA_AUTHORITY_FILE)));
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
    if (body !== TOURS_FIXTURE_PROGRAM.script_body || pins.script_sha256 !== sha256(body)) return { ok: false, code: R.PINS_SCRIPT };
    const named = new Map(arts.map((x) => [x.path, x]));
    const missing = TOURS_REQUIRED_ARTIFACTS.filter((r) => named.get(r.path)?.role !== r.role).map((r) => r.path);
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
 *   fixture: string, operation: string, npm_script: string, api_url: string, api_identity_digest: string, program_pins_digest: string
 * }} ToursFixtureAuthority
 * @typedef {import("./isolatedFixtureAuthorityV2.mjs").FixtureConnection} FixtureConnection
 * @typedef {Readonly<{ url: string, clientEnv: Readonly<Record<string, string | undefined>>, apiOrigin?: string }>} FrozenConnection
 * @typedef {{ operation?: string, storeRoot?: string | null, nowMs?: number, readFile?: (p: string) => string, realpath?: (p: string) => string, readHead?: () => string | null, readScriptBody?: () => string | null, readArtifact?: (repoRelativePath: string) => string | Buffer }} ToursVerifyOptions
 * @typedef {{ ok: true, authority: ToursFixtureAuthority, code?: undefined, fields?: undefined } | { ok: false, code: string, fields?: string[], authority?: undefined }} ToursAuthorityVerdict
 */

/**
 * The child-side check. `operation` is what the calling program was invoked to do (from its own argv) — never from
 * `env`. `connection` is the configuration the client is handed (default: `DATABASE_URL`, `env`, `SUPABASE_URL`).
 * The API identity and program pins are always required. Every other option is a test seam.
 *
 * @param {Readonly<Record<string, string | undefined>>} [env]
 * @param {ToursVerifyOptions & { connection?: FixtureConnection }} [opts]
 * @returns {ToursAuthorityVerdict}
 */
export function verifyToursFixtureAuthorityV2(env = {}, {
    operation = "",
    connection = { url: env.DATABASE_URL, clientEnv: env, apiOrigin: env.SUPABASE_URL },
    storeRoot = trustedGatewayStoreRoot(),
    nowMs = Date.now(),
    readFile = (p) => readFileSync(p, "utf8"),
    realpath = (p) => realpathSync(p),
    readHead = () => readOwnHead(),
    readScriptBody = () => readOwnScriptBody(TOURS_FIXTURE_PROGRAM.npm_script),
    readArtifact = (rel) => readFileSync(join(REPO, rel)),
} = {}) {
    const R = TOURS_FIXTURE_REFUSALS;
    const P = TOURS_FIXTURE_PROGRAM;
    if (!Object.prototype.hasOwnProperty.call(P.operations, operation)) return { ok: false, code: R.PROGRAM };
    const v = verifyIsolatedFixtureAuthorityV2(env, {
        program: { fixture: P.fixture, operation, suite: P.suite, npm_script: P.npm_script, script_body: P.script_body },
        org: TOURS_REGISTERED_FIXTURE_ORG,
        connection,
        /* Every client calls the Supabase API: an authority that does not name it is refused. */
        requireApi: true,
        storeRoot,
        nowMs,
        readFile,
        realpath,
        readHead,
        readScriptBody,
    });
    if (!v.ok) return v;
    if (!v.authority.api_identity_digest || !v.authority.api_origin) return { ok: false, code: API_IDENTITY_REFUSALS.ABSENT };
    const pins = verifyProgramPins(env, { storeRoot, readFile, realpath, readHead, readScriptBody, readArtifact });
    if (!pins.ok) return pins;
    const { api_origin: apiOrigin, ...verified } = v.authority;
    return {
        ok: true,
        authority: {
            ...verified,
            fixture: P.fixture,
            operation,
            npm_script: P.npm_script,
            /* The attested API origin (`http://127.0.0.1:<port>` of the identity): the one value a caller may hand its client. */
            api_url: apiOrigin,
            api_identity_digest: v.authority.api_identity_digest,
            program_pins_digest: pins.digest,
        },
    };
}

/**
 * THE GATE, immediately before a client: freeze `{ url, clientEnv, apiOrigin }` once, re-run the whole check on
 * that copy, and only then call `connect` with exactly that copy. → the refusal (connect never called) or
 * `{ ok: true, authority, result }`.
 *
 * @template T
 * @param {Readonly<Record<string, string | undefined>>} env the executor-built environment the authority is judged from
 * @param {ToursVerifyOptions & FixtureConnection & { connect: (c: FrozenConnection) => T | Promise<T> }} input
 * @returns {Promise<ToursAuthorityVerdict | { ok: true, authority: ToursFixtureAuthority, result: T, code?: undefined, fields?: undefined }>}
 */
export function runAttestedToursConnection(env, { url, clientEnv, apiOrigin, connect, ...opts }) {
    return runAttestedConnection({
        url,
        clientEnv,
        apiOrigin,
        attest: (frozen) => verifyToursFixtureAuthorityV2(env, { ...opts, connection: frozen }),
        connect,
    });
}
