/**
 * THE DATE CHAIN — one answer to "which period, invoiced when, due when, owed when?"
 *
 * ── THE FIVE IDENTITIES, AND WHICH ONE DECIDES WHICH ─────────────────────────────────────────
 *
 *   SERVICE DATE      when the chargeable thing occurred / applies          (`service_date`)
 *   BILLING PERIOD    the commercial interval CONTAINING the service date  (`billing_period_id`)
 *   INVOICE DATE      when the obligation is billed / presented            (`billable_on`)
 *   DUE DATE          when payment is due                                  (`due_date`)
 *   ACCOUNTING PERIOD attributed separately, from the journal's effective date — not here
 *
 * The resolution graph, and the only direction it runs:
 *
 *   billing calendar (cadence + anchor)          ─► billing-period boundaries
 *   boundaries + invoice-timing rule             ─► INTENDED invoice date
 *   intended + the day the charge is created     ─► ACTUAL invoice date      (never before it existed)
 *   boundaries + actual invoice + due-date rule  ─► due date                 (never before the invoice)
 *   period start + organisation business date    ─► posting eligibility      (review is separate)
 *
 * ── WHY THE PERIOD COMES FROM THE SERVICE DATE (Director decision, W7) ───────────────────────
 *
 * It used to come from `billable_on`, and a template whose invoice timing moved `billable_on` into
 * the next cycle moved the OBLIGATION into the next cycle with it: a Nov 5 service billed "next
 * cycle" became a December obligation. Invoice timing is WHEN WE BILL; it has no authority over
 * WHAT INTERVAL the obligation belongs to. So the period is resolved first, from the service date,
 * and every later date is derived from it — never the other way round.
 *
 * ── TWO CLAMPS, ONE PRINCIPLE ────────────────────────────────────────────────────────────────
 *
 * The system must never claim that a family was billed, or obliged to pay, before the charge existed.
 *
 *   * ACTUAL INVOICE = max(intended invoice, the business date the charge was created). A charge
 *     added on Nov 5 to a period normally invoiced Oct 25 is invoiced Nov 5 — and says it was LATE.
 *   * DUE = max(the due-date rule's answer, the actual invoice date). "Due on the first day of the
 *     period" for a charge invoiced on Nov 5 is due Nov 5, and says the rule's date had passed.
 *
 * ── PURE ─────────────────────────────────────────────────────────────────────────────────────
 *
 * No IO. Preview and commit both call this with the same inputs, which is what makes them unable to
 * disagree; the callers own reading the period and the policies.
 */
import { addDaysYmd } from "@/lib/financials/billingPeriod";
import type { ChargeTemplateBillableOn } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";
import type { FinancialPolicyRow, InvoiceTimingStrategy } from "@/lib/financials/policies/financialPolicyTypes";
import { resolveDueDate, type DueDateResolution } from "@/lib/financials/policies/resolveDueDate";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";

/** The billing period an obligation belongs to, as the period authority resolved it. */
export type ChargeDatePeriod = {
    /** Persisted `financial_billing_periods.id` when one exists; null for a not-yet-materialised period. */
    id: string | null;
    key: string;
    label: string;
    startsOn: string;
    endsOn: string;
    status: "open" | "closed";
};

/**
 * Where an invoice-timing rule came from — the answer to "why this date?".
 *
 *   template          the charge template names an exception
 *   policy            an `invoice_timing` row (org default, location override, account)
 *   platform_default  nothing is configured; the charge is invoiced on its service date
 */
export type InvoiceTimingSource =
    | { kind: "template"; templateKey: string; templateStrategy: Exclude<ChargeTemplateBillableOn, "billing_policy"> }
    | { kind: "policy"; scope: string; policyId: string }
    | { kind: "platform_default" };

