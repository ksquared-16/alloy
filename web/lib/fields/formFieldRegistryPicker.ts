/**
 * Forms Builder — registry-first system field picker (F1-C / Field Platform P0).
 *
 * Primary: canonical Forms / Documents provider derivation (field_definitions + platform catalog)
 * Fallback: OPERATIONAL_FORM_SYSTEM_FIELDS (compatibility gaps only — not live authority)
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
    filterFormsDocumentsDataProviders,
} from "@/lib/fields/canonicalDataProviderRegistry";
import { canonicalProviderToFormFieldSource } from "@/lib/fields/formsFieldSourceBinding";
import {
    OPERATIONAL_FORM_SYSTEM_FIELDS,
    type SystemFieldRegistryEntry,
    type SystemFieldValueKind,
} from "@/lib/forms/systemFieldRegistry";
import { getOptionSetKeyFromConfig } from "@/lib/admin/fieldDefinitionOptionSetConfig";
import { isChildcareOperatorPickerVisible } from "@/lib/fields/childcareFieldCatalogDoctrine";
import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";

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
export const FORM_PICKER_ENTITY_TYPES = ["person", "inquiry_child", "customer_member", "opportunity", "customer"] as const;

/** No operational-catalog fallback — platform seeds only. */
export const FORM_PICKER_NO_LEGACY_FALLBACK: readonly SystemFieldRegistryEntry[] = [];

/**
 * Synchronous platform-supported picker entries (no tenant merge, no operational fallback).
 * Used for first-paint availability before org field_definitions load completes.
 */
export function buildFormSystemFieldPickerPlatformBaseline(): SystemFieldRegistryEntry[] {
    return buildFormSystemFieldPicker([], FORM_PICKER_NO_LEGACY_FALLBACK);
}

function fieldTypeToSuggestedKind(fieldType: string): SystemFieldValueKind {
    const t = fieldType.trim().toLowerCase();
    if (t === "email") return "email";
    if (t === "phone") return "phone";
    if (t === "number") return "number";
    if (t === "date" || t === "datetime") return "date";
    if (t === "boolean") return "checkbox";
    if (t === "select" || t === "multiselect") return "select";
    if (t === "textarea") return "textarea";
    if (t === "signature") return "signature";
    return "text";
}

function canonicalRefFromProvider(provider: CanonicalDataProvider): CanonicalRegistryRef {
    const dot = provider.refKey.indexOf(".");
    if (dot >= 0) {
        return {
            entity_type: provider.refKey.slice(0, dot),
            field_key: provider.refKey.slice(dot + 1),
        };
    }
    return {
        entity_type: provider.settingsEntity ?? provider.entityNamespace,
        field_key: provider.refKey,
    };
}

export function providerToFormRegistryEntry(
    provider: CanonicalDataProvider,
    orgDef?: FieldDefinitionPickerRow,
): SystemFieldRegistryEntry {
    const canonicalRef = canonicalRefFromProvider(provider);
    const legacyId = canonicalRefToSystemFieldId(canonicalRef);
    const id = legacyId ?? formsRegistryEntryIdForCanonicalRef(canonicalRef);
    const field_key = formsFieldKeyForCanonicalRef(canonicalRef);
    const optionSetKey =
        orgDef ? (getOptionSetKeyFromConfig(orgDef.config ?? null) ?? undefined) : undefined;
    const label = (orgDef?.label ?? provider.label).trim() || provider.label;
    const description = (orgDef?.help_text ?? orgDef?.description ?? "").trim() || undefined;
    const suggestedKind = fieldTypeToSuggestedKind(orgDef?.field_type ?? provider.fieldType ?? "text");

    const legacyEntry = legacyId ? OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === legacyId) : undefined;

    return {
        id,
        entity_type: (legacyEntry?.entity_type ??
            formsEntityTypeFromFieldDefinitionEntity(canonicalRef.entity_type)) as SystemFieldRegistryEntry["entity_type"],
        field_key,
        default_label: label,
        default_description: description ?? legacyEntry?.default_description,
        default_required: legacyEntry?.default_required ?? false,
        suggested_kind: suggestedKind,
        public_intake_safe: legacyEntry?.public_intake_safe ?? true,
        ...(legacyEntry?.shared_value_key ? { shared_value_key: legacyEntry.shared_value_key } : {}),
        ...(legacyEntry?.crm_mapping_key ? { crm_mapping_key: legacyEntry.crm_mapping_key } : {}),
        ...(optionSetKey
            ? { default_option_set_key: optionSetKey }
            : legacyEntry?.default_option_set_key
              ? { default_option_set_key: legacyEntry.default_option_set_key }
              : {}),
        ...(legacyEntry?.select_options_lines && !optionSetKey
            ? { select_options_lines: legacyEntry.select_options_lines }
            : {}),
    };
}

