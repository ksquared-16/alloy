/**
 * MANUAL ADD › CHARGE OFFERS THE ORGANISATION'S CATALOG — and only what it can honestly incur.
 *
 * Operator report (2026-10-29): Organization › Financials › Catalog lists the tenant's fees, while
 * Add › Charge offered `financial_charge_templates` ("Enrollment fee (waived)", "Field trip", …) —
 * a second list nobody configured in /organization. Approved policy:
 *
 *   · manual Add Charge incurs configured ONE-TIME FEES from the catalog;
 *   · every other catalog type stays VISIBLE with the flow that bills it, and is never incurred here;
 *   · a missing accounting mapping BLOCKS — never a fallback account;
 *   · picker, preview and server agree on item identity, org, location, effective date and amount;
 *   · historical template charges stay readable; no template dropdown fallback.
 *
 * Every catalog row here is fixture data with neutral names — nothing from the screenshots is
 * hardcoded anywhere in the implementation.
 */
import { describe, expect, it } from "vitest";

import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { financialChargeActions } from "@/lib/adminV2/actions/definitions/financialChargeActions";
import type { CommercialProductDef } from "@/lib/commercial/execution/commercialExport";
import { resolveGlAccountForMappingKey } from "@/lib/financials/accounting/resolveGlMapping";
import {
    evaluateCatalogCharge,
    readCatalogChargeConfig,
    type CatalogChargeConfig,
} from "@/lib/financials/catalogCharges/catalogChargeOffer";
import { CHARGE_CATEGORY_GL_MAPPING_KEY } from "@/lib/financials/chargeCategories";
import {
    previewTemplateCharge,
    writeTemplateDraftCharge,
} from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import type { GlAccountMappingRow, GlAccountRow } from "@/lib/financials/gl/glConfigTypes";
import {
    BILLING_AGREEMENT_ID,
    BILLING_CUSTOMER_ID,
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    SITE_ID,
    seedCanonicalBillingChain,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-29";
const OTHER_SITE = "site-other";

/* ── ACCOUNTING: the catalog's account, and a DIFFERENT default the fee category would fall back to ── */
const FEE_ACCOUNT = { id: "gl-fees", org_id: ORG_ID, code: "4010", name: "Activity Revenue", type: "revenue", currency: "USD", is_active: true };
const DEFAULT_ACCOUNT = { id: "gl-default", org_id: ORG_ID, code: "4900", name: "Default Fee Revenue", type: "revenue", currency: "USD", is_active: true };
const ORPHAN_ACCOUNT = { id: "gl-orphan", org_id: ORG_ID, code: "4020", name: "No Mapping Revenue", type: "revenue", currency: "USD", is_active: true };
const GL_ACCOUNTS = [FEE_ACCOUNT, DEFAULT_ACCOUNT, ORPHAN_ACCOUNT];
const GL_MAPPINGS = [
    { id: "map-fee", org_id: ORG_ID, key: "activity_revenue", gl_account_id: FEE_ACCOUNT.id, is_active: true },
    /* The category default — must NEVER be what a catalog fee posts to. */
    { id: "map-default", org_id: ORG_ID, key: CHARGE_CATEGORY_GL_MAPPING_KEY.fee, gl_account_id: DEFAULT_ACCOUNT.id, is_active: true },
];
const REVENUE_CATEGORIES = [
    { id: "rc-mapped", org_id: ORG_ID, label: "Activities", mapped_gl_account_id: FEE_ACCOUNT.id, is_active: true, sort_order: 1 },
    { id: "rc-unmapped", org_id: ORG_ID, label: "Unmapped", mapped_gl_account_id: null, is_active: true, sort_order: 2 },
    { id: "rc-orphan", org_id: ORG_ID, label: "Orphaned", mapped_gl_account_id: ORPHAN_ACCOUNT.id, is_active: true, sort_order: 3 },
];

function product(id: string, over: Record<string, unknown> = {}) {
    return {
        id,
        org_id: ORG_ID,
        location_id: null,
        program_key: null,
        name: `Item ${id}`,
        commercial_type: "fee",
        amount_cents: 2500,
        cadence_key: null,
        revenue_category_id: "rc-mapped",
        behavior: { required: false },
        effective_start: null,
        effective_end: null,
        is_active: true,
        ...over,
    };
}

const PRODUCTS = [
    product("p-fee", { name: "Alpha One-time Fee", amount_cents: 2500 }),
    product("p-site", { name: "Beta Site Fee", amount_cents: 15000, location_id: SITE_ID }),
    product("p-other-site", { name: "Gamma Other Site Fee", location_id: OTHER_SITE }),
    product("p-annual", { name: "Delta Annual Fee", amount_cents: 20000, cadence_key: "annual" }),
    product("p-session", { name: "Epsilon Session Fee", cadence_key: "per_session" }),
    product("p-addon", { name: "Zeta Add-on", commercial_type: "addon", behavior: {} }),
    product("p-package", { name: "Eta Package", commercial_type: "addon", behavior: { package: { unit_count: 10 } } }),
    product("p-deposit", { name: "Theta Deposit", commercial_type: "deposit", behavior: { refundable: true } }),
    product("p-program", { name: "Iota Program Fee", program_key: "preschool" }),
    product("p-zero", { name: "Kappa Zero Fee", amount_cents: 0 }),
    product("p-no-rc", { name: "Lambda No Category", revenue_category_id: null }),
    product("p-unmapped", { name: "Mu Unmapped", revenue_category_id: "rc-unmapped" }),
    product("p-orphan", { name: "Nu No Posting Mapping", revenue_category_id: "rc-orphan" }),
    product("p-future", { name: "Xi Future Fee", effective_start: "2026-07-01" }),
    product("p-expired", { name: "Omicron Expired Fee", effective_end: "2026-06-28" }),
    product("p-inactive", { name: "Pi Inactive Fee", is_active: false }),
];

function setup(extra: Record<string, unknown> = {}) {
    const store = createOperationalEnrollmentMockStore({
        ...seedCanonicalBillingChain(),
        commercial_products: PRODUCTS,
        commercial_revenue_categories: REVENUE_CATEGORIES,
        gl_accounts: GL_ACCOUNTS,
        ...extra,
    } as never);
    (store as unknown as Record<string, unknown>).gl_account_mappings = GL_MAPPINGS;
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

/* The pure rule's view of the same fixture. */
function asDef(p: ReturnType<typeof product>): CommercialProductDef {
    return {
        id: p.id,
        commercialType: p.commercial_type as CommercialProductDef["commercialType"],
        name: p.name,
        scope: { programKey: (p.program_key as string | null) ?? "", locationId: p.location_id as string | null },
        amountCents: p.amount_cents as number,
        cadenceKey: p.cadence_key as string | null,
        revenueCategoryId: p.revenue_category_id as string | null,
        behavior: p.behavior as Record<string, unknown>,
        effective: { start: p.effective_start as string | null, end: p.effective_end as string | null },
        isActive: p.is_active as boolean,
    };
}
const CONFIG: CatalogChargeConfig = {
    products: PRODUCTS.map(asDef),
    revenueCategories: REVENUE_CATEGORIES.map((r) => ({ id: r.id, label: r.label, glAccountId: r.mapped_gl_account_id, isActive: r.is_active })),
    mappings: GL_MAPPINGS,
    accounts: GL_ACCOUNTS,
};
const evalAt = (id: string, locationIds: Array<string | null> = [null, SITE_ID]) =>
    evaluateCatalogCharge(CONFIG.products.find((p) => p.id === id)!, CONFIG, { asOf: TODAY, locationIds });

describe("the one rule — what manual Add Charge may incur from the catalog", () => {
    it("a one-time fee is offerable, at its configured amount, to the account its revenue category names", () => {
        const e = evalAt("p-fee");
        expect(e.status).toBe("offerable");
        if (e.status !== "offerable") return;
        expect(e.product.amountCents).toBe(2500);
        expect(e.account).toMatchObject({ id: FEE_ACCOUNT.id, code: "4010", mappingKey: "activity_revenue" });
    });

    it("the posting mapping it chooses resolves, through the canonical resolver, to the catalog's account — not the category default", () => {
        const e = evalAt("p-fee");
        if (e.status !== "offerable") throw new Error("expected offerable");
        const resolved = resolveGlAccountForMappingKey(
            e.account.mappingKey, GL_MAPPINGS as GlAccountMappingRow[], GL_ACCOUNTS as unknown as GlAccountRow[],
        );
        expect(resolved?.id).toBe(FEE_ACCOUNT.id);
        expect(e.account.mappingKey).not.toBe(CHARGE_CATEGORY_GL_MAPPING_KEY.fee);
    });

    it.each([
        ["p-annual", "catalog_recurring_not_manual", /Annual — a recurring Catalog item.*set its frequency to One-time/],
        ["p-session", "catalog_metered_not_manual", /usage-priced Catalog item/],
        ["p-addon", "catalog_addon_not_manual", /Add-on — Add charge adds one-time fees only/],
        ["p-package", "catalog_addon_not_manual", /package/i],
        ["p-deposit", "catalog_deposit_not_manual", /held money/],
        ["p-program", "catalog_program_scoped", /one program/],
    ])("%s is VISIBLE but unsupported, saying truthfully why (%s)", (id, code, reason) => {
        const e = evalAt(id);
        expect(e.status).toBe("unsupported");
        if (e.status === "offerable") return;
        expect(e.code).toBe(code);
        expect(e.reason).toMatch(reason);
    });

    it("no unsupported reason names a billing flow that does not exist (measured 2026-10-30: none bills these)", () => {
        for (const id of ["p-annual", "p-session", "p-addon", "p-package", "p-deposit", "p-program"]) {
            const e = evalAt(id);
            if (e.status === "offerable") throw new Error(id);
            expect(e.reason, id).not.toMatch(/billed by periodic billing|through the child's enrollment|collected through enrollment|from attendance and usage/);
            expect(e.reason, id).not.toMatch(/^\s*$/);
        }
    });

    it.each([
        ["p-no-rc", "catalog_revenue_category_missing"],
        ["p-unmapped", "catalog_gl_account_unmapped"],
        ["p-orphan", "catalog_posting_mapping_missing"],
        ["p-zero", "catalog_amount_not_positive"],
    ])("%s is BLOCKED (%s) — no fallback account, no $0 charge", (id, code) => {
        const e = evalAt(id);
        expect(e.status).toBe("blocked");
        if (e.status === "offerable") return;
        expect(e.code).toBe(code);
    });

    it.each([
        ["p-future", "catalog_item_not_effective"],
        ["p-expired", "catalog_item_not_effective"],
        ["p-inactive", "catalog_item_inactive"],
        ["p-other-site", "catalog_item_other_location"],
    ])("%s is out of scope here (%s)", (id, code) => {
        const e = evalAt(id);
        expect(e.status).toBe("out_of_scope");
        if (e.status === "offerable") return;
        expect(e.code).toBe(code);
    });

    it("a location-scoped fee is offerable for its own site and out of scope for a household with no site", () => {
        expect(evalAt("p-site", [SITE_ID]).status).toBe("offerable");
        expect(evalAt("p-site", [null]).status).toBe("out_of_scope");
    });

    it("effective dates are inclusive on the business date", () => {
        const onStart = evaluateCatalogCharge(
            { ...asDef(product("x", { effective_start: TODAY })) }, CONFIG, { asOf: TODAY, locationIds: [null] },
        );
        const onEnd = evaluateCatalogCharge(
            { ...asDef(product("y", { effective_end: TODAY })) }, CONFIG, { asOf: TODAY, locationIds: [null] },
        );
        expect(onStart.status).toBe("offerable");
        expect(onEnd.status).toBe("offerable");
    });
});

const ENROLLED = { agreementId: BILLING_AGREEMENT_ID, billableSource: { type: "enrollment_agreement" as const, id: BILLING_AGREEMENT_ID } };
const HOUSEHOLD = { agreementId: null, billableSource: { type: "customer" as const, id: BILLING_CUSTOMER_ID } };

describe("the command — preview and write agree with each other and with the rule", () => {
    it("previews the catalog fee at its configured amount, through the catalog's own posting mapping", async () => {
        const { supabase } = setup();
        const r = await previewTemplateCharge(supabase, ORG_ID, { templateId: "", catalogProductId: "p-site", ...ENROLLED, today: TODAY });
        expect(r.intent).toMatchObject({
            eligible: true,
            amountCents: 15000,
            chargeCategory: "fee",
            glMappingKey: "activity_revenue",
            occursOn: TODAY,
        });
        expect(r.intent.resolutionKey).toBe(`tpl:catalog:p-site:${TODAY}:${BILLING_AGREEMENT_ID}`);
        expect(r.wouldWrite).toBe("create");
    });

    it("writes exactly what it previewed: amount, dates, account — no template reference, catalog snapshot recorded", async () => {
        const { store, supabase } = setup();
        const args = { templateId: "", catalogProductId: "p-site", ...ENROLLED, today: TODAY };
        const preview = await previewTemplateCharge(supabase, ORG_ID, args);
        const written = await writeTemplateDraftCharge(supabase, ORG_ID, args);
        expect(written.status).toBe("created");
        const charges = store.charges as Array<Record<string, unknown>>;
        expect(charges).toHaveLength(1);
        const row = charges[0]!;
        expect(row).toMatchObject({
            amount_cents: preview.intent.amountCents,
            billable_on: preview.intent.billableOn,
            due_date: preview.intent.dueDate,
            occurs_on: preview.intent.occursOn,
            charge_category: "fee",
            charge_template_id: null,
            description: "Beta Site Fee",
            status: "draft",
        });
        const metadata = row.metadata as Record<string, unknown>;
        expect(metadata).toMatchObject({
            source: "commercial_catalog",
            gl_mapping_key: "activity_revenue",
            resolution_key: preview.intent.resolutionKey,
        });
        expect(metadata.charge_template_key).toBeUndefined();
        expect(metadata.catalog_item).toMatchObject({
            product_id: "p-site",
            name: "Beta Site Fee",
            amount_cents: 15000,
            gl_account_id: FEE_ACCOUNT.id,
            gl_account_code: "4010",
            location_id: SITE_ID,
        });
        /* The canonical charge→account chain lands on the catalog's account. */
        const posted = resolveGlAccountForMappingKey(
            String(metadata.gl_mapping_key), GL_MAPPINGS as GlAccountMappingRow[], GL_ACCOUNTS as unknown as GlAccountRow[],
        );
        expect(posted?.id).toBe(FEE_ACCOUNT.id);

        const again = await writeTemplateDraftCharge(supabase, ORG_ID, args);
        expect(again.status).toBe("unchanged");
        expect(store.charges).toHaveLength(1);
    });

    it("ignores a client-supplied amount: the configured price is the price", async () => {
        const { store, supabase } = setup();
        await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: "", catalogProductId: "p-fee", ...HOUSEHOLD, unitAmountCents: 1, today: TODAY,
        });
        expect((store.charges as Array<Record<string, unknown>>)[0]!.amount_cents).toBe(2500);
    });

    it.each([
        ["p-unmapped", /not mapped to a GL account/],
        ["p-orphan", /No posting mapping uses GL account 4020/],
        ["p-deposit", /held money/],
        ["p-annual", /recurring Catalog item/],
        ["p-future", /not in effect/],
        ["p-other-site", /different location/],
        ["p-zero", /nothing to charge/],
    ])("refuses %s on preview AND on write, with the same reason, writing nothing", async (id, reason) => {
        const { store, supabase } = setup();
        const args = { templateId: "", catalogProductId: id, ...ENROLLED, today: TODAY };
        const preview = await previewTemplateCharge(supabase, ORG_ID, args);
        expect(preview.intent.eligible).toBe(false);
        expect(preview.intent.reason).toMatch(reason);
        expect(preview.wouldWrite).toBe("not_writable");
        const written = await writeTemplateDraftCharge(supabase, ORG_ID, args);
        expect(written).toEqual({ status: "not_writable", reason: preview.intent.reason });
        expect(store.charges).toHaveLength(0);
    });

    it("judges location against the site THIS charge's source attends: a household source cannot take a site fee", async () => {
        const { store, supabase } = setup();
        const written = await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: "", catalogProductId: "p-site", ...HOUSEHOLD, today: TODAY,
        });
        expect(written.status).toBe("not_writable");
        expect(store.charges).toHaveLength(0);
    });

    it("an unknown catalog item is not found — never resolved through a template of the same id", async () => {
        const { supabase } = setup();
        await expect(
            previewTemplateCharge(supabase, ORG_ID, { templateId: "", catalogProductId: "nope", ...ENROLLED, today: TODAY }),
        ).rejects.toThrow(/Catalog item not found/);
    });
});

