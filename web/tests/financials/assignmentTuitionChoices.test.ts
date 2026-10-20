/**
 * The Assignments card's tuition list, override rule and custom amount parsing.
 */
import { describe, expect, it } from "vitest";

import {
    dollarsToCents,
    isTuitionOverride,
    tuitionChoicesFor,
} from "@/components/admin/focusPanel/cards/SchedulingCard";
import type { AssignmentTuitionView } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";

function option(id: string, programKey: string, amountLabel: string, variantLabel = "Full time") {
    return {
        sourceId: id,
        offeringId: `off-${programKey}`,
        variantId: `var-${id}`,
        variantLabel,
        programKey,
        attendanceType: "full_day",
        cadenceKey: "monthly",
        amountCents: 0,
        currencyCode: "USD",
        amountLabel,
        scope: "location" as const,
        effectiveStart: null,
        effectiveEnd: null,
        matched: [],
    };
}

const view = {
    recommended: option("r-rec", "toddler", "$1,600.00/monthly"),
    applicable: [option("r-other", "toddler", "$1,500.00/monthly", "Part time"), option("r-rec", "toddler", "$1,600.00/monthly")],
    additional: [option("r-pre", "pre_k", "$1,200.00/monthly")],
} as unknown as AssignmentTuitionView;

describe("tuitionChoicesFor", () => {
    it("lists the assignment's rates, the recommendation first and named", () => {
        expect(tuitionChoicesFor(view, false).map((c) => c.label)).toEqual([
            "Recommended — Full time: $1,600.00/monthly",
            "Part time: $1,500.00/monthly",
        ]);
    });

    it("adds the site's other rates only when asked, named by program", () => {
        const all = tuitionChoicesFor(view, true);
        expect(all.at(-1)).toMatchObject({ id: "r-pre", additional: true, label: "pre k · Full time: $1,200.00/monthly" });
    });
});

describe("isTuitionOverride", () => {
    it("taking the recommendation as authored is not an override", () => {
        expect(isTuitionOverride(view, "r-rec", false)).toBe(false);
    });
    it("another rate, an additional rate, or a custom amount is", () => {
        expect(isTuitionOverride(view, "r-other", false)).toBe(true);
        expect(isTuitionOverride(view, "r-pre", false)).toBe(true);
        expect(isTuitionOverride(view, "r-rec", true)).toBe(true);
    });
});

describe("dollarsToCents", () => {
    it("parses operator input", () => {
        expect(dollarsToCents("$1,450.50")).toBe(145_050);
        expect(dollarsToCents("1450")).toBe(145_000);
        expect(dollarsToCents(" 12.5 ")).toBe(1_250);
    });
    it("refuses what is not a positive amount", () => {
        for (const bad of ["", "0", "abc", "1.234", "-5"]) expect(dollarsToCents(bad)).toBeNull();
    });
});

import { reconcileTuitionSelection } from "@/components/admin/focusPanel/cards/SchedulingCard";

describe("reconcileTuitionSelection — an assignment change never silently keeps or swaps a rate", () => {
    const tie = { ...view, recommended: null } as unknown as AssignmentTuitionView;

    it("an automatic selection follows a single recommendation", () => {
        expect(reconcileTuitionSelection({ view, current: "", operatorChose: false })).toEqual({ next: "r-rec", invalidated: null });
    });
    it("a tie preselects nothing — the operator chooses", () => {
        expect(reconcileTuitionSelection({ view: tie, current: "", operatorChose: false })).toEqual({ next: "", invalidated: null });
    });
    it("an automatic selection follows the resolution — a tie clears it", () => {
        expect(reconcileTuitionSelection({ view: tie, current: "r-rec", operatorChose: false })).toEqual({ next: "", invalidated: null });
    });
    it("a still-eligible choice stays", () => {
        expect(reconcileTuitionSelection({ view, current: "r-other", operatorChose: true })).toEqual({ next: "r-other", invalidated: null });
    });
    it("an operator's additional-rate override stays an override", () => {
        expect(reconcileTuitionSelection({ view, current: "r-pre", operatorChose: true })).toEqual({ next: "r-pre", invalidated: null });
    });
    it("an operator's choice the change made ineligible is cleared and named — not replaced", () => {
        expect(reconcileTuitionSelection({ view, current: "r-gone", operatorChose: true })).toEqual({ next: "", invalidated: "r-gone" });
    });
});

import { tuitionNoMatchMessage } from "@/components/admin/focusPanel/cards/SchedulingCard";

describe("tuitionNoMatchMessage — the step to take, from the resolution's own reason", () => {
    const base = { additional: [{}] as never[], facts: { daysPerWeek: null } as never };
    it("no days yet", () => {
        expect(tuitionNoMatchMessage({ ...base, noMatchReason: "unsupported_schedule_basis" })).toBe(
            "Choose days to see matching rates — or choose from additional rates.",
        );
    });
    it("days with no rate", () => {
        expect(
            tuitionNoMatchMessage({ additional: [], facts: { daysPerWeek: 4 } as never, noMatchReason: "unsupported_schedule_basis" }),
        ).toBe("No rate is offered for 4 days a week in this program.");
    });
    it("no days yet, whatever reason code the resolver landed on", () => {
        expect(tuitionNoMatchMessage({ ...base, noMatchReason: "no_rate_for_scope" })).toMatch(/^Choose days to see matching rates/);
    });
    it("no program", () => {
        expect(tuitionNoMatchMessage({ ...base, noMatchReason: "missing_required_input" })).toMatch(/^Choose a room or program/);
    });
});
