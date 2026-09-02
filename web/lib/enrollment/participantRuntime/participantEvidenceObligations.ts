/**
 * The evidence a participant still owes — asked for BEFORE the paperwork is prepared.
 *
 * ## The ordering this corrects
 *
 * The runtime said "Great — that's everything I needed. I filled out Chidinma's enrollment
 * paperwork", showed [Review paperwork], and only then — inside the review — did the Oregon CIS ask
 * for the immunization record. Two things were wrong with that. The sentence was untrue: a required
 * attachment had not been asked for, let alone supplied. And the ordering forecloses the future,
 * because a document that arrives AFTER the artifact is prepared cannot inform it.
 *
 * The corrected order is:
 *
 * ```
 *   confirm known information
 *     -> collect missing information
 *     -> collect required evidence          <- this module
 *     -> apply what the evidence supports   <- Health/Processing, when it exists
 *     -> prepare artifacts
 *     -> review, sign, complete
 * ```
 *
 * ## The seam this establishes, and what it deliberately does NOT do
 *
 * Evidence is on file before generation, so a future Health immunization extraction can populate
 * structured dose truth and the CIS can be regenerated before the parent ever reads it — without
 * redesigning the participant runtime. That is the whole point of moving the step.
 *
 * It does not extract anything. V1 truthfulness is unchanged: an upload creates a canonical
 * Document, and NOTHING infers a vaccine dose from the existence of a file. The CIS vaccine grid
 * stays blank until Health supplies real dose truth. Attaching a record is evidence that a record
 * exists, not evidence of what it says.
 *
 * ## Only genuinely required evidence blocks
 *
 * `required` comes from the authored control. An optional attachment is offered and never gates
 * preparation — making it blocking for presentation's sake would invent an obligation the school
 * never stated.
 *
 * Pure. No I/O.
 */

import {
    participantUploadRequests,
    type ParticipantUploadRequest,
} from "@/lib/enrollment/participantRuntime/participantUploadRequests";
import type { PinnedRequirementForm } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";

export type ParticipantEvidenceObligation = ParticipantUploadRequest & {
    /** The pinned artifact that asks for it — so the surface can say which document needs it. */
    readonly form_definition_id: string;
    readonly form_definition_version_id: string;
    readonly session_item_id: string;
    readonly artifact_title: string;
};

/**
 * Every attachment the pinned artifacts ask for, across the whole packet.
 *
 * Across ALL required forms rather than the active one: the parent is being asked for what this
 * enrolment needs, and discovering a second obligation only after the first artifact is prepared
 * would reproduce the defect one document later.
 */
export function participantEvidenceObligations(
    forms: readonly PinnedRequirementForm[],
): ParticipantEvidenceObligation[] {
    const out: ParticipantEvidenceObligation[] = [];
    for (const form of forms) {
        const title = ((form.schema as { title?: string }).title ?? "").trim() || "this form";
        for (const request of participantUploadRequests(form.schema)) {
            out.push({
                ...request,
                form_definition_id: form.form_definition_id,
                form_definition_version_id: form.form_definition_version_id,
                session_item_id: form.session_item_id,
                artifact_title: title,
            });
        }
    }
    return out;
}

/**
 * The REQUIRED evidence still outstanding.
 *
 * `onFile` is the set of field ids a canonical Document already satisfies for this session — read
 * from `documents`, not from a submission payload, because the obligation must be answerable before
 * any artifact has been prepared or submitted.
 */
export function outstandingRequiredEvidence(
    forms: readonly PinnedRequirementForm[],
    onFile: ReadonlySet<string>,
): ParticipantEvidenceObligation[] {
    return participantEvidenceObligations(forms).filter((o) => o.required && !onFile.has(o.field_id));
}

/** Is every required attachment on file? The gate preparation language must respect. */
export function requiredEvidenceSatisfied(
    forms: readonly PinnedRequirementForm[],
    onFile: ReadonlySet<string>,
): boolean {
    return outstandingRequiredEvidence(forms, onFile).length === 0;
}
