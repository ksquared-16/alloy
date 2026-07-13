/**
 * Schedule financial interpretation engine (Operational Consumption, Slice 2) —
 * PURE, no DB / no IO. Answers the question that Operational Scheduling does NOT:
 *
 *   Operational Scheduling: "where should the child be?"
 *   Operational Consumption: "what financially applies because of that schedule?"
 *
 * Those are not the same question. This engine decides, for a schedule mutation,
 * which Consumption Event(s) and obligation DIRECTIVES should exist — WITHOUT
 * pricing anything. Pricing/timing are resolved downstream by the existing
 * Commercial Model (Rate Resolution + Charge Template resolver); this engine only
 * decides *what should be commercially evaluated*.
 *
 * Core doctrine: not every schedule mutation is commercial. A holiday override, a
 * one-off exception, or a no-op edit carry NO obligation by themselves.
 *
 * Doctrine: docs/platform/modules/operational-consumption-platform.md
 */

import type { ObligationKind, OperationalFactDto, ScheduleChangeKind } from "@/lib/operationalConsumption/consumptionTypes";

/** Rate Resolution schedule bases (mirror of childcare_rate_rules.schedule_basis). */
export const SCHEDULE_BASES = ["full_day", "half_day", "three_day", "four_day", "five_day", "hourly", "drop_in"] as const;
export type ScheduleBasisValue = (typeof SCHEDULE_BASES)[number];

function isScheduleBasis(v: unknown): v is ScheduleBasisValue {
    return typeof v === "string" && (SCHEDULE_BASES as readonly string[]).includes(v);
}

/**
 * Map a weekday set (and/or the pattern's schedule_type_key) to a Rate Resolution
 * schedule basis. Prefer an explicit, valid schedule_type_key; otherwise derive
 * from the number of scheduled weekdays. Returns null when no basis applies
 * (e.g. a 2-day week, which the rate card does not price → no obligation, explained).
 */
export function weekdaysToScheduleBasis(weekdays: number[] | null | undefined, scheduleTypeKey?: string | null): ScheduleBasisValue | null {
    if (isScheduleBasis(scheduleTypeKey)) return scheduleTypeKey;
    const n = Array.isArray(weekdays) ? new Set(weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)).size : 0;
    switch (n) {
        case 5:
            return "five_day";
        case 4:
            return "four_day";
        case 3:
            return "three_day";
        case 1:
            return "drop_in";
        default:
            return null;
    }
}

/** A directive: which Consumption Event + obligation should be commercially evaluated. */
export type ConsumptionDirective = {
    obligationKind: ObligationKind;
    /** The Consumption Event Type key (registry) this directive records under. */
    eventKey: string;
    /** Rate Resolution schedule basis for this directive (null => fixed template or not rate-resolvable). */
    scheduleBasis: ScheduleBasisValue | null;
    /** Whether this directive should attempt a draft charge (a credit is preview-only). */
    draftable: boolean;
    /** Why this directive exists (surfaced in the explanation). */
    reason: string;
    /** Multiplier applied to a rate-derived amount (e.g. hours for hourly care). Defaults to 1. */
    unitMultiplier?: number | null;
};

export type ScheduleInterpretation = {
    scheduleChangeKind: ScheduleChangeKind;
    directives: ConsumptionDirective[];
    /** Set when the mutation has NO financial impact (zero directives), explaining why. */
    noImpactReason: string | null;
};

function noImpact(scheduleChangeKind: ScheduleChangeKind, reason: string): ScheduleInterpretation {
    return { scheduleChangeKind, directives: [], noImpactReason: reason };
}

/**
 * Interpret a schedule fact into zero-or-more obligation directives. Pure.
 * `scheduleChangeKind` defaults to "recurring" (the steady-state tuition case).
 */
