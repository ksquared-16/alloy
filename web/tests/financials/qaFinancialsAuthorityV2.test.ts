/**
 * FINANCIALS AUTHORITY v2 — negative controls, synthetic only.
 *
 * Every case runs against a synthetic executor store in a temp directory (tests/harness/syntheticFixtureAuthority.ts):
 * no Gateway state, no database, no network, no credential. The database URLs point at loopback ports nothing
 * listens on and are never connected to; `spawn` and `createClient` are replaced so that reaching either fails the
 * case. What is proven: each of the three Financials entry points — the isolated runner, the historical draft
 * fixture and the vitest live-suite guard — refuses BEFORE it spawns, creates a client or admits a live suite,
 * unless the executor's v2 authority names exactly this program, operation, candidate, script, organization,
 * database connection and clear target hold, and the API origin is in that database's environment block.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const SENTINEL = vi.hoisted(() => "sk_synthetic_v2_never_print_0123456789abcdef");
const spawned = vi.hoisted(() => ({ calls: 0 }));
vi.mock("node:child_process", async (orig) => ({
    ...(await orig<typeof import("node:child_process")>()),
    spawn: vi.fn(() => {
        spawned.calls += 1;
        throw new Error(`spawn refused in this suite: ${SENTINEL}`);
    }),
}));
const clients = vi.hoisted(() => ({ created: 0 }));
vi.mock("@supabase/supabase-js", async (orig) => ({
    ...(await orig<typeof import("@supabase/supabase-js")>()),
    createClient: vi.fn(() => {
        clients.created += 1;
        throw new Error(`no client may be created in this suite: ${SENTINEL}`);
    }),
}));

import {
    FINANCIALS_HISTORICAL_DRAFT_PROGRAM,
    FINANCIALS_ISOLATED_PROGRAM,
    FIXTURE_AUTHORITY_REFUSALS as A,
    QA_PERSONA_ORGS,
    apiInBoundEnvironment,
    certenvBlockOf,
    verifyFinancialsFixtureAuthority as verify,
} from "../../scripts/qa/financialsFixtureAuthority.mjs";
import { main as historicalMain } from "../../scripts/qa/financialsHistoricalDraftFixture";
import { main as isolatedMain } from "../../scripts/qa/financialsIsolatedTests.mjs";
import {
    TOOLKIT_SOURCE,
    connectionTargetOf,
    databaseIdentityOf,
    targetHoldRecordDigest,
    verifyConnectionTarget,
    verifyTargetHoldDisposition,
} from "../../scripts/qa/isolatedFixtureAuthorityV2.mjs";
import { judgeLiveSuiteAuthority } from "../harness/liveSuiteAuthority.mjs";
import { SYNTHETIC_DB_URL, SYNTHETIC_ENVIRONMENT, syntheticExecutorStore, syntheticHoldRecord } from "../harness/syntheticFixtureAuthority";

const H = FINANCIALS_HISTORICAL_DRAFT_PROGRAM;
const I = FINANCIALS_ISOLATED_PROGRAM;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const identityOf = (url: string) => {
    const r = databaseIdentityOf(url, SYNTHETIC_ENVIRONMENT);
    if (!r.ok) throw new Error("synthetic identity");
    return r.identity;
};

type Store = ReturnType<typeof syntheticExecutorStore>;
const stores: Store[] = [];
const make = (o?: Parameters<typeof syntheticExecutorStore>[0]) => {
    const s = syntheticExecutorStore(o);
    stores.push(s);
    return s;
};
afterEach(() => {
    while (stores.length) stores.pop()!.cleanup();
    spawned.calls = 0;
    clients.created = 0;
});

/** All three entry points, under one store and one environment: each must refuse with `code`, before any IO. */
async function refusedEverywhere(s: Store, env: Record<string, string | undefined>, code: string, program: typeof I | typeof H = I) {
    const e = { ...env, SUPABASE_SERVICE_ROLE_KEY: SENTINEL };
    const op = program === H ? "ensure" : "run";
    expect(verify(e, s.options({ program, operation: op }))).toMatchObject({ ok: false, code });
    const out: string[] = [];
    let ran = 0;
    if (program === I) {
        const exit = await isolatedMain({ env: e, argv: [], out: (l: string) => out.push(l), run: async () => { ran += 1; return { code: 0 }; }, authority: s.options() });
        expect(exit).toBe(2);
        expect(ran).toBe(0);
        expect(out[0]).toMatch(new RegExp(`^✗ refused before any process: ${code}( fields=|$)`));
        expect(judgeLiveSuiteAuthority({ env: e, authority: s.options() }).admit).toBe("none");
    } else {
        const exit = await historicalMain(e as never, ["--ensure"], (l) => out.push(l), s.options());
        expect(exit).toBe(2);
        expect(out[0]).toMatch(new RegExp(`^✗ refused before any IO: ${code}( fields=|$)`));
    }
    expect(spawned.calls).toBe(0);
    expect(clients.created).toBe(0);
    const text = out.join("\n");
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain("SYNTHETIC-DB-SENTINEL");
    expect(text).not.toContain(s.root);
}

