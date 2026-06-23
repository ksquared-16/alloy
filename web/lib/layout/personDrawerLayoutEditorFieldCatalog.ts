/**
 * Person drawer visual editor — field picker groups.
 */

import {
    finalizeCatalogGroupsForPicker,
    type LayoutCatalogField,
    type LayoutCatalogGroup,
} from "@/lib/layout/fieldCatalog";
import { buildContextFirstDrawerFieldPickerGroups } from "@/lib/layout/drawerContextPickerGroups";
import { organizeChildcarePickerGroups } from "@/lib/layout/childcareLayoutFieldCatalog";
import { isRefKeyPickerEligible, manifestEntryForRefKey } from "@/lib/layout/platformFieldResolutionManifest";
import { resolveLayoutEditorFieldRefLabel } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { PERSON_DRAWER_SURFACE, PERSON_DRAWER_LINKED_CHILD_FIELD_REFS } from "@/lib/layout/surfaceLayoutRegistry";
import {
    buildTenantLayoutCatalogFields,
    mergeTenantFieldsIntoPickerGroups,
    type TenantFieldDefinitionRow,
} from "@/lib/layout/tenantLayoutFieldPickerCatalog";

function refKeyToCatalogField(refKey: string): LayoutCatalogField | null {
    if (!isRefKeyPickerEligible(refKey, "person")) return null;
    const dot = refKey.indexOf(".");
    const entityKey = dot === -1 ? "person" : refKey.slice(0, dot);
    const fieldKey = dot === -1 ? refKey : refKey.slice(dot + 1);
    const manifest = manifestEntryForRefKey(refKey);
    return {
        entityKey,
        entityLabel: "",
        fieldKey,
        fieldLabel: manifest?.label ?? resolveLayoutEditorFieldRefLabel(refKey),
        fieldType: manifest?.fieldType ?? "text",
        refKey,
    };
}

export function buildPersonDrawerEditorFieldPickerGroups(options?: {
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
}): LayoutCatalogGroup[] {
    const fields: LayoutCatalogField[] = [];
    for (const refKey of PERSON_DRAWER_SURFACE.allowedFieldRefKeys) {
        if (refKey.startsWith("_")) continue;
        const field = refKeyToCatalogField(refKey);
        if (field) fields.push(field);
    }

    const tenantFields = buildTenantLayoutCatalogFields(options?.tenantFieldDefinitions ?? [], "person_drawer");

    return buildContextFirstDrawerFieldPickerGroups(
        "person_drawer",
        finalizeCatalogGroupsForPicker(
            mergeTenantFieldsIntoPickerGroups(
                organizeChildcarePickerGroups(fields, "person", { supplementFromStarterCatalog: false }) as LayoutCatalogGroup[],
                tenantFields,
            ),
        ),
    );
}

/** Linked-child columns for person-drawer related lists — allow-list only, no opportunity defaults. */
export function buildPersonDrawerLinkedChildRelatedListFieldPickerGroups(options?: {
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
}): LayoutCatalogGroup[] {
    const fields: LayoutCatalogField[] = [];
    for (const refKey of PERSON_DRAWER_LINKED_CHILD_FIELD_REFS) {
        const dot = refKey.indexOf(".");
        const entityKey = dot === -1 ? "child" : refKey.slice(0, dot);
        const fieldKey = dot === -1 ? refKey : refKey.slice(dot + 1);
        const manifest = manifestEntryForRefKey(refKey);
        fields.push({
            entityKey,
            entityLabel: entityKey === "inquiry_child" ? "Child" : "Child",
            fieldKey,
            fieldLabel: manifest?.label ?? resolveLayoutEditorFieldRefLabel(refKey),
            fieldType: manifest?.fieldType ?? "text",
            refKey,
        });
    }

    const tenantFields = buildTenantLayoutCatalogFields(options?.tenantFieldDefinitions ?? [], "person_drawer").filter(
        (field) => field.refKey.startsWith("child.") || field.refKey.startsWith("inquiry_child."),
    );

    return finalizeCatalogGroupsForPicker(
        mergeTenantFieldsIntoPickerGroups(
            organizeChildcarePickerGroups(fields, "person", { supplementFromStarterCatalog: false }) as LayoutCatalogGroup[],
            tenantFields,
        ),
    );
}
