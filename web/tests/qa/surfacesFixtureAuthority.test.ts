/**
 * SURFACES c4 FIXTURE — EXECUTOR AUTHORITY v2, CHILD SIDE. Synthetic only: a private temp store stands in for the
 * executor's (the exact files the installed toolkit writes), a fake HEAD/script/SQL pin, and a fake Postgres client.
 * No env file, credential, database, network or real Gateway state is touched. None of this is live evidence.
 *
 * Pinned to the installed toolkit (20261031-eeaa6dac6860): the shared product verifier is the vendored module the
 * Enrollment and Financials sprints carry (same git blob), the vendored v2 vectors reproduce, and the runner's
 * script bodies are the ones the toolkit registered for `surfaces_room_uses_ensure` / `_reset`.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    TOOLKIT_SOURCE,
    connectionTargetOf,
    databaseIdentityOf,
    sha256,
    targetHoldRecordDigest,
    verifyConnectionTarget,
    verifyTargetHoldDisposition,
} from "../../scripts/qa/isolatedFixtureAuthorityV2.mjs";
import * as AUTH from "../../scripts/qa/surfacesFixtureAuthority.mjs";
import { SURFACES_FIXTURE_NAMESPACE, SURFACES_RESET_LIMIT, runSurfacesRoomUsesFixture } from "../../scripts/qa/surfacesRoomUsesFixtureRunner.mjs";
import { SYNTH, holdRecord, makeSyntheticSurfaces, type Op, type SyntheticSurfaces } from "./support/syntheticSurfacesAuthority";

import { QA_ORGS, QA_SURFACES_ROOM_USES_FIXTURE as FX } from "@/lib/qa/sharedQaRegistry";

const R = AUTH.FIXTURE_AUTHORITY_REFUSALS;
const P = AUTH.SURFACES_ROOM_USES_PROGRAMS;
const WEB = join(__dirname, "../..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const FIREFLY = "93667019-bd28-49b5-a688-acc9bb1e0a19";

/** The shared verifier's git blob on sprint/opwork_2cea84351d90_sprint_a0442b8fac97 (80eb74466) and sprint/opwork_b77b3cbb5840_sprint_386d603e60c7 (1b8d6e2b1). */
const SHARED_VERIFIER_BLOB = "20f04adeb14be4667e4415cccd25e19fadf71881";
const VECTORS_PATH = "tests/qa/fixtures/isolated-fixture-authority-v2.vectors.json";
const VECTORS_SHA256 = "c028b885672509e5f28e30b12f0cf3f2128bba92d45999002daad6894cb94d4c";
/** Installed toolkit eeaa6dac6860 lib/certification-fixture.mjs: the registered surfaces_room_uses_* pins. */
const INSTALLED = {
    candidate: "47332abe2d47581b3e9c81ee809b28d4881316da",
    ensure: { script_sha256: "d090b5fe0b0f590914f9b56250b1d9e04ca47d154257e9900abff0862102fc91", sql_sha256: "95a4906215c04c121c3cbf4bd2ae281e0d06f3365d155fe0ad72f8cca476c139" },
    reset: { script_sha256: "362d61b3641fc56a40a9ad2ed9221af9b10f49878add7bcc2b21e54dad574fc9", sql_sha256: "7fc6f68a588024c946717589050666e6e91fe20c8b71fcce2469d9ef6bb2c349" },
    reserved_namespace: "surfaces-cert.alloy.invalid",
};

let open: SyntheticSurfaces[] = [];
const synth = (op: Op = "ensure", o?: Parameters<typeof makeSyntheticSurfaces>[1]) => {
    const s = makeSyntheticSurfaces(op, o);
    open.push(s);
    return s;
};
afterEach(() => {
    for (const s of open) s.cleanup();
    open = [];
});
const verify = (s: SyntheticSurfaces, env = s.env, over: Record<string, unknown> = {}) =>
    AUTH.verifySurfacesFixtureAuthority(env, { ...s.seams, ...over, program: (over.program as never) ?? P[s.op] } as never);
const mismatch = (fields: string[]) => ({ ok: false, code: R.MISMATCH, fields });

