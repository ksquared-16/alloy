import { describe, expect, it } from "vitest";
import { validateChildPlacementScope } from "@/lib/orchestration/placement/validateChildPlacementScope";

describe("validateChildPlacementScope", () => {
    it("passes when site and cohort are consistent", () => {
        const r = validateChildPlacementScope({
            location_id: "loc_1",
            program_room_cohort_key: "infant",
        });
        expect(r.ok).toBe(true);
        expect(r.issues).toHaveLength(0);
    });

    it("rejects cohort without site", () => {
        const r = validateChildPlacementScope({ program_room_cohort_key: "infant" });
        expect(r.ok).toBe(false);
        expect(r.issues[0]?.code).toBe("cohort_without_site");
    });

    it("documents deferred rate/classroom checks", () => {
        const r = validateChildPlacementScope({
            location_id: "loc_1",
            rate_key: "rate_1",
        });
        expect(r.deferred_checks).toContain("rate_belongs_to_site_and_program");
    });
});
