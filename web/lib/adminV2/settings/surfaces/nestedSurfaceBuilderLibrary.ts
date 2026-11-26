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
import { categoryDisplayLabel } from "@/lib/fields/fieldCatalogForSettings";
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
    categoryKey: string;
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
        categoryKey: field.categoryKey ?? "general",
        isSystemField: field.isSystemField,
    }));
}

export function nestedSurfaceLibraryCategories(
    items: readonly NestedSurfaceLibraryItem[],
): SurfaceComposerLibraryCategory<NestedSurfaceLibraryItem>[] {
    const categoryKeys = [...new Set(items.map((item) => item.categoryKey))].sort((a, b) =>
        categoryDisplayLabel(a).localeCompare(categoryDisplayLabel(b)),
    );
    if (categoryKeys.length > 0) {
        return groupSurfaceComposerLibrary(
            items,
            categoryKeys,
            (key) => categoryDisplayLabel(key),
            (item) => item.categoryKey,
        );
    }
    return groupSurfaceComposerLibrary(
        items,
        [...new Set(items.map((i) => i.groupKey))],
        (key) => items.find((i) => i.groupKey === key)?.groupLabel ?? key,
        (item) => item.groupKey,
    );
}