describe("adopts the shared v2 verifier — no second restatement", () => {
    it("is the vendored module, byte-for-byte, and the vendored vectors", () => {
        const bytes = readFileSync(join(WEB, "scripts/qa/isolatedFixtureAuthorityV2.mjs"));
        const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
        expect(blob).toBe(SHARED_VERIFIER_BLOB);
        expect(sha256(read(VECTORS_PATH))).toBe(VECTORS_SHA256);
        expect(TOOLKIT_SOURCE.commit).toBe("eeaa6dac68600dee8862962decd42b60169523b9");
    });

    it("the Surfaces guard restates nothing the shared module owns", () => {
        const src = read("scripts/qa/surfacesFixtureAuthority.mjs");
        expect(src).toContain(`from "./isolatedFixtureAuthorityV2.mjs"`);
        for (const owned of ["function databaseIdentityOf", "function connectionTargetOf", "function verifyTargetHoldDisposition", "realpathSync", "userInfo", "isolated_fixture_authority.v1"]) {
            expect(src, owned).not.toContain(owned);
        }
        expect(src).not.toMatch(/TARGET_UNBOUND|fixture_authority_target_unbound/);
    });

    it("the programs are the installed registration's: script bodies, SQL pins, namespace", () => {
        const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
        for (const op of ["ensure", "reset"] as const) {
            expect(pkg.scripts[P[op].npm_script]).toBe(P[op].script_body);
            expect(sha256(P[op].script_body)).toBe(INSTALLED[op].script_sha256);
            expect(P[op].sql_sha256).toBe(INSTALLED[op].sql_sha256);
            expect(P[op].fixture).toBe(`surfaces_room_uses_${op}`);
            expect(P[op].mutating).toBe(true);
        }
        expect(SURFACES_FIXTURE_NAMESPACE).toBe(INSTALLED.reserved_namespace);
        expect(SURFACES_RESET_LIMIT).toBe(2);
        expect(AUTH.SURFACES_REGISTERED_FIXTURE_ORG).toEqual({ id: QA_ORGS.qa_shared.id, key: "qa_shared", source: "persona" });
    });

    it("the census program is the registry's, read only, and has its own script", () => {
        const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
        expect(pkg.scripts[P.census.npm_script]).toBe(P.census.script_body);
        expect(P.census.mutating).toBe(false);
        expect(P.census.sql_path).toBe(FX.paths.fixture_census);
        expect(P.census.sql_sha256).toBe(FX.sha256.census);
        expect(createHash("sha256").update(readFileSync(join(WEB, "..", P.census.sql_path))).digest("hex")).toBe(P.census.sql_sha256);
        for (const op of ["ensure", "reset"] as const) {
            expect(P[op].sql_sha256).toBe(FX.sha256[op]);
            expect(P[op].npm_script).toBe(FX.runners[op]);
        }
        expect(P.census.npm_script).toBe(FX.runners.census);
    });
});

describe("a genuine executor-issued v2 authority", () => {
    it.each(["ensure", "reset", "census"] as const)("%s: accepted; run, org, environment, database and hold come from the record", (op) => {
        const s = synth(op);
        expect(verify(s)).toMatchObject({
            ok: true,
            authority: {
                request_id: SYNTH.requestId, qa_run_id: SYNTH.qaRunId, environment_id: SYNTH.environmentId, candidate_sha: SYNTH.candidate,
                org_id: QA_ORGS.qa_shared.id, org_key: "qa_shared", hold_revision: 1, operation: op, mutating: op !== "census",
                database_identity_digest: (s.record.database_identity as { digest: string }).digest,
            },
        });
    });
});

