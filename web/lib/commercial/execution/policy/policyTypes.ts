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

// ── Form-driving registry ────────────────────────────────────────────────────
// The operator Policies UI is GENERATED from this registry (no hand-coded forms).
// Each type declares its typed value fields; the UI renders a control per field
// and validateCommercialPolicyValue normalizes + validates the submitted value.

export type PolicyFieldControl = "select" | "number" | "money" | "percent" | "yesno";

export type PolicyField = {
    key: string;
    label: string;
    control: PolicyFieldControl;
    options?: { value: string; label: string }[];
    suffix?: string;
    help?: string;
    /** Only render this field when another field has one of these values (e.g. discount value ⇐ basis). */
    showWhen?: { field: string; in: string[] };
};

/** Operator-facing policy categories — types are specialized rules within a category. */
export const COMMERCIAL_POLICY_CATEGORIES = [
    "pricing",
    "billing",
    "eligibility",
    "workflow",
    "exception",
] as const;
export type CommercialPolicyCategory = (typeof COMMERCIAL_POLICY_CATEGORIES)[number];

export const COMMERCIAL_POLICY_CATEGORY_LABELS: Record<CommercialPolicyCategory, string> = {
    pricing: "Pricing",
    billing: "Billing",
    eligibility: "Eligibility",
    workflow: "Workflow",
    exception: "Exception",
};

export const COMMERCIAL_POLICY_CATEGORY_HELP: Record<CommercialPolicyCategory, string> = {
    pricing: "How list prices are reduced or adjusted.",
    billing: "How charges are calculated across a billing period.",
    eligibility: "Who a price or product applies to.",
    workflow: "Human review gates before charges finalize.",
    exception: "One-off overrides such as waivers.",
};

export type CommercialPolicyTypeDef = {
    key: CommercialPolicyType;
    label: string;
    description: string;
    /** A plain-language example for the operator (no jargon, no IDs). */
    example: string;
    category: CommercialPolicyCategory;
    fields: PolicyField[];
};

export function commercialPolicyCategory(type: CommercialPolicyType): CommercialPolicyCategory {
    return COMMERCIAL_POLICY_REGISTRY[type].category;
}

/** Policy types grouped by category for authoring UIs. */
export function commercialPolicyTypesByCategory(): Array<{
    category: CommercialPolicyCategory;
    label: string;
    help: string;
    types: CommercialPolicyType[];
}> {
    return COMMERCIAL_POLICY_CATEGORIES.map((category) => ({
        category,
        label: COMMERCIAL_POLICY_CATEGORY_LABELS[category],
        help: COMMERCIAL_POLICY_CATEGORY_HELP[category],
        types: COMMERCIAL_POLICY_TYPES.filter((t) => COMMERCIAL_POLICY_REGISTRY[t].category === category),
    })).filter((group) => group.types.length > 0);
}

const APPLIES_TO_OPTIONS = [
    { value: "tuition", label: "Tuition only" },
    { value: "fees", label: "Fees & add-ons" },
    { value: "all", label: "Everything" },
];
const DISCOUNT_BASIS_OPTIONS = [
    { value: "percentage", label: "Percentage off" },
    { value: "amount", label: "Fixed amount off" },
];

