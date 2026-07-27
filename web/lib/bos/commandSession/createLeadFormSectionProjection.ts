/**
 * Form section projection for Create Lead — canonical intake entity groups.
 * No synthetic Placement section. Required vs Additional within each entity.
 */

import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import { actionIntakeFieldToGatherField } from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { operationalSectionTitle } from "@/lib/bos/commandSession/createLeadUnderstandingPresentation";

export type CreateLeadEntityFormSection = {
    /** Intake entity key: person | child | opportunity | household | … */
    key: string;
    /** Configured entity label when available. */
    label: string;
    /** Hard-blocking fields for this entity (record_creation / required). */
    requiredFields: ActionWorkspaceGatherField[];
    /** All other effective fields for this entity. */
    additionalFields: ActionWorkspaceGatherField[];
};

function sectionKeyForEntity(entity: string): string {
    if (entity === "person") return "person";
    if (entity === "child") return "child";
    if (entity === "opportunity") return "opportunity";
    if (entity === "household") return "household";
    return entity;
}

function defaultLabel(entity: string, fallback: string): string {
    if (entity === "person") return operationalSectionTitle("person", fallback || "Parent / Guardian");
    if (entity === "child") return operationalSectionTitle("child", fallback || "Child");
    if (entity === "opportunity") return "Lead";
    if (entity === "household") return "Household";
    return fallback || entity;
}

/**
 * Project full ActionIntakeSpec into entity-owned Form sections.
 * Every required/recommended/optional field is assigned; none silently omitted.
 */
export function projectCreateLeadEntityFormSections(
    intakeSpec: ActionIntakeSpec | null | undefined,
    gatherFieldsFallback?: readonly ActionWorkspaceGatherField[]
): CreateLeadEntityFormSection[] {
    if (intakeSpec?.groups?.length) {
        const sections: CreateLeadEntityFormSection[] = [];
        for (const group of intakeSpec.groups) {
            const requiredFields: ActionWorkspaceGatherField[] = [];
            const additionalFields: ActionWorkspaceGatherField[] = [];
            for (const field of group.fields) {
                const gather = actionIntakeFieldToGatherField(field);
                if (field.tier === "required") requiredFields.push(gather);
                else additionalFields.push(gather);
            }
            if (requiredFields.length === 0 && additionalFields.length === 0) continue;
            // Household only when fields exist (already gated by non-empty).
            sections.push({
                key: sectionKeyForEntity(group.entity),
                label: defaultLabel(group.entity, group.entity_label),
                requiredFields,
                additionalFields,
            });
        }
        return sections;
    }

    // Fallback: partition gather fields by section / entity mapping.
    const fields = gatherFieldsFallback ?? [];
    const byKey = new Map<string, ActionWorkspaceGatherField[]>();
    for (const field of fields) {
        const key =
            field.section === "person"
                ? "person"
                : field.section === "child"
                  ? "child"
                  : "opportunity";
        const list = byKey.get(key) ?? [];
        list.push(field);
        byKey.set(key, list);
    }
    const order = ["person", "child", "opportunity", "household"];
    return order
        .filter((key) => (byKey.get(key) ?? []).length > 0)
        .map((key) => {
            const all = byKey.get(key) ?? [];
            return {
                key,
                label: defaultLabel(key, all[0]?.section_label ?? key),
                requiredFields: all.filter((f) => f.tier === "required"),
                additionalFields: all.filter((f) => f.tier !== "required"),
            };
        });
}

/** Compatibility shape used by progressive Form host (flat sections list). */
export function projectCreateLeadFormSections(
    gatherFields: readonly ActionWorkspaceGatherField[],
    options?: {
        requiredPayloadKeys?: readonly string[];
        intakeSpec?: ActionIntakeSpec | null;
    }
): Array<{ key: string; label: string; fields: ActionWorkspaceGatherField[] }> {
    const entitySections = projectCreateLeadEntityFormSections(options?.intakeSpec, gatherFields);
    return entitySections.map((section) => ({
        key: section.key === "opportunity" ? "context" : section.key,
        label: section.label,
        // Host still receives a flat field list; Required vs Additional is applied in presentation.
        fields: [...section.requiredFields, ...section.additionalFields],
    }));
}

/** True when every hard-required key has a Form-visible field in projected sections. */
export function everyRequiredKeyHasFormControl(input: {
    requiredPayloadKeys: readonly string[];
    sections: Array<{ fields: readonly ActionWorkspaceGatherField[] }>;
}): { ok: true } | { ok: false; missingControls: string[] } {
    const visible = new Set(input.sections.flatMap((s) => s.fields.map((f) => f.payload_key)));
    // Person identity may be edited via repeaters rather than scalar gather controls.
    const repeaterCovered = new Set([
        "first_name",
        "last_name",
        "email",
        "phone",
        "child_first_name",
        "child_last_name",
        "child_date_of_birth",
        "child_dob",
        "child_age",
    ]);
    const missing = input.requiredPayloadKeys.filter(
        (key) => !visible.has(key) && !repeaterCovered.has(key)
    );
    return missing.length ? { ok: false, missingControls: missing } : { ok: true };
}
