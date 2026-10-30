/**
 * THE FINANCIALS QA-BOUND FIXTURES, LOCALLY — synthetic environments and the in-memory store only.
 *
 * `test:qa:financials-isolated` and `dev:qa:financials-historical-draft-fixture` are run by
 * Vacilando's isolated executor against a leased certenv. Nothing here connects anywhere: it proves
 * the parts that must hold BEFORE that run can be trusted —
 *
 *   · the binding is exact, and an absent or forbidden target is refused before any IO, with the
 *     credential never echoed;
 *   · a skipped, missing or empty pinned suite is never counted as proof;
 *   · the historical draft keeps its template identity next to a same-name Catalog item, identity is
 *     never matched by name, and reset is bounded to the namespace and never removes ledger.
 */
import { createHash } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* The planted sentinel: every failure path below is made to carry it, and no output may. */
const SENTINEL = vi.hoisted(() => "sk_synthetic_never_print_0123456789abcdef");
const spawned = vi.hoisted(() => ({ calls: 0 }));
vi.mock("node:child_process", async (orig) => ({
    ...(await orig<typeof import("node:child_process")>()),
    spawn: vi.fn(() => {
        spawned.calls += 1;
        throw new Error(`spawn refused in this suite: ${SENTINEL}`);
    }),
}));
const clients = vi.hoisted(() => ({ created: 0, impl: null as null | (() => unknown) }));
vi.mock("@supabase/supabase-js", async (orig) => ({
    ...(await orig<typeof import("@supabase/supabase-js")>()),
    createClient: vi.fn(() => {
        clients.created += 1;
        if (clients.impl) return clients.impl();
        throw new Error(`no client may be created in this suite: ${SENTINEL}`);
    }),
}));

import pkg from "../../package.json";
import {
    BINDING_REFUSALS,
    FINANCIALS_CERT_NAMESPACE,
    readIsolatedBinding,
} from "../../scripts/qa/financialsIsolatedBinding.mjs";
import { main as historicalMain } from "../../scripts/qa/financialsHistoricalDraftFixture";
import {
    BUSINESS_DATE,
    censusHistoricalDraft,
    CATALOG_AMOUNT_CENTS,
    CHILD_EMAIL,
    ensureHistoricalDraft,
    FEE_LABEL,
    HOUSEHOLD_NAME,
    IDS,
    NAMESPACE,
    plannedRows,
    RESET_LIMIT,
    resetHistoricalDraft,
    TEMPLATE_AMOUNT_CENTS,
    verifyHistoricalDraft,
} from "../../scripts/qa/financialsHistoricalDraftFixtureCore";
import {
    FINANCIALS_ISOLATED_SUITE,
    main as isolatedMain,
    main as isolatedMainUnderTest,
    suiteChildEnv,
    summarizeVitestReport,
} from "../../scripts/qa/financialsIsolatedTests.mjs";
import { FINANCIALS_FIXTURE_ORG, FINANCIALS_HISTORICAL_DRAFT_PROGRAM, FIXTURE_AUTHORITY_REFUSALS as AUTH } from "../../scripts/qa/financialsFixtureAuthority.mjs";
import { SYNTHETIC_PERSONA_ORG, syntheticExecutorStore } from "../harness/syntheticFixtureAuthority";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

/* A synthetic credential: if it ever appears in output, the suite fails. */
const SECRET = SENTINEL;

/* The historical fixture acts in the run persona's org (A741: QA Shared), passed in — never a core constant. */
const ORG = SYNTHETIC_PERSONA_ORG;

/* The historical entry under a live synthetic executor authority for exactly this operation. */
const historicalStores: Array<{ cleanup: () => void }> = [];
afterAll(() => historicalStores.forEach((s) => s.cleanup()));
function historicalUnderAuthority(op: string, over: Record<string, string | undefined>, argv: string[], out: (l: string) => void) {
    const operation = FINANCIALS_HISTORICAL_DRAFT_PROGRAM.operations.includes(op) ? op : "ensure";
    const s = syntheticExecutorStore({ program: FINANCIALS_HISTORICAL_DRAFT_PROGRAM, operation });
    historicalStores.push(s);
    return historicalMain({ ...s.env(), SUPABASE_SERVICE_ROLE_KEY: SECRET, ...over } as never, argv, out, s.options());
}

function boundEnv(fixture: string, operation: string, over: Record<string, string | undefined> = {}) {
    return {
        NODE_ENV: "test",
        SUPABASE_URL: "http://127.0.0.1:56102",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56102",
        SUPABASE_SERVICE_ROLE_KEY: SECRET,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon_synthetic",
        ALLOY_QA_RUN_ID: "qar_0123456789ab",
        ALLOY_QA_ENVIRONMENT_ID: "certenv-0123456789",
        ALLOY_QA_PERSONA: "finance_admin",
        ALLOY_CERT_NAMESPACE: FINANCIALS_CERT_NAMESPACE,
        ALLOY_CERT_FIXTURE: fixture,
        ALLOY_CERT_OPERATION: operation,
        ...over,
    };
}

beforeEach(() => {
    spawned.calls = 0;
    clients.created = 0;
    clients.impl = null;
});

