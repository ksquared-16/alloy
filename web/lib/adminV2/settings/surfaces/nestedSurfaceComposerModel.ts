/**
 * Nested Surface composer — placed field refs for the shared Surface Composer.
 *
 * Nested surfaces persist ordered field keys per evidence group (no section/placement).
 * The composer maps them to the shared selection + inspector vocabulary.
 */

import {
    availableFieldsForNamespaces,
    type AvailableField,
} from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import {
    groupDefsFor,
    selectedFieldKeys,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { SurfaceComposerPlacedItemRef } from "@/lib/adminV2/settings/surfaces/surfaceComposer";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type NestedPlacedFieldRef = {
    id: string;
    groupKey: string;
    fieldKey: string;
    label: string;
};

export function nestedPlacedFieldId(groupKey: string, fieldKey: string): string {
    return `${groupKey}:${fieldKey}`;
}

function labelForFieldKey(
    surfaceId: string,
    groupKey: string,
    fieldKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): string {
    const def = groupDefsFor(surfaceId).find((g) => g.key === groupKey);
    const all: AvailableField[] = def
        ? availableFieldsForNamespaces(def.acceptedNamespaces, tenantFieldDefinitions)
        : [];
    return (
        all.find((f) => f.key === fieldKey)?.label
        ?? fieldKey.replace(/^[a-z_]+\./, "").replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    );
}

export function listNestedPlacedFields(
    surfaceId: string,
    groupKey: string,
    config: NestedSurfaceConfig,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): NestedPlacedFieldRef[] {
    return selectedFieldKeys(config, groupKey).map((fieldKey) => ({
        id: nestedPlacedFieldId(groupKey, fieldKey),
        groupKey,
        fieldKey,
        label: labelForFieldKey(surfaceId, groupKey, fieldKey, tenantFieldDefinitions),
    }));
}

export function toSurfaceComposerPlacedItemRef(field: NestedPlacedFieldRef): SurfaceComposerPlacedItemRef {
    return {
        fieldId: field.fieldKey,
        label: field.label,
        builderSlot: "groupCount",
        stackLine: 0,
        inlineWithPrevious: false,
    };
}
