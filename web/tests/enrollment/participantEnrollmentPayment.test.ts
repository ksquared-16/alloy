/**
 * A PARENT MAY PAY THEIR OWN FEE, WITH THEIR OWN CARD, AND SEE NOBODY ELSE'S.
 *
 * The payment engine is already certified elsewhere. These guard the participant boundary that did
 * not exist before: whose instruments are offered, what a parent is allowed to be shown, and which
 * obligations a link can name.
 */
import { describe, expect, it } from "vitest";

import {
    buildParticipantPaymentView,
    payableChargeIds,
} from "@/lib/enrollment/financial/participantEnrollmentPayment";
import { readPayerUsableMethods } from "@/lib/financials/payments/paymentMethodService";
import type { PaymentMethodRecord } from "@/lib/financials/payments/paymentMethodService";
import type { EnrollmentFinancialRequirementProjection } from "@/lib/enrollment/financial/enrollmentFinancialRequirement";

const ORG = "org-1";
const HOUSEHOLD = "cust-1";
const MOM = "person-mom";
const DAD = "person-dad";

/** Rows as `payment_methods` actually holds them, so the query under test does the narrowing. */
const ROWS = [
    {
        id: "pm-mom-visa",
        org_id: ORG,
        payer_entity_type: "person",
        payer_entity_id: MOM,
        customer_id: HOUSEHOLD,
        rail: "card",
        processor: "stripe",
        provider_customer_ref: "cus_MOM_SECRET",
        provider_method_ref: "pm_MOM_SECRET",
        display_brand: "visa",
        display_last4: "1111",
        usability_state: "usable",
        verification_state: "verified",
        is_default: true,
    },
    {
        id: "pm-dad-mc",
        org_id: ORG,
        payer_entity_type: "person",
        payer_entity_id: DAD,
        customer_id: HOUSEHOLD,
        rail: "card",
        processor: "stripe",
        provider_customer_ref: "cus_DAD_SECRET",
        provider_method_ref: "pm_DAD_SECRET",
        display_brand: "mastercard",
        display_last4: "2222",
        usability_state: "usable",
        verification_state: "verified",
        is_default: true,
    },
    {
        id: "pm-mom-revoked",
        org_id: ORG,
        payer_entity_type: "person",
        payer_entity_id: MOM,
        customer_id: HOUSEHOLD,
        rail: "card",
        processor: "stripe",
        provider_customer_ref: "cus_MOM_SECRET",
        provider_method_ref: "pm_OLD",
        display_brand: "visa",
        display_last4: "9999",
        usability_state: "revoked",
        verification_state: "verified",
        is_default: false,
    },
    {
        id: "pm-mom-otherhouse",
        org_id: ORG,
        payer_entity_type: "person",
        payer_entity_id: MOM,
        customer_id: "cust-OTHER",
        rail: "card",
        processor: "stripe",
        provider_customer_ref: "cus_MOM_SECRET",
        provider_method_ref: "pm_OTHER",
        display_brand: "visa",
        display_last4: "7777",
        usability_state: "usable",
        verification_state: "verified",
        is_default: false,
    },
];

/** Honours `.eq` so the narrowing has to be in the query, and records what was asked. */
function fakeSupabase(rows: Record<string, unknown>[], eqs: string[] = []) {
    return {
        from() {
            let out = [...rows];
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (col: string, val: unknown) => {
                    eqs.push(col);
                    out = out.filter((r) => r[col] === val);
                    return api;
                },
                order: () => api,
                then: (resolve: (v: unknown) => unknown) => resolve({ data: out, error: null }),
            };
            return api;
        },
    } as never;
}