describe("the isolated QA binding", () => {
    const judge = (over: Record<string, string | undefined>, argv: string[] = []) =>
        readIsolatedBinding({ env: boundEnv("financials_isolated_tests", "run", over), fixture: "financials_isolated_tests", operation: "run", argv });

    it("accepts exactly the executor's contract and reports host:port only", () => {
        const r = judge({});
        expect(r).toMatchObject({
            ok: true,
            binding: { qaRunId: "qar_0123456789ab", environmentId: "certenv-0123456789", persona: "finance_admin", target: { host: "127.0.0.1", port: 56102 } },
        });
        expect(JSON.stringify(r)).not.toContain(SECRET);
    });

    it.each([
        ["production runtime", { NODE_ENV: "production" }, BINDING_REFUSALS.PRODUCTION_RUNTIME],
        ["Vercel runtime", { VERCEL: "1" }, BINDING_REFUSALS.PRODUCTION_RUNTIME],
        ["another fixture", { ALLOY_CERT_FIXTURE: "tours_certification" }, BINDING_REFUSALS.FIXTURE],
        ["another operation", { ALLOY_CERT_OPERATION: "reset" }, BINDING_REFUSALS.OPERATION],
        ["another namespace", { ALLOY_CERT_NAMESPACE: "tours-cert.alloy.invalid" }, BINDING_REFUSALS.NAMESPACE],
        ["no QA run", { ALLOY_QA_RUN_ID: undefined }, BINDING_REFUSALS.QA_RUN],
        ["a malformed QA run", { ALLOY_QA_RUN_ID: "qar_x" }, BINDING_REFUSALS.QA_RUN],
        ["no environment", { ALLOY_QA_ENVIRONMENT_ID: undefined }, BINDING_REFUSALS.ENVIRONMENT],
        ["the shared stack as environment", { ALLOY_QA_ENVIRONMENT_ID: "alloy-cert" }, BINDING_REFUSALS.ENVIRONMENT],
        ["no persona", { ALLOY_QA_PERSONA: undefined }, BINDING_REFUSALS.PERSONA],
        ["no target", { SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_URL: undefined }, BINDING_REFUSALS.TARGET_ABSENT],
        ["a hosted project", { SUPABASE_URL: "https://abcdefgh.supabase.co", NEXT_PUBLIC_SUPABASE_URL: undefined }, BINDING_REFUSALS.TARGET_FORBIDDEN],
        ["the shared alloy-cert API", { SUPABASE_URL: "http://127.0.0.1:54421", NEXT_PUBLIC_SUPABASE_URL: undefined }, BINDING_REFUSALS.TARGET_FORBIDDEN],
        ["the default local stack", { SUPABASE_URL: "http://localhost:54321", NEXT_PUBLIC_SUPABASE_URL: undefined }, BINDING_REFUSALS.TARGET_FORBIDDEN],
        ["a disagreeing public URL", { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56112" }, BINDING_REFUSALS.TARGET_FORBIDDEN],
        ["a pre-set suite target elsewhere", { CERT_SUPABASE_URL: "http://127.0.0.1:54421" }, BINDING_REFUSALS.TARGET_FORBIDDEN],
        ["the shared certification database", { DATABASE_URL: `postgresql://postgres:${SECRET}@127.0.0.1:54422/postgres` }, BINDING_REFUSALS.DATABASE_FORBIDDEN],
        ["a hosted database", { DATABASE_URL: `postgresql://postgres:${SECRET}@db.example.com:5432/postgres` }, BINDING_REFUSALS.DATABASE_FORBIDDEN],
        ["no service credential", { SUPABASE_SERVICE_ROLE_KEY: "" }, BINDING_REFUSALS.CREDENTIAL_ABSENT],
    ])("refuses %s", (_label, over, code) => {
        const r = judge(over);
        expect(r).toMatchObject({ ok: false, code });
        expect(JSON.stringify(r)).not.toContain(SECRET);
    });

    it("accepts the certenv database URL in its band", () => {
        expect(judge({ DATABASE_URL: `postgresql://postgres:${SECRET}@127.0.0.1:56104/postgres` }).ok).toBe(true);
    });

    it("refuses any argument vector but the registered one", () => {
        expect(judge({}, ["--watch"])).toMatchObject({ ok: false, code: BINDING_REFUSALS.ARGV });
        const draft = (op: string, argv: string[]) =>
            readIsolatedBinding({ env: boundEnv("financials_historical_draft", op), fixture: "financials_historical_draft", operation: op, argv });
        expect(draft("ensure", ["--ensure"]).ok).toBe(true);
        expect(draft("reset", ["--reset", "--all"])).toMatchObject({ ok: false, code: BINDING_REFUSALS.ARGV });
        expect(draft("reset", ["--verify"])).toMatchObject({ ok: false, code: BINDING_REFUSALS.ARGV });
    });
});

describe("test:qa:financials-isolated", () => {
    it("is registered as the toolkit names it, and pins the existing catalog live suite", () => {
        expect(pkg.scripts["test:qa:financials-isolated"]).toBe("node scripts/qa/financialsIsolatedTests.mjs");
        expect(FINANCIALS_ISOLATED_SUITE).toEqual(["tests/financials/live/catalogAddCharge.live.test.ts"]);
    });

    it("refuses an absent target before any process starts, and prints no credential", async () => {
        const out: string[] = [];
        const code = await isolatedMain({ env: boundEnv("financials_isolated_tests", "run", { SUPABASE_URL: "http://127.0.0.1:54421", NEXT_PUBLIC_SUPABASE_URL: undefined }), argv: [], out: (l: string) => out.push(l) });
        expect(code).toBe(2);
        expect(spawned.calls).toBe(0);
        expect(out.join("\n")).toMatch(/refused before any IO: supabase_target_forbidden/);
        expect(out.join("\n")).toContain("tests passed=0 failed=0");
        expect(out.join("\n")).not.toContain(SECRET);
    });

    it("hands the suite the bound target and the bound seed org under the suite's own isolated-env names", () => {
        const env = suiteChildEnv(boundEnv("financials_isolated_tests", "run", { ALLOY_CERT_FIXTURE_ORG_ID: "00000000-0000-4000-8000-000000000001" }));
        expect(env).toMatchObject({ CATALOG_LIVE_ISOLATED: "1", CERT_SUPABASE_URL: "http://127.0.0.1:56102", CERT_SERVICE_ROLE_KEY: SECRET, CERT_FIXTURE_ORG_ID: "00000000-0000-4000-8000-000000000001" });
    });

    it("a complete binding WITHOUT the executor's live authority is refused before any process starts", async () => {
        const out: string[] = [];
        const code = await isolatedMain({ env: boundEnv("financials_isolated_tests", "run"), argv: [], out: (l: string) => out.push(l) });
        expect(code).toBe(2);
        expect(spawned.calls).toBe(0);
        expect(out).toEqual(["✗ refused before any process: fixture_authority_absent", "tests passed=0 failed=0"]);
    });

    it("a forged / completed / wrong-candidate authority is refused before any process starts — codes and field names only", async () => {
        const s = syntheticExecutorStore();
        try {
            const run = async (env: Record<string, string | undefined>, authority: Record<string, unknown>) => {
                const out: string[] = [];
                const code = await isolatedMain({ env: { ...env, SUPABASE_SERVICE_ROLE_KEY: SECRET }, argv: [], out: (l: string) => out.push(l), authority });
                return { code, out };
            };
            const noRoot = await run(s.env(), { ...s.options(), storeRoot: null });
            expect(noRoot.out[0]).toBe("✗ refused before any process: fixture_authority_store_root_untrusted");
            const wrongHead = await run(s.env(), s.options({ readHead: () => "d".repeat(40) }));
            expect(wrongHead.out[0]).toBe("✗ refused before any process: fixture_authority_mismatch fields=candidate_sha");
            s.writeRequest({ state: "complete" });
            const replay = await run(s.env(), s.options());
            expect(replay.out[0]).toBe("✗ refused before any process: fixture_authority_no_live_request");
            for (const r of [noRoot, wrongHead, replay]) {
                expect(r.code).toBe(2);
                expect(r.out.join("\n")).not.toContain(SECRET);
            }
            expect(spawned.calls).toBe(0);
        } finally {
            s.cleanup();
        }
    });

    const file = (assertionResults: Array<{ status: string; fullName?: string }>, status = "passed", name = `/w/${FINANCIALS_ISOLATED_SUITE[0]}`) => ({ name, status, assertionResults });
    const summarize = (testResults: unknown[]) => summarizeVitestReport({ testResults }, FINANCIALS_ISOLATED_SUITE, "/w");

    it("counts a fully passing pinned suite as proof", () => {
        expect(summarize([file([{ status: "passed", fullName: "a" }, { status: "passed", fullName: "b" }])])).toMatchObject({ ok: true, passed: 2, failed: 0, skipped: 0 });
    });

    it.each([
        ["the suite skipped itself (no target reached it)", [file([{ status: "skipped" }, { status: "skipped" }], "skipped")], /^tests_not_run count=2$/m],
        ["one test is pending", [file([{ status: "passed" }, { status: "pending" }])], /^tests_not_run count=1$/m],
        ["one test failed", [file([{ status: "passed" }, { status: "failed" }], "failed")], /^tests_failed count=1$/m],
        ["the suite failed to load", [file([], "failed")], /^tests_failed count=1$/m],
        ["the pinned file reported nothing", [], /^pinned_file_reported_nothing file=catalogAddCharge\.live$/m],
        ["an unpinned file ran", [file([{ status: "passed" }]), file([{ status: "passed" }], "passed", "/w/tests/other.test.ts")], /^unpinned_file_ran count=1$/m],
    ])("is NOT proof when %s", (_label, results, why) => {
        const s = summarize(results as unknown[]);
        expect(s.ok).toBe(false);
        expect(s.problems.join("\n")).toMatch(why);
    });

    it("is NOT proof when vitest wrote no report", () => {
        expect(summarizeVitestReport(null)).toMatchObject({ ok: false, problems: ["vitest_report_absent"] });
    });
});

/* ── the historical draft fixture, over the in-memory store ─────────────────────────────────── */

const NEIGHBOUR = "11111111-0000-4000-8000-000000000001";

function setup(extra: Record<string, Array<Record<string, unknown>>> = {}) {
    const store = createOperationalEnrollmentMockStore({
        child_enrollment_agreements: [],
        customer_members: [],
        financial_policies: [],
    }) as unknown as Record<string, Array<Record<string, unknown>>>;
    Object.assign(store, {
        orgs: [{ id: ORG }],
        /* A real household of the same tenant: no fixture operation may touch it. */
        customers: [{ id: NEIGHBOUR, org_id: ORG, name: "Neighbour household", external_source: null, external_id: null, metadata: {} }],
        gl_account_mappings: [],
        financial_journal_entries: [],
    });
    for (const [table, rows] of Object.entries(extra)) store[table] = [...(store[table] ?? []), ...rows];
    const db = createOperationalEnrollmentMockSupabase(store as never);
    return { store, db };
}

const fixtureDrafts = (store: Record<string, Array<Record<string, unknown>>>) =>
    store.charges.filter((c) => c.billable_source_id === IDS.agreement);

describe("dev:qa:financials-historical-draft-fixture", () => {
    afterEach(() => vi.restoreAllMocks());

    it("is registered as the toolkit names it", () => {
        expect(pkg.scripts["dev:qa:financials-historical-draft-fixture"]).toBe("tsx --tsconfig tsconfig.json scripts/qa/financialsHistoricalDraftFixture.ts");
        expect(NAMESPACE).toBe(FINANCIALS_CERT_NAMESPACE);
        expect(RESET_LIMIT).toBe(50);
    });

    it("ensure writes ONE template draft beside a same-name offerable Catalog item, and verify proves its identity", async () => {
        const { store, db } = setup();
        const r = await ensureHistoricalDraft(db as never, ORG);
        expect(r.checks.filter((c) => !c.ok)).toEqual([]);
        expect(r.exitCode).toBe(0);
        const drafts = fixtureDrafts(store);
        expect(drafts).toHaveLength(1);
        expect(drafts[0]).toMatchObject({ status: "draft", charge_template_id: IDS.template, amount_cents: TEMPLATE_AMOUNT_CENTS });
        expect(drafts[0].metadata).toMatchObject({ source: "charge_template", charge_template_key: "fincert_hist_registration" });
        expect((drafts[0].metadata as Record<string, unknown>).catalog_item).toBeUndefined();
        expect(store.commercial_products.find((p) => p.id === IDS.sameNameProduct)).toMatchObject({ name: FEE_LABEL, amount_cents: CATALOG_AMOUNT_CENTS });
        expect(store.persons.find((p) => p.id === IDS.person)?.email).toBe(CHILD_EMAIL);
        expect(r.checks.map((c) => c.check)).toContain("the draft is edited under its template, not the same-name Catalog item");
    });

    it("ensure is idempotent: a second run writes nothing new", async () => {
        const { store, db } = setup();
        await ensureHistoricalDraft(db as never, ORG);
        const before = JSON.stringify(store);
        const again = await ensureHistoricalDraft(db as never, ORG);
        expect(again.exitCode).toBe(0);
        expect(again.lines).toContain(`seeded 0 of ${plannedRows().length} fixture row(s)`);
        expect(fixtureDrafts(store)).toHaveLength(1);
        expect(JSON.stringify(store.charges)).toBe(JSON.stringify(JSON.parse(before).charges));
    });

    it("verify FAILS when the draft has been re-pointed at the same-name Catalog item", async () => {
        const { store, db } = setup();
        await ensureHistoricalDraft(db as never, ORG);
        const draft = fixtureDrafts(store)[0];
        Object.assign(draft, { charge_template_id: null, metadata: { ...(draft.metadata as object), catalog_item: { product_id: IDS.sameNameProduct } } });
        const v = await verifyHistoricalDraft(db as never, ORG);
        expect(v.exitCode).toBe(1);
        expect(v.checks.filter((c) => !c.ok).map((c) => c.check)).toEqual(expect.arrayContaining([
            "the draft records its template id",
            "the draft carries no Catalog provenance",
            "the draft is edited under its template, not the same-name Catalog item",
        ]));
    });

    it.each([
        ["a same-named household outside the fixture", { customers: [{ id: "22222222-0000-4000-8000-000000000001", org_id: ORG, name: HOUSEHOLD_NAME, metadata: {} }] }, /household\(s\) outside the fixture carry its name/],
        ["a second household bound to the namespace", { customers: [{ id: "22222222-0000-4000-8000-000000000002", org_id: ORG, name: "x", external_source: NAMESPACE, external_id: "other", metadata: {} }] }, /other household\(s\) are bound/],
        ["another template with the fixture's key", { financial_charge_templates: [{ id: "tpl-other", org_id: ORG, template_key: "fincert_hist_registration", label: "x", metadata: {} }] }, /carry its template_key/],
        ["a same-named Catalog item outside the fixture", { commercial_products: [{ id: "p-other", org_id: ORG, name: FEE_LABEL, metadata: {} }] }, /Catalog item\(s\) outside the fixture/],
        ["a non-fixture row at a fixture id", { customers: [{ id: IDS.customer, org_id: ORG, name: "Somebody real", external_source: null, external_id: null, metadata: {} }] }, /already exists and is not the fixture's/],
    ])("ensure refuses %s as an identity conflict, writing nothing", async (_label, extra, why) => {
        const { store, db } = setup(extra);
        const before = JSON.stringify(store);
        const r = await ensureHistoricalDraft(db as never, ORG);
        expect(r.exitCode).toBe(3);
        expect(r.checks[0].check).toMatch(/^identity conflict/);
        expect(r.checks[0].check).toMatch(why);
        expect(JSON.stringify(store)).toBe(before);
    });

    it("reset removes only the fixture, bounded, reported in the executor's line — and is idempotent", async () => {
        const { store, db } = setup();
        await ensureHistoricalDraft(db as never, ORG);
        const r = await resetHistoricalDraft(db as never, ORG);
        expect(r.exitCode).toBe(0);
        expect(r.removed).toBeGreaterThan(0);
        expect(r.removed).toBeLessThanOrEqual(RESET_LIMIT);
        expect(r.lines).toEqual([`reset namespace=${NAMESPACE} removed=${r.removed}`]);
        for (const p of plannedRows()) expect(store[p.table].some((row) => row.id === p.id), `${p.table} ${p.id}`).toBe(false);
        expect(fixtureDrafts(store)).toHaveLength(0);
        expect(store.financial_billing_periods.filter((bp) => bp.customer_id === IDS.customer)).toHaveLength(0);
        expect(store.customers.map((c) => c.id)).toEqual([NEIGHBOUR]);

        const again = await resetHistoricalDraft(db as never, ORG);
        expect(again).toMatchObject({ exitCode: 0, removed: 0, lines: [`reset namespace=${NAMESPACE} removed=0`] });
    });

    it.each([
        ["a POSTED charge on the fixture agreement", (store: Record<string, Array<Record<string, unknown>>>) => {
            store.charges.push({ id: "posted-1", org_id: ORG, billable_source_id: IDS.agreement, status: "posted", metadata: {} });
        }, /posted\/void charge/],
        ["a charge elsewhere made from the fixture template", (store: Record<string, Array<Record<string, unknown>>>) => {
            store.charges.push({ id: "foreign-1", org_id: ORG, billable_source_id: NEIGHBOUR, charge_template_id: IDS.template, status: "draft", metadata: {} });
        }, /outside the fixture use the fixture template/],
        ["a payment on the fixture household", (store: Record<string, Array<Record<string, unknown>>>) => {
            store.payments.push({ id: "pay-1", org_id: ORG, customer_id: IDS.customer });
        }, /payments row/],
        ["a journal entry on the fixture household", (store: Record<string, Array<Record<string, unknown>>>) => {
            store.financial_journal_entries.push({ id: "je-1", org_id: ORG, customer_id: IDS.customer });
        }, /financial_journal_entries row/],
        ["a closed billing period on the fixture household", (store: Record<string, Array<Record<string, unknown>>>) => {
            store.financial_billing_periods.push({ id: "bp-closed", org_id: ORG, customer_id: IDS.customer, status: "closed" });
        }, /closed billing period/],
    ])("reset refuses %s and removes nothing", async (_label, plant, why) => {
        const { store, db } = setup();
        await ensureHistoricalDraft(db as never, ORG);
        plant(store);
        const before = JSON.stringify(store);
        const r = await resetHistoricalDraft(db as never, ORG);
        expect(r.exitCode).toBe(1);
        expect(r.removed).toBe(0);
        expect(r.checks[0].check).toMatch(why);
        expect(r.lines).toEqual([`reset namespace=${NAMESPACE} removed=0`]);
        expect(JSON.stringify(store)).toBe(before);
    });

    it(`reset refuses more than ${RESET_LIMIT} rows before the first delete`, async () => {
        const { store, db } = setup();
        await ensureHistoricalDraft(db as never, ORG);
        for (let i = 0; i < RESET_LIMIT; i++) {
            store.charges.push({ id: `draft-extra-${i}`, org_id: ORG, billable_source_id: IDS.agreement, charge_template_id: IDS.template, status: "draft", metadata: {} });
        }
        const before = JSON.stringify(store);
        const r = await resetHistoricalDraft(db as never, ORG);
        expect(r).toMatchObject({ exitCode: 1, removed: 0 });
        expect(r.checks[0].check).toMatch(/exceed the limit of 50/);
        expect(JSON.stringify(store)).toBe(before);
    });

    it("census counts exactly what reset removes, and reads zero after it — measured, not assumed", async () => {
        const { db } = setup();
        expect(await censusHistoricalDraft(db as never, ORG)).toMatchObject({ exitCode: 0, count: 0, lines: ["census count=0"] });
        await ensureHistoricalDraft(db as never, ORG);
        const before = await censusHistoricalDraft(db as never, ORG);
        expect(before.count).toBeGreaterThan(plannedRows().length);
        const reset = await resetHistoricalDraft(db as never, ORG);
        expect(reset.removed).toBe(before.count);
        expect(await censusHistoricalDraft(db as never, ORG)).toMatchObject({ exitCode: 0, count: 0, lines: ["census count=0"] });
    });

    it("census refuses a non-fixture row at a fixture id rather than counting it", async () => {
        const { db } = setup({ customers: [{ id: IDS.customer, org_id: ORG, name: "Somebody real", metadata: {} }] });
        expect(await censusHistoricalDraft(db as never, ORG)).toMatchObject({ exitCode: 3, count: null });
    });

    it("reset refuses a non-fixture row at a fixture id and touches nothing", async () => {
        const { store, db } = setup({ customers: [{ id: IDS.customer, org_id: ORG, name: "Somebody real", metadata: {} }] });
        const before = JSON.stringify(store);
        const r = await resetHistoricalDraft(db as never, ORG);
        expect(r).toMatchObject({ exitCode: 3, removed: 0 });
        expect(JSON.stringify(store)).toBe(before);
    });

    it("the business date is fixed, so a re-run is the same historical draft", () => {
        expect(BUSINESS_DATE).toBe("2026-03-31");
    });

    it.each([
        ["no operation", [], {}],
        ["two operations", ["--ensure", "--reset"], {}],
        ["an absent target", ["--ensure"], { SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_URL: undefined }],
        ["a hosted target", ["--reset"], { SUPABASE_URL: "https://abcdefgh.supabase.co", NEXT_PUBLIC_SUPABASE_URL: undefined }],
        ["the wrong fixture", ["--verify"], { ALLOY_CERT_FIXTURE: "financials_isolated_tests" }],
    ])("the entry refuses %s with exit 2 before any client exists", async (_label, argv, over) => {
        const op = argv[0]?.replace(/^--/, "") ?? "ensure";
        const out: string[] = [];
        const code = await historicalUnderAuthority(op, over, argv, (l) => out.push(l));
        expect(code).toBe(2);
        expect(clients.created).toBe(0);
        expect(out.join("\n")).toMatch(/^✗ refused before any IO/);
        expect(out.join("\n")).not.toContain(SECRET);
    });
});

/* ── the historical fixture's authority and organization: refused before any client exists ──── */

describe("dev:qa:financials-historical-draft-fixture — executor authority and the persona organization", () => {
    const P = FINANCIALS_HISTORICAL_DRAFT_PROGRAM;
    const SEED = FINANCIALS_FIXTURE_ORG.id;
    const live: Array<ReturnType<typeof syntheticExecutorStore>> = [];
    const store = (operation = "ensure", record: Record<string, unknown> = {}) => {
        const s = syntheticExecutorStore({ program: P, operation, record });
        live.push(s);
        return s;
    };
    afterEach(() => {
        while (live.length) live.pop()!.cleanup();
    });
    async function entry(s: ReturnType<typeof store>, op: string, envOver: Record<string, string | undefined> = {}, optOver: Record<string, unknown> = {}) {
        const out: string[] = [];
        const code = await historicalMain({ ...s.env(), SUPABASE_SERVICE_ROLE_KEY: SECRET, ...envOver } as never, [`--${op}`], (l) => out.push(l), s.options(optOver));
        return { code, out };
    }
    const refusedBeforeClient = (r: { code: number; out: string[] }, code: string) => {
        expect(r.code).toBe(2);
        expect(clients.created).toBe(0);
        expect(r.out[0]).toMatch(new RegExp(`^✗ refused before any IO: ${code}( fields=|$)`));
        expect(r.out.join("\n")).not.toContain(SECRET);
        expect(r.out.join("\n")).not.toContain(SEED);
    };

    it("is registered as A741 names it: script, body digest, persona-bound, four operations", () => {
        expect(pkg.scripts[P.npm_script as keyof typeof pkg.scripts]).toBe(P.script_body);
        expect(createHash("sha256").update(P.script_body).digest("hex")).toBe("07f838cf008e519ab1096cd4baf0d2a6fea245ad1e6f6e8eb53655f103e287e8");
        expect(P).toMatchObject({ fixture: "financials_historical_draft", suite: "financials", org_binding: "persona", operations: ["ensure", "verify", "reset", "count"] });
    });

    it("a FORGED environment (complete binding, persona org asserted, no authority record) never reaches a client", async () => {
        const out: string[] = [];
        const code = await historicalMain(boundEnv("financials_historical_draft", "ensure", { ALLOY_CERT_FIXTURE_ORG_ID: ORG, ALLOY_CERT_FIXTURE_ORG_SOURCE: "persona" }) as never, ["--ensure"], (l) => out.push(l));
        refusedBeforeClient({ code, out }, AUTH.ABSENT);
    });

    it("no trusted store root → refused", async () => {
        refusedBeforeClient(await entry(store(), "ensure", {}, { storeRoot: null }), AUTH.UNTRUSTED_ROOT);
    });

    it("a self-consistent record outside the executor's store → refused", async () => {
        const s = store();
        const { mkdtempSync, writeFileSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const dir = mkdtempSync(`${tmpdir()}/forge-hist-`);
        writeFileSync(`${dir}/${s.name}`, s.text);
        refusedBeforeClient(await entry(s, "ensure", { ALLOY_QA_AUTHORITY_FILE: `${dir}/${s.name}` }), AUTH.ORIGIN);
    });

    it("a REPLAY (the request completed) → refused", async () => {
        const s = store();
        s.writeRequest({ state: "complete" });
        refusedBeforeClient(await entry(s, "ensure"), AUTH.PROVENANCE);
    });

    it("authority for one operation does not admit another (verify record, --reset invoked)", async () => {
        const s = store("verify");
        refusedBeforeClient(await entry(s, "reset", { ALLOY_CERT_OPERATION: "reset" }), AUTH.MISMATCH);
    });

    it("the isolated-tests record does not admit the historical program", async () => {
        const s = store("ensure", { fixture: "financials_isolated_tests", operation: "run", npm_script: "test:qa:financials-isolated" });
        refusedBeforeClient(await entry(s, "ensure", { ALLOY_CERT_FIXTURE: "financials_historical_draft", ALLOY_CERT_OPERATION: "ensure" }), AUTH.MISMATCH);
    });

    it("another candidate (record and env agree, HEAD does not) → refused", async () => {
        refusedBeforeClient(await entry(store(), "ensure", {}, { readHead: () => "d".repeat(40) }), AUTH.MISMATCH);
    });

    it.each([
        ["the seed org asserted as seed_manifest (the isolated-tests contract)", { ALLOY_CERT_FIXTURE_ORG_ID: SEED, ALLOY_CERT_FIXTURE_ORG_SOURCE: "seed_manifest" }, {}, {}],
        ["the seed org asserted as persona", { ALLOY_CERT_FIXTURE_ORG_ID: SEED }, {}, {}],
        ["no org at all", { ALLOY_CERT_FIXTURE_ORG_ID: undefined, ALLOY_CERT_FIXTURE_ORG_SOURCE: undefined }, {}, {}],
        ["the secondary QA org while the ledger binds QA Shared", { ALLOY_CERT_FIXTURE_ORG_ID: "ad53fee2-2570-460f-9300-f0e106c473b6" }, {}, {}],
        ["a persona the run did not bind", { ALLOY_QA_PERSONA: "no_finance_operator" }, {}, {}],
        ["a persona with an unregistered org key", {}, {}, { org_key: "firefly" }],
        ["a run that is not OPEN", {}, { state: "CLOSED" }, {}],
        ["a run on another environment", {}, { target: { kind: "local", key: "certenv-ffffffffff" } }, {}],
        ["a hosted run", {}, { target: { kind: "hosted", key: "certenv-0123456789" } }, {}],
    ])("org: %s → refused before any client", async (_l, envOver, runOver, personaOver) => {
        const s = store();
        s.writeRun(runOver, personaOver);
        refusedBeforeClient(await entry(s, "ensure", envOver), AUTH.PERSONA_ORG);
    });

    it("org: no QA-run ledger in the trusted store → refused before any client", async () => {
        const s = store();
        const { rmSync } = await import("node:fs");
        rmSync(s.runsFile);
        refusedBeforeClient(await entry(s, "ensure"), AUTH.PERSONA_ORG);
    });

    it("VERIFIED: the fixture writes only in the ledger-bound persona org, never the seed org", async () => {
        const { store: rows, db } = setup();
        clients.impl = () => db;
        const r = await entry(store(), "ensure");
        expect(r.code).toBe(0);
        expect(clients.created).toBe(1);
        const written = Object.values(rows).flat().filter((x) => x && typeof x === "object" && "org_id" in x) as Array<Record<string, unknown>>;
        expect(written.length).toBeGreaterThan(0);
        expect(written.filter((x) => x.org_id !== ORG)).toEqual([]);
        expect(JSON.stringify(rows)).not.toContain(SEED);
    });

    it("no seed-org fallback: with only the seed org present, the verified persona org is absent and nothing is written", async () => {
        const { store: rows, db } = setup();
        rows.orgs = [{ id: SEED }];
        const before = JSON.stringify(rows);
        clients.impl = () => db;
        const r = await entry(store(), "ensure");
        expect(r.code).toBe(1);
        expect(r.out).toContain(`✗ certification_org_absent org=${ORG}`);
        expect(JSON.stringify(rows)).toBe(before);
    });

    it.each([["the seed org", SEED], ["an empty org", ""], ["a non-UUID", "qa_shared"]])("the core itself refuses %s before any read", async (_l, org) => {
        const { store: rows, db } = setup();
        const before = JSON.stringify(rows);
        await expect(ensureHistoricalDraft(db as never, org)).rejects.toMatchObject({ code: "fixture_org_unbound" });
        await expect(resetHistoricalDraft(db as never, org)).rejects.toMatchObject({ code: "fixture_org_unbound" });
        await expect(censusHistoricalDraft(db as never, org)).rejects.toMatchObject({ code: "fixture_org_unbound" });
        await expect(verifyHistoricalDraft(db as never, org)).rejects.toMatchObject({ code: "fixture_org_unbound" });
        expect(JSON.stringify(rows)).toBe(before);
    });
});

/* ── planted-sentinel failure paths: no backend, process or report text reaches output ────────── */

/*
 * The executor's line grammar, restated from the installed toolkit's
 * lib/isolated-fixture-execution.mjs `parseIsolatedFixtureOutput` (b3c80db2e9aa). Restated, not
 * imported: a product test must not load host toolkit code. Every line a script prints is either
 * one of these structured forms or a plain informational line; none may carry the sentinel.
 */
const GRAMMAR = {
    check: /^\s*([✓✗])\s+(.+)$/,
    census: /^\s*census count=(\d{1,9})\s*$/,
    reset: /^\s*reset namespace=(\S+) removed=(\d{1,9})\s*$/,
    tests: /^\s*tests passed=(\d{1,9}) failed=(\d{1,9})\s*$/,
};

function expectSafeContract(out: string[], { reset = false, tests = false, census = false } = {}) {
    const text = out.join("\n");
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toMatch(/boom|Error:|at .+\(.+:\d+:\d+\)/);
    for (const line of out) {
        const m = GRAMMAR.check.exec(line);
        if (m) expect(m[2].length, line).toBeLessThanOrEqual(200);
    }
    const resets = out.map((l) => GRAMMAR.reset.exec(l)).filter(Boolean) as RegExpExecArray[];
    if (reset) {
        expect(resets).toHaveLength(1);
        expect(resets[0][1]).toBe(NAMESPACE);
        expect(Number(resets[0][2])).toBeLessThanOrEqual(RESET_LIMIT);
    }
    if (tests) expect(out.filter((l) => GRAMMAR.tests.test(l))).toHaveLength(1);
    if (census) expect(out.filter((l) => GRAMMAR.census.test(l))).toHaveLength(1);
    return resets[0] ? Number(resets[0][2]) : null;
}

type Fault = {
    table: string;
    op: "select" | "insert" | "delete";
    /** `error`: a PostgREST-shaped error carrying the sentinel · `throw`: a rejected request · `hook`: run `before`, then pass through. */
    kind: "error" | "throw" | "hook";
    skip?: number;
    before?: () => void;
};

/** The in-memory client with one planted fault. Every fault carries the sentinel. */
function faulty(db: any, fault: Fault) {
    let seen = 0;
    const errorResult = () => ({ data: null, error: { message: `boom ${SENTINEL}`, details: SENTINEL, hint: SENTINEL, code: "XX000" } });
    const fire = (op: string) => op === fault.op && seen++ >= (fault.skip ?? 0);
    const wrap = (target: any, state: { op: string }): any => new Proxy(target, {
        get(t, prop) {
            if (prop === "insert" || prop === "delete" || prop === "update") state.op = prop as string;
            if (prop === "then" || prop === "single" || prop === "maybeSingle") {
                const original = t[prop];
                return (...args: any[]) => {
                    if (fire(state.op)) {
                        if (fault.kind === "hook") fault.before?.();
                        else {
                            const p = fault.kind === "throw" ? Promise.reject(new Error(`boom ${SENTINEL}`)) : Promise.resolve(errorResult());
                            return prop === "then" ? p.then(args[0], args[1]) : p;
                        }
                    }
                    return original.apply(t, args);
                };
            }
            const v = t[prop];
            if (typeof v !== "function") return v;
            return (...a: any[]) => {
                const r = v.apply(t, a);
                return r === t ? wrap(t, state) : r;
            };
        },
    });
    return { ...db, from: (table: string) => (table === fault.table ? wrap(db.from(table), { op: "select" }) : db.from(table)) };
}

async function runEntry(op: "ensure" | "verify" | "reset" | "count", db: unknown) {
    clients.impl = () => db;
    const out: string[] = [];
    const code = await historicalUnderAuthority(op, {}, [`--${op}`], (l) => out.push(l));
    return { code, out };
}

describe("no backend or process text reaches the historical fixture's output", () => {
    it.each([
        ["an org read error", { table: "orgs", op: "select", kind: "error" }, "✗ ensure failed: read_failed table=orgs sqlstate=XX000"],
        ["an org read that throws", { table: "orgs", op: "select", kind: "throw" }, "✗ ensure failed: read_failed table=orgs"],
    ] as const)("ensure: %s → a stable code", async (_l, fault, line) => {
        const { db } = setup();
        const { code, out } = await runEntry("ensure", faulty(db, fault as Fault));
        expect(code).toBe(1);
        expect(out).toContain(line);
        expectSafeContract(out);
    });

    it("ensure: a seed insert error → table, SQLSTATE and the exact seeded count", async () => {
        const { store, db } = setup();
        const { code, out } = await runEntry("ensure", faulty(db, { table: "persons", op: "insert", kind: "error" }));
        expect(code).toBe(1);
        expect(out).toContain("✗ seed_failed table=persons sqlstate=XX000 seeded_before_failure=2");
        expect(store.customers.some((c) => c.id === IDS.customer)).toBe(true);
        expectSafeContract(out);
    });

    it("ensure: the product's draft write failing → its code, never its message", async () => {
        const { db } = setup();
        const { code, out } = await runEntry("ensure", faulty(db, { table: "charges", op: "insert", kind: "error" }));
        expect(code).toBe(1);
        expect(out).toContain("✗ draft_write_failed reason=db_error");
        expectSafeContract(out);
    });

    it("verify: a failing read inside the product's catalog loader → unexpected_error or a code, nothing else", async () => {
        const { db } = setup();
        await ensureHistoricalDraft(db as never, ORG);
        const { code, out } = await runEntry("verify", faulty(db, { table: "commercial_products", op: "select", kind: "throw" }));
        expect(code).toBe(1);
        expect(out.filter((l) => l.startsWith("✗")).length).toBeGreaterThan(0);
        expectSafeContract(out);
    });

    it("count: a failing read → a code, and no census line is invented", async () => {
        const { db } = setup();
        const { code, out } = await runEntry("count", faulty(db, { table: "customers", op: "select", kind: "error" }));
        expect(code).toBe(1);
        expect(out).toContain("✗ count failed: read_failed table=customers sqlstate=XX000");
        expect(out.some((l) => GRAMMAR.census.test(l))).toBe(false);
        expectSafeContract(out);
    });

    it("reset: a failing preflight read → a code and an exact removed=0", async () => {
        const { store, db } = setup();
        await ensureHistoricalDraft(db as never, ORG);
        const before = JSON.stringify(store);
        const { code, out } = await runEntry("reset", faulty(db, { table: "customers", op: "select", kind: "throw" }));
        expect(code).toBe(1);
        expect(out).toContain("✗ reset failed: read_failed table=customers");
        expect(expectSafeContract(out, { reset: true })).toBe(0);
        expect(JSON.stringify(store)).toBe(before);
    });

    it("a client that cannot be created → unexpected_error, and no reset line it could not stand behind", async () => {
        clients.impl = () => {
            throw new Error(`connect ${SENTINEL}`);
        };
        const out: string[] = [];
        const code = await historicalUnderAuthority("reset", {}, ["--reset"], (l) => out.push(l));
        expect(code).toBe(1);
        expect(out).toContain("✗ reset failed: unexpected_error");
        expect(out.some((l) => GRAMMAR.reset.test(l))).toBe(false);
        expectSafeContract(out);
    });
});

describe("reset enforces identity at every delete, and reports a partial reset exactly", () => {
    async function ensured() {
        const env = setup();
        await ensureHistoricalDraft(env.db as never, ORG);
        const before = (await censusHistoricalDraft(env.db as never, ORG)).count!;
        return { ...env, before };
    }

    it.each([
        ["returns an error", "error", "delete_failed table=gl_accounts sqlstate=XX000"],
        ["throws", "throw", "delete_failed table=gl_accounts"],
    ] as const)("a delete that %s stops the reset: exact removed count, PARTIAL, never full cleanup", async (_l, kind, diag) => {
        const { store, db, before } = await ensured();
        const { code, out } = await runEntry("reset", faulty(db, { table: "gl_accounts", op: "delete", kind }));
        expect(code).toBe(1);
        const removed = expectSafeContract(out, { reset: true })!;
        const after = (await censusHistoricalDraft(db as never, ORG)).count!;
        expect(removed).toBe(before - after);
        expect(removed).toBeGreaterThan(0);
        expect(after).toBeGreaterThan(0);
        expect(out.join("\n")).toContain(`reset PARTIAL: ${diag} removed=${removed} of ${before} — the fixture is NOT fully removed`);
        expect(out.join("\n")).not.toMatch(/reset complete/);
        expect(store.gl_accounts.some((g) => g.id === IDS.glAccount)).toBe(true);
    });

    it("a row whose ownership key changed after preflight is NOT deleted — the delete's own filter refuses it", async () => {
        const { store, db } = await ensured();
        const { code, out } = await runEntry("reset", faulty(db, {
            table: "persons", op: "delete", kind: "hook",
            before: () => {
                const person = store.persons.find((p) => p.id === IDS.person)!;
                person.email = "somebody@example.org";
            },
        }));
        expect(code).toBe(1);
        expect(out.join("\n")).toMatch(/reset PARTIAL: identity_changed_during_reset table=persons removed=\d+ of \d+/);
        expect(store.persons.find((p) => p.id === IDS.person)).toMatchObject({ email: "somebody@example.org" });
        /* What it references stays too: the reset stopped before the household. */
        expect(store.customers.some((c) => c.id === IDS.customer)).toBe(true);
        expectSafeContract(out, { reset: true });
    });

    it("history appearing mid-reset stops it before the household's periods and rows; the posted charge survives", async () => {
        const { store, db } = await ensured();
        const posted = { id: "posted-midway", org_id: ORG, billable_source_id: IDS.agreement, charge_template_id: IDS.template, status: "posted", metadata: {} };
        const { code, out } = await runEntry("reset", faulty(db, { table: "charges", op: "delete", kind: "hook", before: () => store.charges.push(posted) }));
        expect(code).toBe(1);
        const removed = expectSafeContract(out, { reset: true });
        expect(out.join("\n")).toContain(`reset PARTIAL: ledger_appeared_during_reset removed=${removed} of`);
        expect(store.charges).toContainEqual(posted);
        expect(store.financial_billing_periods.some((p) => p.customer_id === IDS.customer)).toBe(true);
        expect(store.customers.some((c) => c.id === IDS.customer)).toBe(true);
        expect(fixtureDrafts(store).filter((c) => c.status === "draft")).toHaveLength(0);
    });

    it.each([
        ["a tag on the household (customer_tags, CASCADE)", { customer_tags: [{ id: "tag-1", customer_id: IDS.customer }] }, /customer_tags row\(s\) depend on the fixture by customer_id/],
        ["an autopay arrangement on the household (CASCADE)", { payment_autopay_arrangements: [{ id: "ap-1", customer_id: IDS.customer }] }, /payment_autopay_arrangements/],
        ["attendance on the fixture agreement (CASCADE)", { child_attendance_events: [{ id: "att-1", enrollment_agreement_id: IDS.agreement }] }, /child_attendance_events/],
        ["a line item on the fixture draft (CASCADE)", "line-item", /charge_line_items row\(s\) depend on the fixture by charge_id/],
        ["a second location under the household", { locations: [{ id: "loc-foreign", org_id: ORG, customer_id: IDS.customer, label: "Real", location_type: "address" }] }, /locations row\(s\) under the fixture household are not the fixture's/],
        ["a draft on the fixture agreement from another template", "foreign-draft", /not written from the fixture template/],
    ] as const)("reset refuses %s and removes nothing", async (_l, plant, why) => {
        const { store, db } = await ensured();
        if (plant === "line-item") store.charge_line_items = [{ id: "li-1", charge_id: fixtureDrafts(store)[0].id }];
        else if (plant === "foreign-draft") store.charges.push({ id: "draft-other", org_id: ORG, billable_source_id: IDS.agreement, charge_template_id: null, status: "draft", metadata: {} });
        else for (const [t, rs] of Object.entries(plant)) store[t] = [...(store[t] ?? []), ...rs];
        const before = JSON.stringify(store);
        const { code, out } = await runEntry("reset", db);
        expect(code).toBe(1);
        expect(out.join("\n")).toMatch(why);
        expect(expectSafeContract(out, { reset: true })).toBe(0);
        expect(JSON.stringify(store)).toBe(before);
    });

    it("a complete reset says so, with the exact count, and census then measures zero", async () => {
        const { db, before } = await ensured();
        const { code, out } = await runEntry("reset", db);
        expect(code).toBe(0);
        expect(expectSafeContract(out, { reset: true })).toBe(before);
        expect(out).toContain(`✓ reset complete: removed ${before} of ${before} fixture row(s); no ledger touched`);
        const census = await runEntry("count", db);
        expect(census.code).toBe(0);
        expectSafeContract(census.out, { census: true });
        expect(census.out).toContain("census count=0");
    });

    it("every planned row's ownership key is applied on its own delete", () => {
        for (const p of plannedRows()) expect(Object.keys(p.key).length, p.table).toBeGreaterThan(0);
    });
});

describe("no report or process text reaches the isolated runner's output", () => {
    /* Each run is under a live synthetic executor authority, so the runner gets past its guard. */
    const live = syntheticExecutorStore();
    afterAll(() => live.cleanup());
    const env = () => ({ ...live.env(), SUPABASE_SERVICE_ROLE_KEY: SECRET });
    const isolatedMain = (io: NonNullable<Parameters<typeof isolatedMainUnderTest>[0]>) => isolatedMainUnderTest({ authority: live.options(), ...io });
    const writeReport = (report: unknown) => async (_files: string[], _env: unknown, reportPath: string) => {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(reportPath, JSON.stringify(report));
        return { code: 1 };
    };
    const pinned = `${process.cwd()}/${FINANCIALS_ISOLATED_SUITE[0]}`;

    it("names failing tests by approved identifier only — never their titles or the suite's message", async () => {
        const out: string[] = [];
        const code = await isolatedMain({
            env: env(), argv: [], out: (l: string) => out.push(l),
            run: writeReport({
                testResults: [{
                    name: pinned, status: "failed", message: `suite blew up: ${SENTINEL}`,
                    assertionResults: [
                        { status: "passed", title: `ok ${SENTINEL}`, fullName: `catalog ok ${SENTINEL}` },
                        { status: "failed", title: `posts ${SENTINEL}`, fullName: `catalog posts ${SENTINEL}`, failureMessages: [`expected ${SENTINEL}`] },
                        { status: "skipped", title: SENTINEL },
                    ],
                }],
            }),
        });
        expect(code).toBe(1);
        expect(out).toEqual(expect.arrayContaining([
            "✓ catalogAddCharge.live#1 passed", "✗ catalogAddCharge.live#2 failed", "✗ catalogAddCharge.live#3 not_run",
            "✗ tests_not_run count=1", "✗ tests_failed count=1", "✗ vitest_exit_nonzero code=1", "tests passed=1 failed=1",
        ]));
        expectSafeContract(out, { tests: true });
    });

    it("an unpinned file is counted, never named", async () => {
        const out: string[] = [];
        await isolatedMain({
            env: env(), argv: [], out: (l: string) => out.push(l),
            run: writeReport({ testResults: [{ name: `/x/${SENTINEL}.test.ts`, status: "passed", assertionResults: [{ status: "passed", fullName: SENTINEL }] }] }),
        });
        expect(out).toEqual(expect.arrayContaining(["✗ unpinned_file_ran count=1", "✗ pinned_file_reported_nothing file=catalogAddCharge.live"]));
        expectSafeContract(out, { tests: true });
    });

    it("no report and a non-zero exit → codes only", async () => {
        const out: string[] = [];
        const code = await isolatedMain({ env: env(), argv: [], out: (l: string) => out.push(l), run: async () => ({ code: 1 }) });
        expect(code).toBe(1);
        expect(out).toEqual(expect.arrayContaining(["✗ vitest_report_absent", "✗ vitest_exit_nonzero code=1", "tests passed=0 failed=0"]));
        expectSafeContract(out, { tests: true });
    });

    it("a runner that throws → runner_error, never the exception", async () => {
        const out: string[] = [];
        const code = await isolatedMain({
            env: env(), argv: [], out: (l: string) => out.push(l),
            run: async () => {
                throw new Error(`exploded ${SENTINEL}`);
            },
        });
        expect(code).toBe(1);
        expect(out).toEqual(expect.arrayContaining(["✗ runner_error", "tests passed=0 failed=0"]));
        expectSafeContract(out, { tests: true });
    });

    it("the real spawn path failing → runner_error, never the spawn error", async () => {
        const out: string[] = [];
        const code = await isolatedMain({ env: env(), argv: [], out: (l: string) => out.push(l) });
        expect(spawned.calls).toBe(1);
        expect(code).toBe(1);
        expect(out).toContain("✗ runner_error");
        expectSafeContract(out, { tests: true });
    });

    it("a fully passing pinned report and exit 0 is the only proof, and parses as the executor reads it", async () => {
        const out: string[] = [];
        const code = await isolatedMain({
            env: env(), argv: [], out: (l: string) => out.push(l),
            run: async (files: string[], e: unknown, reportPath: string) => {
                await writeReport({ testResults: [{ name: pinned, status: "passed", assertionResults: [{ status: "passed", fullName: SENTINEL }, { status: "passed" }] }] })(files, e, reportPath);
                return { code: 0 };
            },
        });
        expect(code).toBe(0);
        expect(out.filter((l) => l.startsWith("✓") || l.startsWith("✗"))).toEqual(["✓ catalogAddCharge.live#1 passed", "✓ catalogAddCharge.live#2 passed"]);
        expect(GRAMMAR.tests.exec(out[out.length - 1])?.slice(1)).toEqual(["2", "0"]);
        expectSafeContract(out, { tests: true });
    });
});
