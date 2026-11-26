/**
 * A CATALOG ITEM'S GL CODE — chosen from the org's accounts, and chargeable once saved.
 *
 * Operator request (2026-11-02): each chargeable Catalog item gets a GL Code dropdown of the
 * organization's existing eligible GL codes ("4020 · Activity Fees"); the saved selection is the one
 * Add Charge, bulk charge, preview and posting use. The disconnect it closes: an item whose account no
 * charge-category mapping happened to name was shown with that account and still refused as
 * `catalog_posting_mapping_missing`. Saving must establish or reference the posting mapping — never
 * a fallback account, a duplicate account, or a remap of an existing charge.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readCatalogChargeConfig, evaluateCatalogCharge } from "@/lib/financials/catalogCharges/catalogChargeOffer";
import {
    catalogGlAccountOptions,
    catalogGlMappingKey,
} from "@/lib/financials/catalogCharges/catalogGlCodes";
import { ensureCatalogGlSelection } from "@/lib/financials/catalogCharges/catalogGlSelection";
import { CHARGE_CATEGORY_GL_MAPPING_KEY } from "@/lib/financials/chargeCategories";
import { writeTemplateDraftCharge } from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import {
    BILLING_CUSTOMER_ID,
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    seedCanonicalBillingChain,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-29";
const OTHER_ORG = "org-other";

const ACTIVITY = { id: "gl-4020", org_id: ORG_ID, code: "4020", name: "Activity Fees", type: "revenue", currency: "USD", is_active: true };
const DEFAULT_FEE = { id: "gl-4900", org_id: ORG_ID, code: "4900", name: "Default Fee Revenue", type: "revenue", currency: "USD", is_active: true };
const RETIRED = { id: "gl-4030", org_id: ORG_ID, code: "4030", name: "Retired Revenue", type: "revenue", currency: "USD", is_active: false };
const BANK = { id: "gl-1010", org_id: ORG_ID, code: "1010", name: "Operating Bank", type: "asset", currency: "USD", is_active: true };
const FOREIGN = { id: "gl-other-org", org_id: OTHER_ORG, code: "4020", name: "Someone Else's Fees", type: "revenue", currency: "USD", is_active: true };
const ACCOUNTS = [ACTIVITY, DEFAULT_FEE, RETIRED, BANK, FOREIGN];

/* The only mapping before the save: the fee category's default, on a DIFFERENT account. */
const CATEGORY_DEFAULT = { id: "map-fee", org_id: ORG_ID, key: CHARGE_CATEGORY_GL_MAPPING_KEY.fee, gl_account_id: DEFAULT_FEE.id, is_active: true };

/* An item that names 4020 through its revenue category, and was refused for want of a mapping. */
const ORPHAN_CATEGORY = { id: "rc-orphan", org_id: ORG_ID, label: "Activities", mapped_gl_account_id: ACTIVITY.id, is_active: true, sort_order: 1 };
const ITEM = {
    id: "p-activity", org_id: ORG_ID, location_id: null, program_key: null, name: "Field Day Fee", commercial_type: "fee",
    amount_cents: 2500, cadence_key: null, revenue_category_id: ORPHAN_CATEGORY.id, behavior: { required: false },
    effective_start: null, effective_end: null, is_active: true,
};
const ANNUAL = { ...ITEM, id: "p-annual", name: "Annual Membership", cadence_key: "annual", revenue_category_id: "rc-unmapped-annual" };

/* A charge booked before the save, through the category default — it must keep exactly that. */
const HISTORICAL = {
    id: "ch-historical", org_id: ORG_ID, amount_cents: 1800, currency_code: "USD", status: "posted", charge_category: "fee",
    metadata: { gl_mapping_key: CHARGE_CATEGORY_GL_MAPPING_KEY.fee, source: "charge_template" },
};

function setup(over: { mappings?: unknown[]; categories?: unknown[] } = {}) {
    const store = createOperationalEnrollmentMockStore({
        ...seedCanonicalBillingChain(),
        commercial_products: [ITEM, ANNUAL],
        commercial_revenue_categories: over.categories ?? [ORPHAN_CATEGORY],
        gl_accounts: ACCOUNTS,
    } as never) as unknown as Record<string, unknown[]>;
    store.gl_account_mappings = (over.mappings ?? [CATEGORY_DEFAULT]).map((m) => ({ ...(m as object) }));
    store.charges = [...(store.charges ?? []), { ...HISTORICAL, metadata: { ...HISTORICAL.metadata } }];
    return { store, supabase: createOperationalEnrollmentMockSupabase(store as never) };
}

const judge = async (supabase: Parameters<typeof readCatalogChargeConfig>[0], id: string) => {
    const config = await readCatalogChargeConfig(supabase, ORG_ID, TODAY);
    return evaluateCatalogCharge(config.products.find((p) => p.id === id)!, config, { asOf: TODAY, locationIds: [null] });
};

