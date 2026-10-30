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

import { FINANCIALS_FIXTURE_ORG, FINANCIALS_ISOLATED_PROGRAM, FIXTURE_AUTHORITY_SCHEMA } from "../../scripts/qa/financialsFixtureAuthority.mjs";

export const SYNTHETIC_HEAD = "c".repeat(40);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export type Env = Record<string, string | undefined>;

export function syntheticExecutorStore({ now = Date.now(), requestId = "req-fin-auth-0001", record = {}, head = SYNTHETIC_HEAD }: { now?: number; requestId?: string; record?: Record<string, unknown>; head?: string } = {}) {
    const root = mkdtempSync(join(tmpdir(), "fin-authority-"));
    const store = join(root, "vacilando", "isolated-fixture");
    const authorityDir = join(store, "authority");
    const requestsDir = join(store, "requests");
    mkdirSync(authorityDir, { recursive: true });
    mkdirSync(requestsDir, { recursive: true });
    const name = `${requestId}.${randomBytes(8).toString("hex")}.json`;
    const file = join(authorityDir, name);
    const rec: Record<string, unknown> = {
        schema: FIXTURE_AUTHORITY_SCHEMA, request_id: requestId, fixture: FINANCIALS_ISOLATED_PROGRAM.fixture, operation: FINANCIALS_ISOLATED_PROGRAM.operation,
        suite: FINANCIALS_ISOLATED_PROGRAM.suite, npm_script: FINANCIALS_ISOLATED_PROGRAM.npm_script, script_sha256: sha(FINANCIALS_ISOLATED_PROGRAM.script_body),
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
    /** The executor-built environment for this record: binding, authority and the bound seed org. */
    const env = (over: Env = {}): Env => ({
        NODE_ENV: "test",
        SUPABASE_URL: "http://127.0.0.1:56102",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56102",
        SUPABASE_SERVICE_ROLE_KEY: "sk_synthetic_authority_never_print_0123456789",
        ALLOY_QA_RUN_ID: String(rec.qa_run_id),
        ALLOY_QA_ENVIRONMENT_ID: String(rec.environment_id),
        ALLOY_QA_PERSONA: "finance_admin",
        ALLOY_CERT_NAMESPACE: "financials-cert.alloy.invalid",
        ALLOY_CERT_FIXTURE: String(rec.fixture),
        ALLOY_CERT_OPERATION: String(rec.operation),
        ALLOY_CERT_FIXTURE_ORG_ID: FINANCIALS_FIXTURE_ORG.id,
        ALLOY_CERT_FIXTURE_ORG_SOURCE: FINANCIALS_FIXTURE_ORG.source,
        ALLOY_QA_CANDIDATE_SHA: String(rec.candidate_sha),
        ALLOY_QA_REQUEST_ID: requestId,
        ALLOY_QA_BINDING_DIGEST: String(rec.binding_digest),
        ALLOY_QA_AUTHORITY_FILE: file,
        ALLOY_QA_AUTHORITY_SHA256: sha(text),
        npm_lifecycle_event: FINANCIALS_ISOLATED_PROGRAM.npm_script,
        ...over,
    });
    /** Verifier options: the synthetic root stands in for the trusted resolution; HEAD and the script are the program's. */
    const options = (over: Record<string, unknown> = {}) => ({
        storeRoot: root, nowMs: now, readHead: () => head, readScriptBody: () => FINANCIALS_ISOLATED_PROGRAM.script_body, ...over,
    });
    return { root, authorityDir, name, file, reqFile, rec, text, sha: sha(text), writeRequest, env, options, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
