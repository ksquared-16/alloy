import { describe, expect, it } from "vitest";
import type { ProgramOffering } from "@/lib/programs/programOfferings";
import type { ProgramOfferingVariant } from "@/lib/programs/programOfferingVariants";
import type { TuitionRateRow } from "@/lib/commercial/tuitionRates";
import type { BillingCadence } from "@/lib/commercial/billingCadences";
import {
    appendPriceHistory,
    TUITION_BILLING_FREQUENCY_META_KEY,
    TUITION_REVENUE_CATEGORY_META_KEY,
} from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";
import {
    buildCompareLocationsMatrix,
    buildTuitionHistoryPeriods,
    buildTuitionPlanCollectionRows,
    buildTuitionPlanDetail,
    buildTuitionSetupReadiness,
} from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";
import { applyQuickAdjustment } from "@/lib/financials/tuitionPlans/tuitionPlanClient";

function offering(partial: Partial<ProgramOffering> & Pick<ProgramOffering, "id" | "label" | "program_key">): ProgramOffering {
    return {
        org_id: "org-1",
        attendance_type: "full_time",
        status: "active",
        effective_start: null,
        effective_end: null,
        sort_order: 100,
        is_active: true,
        metadata: {
            [TUITION_BILLING_FREQUENCY_META_KEY]: "monthly",
            [TUITION_REVENUE_CATEGORY_META_KEY]: "rev-1",
        },
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
        ...partial,
    };
}

function variant(
    partial: Partial<ProgramOfferingVariant> & Pick<ProgramOfferingVariant, "id" | "offering_id" | "quantity_value">,
): ProgramOfferingVariant {
    return {
        org_id: "org-1",
        label: null,
        quantity_type: "days",
        sort_order: 100,
        is_active: true,
        status: "active",
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
        ...partial,
    };
}

function rate(partial: Partial<TuitionRateRow> & Pick<TuitionRateRow, "id" | "variant_id" | "rate_cents">): TuitionRateRow {
    return {
        org_id: "org-1",
        location_id: null,
        cadence_key: "monthly",
        payer_type: "private_pay",
        is_active: true,
        not_offered: false,
        effective_start: "2026-09-01",
        effective_end: null,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
        ...partial,
    };
}

const cadences: BillingCadence[] = [
    { id: "c1", item_key: "monthly", label: "Monthly", sort_order: 1, metadata: {} },
    { id: "c2", item_key: "weekly", label: "Weekly", sort_order: 2, metadata: {} },
];

describe("tuition plan view model", () => {
    const infantFullDay = offering({ id: "off-1", label: "Full Day", program_key: "infant" });
    const variants = [1, 2, 3, 4, 5].map((days) =>
        variant({ id: `v-${days}`, offering_id: "off-1", quantity_value: days }),
    );
    const rates = [
        rate({ id: "r1", variant_id: "v-1", rate_cents: 62000 }),
        rate({ id: "r2", variant_id: "v-2", rate_cents: 92000 }),
        rate({ id: "r3", variant_id: "v-3", rate_cents: 118000 }),
        rate({ id: "r4", variant_id: "v-4", rate_cents: 139000 }),
        rate({ id: "r5", variant_id: "v-5", rate_cents: 152500 }),
        rate({
            id: "r3-north",
            variant_id: "v-3",
            rate_cents: 122500,
            location_id: "loc-north",
        }),
    ];

    it("collapses five commitments into one collection plan row", () => {
        const rows = buildTuitionPlanCollectionRows({
            offerings: [infantFullDay],
            variants,
            rates,
            programs: [{ key: "infant", label: "Infant", siteCount: 3 }],
            locations: [
                { id: "loc-north", name: "North Campus" },
                { id: "loc-south", name: "South Campus" },
                { id: "loc-west", name: "West Campus" },
            ],
            cadences,
            asOf: "2026-10-01",
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.name).toBe("Full Day");
        expect(rows[0]?.programLabel).toBe("Infant");
        expect(rows[0]?.enrollmentOptionsCount).toBe(5);
        expect(rows[0]?.priceRangeLabel).toContain("$620");
        expect(rows[0]?.priceRangeLabel).toContain("$1,525");
        expect(rows[0]?.hasRevenueGl).toBe(true);
    });

    it("builds plan detail with options, GL, and location override summary", () => {
        const detail = buildTuitionPlanDetail({
            offering: infantFullDay,
            variants,
            rates,
            programs: [{ key: "infant", label: "Infant", siteCount: 3 }],
            locations: [
                { id: "loc-north", name: "North Campus" },
                { id: "loc-south", name: "South Campus" },
            ],
            cadences,
            revenueCategories: [{ id: "rev-1", label: "Tuition Revenue — 4100" }],
            asOf: "2026-10-01",
        });
        expect(detail.options).toHaveLength(5);
        expect(detail.revenueGlLabel).toBe("Tuition Revenue — 4100");
        expect(detail.locationsWithOverrides).toEqual([
            { locationId: "loc-north", locationName: "North Campus", overrideCount: 1 },
        ]);
        expect(detail.options.find((row) => row.variantId === "v-3")?.locationDifferencesLabel).toBe(
            "1 override",
        );
    });

    it("resolves location inheritance vs override in compare matrix", () => {
        const matrix = buildCompareLocationsMatrix({
            variants,
            rates,
            locations: [
                { id: "loc-north", name: "North Campus" },
                { id: "loc-south", name: "South Campus" },
            ],
            cadenceKey: "monthly",
            asOf: "2026-10-01",
        });
        expect(matrix.cells["3 days/week"]?.organization.label).toBe("$1,180");
        expect(matrix.cells["3 days/week"]?.["loc-north"]?.differs).toBe(true);
        expect(matrix.cells["3 days/week"]?.["loc-north"]?.label).toBe("$1,225");
        expect(matrix.cells["3 days/week"]?.["loc-south"]?.differs).toBe(false);
    });

    it("keeps history periods from metadata ledger without inventing attendance/funding", () => {
        const withHistory = rate({
            id: "r1",
            variant_id: "v-1",
            rate_cents: 65000,
            effective_start: "2027-01-01",
            metadata: appendPriceHistory(
                rate({ id: "r1", variant_id: "v-1", rate_cents: 62000, effective_start: "2026-09-01" }),
                {
                    rate_cents: 62000,
                    effective_start: "2026-09-01",
                    effective_end: "2026-12-31",
                },
            ),
        });
        const periods = buildTuitionHistoryPeriods({
            variants: [variants[0]!],
            rates: [withHistory],
            cadenceKey: "monthly",
        });
        expect(periods.length).toBeGreaterThanOrEqual(1);
        expect(periods.some((period) => period.rows.some((row) => row.priceLabel.includes("620")))).toBe(true);
    });

    it("builds actionable setup readiness without percentage language", () => {
        const readiness = buildTuitionSetupReadiness({
            revenueCategoryCount: 0,
            cadenceCount: 2,
            commitmentPatternCount: 5,
            planCount: 0,
            overrideCount: 0,
        });
        expect(readiness.showGuide).toBe(true);
        expect(readiness.glCodes.ok).toBe(false);
        expect(readiness.glCodes.actionLabel).toBe("Set up GL Codes");
        expect(JSON.stringify(readiness)).not.toMatch(/%|missing cells/i);
    });

    it("applies schedule quick adjustments as helpers only", () => {
        expect(applyQuickAdjustment(100000, "percent", 5)).toBe(105000);
        expect(applyQuickAdjustment(100000, "amount", 25)).toBe(102500);
        expect(applyQuickAdjustment(100123, "round", 5)).toBe(100000);
    });
});
