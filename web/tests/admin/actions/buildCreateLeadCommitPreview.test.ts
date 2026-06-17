import { describe, expect, it, beforeEach } from "vitest";
import { buildCreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";
import {
    __resetHouseholdCandidateCounterForTests,
    groupFactsIntoHouseholdCandidates,
} from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import {
    __resetExtractFactCounterForTests,
    extractFactsFromText,
} from "@/lib/intake/extract/extractFactsFromText";
const HOUSEHOLD_PASTE = [
    "Parents: Alex and Jason Lyons",
    "Children: Jaxon (11/23/2013 DOB) and Max (11/14/2017 DOB)",
    "1234 Main Street",
    "Bend Oregon 97701",
    "alex.lyons@test.com",
    "987988899",
].join("\n");

beforeEach(() => {
    __resetExtractFactCounterForTests();
    __resetHouseholdCandidateCounterForTests();
});

describe("buildCreateLeadCommitPreview", () => {
    it("lists primary records to create and defers additional household members", () => {
        const extraction = extractFactsFromText({ text: HOUSEHOLD_PASTE });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        const preview = buildCreateLeadCommitPreview({
            household,
            values: {
                first_name: "Alex",
                last_name: "Lyons",
                child_first_name: "Jaxon",
                child_last_name: "Lyons",
            },
        });

        expect(preview.will_create.map((i) => i.label)).toEqual([
            "Primary parent / guardian",
            "Household (customer)",
            "Lead (opportunity)",
            "First child",
        ]);
        expect(preview.will_create[0]?.detail).toBe("Alex Lyons");
        expect(preview.not_created.some((i) => i.label === "Additional parent / guardian")).toBe(true);
        expect(preview.not_created.some((i) => i.label === "Additional child")).toBe(true);
        expect(preview.not_created.some((i) => i.label === "Address")).toBe(true);
    });
});
