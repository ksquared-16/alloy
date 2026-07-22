import { describe, expect, it } from "vitest";
import {
    classifyPlacementOptions,
    DEFAULT_RECOMMENDATION_POLICY,
    type RoomOccupancyDelta,
} from "@/lib/scheduling/options/generatePlacementOptions";

function delta(
    roomId: string,
    afterPeakOccupancy: number,
    blockers: string[] = [],
    roomName = roomId,
    extra: Partial<Pick<RoomOccupancyDelta, "programMatch" | "continuity">> = {}
): RoomOccupancyDelta {
    return {
        roomId,
        roomName,
        beforePeakOccupancy: afterPeakOccupancy - 1,
        afterPeakOccupancy,
        blockers,
        ...extra,
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

    it("prefers the program/age-matched room over merely emptier rooms (headroom alone is not sufficient)", () => {
        const opts = classifyPlacementOptions([
            delta("empty_wrong_age", 3, [], "empty_wrong_age", { programMatch: false }),
            delta("program_room", 9, [], "program_room", { programMatch: true }),
        ]);
        const rec = opts.find((o) => o.classification === "recommended")!;
        expect(rec.roomId).toBe("program_room");
        expect(rec.reason).toContain("Right room for the program");
    });

    it("prefers continuity when no program match distinguishes the rooms", () => {
        const opts = classifyPlacementOptions([
            delta("new_empty", 4, [], "new_empty", { continuity: false }),
            delta("current_room", 7, [], "current_room", { continuity: true }),
        ]);
        const rec = opts.find((o) => o.classification === "recommended")!;
        expect(rec.roomId).toBe("current_room");
        expect(rec.reason).toContain("continuity");
    });

    it("never recommends a blocked room even when it is the program match", () => {
        const opts = classifyPlacementOptions([
            delta("program_full", 12, ["expected 12 exceeds capacity 11"], "program_full", { programMatch: true }),
            delta("open_room", 8, [], "open_room", { programMatch: false }),
        ]);
        expect(opts.find((o) => o.roomId === "program_full")!.classification).toBe("blocked");
        expect(opts.find((o) => o.classification === "recommended")!.roomId).toBe("open_room");
    });

    it("honors a configured policy that puts headroom first", () => {
        const headroomFirst = { factors: ["headroom", "program_match", "continuity"] as const };
        const opts = classifyPlacementOptions(
            [
                delta("program_room", 9, [], "program_room", { programMatch: true }),
                delta("emptier", 3, [], "emptier", { programMatch: false }),
            ],
            { factors: [...headroomFirst.factors] }
        );
        expect(opts.find((o) => o.classification === "recommended")!.roomId).toBe("emptier");
    });

    it("default policy leads with program match, then continuity, then headroom", () => {
        expect(DEFAULT_RECOMMENDATION_POLICY.factors).toEqual([
            "program_match",
            "continuity",
            "headroom",
        ]);
    });
});
