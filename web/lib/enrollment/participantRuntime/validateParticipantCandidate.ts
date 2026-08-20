/**
 * Deterministic validation of a structured candidate, before ANY mutation (Phase 3).
 *
 * ## The rule
 *
 * **A provider's output is never truth merely because the provider emitted it.** Every candidate
 * passes through here, and a candidate that fails produces no mutation and returns the participant
 * to the same turn with deterministic wording. There is no path from a model's response to durable
 * state that does not cross this function.
 *
 * ## Where the rules come from
 *
 * Validation is by the Form control's own declared TYPE — the authored `date`, `number`, `boolean`,
 * `select`/`multiselect` option set, `text`. That is deliberate: the Form/Field system already owns
 * what a valid value for that control is, and restating its constraints here would create a second
 * validator that drifts. This is the narrow gate that stops obvious nonsense reaching the shared
 * value; the Form's own submission validation remains the full authority when the artifact is
 * submitted.
 *
 * A `select` is validated against the control's CLOSED vocabulary — a model cannot invent an option.
 *
 * Pure. No I/O, no clock, no provider.
 */

import type { FormField } from "@/lib/forms/schema";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import type {
    CandidateDisposition,
    ParticipantTurn,
    StructuredCandidate,
} from "@/lib/enrollment/participantRuntime/participantTurnTypes";

/** ISO calendar date, and a real one — `2021-02-31` parses loosely elsewhere and must not here. */
export function isValidIsoDate(raw: unknown): boolean {
    if (typeof raw !== "string") return false;
    const text = raw.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const [y, m, d] = text.split("-").map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
        date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    );
}

export function isValidEmail(raw: unknown): boolean {
    return typeof raw === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

export type CandidateValidation =
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly reason: string };

/**
 * Validate a corrected value against the control type the need is bound to.
 *
 * The control is taken from the need's OWN occurrences — the platform's identity for what is being
 * asked — never from anything the provider supplied.
 */
export function validateCandidateValue(
    need: EnrollmentInformationNeed,
    field: FormField | null,
    raw: unknown,
): CandidateValidation {
    if (raw === null || raw === undefined) return { ok: false, reason: "No value supplied." };
    const value = typeof raw === "string" ? raw.trim() : raw;
    if (value === "") return { ok: false, reason: "No value supplied." };

    // Field-key-driven canonical checks come first: an email is an email whatever control renders it.
    const fieldKey = (need.identity.field_key ?? "").toLowerCase();
    if (fieldKey.includes("email") && !isValidEmail(value)) {
        return { ok: false, reason: "That does not look like an email address." };
    }

    /**
     * The control type comes from the authored field when the caller has it, and otherwise from
     * the need's OWN occurrence — the platform's identity for what is being asked. Live
     * certification caught the gap this closes: the turn route supplies no FormField, so a
     * provider-corrected "August 21" reached a DATE need, fell through an untyped switch, and a
     * non-ISO string was persisted as a date of birth. The occurrence has always known the type.
     */
    const controlType = field?.type ?? need.occurrences[0]?.field_type ?? null;
    switch (controlType) {
        case "date":
            return isValidIsoDate(value)
                ? { ok: true, value }
                : { ok: false, reason: "That is not a valid calendar date." };
        case "number": {
            const n = typeof value === "number" ? value : Number(value);
            return Number.isFinite(n)
                ? { ok: true, value: n }
                : { ok: false, reason: "That is not a number." };
        }
        case "boolean":
            if (typeof value === "boolean") return { ok: true, value };
            return { ok: false, reason: "That is not a yes/no answer." };
        case "select":
        case "multiselect": {
            // CLOSED vocabulary. A model cannot invent an option that the operator never authored.
            // Re-narrowed explicitly: `controlType` may come from the occurrence, so TS no longer
            // narrows `field` to the select variant on its own.
            const selectField =
                field && (field.type === "select" || field.type === "multiselect") ? field : null;
            const allowed = selectField?.static_options?.length
                ? selectField.static_options.map((o) => o.value)
                : (need.occurrences[0]?.options ?? []).map(String);
            if (allowed.length === 0) return { ok: true, value };
            return allowed.includes(String(value))
                ? { ok: true, value }
                : { ok: false, reason: "That is not one of the available choices." };
        }
        default:
            return { ok: true, value };
    }
}

/**
 * Decide what the platform will DO about a candidate.
 *
 * A `confirmed` candidate is only honoured for a confirm turn carrying a proposed value: confirming
 * nothing is not a confirmation, and confirming a COLLECT turn would record agreement with a value
 * that does not exist.
 */
export function disposeParticipantCandidate(input: {
    readonly turn: ParticipantTurn;
    readonly candidate: StructuredCandidate;
    /** The authored control this need is bound to, for type validation. */
    readonly field: FormField | null;
}): CandidateDisposition {
    const { turn, candidate } = input;
    if (!turn.need) return { action: "refused", reason: "There is nothing to answer." };

    switch (candidate.kind) {
        case "unresolved":
        case "clarification_needed":
            return { action: "no_change", reason: candidate.kind };

        case "confirmed": {
            if (turn.kind !== "confirm_known_value") {
                return { action: "refused", reason: "There is no proposed value to confirm." };
            }
            const proposed = turn.proposed_value;
            if (proposed === null || proposed === undefined || proposed === "") {
                return { action: "refused", reason: "There is no proposed value to confirm." };
            }
            return { action: "confirm_value", value: proposed };
        }

        case "corrected_value": {
            const validation = validateCandidateValue(turn.need, input.field, candidate.value);
            if (!validation.ok) return { action: "refused", reason: validation.reason };
            // A corrected value is SESSION state. It never becomes a canonical record mutation here —
            // the collect-then-commit boundary the packet runtime already draws stays drawn.
            return { action: "write_shared_value", value: validation.value };
        }
    }
}
