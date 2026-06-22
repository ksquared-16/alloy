import { describe, expect, it, beforeEach } from "vitest";
import { buildCreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";
import { buildCreateLeadCommitSelection } from "@/lib/intake/commit/createLeadCommitSelection";
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
    it("lists all included household members when selection is provided", () => {
        const extraction = extractFactsFromText({ text: HOUSEHOLD_PASTE });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);
        const selection = buildCreateLeadCommitSelection(household);
        const preview = buildCreateLeadCommitPreview({
            household,
            values: {
                first_name: "Alex",
                last_name: "Lyons",
                child_first_name: "Jaxon",
                child_last_name: "Lyons",
            },
            selection,
        });

        expect(preview.will_create.filter((i) => i.label.startsWith("Parent")).length).toBeGreaterThanOrEqual(1);
        expect(preview.will_create.some((i) => i.label.startsWith("Child"))).toBe(true);
        expect(preview.will_create.some((i) => i.detail === "Jason Lyons" || i.detail === "Alex Lyons")).toBe(true);
    });
});
