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
import {
    formatTourStartLabel,
    formatTourStatusLabel,
    isTourTerminalStatus,
} from "@/lib/adminV2/runtime/focusPanel/tour/tourPresentation";

export type TourCardEvidence = {
    scheduled: boolean;
    /** Formatted start label: "Mon, Jun 30, 10:00 AM" or null when unscheduled. */
    startLabel: string | null;
    /** Raw start ISO string, null when unscheduled. */
    startAt: string | null;
    /** Operator-facing status, humanized from the raw booking key. */
    statusLabel: string | null;
    statusChip: string | null;
    statusTone: "ready" | "due" | "neutral";
    /** The tour has happened (or provably has not) — scheduling actions are over. */
    terminal: boolean;
    /** Primary answer line: "Tour Jun 30 · 10:00 AM" or "No tour scheduled". */
    answerLine: string;
    supportingLine: string | null;
    isEmpty: boolean;
};

/**
 * Build tour evidence from the Operational Context (pure derivation, no fetch).
 *
 * `timeZone` is the viewer's zone. Omitted, the runtime's default is used — which is right for
 * tests and wrong for an operator in another zone, so hosts pass it.
 */
export function buildTourCardEvidence(
    context: OperationalContext,
    timeZone?: string | null,
): TourCardEvidence {
    const tour = context.signals.tour;

    if (!tour.scheduled || !tour.startAt) {
        return {
            scheduled: false,
            startLabel: null,
            startAt: null,
            statusLabel: null,
            statusChip: null,
            statusTone: "neutral",
            terminal: false,
            answerLine: "No tour scheduled",
            supportingLine: "Schedule when the family is ready to visit",
            isEmpty: true,
        };
    }

    // The signal carries the RAW booking key, so this is where it stops being one.
    const startLabel = formatTourStartLabel(tour.startAt, timeZone);
    const statusLabel = formatTourStatusLabel(tour.statusLabel) ?? "Scheduled";
    const terminal = isTourTerminalStatus(tour.statusLabel);
    const isConfirmed = /confirm/i.test(statusLabel);
    const statusTone: TourCardEvidence["statusTone"] =
        terminal ? "neutral"
        : isConfirmed ? "ready"
        : "due";

    return {
        scheduled: true,
        startLabel,
        startAt: tour.startAt,
        statusLabel,
        statusChip: statusLabel,
        statusTone,
        terminal,
        // A start we cannot format must not become the words "Tour null".
        answerLine: startLabel ? `Tour ${startLabel}` : "Tour scheduled",
        supportingLine: `Status: ${statusLabel}`,
        isEmpty: false,
    };
}
