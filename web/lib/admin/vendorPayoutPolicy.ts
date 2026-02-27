/**
 * Vendor payout policy: flat or tiered, from org_settings or vendor metadata.
 * No schema changes; uses org_settings.metadata.vendor_payout_policy and vendors.metadata.vendor_payout_policy.
 */

export type PayoutTier = {
    from: number;
    to: number | null;
    value: number;
};

/** Basis for tiered payout: job-level completed count vs vendor-attributed count. */
export type PayoutBasis = "job_completed_occurrences" | "vendor_job_completed_occurrences";

export type VendorPayoutPolicy = {
    mode: "flat" | "tiered";
    type: "percentage";
    basis?: PayoutBasis | string;
    completed_status_key?: string;
    tiers?: PayoutTier[];
    value?: number;
};

export type OrgSettingsRow = {
    org_id?: string;
    payout_type?: string | null;
    payout_value?: number | null;
    metadata?: { vendor_payout_policy?: VendorPayoutPolicy } | null;
};

export type VendorRow = {
    payout_override_type?: string | null;
    payout_override_value?: number | null;
    metadata?: { vendor_payout_policy?: VendorPayoutPolicy } | null;
};

export type ResolvedPolicyResult = {
    policy: VendorPayoutPolicy;
    source: "vendor" | "org" | "legacy";
};

function isPolicyValid(p: unknown): p is VendorPayoutPolicy {
    if (!p || typeof p !== "object") return false;
    const o = p as Record<string, unknown>;
    if (o.mode !== "flat" && o.mode !== "tiered") return false;
    if (o.mode === "flat" && typeof o.value !== "number") return false;
    if (o.mode === "tiered" && !Array.isArray(o.tiers)) return false;
    return true;
}

function legacyToPolicy(
    payoutType: string | null | undefined,
    payoutValue: number | null | undefined
): VendorPayoutPolicy {
    const num = typeof payoutValue === "number" && !Number.isNaN(payoutValue) ? Math.max(0, Math.min(100, payoutValue)) : 80;
    return {
        mode: "flat",
        type: "percentage",
        value: num,
    };
}

/**
 * Resolve effective vendor payout policy.
 * Precedence: vendor.metadata.vendor_payout_policy > org_settings.metadata.vendor_payout_policy
 * > vendor payout_override_type/value (legacy) > org_settings payout_type/payout_value (legacy).
 */
export function resolveVendorPayoutPolicy(params: {
    orgSettings: OrgSettingsRow | null;
    vendor: VendorRow | null;
}): ResolvedPolicyResult {
    const { orgSettings, vendor } = params;
    const orgMeta = orgSettings?.metadata as { vendor_payout_policy?: VendorPayoutPolicy } | undefined;
    const vendorMeta = vendor?.metadata as { vendor_payout_policy?: VendorPayoutPolicy } | undefined;

    if (vendorMeta?.vendor_payout_policy && isPolicyValid(vendorMeta.vendor_payout_policy)) {
        return { policy: vendorMeta.vendor_payout_policy, source: "vendor" };
    }
    if (orgMeta?.vendor_payout_policy && isPolicyValid(orgMeta.vendor_payout_policy)) {
        return { policy: orgMeta.vendor_payout_policy, source: "org" };
    }
    if (
        vendor?.payout_override_type != null ||
        (typeof vendor?.payout_override_value === "number" && !Number.isNaN(vendor.payout_override_value))
    ) {
        return {
            policy: legacyToPolicy(vendor.payout_override_type ?? undefined, vendor.payout_override_value ?? undefined),
            source: "legacy",
        };
    }
    return {
        policy: legacyToPolicy(orgSettings?.payout_type, orgSettings?.payout_value),
        source: "legacy",
    };
}

/**
 * Compute payout percent (0–100) from policy and completed occurrence count.
 * For flat mode returns policy.value; for tiered finds tier where count is in [from, to] (to null = infinity).
 */
export function computePayoutPercent(params: {
    policy: VendorPayoutPolicy;
    completedOccurrences: number;
}): number {
    const { policy, completedOccurrences } = params;
    if (policy.mode === "flat" && typeof policy.value === "number") {
        return Math.max(0, Math.min(100, policy.value));
    }
    if (policy.mode === "tiered" && Array.isArray(policy.tiers) && policy.tiers.length > 0) {
        const count = Math.max(0, Math.floor(completedOccurrences));
        const tier = policy.tiers
            .slice()
            .sort((a, b) => a.from - b.from)
            .find((t) => {
                const to = t.to == null ? Infinity : t.to;
                return count >= t.from && count <= to;
            });
        if (tier && typeof tier.value === "number") {
            return Math.max(0, Math.min(100, tier.value));
        }
        const last = policy.tiers[policy.tiers.length - 1];
        if (last && typeof last.value === "number") return Math.max(0, Math.min(100, last.value));
    }
    return 80;
}
