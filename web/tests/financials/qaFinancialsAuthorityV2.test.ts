/**
 * FINANCIALS AUTHORITY v2 — negative controls, synthetic only.
 *
 * Every case runs against a synthetic executor store in a temp directory (tests/harness/syntheticFixtureAuthority.ts):
 * no Gateway state, no database, no network, no credential. The database URLs point at loopback ports nothing
 * listens on and are never connected to; `spawn` and `createClient` are replaced so that reaching either fails the
 * case. What is proven: each of the three Financials entry points — the isolated runner, the historical draft
 * fixture and the vitest live-suite guard — refuses BEFORE it spawns, creates a client or admits a live suite,
 * unless the executor's v2 authority names exactly this program, operation, candidate, script, organization,
 * database connection and clear target hold, and the API origin handed to the client IS the record's API identity
 * (platform 4b55fc0b INC-94E9-02) — attested again on the exact frozen configuration immediately before the client.
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
    FINANCIALS_REQUIRED_ARTIFACTS,
    FIXTURE_AUTHORITY_REFUSALS as A,
    programPinsDigest,
    QA_PERSONA_ORGS,
    runAttestedFinancialsConnection,
    verifyFinancialsFixtureAuthority as verify,
} from "../../scripts/qa/financialsFixtureAuthority.mjs";
import { main as historicalMain } from "../../scripts/qa/financialsHistoricalDraftFixture";
import { main as isolatedMain } from "../../scripts/qa/financialsIsolatedTests.mjs";
import {
    API_IDENTITY_REFUSALS as API,
    TOOLKIT_SOURCE,
    apiIdentityOf,
    connectionTargetOf,
    databaseIdentityOf,
    issuableApiIdentity,
    targetHoldRecordDigest,
    verifyApiIdentity,
    verifyConnectionTarget,
    verifyIsolatedFixtureAuthorityV2,
    verifyTargetHoldDisposition,
} from "../../scripts/qa/isolatedFixtureAuthorityV2.mjs";
import { judgeLiveSuiteAuthority } from "../harness/liveSuiteAuthority.mjs";
import { SYNTHETIC_API_URL, SYNTHETIC_DB_URL, SYNTHETIC_ENVIRONMENT, SYNTHETIC_HEAD, syntheticApiIdentity, syntheticExecutorStore, syntheticHoldRecord, syntheticProgramPins } from "../harness/syntheticFixtureAuthority";

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

describe("the shared verifier is reused (one file), pinned by the platform's vendored vectors", () => {
    const web = process.cwd();
    it("the vectors are platform candidate 4b55fc0b's (api_identity appended to eeaa6dac6860's)", () => {
        expect(sha(readFileSync(join(web, "tests/qa/fixtures/isolated-fixture-authority-v2.vectors.json"), "utf8"))).toBe("5f7a6c9d683546fdf18635b63befdd2424d29f4936d6fcf320c86e710fe25b28");
        expect(TOOLKIT_SOURCE.commit).toBe("eeaa6dac68600dee8862962decd42b60169523b9");
    });

    it("reproduces the platform's api_identity vectors: issued, not issuable, and every origin", () => {
        const v = JSON.parse(readFileSync(join(web, "tests/qa/fixtures/isolated-fixture-authority-v2.vectors.json"), "utf8")).api_identity;
        const issued = v.issued;
        expect(issuableApiIdentity(issued.port, issued.environment_id)).toEqual({ ok: true, identity: issued });
        expect(apiIdentityOf(`http://127.0.0.1:${issued.port}`, issued.environment_id)).toEqual({ ok: true, identity: issued });
        for (const x of v.not_issuable) expect(issuableApiIdentity(x.api_port, issued.environment_id)).toEqual({ ok: false, code: x.refusal });
        expect(v.vectors.length).toBeGreaterThanOrEqual(12);
        for (const x of v.vectors) {
            const r = verifyApiIdentity(issued, x.origin);
            expect(r.ok ? r.identity.digest : r.code, x.note).toBe(x.expected.ok ? x.expected.digest : x.expected.code);
        }
    });

    it("the identity is computed, never supplied: an altered or foreign record identity refuses", () => {
        const issued = syntheticApiIdentity();
        expect(verifyApiIdentity(issued, SYNTHETIC_API_URL)).toMatchObject({ ok: true });
        /* product strictness: an edited port beside the kept digest is not an identity */
        expect(verifyApiIdentity({ ...issued, port: 56103 }, "http://127.0.0.1:56103")).toEqual({ ok: false, code: API.MALFORMED });
        /* a re-digested identity for another port is another identity */
        expect(verifyApiIdentity(syntheticApiIdentity(56103), SYNTHETIC_API_URL)).toEqual({ ok: false, code: API.MISMATCH });
        expect(verifyApiIdentity({ ...issued, digest: "f".repeat(64) }, SYNTHETIC_API_URL)).toEqual({ ok: false, code: API.MALFORMED });
        expect(verifyApiIdentity({ ...issued, schema: "vacilando.api_identity.v0" }, SYNTHETIC_API_URL)).toEqual({ ok: false, code: API.ABSENT });
        expect(verifyApiIdentity(undefined, SYNTHETIC_API_URL)).toEqual({ ok: false, code: API.ABSENT });
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

