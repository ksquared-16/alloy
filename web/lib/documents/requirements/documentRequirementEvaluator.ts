/**
 * D6 — THE document requirement evaluator. One pure function; every consumer asks it.
 *
 * Processing → Work → Documents, Work Items, the Focus Panel readiness card and Business Process readiness all call
 * `evaluateDocumentRequirement` through `documentRequirementService.ts`. Nothing else decides whether a document
 * requirement is met, and the answer is never stored: it is derived on every read from
 *   - the requirement's published version and the Studio type it names,
 *   - the subject's documents of that type (owner associations, D2) with their status and current version's review,
 *   - the subject's active Documents-owned waivers,
 *   - the subject's eligibility (scope, effective window).
 * No placeholder document rows, no satisfaction table, no "waived" document status.
 *
 * No I/O and no clock: `today` is an input, so every outcome is a function of explicit inputs.
 *
 * Outcome precedence (first that applies):
 *   not applicable  the subject is outside the requirement's grain, scope or effective window → no result at all
 *   blocked         the Studio type is no longer published/active, or no longer accepts this subject grain
 *                   (configuration, not the family, must change)
 *   satisfied       an available document whose current version is accepted (or needs no review)
 *   waived          an active, unexpired waiver, while the requirement's policy still allows waivers
 *   pending_review  an available document is awaiting review
 *   blocked         the only evidence is quarantined or rejected
 *   missing         no evidence
 *
 * A waiver never counts as evidence and never makes a document available: a quarantined document stays quarantined
 * (and stays out of every list) whether or not its requirement is waived.
 */
import type { RequirementPolicy, RequirementScope, RequirementSubjectType, RequirementTiming } from "@/lib/documents/requirements/documentRequirementPolicy";

export const REQUIREMENT_STATES = Object.freeze(["missing", "pending_review", "satisfied", "waived", "blocked"] as const);
export type RequirementState = (typeof REQUIREMENT_STATES)[number];

/** Why a requirement is blocked. */
export type RequirementBlockedReason = "type_unavailable" | "type_subject_not_accepted" | "evidence_quarantined" | "evidence_rejected";

/** The published requirement version, as the evaluator needs it. */
export type EvaluableRequirement = {
    requirement_id: string;
    requirement_key: string;
    version_id: string;
    label: string;
    document_type_key: string;
    subject_type: RequirementSubjectType;
    scope: RequirementScope;
    timing: RequirementTiming;
    policy: RequirementPolicy;
    waivable: boolean;
    effective_from: string | null;
    effective_until: string | null;
};

/** The published Studio type the requirement names, or null when it is not published and active. */
export type EvaluableTypePolicy = { key: string; label: string; subject_types: readonly string[]; review_required: boolean } | null;

/** One document of the requirement's type owned by the subject. Status and review are authoritative columns. */
export type EvidenceDocument = {
    document_id: string;
    /** `documents.status` (null = uploaded). */
    status: string | null;
    /** The CURRENT version's `review_status`. */
    review_status: "pending" | "accepted" | "rejected" | null;
    received_at: string | null;
};

export type EvaluableWaiver = {
    waiver_id: string;
    requirement_id: string;
    subject_type: string;
    subject_id: string;
    state: "active" | "revoked";
    effective_until: string | null;
};

/** One open Business Process journey the subject belongs to (for `business_process` scope and timing anchors). */
export type SubjectJourney = { process_key: string; stage_key: string | null; started_at: string };

export type EvaluationSubject = {
    subject_type: RequirementSubjectType;
    subject_id: string;
    /** When the subject came into being (anchor for `all` scope timing). */
    created_at: string | null;
    /** Open journeys that reach this subject. Ignored for `all` scope. */
    journeys: readonly SubjectJourney[];
};

export type EvidenceClass = "accepted" | "pending" | "rejected" | "quarantined" | "unavailable";

export type RequirementEvaluation = {
    requirement_id: string;
    requirement_key: string;
    version_id: string;
    label: string;
    document_type_key: string;
    subject_type: RequirementSubjectType;
    subject_id: string;
    policy: RequirementPolicy;
    /** True when unmet and `required`: the result is blocking readiness. */
    blocking: boolean;
    state: RequirementState;
    blocked_reason: RequirementBlockedReason | null;
    /** Evidence ids by class. Callers filter these per actor before disclosing any of them. */
    evidence: { accepted: string[]; pending: string[]; rejected: string[]; quarantined: string[] };
    waiver_id: string | null;
    waivable: boolean;
    /** YYYY-MM-DD the requirement is due (from timing and the scope anchor), or null when unknown. */
    due_on: string | null;
};

/** Unavailable statuses (as `UNAVAILABLE_DOCUMENT_STATUSES`) other than quarantine never count, either way. */
const NEVER_EVIDENCE = new Set(["deleted", "restricted", "superseded"]);

export function classifyEvidence(doc: EvidenceDocument, reviewRequired: boolean): EvidenceClass {
    const status = (doc.status ?? "uploaded").trim().toLowerCase();
    if (status === "quarantined") return "quarantined";
    if (NEVER_EVIDENCE.has(status)) return "unavailable";
    if (doc.review_status === "rejected") return "rejected";
    if (doc.review_status === "accepted") return "accepted";
    if (doc.review_status === "pending") return "pending";
    // No review recorded: a review-required type is still awaiting review; otherwise the document on file suffices.
    return reviewRequired ? "pending" : "accepted";
}