describe("legacy template history is untouched", () => {
    it("a template charge still writes and references its template exactly as before", async () => {
        const template = {
            id: "tpl-legacy", org_id: ORG_ID, service_id: null, template_key: "legacy_fee", label: "Legacy fee",
            charge_category: "fee", trigger_type: "manual", amount_strategy: "fixed", amount_cents: 4000,
            currency_code: "USD", occurs_on_strategy: "now", billable_on_strategy: "immediate",
            billable_offset_days: null, default_gl_mapping_key: "fee_revenue", default_responsibility_key: "household",
            review_required: false, is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
        };
        const { store, supabase } = setup({ financial_charge_templates: [template] });
        const written = await writeTemplateDraftCharge(supabase, ORG_ID, { templateId: "tpl-legacy", ...ENROLLED, today: TODAY });
        expect(written.status).toBe("created");
        const row = (store.charges as Array<Record<string, unknown>>)[0]!;
        expect(row).toMatchObject({ charge_template_id: "tpl-legacy", description: "legacy_fee", amount_cents: 4000 });
        expect(row.metadata).toMatchObject({ source: "charge_template", charge_template_key: "legacy_fee", gl_mapping_key: "fee_revenue" });
        expect((row.metadata as Record<string, unknown>).catalog_item).toBeUndefined();
    });
});