describe("the API the client is handed IS the record's api_identity — the port block is not identity", () => {
    it.each([
        ["another port inside the same certenv block (56103)", "http://127.0.0.1:56103", API.MISMATCH],
        ["the database port handed as the API (56101)", "http://127.0.0.1:56101", API.MISMATCH],
        ["a SIBLING environment's API (block 1, 56112)", "http://127.0.0.1:56112", API.MISMATCH],
        ["the default local stack (54321)", "http://127.0.0.1:54321", API.MISMATCH],
        ["the shared alloy-cert API (54421)", "http://127.0.0.1:54421", API.SHARED],
        ["localhost for 127.0.0.1", "http://localhost:56102", API.NOT_LOOPBACK],
        ["a hosted project", "https://abcdefgh.supabase.co", API.MALFORMED],
        ["a path and a query", "http://127.0.0.1:56102/rest/v1?x=1", API.MALFORMED],
        ["credentials in the origin", "http://u:p@127.0.0.1:56102", API.MALFORMED],
        ["an implicit port", "http://127.0.0.1", API.MALFORMED],
    ])("SUPABASE_URL = %s → refused", async (_l, origin, code) => {
        const s = make();
        await refusedEverywhere(s, s.env({ SUPABASE_URL: origin, NEXT_PUBLIC_SUPABASE_URL: origin }), code);
    });

    it("no SUPABASE_URL → api identity absent", async () => {
        const s = make();
        await refusedEverywhere(s, s.env({ SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_URL: undefined }), API.ABSENT);
    });

    it.each([
        ["a record without api_identity (registered required: the child requires it)", { api_identity: undefined }, API.ABSENT],
        ["an api_identity for another environment", { api_identity: syntheticApiIdentity(56102, "certenv-9999999999") }, API.ABSENT],
        ["an api_identity with its port edited and its digest kept", { api_identity: { ...syntheticApiIdentity(), port: 56112 } }, API.MALFORMED],
        ["an api_identity re-issued for another port in the block", { api_identity: syntheticApiIdentity(56103) }, API.MISMATCH],
        ["an api_identity naming the shared API, handed the shared API", { api_identity: (apiIdentityOf("http://127.0.0.1:54421", SYNTHETIC_ENVIRONMENT) as { identity: unknown }).identity }, API.SHARED],
    ])("%s → refused, both programs", async (label, record, code) => {
        const over = label.includes("shared API") ? { SUPABASE_URL: "http://127.0.0.1:54421", NEXT_PUBLIC_SUPABASE_URL: undefined } : {};
        const s = make({ record });
        await refusedEverywhere(s, s.env(over), code);
        const h = make({ program: H, operation: "ensure", record });
        await refusedEverywhere(h, h.env(over), code, H);
    });

    it("the shared verifier: requireApi makes an absent api_identity a refusal; without it a record without one keeps the earlier guard", () => {
        const s = make({ record: { api_identity: undefined, program_pins: undefined } });
        const call = (requireApi: boolean) => verifyIsolatedFixtureAuthorityV2(s.env(), {
            ...s.options(), requireApi,
            program: { fixture: I.fixture, operation: "run", suite: I.suite, npm_script: I.npm_script, script_body: I.script_body },
            org: { id: "00000000-0000-4000-8000-000000000001", key: "certification_seed", source: "seed_manifest" },
        } as never);
        expect(call(true)).toEqual({ ok: false, code: API.ABSENT });
        const legacy = call(false);
        expect(legacy.ok).toBe(true);
        expect(legacy.ok && legacy.authority).not.toHaveProperty("api_identity_digest");
        /* a record that names one is checked whether or not the caller requires it */
        const named = make({ record: { program_pins: undefined } });
        expect(verifyIsolatedFixtureAuthorityV2(named.env({ SUPABASE_URL: "http://127.0.0.1:56103" }), {
            ...named.options(), program: { fixture: I.fixture, operation: "run", suite: I.suite, npm_script: I.npm_script, script_body: I.script_body },
            org: { id: "00000000-0000-4000-8000-000000000001", key: "certification_seed", source: "seed_manifest" },
        } as never)).toEqual({ ok: false, code: API.MISMATCH });
    });

    it("the historical draft refuses a swapped API port too", async () => {
        const s = make({ program: H, operation: "ensure" });
        await refusedEverywhere(s, s.env({ SUPABASE_URL: "http://127.0.0.1:56103", NEXT_PUBLIC_SUPABASE_URL: undefined }), API.MISMATCH, H);
    });

    it("an accepted verdict carries the identity's digest and its exact origin, both programs", () => {
        const s = make();
        expect(verify(s.env(), s.options())).toMatchObject({ ok: true, authority: { api_url: SYNTHETIC_API_URL, api_identity_digest: syntheticApiIdentity().digest } });
        const t = make();
        expect(verify(t.env({ SUPABASE_URL: `${SYNTHETIC_API_URL}/` }), t.options())).toMatchObject({ ok: true, authority: { api_url: SYNTHETIC_API_URL } });
        const h = make({ program: H, operation: "verify" });
        expect(verify(h.env(), h.options({ program: H, operation: "verify" }))).toMatchObject({ ok: true, authority: { api_url: SYNTHETIC_API_URL, api_identity_digest: syntheticApiIdentity().digest } });
    });
});

