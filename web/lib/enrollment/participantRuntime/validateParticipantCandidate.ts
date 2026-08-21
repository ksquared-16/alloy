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
import { validateScalarValue } from "@/lib/forms/validateSubmission";
import {
    normalizeParticipantValue,
    type ParticipantNormalization,
} from "@/lib/enrollment/participantRuntime/normalizeParticipantValue";
import {
    assessParticipantValuePlausibility,
    type PlausibilityVerdict,
} from "@/lib/enrollment/participantRuntime/participantValuePlausibility";
import type { ProgramAgeRange } from "@/lib/programs/programAgeRange";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";
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
    /**
     * Parsed, but not trustworthy enough to persist.
     *
     * Distinct from a refusal on purpose: a refusal ends the attempt, a clarification CONTINUES the
     * conversation about the same need. Nothing is written either way.
     */
    | { readonly ok: false; readonly clarify: true; readonly reason: string; readonly likely?: unknown }
    | { readonly ok: false; readonly clarify?: false; readonly reason: string };

/** Everything the validator needs that is not the value itself. */
export type CandidateValidationContext = {
    /** Injected clock — plausibility must not read one. */
    readonly nowIso: string;
    /** The PROGRAMME's own age rule, when the caller resolved one. Absent applies no age rule. */
    readonly ageRange?: ProgramAgeRange | null;
};

/** Participant-facing wording for a normalization that came back suspicious. */
function suspicionReason(n: Extract<ParticipantNormalization, { kind: "suspicious" }>): string {
    return n.suspicion === "implausible_year"
        ? "That year doesn't look quite right."
        : "That date doesn't look like a real calendar date.";
}

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
    context?: CandidateValidationContext,
): CandidateValidation {
    if (raw === null || raw === undefined) return { ok: false, reason: "No value supplied." };
    if (typeof raw === "string" && raw.trim() === "") return { ok: false, reason: "No value supplied." };

    // Defensive: a need built by an older caller may carry no occurrences at all.
    const occurrence = (need.occurrences ?? [])[0] ?? null;
    const controlType = field?.type ?? occurrence?.field_type ?? null;
    const fieldKey = need.identity.field_key ?? null;
    const allowedOptions =
        field && (field.type === "select" || field.type === "multiselect") && field.static_options?.length
            ? field.static_options.map((o) => o.value)
            : (occurrence?.options ?? []).map(String);

    /**
     * STEP 1 — normalize into the AUTHORED type.
     *
     * "Aug 8, 2021" and "8/8/21" are how a parent says a date; `2021-08-08` is how the Form stores
     * one. Normalizing first is what lets the composer be genuinely useful without loosening a
     * single validation rule below it.
     */
    /**
     * The clock is the CALLER's, and its absence is meaningful.
     *
     * Without a real reference instant there is no honest way to ask "is this in the future?", so
     * plausibility does not run at all rather than run against a fabricated epoch. An early version
     * defaulted to 1970 and duly refused every real date of birth as being in the future.
     */
    const nowIso = context?.nowIso ?? null;
    const normalized = normalizeParticipantValue({
        controlType,
        fieldKey,
        allowedOptions,
        raw,
        // Only a real clock can expand a two-digit year; without one the shape is left for the
        // validator to judge rather than guessed into a century.
        referenceYear: nowIso ? Number(nowIso.slice(0, 4)) || 0 : 0,
    });

    if (normalized.kind === "suspicious") {
        /**
         * IMPOSSIBLE is refused; IMPLAUSIBLE is asked about.
         *
         * `2021-02-31` is not a day that exists — there is nothing to clarify and no correction that
         * would not be a guess. `8/8/20201` is a typo over a real date, so the parent is asked and
         * the likely reading offered.
         */
        if (normalized.suspicion === "impossible_calendar_date") {
            return { ok: false, reason: "That is not a valid calendar date." };
        }
        return {
            ok: false,
            clarify: true,
            reason: suspicionReason(normalized),
            ...(normalized.likely !== undefined ? { likely: normalized.likely } : {}),
        };
    }

    const value = normalized.kind === "normalized"
        ? normalized.value
        : (typeof raw === "string" ? raw.trim() : raw);

    /**
     * STEP 2 — the FORM'S OWN validator decides structure.
     *
     * `validateScalarValue` is the single owner of authored `min`/`max`/`pattern`, the closed option
     * set and the type checks. Delegating rather than restating is what keeps the conversation and
     * the artifact the parent signs from ever disagreeing about what is valid.
     *
     * Where no authored field reached this call the narrow type gate below still applies, so an
     * older caller cannot fall through to "anything goes".
     */
    if (field) {
        const errors = validateScalarValue(field, value, "submit", undefined, ["value"]);
        if (errors.length > 0) {
            return { ok: false, reason: participantWordingFor(errors[0]!.message, controlType) };
        }
    } else {
        const gate = narrowTypeGate(controlType, value, allowedOptions, fieldKey);
        if (!gate.ok) return gate;
    }

    /**
     * STEP 3 — plausibility, which structure cannot see.
     *
     * A future date of birth is perfectly well-formed and still impossible.
     */
    if (!nowIso) return { ok: true, value };

    const verdict: PlausibilityVerdict = assessParticipantValuePlausibility({
        canonicalKey: need.identity.canonical_key ?? null,
        fieldKey,
        label: occurrence?.label ?? null,
        controlType,
        value,
        nowIso,
        ageRange: context?.ageRange ?? null,
    });
    if (verdict.kind === "refuse") return { ok: false, reason: verdict.reason };
    if (verdict.kind === "clarify") {
        return {
            ok: false,
            clarify: true,
            reason: verdict.reason,
            ...(verdict.likely !== undefined ? { likely: verdict.likely } : {}),
        };
    }

    return { ok: true, value };
}

