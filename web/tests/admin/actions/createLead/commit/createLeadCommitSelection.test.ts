import { describe, expect, it, beforeEach } from "vitest";
import {
    buildCreateLeadCommitSelection,
    createEmptyCreateLeadCommitSelection,
    patchCreateLeadCommitRecord,
    toggleCreateLeadCommitInclusion,
    syncCreateLeadValuesFromCommitSelection,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { validateCreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/validateCreateLeadCommitSelection";
import { buildCreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";
import {
    __resetExtractFactCounterForTests,
    extractFactsFromText,
} from "@/lib/intake/extract/extractFactsFromText";
import {
    __resetHouseholdCandidateCounterForTests,
    groupFactsIntoHouseholdCandidates,
} from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import { summarizeCommitChildren } from "@/lib/bos/commandSession/createLeadRepeaterDraft";
import { buildCreateLeadSectionModels } from "@/lib/bos/commandSession/createLeadSectionPresentation";
import { emptyBosCommandDraft } from "@/lib/bos/commandSession";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";

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

    it("restores include_in_commit when a Form row becomes valid after mid-edit", () => {
        let selection = createEmptyCreateLeadCommitSelection();
        const primary = selection.parents[0]!;
        expect(primary.include_in_commit).toBe(true);

        // First incomplete keystroke clears include (historical bug path).
        selection = patchCreateLeadCommitRecord(selection, primary.candidate_id, {
            first_name: "J",
        });
        expect(selection.parents[0]?.include_in_commit).toBe(false);
        expect(selection.parents[0]?.validation_state).toBe("invalid");

        // Completing required identity must re-include so Review readiness can sync flats.
        selection = patchCreateLeadCommitRecord(selection, primary.candidate_id, {
            first_name: "Jenn",
            last_name: "Chapman",
            email: "jenn@chapman.com",
            phone: "4458589989",
        });
        expect(selection.parents[0]?.validation_state).toBe("valid");
        expect(selection.parents[0]?.include_in_commit).toBe(true);

        const flats = syncCreateLeadValuesFromCommitSelection({}, selection);
        expect(flats.first_name).toBe("Jenn");
        expect(flats.last_name).toBe("Chapman");
        expect(flats.email).toBe("jenn@chapman.com");
        expect(flats.phone).toBe("4458589989");
    });

    it("syncs flat draft values from primary even while include_in_commit is false mid-edit", () => {
        let selection = createEmptyCreateLeadCommitSelection();
        const primary = selection.parents[0]!;
        selection = patchCreateLeadCommitRecord(selection, primary.candidate_id, {
            first_name: "Jenn",
            last_name: "Chapman",
            email: "jenn@chapman.com",
        });
        // Force the mid-edit exclude state that used to clear flats.
        selection = {
            ...selection,
            parents: selection.parents.map((p) =>
                p.candidate_id === primary.candidate_id ? { ...p, include_in_commit: false } : p
            ),
        };
        const flats = syncCreateLeadValuesFromCommitSelection({}, selection);
        expect(flats.first_name).toBe("Jenn");
        expect(flats.last_name).toBe("Chapman");
        expect(flats.email).toBe("jenn@chapman.com");
    });
});

describe("Create Lead summary date display", () => {
    it("formats child DOB with platform display dates (not raw ISO)", () => {
        const selection = createEmptyCreateLeadCommitSelection();
        selection.children = [
            {
                candidate_id: "child:1",
                entity_type: "child",
                role: "child",
                first_name: "Billie",
                last_name: "Chapman",
                email: "",
                phone: "",
                dob: "2025-02-25",
                age_display: null,
                program_interest: "Infant",
                start_date: null,
                program_room_cohort_key: null,
                schedule_type: null,
                extra_payload_values: {},
                include_in_commit: true,
                primary: true,
                validation_state: "valid",
                commit_blockers: [],
                source_fact_ids: [],
            },
        ];
        const lines = summarizeCommitChildren(selection);
        expect(lines[0]).toContain("Billie Chapman");
        expect(lines[0]).toContain("Infant");
        expect(lines[0]).toMatch(/Born Feb 25, 2025/);
        expect(lines[0]).not.toContain("2025-02-25");
    });

    it("formats flat child section summary dates the same way", () => {
        const fields: ActionWorkspaceGatherField[] = [
            {
                payload_key: "child_first_name",
                field_label: "Child first name",
                section: "child",
                section_label: "Child",
                tier: "optional",
                value_kind: "text",
            },
            {
                payload_key: "child_last_name",
                field_label: "Child last name",
                section: "child",
                section_label: "Child",
                tier: "optional",
                value_kind: "text",
            },
            {
                payload_key: "child_date_of_birth",
                field_label: "Date of birth",
                section: "child",
                section_label: "Child",
                tier: "optional",
                value_kind: "date",
            },
        ];
        const draft = emptyBosCommandDraft();
        draft.values = [
            {
                fieldKey: "child_first_name",
                value: "Billie",
                state: "operator_entered",
                evidence: [],
                optionResolved: false,
            },
            {
                fieldKey: "child_last_name",
                value: "Chapman",
                state: "operator_entered",
                evidence: [],
                optionResolved: false,
            },
            {
                fieldKey: "child_date_of_birth",
                value: "2025-02-25",
                state: "operator_entered",
                evidence: [],
                optionResolved: false,
            },
        ];
        const models = buildCreateLeadSectionModels({
            sections: [{ key: "child", label: "Child", fields }],
            draft,
            requiredPayloadKeys: [],
        });
        expect(models[0]!.summaryLines[0]).toMatch(/Born Feb 25, 2025/);
        expect(models[0]!.summaryLines[0]).not.toContain("2025-02-25");
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
            expect.arrayContaining(["Parent (primary)", "Parent", "Child", "Child"]),
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
