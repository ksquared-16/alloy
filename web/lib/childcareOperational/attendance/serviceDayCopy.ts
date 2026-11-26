/**
 * What the operator reads.
 *
 * The layer underneath speaks of modalities, standing and temporal frames because
 * it has to. A nursery manager never should: she is holding a tablet in a
 * corridor and needs to know whether to ring a parent. Every phrase here is one
 * she would say out loud.
 *
 * Pure and separate from the component so the wording is testable, and so the
 * Workspace and the Focus Panel cannot end up describing the same child two
 * different ways — which is how an operator learns to distrust both.
 */

import type { ServiceDayState } from "@/lib/childcareOperational/attendance/serviceDayExpectations";

/**
 * The reasons an operator chooses from when they say a child will not be in.
 *
 * A closed list, because a free-text reason cannot be counted, cannot be
 * reported on, and cannot be told apart from a typo six months later. The note
 * field is where the specifics go.
 */
export const CHILD_AWAY_REASONS = [
    { key: "illness", label: "Off sick" },
    { key: "vacation", label: "On holiday" },
    { key: "appointment", label: "Appointment" },
    { key: "family", label: "Family day" },
    { key: "other", label: "Other" },
] as const;

/** The reasons a site or room is not operating. */
export const CLOSURE_REASONS = [
    { key: "holiday_closure", label: "Public holiday" },
    { key: "staff_training", label: "Staff training" },
    { key: "weather_closure", label: "Bad weather" },
    { key: "maintenance", label: "Building works" },
    { key: "other", label: "Other" },
] as const;

/**
 * What a reason-less absence says. A surface that could not ask must not make one
 * up, and "Not in today" is the true statement: somebody said she is not coming,
 * and nobody said why.
 */
const UNSPECIFIED_REASON_LABEL = "Not in today";

const REASON_LABELS = new Map<string, string>([
    ["unspecified", UNSPECIFIED_REASON_LABEL],
    ...CHILD_AWAY_REASONS.map((r) => [r.key, r.label] as [string, string]),
    ...CLOSURE_REASONS.map((r) => [r.key, r.label] as [string, string]),
]);

/**
 * A reason in operator language. An unrecognised key is TIDIED, never hidden:
 * an older or imported reason still tells the operator more than silence does.
 */
export function serviceDayReasonLabel(reasonKey: string | null | undefined): string | null {
    const key = (reasonKey ?? "").trim();
    if (!key) return null;
    const known = REASON_LABELS.get(key);
    if (known) return known;
    const tidied = key.replace(/[_-]+/g, " ").trim();
    return tidied ? tidied.charAt(0).toUpperCase() + tidied.slice(1) : null;
}

/**
 * One sentence for how a child's day stands.
 *
 * `attended_despite_plan` is the phrase that matters most: she is HERE, and
 * nobody expected her. Saying only "Here" would erase the second half, and the
 * second half is the bit the operator needs to act on — a parent to call, a
 * ratio to recount, a lunch nobody ordered.
 */
export function serviceDayStateSentence(input: {
    state: ServiceDayState;
    reasonKey?: string | null;
    arrivedLabel?: string | null;
    departedLabel?: string | null;
}): string {
    const reason = serviceDayReasonLabel(input.reasonKey);
    switch (input.state) {
        case "here_now":
            return input.arrivedLabel ? `Present · ${input.arrivedLabel}` : "Present";
        case "checked_out":
            return input.departedLabel ? `Left · ${input.departedLabel}` : "Left";
        case "known_away":
            return reason ?? "Not in today";
        case "closed":
            return reason ? `Closed · ${reason}` : "Closed today";
        case "attended_despite_plan":
            return reason ? `Here · was ${reason.toLowerCase()}` : "Here · not expected today";
        case "unknown":
            // Never "normal", and never silently blank. An operator who is told
            // nothing assumes nothing is wrong.
            return "Plan unclear — check this child";
        default:
            return "Not arrived";
    }
}

/** The short chip label, when a full sentence will not fit. */
export function serviceDayChipLabel(state: ServiceDayState, reasonKey?: string | null): string {
    switch (state) {
        case "here_now":
            return "Present";
        case "checked_out":
            return "Left";
        case "known_away":
            return serviceDayReasonLabel(reasonKey) ?? "Away";
        case "closed":
            return "Closed";
        case "attended_despite_plan":
            return "Here · unplanned";
        case "unknown":
            return "Plan unclear";
        default:
            return "Not arrived";
    }
}

/**
 * The visual weight a state carries. Colour is semantic here, as everywhere in
 * this product: `unknown` is NEVER healthy, and a known absence is NEVER an
 * alarm — a child on holiday is not a problem to solve.
 */
export type ServiceDayTone = "present" | "settled" | "attention" | "unknown" | "neutral";

export function serviceDayTone(state: ServiceDayState): ServiceDayTone {
    switch (state) {
        case "here_now":
            return "present";
        case "attended_despite_plan":
            // Present, and something to notice. Not an error — she is safely here.
            return "attention";
        case "known_away":
        case "closed":
            return "settled";
        case "checked_out":
            return "neutral";
        case "unknown":
            return "unknown";
        default:
            // A child who has not arrived is the one thing on this screen that
            // might mean a phone call.
            return "attention";
    }
}
