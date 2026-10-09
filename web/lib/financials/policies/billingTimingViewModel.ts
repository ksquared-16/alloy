/**
 * "HOW DOES THIS ORGANIZATION BILL?" — the resolved reading of the four billing-timing rules.
 *
 * The raw `financial_policies` table is effective-dated lineage: current, scheduled, superseded and
 * retired versions at org, location and account scope, interleaved. That is the right storage and the
 * wrong first reading. An operator asks four questions, in order, and each answer depends on the one
 * before it:
 *
 *   BILLING PERIOD   billing_calendar   which interval an obligation belongs to
 *   INVOICE TIMING   invoice_timing     when it is invoiced, relative to that interval
 *   PAYMENT DUE      due_date           when payment is due, relative to the interval or the invoice
 *   POSTING REVIEW   posting_review     whether a person reviews it before it is owed
 *
 * This model answers them RESOLVED: the organization default in force today (and what it falls back
 * to when nothing is configured, said in words), a scheduled change if one is coming, and only the
 * locations that actually override something — each stating what it overrides and what it inherits.
 * History stays available, separately. Pure; the resolver is the same `resolveFinancialPolicy` every
 * charge writer uses, so this page and a charge cannot disagree about which rule applies.
 */
import {
    billingCalendarSentence,
    dueRuleSentence,
    invoiceRuleSentence,
} from "@/lib/financials/chargeDates/describeChargeDateChain";
import type { FinancialPolicyRow, FinancialPolicyType } from "@/lib/financials/policies/financialPolicyTypes";
import { isWithdrawnPolicy, resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";

export const BILLING_TIMING_RULES = ["billing_calendar", "invoice_timing", "due_date", "posting_review"] as const;
export type BillingTimingRule = (typeof BILLING_TIMING_RULES)[number];

export const BILLING_TIMING_RULE_LABEL: Record<BillingTimingRule, string> = {
    billing_calendar: "Billing period",
    invoice_timing: "Invoice timing",
    due_date: "Payment due",
    posting_review: "Posting review",
};

/** What each rule derives — the dependency, stated beside the rule rather than left to inference. */
export const BILLING_TIMING_RULE_DERIVES: Record<BillingTimingRule, string> = {
    billing_calendar: "Decides which billing period a charge belongs to, from its service date.",
    invoice_timing: "Decides the invoice date from that billing period. Never earlier than the day a charge is created.",
    due_date: "Decides the due date from the billing period or the invoice date. Never earlier than the invoice.",
    posting_review: "Decides whether a charge waits for a person. A future-period charge always waits for its period.",
};

/**
 * WHAT HAPPENS WHEN NOTHING IS CONFIGURED — every fallback, in words, and whether it is safe.
 *
 *   billing_calendar   REFUSES: a childcare charge cannot be created without a billing period.
 *   invoice_timing     platform default: invoiced on the service date.
 *   due_date           no due date is written (never "due today").
 *   posting_review     no review: a current-period charge posts on creation.
 */
export const BILLING_TIMING_FALLBACK: Record<BillingTimingRule, { sentence: string; blocksBilling: boolean }> = {
    billing_calendar: {
        sentence: "Not configured — charges cannot be created until a billing period is set",
        blocksBilling: true,
    },
    invoice_timing: { sentence: "Not configured — invoiced on the service date (platform default)", blocksBilling: false },
    due_date: { sentence: "Not configured — charges carry no due date", blocksBilling: false },
    posting_review: { sentence: "Not configured — no review; charges post when their period has begun", blocksBilling: false },
};

/** One configured rule value, in the operator's words. */
export function ruleSentence(rule: BillingTimingRule, value: Record<string, unknown> | null | undefined): string {
    const v = value ?? {};
    switch (rule) {
        case "billing_calendar":
            return billingCalendarSentence(String(v.cadence ?? ""), v.anchor_on == null ? null : String(v.anchor_on));
        case "invoice_timing":
            return invoiceRuleSentence(String(v.strategy ?? ""), Number(v.offset_days ?? 0) || 0);
        case "due_date":
            return dueRuleSentence(String(v.strategy ?? ""), Number(v.offset_days ?? 0) || 0);
        case "posting_review":
            return v.required === true ? "Every charge waits for review before it is owed" : "No review required";
    }
}

export type RuleReading = {
    rule: BillingTimingRule;
    /** The row in force today at this scope, or null. */
    current: FinancialPolicyRow | null;
    /** What an operator reads: the configured sentence, or the fallback sentence. */
    sentence: string;
    /** True when nothing is configured at this scope (or, for the org, at all). */
    isFallback: boolean;
    /** The day the current rule stops, when a stop is recorded. */
    through: string | null;
    /** The next scheduled version at this scope, if any. */
    scheduled: { row: FinancialPolicyRow; sentence: string } | null;
    /** Every version at this scope, newest first — for "View history". */
    history: FinancialPolicyRow[];
};

function rowsAt(
    policies: readonly FinancialPolicyRow[],
    rule: BillingTimingRule,
    scope: { type: "org" } | { type: "location"; locationId: string },
): FinancialPolicyRow[] {
    return policies
        .filter((p) => p.policy_type === (rule as FinancialPolicyType))
        .filter((p) => (scope.type === "org" ? p.scope_type === "org" : p.scope_type === "location" && p.location_id === scope.locationId))
        .slice()
        .sort((a, b) => (a.effective_start < b.effective_start ? 1 : a.effective_start > b.effective_start ? -1 : 0));
}

function readAt(
    policies: readonly FinancialPolicyRow[],
    rule: BillingTimingRule,
    scope: { type: "org" } | { type: "location"; locationId: string },
    todayYmd: string,
): RuleReading {
    const history = rowsAt(policies, rule, scope);
    /* Resolved through the canonical resolver against ONLY this scope's rows, so "in force" means the same thing here as on a charge. */
    const resolved = resolveFinancialPolicy(
        history,
        rule as FinancialPolicyType,
        scope.type === "location" ? { locationId: scope.locationId } : {},
        todayYmd,
    );
    const current = resolved.resolved ? resolved.policy : null;
    const future = history
        .filter((p) => !isWithdrawnPolicy(p) && p.effective_start > todayYmd)
        .sort((a, b) => (a.effective_start < b.effective_start ? -1 : 1))[0] ?? null;
    return {
        rule,
        current,
        sentence: current ? ruleSentence(rule, current.value) : BILLING_TIMING_FALLBACK[rule].sentence,
        isFallback: !current,
        through: current?.effective_end ?? (future ? dayBefore(future.effective_start) : null),
        scheduled: future ? { row: future, sentence: ruleSentence(rule, future.value) } : null,
        history,
    };
}

function dayBefore(ymd: string): string {
    const t = Date.parse(`${ymd}T00:00:00Z`);
    return new Date(t - 86_400_000).toISOString().slice(0, 10);
}

export type LocationOverride = {
    locationId: string;
    /**
     * Null while the location list is still loading. "No longer listed" is a claim about the
     * registry, so it is only made once the registry has answered.
     */
    locationName: string | null;
    /** One entry per rule: overridden here (with its reading), or inherited from the org default. */
    rules: Array<
        | { rule: BillingTimingRule; overridden: true; reading: RuleReading }
        | { rule: BillingTimingRule; overridden: false; inheritedSentence: string }
    >;
};

export type BillingTimingModel = {
    orgDefault: RuleReading[];
    /** ONLY locations that override at least one rule (now or scheduled). No empty blocks. */
    overrides: LocationOverride[];
    /** Accounts with their own billing calendar — shown as a count, managed on the account. */
    accountCalendarCount: number;
    /** True when a missing rule would stop billing (no billing period configured anywhere usable). */
    blocksBilling: boolean;
};

export function buildBillingTimingModel(args: {
    policies: readonly FinancialPolicyRow[];
    locations: ReadonlyArray<{ id: string; name: string }>;
    /** False while `locations` has not loaded yet; defaults to true. */
    locationsLoaded?: boolean;
    todayYmd: string;
}): BillingTimingModel {
    const orgDefault = BILLING_TIMING_RULES.map((rule) => readAt(args.policies, rule, { type: "org" }, args.todayYmd));
    const byRule = new Map(orgDefault.map((r) => [r.rule, r]));

    const overridingLocationIds = new Set(
        args.policies
            .filter((p) => (BILLING_TIMING_RULES as readonly string[]).includes(p.policy_type))
            .filter((p) => p.scope_type === "location" && p.location_id && !isWithdrawnPolicy(p))
            .filter((p) => p.effective_end == null || p.effective_end >= args.todayYmd)
            .map((p) => p.location_id as string),
    );
    const nameOf = new Map(args.locations.map((l) => [l.id, l.name]));
    const overrides: LocationOverride[] = [...overridingLocationIds]
        .map((locationId) => ({
            locationId,
            locationName: nameOf.get(locationId) ?? (args.locationsLoaded === false ? null : "A location no longer listed"),
            rules: BILLING_TIMING_RULES.map((rule) => {
                const reading = readAt(args.policies, rule, { type: "location", locationId }, args.todayYmd);
                return reading.current || reading.scheduled
                    ? ({ rule, overridden: true, reading } as const)
                    : ({ rule, overridden: false, inheritedSentence: byRule.get(rule)!.sentence } as const);
            }),
        }))
        .sort((a, b) => (a.locationName ?? "").localeCompare(b.locationName ?? ""));

    const accountCalendarCount = new Set(
        args.policies
            .filter((p) => p.policy_type === "billing_calendar" && p.scope_type === "customer" && !isWithdrawnPolicy(p))
            .filter((p) => p.effective_end == null || p.effective_end >= args.todayYmd)
            .map((p) => p.customer_id),
    ).size;

    return {
        orgDefault,
        overrides,
        accountCalendarCount,
        blocksBilling: byRule.get("billing_calendar")!.isFallback,
    };
}
