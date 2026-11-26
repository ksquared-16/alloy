/**
 * A SYNTHETIC executor store, shaped as the toolkit's isolated executor writes it for an AUTHORITY v2 fixture
 * (`lib/isolated-fixture-execution.mjs`, toolkit 20261031-eeaa6dac6860, INC-A83E-01): the v2 authority record
 * under `<root>/vacilando/isolated-fixture/authority/<request>.<hex>.json` (with `fixture_org`,
 * `database_identity`, `target_hold_disposition` and — registered `api_identity: "required"`, platform 4b55fc0b
 * INC-94E9-02 — `api_identity` from the environment's assigned API port), the in-flight request record naming its file and sha256,
 * a clear hash-chained target-hold record under `<root>/vacilando/target-holds/<environment>.json`, and the
 * QA-run ledger. In a temp directory only — never the real Gateway store. No credential: every key and the
 * database URL are synthetic strings; nothing listens on those ports and nothing connects to them.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    FINANCIALS_FIXTURE_ORG,
    FINANCIALS_HISTORICAL_DRAFT_PROGRAM,
    FINANCIALS_ISOLATED_PROGRAM,
    FINANCIALS_REQUIRED_ARTIFACTS,
    FIXTURE_AUTHORITY_SCHEMA,
    QA_PERSONA_ORGS,
    programPinsDigest,
} from "../../scripts/qa/financialsFixtureAuthority.mjs";
import { databaseIdentityOf, issuableApiIdentity, targetHoldRecordDigest } from "../../scripts/qa/isolatedFixtureAuthorityV2.mjs";

export const SYNTHETIC_HEAD = "c".repeat(40);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export type Env = Record<string, string | undefined>;
type Program = typeof FINANCIALS_ISOLATED_PROGRAM | typeof FINANCIALS_HISTORICAL_DRAFT_PROGRAM;

/** The persona a persona-bound synthetic run binds, and its org (A741 QA_ORGS.qa_shared). */
export const SYNTHETIC_PERSONA = "finance_admin";
export const SYNTHETIC_PERSONA_ORG = QA_PERSONA_ORGS.qa_shared;

/** The synthetic environment's targets: one certenv block (56100–56109), API and database. Never connected to. */
export const SYNTHETIC_ENVIRONMENT = "certenv-0123456789";
export const SYNTHETIC_API_URL = "http://127.0.0.1:56102";
export const SYNTHETIC_DB_URL = "postgresql://postgres:SYNTHETIC-DB-SENTINEL@127.0.0.1:56101/postgres";
/** The environment's assigned API port, from which the executor issues `api_identity`. */
export const SYNTHETIC_API_PORT = 56102;

/** The `api_identity` the executor issues for an environment's assigned API port (platform issuableApiIdentity). */
export function syntheticApiIdentity(port: number = SYNTHETIC_API_PORT, environmentId: string = SYNTHETIC_ENVIRONMENT) {
    const r = issuableApiIdentity(port, environmentId);
    if (!r.ok) throw new Error(`synthetic api identity: ${r.code}`);
    return r.identity;
}

/** The repository root: program pin paths are repository-relative. */
export const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

/**
 * The `program_pins` the platform's executor would issue for `program` at `candidate` (draft contract
 * ISOLATED-FIXTURE-PROGRAM-PINS-CONTRACT.md): every required artifact, hashed from the bytes in this checkout.
 */
export function syntheticProgramPins(program: Program, candidate: string, over: Record<string, unknown> = {}): Record<string, unknown> {
    const artifacts = FINANCIALS_REQUIRED_ARTIFACTS[program.fixture as keyof typeof FINANCIALS_REQUIRED_ARTIFACTS].map((a) => ({
        role: a.role, path: a.path, sha256: createHash("sha256").update(readFileSync(join(REPO_ROOT, a.path))).digest("hex"),
    }));
    const body = { variant: "program", candidate_sha: candidate, script_sha256: sha(program.script_body), artifacts, ...over };
    return { ...body, digest: programPinsDigest(body) };
}

/** A clear (or `over`-edited) target-hold record, hash-chained as the toolkit writes it. */
export function syntheticHoldRecord(environmentId: string = SYNTHETIC_ENVIRONMENT, over: Record<string, unknown> = {}): Record<string, unknown> {
    const rec: Record<string, unknown> = {
        schema: "vacilando.target_hold_record.v1",
        target_key: environmentId,
        scope: { kind: "target", target_key: environmentId },
        state: "clear",
        owner: { kind: "operator", id: "synthetic-operator" },
        evidence: { ref: "synthetic://evidence/clear" },
        governed_request_id: "gar_00000000000f01",
        revision: 1,
        previous_sha256: null,
        recorded_at: "2026-10-31T11:00:00.000Z",
        ...over,
    };
    return { ...rec, record_sha256: targetHoldRecordDigest(rec) };
}

