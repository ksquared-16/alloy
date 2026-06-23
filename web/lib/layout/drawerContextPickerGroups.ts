/**
 * Context-first field picker groups for drawer surfaces.
 *
 * Anchor entity + registered contexts — not anchor-entity-only field access.
 * Picker-visible refs must remain a subset of surface allow-list (validator parity).
 */

import type { LayoutCatalogField, LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import { FIELD_PICKER_CONTEXT_GROUP_DEFS } from "@/lib/layout/fieldPickerContextCatalog";
import {
    contactRolePickerRefKeys,
    type LayoutEditorContactRole,
} from "@/lib/layout/layoutEditorContactRoles";

export type DrawerContextSurfaceKey = "opportunity_drawer" | "person_drawer" | "child_drawer";

const CONTACT_ROLE_CONTEXT_DEFS: readonly {
    role: LayoutEditorContactRole;
    entityKey: string;
    entityLabel: string;
    groupDescription: string;
}[] = [
    {
        role: "primary",
        entityKey: "contact_primary",
        entityLabel: FIELD_PICKER_CONTEXT_GROUP_DEFS.find((g) => g.contextKey === "primary_contact")!.entityLabel,
        groupDescription: "Primary contact on the linked enrollment record",
    },
    {
        role: "parents",
        entityKey: "contact_parents",
        entityLabel: "Additional Parents / Guardians",
        groupDescription: "Parent and guardian relationships excluding the primary contact",
    },
    {
        role: "billing",
        entityKey: "contact_billing",
        entityLabel: FIELD_PICKER_CONTEXT_GROUP_DEFS.find((g) => g.contextKey === "billing_contact")!.entityLabel,
        groupDescription: "Billing and payer contact fields when present",
    },
    {
        role: "emergency",
        entityKey: "contact_emergency",
        entityLabel: FIELD_PICKER_CONTEXT_GROUP_DEFS.find((g) => g.contextKey === "emergency_contact")!.entityLabel,
        groupDescription: "Emergency contact fields when present",
    },
    {
        role: "secondary",
        entityKey: "contact_secondary",
        entityLabel: FIELD_PICKER_CONTEXT_GROUP_DEFS.find((g) => g.contextKey === "secondary_contact")!.entityLabel,
        groupDescription: "Additional associated contact fields",
    },
] as const;

const PRIMARY_CONTACT_DISPLAY_REFS = ["person.is_primary_contact"] as const;

/** Split flat person-entity groups into contact-role context groups (shared across drawer surfaces). */
export function splitPersonFieldsIntoContactRoleContextGroups(
    groups: LayoutCatalogGroup[],
): LayoutCatalogGroup[] {
    const output: LayoutCatalogGroup[] = [];
    for (const group of groups) {
        if (group.entityKey !== "person") {
            output.push(group);
            continue;
        }
        const byRef = new Map(group.fields.map((field) => [field.refKey, field]));
        const consumed = new Set<string>();

        for (const roleDef of CONTACT_ROLE_CONTEXT_DEFS) {
            const roleRefKeys = [
                ...contactRolePickerRefKeys(roleDef.role),
                ...(roleDef.role === "primary" ? PRIMARY_CONTACT_DISPLAY_REFS : []),
            ];
            const fields = roleRefKeys
                .map((refKey) => byRef.get(refKey))
                .filter((field): field is LayoutCatalogField => Boolean(field));
            if (fields.length === 0) continue;
            for (const field of fields) consumed.add(field.refKey);
            output.push({
                entityKey: roleDef.entityKey,
                entityLabel: roleDef.entityLabel,
                groupDescription: roleDef.groupDescription,
                fields,
            });
        }

        const remaining = group.fields.filter((field) => !consumed.has(field.refKey));
        if (remaining.length > 0) {
            output.push({
                ...group,
                entityKey: "person_current",
                entityLabel: "Current Person",
                groupDescription: "Native person profile fields",
                fields: remaining,
            });
        }
    }
    return output;
}

function renameGroup(
    groups: LayoutCatalogGroup[],
    matchEntityKeys: string[],
    entityLabel: string,
    groupDescription?: string,
): LayoutCatalogGroup[] {
    const match = new Set(matchEntityKeys);
    return groups.map((g) =>
        match.has(g.entityKey) ?
            {
                ...g,
                entityLabel,
                groupDescription: groupDescription ?? g.groupDescription,
                fields: g.fields.map((f) => ({ ...f, entityLabel })),
            }
        :   g,
    );
}

/** Reorder and relabel operator groups for context-first drawer pickers. */
export function applyDrawerContextPickerLabels(
    groups: LayoutCatalogGroup[],
    surfaceKey: DrawerContextSurfaceKey,
): LayoutCatalogGroup[] {
    let result = groups;

    if (surfaceKey === "child_drawer") {
        result = renameGroup(
            result,
            ["child", "inquiry_child"],
            "Current Child",
            "Child profile and enrollment participation fields",
        );
        result = renameGroup(
            result,
            ["customer", "location"],
            "Household",
            "Shared household identity and optional shared mailing address — not individual contact addresses",
        );
        result = splitPersonFieldsIntoContactRoleContextGroups(result);
        return result;
    }

    if (surfaceKey === "person_drawer") {
        result = renameGroup(
            result,
            ["child", "inquiry_child"],
            "Linked Children",
            "Children linked to this person",
        );
        result = renameGroup(
            result,
            ["customer", "location"],
            "Household",
            "Shared household identity and optional shared mailing address",
        );
        result = renameGroup(result, ["opportunity"], "Linked Opportunities", "Enrollment records linked to this person");
        result = splitPersonFieldsIntoContactRoleContextGroups(result);
        return result;
    }

    // opportunity_drawer — contact roles applied upstream; relabel enrollment contexts
    result = renameGroup(result, ["opportunity"], "Enrollment Record", "Lead / enrollment inquiry fields");
    result = renameGroup(
        result,
        ["child", "inquiry_child"],
        "Children",
        "Children on this enrollment record",
    );
    result = renameGroup(
        result,
        ["customer", "location"],
        "Household",
        "Shared household identity and optional shared mailing address",
    );
    return result;
}

export function buildContextFirstDrawerFieldPickerGroups(
    surfaceKey: DrawerContextSurfaceKey,
    baseGroups: LayoutCatalogGroup[],
): LayoutCatalogGroup[] {
    const withRoles =
        surfaceKey === "opportunity_drawer" ? baseGroups : splitPersonFieldsIntoContactRoleContextGroups(baseGroups);
    return applyDrawerContextPickerLabels(withRoles, surfaceKey);
}
