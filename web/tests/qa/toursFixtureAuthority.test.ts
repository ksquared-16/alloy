/**
 * The Tours fixture adopts AUTHORITY v2 (program variant, API identity required) through the shared verifier — and
 * the runner verifies it before any credential, session or client. Synthetic only: a private temp store stands in
 * for the executor's; no database, preview or network is touched. None of this is live evidence, and none of it
 * says the installed toolkit issues a v2 record for `tours_certification` (it does not: its entry is still v1).
 *
 * Controls: genuine → accepted; v1 / absent / forged / no live request / replayed / altered / expired / not yet;
 * another operation, program, candidate, script, environment or run; the org (seed, forged env copy, other key);
 * the database (another port, the shared stack, overrides, absent); the API (shared, hosted, localhost, another
 * port, absent identity); the hold (absent, held, changed, reforged, unreadable store, another request); the pins
 * (absent, invalid, digest, candidate, script, required artifact, drifted bytes); the vendored bytes and vectors;
 * and the runner's order (refusal before the service key, the session file or any port; ports built once, from the
 * attested copy).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
    API_IDENTITY_SCHEMA,
    apiIdentityOf,
    connectionTargetOf,
    databaseIdentityOf,
    issuableApiIdentity,
    sha256,
    targetHoldRecordDigest,
    verifyApiIdentity,
    verifyConnectionTarget,
    verifyTargetHoldDisposition,
} from "../../scripts/qa/isolatedFixtureAuthorityV2.mjs";
import {
    TOURS_FIXTURE_PROGRAM,
    TOURS_REGISTERED_FIXTURE_ORG,
    TOURS_REQUIRED_ARTIFACTS,
    programPinsDigest,
    runAttestedToursConnection,
    verifyToursFixtureAuthorityV2,
} from "../../scripts/qa/toursFixtureAuthority.mjs";
import { QA_ORGS, QA_STRUCTURE } from "@/lib/qa/sharedQaRegistry";
import { runToursFixture, type ToursFixtureOperation, type ToursFixturePorts } from "@/lib/qa/toursFixture/toursCertificationFixture";
import { SYNTH, SYNTH_SESSION_TEXT, holdRecord, makeSyntheticToursAuthority, syntheticApiIdentity, syntheticProgramPins, type SyntheticToursAuthority } from "./support/syntheticToursAuthority";

const web = resolve(__dirname, "../..");
const repo = resolve(web, "..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");
const VERIFIER_SHA256 = "e25649c240871e5fb8f771c75e201b80d51b7d86db35a5f8c08e3e58b3b27fab";
const VECTORS_SHA256 = "5f7a6c9d683546fdf18635b63befdd2424d29f4936d6fcf320c86e710fe25b28";
const SEED_ORG = { id: "00000000-0000-4000-8000-000000000001", key: "certification_seed", source: "seed_manifest" };

let open: SyntheticToursAuthority[] = [];
const synth = (o?: Parameters<typeof makeSyntheticToursAuthority>[0]) => {
    const s = makeSyntheticToursAuthority(o);
    open.push(s);
    return s;
};
afterEach(() => {
    for (const s of open) s.cleanup();
    open = [];
});
type Deps = SyntheticToursAuthority["deps"];
const verify = (s: SyntheticToursAuthority, env = s.env, over: Partial<Deps> & { operation?: string } = {}) =>
    verifyToursFixtureAuthorityV2(env, { operation: String(s.record.operation), ...s.deps, ...over });
const mismatch = (fields: string[]) => ({ ok: false, code: "fixture_authority_mismatch", fields });

describe("the program, org and pins are the installed entry's, adopted at v2", () => {
    it("the program is the installed tours_certification entry: fixture, suite, npm script, script body, operations", () => {
        const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
        expect(pkg.scripts[TOURS_FIXTURE_PROGRAM.npm_script]).toBe(TOURS_FIXTURE_PROGRAM.script_body);
        expect(sha256(TOURS_FIXTURE_PROGRAM.script_body)).toBe("6d58a56a52afc71eab3fb274c8bb5c88fe197001f5880dfe9bdf705e0825f996");
        expect(TOURS_FIXTURE_PROGRAM).toMatchObject({ fixture: "tours_certification", suite: "tours", reserved_namespace: "tours-cert.alloy.invalid" });
        expect(Object.keys(TOURS_FIXTURE_PROGRAM.operations).sort()).toEqual(["count", "ensure", "reset"]);
        expect(TOURS_FIXTURE_PROGRAM.operations.count.mutating).toBe(false);
        expect(TOURS_FIXTURE_PROGRAM.operations.ensure.mutating && TOURS_FIXTURE_PROGRAM.operations.reset.mutating).toBe(true);
    });

    it("the org is the persona org qa_shared — the registry's, the site's — and never the seed org", () => {
        expect(TOURS_REGISTERED_FIXTURE_ORG).toEqual({ id: QA_ORGS.qa_shared.id, key: "qa_shared", source: "persona" });
        expect(QA_STRUCTURE.sites.qa_north.org).toBe("qa_shared");
        expect(TOURS_REGISTERED_FIXTURE_ORG.id).not.toBe(SEED_ORG.id);
    });

    it("every required artifact exists in this checkout, and the entry is the npm script's own file", () => {
        for (const a of TOURS_REQUIRED_ARTIFACTS) expect(() => readFileSync(resolve(repo, a.path)), a.path).not.toThrow();
        expect(TOURS_REQUIRED_ARTIFACTS[0]).toEqual({ role: "entry", path: "web/scripts/qaToursFixture.ts" });
        expect(TOURS_FIXTURE_PROGRAM.script_body.endsWith("scripts/qaToursFixture.ts")).toBe(true);
        expect(new Set(TOURS_REQUIRED_ARTIFACTS.map((a) => a.path)).size).toBe(TOURS_REQUIRED_ARTIFACTS.length);
    });

    it("the shared verifier is Financials 470f8594's, byte for byte, and the vectors are the platform's", () => {
        expect(sha256(readFileSync(resolve(web, "scripts/qa/isolatedFixtureAuthorityV2.mjs")))).toBe(VERIFIER_SHA256);
        expect(sha256(read("tests/qa/fixtures/isolated-fixture-authority-v2.vectors.json"))).toBe(VECTORS_SHA256);
    });

    it("the program module defines no parallel framework: every step but the pins is the shared verifier", () => {
        const src = read("scripts/qa/toursFixtureAuthority.mjs");
        expect(src).toContain("verifyIsolatedFixtureAuthorityV2(env, {");
        // The code line, not the header prose: every client calls the Supabase API.
        expect(src).toMatch(/^ {8}requireApi: true,$/m);
        for (const own of ["function verifyConnectionTarget", "function verifyTargetHoldDisposition", "function verifyApiIdentity", "function trustedGatewayStoreRoot", "function databaseIdentityOf"]) {
            expect(src, own).not.toContain(own);
        }
    });
});

describe("a genuine executor-issued v2 authority", () => {
    it("is accepted for each registered operation; org, run, environment and API origin come from the record", () => {
        for (const op of ["ensure", "count", "reset"]) {
            const s = synth({ operation: op });
            expect(verify(s), op).toMatchObject({
                ok: true,
                authority: { org_id: QA_ORGS.qa_shared.id, org_key: "qa_shared", qa_run_id: SYNTH.qaRunId, environment_id: SYNTH.environmentId, operation: op, api_url: SYNTH.apiUrl, hold_revision: 1 },
            });
        }
    });

    it("an unregistered operation is refused before anything is read", () => {
        const s = synth();
        expect(verify(s, s.env, { operation: "run" })).toEqual({ ok: false, code: "fixture_authority_program_unregistered" });
        expect(verify(s, s.env, { operation: "" })).toEqual({ ok: false, code: "fixture_authority_program_unregistered" });
    });
});

describe("absent, forged, replayed, altered or expired authority is refused", () => {
    it("a v1 record (what the installed toolkit issues tours_certification today) carries no org", () => {
        const s = synth({ mutate: (r) => { r.schema = "vacilando.isolated_fixture_authority.v1"; } });
        expect(verify(s)).toEqual({ ok: false, code: "fixture_authority_org_unbound" });
    });

    it("no authority at all — the org variable alone is not authority", () => {
        const s = synth({ envOver: { ALLOY_QA_AUTHORITY_FILE: undefined } });
        expect(verify(s)).toEqual({ ok: false, code: "fixture_authority_absent" });
    });

    it("an identical record copied outside the executor's authority directory", () => {
        const s = synth();
        const dir = mkdtempSync(join(tmpdir(), "tours-forged-"));
        try {
            const forged = join(dir, s.authorityName);
            copyFileSync(s.authorityFile, forged);
            expect(verify(s, { ...s.env, ALLOY_QA_AUTHORITY_FILE: forged })).toEqual({ ok: false, code: "fixture_authority_not_executor_issued" });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("a hand-written record in the right directory with no live executor request", () => {
        const s = synth();
        rmSync(join(s.root, "vacilando", "isolated-fixture", "requests", `${SYNTH.requestId}.json`));
        expect(verify(s)).toEqual({ ok: false, code: "fixture_authority_no_live_request" });
    });

    it("replay after the execution: the request is complete, or the record is gone", () => {
        const s = synth();
        s.writeRequest({ request_id: SYNTH.requestId, binding_digest: SYNTH.bindingDigest, state: "complete", authority: { file: s.authorityName, sha256: sha256(readFileSync(s.authorityFile, "utf8")) } });
        expect(verify(s)).toEqual({ ok: false, code: "fixture_authority_no_live_request" });
        const t = synth();
        rmSync(t.authorityFile);
        expect(verify(t)).toEqual({ ok: false, code: "fixture_authority_absent" });
    });

    it("bytes altered after issue", () => {
        const s = synth();
        s.rewriteRecord({ ...s.record, fixture_org: SEED_ORG }, { keepRequest: true });
        expect(verify(s)).toEqual({ ok: false, code: "fixture_authority_altered" });
    });

    it("outside its window: expired, or not yet valid", () => {
        const s = synth();
        expect(verify(s, s.env, { nowMs: SYNTH.nowMs + 16 * 60_000 })).toEqual({ ok: false, code: "fixture_authority_expired" });
        expect(verify(s, s.env, { nowMs: SYNTH.nowMs - 2 * 60_000 })).toEqual({ ok: false, code: "fixture_authority_not_yet_valid" });
    });
});

describe("another operation, program, candidate or run is refused", () => {
    it("the record's operation is not the one this process was invoked for (count authority, ensure argv)", () => {
        const s = synth({ operation: "count" });
        expect(verify(s, s.env, { operation: "ensure" })).toEqual(mismatch(["operation"]));
    });
    it("another fixture's authority (Financials historical draft)", () => {
        const s = synth({ mutate: (r) => { r.fixture = "financials_historical_draft"; r.suite = "financials"; r.npm_script = "dev:qa:financials-historical-draft-fixture"; }, envOver: { ALLOY_CERT_FIXTURE: "financials_historical_draft" } });
        expect(verify(s)).toEqual(mismatch(["fixture", "suite", "npm_script"]));
    });
    it("another candidate than this checkout's HEAD, or a drifted script body", () => {
        const s = synth();
        expect(verify(s, s.env, { readHead: () => "6b".repeat(20) })).toEqual(mismatch(["candidate_sha"]));
        expect(verify(s, s.env, { readScriptBody: () => "tsx scripts/other.ts" })).toEqual(mismatch(["script_sha256"]));
    });
    it("another environment, QA run or request in the child's environment", () => {
        const s = synth();
        expect(verify(s, { ...s.env, ALLOY_QA_ENVIRONMENT_ID: "certenv-6b6b6b6b6b" })).toEqual(mismatch(["environment_id"]));
        expect(verify(s, { ...s.env, ALLOY_QA_RUN_ID: "qar_6b6b6b6b6b6b" })).toEqual(mismatch(["qa_run_id"]));
        expect(verify(s, { ...s.env, ALLOY_QA_REQUEST_ID: "ifx_req_other_0002" })).toEqual(mismatch(["request_id"]));
    });
    it("invoked as another npm lifecycle script", () => {
        const s = synth();
        expect(verify(s, { ...s.env, npm_lifecycle_event: "dev:qa:financials-historical-draft-fixture" })).toEqual(mismatch(["npm_lifecycle_event"]));
    });
});

describe("the organization is the record's persona org, never the environment's, never the seed", () => {
    it("the env copy absent, forged to the seed org, or its source forged", () => {
        for (const over of [{ ALLOY_CERT_FIXTURE_ORG_ID: undefined }, { ALLOY_CERT_FIXTURE_ORG_ID: SEED_ORG.id }, { ALLOY_CERT_FIXTURE_ORG_SOURCE: "seed_manifest" }]) {
            const s = synth({ envOver: over });
            expect(verify(s), JSON.stringify(over)).toEqual(mismatch(["fixture_org"]));
        }
    });
    it("a genuine record for the seed org (env agreeing) is not this entry's org", () => {
        const s = synth({ mutate: (r) => { r.fixture_org = SEED_ORG; }, envOver: { ALLOY_CERT_FIXTURE_ORG_ID: SEED_ORG.id, ALLOY_CERT_FIXTURE_ORG_SOURCE: SEED_ORG.source } });
        expect(verify(s)).toEqual({ ok: false, code: "fixture_authority_org_not_registered" });
    });
    it("the qa_shared id under another key, or the cross-org QA tenant", () => {
        const s = synth({ mutate: (r) => { r.fixture_org = { ...TOURS_REGISTERED_FIXTURE_ORG, key: "qa_secondary" }; } });
        expect(verify(s)).toEqual({ ok: false, code: "fixture_authority_org_not_registered" });
        const cross = { id: QA_ORGS.qa_secondary.id, key: "qa_secondary", source: "persona" };
        const t = synth({ mutate: (r) => { r.fixture_org = cross; }, envOver: { ALLOY_CERT_FIXTURE_ORG_ID: cross.id } });
        expect(verify(t)).toEqual({ ok: false, code: "fixture_authority_org_not_registered" });
    });
});

describe("the database target, the API identity and the hold", () => {
    it("DATABASE_URL elsewhere: another port, the shared stack, a host override, a PG* variable, absent", () => {
        const s = synth();
        expect(verify(s, { ...s.env, DATABASE_URL: SYNTH.dbUrl.replace(":56131/", ":56141/") })).toEqual({ ok: false, code: "database_identity_mismatch" });
        expect(verify(s, { ...s.env, DATABASE_URL: SYNTH.dbUrl.replace(":56131/", ":54422/") })).toEqual({ ok: false, code: "database_identity_shared_target_refused" });
        expect(verify(s, { ...s.env, DATABASE_URL: `${SYNTH.dbUrl}?host=10.0.0.5` })).toEqual({ ok: false, code: "connection_target_parameter_override", fields: ["host"] });
        expect(verify(s, { ...s.env, PGHOST: "127.0.0.1" })).toEqual({ ok: false, code: "connection_target_client_env_override", fields: ["PGHOST"] });
        expect(verify(s, { ...s.env, DATABASE_URL: undefined })).toEqual({ ok: false, code: "database_identity_absent" });
        const other = synth({ mutate: (r) => { r.database_identity = { ...(r.database_identity as object), environment_id: "certenv-6b6b6b6b6b" }; } });
        expect(verify(other)).toEqual(mismatch(["database_identity"]));
    });

    it("the API origin is the record's api_identity: shared, hosted, localhost, decorated, another port, or none", () => {
        const s = synth();
        expect(verify(s, { ...s.env, SUPABASE_URL: "http://127.0.0.1:54421" })).toEqual({ ok: false, code: "api_identity_shared_target_refused" });
        expect(verify(s, { ...s.env, SUPABASE_URL: "https://synthetic.supabase.co" })).toEqual({ ok: false, code: "api_identity_malformed" });
        expect(verify(s, { ...s.env, SUPABASE_URL: "http://localhost:56130" })).toEqual({ ok: false, code: "api_identity_not_loopback" });
        expect(verify(s, { ...s.env, SUPABASE_URL: "http://127.0.0.1:56130/rest?x=1" })).toEqual({ ok: false, code: "api_identity_malformed" });
        expect(verify(s, { ...s.env, SUPABASE_URL: "http://127.0.0.1:56132" })).toEqual({ ok: false, code: "api_identity_mismatch" });
        const none = synth({ mutate: (r) => { delete r.api_identity; } });
        expect(verify(none)).toEqual({ ok: false, code: "api_identity_absent" });
        const reissued = synth({ mutate: (r) => { r.api_identity = syntheticApiIdentity(56132); } });
        expect(verify(reissued)).toEqual({ ok: false, code: "api_identity_mismatch" });
    });

    it("the hold: absent, held, changed since issue, reforged, unreadable, or a disposition for another request", () => {
        const absent = synth();
        absent.writeHold(null);
        expect(verify(absent)).toEqual({ ok: false, code: "target_hold_record_absent" });
        const held = synth();
        held.writeHold(holdRecord(SYNTH.environmentId, { state: "held", revision: 2, previous_sha256: held.holdRecord.record_sha256 }));
        expect(verify(held)).toEqual({ ok: false, code: "target_hold_held" });
        const changed = synth();
        changed.writeHold(holdRecord(SYNTH.environmentId, { revision: 2, previous_sha256: changed.holdRecord.record_sha256 }));
        expect(verify(changed)).toEqual({ ok: false, code: "target_hold_changed_since_issue" });
        const reforged = synth();
        reforged.writeHold({ ...reforged.holdRecord, state: "held" });
        expect(verify(reforged)).toEqual({ ok: false, code: "target_hold_record_reforged" });
        const unreadable = synth();
        unreadable.writeHold("{not json");
        expect(verify(unreadable)).toEqual({ ok: false, code: "target_hold_store_unavailable" });
        const other = synth({ mutate: (r) => { (r.target_hold_disposition as Record<string, unknown>).request_id = "ifx_req_other_0002"; } });
        expect(verify(other)).toEqual({ ok: false, code: "target_hold_disposition_invalid" });
    });
});

describe("program pins are required and exact", () => {
    it("absent, SQL variant, traversal path, duplicate paths", () => {
        expect(verify(synth({ mutate: (r) => { delete r.program_pins; } }))).toEqual({ ok: false, code: "fixture_program_pins_absent" });
        expect(verify(synth({ mutate: (r) => { r.program_pins = { ...syntheticProgramPins(), variant: "sql" }; } }))).toEqual({ ok: false, code: "fixture_program_pins_invalid" });
        expect(verify(synth({ mutate: (r) => { r.program_pins = { ...syntheticProgramPins(), sql: { path: "x.sql", sha256: "0".repeat(64) } }; } }))).toEqual({ ok: false, code: "fixture_program_pins_invalid" });
        const arts = (syntheticProgramPins().artifacts as Record<string, unknown>[]);
        expect(verify(synth({ mutate: (r) => { r.program_pins = syntheticProgramPins({ artifacts: [...arts, { role: "program", path: "web/../etc/passwd", sha256: "0".repeat(64) }] }); } }))).toEqual({ ok: false, code: "fixture_program_pins_invalid" });
        expect(verify(synth({ mutate: (r) => { r.program_pins = syntheticProgramPins({ artifacts: [...arts, arts[0]] }); } }))).toEqual({ ok: false, code: "fixture_program_pins_invalid" });
    });
    it("a digest that does not recompute", () => {
        expect(verify(synth({ mutate: (r) => { r.program_pins = { ...syntheticProgramPins(), digest: "0".repeat(64) }; } }))).toEqual({ ok: false, code: "fixture_program_pins_digest_mismatch" });
    });
    it("pins for another candidate, or another script body", () => {
        expect(verify(synth({ mutate: (r) => { r.program_pins = syntheticProgramPins({ candidate_sha: "6b".repeat(20) }); } }))).toEqual({ ok: false, code: "fixture_program_pins_candidate_mismatch" });
        expect(verify(synth({ mutate: (r) => { r.program_pins = syntheticProgramPins({ script_sha256: sha256("tsx scripts/other.ts") }); } }))).toEqual({ ok: false, code: "fixture_program_pins_script_mismatch" });
    });
    it("a required artifact omitted or under another role is named", () => {
        const arts = (syntheticProgramPins().artifacts as { role: string; path: string; sha256: string }[]);
        const forms = "web/lib/qa/toursFixture/toursFixtureForms.ts";
        expect(verify(synth({ mutate: (r) => { r.program_pins = syntheticProgramPins({ artifacts: arts.filter((a) => a.path !== forms) }); } }))).toEqual({ ok: false, code: "fixture_program_pins_required_artifact_absent", fields: [forms] });
        expect(verify(synth({ mutate: (r) => { r.program_pins = syntheticProgramPins({ artifacts: arts.map((a) => (a.role === "entry" ? { ...a, role: "program" } : a)) }); } }))).toEqual({ ok: false, code: "fixture_program_pins_required_artifact_absent", fields: ["web/scripts/qaToursFixture.ts"] });
    });
    it("an artifact whose bytes here are not its pin (edited after issue, or absent)", () => {
        const s = synth();
        const ports = "web/lib/qa/toursFixture/toursCertificationFixturePorts.ts";
        expect(verify(s, s.env, { readArtifact: (p) => (p === ports ? "edited" : `synthetic bytes of ${p}\n`) })).toEqual({ ok: false, code: "fixture_program_pins_artifact_mismatch", fields: [ports] });
        expect(verify(s, s.env, { readArtifact: (p) => { if (p === ports) throw new Error("ENOENT"); return `synthetic bytes of ${p}\n`; } })).toEqual({ ok: false, code: "fixture_program_pins_artifact_mismatch", fields: [ports] });
    });
    it("the digest is the platform rule: canonical JSON of { variant, candidate_sha, script_sha256, artifacts }", () => {
        const p = syntheticProgramPins();
        expect(programPinsDigest(p)).toBe(p.digest);
        expect(programPinsDigest({ ...p, artifacts: [...(p.artifacts as unknown[])].reverse() })).not.toBe(p.digest);
    });
});

describe("the restatement reproduces the platform's v2 vectors (database, connection, hold, API)", () => {
    const v = JSON.parse(read("tests/qa/fixtures/isolated-fixture-authority-v2.vectors.json")) as {
        environment_id: string;
        database_identity: { url_redacted: string; identity: { digest: string } & Record<string, unknown> }[];
        database_identity_not_issuable: { url_redacted: string; refusal: string }[];
        hold: { clear_record: Record<string, unknown>; disposition_from_clear_record: Record<string, unknown>; held_record_next_revision: Record<string, unknown> };
        connection_target: { authorized_identity_digest: string; vectors: { url_redacted: string; client_env: Record<string, string> | null; expected: { ok: boolean; digest?: string; code?: string; fields?: string[] } }[] };
        api_identity: { issued: Record<string, unknown> & { environment_id: string; port: number; digest: string }; not_issuable: { api_port: number | null; refusal: string }[]; vectors: { origin: string; expected: { ok: boolean; digest?: string; code?: string } }[] };
    };
    const url = (redacted: string) => redacted.replace("***", "synthetic-password");

    it("database identity, never-issued targets and connection-target vectors", () => {
        for (const x of v.database_identity) {
            const r = databaseIdentityOf(url(x.url_redacted), v.environment_id);
            expect(r.ok && r.identity, x.url_redacted).toEqual(x.identity);
        }
        const base = v.database_identity[0]!.identity;
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
        const store = (rec: unknown) => ({ storeRoot: "/synthetic", targetKey: String(clear.target_key), requestId: String(disp.request_id), readFile: () => { if (rec === undefined) throw Object.assign(new Error("no"), { code: "ENOENT" }); return typeof rec === "string" ? rec : JSON.stringify(rec); } });
        const cases: [unknown, string][] = [[clear, "ok"], [undefined, "target_hold_record_absent"], ["{not json", "target_hold_store_unavailable"], [{ ...clear, state: "held" }, "target_hold_record_reforged"], [held, "target_hold_held"]];
        for (const [rec, want] of cases) {
            const r = verifyTargetHoldDisposition(disp, store(rec));
            expect(r.ok ? "ok" : r.code, want).toBe(want);
        }
    });

    it("API identity: issued, not issuable, every origin", () => {
        const a = v.api_identity;
        const issued = issuableApiIdentity(a.issued.port, a.issued.environment_id);
        expect(issued.ok && issued.identity).toEqual(a.issued);
        expect(a.issued.schema).toBe(API_IDENTITY_SCHEMA);
        for (const x of a.not_issuable) {
            const r = issuableApiIdentity(x.api_port as number, a.issued.environment_id);
            expect(r.ok ? "ok" : r.code, String(x.api_port)).toBe(x.refusal);
        }
        for (const x of a.vectors) {
            const r = verifyApiIdentity(a.issued, x.origin);
            if (x.expected.ok) expect(r.ok ? r.identity.digest : null, x.origin).toBe(x.expected.digest);
            else expect(r.ok ? "ok" : r.code, x.origin).toBe(x.expected.code);
        }
        expect(apiIdentityOf(SYNTH.apiUrl, SYNTH.environmentId).ok).toBe(true);
    });
});

/* ── the runner, end to end over the real verifier (fake ports) ─────────────────────────────────── */

