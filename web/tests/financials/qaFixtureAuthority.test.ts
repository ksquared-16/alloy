/**
 * QAFX-AUTH-01 (Financials H4) — the child-side operation authority for `test:qa:financials-isolated`.
 *
 * Mirrors the toolkit's IFX13 / IFX14 negative controls (`tests/deterministic/isolated-fixture-execution.test.mjs`,
 * A741 bab9c927) over a SYNTHETIC executor store in a temp directory. No database, no network, no fixture
 * execution, no credential: the record, the request and every key are synthetic.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import pkg from "../../package.json";
import {
    FINANCIALS_FIXTURE_ORG,
    FINANCIALS_HISTORICAL_DRAFT_PROGRAM,
    FINANCIALS_ISOLATED_PROGRAM,
    FIXTURE_AUTHORITY_REFUSALS as A,
    QA_PERSONA_ORGS,
    FIXTURE_AUTHORITY_SCHEMA,
    readOwnScriptBody,
    trustedGatewayStoreRoot,
    verifyFinancialsFixtureAuthority as verify,
} from "../../scripts/qa/financialsFixtureAuthority.mjs";
import { FINANCIALS_ISOLATED_SUITE } from "../../scripts/qa/financialsIsolatedTests.mjs";
import { judgeLiveSuiteAuthority } from "../harness/liveSuiteAuthority.mjs";
import { syntheticExecutorStore } from "../harness/syntheticFixtureAuthority";

const stores: Array<{ cleanup: () => void }> = [];
const make = (o?: Parameters<typeof syntheticExecutorStore>[0]) => {
    const s = syntheticExecutorStore(o);
    stores.push(s);
    return s;
};
afterEach(() => {
    while (stores.length) stores.pop()!.cleanup();
});

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("the contract is the toolkit's, restated and pinned", () => {
    it("schema and refusal codes equal the toolkit's verifyFixtureAuthority (A741 bab9c927)", () => {
        expect(FIXTURE_AUTHORITY_SCHEMA).toBe("vacilando.isolated_fixture_authority.v1");
        expect(A).toMatchObject({
            ABSENT: "fixture_authority_absent", UNTRUSTED_ROOT: "fixture_authority_store_root_untrusted", ORIGIN: "fixture_authority_not_executor_issued",
            PROVENANCE: "fixture_authority_no_live_request", ALTERED: "fixture_authority_altered", SCHEMA: "fixture_authority_schema",
            EXPIRED: "fixture_authority_expired", NOT_YET: "fixture_authority_not_yet_valid", MISMATCH: "fixture_authority_mismatch",
        });
    });

    it("the program's own npm script and pinned body are what package.json declares, at the registered digest", () => {
        expect(FINANCIALS_ISOLATED_PROGRAM).toMatchObject({ fixture: "financials_isolated_tests", operations: ["run"], suite: "financials", npm_script: "test:qa:financials-isolated", org_binding: "seed_manifest" });
        expect(pkg.scripts["test:qa:financials-isolated"]).toBe(FINANCIALS_ISOLATED_PROGRAM.script_body);
        expect(readOwnScriptBody()).toBe(FINANCIALS_ISOLATED_PROGRAM.script_body);
        expect(sha(FINANCIALS_ISOLATED_PROGRAM.script_body)).toBe("78453bfcd3d60c0757d800c64f42577265fc27ff458d48e03cc610b818f1c169");
    });

    it("the only organization is the certification seed org — not QA Shared, not Firefly", () => {
        expect(FINANCIALS_FIXTURE_ORG).toEqual({ id: "00000000-0000-4000-8000-000000000001", source: "seed_manifest" });
    });
});

describe("the store root is resolved by the verifier, never from the environment", () => {
    it("is the account's passwd home at the toolkit's default Gateway depth", () => {
        expect(trustedGatewayStoreRoot({ account: () => ({ homedir: "/Users/someone" }) })).toBe("/Users/someone/.local/state/alloy-dev/gateway");
        expect(trustedGatewayStoreRoot()).toBe(join(userInfo().homedir, ".local", "state", "alloy-dev", "gateway"));
        expect(trustedGatewayStoreRoot({ account: () => ({ homedir: "relative" }) })).toBeNull();
        expect(trustedGatewayStoreRoot({ account: () => { throw new Error("no passwd"); } })).toBeNull();
    });

    it("no root → refused", () => {
        const s = make();
        expect(verify(s.env(), s.options({ storeRoot: null }))).toEqual({ ok: false, code: A.UNTRUSTED_ROOT });
    });

    it("an environment that names the synthetic store as its root (HOME, ALLOY_RUNTIME_ROOT) gains nothing: the default root is the real one", () => {
        const s = make();
        const env = s.env({ HOME: s.root, ALLOY_RUNTIME_ROOT: s.root, ALLOY_GATEWAY_STATE_ROOT: s.root });
        const rest: Record<string, unknown> = s.options();
        delete rest.storeRoot;
        expect(verify(env, rest).ok).toBe(false);
        expect(judgeLiveSuiteAuthority({ env }).admit).toBe("none");
    });
});

describe("live executor authority admits; nothing else does", () => {
    it("ACCEPTS the executor's live in-flight record for exactly this request, program and candidate", () => {
        const s = make();
        const v = verify(s.env(), s.options());
        expect(v).toEqual({
            ok: true,
            authority: {
                request_id: "req-fin-auth-0001", fixture: "financials_isolated_tests", operation: "run", npm_script: "test:qa:financials-isolated",
                candidate_sha: "c".repeat(40), expires_at: s.rec.expires_at, org_id: FINANCIALS_FIXTURE_ORG.id,
            },
        });
        const j = judgeLiveSuiteAuthority({ env: s.env(), authority: s.options() });
        expect(j).toMatchObject({ admit: "pinned", authority: "isolated_qa_authority", files: [...FINANCIALS_ISOLATED_SUITE] });
    });

    it("no blanket permission: even live authority admits ONLY the one pinned suite", () => {
        const s = make();
        const j = judgeLiveSuiteAuthority({ env: s.env(), authority: s.options() });
        expect(j.admit === "pinned" && j.files).toEqual(["tests/financials/live/catalogAddCharge.live.test.ts"]);
    });

    it("env alone is not authority", () => {
        const s = make();
        expect(verify(s.env({ ALLOY_QA_AUTHORITY_FILE: undefined }), s.options()).code).toBe(A.ABSENT);
    });

    it("a FORGED self-consistent record anywhere outside the store, with a matching environment and digest → not executor-issued", () => {
        const s = make();
        const dir = mkdtempSync(join(tmpdir(), "forge-"));
        try {
            const elsewhere = join(dir, s.name);
            writeFileSync(elsewhere, s.text);
            expect(verify(s.env({ ALLOY_QA_AUTHORITY_FILE: elsewhere }), s.options()).code).toBe(A.ORIGIN);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("a symlink into the authority directory pointing elsewhere → not executor-issued", () => {
        const s = make();
        const dir = mkdtempSync(join(tmpdir(), "forge-"));
        try {
            const elsewhere = join(dir, "outside.json");
            writeFileSync(elsewhere, s.text);
            const link = join(s.authorityDir, "req-fin-auth-0001.dddd.json");
            symlinkSync(elsewhere, link);
            s.writeRequest({}, { file: "req-fin-auth-0001.dddd.json" });
            expect(verify(s.env({ ALLOY_QA_AUTHORITY_FILE: link }), s.options()).code).toBe(A.ORIGIN);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("a record inside the directory but filed under another request's name → not executor-issued", () => {
        const s = make();
        const other = join(s.authorityDir, "req-other-0002.aaaa.json");
        writeFileSync(other, s.text);
        expect(verify(s.env({ ALLOY_QA_AUTHORITY_FILE: other }), s.options()).code).toBe(A.ORIGIN);
    });

    it("no executor request for it → no live request", () => {
        const s = make();
        rmSync(s.reqFile);
        expect(verify(s.env(), s.options()).code).toBe(A.PROVENANCE);
    });

    it("a COMPLETED request (a replay after the execution) → no live request", () => {
        const s = make();
        s.writeRequest({ state: "complete" });
        expect(verify(s.env(), s.options()).code).toBe(A.PROVENANCE);
    });

    it("an in-flight request naming another file, or another binding → no live request", () => {
        const s = make();
        s.writeRequest({}, { file: "req-fin-auth-0001.ffff.json" });
        expect(verify(s.env(), s.options()).code).toBe(A.PROVENANCE);
        s.writeRequest({ binding_digest: "e".repeat(64) });
        expect(verify(s.env(), s.options()).code).toBe(A.PROVENANCE);
    });

    it("ALTERED bytes refuse on the executor's recorded digest — with the env digest omitted, and when the env digest disagrees", () => {
        const s = make();
        s.writeRequest({}, { sha256: "0".repeat(64) });
        expect(verify(s.env({ ALLOY_QA_AUTHORITY_SHA256: undefined }), s.options()).code).toBe(A.ALTERED);
        expect(verify(s.env(), s.options()).code).toBe(A.ALTERED);
        s.writeRequest();
        expect(verify(s.env({ ALLOY_QA_AUTHORITY_SHA256: "1".repeat(64) }), s.options()).code).toBe(A.ALTERED);
        /* The env digest is optional and never the origin: a recorded digest present, env digest absent → accepted. */
        expect(verify(s.env({ ALLOY_QA_AUTHORITY_SHA256: undefined }), s.options()).ok).toBe(true);
    });

    it("bytes rewritten after the executor recorded them → altered", () => {
        const s = make();
        writeFileSync(s.file, s.text.replace("\"mutating\": true", "\"mutating\": false"));
        expect(verify(s.env({ ALLOY_QA_AUTHORITY_SHA256: undefined }), s.options()).code).toBe(A.ALTERED);
    });

    it("wrong schema or a malformed request id → schema", () => {
        const old = make({ record: { schema: "vacilando.isolated_fixture_authority.v0" } });
        expect(verify(old.env(), old.options()).code).toBe(A.SCHEMA);
        const bad = make({ record: { request_id: "../x" } });
        expect(verify(bad.env(), bad.options()).code).toBe(A.SCHEMA);
    });

    it("EXPIRED and FUTURE records refuse", () => {
        const now = Date.now();
        const expired = make({ now, record: { expires_at: new Date(now - 1).toISOString() } });
        expect(verify(expired.env(), expired.options()).code).toBe(A.EXPIRED);
        const atExpiry = make({ now, record: { expires_at: new Date(now).toISOString() } });
        expect(verify(atExpiry.env(), atExpiry.options()).code).toBe(A.EXPIRED);
        const future = make({ now, record: { issued_at: new Date(now + 60_000).toISOString() } });
        expect(verify(future.env(), future.options()).code).toBe(A.NOT_YET);
        const ok = make({ now });
        expect(verify(ok.env(), ok.options({ nowMs: Date.parse(String(ok.rec.expires_at)) + 1 })).code).toBe(A.EXPIRED);
    });

    it.each([
        ["another operation (record and env agree on it)", { operation: "reset" }, { ALLOY_CERT_OPERATION: "reset" }, ["operation"]],
        ["another fixture", { fixture: "enrollment_isolated_tests" }, { ALLOY_CERT_FIXTURE: "enrollment_isolated_tests" }, ["fixture"]],
        ["another suite", { suite: "enrollment" }, {}, ["suite"]],
        ["another npm script", { npm_script: "test:qa:enrollment-isolated" }, {}, ["npm_script"]],
        ["another pinned script body", { script_sha256: "9".repeat(64) }, {}, ["script_sha256"]],
        ["another candidate (record and env agree, HEAD does not)", { candidate_sha: "d".repeat(40) }, { ALLOY_QA_CANDIDATE_SHA: "d".repeat(40) }, ["candidate_sha"]],
    ])("a record for %s → mismatch", (_l, record, envOver, fields) => {
        const s = make({ record });
        const v = verify(s.env(envOver), s.options());
        expect(v).toMatchObject({ ok: false, code: A.MISMATCH, fields });
    });

    it.each([
        ["another owning QA run", { ALLOY_QA_RUN_ID: "qar_ffffffffffff" }, "qa_run_id"],
        ["another target environment", { ALLOY_QA_ENVIRONMENT_ID: "certenv-ffffffffff" }, "environment_id"],
        ["another request id", { ALLOY_QA_REQUEST_ID: "req-other-0002" }, "request_id"],
        ["another binding digest", { ALLOY_QA_BINDING_DIGEST: "e".repeat(64) }, "binding_digest"],
        ["another candidate", { ALLOY_QA_CANDIDATE_SHA: "d".repeat(40) }, "candidate_sha"],
        ["an absent candidate", { ALLOY_QA_CANDIDATE_SHA: undefined }, "candidate_sha"],
        ["another npm lifecycle", { npm_lifecycle_event: "test:qa:enrollment-isolated" }, "npm_lifecycle_event"],
    ])("an environment naming %s → mismatch", (_l, envOver, field) => {
        const s = make();
        const v = verify(s.env(envOver), s.options());
        expect(v.ok).toBe(false);
        expect(v.code).toBe(A.MISMATCH);
        expect(v.fields).toContain(field);
    });

    it("the program's own facts decide: drifted package.json body or unreadable HEAD → mismatch", () => {
        const s = make();
        expect(verify(s.env(), s.options({ readScriptBody: () => "node scripts/qa/somethingElse.mjs" }))).toMatchObject({ code: A.MISMATCH, fields: ["script_sha256"] });
        expect(verify(s.env(), s.options({ readHead: () => null }))).toMatchObject({ code: A.MISMATCH, fields: ["candidate_sha"] });
    });

    it.each([
        ["the QA Shared persona org", { ALLOY_CERT_FIXTURE_ORG_ID: "4acc9386-c485-486f-aa1f-05d83499d142" }],
        ["a persona-sourced org", { ALLOY_CERT_FIXTURE_ORG_SOURCE: "persona" }],
        ["no bound org (a shared-stack fallback)", { ALLOY_CERT_FIXTURE_ORG_ID: undefined, ALLOY_CERT_FIXTURE_ORG_SOURCE: undefined }],
    ])("the fixture org must be the bound seed org: %s → refused", (_l, envOver) => {
        const s = make();
        expect(verify(s.env(envOver), s.options()).code).toBe(A.ORG);
    });

    it("no refusal carries a value from the record or the environment", () => {
        const s = make();
        const out = JSON.stringify([
            verify(s.env({ ALLOY_QA_RUN_ID: "qar_ffffffffffff" }), s.options()),
            verify(s.env({ ALLOY_CERT_FIXTURE_ORG_ID: "4acc9386-c485-486f-aa1f-05d83499d142" }), s.options()),
        ]);
        expect(out).not.toContain("sk_synthetic");
        expect(out).not.toContain("qar_ffffffffffff");
        expect(out).not.toContain(s.root);
    });

    it("THE BOUNDARY, stated: a same-user rewrite of the executor's own store (request AND record) is outside what the child can detect — documented, not claimed", () => {
        const s = make();
        const forged = `${JSON.stringify({ ...s.rec, nonce: "forged" })}\n`;
        writeFileSync(s.file, forged);
        s.writeRequest({}, { sha256: sha(forged) });
        expect(verify(s.env({ ALLOY_QA_AUTHORITY_SHA256: undefined }), s.options()).ok).toBe(true);
    });
});

