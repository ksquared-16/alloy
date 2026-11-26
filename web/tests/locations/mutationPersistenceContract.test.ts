import { describe, expect, it } from "vitest";
import { mutationResponseContainsPatch } from "@/lib/locations/mutationPersistenceContract";

describe("mutationResponseContainsPatch", () => {
    it("requires nested metadata, arrays, nulls, false, and zero to match", () => {
        const response = {
            label: "Infant",
            is_active: false,
            metadata: {
                age_range_from: "0",
                age_range_to: null,
                weekdays: [1, 3, 5],
                retained: true,
            },
        };

        expect(
            mutationResponseContainsPatch(response, {
                label: "Infant",
                is_active: false,
                metadata: {
                    age_range_from: "0",
                    age_range_to: null,
                    weekdays: [1, 3, 5],
                },
            }),
        ).toBe(true);
        expect(mutationResponseContainsPatch(response, { is_active: true })).toBe(false);
        expect(mutationResponseContainsPatch(response, { metadata: { weekdays: [1, 5] } })).toBe(false);
    });

    it("allows authoritative responses to contain additional fields", () => {
        expect(
            mutationResponseContainsPatch(
                { id: "program-1", label: "Toddler", metadata: { age_range_unit: "months", retained: true } },
                { label: "Toddler", metadata: { age_range_unit: "months" } },
            ),
        ).toBe(true);
    });
});
