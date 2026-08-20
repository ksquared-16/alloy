import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDaysYmdLocal, mondayOfWeekContaining } from "@/components/workspace/WeekPicker";

describe("WeekPicker helpers", () => {
    it("resolves Monday for mid-week dates", () => {
        // 2026-07-29 is Wednesday
        expect(mondayOfWeekContaining("2026-07-29")).toBe("2026-07-27");
    });

    it("keeps Monday unchanged", () => {
        expect(mondayOfWeekContaining("2026-07-27")).toBe("2026-07-27");
    });

    it("adds days across month boundaries", () => {
        expect(addDaysYmdLocal("2026-07-27", 7)).toBe("2026-08-03");
    });

    /**
     * The canonical WeekPicker is wired by the ROSTER CONTROL BAND, not by the Room Board.
     *
     * This asserted the Room Board imported it, which was true while every roster surface rendered
     * its own controls — and that is exactly what made Day, Week, Staff and Assignments put the same
     * controls in four different places. The picker moved to the one band that owns range, lens and
     * the date/week anchor for every state.
     *
     * The assertion is MOVED rather than deleted, and the negative half is kept: a surface that
     * starts wiring its own picker again has re-created the divergence.
     */
    it("the Roster control band wires WeekPicker — and no surface wires its own", () => {
        const band = readFileSync(
            join(process.cwd(), "components/adminV2/scheduling/screens/RosterControlBand.tsx"),
            "utf8",
        );
        expect(band).toContain('from "@/components/workspace/WeekPicker"');
        expect(band).toContain("onSelectWeek");

        for (const surface of ["SchedulingRoster", "DailyRoster", "RosterStaffLens"]) {
            const src = readFileSync(
                join(process.cwd(), `components/adminV2/scheduling/screens/${surface}.tsx`),
                "utf8",
            );
            expect(src, `${surface} must not wire its own week picker`).not.toContain(
                'from "@/components/workspace/WeekPicker"',
            );
            expect(src, `${surface} must not render its own range/lens control`).not.toContain(
                "rangeControl",
            );
        }
    });

    it("assignment.change_room is registered", () => {
        const registry = readFileSync(join(process.cwd(), "lib/adminV2/actions/actionRegistry.ts"), "utf8");
        expect(registry).toContain("assignmentChangeRoomAction");
    });
});