describe("one verifier, an explicit program descriptor per registered fixture", () => {
    const H = FINANCIALS_HISTORICAL_DRAFT_PROGRAM;

    it("the historical descriptor is the A741 registration; the persona orgs are A741 QA_ORGS", () => {
        expect(H).toMatchObject({ fixture: "financials_historical_draft", suite: "financials", npm_script: "dev:qa:financials-historical-draft-fixture", org_binding: "persona", operations: ["ensure", "verify", "reset", "count"] });
        expect(pkg.scripts["dev:qa:financials-historical-draft-fixture"]).toBe(H.script_body);
        expect(readOwnScriptBody({ program: H })).toBe(H.script_body);
        expect(sha(H.script_body)).toBe("07f838cf008e519ab1096cd4baf0d2a6fea245ad1e6f6e8eb53655f103e287e8");
        expect(QA_PERSONA_ORGS).toEqual({ qa_shared: "4acc9386-c485-486f-aa1f-05d83499d142", qa_secondary: "ad53fee2-2570-460f-9300-f0e106c473b6" });
        expect(Object.values(QA_PERSONA_ORGS)).not.toContain(FINANCIALS_FIXTURE_ORG.id);
    });

    it("an unregistered program or an unregistered operation is refused before anything is read", () => {
        const s = make();
        let reads = 0;
        const readFile = () => { reads += 1; return ""; };
        expect(verify(s.env(), s.options({ program: { ...FINANCIALS_ISOLATED_PROGRAM }, readFile })).code).toBe(A.PROGRAM);
        expect(verify(s.env(), s.options({ program: FINANCIALS_ISOLATED_PROGRAM, operation: "reset", readFile })).code).toBe(A.PROGRAM);
        expect(verify(s.env(), s.options({ program: H, operation: "run", readFile })).code).toBe(A.PROGRAM);
        expect(reads).toBe(0);
    });

    it("the isolated program's authority does not satisfy the historical program, nor the reverse", () => {
        const iso = make();
        expect(verify(iso.env(), iso.options({ program: H, operation: "ensure", readScriptBody: () => H.script_body }))).toMatchObject({ code: A.MISMATCH });
        const hist = make({ program: H, operation: "ensure" });
        expect(verify(hist.env(), hist.options({ readScriptBody: () => FINANCIALS_ISOLATED_PROGRAM.script_body }))).toMatchObject({ code: A.MISMATCH });
        expect(judgeLiveSuiteAuthority({ env: hist.env(), authority: hist.options() }).admit).toBe("none");
    });

    it("the historical program verifies its persona org from the executor's QA-run ledger", () => {
        const s = make({ program: H, operation: "reset" });
        expect(verify(s.env(), s.options({ program: H, operation: "reset" }))).toMatchObject({ ok: true, authority: { fixture: "financials_historical_draft", operation: "reset", org_id: QA_PERSONA_ORGS.qa_shared } });
        s.writeRun({}, { org_key: "qa_secondary" });
        expect(verify(s.env(), s.options({ program: H, operation: "reset" })).code).toBe(A.PERSONA_ORG);
        expect(verify(s.env({ ALLOY_CERT_FIXTURE_ORG_ID: QA_PERSONA_ORGS.qa_secondary }), s.options({ program: H, operation: "reset" }))).toMatchObject({ ok: true, authority: { org_id: QA_PERSONA_ORGS.qa_secondary } });
    });

    it("the isolated program's seed-manifest org rule is unchanged: a persona org refuses it", () => {
        const s = make();
        expect(verify(s.env({ ALLOY_CERT_FIXTURE_ORG_ID: QA_PERSONA_ORGS.qa_shared, ALLOY_CERT_FIXTURE_ORG_SOURCE: "persona" }), s.options()).code).toBe(A.ORG);
    });
});
