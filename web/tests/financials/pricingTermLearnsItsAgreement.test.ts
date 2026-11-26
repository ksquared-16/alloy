/**
 * A CHILD PRICED BEFORE ENROLMENT MUST STILL BE BILLABLE.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────────
 *
 * `enrollment_pricing_terms.enrollment_agreement_id` is stamped from the assignment at ACCEPT time,
 * and `enrollment.pricing.accept` exists "from the moment an assignment is proposed — long before
 * any enrollment agreement". So the ordinary order is: price the child, then enrol them, and every
 * term accepted in that order was written with a null agreement.
 *
 * The retry branch returned that row untouched, so it could never acquire one — while
 * `generateTuitionCharges` refuses a term with no agreement as `assignment_not_enrolled`. A child
 * priced before enrolment could never be billed, and no operator gesture could repair it:
 * re-accepting answers `idempotent: true` and there is no re-stamp.
 *
 * Measured on the running app: two assignments enrolled through the enrollment-decision authority
 * after acceptance, both still refused by the generator, both re-accepts idempotent with the null
 * intact.
 *
 * ── WHAT IS LOCKED ────────────────────────────────────────────────────────────────────────────
 *
 * That a null is filled, and that a term which already names an agreement is never moved — the two
 * halves of "learned later, and never re-pointed", which is what the row's own comment always said.
 */
import { describe, expect, it, vi } from "vitest";

import { acceptEnrollmentPricingTerm } from "@/lib/enrollment/pricing/enrollmentPricingTermsService";

const OCM = "ocm-1";
const AGREEMENT = "agr-1";
const SOURCE = "rate-1";

const FACTS = {
    programKey: "preschool",
    attendanceType: "full_time",
    daysPerWeek: null,
    locationId: null,
    payerType: "private_pay" as const,
    cadenceKey: null,
    asOf: "2026-09-01",
};

const OPTION = {
    source: { entity: "commercial_tuition_rates", id: SOURCE },
    offeringId: "off-1",
    variantId: "var-1",
    programKey: "preschool",
    attendanceType: "full_time",
    variantLabel: "",
    quantityType: null,
    quantityValue: null,
    cadenceKey: "monthly",
    payerType: "private_pay",
    locationId: null,
    amount: { amountCents: 145_000, currency: "USD" },
    effective: { start: "2026-07-01", end: null },
    scope: "org_default" as const,
    matched: [],
};

/** The live term as it was written before the child enrolled. */
const liveTerm = (agreementId: string | null) => ({
    id: "term-1",
    resolution_key: "res-1",
    source_id: SOURCE,
    amount_cents: 145_000,
    state: "accepted",
    override_reason: null,
    enrollment_agreement_id: agreementId,
});

function harness(args: { agreementOnAssignment: string | null; agreementOnTerm: string | null }) {
    const update = vi.fn();
    const termsChain = {
        select: () => termsChain,
        eq: () => termsChain,
        is: () => termsChain,
        update: (patch: Record<string, unknown>) => {
            update(patch);
            return {
                eq: () => ({
                    eq: () => ({
                        is: () => ({
                            select: () => ({
                                maybeSingle: () =>
                                    Promise.resolve({
                                        data: { ...liveTerm(args.agreementOnTerm), ...patch },
                                        error: null,
                                    }),
                            }),
                        }),
                    }),
                }),
            };
        },
        then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [liveTerm(args.agreementOnTerm)], error: null }).then(resolve),
    };
    const supabase = { from: () => termsChain } as never;

    return { supabase, update };
}

/**
 * The service resolves facts and the catalog itself, which a unit test cannot stand up honestly.
 * So the commit step is exercised through its own seam: `resolveForCommit` is stubbed to the answer
 * the running app produced, and everything after it is the real code.
 */
vi.mock("@/lib/enrollment/pricing/assignmentPricingFacts", async (orig) => {
    const actual = (await orig()) as Record<string, unknown>;
    return {
        ...actual,
        readAssignmentPricingFacts: async () => ({
            ok: true,
            subject: {
                opportunityCustomerMemberId: OCM,
                customerMemberId: "cm-1",
                enrollmentAgreementId: (globalThis as { __agreementOnAssignment?: string | null }).__agreementOnAssignment ?? null,
                childLabel: null,
            },
            facts: FACTS,
            sources: { programKey: "assignment", daysPerWeek: "none", locationId: "none", asOf: "assignment_start" },
        }),
    };
});

vi.mock("@/lib/commercial/execution/export/composeCommercialExport", () => ({
    composeCommercialExport: async () => ({ export: { version: { version: "cfg-1" } } }),
}));

vi.mock("@/lib/commercial/execution/evaluate/resolveOptions", async (orig) => {
    const actual = (await orig()) as Record<string, unknown>;
    return {
        ...actual,
        resolveAssignmentPricingOptions: () => ({
            kind: "recommended",
            recommended: OPTION,
            applicable: [OPTION],
            rejected: [],
            resolutionKey: "res-1",
            configVersion: { version: "cfg-1" },
            facts: FACTS,
        }),
    };
});

const ARGS = {
    orgId: "org-1",
    actorUserId: "u-1",
    permissionKeys: [] as string[],
    opportunityCustomerMemberId: OCM,
    resolutionKey: "res-1",
    selectedSourceId: SOURCE,
    cadenceKey: null,
    asOf: null,
    overrideReason: null,
    supersede: false,
};

describe("THE GATE — a term written before enrolment learns its agreement", () => {
    it("fills the null when the assignment now names an agreement", async () => {
        (globalThis as { __agreementOnAssignment?: string | null }).__agreementOnAssignment = AGREEMENT;
        const { supabase, update } = harness({ agreementOnAssignment: AGREEMENT, agreementOnTerm: null });
        const res = await acceptEnrollmentPricingTerm(supabase, ARGS);
        expect(res.ok).toBe(true);
        expect(update).toHaveBeenCalledWith({ enrollment_agreement_id: AGREEMENT });
        expect((res as { term: { enrollment_agreement_id?: string | null } }).term.enrollment_agreement_id).toBe(AGREEMENT);
    });

    /* Never re-pointed: a term that already names one is left exactly as it stands. */
    it("does not move an agreement the term already names", async () => {
        (globalThis as { __agreementOnAssignment?: string | null }).__agreementOnAssignment = "agr-2";
        const { supabase, update } = harness({ agreementOnAssignment: "agr-2", agreementOnTerm: AGREEMENT });
        const res = await acceptEnrollmentPricingTerm(supabase, ARGS);
        expect(res.ok).toBe(true);
        expect(update, "an existing agreement is never re-pointed").not.toHaveBeenCalled();
    });

    /* And where the assignment still has none, nothing is invented. */
    it("writes nothing when the assignment still has no agreement", async () => {
        (globalThis as { __agreementOnAssignment?: string | null }).__agreementOnAssignment = null;
        const { supabase, update } = harness({ agreementOnAssignment: null, agreementOnTerm: null });
        const res = await acceptEnrollmentPricingTerm(supabase, ARGS);
        expect(res.ok).toBe(true);
        expect(update).not.toHaveBeenCalled();
    });
});
