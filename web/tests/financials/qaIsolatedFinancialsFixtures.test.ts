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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawned = vi.hoisted(() => ({ calls: 0 }));
vi.mock("node:child_process", async (orig) => ({
    ...(await orig<typeof import("node:child_process")>()),
    spawn: vi.fn(() => {
        spawned.calls += 1;
        throw new Error("no process may start in this suite");
    }),
}));
const clients = vi.hoisted(() => ({ created: 0 }));
vi.mock("@supabase/supabase-js", async (orig) => ({
    ...(await orig<typeof import("@supabase/supabase-js")>()),
    createClient: vi.fn(() => {
        clients.created += 1;
        throw new Error("no client may be created in this suite");
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
    ORG,
    plannedRows,
    RESET_LIMIT,
    resetHistoricalDraft,
    TEMPLATE_AMOUNT_CENTS,
    verifyHistoricalDraft,
} from "../../scripts/qa/financialsHistoricalDraftFixtureCore";
import {
    FINANCIALS_ISOLATED_SUITE,
    main as isolatedMain,
    suiteChildEnv,
    summarizeVitestReport,
} from "../../scripts/qa/financialsIsolatedTests.mjs";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

/* A synthetic credential: if it ever appears in output, the suite fails. */
const SECRET = "sk_synthetic_never_print_0123456789abcdef";

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

    it("hands the suite the bound target under the suite's own isolated-env names", () => {
        const env = suiteChildEnv(boundEnv("financials_isolated_tests", "run"));
        expect(env).toMatchObject({ CATALOG_LIVE_ISOLATED: "1", CERT_SUPABASE_URL: "http://127.0.0.1:56102", CERT_SERVICE_ROLE_KEY: SECRET });
    });

    const file = (assertionResults: Array<{ status: string; fullName?: string }>, status = "passed", name = `/w/${FINANCIALS_ISOLATED_SUITE[0]}`) => ({ name, status, assertionResults });
    const summarize = (testResults: unknown[]) => summarizeVitestReport({ testResults }, FINANCIALS_ISOLATED_SUITE, "/w");

    it("counts a fully passing pinned suite as proof", () => {
        expect(summarize([file([{ status: "passed", fullName: "a" }, { status: "passed", fullName: "b" }])])).toMatchObject({ ok: true, passed: 2, failed: 0, skipped: 0 });
    });

    it.each([
        ["the suite skipped itself (no target reached it)", [file([{ status: "skipped" }, { status: "skipped" }], "skipped")], /skipped/],
        ["one test is pending", [file([{ status: "passed" }, { status: "pending" }])], /skipped\/pending\/todo/],
        ["one test failed", [file([{ status: "passed" }, { status: "failed" }], "failed")], /failed/],
        ["the suite failed to load", [file([], "failed")], /failed/],
        ["the pinned file reported nothing", [], /reported nothing/],
        ["an unpinned file ran", [file([{ status: "passed" }]), file([{ status: "passed" }], "passed", "/w/tests/other.test.ts")], /not pinned/],
    ])("is NOT proof when %s", (_label, results, why) => {
        const s = summarize(results as unknown[]);
        expect(s.ok).toBe(false);
        expect(s.problems.join("\n")).toMatch(why);
    });

    it("is NOT proof when vitest wrote no report", () => {
        expect(summarizeVitestReport(null)).toMatchObject({ ok: false, problems: ["vitest produced no readable report"] });
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
        const r = await ensureHistoricalDraft(db as never);
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
        await ensureHistoricalDraft(db as never);
        const before = JSON.stringify(store);
        const again = await ensureHistoricalDraft(db as never);
        expect(again.exitCode).toBe(0);
        expect(again.lines).toContain(`seeded 0 of ${plannedRows().length} fixture row(s)`);
        expect(fixtureDrafts(store)).toHaveLength(1);
        expect(JSON.stringify(store.charges)).toBe(JSON.stringify(JSON.parse(before).charges));
    });

    it("verify FAILS when the draft has been re-pointed at the same-name Catalog item", async () => {
        const { store, db } = setup();
        await ensureHistoricalDraft(db as never);
        const draft = fixtureDrafts(store)[0];
        Object.assign(draft, { charge_template_id: null, metadata: { ...(draft.metadata as object), catalog_item: { product_id: IDS.sameNameProduct } } });
        const v = await verifyHistoricalDraft(db as never);
        expect(v.exitCode).toBe(1);
        expect(v.checks.filter((c) => !c.ok).map((c) => c.check)).toEqual(expect.arrayContaining([
            "the draft records its template id",
            "the draft carries no Catalog provenance",
            "the draft is edited under its template, not the same-name Catalog item",
        ]));
    });

    it.each([
        ["a same-named household outside the fixture", { customers: [{ id: "22222222-0000-4000-8000-000000000001", org_id: ORG, name: HOUSEHOLD_NAME, metadata: {} }] }, /household\(s\) outside the fixture are named/],
        ["a second household bound to the namespace", { customers: [{ id: "22222222-0000-4000-8000-000000000002", org_id: ORG, name: "x", external_source: NAMESPACE, external_id: "other", metadata: {} }] }, /other household\(s\) are bound/],
        ["another template with the fixture's key", { financial_charge_templates: [{ id: "tpl-other", org_id: ORG, template_key: "fincert_hist_registration", label: "x", metadata: {} }] }, /carry template_key/],
        ["a same-named Catalog item outside the fixture", { commercial_products: [{ id: "p-other", org_id: ORG, name: FEE_LABEL, metadata: {} }] }, /Catalog item\(s\) outside the fixture/],
        ["a non-fixture row at a fixture id", { customers: [{ id: IDS.customer, org_id: ORG, name: "Somebody real", external_source: null, external_id: null, metadata: {} }] }, /already exists and is not the fixture's/],
    ])("ensure refuses %s as an identity conflict, writing nothing", async (_label, extra, why) => {
        const { store, db } = setup(extra);
        const before = JSON.stringify(store);
        const r = await ensureHistoricalDraft(db as never);
        expect(r.exitCode).toBe(3);
        expect(r.checks[0].check).toMatch(/^identity conflict/);
        expect(r.checks[0].check).toMatch(why);
        expect(JSON.stringify(store)).toBe(before);
    });

    it("reset removes only the fixture, bounded, reported in the executor's line — and is idempotent", async () => {
        const { store, db } = setup();
        await ensureHistoricalDraft(db as never);
        const r = await resetHistoricalDraft(db as never);
        expect(r.exitCode).toBe(0);
        expect(r.removed).toBeGreaterThan(0);
        expect(r.removed).toBeLessThanOrEqual(RESET_LIMIT);
        expect(r.lines).toEqual([`reset namespace=${NAMESPACE} removed=${r.removed}`]);
        for (const p of plannedRows()) expect(store[p.table].some((row) => row.id === p.id), `${p.table} ${p.id}`).toBe(false);
        expect(fixtureDrafts(store)).toHaveLength(0);
        expect(store.financial_billing_periods.filter((bp) => bp.customer_id === IDS.customer)).toHaveLength(0);
        expect(store.customers.map((c) => c.id)).toEqual([NEIGHBOUR]);

        const again = await resetHistoricalDraft(db as never);
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
        await ensureHistoricalDraft(db as never);
        plant(store);
        const before = JSON.stringify(store);
        const r = await resetHistoricalDraft(db as never);
        expect(r.exitCode).toBe(1);
        expect(r.removed).toBe(0);
        expect(r.checks[0].check).toMatch(why);
        expect(r.lines).toEqual([`reset namespace=${NAMESPACE} removed=0`]);
        expect(JSON.stringify(store)).toBe(before);
    });

    it(`reset refuses more than ${RESET_LIMIT} rows before the first delete`, async () => {
        const { store, db } = setup();
        await ensureHistoricalDraft(db as never);
        for (let i = 0; i < RESET_LIMIT; i++) {
            store.charges.push({ id: `draft-extra-${i}`, org_id: ORG, billable_source_id: IDS.agreement, status: "draft", metadata: {} });
        }
        const before = JSON.stringify(store);
        const r = await resetHistoricalDraft(db as never);
        expect(r).toMatchObject({ exitCode: 1, removed: 0 });
        expect(r.checks[0].check).toMatch(/exceed the limit of 50/);
        expect(JSON.stringify(store)).toBe(before);
    });

    it("census counts exactly what reset removes, and reads zero after it — measured, not assumed", async () => {
        const { db } = setup();
        expect(await censusHistoricalDraft(db as never)).toMatchObject({ exitCode: 0, count: 0, lines: ["census count=0"] });
        await ensureHistoricalDraft(db as never);
        const before = await censusHistoricalDraft(db as never);
        expect(before.count).toBeGreaterThan(plannedRows().length);
        const reset = await resetHistoricalDraft(db as never);
        expect(reset.removed).toBe(before.count);
        expect(await censusHistoricalDraft(db as never)).toMatchObject({ exitCode: 0, count: 0, lines: ["census count=0"] });
    });

    it("census refuses a non-fixture row at a fixture id rather than counting it", async () => {
        const { db } = setup({ customers: [{ id: IDS.customer, org_id: ORG, name: "Somebody real", metadata: {} }] });
        expect(await censusHistoricalDraft(db as never)).toMatchObject({ exitCode: 3, count: null });
    });

    it("reset refuses a non-fixture row at a fixture id and touches nothing", async () => {
        const { store, db } = setup({ customers: [{ id: IDS.customer, org_id: ORG, name: "Somebody real", metadata: {} }] });
        const before = JSON.stringify(store);
        const r = await resetHistoricalDraft(db as never);
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
        const code = await historicalMain(boundEnv("financials_historical_draft", op, over) as never, argv, (l) => out.push(l));
        expect(code).toBe(2);
        expect(clients.created).toBe(0);
        expect(out.join("\n")).toMatch(/^✗ refused before any IO/);
        expect(out.join("\n")).not.toContain(SECRET);
    });
});
