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
    /**
     * THE AGREED COMMERCIAL AMOUNT — an accepted `enrollment_pricing_terms` row, in cents.
     *
     * This is not a rate hint like `resolvedAmountCents`. It is the number a named family accepted
     * for a named child on a named date, recorded by `enrollment.pricing.accept`, and it OUTRANKS
     * `amount_strategy` — including `fixed`.
     *
     * ── WHY IT HAD TO BE A SEPARATE FIELD ────────────────────────────────────────────────────
     *
     * The accepted amount used to arrive as `resolvedAmountCents`, indistinguishable from a
     * catalog-derived rate, and `resolveAmount` returned the template's own `amount_cents` for a
     * `fixed` template. On the certification tenant that meant an accepted $185.00/week and an
     * accepted $1,450.00/month were both billed as $400.00 — the template's configured figure —
     * silently, on every generated obligation.
     *
     * A number cannot carry its own authority. This field is the authority: present means "a
     * commercial contract already decided this", and nothing configured downstream may overrule it.
     *
     * Absent — which is every non-recurring charge, every manual Add, every fee with no accepted
     * term — leaves `amount_strategy` exactly as it was.
     */
    acceptedAmountCents?: number | null;
    /** Quantity for a usage_derived template. */
    quantity?: number | null;
    /** Unit amount (cents) for a usage_derived template, if known. */
    unitAmountCents?: number | null;
    /** Posting-review policy resolution (OR'd with the template's review flag). */
    reviewRequiredByPolicy?: boolean;
    /**
     * Due date, already resolved from the organisation's `due_date` policy by the caller.
     *
     * Passed in rather than resolved here for the same reason `reviewRequiredByPolicy` is: this
     * function is PURE and reads no policies. `null`/absent means the organisation has configured no
     * due-date rule, and the charge keeps whatever due date it would have had — never "due today".
     */
    dueDate?: string | null;
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
    /** When payment is expected, from the org's `due_date` policy. Null = no configured rule. */
    dueDate: string | null;
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
        dueDate: null,
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
    /*
     * AN ACCEPTED COMMERCIAL TERM IS NOT ONE OPINION AMONG SEVERAL.
     *
     * A charge template says HOW tuition posts — its category, its GL mapping, when it occurs, when
     * it becomes billable, whether it needs review. It does not get a second opinion about WHAT
     * THIS CHILD AGREED TO PAY. Where an accepted term exists it is the amount, whatever strategy
     * the template carries, because the alternative is billing a family a number nobody agreed to.
     *
     * `consumptionService` already states this doctrine for the catalog: an accepted term means the
     * catalog lookup "is SKIPPED ENTIRELY — not consulted and overridden, skipped". The template
     * was the one layer that had not been told.
     */
    if (ctx.acceptedAmountCents != null) return ctx.acceptedAmountCents;
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
        /*
         * The invoice date and the due date are SEPARATE facts. This carries whatever the
         * organisation's policy resolved — and null when it has configured none, so the charge
         * keeps today's behaviour rather than acquiring a collections deadline nobody set.
         */
        dueDate: ctx.dueDate ?? null,
        glMappingKey: template.default_gl_mapping_key,
        responsibilityKey: template.default_responsibility_key,
        reviewRequired: template.review_required || ctx.reviewRequiredByPolicy === true,
        lifecycleStatus: compareIsoDates(billableOn, ctx.today) > 0 ? "scheduled" : "draft",
        wouldCreateDraft: true,
        resolutionKey,
    };
}
