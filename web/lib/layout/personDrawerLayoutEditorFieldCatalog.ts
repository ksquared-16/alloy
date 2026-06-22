/**
 * Person drawer visual editor — field picker groups.
 */

import {
    finalizeCatalogGroupsForPicker,
    type LayoutCatalogField,
    type LayoutCatalogGroup,
} from "@/lib/layout/fieldCatalog";
import { organizeChildcarePickerGroups } from "@/lib/layout/childcareLayoutFieldCatalog";
import { isRefKeyPickerEligible, manifestEntryForRefKey } from "@/lib/layout/platformFieldResolutionManifest";
import { resolveLayoutEditorFieldRefLabel } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { PERSON_DRAWER_SURFACE } from "@/lib/layout/surfaceLayoutRegistry";

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

export function buildPersonDrawerEditorFieldPickerGroups(): LayoutCatalogGroup[] {
    const fields: LayoutCatalogField[] = [];
    for (const refKey of PERSON_DRAWER_SURFACE.allowedFieldRefKeys) {
        if (refKey.startsWith("_")) continue;
        const field = refKeyToCatalogField(refKey);
        if (field) fields.push(field);
    }
    return finalizeCatalogGroupsForPicker(organizeChildcarePickerGroups(fields, "person") as LayoutCatalogGroup[]);
}