export type InvoiceTimingRule = {
    /**
     * `days_before_period_start` and `on_service_date` are the policy strategies. The two
     * template-only exceptions are kept with their own names so the explanation is exact:
     * `days_after_service_date` (template `offset_days`) and `next_period_start` (template
     * `next_billing_cycle`, which now means the NEXT BILLING PERIOD, not "the 1st of next month").
     */
    strategy: InvoiceTimingStrategy | "days_after_service_date" | "next_period_start";
    offsetDays: number;
    source: InvoiceTimingSource;
};

/** The platform default when nothing is configured: invoiced on the service date (historical "immediate"). */
export const PLATFORM_DEFAULT_INVOICE_RULE: InvoiceTimingRule = {
    strategy: "on_service_date",
    offsetDays: 0,
    source: { kind: "platform_default" },
};

function wholeDays(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isInteger(n) && n >= 0 ? n : 0;
}

/**
 * WHICH INVOICE-TIMING RULE GOVERNS THIS CHARGE.
 *
 * A template exception wins — it is the narrowest statement, made about this kind of charge on
 * purpose. Otherwise the organisation's `invoice_timing` policy answers, narrowed through the one
 * policy resolver (account > location > org), evaluated as of the billing period's start so a rule
 * scheduled to begin in March governs March's periods and not February's. Nothing configured falls
 * to the platform default, and says so.
 */
export function resolveInvoiceTimingRule(args: {
    policies: readonly FinancialPolicyRow[];
    template: { template_key: string; billable_on_strategy: string; billable_offset_days: number | null } | null;
    locationId: string | null;
    customerId: string | null;
    serviceId: string | null;
    /** The billing period's first day (the rule in force for that period). */
    asOf: string;
}): InvoiceTimingRule {
    const t = args.template;
    const templateStrategy = (t?.billable_on_strategy ?? "billing_policy").trim();
    if (t && templateStrategy !== "billing_policy") {
        const source: InvoiceTimingSource = {
            kind: "template",
            templateKey: t.template_key,
            templateStrategy: templateStrategy as Exclude<ChargeTemplateBillableOn, "billing_policy">,
        };
        switch (templateStrategy) {
            case "offset_days":
                return { strategy: "days_after_service_date", offsetDays: wholeDays(t.billable_offset_days), source };
            case "next_billing_cycle":
                return { strategy: "next_period_start", offsetDays: 0, source };
            case "immediate":
            default:
                return { strategy: "on_service_date", offsetDays: 0, source };
        }
    }

    const resolved = resolveFinancialPolicy(
        args.policies,
        "invoice_timing",
        {
            locationId: args.locationId ?? undefined,
            customerId: args.customerId ?? undefined,
            serviceId: args.serviceId ?? undefined,
        },
        args.asOf,
    );
    if (!resolved.resolved) return PLATFORM_DEFAULT_INVOICE_RULE;
    const value = (resolved.policy.value ?? {}) as { strategy?: unknown; offset_days?: unknown };
    const strategy = String(value.strategy ?? "").trim();
    const source: InvoiceTimingSource = { kind: "policy", scope: resolved.sourceScope, policyId: resolved.policy.id };
    if (strategy === "days_before_period_start") {
        return { strategy, offsetDays: wholeDays(value.offset_days), source };
    }
    /* `on_service_date`, and any value this build does not know, invoice on the service date. */
    return { strategy: "on_service_date", offsetDays: 0, source };
}

/** The invoice date the RULE produces, before the creation clamp. */
export function intendedInvoiceDate(rule: InvoiceTimingRule, serviceDate: string, period: ChargeDatePeriod | null): string {
    switch (rule.strategy) {
        case "days_before_period_start":
            return period ? addDaysYmd(period.startsOn, -rule.offsetDays) : serviceDate;
        case "next_period_start":
            return period ? addDaysYmd(period.endsOn, 1) : serviceDate;
        case "days_after_service_date":
            return addDaysYmd(serviceDate, rule.offsetDays);
        case "on_service_date":
        default:
            return serviceDate;
    }
}