describe("charge.add names exactly one source", () => {
    const addCharge = financialChargeActions.find((a) => a.actionKey === "charge.add")!;
    it("accepts a catalog item", () => {
        expect(addCharge.validatePayload!({ catalog_product_id: "p-fee" } as never).ok).toBe(true);
    });
    it("still accepts a template for existing callers", () => {
        expect(addCharge.validatePayload!({ template_id: "tpl-1" } as never).ok).toBe(true);
    });
    it("refuses both at once rather than guessing", () => {
        const r = addCharge.validatePayload!({ catalog_product_id: "p-fee", template_id: "tpl-1" } as never);
        expect(r.ok).toBe(false);
        expect(JSON.stringify(r)).toContain("ambiguous_charge_source");
    });
    it("refuses neither", () => {
        expect(addCharge.validatePayload!({} as never).ok).toBe(false);
    });
});

/* ── THE PICKER: the card's read model, built over the same catalog ───────────────────────────── */

function immediateClient(
    rows: Record<string, Array<Record<string, unknown>>>,
    bundle: Record<string, unknown>,
    opts: { reads?: Map<string, number>; failTable?: string } = {},
) {
    const builder = (table: string) => {
        opts.reads?.set(table, (opts.reads.get(table) ?? 0) + 1);
        const chain: Record<string, unknown> = {};
        for (const k of [
            "select", "eq", "in", "is", "not", "gte", "lte", "lt", "gt", "or", "order",
            "limit", "range", "neq", "overlaps", "contains",
        ]) {
            chain[k] = () => chain;
        }
        const answer = table === opts.failTable
            ? { data: null, error: { message: "read failed", code: "XX000" }, count: null }
            : { data: rows[table] ?? [], error: null, count: (rows[table] ?? []).length };
        chain.maybeSingle = async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null });
        chain.single = chain.maybeSingle;
        chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(answer).then(resolve);
        return chain;
    };
    return {
        from: (t: string) => builder(t),
        rpc: (name: string) => ({
            then: (r: (v: unknown) => unknown) => Promise.resolve({ data: name === "financials_account_fact_bundle" ? bundle : null, error: null }).then(r),
        }),
    } as never;
}

