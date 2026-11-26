import { describe, expect, it } from "vitest";
import {
    filterOperatorCalculations,
    isDeveloperCollectionMode,
    isOperatorHiddenCalculation,
    markAsDeveloperTryDraftName,
} from "@/lib/organizationCalculations/operatorCollectionFilter";

describe("operatorCollectionFilter", () => {
    it("hides OI-QA fixtures from operator collections", () => {
        expect(isOperatorHiddenCalculation({ name: "OI-QA Room Utilization — preview" })).toBe(true);
        expect(isOperatorHiddenCalculation({ name: "QA temporary try-it draft" })).toBe(true);
        expect(isOperatorHiddenCalculation({ name: "Room Utilization" })).toBe(false);
        expect(isOperatorHiddenCalculation({ name: "Capacity" })).toBe(false);
    });

    it("hides try-it and proving-slice names", () => {
        expect(isOperatorHiddenCalculation({ name: "Temporary try-it definition" })).toBe(true);
        expect(isOperatorHiddenCalculation({ description: "proving slice harness" })).toBe(true);
        expect(isOperatorHiddenCalculation({ key: "qa_room_util" })).toBe(true);
    });

    it("filters operator list unless developer mode", () => {
        const items = [
            { name: "Room Utilization" },
            { name: "OI-QA Duplicate Room Utilization" },
            { name: "Capacity" },
        ];
        expect(filterOperatorCalculations(items).map((i) => i.name)).toEqual([
            "Room Utilization",
            "Capacity",
        ]);
        expect(filterOperatorCalculations(items, { developerMode: true })).toHaveLength(3);
    });

    it("marks try drafts with OI-QA prefix", () => {
        expect(markAsDeveloperTryDraftName("Room Utilization")).toBe(
            "OI-QA Room Utilization — preview",
        );
    });

    it("detects developer mode from search params", () => {
        expect(isDeveloperCollectionMode(new URLSearchParams("developer=1"))).toBe(true);
        expect(isDeveloperCollectionMode(new URLSearchParams("dev=1"))).toBe(true);
        expect(isDeveloperCollectionMode(new URLSearchParams())).toBe(false);
    });
});
