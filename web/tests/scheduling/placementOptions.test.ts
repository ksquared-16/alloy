import { describe, expect, it } from "vitest";
import {
    classifyPlacementOptions,
    type RoomOccupancyDelta,
} from "@/lib/scheduling/options/generatePlacementOptions";

function delta(
    roomId: string,
    afterPeakOccupancy: number,
    blockers: string[] = [],
    roomName = roomId
): RoomOccupancyDelta {
    return {
        roomId,
        roomName,
        beforePeakOccupancy: afterPeakOccupancy - 1,
        afterPeakOccupancy,
        blockers,
    };
}

describe("classifyPlacementOptions", () => {
    it("recommends the eligible room with the most headroom (lowest resulting occupancy)", () => {
        const opts = classifyPlacementOptions([
            delta("sunflower", 11),
            delta("sunshine", 8),
            delta("rainbow", 10),
        ]);
        const recommended = opts.filter((o) => o.classification === "recommended");
        expect(recommended).toHaveLength(1);
        expect(recommended[0].roomId).toBe("sunshine");
        expect(recommended[0].reason).toContain("Most headroom");
        // recommended sorts first
        expect(opts[0].roomId).toBe("sunshine");
    });

    it("marks rooms with blockers as blocked and never recommends them", () => {
        const opts = classifyPlacementOptions([
            delta("full", 12, ["expected 12 exceeds capacity 11"]),
            delta("sunshine", 9),
        ]);
        const full = opts.find((o) => o.roomId === "full")!;
        expect(full.classification).toBe("blocked");
        expect(full.reason).toBe("expected 12 exceeds capacity 11");
        expect(opts.find((o) => o.classification === "recommended")!.roomId).toBe("sunshine");
    });

    it("recommends nothing when every candidate is blocked (no valid room)", () => {
        const opts = classifyPlacementOptions([
            delta("a", 12, ["capacity"]),
            delta("b", 13, ["age group ineligible"]),
        ]);
        expect(opts.every((o) => o.classification === "blocked")).toBe(true);
        expect(opts.some((o) => o.classification === "recommended")).toBe(false);
    });

    it("breaks headroom ties stably by room id", () => {
        const opts = classifyPlacementOptions([delta("bravo", 8), delta("alpha", 8)]);
        expect(opts[0].classification).toBe("recommended");
        expect(opts[0].roomId).toBe("alpha");
    });
});
