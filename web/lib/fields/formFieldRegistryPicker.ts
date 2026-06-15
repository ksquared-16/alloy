/**
 * Forms Builder — registry-first system field picker (F1-C).
 *
 * Primary: org `field_definitions`
 * Fallback: OPERATIONAL_FORM_SYSTEM_FIELDS (compatibility only)
 */

import {
    canonicalRefKey,
    canonicalRefToSystemFieldId,
    formsEntityTypeFromFieldDefinitionEntity,
    formsFieldKeyForCanonicalRef,
    formsRegistryEntryIdForCanonicalRef,
    systemFieldIdToCanonicalRef,
    type CanonicalRegistryRef,
} from "@/lib/fields/fieldRegistryReferenceMatrix";
import {
    OPERATIONAL_FORM_SYSTEM_FIELDS,
    type SystemFieldRegistryEntry,
    type SystemFieldValueKind,
} from "@/lib/forms/systemFieldRegistry";
import { getOptionSetKeyFromConfig } from "@/lib/admin/fieldDefinitionOptionSetConfig";
import { isChildcareOperatorPickerVisible } from "@/lib/fields/childcareFieldCatalogDoctrine";

export type FieldDefinitionPickerRow = {
    entity_type: string;
    field_key: string;
    field_type: string;
    label: string | null;
    description?: string | null;
    help_text?: string | null;
    placeholder?: string | null;
    config?: Record<string, unknown> | null;
    is_system: boolean;
    is_active: boolean;
};

/** Entity types loaded for Forms system-field picker. */
export const FORM_PICKER_ENTITY_TYPES = ["person", "inquiry_child", "opportunity", "customer"] as const;

function fieldTypeToSuggestedKind(fieldType: string): SystemFieldValueKind {
    const t = fieldType.trim().toLowerCase();
    if (t === "email") return "email";
    if (t === "phone") return "phone";
    if (t === "number") return "number";
    if (t === "date" || t === "datetime") return "date";
    if (t === "boolean") return "checkbox";
    if (t === "select" || t === "multiselect") return "select";
    if (t === "textarea") return "textarea";
    return "text";
}

export function fieldDefToFormRegistryEntry(def: FieldDefinitionPickerRow): SystemFieldRegistryEntry {
    const ref: CanonicalRegistryRef = {
        entity_type: def.entity_type,
        field_key: def.field_key,
    };
    const legacyId = canonicalRefToSystemFieldId(ref);
    const id = legacyId ?? formsRegistryEntryIdForCanonicalRef(ref);
    const field_key = formsFieldKeyForCanonicalRef(ref);
    const optionSetKey = getOptionSetKeyFromConfig(def.config ?? null) ?? undefined;
    const label = (def.label ?? def.field_key).trim() || def.field_key;
    const description = (def.help_text ?? def.description ?? "").trim() || undefined;

    return {
        id,
        entity_type: formsEntityTypeFromFieldDefinitionEntity(def.entity_type) as SystemFieldRegistryEntry["entity_type"],
        field_key,
        default_label: label,
        default_description: description,
        default_required: false,
        suggested_kind: fieldTypeToSuggestedKind(def.field_type),
        public_intake_safe: true,
        ...(optionSetKey ? { default_option_set_key: optionSetKey } : {}),
    };
}

/**
 * Registry-first picker list. Org field_definitions are primary; legacy catalog fills gaps.
 * Deduplicates by canonical ref so registry and fallback never show twice.
 */
export function buildFormSystemFieldPicker(
    orgDefs: readonly FieldDefinitionPickerRow[],
    fallback: readonly SystemFieldRegistryEntry[] = OPERATIONAL_FORM_SYSTEM_FIELDS
): SystemFieldRegistryEntry[] {
    const byCanonical = new Map<string, SystemFieldRegistryEntry>();

    for (const def of orgDefs) {
        if (!def.is_active) continue;
        if (!(FORM_PICKER_ENTITY_TYPES as readonly string[]).includes(def.entity_type)) continue;
        if (!isChildcareOperatorPickerVisible(def.entity_type, def.field_key, def)) continue;
        const key = canonicalRefKey({ entity_type: def.entity_type, field_key: def.field_key });
        byCanonical.set(key, fieldDefToFormRegistryEntry(def));
    }

    for (const legacy of fallback) {
        const ref = systemFieldIdToCanonicalRef(legacy.id);
        if (ref) {
            const key = canonicalRefKey(ref);
            if (byCanonical.has(key)) continue;
            byCanonical.set(key, legacy);
            continue;
        }
        const orphanKey = `fallback:${legacy.id}`;
        if (![...byCanonical.values()].some((e) => e.id === legacy.id)) {
            byCanonical.set(orphanKey, legacy);
        }
    }

    return [...byCanonical.values()].sort((a, b) => a.default_label.localeCompare(b.default_label));
}

/** Lookup map for picker resolution (registry-backed + legacy). */
export function systemFieldByIdFromPicker(
    picker: readonly SystemFieldRegistryEntry[]
): ReadonlyMap<string, SystemFieldRegistryEntry> {
    return new Map(picker.map((e) => [e.id, e]));
}

export function registryEntryForFormField(
    field: { id: string; field_source?: { entity_type?: string; field_key?: string } | null },
    picker: readonly SystemFieldRegistryEntry[]
): SystemFieldRegistryEntry | null {
    if (field.field_source?.entity_type === "custom") return null;
    const byId = systemFieldByIdFromPicker(picker);
    const byFieldKey = new Map(picker.map((e) => [e.field_key, e]));
    return byFieldKey.get(field.id) ?? byId.get(field.id) ?? picker.find((e) => e.field_key === field.id) ?? null;
}

export function pickerValueForFormField(
    field: { id: string; field_source?: { entity_type?: string; field_key?: string } | null },
    picker: readonly SystemFieldRegistryEntry[]
): string {
    if (field.field_source?.entity_type === "custom" && field.field_source.field_key === "unmapped") {
        return "__custom";
    }
    const entry = registryEntryForFormField(field, picker);
    return entry ? `sys:${entry.id}` : "__custom";
}