describe("the dropdown — the organization's existing eligible GL codes", () => {
    it("lists active revenue accounts as `code · name`, by code; never inactive, non-revenue or another org's after filtering", () => {
        const own = ACCOUNTS.filter((a) => a.org_id === ORG_ID);
        expect(catalogGlAccountOptions(own).map((o) => o.label)).toEqual(["4020 · Activity Fees", "4900 · Default Fee Revenue"]);
    });

    it("keeps a saved selection that is no longer eligible — flagged with why — instead of showing another account", () => {
        const options = catalogGlAccountOptions([ACTIVITY, RETIRED], RETIRED.id);
        expect(options.find((o) => o.id === RETIRED.id)).toMatchObject({ eligible: false, ineligibleReason: expect.stringMatching(/4030 · Retired Revenue is inactive/) });
    });
});

describe("saving an eligible GL Code establishes or references the posting mapping", () => {
    it("the item that was refused for want of a mapping becomes chargeable — to ITS account, not the category default", async () => {
        const { store, supabase } = setup();
        const before = await judge(supabase, ITEM.id);
        expect(before).toMatchObject({ status: "blocked", code: "catalog_posting_mapping_missing" });
        if (before.status === "blocked") expect(before.reason).toMatch(/4020 · Activity Fees is not set up for posting yet.*save its GL Code/);

        const saved = await ensureCatalogGlSelection(supabase, { orgId: ORG_ID, glAccountId: ACTIVITY.id, currentRevenueCategoryId: ITEM.revenue_category_id });
        expect(saved).toMatchObject({
            ok: true,
            revenueCategoryId: ORPHAN_CATEGORY.id, // referenced — the item's own category already names 4020
            mappingKey: catalogGlMappingKey(ACTIVITY.id),
            established: { revenueCategory: false, mapping: "created" },
        });

        const after = await judge(supabase, ITEM.id);
        expect(after.status).toBe("offerable");
        if (after.status !== "offerable") return;
        expect(after.account).toMatchObject({ id: ACTIVITY.id, code: "4020", mappingKey: catalogGlMappingKey(ACTIVITY.id) });

        /* No duplicate account, the category default untouched, exactly one new mapping. */
        expect(store.gl_accounts).toHaveLength(ACCOUNTS.length);
        expect(store.gl_account_mappings).toEqual([
            expect.objectContaining({ key: CHARGE_CATEGORY_GL_MAPPING_KEY.fee, gl_account_id: DEFAULT_FEE.id, is_active: true }),
            expect.objectContaining({ key: catalogGlMappingKey(ACTIVITY.id), gl_account_id: ACTIVITY.id, is_active: true }),
        ]);
    });

    it("a charge written after the save records the account's own mapping key; a historical charge keeps its key", async () => {
        const { store, supabase } = setup();
        await ensureCatalogGlSelection(supabase, { orgId: ORG_ID, glAccountId: ACTIVITY.id, currentRevenueCategoryId: ITEM.revenue_category_id });
        const written = await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: "", catalogProductId: ITEM.id, agreementId: null, billableSource: { type: "customer", id: BILLING_CUSTOMER_ID }, today: TODAY,
        });
        expect(written.status).toBe("created");
        const charges = store.charges as Array<{ id: string; metadata: Record<string, unknown> }>;
        const fresh = charges.find((c) => c.id !== HISTORICAL.id)!;
        expect(fresh.metadata).toMatchObject({
            gl_mapping_key: catalogGlMappingKey(ACTIVITY.id),
            catalog_item: expect.objectContaining({ gl_account_id: ACTIVITY.id, gl_account_code: "4020", gl_mapping_key: catalogGlMappingKey(ACTIVITY.id) }),
        });
        expect(charges.find((c) => c.id === HISTORICAL.id)).toEqual(HISTORICAL);
    });

    it("saving again references what exists — idempotent, nothing new", async () => {
        const { store, supabase } = setup();
        await ensureCatalogGlSelection(supabase, { orgId: ORG_ID, glAccountId: ACTIVITY.id, currentRevenueCategoryId: ORPHAN_CATEGORY.id });
        const again = await ensureCatalogGlSelection(supabase, { orgId: ORG_ID, glAccountId: ACTIVITY.id, currentRevenueCategoryId: ORPHAN_CATEGORY.id });
        expect(again).toMatchObject({ ok: true, established: { revenueCategory: false, mapping: "referenced" } });
        expect(store.gl_account_mappings).toHaveLength(2);
        expect(store.commercial_revenue_categories).toHaveLength(1);
    });

    it("an account no revenue category names yet gets ONE category, labelled with the account, and its mapping", async () => {
        const { store, supabase } = setup({ categories: [] });
        const saved = await ensureCatalogGlSelection(supabase, { orgId: ORG_ID, glAccountId: ACTIVITY.id });
        expect(saved).toMatchObject({ ok: true, established: { revenueCategory: true, mapping: "created" } });
        expect(store.commercial_revenue_categories).toEqual([
            expect.objectContaining({ label: "4020 · Activity Fees", gl_code: "4020", mapped_gl_account_id: ACTIVITY.id, is_active: true }),
        ]);
    });

    it("an inactive (cleared) mapping of the account is reactivated, not duplicated", async () => {
        const { store, supabase } = setup({
            mappings: [CATEGORY_DEFAULT, { id: "map-own", org_id: ORG_ID, key: catalogGlMappingKey(ACTIVITY.id), gl_account_id: ACTIVITY.id, is_active: false }],
        });
        const saved = await ensureCatalogGlSelection(supabase, { orgId: ORG_ID, glAccountId: ACTIVITY.id, currentRevenueCategoryId: ORPHAN_CATEGORY.id });
        expect(saved).toMatchObject({ ok: true, established: { mapping: "reactivated" } });
        expect(store.gl_account_mappings).toHaveLength(2);
        expect(store.gl_account_mappings[1]).toMatchObject({ id: "map-own", is_active: true });
    });

    it("a derived mapping that names another account (tampered) is refused and left alone — never repointed", async () => {
        const tampered = { id: "map-own", org_id: ORG_ID, key: catalogGlMappingKey(ACTIVITY.id), gl_account_id: DEFAULT_FEE.id, is_active: true };
        const { store, supabase } = setup({ mappings: [CATEGORY_DEFAULT, tampered] });
        const saved = await ensureCatalogGlSelection(supabase, { orgId: ORG_ID, glAccountId: ACTIVITY.id, currentRevenueCategoryId: ORPHAN_CATEGORY.id });
        expect(saved).toMatchObject({ ok: false, status: 409 });
        expect(store.gl_account_mappings[1]).toEqual(tampered);
    });
});

