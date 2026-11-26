/**
 * Create Lead identity review — presentation-only classification.
 *
 * Derives whether the operator needs identity adjudication from existing
 * Processing eligibility state. Not a durable truth system.
 */

import {
    evaluateSubjectEligibility,
    type IdentityResolutionEligibility,
    type IdentityResolutionEligibilityState,
} from "@/lib/pos/processingIdentity/operator/identityResolutionEligibility";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { pickLatestResolutionPerSubject } from "@/lib/pos/processingIdentity/operator/recommendationBuilder";

export type CreateLeadIdentityReviewMode =
    | "ready_without_identity_review"
    | "identity_review_required";

export type CreateLeadSubjectStatusLabel =
    | "New"
    | "Existing record"
    | "Possible match"
    | "Conflicting information"
    | "Needs review";

export type CreateLeadReviewSubjectRow = {
    resolutionId: string;
    subjectRef: string;
    role: string;
    roleLabel: string;
    displayName: string;
    statusLabel: CreateLeadSubjectStatusLabel;
    eligibilityState: IdentityResolutionEligibilityState;
    needsOperatorAction: boolean;
    eligibleForPlan: boolean;
    recommendationSummary: string | null;
    decisionAction: string | null;
    candidates: ProcessingResolutionRow["candidates"];
    selectedCandidateId: string | null;
};

export type CreateLeadReviewPresentation = {
    mode: CreateLeadIdentityReviewMode;
    headline: string;
    summary: string;
    subjects: CreateLeadReviewSubjectRow[];
    subjectsNeedingAction: number;
};

function roleLabel(role: string): string {
    switch (role) {
        case "parent":
            return "Parent";
        case "child":
            return "Child";
        case "household":
            return "Household";
        case "lead":
            return "Enrollment Lead";
        default:
            return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
}

function displayNameFromProvisional(
    provisional: Record<string, unknown> | null | undefined,
    role: string,
): string {
    if (!provisional) return roleLabel(role);
    const display = typeof provisional.display_name === "string" ? provisional.display_name.trim() : "";
    if (display) return display;
    const name = typeof provisional.name === "string" ? provisional.name.trim() : "";
    if (name) return name;
    const householdName =
        typeof provisional.household_name === "string" ? provisional.household_name.trim() : "";
    if (householdName) return householdName;
    const first = typeof provisional.first_name === "string" ? provisional.first_name.trim() : "";
    const last = typeof provisional.last_name === "string" ? provisional.last_name.trim() : "";
    const composed = [first, last].filter(Boolean).join(" ").trim();
    if (composed) return composed;
    return roleLabel(role);
}

export function operatorLabelForEligibilityState(
    state: IdentityResolutionEligibilityState,
): CreateLeadSubjectStatusLabel {
    switch (state) {
        case "confirmed_new":
            return "New";
        case "confirmed_existing":
            return "Existing record";
        case "needs_review":
            return "Possible match";
        case "conflicted":
            return "Conflicting information";
        case "unresolved":
            return "Needs review";
        default:
            return "Needs review";
    }
}

/**
 * Classify Create Lead Processing review for the operator surface.
 * Clean only when every active subject is plan-eligible under existing identity rules.
 */
export function buildCreateLeadReviewPresentation(input: {
    resolutions: ProcessingResolutionRow[];
    subjectEligibility?: IdentityResolutionEligibility[];
}): CreateLeadReviewPresentation {
    const active = pickLatestResolutionPerSubject(input.resolutions);
    const eligByRef = new Map(
        (input.subjectEligibility ?? active.map(evaluateSubjectEligibility)).map((e) => [
            e.subjectRef,
            e,
        ]),
    );

    const subjects: CreateLeadReviewSubjectRow[] = active.map((r) => {
        const el = eligByRef.get(r.subject_ref) ?? evaluateSubjectEligibility(r);
        const needsOperatorAction = !el.eligibleForPlan;
        return {
            resolutionId: r.id,
            subjectRef: r.subject_ref,
            role: r.subject_role,
            roleLabel: roleLabel(r.subject_role),
            displayName: displayNameFromProvisional(r.provisional, r.subject_role),
            statusLabel: operatorLabelForEligibilityState(el.state),
            eligibilityState: el.state,
            needsOperatorAction,
            eligibleForPlan: el.eligibleForPlan,
            recommendationSummary: el.recommendationSummary,
            decisionAction: r.decision_action,
            candidates: r.candidates ?? [],
            selectedCandidateId: r.selected_candidate_id,
        };
    });

    const subjectsNeedingAction = subjects.filter((s) => s.needsOperatorAction).length;
    const mode: CreateLeadIdentityReviewMode =
        subjectsNeedingAction === 0 ? "ready_without_identity_review" : "identity_review_required";

    const headline =
        mode === "ready_without_identity_review"
            ? "Ready to create"
            : subjectsNeedingAction === 1
              ? "1 possible match needs review"
              : `${subjectsNeedingAction} possible matches need review`;

    const summary =
        mode === "ready_without_identity_review"
            ? "No possible duplicates were found."
            : "Review the highlighted people, then confirm once to create the lead.";

    return { mode, headline, summary, subjects, subjectsNeedingAction };
}
