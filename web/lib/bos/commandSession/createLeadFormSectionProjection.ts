/**
 * Form section projection for Create Lead — canonical intake entity groups.
 * No synthetic Placement section. Required vs Additional within each entity.
 */

import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import { actionIntakeFieldToGatherField } from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { lifecycleEntityLabel } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

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

/** Canonical entity fallbacks — never Parent / Guardian (that is a relationship role). */
function defaultLabel(entity: string, fallback: string): string {
    const cleaned = fallback.trim();
    const isStaleRoleOrPlacement =
        /^placement/i.test(cleaned) ||
        /preferences/i.test(cleaned) ||
        /^context$/i.test(cleaned) ||
        /^parent\s*\/\s*guardian$/i.test(cleaned);

    if (entity === "person") {
        if (cleaned && !isStaleRoleOrPlacement && !/^person$/i.test(cleaned)) return cleaned;
        return lifecycleEntityLabel("person");
    }
    if (entity === "child") {
        if (cleaned && !isStaleRoleOrPlacement && !/^child$/i.test(cleaned)) return cleaned;
        return lifecycleEntityLabel("child");
    }
    if (entity === "opportunity") {
        if (
            cleaned &&
            !isStaleRoleOrPlacement &&
            !/^opportunity$/i.test(cleaned) &&
            !/^lead$/i.test(cleaned)
        ) {
            return cleaned;
        }
        return "Lead";
    }
    if (entity === "household") return cleaned || "Household";
    return cleaned || entity;
}

/**
 * Project full ActionIntakeSpec into entity-owned Form sections.
 * Every required/recommended/optional field is assigned; none silently omitted.
 * Entities absent from the effective spec produce no section.
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
        fields: [...section.requiredFields, ...section.additionalFields],
    }));
}

/** True when every hard-required key has a Form-visible field in projected sections. */
export function everyRequiredKeyHasFormControl(input: {
    requiredPayloadKeys: readonly string[];
    sections: Array<{ fields: readonly ActionWorkspaceGatherField[] }>;
}): { ok: true } | { ok: false; missingControls: string[] } {
    const visible = new Set(input.sections.flatMap((s) => s.fields.map((f) => f.payload_key)));
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

/** Payload keys present on the effective intake (required + recommended + optional). */
export function effectiveCreateLeadPayloadKeys(spec: ActionIntakeSpec | null | undefined): Set<string> {
    const keys = new Set<string>();
    if (!spec) return keys;
    for (const field of [...spec.required, ...spec.recommended, ...spec.optional]) {
        keys.add(field.payload_key);
    }
    return keys;
}

/** Entity keys present on the effective intake groups. */
export function effectiveCreateLeadEntities(spec: ActionIntakeSpec | null | undefined): Set<string> {
    const entities = new Set<string>();
    if (!spec?.groups?.length) return entities;
    for (const group of spec.groups) {
        if (group.fields.length) entities.add(group.entity);
    }
    return entities;
}
