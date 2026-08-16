/**
 * The pure join: requirements x realization x evidence -> deterministic progress.
 *
 * Separated from the I/O resolver so every proof in Slice 2.3 can be stated as a function of
 * explicit inputs. Nothing here reads a database, a clock or a cache, so a test that says
 * "before completion -> outstanding, after completion -> satisfied" is testing the rule and not the
 * plumbing.
 *
 * @see enrollmentParticipantProgressTypes.ts — the authority split this implements
 */

import {
    formSubmissionStatusIsComplete,
} from "@/lib/forms/formSubmissionCompletion";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";
import type {
    EnrollmentRequirementProgress,
    EnrollmentSatisfactionEvidence,
} from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";

/**
 * One realized packet step, flattened with the evidence it points at.
 *
 * `form_definition_id` comes from the packet ITEM (what the step is), while
 * `resolved_form_definition_version_id` is the D-94 session pin (what the participant transacts
 * against). Both are carried because the requirement matches on the definition and the evidence is
 * reported against the version.
 */
export type RealizedSessionFormItem = {
    readonly session_item_id: string;
    readonly form_definition_id: string;
    readonly resolved_form_definition_version_id: string | null;
    readonly form_submission_id: string | null;
    /** `form_submissions.status`. Deliberately NOT the packet item's own status. */
    readonly submission_status: string | null;
};

const UNSUPPORTED_KIND_REASON: Record<string, string> = {
    field: "Field requirement evidence has no canonical owner yet; Slice 2.4 owns unique-fact resolution.",
    document: "No canonical document-requirement owner exists outside a form submission.",
    consent: "No canonical consent record exists in the platform.",
    acknowledgment: "No canonical acknowledgment record exists in the platform.",
    signature: "Signature evidence exists only as part of a form submission.",
};

function artifactIdFor(ref: StageRequirementV1["ref"]): string {
    switch (ref.kind) {
        case "field":
            return ref.rule_id;
        case "form":
            return ref.form_definition_id;
        case "document":
            return ref.document_type_key;
        case "consent":
            return ref.consent_key;
        case "acknowledgment":
            return ref.acknowledgment_key;
        case "signature":
            return ref.signature_key;
    }
}

/**
 * Project one requirement against what the participant's session actually realizes.
 *
 * Form requirements match on `form_definition_id` — the requirement holds a DEFINITION id, never a
 * version, so a form republished mid-journey still satisfies it (Forms owns version selection, and
 * D-94 already froze which version this participant sees).
 *
 * When a definition is realized more than once in a packet, the FIRST COMPLETE step satisfies it,
 * falling back to the first realized step when none is complete. That is deliberate rather than
 * arbitrary: a requirement asks whether the artifact was provided, and one complete submission
 * answers yes regardless of how many times the packet happens to render it. D-93 is the same
 * principle from the other side — requirement progress does not imply one question per occurrence.
 */
export function projectRequirementProgress(
    requirement: StageRequirementV1,
    realizedByFormDefinition: ReadonlyMap<string, readonly RealizedSessionFormItem[]>,
): EnrollmentRequirementProgress {
    const artifact = { kind: requirement.ref.kind, id: artifactIdFor(requirement.ref) };
    const base = {
        requirement_id: requirement.requirement_id,
        kind: requirement.ref.kind,
        artifact,
        level: requirement.level,
    } as const;

    if (requirement.ref.kind !== "form") {
        // Reported plainly, and NOT satisfied. Guessing here would let an unevaluable requirement
        // silently inflate progress — the one failure a denominator must never have.
        return {
            ...base,
            status: "unsupported",
            reason: UNSUPPORTED_KIND_REASON[requirement.ref.kind] ?? "No canonical evidence owner.",
        };
    }

    const realized = realizedByFormDefinition.get(requirement.ref.form_definition_id) ?? [];
    if (realized.length === 0) {
        // FAILS CLOSED. The governing revision requires this form and the packet does not contain
        // it. It stays in the denominator so an incomplete packet configuration cannot look like a
        // completed enrollment.
        return {
            ...base,
            status: "unrealized",
            reason: "The governing Business Process revision requires this form, but the participant's packet does not include it.",
        };
    }

    const complete = realized.find(
        (item) => item.form_submission_id && formSubmissionStatusIsComplete(item.submission_status),
    );
    if (!complete) return { ...base, status: "outstanding" };

    const evidence: EnrollmentSatisfactionEvidence = {
        kind: "form_submission",
        form_submission_id: complete.form_submission_id!,
        form_definition_version_id: complete.resolved_form_definition_version_id,
        session_item_id: complete.session_item_id,
    };
    return { ...base, status: "satisfied", evidence };
}

/** Group realized steps by the form definition they render, preserving packet order. */
export function indexRealizedFormItems(
    items: readonly RealizedSessionFormItem[],
): Map<string, RealizedSessionFormItem[]> {
    const byDefinition = new Map<string, RealizedSessionFormItem[]>();
    for (const item of items) {
        const key = item.form_definition_id.trim();
        if (!key) continue;
        const bucket = byDefinition.get(key);
        if (bucket) bucket.push(item);
        else byDefinition.set(key, [item]);
    }
    return byDefinition;
}

/**
 * Project every requirement, in the order the governing revision authored them.
 *
 * Authored order is preserved rather than sorted by status: the requirement list is configuration,
 * and re-ordering it by "what's left" would make the projection's shape depend on the participant's
 * progress, which no consumer asked for and every consumer would then depend on.
 */
export function projectRequirementsProgress(
    requirements: readonly StageRequirementV1[],
    realizedItems: readonly RealizedSessionFormItem[],
): EnrollmentRequirementProgress[] {
    const index = indexRealizedFormItems(realizedItems);
    return requirements.map((requirement) => projectRequirementProgress(requirement, index));
}
