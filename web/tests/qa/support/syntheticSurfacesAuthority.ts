/**
 * A SYNTHETIC executor store for the Surfaces c4 room-Uses fixture's authority check — no database, no network, no
 * real Gateway state. Under a private temp root it writes exactly the files the installed toolkit's isolated fixture
 * executor writes for one execution (toolkit 20261031-eeaa6dac6860, `runIsolatedFixture`):
 *
 *   <root>/vacilando/isolated-fixture/authority/<request_id>.<16 hex>.json   the v2 authority record
 *   <root>/vacilando/isolated-fixture/requests/<request_id>.json             the in-flight request naming it
 *   <root>/vacilando/target-holds/<environment_id>.json                      a clear, hash-chained hold record
 *   <root>/vacilando/qa-runs/runs.json                                       the OPEN local QA run
 *
 * and the child environment `fixtureChildEnv` builds. Every value is synthetic; the database URL points at a
 * loopback port nothing listens on and is never connected to.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { databaseIdentityOf, sha256, targetHoldRecordDigest } from "../../../scripts/qa/isolatedFixtureAuthorityV2.mjs";
import { SURFACES_REGISTERED_FIXTURE_ORG, SURFACES_ROOM_USES_PROGRAMS } from "../../../scripts/qa/surfacesFixtureAuthority.mjs";

export type Op = keyof typeof SURFACES_ROOM_USES_PROGRAMS;

export const SYNTH = Object.freeze({
    requestId: "ifx_req_surfaces_0001",
    environmentId: "certenv-5c5c5c5c5c",
    qaRunId: "qar_5c5c5c5c5c5c",
    persona: "observer",
    candidate: "5c".repeat(20),
    bindingDigest: sha256("synthetic-surfaces-binding"),
    dbUrl: "postgresql://postgres:SYNTHETIC-DB-SENTINEL@127.0.0.1:56231/postgres",
    apiUrl: "http://127.0.0.1:56230",
    serviceKey: "SYNTHETIC-SERVICE-KEY-SENTINEL",
    nowMs: Date.parse("2026-10-31T12:00:00.000Z"),
});

type Json = Record<string, unknown>;

export function holdRecord(environmentId: string, over: Json = {}): Json {
    const rec: Json = {
        schema: "vacilando.target_hold_record.v1",
        target_key: environmentId,
        scope: { kind: "target", target_key: environmentId },
        state: "clear",
        owner: { kind: "operator", id: "synthetic-operator" },
        evidence: { ref: "synthetic://evidence/clear" },
        governed_request_id: "gar_00000000000c01",
        revision: 1,
        previous_sha256: null,
        recorded_at: "2026-10-31T11:00:00.000Z",
        ...over,
    };
    return { ...rec, record_sha256: targetHoldRecordDigest(rec) };
}

export type SyntheticSurfaces = {
    op: Op;
    root: string;
    authorityFile: string;
    authorityName: string;
    requestPath: string;
    record: Json;
    hold: Json;
    env: Record<string, string | undefined>;
    /** The verifier's test seams: the synthetic store, the clock, this candidate's HEAD, script body and SQL pins. */
    seams: { storeRoot: string; nowMs: number; readHead: () => string | null; readScriptBody: () => string | null; readSql: () => { disk: string | null; committed: string | null } };
    rewriteRecord: (next: Json, opts?: { keepRequest?: boolean }) => void;
    writeRequest: (req: Json) => void;
    writeHold: (rec: Json | string | null) => void;
    writeRuns: (runs: Json) => void;
    cleanup: () => void;
};

