/**
 * Template-driven charge resolution (Commercial Model, Slice D) — pure,
 * recomputable. Turns a configured Charge Template + a context into a draft/
 * scheduled **Charge intent**: occurs-on, billable-on, amount, category, GL
 * mapping, responsibility, review, and lifecycle status. It computes nothing
 * authoritative — preview and (idempotent) draft writes both run through this.
 *
 * Doctrine: docs/platform/modules/financial-platform-domain.md
 *   * Charge is the lifecycle spine; Charge Template is configuration.
 *   * Resolution is recomputable; only Posting writes authoritative money truth.
 *
 * Pure functions only — no DB, no IO. The service layer supplies rate/policy
 * inputs (resolvedAmountCents, cadence/review from policy resolution).
 */

import {
    assertValidIsoDate,
    compareIsoDates,
    ISO_DATE_RE,
} from "@/lib/childcareOperational/effectiveDating";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";

/** Add N calendar days to a YYYY-MM-DD date (UTC, pure). */
export function addDays(ymd: string, days: number): string {
    assertValidIsoDate(ymd, "date");
    const m = ISO_DATE_RE.exec(ymd.trim())!;
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

/** First day of the month after the given date (placeholder for cadence resolution). */
export function firstOfNextMonth(ymd: string): string {
    assertValidIsoDate(ymd, "date");
    const m = ISO_DATE_RE.exec(ymd.trim())!;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const ny = mo === 12 ? y + 1 : y;
    const nm = mo === 12 ? 1 : mo + 1;
    return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export type ChargeResolutionContext = {
    /** Org-local "today" — the anchor for `now` occurrence + status. */
    today: string;
    /** Event date for an `event_date` template (e.g. field trip date). */
    eventDate?: string | null;
    /** Service period start for a `service_period_start` template. */
    servicePeriodStart?: string | null;
    /** Amount resolved by Rate Resolution for a rate_derived template (cents). */
    resolvedAmountCents?: number | null;
    /** Quantity for a usage_derived template. */
    quantity?: number | null;
    /** Unit amount (cents) for a usage_derived template, if known. */
    unitAmountCents?: number | null;
    /** Posting-review policy resolution (OR'd with the template's review flag). */
    reviewRequiredByPolicy?: boolean;
    /** Stable scope discriminator for the idempotency key (e.g. agreement id, "org"). */
    scopeKey?: string | null;
};

export type ChargeIntent = {
    eligible: boolean;
    reason: string | null;
    templateId: string;
    templateKey: string;
    serviceId: string | null;
    chargeCategory: string;
    amountStrategy: string;
    amountCents: number | null;
    currencyCode: string;
    occursOn: string | null;
    billableOn: string | null;
    glMappingKey: string | null;
    responsibilityKey: string | null;
    reviewRequired: boolean;
    /** Where this charge sits on the lifecycle spine if written. */
    lifecycleStatus: "scheduled" | "draft";
    /** True when this intent would produce a draft charge on write. */
    wouldCreateDraft: boolean;
    resolutionKey: string;
};

function notEligible(template: ChargeTemplateRow, reason: string, resolutionKey: string): ChargeIntent {
    return {
        eligible: false,
        reason,
        templateId: template.id,
        templateKey: template.template_key,
        serviceId: template.service_id,
        chargeCategory: template.charge_category,
        amountStrategy: template.amount_strategy,
        amountCents: null,
        currencyCode: template.currency_code,
        occursOn: null,
        billableOn: null,
        glMappingKey: template.default_gl_mapping_key,
        responsibilityKey: template.default_responsibility_key,
        reviewRequired: template.review_required,
        lifecycleStatus: "draft",
        wouldCreateDraft: false,
        resolutionKey,
    };
}

function resolveOccursOn(template: ChargeTemplateRow, ctx: ChargeResolutionContext): { occursOn: string } | { error: string } {
    switch (template.occurs_on_strategy) {
        case "now":
            return { occursOn: ctx.today };
        case "event_date":
            return ctx.eventDate ? { occursOn: ctx.eventDate } : { error: "missing_event_date" };
        case "service_period_start":
            return ctx.servicePeriodStart ? { occursOn: ctx.servicePeriodStart } : { error: "missing_service_period" };
        default:
            return { error: "unknown_occurs_strategy" };
    }
}

function resolveAmount(template: ChargeTemplateRow, ctx: ChargeResolutionContext): number | null {
    switch (template.amount_strategy) {
        case "fixed":
            return template.amount_cents ?? null;
        case "rate_derived":
            return ctx.resolvedAmountCents ?? null;
        case "usage_derived":
            return ctx.quantity != null && ctx.unitAmountCents != null ? ctx.quantity * ctx.unitAmountCents : null;
        default:
            // attendance_derived | manual — no amount resolvable at config time.
            return null;
    }
}

function resolveBillableOn(template: ChargeTemplateRow, occursOn: string): string {
    switch (template.billable_on_strategy) {
        case "immediate":
            return occursOn;
        case "offset_days":
            return addDays(occursOn, template.billable_offset_days ?? 0);
        case "next_billing_cycle":
            return firstOfNextMonth(occursOn);
        default:
            return occursOn;
    }
}

/**
 * Resolve a Charge intent from a template + context. Idempotency key is
 * `tpl:<template_key>:<occurs_on>:<scopeKey>` so re-resolving the same template
 * for the same scope/date yields the same draft (no duplicates).
 */
export function resolveChargeFromTemplate(template: ChargeTemplateRow, ctx: ChargeResolutionContext): ChargeIntent {
    assertValidIsoDate(ctx.today, "today");
    const provisionalKey = `tpl:${template.template_key}:pending:${ctx.scopeKey ?? "org"}`;

    // Eligibility: the template must be effective on the anchor date.
    if (template.is_active === false) return notEligible(template, "template_inactive", provisionalKey);
    if (compareIsoDates(template.effective_start, ctx.today) > 0) {
        return notEligible(template, "template_not_yet_effective", provisionalKey);
    }
    if (template.effective_end != null && compareIsoDates(ctx.today, template.effective_end) > 0) {
        return notEligible(template, "template_retired", provisionalKey);
    }

    const occ = resolveOccursOn(template, ctx);
    if ("error" in occ) return notEligible(template, occ.error, provisionalKey);
    const occursOn = occ.occursOn;
    const billableOn = resolveBillableOn(template, occursOn);
    const amountCents = resolveAmount(template, ctx);
    const resolutionKey = `tpl:${template.template_key}:${occursOn}:${ctx.scopeKey ?? "org"}`;

    return {
        eligible: true,
        reason: null,
        templateId: template.id,
        templateKey: template.template_key,
        serviceId: template.service_id,
        chargeCategory: template.charge_category,
        amountStrategy: template.amount_strategy,
        amountCents,
        currencyCode: template.currency_code,
        occursOn,
        billableOn,
        glMappingKey: template.default_gl_mapping_key,
        responsibilityKey: template.default_responsibility_key,
        reviewRequired: template.review_required || ctx.reviewRequiredByPolicy === true,
        lifecycleStatus: compareIsoDates(billableOn, ctx.today) > 0 ? "scheduled" : "draft",
        wouldCreateDraft: true,
        resolutionKey,
    };
}
