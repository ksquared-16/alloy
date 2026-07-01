import { describe, expect, it } from "vitest";
import {
    interpretSchedule,
    prorateAmountCents,
    weekdaysToScheduleBasis,
} from "@/lib/operationalConsumption/scheduleInterpretation";
import type { OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";

function fact(over: Partial<OperationalFactDto> = {}): OperationalFactDto {
    return {
        eventKey: "schedule.recurring_tuition",
        sourceFamily: "schedule",
        sourceEntityType: "child_enrollment_agreements",
        sourceEntityId: "agr-1",
        ...over,
    };
}

describe("weekdaysToScheduleBasis", () => {
    it("maps MWF (3 weekdays) to three_day", () => {
        expect(weekdaysToScheduleBasis([1, 3, 5])).toBe("three_day");
    });
    it("maps 4 and 5 day weeks", () => {
        expect(weekdaysToScheduleBasis([1, 2, 3, 4])).toBe("four_day");
        expect(weekdaysToScheduleBasis([1, 2, 3, 4, 5])).toBe("five_day");
    });
    it("maps a single day to drop_in and an unsupported 2-day week to null", () => {
        expect(weekdaysToScheduleBasis([3])).toBe("drop_in");
        expect(weekdaysToScheduleBasis([1, 3])).toBeNull();
    });
    it("prefers an explicit valid schedule_type_key", () => {
        expect(weekdaysToScheduleBasis([1, 3, 5], "five_day")).toBe("five_day");
        expect(weekdaysToScheduleBasis([], "three_day")).toBe("three_day");
    });
});

describe("interpretSchedule — not every mutation is commercial", () => {
    it("recurring schedule → one recurring tuition directive (draftable)", () => {
        const r = interpretSchedule(fact({ scheduleChangeKind: "recurring", scheduleBasis: "three_day" }));
        expect(r.directives).toHaveLength(1);
        expect(r.directives[0]).toMatchObject({ obligationKind: "recurring_tuition", eventKey: "schedule.recurring_tuition", scheduleBasis: "three_day", draftable: true });
        expect(r.noImpactReason).toBeNull();
    });

    it("recurring with an unresolvable basis → no obligation, explained", () => {
        const r = interpretSchedule(fact({ scheduleChangeKind: "recurring", weekdays: [1, 3] }));
        expect(r.directives).toHaveLength(0);
        expect(r.noImpactReason).toMatch(/not rate-resolvable/i);
    });

    it("temporary schedule → proration directive (preview only, not draftable)", () => {
        const r = interpretSchedule(fact({ scheduleChangeKind: "temporary", scheduleBasis: "three_day" }));
        expect(r.directives[0]).toMatchObject({ obligationKind: "proration", draftable: false });
    });

    it("extra day → drop-in-rate directive at drop_in basis", () => {
        const r = interpretSchedule(fact({ scheduleChangeKind: "extra_day" }));
        expect(r.directives[0]).toMatchObject({ obligationKind: "extra_day", scheduleBasis: "drop_in", draftable: true });
    });

    it("drop-in → drop-in directive", () => {
        const r = interpretSchedule(fact({ scheduleChangeKind: "drop_in" }));
        expect(r.directives[0]).toMatchObject({ obligationKind: "drop_in", scheduleBasis: "drop_in", draftable: true });
    });

    it("replacement → proration credit (preview) + replacement recurring tuition (draftable)", () => {
        const r = interpretSchedule(fact({ scheduleChangeKind: "replacement", scheduleBasis: "three_day", priorScheduleBasis: "five_day" }));
        expect(r.directives).toHaveLength(2);
        expect(r.directives[0]).toMatchObject({ obligationKind: "proration_credit", scheduleBasis: "five_day", draftable: false });
        expect(r.directives[1]).toMatchObject({ obligationKind: "recurring_tuition", scheduleBasis: "three_day", draftable: true });
    });

    it.each(["holiday_override", "exception", "no_op"] as const)("%s → NO obligation, with an explanation", (kind) => {
        const r = interpretSchedule(fact({ scheduleChangeKind: kind }));
        expect(r.directives).toHaveLength(0);
        expect(r.noImpactReason).toBeTruthy();
    });
});

describe("prorateAmountCents", () => {
    it("prorates by affected/total days", () => {
        expect(prorateAmountCents(82000, 10, 22)).toBe(Math.round((82000 * 10) / 22));
    });
    it("returns null when inputs are missing or invalid", () => {
        expect(prorateAmountCents(82000, null, 22)).toBeNull();
        expect(prorateAmountCents(null, 10, 22)).toBeNull();
        expect(prorateAmountCents(82000, 10, 0)).toBeNull();
    });
});