export type ChargeDateChain = {
    serviceDate: string;
    period: ChargeDatePeriod | null;
    invoice: {
        rule: InvoiceTimingRule;
        /** What the rule says. */
        intended: string;
        /** What the charge carries: never before the day it was created. */
        actual: string;
        /** True when the rule's date had already passed when the charge was created. */
        late: boolean;
        /** The business date the clamp measured against. */
        createdOn: string;
    };
    due: {
        /** The due-date rule's own answer, before the clamp. Null when no rule is configured. */
        ruleDate: string | null;
        /** What the charge carries. Null = no payment terms configured (left alone, never "due today"). */
        actual: string | null;
        /** True when the rule's date preceded the actual invoice date and was moved to it. */
        clampedToInvoice: boolean;
        resolution: DueDateResolution;
    };
    posting: {
        /**
         * `posts_on_creation`  the period has begun — posts now, unless posting review holds it
         * `awaits_period`      a future period — stays a draft until `notBefore`, then posts itself
         * `period_unknown`     no billing period could be resolved; nothing is promised
         */
        gate: "posts_on_creation" | "awaits_period" | "period_unknown";
        notBefore: string | null;
    };
};

/**
 * Resolve the whole chain for one obligation.
 *
 * `createdOn` is the organisation's business date on the day the charge was (or is being) created —
 * for a recalculated draft, the day it was first created, so re-running generation never re-dates an
 * invoice forward just because time passed. `businessDate` is today, for the posting question.
 */
export function resolveChargeDateChain(args: {
    serviceDate: string;
    period: ChargeDatePeriod | null;
    invoiceRule: InvoiceTimingRule;
    policies: readonly FinancialPolicyRow[];
    scope: { serviceId: string | null; customerId: string | null; locationId: string | null };
    createdOn: string;
    businessDate: string;
}): ChargeDateChain {
    const intended = intendedInvoiceDate(args.invoiceRule, args.serviceDate, args.period);
    const actual = intended < args.createdOn ? args.createdOn : intended;

    const resolution = resolveDueDate(args.policies, {
        invoiceDate: actual,
        /* The bound period's own first day — not the service date, which is a different identity. */
        periodStart: args.period?.startsOn ?? null,
        serviceId: args.scope.serviceId,
        customerId: args.scope.customerId,
        locationId: args.scope.locationId,
    });
    const ruleDate = resolution.dueDate;
    const clampedToInvoice = ruleDate != null && ruleDate < actual;
    const dueActual = ruleDate == null ? null : clampedToInvoice ? actual : ruleDate;

    const posting: ChargeDateChain["posting"] = !args.period
        ? { gate: "period_unknown", notBefore: null }
        : args.period.startsOn > args.businessDate
            ? { gate: "awaits_period", notBefore: args.period.startsOn }
            : { gate: "posts_on_creation", notBefore: null };

    return {
        serviceDate: args.serviceDate,
        period: args.period,
        invoice: { rule: args.invoiceRule, intended, actual, late: actual !== intended, createdOn: args.createdOn },
        due: { ruleDate, actual: dueActual, clampedToInvoice, resolution },
        posting,
    };
}

/**
 * The provenance a written charge carries in `metadata.charge_dates` — enough to explain every date
 * later without re-resolving policy that may since have changed.
 */
export function chargeDateProvenance(chain: ChargeDateChain): Record<string, unknown> {
    const src = chain.invoice.rule.source;
    return {
        version: 1,
        created_on: chain.invoice.createdOn,
        period_key: chain.period?.key ?? null,
        invoice_rule: chain.invoice.rule.strategy,
        invoice_offset_days: chain.invoice.rule.offsetDays,
        invoice_rule_source: src.kind === "policy" ? `policy:${src.scope}` : src.kind,
        invoice_intended: chain.invoice.intended,
        invoice_late: chain.invoice.late,
        due_rule: chain.due.resolution.strategy,
        due_rule_scope: chain.due.resolution.sourceScope ?? null,
        due_rule_date: chain.due.ruleDate,
        due_clamped_to_invoice: chain.due.clampedToInvoice,
    };
}
