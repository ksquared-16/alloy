/**
 * Tuition beyond the assignment's own rates: an ADDITIONAL site rate, and a CUSTOM amount — both
 * overrides, both permissioned and reasoned, both recorded against a real authored rate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
    CommercialExport,
    OfferingDef,
    TuitionRateDef,
    VariantDef,
} from "@/lib/commercial/execution/commercialExport";
import {
    listLocationTuitionOptions,
    resolveAssignmentPricingOptions,
    type AssignmentPricingFacts,
} from "@/lib/commercial/execution/evaluate/resolveOptions";

const TODAY = "2026-10-20";

const offerings: OfferingDef[] = [
    { id: "off-toddler", programKey: "toddler", label: "Toddler", attendanceType: "full_day", effective: { start: null, end: null }, isActive: true },
    { id: "off-preschool", programKey: "preschool", label: "Preschool", attendanceType: "full_day", effective: { start: null, end: null }, isActive: true },
];
const variants: VariantDef[] = [
    { id: "var-toddler", offeringId: "off-toddler", label: "Full time", quantityType: null, quantityValue: null, isActive: true },
    { id: "var-preschool", offeringId: "off-preschool", label: "Full time", quantityType: null, quantityValue: null, isActive: true },
];
function rate(over: Partial<TuitionRateDef>): TuitionRateDef {
    return {
        id: "r",
        variantId: "var-toddler",
        cadenceKey: "monthly",
        payerType: "private_pay",
        locationId: null,
        rateCents: 150_000,
        notOffered: false,
        effective: { start: null, end: null },
        revenueCategoryId: null,
        ...over,
    };
}
const tuitionRates: TuitionRateDef[] = [
    rate({ id: "rate-toddler-site", locationId: "loc-north", rateCents: 160_000 }),
    rate({ id: "rate-toddler-org", rateCents: 150_000 }), // superseded by the site rate for the same pair
    rate({ id: "rate-preschool-org", variantId: "var-preschool", rateCents: 120_000 }),
    rate({ id: "rate-other-site", variantId: "var-preschool", locationId: "loc-south", rateCents: 99_000 }),
    rate({ id: "rate-not-offered", variantId: "var-preschool", locationId: "loc-north", notOffered: true, cadenceKey: "weekly" }),
    rate({ id: "rate-expired", variantId: "var-preschool", cadenceKey: "weekly", effective: { start: null, end: "2025-01-01" } }),
];
const exportFixture = {
    orgId: "org-1",
    version: { version: "cfg-1", effectiveOn: TODAY },
    programs: [],
    offerings,
    variants,
    tuitionRates,
    products: [],
    cadences: [],
    revenueCategories: [],
    policies: [],
} as unknown as CommercialExport;

const facts: AssignmentPricingFacts = {
    programKey: "toddler",
    attendanceType: "full_day",
    daysPerWeek: 5,
    locationId: "loc-north",
    payerType: "private_pay",
    cadenceKey: null,
    asOf: TODAY,
};

describe("listLocationTuitionOptions — every rate this site offers", () => {
    it("spans programs, prefers a site rate over the org default for the same pair, and drops what cannot be used", () => {
        const ids = listLocationTuitionOptions(exportFixture, facts).map((o) => o.source.id);
        expect(ids).toEqual(["rate-toddler-site", "rate-preschool-org"]);
    });
});

/* ── The override service, against the real resolver and a recording fake for the terms table ── */

vi.mock("@/lib/enrollment/pricing/assignmentPricingFacts", () => ({
    readAssignmentPricingFacts: vi.fn(async () => ({
        ok: true,
        subject: {
            opportunityCustomerMemberId: "ocm-1",
            customerMemberId: "cm-1",
            enrollmentAgreementId: null,
            childLabel: null,
        },
        facts,
        sources: {},
    })),
}));
vi.mock("@/lib/commercial/execution/export/composeCommercialExport", () => ({
    composeCommercialExport: vi.fn(async () => ({ export: exportFixture })),
}));

const inserted: Array<Record<string, unknown>> = [];
function fakeSupabase() {
    const chain = (result: unknown) => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "is", "update", "order", "limit"]) q[m] = () => q;
        q.maybeSingle = async () => ({ data: null, error: null });
        q.then = (resolve: (v: unknown) => unknown) => resolve(result);
        return q;
    };
    return {
        from: () => ({
            ...chain({ data: [], error: null }),
            insert: (row: Record<string, unknown>) => {
                inserted.push(row);
                return { select: () => ({ single: async () => ({ data: { id: "term-1", ...row }, error: null }) }) };
            },
        }),
    } as never;
}

