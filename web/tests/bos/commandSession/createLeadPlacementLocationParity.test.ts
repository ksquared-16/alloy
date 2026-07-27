import { describe, expect, it } from "vitest";

import {
    addCreateLeadCommitChild,
    addCreateLeadCommitParent,
    createEmptyCreateLeadCommitSelection,
    patchCreateLeadCommitRecord,
    removeCreateLeadCommitRecord,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import { emptyBosCommandDraft } from "@/lib/bos/commandSession";
import { applyCreateLeadParseToDraft } from "@/lib/bos/commandSession/adapters/createLeadAdapter";
import { buildEffectiveCreateLeadIntakeSpec } from "@/lib/bos/commandSession/conversationIntake/buildEffectiveCreateLeadIntakeSpec";
import {
    everyRequiredKeyHasFormControl,
    projectCreateLeadFormSections,
} from "@/lib/bos/commandSession/createLeadFormSectionProjection";
import {
    applyCreateLeadCommitSelectionToDraft,
    applyParsedHouseholdToDraft,
    mergeCreateLeadCommitSelections,
    resolveCreateLeadCommitSelectionFromDraft,
} from "@/lib/bos/commandSession/createLeadRepeaterDraft";
import {
    buildCreateLeadSectionModels,
} from "@/lib/bos/commandSession/createLeadSectionPresentation";
import { applyOperatorFieldEdit } from "@/lib/bos/commandSession/draftEdits";
import { formValuesFromDraft } from "@/lib/bos/commandSession/draftEdits";
import { deriveCreateLeadBlockers } from "@/lib/platform/commands/createLead/createLeadRequiredInputs";

describe("F5-04 Placement / Location effective-section parity", () => {
    it("required Location causes Placement & preferences to render even when only Location is configured", () => {
        const sections = projectCreateLeadFormSections(
            [
                {
                    payload_key: "first_name",
                    field_label: "First Name",
                    section: "person",
                    section_label: "Family",
                    tier: "required",
                    value_kind: "text",
                },
                {
                    payload_key: "last_name",
                    field_label: "Last Name",
                    section: "person",
                    section_label: "Family",
                    tier: "required",
                    value_kind: "text",
                },
                {
                    payload_key: "location_id",
                    field_label: "Location",
                    section: "context",
                    section_label: "Placement & preferences",
                    tier: "required",
                    value_kind: "select",
                    placement_select: "site",
                },
            ],
            { requiredPayloadKeys: ["first_name", "last_name", "location_id"] }
        );
        const placement = sections.find((s) => s.key === "context");
        expect(placement?.label).toBe("Placement & preferences");
        expect(placement?.fields.some((f) => f.payload_key === "location_id")).toBe(true);
    });

    it("empty Placement section is not omitted when Location is platform-required", () => {
        const sections = projectCreateLeadFormSections(
            [
                {
                    payload_key: "first_name",
                    field_label: "First Name",
                    section: "person",
                    section_label: "Family",
                    tier: "required",
                    value_kind: "text",
                },
            ],
            { requiredPayloadKeys: ["first_name", "location_id"] }
        );
        expect(sections.some((s) => s.key === "context")).toBe(true);
        expect(
            sections.find((s) => s.key === "context")?.fields.some((f) => f.payload_key === "location_id")
        ).toBe(true);
    });

    it("Location control uses canonical site placement_select option source", () => {
        const sections = projectCreateLeadFormSections(
            createLeadParserSpec("platform").required
                .concat(createLeadParserSpec("platform").optional)
                .map((f) => ({
                    payload_key: f.payload_key,
                    field_label: f.field_label,
                    section: f.entity === "child" ? "child" : f.entity === "opportunity" ? "context" : "person",
                    section_label: f.entity_label,
                    tier: f.tier === "required" ? "required" : "optional",
                    value_kind: f.value_kind,
                    placement_select: f.placement_select ?? undefined,
                })),
            { requiredPayloadKeys: ["location_id"] }
        );
        const location = sections
            .flatMap((s) => s.fields)
            .find((f) => f.payload_key === "location_id");
        expect(location?.placement_select).toBe("site");
        expect(location?.value_kind).toBe("select");
    });

    it("selecting Location clears Location blocker and shows resolved label in summary", () => {
        let draft = emptyBosCommandDraft();
        draft = applyOperatorFieldEdit(draft, "first_name", "Jenn");
        draft = applyOperatorFieldEdit(draft, "last_name", "Smith");
        draft = applyOperatorFieldEdit(draft, "email", "jenn@example.com");
        expect(
            deriveCreateLeadBlockers(formValuesFromDraft(draft)).some((b) => b.field === "location_id")
        ).toBe(true);

        draft = applyOperatorFieldEdit(draft, "location_id", "site-abc");
        expect(
            deriveCreateLeadBlockers(formValuesFromDraft(draft)).some((b) => b.field === "location_id")
        ).toBe(false);

        const sections = projectCreateLeadFormSections(
            [
                {
                    payload_key: "location_id",
                    field_label: "Location",
                    section: "context",
                    section_label: "Placement & preferences",
                    tier: "required",
                    value_kind: "select",
                    placement_select: "site",
                },
            ],
            { requiredPayloadKeys: ["location_id"] }
        );
        const models = buildCreateLeadSectionModels({
            sections,
            draft,
            requiredPayloadKeys: ["location_id"],
            optionLabels: new Map([["location_id:site-abc", "Sunrise School"]]),
        });
        const placement = models.find((m) => m.key === "context");
        expect(placement?.statusLabel).toBe("Ready");
        expect(placement?.summaryLines).toContain("Sunrise School");
        expect(placement?.summaryLines.join(" ")).not.toContain("site-abc");
    });

    it("every hard blocker key has a rendered editable Form control", () => {
        const effective = buildEffectiveCreateLeadIntakeSpec({
            departmentId: "platform",
            actionIntakeSpec: createLeadParserSpec("platform"),
        });
        const sections = projectCreateLeadFormSections(effective.gatherFields, {
            requiredPayloadKeys: effective.requiredPayloadKeys,
        });
        const parity = everyRequiredKeyHasFormControl({
            requiredPayloadKeys: effective.requiredPayloadKeys,
            sections,
        });
        expect(parity).toEqual({ ok: true });
        expect(effective.requiredPayloadKeys).toContain("location_id");
    });

    it("Conversation-parsed Location appears in Form draft and persists across restore", () => {
        const spec = createLeadParserSpec("platform");
        let draft = emptyBosCommandDraft();
        draft = applyCreateLeadParseToDraft(
            draft,
            "Jenn Smith jenn@example.com wants Sunrise location_id site-sunrise",
            { spec, departmentId: "platform", fieldOptions: {
                location_id: [{ value: "site-sunrise", label: "Sunrise School" }],
            } }
        );
        // Explicit Form selection path (operator may also set via Form)
        draft = applyOperatorFieldEdit(draft, "location_id", "site-sunrise");
        const values = formValuesFromDraft(draft);
        expect(values.location_id).toBe("site-sunrise");

        const restored = resolveCreateLeadCommitSelectionFromDraft(draft);
        const roundTrip = applyCreateLeadCommitSelectionToDraft(draft, restored);
        expect(formValuesFromDraft(roundTrip).location_id).toBe("site-sunrise");
    });
});

describe("F5-02 multi-adult shared-draft reconciliation", () => {
    it("keeps Jenn and Trey distinct while Location changes", () => {
        let selection = createEmptyCreateLeadCommitSelection();
        selection = patchCreateLeadCommitRecord(selection, selection.parents[0]!.candidate_id, {
            first_name: "Jenn",
            last_name: "Smith",
            email: "jenn@example.com",
        });
        selection = addCreateLeadCommitParent(selection);
        selection = patchCreateLeadCommitRecord(selection, selection.parents[1]!.candidate_id, {
            first_name: "Trey",
            last_name: "Smith",
            email: "trey@example.com",
        });

        let draft = applyCreateLeadCommitSelectionToDraft(emptyBosCommandDraft(), selection);
        draft = applyOperatorFieldEdit(draft, "location_id", "site-1");
        const afterLocation = resolveCreateLeadCommitSelectionFromDraft(draft);
        expect(afterLocation.parents).toHaveLength(2);
        expect(afterLocation.parents.map((p) => p.first_name).sort()).toEqual(["Jenn", "Trey"]);
        expect(formValuesFromDraft(draft).location_id).toBe("site-1");
    });

    it("Conversation parse does not flatten a Form multi-adult household", () => {
        let selection = createEmptyCreateLeadCommitSelection();
        selection = patchCreateLeadCommitRecord(selection, selection.parents[0]!.candidate_id, {
            first_name: "Jenn",
            last_name: "Smith",
            email: "jenn@example.com",
        });
        selection = addCreateLeadCommitParent(selection);
        selection = patchCreateLeadCommitRecord(selection, selection.parents[1]!.candidate_id, {
            first_name: "Trey",
            last_name: "Smith",
            phone: "5415550199",
        });
        let draft = applyCreateLeadCommitSelectionToDraft(emptyBosCommandDraft(), selection);

        const incoming = createEmptyCreateLeadCommitSelection();
        const parsed = patchCreateLeadCommitRecord(
            incoming,
            incoming.parents[0]!.candidate_id,
            { first_name: "Jenn", last_name: "Smith", email: "jenn@example.com" }
        );
        draft = applyParsedHouseholdToDraft(draft, parsed);
        const resolved = resolveCreateLeadCommitSelectionFromDraft(draft);
        expect(resolved.parents).toHaveLength(2);
        expect(resolved.parents.map((p) => p.first_name).sort()).toEqual(["Jenn", "Trey"]);
    });

    it("merge appends a newly parsed distinct adult", () => {
        let existing = createEmptyCreateLeadCommitSelection();
        existing = patchCreateLeadCommitRecord(existing, existing.parents[0]!.candidate_id, {
            first_name: "Jenn",
            last_name: "Smith",
        });
        let incoming = createEmptyCreateLeadCommitSelection();
        incoming = patchCreateLeadCommitRecord(incoming, incoming.parents[0]!.candidate_id, {
            first_name: "Jenn",
            last_name: "Smith",
        });
        incoming = addCreateLeadCommitParent(incoming);
        incoming = patchCreateLeadCommitRecord(incoming, incoming.parents[1]!.candidate_id, {
            first_name: "Trey",
            last_name: "Smith",
        });
        const merged = mergeCreateLeadCommitSelections(existing, incoming);
        expect(merged.parents).toHaveLength(2);
        expect(merged.parents[0]!.candidate_id).toBe(existing.parents[0]!.candidate_id);
    });
});

describe("F5 child optional / repeater correction", () => {
    it("optional Children section does not create an invalid child automatically", () => {
        const selection = createEmptyCreateLeadCommitSelection();
        expect(selection.children).toHaveLength(0);
        const draft = applyCreateLeadCommitSelectionToDraft(emptyBosCommandDraft(), selection);
        expect(resolveCreateLeadCommitSelectionFromDraft(draft).children).toHaveLength(0);

        const sections = projectCreateLeadFormSections(
            [
                {
                    payload_key: "child_first_name",
                    field_label: "First Name",
                    section: "child",
                    section_label: "Children",
                    tier: "optional",
                    value_kind: "text",
                },
            ],
            { requiredPayloadKeys: ["first_name", "location_id"] }
        );
        const models = buildCreateLeadSectionModels({
            sections,
            draft,
            requiredPayloadKeys: ["first_name", "location_id"],
            childSummaries: [],
            childRowCount: 0,
        });
        const children = models.find((m) => m.key === "child");
        expect(children?.statusLabel).toBe("Optional");
        expect(children?.completion).toBe("empty");
    });

    it("explicit Add child creates one child row; remove restores optional state", () => {
        let selection = createEmptyCreateLeadCommitSelection();
        selection = addCreateLeadCommitChild(selection);
        expect(selection.children).toHaveLength(1);
        expect(selection.children[0]!.commit_blockers.length).toBeGreaterThan(0);

        const removed = removeCreateLeadCommitRecord(selection, selection.children[0]!.candidate_id);
        expect(removed.removed).toBe(true);
        expect(removed.selection.children).toHaveLength(0);

        const models = buildCreateLeadSectionModels({
            sections: [
                {
                    key: "child",
                    label: "Children",
                    fields: [
                        {
                            payload_key: "child_first_name",
                            field_label: "First Name",
                            section: "child",
                            section_label: "Children",
                            tier: "optional",
                            value_kind: "text",
                        },
                    ],
                },
            ],
            draft: emptyBosCommandDraft(),
            requiredPayloadKeys: [],
            childRowCount: 0,
            childSummaries: [],
        });
        expect(models.find((m) => m.key === "child")?.statusLabel).toBe("Optional");
    });

    it("Add another creates an additional stable repeater row", () => {
        let selection = createEmptyCreateLeadCommitSelection();
        selection = addCreateLeadCommitChild(selection);
        const firstId = selection.children[0]!.candidate_id;
        selection = addCreateLeadCommitChild(selection);
        expect(selection.children).toHaveLength(2);
        expect(selection.children[1]!.candidate_id).not.toBe(firstId);
        expect(selection.children[0]!.candidate_id).toBe(firstId);
    });
});
