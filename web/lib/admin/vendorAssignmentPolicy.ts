import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who may be offered in job/schedule “assign vendor” UIs.
 * Tune per org/user later by threading a policy object from context.
 */
export const VENDOR_ASSIGNMENT_VENDOR_STATUS_KEY = "approved" as const;

export type VendorAssignmentPolicy = {
    /** Must match `vendor_statuses.key` for the vendor row's `vendor_status_id`. */
    vendorStatusKey: string;
};

export const DEFAULT_VENDOR_ASSIGNMENT_POLICY: VendorAssignmentPolicy = {
    vendorStatusKey: VENDOR_ASSIGNMENT_VENDOR_STATUS_KEY,
};

/** Resolves `vendor_status_id` for vendors eligible for assignment, or null if that status is missing/inactive. */
export async function resolveVendorAssignmentStatusId(
    supabase: SupabaseClient,
    policy: VendorAssignmentPolicy = DEFAULT_VENDOR_ASSIGNMENT_POLICY
): Promise<string | null> {
    const { data } = await supabase
        .from("vendor_statuses")
        .select("id")
        .eq("key", policy.vendorStatusKey)
        .eq("is_active", true)
        .maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
}