const { overrideEnrollmentPricingTerm } = await import("@/lib/enrollment/pricing/enrollmentPricingTermsService");
const resolutionKey = resolveAssignmentPricingOptions(exportFixture, facts).resolutionKey;
const base = {
    orgId: "org-1",
    actorUserId: "user-1",
    permissionKeys: ["enrollment.pricing.override"],
    opportunityCustomerMemberId: "ocm-1",
    resolutionKey,
    overrideReason: "Sibling in preschool room",
};

beforeEach(() => {
    inserted.length = 0;
});

describe("overrideEnrollmentPricingTerm — additional rates and custom amounts", () => {
    it("records an ADDITIONAL site rate (another program's) as an override", async () => {
        const r = await overrideEnrollmentPricingTerm(fakeSupabase(), { ...base, selectedSourceId: "rate-preschool-org" });
        expect(r.ok).toBe(true);
        expect(inserted[0]).toMatchObject({
            state: "overridden",
            source_id: "rate-preschool-org",
            amount_cents: 120_000,
            program_key: "preschool",
            override_reason: "Sibling in preschool room",
        });
    });

    it("refuses a rate this site does not offer", async () => {
        const r = await overrideEnrollmentPricingTerm(fakeSupabase(), { ...base, selectedSourceId: "rate-other-site" });
        expect(r).toMatchObject({ ok: false, code: "option_no_longer_valid" });
        expect(inserted).toHaveLength(0);
    });

    it("records a CUSTOM amount against the selected authored rate, keeping the catalog figure", async () => {
        const r = await overrideEnrollmentPricingTerm(fakeSupabase(), {
            ...base,
            selectedSourceId: "rate-toddler-site",
            customAmountCents: 145_000,
        });
        expect(r.ok).toBe(true);
        expect(inserted[0]).toMatchObject({
            state: "overridden",
            source_id: "rate-toddler-site",
            amount_cents: 145_000,
            cadence_key: "monthly",
        });
        expect(inserted[0]!.resolved_facts).toMatchObject({
            custom_amount: true,
            custom_amount_cents: 145_000,
            catalog_amount_cents: 160_000,
        });
    });

    it("a custom amount on the recommended rate is a legitimate override", async () => {
        const r = await overrideEnrollmentPricingTerm(fakeSupabase(), {
            ...base,
            selectedSourceId: "rate-toddler-site",
            customAmountCents: 100,
        });
        expect(r.ok).toBe(true);
    });

    it("refuses an invalid custom amount, and an override without permission or reason", async () => {
        for (const bad of [0, -5, 12.5, Number.NaN, 10_000_001]) {
            const r = await overrideEnrollmentPricingTerm(fakeSupabase(), {
                ...base,
                selectedSourceId: "rate-toddler-site",
                customAmountCents: bad,
            });
            expect(r).toMatchObject({ ok: false, code: "custom_amount_invalid" });
        }
        expect(
            await overrideEnrollmentPricingTerm(fakeSupabase(), {
                ...base,
                permissionKeys: [],
                selectedSourceId: "rate-toddler-site",
                customAmountCents: 145_000,
            }),
        ).toMatchObject({ ok: false, code: "override_permission_required" });
        expect(
            await overrideEnrollmentPricingTerm(fakeSupabase(), {
                ...base,
                overrideReason: " ",
                selectedSourceId: "rate-preschool-org",
            }),
        ).toMatchObject({ ok: false, code: "override_reason_required" });
        expect(inserted).toHaveLength(0);
    });
});

describe("acceptEnrollmentPricingTerm — a tie is settled by choosing one of the tied", () => {
    it("accepts a tied option (no recommendation recorded) and refuses one outside the tie", async () => {
        const { acceptEnrollmentPricingTerm } = await import("@/lib/enrollment/pricing/enrollmentPricingTermsService");
        // Two equally-dated org rates for the same toddler variant and cadence → ambiguous.
        tuitionRates.push(rate({ id: "rate-toddler-org-twin", rateCents: 155_000, locationId: "loc-north" }));
        try {
            const resolution = resolveAssignmentPricingOptions(exportFixture, facts);
            expect(resolution.kind).toBe("ambiguous");
            const key = resolution.resolutionKey;
            const ok = await acceptEnrollmentPricingTerm(fakeSupabase(), { ...base, resolutionKey: key, overrideReason: null, selectedSourceId: "rate-toddler-org-twin" });
            expect(ok.ok).toBe(true);
            expect(inserted[0]).toMatchObject({ state: "accepted", source_id: "rate-toddler-org-twin", recommended_source_id: null });
            inserted.length = 0;
            const outside = await acceptEnrollmentPricingTerm(fakeSupabase(), { ...base, resolutionKey: key, overrideReason: null, selectedSourceId: "rate-preschool-org" });
            expect(outside).toMatchObject({ ok: false, code: "no_recommendation" });
            expect(inserted).toHaveLength(0);
        } finally {
            tuitionRates.pop();
        }
    });
});
