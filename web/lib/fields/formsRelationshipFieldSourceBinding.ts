/**
 * Relationship provider ↔ persisted field_source with lineage preserved.
 *
 * Canonical identity: field_source.relationship (provider_ref_key, relationship_id, role,
 * leaf_provider_ref_key). Transport entity_type/field_key is compatibility-only.
 */

import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import type { FormFieldSource, FormFieldSourceRelationship } from "@/lib/forms/schema";
import {
    formsRelationshipRoleFromProvider,
    type FormsRelationshipRoleKey,
} from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import {
    legacyGuardianFlatCanonicalRef,
    formsRelationshipRoleFromSource,
} from "@/lib/fields/formsLegacyContactRoleCompatibility";
import {
    manifestRefKeyForRelationshipRoleLeaf,
    transportFieldSourceForRelationshipProvider,
} from "@/lib/fields/formsRelationshipTransport";
import { formFieldSourceToCanonicalProvider } from "@/lib/fields/formsFieldSourceBinding";

export function isRelationshipLeafProvider(provider: CanonicalDataProvider): boolean {
    return provider.kind === "relationship" && provider.outputShape === "scalar" && Boolean(provider.relationship);
}

export function relationshipBindingFromProvider(provider: CanonicalDataProvider): FormFieldSourceRelationship {
    const role = formsRelationshipRoleFromProvider(provider);
    const leafKey = provider.relationship?.leaf_key ?? "value";
    if (!role) {
        throw new Error(`Relationship provider missing role lineage: ${provider.refKey}`);
    }
    const leafProviderRefKey = manifestRefKeyForRelationshipRoleLeaf(role, leafKey);
    if (!leafProviderRefKey) {
        throw new Error(`Relationship provider missing manifest leaf ref: ${provider.refKey}`);
    }
    return {
        provider_ref_key: provider.refKey,
        relationship_id: provider.relationship!.relationship_id,
        role,
        leaf_provider_ref_key: leafProviderRefKey,
        leaf_key: leafKey,
        target_entity_type: "person",
    };
}

/** Relationship leaf → persisted field_source (transport + canonical relationship block). */
export function relationshipProviderToFormFieldSource(provider: CanonicalDataProvider): FormFieldSource {
    const role = formsRelationshipRoleFromProvider(provider);
    if (!role) {
        throw new Error(`Relationship provider missing role lineage: ${provider.refKey}`);
    }
    const transport = transportFieldSourceForRelationshipProvider(provider, role);
    return {
        ...transport,
        relationship: relationshipBindingFromProvider(provider),
    };
}

export function formFieldSourceHasRelationshipLineage(
    source: FormFieldSource | null | undefined,
): source is FormFieldSource & { relationship: FormFieldSourceRelationship } {
    return Boolean(
        source?.relationship?.relationship_id?.trim()
            && source.relationship.provider_ref_key?.trim()
            && source.relationship.leaf_provider_ref_key?.trim(),
    );
}

/** Resolve relationship provider ref from persisted source (explicit block wins). */
export function relationshipProviderRefFromFieldSource(source: FormFieldSource | null | undefined): string | null {
    if (!source) return null;
    if (source.relationship?.provider_ref_key?.trim()) return source.relationship.provider_ref_key.trim();
    return null;
}

export function formsRelationshipRoleFromFieldSource(source: FormFieldSource | null | undefined): FormsRelationshipRoleKey | null {
    if (!source) return null;
    return formsRelationshipRoleFromSource(source.relationship, relationshipProviderRefFromFieldSource(source));
}

/** Whether persisted source is legacy ambiguous guardian flat binding (no role). */
export function isLegacyAmbiguousGuardianBinding(source: FormFieldSource): boolean {
    if (formFieldSourceHasRelationshipLineage(source)) return false;
    if (source.entity_type !== "guardian") return false;
    return legacyGuardianFlatCanonicalRef(source.field_key) != null;
}

/** Round-trip check — persisted source retains relationship lineage after resolution. */
export function assertRelationshipLineageRoundTrip(source: FormFieldSource): boolean {
    if (!formFieldSourceHasRelationshipLineage(source)) return false;
    const resolution = formFieldSourceToCanonicalProvider(source);
    return resolution.persistedSource.relationship?.relationship_id === source.relationship?.relationship_id
        && resolution.persistedSource.relationship?.provider_ref_key === source.relationship?.provider_ref_key
        && resolution.persistedSource.relationship?.leaf_provider_ref_key === source.relationship?.leaf_provider_ref_key;
}

/** Hydration helper — never inject relationship metadata into legacy bindings on read. */
export function preserveLegacyFieldSourceOnHydration(source: FormFieldSource): FormFieldSource {
    if (formFieldSourceHasRelationshipLineage(source)) return source;
    return { ...source };
}
