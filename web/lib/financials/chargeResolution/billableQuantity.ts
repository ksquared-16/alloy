/**
 * Derive the billable QUANTITY for a draft childcare charge from the resolved
 * rate basis + calculation strategy + scheduled/actual signal. Pure — no DB.
 *
 * P3.3 keeps quantity deterministic and small:
 *
 *   rate_basis monthly / annual / weekly  -> periodic FLAT (quantity = 1)
 *     (the rule amount already expresses one period; P3.3 does not prorate.)
 *
 *   rate_basis daily / session            -> count of UNITS in the service period
 *     scheduled        -> scheduled days in period (from pattern weekdays)
 *     attendance_actual-> attended days in period (from P2 attendance facts)
 *     hybrid           -> scheduled days (documented fallback; flagged placeholder)
 *     fixed            -> 1 (flat rule amount)
 *
 *   rate_basis hourly                      -> hours
 *     requires an explicit `hours` signal; without it the quantity is
 *     unresolved (P3.3 cannot derive hours from a weekday pattern).
 *
 * `fixed` strategy always collapses to quantity = 1 regardless of basis.
 *
 * A quantity of 0 (or unresolved) means "do not create a draft" — the substrate
 * forbids zero-amount charges and P3.3 must not emit empty drafts.
 */

import { enumerateDates, weekdayOf } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import type { CalculationStrategy, RateBasis } from "@/lib/financials/rates/rateTypes";

export type BillableQuantitySignal = {
    /** Service dates the schedule pattern covers within the period (intent). */
    scheduledDates?: readonly string[];
    /** Service dates the child was present within the period (P2 facts). */
    attendedDates?: readonly string[];
    /** Explicit hours signal for hourly basis (intent or actual). */
    hours?: number | null;
};

export type BillableQuantityResult =
    | {
          resolved: true;
          quantity: number;
          unit: "period" | "day" | "hour";
          /** Set when a strategy is approximated rather than fully implemented. */
          placeholder?: string;
      }
    | {
          resolved: false;
          reason: string;
      };

const FLAT_PERIOD_BASES: ReadonlySet<RateBasis> = new Set(["monthly", "annual", "weekly"]);
const PER_DAY_BASES: ReadonlySet<RateBasis> = new Set(["daily", "session"]);

/** Scheduled service dates inside [periodStart, periodEnd] for a weekday pattern. */
export function scheduledServiceDates(
    periodStart: string,
    periodEnd: string,
    weekdays: readonly number[] | null | undefined
): string[] {
    const wanted = new Set((weekdays ?? []).filter((d) => Number.isInteger(d)));
    if (wanted.size === 0) return [];
    return enumerateDates(periodStart, periodEnd).filter((d) => wanted.has(weekdayOf(d)));
}

function countInPeriod(dates: readonly string[] | undefined, start: string, end: string): number {
    if (!dates || dates.length === 0) return 0;
    let count = 0;
    for (const d of dates) {
        if (d >= start && d <= end) count += 1;
    }
    return count;
}

export function deriveBillableQuantity(input: {
    rateBasis: RateBasis;
    calculationStrategy: CalculationStrategy;
    periodStart: string;
    periodEnd: string;
    signal?: BillableQuantitySignal;
}): BillableQuantityResult {
    const { rateBasis, calculationStrategy, periodStart, periodEnd } = input;
    const signal = input.signal ?? {};

    if (calculationStrategy === "fixed") {
        return { resolved: true, quantity: 1, unit: "period" };
    }

    if (FLAT_PERIOD_BASES.has(rateBasis)) {
        // Periodic flat rate: one period == one unit. P3.3 does not prorate.
        return { resolved: true, quantity: 1, unit: "period" };
    }

    if (rateBasis === "hourly") {
        const hours = signal.hours ?? null;
        if (hours == null || !(hours > 0)) {
            return {
                resolved: false,
                reason: "hourly_quantity_requires_hours_signal",
            };
        }
        return { resolved: true, quantity: hours, unit: "hour" };
    }

    if (PER_DAY_BASES.has(rateBasis)) {
        if (calculationStrategy === "attendance_actual") {
            const qty = countInPeriod(signal.attendedDates, periodStart, periodEnd);
            if (qty <= 0) return { resolved: false, reason: "no_attended_days_in_period" };
            return { resolved: true, quantity: qty, unit: "day" };
        }
        // scheduled + hybrid both source from scheduled days in P3.3.
        const qty = countInPeriod(signal.scheduledDates, periodStart, periodEnd);
        if (qty <= 0) return { resolved: false, reason: "no_scheduled_days_in_period" };
        return calculationStrategy === "hybrid"
            ? {
                  resolved: true,
                  quantity: qty,
                  unit: "day",
                  placeholder: "hybrid_uses_scheduled_fallback",
              }
            : { resolved: true, quantity: qty, unit: "day" };
    }

    return { resolved: false, reason: `unsupported_rate_basis:${rateBasis}` };
}
