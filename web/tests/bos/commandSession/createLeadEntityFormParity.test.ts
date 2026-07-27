import { describe, expect, it } from "vitest";

import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import { emptyBosCommandDraft } from "@/lib/bos/commandSession";
import { buildEffectiveCreateLeadIntakeSpec } from "@/lib/bos/commandSession/conversationIntake/buildEffectiveCreateLeadIntakeSpec";
import {
    everyRequiredKeyHasFormControl,
    projectCreateLeadEntityFormSections,
    projectCreateLeadFormSections,
} from "@/lib/bos/commandSession/createLeadFormSectionProjection";
import {
    applyCreateLeadCommitSelectionToDraft,
    resolveCreateLeadCommitSelectionFromDraft,
} from "@/lib/bos/commandSession/createLeadRepeaterDraft";
import { buildCreateLeadSectionModels } from "@/lib/bos/commandSession/createLeadSectionPresentation";
import { applyOperatorFieldEdit, formValuesFromDraft } from "@/lib/bos/commandSession/draftEdits";
import {
    addCreateLeadCommitChild,
    createEmptyCreateLeadCommitSelection,
    removeCreateLeadCommitRecord,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import {
    buildCreateLeadEligibility,
    createLeadConfigRequiredInputsFromIntakeSpec,
} from "@/lib/platform/commands/createLead/createLeadRequiredInputs";

function specWithLocationRequired(): ActionIntakeSpec {
    const base = createLeadParserSpec("dept-1");
    const locationField = {
        rule_id: "opportunity:location",
        entity: "opportunity" as const,
        entity_label: "Lead",
        field_label: "Location",
        tier: "required" as const,
        field_key: "location_id",
        value_kind: "select" as const,
        option_set_key: null,
        placement_select: "site" as const,
        payload_key: "location_id",
        form_capture_keys: [] as const,
        validation: [],
        runtime_enforced: false,
    };
    return {
        ...base,
        requirements_source: "department",
        required: [
            ...base.required.filter((f) => f.payload_key !== "location_id"),
            locationField,
        ],
        optional: base.optional.filter((f) => f.payload_key !== "location_id"),
        groups: [
            ...base.groups.filter((g) => g.entity !== "opportunity"),
            {
                entity: "opportunity",
                entity_label: "Lead",
                fields: [locationField],
            },
        ],
    };
}

describe("Create Lead entity-group Form (no Placement section)", () => {
    it("does not invent a Placement & preferences section", () => {
        const sections = projectCreateLeadEntityFormSections(specWithLocationRequired());
        expect(sections.some((s) => /placement/i.test(s.label))).toBe(false);
        expect(sections.some((s) => s.key === "opportunity" || s.label === "Lead")).toBe(true);
    });

    it("puts Location under its canonical opportunity/Lead owner when record_creation required", () => {
        const sections = projectCreateLeadEntityFormSections(specWithLocationRequired());
        const lead = sections.find((s) => s.key === "opportunity");
        expect(lead?.requiredFields.some((f) => f.payload_key === "location_id")).toBe(true);
        expect(lead?.requiredFields.find((f) => f.payload_key === "location_id")?.placement_select).toBe(
            "site"
        );
    });

    it("empty Lead section still materializes when Location is the only opportunity field", () => {
        const sections = projectCreateLeadFormSections([], {
            intakeSpec: specWithLocationRequired(),
        });
        expect(sections.some((s) => s.key === "context" || s.label === "Lead")).toBe(true);
    });

    it("every hard required key has a rendered editable control", () => {
        const effective = buildEffectiveCreateLeadIntakeSpec({
            departmentId: "dept-1",
            actionIntakeSpec: specWithLocationRequired(),
        });
        const sections = projectCreateLeadFormSections(effective.gatherFields, {
            requiredPayloadKeys: effective.requiredPayloadKeys,
            intakeSpec: effective.actionIntakeSpec,
        });
        expect(
            everyRequiredKeyHasFormControl({
                requiredPayloadKeys: effective.requiredPayloadKeys,
                sections,
            })
        ).toEqual({ ok: true });
        expect(effective.requiredPayloadKeys).toContain("location_id");
    });

    it("selecting Location clears config-driven eligibility blocker and shows resolved label", () => {
        const config = createLeadConfigRequiredInputsFromIntakeSpec(specWithLocationRequired());
        let draft = emptyBosCommandDraft();
        draft = applyOperatorFieldEdit(draft, "first_name", "Jenn");
        draft = applyOperatorFieldEdit(draft, "last_name", "Smith");
        draft = applyOperatorFieldEdit(draft, "email", "jenn@example.com");
        expect(buildCreateLeadEligibility(formValuesFromDraft(draft), config).eligible).toBe(false);

        draft = applyOperatorFieldEdit(draft, "location_id", "site-abc");
        expect(buildCreateLeadEligibility(formValuesFromDraft(draft), config).eligible).toBe(true);

        const sections = projectCreateLeadFormSections([], {
            intakeSpec: specWithLocationRequired(),
        });
        const models = buildCreateLeadSectionModels({
            sections,
            draft,
            requiredPayloadKeys: ["location_id"],
            optionLabels: new Map([["location_id:site-abc", "Sunrise School"]]),
        });
        const lead = models.find((m) => m.key === "context" || m.key === "opportunity");
        expect(lead?.summaryLines).toContain("Sunrise School");
        expect(lead?.summaryLines.join(" ")).not.toContain("site-abc");
    });

    it("optional Children does not invent a blank child; Add child then remove restores empty", () => {
        let selection = createEmptyCreateLeadCommitSelection();
        expect(selection.children).toHaveLength(0);
        selection = addCreateLeadCommitChild(selection);
        expect(selection.children).toHaveLength(1);
        const removed = removeCreateLeadCommitRecord(selection, selection.children[0]!.candidate_id);
        expect(removed.selection.children).toHaveLength(0);
        const draft = applyCreateLeadCommitSelectionToDraft(emptyBosCommandDraft(), removed.selection);
        expect(resolveCreateLeadCommitSelectionFromDraft(draft).children).toHaveLength(0);
    });
});