describe("absent, forged, replayed or expired authority", () => {
    it("absent — the org variable and a qar_ id alone are not authority", () => {
        const s = synth("ensure", { envOver: { ALLOY_QA_AUTHORITY_FILE: undefined } });
        expect(verify(s)).toEqual({ ok: false, code: R.ABSENT });
    });

    it("no trusted store root", () => {
        const s = synth();
        expect(verify(s, s.env, { storeRoot: null })).toEqual({ ok: false, code: R.UNTRUSTED_ROOT });
        expect(read("scripts/qa/surfacesFixtureAuthority.mjs")).not.toMatch(/process\.env\.(HOME|ALLOY_RUNTIME_ROOT)|env\.(HOME|ALLOY_RUNTIME_ROOT)\b/);
    });

    it("forged origin: an identical record outside the executor's authority directory", () => {
        const s = synth();
        const dir = mkdtempSync(join(tmpdir(), "surfaces-forged-"));
        try {
            const forged = join(dir, s.authorityName);
            copyFileSync(s.authorityFile, forged);
            expect(verify(s, { ...s.env, ALLOY_QA_AUTHORITY_FILE: forged })).toEqual({ ok: false, code: R.ORIGIN });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("forged: a hand-written record in the right directory with no live executor request", () => {
        const s = synth();
        rmSync(s.requestPath);
        expect(verify(s)).toEqual({ ok: false, code: R.PROVENANCE });
    });

    it("replayed: the execution completed (request complete), or the executor removed the record", () => {
        const s = synth();
        const text = readFileSync(s.authorityFile, "utf8");
        s.writeRequest({ request_id: SYNTH.requestId, binding_digest: SYNTH.bindingDigest, state: "complete", authority: { file: s.authorityName, sha256: sha256(text) } });
        expect(verify(s)).toEqual({ ok: false, code: R.PROVENANCE });
        const t = synth();
        rmSync(t.authorityFile);
        expect(verify(t)).toEqual({ ok: false, code: R.ABSENT });
    });

    it("forged hash: bytes altered after issue, or a forged environment digest", () => {
        const s = synth();
        s.rewriteRecord({ ...s.record, mutating: false }, { keepRequest: true });
        expect(verify(s)).toEqual({ ok: false, code: R.ALTERED });
        const t = synth();
        expect(verify(t, { ...t.env, ALLOY_QA_AUTHORITY_SHA256: "f".repeat(64) })).toEqual({ ok: false, code: R.ALTERED });
    });

    it("expired, and not yet valid", () => {
        const s = synth();
        expect(verify(s, s.env, { nowMs: Date.parse(String(s.record.expires_at)) })).toEqual({ ok: false, code: R.EXPIRED });
        expect(verify(s, s.env, { nowMs: Date.parse(String(s.record.issued_at)) - 1 })).toEqual({ ok: false, code: R.NOT_YET });
    });

    it("a v1 record carries no organization, database or hold — refused, never a v1 fallback", () => {
        const s = synth("ensure", { mutate: (r) => { r.schema = "vacilando.isolated_fixture_authority.v1"; delete r.fixture_org; delete r.database_identity; delete r.target_hold_disposition; } });
        expect(verify(s)).toEqual({ ok: false, code: R.ORG_UNBOUND });
        const u = synth("ensure", { mutate: (r) => { r.schema = "vacilando.isolated_fixture_authority.v9"; } });
        expect(verify(u)).toEqual({ ok: false, code: R.SCHEMA });
    });
});

describe("exact operation, candidate, script and SQL binding", () => {
    it("an ensure authority cannot run reset or census, and the reverse", () => {
        const all = ["fixture", "operation", "npm_script", "script_sha256", "npm_lifecycle_event"];
        const s = synth("ensure");
        expect(verify(s, s.env, { program: P.reset })).toEqual(mismatch(all));
        expect(verify(s, s.env, { program: P.census })).toEqual(mismatch(all));
        const r = synth("reset");
        expect(verify(r, r.env, { program: P.ensure })).toEqual(mismatch(all));
        const c = synth("census");
        expect(verify(c, c.env, { program: P.reset })).toEqual(mismatch(all));
    });

    it("an operation the record and env agree on but this program is not", () => {
        const s = synth("ensure", { mutate: (r) => { r.operation = "reset"; }, envOver: { ALLOY_CERT_OPERATION: "reset" } });
        expect(verify(s)).toEqual(mismatch(["operation"]));
    });

    it("another fixture's genuine authority (Enrollment)", () => {
        const s = synth("ensure", { mutate: (r) => { r.fixture = "enrollment_isolated_tests"; r.suite = "enrollment"; r.npm_script = "test:qa:enrollment-isolated"; }, envOver: { ALLOY_CERT_FIXTURE: "enrollment_isolated_tests" } });
        expect(verify(s)).toEqual(mismatch(["fixture", "suite", "npm_script"]));
    });

    it("a non-mutating grant does not admit a mutating program, nor a mutating grant the census", () => {
        const s = synth("ensure", { mutate: (r) => { r.mutating = false; } });
        expect(verify(s)).toEqual(mismatch(["mutating"]));
        const c = synth("census", { mutate: (r) => { r.mutating = true; } });
        expect(verify(c)).toEqual(mismatch(["mutating"]));
    });

    it("another candidate checked out, or a drifted package.json script body", () => {
        const s = synth();
        expect(verify(s, s.env, { readHead: () => "6d".repeat(20) })).toEqual(mismatch(["candidate_sha"]));
        expect(verify(s, s.env, { readScriptBody: () => "node scripts/somethingElse.mjs" })).toEqual(mismatch(["script_sha256"]));
    });

    it("invoked as another npm lifecycle script", () => {
        const s = synth();
        expect(verify(s, { ...s.env, npm_lifecycle_event: "dev:qa:authz-fixture-ensure" })).toEqual(mismatch(["npm_lifecycle_event"]));
    });

    it("SQL edited on disk, or not the bytes committed at the candidate", () => {
        const s = synth();
        expect(verify(s, s.env, { readSql: () => ({ disk: "0".repeat(64), committed: P.ensure.sql_sha256 }) })).toEqual({ ok: false, code: R.SQL, fields: ["sql_on_disk"] });
        expect(verify(s, s.env, { readSql: () => ({ disk: P.ensure.sql_sha256, committed: null }) })).toEqual({ ok: false, code: R.SQL, fields: ["sql_at_candidate"] });
    });

    it("an unregistered program never reaches the store", () => {
        const s = synth();
        const readFile = vi.fn();
        expect(verify(s, s.env, { program: { ...P.ensure }, readFile })).toEqual({ ok: false, code: R.PROGRAM });
        expect(readFile).not.toHaveBeenCalled();
    });
});

describe("fake run syntax and forged environment identity", () => {
    it("a well-formed qar_ id in the environment that the record does not name", () => {
        const s = synth();
        expect(verify(s, { ...s.env, ALLOY_QA_RUN_ID: "qar_ffffffffffff" })).toEqual(mismatch(["qa_run_id"]));
    });

    it("a genuine-looking record naming a qar_ id the executor's ledger does not hold", () => {
        const s = synth();
        s.writeRuns({});
        expect(verify(s)).toEqual({ ok: false, code: R.QA_RUN });
    });

    it.each([
        ["closed", { state: "CLOSED" }],
        ["lease expired (abandoned)", { lease_expires_at: "2026-10-31T11:00:00.000Z" }],
        ["hosted", { target: { kind: "hosted", key: SYNTH.environmentId } }],
        ["another environment", { target: { kind: "local", key: "certenv-6d6d6d6d6d" } }],
    ])("ledger run %s", (_l, run) => {
        expect(verify(synth("ensure", { run }))).toEqual({ ok: false, code: R.QA_RUN });
    });

    it("a forged environment id, request id or binding digest", () => {
        const s = synth();
        expect(verify(s, { ...s.env, ALLOY_QA_ENVIRONMENT_ID: "certenv-6d6d6d6d6d" })).toEqual(mismatch(["environment_id"]));
        expect(verify(s, { ...s.env, ALLOY_QA_REQUEST_ID: "ifx_req_surfaces_0002" })).toEqual(mismatch(["request_id"]));
        expect(verify(s, { ...s.env, ALLOY_QA_BINDING_DIGEST: "c".repeat(64) })).toEqual(mismatch(["binding_digest"]));
    });

    it("the database identity the record names is for another environment", () => {
        const s = synth("ensure", { mutate: (r) => { r.database_identity = { ...(r.database_identity as object), environment_id: "certenv-6d6d6d6d6d" }; } });
        expect(verify(s)).toEqual(mismatch(["database_identity"]));
    });
});

describe("mismatched organization", () => {
    it.each([
        ["env org Firefly", { ALLOY_CERT_FIXTURE_ORG_ID: FIREFLY }],
        ["env org QA Secondary", { ALLOY_CERT_FIXTURE_ORG_ID: QA_ORGS.qa_secondary.id }],
        ["env org source forged", { ALLOY_CERT_FIXTURE_ORG_SOURCE: "seed_manifest" }],
        ["env org absent", { ALLOY_CERT_FIXTURE_ORG_ID: undefined }],
    ])("%s", (_l, envOver) => {
        expect(verify(synth("ensure", { envOver }))).toEqual(mismatch(["fixture_org"]));
    });

    it("a genuine record for another organization is not this entry's (Firefly, seed org, QA Shared under another key)", () => {
        for (const org of [{ id: FIREFLY, key: "firefly", source: "persona" }, { id: "00000000-0000-4000-8000-000000000001", key: "certification_seed", source: "seed_manifest" }, { id: QA_ORGS.qa_shared.id, key: "qa_secondary", source: "persona" }]) {
            const s = synth("ensure", { mutate: (r) => { r.fixture_org = org; }, envOver: { ALLOY_CERT_FIXTURE_ORG_ID: org.id, ALLOY_CERT_FIXTURE_ORG_SOURCE: org.source } });
            expect(verify(s), org.key).toEqual({ ok: false, code: R.ORG_NOT_REGISTERED });
        }
    });

    it("the persona the ledger bound is not QA Shared's, or is not in the run", () => {
        expect(verify(synth("ensure", { run: { personas: [{ persona_key: SYNTH.persona, org_key: "qa_secondary" }] } }))).toEqual({ ok: false, code: R.PERSONA_ORG });
        const s = synth();
        expect(verify(s, { ...s.env, ALLOY_QA_PERSONA: "someone_else" })).toEqual({ ok: false, code: R.PERSONA_ORG });
    });
});

describe("mismatched connection and held targets", () => {
    it("DATABASE_URL elsewhere: another port, the shared stack, non-loopback, a pooler/override parameter, a PG* variable, absent", () => {
        const s = synth();
        expect(verify(s, { ...s.env, DATABASE_URL: SYNTH.dbUrl.replace(":56231/", ":56241/") })).toEqual({ ok: false, code: "database_identity_mismatch" });
        expect(verify(s, { ...s.env, DATABASE_URL: SYNTH.dbUrl.replace(":56231/", ":54422/") })).toEqual({ ok: false, code: "database_identity_shared_target_refused" });
        expect(verify(s, { ...s.env, DATABASE_URL: SYNTH.dbUrl.replace("127.0.0.1", "10.0.0.5") })).toEqual({ ok: false, code: "database_identity_not_loopback" });
        expect(verify(s, { ...s.env, DATABASE_URL: `${SYNTH.dbUrl}?port=54422` })).toEqual({ ok: false, code: "connection_target_parameter_override", fields: ["port"] });
        expect(verify(s, { ...s.env, DATABASE_URL: `${SYNTH.dbUrl}?pgbouncer=true` })).toEqual({ ok: false, code: "connection_target_parameter_override", fields: ["pgbouncer"] });
        expect(verify(s, { ...s.env, PGHOST: "127.0.0.1" })).toEqual({ ok: false, code: "connection_target_client_env_override", fields: ["PGHOST"] });
        expect(verify(s, { ...s.env, DATABASE_URL: undefined })).toEqual({ ok: false, code: "database_identity_absent" });
    });

    it("the PostgREST origin is the shared stack's API or a hosted project", () => {
        const s = synth();
        expect(verify(s, { ...s.env, SUPABASE_URL: "http://127.0.0.1:54421" })).toEqual({ ok: false, code: "fixture_api_target_shared_refused" });
        expect(verify(s, { ...s.env, SUPABASE_URL: "https://synthetic.supabase.co" })).toEqual({ ok: false, code: "fixture_api_target_malformed" });
    });

    it("held, absent, changed since issue, reforged, or a disposition for another request", () => {
        const held = synth();
        held.writeHold(holdRecord(SYNTH.environmentId, { state: "held", revision: 2, previous_sha256: held.hold.record_sha256 }));
        expect(verify(held)).toEqual({ ok: false, code: "target_hold_held" });

        const absent = synth();
        absent.writeHold(null);
        expect(verify(absent)).toEqual({ ok: false, code: "target_hold_record_absent" });

        const changed = synth();
        changed.writeHold(holdRecord(SYNTH.environmentId, { revision: 2, previous_sha256: changed.hold.record_sha256 }));
        expect(verify(changed)).toEqual({ ok: false, code: "target_hold_changed_since_issue" });

        const reforged = synth();
        reforged.writeHold({ ...reforged.hold, state: "held" });
        expect(verify(reforged)).toEqual({ ok: false, code: "target_hold_record_reforged" });

        const other = synth("ensure", { mutate: (r) => { (r.target_hold_disposition as Record<string, unknown>).request_id = "ifx_req_surfaces_0002"; } });
        expect(verify(other)).toEqual({ ok: false, code: "target_hold_disposition_invalid" });
    });

    it("the shared alloy-cert stack as the environment, even with a clear hold and a non-shared port", () => {
        const hold = holdRecord("alloy-cert");
        const id = databaseIdentityOf(SYNTH.dbUrl, "alloy-cert");
        const s = synth("ensure", {
            mutate: (r) => {
                r.environment_id = "alloy-cert";
                r.database_identity = id.ok ? id.identity : null;
                r.target_hold_disposition = { ...(r.target_hold_disposition as object), target_key: "alloy-cert", record: { revision: hold.revision, record_sha256: hold.record_sha256, owner: hold.owner, governed_request_id: hold.governed_request_id } };
            },
            envOver: { ALLOY_QA_ENVIRONMENT_ID: "alloy-cert" },
            run: { target: { kind: "local", key: "alloy-cert" } },
        });
        writeFileSync(join(s.root, "vacilando", "target-holds", "alloy-cert.json"), JSON.stringify(hold));
        expect(verify(s)).toEqual({ ok: false, code: R.SHARED_TARGET });
    });
});

describe("the runner: authority first, then only the attested connection", () => {
    const fakes = (stdout = "DELETE 0\nDELETE 0\nINSERT 0 1\nINSERT 0 1\n") => ({
        resolveClient: vi.fn((_e: Record<string, string | undefined>) => ({ path: "/synthetic/psql", source: "fake" })),
        exec: vi.fn((_bin: string, _args: string[], _o: { env: Readonly<Record<string, string>> }) => stdout),
        readFixture: vi.fn((rel: string) => readFileSync(join(WEB, "..", rel))),
    });
    const runner = (s: SyntheticSurfaces, f: ReturnType<typeof fakes>, env = s.env, op: Op = s.op) =>
        runSurfacesRoomUsesFixture(op, { env, authority: s.seams, ...f });

    it.each([
        ["absent", () => synth("ensure", { envOver: { ALLOY_QA_AUTHORITY_FILE: undefined } })],
        ["replayed", () => { const s = synth(); s.writeRequest({ state: "complete" }); return s; }],
        ["expired", () => synth("ensure", { mutate: (r) => { r.expires_at = "2026-10-31T11:59:00.000Z"; } })],
        ["fake run", () => { const s = synth(); s.writeRuns({}); return s; }],
        ["forged env", () => synth("ensure", { envOver: { ALLOY_QA_ENVIRONMENT_ID: "certenv-6d6d6d6d6d" } })],
        ["wrong org", () => synth("ensure", { envOver: { ALLOY_CERT_FIXTURE_ORG_ID: FIREFLY } })],
        ["wrong connection", () => synth("ensure", { envOver: { DATABASE_URL: SYNTH.dbUrl.replace(":56231/", ":56241/") } })],
        ["held target", () => { const s = synth(); s.writeHold(holdRecord(SYNTH.environmentId, { state: "held", revision: 2, previous_sha256: s.hold.record_sha256 })); return s; }],
        ["v1 record", () => synth("ensure", { mutate: (r) => { r.schema = "vacilando.isolated_fixture_authority.v1"; } })],
    ])("%s: refused; no client resolved, no SQL read, nothing executed", (_l, make) => {
        const s = make();
        const f = fakes();
        const out = runner(s, f);
        expect(out.ok).toBe(false);
        expect(out.code).not.toBe("fixture_apply_failed");
        expect(f.resolveClient).not.toHaveBeenCalled();
        expect(f.readFixture).not.toHaveBeenCalled();
        expect(f.exec).not.toHaveBeenCalled();
    });

    it("refused before the authority is proven, the database URL and service key are never read", () => {
        const s = synth("ensure", { envOver: { ALLOY_QA_AUTHORITY_FILE: undefined } });
        const touched: string[] = [];
        const env = new Proxy(s.env, { get: (t, k) => { touched.push(String(k)); return t[k as string]; } });
        expect(runner(s, fakes(), env)).toEqual({ ok: false, code: R.ABSENT });
        for (const k of ["DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PSQL_BIN", "CERT_FIXTURE_APPLY"]) expect(touched).not.toContain(k);
    });

    it("an unregistered operation never reaches the verifier", () => {
        const s = synth();
        expect(runSurfacesRoomUsesFixture("drop", { env: s.env, authority: s.seams })).toEqual({ ok: false, code: "operation_unregistered" });
    });

    it("authorized: psql gets the EXACT DATABASE_URL, a built client env, -X and one transaction; run and org from the authority", () => {
        const s = synth("ensure");
        const f = fakes();
        const env = { ...s.env, QA_RUN_ID: "qar_forgedforged", ORG_ID: FIREFLY, PSQL_BIN: undefined, PGPASSFILE: undefined };
        const out = runner(s, f, env);
        expect(out).toMatchObject({ ok: true, seeded: 2, replaced: 0, organization_id: QA_ORGS.qa_shared.id, organization_source: "executor_authority", qa_run_id: SYNTH.qaRunId, environment_id: SYNTH.environmentId, hold_revision: 1 });
        expect(f.exec).toHaveBeenCalledTimes(1);
        const [bin, args, opts] = f.exec.mock.calls[0];
        expect(bin).toBe("/synthetic/psql");
        expect(args[0]).toBe(SYNTH.dbUrl);
        expect(args).toEqual(expect.arrayContaining(["-X", "--single-transaction", "ON_ERROR_STOP=1", `org=${QA_ORGS.qa_shared.id}`, `qa_run_id=${SYNTH.qaRunId}`]));
        expect(args.at(-1)).toBe(join(WEB, "..", P.ensure.sql_path));
        expect(args.join(" ")).not.toMatch(/forged|93667019/);
        expect(Object.keys(opts.env).sort()).toEqual(["LANG", "PATH"]);
        expect(Object.isFrozen(opts.env)).toBe(true);
        expect(JSON.stringify(out)).not.toContain("SENTINEL");
    });

    it("the legacy reconciliation arming is not what admits it, and its absence does not block the executor's env", () => {
        const s = synth("ensure");
        expect(s.env.CERT_FIXTURE_APPLY).toBeUndefined();
        expect(runner(s, fakes()).ok).toBe(true);
        expect(read("scripts/qa/surfacesRoomUsesFixtureRunner.mjs")).not.toMatch(/CERT_FIXTURE_APPLY|DRY_RUN|6543|pgbouncer|searchParams\.delete|url\.port\s*=/);
    });

    it("the connection gate re-reads the hold: a transition after the first check refuses before psql", () => {
        const s = synth("ensure");
        const f = fakes();
        f.resolveClient.mockImplementation(() => {
            s.writeHold(holdRecord(SYNTH.environmentId, { state: "held", revision: 2, previous_sha256: s.hold.record_sha256 }));
            return { path: "/synthetic/psql", source: "fake" };
        });
        expect(runner(s, f)).toEqual({ ok: false, code: "target_hold_held" });
        expect(f.exec).not.toHaveBeenCalled();
    });

    it("the connection gate re-proves live provenance: an execution that completed in between refuses before psql", () => {
        const s = synth("reset");
        const f = fakes("DELETE 1\nDELETE 1\n");
        f.resolveClient.mockImplementation(() => {
            s.writeRequest({ state: "complete" });
            return { path: "/synthetic/psql", source: "fake" };
        });
        expect(runner(s, f)).toEqual({ ok: false, code: R.PROVENANCE });
        expect(f.exec).not.toHaveBeenCalled();
    });

    it("the gate attests the final configuration, not the label: a client env with a PG* variable refuses", () => {
        const s = synth("ensure");
        const a = AUTH.attestSurfacesConnection(s.env, { ...s.seams, program: P.ensure, url: SYNTH.dbUrl, clientEnv: { PATH: "/usr/bin", PGPORT: "54422" } } as never);
        expect(a).toEqual({ ok: false, code: "connection_target_client_env_override", fields: ["PGPORT"] });
        const rewritten = AUTH.attestSurfacesConnection(s.env, { ...s.seams, program: P.ensure, url: SYNTH.dbUrl.replace(":56231/", ":5432/"), clientEnv: { PATH: "/usr/bin" } } as never);
        expect(rewritten).toEqual({ ok: false, code: "database_identity_mismatch" });
        const connect = vi.fn();
        expect(AUTH.runAttested(s.env, { ...s.seams, program: P.ensure, url: SYNTH.dbUrl, clientEnv: { PGHOST: "x" }, connect } as never)).toMatchObject({ ok: false });
        expect(connect).not.toHaveBeenCalled();
    });

    it("a failing psql is reported by its first line, never the URL", () => {
        const s = synth("ensure");
        const f = fakes();
        f.exec.mockImplementation(() => { throw Object.assign(new Error("x"), { stderr: "psql: ERROR:  the Surfaces room-Uses fixture belongs to another QA run\nCONTEXT: ..." }); });
        const out = runner(s, f);
        expect(out).toMatchObject({ ok: false, code: "fixture_apply_failed" });
        expect(String(out.detail)).toMatch(/belongs to another QA run/);
        expect(JSON.stringify(out)).not.toContain("SENTINEL");
    });
});

describe("bounded output in the executor's line contract", () => {
    /** The installed toolkit's parse (lib/isolated-fixture-execution.mjs parseIsolatedFixtureOutput), restated for the lines it reads. */
    const executorReads = (lines: string[]) => {
        let census: number | null = null;
        let reset: { namespace: string; removed: number } | null = null;
        const checks: { ok: boolean }[] = [];
        for (const l of lines) {
            let m;
            if ((m = /^\s*([✓✗])\s+(.+)$/.exec(l))) checks.push({ ok: m[1] === "✓" });
            else if ((m = /^\s*census count=(\d{1,9})\s*$/.exec(l))) census = Number(m[1]);
            else if ((m = /^\s*reset namespace=(\S+) removed=(\d{1,9})\s*$/.exec(l))) reset = { namespace: m[1], removed: Number(m[2]) };
        }
        return { census, reset, checks };
    };
    const run = (op: Op, stdout: string) => {
        const s = synth(op);
        return runSurfacesRoomUsesFixture(op, {
            env: s.env, authority: s.seams,
            resolveClient: () => ({ path: "/synthetic/psql" }), exec: () => stdout, readFixture: (rel) => readFileSync(join(WEB, "..", rel)),
        });
    };

    it.each([["DELETE 1\nDELETE 1\n", 2], ["DELETE 0\nDELETE 0\n", 0], ["DELETE 1\nDELETE 0\n", 1]] as const)("reset %#: within the namespace and the limit of 2", (stdout, removed) => {
        const out = run("reset", stdout);
        expect(out).toMatchObject({ ok: true, removed });
        const seen = executorReads(out.lines ?? []);
        expect(seen.reset).toEqual({ namespace: INSTALLED.reserved_namespace, removed });
        expect(seen.reset!.removed).toBeLessThanOrEqual(2);
        expect(seen.checks.every((c) => c.ok)).toBe(true);
    });

    it("reset beyond the limit, writing an insert, or not reporting its deletes is a failure", () => {
        expect(run("reset", "DELETE 3\nDELETE 0\n")).toMatchObject({ ok: false, code: "reset_unbounded" });
        expect(run("reset", "DELETE 1\nDELETE 1\nINSERT 0 1\n")).toMatchObject({ ok: false, code: "reset_unbounded" });
        expect(run("reset", "")).toMatchObject({ ok: false, code: "reset_unreported" });
        expect(executorReads(run("reset", "DELETE 3\nDELETE 0\n").lines ?? []).checks.some((c) => !c.ok)).toBe(true);
    });

    it("census: exactly one read-only measurement", () => {
        const out = run("census", "SET\ncensus count=0\n");
        expect(out).toMatchObject({ ok: true, census: 0 });
        expect(executorReads(out.lines ?? []).census).toBe(0);
        expect(run("census", "SET\n")).toMatchObject({ ok: false, code: "census_not_measured" });
        expect(run("census", "census count=1\ncensus count=2\n")).toMatchObject({ ok: false, code: "census_not_measured" });
        expect(run("census", "census count=2\nDELETE 1\n")).toMatchObject({ ok: false, code: "census_wrote" });
    });

    it("census runs read-only flags and tuples-only output", () => {
        const s = synth("census");
        const exec = vi.fn((_b: string, _a: string[], _o: unknown) => "census count=2\n");
        runSurfacesRoomUsesFixture("census", { env: s.env, authority: s.seams, resolveClient: () => ({ path: "/synthetic/psql" }), exec, readFixture: (rel) => readFileSync(join(WEB, "..", rel)) });
        expect(exec.mock.calls[0][1]).toEqual(expect.arrayContaining(["-A", "-t", "-X", "--single-transaction"]));
    });

    it("ensure: exactly two inserts, at most two of this run's rows replaced", () => {
        expect(run("ensure", "DELETE 1\nDELETE 1\nINSERT 0 1\nINSERT 0 1\n")).toMatchObject({ ok: true, seeded: 2, replaced: 2 });
        expect(run("ensure", "DELETE 0\nDELETE 0\nINSERT 0 3\n")).toMatchObject({ ok: false, code: "ensure_unbounded" });
        expect(run("ensure", "INSERT 0 1\nINSERT 0 1\n")).toMatchObject({ ok: false, code: "ensure_unbounded" });
    });
});

describe("the shared module reproduces the installed toolkit's v2 vectors", () => {
    const raw = read(VECTORS_PATH);
    const v = JSON.parse(raw) as {
        environment_id: string;
        database_identity: { url_redacted: string; identity: { digest: string } & Record<string, unknown> }[];
        database_identity_not_issuable: { url_redacted: string; refusal: string }[];
        hold: { clear_record: Record<string, unknown>; disposition_from_clear_record: Record<string, unknown>; held_record_next_revision: Record<string, unknown> };
        connection_target: { authorized_identity_digest: string; vectors: { url_redacted: string; client_env: Record<string, string> | null; expected: { ok: boolean; digest?: string; code?: string; fields?: string[] } }[] };
    };
    const url = (redacted: string) => redacted.replace("***", "synthetic-password");

    it("database identities, never-issuable targets and connection targets", () => {
        for (const x of v.database_identity) {
            const r = databaseIdentityOf(url(x.url_redacted), v.environment_id);
            expect(r.ok && r.identity, x.url_redacted).toEqual(x.identity);
        }
        const base = v.database_identity[0].identity;
        for (const x of v.database_identity_not_issuable) {
            const r = x.url_redacted.startsWith("postgres") ? verifyConnectionTarget(base, { url: url(x.url_redacted), clientEnv: {} }) : connectionTargetOf(url(x.url_redacted), v.environment_id, { clientEnv: {} });
            expect(r.ok ? "ok" : r.code, x.url_redacted).toBe(x.refusal);
        }
        expect(base.digest).toBe(v.connection_target.authorized_identity_digest);
        for (const x of v.connection_target.vectors) {
            const r = verifyConnectionTarget(base, { url: url(x.url_redacted), clientEnv: x.client_env ?? undefined });
            if (x.expected.ok) expect(r.ok ? r.identity?.digest : null, x.url_redacted).toBe(x.expected.digest);
            else expect(r.ok ? "ok" : r.code, x.url_redacted).toBe(x.expected.code);
        }
    });

    it("hold expectations", () => {
        const { clear_record: clear, disposition_from_clear_record: disp, held_record_next_revision: held } = v.hold;
        expect(targetHoldRecordDigest(clear)).toBe(clear.record_sha256);
        const store = (rec: unknown) => ({ storeRoot: "/synthetic", targetKey: String(clear.target_key), requestId: String(disp.request_id), readFile: () => { if (rec === undefined) throw Object.assign(new Error("no"), { code: "ENOENT" }); return JSON.stringify(rec); } });
        expect(verifyTargetHoldDisposition(disp, store(clear))).toEqual({ ok: true });
        expect(verifyTargetHoldDisposition(disp, store(undefined))).toEqual({ ok: false, code: "target_hold_record_absent" });
        expect(verifyTargetHoldDisposition(disp, store(held))).toEqual({ ok: false, code: "target_hold_held" });
    });
});

describe("no env file, no host root", () => {
    it("the runners and guards load no env file", () => {
        for (const f of ["scripts/qaSurfacesRoomUsesFixtureEnsure.mjs", "scripts/qaSurfacesRoomUsesFixtureReset.mjs", "scripts/qaSurfacesRoomUsesFixtureCensus.mjs", "scripts/qa/surfacesRoomUsesFixtureRunner.mjs", "scripts/qa/surfacesFixtureAuthority.mjs"]) {
            expect(read(f), f).not.toMatch(/from "dotenv"|loadEnv\(|\.env\.local|process\.env\.HOME|ALLOY_RUNTIME_ROOT/);
        }
    });
});
