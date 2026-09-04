/**
 * ACCOUNTING PERIODS — REPORTING ATTRIBUTION, NOT THE CUSTOMER'S BILLING CYCLE.
 *
 * ── WHY THIS IS NOT `billingPeriod.ts` ──
 *
 * `billingPeriod.ts` answers "which cycle does the operator bill this under", and its answer is a
 * calendar month derived from `charges.billable_on`. That is the CUSTOMER-facing grouping and it is
 * correct for what it does. It cannot answer "which period does this money report in", because a
 * childcare organisation may bill parents monthly while closing its books on a 4/4/5 calendar whose
 * periods start mid-week and end mid-month. Deriving one from the other collapses two identities
 * that are supposed to be able to disagree — which is precisely the disagreement a 4/4/5 calendar
 * exists to express.
 *
 * So the two live side by side: the billing period stays derived (no table, no configuration), and
 * the accounting period is CONFIGURED (`financial_accounting_calendars` + `financial_accounting_periods`)
 * because a reporting boundary that is not written down is not a boundary anybody can close.
 *
 * ── WHAT IS PURE HERE, AND WHAT IS NOT ──
 *
 * This module generates and describes period SHAPES. It resolves nothing against a database: the
 * authoritative resolution happens in `attribute_financial_journal_entry`, a BEFORE INSERT trigger,
 * because a rule the service owns is a rule a second writer can skip. What is here is the arithmetic
 * an operator needs to CONFIGURE a calendar — and 4/4/5 arithmetic is exactly the kind that is
 * quietly wrong when hand-entered.
 */

/** `starts_on`/`ends_on` are inclusive, matching the table and its exclusion constraint. */
export type AccountingPeriodShape = {
    period_key: string;
    label: string;
    starts_on: string;
    ends_on: string;
};

export type AccountingCalendarStyle = "calendar_month" | "four_four_five" | "custom";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
] as const;

/** The 4/4/5 quarter: two four-week periods then a five-week one. Twelve periods, 52 weeks. */
const FOUR_FOUR_FIVE_WEEKS = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5] as const;

function isYmd(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toUtc(ymd: string): Date {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function ymd(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function addDays(ymdValue: string, days: number): string {
    const d = toUtc(ymdValue);
    d.setUTCDate(d.getUTCDate() + days);
    return ymd(d);
}

/**
 * Twelve calendar-month periods for a fiscal year starting in `startYear`-`startMonth`.
 *
 * The ordinary case, and the one most organisations want: period boundaries ARE month boundaries,
 * so the accounting period and the billing period happen to coincide. They still are not the same
 * concept — this calendar can be closed, and a billing month cannot.
 */
export function calendarMonthPeriods(params: {
    startYear: number;
    /** 1-12. A fiscal year need not start in January. */
    startMonth: number;
    keyPrefix?: string;
}): AccountingPeriodShape[] {
    const { startYear, startMonth } = params;
    const prefix = params.keyPrefix ?? `FY${startYear}`;
    const out: AccountingPeriodShape[] = [];
    for (let i = 0; i < 12; i++) {
        const monthIndex = startMonth - 1 + i;
        const year = startYear + Math.floor(monthIndex / 12);
        const month = (monthIndex % 12) + 1;
        const first = `${year}-${String(month).padStart(2, "0")}-01`;
        // Day 0 of the next month is the last day of this one — correct in leap years with no table.
        const last = ymd(new Date(Date.UTC(year, month, 0)));
        out.push({
            period_key: `${prefix}-P${String(i + 1).padStart(2, "0")}`,
            label: `${MONTHS[month - 1]} ${year}`,
            starts_on: first,
            ends_on: last,
        });
    }
    return out;
}

/**
 * Twelve 4/4/5 periods, contiguous, starting on `fiscalYearStart`.
 *
 * Each period is a whole number of weeks, so periods drift away from month boundaries immediately —
 * which is the point, and the reason a 4/4/5 period cannot be inferred from a billing month. The
 * caller supplies the fiscal year start (conventionally a Sunday or Monday); the arithmetic does not
 * impose a weekday, because organisations disagree about which one starts a week and none of them is
 * wrong.
 *
 * The 53-week fiscal year is NOT generated here. A 53rd week is a policy decision (which quarter
 * absorbs it), and inventing one silently would put a week of money in a period nobody chose. A
 * calendar needing it authors the final period explicitly; the table accepts any boundaries that do
 * not overlap.
 */
export function fourFourFivePeriods(params: {
    /** Inclusive first day of period 1, `YYYY-MM-DD`. */
    fiscalYearStart: string;
    keyPrefix?: string;
}): AccountingPeriodShape[] {
    if (!isYmd(params.fiscalYearStart)) {
        throw new Error(`fiscalYearStart must be YYYY-MM-DD, received: ${params.fiscalYearStart}`);
    }
    const prefix = params.keyPrefix ?? `FY${params.fiscalYearStart.slice(0, 4)}`;
    const out: AccountingPeriodShape[] = [];
    let cursor = params.fiscalYearStart;
    for (let i = 0; i < FOUR_FOUR_FIVE_WEEKS.length; i++) {
        const weeks = FOUR_FOUR_FIVE_WEEKS[i];
        const endsOn = addDays(cursor, weeks * 7 - 1);
        out.push({
            period_key: `${prefix}-P${String(i + 1).padStart(2, "0")}`,
            label: `${prefix} P${String(i + 1).padStart(2, "0")} (${weeks} weeks)`,
            starts_on: cursor,
            ends_on: endsOn,
        });
        cursor = addDays(endsOn, 1);
    }
    return out;
}

/**
 * The period covering a date, or null.
 *
 * A LOCAL mirror of what the database decides, for previewing a calendar before it is written and
 * for saying WHY a write would be refused. It is not the attribution: that is the trigger's, and
 * this function deliberately cannot write anything.
 */
export function findPeriodForDate(
    periods: readonly AccountingPeriodShape[],
    date: string
): AccountingPeriodShape | null {
    const day = date.slice(0, 10);
    return periods.find((p) => p.starts_on <= day && day <= p.ends_on) ?? null;
}

/** Do any two periods in this set overlap? What the exclusion constraint refuses, checkable early. */
export function findOverlappingPeriods(
    periods: readonly AccountingPeriodShape[]
): { a: AccountingPeriodShape; b: AccountingPeriodShape } | null {
    const sorted = [...periods].sort((x, y) => x.starts_on.localeCompare(y.starts_on));
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].starts_on <= sorted[i - 1].ends_on) {
            return { a: sorted[i - 1], b: sorted[i] };
        }
    }
    return null;
}
