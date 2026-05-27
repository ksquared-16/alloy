import { describe, expect, it } from "vitest";
import {
    DEMO_CHILDCARE_CENTER_LOCATION_ID,
    DEMO_CHILDCARE_ENROLLMENT_DEPT_ID,
    DEMO_CHILDCARE_ENROLLMENT_WORK_UNIT_ID,
    DEMO_CHILDCARE_VERTICAL_ID,
} from "@/lib/forms/intakeRuntimeTestFixtures";
import { buildIntakeCasePresentationRows } from "@/lib/forms/intakeCasePresentation";
import { intakeCaseMatchesWorkspaceFilter } from "@/lib/forms/intakeWorkspaceFilters";
import {
    intakeReviewDecisionToOutcomeMeta,
    parseIntakeReviewConfig,
    resolveIntakeReviewDecision,
    type ResolveIntakeReviewDecisionInput,
} from "@/lib/forms/intake/resolveIntakeReviewDecision";

const DEMO_ROUTING_LINK = {
    review_mode: "confidence",
    auto_operationalize: true,
    auto_create_opportunity: true,
    default_vertical_id: DEMO_CHILDCARE_VERTICAL_ID,
    default_location_id: DEMO_CHILDCARE_CENTER_LOCATION_ID,
    default_work_unit_id: DEMO_CHILDCARE_ENROLLMENT_WORK_UNIT_ID,
    default_department_id: DEMO_CHILDCARE_ENROLLMENT_DEPT_ID,
    default_opportunity_status_key: "new",
} as const;

function baseInput(
    overrides: Partial<ResolveIntakeReviewDecisionInput> = {}
): ResolveIntakeReviewDecisionInput {
    return {
        linkMetadata: {},
        matchStrategy: "created_person",
        matchConfidence: "medium",
        emailPresent: true,
        phonePresent: false,
        personCreated: true,
        memberAutoCreated: false,
        workUnitDepartmentMismatch: false,
        opportunityDedupStrategy: "created",
        autoCreateOpportunity: true,
        hasOpportunity: true,
        hasCustomer: true,
        hasPerson: true,
        ...overrides,
    };
}