describe("the picker offers what the command accepts", () => {
    const agreements = [{ id: BILLING_AGREEMENT_ID, customer_member_id: "member-1", customer_id: BILLING_CUSTOMER_ID, status: "active", site_location_id: SITE_ID }];
    const bundle = {
        resolved_customer_id: BILLING_CUSTOMER_ID,
        agreements,
        members: [{ id: "member-1", first_name: "A", last_name: "B", display_name: "A B", person_id: "per-1" }],
        reductions_by_agreement: [], commercial_policies: [], charges: [], reductions_by_charge: [],
        payment_allocations: [], responsibility_allocations: [], subsidy_claim_lines: [], payments_backing: [],
        responsibility_attributions: [], responsible_persons: [], funding_by_allocation: [], funding_by_share: [],
        funding_for_responsibility: [], subsidy_claims: [], subsidy_variances: [], collection_attempts: [],
        payments_by_source: [], payments_for_views: [], charges_for_allocations: [], payer_customers: [], payment_refunds: [],
        counts: { agreements: 1, charges: 0, allocations: 0, claim_lines: 0 },
    };
    const rows = {
        child_enrollment_agreements: agreements,
        commercial_products: PRODUCTS,
        commercial_revenue_categories: REVENUE_CATEGORIES,
        gl_accounts: GL_ACCOUNTS,
        gl_account_mappings: GL_MAPPINGS,
        /* A legacy template the tenant still has — it must NOT be offered. */
        financial_charge_templates: [{ id: "tpl-waived", label: "Legacy waived fee", charge_category: "fee", amount_strategy: "fixed", amount_cents: 0, is_active: true, effective_start: "2026-01-01" }],
    };

    async function options() {
        const vm = await buildFinancialsCardVM(immediateClient(rows, bundle), {
            orgId: ORG_ID, customerId: BILLING_CUSTOMER_ID, customerMemberId: null, today: TODAY,
        });
        return vm.chargeTemplates;
    }

    it("lists catalog items only — never a charge template", async () => {
        const opts = await options();
        expect(opts.length).toBeGreaterThan(0);
        expect(opts.every((o) => o.source === "catalog")).toBe(true);
        expect(opts.map((o) => o.id)).not.toContain("tpl-waived");
        expect(opts.map((o) => o.label)).not.toContain("Legacy waived fee");
    });

    it("offers the one-time fees (own site included), lists unsupported/blocked items disabled with reasons, hides out-of-scope", async () => {
        const opts = await options();
        const byId = new Map(opts.map((o) => [o.id, o]));
        expect([...byId.keys()].filter((id) => byId.get(id)!.availability === "offerable").sort()).toEqual(["p-fee", "p-site"]);
        for (const id of ["p-annual", "p-session", "p-addon", "p-package", "p-deposit", "p-program"]) {
            expect(byId.get(id)?.availability, id).toBe("unsupported");
            expect(byId.get(id)?.unavailableReason, id).toBeTruthy();
        }
        for (const id of ["p-no-rc", "p-unmapped", "p-orphan", "p-zero"]) {
            expect(byId.get(id)?.availability, id).toBe("blocked");
        }
        for (const id of ["p-other-site", "p-future", "p-expired", "p-inactive"]) {
            expect(byId.has(id), id).toBe(false);
        }
        /* Chargeable items come first, so the command never opens on one it would refuse. */
        expect(opts[0]!.availability).toBe("offerable");
        expect(byId.get("p-fee")).toMatchObject({ amountCents: 2500, label: "Alpha One-time Fee", accountLabel: "4010 · Activity Revenue" });
    });

    it("the catalog joins the card's ONE GL read — each table read once, no second gl_accounts/gl_account_mappings trip", async () => {
        const reads = new Map<string, number>();
        const vm = await buildFinancialsCardVM(immediateClient(rows, bundle, { reads }), {
            orgId: ORG_ID, customerId: BILLING_CUSTOMER_ID, customerMemberId: null, today: TODAY,
        });
        for (const table of ["gl_accounts", "gl_account_mappings", "commercial_products", "commercial_revenue_categories", "child_enrollment_agreements"]) {
            expect(reads.get(table), table).toBe(1);
        }
        /* Sharing the read changed no answer: the same options as the unshared reader produces. */
        expect(vm.chargeTemplates).toEqual(await options());
        expect(vm.chargeTemplates.find((o) => o.id === "p-fee")).toMatchObject({ accountLabel: "4010 · Activity Revenue" });
    });

    it.each(["gl_accounts", "gl_account_mappings"])("a failed %s read leaves the catalog UNAVAILABLE — never every item 'unmapped'", async (failTable) => {
        const vm = await buildFinancialsCardVM(immediateClient(rows, bundle, { failTable }), {
            orgId: ORG_ID, customerId: BILLING_CUSTOMER_ID, customerMemberId: null, today: TODAY,
        });
        expect(vm.chargeTemplates).toEqual([]);
        expect(vm.unavailable.map((u) => u.fact)).toContain("catalog");
    });

    it("the catalog reader uses a GL bundle it is handed, and still fails closed when that bundle rejects", async () => {
        const reads = new Map<string, number>();
        const client = immediateClient(rows, bundle, { reads });
        const gl = Promise.resolve({ glAccounts: GL_ACCOUNTS as never, glAccountMappings: GL_MAPPINGS as never });
        const config = await readCatalogChargeConfig(client, ORG_ID, TODAY, gl);
        expect(config.accounts).toEqual(GL_ACCOUNTS);
        expect(config.mappings).toEqual(GL_MAPPINGS);
        expect(reads.has("gl_accounts") || reads.has("gl_account_mappings")).toBe(false);
        await expect(readCatalogChargeConfig(client, ORG_ID, TODAY, Promise.reject(new Error("gl down")))).rejects.toThrow("gl down");
    });

    it("every offered price is the price the command previews and writes", async () => {
        const opts = (await options()).filter((o) => o.availability === "offerable");
        for (const opt of opts) {
            const { supabase } = setup();
            const r = await previewTemplateCharge(supabase, ORG_ID, { templateId: "", catalogProductId: opt.id, ...ENROLLED, today: TODAY });
            expect(r.intent.eligible, opt.id).toBe(true);
            expect(r.intent.amountCents, opt.id).toBe(opt.amountCents);
        }
    });
});
