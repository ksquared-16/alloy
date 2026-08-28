/**
 * WHICH BILLING PERIOD DOES A PIECE OF FINANCIAL ACTIVITY BELONG TO?
 *
 * ── NO NEW COLUMN, BECAUSE THE PERIOD IS ALREADY DERIVABLE ──
 *
 * `charges` carries four canonical dates and they answer different questions:
 *
 *   occurs_on    the date the chargeable EVENT happens (template `occurs_on_strategy`)
 *   billable_on  the date the charge BECOMES BILLABLE (template `billable_on_strategy`)
 *   due_date     the date payment is due
 *   posted_at    the moment posting happened
 *
 * The period is `billable_on`. That is the column whose own comment defines the lifecycle — "a draft
 * with billable_on in the future is scheduled" — so it is already the platform's answer to "when does
 * this charge belong to the operator's billing work". Adding a `billing_period` column would be a
 * second answer to a question the schema settles, and the two would drift the first time a template
 * changed its `billable_on_strategy`.
 *
 * `posted_at` was the tempting alternative and is wrong: it records when someone pressed post, so a
 * September charge posted late in October would move to October and silently change a closed period's
 * totals. `occurs_on` is wrong for the opposite reason — a field trip that occurs in September but
 * bills next cycle belongs to the cycle that bills it, which is exactly what `billable_on` says.
 *
 * ── THE FALLBACK CHAIN IS ORDERED BY AUTHORITY, NOT BY CONVENIENCE ──
 *
 * `billable_on` is nullable: the column arrived after `createChildcareDraftCharge` was written, so
 * charges created through that path carry none. Rather than drop those rows out of every period — an
 * invisible omission that would make the card's totals disagree with the table — the chain falls back
 * through progressively weaker but still canonical dates, and every fallback is REPORTED so a caller
 * can say which rows are placed by inference rather than by declaration.
 */

/** A calendar month. The grain every operator-facing billing period uses today. */
export type BillingPeriodKey = string; // "YYYY-MM"

export type BillingPeriod = {
    key: BillingPeriodKey;
    /** Inclusive first day, `YYYY-MM-DD`. */
    start: string;
    /** Inclusive last day, `YYYY-MM-DD`. */
    end: string;
    /** "August 2026" */
    label: string;
};

/** Which date placed a row in its period — declared, or inferred and which way. */
export type BillingPeriodBasis = "billable_on" | "occurs_on" | "service_date" | "created_at" | "unplaceable";

export type BillingPeriodPlacement = {
    key: BillingPeriodKey | null;
    basis: BillingPeriodBasis;
};

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
] as const;

function ymdOf(value: unknown): string | null {
    const raw = value != null ? String(value).trim() : "";
    if (!raw) return null;
    // Accepts both `YYYY-MM-DD` dates and ISO timestamps; both start with the calendar date.
    const head = raw.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

/** The period a single financial row belongs to, and the date that decided it. */
export function placeInBillingPeriod(row: {
    billable_on?: unknown;
    occurs_on?: unknown;
    service_date?: unknown;
    created_at?: unknown;
}): BillingPeriodPlacement {
    const declared = ymdOf(row.billable_on);
    if (declared) return { key: declared.slice(0, 7), basis: "billable_on" };
    const occurs = ymdOf(row.occurs_on);
    if (occurs) return { key: occurs.slice(0, 7), basis: "occurs_on" };
    const service = ymdOf(row.service_date);
    if (service) return { key: service.slice(0, 7), basis: "service_date" };
    const created = ymdOf(row.created_at);
    if (created) return { key: created.slice(0, 7), basis: "created_at" };
    // A row with no usable date is REPORTED, never quietly dropped into the current period.
    return { key: null, basis: "unplaceable" };
}

export function billingPeriodFromKey(key: BillingPeriodKey): BillingPeriod {
    const [yearRaw, monthRaw] = key.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const start = `${key}-01`;
    // Day 0 of the following month is the last day of this one — no month-length table, and February
    // is correct in leap years without a special case.
    const endDate = new Date(Date.UTC(year, month, 0));
    const end = endDate.toISOString().slice(0, 10);
    return { key, start, end, label: `${MONTHS[month - 1] ?? key} ${year}` };
}

/** The period a given day falls in. */
export function billingPeriodForDate(ymd: string): BillingPeriod {
    return billingPeriodFromKey(ymd.slice(0, 7));
}

/** Newest first — the order every period-grouped surface reads in. */
export function sortBillingPeriodKeysDescending(keys: Iterable<BillingPeriodKey>): BillingPeriodKey[] {
    return [...new Set(keys)].sort((a, b) => b.localeCompare(a));
}
