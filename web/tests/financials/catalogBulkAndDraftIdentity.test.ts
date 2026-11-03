/**
 * CATALOG ADD CHARGE, PART 2 — Bulk charge uses the same rule, and historical drafts keep their identity.
 *
 *   · Bulk charge lists the catalog through the SAME `catalogChargeOptions` the account card uses, and
 *     a catalog item that does not apply to ONE selected child refuses that household's row in
 *     preview — before anything is written — rather than half-failing at commit.
 *   · A draft written from a charge TEMPLATE is edited under that template (or its current version),
 *     never under a catalog item that happens to share its name. A catalog draft is its own item.
 *   · New charges stay catalog-based: templates are never offered, even where they still exist.
 *
 * Fixture data only; neutral names; nothing from any tenant is hardcoded in the implementation.
 */
import { describe, expect, it } from "vitest";

import { financialChargeActions } from "@/lib/adminV2/actions/definitions/financialChargeActions";
import {
    bulkPreviewOutcome,
    chargeAddRequest,
    type BulkTarget,
} from "@/lib/financials/bulkCharge/bulkChargePlan";
import {
    catalogChargeOptions,
    loadCatalogChargeOptions,
    readCatalogChargeConfig,
} from "@/lib/financials/catalogCharges/catalogChargeOffer";
import {
    draftIdentityFromCharge,
    resolveDraftEditIdentity,
} from "@/lib/financials/catalogCharges/draftEditIdentity";
import { CHARGE_CATEGORY_GL_MAPPING_KEY } from "@/lib/financials/chargeCategories";
import {
    previewTemplateCharge,
    writeTemplateDraftCharge,
} from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import {
    BILLING_AGREEMENT_ID,
    BILLING_CUSTOMER_ID,
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    MEMBER_ID,
    ORG_ID,
    SITE_ID,
    seedCanonicalBillingChain,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-29";
const OTHER_SITE = "site-other";
const SECOND_MEMBER = "member-2";
const SECOND_AGREEMENT = "agr-2";

const FEE_ACCOUNT = { id: "gl-fees", org_id: ORG_ID, code: "4010", name: "Activity Revenue", type: "revenue", currency: "USD", is_active: true };
const DEFAULT_ACCOUNT = { id: "gl-default", org_id: ORG_ID, code: "4900", name: "Default Fee Revenue", type: "revenue", currency: "USD", is_active: true };
const GL_MAPPINGS = [
    { id: "map-fee", org_id: ORG_ID, key: "activity_revenue", gl_account_id: FEE_ACCOUNT.id, is_active: true },
    { id: "map-default", org_id: ORG_ID, key: CHARGE_CATEGORY_GL_MAPPING_KEY.fee, gl_account_id: DEFAULT_ACCOUNT.id, is_active: true },
];
const REVENUE_CATEGORIES = [
    { id: "rc-mapped", org_id: ORG_ID, label: "Activities", mapped_gl_account_id: FEE_ACCOUNT.id, is_active: true, sort_order: 1 },
    { id: "rc-unmapped", org_id: ORG_ID, label: "Unmapped", mapped_gl_account_id: null, is_active: true, sort_order: 2 },
];

function product(id: string, over: Record<string, unknown> = {}) {
    return {
        id, org_id: ORG_ID, location_id: null, program_key: null, name: `Item ${id}`, commercial_type: "fee",
        amount_cents: 2500, cadence_key: null, revenue_category_id: "rc-mapped", behavior: {},
        effective_start: null, effective_end: null, is_active: true, ...over,
    };
}

/* Two catalog items with ONE name, different prices — and a template with that same name. */
const SAME_NAME = "Registration fee";
const PRODUCTS = [
    product("p-reg-a", { name: SAME_NAME, amount_cents: 10000 }),
    product("p-reg-b", { name: SAME_NAME, amount_cents: 12500 }),
    product("p-site", { name: "Site Fee", amount_cents: 15000, location_id: SITE_ID }),
    product("p-monthly", { name: "Monthly Fee", cadence_key: "monthly" }),
    product("p-deposit", { name: "Deposit", commercial_type: "deposit" }),
    product("p-unmapped", { name: "Unmapped Fee", revenue_category_id: "rc-unmapped" }),
];
const TEMPLATE = {
    id: "tpl-reg-v2", org_id: ORG_ID, service_id: null, template_key: "registration_fee", label: SAME_NAME,
    charge_category: "fee", trigger_type: "manual", amount_strategy: "fixed", amount_cents: 7500,
    currency_code: "USD", occurs_on_strategy: "now", billable_on_strategy: "immediate", billable_offset_days: null,
    default_gl_mapping_key: "fee_revenue", default_responsibility_key: "household", review_required: false,
    is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
};

function setup() {
    const chain = seedCanonicalBillingChain();
    const store = createOperationalEnrollmentMockStore({
        ...chain,
        child_enrollment_agreements: [
            ...(chain.child_enrollment_agreements ?? []),
            /* A sibling in the same household, enrolled at a DIFFERENT site. */
            {
                id: SECOND_AGREEMENT, org_id: ORG_ID, customer_member_id: SECOND_MEMBER, customer_id: BILLING_CUSTOMER_ID,
                site_location_id: OTHER_SITE, status: "active", start_date: "2026-01-01", end_date: null,
            },
        ],
        customer_members: [
            ...(chain.customer_members ?? []),
            { id: SECOND_MEMBER, org_id: ORG_ID, customer_id: BILLING_CUSTOMER_ID, person_id: "person-2" },
        ],
        commercial_products: PRODUCTS,
        commercial_revenue_categories: REVENUE_CATEGORIES,
        gl_accounts: [FEE_ACCOUNT, DEFAULT_ACCOUNT],
        financial_charge_templates: [TEMPLATE],
        /*
         * A household attending two sites needs its OWN billing calendar — the binder refuses to pick
         * one site's period for it (correct domain behaviour, not this suite's subject).
         */
        financial_policies: [
            ...(chain.financial_policies ?? []),
            {
                id: "pol-billing-calendar-household", org_id: ORG_ID, scope_type: "customer", location_id: null,
                service_id: null, rate_plan_id: null, customer_id: BILLING_CUSTOMER_ID, policy_type: "billing_calendar",
                value: { cadence: "monthly", anchor_on: null }, is_active: true, effective_start: "2026-01-01",
                effective_end: null, metadata: {},
            },
        ],
    } as never);
    (store as unknown as Record<string, unknown>).gl_account_mappings = GL_MAPPINGS;
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

const addCharge = financialChargeActions.find((a) => a.actionKey === "charge.add")!;
const ENROLLED = { agreementId: BILLING_AGREEMENT_ID, billableSource: { type: "enrollment_agreement" as const, id: BILLING_AGREEMENT_ID } };

/** What `/api/admin/actions/execute` returns for a preview, built from the action's own answer. */
async function bulkPreview(supabase: unknown, target: BulkTarget, productId: string) {
    const req = chargeAddRequest(target, { catalogProductId: productId, category: "fee", grain: "child", serviceDate: TODAY }, "preview");
    const payload = { ...req.payload, today: TODAY } as Record<string, unknown>;
    const deps = {
        supabase,
        ctx: { orgId: ORG_ID, userId: "user-1" },
        payload,
        invocation: { actionKey: "charge.add", entityType: "customer", entityId: target.customerId, payload },
    } as never;
    const preview = await addCharge.buildPreview!(deps);
    return bulkPreviewOutcome({ ok: true, data: { execution_result: { eligibility: { eligible: true }, preview } } });
}

describe("Bulk charge offers the catalog through the card's own rule", () => {
    it("the bulk loader and the card's builder produce the same options from the same catalog", async () => {
        const { supabase } = setup();
        const ctx = { asOf: TODAY, locationIds: [null, SITE_ID] };
        const loaded = await loadCatalogChargeOptions(supabase, ORG_ID, ctx);
        const direct = catalogChargeOptions(await readCatalogChargeConfig(supabase, ORG_ID, TODAY), ctx, false);
        expect(loaded).toEqual(direct);
        expect(loaded.every((o) => o.source === "catalog")).toBe(true);
        /* Never tuition, never a template category: a catalog one-time fee is recorded as `fee`. */
        expect(new Set(loaded.map((o) => o.categoryKey))).toEqual(new Set(["fee"]));
        expect(loaded.map((o) => o.id)).not.toContain(TEMPLATE.id);
    });

    it("one-time fees are chargeable; other types listed with reasons; missing accounting blocked", async () => {
        const { supabase } = setup();
        const opts = await loadCatalogChargeOptions(supabase, ORG_ID, { asOf: TODAY, locationIds: [null, SITE_ID] });
        const by = new Map(opts.map((o) => [o.id, o]));
        expect(by.get("p-reg-a")?.availability).toBe("offerable");
        expect(by.get("p-site")?.availability).toBe("offerable");
        expect(by.get("p-monthly")).toMatchObject({ availability: "unsupported" });
        expect(by.get("p-monthly")?.unavailableReason).toMatch(/^Monthly — a recurring Catalog item/);
        expect(by.get("p-deposit")).toMatchObject({ availability: "unsupported" });
        expect(by.get("p-unmapped")).toMatchObject({ availability: "blocked", accountLabel: null });
        expect(by.get("p-unmapped")?.unavailableReason).toMatch(/not mapped to a GL account/);
    });

    it("a household whose children all attend the item's site previews READY at the configured amount", async () => {
        const { supabase } = setup();
        const outcome = await bulkPreview(supabase, {
            customerId: BILLING_CUSTOMER_ID, householdName: "H", children: [{ customerMemberId: MEMBER_ID, name: "Ada" }],
        }, "p-site");
        expect(outcome.state).toBe("previewed");
        if (outcome.state === "previewed") expect(outcome.summary).toMatch(/^Site Fee \$150\.00/);
    });

    it("a household with ONE child at another site is REFUSED in preview, naming that child — nothing is sent", async () => {
        const { store, supabase } = setup();
        const outcome = await bulkPreview(supabase, {
            customerId: BILLING_CUSTOMER_ID,
            householdName: "H",
            children: [
                { customerMemberId: MEMBER_ID, name: "Ada" },
                { customerMemberId: SECOND_MEMBER, name: "Ben" },
            ],
        }, "p-site");
        expect(outcome.state).toBe("refused");
        if (outcome.state === "refused") expect(outcome.reason).toMatch(/^Ben: .*different location/);
        expect(store.charges).toHaveLength(0);
    });

    it("an org-wide fee previews ready for both children, and each child's write is that fee at that price", async () => {
        const { store, supabase } = setup();
        const target = {
            customerId: BILLING_CUSTOMER_ID,
            householdName: "H",
            children: [
                { customerMemberId: MEMBER_ID, name: "Ada" },
                { customerMemberId: SECOND_MEMBER, name: "Ben" },
            ],
        };
        expect((await bulkPreview(supabase, target, "p-reg-b")).state).toBe("previewed");
        for (const [agreement] of [[BILLING_AGREEMENT_ID], [SECOND_AGREEMENT]]) {
            await writeTemplateDraftCharge(supabase, ORG_ID, {
                templateId: "", catalogProductId: "p-reg-b", agreementId: agreement,
                billableSource: { type: "enrollment_agreement", id: agreement }, today: TODAY,
            });
        }
        const rows = store.charges as Array<Record<string, unknown>>;
        expect(rows).toHaveLength(2);
        for (const r of rows) {
            expect(r.amount_cents).toBe(12500);
            expect((r.metadata as Record<string, unknown>).gl_mapping_key).toBe("activity_revenue");
            expect(((r.metadata as Record<string, unknown>).catalog_item as Record<string, unknown>).product_id).toBe("p-reg-b");
        }
    });

    it("bulkPreviewOutcome: a request failure, an ineligible subject and a blocked preview are all refused", () => {
        expect(bulkPreviewOutcome({ ok: false, error: "nope" })).toEqual({ state: "refused", reason: "nope" });
        expect(bulkPreviewOutcome({
            ok: true, data: { execution_result: { eligibility: { eligible: false, blockers: [{ message: "no subject" }] } } },
        })).toEqual({ state: "refused", reason: "no subject" });
        expect(bulkPreviewOutcome({
            ok: true, data: { execution_result: { eligibility: { eligible: true }, preview: { summary: "x", changes: [], blocked: { reason: "why" } } } },
        })).toEqual({ state: "refused", reason: "why" });
        expect(bulkPreviewOutcome({
            ok: true, data: { execution_result: { eligibility: { eligible: true }, preview: { summary: "ok", changes: ["a"] } } },
        })).toEqual({ state: "previewed", summary: "ok", changes: ["a"] });
    });
});

describe("same-name and duplicate catalog items are told apart by identity", () => {
    it("two items with one name are two options, each previewed and written at its own price", async () => {
        const { store, supabase } = setup();
        const opts = await loadCatalogChargeOptions(supabase, ORG_ID, { asOf: TODAY, locationIds: [null, SITE_ID] });
        const same = opts.filter((o) => o.label === SAME_NAME);
        expect(same.map((o) => [o.id, o.amountCents])).toEqual(expect.arrayContaining([["p-reg-a", 10000], ["p-reg-b", 12500]]));
        for (const o of same) {
            const r = await previewTemplateCharge(supabase, ORG_ID, { templateId: "", catalogProductId: o.id, ...ENROLLED, today: TODAY });
            expect(r.intent.amountCents, o.id).toBe(o.amountCents);
            await writeTemplateDraftCharge(supabase, ORG_ID, { templateId: "", catalogProductId: o.id, ...ENROLLED, today: TODAY });
        }
        const rows = store.charges as Array<Record<string, unknown>>;
        /* Distinct identities → distinct resolution keys → two charges, never one deduped by name. */
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => ((r.metadata as Record<string, unknown>).catalog_item as Record<string, unknown>).product_id).sort())
            .toEqual(["p-reg-a", "p-reg-b"]);
    });
});

