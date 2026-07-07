/**
 * Nested Surface Definition — library catalog for the Surface Composer.
 *
 * Contributes pickable fields per evidence group. Search, grouping, and library UI
 * live in the shared Surface Composer.
 */

import type { AvailableField } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import {
    availableFieldsForNestedGroup,
    groupDefsFor,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    groupSurfaceComposerLibrary,
    type SurfaceComposerLibraryCategory,
} from "@/lib/adminV2/settings/surfaces/surfaceComposerLibraryModel";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type NestedSurfaceLibraryItem = {
    kind: "field";
    groupKey: string;
    groupLabel: string;
    fieldKey: string;
    label: string;
    isSystemField: boolean;
};

export function buildNestedSurfaceLibraryForGroup(
    surfaceId: string,
    groupKey: string,
    config: NestedSurfaceConfig,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): NestedSurfaceLibraryItem[] {
    const groupDef = groupDefsFor(surfaceId).find((g) => g.key === groupKey);
    const available: AvailableField[] = availableFieldsForNestedGroup(
        surfaceId,
        groupKey,
        config,
        tenantFieldDefinitions,
    );
    return available.map((field) => ({
        kind: "field" as const,
        groupKey,
        groupLabel: groupDef?.label ?? groupKey,
        fieldKey: field.key,
        label: field.label,
        isSystemField: field.isSystemField,
    }));
}

export function nestedSurfaceLibraryCategories(
    items: readonly NestedSurfaceLibraryItem[],
): SurfaceComposerLibraryCategory<NestedSurfaceLibraryItem>[] {
    return groupSurfaceComposerLibrary(
        items,
        [...new Set(items.map((i) => i.groupKey))],
        (key) => items.find((i) => i.groupKey === key)?.groupLabel ?? key,
        (item) => item.groupKey,
    );
}
