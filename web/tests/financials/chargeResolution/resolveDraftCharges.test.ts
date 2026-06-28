import { describe, expect, it } from "vitest";
import { resolveScheduleBasis } from "@/lib/financials/chargeResolution/scheduleBasis";
import {
    deriveBillableQuantity,
    scheduledServiceDates,
} from "@/lib/financials/chargeResolution/billableQuantity";
import { resolveChargeResponsibility } from "@/lib/financials/chargeResolution/responsibility";
import { resolveDraftTuitionCharge } from "@/lib/financials/chargeResolution/resolveDraftCharges";
import type { ResolvedRate } from "@/lib/financials/rates/resolveRate";
import type {
    CalculationStrategy,
    ChildcareRatePlanRow,
    ChildcareRateRuleRow,
    RateBasis,
    ScheduleBasis,
} from "@/lib/financials/rates/rateTypes";

function makeResolvedRate(args: {
    scheduleBasis: ScheduleBasis;
    rateBasis: RateBasis;
    amountCents: number;
    calculationStrategy?: CalculationStrategy;
    currencyCode?: string;
    ruleId?: string;
    planId?: string;
}): ResolvedRate {
    const plan = {
        id: args.planId ?? "plan-1",
        currency_code: args.currencyCode ?? "USD",
        calculation_strategy: args.calculationStrategy ?? "scheduled",
    } as unknown as ChildcareRatePlanRow;
    const rule = {
        id: args.ruleId ?? "rule-1",
        schedule_basis: args.scheduleBasis,
        rate_basis: args.rateBasis,
        amount_cents: args.amountCents,
    } as unknown as ChildcareRateRuleRow;
    return {
        resolved: true,
        plan,
        rule,
        amountCents: args.amountCents,
        currencyCode: args.currencyCode ?? "USD",
        rateBasis: args.rateBasis,
        scheduleBasis: args.scheduleBasis,
        calculationStrategy: args.calculationStrategy ?? "scheduled",
    };
}

describe("resolveScheduleBasis (P3.3)", () => {
    it("day-count fallback maps 3/4/5 weekdays to N-day basis", () => {
        expect(resolveScheduleBasis({ id: "p", weekdays: [1, 2, 3], schedule_type_key: "part" })).toBe("three_day");
        expect(resolveScheduleBasis({ id: "p", weekdays: [1, 2, 3, 4], schedule_type_key: "part" })).toBe("four_day");
        expect(resolveScheduleBasis({ id: "p", weekdays: [1, 2, 3, 4, 5], schedule_type_key: "x" })).toBe("five_day");
    });

    it("known schedule_type_key maps to full/half/hourly/drop_in", () => {
        expect(resolveScheduleBasis({ id: "p", weekdays: [1, 2, 3, 4, 5], schedule_type_key: "full_time" })).toBe("full_day");
        expect(resolveScheduleBasis({ id: "p", weekdays: [1, 2], schedule_type_key: "half_day" })).toBe("half_day");
        expect(resolveScheduleBasis({ id: "p", weekdays: [], schedule_type_key: "hourly" })).toBe("hourly");
        expect(resolveScheduleBasis({ id: "p", weekdays: [], schedule_type_key: "drop_in" })).toBe("drop_in");
    });

    it("override map and metadata take precedence over type key and day count", () => {
        const pattern = { id: "p", weekdays: [1, 2, 3, 4, 5], schedule_type_key: "full_time", metadata: { schedule_basis: "half_day" } };
        expect(resolveScheduleBasis(pattern)).toBe("half_day");
        expect(resolveScheduleBasis(pattern, { scheduleBasisByPatternId: { p: "three_day" } })).toBe("three_day");
    });

    it("returns null when unclassifiable", () => {
        expect(resolveScheduleBasis({ id: "p", weekdays: [1, 2], schedule_type_key: "mystery" })).toBeNull();
    });
});

