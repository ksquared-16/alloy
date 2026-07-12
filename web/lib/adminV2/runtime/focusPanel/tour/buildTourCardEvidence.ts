/**
 * Tour card evidence (Summary archetype).
 *
 * Operational question: "Is a tour scheduled, and when is it?"
 *
 * Pure derivation over `context.signals.tour` — never fabricates scheduling data.
 * Sources: `OperationalTourSignal` (projected from tour_bookings first-paint compose).
 *
 * @see docs/platform/operator/universal-universal-card-archetypes.md (Summary)
 */

import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export type TourCardEvidence = {
    scheduled: boolean;
    /** Formatted start label: "Jun 30 · 10:00 AM" or null when unscheduled. */
    startLabel: string | null;
    /** Raw start ISO string, null when unscheduled. */
    startAt: string | null;
    statusLabel: string | null;
    statusChip: string | null;
    statusTone: "ready" | "due" | "neutral";
    /** Primary answer line: "Tour Jun 30 · 10:00 AM" or "No tour scheduled". */
    answerLine: string;
    supportingLine: string | null;
    isEmpty: boolean;
};

function formatStartLabel(isoOrDateStr: string): string {
    const raw = isoOrDateStr.slice(0, 16).replace("T", " · ");
    return raw;
}

/** Build tour evidence from the Operational Context (pure derivation, no fetch). */
export function buildTourCardEvidence(context: OperationalContext): TourCardEvidence {
    const tour = context.signals.tour;

    if (!tour.scheduled || !tour.startAt) {
        return {
            scheduled: false,
            startLabel: null,
            startAt: null,
            statusLabel: null,
            statusChip: null,
            statusTone: "neutral",
            answerLine: "No tour scheduled",
            supportingLine: "Schedule when the family is ready to visit",
            isEmpty: true,
        };
    }

    const startLabel = formatStartLabel(tour.startAt);
    const statusLabel = tour.statusLabel ?? "Scheduled";
    const statusChip = tour.statusLabel ?? "Scheduled";
    const isConfirmed = /confirm/i.test(statusLabel);
    const statusTone: TourCardEvidence["statusTone"] = isConfirmed ? "ready" : "due";

    return {
        scheduled: true,
        startLabel,
        startAt: tour.startAt,
        statusLabel,
        statusChip,
        statusTone,
        answerLine: `Tour ${startLabel}`,
        supportingLine: `Status: ${statusLabel}`,
        isEmpty: false,
    };
}
