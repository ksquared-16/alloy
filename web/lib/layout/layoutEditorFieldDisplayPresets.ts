/**
 * Experience Builder — friendly field display presets (not new field keys).
 */

import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type { LayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";
import { writeLayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";
import type { LayoutItem } from "@/lib/layout/layoutV2";
import { visibilityConditionForRule } from "@/lib/layout/layoutEditorVisibilityRules";

export type LayoutEditorFieldDisplayPreset = {
    presetKey: string;
    pickerLabel: string;
    description: string;
    refKey: string;
    fieldLabel: string;
    fieldType: string;
    entityKey: string;
    entityLabel: string;
    display: LayoutEditorDisplayConfig;
    editable: boolean;
};

export const PRIMARY_CONTACT_BADGE_FIELD_PRESET: LayoutEditorFieldDisplayPreset = {
    presetKey: "primary_contact_badge",
    pickerLabel: "Primary contact badge",
    description: "Read-only badge when this contact is the household primary.",
    refKey: "person.is_primary_contact",
    fieldLabel: "Primary contact",
    fieldType: "text",
    entityKey: "person",
    entityLabel: "Contact",
    display: {
        displayType: "badge",
        statusFormat: "badge",
        labelPosition: "hidden",
        emptyState: "Not primary",
    },
    editable: false,
};

export const LAYOUT_EDITOR_FIELD_DISPLAY_PRESETS: LayoutEditorFieldDisplayPreset[] = [PRIMARY_CONTACT_BADGE_FIELD_PRESET];

export function layoutEditorFieldDisplayPresetToCatalogField(
    preset: LayoutEditorFieldDisplayPreset,
): LayoutCatalogField {
    return {
        entityKey: preset.entityKey,
        entityLabel: preset.entityLabel,
        fieldKey: preset.refKey.split(".").slice(1).join(".") || preset.refKey,
        fieldLabel: preset.pickerLabel,
        fieldType: preset.fieldType,
        refKey: preset.refKey,
    };
}

export function applyLayoutEditorFieldDisplayPresetToItem(
    item: LayoutItem,
    preset: LayoutEditorFieldDisplayPreset,
): LayoutItem {
    return {
        ...item,
        label: preset.fieldLabel,
        renderHint: "badge",
        editable: preset.editable,
        visibleWhen: visibilityConditionForRule("show_when_field_exists", preset.refKey),
        metadata: writeLayoutEditorDisplayConfig(item.metadata, preset.display),
    };
}

export function isPrimaryContactBadgePresetRefKey(refKey: string): boolean {
    return refKey.trim() === PRIMARY_CONTACT_BADGE_FIELD_PRESET.refKey;
}