function fakePorts(): ToursFixturePorts {
    const nothing = async () => [];
    return {
        orgAndLocationExist: async () => true,
        countActiveProviderBindings: async () => 0,
        countOutboundRows: async () => ({ messages: 0, scheduled: 0 }),
        countNamespaceOutboundRows: async () => 0,
        findMarkerRules: nothing,
        findLocationRules: nothing,
        createLegacyRule: async () => undefined,
        deleteRuleSchedule: async () => 0,
        deleteRules: async () => 0,
        findMarkerFamily: async () => ({ personId: null, customerId: null, opportunityId: null, membershipIds: [] }),
        createFamily: async (f) => f,
        deleteFamily: async () => 0,
        findMarkerBookings: nothing,
        insertLegacyPendingBooking: async () => undefined,
        deleteBookings: async () => 0,
        listLocationLinks: nothing,
        createLink: async () => "link",
        withdrawLink: async () => undefined,
        findFixtureFormRows: nothing,
        countFormKeysOutsideOrg: async () => 0,
        findFormOrg: async () => null,
        listFormVersions: nothing,
        createForm: async () => "form",
        createDraftVersion: async () => "version",
        publishVersion: async () => undefined,
    };
}

async function runReal(s: SyntheticToursAuthority, op: ToursFixtureOperation, env: Record<string, string | undefined> = s.env, over: Partial<Deps> = {}) {
    const lines: string[] = [];
    const built: { apiUrl: string; serviceKey: string }[] = [];
    const reads: string[] = [];
    const deps = { ...s.deps, ...over };
    const code = await runToursFixture({
        argv: [`--${op}`],
        env,
        verify: (operation) => verifyToursFixtureAuthorityV2(env, { ...deps, operation }) as never,
        attest: (operation, apiOrigin, connect) => runAttestedToursConnection(env, { ...deps, operation, url: env.DATABASE_URL, clientEnv: env, apiOrigin, connect }) as never,
        ports: ({ client }) => {
            built.push(client);
            return fakePorts();
        },
        readFile: (p) => {
            reads.push(p);
            return p === SYNTH.sessionFile ? SYNTH_SESSION_TEXT : null;
        },
        write: (l) => lines.push(l),
        now: new Date(SYNTH.nowMs),
    });
    return { code, lines, built, reads };
}

