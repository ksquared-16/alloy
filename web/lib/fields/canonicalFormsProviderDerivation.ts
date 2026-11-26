/**
 * Canonical Forms / Documents provider derivation — adapts canonical sources into
 * classified scalar provider seeds. Must not become a manually maintained catalog.
 *
 * Sources (downstream only):
 *   field_definitions · platformFieldCatalog · fieldRegistryReferenceMatrix
 *   formsLegacyCompatibility · consumerProviderCapabilities
 */

import type {
    CanonicalDataProvider,
    CanonicalDataProviderSourceDerivation,
    CanonicalDataValueType,
} from "@/lib/fields/canonicalDataProviderModel";
import {
    FORM_PICKER_ENTITY_TYPES,
    type FieldDefinitionPickerRow,
} from "@/lib/fields/formFieldRegistryPicker";
import {
    canonicalRefToSystemFieldId,
    formsEntityTypeFromFieldDefinitionEntity,
} from "@/lib/fields/fieldRegistryReferenceMatrix";
import { isChildcareOperatorPickerVisible } from "@/lib/fields/childcareFieldCatalogDoctrine";
import {
    platformFieldsForEntity,
    type PlatformFieldDefinition,
} from "@/lib/fields/platformFieldCatalog";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import {
    formsLegacyCompatibilityEntry,
    isFormsLegacyLoadOnlySystemFieldId,
} from "@/lib/fields/formsLegacyCompatibility";
import { isLegacyAmbiguousContactSystemFieldId, isFormsAmbiguousPersonScalarRef } from "@/lib/fields/formsLegacyContactRoleCompatibility";
import { buildFormsRelationshipProviderSeeds } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import { systemFieldIdToCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";

const BOTH: CanonicalDataProvider["availability"] = { pipeline: true, waitlist: true };

function sourceMeta(
    source: NonNullable<CanonicalDataProvider["source"]>["source"],
    sourceModule: string,
): CanonicalDataProviderSourceDerivation {
    return { source, sourceModule };
}

function valueTypeFromFieldType(fieldType?: string): CanonicalDataValueType {
    switch (fieldType?.toLowerCase()) {
        case "number":
        case "integer":
            return "number";
        case "date":
        case "datetime":
            return "date";
        case "boolean":
            return "boolean";
        case "select":
        case "multiselect":
            return "choice";
        case "status":
            return "status";
        case "email":
        case "phone":
        case "url":
            return "link";
        default:
            return "text";
    }
}

function providerRefKey(entityType: string, fieldKey: string): string {
    return `${entityType.trim().toLowerCase()}.${fieldKey.trim()}`;
}

function providerFromPlatformField(pf: PlatformFieldDefinition): CanonicalDataProvider | null {
    if (pf.ownership === "computed" || pf.ownership === "relationship") return null;
    return {
        refKey: pf.refKey,
        label: pf.label,
        kind: "platform_field",
        outputShape: "scalar",
        entityNamespace: formsEntityTypeFromFieldDefinitionEntity(pf.entity_type),
        settingsEntity: pf.entity_type,
        fieldType: pf.field_type,
        valueType: valueTypeFromFieldType(pf.field_type),
        isSystem: true,
        availability: BOTH,
        legacyOnly: isFormsAmbiguousPersonScalarRef(pf.refKey),
        source: sourceMeta("platform_field_catalog", "web/lib/fields/platformFieldCatalog.ts"),
        resolverOwner: "web/lib/fields/platformFieldCatalog.ts",
    };
}

function providerFromTenantDef(def: FieldDefinitionPickerRow): CanonicalDataProvider | null {
    if (!def.is_active) return null;
    if (!(FORM_PICKER_ENTITY_TYPES as readonly string[]).includes(def.entity_type)) return null;
    if (!isChildcareOperatorPickerVisible(def.entity_type, def.field_key, def)) return null;

    const refKey = providerRefKey(def.entity_type, def.field_key);
    return {
        refKey,
        label: (def.label ?? def.field_key).trim() || def.field_key,
        kind: def.is_system ? "platform_field" : "business_field",
        outputShape: "scalar",
        entityNamespace: formsEntityTypeFromFieldDefinitionEntity(def.entity_type),
        settingsEntity: def.entity_type,
        fieldType: def.field_type,
        valueType: valueTypeFromFieldType(def.field_type),
        isSystem: def.is_system,
        availability: BOTH,
        source: sourceMeta("field_definitions", "web/lib/fields/formFieldRegistryPicker.ts"),
        resolverOwner: "web/lib/fields/fieldResolverRegistry.ts",
    };
}

function providerFromLegacyOperational(systemFieldId: string): CanonicalDataProvider | null {
    const entry = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === systemFieldId);
    if (!entry) return null;
    const compat = formsLegacyCompatibilityEntry(systemFieldId);
    if (compat?.classification === "unsupported") return null;

    const canonicalRef = systemFieldIdToCanonicalRef(systemFieldId);
    const refKey = canonicalRef
        ? providerRefKey(canonicalRef.entity_type, canonicalRef.field_key)
        : `legacy.${systemFieldId}`;

    return {
        refKey,
        label: entry.default_label,
        kind: "business_field",
        outputShape: "scalar",
        entityNamespace: entry.entity_type,
        fieldType: entry.suggested_kind,
        valueType: valueTypeFromFieldType(entry.suggested_kind),
        isSystem: true,
        availability: BOTH,
        legacyOnly: isFormsLegacyLoadOnlySystemFieldId(systemFieldId)
            || isLegacyAmbiguousContactSystemFieldId(systemFieldId)
            || compat?.appearsInNewPickers === false,
        source: sourceMeta("legacy_compatibility", "web/lib/forms/systemFieldRegistry.ts"),
        resolverOwner: "web/lib/forms/systemFieldRegistry.ts",
    };
}

