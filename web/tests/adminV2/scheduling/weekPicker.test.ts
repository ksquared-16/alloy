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

    it("Room Board wires WeekPicker (not Assignment-only picker)", () => {
        const roster = readFileSync(
            join(process.cwd(), "components/adminV2/scheduling/screens/SchedulingRoster.tsx"),
            "utf8",
        );
        expect(roster).toContain('from "@/components/workspace/WeekPicker"');
        expect(roster).toContain("onSelectWeek");
    });

    it("assignment.change_room is registered", () => {
        const registry = readFileSync(join(process.cwd(), "lib/adminV2/actions/actionRegistry.ts"), "utf8");
        expect(registry).toContain("assignmentChangeRoomAction");
    });
});
