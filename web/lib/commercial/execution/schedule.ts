/**
 * Commercial Execution — temporal expansion (`expand`) output types.
 *
 * `expand()` is the PLATFORM-owned temporal engine: it turns a point-in-time
 * Commercial Resolution into a timeline of dated occurrences (due dates,
 * recognition timing). It is shared so temporal logic is never duplicated across
 * Billing cycles, a Quote's payment schedule, and a Forecast's revenue curve.
 *
 * `materialize()` is deliberately NOT here — it is the consumer's concern (turning
 * a neutral timeline into Draft Charges / Forecast rows / Quote rows). No Billing
 * concept ever crosses into the platform.
 *
 * Phase 2 (core types) — declarations only; the expander lands in Phase 7.
 * Doctrine: docs/platform/core/commercial-execution-platform.md §4, §6.
 */

import type {
    CadenceRef,
    CommercialLineKind,
    CommercialSourceRef,
    LineAccounting,
    Money,
    RecognitionTreatment,
} from "@/lib/commercial/execution/executionTypes";
import type { FundingAttribution } from "@/lib/commercial/execution/funding";

/** An inclusive date window over which to expand a resolution. */
export type DateRange = { start: string; end: string };

/**
 * One dated occurrence of a resolved line. Neutral: it says WHEN an amount is due
 * and WHEN its revenue recognizes — it does not say what record to create.
 */
export type ScheduledOccurrence = {
    /** The resolution line this occurrence expands from. */
    lineKey: string;
    kind: CommercialLineKind;
    /** Sequence index within the line's series (0-based). */
    sequence: number;
    /** The service/coverage period this occurrence bills for. */
    period: DateRange;
    /** When the amount is due (YYYY-MM-DD). */
    dueOn: string;
    /** When revenue recognizes, honoring the line's recognition treatment. */
    recognizeOn: string;
    recognition: RecognitionTreatment;
    /** The occurrence amount (already platform-rounded on the resolution). */
    amount: Money;
    cadence: CadenceRef;
    /** Preserved from the resolution line so each occurrence is self-describing. */
    source: CommercialSourceRef;
    accounting: LineAccounting;
    /** Funding attribution carried from the line (per-period; null if unattributed). */
    funding: FundingAttribution | null;
    /** Deterministic key for this occurrence — idempotency for consumer materialization. */
    occurrenceKey: string;
};

/**
 * The expanded timeline for a whole resolution. Consumers run their own
 * `materialize()` over `occurrences`.
 */
export type CommercialSchedule = {
    /** The resolution this schedule was expanded from. */
    resolutionKey: string;
    horizon: DateRange;
    occurrences: ScheduledOccurrence[];
};
