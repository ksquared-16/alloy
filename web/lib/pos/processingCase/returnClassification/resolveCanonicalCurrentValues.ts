/**
 * What the owning record holds right now, for the fields a return touches.
 *
 * Operator review has to answer "is this actually a change?" before the operator decides, which
 * means reading canonical truth at REVIEW time. This reads it through exactly the primitives the
 * commit executor uses — `customerMemberNativeSnapshotSelectColumns` and
 * `nativeProfileValuesFromRecord` — so the value an operator is shown and the value the executor
 * compares against are read the same way. A second, more convenient reader here would be a second
 * definition of canonical truth.
 *
 * ## Scope, stated rather than assumed
 *
 * Child and customer_member bindings resolve to one `customer_members` row, which is what an
 * enrolment packet's scalar answers overwhelmingly are. Anything else — person-owned facts,
 * relationship-owned facts — is NOT resolved here and comes back unresolved, which the classifier
 * turns into a refusal rather than a guess. Relationship-owned values have their own owner and
 * their own executor; flattening them onto the child row is the exact mistake this thread is
 * guarding against.
 *
 * Read only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { providerRefToCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";
import {
    customerMemberNativeSnapshotSelectColumns,
    nativeProfileValuesFromRecord,
} from "@/lib/fields/mutation/resolveMutationCapability";

/** Canonical truth for one subject, as review reads it. */
export type CanonicalCurrentValues = {
    /** The customer_member this was read for, or null when there was none to read. */
    readonly customerMemberId: string | null;
    /** Native profile values, keyed by canonical field key. */
    readonly profile: Record<string, unknown>;
};

export const EMPTY_CANONICAL_CURRENT_VALUES: CanonicalCurrentValues = {
    customerMemberId: null,
    profile: {},
};

/**
 * Read one child's canonical values.
 *
 * @returns the snapshot, or an empty one when the id is absent or unreadable — never throws for a
 *          missing record, because a review screen must still render what it does know.
 */
export async function loadCanonicalCurrentValues(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string | null | undefined,
): Promise<CanonicalCurrentValues> {
    const id = String(customerMemberId ?? "").trim();
    if (!id) return EMPTY_CANONICAL_CURRENT_VALUES;
    const { data, error } = await supabase
        .from("customer_members")
        .select(customerMemberNativeSnapshotSelectColumns())
        .eq("org_id", orgId)
        .eq("id", id)
        .maybeSingle();
    if (error || !data) return EMPTY_CANONICAL_CURRENT_VALUES;
    return {
        customerMemberId: id,
        profile: nativeProfileValuesFromRecord(data as unknown as Record<string, unknown>),
    };
}

/**
 * The current value behind an authored binding.
 *
 * @param providerRef the authored `entity_type.field_key`, e.g. `child.child_last_name`
 * @returns `{resolved:false}` when this binding is not owned by the child record — the caller must
 *          treat that as unresolved, not as empty
 */
export function currentValueForBinding(
    values: CanonicalCurrentValues,
    providerRef: string,
): { resolved: true; value: unknown } | { resolved: false } {
    const canonical = providerRefToCanonicalRef(providerRef);
    if (!canonical || canonical.entity_type !== "customer_member") return { resolved: false };
    if (!values.customerMemberId) return { resolved: false };
    return { resolved: true, value: values.profile[canonical.field_key] ?? null };
}
