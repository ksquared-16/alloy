/**
 * P2 operational support matrix — declared providers vs runtime-ready authoring.
 *
 * A relationship leaf must not appear in the production picker unless every required
 * capability is implemented (prefill path, ambiguity policy, publish validation).
 */

import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import type { FormsRelationshipRoleKey } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import { formsRelationshipRoleFromProvider } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";

export type FormsRelationshipOperationalClass =
    | "authorable_prefill_readonly"
    | "legacy_load_only"
    | "declared_unavailable"
    | "deferred";

/** Roles with a verified prefill adapter in P2 (primary → customers.primary_contact_id). */
export const FORMS_P2_OPERATIONAL_RELATIONSHIP_ROLES = new Set<FormsRelationshipRoleKey>(["primary"]);

const SUPPORTED_LEAVES = new Set(["name", "email", "phone"]);

export function formsRelationshipOperationalClass(
    provider: CanonicalDataProvider,
): FormsRelationshipOperationalClass {
    if (provider.kind !== "relationship") return "declared_unavailable";
    const role = formsRelationshipRoleFromProvider(provider);
    if (!role || !SUPPORTED_LEAVES.has(provider.relationship?.leaf_key ?? "")) return "declared_unavailable";
    if (FORMS_P2_OPERATIONAL_RELATIONSHIP_ROLES.has(role)) return "authorable_prefill_readonly";
    return "deferred";
}

export function isFormsRelationshipAuthorableInP2(provider: CanonicalDataProvider): boolean {
    return formsRelationshipOperationalClass(provider) === "authorable_prefill_readonly";
}

export function isFormsRelationshipPublishableInP2(provider: CanonicalDataProvider): boolean {
    return isFormsRelationshipAuthorableInP2(provider);
}

/** Collection-bound repeatable sections: schema + validation only until UI follow-up. */
export const FORMS_COLLECTION_BINDING_AUTHORING_ENABLED = false;
