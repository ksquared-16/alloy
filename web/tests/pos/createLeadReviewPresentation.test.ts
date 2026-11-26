import { describe, expect, it } from "vitest";
import {
    buildCreateLeadReviewPresentation,
    operatorLabelForEligibilityState,
} from "@/lib/pos/processingIdentity/operator/createLeadReviewPresentation";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import type { IdentityResolutionEligibility } from "@/lib/pos/processingIdentity/operator/identityResolutionEligibility";

function res(partial: Partial<ProcessingResolutionRow> & Pick<ProcessingResolutionRow, "id" | "subject_ref" | "subject_role">): ProcessingResolutionRow {
    return {
        org_id: "org",
        case_id: "case",
        generation_id: "gen",
        input_facts_hash: "hash",
        candidates: [],
        decision_action: "create_new",
        selected_candidate_id: null,
        decided_by: "engine",
        decided_at: null,
        provisional: { first_name: "Kelly", last_name: "Kurzman" },
        superseded_by: null,
        created_at: "",
        updated_at: "",
        ...partial,
    } as ProcessingResolutionRow;
}

function elig(
    subjectRef: string,
    state: IdentityResolutionEligibility["state"],
    eligibleForPlan: boolean,
): IdentityResolutionEligibility {
    return {
        subjectRef,
        subjectRole: "parent",
        state,
        eligibleForPlan,
        blockingReasons: [],
        recommendationSummary: null,
    };
}

describe("createLeadReviewPresentation", () => {
    it("classifies clean-new as ready_without_identity_review with New labels", () => {
        const resolutions = [
            res({
                id: "r1",
                subject_ref: "person-1",
                subject_role: "parent",
                provisional: { first_name: "Kelly", last_name: "Kurzman" },
            }),
            res({
                id: "r2",
                subject_ref: "person-2",
                subject_role: "child",
                provisional: { first_name: "Wrigley", last_name: "Kurzman", display_name: "Wrigley Kurzman" },
            }),
            res({
                id: "r3",
                subject_ref: "household:1",
                subject_role: "household",
                provisional: { household_name: "Kurzman Family" },
            }),
            res({
                id: "r4",
                subject_ref: "lead:1",
                subject_role: "lead",
                provisional: { name: "Kurzman Family" },
            }),
        ];
        const subjectEligibility = resolutions.map((r) => elig(r.subject_ref, "confirmed_new", true));
        const view = buildCreateLeadReviewPresentation({ resolutions, subjectEligibility });
        expect(view.mode).toBe("ready_without_identity_review");
        expect(view.headline).toBe("Ready to create");
        expect(view.subjectsNeedingAction).toBe(0);
        expect(view.subjects.every((s) => s.statusLabel === "New")).toBe(true);
        expect(view.subjects.map((s) => s.displayName).join("|")).not.toMatch(/person-|confirmed_new|household:create/i);
    });

    it("requires identity review when a subject is not plan-eligible", () => {
        const resolutions = [
            res({
                id: "r1",
                subject_ref: "person-1",
                subject_role: "parent",
                decision_action: "review_required",
                candidates: [
                    {
                        subjectRef: "person-1",
                        recordId: "p-existing",
                        confidenceBand: "possible",
                        displayName: "Kristi K",
                        entityType: "person",
                        signals: [],
                        blockingConflicts: [],
                        explanation: "Similar name",
                        resolverVersion: "1",
                    },
                ],
                provisional: { first_name: "Kristi", last_name: "Kurzman" },
            }),
            res({
                id: "r2",
                subject_ref: "person-2",
                subject_role: "parent",
                provisional: { first_name: "Kelly", last_name: "Kurzman" },
            }),
        ];
        const subjectEligibility = [
            elig("person-1", "needs_review", false),
            elig("person-2", "confirmed_new", true),
        ];
        const view = buildCreateLeadReviewPresentation({ resolutions, subjectEligibility });
        expect(view.mode).toBe("identity_review_required");
        expect(view.headline).toBe("1 possible match needs review");
        const kristi = view.subjects.find((s) => s.displayName.includes("Kristi"));
        const kelly = view.subjects.find((s) => s.displayName.includes("Kelly"));
        expect(kristi?.needsOperatorAction).toBe(true);
        expect(kristi?.statusLabel).toBe("Possible match");
        expect(kelly?.needsOperatorAction).toBe(false);
        expect(kelly?.statusLabel).toBe("New");
    });

    it("maps eligibility enums to operator labels (no raw enums)", () => {
        expect(operatorLabelForEligibilityState("confirmed_new")).toBe("New");
        expect(operatorLabelForEligibilityState("confirmed_existing")).toBe("Existing record");
        expect(operatorLabelForEligibilityState("needs_review")).toBe("Possible match");
        expect(operatorLabelForEligibilityState("conflicted")).toBe("Conflicting information");
        expect(operatorLabelForEligibilityState("unresolved")).toBe("Needs review");
    });
});
