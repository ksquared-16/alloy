import { describe, expect, it } from "vitest";
import {
    evaluateChildPersonMatch,
    childIdentityMatches,
    childNameMatches,
} from "@/lib/intake/resolve/matchIdentity";
import { memberNameParts } from "@/lib/intake/resolve/queryMatches";
import {
    adapterMayNotBypassEligibility,
    evaluateCasePlanEligibility,
    evaluateSubjectEligibility,
} from "@/lib/pos/processingIdentity/operator/identityResolutionEligibility";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import type { IdentityCandidate } from "@/lib/identity";
import { defaultActionForConfidence } from "@/lib/intake/resolve/buildProposals";

function cand(partial: Partial<IdentityCandidate> & { recordId: string }): IdentityCandidate {
    return {
        subjectRef: "child:0",
        entityType: "child",
        confidenceBand: "possible",
        signals: [],
        blockingConflicts: [],
        explanation: "test",
        resolverVersion: "test",
        ...partial,
    };
}

function row(partial: Partial<ProcessingResolutionRow>): ProcessingResolutionRow {
    return {
        id: "r1",
        org_id: "o",
        case_id: "c",
        generation_id: "g",
        input_facts_hash: "h",
        subject_ref: "child:0",
        subject_role: "child",
        provisional: {},
        candidates: [],
        decision_action: null,
        selected_candidate_id: null,
        decided_by: "engine",
        operator_id: null,
        policy_version: null,
        resolver_version: "test",
        stale_at: null,
        superseded_by: null,
        retention_class: "uncommitted_submission",
        created_at: "2026-07-13T00:00:00.000Z",
        ...partial,
    };
}

describe("child identity matching — plausible household match", () => {
    it("same name + same household + same DOB → exact_match", () => {
        const result = evaluateChildPersonMatch({
            firstName: "Lennon",
            lastName: "Kurzman",
            dob: "2021-05-01",
            householdMembers: [
                {
                    person_id: "person-child",
                    customer_member_id: "cm-1",
                    first_name: "Lennon",
                    last_name: "Kurzman",
                    dob: "2021-05-01",
                },
            ],
            orgPersonMatches: [],
        });
        expect(result.confidence).toBe("exact_match");
        expect(result.customerMemberId).toBe("cm-1");
        expect(defaultActionForConfidence(result.confidence)).toBe("link_existing");
    });

    it("same name + same household + DOB missing → possible_match (needs review, not create)", () => {
        const result = evaluateChildPersonMatch({
            firstName: "Lennon",
            lastName: "Kurzman",
            dob: null,
            householdMembers: [
                {
                    customer_member_id: "cm-1",
                    first_name: "Lennon",
                    last_name: "Kurzman",
                    dob: null,
                },
            ],
            orgPersonMatches: [],
        });
        expect(result.confidence).toBe("possible_match");
        expect(result.customerMemberId).toBe("cm-1");
        expect(defaultActionForConfidence(result.confidence)).toBe("review_required");
    });

    it("same name + same household + DOB conflict → conflicted", () => {
        const result = evaluateChildPersonMatch({
            firstName: "Lennon",
            lastName: "Kurzman",
            dob: "2021-05-01",
            householdMembers: [
                {
                    customer_member_id: "cm-1",
                    first_name: "Lennon",
                    last_name: "Kurzman",
                    dob: "2019-01-01",
                },
            ],
            orgPersonMatches: [],
        });
        expect(result.confidence).toBe("conflict");
        expect(result.blocking_conflicts).toContain("child_dob_mismatch");
        expect(defaultActionForConfidence(result.confidence)).toBe("reject");
    });

    it("does not treat missing DOB as proof of identity match", () => {
        expect(
            childIdentityMatches({
                firstName: "A",
                lastName: "B",
                dob: null,
                candidateFirst: "A",
                candidateLast: "B",
                candidateDob: "2020-01-01",
            }),
        ).toBe(false);
    });

    it("parses display_name when structured name parts are empty", () => {
        expect(memberNameParts({ display_name: "Lennon Kurzman" })).toEqual({
            first_name: "Lennon",
            last_name: "Kurzman",
        });
        expect(childNameMatches({
            firstName: "Lennon",
            lastName: "Kurzman",
            candidateFirst: "Lennon",
            candidateLast: "Kurzman",
        })).toBe(true);
    });
});

describe("identity resolution eligibility gate", () => {
    it("engine create_new with plausible candidate is not plan-eligible", () => {
        const el = evaluateSubjectEligibility(
            row({
                decision_action: "create_new",
                decided_by: "engine",
                candidates: [cand({ recordId: "cm-1", confidenceBand: "possible" })],
            }),
        );
        expect(el.state).toBe("needs_review");
        expect(el.eligibleForPlan).toBe(false);
        expect(el.blockingReasons[0]?.code).toBe("create_new_override_required");
    });

    it("operator create_new with override reason is confirmed_new", () => {
        const el = evaluateSubjectEligibility(
            row({
                decision_action: "create_new",
                decided_by: "operator",
                candidates: [cand({ recordId: "cm-1" })],
                provisional: {
                    create_new_override: {
                        reason: "Different middle name confirmed verbally",
                        rejectedCandidateIds: ["cm-1"],
                        decidedAt: "2026-07-13T00:00:00.000Z",
                        operatorId: "op-1",
                    },
                },
            }),
        );
        expect(el.state).toBe("confirmed_new");
        expect(el.eligibleForPlan).toBe(true);
    });

    it("blocks lead create while child needs review", () => {
        const result = evaluateCasePlanEligibility([
            row({
                id: "c",
                subject_ref: "child:0",
                subject_role: "child",
                decision_action: "review_required",
                candidates: [cand({ recordId: "cm-1" })],
            }),
            row({
                id: "l",
                subject_ref: "lead:0",
                subject_role: "lead",
                decision_action: "create_new",
                candidates: [],
            }),
        ]);
        expect(result.eligibleForPlan).toBe(false);
        expect(result.blockers.some((b) => b.code === "child_identity_unconfirmed" || b.code === "plausible_match_needs_review")).toBe(true);
    });

    it("source adapters cannot stamp ambiguous identities as new", () => {
        const gate = adapterMayNotBypassEligibility({
            decisionAction: "create_new",
            decidedBy: "engine",
            candidates: [cand({ recordId: "cm-1", confidenceBand: "possible" })],
        });
        expect(gate.ok).toBe(false);
        expect(gate.reason).toBe("adapter_cannot_auto_create_when_plausible_match_exists");
    });

    it("create_new with zero candidates is confirmed_new", () => {
        const el = evaluateSubjectEligibility(
            row({ decision_action: "create_new", decided_by: "engine", candidates: [] }),
        );
        expect(el.state).toBe("confirmed_new");
        expect(el.eligibleForPlan).toBe(true);
    });
});