describe("deriveBillableQuantity (P3.3)", () => {
    const period = { periodStart: "2026-03-01", periodEnd: "2026-03-31" };

    it("monthly/annual/weekly are flat 1 unit per period", () => {
        for (const rateBasis of ["monthly", "annual", "weekly"] as RateBasis[]) {
            const q = deriveBillableQuantity({ rateBasis, calculationStrategy: "scheduled", ...period });
            expect(q).toMatchObject({ resolved: true, quantity: 1, unit: "period" });
        }
    });

    it("fixed strategy collapses to 1 regardless of basis", () => {
        const q = deriveBillableQuantity({ rateBasis: "daily", calculationStrategy: "fixed", ...period });
        expect(q).toMatchObject({ resolved: true, quantity: 1 });
    });

    it("daily scheduled counts scheduled days in period", () => {
        const scheduledDates = ["2026-03-02", "2026-03-03", "2026-03-04"];
        const q = deriveBillableQuantity({
            rateBasis: "daily",
            calculationStrategy: "scheduled",
            ...period,
            signal: { scheduledDates },
        });
        expect(q).toMatchObject({ resolved: true, quantity: 3, unit: "day" });
    });

    it("daily attendance_actual counts attended days in period", () => {
        const q = deriveBillableQuantity({
            rateBasis: "daily",
            calculationStrategy: "attendance_actual",
            ...period,
            signal: { attendedDates: ["2026-03-02", "2026-03-03"], scheduledDates: ["2026-03-02", "2026-03-03", "2026-03-04"] },
        });
        expect(q).toMatchObject({ resolved: true, quantity: 2, unit: "day" });
    });

    it("hybrid daily falls back to scheduled with placeholder flag", () => {
        const q = deriveBillableQuantity({
            rateBasis: "daily",
            calculationStrategy: "hybrid",
            ...period,
            signal: { scheduledDates: ["2026-03-02", "2026-03-03"] },
        });
        expect(q).toMatchObject({ resolved: true, quantity: 2, placeholder: "hybrid_uses_scheduled_fallback" });
    });

    it("hourly is unresolved without an hours signal", () => {
        const q = deriveBillableQuantity({ rateBasis: "hourly", calculationStrategy: "scheduled", ...period });
        expect(q.resolved).toBe(false);
    });

    it("hourly resolves with an explicit hours signal", () => {
        const q = deriveBillableQuantity({
            rateBasis: "hourly",
            calculationStrategy: "attendance_actual",
            ...period,
            signal: { hours: 6 },
        });
        expect(q).toMatchObject({ resolved: true, quantity: 6, unit: "hour" });
    });

    it("daily with no scheduled days is unresolved (no empty draft)", () => {
        const q = deriveBillableQuantity({ rateBasis: "daily", calculationStrategy: "scheduled", ...period });
        expect(q.resolved).toBe(false);
    });
});

describe("scheduledServiceDates (P3.3)", () => {
    it("enumerates weekday-pattern dates within the period", () => {
        // 2026-03-02 is a Monday. Weekdays [1,3,5] = Mon/Wed/Fri.
        const dates = scheduledServiceDates("2026-03-02", "2026-03-08", [1, 3, 5]);
        expect(dates).toEqual(["2026-03-02", "2026-03-04", "2026-03-06"]);
    });
});

describe("resolveChargeResponsibility (P3.3)", () => {
    it("defaults to the household/account customer_id", () => {
        const r = resolveChargeResponsibility({ customer_id: "cust-1", customer_member_id: "member-1" });
        expect(r).toEqual({ partyType: "customer", partyId: "cust-1", basis: "household_account_default" });
    });

    it("falls back to customer_member when no account is denormalized", () => {
        const r = resolveChargeResponsibility({ customer_id: null, customer_member_id: "member-1" });
        expect(r).toEqual({ partyType: "customer_member", partyId: "member-1", basis: "customer_member_fallback" });
    });
});

describe("resolveDraftTuitionCharge (P3.3)", () => {
    const period = { key: "2026-03", start: "2026-03-01", end: "2026-03-31" };
    const responsibility = resolveChargeResponsibility({ customer_id: "cust-1", customer_member_id: "member-1" });

    it("monthly flat tuition draft = rule amount, tuition category, enrollment source", () => {
        const rate = makeResolvedRate({ scheduleBasis: "five_day", rateBasis: "monthly", amountCents: 120000 });
        const res = resolveDraftTuitionCharge({
            orgId: "org-1",
            enrollmentAgreementId: "agr-1",
            period,
            rate,
            responsibility,
        });
        expect(res.resolved).toBe(true);
        if (!res.resolved) return;
        expect(res.amountCents).toBe(120000);
        expect(res.chargeCategory).toBe("tuition");
        expect(res.billableSourceType).toBe("enrollment_agreement");
        expect(res.billableSourceId).toBe("agr-1");
        expect(res.currencyCode).toBe("USD");
        expect(res.serviceDate).toBe("2026-03-01");
        expect(res.resolutionKey).toBe("tuition:agr-1:2026-03:five_day:rule-1");
        expect(res.metadata.responsibility).toEqual({
            party_type: "customer",
            party_id: "cust-1",
            basis: "household_account_default",
        });
    });

    it("daily scheduled tuition multiplies unit amount by scheduled days", () => {
        const rate = makeResolvedRate({ scheduleBasis: "three_day", rateBasis: "daily", amountCents: 5000 });
        const res = resolveDraftTuitionCharge({
            orgId: "org-1",
            enrollmentAgreementId: "agr-1",
            period,
            rate,
            responsibility,
            signal: { scheduledDates: ["2026-03-02", "2026-03-04", "2026-03-06"] },
        });
        expect(res.resolved).toBe(true);
        if (!res.resolved) return;
        expect(res.amountCents).toBe(15000);
        expect(res.metadata.quantity).toBe(3);
        expect(res.metadata.unit_amount_cents).toBe(5000);
    });

    it("unresolved when quantity cannot be derived", () => {
        const rate = makeResolvedRate({ scheduleBasis: "hourly", rateBasis: "hourly", amountCents: 2000 });
        const res = resolveDraftTuitionCharge({
            orgId: "org-1",
            enrollmentAgreementId: "agr-1",
            period,
            rate,
            responsibility,
        });
        expect(res.resolved).toBe(false);
    });
});
