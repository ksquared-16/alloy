/**
 * Unit tests for resolveEnrollmentTuitionRate.
 *
 * This is the pure rate-resolution function extracted from the
 * GET /api/admin/financial-config/opportunity/[id] route.
 * All logic is deterministic: same inputs → same output.
 *
 * Audit items covered:
 *   (3) Location-specific override beats org default
 *   (4) Period selection is deterministic (monthly > weekly > biweekly > annual)
 *   (5) Missing placement/schedule produces null, not fabricated tuition
 *   (2) No fake estimates — always null when no match
 */

import { describe, expect, it } from "vitest";

import {
    resolveEnrollmentTuitionRate,
    TUITION_PERIOD_PREFERENCE,
    type TuitionRateCandidate,
} from "@/lib/adminV2/runtime/focusPanel/financialConfig/resolveEnrollmentTuitionRate";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function label(cents: number, period: string): string {
    return `$${(cents / 100).toFixed(0)}/${period}`;
}

const ORG_MONTHLY: TuitionRateCandidate = {
    id: "rate-org-monthly",
    program_key: "preschool",
    schedule_key: "full_time",
    rate_cents: 120000,
    billing_period: "monthly",
    location_id: null,
};

const ORG_WEEKLY: TuitionRateCandidate = {
    id: "rate-org-weekly",
    program_key: "preschool",
    schedule_key: "full_time",
    rate_cents: 30000,
    billing_period: "weekly",
    location_id: null,
};

const LOC_MONTHLY: TuitionRateCandidate = {
    id: "rate-loc-monthly",
    program_key: "preschool",
    schedule_key: "full_time",
    rate_cents: 135000,
    billing_period: "monthly",
    location_id: "loc-downtown",
};

const INFANT_MONTHLY: TuitionRateCandidate = {
    id: "rate-infant",
    program_key: "infant",
    schedule_key: "full_time",
    rate_cents: 200000,
    billing_period: "monthly",
    location_id: null,
};

// ── Period preference order ───────────────────────────────────────────────────

describe("TUITION_PERIOD_PREFERENCE", () => {
    it("monthly is first (most preferred)", () => {
        expect(TUITION_PERIOD_PREFERENCE[0]).toBe("monthly");
    });

    it("annual is last (least preferred)", () => {
        expect(TUITION_PERIOD_PREFERENCE[TUITION_PERIOD_PREFERENCE.length - 1]).toBe("annual");
    });

    it("covers all four billing periods", () => {
        expect(TUITION_PERIOD_PREFERENCE).toHaveLength(4);
        expect(TUITION_PERIOD_PREFERENCE).toContain("weekly");
        expect(TUITION_PERIOD_PREFERENCE).toContain("biweekly");
    });
});

// ── Null inputs (Rule 5) ──────────────────────────────────────────────────────

describe("missing placement → null (no fabrication)", () => {
    it("returns null when programKey is null", () => {
        const result = resolveEnrollmentTuitionRate([ORG_MONTHLY], null, "full_time", null, label);
        expect(result).toBeNull();
    });

    it("returns null when scheduleKey is null", () => {
        const result = resolveEnrollmentTuitionRate([ORG_MONTHLY], "preschool", null, null, label);
        expect(result).toBeNull();
    });

    it("returns null when both programKey and scheduleKey are null", () => {
        const result = resolveEnrollmentTuitionRate([ORG_MONTHLY], null, null, null, label);
        expect(result).toBeNull();
    });

    it("returns null when programKey is empty string", () => {
        const result = resolveEnrollmentTuitionRate([ORG_MONTHLY], "", "full_time", null, label);
        expect(result).toBeNull();
    });
});

// ── No match (Rule 4) ─────────────────────────────────────────────────────────

describe("no matching rate → null (no fabrication)", () => {
    it("returns null when no rates in pool match the program+schedule", () => {
        const result = resolveEnrollmentTuitionRate([ORG_MONTHLY], "toddler", "part_time", null, label);
        expect(result).toBeNull();
    });

    it("returns null when rate pool is empty", () => {
        const result = resolveEnrollmentTuitionRate([], "preschool", "full_time", null, label);
        expect(result).toBeNull();
    });

    it("returns null when program matches but schedule does not", () => {
        const result = resolveEnrollmentTuitionRate([ORG_MONTHLY], "preschool", "part_time", null, label);
        expect(result).toBeNull();
    });
});

// ── Org default fallback (Rule 2) ─────────────────────────────────────────────

describe("org default fallback", () => {
    it("returns org-default rate when locationId is null", () => {
        const result = resolveEnrollmentTuitionRate([ORG_MONTHLY], "preschool", "full_time", null, label);
        expect(result).not.toBeNull();
        expect(result?.rateId).toBe("rate-org-monthly");
        expect(result?.isLocationOverride).toBe(false);
    });

    it("returns org-default when locationId does not have an override", () => {
        const result = resolveEnrollmentTuitionRate(
            [ORG_MONTHLY],
            "preschool",
            "full_time",
            "loc-other",
            label,
        );
        expect(result?.rateId).toBe("rate-org-monthly");
        expect(result?.isLocationOverride).toBe(false);
    });
});

// ── Location override (Rule 2) ────────────────────────────────────────────────

