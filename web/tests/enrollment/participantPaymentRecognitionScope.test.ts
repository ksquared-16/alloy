/**
 * A participant link can only recognise its OWN payer's attempt on its OWN family's fees.
 *
 * Recognition used to look an attempt up by id within the organisation, so a link could prompt the
 * recognition of another family's payment. The route now holds the engine's existing scope to the
 * link's canonical payer and the family's journey fees. These drive the real route with its
 * collaborators faked, and the real `attemptWithinScope` deciding.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { attemptWithinScope } from "@/lib/financials/payments/collectionRecognition";

const MOM = "person-mom";
const OTHER_PARENT = "person-other";
const OUR_CHARGE = "chg-ava";
const SIBLING_CHARGE = "chg-ben";
const OTHER_FAMILY_CHARGE = "chg-other-family";

let payer: { personId: string; name: string } | null = { personId: MOM, name: "Mom" };
const attempts: Record<string, { charge_id: string; payer_person_id: string }> = {
    "att-ours": { charge_id: OUR_CHARGE, payer_person_id: MOM },
    "att-sibling": { charge_id: SIBLING_CHARGE, payer_person_id: MOM },
    "att-other-family": { charge_id: OTHER_FAMILY_CHARGE, payer_person_id: OTHER_PARENT },
    "att-other-payer": { charge_id: OUR_CHARGE, payer_person_id: OTHER_PARENT },
};
const recognize = vi.fn(async (_s: unknown, args: { attemptId: string; scope?: { chargeIds?: Iterable<string>; payerPersonId?: string | null } }) => {
    const a = attempts[args.attemptId];
    if (!a || !attemptWithinScope(a, args.scope)) {
        return { ok: false, reason: "attempt_not_found", message: "That collection is not in this organization.", attemptId: null };
    }
    return { ok: true, recognized: true, paymentId: `pay-${args.attemptId}` };
});

vi.mock("@/lib/supabase/serverServiceClient", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/lib/public/forms/resolveParticipantEnrollmentFromToken", () => ({
    resolveParticipantEnrollmentFromToken: async () => ({
        ok: true,
        value: { orgId: "org-1", linkId: "link-1", session: { crm_snapshot: { customer_member_id: "ava" } } },
    }),
}));
vi.mock("@/lib/enrollment/family/resolveFamilyEnrollmentExperience", () => ({
    householdIdFromSession: () => "household-1",
    resolveFamilyEnrollmentExperience: async () => ({
        ok: true,
        value: { children: [{ customerMemberId: "ava", displayName: "Ava" }, { customerMemberId: "ben", displayName: "Ben" }] },
        projection: {
            state: "SATISFIED",
            needsAttention: false,
            amounts: { currencyCode: "USD", grossCents: 30000, expectedFundingCents: 0, collectibleNowCents: 0, appliedCents: 30000, outstandingCents: 0 },
            obligations: [
                // Both already paid: nothing collectible, yet still this family's to recognise.
                { requirementId: "fee", chargeTemplateKey: "registration_fee", billableSource: { type: "customer", id: "household-1" }, subjectCustomerMemberId: "ava", position: { chargeId: OUR_CHARGE, currentlyCollectibleCents: 0 }, reversedByChargeId: null, state: "SATISFIED" },
                { requirementId: "fee", chargeTemplateKey: "registration_fee", billableSource: { type: "customer", id: "household-1" }, subjectCustomerMemberId: "ben", position: { chargeId: SIBLING_CHARGE, currentlyCollectibleCents: 0 }, reversedByChargeId: null, state: "SATISFIED" },
            ],
            explanation: "",
        },
    }),
}));
vi.mock("@/lib/enrollment/financial/participantEnrollmentPayment", async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, resolveParticipantPayer: async () => payer };
});
vi.mock("@/lib/financials/payments/paymentMethodService", () => ({ readPayerUsableMethods: async () => [] }));
vi.mock("@/lib/financials/payments/providerMerchant", async (orig) => ({
    ...((await orig()) as Record<string, unknown>),
    resolveCollectionMerchant: async () => ({ ok: true, merchant: { readiness: "ready", achReadiness: null } }),
}));
vi.mock("@/lib/financials/payments/collectionAttempt", () => ({ createCardCollection: vi.fn() }));
vi.mock("@/lib/financials/payments/collectionRecognition", async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, recognizeCollectionAttempt: (...a: unknown[]) => recognize(...(a as [unknown, never])) };
});
vi.mock("@/lib/financials/payments/stripePublishableKey", () => ({ stripePublishableKey: () => "pk_test" }));

import { POST } from "@/app/api/public/forms/[token]/enrollment-payment/route";

const post = async (attemptId: string, extra: Record<string, unknown> = {}) => {
    const res = await POST(
        new Request("https://x/api/public/forms/t/enrollment-payment", {
            method: "POST",
            body: JSON.stringify({ action: "recognize", attempt_id: attemptId, ...extra }),
        }) as never,
        { params: Promise.resolve({ token: "t" }) },
    );
    const body = await res.json(); if (res.status === 500) console.error("500", JSON.stringify(body)); return { status: res.status, body };
};

describe("recognising a payment from a participant link", () => {
    beforeEach(() => {
        payer = { personId: MOM, name: "Mom" };
        recognize.mockClear();
    });

    it("recognises this payer's attempt on this family's fee — even once it is fully paid", async () => {
        const r = await post("att-ours");
        expect(r.status).toBeLessThan(300);
        expect(recognize.mock.calls[0]?.[1]).toMatchObject({ scope: { payerPersonId: MOM } });
        expect([...(recognize.mock.calls[0]?.[1].scope?.chargeIds ?? [])].sort()).toEqual([OUR_CHARGE, SIBLING_CHARGE].sort());
    });

    it("recognises the same payer's attempt on a sibling's fee in this family (each child's charge stays separate)", async () => {
        expect((await post("att-sibling")).status).toBeLessThan(300);
    });

    it("refuses another family's attempt, exactly as if it did not exist", async () => {
        const r = await post("att-other-family");
        expect(r.status).toBe(409);
        expect(JSON.stringify(r.body)).toMatch(/not in this organization/);
    });

    it("refuses another payer's attempt on this family's own fee", async () => {
        expect((await post("att-other-payer")).status).toBe(409);
    });

    it("refuses outright when the link names no payer", async () => {
        payer = null;
        const r = await post("att-ours");
        expect(r.status).toBe(409);
        expect(recognize).not.toHaveBeenCalled();
    });

    it("ignores a client-supplied payer or charge", async () => {
        await post("att-ours", { payer_person_id: OTHER_PARENT, charge_ids: [OTHER_FAMILY_CHARGE] });
        const scope = recognize.mock.calls[0]?.[1].scope;
        expect(scope?.payerPersonId).toBe(MOM);
        expect([...(scope?.chargeIds ?? [])]).not.toContain(OTHER_FAMILY_CHARGE);
    });
});