describe("the shared verifier is reused, byte-identical, not restated again", () => {
    const web = process.cwd();
    it("is Enrollment's committed file (80eb7446656f) and the toolkit's vendored vectors (eeaa6dac6860)", () => {
        expect(sha(readFileSync(join(web, "scripts/qa/isolatedFixtureAuthorityV2.mjs"), "utf8"))).toBe("bf6e405fcaf3a158842ed33732c0e5af8bae4119c3404f7f50e94aa0933e3876");
        expect(sha(readFileSync(join(web, "tests/qa/fixtures/isolated-fixture-authority-v2.vectors.json"), "utf8"))).toBe("c028b885672509e5f28e30b12f0cf3f2128bba92d45999002daad6894cb94d4c");
        expect(TOOLKIT_SOURCE.commit).toBe("eeaa6dac68600dee8862962decd42b60169523b9");
    });

    it("reproduces the toolkit's connection-target and hold vectors", () => {
        const v = JSON.parse(readFileSync(join(web, "tests/qa/fixtures/isolated-fixture-authority-v2.vectors.json"), "utf8"));
        const url = (r: string) => r.replace("***", "synthetic-password");
        const base = v.database_identity[0].identity;
        for (const x of v.database_identity) expect(databaseIdentityOf(url(x.url_redacted), v.environment_id)).toEqual({ ok: true, identity: x.identity });
        for (const x of v.connection_target.vectors) {
            const r = verifyConnectionTarget(base, { url: url(x.url_redacted), clientEnv: x.client_env ?? undefined });
            expect(r.ok ? r.identity?.digest : r.code, x.url_redacted).toBe(x.expected.ok ? x.expected.digest : x.expected.code);
        }
        const clear = v.hold.clear_record;
        expect(targetHoldRecordDigest(clear)).toBe(clear.record_sha256);
        const store = (rec: unknown) => ({ storeRoot: "/synthetic", targetKey: String(clear.target_key), requestId: String(v.hold.disposition_from_clear_record.request_id), readFile: () => JSON.stringify(rec) });
        expect(verifyTargetHoldDisposition(v.hold.disposition_from_clear_record, store(clear))).toEqual({ ok: true });
        expect(verifyTargetHoldDisposition(v.hold.disposition_from_clear_record, store(v.hold.held_record_next_revision))).toMatchObject({ code: "target_hold_held" });
    });
});

