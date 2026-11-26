/**
 * Forms relationship leaf write semantics — explicit read-only vs writable targets.
 *
 * P2: no end-to-end deterministic CRM write path exists for relationship leaves.
 * Editable controls store submission payload values only; classify as read-only prefill.
 */

import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import type { FormFieldSourceRelationship } from "@/lib/forms/schema";
import { findFormsDocumentsDataProvider } from "@/lib/fields/canonicalDataProviderRegistry";
import { isFormsRelationshipAuthorableInP2 } from "@/lib/fields/formsRelationshipOperationalSupport";

export type FormsRelationshipWriteMode = "writable" | "read_only_prefill" | "unsupported_input";

export function formsRelationshipWriteModeForProvider(provider: CanonicalDataProvider): FormsRelationshipWriteMode {
    if (provider.kind !== "relationship") return "unsupported_input";
    if (!isFormsRelationshipAuthorableInP2(provider)) return "unsupported_input";
    return "read_only_prefill";
}

export function formsRelationshipWriteModeForFieldSource(
    relationship: FormFieldSourceRelationship | undefined,
): FormsRelationshipWriteMode {
    const ref = relationship?.provider_ref_key?.trim();
    if (!ref) return "unsupported_input";
    const provider = findFormsDocumentsDataProvider(ref);
    if (!provider) return "unsupported_input";
    return formsRelationshipWriteModeForProvider(provider);
}

/** P2: relationship leaves are never writable to a deterministic CRM target at publish time. */
export function relationshipBindingRequiresWritableResolver(_relationship: FormFieldSourceRelationship | undefined): boolean {
    return false;
}

/** Publish validation — editable relationship fields must be explicitly read-only in P2. */
export function relationshipBindingMustBeReadOnlyAtPublish(
    relationship: FormFieldSourceRelationship | undefined,
    fieldReadOnly: boolean | undefined,
): boolean {
    const mode = formsRelationshipWriteModeForFieldSource(relationship);
    if (mode === "read_only_prefill") return fieldReadOnly === true;
    return true;
}
