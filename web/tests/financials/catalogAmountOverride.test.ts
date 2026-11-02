/**
 * A CATALOG CHARGE'S AMOUNT, OVERRIDDEN FOR THAT ONE CHARGE.
 *
 * Operator request (2026-11-02): each charge defaults to the Catalog price; an authorized user may
 * change the amount before submitting. The override applies only to that charge — never to the
 * Catalog item or an existing charge. The server validates permission, amount and precision, and the
 * charge keeps the original Catalog price, the final amount, the actor and the reason. Negative is
 * refused; zero follows the existing rule (a charge is never $0 — a fee is forgiven by waiving it).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const grants = { keys: ["fin.write", "fin.adjust"] as string[] };
vi.mock("@/lib/access/actorPermissionGrants", () => ({
    resolveActorPermissionGrants: async () => ({ permissionKeys: [...grants.keys] }),
}));

const { financialChargeActions } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
const {
    CATALOG_AMOUNT_OVERRIDE_MAX_CENTS,
    centsFromAmountInput,
    parseCatalogAmountOverride,
} = await import("@/lib/financials/catalogCharges/catalogAmountOverride");
const { previewTemplateCharge, writeTemplateDraftCharge } = await import("@/lib/financials/chargeLifecycle/chargeLifecycleService");
const {
    BILLING_CUSTOMER_ID,
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    seedCanonicalBillingChain,
} = await import("../childcareOperational/mockOperationalEnrollmentSupabase");

const TODAY = "2026-06-29";
const ACCOUNT = { id: "gl-4020", org_id: ORG_ID, code: "4020", name: "Activity Fees", type: "revenue", currency: "USD", is_active: true };
const MAPPING = { id: "map-own", org_id: ORG_ID, key: `catalog_gl_account:${ACCOUNT.id}`, gl_account_id: ACCOUNT.id, is_active: true };
const CATEGORY = { id: "rc-activity", org_id: ORG_ID, label: "4020 · Activity Fees", mapped_gl_account_id: ACCOUNT.id, is_active: true, sort_order: 1 };
const ITEM = {
    id: "p-field-day", org_id: ORG_ID, location_id: null, program_key: null, name: "Field Day Fee", commercial_type: "fee",
    amount_cents: 2500, cadence_key: null, revenue_category_id: CATEGORY.id, behavior: { required: false },
    effective_start: null, effective_end: null, is_active: true,
};
const HISTORICAL = {
    id: "ch-historical", org_id: ORG_ID, amount_cents: 2500, currency_code: "USD", status: "posted", charge_category: "fee",
    metadata: { source: "commercial_catalog", catalog_item: { product_id: ITEM.id, amount_cents: 2500 } },
};
const HOUSEHOLD = { agreementId: null, billableSource: { type: "customer" as const, id: BILLING_CUSTOMER_ID } };

function setup() {
    const store = createOperationalEnrollmentMockStore({
        ...seedCanonicalBillingChain(),
        commercial_products: [{ ...ITEM }],
        commercial_revenue_categories: [CATEGORY],
        gl_accounts: [ACCOUNT],
    } as never) as unknown as Record<string, Array<Record<string, unknown>>>;
    store.gl_account_mappings = [{ ...MAPPING }];
    store.charges = [...(store.charges ?? []), structuredClone(HISTORICAL)];
    return { store, supabase: createOperationalEnrollmentMockSupabase(store as never) };
}
const fresh = (store: Record<string, Array<Record<string, unknown>>>) => store.charges.filter((c) => c.id !== HISTORICAL.id);

beforeEach(() => {
    grants.keys = ["fin.write", "fin.adjust"];
});

describe("what an override may be — validated, never coerced", () => {
    it("absent is no override; a whole-cent amount with a reason is one", () => {
        expect(parseCatalogAmountOverride(undefined)).toEqual({ ok: true, override: null });
        expect(parseCatalogAmountOverride({ amount_cents: 3000, reason: "Late registration" })).toEqual({
            ok: true, override: { amountCents: 3000, reason: "Late registration" },
        });
    });

    it.each([
        ["a negative amount", { amount_cents: -100, reason: "credit" }, "amount_override_negative"],
        ["zero (a charge is never $0 — waive it instead)", { amount_cents: 0, reason: "waived" }, "amount_override_zero"],
        ["a fraction of a cent", { amount_cents: 2999.5, reason: "rounding" }, "amount_override_precision"],
        ["a string amount (tampered)", { amount_cents: "3000", reason: "string" }, "amount_override_invalid"],
        ["no amount", { reason: "nothing" }, "amount_override_invalid"],
        ["an amount past the ceiling", { amount_cents: CATALOG_AMOUNT_OVERRIDE_MAX_CENTS + 1, reason: "typo" }, "amount_override_too_large"],
        ["no reason", { amount_cents: 3000 }, "amount_override_reason_required"],
        ["a two-character reason", { amount_cents: 3000, reason: " ok " }, "amount_override_reason_required"],
        ["not an object", 3000, "amount_override_invalid"],
    ])("%s is refused (%s)", (_label, raw, code) => {
        expect(parseCatalogAmountOverride(raw)).toMatchObject({ ok: false, code });
    });

    it.each([
        ["30", 3000], ["30.5", 3050], ["30.05", 3005], ["1,250.00", 125000], ["$19.99", 1999], ["0.01", 1],
        ["30.555", null], ["-5", null], ["", null], ["abc", null], ["1e3", null], ["30.", null],
    ])("typed %j is %j cents — never rounded", (input, cents) => {
        expect(centsFromAmountInput(input)).toBe(cents);
    });
});

describe("the charge is priced by the override, and says so — the Catalog item and other charges are untouched", () => {
    it("writes the override amount and records Catalog price, final amount, difference, actor and reason", async () => {
        const { store, supabase } = setup();
        const written = await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: "", catalogProductId: ITEM.id, ...HOUSEHOLD, today: TODAY, actorUserId: "user-director",
            catalogAmountOverride: { amountCents: 3150, reason: "Includes bus seat" },
        });
        expect(written.status).toBe("created");
        const [row] = fresh(store);
        expect(row).toMatchObject({ amount_cents: 3150, created_by: "user-director" });
        expect(row!.metadata).toMatchObject({
            catalog_item: expect.objectContaining({ product_id: ITEM.id, amount_cents: 2500 }),
            amount_override: {
                catalog_amount_cents: 2500, amount_cents: 3150, difference_cents: 650,
                reason: "Includes bus seat", actor_user_id: "user-director", at: expect.any(String),
            },
        });
        expect(store.commercial_products).toEqual([ITEM]);
        expect(store.charges.find((c) => c.id === HISTORICAL.id)).toEqual(HISTORICAL);
    });

    it("a lower amount (a discount by hand) is an override too, and records a negative difference", async () => {
        const { store, supabase } = setup();
        await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: "", catalogProductId: ITEM.id, ...HOUSEHOLD, today: TODAY,
            catalogAmountOverride: { amountCents: 1999, reason: "Sibling arrangement" },
        });
        expect(fresh(store)[0]).toMatchObject({ amount_cents: 1999, metadata: expect.objectContaining({ amount_override: expect.objectContaining({ difference_cents: -501 }) }) });
    });

    it("an override equal to the Catalog price is no override — nothing is recorded", async () => {
        const { store, supabase } = setup();
        await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: "", catalogProductId: ITEM.id, ...HOUSEHOLD, today: TODAY,
            catalogAmountOverride: { amountCents: 2500, reason: "Same as catalog" },
        });
        expect(fresh(store)[0]).toMatchObject({ amount_cents: 2500 });
        expect(fresh(store)[0]!.metadata).not.toHaveProperty("amount_override");
    });

    it("without an override the Catalog price is the price — a bare client amount is still ignored", async () => {
        const { store, supabase } = setup();
        await writeTemplateDraftCharge(supabase, ORG_ID, { templateId: "", catalogProductId: ITEM.id, ...HOUSEHOLD, unitAmountCents: 1, today: TODAY });
        expect(fresh(store)[0]).toMatchObject({ amount_cents: 2500 });
    });

    it("the preview shows the override amount, and the Catalog price beside it", async () => {
        const { supabase } = setup();
        const preview = await previewTemplateCharge(supabase, ORG_ID, {
            templateId: "", catalogProductId: ITEM.id, ...HOUSEHOLD, today: TODAY,
            catalogAmountOverride: { amountCents: 3150, reason: "Includes bus seat" },
        });
        expect(preview.intent).toMatchObject({ eligible: true, amountCents: 3150 });
        expect(preview.catalogPriceCents).toBe(2500);
    });

    it("an override never reprices an existing draft of the same charge — it is refused and the draft stands", async () => {
        const { store, supabase } = setup();
        await writeTemplateDraftCharge(supabase, ORG_ID, {
            templateId: "", catalogProductId: ITEM.id, ...HOUSEHOLD, today: TODAY,
            catalogAmountOverride: { amountCents: 3150, reason: "Includes bus seat" },
        });
        const before = structuredClone(fresh(store));
        for (const catalogAmountOverride of [{ amountCents: 4000, reason: "Changed my mind" }, null]) {
            const again = await writeTemplateDraftCharge(supabase, ORG_ID, { templateId: "", catalogProductId: ITEM.id, ...HOUSEHOLD, today: TODAY, catalogAmountOverride });
            expect(again).toMatchObject({ status: "not_writable", reason: expect.stringMatching(/already exists at \$31\.50.*Change or cancel that draft/) });
        }
        expect(fresh(store)).toEqual(before);
    });

    it("the same override again converges on the one charge (unchanged), as any re-run does", async () => {
        const { store, supabase } = setup();
        const args = { templateId: "", catalogProductId: ITEM.id, ...HOUSEHOLD, today: TODAY, catalogAmountOverride: { amountCents: 3150, reason: "Includes bus seat" } };
        await writeTemplateDraftCharge(supabase, ORG_ID, args);
        const again = await writeTemplateDraftCharge(supabase, ORG_ID, args);
        expect(again.status).toBe("unchanged");
        expect(fresh(store)).toHaveLength(1);
    });
});

describe("the command — permission and tampering are judged on the server", () => {
    const addCharge = financialChargeActions.find((a) => a.actionKey === "charge.add")!;
    const payload = (over: Record<string, unknown> = {}) => ({
        catalog_product_id: ITEM.id, subject_grain: "household", customer_id: BILLING_CUSTOMER_ID, today: TODAY,
        amount_override: { amount_cents: 3150, reason: "Includes bus seat" }, ...over,
    });

    it.each([
        ["a negative amount", { amount_override: { amount_cents: -1, reason: "credit" } }, "amount_override_negative"],
        ["zero", { amount_override: { amount_cents: 0, reason: "waive" } }, "amount_override_zero"],
        ["a fractional cent", { amount_override: { amount_cents: 10.001, reason: "rounding" } }, "amount_override_precision"],
        ["a template charge", { catalog_product_id: undefined, template_id: "tpl-1" }, "amount_override_unsupported"],
    ])("validation refuses %s (%s)", (_label, over, code) => {
        const r = addCharge.validatePayload!(payload(over) as never);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.blockers[0]!.code).toBe(code);
    });

    it("a caller with fin.write but not fin.adjust is refused at execute, and nothing is written", async () => {
        grants.keys = ["fin.write"];
        const { store, supabase } = setup();
        const r = await addCharge.execute!({
            supabase: supabase as never, ctx: { orgId: ORG_ID, userId: "user-biller" } as never,
            invocation: { entityType: "customer", entityId: BILLING_CUSTOMER_ID } as never, payload: payload(),
        } as never);
        expect(r.ok).toBe(false);
        expect(JSON.stringify(r)).toMatch(/fin\.adjust/);
        expect(fresh(store)).toHaveLength(0);
    });

    it("a tampered amount that skipped validation is still refused at execute", async () => {
        const { store, supabase } = setup();
        const r = await addCharge.execute!({
            supabase: supabase as never, ctx: { orgId: ORG_ID, userId: "user-director" } as never,
            invocation: { entityType: "customer", entityId: BILLING_CUSTOMER_ID } as never,
            payload: payload({ amount_override: { amount_cents: "1", reason: "tampered" } }),
        } as never);
        expect(r).toMatchObject({ ok: false, status: 400 });
        expect(fresh(store)).toHaveLength(0);
    });

    it("the same caller without an override may still add the charge at the Catalog price", async () => {
        grants.keys = ["fin.write"];
        const { store, supabase } = setup();
        const r = await addCharge.execute!({
            supabase: supabase as never, ctx: { orgId: ORG_ID, userId: "user-biller" } as never,
            invocation: { entityType: "customer", entityId: BILLING_CUSTOMER_ID } as never, payload: payload({ amount_override: undefined }),
        } as never);
        expect(r.ok).toBe(true);
        expect(fresh(store)[0]).toMatchObject({ amount_cents: 2500 });
    });

    it("an authorized override is written through the command with the actor recorded", async () => {
        const { store, supabase } = setup();
        const r = await addCharge.execute!({
            supabase: supabase as never, ctx: { orgId: ORG_ID, userId: "user-director" } as never,
            invocation: { entityType: "customer", entityId: BILLING_CUSTOMER_ID } as never, payload: payload(),
        } as never);
        expect(r.ok).toBe(true);
        expect(fresh(store)[0]).toMatchObject({
            amount_cents: 3150,
            metadata: expect.objectContaining({ amount_override: expect.objectContaining({ actor_user_id: "user-director", catalog_amount_cents: 2500 }) }),
        });
    });
});