/** Platform scalar seeds for Forms / Documents entity grains. */
export function buildFormsPlatformProviderSeeds(): CanonicalDataProvider[] {
    const providers: CanonicalDataProvider[] = [];
    for (const entityType of FORM_PICKER_ENTITY_TYPES) {
        for (const pf of platformFieldsForEntity(entityType)) {
            const provider = providerFromPlatformField(pf);
            if (provider) providers.push(provider);
        }
    }
    return providers;
}

/** Legacy operational seeds — publish/hydration compatibility only. */
export function buildFormsLegacyProviderSeeds(): CanonicalDataProvider[] {
    return OPERATIONAL_FORM_SYSTEM_FIELDS.map((entry) => providerFromLegacyOperational(entry.id)).filter(
        (p): p is CanonicalDataProvider => p != null,
    );
}

/** Tenant field_definitions → scalar providers. */
export function buildFormsTenantProviderSeeds(
    orgDefs: readonly FieldDefinitionPickerRow[],
): CanonicalDataProvider[] {
    return orgDefs.map(providerFromTenantDef).filter((p): p is CanonicalDataProvider => p != null);
}

/** Static platform + legacy seeds (cached at registry layer). */
export function buildFormsProviderSeeds(): CanonicalDataProvider[] {
    const seen = new Map<string, CanonicalDataProvider>();
    for (const provider of buildFormsPlatformProviderSeeds()) {
        seen.set(provider.refKey, provider);
    }
    for (const provider of buildFormsLegacyProviderSeeds()) {
        if (!seen.has(provider.refKey)) seen.set(provider.refKey, provider);
    }
    return [...seen.values()];
}

export const FORMS_PROVIDER_DERIVATION_SOURCES = [
    "field_definitions",
    "platform_field_catalog",
    "fieldRegistryReferenceMatrix",
    "formsLegacyCompatibility",
    "consumerProviderCapabilities",
] as const;

/** Test helper — count of static seeds without tenant merge. */
export function formsScalarSeedRefKeysForTests(): string[] {
    return buildFormsProviderSeeds().map((p) => p.refKey).sort();
}

/** Whether a canonical ref already has a legacy system-field alias in the picker. */
export function formsProviderRefKeyForCanonical(entityType: string, fieldKey: string): string {
    const refKey = providerRefKey(entityType, fieldKey);
    const legacyId = canonicalRefToSystemFieldId({ entity_type: entityType, field_key: fieldKey });
    if (legacyId) {
        const legacy = providerFromLegacyOperational(legacyId);
        if (legacy) return legacy.refKey;
    }
    return refKey;
}

export function mergeFormsProviderCatalog(
    tenantDefs?: readonly FieldDefinitionPickerRow[],
): CanonicalDataProvider[] {
    const seen = new Map<string, CanonicalDataProvider>();
    for (const provider of buildFormsProviderSeeds()) {
        seen.set(provider.refKey, provider);
    }
    for (const provider of buildFormsRelationshipProviderSeeds()) {
        if (!seen.has(provider.refKey)) seen.set(provider.refKey, provider);
    }
    if (tenantDefs?.length) {
        for (const provider of buildFormsTenantProviderSeeds(tenantDefs)) {
            seen.set(provider.refKey, provider);
        }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}
