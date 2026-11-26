import { describe, expect, it } from "vitest";
import type { ProgramOffering } from "@/lib/programs/programOfferings";
import type { ProgramOfferingVariant } from "@/lib/programs/programOfferingVariants";
import type { TuitionRateRow } from "@/lib/commercial/tuitionRates";
import type { BillingCadence } from "@/lib/commercial/billingCadences";
import {
    buildBillingFrequencyRows,
    countBillingFrequencyUsage,
    isBillingFrequencyActive,
} from "@/lib/financials/tuitionPlans/billingFrequenciesViewModel";
import {
    buildActiveDayCommitmentValues,
    commitmentPatternKey,
    deriveEnrollmentCommitments,
} from "@/lib/financials/tuitionPlans/enrollmentCommitmentsViewModel";
import { TUITION_BILLING_FREQUENCY_META_KEY } from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";
import { derivePlanReadinessChip } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";

describe("billing frequencies view model", () => {
    it("treats metadata.active false as inactive", () => {
        expect(isBillingFrequencyActive({ active: false })).toBe(false);
        expect(isBillingFrequencyActive({ is_active: false })).toBe(false);
        expect(isBillingFrequencyActive({})).toBe(true);
    });

    it("counts plan usage from offering metadata and rates", () => {
        const offerings: ProgramOffering[] = [
            {
                id: "o1",
                org_id: "org",
                label: "Full Day",
                program_key: "infant",
                attendance_type: "full_time",
                status: "active",
                effective_start: null,
                effective_end: null,
                sort_order: 1,
                is_active: true,
                metadata: { [TUITION_BILLING_FREQUENCY_META_KEY]: "monthly" },
                created_at: "",
                updated_at: null,
            },
        ];
        const rates: TuitionRateRow[] = [
            {
                id: "r1",
                org_id: "org",
                variant_id: "v1",
                location_id: null,
                cadence_key: "monthly",
                payer_type: "private_pay",
                rate_cents: 100000,
                is_active: true,
                not_offered: false,
                effective_start: "2026-01-01",
                effective_end: null,
                metadata: {},
                created_at: "",
                updated_at: null,
            },
        ];
        expect(countBillingFrequencyUsage("monthly", offerings, rates)).toBe(1);
        const rows = buildBillingFrequencyRows({
            cadences: [
                { id: "c1", item_key: "monthly", label: "Monthly", sort_order: 1, metadata: { description: "Billed monthly" } },
            ],
            offerings,
            rates,
        });
        expect(rows[0]?.plansUsingCount).toBe(1);
        expect(rows[0]?.cadenceLabel).toBe("Billed monthly");
    });
});

describe("enrollment commitments view model", () => {
    const variants: ProgramOfferingVariant[] = [
        {
            id: "v1",
            org_id: "org",
            offering_id: "o1",
            label: "3 days/week",
            quantity_type: "days",
            quantity_value: 3,
            sort_order: 1,
            is_active: true,
            status: "active",
            metadata: {},
            created_at: "",
            updated_at: null,
        },
        {
            id: "v2",
            org_id: "org",
            offering_id: "o2",
            label: null,
            quantity_type: "days",
            quantity_value: 3,
            sort_order: 1,
            is_active: true,
            status: "active",
            metadata: {},
            created_at: "",
            updated_at: null,
        },
    ];

    it("derives distinct patterns with majority label and usage count", () => {
        const patterns = deriveEnrollmentCommitments({ variants });
        expect(patterns).toHaveLength(1);
        expect(patterns[0]?.key).toBe(commitmentPatternKey("days", 3));
        expect(patterns[0]?.label).toBe("3 days/week");
        expect(patterns[0]?.usageCount).toBe(2);
    });

    it("builds active day values for plan dialogs", () => {
        const patterns = deriveEnrollmentCommitments({
            variants,
            templateItems: [
                {
                    id: "t1",
                    itemKey: "days_5",
                    label: "5 days/week",
                    quantityType: "days",
                    quantityValue: 5,
                    metadata: { active: true },
                },
            ],
        });
        expect(buildActiveDayCommitmentValues(patterns)).toEqual([3, 5]);
    });
});