export function fieldDefToFormRegistryEntry(def: FieldDefinitionPickerRow): SystemFieldRegistryEntry {
    const ref: CanonicalRegistryRef = {
        entity_type: def.entity_type,
        field_key: def.field_key,
    };
    const provider: CanonicalDataProvider = {
        refKey: `${def.entity_type}.${def.field_key}`,
        label: (def.label ?? def.field_key).trim() || def.field_key,
        kind: def.is_system ? "platform_field" : "business_field",
        outputShape: "scalar",
        entityNamespace: formsEntityTypeFromFieldDefinitionEntity(def.entity_type),
        settingsEntity: def.entity_type,
        fieldType: def.field_type,
        isSystem: def.is_system,
        availability: { pipeline: true, waitlist: true },
    };
    return providerToFormRegistryEntry(provider, def);
}

/**
 * Canonical provider picker list. Org field_definitions are primary; legacy catalog fills gaps only.
 * Deduplicates by canonical ref so registry and fallback never show twice.
 */
export function buildFormSystemFieldPicker(
    orgDefs: readonly FieldDefinitionPickerRow[],
    fallback: readonly SystemFieldRegistryEntry[] = OPERATIONAL_FORM_SYSTEM_FIELDS,
): SystemFieldRegistryEntry[] {
    const defByRef = new Map<string, FieldDefinitionPickerRow>();
    for (const def of orgDefs) {
        if (!def.is_active) continue;
        if (!(FORM_PICKER_ENTITY_TYPES as readonly string[]).includes(def.entity_type)) continue;
        if (!isChildcareOperatorPickerVisible(def.entity_type, def.field_key, def)) continue;
        defByRef.set(canonicalRefKey({ entity_type: def.entity_type, field_key: def.field_key }), def);
    }

    const providers = filterFormsDocumentsDataProviders({ tenantFieldDefinitions: orgDefs });
    const byCanonical = new Map<string, SystemFieldRegistryEntry>();

    for (const provider of providers) {
        const ref = canonicalRefFromProvider(provider);
        const key = canonicalRefKey(ref);
        const orgDef = defByRef.get(key);
        byCanonical.set(key, providerToFormRegistryEntry(provider, orgDef));
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

/** Verify new picker entries are not sourced from the static operational catalog alone. */
export function pickerUsesCanonicalProviderDerivation(
    orgDefs: readonly FieldDefinitionPickerRow[],
): boolean {
    const fromCanonical = filterFormsDocumentsDataProviders({ tenantFieldDefinitions: orgDefs });
    return fromCanonical.length > 0 || orgDefs.some((d) => d.is_active);
}

/** Lookup map for picker resolution (registry-backed + legacy). */
export function systemFieldByIdFromPicker(
    picker: readonly SystemFieldRegistryEntry[],
): ReadonlyMap<string, SystemFieldRegistryEntry> {
    return new Map(picker.map((e) => [e.id, e]));
}

export function registryEntryForFormField(
    field: { id: string; field_source?: { entity_type?: string; field_key?: string } | null },
    picker: readonly SystemFieldRegistryEntry[],
): SystemFieldRegistryEntry | null {
    if (field.field_source?.entity_type === "custom") return null;
    const byId = systemFieldByIdFromPicker(picker);
    const byFieldKey = new Map(picker.map((e) => [e.field_key, e]));
    return byFieldKey.get(field.id) ?? byId.get(field.id) ?? picker.find((e) => e.field_key === field.id) ?? null;
}

export function pickerValueForFormField(
    field: { id: string; field_source?: { entity_type?: string; field_key?: string } | null },
    picker: readonly SystemFieldRegistryEntry[],
): string {
    if (field.field_source?.entity_type === "custom" && field.field_source.field_key === "unmapped") {
        return "__custom";
    }
    const entry = registryEntryForFormField(field, picker);
    return entry ? `sys:${entry.id}` : "__custom";
}

export { canonicalProviderToFormFieldSource };