/** One synthetic execution of `op`. `mutate` edits the record before it is written; `run` patches the ledger run. */
export function makeSyntheticSurfaces(
    op: Op = "ensure",
    { mutate, envOver, run: runOver }: { mutate?: (r: Json) => void; envOver?: Record<string, string | undefined>; run?: Json } = {},
): SyntheticSurfaces {
    const p = SURFACES_ROOM_USES_PROGRAMS[op];
    const root = mkdtempSync(join(tmpdir(), "surfaces-authority-"));
    const authDir = join(root, "vacilando", "isolated-fixture", "authority");
    const reqDir = join(root, "vacilando", "isolated-fixture", "requests");
    const holdDir = join(root, "vacilando", "target-holds");
    const runsDir = join(root, "vacilando", "qa-runs");
    for (const d of [authDir, reqDir, holdDir, runsDir]) mkdirSync(d, { recursive: true });

    const identity = databaseIdentityOf(SYNTH.dbUrl, SYNTH.environmentId);
    if (!identity.ok) throw new Error("synthetic identity");
    const hold = holdRecord(SYNTH.environmentId);
    const holdPath = join(holdDir, `${SYNTH.environmentId}.json`);
    const writeHold = (rec: Json | string | null) => {
        if (rec === null) rmSync(holdPath, { force: true });
        else writeFileSync(holdPath, typeof rec === "string" ? rec : `${JSON.stringify(rec, null, 2)}\n`);
    };
    writeHold(hold);

    const runsPath = join(runsDir, "runs.json");
    const writeRuns = (runs: Json) => writeFileSync(runsPath, `${JSON.stringify({ runs })}\n`);
    writeRuns({
        [SYNTH.qaRunId]: {
            run_id: SYNTH.qaRunId, state: "OPEN", lease_expires_at: "2026-10-31T15:00:00.000Z",
            target: { kind: "local", key: SYNTH.environmentId },
            personas: [{ persona_key: SYNTH.persona, org_key: "qa_shared", identity_key: "qa_pool_09" }],
            ...runOver,
        },
    });

    const record: Json = {
        schema: "vacilando.isolated_fixture_authority.v2",
        request_id: SYNTH.requestId,
        fixture: p.fixture,
        operation: op,
        suite: p.suite,
        npm_script: p.npm_script,
        script_sha256: sha256(p.script_body),
        candidate_sha: SYNTH.candidate,
        qa_run_id: SYNTH.qaRunId,
        environment_id: SYNTH.environmentId,
        binding_digest: SYNTH.bindingDigest,
        mutating: p.mutating,
        nonce: "5c".repeat(16),
        issued_at: new Date(SYNTH.nowMs - 60_000).toISOString(),
        expires_at: new Date(SYNTH.nowMs + 4 * 60_000).toISOString(),
        fixture_org: { ...SURFACES_REGISTERED_FIXTURE_ORG },
        database_identity: identity.identity,
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
    const requestPath = join(reqDir, `${SYNTH.requestId}.json`);
    const writeRequest = (req: Json) => writeFileSync(requestPath, `${JSON.stringify(req)}\n`);
    const rewriteRecord = (next: Json, { keepRequest = false } = {}) => {
        const text = `${JSON.stringify(next, null, 2)}\n`;
        writeFileSync(authorityFile, text);
        if (!keepRequest) {
            writeRequest({
                schema: "vacilando.isolated_fixture_request.v1", request_id: String(next.request_id ?? SYNTH.requestId), binding_digest: next.binding_digest,
                state: "in_flight", authority: { file: authorityName, sha256: sha256(text) },
            });
        }
    };
    rewriteRecord(record);

    const env: Record<string, string | undefined> = {
        PATH: "/usr/bin:/bin",
        HOME: "/tmp",
        TMPDIR: "/tmp",
        LANG: "C.UTF-8",
        NODE_ENV: "test",
        NO_COLOR: "1",
        SUPABASE_URL: SYNTH.apiUrl,
        NEXT_PUBLIC_SUPABASE_URL: SYNTH.apiUrl,
        SUPABASE_SERVICE_ROLE_KEY: SYNTH.serviceKey,
        DATABASE_URL: SYNTH.dbUrl,
        ALLOY_QA_RUN_ID: SYNTH.qaRunId,
        ALLOY_QA_ENVIRONMENT_ID: SYNTH.environmentId,
        ALLOY_QA_PERSONA: SYNTH.persona,
        ALLOY_CERT_NAMESPACE: "surfaces-cert.alloy.invalid",
        ALLOY_CERT_FIXTURE: p.fixture,
        ALLOY_CERT_OPERATION: op,
        ALLOY_CERT_FIXTURE_ORG_ID: SURFACES_REGISTERED_FIXTURE_ORG.id,
        ALLOY_CERT_FIXTURE_ORG_SOURCE: SURFACES_REGISTERED_FIXTURE_ORG.source,
        ALLOY_QA_CANDIDATE_SHA: SYNTH.candidate,
        ALLOY_QA_REQUEST_ID: SYNTH.requestId,
        ALLOY_QA_BINDING_DIGEST: SYNTH.bindingDigest,
        ALLOY_QA_AUTHORITY_FILE: authorityFile,
        npm_lifecycle_event: p.npm_script,
        ...envOver,
    };
    return {
        op,
        root,
        authorityFile,
        authorityName,
        requestPath,
        record,
        hold,
        env,
        seams: {
            storeRoot: root,
            nowMs: SYNTH.nowMs,
            readHead: () => SYNTH.candidate,
            readScriptBody: () => p.script_body,
            readSql: () => ({ disk: p.sql_sha256, committed: p.sql_sha256 }),
        },
        rewriteRecord,
        writeRequest,
        writeHold,
        writeRuns,
        cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
}