export const COMMERCIAL_POLICY_REGISTRY: Record<CommercialPolicyType, CommercialPolicyTypeDef> = {
    discount: {
        key: "discount",
        label: "Discount",
        description: "Reduce the price of tuition, fees, or everything by a percentage or a fixed amount.",
        example: "10% off tuition for staff families.",
        category: "pricing",
        fields: [
            { key: "basis", label: "Discount type", control: "select", options: DISCOUNT_BASIS_OPTIONS },
            { key: "value", label: "Percentage", control: "percent", suffix: "%", showWhen: { field: "basis", in: ["percentage"] } },
            { key: "value", label: "Amount", control: "money", showWhen: { field: "basis", in: ["amount"] } },
            { key: "applies_to", label: "Applies to", control: "select", options: APPLIES_TO_OPTIONS },
        ],
    },
    sibling_discount: {
        key: "sibling_discount",
        label: "Sibling discount",
        description: "Reduce tuition for additional children in the same household.",
        example: "15% off the second and later children's tuition.",
        category: "pricing",
        fields: [
            { key: "basis", label: "Discount type", control: "select", options: DISCOUNT_BASIS_OPTIONS },
            { key: "value", label: "Percentage", control: "percent", suffix: "%", showWhen: { field: "basis", in: ["percentage"] } },
            { key: "value", label: "Amount", control: "money", showWhen: { field: "basis", in: ["amount"] } },
            { key: "min_siblings", label: "Applies from child #", control: "number", suffix: "children", help: "The minimum number of enrolled children before the discount applies." },
            { key: "applies_to_rank", label: "Applies to", control: "select", options: [{ value: "subsequent", label: "Second child onward" }, { value: "all", label: "All children" }] },
        ],
    },
    waiver: {
        key: "waiver",
        label: "Waiver",
        description: "Waive a charge entirely (reduces the amount to $0).",
        example: "Waive registration fees during a promotion.",
        category: "exception",
        fields: [{ key: "applies_to", label: "Waive", control: "select", options: APPLIES_TO_OPTIONS }],
    },
    proration: {
        key: "proration",
        label: "Proration",
        description: "How a partial-period charge is calculated when a child joins or leaves mid-period.",
        example: "Charge by the day when a child starts mid-month.",
        category: "billing",
        fields: [
            { key: "method", label: "Method", control: "select", options: [
                { value: "none", label: "No proration (full period)" },
                { value: "daily", label: "By calendar day" },
                { value: "calendar_day", label: "By calendar day (month length)" },
                { value: "business_day", label: "By business day" },
            ] },
        ],
    },
    eligibility: {
        key: "eligibility",
        label: "Eligibility",
        description: "Restrict who a price or product applies to. Recorded for review; enforced with attendance/enrollment data.",
        example: "Restrict a subsidized rate to eligible families.",
        category: "eligibility",
        fields: [],
    },
    approval: {
        key: "approval",
        label: "Approval required",
        description: "Flag matching charges so they must be reviewed before they can be finalized.",
        example: "Require review for any waived tuition.",
        category: "workflow",
        fields: [{ key: "required", label: "Require review", control: "yesno" }],
    },
};

export type PolicyValueError = { field?: string; message: string };

/** Validate + normalize a raw value against a policy type's field schema (pure). */
export function validateCommercialPolicyValue(
    type: CommercialPolicyType,
    raw: Record<string, unknown>,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: PolicyValueError } {
    const def = COMMERCIAL_POLICY_REGISTRY[type];
    const out: Record<string, unknown> = {};
    const isVisible = (f: PolicyField) => !f.showWhen || f.showWhen.in.includes(String(raw[f.showWhen.field] ?? ""));
    for (const f of def.fields) {
        if (!isVisible(f)) continue;
        const v = raw[f.key];
        if (f.control === "select") {
            const opt = (f.options ?? []).find((o) => o.value === v);
            if (!opt) return { ok: false, error: { field: f.key, message: `${f.label} is required` } };
            out[f.key] = opt.value;
        } else if (f.control === "yesno") {
            out[f.key] = v === true || v === "true" || v === "yes";
        } else {
            // number | money | percent — non-negative integer (money/percent already in cents/percent)
            const n = typeof v === "number" ? v : Number(v);
            if (v == null || v === "" || !Number.isFinite(n) || n < 0) {
                return { ok: false, error: { field: f.key, message: `${f.label} must be a non-negative number` } };
            }
            if (f.control === "percent" && n > 100) return { ok: false, error: { field: f.key, message: `${f.label} cannot exceed 100%` } };
            out[f.key] = f.control === "number" || f.control === "percent" ? Math.round(n) : Math.round(n);
        }
    }
    return { ok: true, value: out };
}

/** One-line human summary of a policy's value (display; no IDs, no jargon). */
export function commercialPolicyValueSummary(type: CommercialPolicyType, value: Record<string, unknown>): string {
    switch (type) {
        case "discount":
        case "sibling_discount": {
            const basis = String(value.basis ?? "");
            const amt = basis === "percentage" ? `${Number(value.value ?? 0)}%` : `$${((Number(value.value ?? 0)) / 100).toFixed(2)}`;
            const to = APPLIES_TO_OPTIONS.find((o) => o.value === value.applies_to)?.label ?? "everything";
            const sib = type === "sibling_discount" ? ` (from child #${Number(value.min_siblings ?? 2)})` : "";
            return `${amt} off ${to.toLowerCase()}${sib}`;
        }
        case "waiver":
            return `Waive ${(APPLIES_TO_OPTIONS.find((o) => o.value === value.applies_to)?.label ?? "everything").toLowerCase()}`;
        case "proration":
            return `Proration: ${String(value.method ?? "none").replace(/_/g, " ")}`;
        case "approval":
            return value.required ? "Review required" : "No review required";
        case "eligibility":
            return "Eligibility restriction";
        default:
            return "";
    }
}