describe("location override wins", () => {
    it("location rate beats org default when locationId matches", () => {
        const result = resolveEnrollmentTuitionRate(
            [ORG_MONTHLY, LOC_MONTHLY],
            "preschool",
            "full_time",
            "loc-downtown",
            label,
        );
        expect(result?.rateId).toBe("rate-loc-monthly");
        expect(result?.rateCents).toBe(135000);
        expect(result?.isLocationOverride).toBe(true);
    });

    it("location rate wins even when org rate has same billing period", () => {
        const result = resolveEnrollmentTuitionRate(
            [ORG_MONTHLY, LOC_MONTHLY],
            "preschool",
            "full_time",
            "loc-downtown",
            label,
        );
        // Both are monthly — location wins by tier priority, not period
        expect(result?.rateId).toBe("rate-loc-monthly");
    });

    it("location rate wins when org has a different billing period", () => {
        const locWeekly: TuitionRateCandidate = {
            ...LOC_MONTHLY,
            id: "rate-loc-weekly",
            billing_period: "weekly",
        };
        const result = resolveEnrollmentTuitionRate(
            [ORG_MONTHLY, locWeekly],
            "preschool",
            "full_time",
            "loc-downtown",
            label,
        );
        // Location weekly beats org monthly — tier wins over period
        expect(result?.rateId).toBe("rate-loc-weekly");
        expect(result?.isLocationOverride).toBe(true);
    });
});

// ── Period selection (Rule 3) ─────────────────────────────────────────────────

describe("period selection — deterministic preference", () => {
    it("prefers monthly over weekly at org level", () => {
        const result = resolveEnrollmentTuitionRate(
            [ORG_WEEKLY, ORG_MONTHLY],
            "preschool",
            "full_time",
            null,
            label,
        );
        expect(result?.rateId).toBe("rate-org-monthly");
        expect(result?.billingPeriod).toBe("monthly");
    });

    it("prefers weekly over biweekly when monthly absent", () => {
        const orgBiweekly: TuitionRateCandidate = {
            ...ORG_MONTHLY,
            id: "rate-biweekly",
            billing_period: "biweekly",
            rate_cents: 62000,
        };
        const result = resolveEnrollmentTuitionRate(
            [ORG_WEEKLY, orgBiweekly],
            "preschool",
            "full_time",
            null,
            label,
        );
        expect(result?.billingPeriod).toBe("weekly");
    });

    it("prefers biweekly over annual when only those exist", () => {
        const orgAnnual: TuitionRateCandidate = {
            ...ORG_MONTHLY,
            id: "rate-annual",
            billing_period: "annual",
            rate_cents: 1440000,
        };
        const orgBiweekly: TuitionRateCandidate = {
            ...ORG_MONTHLY,
            id: "rate-biweekly",
            billing_period: "biweekly",
            rate_cents: 62000,
        };
        const result = resolveEnrollmentTuitionRate(
            [orgAnnual, orgBiweekly],
            "preschool",
            "full_time",
            null,
            label,
        );
        expect(result?.billingPeriod).toBe("biweekly");
    });

    it("is stable regardless of input array order", () => {
        const forward = resolveEnrollmentTuitionRate(
            [ORG_MONTHLY, ORG_WEEKLY],
            "preschool",
            "full_time",
            null,
            label,
        );
        const reversed = resolveEnrollmentTuitionRate(
            [ORG_WEEKLY, ORG_MONTHLY],
            "preschool",
            "full_time",
            null,
            label,
        );
        expect(forward?.rateId).toBe(reversed?.rateId);
        expect(forward?.billingPeriod).toBe(reversed?.billingPeriod);
    });
});

// ── Multiple children / multiple programs ─────────────────────────────────────

describe("multiple program types in same pool", () => {
    it("resolves to the correct rate for each child's program", () => {
        const rates = [ORG_MONTHLY, INFANT_MONTHLY];

        const preschoolResult = resolveEnrollmentTuitionRate(rates, "preschool", "full_time", null, label);
        const infantResult = resolveEnrollmentTuitionRate(rates, "infant", "full_time", null, label);

        expect(preschoolResult?.rateId).toBe("rate-org-monthly");
        expect(infantResult?.rateId).toBe("rate-infant");
    });

    it("returns null for child whose program+schedule has no rate, even when others do", () => {
        const result = resolveEnrollmentTuitionRate([ORG_MONTHLY], "toddler", "full_time", null, label);
        expect(result).toBeNull();
    });
});

// ── Rate label formatting ─────────────────────────────────────────────────────

describe("rateLabel formatting", () => {
    it("passes rate cents and billing period to the formatter", () => {
        const calls: Array<[number, string]> = [];
        const trackingLabel = (cents: number, period: string) => {
            calls.push([cents, period]);
            return `${cents}/${period}`;
        };
        resolveEnrollmentTuitionRate([ORG_MONTHLY], "preschool", "full_time", null, trackingLabel);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual([120000, "monthly"]);
    });

    it("returns the formatter output as rateLabel", () => {
        const result = resolveEnrollmentTuitionRate(
            [ORG_MONTHLY],
            "preschool",
            "full_time",
            null,
            () => "CUSTOM_LABEL",
        );
        expect(result?.rateLabel).toBe("CUSTOM_LABEL");
    });
});