describe("the runner verifies before any credential, session or client, and builds its client from the attested copy", () => {
    it("a genuine v2 authority: ports built once, on the verified API origin, with the attested service key", async () => {
        const s = synth({ operation: "count" });
        const r = await runReal(s, "count");
        expect(r.lines[0], r.lines.join("\n")).toBe("✓ binding a741 org=persona_qa_shared site=qa_north preview=loopback session=digest_bound authority=v2 api=identity_bound pins=verified");
        expect(r.built).toEqual([{ apiUrl: SYNTH.apiUrl, serviceKey: SYNTH.serviceKey }]);
        expect(r.code).toBe(0);
        expect(r.lines.join("\n")).not.toContain("SENTINEL");
    });

    for (const [name, mk, code] of [
        ["a v1 record", () => synth({ mutate: (r) => { r.schema = "vacilando.isolated_fixture_authority.v1"; } }), "fixture_authority_org_unbound"],
        ["a record with no API identity", () => synth({ mutate: (r) => { delete r.api_identity; } }), "api_identity_absent"],
        ["a record with no pins", () => synth({ mutate: (r) => { delete r.program_pins; } }), "fixture_program_pins_absent"],
        ["a held target", () => { const s = synth(); s.writeHold(holdRecord(SYNTH.environmentId, { state: "held", revision: 2, previous_sha256: s.holdRecord.record_sha256 })); return s; }, "target_hold_held"],
        ["the shared stack's database", () => synth({ envOver: { DATABASE_URL: SYNTH.dbUrl.replace(":56131/", ":54422/") } }), "database_identity_shared_target_refused"],
    ] as const) {
        it(`${name}: refused, and neither the service key nor the session file is read, and no port is built`, async () => {
            const s = mk();
            const touched: string[] = [];
            const env = new Proxy(s.env, { get: (t, k) => { touched.push(String(k)); return t[k as string]; } });
            const r = await runReal(s, "ensure", env);
            expect(r).toMatchObject({ code: 2, lines: [`✗ refused_${code}`], built: [], reads: [] });
            expect(touched).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        });
    }

    it("a hold that changes between the verification and the client: the gate re-verifies and builds nothing", async () => {
        const s = synth();
        let calls = 0;
        const lines: string[] = [];
        const built: unknown[] = [];
        const code = await runToursFixture({
            argv: ["--ensure"],
            env: s.env,
            verify: (operation) => verifyToursFixtureAuthorityV2(s.env, { ...s.deps, operation }) as never,
            attest: (operation, apiOrigin, connect) => {
                calls += 1;
                s.writeHold(holdRecord(SYNTH.environmentId, { revision: 2, previous_sha256: s.holdRecord.record_sha256 }));
                return runAttestedToursConnection(s.env, { ...s.deps, operation, url: s.env.DATABASE_URL, clientEnv: s.env, apiOrigin, connect }) as never;
            },
            ports: () => { built.push(1); return fakePorts(); },
            readFile: (p) => (p === SYNTH.sessionFile ? SYNTH_SESSION_TEXT : null),
            write: (l) => lines.push(l),
            now: new Date(SYNTH.nowMs),
        });
        expect(calls).toBe(1);
        expect(code).toBe(2);
        expect(lines.at(-1)).toBe("✗ refused_target_hold_changed_since_issue");
        expect(built).toEqual([]);
    });

    it("the real entry refuses a pre-v2 environment with exit 2 before any I/O (real process, no executor state)", () => {
        const tsx = resolve(web, "node_modules/.bin/tsx");
        const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: "/tmp", NODE_ENV: "test", ALLOY_CERT_FIXTURE: "tours_certification", ALLOY_CERT_NAMESPACE: "tours-cert.alloy.invalid", ALLOY_QA_RUN_ID: SYNTH.qaRunId, ALLOY_QA_ENVIRONMENT_ID: SYNTH.environmentId, SUPABASE_URL: SYNTH.apiUrl, SUPABASE_SERVICE_ROLE_KEY: SYNTH.serviceKey };
        const r = spawnSync(tsx, ["--tsconfig", "tsconfig.json", "scripts/qaToursFixture.ts", "--count"], { cwd: web, env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 60_000 });
        expect(r.stdout.trim(), r.stderr).toBe("✗ refused_executor_binding_absent");
        expect(r.status).toBe(2);
    });
});