function addDays(isoDate: string, days: number): string {
    const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** The journeys through which a `business_process` scope reaches the subject; empty means out of scope. */
export function journeysInScope(scope: RequirementScope, subject: EvaluationSubject): SubjectJourney[] {
    if (scope.kind !== "business_process") return [];
    const stages = scope.stage_keys && scope.stage_keys.length > 0 ? new Set(scope.stage_keys) : null;
    return subject.journeys.filter((j) => j.process_key === scope.process_key && (!stages || (j.stage_key !== null && stages.has(j.stage_key))));
}

/** Is the requirement in force for this subject today? (grain, effective window, scope) */
export function requirementApplies(requirement: EvaluableRequirement, subject: EvaluationSubject, today: string): boolean {
    if (requirement.subject_type !== subject.subject_type) return false;
    if (requirement.effective_from && today < requirement.effective_from) return false;
    if (requirement.effective_until && today > requirement.effective_until) return false;
    if (requirement.scope.kind === "business_process") return journeysInScope(requirement.scope, subject).length > 0;
    return true;
}

function dueOn(requirement: EvaluableRequirement, subject: EvaluationSubject): string | null {
    let anchor: string | null = subject.created_at;
    if (requirement.scope.kind === "business_process") {
        const starts = journeysInScope(requirement.scope, subject).map((j) => j.started_at).filter(Boolean).sort();
        anchor = starts[0] ?? null;
    }
    if (requirement.effective_from && (!anchor || anchor.slice(0, 10) < requirement.effective_from)) anchor = requirement.effective_from;
    if (!anchor) return null;
    return addDays(anchor, requirement.timing.kind === "within_days" ? requirement.timing.days : 0);
}

/**
 * Evaluate one requirement for one subject. Returns null when the requirement does not apply to the subject.
 * `documents` must already be narrowed to the subject's owned documents of the requirement's type; `waivers` may be
 * any waivers (they are matched here).
 */
export function evaluateDocumentRequirement(input: {
    requirement: EvaluableRequirement;
    type: EvaluableTypePolicy;
    subject: EvaluationSubject;
    documents: readonly EvidenceDocument[];
    waivers: readonly EvaluableWaiver[];
    today: string;
}): RequirementEvaluation | null {
    const { requirement, type, subject, today } = input;
    if (!requirementApplies(requirement, subject, today)) return null;

    const evidence = { accepted: [] as string[], pending: [] as string[], rejected: [] as string[], quarantined: [] as string[] };
    const reviewRequired = type?.review_required === true;
    const sorted = [...input.documents].sort((a, b) => (b.received_at ?? "").localeCompare(a.received_at ?? "") || a.document_id.localeCompare(b.document_id));
    for (const doc of sorted) {
        const cls = classifyEvidence(doc, reviewRequired);
        if (cls !== "unavailable") evidence[cls].push(doc.document_id);
    }

    const waiver = requirement.waivable
        ? input.waivers.find(
              (w) =>
                  w.requirement_id === requirement.requirement_id &&
                  w.subject_type === subject.subject_type &&
                  w.subject_id === subject.subject_id &&
                  w.state === "active" &&
                  (!w.effective_until || w.effective_until >= today),
          ) ?? null
        : null;

    let state: RequirementState;
    let blocked: RequirementBlockedReason | null = null;
    if (!type) {
        state = "blocked";
        blocked = "type_unavailable";
    } else if (!type.subject_types.includes(subject.subject_type)) {
        state = "blocked";
        blocked = "type_subject_not_accepted";
    } else if (evidence.accepted.length > 0) {
        state = "satisfied";
    } else if (waiver) {
        state = "waived";
    } else if (evidence.pending.length > 0) {
        state = "pending_review";
    } else if (evidence.quarantined.length > 0) {
        state = "blocked";
        blocked = "evidence_quarantined";
    } else if (evidence.rejected.length > 0) {
        state = "blocked";
        blocked = "evidence_rejected";
    } else {
        state = "missing";
    }

    return {
        requirement_id: requirement.requirement_id,
        requirement_key: requirement.requirement_key,
        version_id: requirement.version_id,
        label: requirement.label,
        document_type_key: requirement.document_type_key,
        subject_type: subject.subject_type,
        subject_id: subject.subject_id,
        policy: requirement.policy,
        blocking: requirement.policy === "required" && state !== "satisfied" && state !== "waived",
        state,
        blocked_reason: blocked,
        evidence,
        waiver_id: state === "waived" ? waiver!.waiver_id : null,
        waivable: requirement.waivable,
        due_on: dueOn(requirement, subject),
    };
}

/** A requirement whose outcome needs an operator: unmet, in force, and required. Optional requirements never make work. */
export function evaluationNeedsWork(e: RequirementEvaluation): boolean {
    return e.blocking;
}

/** The one-line action each unmet state asks for (Processing, Work Items and the Focus Panel share it). */
export const REQUIREMENT_STATE_ACTION: Readonly<Record<RequirementState, string>> = Object.freeze({
    missing: "Collect the document",
    pending_review: "Review the document on file",
    blocked: "Resolve the blocked evidence",
    satisfied: "No action",
    waived: "No action (waived)",
});

export const REQUIREMENT_BLOCKED_ACTION: Readonly<Record<RequirementBlockedReason, string>> = Object.freeze({
    type_unavailable: "The document type is no longer published; update the requirement",
    type_subject_not_accepted: "The document type no longer accepts this record; update the requirement",
    evidence_quarantined: "The uploaded file is quarantined; collect a clean copy",
    evidence_rejected: "The document on file was rejected; collect a new one",
});

export const REQUIREMENT_STATE_LABEL: Readonly<Record<RequirementState, string>> = Object.freeze({
    missing: "Missing",
    pending_review: "Pending review",
    satisfied: "Satisfied",
    waived: "Waived",
    blocked: "Blocked",
});
