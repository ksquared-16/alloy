/**
 * Who may be offered in job/schedule “assign vendor” UIs.
 * Eligibility: `vendors.status_key` equals this key (configure in status_definitions, entity_type=vendors).
 */
export const VENDOR_ASSIGNMENT_VENDOR_STATUS_KEY = "approved" as const;

export type VendorAssignmentPolicy = {
    vendorStatusKey: string;
};

export const DEFAULT_VENDOR_ASSIGNMENT_POLICY: VendorAssignmentPolicy = {
    vendorStatusKey: VENDOR_ASSIGNMENT_VENDOR_STATUS_KEY,
};

/** Optional: restrict query to assignment-eligible vendors for this org. */
export function applyVendorAssignmentFilter<T extends { eq: (a: string, b: string) => T }>(
    q: T,
    policy: VendorAssignmentPolicy = DEFAULT_VENDOR_ASSIGNMENT_POLICY
): T {
    return q.eq("status_key", policy.vendorStatusKey);
}

export type VendorEligibilityRow = { id: string; status_key?: string | null };

export function vendorIsEligibleForAssignment(
    vendor: VendorEligibilityRow | null | undefined,
    policy: VendorAssignmentPolicy = DEFAULT_VENDOR_ASSIGNMENT_POLICY
): boolean {
    const sk = String(vendor?.status_key ?? "").trim().toLowerCase();
    return sk === policy.vendorStatusKey.trim().toLowerCase();
}

/** @internal for routes that still receive a loose Supabase client */
export function getAssignmentPolicy(): VendorAssignmentPolicy {
    return DEFAULT_VENDOR_ASSIGNMENT_POLICY;
}
