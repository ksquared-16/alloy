/**
 * Relationship binding transport — legacy-compatible entity_type/field_key derived from
 * manifest leaf refKeys. Canonical relationship identity lives in field_source.relationship.
 *
 * Important: manifest refs like person.primary_email must NOT pass through layout refKey
 * normalization (which aliases primary_email → email). Relationship transport preserves
 * the manifest field grain.
 */

import type { FormFieldSource } from "@/lib/forms/schema";
import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import {
    formsEntityTypeFromFieldDefinitionEntity,
    formsFieldKeyForCanonicalRef,
    type CanonicalRegistryRef,
} from "@/lib/fields/fieldRegistryReferenceMatrix";
import { contactRoleFieldRefs, type LayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";
import type { FormsRelationshipRoleKey } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";

const LAYOUT_ENTITY_TO_DEFINITION: Record<string, string> = {
    person: "person",
    child: "inquiry_child",
    inquiry_child: "inquiry_child",
    customer: "customer",
    opportunity: "opportunity",
};

const LEAF_TO_MANIFEST_KEY: Record<string, keyof ReturnType<typeof contactRoleFieldRefs>> = {
    name: "name",
    email: "email",
    phone: "phone",
};

/** Manifest layout refKey for a role leaf (platform catalog grain). */
export function manifestRefKeyForRelationshipRoleLeaf(
    role: FormsRelationshipRoleKey,
    leafKey: string,
): string | null {
    const layoutRole = role as LayoutEditorContactRole;
    const refs = contactRoleFieldRefs(layoutRole);
    const manifestKey = LEAF_TO_MANIFEST_KEY[leafKey.trim().toLowerCase()];
    if (!manifestKey) return null;
    return refs[manifestKey] ?? null;
}

function canonicalRefFromManifestRefKey(manifestRefKey: string): CanonicalRegistryRef | null {
    const trimmed = manifestRefKey.trim();
    const dot = trimmed.indexOf(".");
    if (dot < 0) return null;
    const entityKey = trimmed.slice(0, dot);
    const fieldKey = trimmed.slice(dot + 1);
    const entityType = LAYOUT_ENTITY_TO_DEFINITION[entityKey] ?? entityKey;
    return { entity_type: entityType, field_key: fieldKey };
}

/** Legacy-compatible transport entity_type + field_key from manifest leaf refKey (un-normalized). */
export function transportFieldSourceFromManifestRef(manifestRefKey: string): Pick<FormFieldSource, "entity_type" | "field_key"> | null {
    const canonicalRef = canonicalRefFromManifestRefKey(manifestRefKey);
    if (!canonicalRef) return null;
    return {
        entity_type: formsEntityTypeFromFieldDefinitionEntity(canonicalRef.entity_type),
        field_key: formsFieldKeyForCanonicalRef(canonicalRef),
    };
}

export function transportFieldSourceForRelationshipProvider(
    provider: CanonicalDataProvider,
    role: FormsRelationshipRoleKey,
): Pick<FormFieldSource, "entity_type" | "field_key"> {
    const leafKey = provider.relationship?.leaf_key ?? "value";
    const manifestRef = manifestRefKeyForRelationshipRoleLeaf(role, leafKey);
    if (manifestRef) {
        const transport = transportFieldSourceFromManifestRef(manifestRef);
        if (transport) return transport;
    }
    const dot = provider.refKey.indexOf(".");
    const fieldPart = dot >= 0 ? provider.refKey.slice(dot + 1) : provider.refKey;
    return {
        entity_type: "guardian",
        field_key: fieldPart.replace(/\./g, "_"),
    };
}