describe("a genuine v2 authority admits exactly its program", () => {
    it("the isolated tests: seed org, this database, clear hold, API in the same block", () => {
        const s = make();
        expect(verify(s.env(), s.options())).toMatchObject({
            ok: true,
            authority: { org_id: "00000000-0000-4000-8000-000000000001", org_key: "certification_seed", hold_revision: 1, api_url: "http://127.0.0.1:56102", database_identity_digest: identityOf(SYNTHETIC_DB_URL).digest },
        });
        expect(judgeLiveSuiteAuthority({ env: s.env(), authority: s.options() }).admit).toBe("pinned");
    });

    it("the historical draft: the ledger-bound persona org", () => {
        const s = make({ program: H, operation: "verify" });
        expect(verify(s.env(), s.options({ program: H, operation: "verify" }))).toMatchObject({ ok: true, authority: { org_id: QA_PERSONA_ORGS.qa_shared, org_key: "qa_shared", org_source: "persona" } });
    });
});

describe("FAIL CLOSED: the v1 record the installed toolkit issues Financials today is refused — no v1 fallback", () => {
    it.each([
        ["isolated tests", I],
        ["historical draft", H],
    ])("%s", async (_l, program) => {
        const op = program === H ? "ensure" : "run";
        const s = make({ program, operation: op, record: { schema: "vacilando.isolated_fixture_authority.v1", fixture_org: undefined, database_identity: undefined, target_hold_disposition: undefined } });
        await refusedEverywhere(s, s.env(), A.ORG_UNBOUND, program);
    });
});

describe("forged, expired or replayed authority", () => {
    it("a record outside the executor's authority directory (forged) → not executor-issued", async () => {
        const s = make();
        const forged = join(s.root, "forged.req-fin-auth-0001.json");
        writeFileSync(forged, s.text);
        await refusedEverywhere(s, s.env({ ALLOY_QA_AUTHORITY_FILE: forged }), A.ORIGIN);
    });

    it("no in-flight request names it → no live request", async () => {
        const s = make();
        s.writeRequest({}, { file: "req-fin-auth-0001.0000000000000000.json" });
        await refusedEverywhere(s, s.env(), A.PROVENANCE);
    });

    it("replayed after the execution completed → no live request", async () => {
        const s = make();
        s.writeRequest({ state: "complete" });
        await refusedEverywhere(s, s.env(), A.PROVENANCE);
    });

    it("bytes altered after issue → altered", async () => {
        const s = make();
        writeFileSync(s.file, `${JSON.stringify({ ...s.rec, nonce: "edited" })}\n`);
        await refusedEverywhere(s, s.env({ ALLOY_QA_AUTHORITY_SHA256: undefined }), A.ALTERED);
    });
});

describe("the authority window (the verifier's clock is moved, not the record)", () => {
    it("expired", () => {
        const s = make();
        expect(verify(s.env(), s.options({ nowMs: Date.parse(String(s.rec.expires_at)) + 1 })).code).toBe(A.EXPIRED);
    });
    it("not yet valid", () => {
        const s = make();
        expect(verify(s.env(), s.options({ nowMs: Date.parse(String(s.rec.issued_at)) - 1 })).code).toBe(A.NOT_YET);
    });
});

describe("the database the child holds is the one the authority names", () => {
    it("the shared alloy-cert database (54422), even when the record names it → refused", async () => {
        const shared = "postgresql://postgres:SYNTHETIC-DB-SENTINEL@127.0.0.1:54422/postgres";
        const s = make({ record: { database_identity: identityOf(shared) } });
        await refusedEverywhere(s, s.env({ DATABASE_URL: shared }), "database_identity_shared_target_refused");
    });

    it("a SIBLING isolated environment's database (another block) → identity mismatch", async () => {
        const s = make();
        await refusedEverywhere(s, s.env({ DATABASE_URL: "postgresql://postgres:SYNTHETIC-DB-SENTINEL@127.0.0.1:56111/postgres" }), "database_identity_mismatch");
    });

    it("another database or role on the right port → identity mismatch", async () => {
        const s = make();
        await refusedEverywhere(s, s.env({ DATABASE_URL: "postgresql://postgres:SYNTHETIC-DB-SENTINEL@127.0.0.1:56101/template1" }), "database_identity_mismatch");
        await refusedEverywhere(s, s.env({ DATABASE_URL: "postgresql://other:SYNTHETIC-DB-SENTINEL@127.0.0.1:56101/postgres" }), "database_identity_mismatch");
    });

    it("a non-loopback host → not loopback", async () => {
        const remote = "postgresql://postgres:SYNTHETIC-DB-SENTINEL@10.0.0.5:56101/postgres";
        const s = make({ record: { database_identity: identityOf(remote) } });
        await refusedEverywhere(s, s.env({ DATABASE_URL: remote }), "database_identity_not_loopback");
    });

    it("no DATABASE_URL at all → identity absent", async () => {
        const s = make();
        await refusedEverywhere(s, s.env({ DATABASE_URL: undefined }), "database_identity_absent");
    });
});

