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
 *   satisfied       an available document whose current version is accepted (or needs no review) AND in force (D7:
 *                   not expired, not before its effective date) — or, while a renewal of it awaits review or was
 *                   rejected, whose earlier accepted version is still in force
 *   waived          an active, unexpired waiver, while the requirement's policy still allows waivers
 *   pending_review  an available document is awaiting review, or (D7) was accepted but its type needs a recorded
 *                   expiration date that nobody has recorded yet
 *   expired         (D7) the only accepted evidence has expired or is not yet in force: collect the renewal
 *   blocked         the only evidence is quarantined or rejected
 *   missing         no evidence
 *
 * A waiver never counts as evidence and never makes a document available: a quarantined document stays quarantined
 * (and stays out of every list) whether or not its requirement is waived.
 *
 * D7 — validity is an INPUT here, computed by the one validity evaluator (`lib/documents/validity/documentValidity.ts`)
 * from the type's published policy, the version's dates and the organization-local `today`. A document without a
 * computed validity (no policy known) is treated as not tracked, which is the D6 behaviour.
 */
import { validityAllowsEvidence, type DocumentValidity } from "@/lib/documents/validity/documentValidity";
import type { RequirementPolicy, RequirementScope, RequirementSubjectType, RequirementTiming } from "@/lib/documents/requirements/documentRequirementPolicy";

export const REQUIREMENT_STATES = Object.freeze(["missing", "pending_review", "satisfied", "waived", "expired", "blocked"] as const);
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
    /** D7: the CURRENT version's validity on the evaluation date (null/absent = not tracked). */
    validity?: DocumentValidity | null;
    /**
     * D7: the newest EARLIER version that was accepted, with its validity — the evidence that keeps counting while a
     * renewal (the current version) awaits review or was rejected. Never consulted when the document is unavailable.
     */
    prior_accepted?: { version_id: string; validity: DocumentValidity | null } | null;
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

export type EvidenceClass = "accepted" | "pending" | "undated" | "expired" | "rejected" | "quarantined" | "unavailable";

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
    /**
     * Evidence ids by class. Callers filter these per actor before disclosing any of them. `pending` includes `undated`
     * (accepted, but the type needs a recorded expiration date); `expired` is accepted evidence no longer in force.
     */
    evidence: { accepted: string[]; pending: string[]; undated: string[]; expired: string[]; rejected: string[]; quarantined: string[] };
    waiver_id: string | null;
    waivable: boolean;
    /** YYYY-MM-DD the requirement is due (from timing and the scope anchor), or null when unknown. */
    due_on: string | null;
    /** D7: when satisfied, the last day the satisfying evidence is in force (the latest among them), or null. */
    valid_until: string | null;
    /** D7: satisfied, but every satisfying document is inside its expiring-soon window: renewal is due. */
    expiring_soon: boolean;
    /** D7: satisfied by an earlier accepted version while the current version (a renewal) awaits review or was rejected. */
    renewal_pending: boolean;
};

/** Unavailable statuses (as `UNAVAILABLE_DOCUMENT_STATUSES`) other than quarantine never count, either way. */
const NEVER_EVIDENCE = new Set(["deleted", "restricted", "superseded"]);

/** The current version's review outcome alone (D6). */
function reviewClass(doc: EvidenceDocument, reviewRequired: boolean): "accepted" | "pending" | "rejected" {
    if (doc.review_status === "rejected") return "rejected";
    if (doc.review_status === "accepted") return "accepted";
    if (doc.review_status === "pending") return "pending";
    // No review recorded: a review-required type is still awaiting review; otherwise the document on file suffices.
    return reviewRequired ? "pending" : "accepted";
}

/** An accepted version's class once validity is applied. */
function inForceClass(validity: DocumentValidity | null | undefined): "accepted" | "undated" | "expired" {
    if (!validity || validityAllowsEvidence(validity)) return "accepted";
    return validity.status === "date_missing" ? "undated" : "expired";
}

export function classifyEvidence(doc: EvidenceDocument, reviewRequired: boolean): EvidenceClass {
    const status = (doc.status ?? "uploaded").trim().toLowerCase();
    if (status === "quarantined") return "quarantined";
    if (NEVER_EVIDENCE.has(status)) return "unavailable";
    const review = reviewClass(doc, reviewRequired);
    if (review === "accepted") return inForceClass(doc.validity);
    // D7 renewal: while the new version awaits review or was rejected, the earlier accepted version still counts if it
    // is in force. The new version itself never counts until it is accepted.
    if (doc.prior_accepted && inForceClass(doc.prior_accepted.validity) === "accepted") return "accepted";
    return review;
}