describe("plan overview readiness chip", () => {
    it("returns accounting assignment needed when GL missing", () => {
        const chip = derivePlanReadinessChip({
            revenueCategoryId: null,
            priceRangeLabel: "$500 / month",
            enrollmentOptionsCount: 2,
            options: [],
        });
        expect(chip.chip).toBe("needs_gl");
        expect(chip.label).toBe("Accounting assignment needed");
    });

    it("returns ready when GL and tuition are set", () => {
        const chip = derivePlanReadinessChip({
            revenueCategoryId: "rev-1",
            priceRangeLabel: "$500 / month",
            enrollmentOptionsCount: 2,
            options: [{ organizationPriceCents: 50000, status: "active" } as never],
        });
        expect(chip.chip).toBe("ready");
        expect(chip.label).toBe("Ready to use");
    });

    it("returns tuition not set when prices missing", () => {
        const chip = derivePlanReadinessChip({
            revenueCategoryId: "rev-1",
            priceRangeLabel: null,
            enrollmentOptionsCount: 2,
            options: [{ organizationPriceCents: null, status: "unset" } as never],
        });
        expect(chip.chip).toBe("no_tuition");
    });
});

describe("financials workspace header smoke", () => {
    it("exports ConfigurationContext from configuration runtime layout", async () => {
        const mod = await import("@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout");
        expect(typeof mod.ConfigurationContext).toBe("function");
    });
});

describe("financials chapter deep links", () => {
    it("supports account, catalog item, and policy ids without exposing commercial vocabulary", async () => {
        const { organizationFinancialsChapterHref, organizationTuitionPlansHref } = await import(
            "@/lib/commercial/commercialChapterRoutes"
        );
        expect(organizationFinancialsChapterHref("accounting", { accountId: "gl-1" })).toContain(
            "accountId=gl-1",
        );
        expect(organizationFinancialsChapterHref("catalog", { itemId: "item-1" })).toContain("itemId=item-1");
        expect(organizationFinancialsChapterHref("policies", { policyId: "pol-1" })).toContain("policyId=pol-1");
        expect(organizationTuitionPlansHref({ setup: "frequencies" })).toContain("setup=frequencies");
        expect(organizationTuitionPlansHref({ setup: "commitments" })).toContain("setup=commitments");
    });
});

describe("policy editor operator language", () => {
    it("labels offering/variant scopes as Tuition Plan and Enrollment Commitment", async () => {
        const { POLICY_SCOPE_OPTIONS } = await import("@/components/adminV2/commercial/policyEditorShared");
        expect(POLICY_SCOPE_OPTIONS.find((row) => row.value === "offering")?.label).toBe("One Tuition Plan");
        expect(POLICY_SCOPE_OPTIONS.find((row) => row.value === "variant")?.label).toBe(
            "One Enrollment Commitment",
        );
    });
});

describe("GL used-by mapping", () => {
    it("resolves tuition plans through revenue category mapped_gl_account_id", async () => {
        const { readPlanRevenueCategoryId } = await import(
            "@/lib/financials/tuitionPlans/tuitionPlanViewModel"
        );
        const offering = {
            id: "o1",
            metadata: { tuition_revenue_category_id: "rc-1" },
        } as never;
        expect(readPlanRevenueCategoryId(offering)).toBe("rc-1");
        const revenueCategories = [{ id: "rc-1", mapped_gl_account_id: "gl-1" }];
        const products = [{ id: "p1", revenue_category_id: "rc-1", name: "Registration Fee" }];
        const tuitionUsing = revenueCategories
            .filter((rc) => rc.mapped_gl_account_id === "gl-1")
            .map((rc) => rc.id);
        expect(tuitionUsing).toEqual(["rc-1"]);
        expect(products.filter((p) => tuitionUsing.includes(p.revenue_category_id))).toHaveLength(1);
    });
});
