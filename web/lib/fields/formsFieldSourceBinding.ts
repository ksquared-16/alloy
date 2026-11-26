/**
 * Forms / Documents binding adapter — canonical provider ↔ persisted field_source.
 *
 * Direction:
 *   Canonical provider → Forms binding adapter → existing field_source shape
 *
 * Storage vocabulary (guardian, child, enrollment) is preserved for compatibility.
 */

import type { FormFieldSource } from "@/lib/forms/schema";
import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import {
    canonicalRefKey,
    fieldDefinitionEntityTypeFromFormsEntity,
    formsEntityTypeFromFieldDefinitionEntity,
    formsFieldKeyForCanonicalRef,
    formsRegistryEntryIdForCanonicalRef,
    systemFieldIdToCanonicalRef,
    type CanonicalRegistryRef,
} from "@/lib/fields/fieldRegistryReferenceMatrix";
import {
    formsLegacyCompatibilityEntry,
    formsLegacyCompatibilityForCanonicalRef,
    type FormsLegacyCompatibilityClass,
} from "@/lib/fields/formsLegacyCompatibility";
import {
    formFieldSourceHasRelationshipLineage,
    isRelationshipLeafProvider,
    relationshipProviderRefFromFieldSource,
    relationshipProviderToFormFieldSource,
} from "@/lib/fields/formsRelationshipFieldSourceBinding";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";

export type FormFieldSourceResolutionStatus =
    | "canonical"
    | "legacy_alias"
    | "legacy_load_only"
    | "custom"
    | "unknown";

export type FormFieldSourceResolution = {
    status: FormFieldSourceResolutionStatus;
    canonicalRef: CanonicalRegistryRef | null;
    legacySystemFieldId: string | null;
    legacyClassification: FormsLegacyCompatibilityClass | null;
    /** Original persisted source — never mutated by resolution. */
    persistedSource: FormFieldSource;
};

function canonicalRefFromProvider(provider: CanonicalDataProvider): CanonicalRegistryRef {
    const dot = provider.refKey.indexOf(".");
    if (dot >= 0) {
        return {
            entity_type: provider.refKey.slice(0, dot),
            field_key: provider.refKey.slice(dot + 1),
        };
    }
    const mappedEntity = fieldDefinitionEntityTypeFromFormsEntity(provider.entityNamespace);
    return {
        entity_type: mappedEntity ?? provider.entityNamespace,
        field_key: provider.refKey,
    };
}

function legacyEntryForCanonicalRef(ref: CanonicalRegistryRef) {
    const compat = formsLegacyCompatibilityForCanonicalRef(ref);
    if (compat) {
        return OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === compat.systemFieldId) ?? null;
    }
    return null;
}

/** Canonical provider → persisted Forms field_source (storage vocabulary preserved). */
export function canonicalProviderToFormFieldSource(
    provider: CanonicalDataProvider,
    options?: { legacySystemFieldId?: string },
): FormFieldSource {
    if (isRelationshipLeafProvider(provider)) {
        return relationshipProviderToFormFieldSource(provider);
    }

    const canonicalRef = canonicalRefFromProvider(provider);
    const legacyId = options?.legacySystemFieldId ?? formsRegistryEntryIdForCanonicalRef(canonicalRef);
    const legacyEntry =
        OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === legacyId) ??
        legacyEntryForCanonicalRef(canonicalRef);

    if (legacyEntry) {
        return {
            entity_type: legacyEntry.entity_type,
            field_key: legacyEntry.field_key,
            ...(legacyEntry.shared_value_key ? { shared_value_key: legacyEntry.shared_value_key } : {}),
            ...(legacyEntry.crm_mapping_key ? { crm_mapping_key: legacyEntry.crm_mapping_key } : {}),
        };
    }

    return {
        entity_type: formsEntityTypeFromFieldDefinitionEntity(canonicalRef.entity_type) as FormFieldSource["entity_type"],
        field_key: formsFieldKeyForCanonicalRef(canonicalRef),
    };
}

function canonicalRefFromPersistedSource(source: FormFieldSource): CanonicalRegistryRef | null {
    const entityType = source.entity_type?.trim() ?? "";
    const fieldKey = source.field_key?.trim() ?? "";
    if (!entityType || !fieldKey) return null;

    if (entityType === "custom") return null;

    const legacyByFieldKey = OPERATIONAL_FORM_SYSTEM_FIELDS.find(
        (e) => e.entity_type === entityType && e.field_key === fieldKey,
    );
    if (legacyByFieldKey) {
        return systemFieldIdToCanonicalRef(legacyByFieldKey.id);
    }

    const defEntity = fieldDefinitionEntityTypeFromFormsEntity(entityType);
    if (!defEntity) return null;

    return { entity_type: defEntity, field_key: fieldKey };
}