/** The validity that applies to a document classified `accepted` (its current version, or the prior one it rests on). */
function acceptedValidity(doc: EvidenceDocument, reviewRequired: boolean): { validity: DocumentValidity | null; renewal: boolean } {
    if (reviewClass(doc, reviewRequired) === "accepted") return { validity: doc.validity ?? null, renewal: false };
    return { validity: doc.prior_accepted?.validity ?? null, renewal: true };
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

    const evidence = { accepted: [] as string[], pending: [] as string[], undated: [] as string[], expired: [] as string[], rejected: [] as string[], quarantined: [] as string[] };
    const reviewRequired = type?.review_required === true;
    const sorted = [...input.documents].sort((a, b) => (b.received_at ?? "").localeCompare(a.received_at ?? "") || a.document_id.localeCompare(b.document_id));
    const inForce: Array<{ validity: DocumentValidity | null; renewal: boolean }> = [];
    for (const doc of sorted) {
        const cls = classifyEvidence(doc, reviewRequired);
        if (cls === "unavailable") continue;
        if (cls === "undated") {
            evidence.undated.push(doc.document_id);
            evidence.pending.push(doc.document_id);
            continue;
        }
        evidence[cls].push(doc.document_id);
        if (cls === "accepted") inForce.push(acceptedValidity(doc, reviewRequired));
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
    } else if (evidence.expired.length > 0) {
        state = "expired";
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
        ...renewalFacts(state, inForce),
    };
}

/** D7: how long the satisfying evidence stays in force, and whether its renewal is due. */
function renewalFacts(state: RequirementState, inForce: Array<{ validity: DocumentValidity | null; renewal: boolean }>): Pick<RequirementEvaluation, "valid_until" | "expiring_soon" | "renewal_pending"> {
    if (state !== "satisfied" || inForce.length === 0) return { valid_until: null, expiring_soon: false, renewal_pending: false };
    // Any satisfying document without an expiration keeps the requirement met indefinitely.
    const open = inForce.some((e) => !e.validity || !e.validity.expires_on);
    const until = open ? null : inForce.map((e) => e.validity!.expires_on!).sort().at(-1) ?? null;
    const expiring = !open && inForce.every((e) => e.validity?.status === "expiring_soon");
    return { valid_until: until, expiring_soon: expiring, renewal_pending: inForce.every((e) => e.renewal) };
}

/** A requirement whose outcome needs an operator: unmet, in force, and required. Optional requirements never make work. */
export function evaluationNeedsWork(e: RequirementEvaluation): boolean {
    return e.blocking;
}

/** D7: a required requirement that is met today but whose evidence is about to expire — renewal work, not blocking. */
export function evaluationNeedsRenewal(e: RequirementEvaluation): boolean {
    return e.policy === "required" && e.state === "satisfied" && e.expiring_soon;
}

/** The one-line action each unmet state asks for (Processing, Work Items and the Focus Panel share it). */
export const REQUIREMENT_STATE_ACTION: Readonly<Record<RequirementState, string>> = Object.freeze({
    missing: "Collect the document",
    pending_review: "Review the document on file",
    expired: "Collect the renewed document",
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

/** The states a derived WORK row can be in (D6 unmet states, D7 expired, and D7 renewal work on a met requirement). */
export type RequirementWorkState = "missing" | "pending_review" | "blocked" | "expired" | "expiring_soon";
export const REQUIREMENT_WORK_STATES: readonly RequirementWorkState[] = Object.freeze(["missing", "pending_review", "expired", "expiring_soon", "blocked"]);
export const REQUIREMENT_WORK_STATE_LABEL: Readonly<Record<RequirementWorkState, string>> = Object.freeze({
    missing: "Missing",
    pending_review: "Pending review",
    expired: "Expired",
    expiring_soon: "Expiring soon",
    blocked: "Blocked",
});
export const REQUIREMENT_WORK_STATE_ACTION: Readonly<Record<RequirementWorkState, string>> = Object.freeze({
    missing: "Collect the document",
    pending_review: "Review the document on file",
    expired: "Collect the renewed document",
    expiring_soon: "Renew before it expires",
    blocked: "Resolve the blocked evidence",
});

export const REQUIREMENT_STATE_LABEL: Readonly<Record<RequirementState, string>> = Object.freeze({
    missing: "Missing",
    pending_review: "Pending review",
    satisfied: "Satisfied",
    waived: "Waived",
    expired: "Expired",
    blocked: "Blocked",
});
