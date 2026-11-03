/**
 * A SYNTHETIC executor store for the Tours fixture's authority check — no database, no network, no real Gateway
 * state. It writes, under a private temp root, exactly the files the toolkit's isolated fixture executor writes for
 * one v2 execution (toolkit `runIsolatedFixture`, with the registration TOURS-V2-PRODUCT-HANDOFF proposes):
 *
 *   <root>/vacilando/isolated-fixture/authority/<request_id>.<16 hex>.json   the v2 authority record — persona org
 *       `qa_shared`, `database_identity`, `api_identity` (issuableApiIdentity from the environment's API port) and
 *       `program_pins` (`variant: "program"`, over SYNTHETIC artifact bytes served by `deps.readArtifact`)
 *   <root>/vacilando/isolated-fixture/requests/<request_id>.json             the in-flight request naming it
 *   <root>/vacilando/target-holds/<environment_id>.json                      a clear, hash-chained hold record
 *
 * and the child environment `fixtureChildEnv` builds (A741 binding included). Every value is synthetic; the
 * database URL points at a loopback port nothing listens on and is never connected to.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { databaseIdentityOf, issuableApiIdentity, sha256, targetHoldRecordDigest } from "../../../scripts/qa/isolatedFixtureAuthorityV2.mjs";
import { TOURS_FIXTURE_PROGRAM, TOURS_REGISTERED_FIXTURE_ORG, TOURS_REQUIRED_ARTIFACTS, programPinsDigest } from "../../../scripts/qa/toursFixtureAuthority.mjs";

export const SYNTH = Object.freeze({
    requestId: "ifx_req_tours_synthetic_0001",
    environmentId: "certenv-5a5a5a5a5a",
    qaRunId: "qar_5a5a5a5a5a5a",
    candidate: "5a".repeat(20),
    bindingDigest: sha256("synthetic-tours-binding"),
    dbUrl: "postgresql://postgres:SYNTHETIC-DB-SENTINEL@127.0.0.1:56131/postgres",
    apiPort: 56130,
    apiUrl: "http://127.0.0.1:56130",
    serviceKey: "SYNTHETIC-SERVICE-KEY-SENTINEL",
    previewOrigin: "http://127.0.0.1:3101",
    sessionFile: "/synthetic/qa/sessions/admin.json",
    nowMs: Date.parse("2026-11-01T12:00:00.000Z"),
});

/** The persona session the executor names (digest-bound); cookies for the preview host only. */
export const SYNTH_SESSION_TEXT = JSON.stringify({ cookies: [{ name: "sb-alloy-local-auth", value: "cookie-SENTINEL", domain: "127.0.0.1" }] });

type Json = Record<string, unknown>;

/** Synthetic bytes for each pinned artifact: what `deps.readArtifact` serves. Never the real files. */
export const SYNTH_ARTIFACT_BYTES: Readonly<Record<string, string>> = Object.freeze(
    Object.fromEntries(TOURS_REQUIRED_ARTIFACTS.map((a) => [a.path, `synthetic bytes of ${a.path}\n`])),
);

export function syntheticProgramPins(over: Json = {}): Json {
    const body: Json = {
        variant: "program",
        candidate_sha: SYNTH.candidate,
        script_sha256: sha256(TOURS_FIXTURE_PROGRAM.script_body),
        artifacts: TOURS_REQUIRED_ARTIFACTS.map((a) => ({ role: a.role, path: a.path, sha256: sha256(SYNTH_ARTIFACT_BYTES[a.path]) })),
        ...over,
    };
    return { ...body, digest: programPinsDigest(body) };
}

export function syntheticApiIdentity(port: number = SYNTH.apiPort, environmentId: string = SYNTH.environmentId): Json {
    const r = issuableApiIdentity(port, environmentId);
    if (!r.ok) throw new Error(`synthetic api identity: ${r.code}`);
    return r.identity;
}

