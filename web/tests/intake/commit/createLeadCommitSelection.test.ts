import { describe, expect, it, beforeEach } from "vitest";
import {
    buildCreateLeadCommitSelection,
    patchCreateLeadCommitRecord,
    toggleCreateLeadCommitInclusion,
    syncCreateLeadValuesFromCommitSelection,
} from "@/lib/intake/commit/createLeadCommitSelection";
import { validateCreateLeadCommitSelection } from "@/lib/intake/commit/validateCreateLeadCommitSelection";
import { buildCreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";
import {
    __resetExtractFactCounterForTests,
    extractFactsFromText,
} from "@/lib/intake/extract/extractFactsFromText";
import {
    __resetHouseholdCandidateCounterForTests,
    groupFactsIntoHouseholdCandidates,
} from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";

const TWO_BY_TWO_PASTE = [
    "Sarah & Rudy Emerson 1222344321 sarah@emerson.net",
    "Children: Jet DOB 2/4/2026 and Chet DOB 10/10/2023",
    "North Campus",
].join("\n");

beforeEach(() => {
    __resetExtractFactCounterForTests();
    __resetHouseholdCandidateCounterForTests();
});

describe("buildCreateLeadCommitSelection", () => {
    it("includes all valid parents and children by default", () => {
        const household = groupFactsIntoHouseholdCandidates(
            extractFactsFromText({ text: TWO_BY_TWO_PASTE }).facts,
        );
        const selection = buildCreateLeadCommitSelection(household);

        expect(selection.parents.filter((p) => p.include_in_commit)).toHaveLength(2);
        expect(selection.children.filter((c) => c.include_in_commit)).toHaveLength(2);
        expect(selection.parents[0]?.primary).toBe(true);
        expect(selection.children[0]?.primary).toBe(true);
    });

    it("excludes invalid secondary child without blocking lead validation when unchecked", () => {
        const household = groupFactsIntoHouseholdCandidates(
            extractFactsFromText({ text: TWO_BY_TWO_PASTE }).facts,
        );
        let selection = buildCreateLeadCommitSelection(household);
        const secondChild = selection.children[1]!;
        selection = patchCreateLeadCommitRecord(selection, secondChild.candidate_id, {
            last_name: "",
        });
        selection = toggleCreateLeadCommitInclusion(selection, secondChild.candidate_id, false);

        const result = validateCreateLeadCommitSelection({
            selection,
            values: {
                ...syncCreateLeadValuesFromCommitSelection({}, selection),
                location_id: "site-1",
            },
        });
        expect(result.ok).toBe(true);
    });

    it("blocks when primary parent is excluded", () => {
        const household = groupFactsIntoHouseholdCandidates(
            extractFactsFromText({ text: TWO_BY_TWO_PASTE }).facts,
        );
        let selection = buildCreateLeadCommitSelection(household);
        const primary = selection.parents[0]!;
        selection = toggleCreateLeadCommitInclusion(selection, primary.candidate_id, false);

        const result = validateCreateLeadCommitSelection({
            selection,
            values: { location_id: "site-1" },
        });
        expect(result.ok).toBe(false);
    });
});

describe("buildCreateLeadCommitPreview with selection", () => {
    it("lists all included household members for 2 parents + 2 children", () => {
        const household = groupFactsIntoHouseholdCandidates(
            extractFactsFromText({ text: TWO_BY_TWO_PASTE }).facts,
        );
        const selection = buildCreateLeadCommitSelection(household);
        const values = syncCreateLeadValuesFromCommitSelection(
            { location_id: "site-1" },
            selection,
        );
        const preview = buildCreateLeadCommitPreview({ values, household, selection });

        expect(preview.will_create.map((i) => i.label)).toEqual(
            expect.arrayContaining(["Parent (primary)", "Parent", "Child (primary)", "Child"]),
        );
        expect(preview.will_create.some((i) => i.detail?.includes("Sarah Emerson"))).toBe(true);
        expect(preview.will_create.some((i) => i.detail?.includes("Chet"))).toBe(true);
    });

    it("updates preview when operator excludes second child", () => {
        const household = groupFactsIntoHouseholdCandidates(
            extractFactsFromText({ text: TWO_BY_TWO_PASTE }).facts,
        );
        let selection = buildCreateLeadCommitSelection(household);
        const secondChild = selection.children[1]!;
        selection = toggleCreateLeadCommitInclusion(selection, secondChild.candidate_id, false);

        const preview = buildCreateLeadCommitPreview({
            values: syncCreateLeadValuesFromCommitSelection({}, selection),
            household,
            selection,
        });

        expect(preview.will_create.filter((i) => i.label.startsWith("Child"))).toHaveLength(1);
        expect(preview.not_created.some((i) => i.label === "Child excluded")).toBe(true);
    });

    it("reflects edit changes in preview", () => {
        const household = groupFactsIntoHouseholdCandidates(
            extractFactsFromText({ text: TWO_BY_TWO_PASTE }).facts,
        );
        let selection = buildCreateLeadCommitSelection(household);
        const parent = selection.parents[1]!;
        selection = patchCreateLeadCommitRecord(selection, parent.candidate_id, {
            first_name: "Rudy",
            last_name: "Emerson",
        });

        const preview = buildCreateLeadCommitPreview({ values: {}, household, selection });
        expect(preview.will_create.some((i) => i.detail === "Rudy Emerson")).toBe(true);
    });
});
