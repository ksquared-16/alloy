/**
 * DOCUMENT REQUIREMENTS, FROM CANONICAL DOCUMENTS (Documents V1 / D6).
 *
 * A stage's document requirement is answered by the Documents evaluator — the same one Processing, Work Items and the
 * Focus Panel ask — never decided here. This file only translates the Documents state into the participant progress
 * vocabulary:
 *
 *   satisfied        → satisfied (evidence: the accepted documents)
 *   waived           → satisfied (evidence: the Documents-owned waiver). Documents owns document-specific waivers;
 *                      a waived document requirement is met in Documents' own terms. Enrollment's stage exceptions are
 *                      a separate decision, applied by completion sufficiency exactly as before.
 *   pending_review / missing / blocked → outstanding, with the reason
 *   no answer (facts unreadable)       → left `unsupported`, i.e. blocking: an unreadable answer never reads as met.
 *
 * Pure: no I/O, so the mapping is a function of explicit inputs.
 */
import type { RequirementEvaluation } from "@/lib/documents/requirements/documentRequirementEvaluator";
import type { EnrollmentRequirementProgress } from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";

const OUTSTANDING_REASON: Record<"missing" | "pending_review" | "blocked", string> = {
    missing: "No document of this type is on file.",
    pending_review: "A document is on file and awaiting review.",
    blocked: "The document on file cannot be used (quarantined, rejected, or the type is no longer available).",
};

export function projectDocumentRequirementProgress(
    current: EnrollmentRequirementProgress,
    evaluation: RequirementEvaluation | undefined,
): EnrollmentRequirementProgress {
    if (current.kind !== "document" || !evaluation) return current;
    const base = {
        requirement_id: current.requirement_id,
        kind: current.kind,
        artifact: current.artifact,
        level: current.level,
    } as const;
    if (evaluation.state === "satisfied" || evaluation.state === "waived") {
        return {
            ...base,
            status: "satisfied",
            evidence: {
                kind: "document_requirement",
                document_requirement_id: evaluation.requirement_id,
                documents_state: evaluation.state,
                document_ids: evaluation.evidence.accepted,
                waiver_id: evaluation.waiver_id,
            },
        };
    }
    return { ...base, status: "outstanding", reason: OUTSTANDING_REASON[evaluation.state] };
}
