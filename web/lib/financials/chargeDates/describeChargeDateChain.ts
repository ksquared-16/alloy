/**
 * THE DATE CHAIN, IN THE OPERATOR'S WORDS.
 *
 * One vocabulary for the four rules — billing period, invoice timing, payment terms, posting — used
 * by the Add Charge preview and by Organization → Financials → Billing & payment timing, so the
 * sentence that explains a configured rule and the sentence that explains a charge's date are the
 * same sentence. Pure; reads nothing; renders only what the resolvers already decided.
 */
import type { ChargeDateChain, InvoiceTimingRule } from "@/lib/financials/chargeDates/resolveChargeDateChain";

const SCOPE_WORDS: Record<string, string> = {
    org: "organization default",
    location: "location override",
    customer: "account override",
    service: "service override",
    rate_plan: "rate plan override",
};

export function scopeWords(scope: string | null | undefined): string {
    return SCOPE_WORDS[(scope ?? "").trim()] ?? "configured";
}

function days(n: number): string {
    return `${n} day${n === 1 ? "" : "s"}`;
}

/** "7 days before the billing period begins" — the rule, without where it came from. */
export function invoiceRuleSentence(strategy: string, offsetDays: number): string {
    switch (strategy) {
        case "days_before_period_start":
            return offsetDays === 0 ? "On the first day of the billing period" : `${days(offsetDays)} before the billing period begins`;
        case "days_after_service_date":
            return offsetDays === 0 ? "On the service date" : `${days(offsetDays)} after the service date`;
        case "next_period_start":
            return "When the next billing period begins";
        case "on_service_date":
        default:
            return "On the service date";
    }
}

/** Where an invoice rule came from, in words. */
export function invoiceRuleSource(rule: InvoiceTimingRule): string {
    switch (rule.source.kind) {
        case "template":
            return "this charge type's own timing";
        case "policy":
            return scopeWords(rule.source.scope);
        case "platform_default":
        default:
            return "nothing configured — platform default";
    }
}

/** "On the first day of the billing period" — a due-date rule, without where it came from. */
export function dueRuleSentence(strategy: string | null | undefined, offsetDays: number | null | undefined): string {
    const n = offsetDays ?? 0;
    switch ((strategy ?? "").trim()) {
        case "on_invoice":
            return "On the invoice date";
        case "days_after_invoice":
            return n === 0 ? "On the invoice date" : `${days(n)} after the invoice date`;
        case "on_period_start":
            return "On the first day of the billing period";
        case "days_after_period_start":
            return n === 0 ? "On the first day of the billing period" : `${days(n)} after the billing period begins`;
        default:
            return "No payment terms configured";
    }
}

/** "Monthly · 1st → last day of each month" — a billing calendar, in words. */
export function billingCalendarSentence(cadence: string | null | undefined, anchorOn: string | null | undefined): string {
    switch ((cadence ?? "").trim()) {
        case "monthly":
            return "Monthly · 1st → last day of each month";
        case "weekly":
            return anchorOn ? `Weekly · 7-day periods starting from ${anchorOn}` : "Weekly · anchor missing";
        case "biweekly":
            return anchorOn ? `Every two weeks · 14-day periods starting from ${anchorOn}` : "Every two weeks · anchor missing";
        case "daily":
            return "Daily";
        case "annual":
            return anchorOn ? `Annual · each year from ${anchorOn.slice(5)}` : "Annual · anchor missing";
        default:
            return "No billing calendar configured";
    }
}

/**
 * The preview lines for one resolved chain. Prefixes are stable — the Add Charge card reads them
 * by prefix — and every line states a resolved answer, never a mechanism name.
 */
export function chargeDateChainPreviewLines(chain: ChargeDateChain, reviewRequired: boolean): string[] {
    const lines: string[] = [];
    if (chain.period) {
        lines.push(`Billing period ${chain.period.label} · ${chain.period.startsOn} → ${chain.period.endsOn}`);
    }
    lines.push(`Invoice date ${chain.invoice.actual}`);
    lines.push(
        chain.invoice.late
            ? `Invoice timing · ${invoiceRuleSentence(chain.invoice.rule.strategy, chain.invoice.rule.offsetDays)} (${invoiceRuleSource(chain.invoice.rule)}) would be ${chain.invoice.intended}; this charge is added later, so it is invoiced the day it is created`
            : `Invoice timing · ${invoiceRuleSentence(chain.invoice.rule.strategy, chain.invoice.rule.offsetDays)} (${invoiceRuleSource(chain.invoice.rule)})`,
    );
    if (chain.due.actual) lines.push(`Due ${chain.due.actual}`);
    const dueRule = chain.due.resolution;
    lines.push(
        dueRule.reason === "no_policy"
            ? "Payment terms · No payment terms configured — no due date is set"
            : chain.due.clampedToInvoice
                ? `Payment terms · ${dueRuleSentence(dueRule.strategy, dueRule.offsetDays)} (${scopeWords(dueRule.sourceScope)}) would be ${chain.due.ruleDate}, before this charge is invoiced, so it is due on the invoice date`
                : `Payment terms · ${dueRuleSentence(dueRule.strategy, dueRule.offsetDays)} (${scopeWords(dueRule.sourceScope)})`,
    );
    if (chain.posting.gate === "awaits_period") {
        lines.push(
            reviewRequired
                ? `Posting · Draft until ${chain.posting.notBefore}, when the billing period begins — then waits for posting review`
                : `Posting · Draft until ${chain.posting.notBefore} — posts automatically when the billing period begins`,
        );
    } else if (reviewRequired) {
        lines.push("Posting · Waits for posting review before it is owed");
    } else if (chain.posting.gate === "posts_on_creation") {
        lines.push("Posting · Posts on confirm — the billing period has begun");
    }
    return lines;
}