describe("whose payment methods a participant is offered", () => {
    it("gives the mother her own usable card and not the father's", async () => {
        const got = await readPayerUsableMethods(fakeSupabase(ROWS), {
            orgId: ORG,
            payerEntityType: "person",
            payerEntityId: MOM,
            customerId: HOUSEHOLD,
        });
        expect(got.map((m) => m.id)).toEqual(["pm-mom-visa"]);
        // The father's instrument is not filtered out of a result that contained it — it was never
        // read. A leak cannot happen to data that did not arrive.
        expect(JSON.stringify(got)).not.toContain("DAD");
        expect(JSON.stringify(got)).not.toContain("2222");
    });

    it("gives the father his own card and not the mother's", async () => {
        const got = await readPayerUsableMethods(fakeSupabase(ROWS), {
            orgId: ORG,
            payerEntityType: "person",
            payerEntityId: DAD,
            customerId: HOUSEHOLD,
        });
        expect(got.map((m) => m.id)).toEqual(["pm-dad-mc"]);
    });

    it("does not offer a revoked method, or one belonging to another household", async () => {
        const got = await readPayerUsableMethods(fakeSupabase(ROWS), {
            orgId: ORG,
            payerEntityType: "person",
            payerEntityId: MOM,
            customerId: HOUSEHOLD,
        });
        expect(got.map((m) => m.id)).not.toContain("pm-mom-revoked");
        expect(got.map((m) => m.id)).not.toContain("pm-mom-otherhouse");
    });

    it("narrows payer, household and usability in the database", async () => {
        const eqs: string[] = [];
        await readPayerUsableMethods(fakeSupabase(ROWS, eqs), {
            orgId: ORG,
            payerEntityType: "person",
            payerEntityId: MOM,
            customerId: HOUSEHOLD,
        });
        for (const col of ["org_id", "payer_entity_type", "payer_entity_id", "customer_id", "usability_state"]) {
            expect(eqs, col).toContain(col);
        }
    });

    /*
     * A MISSING SCOPE MUST READ AS NOTHING.
     *
     * The dangerous failure is the permissive one: an absent payer id that produced an unscoped
     * query would return every method in the household to whoever asked.
     */
    it("returns nothing rather than everything when a scope is missing", async () => {
        for (const args of [
            { orgId: "", payerEntityType: "person", payerEntityId: MOM, customerId: HOUSEHOLD },
            { orgId: ORG, payerEntityType: "person", payerEntityId: "", customerId: HOUSEHOLD },
            { orgId: ORG, payerEntityType: "", payerEntityId: MOM, customerId: HOUSEHOLD },
            { orgId: ORG, payerEntityType: "person", payerEntityId: MOM, customerId: "" },
        ]) {
            expect(await readPayerUsableMethods(fakeSupabase(ROWS), args)).toEqual([]);
        }
    });
});

const method = (over: Partial<PaymentMethodRecord> = {}): PaymentMethodRecord =>
    ({
        id: "pm-1",
        orgId: ORG,
        payerEntityType: "person",
        payerEntityId: MOM,
        customerId: HOUSEHOLD,
        rail: "card",
        processor: "stripe",
        providerCustomerRef: "cus_SECRET",
        providerMethodRef: "pm_SECRET",
        mandateRef: null,
        mandateAcceptedAt: null,
        brand: "visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2030,
        verificationState: "verified",
        usabilityState: "usable",
        isDefault: true,
        createdAt: null,
        verifiedAt: null,
        revokedAt: null,
        revokedReason: null,
        replacedById: null,
        ...over,
    }) as PaymentMethodRecord;

const position = (over: Record<string, unknown> = {}) =>
    ({
        chargeId: "chg-1",
        currencyCode: "USD",
        chargeStatus: "posted",
        grossCents: 15000,
        appliedCents: 0,
        expectedSubsidyCents: 0,
        currentlyCollectibleCents: 15000,
        outstandingCents: 15000,
        unresolvedVarianceCents: 0,
        suppressionBoundBy: "none",
        openVarianceStates: [],
        ...over,
    }) as never;

