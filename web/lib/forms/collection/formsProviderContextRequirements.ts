/**
 * Forms adapter - derive provider context requirements from form field bindings.
 */

import type { FormField } from "@/lib/forms/schema";
import {
    fieldDefinitionEntityTypeFromFormsEntity,
    systemFieldIdToCanonicalRef,
    type CanonicalRegistryRef,
} from "@/lib/fields/fieldRegistryReferenceMatrix";
import { formFieldSourceToCanonicalProvider } from "@/lib/fields/formsFieldSourceBinding";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import {
    providerContextRequirementsFromCanonicalRef,
    type ProviderContextRequirement,
} from "@/lib/fields/collection/providerContextRequirements";

export function canonicalRefFromFormField(field: FormField): CanonicalRegistryRef | null {
    if (field.type === "group") return null;
    const source = field.field_source;
    if (!source || source.entity_type === "custom") return null;
    try {
        const resolution = formFieldSourceToCanonicalProvider(source);
        if (resolution.canonicalRef) return resolution.canonicalRef;
    } catch {
        // legacy lookup
    }
    const legacyEntry = OPERATIONAL_FORM_SYSTEM_FIELDS.find(
        (e) => e.entity_type === source.entity_type && e.field_key === source.field_key,
    );
    if (legacyEntry) {
        const fromId = systemFieldIdToCanonicalRef(legacyEntry.id);
        if (fromId) return fromId;
    }
    const defEntity = fieldDefinitionEntityTypeFromFormsEntity(source.entity_type ?? "");
    if (!defEntity) return null;
    return { entity_type: defEntity, field_key: source.field_key?.trim() ?? field.id };
}

export function providerContextRequirementsForFormField(field: FormField): ProviderContextRequirement[] {
    const ref = canonicalRefFromFormField(field);
    if (!ref) return [];
    return providerContextRequirementsFromCanonicalRef(ref);
}