describe("a selection that cannot be honoured is explained before anything is saved", () => {
    it.each([
        ["another organization's account", FOREIGN.id, 400, /does not exist in this organization/],
        ["an unknown id", "gl-missing", 400, /does not exist in this organization/],
        ["an inactive account", RETIRED.id, 400, /4030 · Retired Revenue is inactive/],
        ["a non-revenue account", BANK.id, 400, /1010 · Operating Bank is not a revenue account/],
    ])("%s → refused (%s), writing nothing", async (_label, glAccountId, status, error) => {
        const { store, supabase } = setup();
        const result = await ensureCatalogGlSelection(supabase, { orgId: ORG_ID, glAccountId });
        expect(result).toMatchObject({ ok: false, status, error: expect.stringMatching(error) });
        expect(store.gl_account_mappings).toEqual([CATEGORY_DEFAULT]);
        expect(store.commercial_revenue_categories).toEqual([ORPHAN_CATEGORY]);
    });

    it("a category label already taken by a category on another account is refused, not repurposed", async () => {
        const taken = { id: "rc-taken", org_id: ORG_ID, label: "4020 · Activity Fees", mapped_gl_account_id: DEFAULT_FEE.id, is_active: true, sort_order: 5 };
        const { store, supabase } = setup({ categories: [taken] });
        const result = await ensureCatalogGlSelection(supabase, { orgId: ORG_ID, glAccountId: ACTIVITY.id });
        expect(result).toMatchObject({ ok: false, status: 409 });
        expect(store.commercial_revenue_categories).toEqual([taken]);
        expect(store.gl_account_mappings).toEqual([CATEGORY_DEFAULT]);
    });
});

describe("a recurring item's explanation stays separate from GL setup", () => {
    it("an annual item says it is recurring — never a GL mapping error — and is not converted to one-time", async () => {
        const { store, supabase } = setup();
        const e = await judge(supabase, ANNUAL.id);
        expect(e).toMatchObject({ status: "unsupported", code: "catalog_recurring_not_manual" });
        if (e.status !== "offerable") expect(e.reason).not.toMatch(/GL|posting/);
        expect((store.commercial_products as Array<{ id: string; cadence_key: string | null }>).find((p) => p.id === ANNUAL.id)!.cadence_key).toBe("annual");
    });
});

describe("the normal application flow reaches it", () => {
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
    it.each(["app/api/admin/commercial/products/route.ts", "app/api/admin/commercial/products/[id]/route.ts"])(
        "%s resolves gl_account_id through ensureCatalogGlSelection BEFORE writing the item, and refuses with its reason",
        (rel) => {
            const src = read(rel);
            const ensure = src.indexOf("ensureCatalogGlSelection(supabase");
            const write = src.search(/\.from\("commercial_products"\)\s*\.(insert|update)\(/);
            expect(ensure).toBeGreaterThan(-1);
            expect(write).toBeGreaterThan(ensure);
            expect(src).toContain('{ error: gl.error, field: "gl_account_id" }');
        },
    );

    it("the Catalog GL dropdown only READS accounts — it never creates categories or mappings on load", () => {
        const src = read("components/adminV2/settings/financials/catalog/CatalogGlCodeSelect.tsx");
        expect(src).toContain('fetch("/api/admin/financials/accounts"');
        expect(src).not.toMatch(/method:\s*"(POST|PUT|PATCH)"|ensureRevenueCategories|fetchGlCodeOptionSources/);
        const page = read("components/adminV2/settings/financials/catalog/CatalogConfigurationPage.tsx");
        expect(page).toContain("gl_account_id: glAccountId");
        expect(page).not.toContain("<GlCodeSelect");
    });
});
