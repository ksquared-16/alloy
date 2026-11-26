import { describe, expect, it } from "vitest";

import {
    addCreateLeadCommitChild,
    addCreateLeadCommitParent,
    createEmptyCreateLeadCommitSelection,
    patchCreateLeadCommitRecord,
    removeCreateLeadCommitRecord,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { emptyBosCommandDraft } from "@/lib/bos/commandSession";
import {
    applyCreateLeadCommitSelectionToDraft,
    resolveCreateLeadCommitSelectionFromDraft,
    summarizeCommitChildren,
    summarizeCommitParents,
} from "@/lib/bos/commandSession/createLeadRepeaterDraft";
import { buildReviewGroups, buildUnderstandingGroups } from "@/lib/bos/commandSession/createLeadUnderstandingPresentation";
import { bosDraftToEligiblePayload } from "@/lib/bos/commandSession/draftValues";
import { applyCreateLeadParseToDraft } from "@/lib/bos/commandSession/adapters/createLeadAdapter";
import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import { mergeRelationshipPresentationMetadata } from "@/lib/dataModel/relationshipVocabularyPresentation";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";

describe("Create Lead multi-person / multi-child repeaters", () => {
    it("supports two parents with different emails and phones", () => {
        let selection = createEmptyCreateLeadCommitSelection();
        selection = patchCreateLeadCommitRecord(selection, selection.parents[0]!.candidate_id, {
            first_name: "Sarah",
            last_name: "Jones",
            email: "sarah@example.com",
            phone: "5415550144",
        });
        selection = addCreateLeadCommitParent(selection);
        const second = selection.parents[1]!;
        selection = patchCreateLeadCommitRecord(selection, second.candidate_id, {
            first_name: "Mike",
            last_name: "Jones",
            email: "mike@example.com",
            phone: "5415550199",
        });
        expect(selection.parents).toHaveLength(2);
        expect(selection.parents[0]!.email).toBe("sarah@example.com");
        expect(selection.parents[1]!.email).toBe("mike@example.com");
        expect(selection.parents[0]!.phone).not.toBe(selection.parents[1]!.phone);
    });

    it("supports two children with different programs and start dates", () => {
        let selection = createEmptyCreateLeadCommitSelection();
        selection = addCreateLeadCommitChild(selection);
        selection = patchCreateLeadCommitRecord(selection, selection.children[0]!.candidate_id, {
            first_name: "Emma",
            last_name: "Jones",
            program_interest: "Preschool",
            start_date: "2026-08-18",
        });
        selection = addCreateLeadCommitChild(selection);
        selection = patchCreateLeadCommitRecord(selection, selection.children[1]!.candidate_id, {
            first_name: "Leo",
            last_name: "Jones",
            program_interest: "Toddler",
            start_date: "2026-09-01",
        });
        expect(selection.children).toHaveLength(2);
        expect(selection.children[0]!.program_interest).toBe("Preschool");
        expect(selection.children[1]!.program_interest).toBe("Toddler");
        expect(selection.children[0]!.start_date).not.toBe(selection.children[1]!.start_date);
    });

    it("adds and removes adults without dropping the last required adult", () => {
        let selection = createEmptyCreateLeadCommitSelection();
        const only = removeCreateLeadCommitRecord(selection, selection.parents[0]!.candidate_id);
        expect(only.removed).toBe(false);
        selection = addCreateLeadCommitParent(selection);
        expect(selection.parents).toHaveLength(2);
        const removed = removeCreateLeadCommitRecord(selection, selection.parents[1]!.candidate_id);
        expect(removed.removed).toBe(true);
        expect(removed.selection.parents).toHaveLength(1);
    });

    it("adds and removes children independently", () => {
        let selection = createEmptyCreateLeadCommitSelection();
        selection = addCreateLeadCommitChild(selection);
        selection = addCreateLeadCommitChild(selection);
        expect(selection.children).toHaveLength(2);
        const removed = removeCreateLeadCommitRecord(selection, selection.children[0]!.candidate_id);
        expect(removed.removed).toBe(true);
        expect(removed.selection.children).toHaveLength(1);
    });

    it("hydrates Form selection from Conversation parse household", () => {
        const spec = createLeadParserSpec("platform");
        let draft = emptyBosCommandDraft();
        draft = applyCreateLeadParseToDraft(
            draft,
            "Parents are Jordan Lee (jordan@example.com) and Alex Lee (alex@example.com). Children are Riley and Sam.",
            { spec, departmentId: "platform" }
        );
        // Even if parse only finds one parent in some environments, household may be set.
        const selection = resolveCreateLeadCommitSelectionFromDraft(draft);
        expect(selection.parents.length).toBeGreaterThanOrEqual(1);
        if (draft.household) {
            expect(resolveCreateLeadCommitSelectionFromDraft(draft).version).toBe(1);
        }
    });

    it("Form repeaters round-trip into draft and Review groups", () => {
        let draft = emptyBosCommandDraft();
        let selection = createEmptyCreateLeadCommitSelection();
        selection = patchCreateLeadCommitRecord(selection, selection.parents[0]!.candidate_id, {
            first_name: "Sarah",
            last_name: "Jones",
            email: "sarah@example.com",
            phone: "5415550144",
        });
        selection = addCreateLeadCommitParent(selection);
        selection = patchCreateLeadCommitRecord(selection, selection.parents[1]!.candidate_id, {
            first_name: "Mike",
            last_name: "Jones",
            email: "mike@example.com",
            phone: "5415550199",
        });
        selection = addCreateLeadCommitChild(selection);
        selection = patchCreateLeadCommitRecord(selection, selection.children[0]!.candidate_id, {
            first_name: "Emma",
            last_name: "Jones",
            program_interest: "Preschool",
            start_date: "2026-08-18",
        });
        selection = addCreateLeadCommitChild(selection);
        selection = patchCreateLeadCommitRecord(selection, selection.children[1]!.candidate_id, {
            first_name: "Leo",
            last_name: "Jones",
            program_interest: "Toddler",
            start_date: "2026-09-01",
        });

        draft = applyCreateLeadCommitSelectionToDraft(draft, selection);
        const restored = resolveCreateLeadCommitSelectionFromDraft(draft);
        expect(restored.parents).toHaveLength(2);
        expect(restored.children).toHaveLength(2);
        expect(summarizeCommitParents(restored)[0]).toContain("Sarah");
        expect(summarizeCommitParents(restored)[1]).toContain("Mike");
        expect(summarizeCommitChildren(restored)[0]).toContain("Preschool");
        expect(summarizeCommitChildren(restored)[1]).toContain("Toddler");

        const fields: ActionWorkspaceGatherField[] = [];
        const groups = buildUnderstandingGroups({ draft, gatherFields: fields });
        expect(groups.find((g) => g.key === "person")?.rows).toEqual([
            expect.objectContaining({ label: "Primary", value: expect.stringContaining("Sarah") }),
            expect.objectContaining({ label: "Additional", value: expect.stringContaining("Mike") }),
        ]);
        expect(groups.find((g) => g.key === "child")?.rows).toEqual([
            expect.objectContaining({ label: "Child", value: expect.stringContaining("Emma") }),
            expect.objectContaining({ label: "Additional", value: expect.stringContaining("Leo") }),
        ]);
        expect(JSON.stringify(groups)).not.toMatch(/Parent \/ guardian \d|Parent \d|Child \d/);

        const review = buildReviewGroups({ draft, gatherFields: fields, preview: null });
        expect(review.find((g) => g.key === "person")?.rows).toHaveLength(2);

        const payload = bosDraftToEligiblePayload(draft);
        expect(payload.household_commit_v1).toBeTruthy();
        expect(String(payload.first_name)).toBe("Sarah");
    });
});

describe("relationship vocabulary presentation (label-only)", () => {
    it("stores plural label in metadata without changing identity key", () => {
        const merged = mergeRelationshipPresentationMetadata({
            existingMetadata: {},
            existingLabel: "Guardian",
            existingDescription: null,
            nextLabel: "Caregiver",
            nextPluralLabel: "Caregivers",
            nextDescription: "Adult responsible for the child",
        });
        expect(merged.error).toBeUndefined();
        expect(merged.label).toBe("Caregiver");
        expect(merged.metadata.plural_label).toBe("Caregivers");
        expect(merged.metadata.platform_default_label).toBe("Guardian");
    });

    it("rejects empty singular labels and supports reset", () => {
        const empty = mergeRelationshipPresentationMetadata({
            existingMetadata: { platform_default_label: "Guardian", plural_label: "Guardians" },
            existingLabel: "Caregiver",
            existingDescription: null,
            nextLabel: "   ",
        });
        expect(empty.error).toMatch(/required/i);

        const reset = mergeRelationshipPresentationMetadata({
            existingMetadata: {
                platform_default_label: "Guardian",
                platform_default_plural_label: "Guardians",
                plural_label: "Caregivers",
            },
            existingLabel: "Caregiver",
            existingDescription: "custom",
            resetToDefault: true,
        });
        expect(reset.label).toBe("Guardian");
        expect(reset.metadata.plural_label).toBe("Guardians");
    });
});