function projectionOf(over: Partial<EnrollmentFinancialRequirementProjection> = {}): EnrollmentFinancialRequirementProjection {
    return {
        state: "DUE",
        needsAttention: false,
        amounts: {
            currencyCode: "USD",
            grossCents: 15000,
            expectedFundingCents: 0,
            collectibleNowCents: 15000,
            appliedCents: 0,
            outstandingCents: 15000,
        },
        obligations: [
            {
                requirementId: "fee_registration_fee",
                chargeTemplateKey: "registration_fee",
                billableSource: { type: "customer", id: HOUSEHOLD },
                subjectCustomerMemberId: null,
                position: position(),
                reversedByChargeId: null,
                state: "DUE",
            },
        ],
        explanation: "$150.00 is currently collectible across 1 obligation.",
        ...over,
    } as EnrollmentFinancialRequirementProjection;
}

const READY = { readiness: "ready", achReadiness: null };

describe("what the participant payment view shows", () => {
    it("copies every figure from the canonical projection and computes none", () => {
        const p = projectionOf();
        const view = buildParticipantPaymentView({
            projection: p,
            payer: { personId: MOM, name: "Kelly Smith" },
            methods: [method()],
            merchant: READY,
            childNames: new Map(),
        });
        expect(view.state).toBe("DUE");
        expect(view.grossCents).toBe(p.amounts.grossCents);
        expect(view.collectibleNowCents).toBe(p.amounts.collectibleNowCents);
        expect(view.appliedCents).toBe(p.amounts.appliedCents);
        expect(view.outstandingCents).toBe(p.amounts.outstandingCents);
        expect(view.payable).toBe(true);
        expect(view.payer?.name).toBe("Kelly Smith");
    });

    it("never exposes a provider reference to the browser", () => {
        const view = buildParticipantPaymentView({
            projection: projectionOf(),
            payer: { personId: MOM, name: "Kelly Smith" },
            methods: [method()],
            merchant: READY,
            childNames: new Map(),
        });
        const wire = JSON.stringify(view);
        expect(wire).not.toContain("cus_SECRET");
        expect(wire).not.toContain("pm_SECRET");
        // What a parent does need: enough to recognise their own card.
        expect(view.methods[0]).toEqual({ id: "pm-1", rail: "card", brand: "visa", last4: "4242", isDefault: true });
    });

    it("offers no methods at all when the payer could not be established", () => {
        const view = buildParticipantPaymentView({
            projection: projectionOf(),
            payer: null,
            methods: [method()],
            merchant: READY,
            childNames: new Map(),
        });
        expect(view.methods).toEqual([]);
        expect(view.payable).toBe(false);
        expect(view.unpayableReason).toContain("who is paying");
    });

    it("names each child's fee as that child's", () => {
        const view = buildParticipantPaymentView({
            projection: projectionOf({
                obligations: [
                    {
                        requirementId: "fee_x",
                        chargeTemplateKey: "registration_fee",
                        billableSource: { type: "enrollment_agreement", id: "agr-1" },
                        subjectCustomerMemberId: "child-emma",
                        position: position({ chargeId: "chg-emma", currentlyCollectibleCents: 15000 }),
                        reversedByChargeId: null,
                        state: "DUE",
                    },
                    {
                        requirementId: "fee_x",
                        chargeTemplateKey: "registration_fee",
                        billableSource: { type: "enrollment_agreement", id: "agr-2" },
                        subjectCustomerMemberId: "child-liam",
                        position: position({ chargeId: "chg-liam", currentlyCollectibleCents: 10000 }),
                        reversedByChargeId: null,
                        state: "DUE",
                    },
                ],
            } as never),
            payer: { personId: MOM, name: "Kelly Smith" },
            methods: [method()],
            merchant: READY,
            childNames: new Map([
                ["child-emma", "Emma"],
                ["child-liam", "Liam"],
            ]),
        });
        expect(view.lines.map((l) => l.label)).toEqual(["Emma — enrollment fee", "Liam — enrollment fee"]);
        expect(view.lines.map((l) => l.collectibleNowCents)).toEqual([15000, 10000]);
        // Two obligations, one coherent payment experience.
        expect(view.payable).toBe(true);
    });

    it("is not payable when the fee is not due, and says so without asking for a card", () => {
        const view = buildParticipantPaymentView({
            projection: projectionOf({
                state: "NOT_DUE",
                amounts: { currencyCode: null, grossCents: 0, expectedFundingCents: 0, collectibleNowCents: 0, appliedCents: 0, outstandingCents: 0 },
                obligations: [],
            } as never),
            payer: { personId: MOM, name: "Kelly Smith" },
            methods: [method()],
            merchant: READY,
            childNames: new Map(),
        });
        expect(view.payable).toBe(false);
        expect(view.unpayableReason).toBe("This fee is not due yet.");
    });

    it("does not pretend a processing payment can be paid again", () => {
        const view = buildParticipantPaymentView({
            projection: projectionOf({ state: "PROCESSING" }),
            payer: { personId: MOM, name: "Kelly Smith" },
            methods: [method()],
            merchant: READY,
            childNames: new Map(),
        });
        expect(view.payable).toBe(false);
        expect(view.unpayableReason).toContain("processing");
    });

    it("says the school cannot take money when no rail is ready", () => {
        const view = buildParticipantPaymentView({
            projection: projectionOf(),
            payer: { personId: MOM, name: "Kelly Smith" },
            methods: [],
            merchant: { readiness: "not_connected", achReadiness: null },
            childNames: new Map(),
        });
        expect(view.rails).toEqual([]);
        expect(view.payable).toBe(false);
        expect(view.unpayableReason).toContain("cannot accept online payments");
    });

    it("offers ACH only when the merchant can truthfully execute it", () => {
        const both = buildParticipantPaymentView({
            projection: projectionOf(),
            payer: { personId: MOM, name: "Kelly Smith" },
            methods: [],
            merchant: { readiness: "ready", achReadiness: "ready" },
            childNames: new Map(),
        });
        expect(both.rails).toEqual(["card", "ach"]);
    });

    /*
     * A parent with nothing saved must still be able to pay — the engine takes a present payer and
     * Stripe's own fields. Requiring a reusable method first would make adding one a toll gate.
     */
    it("is payable with no saved method at all", () => {
        const view = buildParticipantPaymentView({
            projection: projectionOf(),
            payer: { personId: MOM, name: "Kelly Smith" },
            methods: [],
            merchant: READY,
            childNames: new Map(),
        });
        expect(view.methods).toEqual([]);
        expect(view.payable).toBe(true);
        expect(view.unpayableReason).toBeNull();
    });
});

