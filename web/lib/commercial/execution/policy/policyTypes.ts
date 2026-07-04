/**
 * Commercial Execution — Commercial policy type registry (lifted, Commercial-owned).
 *
 * Reuses the proven shape of the legacy financial_policies registry (typed value
 * fields, pure validation) but declares the RESOLUTION-TIME Commercial policy
 * types only. Payment-time policies (late_fee, nsf_fee, grace_period,
 * posting_review, refund, billing_cadence) stay in the Billing / Money domain and
 * are NOT here.
 *
 * Pure, code-owned, Substrate-A-free (deliberately not importing the financial
 * policy lib, which is retired with Substrate A).
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §7.
 */

/** Resolution-time Commercial policy types. */
export const COMMERCIAL_POLICY_TYPES = [
    "proration",
    "discount",
    "sibling_discount",
    "waiver",
    "eligibility",
    "approval",
] as const;
export type CommercialPolicyType = (typeof COMMERCIAL_POLICY_TYPES)[number];

export function isCommercialPolicyType(v: unknown): v is CommercialPolicyType {
    return typeof v === "string" && (COMMERCIAL_POLICY_TYPES as readonly string[]).includes(v);
}

/** Which resolved lines a policy targets. */
export const POLICY_APPLIES_TO = ["tuition", "fees", "all"] as const;
export type PolicyAppliesTo = (typeof POLICY_APPLIES_TO)[number];

/** How a discount amount is expressed. */
export const DISCOUNT_BASES = ["percentage", "amount"] as const;
export type DiscountBasis = (typeof DISCOUNT_BASES)[number];

// ── Typed value accessors (validated at authoring; read defensively here) ────

export type DiscountValue = { basis: DiscountBasis; value: number; applies_to: PolicyAppliesTo };
export type SiblingDiscountValue = DiscountValue & { min_siblings: number; applies_to_rank: "subsequent" | "all" };
export type WaiverValue = { applies_to: PolicyAppliesTo };
export type ProrationValue = { method: "none" | "daily" | "calendar_day" | "business_day" };
export type ApprovalValue = { required: boolean };

export function readAppliesTo(value: Record<string, unknown>): PolicyAppliesTo {
    const v = value.applies_to;
    return (POLICY_APPLIES_TO as readonly string[]).includes(v as string) ? (v as PolicyAppliesTo) : "all";
}

export function readDiscount(value: Record<string, unknown>): DiscountValue | null {
    const basis = value.basis;
    const num = typeof value.value === "number" ? value.value : Number(value.value);
    if (!(DISCOUNT_BASES as readonly string[]).includes(basis as string)) return null;
    if (!Number.isFinite(num) || num < 0) return null;
    return { basis: basis as DiscountBasis, value: num, applies_to: readAppliesTo(value) };
}

export function readSiblingDiscount(value: Record<string, unknown>): SiblingDiscountValue | null {
    const base = readDiscount(value);
    if (!base) return null;
    const min = typeof value.min_siblings === "number" ? value.min_siblings : Number(value.min_siblings ?? 2);
    const rank = value.applies_to_rank === "all" ? "all" : "subsequent";
    return { ...base, min_siblings: Number.isFinite(min) && min >= 1 ? min : 2, applies_to_rank: rank };
}

/** Does a policy's applies_to include a given line kind? */
export function appliesToKind(appliesTo: PolicyAppliesTo, kind: string): boolean {
    if (appliesTo === "all") return true;
    if (appliesTo === "tuition") return kind === "tuition";
    if (appliesTo === "fees") return kind === "fee" || kind === "addon" || kind === "deposit";
    return false;
}