/**
 * The type gate for callers that have no authored field.
 *
 * Deliberately narrower than the Form validator and never a substitute for it — it exists so a
 * missing field can never become an open door.
 */
function narrowTypeGate(
    controlType: string | null,
    value: unknown,
    allowedOptions: readonly string[],
    fieldKey: string | null,
): CandidateValidation {
    if ((fieldKey ?? "").toLowerCase().includes("email") && !isValidEmail(value)) {
        return { ok: false, reason: "That does not look like an email address." };
    }
    switch (controlType) {
        case "date":
            return isValidIsoDate(value)
                ? { ok: true, value }
                : { ok: false, reason: "That is not a valid calendar date." };
        case "number":
            return typeof value === "number" && Number.isFinite(value)
                ? { ok: true, value }
                : { ok: false, reason: "That is not a number." };
        case "boolean":
            return typeof value === "boolean"
                ? { ok: true, value }
                : { ok: false, reason: "That is not a yes/no answer." };
        case "select":
        case "multiselect": {
            if (allowedOptions.length === 0) return { ok: true, value };
            return allowedOptions.includes(String(value))
                ? { ok: true, value }
                : { ok: false, reason: "That is not one of the available choices." };
        }
        default:
            return { ok: true, value };
    }
}

/**
 * Forms' validator speaks to engineers; a parent is not an engineer.
 *
 * `Expected date string YYYY-MM-DD` is a schema message. A parent gets a sentence an enrolment
 * specialist would say. The mapping is deliberately small — an unmapped message falls back to a
 * plain request to check, never to the raw code.
 */
function participantWordingFor(message: string, controlType: string | null): string {
    const m = message.toLowerCase();
    if (m.includes("email")) return "That does not look like an email address.";
    if (m.includes("invalid option") || m.includes("invalid_enum")) {
        return "That is not one of the available choices.";
    }
    if (m.startsWith("min_length") || m.startsWith("too_small") || m.startsWith("min ")) {
        return "That looks a little short — could you check it?";
    }
    if (m.startsWith("max_length") || m.startsWith("max ")) {
        return "That looks a little long — could you check it?";
    }
    if (m.includes("pattern mismatch")) return "That doesn't look quite right — could you check it?";
    if (controlType === "date") return "That is not a valid calendar date.";
    if (controlType === "number") return "That is not a number.";
    return "That doesn't look quite right — could you check it?";
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
    /** Clock + programme rules for plausibility. Absent disables plausibility, never structure. */
    readonly context?: CandidateValidationContext;
    /**
     * The parent is EXPLICITLY correcting this value — they used the typed control, not words.
     *
     * The distinction is the client's two existing payload keys and nothing new: a `value` comes
     * from the authored control the parent deliberately opened, a `text` is something they said in
     * passing. Saying a different date in passing must not silently overwrite what is on file.
     */
    readonly correctionFlow?: boolean;
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
            const validation = validateCandidateValue(
                turn.need,
                input.field,
                candidate.value,
                input.context,
            );
            if (!validation.ok) {
                if (validation.clarify) {
                    return {
                        action: "clarify",
                        question: clarificationQuestion(validation.reason, validation.likely),
                        pending: validation.likely ?? null,
                    };
                }
                return { action: "refused", reason: validation.reason };
            }

            /**
             * CONFLICT — a different value, said in passing, against one already on file.
             *
             * The runtime has both a proposed value and a newly interpreted one, and they
             * materially disagree. Overwriting silently is how a casual remark rewrites a date of
             * birth. The parent is asked; D-99 then binds the confirmation to whichever value they
             * choose, so nothing is settled without a fingerprint over it.
             */
            const existing = turn.kind === "confirm_known_value" ? turn.proposed_value : undefined;
            const disagrees =
                existing !== undefined &&
                existing !== null &&
                existing !== "" &&
                String(existing) !== String(validation.value);
            if (disagrees && !input.correctionFlow) {
                return {
                    action: "clarify",
                    question: conflictQuestion(existing, validation.value),
                    pending: validation.value,
                    existing,
                };
            }

            // A corrected value is SESSION state. It never becomes a canonical record mutation here —
            // the collect-then-commit boundary the packet runtime already draws stays drawn.
            return { action: "write_shared_value", value: validation.value };
        }
    }
}

/**
 * How a specialist asks about a value they doubt.
 *
 * A likely reading is offered only when one was derived safely upstream; otherwise the parent is
 * simply asked to check. Nothing here invents a correction.
 */
function clarificationQuestion(reason: string, likely: unknown): string {
    if (likely === undefined || likely === null || likely === "") {
        return `${reason} Could you check it for me?`;
    }
    return `${reason} Did you mean ${participantReadable(likely)}?`;
}

/** How a specialist raises a disagreement with the record — states both, decides neither. */
function conflictQuestion(existing: unknown, incoming: unknown): string {
    return `I currently have ${participantReadable(existing)}. Are you changing it to ${participantReadable(incoming)}?`;
}

/**
 * A value as a parent reads it.
 *
 * Dates go through the platform display doctrine — a clarification that quoted `2021-08-08` back at
 * a parent would be asking them to proofread a database.
 */
function participantReadable(value: unknown): string {
    if (typeof value === "boolean") return value ? "yes" : "no";
    const raw = String(value ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDisplayDate(raw, { timeZone: "UTC" }) || raw;
    return raw;
}
