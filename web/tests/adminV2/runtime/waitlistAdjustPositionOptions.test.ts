/**
 * The adjust control must offer only positions the placement model can actually express.
 *
 * The old control was a free-text box accepting 1-999, while the command's `pin_ordinal` is scoped to
 * the row's own GROUP and the displayed rank is scoped to the SECTION. An operator could therefore
 * enter a number meaningless in the row's group and get a result that looked wrong without being
 * wrong — the confusion `pin_scoped_to_cohort` exists to explain.
 */
import { describe, expect, it } from "vitest";

import {
    WAITLIST_ADJUST_MAX_LISTED,
    isValidWaitlistAdjustPosition,
    waitlistAdjustPositionModel,
} from "@/lib/ui-v2/waitlistAdjustPositionOptions";

describe("selectable waitlist positions", () => {
    it("offers exactly the row's own range, not an arbitrary one", () => {
        const m = waitlistAdjustPositionModel("2/4");
        expect(m.options).toEqual([1, 2, 3, 4]);
        expect(m.total).toBe(4);
        expect(m.current).toBe(2);
        expect(m.customReachesFurther).toBe(false);
    });

    it("reads the canonical preview label without inventing a second parser", () => {
        const m = waitlistAdjustPositionModel("Preview 1/3");
        expect(m.options).toEqual([1, 2, 3]);
        expect(m.current).toBe(1);
    });

    it("caps a long queue but keeps Custom as the way further", () => {
        const m = waitlistAdjustPositionModel("3/40");
        expect(m.options).toHaveLength(WAITLIST_ADJUST_MAX_LISTED);
        expect(m.total).toBe(40);
        expect(m.customReachesFurther).toBe(true);
    });

    it("always keeps the CURRENT position selectable, even past the listed window", () => {
        // Otherwise the control opens unable to represent where the row already is.
        const m = waitlistAdjustPositionModel("27/40");
        expect(m.options).toContain(27);
        expect(m.current).toBe(27);
    });

    it("an unreadable label offers no invented range", () => {
        const m = waitlistAdjustPositionModel("—");
        expect(m.options).toEqual([]);
        expect(m.total).toBeNull();
        expect(m.customReachesFurther).toBe(true);
    });

    it("takes the label alone — there is no second scope to carry", () => {
        // This asserted a `scopedToGroup` flag, which let the control title its field "Group
        // position" when the pin applied to a narrower set than the rank on screen. A pin is now
        // placed in the section the row is displayed in, so the field is just "Position".
        expect(waitlistAdjustPositionModel.length).toBe(1);
        const m = waitlistAdjustPositionModel("3/7");
        expect(m.current).toBe(3);
        expect(m.total).toBe(7);
        expect(m.options).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });
});

describe("custom position validity", () => {
    it("accepts a position inside the row's own scope", () => {
        expect(isValidWaitlistAdjustPosition(4, { total: 4 })).toBe(true);
        expect(isValidWaitlistAdjustPosition(1, { total: 4 })).toBe(true);
    });

    it("refuses a move past the end of the row's scope", () => {
        // The API's 1-999 guard would accept this; the model cannot express it.
        expect(isValidWaitlistAdjustPosition(5, { total: 4 })).toBe(false);
        expect(isValidWaitlistAdjustPosition(999, { total: 40 })).toBe(false);
    });

    it("refuses zero, negatives and fractions", () => {
        for (const v of [0, -1, 2.5, Number.NaN]) {
            expect(isValidWaitlistAdjustPosition(v, { total: 10 })).toBe(false);
        }
    });

    it("falls back to the command's own guard when the total is unknown", () => {
        expect(isValidWaitlistAdjustPosition(500, { total: null })).toBe(true);
        expect(isValidWaitlistAdjustPosition(1000, { total: null })).toBe(false);
    });
});