export function interpretSchedule(fact: OperationalFactDto): ScheduleInterpretation {
    const kind: ScheduleChangeKind = fact.scheduleChangeKind ?? "recurring";

    // D12a: a reversal produces ZERO directives (no impact); the prior obligation is
    // reconciled by supersession. A correction re-interprets the corrected values.
    if ((fact.entryType ?? "original") === "reversal") {
        return { scheduleChangeKind: kind, directives: [], noImpactReason: "reversal of prior fact — obligations reconciled by supersession" };
    }

    const basis = isScheduleBasis(fact.scheduleBasis) ? fact.scheduleBasis : weekdaysToScheduleBasis(fact.weekdays);
    const priorBasis = isScheduleBasis(fact.priorScheduleBasis) ? fact.priorScheduleBasis : null;

    switch (kind) {
        case "recurring":
            return basis
                ? {
                      scheduleChangeKind: kind,
                      directives: [{ obligationKind: "recurring_tuition", eventKey: "schedule.recurring_tuition", scheduleBasis: basis, draftable: true, reason: "Recurring schedule → recurring tuition for the service period." }],
                      noImpactReason: null,
                  }
                : noImpact(kind, "Schedule basis is not rate-resolvable from the pattern (no matching rate rule basis); no recurring tuition.");

        case "temporary":
            return basis
                ? {
                      scheduleChangeKind: kind,
                      // Proration is preview-only in Slice 2: a mid-period money adjustment is
                      // resolved + explained, but a credit/adjustment charge posts downstream.
                      directives: [{ obligationKind: "proration", eventKey: "schedule.proration", scheduleBasis: basis, draftable: false, reason: "Temporary schedule → tuition prorated across the affected partial period (preview only; adjustment posts downstream)." }],
                      noImpactReason: null,
                  }
                : noImpact(kind, "Temporary schedule basis is not rate-resolvable; no proration obligation.");

        case "extra_day":
            return {
                scheduleChangeKind: kind,
                directives: [{ obligationKind: "extra_day", eventKey: "schedule.extra_day", scheduleBasis: "drop_in", draftable: true, reason: "Extra day beyond the recurring schedule → charged at the drop-in rate." }],
                noImpactReason: null,
            };

        case "drop_in":
            return {
                scheduleChangeKind: kind,
                directives: [{ obligationKind: "drop_in", eventKey: "schedule.drop_in", scheduleBasis: "drop_in", draftable: true, reason: "Drop-in day → charged at the drop-in rate." }],
                noImpactReason: null,
            };

        case "replacement": {
            const directives: ConsumptionDirective[] = [
                // The prior schedule ended mid-period → a proration CREDIT. Credits are
                // preview-only here; Posting (downstream) is the only authoritative write.
                { obligationKind: "proration_credit", eventKey: "schedule.proration", scheduleBasis: priorBasis, draftable: false, reason: "Prior schedule ended mid-period → proration credit (preview only; credits post downstream)." },
            ];
            if (basis) {
                directives.push({ obligationKind: "recurring_tuition", eventKey: "schedule.recurring_tuition", scheduleBasis: basis, draftable: true, reason: "Replacement schedule → recurring tuition at the new basis." });
            }
            return { scheduleChangeKind: kind, directives, noImpactReason: basis ? null : "Replacement schedule basis not rate-resolvable; only the proration credit was interpreted." };
        }

        case "holiday_override":
            return noImpact(kind, "Holiday override changes attendance, not the recurring commercial obligation — no financial impact.");

        case "exception":
            return noImpact(kind, "A one-off schedule exception carries no financial obligation by itself.");

        case "no_op":
            return noImpact(kind, "Schedule edit did not change the billable shape (no-op) — no obligation.");

        default:
            return noImpact("no_op", "Unrecognized schedule change kind — no obligation.");
    }
}

/**
 * Prorate a period amount by affected/total days. Pure. Returns null when inputs
 * are missing/invalid so the obligation previews honestly ("proration inputs not supplied").
 */
export function prorateAmountCents(amountCents: number | null, proratedDays: number | null | undefined, periodDays: number | null | undefined): number | null {
    if (amountCents == null) return null;
    if (proratedDays == null || periodDays == null) return null;
    if (!Number.isFinite(proratedDays) || !Number.isFinite(periodDays) || periodDays <= 0 || proratedDays < 0) return null;
    return Math.round((amountCents * proratedDays) / periodDays);
}
