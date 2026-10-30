/**
 * A SYNTHETIC executor store, shaped as the toolkit's isolated executor writes it
 * (`lib/isolated-fixture-execution.mjs`, A741 bab9c927: the authority record under
 * `<root>/vacilando/isolated-fixture/authority/<request>.<hex>.json`, and the in-flight request record
 * naming its file and sha256). In a temp directory only — never the real Gateway store. No credential:
 * every key is a synthetic string.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    FINANCIALS_FIXTURE_ORG,
    FINANCIALS_HISTORICAL_DRAFT_PROGRAM,
    FINANCIALS_ISOLATED_PROGRAM,
    FIXTURE_AUTHORITY_SCHEMA,
    QA_PERSONA_ORGS,
} from "../../scripts/qa/financialsFixtureAuthority.mjs";

export const SYNTHETIC_HEAD = "c".repeat(40);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export type Env = Record<string, string | undefined>;
type Program = typeof FINANCIALS_ISOLATED_PROGRAM | typeof FINANCIALS_HISTORICAL_DRAFT_PROGRAM;

/** The persona a persona-bound synthetic run binds, and its org (A741 QA_ORGS.qa_shared). */
export const SYNTHETIC_PERSONA = "finance_admin";
export const SYNTHETIC_PERSONA_ORG = QA_PERSONA_ORGS.qa_shared;

export function syntheticExecutorStore({ now = Date.now(), requestId = "req-fin-auth-0001", record = {}, head = SYNTHETIC_HEAD, program = FINANCIALS_ISOLATED_PROGRAM, operation = program.operations[0] }: { now?: number; requestId?: string; record?: Record<string, unknown>; head?: string; program?: Program; operation?: string } = {}) {
    const root = mkdtempSync(join(tmpdir(), "fin-authority-"));
    const store = join(root, "vacilando", "isolated-fixture");
    const authorityDir = join(store, "authority");
    const requestsDir = join(store, "requests");
    mkdirSync(authorityDir, { recursive: true });
    mkdirSync(requestsDir, { recursive: true });
    const name = `${requestId}.${randomBytes(8).toString("hex")}.json`;
    const file = join(authorityDir, name);
    const rec: Record<string, unknown> = {
        schema: FIXTURE_AUTHORITY_SCHEMA, request_id: requestId, fixture: program.fixture, operation,
        suite: program.suite, npm_script: program.npm_script, script_sha256: sha(program.script_body),
        candidate_sha: head, qa_run_id: "qar_0123456789ab", environment_id: "certenv-0123456789", binding_digest: "b".repeat(64), mutating: true,
        nonce: randomBytes(16).toString("hex"), issued_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 600_000).toISOString(),
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
    const orgEnv: Env = program.org_binding === "persona"
        ? { ALLOY_CERT_FIXTURE_ORG_ID: SYNTHETIC_PERSONA_ORG, ALLOY_CERT_FIXTURE_ORG_SOURCE: "persona" }
        : { ALLOY_CERT_FIXTURE_ORG_ID: FINANCIALS_FIXTURE_ORG.id, ALLOY_CERT_FIXTURE_ORG_SOURCE: FINANCIALS_FIXTURE_ORG.source };
    /** The executor-built environment for this record: binding, authority and the bound seed org. */
    const env = (over: Env = {}): Env => ({
        NODE_ENV: "test",
        SUPABASE_URL: "http://127.0.0.1:56102",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56102",
        SUPABASE_SERVICE_ROLE_KEY: "sk_synthetic_authority_never_print_0123456789",
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
    return { root, authorityDir, name, file, reqFile, rec, text, sha: sha(text), writeRequest, writeRun, runsFile, env, options, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
