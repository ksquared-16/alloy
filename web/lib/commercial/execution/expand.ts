/**
 * Commercial Execution — temporal expansion (`expand`), pure & platform-owned.
 *
 * expand(resolution, horizon) turns a point-in-time CommercialResolution into a
 * timeline of dated ScheduledOccurrences: it respects cadence, distinguishes
 * one-time from recurring lines, and carries each line's provenance, funding, and
 * accounting (incl. recognition timing) onto every occurrence so a consumer can
 * materialize from a single occurrence.
 *
 * This is the SHARED temporal engine — Billing cycles, a Quote's payment schedule,
 * and a Forecast's revenue curve all build on it, so temporal logic is written
 * once. It produces NO Billing records, draft charges, obligations, or invoices,
 * and keeps Billing vocabulary out. `materialize()` (consumer-owned) is separate.
 *
 * Date math uses date-fns (the project's date library); the existing recurring
 * logic (generateNextSubscriptionSchedule / resolveChargeFromTemplate) is
 * DB-coupled and Billing-specific, so only the cadence+interval APPROACH is
 * mirrored, not the code.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §4, §6.
 */

import { addDays, addMonths, addWeeks, addYears, format, parseISO } from "date-fns";
import type { CommercialResolution, ResolvedCommercialLine } from "@/lib/commercial/execution/executionTypes";
import type { CommercialSchedule, DateRange, ScheduledOccurrence } from "@/lib/commercial/execution/schedule";

/** Safety bound so a pathological anchor/horizon can't loop unbounded. */
const MAX_OCCURRENCES_PER_LINE = 4000;

type Stepper = (d: Date) => Date;

/** Calendar cadences step across the horizon; usage/one-time cadences do not. */
const CADENCE_STEPPERS: Record<string, Stepper> = {
    daily: (d) => addDays(d, 1),
    weekly: (d) => addWeeks(d, 1),
    biweekly: (d) => addWeeks(d, 2),
    monthly: (d) => addMonths(d, 1),
    annual: (d) => addYears(d, 1),
    // hourly / per_session / per_use are usage-metered — no calendar recurrence.
};

function ymd(d: Date): string {
    return format(d, "yyyy-MM-dd");
}

/** A recurring occurrence's coverage period = [start, nextStart − 1 day]. */
function periodEnd(startYmd: string, step: Stepper): string {
    return ymd(addDays(step(parseISO(startYmd)), -1));
}

function makeOccurrence(line: ResolvedCommercialLine, resolutionKey: string, sequence: number, period: DateRange): ScheduledOccurrence {
    const dueOn = period.start;
    return {
        lineKey: line.lineKey,
        kind: line.kind,
        sequence,
        period,
        dueOn,
        // Recognition begins at the period start; `recognition` carries the treatment
        // (immediate / deferred / liability) for the consumer's accounting to apply.
        recognizeOn: period.start,
        recognition: line.accounting.recognition,
        amount: line.net, // per-period net (resolution net is already per-period)
        cadence: line.cadence,
        source: line.source,
        accounting: line.accounting,
        funding: line.funding,
        occurrenceKey: `${resolutionKey}:${line.lineKey}:${dueOn}`,
    };
}

/**
 * Expand a resolution into dated occurrences over [horizon.start, horizon.end].
 * Only `resolved` lines expand. Recurring lines step by cadence from the
 * resolution's anchor; one-time and usage-metered lines emit a single occurrence.
 */
export function expand(resolution: CommercialResolution, horizon: DateRange): CommercialSchedule {
    const anchor = resolution.effective.window?.start ?? resolution.effective.asOf;
    const occurrences: ScheduledOccurrence[] = [];

    for (const line of resolution.lines) {
        if (line.status !== "resolved") continue;
        const cadenceKey = line.cadence?.cadenceKey ?? null;
        const step = cadenceKey ? CADENCE_STEPPERS[cadenceKey] : undefined;

        if (!step) {
            // One-time or usage-metered → a single occurrence at the anchor, if in horizon.
            if (anchor >= horizon.start && anchor <= horizon.end) {
                occurrences.push(makeOccurrence(line, resolution.resolutionKey, 0, { start: anchor, end: anchor }));
            }
            continue;
        }

        // Recurring: step from the anchor; emit occurrences that fall within the horizon.
        let cursor = parseISO(anchor);
        for (let seq = 0; seq < MAX_OCCURRENCES_PER_LINE; seq++) {
            const start = ymd(cursor);
            if (start > horizon.end) break;
            if (start >= horizon.start) {
                occurrences.push(makeOccurrence(line, resolution.resolutionKey, seq, { start, end: periodEnd(start, step) }));
            }
            cursor = step(cursor);
        }
    }

    return { resolutionKey: resolution.resolutionKey, horizon, occurrences };
}