describe("a historical TEMPLATE draft keeps its template identity", () => {
    const pools = {
        draftTemplates: [{ id: TEMPLATE.id, label: SAME_NAME, templateKey: TEMPLATE.template_key }],
        catalogOptions: [
            { id: "p-reg-a", label: SAME_NAME, availability: "offerable" as const },
            { id: "p-reg-b", label: SAME_NAME, availability: "offerable" as const },
        ],
    };

    it("is edited under its own template — even when catalog items carry the same name", () => {
        expect(resolveDraftEditIdentity(
            { chargeTemplateId: TEMPLATE.id, chargeTemplateKey: "registration_fee", catalogProductId: null }, pools,
        )).toEqual({ id: TEMPLATE.id, label: SAME_NAME, source: "template" });
    });

    it("a superseded version is edited under the version of the same template_key in force now", () => {
        expect(resolveDraftEditIdentity(
            { chargeTemplateId: "tpl-reg-v1", chargeTemplateKey: "registration_fee", catalogProductId: null }, pools,
        )).toEqual({ id: TEMPLATE.id, label: SAME_NAME, source: "template" });
    });

    it("a template with no current version and no catalog counterpart is not editable — never converted", () => {
        expect(resolveDraftEditIdentity(
            { chargeTemplateId: "tpl-gone", chargeTemplateKey: "retired_fee", catalogProductId: null }, pools,
        )).toBeNull();
    });

    it("a template draft whose template is gone is NOT re-pointed at a same-name catalog item", () => {
        expect(resolveDraftEditIdentity(
            { chargeTemplateId: "tpl-gone", chargeTemplateKey: "gone_key", catalogProductId: null },
            { draftTemplates: [], catalogOptions: pools.catalogOptions },
        )).toBeNull();
    });

    it("a catalog draft is edited as exactly its own item among duplicates, and not when it is unavailable", () => {
        expect(resolveDraftEditIdentity({ chargeTemplateId: null, chargeTemplateKey: null, catalogProductId: "p-reg-b" }, pools))
            .toEqual({ id: "p-reg-b", label: SAME_NAME, source: "catalog" });
        expect(resolveDraftEditIdentity(
            { chargeTemplateId: null, chargeTemplateKey: null, catalogProductId: "p-reg-b" },
            { ...pools, catalogOptions: [{ id: "p-reg-b", label: SAME_NAME, availability: "blocked" as const }] },
        )).toBeNull();
    });

    it("a draft that recorded neither identity is not editable by name", () => {
        expect(resolveDraftEditIdentity({ chargeTemplateId: null, chargeTemplateKey: null, catalogProductId: null }, pools)).toBeNull();
    });

    it("reads identity from what the charge recorded", () => {
        expect(draftIdentityFromCharge({ charge_template_id: "tpl-1", metadata: { charge_template_key: "k", source: "charge_template" } }))
            .toEqual({ chargeTemplateId: "tpl-1", chargeTemplateKey: "k", catalogProductId: null });
        expect(draftIdentityFromCharge({ charge_template_id: null, metadata: { catalog_item: { product_id: "p-1" } } }))
            .toEqual({ chargeTemplateId: null, chargeTemplateKey: null, catalogProductId: "p-1" });
    });

    it("editing a template draft writes through its template, with the same-name catalog present — no catalog provenance", async () => {
        const { store, supabase } = setup();
        const first = await writeTemplateDraftCharge(supabase, ORG_ID, { templateId: TEMPLATE.id, ...ENROLLED, today: TODAY });
        expect(first.status).toBe("created");
        /* The edit contract: the same template, a different service date → its own draft, template intact. */
        const edited = await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: TEMPLATE.id, ...ENROLLED, operatorServiceDate: "2026-06-30", today: TODAY,
        });
        expect(edited.status).toBe("created");
        for (const row of store.charges as Array<Record<string, unknown>>) {
            expect(row).toMatchObject({ charge_template_id: TEMPLATE.id, amount_cents: 7500, description: "registration_fee" });
            expect(row.metadata).toMatchObject({ source: "charge_template", charge_template_key: "registration_fee" });
            expect((row.metadata as Record<string, unknown>).catalog_item).toBeUndefined();
        }
    });

    it("the action still previews a template draft by template_id, under the template's historical summary", async () => {
        const { supabase } = setup();
        const payload = { customer_id: BILLING_CUSTOMER_ID, customer_member_id: MEMBER_ID, template_id: TEMPLATE.id, today: TODAY };
        const preview = await addCharge.buildPreview!({
            supabase, ctx: { orgId: ORG_ID, userId: "user-1" }, payload,
            invocation: { actionKey: "charge.add", entityType: "customer", entityId: BILLING_CUSTOMER_ID, payload },
        } as never);
        expect(preview.blocked ?? null).toBeNull();
        expect(preview.summary).toMatch(/^registration_fee \$75\.00/);
    });
});
