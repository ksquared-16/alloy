import { describe, expect, it } from "vitest";

import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import { gatherFieldsFromActionIntakeSpec } from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import {
    applyCreateLeadParseToDraft,
    buildCreateLeadBosPreview,
} from "@/lib/bos/commandSession/adapters/createLeadAdapter";
import { emptyBosCommandDraft } from "@/lib/bos/commandSession";
import {
    effectiveCreateLeadEntities,
    projectCreateLeadEntityFormSections,
    projectCreateLeadFormSections,
} from "@/lib/bos/commandSession/createLeadFormSectionProjection";
import { operationalSectionTitle } from "@/lib/bos/commandSession/createLeadUnderstandingPresentation";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";

function deptRules(input: {
    required?: string[];
    recommended?: string[];
}): Record<string, unknown> {
    return {
        lifecycle_builder_stage_field_rules_v1: {
            version: 1,
            by_stage_key: {
                lead: {
                    required_rule_ids: input.required ?? [],
                    recommended_rule_ids: input.recommended ?? [],
                },
            },
        },
    };
}

function personOnlySpec(): ActionIntakeSpec {
    return resolveCreateLeadActionIntakeSpec({
        department_id: "dept-firefly",
        operator_stage: "lead",
        builder_stage_key: "lead",
        department_metadata: deptRules({
            required: ["person:first_name", "person:last_name", "person:email"],
            recommended: ["person:phone"],
        }),
    });
}

function personPlusChildSpec(): ActionIntakeSpec {
    return resolveCreateLeadActionIntakeSpec({
        department_id: "dept-firefly",
        operator_stage: "lead",
        builder_stage_key: "lead",
        department_metadata: deptRules({
            required: ["person:first_name", "person:last_name"],
            recommended: ["child:first_name", "child:last_name", "person:email"],
        }),
    });
}

function personPlusOptionalPhoneAndLocation(): ActionIntakeSpec {
    return resolveCreateLeadActionIntakeSpec({
        department_id: "dept-firefly",
        operator_stage: "lead",
        builder_stage_key: "lead",
        department_metadata: deptRules({
            required: ["person:first_name", "person:last_name"],
            recommended: ["person:phone", "opportunity:location"],
        }),
    });
}

describe("Create Lead effective intake — no palette dump", () => {
    it("Child group disappears when no Child field is in the effective intake", () => {
        const spec = personOnlySpec();
        expect(spec.groups.some((g) => g.entity === "child")).toBe(false);
        expect(effectiveCreateLeadEntities(spec).has("child")).toBe(false);
        const sections = projectCreateLeadEntityFormSections(spec);
        expect(sections.some((s) => s.key === "child")).toBe(false);
    });

    it("palette-only Child fields do not leak into optional", () => {
        const spec = personOnlySpec();
        expect(spec.optional.some((f) => f.entity === "child")).toBe(false);
        expect(spec.recommended.some((f) => f.entity === "child")).toBe(false);
        expect(spec.required.some((f) => f.entity === "child")).toBe(false);
        const gather = gatherFieldsFromActionIntakeSpec(spec);
        expect(gather.some((f) => f.section === "child")).toBe(false);
    });

    it("fallback createLeadParserSpec does not restore Child", () => {
        const fallback = createLeadParserSpec("dept-fallback");
        expect(fallback.groups.some((g) => g.entity === "child")).toBe(false);
        expect(fallback.optional.some((f) => f.entity === "child")).toBe(false);
        expect(fallback.groups.map((g) => g.entity)).toEqual(["person"]);
        expect(fallback.copy.help).toMatch(/could not be loaded|Platform minimum/i);
    });

    it("parser output cannot create an excluded Child group on the draft", () => {
        const spec = personOnlySpec();
        const draft = applyCreateLeadParseToDraft(
            emptyBosCommandDraft(),
            "Parent Jordan Lee, child Riley Lee age 3, wants preschool",
            { spec, departmentId: "dept-firefly" }
        );
        const household = draft.household as { children?: unknown[] } | null;
        expect(household?.children?.length ?? 0).toBe(0);
        expect(draft.values.some((v) => v.fieldKey.startsWith("child_"))).toBe(false);
        const sections = projectCreateLeadFormSections([], { intakeSpec: spec });
        expect(sections.some((s) => s.key === "child")).toBe(false);
    });

    it("configured Child fields restore the Child group", () => {
        const spec = personPlusChildSpec();
        expect(spec.groups.some((g) => g.entity === "child")).toBe(true);
        expect(spec.recommended.some((f) => f.rule_id === "child:first_name")).toBe(true);
        const sections = projectCreateLeadEntityFormSections(spec);
        expect(sections.find((s) => s.key === "child")?.label).toBe("Child");
    });

    it("configured recommended fields appear; removed fields disappear", () => {
        const withLocation = personPlusOptionalPhoneAndLocation();
        expect(withLocation.recommended.some((f) => f.rule_id === "opportunity:location")).toBe(
            true
        );
        expect(withLocation.recommended.some((f) => f.rule_id === "person:phone")).toBe(true);
        expect(withLocation.optional.some((f) => f.rule_id === "person:email")).toBe(true);

        const withoutLocation = personOnlySpec();
        expect(withoutLocation.recommended.some((f) => f.rule_id === "opportunity:location")).toBe(
            false
        );
        expect(
            gatherFieldsFromActionIntakeSpec(withoutLocation).some((f) => f.payload_key === "location_id")
        ).toBe(false);
    });

    it("Person uses configured entity label; canonical fallback is Person never Parent / Guardian", () => {
        const spec = personOnlySpec();
        expect(spec.groups.find((g) => g.entity === "person")?.entity_label).toBe("Person");
        const sections = projectCreateLeadEntityFormSections(spec);
        expect(sections.find((s) => s.key === "person")?.label).toBe("Person");
        expect(operationalSectionTitle("person", "Parent / Guardian")).toBe("Person");
        expect(operationalSectionTitle("person", "Person")).toBe("Person");
        expect(JSON.stringify(sections)).not.toMatch(/Parent\s*\/\s*Guardian/i);
    });

    it("opportunity canonical fallback is Lead", () => {
        const spec = personPlusOptionalPhoneAndLocation();
        expect(spec.groups.find((g) => g.entity === "opportunity")?.entity_label).toBe("Lead");
        const sections = projectCreateLeadEntityFormSections(spec);
        expect(sections.find((s) => s.key === "opportunity")?.label).toBe("Lead");
    });

    it("Review preview contains only effective intake entities/fields", () => {
        const spec = personOnlySpec();
        let draft = emptyBosCommandDraft();
        draft = applyCreateLeadParseToDraft(draft, "Jordan Lee jordan@example.com child Sam", {
            spec,
            departmentId: "dept-firefly",
        });
        const preview = buildCreateLeadBosPreview(draft, {
            spec,
            departmentId: "dept-firefly",
        });
        expect(preview.summaryLines.join(" ")).not.toMatch(/\bChild:/i);
        const household = draft.household as { children?: unknown[] } | null;
        expect(household?.children?.length ?? 0).toBe(0);
        expect(draft.values.some((v) => v.fieldKey.startsWith("child_"))).toBe(false);
    });
});
