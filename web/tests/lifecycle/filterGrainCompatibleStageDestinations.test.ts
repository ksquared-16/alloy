import { describe, expect, it } from "vitest";

import {
    entityGrainFromJourneySegment,
    filterGrainCompatibleStageDestinations,
} from "@/lib/lifecycle/filterGrainCompatibleStageDestinations";

describe("filterGrainCompatibleStageDestinations", () => {
    const stages = [
        { key: "lead", label: "Lead", grain: "family" },
        { key: "tour", label: "Tour", grain: "family" },
        { key: "waitlist", label: "Waitlist", grain: "child" },
        { key: "enrolling", label: "Enrolling", grain: "child" },
    ];

    it("maps journey segment to entity grain", () => {
        expect(entityGrainFromJourneySegment("family")).toBe("family");
        expect(entityGrainFromJourneySegment("child")).toBe("child");
        expect(entityGrainFromJourneySegment(undefined)).toBeNull();
    });

    it("excludes child Waitlist from family stage Ways Out destinations", () => {
        const destinations = filterGrainCompatibleStageDestinations({
            processStages: stages,
            stageKey: "lead",
            entityGrain: "family",
        });
        expect(destinations.map((s) => s.key)).toEqual(["tour"]);
        expect(destinations.map((s) => s.key)).not.toContain("waitlist");
    });

    it("excludes family stages from child Ways Out destinations", () => {
        const destinations = filterGrainCompatibleStageDestinations({
            processStages: stages,
            stageKey: "waitlist",
            entityGrain: "child",
        });
        expect(destinations.map((s) => s.key)).toEqual(["enrolling"]);
        expect(destinations.map((s) => s.key)).not.toContain("lead");
    });

    it("fail-opens when entity grain is unknown (no silent invented filter)", () => {
        const destinations = filterGrainCompatibleStageDestinations({
            processStages: stages,
            stageKey: "lead",
            entityGrain: null,
        });
        expect(destinations.map((s) => s.key)).toEqual(["tour", "waitlist", "enrolling"]);
    });
});