describe("inherited connection overrides cannot redirect the client", () => {
    it.each(["PGHOST", "PGHOSTADDR", "PGPORT", "PGDATABASE", "PGUSER", "PGSERVICE", "PGOPTIONS"])("an inherited %s → client env override", async (k) => {
        const s = make();
        await refusedEverywhere(s, s.env({ [k]: "127.0.0.1" }), "connection_target_client_env_override");
    });

    it.each([
        ["?host= (a second host)", "postgresql://postgres:SYNTHETIC-DB-SENTINEL@127.0.0.1:56101/postgres?host=127.0.0.1&port=54422"],
        ["?options= (search_path / role switch)", "postgresql://postgres:SYNTHETIC-DB-SENTINEL@127.0.0.1:56101/postgres?options=-c%20role%3Dother"],
        ["?dbname=", "postgresql://postgres:SYNTHETIC-DB-SENTINEL@127.0.0.1:56101/postgres?dbname=template1"],
    ])("a URL parameter %s → parameter override", async (_l, url) => {
        const s = make();
        await refusedEverywhere(s, s.env({ DATABASE_URL: url }), "connection_target_parameter_override");
    });

    it("an implicit port (the client would choose) → implicit", async () => {
        const s = make();
        await refusedEverywhere(s, s.env({ DATABASE_URL: "postgresql://postgres:SYNTHETIC-DB-SENTINEL@127.0.0.1/postgres" }), "connection_target_implicit");
    });

    it("the shared check sees exactly the configuration: PG* named only by field, never by value", () => {
        const r = connectionTargetOf(SYNTHETIC_DB_URL, SYNTHETIC_ENVIRONMENT, { clientEnv: { PGHOST: "evil-host" } });
        expect(r).toEqual({ ok: false, code: "connection_target_client_env_override", fields: ["PGHOST"] });
    });
});

describe("the API origin the client is handed", () => {
    it("the shared stack's API (54421) → refused", async () => {
        const s = make();
        await refusedEverywhere(s, s.env({ SUPABASE_URL: "http://127.0.0.1:54421" }), "fixture_api_target_shared_refused");
    });

    it("a SIBLING environment's API beside this database (block 1 vs block 0) → not the bound environment", async () => {
        const s = make();
        await refusedEverywhere(s, s.env({ SUPABASE_URL: "http://127.0.0.1:56112" }), A.API_ENVIRONMENT);
    });

    it("an API outside the certenv band (the default local stack 54321) → not the bound environment", async () => {
        const s = make();
        await refusedEverywhere(s, s.env({ SUPABASE_URL: "http://127.0.0.1:54321" }), A.API_ENVIRONMENT);
    });

    it("the database port handed as the API → not the bound environment", async () => {
        const s = make();
        await refusedEverywhere(s, s.env({ SUPABASE_URL: "http://127.0.0.1:56101" }), A.API_ENVIRONMENT);
    });

    it("a malformed or hosted origin → malformed", async () => {
        const s = make();
        await refusedEverywhere(s, s.env({ SUPABASE_URL: "https://abcdefgh.supabase.co" }), "fixture_api_target_malformed");
        await refusedEverywhere(s, s.env({ SUPABASE_URL: "http://127.0.0.1:56102/rest/v1?x=1" }), "fixture_api_target_malformed");
    });

    it("the block rule, stated", () => {
        expect(certenvBlockOf(56100)).toBe(0);
        expect(certenvBlockOf(56109)).toBe(0);
        expect(certenvBlockOf(56110)).toBe(1);
        expect(certenvBlockOf(56299)).toBe(19);
        expect(certenvBlockOf(56300)).toBeNull();
        expect(certenvBlockOf(54421)).toBeNull();
        expect(apiInBoundEnvironment("http://127.0.0.1:56140", "postgresql://p@127.0.0.1:56141/postgres")).toBe(true);
        expect(apiInBoundEnvironment("http://127.0.0.1:56130", "postgresql://p@127.0.0.1:56141/postgres")).toBe(false);
    });
});

