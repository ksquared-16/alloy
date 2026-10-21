/**
 * The pattern an assignment Save writes — chosen or derived, never the site's first pattern.
 * Fixture: the staging QA site's patterns (census gar_cf9a0578b62738, 2026-10-20), in the order
 * the site lists them. Monday–Friday matches Full Day AND Before/After Care there.
 */
import { describe, expect, it } from "vitest";

import { resolveWrittenSchedulePattern } from "@/lib/operationalAssignments/writtenSchedulePattern";

const MF = [1, 2, 3, 4, 5];
const site = [
    { id: "before-care", weekdays: MF, scheduleTypeKey: "weekly" },
    { id: "full-day", weekdays: MF, scheduleTypeKey: "full_day" },
    { id: "qa-primary-day", weekdays: MF, scheduleTypeKey: "full_day" },
    { id: "after-care", weekdays: MF, scheduleTypeKey: "weekly" },
    { id: "soccer-tue", weekdays: [2], scheduleTypeKey: "weekly" },
    { id: "therapy-wed", weekdays: [3], scheduleTypeKey: "weekly" },
];

describe("resolveWrittenSchedulePattern", () => {
    it("THE DEFECT: nothing chosen and the days are ambiguous — writes nothing, never the first pattern", () => {
        const r = resolveWrittenSchedulePattern({ patterns: site, chosenScheduleType: null, days: MF });
        expect(r).toEqual({ patternId: null, scheduleType: null, ambiguous: true });
    });

    it("a chosen schedule type is written, preferring its pattern on the selected days", () => {
        expect(resolveWrittenSchedulePattern({ patterns: site, chosenScheduleType: "full_day", days: MF })).toEqual({
            patternId: "full-day",
            scheduleType: "full_day",
            ambiguous: false,
        });
        expect(resolveWrittenSchedulePattern({ patterns: site, chosenScheduleType: "weekly", days: [2] }).patternId).toBe("soccer-tue");
    });

    it("unchosen days that only one schedule type covers decide it", () => {
        expect(resolveWrittenSchedulePattern({ patterns: site, chosenScheduleType: null, days: [3] })).toEqual({
            patternId: "therapy-wed",
            scheduleType: "weekly",
            ambiguous: false,
        });
        // Order of selection does not matter.
        const only = site.filter((p) => p.scheduleTypeKey === "full_day");
        expect(resolveWrittenSchedulePattern({ patterns: only, chosenScheduleType: null, days: [5, 1, 3, 2, 4] }).scheduleType).toBe("full_day");
    });

    it("days no pattern covers, no days, a chosen type the site lacks: nothing written, not ambiguous", () => {
        expect(resolveWrittenSchedulePattern({ patterns: site, chosenScheduleType: null, days: [1, 3] })).toEqual({ patternId: null, scheduleType: null, ambiguous: false });
        expect(resolveWrittenSchedulePattern({ patterns: site, chosenScheduleType: null, days: [] }).patternId).toBeNull();
        expect(resolveWrittenSchedulePattern({ patterns: site, chosenScheduleType: "half_day", days: MF }).scheduleType).toBeNull();
        expect(resolveWrittenSchedulePattern({ patterns: [], chosenScheduleType: null, days: MF }).patternId).toBeNull();
    });

    it("an edited row keeps ITS pattern while its days are unchanged — After Care never becomes Before Care", () => {
        expect(resolveWrittenSchedulePattern({ patterns: site, chosenScheduleType: null, days: MF, chosenPatternId: "after-care" })).toEqual({
            patternId: "after-care",
            scheduleType: "weekly",
            ambiguous: false,
        });
        // Days changed away from the pattern: its type still guides, the pattern itself no longer fits.
        expect(resolveWrittenSchedulePattern({ patterns: site, chosenScheduleType: null, days: [2], chosenPatternId: "after-care" }).patternId).toBe("soccer-tue");
        // An unknown pattern id is ignored, not trusted.
        expect(resolveWrittenSchedulePattern({ patterns: site, chosenScheduleType: null, days: MF, chosenPatternId: "gone" }).ambiguous).toBe(true);
    });
});