export function holdRecord(environmentId: string, over: Json = {}): Json {
    const rec: Json = {
        schema: "vacilando.target_hold_record.v1",
        target_key: environmentId,
        scope: { kind: "target", target_key: environmentId },
        state: "clear",
        owner: { kind: "operator", id: "synthetic-operator" },
        evidence: { ref: "synthetic://evidence/clear" },
        governed_request_id: "gar_00000000000a01",
        revision: 1,
        previous_sha256: null,
        recorded_at: "2026-11-01T11:00:00.000Z",
        ...over,
    };
    return { ...rec, record_sha256: targetHoldRecordDigest(rec) };
}

export type SyntheticToursAuthority = {
    root: string;
    authorityFile: string;
    authorityName: string;
    record: Json;
    holdRecord: Json;
    env: Record<string, string | undefined>;
    deps: { storeRoot: string; nowMs: number; readHead: () => string | null; readScriptBody: () => string | null; readArtifact: (path: string) => string };
    rewriteRecord: (next: Json, opts?: { keepRequest?: boolean }) => void;
    writeRequest: (req: Json) => void;
    writeHold: (rec: Json | string | null) => void;
    cleanup: () => void;
};

/** One synthetic execution of `operation` (record and env agree on it). */
export function makeSyntheticToursAuthority({ mutate, envOver, operation = "ensure" }: { mutate?: (r: Json) => void; envOver?: Record<string, string | undefined>; operation?: string } = {}): SyntheticToursAuthority {
    const root = mkdtempSync(join(tmpdir(), "tours-authority-"));
    const authDir = join(root, "vacilando", "isolated-fixture", "authority");
    const reqDir = join(root, "vacilando", "isolated-fixture", "requests");
    const holdDir = join(root, "vacilando", "target-holds");
    for (const d of [authDir, reqDir, holdDir]) mkdirSync(d, { recursive: true });

    const identity = databaseIdentityOf(SYNTH.dbUrl, SYNTH.environmentId);
    if (!identity.ok) throw new Error("synthetic identity");
    const hold = holdRecord(SYNTH.environmentId);
    const holdPath = join(holdDir, `${SYNTH.environmentId}.json`);
    writeFileSync(holdPath, `${JSON.stringify(hold, null, 2)}\n`);

    const record: Json = {
        schema: "vacilando.isolated_fixture_authority.v2",
        request_id: SYNTH.requestId,
        fixture: TOURS_FIXTURE_PROGRAM.fixture,
        operation,
        suite: TOURS_FIXTURE_PROGRAM.suite,
        npm_script: TOURS_FIXTURE_PROGRAM.npm_script,
        script_sha256: sha256(TOURS_FIXTURE_PROGRAM.script_body),
        candidate_sha: SYNTH.candidate,
        qa_run_id: SYNTH.qaRunId,
        environment_id: SYNTH.environmentId,
        binding_digest: SYNTH.bindingDigest,
        mutating: operation !== "count",
        nonce: "5a".repeat(16),
        issued_at: new Date(SYNTH.nowMs - 60_000).toISOString(),
        expires_at: new Date(SYNTH.nowMs + 15 * 60_000).toISOString(),
        fixture_org: { ...TOURS_REGISTERED_FIXTURE_ORG },
        database_identity: identity.identity,
        api_identity: syntheticApiIdentity(),
        program_pins: syntheticProgramPins(),
        target_hold_disposition: {
            schema: "vacilando.target_hold_disposition.v1",
            target_key: SYNTH.environmentId,
            state: "clear",
            record: { revision: hold.revision, record_sha256: hold.record_sha256, owner: hold.owner, governed_request_id: hold.governed_request_id },
            request_id: SYNTH.requestId,
            evaluated_at: new Date(SYNTH.nowMs - 60_000).toISOString(),
        },
    };
    mutate?.(record);

    const authorityName = `${SYNTH.requestId}.0123456789abcdef.json`;
    const authorityFile = join(authDir, authorityName);
    const reqPath = join(reqDir, `${SYNTH.requestId}.json`);
    const writeRequest = (req: Json) => writeFileSync(reqPath, `${JSON.stringify(req)}\n`);
    let authoritySha = "";
    const rewriteRecord = (next: Json, { keepRequest = false } = {}) => {
        const text = `${JSON.stringify(next, null, 2)}\n`;
        writeFileSync(authorityFile, text);
        if (!keepRequest) {
            authoritySha = sha256(text);
            writeRequest({
                schema: "vacilando.isolated_fixture_request.v1", request_id: String(next.request_id ?? SYNTH.requestId), binding_digest: next.binding_digest,
                state: "in_flight", authority: { file: authorityName, sha256: authoritySha },
            });
        }
    };
    rewriteRecord(record);

    const env: Record<string, string | undefined> = {
        PATH: "/usr/bin:/bin",
        HOME: "/tmp",
        NODE_ENV: "test",
        SUPABASE_URL: SYNTH.apiUrl,
        NEXT_PUBLIC_SUPABASE_URL: SYNTH.apiUrl,
        SUPABASE_SERVICE_ROLE_KEY: SYNTH.serviceKey,
        DATABASE_URL: SYNTH.dbUrl,
        ALLOY_QA_RUN_ID: SYNTH.qaRunId,
        ALLOY_QA_ENVIRONMENT_ID: SYNTH.environmentId,
        ALLOY_QA_PERSONA: "admin",
        ALLOY_QA_SESSION_FILE: SYNTH.sessionFile,
        ALLOY_CERT_NAMESPACE: TOURS_FIXTURE_PROGRAM.reserved_namespace,
        ALLOY_CERT_FIXTURE: TOURS_FIXTURE_PROGRAM.fixture,
        ALLOY_CERT_OPERATION: operation,
        ALLOY_CERT_FIXTURE_ORG_ID: TOURS_REGISTERED_FIXTURE_ORG.id,
        ALLOY_CERT_FIXTURE_ORG_SOURCE: TOURS_REGISTERED_FIXTURE_ORG.source,
        ALLOY_QA_PREVIEW_ORIGIN: SYNTH.previewOrigin,
        ALLOY_QA_SESSION_ORIGIN: SYNTH.previewOrigin,
        ALLOY_QA_SESSION_SHA256: sha256(SYNTH_SESSION_TEXT),
        ALLOY_QA_CANDIDATE_SHA: SYNTH.candidate,
        ALLOY_QA_REQUEST_ID: SYNTH.requestId,
        ALLOY_QA_BINDING_DIGEST: SYNTH.bindingDigest,
        ALLOY_QA_BINDING_EXPIRES_AT: new Date(SYNTH.nowMs + 60 * 60_000).toISOString(),
        ALLOY_QA_AUTHORITY_FILE: authorityFile,
        ALLOY_QA_AUTHORITY_SHA256: authoritySha,
        ...envOver,
    };
    return {
        root,
        authorityFile,
        authorityName,
        record,
        holdRecord: hold,
        env,
        deps: {
            storeRoot: root,
            nowMs: SYNTH.nowMs,
            readHead: () => SYNTH.candidate,
            readScriptBody: () => TOURS_FIXTURE_PROGRAM.script_body,
            readArtifact: (path: string) => {
                if (!(path in SYNTH_ARTIFACT_BYTES)) throw Object.assign(new Error("no"), { code: "ENOENT" });
                return SYNTH_ARTIFACT_BYTES[path]!;
            },
        },
        rewriteRecord,
        writeRequest,
        writeHold: (rec) => {
            if (rec === null) rmSync(holdPath, { force: true });
            else writeFileSync(holdPath, typeof rec === "string" ? rec : `${JSON.stringify(rec, null, 2)}\n`);
        },
        cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
}