describe("resolveIntakeReviewDecision IC-4", () => {
    it("legacy/missing config still requires review for new person create", () => {
        const decision = resolveIntakeReviewDecision(baseInput({ linkMetadata: {} }));
        expect(decision.needsReview).toBe(true);
        expect(decision.reviewMode).toBe("legacy_default");
        expect(decision.autoOperationalized).toBe(false);
        expect(decision.reasons).toContain("new_person_created");
    });

    it("child member auto-created blocks auto-operationalize under exception config", () => {
        const decision = resolveIntakeReviewDecision(
            baseInput({
                linkMetadata: { ...DEMO_ROUTING_LINK },
                memberAutoCreated: true,
            })
        );
        expect(decision.needsReview).toBe(true);
        expect(decision.autoOperationalized).toBe(false);
        expect(decision.reasons).toContain("child_member_auto_created");
    });

    it("exception_only + auto_operationalize + clean routing skips review", () => {
        const decision = resolveIntakeReviewDecision(
            baseInput({ linkMetadata: { ...DEMO_ROUTING_LINK } })
        );
        expect(decision.needsReview).toBe(false);
        expect(decision.reviewMode).toBe("exception_only");
        expect(decision.autoOperationalized).toBe(true);
        expect(decision.confidence).toBe("high");
        expect(decision.reasons).toContain("clean_new_opportunity_create");
    });

    it("missing routing under exception mode still requires review for new create", () => {
        const decision = resolveIntakeReviewDecision(
            baseInput({
                linkMetadata: {
                    review_mode: "exception_only",
                    auto_operationalize: true,
                    auto_create_opportunity: true,
                    default_vertical_id: DEMO_CHILDCARE_VERTICAL_ID,
                },
            })
        );
        expect(decision.needsReview).toBe(true);
        expect(decision.autoOperationalized).toBe(false);
        expect(decision.reasons).toContain("new_person_created");
    });

    it("confident duplicate attach remains no-review without exception config", () => {
        const decision = resolveIntakeReviewDecision(
            baseInput({
                linkMetadata: {},
                personCreated: false,
                matchStrategy: "matched_email",
                matchConfidence: "high",
                opportunityDedupStrategy: "attached_existing",
            })
        );
        expect(decision.needsReview).toBe(false);
        expect(decision.autoOperationalized).toBe(false);
    });

    it("confident duplicate attach auto-operationalizes under exception config", () => {
        const decision = resolveIntakeReviewDecision(
            baseInput({
                linkMetadata: { ...DEMO_ROUTING_LINK },
                personCreated: false,
                matchStrategy: "matched_email",
                matchConfidence: "high",
                opportunityDedupStrategy: "attached_existing",
            })
        );
        expect(decision.needsReview).toBe(false);
        expect(decision.autoOperationalized).toBe(true);
        expect(decision.reasons).toContain("confident_duplicate_attach");
    });

    it("ambiguous opportunity match requires review", () => {
        const decision = resolveIntakeReviewDecision(
            baseInput({
                linkMetadata: { ...DEMO_ROUTING_LINK },
                opportunityDedupStrategy: "ambiguous",
                hasOpportunity: false,
            })
        );
        expect(decision.needsReview).toBe(true);
    });

    it("phone-only match requires review even under exception config", () => {
        const decision = resolveIntakeReviewDecision(
            baseInput({
                linkMetadata: { ...DEMO_ROUTING_LINK },
                matchStrategy: "matched_phone",
                matchConfidence: "medium",
                personCreated: false,
                emailPresent: false,
                phonePresent: true,
                opportunityDedupStrategy: "attached_existing",
            })
        );
        expect(decision.needsReview).toBe(true);
        expect(decision.reasons).toContain("phone_only_match");
    });

    it("review_mode always requires review even for confident attach", () => {
        const decision = resolveIntakeReviewDecision(
            baseInput({
                linkMetadata: { review_mode: "always" },
                personCreated: false,
                matchStrategy: "matched_email",
                opportunityDedupStrategy: "attached_existing",
            })
        );
        expect(decision.needsReview).toBe(true);
        expect(decision.reviewMode).toBe("required");
    });

    it("writes explainable metadata fields", () => {
        const decision = resolveIntakeReviewDecision(baseInput({ linkMetadata: { ...DEMO_ROUTING_LINK } }));
        const meta = intakeReviewDecisionToOutcomeMeta(decision);
        expect(meta.intake_needs_review).toBe(false);
        expect(meta.intake_auto_operationalized).toBe(true);
        expect(meta.intake_confidence).toBe("high");
        expect(meta.intake_review_decision).toMatchObject({
            needs_review: false,
            review_mode: "exception_only",
            auto_operationalized: true,
        });
    });

    it("parseIntakeReviewConfig reads nested intake_outcome", () => {
        const config = parseIntakeReviewConfig({
            intake_outcome: {
                review_mode: "exception_only",
                auto_operationalize: true,
                default_location_id: DEMO_CHILDCARE_CENTER_LOCATION_ID,
            },
        });
        expect(config.reviewMode).toBe("exception_only");
        expect(config.autoOperationalize).toBe(true);
        expect(config.linkDefaults.default_location_id).toBe(DEMO_CHILDCARE_CENTER_LOCATION_ID);
    });

    it("Demo Childcare medication path requires review when child member auto-created", () => {
        const decision = resolveIntakeReviewDecision(
            baseInput({
                linkMetadata: {
                    ...DEMO_ROUTING_LINK,
                    auto_create_customer_member: true,
                    runtime_test: "forms_2d_demo_childcare",
                },
                memberAutoCreated: true,
            })
        );
        expect(decision).toMatchObject({
            needsReview: true,
            autoOperationalized: false,
            reviewMode: "exception_only",
        });
        expect(decision.reasons).toContain("new_person_created");
        expect(decision.reasons).toContain("child_member_auto_created");
    });

    it("Demo Childcare lead-only path auto-operationalizes when no member auto-create", () => {
        const decision = resolveIntakeReviewDecision(
            baseInput({
                linkMetadata: {
                    ...DEMO_ROUTING_LINK,
                    auto_create_customer_member: false,
                    runtime_test: "forms_2d_demo_childcare_lead_only_auto_op",
                },
                memberAutoCreated: false,
            })
        );
        expect(decision).toMatchObject({
            needsReview: false,
            autoOperationalized: true,
            confidence: "high",
            reviewMode: "exception_only",
        });
    });
});

describe("resolveIntakeReviewDecision workload mapping IC-4", () => {
    it("auto-operationalized case maps to Recent filter", () => {
        const [intakeCase] = buildIntakeCasePresentationRows({
            submissions: [
                {
                    id: "sub-auto",
                    status: "submitted",
                    created_at: "2026-05-27T10:00:00.000Z",
                    submitted_at: "2026-05-27T10:00:00.000Z",
                    form_definition_id: "form-1",
                    opportunity_id: "opp-1",
                    person_id: "person-1",
                    payload: {
                        meta: {
                            intake_needs_review: false,
                            intake_auto_operationalized: true,
                            intake_opportunity_match: "created",
                            intake_resolution_path: "created_records",
                            intake_review_decision: {
                                review_mode: "exception_only",
                                auto_operationalized: true,
                                reasons: ["clean_new_opportunity_create"],
                            },
                        },
                    },
                },
            ],
            formsById: { "form-1": "Medication Authorization" },
        });

        expect(intakeCase!.status_bucket).toBe("auto_operationalized");
        expect(intakeCaseMatchesWorkspaceFilter(intakeCase!, "recent")).toBe(true);
        expect(intakeCaseMatchesWorkspaceFilter(intakeCase!, "needs_review")).toBe(false);
    });

    it("review-required case stays in Needs Review filter", () => {
        const [intakeCase] = buildIntakeCasePresentationRows({
            submissions: [
                {
                    id: "sub-review",
                    status: "submitted",
                    created_at: "2026-05-27T10:00:00.000Z",
                    submitted_at: "2026-05-27T10:00:00.000Z",
                    form_definition_id: "form-1",
                    payload: {
                        meta: {
                            intake_needs_review: true,
                            intake_review_decision: {
                                review_mode: "legacy_default",
                                reasons: ["new_person_created"],
                            },
                        },
                    },
                },
            ],
        });

        expect(intakeCase!.status_bucket).toBe("review_required");
        expect(intakeCaseMatchesWorkspaceFilter(intakeCase!, "needs_review")).toBe(true);
    });
});
