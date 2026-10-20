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