describe("the organization", () => {
    it("the environment asserting another org than the record's → mismatch", async () => {
        const s = make();
        await refusedEverywhere(s, s.env({ ALLOY_CERT_FIXTURE_ORG_ID: QA_PERSONA_ORGS.qa_shared }), A.MISMATCH);
    });

    it("an executor record naming an org the isolated entry does not declare → not registered", async () => {
        const org = { id: QA_PERSONA_ORGS.qa_shared, key: "qa_shared", source: "persona" };
        const s = make({ record: { fixture_org: org } });
        await refusedEverywhere(s, s.env({ ALLOY_CERT_FIXTURE_ORG_ID: org.id, ALLOY_CERT_FIXTURE_ORG_SOURCE: org.source }), A.ORG_NOT_REGISTERED);
    });

    it("historical: a record org the QA-run ledger does not bind → persona org unverified", async () => {
        const s = make({ program: H, operation: "ensure" });
        s.writeRun({}, { org_key: "qa_secondary" });
        await refusedEverywhere(s, s.env(), A.PERSONA_ORG, H);
    });

    it("historical: the seed org in the record, echoed by the env → persona org unverified", async () => {
        const seed = { id: "00000000-0000-4000-8000-000000000001", key: "certification_seed", source: "persona" };
        const s = make({ program: H, operation: "ensure", record: { fixture_org: seed } });
        await refusedEverywhere(s, s.env({ ALLOY_CERT_FIXTURE_ORG_ID: seed.id }), A.PERSONA_ORG, H);
    });
});

describe("the target hold, re-read from the store the verifier locates", () => {
    it("absent → refused", async () => {
        const s = make();
        s.writeHold(null);
        await refusedEverywhere(s, s.env(), "target_hold_record_absent");
    });

    it("HELD (a later revision) → refused", async () => {
        const s = make();
        s.writeHold(syntheticHoldRecord(SYNTHETIC_ENVIRONMENT, { state: "held", revision: 2, previous_sha256: s.hold.record_sha256 }));
        await refusedEverywhere(s, s.env(), "target_hold_held");
    });

    it("mutated in place (state edited, digest not recomputed) → reforged", async () => {
        const s = make();
        s.writeHold({ ...s.hold, state: "held" });
        await refusedEverywhere(s, s.env(), "target_hold_record_reforged");
    });

    it("a later CLEAR revision than the one the disposition was issued from → changed since issue", async () => {
        const s = make();
        s.writeHold(syntheticHoldRecord(SYNTHETIC_ENVIRONMENT, { revision: 2, previous_sha256: s.hold.record_sha256 }));
        await refusedEverywhere(s, s.env(), "target_hold_changed_since_issue");
    });

    it("unreadable → store unavailable", async () => {
        const s = make();
        s.writeHold("{not json");
        await refusedEverywhere(s, s.env(), "target_hold_store_unavailable");
    });

    it("a disposition for another request, or a held disposition → invalid", async () => {
        const base = make();
        const other = make({ record: { target_hold_disposition: { ...(base.rec.target_hold_disposition as object), request_id: "req-fin-other-0001" } } });
        await refusedEverywhere(other, other.env(), "target_hold_disposition_invalid");
    });
});
