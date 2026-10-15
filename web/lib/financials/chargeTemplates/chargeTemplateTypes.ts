/**
 * Charge Template vocabularies + row shape (Commercial Model, Slice B).
 *
 * Code-owned mirror of supabase/migrations/20260703120000_financial_charge_templates.sql.
 * A Charge Template is commercial CONFIGURATION (L1): how an operational fact or
 * event becomes a charge. It posts nothing — Posting is the only authoritative
 * money write (docs/platform/modules/financial-platform-domain.md).
 */

import type { ConfigRuleEffectiveColumns } from "@/lib/childcareOperational/config/configRuleTypes";
import { CHARGE_CATEGORIES, type ChargeCategory } from "@/lib/financials/billableSource";

export const CHARGE_TEMPLATE_TRIGGER_TYPES = ["manual", "event", "attendance", "schedule"] as const;
export type ChargeTemplateTriggerType = (typeof CHARGE_TEMPLATE_TRIGGER_TYPES)[number];

export const CHARGE_TEMPLATE_AMOUNT_STRATEGIES = [
    "fixed",
    "rate_derived",
    "usage_derived",
    "attendance_derived",
    "manual",
] as const;
export type ChargeTemplateAmountStrategy = (typeof CHARGE_TEMPLATE_AMOUNT_STRATEGIES)[number];

export const CHARGE_TEMPLATE_OCCURS_ON = ["now", "event_date", "service_period_start"] as const;
export type ChargeTemplateOccursOn = (typeof CHARGE_TEMPLATE_OCCURS_ON)[number];

/*
 * `billing_policy` is the default: the template does not decide when it is invoiced, the
 * organisation's `invoice_timing` policy does (org default, location override). The other three are
 * EXCEPTIONS a template keeps only when its charge kind genuinely bills differently.
 */
export const CHARGE_TEMPLATE_BILLABLE_ON = ["billing_policy", "immediate", "offset_days", "next_billing_cycle"] as const;
export type ChargeTemplateBillableOn = (typeof CHARGE_TEMPLATE_BILLABLE_ON)[number];

/** Responsibility default vocabulary (placeholder until Responsibility ships). */
export const CHARGE_TEMPLATE_RESPONSIBILITY = ["household", "employer", "third_party", "agency"] as const;
export type ChargeTemplateResponsibility = (typeof CHARGE_TEMPLATE_RESPONSIBILITY)[number];

export const TRIGGER_TYPE_LABEL: Record<ChargeTemplateTriggerType, string> = {
    manual: "Manual",
    event: "Event",
    attendance: "Attendance",
    schedule: "Schedule",
};
export const AMOUNT_STRATEGY_LABEL: Record<ChargeTemplateAmountStrategy, string> = {
    fixed: "Fixed amount",
    rate_derived: "Rate-derived",
    usage_derived: "Usage-derived",
    attendance_derived: "Attendance-derived",
    manual: "Manual amount",
};
export const OCCURS_ON_LABEL: Record<ChargeTemplateOccursOn, string> = {
    now: "When configured (now)",
    event_date: "On the event date",
    service_period_start: "At service period start",
};
export const BILLABLE_ON_LABEL: Record<ChargeTemplateBillableOn, string> = {
    billing_policy: "Follows the organisation's invoice timing",
    immediate: "On the service date",
    offset_days: "N days after the service date",
    next_billing_cycle: "When the next billing period begins",
};
export const RESPONSIBILITY_LABEL: Record<ChargeTemplateResponsibility, string> = {
    household: "Household",
    employer: "Employer",
    third_party: "Third-party payer",
    agency: "Agency",
};

export function isChargeCategory(value: unknown): value is ChargeCategory {
    return typeof value === "string" && (CHARGE_CATEGORIES as readonly string[]).includes(value);
}
export function isTriggerType(value: unknown): value is ChargeTemplateTriggerType {
    return typeof value === "string" && (CHARGE_TEMPLATE_TRIGGER_TYPES as readonly string[]).includes(value);
}
export function isAmountStrategy(value: unknown): value is ChargeTemplateAmountStrategy {
    return typeof value === "string" && (CHARGE_TEMPLATE_AMOUNT_STRATEGIES as readonly string[]).includes(value);
}
export function isOccursOn(value: unknown): value is ChargeTemplateOccursOn {
    return typeof value === "string" && (CHARGE_TEMPLATE_OCCURS_ON as readonly string[]).includes(value);
}
export function isBillableOn(value: unknown): value is ChargeTemplateBillableOn {
    return typeof value === "string" && (CHARGE_TEMPLATE_BILLABLE_ON as readonly string[]).includes(value);
}

/** financial_charge_templates row. Effective-dated (supersede). */
export type ChargeTemplateRow = ConfigRuleEffectiveColumns & {
    id: string;
    org_id: string;
    service_id: string | null;
    template_key: string;
    label: string;
    description: string | null;
    charge_category: ChargeCategory;
    trigger_type: ChargeTemplateTriggerType;
    trigger_key: string | null;
    amount_strategy: ChargeTemplateAmountStrategy;
    amount_cents: number | null;
    currency_code: string;
    occurs_on_strategy: ChargeTemplateOccursOn;
    billable_on_strategy: ChargeTemplateBillableOn;
    billable_offset_days: number | null;
    default_gl_mapping_key: string | null;
    default_responsibility_key: string | null;
    review_required: boolean;
    is_active: boolean;
    source_key: string;
    metadata: Record<string, unknown>;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
};
