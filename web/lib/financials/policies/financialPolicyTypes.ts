/**
 * Financial Policy type registry + value validation (Commercial Model, Slice C).
 *
 * Pure, code-owned. Each policy type declares its typed value fields; the
 * authoring service validates a policy's `value` jsonb against this registry, and
 * the UI renders typed controls from it (no raw JSON as primary UX). Generic
 * platform shape. Configuration only — policies post no money.
 *
 * Doctrine: docs/platform/modules/financial-platform-domain.md (determination #6).
 */

import type { ConfigRuleEffectiveColumns } from "@/lib/childcareOperational/config/configRuleTypes";

export const FINANCIAL_POLICY_SCOPE_TYPES = ["org", "location", "service", "rate_plan"] as const;
export type FinancialPolicyScopeType = (typeof FINANCIAL_POLICY_SCOPE_TYPES)[number];

export const POLICY_SCOPE_LABEL: Record<FinancialPolicyScopeType, string> = {
    org: "Org default",
    location: "Location",
    service: "Service",
    rate_plan: "Rate Plan",
};

/** A typed value field for a policy type. `control` drives the UI input. */
export type PolicyValueField = {
    key: string;
    label: string;
    control: "select" | "number" | "money" | "yesno";
    options?: { value: string; label: string }[];
    /** Suffix shown in display (e.g. "days"). */
    suffix?: string;
};

export type PolicyTypeDef = {
    key: FinancialPolicyType;
    label: string;
    description: string;
    fields: PolicyValueField[];
};

export const FINANCIAL_POLICY_TYPES = [
    "proration",
    "billing_cadence",
    "grace_period",
    "late_fee",
    "nsf_fee",
    "deposit",
    "refund",
    "posting_review",
] as const;
export type FinancialPolicyType = (typeof FINANCIAL_POLICY_TYPES)[number];

const PRORATION_METHODS = [
    { value: "none", label: "No proration" },
    { value: "daily", label: "Daily" },
    { value: "calendar_day", label: "Calendar day" },
    { value: "business_day", label: "Business day" },
];
const CADENCES = [
    { value: "monthly", label: "Monthly" },
    { value: "semi_monthly", label: "Semi-monthly" },
    { value: "biweekly", label: "Biweekly" },
    { value: "weekly", label: "Weekly" },
    { value: "term", label: "Term" },
];

/** The registry: one definition per policy type, with its typed value fields. */
export const POLICY_TYPE_REGISTRY: Record<FinancialPolicyType, PolicyTypeDef> = {
    proration: {
        key: "proration",
        label: "Proration",
        description: "How a partial-period charge is prorated when a child joins or leaves mid-period.",
        fields: [{ key: "method", label: "Method", control: "select", options: PRORATION_METHODS }],
    },
    billing_cadence: {
        key: "billing_cadence",
        label: "Billing cadence",
        description: "How often charges are billed.",
        fields: [{ key: "cadence", label: "Cadence", control: "select", options: CADENCES }],
    },
    grace_period: {
        key: "grace_period",
        label: "Grace period",
        description: "Days after the due date before a charge is considered late.",
        fields: [{ key: "days", label: "Grace days", control: "number", suffix: "days" }],
    },
    late_fee: {
        key: "late_fee",
        label: "Late fee",
        description: "Fee applied when payment is late, after an optional delay.",
        fields: [
            { key: "amount_cents", label: "Fee amount", control: "money" },
            { key: "after_days", label: "Apply after", control: "number", suffix: "days" },
        ],
    },
    nsf_fee: {
        key: "nsf_fee",
        label: "NSF fee",
        description: "Fee charged on a returned/failed payment.",
        fields: [{ key: "amount_cents", label: "Fee amount", control: "money" }],
    },
    deposit: {
        key: "deposit",
        label: "Deposit",
        description: "Deposit collected at enrollment and whether it is refundable.",
        fields: [
            { key: "amount_cents", label: "Deposit amount", control: "money" },
            { key: "refundable", label: "Refundable", control: "yesno" },
        ],
    },
    refund: {
        key: "refund",
        label: "Refund policy",
        description: "Window in which a charge may be refunded.",
        fields: [{ key: "window_days", label: "Refund window", control: "number", suffix: "days" }],
    },
    posting_review: {
        key: "posting_review",
        label: "Posting review",
        description: "Whether draft charges require review before they can be posted.",
        fields: [{ key: "required", label: "Review required", control: "yesno" }],
    },
};

export function isFinancialPolicyType(value: unknown): value is FinancialPolicyType {
    return typeof value === "string" && (FINANCIAL_POLICY_TYPES as readonly string[]).includes(value);
}

/** financial_policies row. Effective-dated (supersede). */
export type FinancialPolicyRow = ConfigRuleEffectiveColumns & {
    id: string;
    org_id: string;
    scope_type: FinancialPolicyScopeType;
    location_id: string | null;
    service_id: string | null;
    rate_plan_id: string | null;
    policy_type: FinancialPolicyType;
    label: string | null;
    description: string | null;
    value: Record<string, unknown>;
    is_active: boolean;
    source_key: string;
    metadata: Record<string, unknown>;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
};

export type PolicyValueError = { code: "invalid_input"; message: string };

/**
 * Validate + normalize a raw value object against a policy type's field schema
 * (pure). Returns the normalized value or an error — number→integer, money→
 * non-negative cents, select→one of options, yesno→boolean.
 */
export function validatePolicyValue(
    policyType: FinancialPolicyType,
    raw: Record<string, unknown>,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: PolicyValueError } {
    const def = POLICY_TYPE_REGISTRY[policyType];
    const out: Record<string, unknown> = {};
    for (const field of def.fields) {
        const v = raw[field.key];
        if (field.control === "select") {
            const opt = (field.options ?? []).find((o) => o.value === v);
            if (!opt) return { ok: false, error: { code: "invalid_input", message: `${field.label} is required` } };
            out[field.key] = opt.value;
        } else if (field.control === "number" || field.control === "money") {
            const n = typeof v === "number" ? v : Number(v);
            if (v == null || v === "" || !Number.isInteger(n) || n < 0) {
                return { ok: false, error: { code: "invalid_input", message: `${field.label} must be a non-negative integer` } };
            }
            out[field.key] = n;
        } else {
            out[field.key] = v === true || v === "true" || v === "yes";
        }
    }
    return { ok: true, value: out };
}

/** Human one-line summary of a policy's value (display). */
export function policyValueSummary(policyType: FinancialPolicyType, value: Record<string, unknown>): string {
    const def = POLICY_TYPE_REGISTRY[policyType];
    return def.fields
        .map((f) => {
            const v = value[f.key];
            if (f.control === "money") return `${f.label}: $${((Number(v) || 0) / 100).toFixed(2)}`;
            if (f.control === "yesno") return `${f.label}: ${v ? "Yes" : "No"}`;
            if (f.control === "select") {
                const opt = (f.options ?? []).find((o) => o.value === v);
                return `${f.label}: ${opt?.label ?? String(v ?? "—")}`;
            }
            return `${f.label}: ${v ?? "—"}${f.suffix ? ` ${f.suffix}` : ""}`;
        })
        .join(" · ");
}
