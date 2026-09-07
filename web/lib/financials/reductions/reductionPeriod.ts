/**
 * The calendar bounds of a `YYYY-MM` billing period.
 *
 * Deliberately tiny and deliberately shared: the resolver, the applier and the certification must
 * agree about what September is, and three copies of "last day of the month" is how they stop
 * agreeing. Billing period only — accounting attribution stays Thread 5's, derived from the charge.
 */
export function billingPeriodBounds(periodKey: string): { start: string; end: string } {
    if (!/^\d{4}-\d{2}$/.test(periodKey)) throw new Error("period_key must be YYYY-MM");
    const [year, month] = periodKey.split("-").map(Number) as [number, number];
    const start = `${periodKey}-01`;
    // Day 0 of the next month is the last day of this one — no month-length table, no leap-year case.
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { start, end: `${periodKey}-${String(lastDay).padStart(2, "0")}` };
}