describe("which obligations a link may name", () => {
    it("allows exactly the payable charges in its own projection", () => {
        expect([...payableChargeIds(projectionOf())]).toEqual(["chg-1"]);
    });

    it("excludes a reversed obligation", () => {
        const ids = payableChargeIds(
            projectionOf({
                obligations: [
                    {
                        requirementId: "fee",
                        chargeTemplateKey: "registration_fee",
                        billableSource: { type: "customer", id: HOUSEHOLD },
                        subjectCustomerMemberId: null,
                        position: position(),
                        reversedByChargeId: "chg-reversal",
                        state: "SATISFIED",
                    },
                ],
            } as never),
        );
        expect([...ids]).toEqual([]);
    });

    it("excludes an obligation with nothing collectible, and one with no position", () => {
        const ids = payableChargeIds(
            projectionOf({
                obligations: [
                    {
                        requirementId: "a",
                        chargeTemplateKey: "k",
                        billableSource: { type: "customer", id: HOUSEHOLD },
                        subjectCustomerMemberId: null,
                        position: position({ chargeId: "chg-settled", currentlyCollectibleCents: 0 }),
                        reversedByChargeId: null,
                        state: "SATISFIED",
                    },
                    {
                        requirementId: "b",
                        chargeTemplateKey: "k",
                        billableSource: { type: "customer", id: HOUSEHOLD },
                        subjectCustomerMemberId: null,
                        position: null,
                        positionUnavailableReason: "unpositionable",
                        reversedByChargeId: null,
                        state: "ATTENTION_REQUIRED",
                    },
                ],
            } as never),
        );
        expect([...ids]).toEqual([]);
    });
});
