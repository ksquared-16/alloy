/**
 * P2 operational support matrix — declared providers vs runtime-ready authoring.
 *
 * A relationship leaf must not appear in the production picker unless every required
 * capability is implemented (prefill path, ambiguity policy, publish validation).
 */

import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import type { FormsRelationshipRoleKey } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import { formsRelationshipRoleFromProvider } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import { RELATIONSHIP_ROLE_SEMANTICS } from "@/lib/fields/relationship/relationshipSemanticShape";
import { collectableRelationshipDefinitions } from "@/lib/fields/relationship/relationshipDefinitions";

export type FormsRelationshipOperationalClass =
    | "authorable_prefill_readonly"
    | "legacy_load_only"
    | "declared_unavailable"
    | "deferred";

/** Roles with canonical resolver registration (P3A read layer). */
export const FORMS_P3A_RESOLVER_REGISTERED_ROLES = new Set<FormsRelationshipRoleKey>([
    "primary",
    "secondary",
    "parents",
    "billing",
    "emergency",
]);

export const FORMS_P2_OPERATIONAL_RELATIONSHIP_ROLES = new Set<FormsRelationshipRoleKey>(["primary"]);

const SUPPORTED_LEAVES = new Set(["name", "email", "phone"]);

export function formsRelationshipOperationalClass(
    provider: CanonicalDataProvider,
): FormsRelationshipOperationalClass {
    if (provider.kind !== "relationship") return "declared_unavailable";
    const role = formsRelationshipRoleFromProvider(provider);
    if (!role || !SUPPORTED_LEAVES.has(provider.relationship?.leaf_key ?? "")) return "declared_unavailable";
    if (RELATIONSHIP_ROLE_SEMANTICS[role]?.pickerEnabledInP3A) return "authorable_prefill_readonly";
    return "deferred";
}

export function isFormsRelationshipAuthorableInP2(provider: CanonicalDataProvider): boolean {
    return formsRelationshipOperationalClass(provider) === "authorable_prefill_readonly";
}


export function isFormsRelationshipResolverRegistered(role: FormsRelationshipRoleKey): boolean {
    return FORMS_P3A_RESOLVER_REGISTERED_ROLES.has(role);
}

export function isFormsRelationshipPublishableInP2(provider: CanonicalDataProvider): boolean {
    return isFormsRelationshipAuthorableInP2(provider);
}

/**
 * Per-provider collection authoring enablement (P4).
 *
 * DERIVED, not an allowlist: the native `children` collection plus every collectable relationship
 * definition. This set gates BOTH Forms authoring and Processing submission acceptance
 * (`adaptFormSubmissionToRelatedRecordProposals`), so a hand-maintained list here silently makes a
 * registered collection unauthorable and its submissions unsupported. It previously held only
 * `children` + `person.contact_role.parents`, stranding emergency contacts and authorized pickups.
 *
 * @see docs/platform/core/data/relationship-model.md — Forms is a consumer, never an owner.
 */
export const FORMS_COLLECTION_BINDING_AUTHORING_ENABLED_REFS = new Set<string>([
    "children",
    ...collectableRelationshipDefinitions().map((d) => d.provider_ref),
]);

/** @deprecated Prefer collectionBindingAuthoringEnabledForProvider(refKey). */
export const FORMS_COLLECTION_BINDING_AUTHORING_ENABLED =
    FORMS_COLLECTION_BINDING_AUTHORING_ENABLED_REFS.size > 0;

export function collectionBindingAuthoringEnabledForProvider(refKey: string): boolean {
    return FORMS_COLLECTION_BINDING_AUTHORING_ENABLED_REFS.has(refKey.trim());
}

export function isFormsCollectionProviderAuthorable(refKey: string): boolean {
    return collectionBindingAuthoringEnabledForProvider(refKey);
}