export function syntheticExecutorStore({ now = Date.now(), requestId = "req-fin-auth-0001", record = {}, head = SYNTHETIC_HEAD, program = FINANCIALS_ISOLATED_PROGRAM, operation = program.operations[0] }: { now?: number; requestId?: string; record?: Record<string, unknown>; head?: string; program?: Program; operation?: string } = {}) {
    const root = mkdtempSync(join(tmpdir(), "fin-authority-"));
    const store = join(root, "vacilando", "isolated-fixture");
    const authorityDir = join(store, "authority");
    const requestsDir = join(store, "requests");
    mkdirSync(authorityDir, { recursive: true });
    mkdirSync(requestsDir, { recursive: true });
    const name = `${requestId}.${randomBytes(8).toString("hex")}.json`;
    const file = join(authorityDir, name);
    const holdsDir = join(root, "vacilando", "target-holds");
    mkdirSync(holdsDir, { recursive: true });
    const holdFile = join(holdsDir, `${SYNTHETIC_ENVIRONMENT}.json`);
    const hold = syntheticHoldRecord();
    writeFileSync(holdFile, `${JSON.stringify(hold, null, 2)}\n`);
    const identity = databaseIdentityOf(SYNTHETIC_DB_URL, SYNTHETIC_ENVIRONMENT);
    if (!identity.ok) throw new Error("synthetic database identity");
    const fixtureOrg = program.org_binding === "persona"
        ? { id: SYNTHETIC_PERSONA_ORG, key: "qa_shared", source: "persona" }
        : { ...FINANCIALS_FIXTURE_ORG };
    const rec: Record<string, unknown> = {
        schema: FIXTURE_AUTHORITY_SCHEMA, request_id: requestId, fixture: program.fixture, operation,
        suite: program.suite, npm_script: program.npm_script, script_sha256: sha(program.script_body),
        candidate_sha: head, qa_run_id: "qar_0123456789ab", environment_id: SYNTHETIC_ENVIRONMENT, binding_digest: "b".repeat(64), mutating: true,
        nonce: randomBytes(16).toString("hex"), issued_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 600_000).toISOString(),
        fixture_org: fixtureOrg,
        database_identity: identity.identity,
        target_hold_disposition: {
            schema: "vacilando.target_hold_disposition.v1",
            target_key: SYNTHETIC_ENVIRONMENT,
            state: "clear",
            record: { revision: hold.revision, record_sha256: hold.record_sha256, owner: hold.owner, governed_request_id: hold.governed_request_id },
            request_id: requestId,
            evaluated_at: new Date(now - 1000).toISOString(),
        },
        program_pins: syntheticProgramPins(program, head),
        api_identity: syntheticApiIdentity(),
        ...record,
    };
    const text = `${JSON.stringify(rec, null, 2)}\n`;
    writeFileSync(file, text, { mode: 0o600 });
    const reqFile = join(requestsDir, `${requestId}.json`);
    const writeRequest = (over: Record<string, unknown> = {}, authority: Record<string, unknown> = {}) =>
        writeFileSync(reqFile, JSON.stringify({
            schema: "vacilando.isolated_fixture_request.v1", request_id: requestId, binding_digest: rec.binding_digest, state: "in_flight",
            claimed_at: new Date(now - 2000).toISOString(), pid: 1, authority: { file: name, sha256: sha(text), issued_at: rec.issued_at, expires_at: rec.expires_at, ...authority }, ...over,
        }));
    writeRequest();
    /* The executor's QA-run ledger: the record's run, OPEN, local, on its environment, binding the persona. */
    const runsFile = join(root, "vacilando", "qa-runs", "runs.json");
    mkdirSync(join(root, "vacilando", "qa-runs"), { recursive: true });
    const writeRun = (over: Record<string, unknown> = {}, persona: Record<string, unknown> = {}) =>
        writeFileSync(runsFile, JSON.stringify({
            runs: {
                [String(rec.qa_run_id)]: {
                    run_id: rec.qa_run_id, state: "OPEN", lane_id: "lane_synthetic00", target: { kind: "local", key: rec.environment_id },
                    personas: [{ persona_key: SYNTHETIC_PERSONA, org_key: "qa_shared", ...persona }], ...over,
                },
            },
        }));
    writeRun();
    const orgEnv: Env = { ALLOY_CERT_FIXTURE_ORG_ID: fixtureOrg.id, ALLOY_CERT_FIXTURE_ORG_SOURCE: fixtureOrg.source };
    /** The executor-built environment for this record: binding, authority, database and the bound org. */
    const env = (over: Env = {}): Env => ({
        NODE_ENV: "test",
        SUPABASE_URL: SYNTHETIC_API_URL,
        NEXT_PUBLIC_SUPABASE_URL: SYNTHETIC_API_URL,
        SUPABASE_SERVICE_ROLE_KEY: "sk_synthetic_authority_never_print_0123456789",
        DATABASE_URL: SYNTHETIC_DB_URL,
        ALLOY_QA_RUN_ID: String(rec.qa_run_id),
        ALLOY_QA_ENVIRONMENT_ID: String(rec.environment_id),
        ALLOY_QA_PERSONA: SYNTHETIC_PERSONA,
        ALLOY_CERT_NAMESPACE: "financials-cert.alloy.invalid",
        ALLOY_CERT_FIXTURE: String(rec.fixture),
        ALLOY_CERT_OPERATION: String(rec.operation),
        ...orgEnv,
        ALLOY_QA_CANDIDATE_SHA: String(rec.candidate_sha),
        ALLOY_QA_REQUEST_ID: requestId,
        ALLOY_QA_BINDING_DIGEST: String(rec.binding_digest),
        ALLOY_QA_AUTHORITY_FILE: file,
        ALLOY_QA_AUTHORITY_SHA256: sha(text),
        npm_lifecycle_event: program.npm_script,
        ...over,
    });
    /** Verifier options: the synthetic root stands in for the trusted resolution; HEAD and the script are the program's. */
    const options = (over: Record<string, unknown> = {}) => ({
        storeRoot: root, nowMs: now, readHead: () => head, readScriptBody: () => program.script_body, ...over,
    });
    /** Replace (or, with null, remove) the environment's target-hold record. */
    const writeHold = (next: Record<string, unknown> | string | null) => {
        if (next === null) rmSync(holdFile, { force: true });
        else writeFileSync(holdFile, typeof next === "string" ? next : `${JSON.stringify(next, null, 2)}\n`);
    };
    return { root, authorityDir, name, file, reqFile, rec, text, sha: sha(text), hold, holdFile, writeHold, writeRequest, writeRun, runsFile, env, options, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