function canonicalRefFromRelationshipProviderRef(providerRefKey: string): CanonicalRegistryRef | null {
    const dot = providerRefKey.indexOf(".");
    if (dot < 0) return null;
    return {
        entity_type: providerRefKey.slice(0, dot),
        field_key: providerRefKey.slice(dot + 1),
    };
}

/** Existing field_source → canonical ref or safe unresolved state. */
export function formFieldSourceToCanonicalProvider(source: FormFieldSource | null | undefined): FormFieldSourceResolution {
    if (!source) {
        return {
            status: "unknown",
            canonicalRef: null,
            legacySystemFieldId: null,
            legacyClassification: null,
            persistedSource: { entity_type: "", field_key: "" },
        };
    }

    if (source.entity_type === "custom") {
        return {
            status: "custom",
            canonicalRef: null,
            legacySystemFieldId: null,
            legacyClassification: null,
            persistedSource: source,
        };
    }

    if (formFieldSourceHasRelationshipLineage(source)) {
        const providerRef = relationshipProviderRefFromFieldSource(source)!;
        const leafRef = source.relationship!.leaf_provider_ref_key.trim();
        const canonicalRef = canonicalRefFromRelationshipProviderRef(leafRef) ?? canonicalRefFromRelationshipProviderRef(providerRef);
        return {
            status: "canonical",
            canonicalRef,
            legacySystemFieldId: null,
            legacyClassification: null,
            persistedSource: source,
        };
    }

    const legacyEntry = OPERATIONAL_FORM_SYSTEM_FIELDS.find(
        (e) => e.entity_type === source.entity_type && e.field_key === source.field_key,
    );
    if (legacyEntry) {
        const compat = formsLegacyCompatibilityEntry(legacyEntry.id);
        const canonicalRef = systemFieldIdToCanonicalRef(legacyEntry.id);
        return {
            status:
                compat?.classification === "legacy_load_only"
                    ? "legacy_load_only"
                    : compat?.classification === "alias_to_canonical" || compat?.classification === "obsolete_renderable"
                      ? "legacy_alias"
                      : canonicalRef
                        ? "canonical"
                        : "unknown",
            canonicalRef,
            legacySystemFieldId: legacyEntry.id,
            legacyClassification: compat?.classification ?? null,
            persistedSource: source,
        };
    }

    const canonicalRef = canonicalRefFromPersistedSource(source);
    if (!canonicalRef) {
        return {
            status: "unknown",
            canonicalRef: null,
            legacySystemFieldId: null,
            legacyClassification: null,
            persistedSource: source,
        };
    }

    return {
        status: "canonical",
        canonicalRef,
        legacySystemFieldId: formsRegistryEntryIdForCanonicalRef(canonicalRef),
        legacyClassification: formsLegacyCompatibilityForCanonicalRef(canonicalRef)?.classification ?? null,
        persistedSource: source,
    };
}

/** Registry lookup key in field_definitions grain. */
export function fieldDefinitionLookupKey(ref: CanonicalRegistryRef): string {
    return canonicalRefKey(ref);
}

/** Expand org registry keys to include Forms storage vocabulary aliases for publish checks. */
export function expandFieldDefinitionKeySetForFormsValidation(
    registryKeys: ReadonlySet<string>,
): ReadonlySet<string> {
    const expanded = new Set<string>(registryKeys);
    for (const key of registryKeys) {
        const sep = key.includes("::") ? "::" : key.includes(":") ? ":" : null;
        if (!sep) continue;
        const [entityType, fieldKey] = key.split(sep);
        if (!entityType || !fieldKey) continue;
        const source = canonicalProviderToFormFieldSource({
            refKey: `${entityType}.${fieldKey}`,
            label: fieldKey,
            kind: "business_field",
            outputShape: "scalar",
            entityNamespace: formsEntityTypeFromFieldDefinitionEntity(entityType),
            isSystem: true,
            availability: { pipeline: true, waitlist: true },
        });
        expanded.add(`${source.entity_type}::${source.field_key}`);
        expanded.add(`${entityType}::${fieldKey}`);
        expanded.add(`${entityType}:${fieldKey}`);
    }
    return expanded;
}
