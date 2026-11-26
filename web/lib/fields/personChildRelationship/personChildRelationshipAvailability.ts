/**
 * Context-aware availability for relationship-owned vs Person-owned fields.
 */

import {
    isPersonChildRelationshipConfigFieldKey,
    isPersonChildRelationshipNativeColumnKey,
    personChildRelationshipProviderRef,
} from "./personChildRelationshipFieldRegistry";
import type { PersonChildRelationshipContext } from "./personChildRelationshipEntity";

export type RelationshipFieldAvailabilityContext =
    | { kind: "person_profile" }
    | { kind: "relationship_instance"; relationship: PersonChildRelationshipContext; requiredOperationalRole?: string | null };

const PERSON_OWNED_REFS = new Set(["person.display_name", "person.email", "person.phone", "person.preferred_language"]);

export function isPersonOwnedProviderRef(providerRef: string): boolean {
    const ref = providerRef.trim().toLowerCase();
    if (PERSON_OWNED_REFS.has(ref)) return true;
    return ref.startsWith("person.") && !ref.startsWith("person.contact_role.") && !ref.startsWith("person_child_relationship.");
}

export function isRelationshipOwnedProviderRef(providerRef: string): boolean {
    return providerRef.trim().toLowerCase().startsWith("person_child_relationship.");
}

export function relationshipFieldAvailableInContext(
    providerRef: string,
    context: RelationshipFieldAvailabilityContext,
): boolean {
    const ref = providerRef.trim();
    if (isPersonOwnedProviderRef(ref)) {
        return true;
    }
    if (!isRelationshipOwnedProviderRef(ref)) {
        return false;
    }
    if (context.kind === "person_profile") {
        return false;
    }
    const fieldKey = ref.slice("person_child_relationship.".length);
    if (!isPersonChildRelationshipNativeColumnKey(fieldKey) && !isPersonChildRelationshipConfigFieldKey(fieldKey)) {
        return false;
    }
    const requiredRole = context.requiredOperationalRole?.trim().toLowerCase() || null;
    if (!requiredRole) return true;
    return context.relationship.operational_roles.map((r) => r.toLowerCase()).includes(requiredRole);
}

export function listRelationshipProviderRefsForContext(
    context: RelationshipFieldAvailabilityContext,
): string[] {
    const native = ["relationship_type", "priority", "status"];
    const config = ["authorized_pickup", "legal_guardian", "lives_with_child", "financial_responsibility", "custody_notes", "pickup_instructions"];
    const keys = [...native, ...config];
    return keys
        .map((k) => personChildRelationshipProviderRef(k))
        .filter((ref) => relationshipFieldAvailableInContext(ref, context));
}
