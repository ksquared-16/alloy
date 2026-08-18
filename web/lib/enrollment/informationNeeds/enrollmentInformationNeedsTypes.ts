/**
 * Unique participant information needs for one Enrollment objective (Slice 2.4).
 *
 * The product invariant, stated as a type: a participant is asked for or asked to confirm the same
 * canonical fact **at most once per Enrollment objective**, however many required Forms contain it.
 *
 * ```
 *   15 DOB controls across required Forms
 *     -> ONE need, occurrences = 15, every target retained
 *     -> parent confirms or supplies once
 *     -> all 15 prefill targets receive the same value
 * ```
 *
 * This is the deterministic substrate a future Trust-governed conversation consumes. It contains no
 * prose, no prompts, no confidence and no inference — every state is a fact about a value that
 * either exists or does not, and a confirmation that either matches the current value or does not.
 */

import type { FieldScope } from "@/lib/forms/fieldScope";
import type { EnrollmentNeedIdentity } from "@/lib/enrollment/informationNeeds/enrollmentNeedIdentity";

/**
 * The smallest vocabulary the repository can actually prove.
 *
 * - `missing`                    — no usable value in session or canonical prefill.
 * - `known`                      — a usable value exists and policy does not require confirmation.
 * - `known_requires_confirmation`— a usable value exists and this objective still needs the
 *                                  participant to confirm it. The state that makes
 *                                  "We have DOB as May 4, 2021. Is that correct?" possible without
 *                                  silently assuming stored data is current.
 * - `confirmed`                  — the participant confirmed THIS exact value in THIS session (D-99).
 * - `artifact_specific`          — cannot join shared-value dedupe: recipient scope (every
 *                                  signature), a collection-bound repeat, or an unbound field.
 *
 * `conflicting` is deliberately ABSENT. Nothing in the repository can today prove two authoritative
 * sources disagree, and inventing the state would mean inferring conflict — which this slice forbids.
 * Adding it later is additive; asserting it now would be fiction.
 */
export const ENROLLMENT_NEED_STATES = [
    "missing",
    "known",
    "known_requires_confirmation",
    "confirmed",
    "artifact_specific",
] as const;

export type EnrollmentNeedState = (typeof ENROLLMENT_NEED_STATES)[number];

/** Where the current usable value came from. Only categories the repository already distinguishes. */
export type EnrollmentNeedValueSource = "session_shared_value" | "canonical_prefill" | "none";

/** One place this need is consumed — kept so a future conversation can name its targets. */
export type EnrollmentNeedOccurrence = {
    readonly requirement_id: string;
    readonly form_definition_id: string;
    /** The D-94 pinned version. Never the latest published one. */
    readonly form_definition_version_id: string;
    readonly session_item_id: string;
    readonly form_field_id: string;
    readonly label: string;
    readonly required: boolean;
    /**
     * The AUTHORED control type — `date`, `boolean`, `select`, `text`, `signature`, …
     *
     * Carried because the conversational surface must offer the same kind of control the Form does:
     * a date need deserves a date picker whether or not a model is available, and deriving it from
     * the label was the reason every need rendered as an undifferentiated text box.
     */
    readonly field_type: string;
    /** Closed option set for `select`-shaped controls. Empty when the field is open-ended. */
    readonly options: readonly string[];
};

export type EnrollmentInformationNeed = {
    readonly identity: EnrollmentNeedIdentity;
    readonly scope: FieldScope;
    readonly subject_id: string | null;
    readonly state: EnrollmentNeedState;
    /** How many Form controls resolve to this one need. The ask-once ratio. */
    readonly occurrence_count: number;
    readonly occurrences: readonly EnrollmentNeedOccurrence[];
    /** Distinct governing requirements that caused this need to exist. */
    readonly requirement_ids: readonly string[];
    readonly has_value: boolean;
    /**
     * The current proposed value, so a conversation can say what it already has.
     *
     * Carried only for needs the participant may be asked about. It is the same value the packet
     * prefill path already renders into every one of these Forms, so surfacing it here reveals
     * nothing the participant is not about to see anyway.
     */
    readonly current_value: unknown;
    readonly value_source: EnrollmentNeedValueSource;
    /** True when the participant must still do something: supply or confirm. */
    readonly requires_participant_action: boolean;
};

export type EnrollmentInformationNeeds = {
    readonly process_instance_id: string;
    readonly session_id: string | null;
    readonly business_process_revision_id: string | null;
    readonly stage_key: string | null;
    readonly subject_id: string | null;
    readonly total_needs: number;
    /** Needs still requiring the participant to supply or confirm — the "3 things remaining" number. */
    readonly needs_requiring_action: number;
    readonly needs: readonly EnrollmentInformationNeed[];
};

/** Counts derived from the rows, never tracked beside them. */
export function summarizeEnrollmentInformationNeeds(
    needs: readonly EnrollmentInformationNeed[],
): Pick<EnrollmentInformationNeeds, "total_needs" | "needs_requiring_action"> {
    return {
        total_needs: needs.length,
        needs_requiring_action: needs.filter((n) => n.requires_participant_action).length,
    };
}