describe("THE GATE: the exact configuration, frozen and attested immediately before the client", () => {
    const gate = (s: Store, over: Record<string, unknown> = {}, connect: (c: { url: string; clientEnv: Record<string, string | undefined>; apiOrigin?: string }) => unknown = (c) => c) =>
        runAttestedFinancialsConnection(s.env(), { ...s.options(), program: I, operation: "run", url: SYNTHETIC_DB_URL, clientEnv: s.env(), apiOrigin: SYNTHETIC_API_URL, connect, ...over } as never);

    it("connect receives exactly the attested, frozen copy", async () => {
        const s = make();
        const g = await gate(s) as { ok: boolean; authority: { api_identity_digest: string }; result: { url: string; apiOrigin: string; clientEnv: object } };
        expect(g.ok).toBe(true);
        expect(g.result).toMatchObject({ url: SYNTHETIC_DB_URL, apiOrigin: SYNTHETIC_API_URL });
        expect(Object.isFrozen(g.result) && Object.isFrozen(g.result.clientEnv)).toBe(true);
        expect(g.authority.api_identity_digest).toBe(syntheticApiIdentity().digest);
    });

    it.each([
        ["a swapped API port inside the block", { apiOrigin: "http://127.0.0.1:56103" }, API.MISMATCH],
        ["another environment's API", { apiOrigin: "http://127.0.0.1:56112" }, API.MISMATCH],
        ["the shared API", { apiOrigin: "http://127.0.0.1:54421" }, API.SHARED],
        ["no API origin handed over", { apiOrigin: undefined }, API.ABSENT],
        ["a client env carrying PGPORT", { clientEnv: { PGPORT: "54422" } }, "connection_target_client_env_override"],
        ["another database URL", { url: "postgresql://postgres:SYNTHETIC-DB-SENTINEL@127.0.0.1:56111/postgres" }, "database_identity_mismatch"],
    ])("%s → refused, connect never called", async (_l, over, code) => {
        const s = make();
        let called = 0;
        const g = await gate(s, over, () => { called += 1; });
        expect(g).toMatchObject({ ok: false, code });
        expect(called).toBe(0);
    });

    it.each([
        ["held since the first check", (s: Store) => s.writeHold(syntheticHoldRecord(SYNTHETIC_ENVIRONMENT, { state: "held", revision: 2, previous_sha256: s.hold.record_sha256 })), "target_hold_held"],
        ["changed since the first check", (s: Store) => s.writeHold(syntheticHoldRecord(SYNTHETIC_ENVIRONMENT, { revision: 2, previous_sha256: s.hold.record_sha256 })), "target_hold_changed_since_issue"],
        ["unavailable at the gate", (s: Store) => s.writeHold("{not json"), "target_hold_store_unavailable"],
        ["missing at the gate", (s: Store) => s.writeHold(null), "target_hold_record_absent"],
        ["the request completed since the first check", (s: Store) => s.writeRequest({ state: "complete" }), A.PROVENANCE],
    ])("the hold / request %s → the gate refuses, connect never called", async (_l, mutate, code) => {
        const s = make();
        expect(verify(s.env(), s.options()).ok).toBe(true);
        mutate(s);
        let called = 0;
        expect(await gate(s, {}, () => { called += 1; })).toMatchObject({ ok: false, code });
        expect(called).toBe(0);
    });

    it("a post-check rewrite of the caller's objects cannot reach the client; the frozen copy cannot be rewritten", async () => {
        const s = make();
        const clientEnv: Record<string, string | undefined> = s.env();
        const g = await runAttestedFinancialsConnection(s.env(), {
            ...s.options(), program: I, operation: "run", url: SYNTHETIC_DB_URL, clientEnv, apiOrigin: SYNTHETIC_API_URL,
            connect: (c: { url: string; clientEnv: Record<string, string | undefined>; apiOrigin?: string }) => {
                clientEnv.PGPORT = "54422";
                clientEnv.CERT_SUPABASE_URL = "http://127.0.0.1:54421";
                expect(() => { (c as { apiOrigin?: string }).apiOrigin = "http://127.0.0.1:56103"; }).toThrow(TypeError);
                expect(() => { c.clientEnv.PGPORT = "54422"; }).toThrow(TypeError);
                return { apiOrigin: c.apiOrigin, pg: c.clientEnv.PGPORT };
            },
        } as never) as { ok: boolean; result: unknown };
        expect(g).toMatchObject({ ok: true, result: { apiOrigin: SYNTHETIC_API_URL, pg: undefined } });
    });

    it("the runner hands its child exactly the attested configuration; a hold changed between its check and its spawn starts nothing", async () => {
        const s = make();
        const seen: Array<Record<string, string | undefined>> = [];
        const out: string[] = [];
        const exit = await isolatedMain({
            env: { ...s.env(), SUPABASE_SERVICE_ROLE_KEY: SENTINEL }, argv: [], out: (l: string) => out.push(l), authority: s.options(),
            run: async (_f: string[], env: Record<string, string | undefined>) => { seen.push(env); return { code: 1 }; },
        });
        expect(exit).toBe(1);
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ CERT_SUPABASE_URL: SYNTHETIC_API_URL, DATABASE_URL: SYNTHETIC_DB_URL, CATALOG_LIVE_ISOLATED: "1" });
        expect(out.join("\n")).toContain(`api=${syntheticApiIdentity().digest.slice(0, 12)}`);

        const t = make();
        let holdReads = 0;
        const readFile = (p: string) => {
            if (p.endsWith(`target-holds/${SYNTHETIC_ENVIRONMENT}.json`) && ++holdReads > 1) return JSON.stringify(syntheticHoldRecord(SYNTHETIC_ENVIRONMENT, { state: "held", revision: 2, previous_sha256: t.hold.record_sha256 }));
            return readFileSync(p, "utf8");
        };
        let ran = 0;
        const out2: string[] = [];
        const exit2 = await isolatedMain({ env: t.env(), argv: [], out: (l: string) => out2.push(l), authority: t.options({ readFile }), run: async () => { ran += 1; return { code: 0 }; } });
        expect(holdReads).toBe(2);
        expect(exit2).toBe(2);
        expect(ran).toBe(0);
        expect(out2.join("\n")).toMatch(/refused before any process: target_hold_held/);
    });

    it("the historical draft builds its client only after the gate, from the attested origin", async () => {
        const t = make({ program: H, operation: "ensure" });
        let holdReads = 0;
        const readFile = (p: string) => {
            if (p.endsWith(`target-holds/${SYNTHETIC_ENVIRONMENT}.json`) && ++holdReads > 1) return "{not json";
            return readFileSync(p, "utf8");
        };
        const out: string[] = [];
        const exit = await historicalMain({ ...t.env(), SUPABASE_SERVICE_ROLE_KEY: SENTINEL } as never, ["--ensure"], (l) => out.push(l), t.options({ readFile }));
        expect(exit).toBe(2);
        expect(clients.created).toBe(0);
        expect(out.join("\n")).toMatch(/refused before any IO: target_hold_store_unavailable/);
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

describe("program pins (the non-SQL v2 variant): this candidate, this script, these exact artifacts", () => {
    const pins = (program: typeof I | typeof H, over: Record<string, unknown> = {}, redigest = true) => {
        const p = syntheticProgramPins(program, SYNTHETIC_HEAD, over);
        if (redigest) p.digest = programPinsDigest(p as never);
        return p;
    };
    const withPins = (p: unknown, program: typeof I | typeof H = I) =>
        make({ program, operation: program === H ? "ensure" : "run", record: { program_pins: p } });

    it("a record without program pins (an SQL-variant or pre-adoption record) → refused", async () => {
        const s = withPins(undefined);
        await refusedEverywhere(s, s.env(), A.PINS_ABSENT);
    });

    it.each([
        ["the SQL variant", { variant: "sql" }],
        ["a program variant that also names SQL", { sql: { path: "web/x.sql", sha256: "a".repeat(64) } }],
        ["no artifacts", { artifacts: [] }],
        ["33 artifacts", { artifacts: Array.from({ length: 33 }, (_, i) => ({ role: "program", path: `web/f${i}.ts`, sha256: "a".repeat(64) })) }],
        ["a traversal path", { artifacts: [{ role: "entry", path: "web/../../etc/passwd", sha256: "a".repeat(64) }] }],
        ["an absolute path", { artifacts: [{ role: "entry", path: "/etc/passwd", sha256: "a".repeat(64) }] }],
        ["a duplicate path", { artifacts: [{ role: "entry", path: "web/a.ts", sha256: "a".repeat(64) }, { role: "program", path: "web/a.ts", sha256: "b".repeat(64) }] }],
    ])("%s → invalid", async (_l, over) => {
        const s = withPins(pins(I, over));
        await refusedEverywhere(s, s.env(), A.PINS_INVALID);
    });

    it("a digest that does not recompute (an edited artifact list) → digest mismatch", async () => {
        const p = pins(I);
        (p.artifacts as Array<{ sha256: string }>)[0].sha256 = "f".repeat(64);
        const s = withPins(p);
        await refusedEverywhere(s, s.env(), A.PINS_DIGEST);
    });

    it("pins for another candidate → candidate mismatch", async () => {
        const s = withPins(pins(I, { candidate_sha: "d".repeat(40) }));
        await refusedEverywhere(s, s.env(), A.PINS_CANDIDATE);
    });

    it("pins for another script body → script mismatch", async () => {
        const s = withPins(pins(I, { script_sha256: sha("node scripts/qa/somethingElse.mjs") }));
        await refusedEverywhere(s, s.env(), A.PINS_SCRIPT);
    });

    it("pins that omit a required artifact (the authority verifier) → required artifact absent", async () => {
        const p = pins(I);
        p.artifacts = (p.artifacts as Array<{ path: string }>).filter((x) => x.path !== "web/scripts/qa/isolatedFixtureAuthorityV2.mjs");
        p.digest = programPinsDigest(p as never);
        const s = withPins(p);
        expect(verify(s.env(), s.options())).toMatchObject({ ok: false, code: A.PINS_REQUIRED, fields: ["web/scripts/qa/isolatedFixtureAuthorityV2.mjs"] });
        await refusedEverywhere(s, s.env(), A.PINS_REQUIRED);
    });

    it("the isolated program's pins do not satisfy the historical program", async () => {
        const s = make({ program: H, operation: "ensure", record: { program_pins: pins(H, { script_sha256: sha(I.script_body) }) } });
        await refusedEverywhere(s, s.env(), A.PINS_SCRIPT, H);
    });

    it("an artifact whose bytes here differ from its pin (code changed after pinning) → artifact mismatch, by path", () => {
        const s = make();
        const v = verify(s.env(), s.options({ readArtifact: (rel: string) => (rel.endsWith("catalogAddCharge.live.test.ts") ? "edited" : readFileSync(join(process.cwd(), "..", rel))) }));
        expect(v).toEqual({ ok: false, code: A.PINS_ARTIFACT, fields: ["web/tests/financials/live/catalogAddCharge.live.test.ts"] });
    });

    it("an artifact absent here → artifact mismatch", () => {
        const s = make();
        const v = verify(s.env(), s.options({ readArtifact: (rel: string) => { if (rel.endsWith("vitest.config.ts")) throw new Error("ENOENT"); return readFileSync(join(process.cwd(), "..", rel)); } }));
        expect(v).toMatchObject({ ok: false, code: A.PINS_ARTIFACT, fields: ["web/vitest.config.ts"] });
    });

    it("the required artifact lists name each program's entry and both verifier files", () => {
        for (const [fixture, list] of Object.entries(FINANCIALS_REQUIRED_ARTIFACTS)) {
            const roles = list.map((a) => `${a.role}:${a.path}`);
            expect(roles, fixture).toContain("authority_verifier:web/scripts/qa/financialsFixtureAuthority.mjs");
            expect(roles, fixture).toContain("authority_verifier:web/scripts/qa/isolatedFixtureAuthorityV2.mjs");
            expect(list.filter((a) => a.role === "entry"), fixture).toHaveLength(1);
        }
    });
});
