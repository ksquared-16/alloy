/**
 * ONE LOCATION RULE — the fee picker, the preview and the server judge a catalog item for the SAME site.
 *
 * Finding (2026-11-02 review): the card judged a location-scoped item against every site on the account —
 * any child's, any agreement's, ended ones included — while `charge.add` judges it against the one site the
 * selected child's charge is for (the agreement it writes against: active, else the most recent; a
 * household charge has none). An item could be listed as chargeable and then refused at preview, and Bulk
 * charge pooled sites across every household the same way.
 *
 * The rule is the command's, unchanged. These tests hold the pickers to it: the agreement the command
 * picks is the one the picker picks, each subject's verdict in the picker is the server's verdict for that
 * subject, and a selection the command would refuse is refused before it is sent.
 */
import { describe, expect, it } from "vitest";

import { __testables } from "@/lib/adminV2/actions/definitions/financialChargeActions";
import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import type { CommercialProductDef } from "@/lib/commercial/execution/commercialExport";
import { refusalBeforeSending, type BulkChargeInput } from "@/lib/financials/bulkCharge/bulkChargePlan";
import {
    catalogChargeOptions,
    catalogChargeOptionsForSubjects,
    evaluateCatalogCharge,
    type CatalogChargeConfig,
} from "@/lib/financials/catalogCharges/catalogChargeOffer";
import {
    catalogChargeRefusalFor,
    chargeSitesByChild,
    householdChargeSubjectKey,
    HOUSEHOLD_CHARGE_SUBJECT,
    selectBillableAgreement,
} from "@/lib/financials/catalogCharges/chargeSubjectSite";
import { previewTemplateCharge } from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import {
    BILLING_CUSTOMER_ID,
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    seedCanonicalBillingChain,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-29";
const NORTH = "site-north";
const SOUTH = "site-south";

/*
 * Three children, the three shapes the rule distinguishes:
 *   · ada  — ACTIVE at North (older), and a NEWER ended agreement at South. Her charge is for North.
 *   · ben  — only an ended agreement, at South. The most recent still owns his history: South.
 *   · cy   — no agreement at all. His charge falls back to the household, which is for no site.
 * Newest first, as the database returns `order("created_at", { ascending: false })`.
 */
const AGREEMENTS = [
    { id: "agr-ada-ended", org_id: ORG_ID, customer_id: BILLING_CUSTOMER_ID, customer_member_id: "ada", status: "ended", site_location_id: SOUTH, created_at: "2026-05-01T00:00:00Z" },
    { id: "agr-ben-ended", org_id: ORG_ID, customer_id: BILLING_CUSTOMER_ID, customer_member_id: "ben", status: "ended", site_location_id: SOUTH, created_at: "2026-04-01T00:00:00Z" },
    { id: "agr-ada-active", org_id: ORG_ID, customer_id: BILLING_CUSTOMER_ID, customer_member_id: "ada", status: "active", site_location_id: NORTH, created_at: "2026-01-01T00:00:00Z" },
];
const CHILDREN = ["ada", "ben", "cy"];

/* ── CATALOG: one item per site, one with no site ─────────────────────────────────────────────── */
const ACCOUNT = { id: "gl-fees", code: "4010", name: "Activity Revenue", type: "revenue", currency: "USD", is_active: true };
const MAPPING = { key: "activity_revenue", gl_account_id: ACCOUNT.id, is_active: true };
const CATEGORY = { id: "rc-mapped", org_id: ORG_ID, label: "Activities", mapped_gl_account_id: ACCOUNT.id, is_active: true, sort_order: 1 };
function productRow(id: string, name: string, locationId: string | null) {
    return {
        id, org_id: ORG_ID, location_id: locationId, program_key: null, name, commercial_type: "fee", amount_cents: 4000,
        cadence_key: null, revenue_category_id: CATEGORY.id, behavior: { required: false },
        effective_start: null, effective_end: null, is_active: true,
    };
}
const PRODUCT_ROWS = [
    productRow("p-any", "Any-site Fee", null),
    productRow("p-north", "North Fee", NORTH),
    productRow("p-south", "South Fee", SOUTH),
];
const asDef = (p: ReturnType<typeof productRow>): CommercialProductDef => ({
    id: p.id,
    commercialType: "fee" as CommercialProductDef["commercialType"],
    name: p.name,
    scope: { programKey: "", locationId: p.location_id },
    amountCents: p.amount_cents,
    cadenceKey: null,
    revenueCategoryId: p.revenue_category_id,
    behavior: p.behavior,
    effective: { start: null, end: null },
    isActive: true,
});
const CONFIG: CatalogChargeConfig = {
    products: PRODUCT_ROWS.map(asDef),
    revenueCategories: [{ id: CATEGORY.id, label: CATEGORY.label, glAccountId: ACCOUNT.id, isActive: true }],
    mappings: [MAPPING],
    accounts: [ACCOUNT],
};

const SITES = chargeSitesByChild(AGREEMENTS, CHILDREN);
const SUBJECTS = [
    { key: HOUSEHOLD_CHARGE_SUBJECT, locationId: null },
    ...CHILDREN.map((id) => ({ key: id, locationId: SITES.get(id) ?? null })),
];

describe("the agreement a child's charge is written against — one rule, both sides", () => {
    it("active wins over a newer ended agreement; else the most recent; none means the household", () => {
        expect(selectBillableAgreement(AGREEMENTS.filter((a) => a.customer_member_id === "ada"))?.id).toBe("agr-ada-active");
        expect(selectBillableAgreement(AGREEMENTS.filter((a) => a.customer_member_id === "ben"))?.id).toBe("agr-ben-ended");
        expect(selectBillableAgreement([])).toBeNull();
        expect(Object.fromEntries(SITES)).toEqual({ ada: NORTH, ben: SOUTH, cy: null });
    });

    it("the command's `resolveChargeSubject` picks the same agreement the picker reads the site from", async () => {
        const store = createOperationalEnrollmentMockStore({ ...seedCanonicalBillingChain(), child_enrollment_agreements: AGREEMENTS } as never);
        const supabase = createOperationalEnrollmentMockSupabase(store);
        for (const child of CHILDREN) {
            const subject = await __testables.resolveChargeSubject(supabase as never, ORG_ID, child, BILLING_CUSTOMER_ID);
            const expected = selectBillableAgreement(AGREEMENTS.filter((a) => a.customer_member_id === child));
            if (expected) expect(subject, child).toMatchObject({ ok: true, kind: "enrollment_agreement", agreementId: expected.id });
            else expect(subject, child).toEqual({ ok: true, kind: "customer", customerId: BILLING_CUSTOMER_ID });
        }
    });
});

describe("the picker's per-subject verdict is the server's verdict", () => {
    const options = catalogChargeOptionsForSubjects(CONFIG, { asOf: TODAY, subjects: SUBJECTS }, false);
    const byId = new Map(options.map((o) => [o.id, o]));

    it("names exactly the subjects each site item would be refused for — an ended agreement's site is not Ada's", () => {
        expect(byId.get("p-any")?.unavailableForSubjects).toEqual({});
        expect(Object.keys(byId.get("p-north")!.unavailableForSubjects).sort()).toEqual(["ben", "cy", HOUSEHOLD_CHARGE_SUBJECT].sort());
        /* The finding: South is on Ada's account (an ended agreement) but her charge is for North. */
        expect(Object.keys(byId.get("p-south")!.unavailableForSubjects).sort()).toEqual(["ada", "cy", HOUSEHOLD_CHARGE_SUBJECT].sort());
        expect(byId.get("p-south")!.unavailableForSubjects.ada).toMatch(/different location/);
    });

    it("for every item and every subject, the picker refuses exactly when `evaluateCatalogCharge` at that subject's site refuses", () => {
        for (const option of options) {
            const product = CONFIG.products.find((p) => p.id === option.id)!;
            for (const subject of SUBJECTS) {
                const server = evaluateCatalogCharge(product, CONFIG, { asOf: TODAY, locationIds: [subject.locationId] });
                const picker = catalogChargeRefusalFor(option, [{ key: subject.key }]);
                expect(picker === null, `${option.id} for ${subject.key}`).toBe(server.status === "offerable");
                if (server.status !== "offerable") expect(picker).toBe(server.reason);
            }
        }
    });

    it("a selection is refused when ANY selected subject is, naming that subject — as the multi-child preview does", () => {
        const north = byId.get("p-north")!;
        expect(catalogChargeRefusalFor(north, [{ key: "ada", label: "Ada" }])).toBeNull();
        expect(catalogChargeRefusalFor(north, [{ key: "ada", label: "Ada" }, { key: "ben", label: "Ben" }])).toMatch(/^Ben: .*different location/);
        expect(catalogChargeRefusalFor(north, [{ key: HOUSEHOLD_CHARGE_SUBJECT, label: "Household" }])).toMatch(/^Household: /);
    });

    it("lists an item when someone may be charged it, and not when no subject's site matches", () => {
        const onlyAda = catalogChargeOptionsForSubjects(CONFIG, { asOf: TODAY, subjects: [{ key: "ada", locationId: NORTH }] }, false);
        expect(onlyAda.map((o) => o.id).sort()).toEqual(["p-any", "p-north"]);
    });

    it("leaves the existing union reader unchanged — the pinned proof programs still call it", () => {
        const union = catalogChargeOptions(CONFIG, { asOf: TODAY, locationIds: [null, NORTH, SOUTH] }, false);
        expect(union.every((o) => !("unavailableForSubjects" in o))).toBe(true);
        expect(options.map(({ unavailableForSubjects: _, ...rest }) => rest)).toEqual(union);
    });
});

describe("the server refuses what the picker refuses, and accepts what it offers", () => {
    it("previews each item for each child's own agreement with the picker's verdict", async () => {
        const store = createOperationalEnrollmentMockStore({
            ...seedCanonicalBillingChain(),
            child_enrollment_agreements: AGREEMENTS,
            commercial_products: PRODUCT_ROWS,
            commercial_revenue_categories: [CATEGORY],
            gl_accounts: [{ ...ACCOUNT, org_id: ORG_ID }],
        } as never);
        (store as unknown as Record<string, unknown>).gl_account_mappings = [{ id: "map-fee", org_id: ORG_ID, ...MAPPING }];
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const options = catalogChargeOptionsForSubjects(CONFIG, { asOf: TODAY, subjects: SUBJECTS }, false);
        for (const child of ["ada", "ben"]) {
            const agreement = selectBillableAgreement(AGREEMENTS.filter((a) => a.customer_member_id === child))!;
            for (const option of options) {
                const r = await previewTemplateCharge(supabase, ORG_ID, {
                    templateId: "",
                    catalogProductId: option.id,
                    agreementId: agreement.id,
                    billableSource: { type: "enrollment_agreement", id: agreement.id },
                    today: TODAY,
                });
                const pickerRefusal = catalogChargeRefusalFor(option, [{ key: child }]);
                expect(r.intent.eligible, `${option.id} for ${child}: ${r.intent.reason ?? ""}`).toBe(pickerRefusal === null);
                if (pickerRefusal) expect(r.intent.reason).toBe(pickerRefusal);
            }
        }
        expect(store.charges).toHaveLength(0);
    });
});

describe("the card's read model judges each Applies-to subject at its own site", () => {
    it("carries the household and each child under the keys the card selects by", async () => {
        const members = CHILDREN.map((id) => ({ id, first_name: id, last_name: "Test", display_name: id, person_id: `per-${id}` }));
        const bundle = {
            resolved_customer_id: BILLING_CUSTOMER_ID,
            agreements: AGREEMENTS,
            members,
            reductions_by_agreement: [], commercial_policies: [], charges: [], reductions_by_charge: [],
            payment_allocations: [], responsibility_allocations: [], subsidy_claim_lines: [], payments_backing: [],
            responsibility_attributions: [], responsible_persons: [], funding_by_allocation: [], funding_by_share: [],
            funding_for_responsibility: [], subsidy_claims: [], subsidy_variances: [], collection_attempts: [],
            payments_by_source: [], payments_for_views: [], charges_for_allocations: [], payer_customers: [], payment_refunds: [],
            counts: { agreements: AGREEMENTS.length, charges: 0, allocations: 0, claim_lines: 0 },
        };
        const rows: Record<string, Array<Record<string, unknown>>> = {
            child_enrollment_agreements: AGREEMENTS,
            commercial_products: PRODUCT_ROWS,
            commercial_revenue_categories: [CATEGORY],
            gl_accounts: [{ ...ACCOUNT, org_id: ORG_ID }],
            gl_account_mappings: [{ id: "map-fee", org_id: ORG_ID, ...MAPPING }],
            financial_charge_templates: [],
        };
        const vm = await buildFinancialsCardVM(immediateClient(rows, bundle), {
            orgId: ORG_ID, customerId: BILLING_CUSTOMER_ID, customerMemberId: null, today: TODAY,
        });
        const subjectIds = vm.subjects.map((s) => s.customerMemberId);
        const south = vm.chargeTemplates.find((o) => o.id === "p-south")!;
        expect(south.availability).toBe("offerable");
        expect(south.unavailableForSubjects?.[HOUSEHOLD_CHARGE_SUBJECT]).toMatch(/different location/);
        /* The subjects are the agreement-backed children (Cy has none, so he is not an Applies-to child). */
        expect(subjectIds).toEqual(expect.arrayContaining(["ada", "ben"]));
        expect(south.unavailableForSubjects?.ada).toMatch(/different location/);
        expect(south.unavailableForSubjects?.ben).toBeUndefined();
    });
});

describe("Bulk charge refuses a target before sending, with the command's reason", () => {
    const south = catalogChargeOptionsForSubjects(
        CONFIG,
        {
            asOf: TODAY,
            subjects: [
                { key: householdChargeSubjectKey(BILLING_CUSTOMER_ID), locationId: null },
                ...CHILDREN.map((id) => ({ key: id, locationId: SITES.get(id) ?? null })),
            ],
        },
        false,
    ).find((o) => o.id === "p-south")!;
    const input = (grain: "child" | "household"): BulkChargeInput => ({
        catalogProductId: south.id, category: "fee", grain, serviceDate: TODAY, unavailableForSubjects: south.unavailableForSubjects,
    });
    const target = (children: string[]) => ({
        customerId: BILLING_CUSTOMER_ID,
        householdName: "Test",
        children: children.map((id) => ({ customerMemberId: id, name: id.toUpperCase() })),
    });

    it("a child at the item's site is sent; one whose charge is for another site is refused, by name", () => {
        expect(refusalBeforeSending(target(["ben"]), input("child"))).toBeNull();
        expect(refusalBeforeSending(target(["ben", "ada"]), input("child"))).toMatch(/^ADA: .*different location/);
    });

    it("a household target is judged at no site", () => {
        expect(refusalBeforeSending(target([]), input("household"))).toMatch(/different location/);
    });

    it("without per-subject verdicts every target is left to its preview, as before", () => {
        expect(refusalBeforeSending(target(["ada"]), { ...input("child"), unavailableForSubjects: undefined })).toBeNull();
    });
});

/* The card's read model over fixed rows — the same shape `catalogManualAddCharge.test.ts` uses. */
function immediateClient(rows: Record<string, Array<Record<string, unknown>>>, bundle: Record<string, unknown>) {
    const builder = (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const k of [
            "select", "eq", "in", "is", "not", "gte", "lte", "lt", "gt", "or", "order",
            "limit", "range", "neq", "overlaps", "contains",
        ]) {
            chain[k] = () => chain;
        }
        const answer = { data: rows[table] ?? [], error: null, count: (rows[table] ?? []).length };
        chain.maybeSingle = async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null });
        chain.single = chain.maybeSingle;
        chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(answer).then(resolve);
        return chain;
    };
    return {
        from: (t: string) => builder(t),
        rpc: (name: string) => ({
            then: (r: (v: unknown) => unknown) =>
                Promise.resolve({ data: name === "financials_account_fact_bundle" ? bundle : null, error: null }).then(r),
        }),
    } as never;
}
