/**
 * The pure ask-once collapse: pinned Form schemas x session values x confirmations -> unique needs.
 *
 * Separated from I/O so every Slice 2.4 proof is a function of explicit inputs — "15 occurrences
 * become one need" is then a statement about the RULE, not about a query.
 *
 * @see enrollmentNeedIdentity.ts — why identity is scope + subject + canonical key
 * @see enrollmentSessionConfirmations.ts — D-99, and why confirmation is bound to the value
 */

import { fieldIsInsideCollectionBoundGroup } from "@/lib/forms/prefill/formsCollectionPrefill";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import {
    resolveEnrollmentNeedIdentity,
    type EnrollmentNeedIdentity,
} from "@/lib/enrollment/informationNeeds/enrollmentNeedIdentity";
import {
    confirmationSatisfiesCurrentValue,
    type EnrollmentNeedConfirmationMap,
} from "@/lib/enrollment/informationNeeds/enrollmentSessionConfirmations";
import type {
    EnrollmentInformationNeed,
    EnrollmentNeedOccurrence,
    EnrollmentNeedState,
    EnrollmentNeedValueSource,
} from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

/** One realized, D-94-pinned Form the participant must complete for this objective. */
export type PinnedRequirementForm = {
    readonly requirement_id: string;
    readonly form_definition_id: string;
    readonly form_definition_version_id: string;
    readonly session_item_id: string;
    /** `schema_json` of THAT version. Never the definition's latest. */
    readonly schema: FormSchemaV1;
};

export type ProjectNeedsInput = {
    readonly forms: readonly PinnedRequirementForm[];
    /** The Enrollment journey's subject — `process_instances.subject_id`. */
    readonly subjectId: string | null;
    /** `form_packet_sessions.shared_values`. */
    readonly sharedValues: Readonly<Record<string, unknown>>;
    /** Canonical record prefill, by the same shared key. Lower precedence than session values. */
    readonly canonicalValues?: Readonly<Record<string, unknown>>;
    readonly confirmations: EnrollmentNeedConfirmationMap;
    /**
     * Which canonical keys require participant confirmation for this objective.
     *
     * NARROW BY DESIGN. No repository-wide assurance framework exists, and inventing one would be a
     * far larger claim than this slice earns. The caller states the policy explicitly; absent a
     * policy, a known value is simply `known`.
     */
    readonly requiresConfirmation?: ReadonlySet<string>;
};

function usableValue(raw: unknown): boolean {
    if (raw === null || raw === undefined) return false;
    if (typeof raw === "string") return raw.trim() !== "";
    return true;
}

type Accumulator = {
    identity: EnrollmentNeedIdentity;
    occurrences: EnrollmentNeedOccurrence[];
    requirementIds: Set<string>;
};

/**
 * Collapse every scalar control across every pinned Form into unique needs.
 *
 * Order is first-appearance across `forms` in input order, matching `buildPacketFieldPlan`, so the
 * output is a pure function of the input and never of the participant's progress.
 */
export function projectEnrollmentInformationNeeds(
    input: ProjectNeedsInput,
): EnrollmentInformationNeed[] {
    const byKey = new Map<string, Accumulator>();

    for (const form of input.forms) {
        walkScalarFormFields(form.schema, (field) => {
            const identity = resolveEnrollmentNeedIdentity({
                field,
                subjectId: input.subjectId,
                insideCollectionBoundGroup: fieldIsInsideCollectionBoundGroup(form.schema, field.id),
                formDefinitionVersionId: form.form_definition_version_id,
                sessionItemId: form.session_item_id,
            });

            const occurrence: EnrollmentNeedOccurrence = {
                requirement_id: form.requirement_id,
                form_definition_id: form.form_definition_id,
                form_definition_version_id: form.form_definition_version_id,
                session_item_id: form.session_item_id,
                form_field_id: field.id,
                label: field.label,
                required: field.required === true,
            };

            const existing = byKey.get(identity.key);
            if (existing) {
                existing.occurrences.push(occurrence);
                existing.requirementIds.add(form.requirement_id);
                return;
            }
            byKey.set(identity.key, {
                identity,
                occurrences: [occurrence],
                requirementIds: new Set([form.requirement_id]),
            });
        });
    }

    return [...byKey.values()].map((acc) => finalize(acc, input));
}

function finalize(acc: Accumulator, input: ProjectNeedsInput): EnrollmentInformationNeed {
    const { identity } = acc;
    const base = {
        identity,
        scope: identity.scope,
        subject_id: identity.subject_id,
        occurrence_count: acc.occurrences.length,
        occurrences: acc.occurrences,
        requirement_ids: [...acc.requirementIds],
    } as const;

    if (identity.artifact_specific || !identity.shared_value_key) {
        // Never reads or writes the shared namespace, so it has no shared value and cannot be
        // confirmed as one. Whether the participant must act on it is the Form's own business —
        // reported here as artifact-specific rather than folded into a datum it is not.
        return {
            ...base,
            state: "artifact_specific",
            has_value: false,
            current_value: null,
            value_source: "none",
            requires_participant_action: false,
        };
    }

    // Precedence mirrors `mergeFormPrefillPayload`: the session's own shared value outranks canonical
    // record prefill. Anything else would let a stale record overwrite what the parent just typed.
    const sessionValue = input.sharedValues[identity.shared_value_key];
    const canonicalValue = input.canonicalValues?.[identity.shared_value_key];

    let current_value: unknown = null;
    let value_source: EnrollmentNeedValueSource = "none";
    if (usableValue(sessionValue)) {
        current_value = sessionValue;
        value_source = "session_shared_value";
    } else if (usableValue(canonicalValue)) {
        current_value = canonicalValue;
        value_source = "canonical_prefill";
    }

    const has_value = value_source !== "none";
    if (!has_value) {
        return {
            ...base,
            state: "missing",
            has_value: false,
            current_value: null,
            value_source: "none",
            requires_participant_action: true,
        };
    }

    // D-99. A confirmation only counts against the value it was made about, so a later change
    // invalidates it with no flag to clear.
    const confirmed = confirmationSatisfiesCurrentValue(
        input.confirmations[identity.key],
        current_value,
    );
    const mustConfirm =
        input.requiresConfirmation?.has(identity.canonical_key ?? identity.shared_value_key) === true;

    let state: EnrollmentNeedState;
    if (confirmed) state = "confirmed";
    else if (mustConfirm) state = "known_requires_confirmation";
    else state = "known";

    return {
        ...base,
        state,
        has_value: true,
        current_value,
        value_source,
        requires_participant_action: state === "known_requires_confirmation",
    };
}
