import { describe, expect, it } from "vitest";
import { buildIntakeQuickReviewViewModel } from "@/lib/forms/intakeQuickReviewPresentation";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

const formId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function row(overrides: Partial<SubmissionInboxRow> = {}): SubmissionInboxRow {
    return {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "submitted",
        created_at: "2026-05-01T09:00:00.000Z",
        submitted_at: "2026-05-27T18:09:16.000Z",
        form_definition_id: formId,
        person_id: "p1",
        customer_id: "c1",
        opportunity_id: "o1",
        payload: {
            values: { guardian_full_name: "Jordan Test", guardian_email: "jordan@example.com" },
            meta: {},
        } as SubmissionInboxRow["payload"],
        ...overrides,
    };
}

describe("intakeQuickReviewPresentation IC-6", () => {
    it("uses intake summary language for review-required case", () => {
        const model = buildIntakeQuickReviewViewModel({
            row: row({
                payload: {
                    values: { guardian_full_name: "Jordan Test" },
                    meta: {
                        intake_needs_review: true,
                        intake_resolution_path: "created_records",
                        intake_opportunity_match: "created",
                    },
                } as SubmissionInboxRow["payload"],
            }),
            formName: "Waitlist",
            submittedAtLabel: "May 27, 2026 6:09 PM",
        });

        expect(model.intakeSummary.capturedLine).toBe("Waitlist form received");
        expect(model.intakeSummary.operationalLine).toContain("New lead created");
        expect(model.intakeSummary.statusLine).toContain("Review required");
        expect(model.needsAction.items).toContain("Review required before enrollment continues");
        expect(model.needsAction.clearMessage).toBeNull();
        expect(model.recommendedNextStep).toContain("Review intake");
    });

    it("shows lead created quick review for clean auto-operationalized case", () => {
        const model = buildIntakeQuickReviewViewModel({
            row: row({
                payload: {
                    values: {
                        guardian_full_name: "Jordan Test",
                        guardian_email: "jordan@example.com",
                        guardian_phone: "6025550100",
                    },
                    meta: {
                        intake_auto_operationalized: true,
                        intake_needs_review: false,
                        intake_resolution_path: "created_records",
                        intake_opportunity_match: "created",
                        intake_routing_work_unit_id: "wu-1",
                    },
                } as SubmissionInboxRow["payload"],
            }),
            formName: "Contact Us",
            submittedAtLabel: "May 27, 2026 6:09 PM",
        });

        expect(model.leadCreatedMode).toBe(true);
        expect(model.headerTitle).toBe("Lead created");
        expect(model.intakeSummary.capturedLine).toContain("new enrollment lead");
        expect(model.intakeSummary.statusLine).toBe("New Lead");
        expect(model.needsAction.clearMessage).toBe("No manual review required.");
        expect(model.needsAction.items).toHaveLength(0);
        expect(model.primaryOpenLabel).toBe("Open Lead");
        expect(model.leadCreatedFields?.email).toBe("jordan@example.com");
    });

    it("shows no manual review required for auto-operationalized case", () => {
        const model = buildIntakeQuickReviewViewModel({
            row: row({
                payload: {
                    values: { guardian_full_name: "Jordan Test" },
                    meta: {
                        intake_auto_operationalized: true,
                        intake_needs_review: false,
                        intake_resolution_path: "created_records",
                        intake_opportunity_match: "created",
                    },
                } as SubmissionInboxRow["payload"],
            }),
            formName: "Medication Authorization",
            submittedAtLabel: "May 27, 2026 6:09 PM",
        });

        expect(model.leadCreatedMode).toBe(true);
        expect(model.intakeSummary.statusLine).toBe("New Lead");
        expect(model.needsAction.clearMessage).toBe("No manual review required.");
        expect(model.needsAction.items).toHaveLength(0);
    });

    it("duplicate name mismatch shows possible existing family match", () => {
        const model = buildIntakeQuickReviewViewModel({
            row: row({
                payload: {
                    values: { guardian_full_name: "New Name" },
                    meta: {
                        intake_identity_name_mismatch: true,
                        intake_needs_review: true,
                        intake_resolution_path: "matched_email",
                        intake_opportunity_match: "attached_existing",
                    },
                } as SubmissionInboxRow["payload"],
            }),
            formName: "Contact Us",
            submittedAtLabel: "May 27, 2026 6:09 PM",
        });

        expect(model.leadCreatedMode).toBe(false);
        expect(model.needsAction.items).toContain("Possible existing family match");
        expect(model.needsAction.clearMessage).toBeNull();
    });

    it("keeps evidence details accessible", () => {
        const model = buildIntakeQuickReviewViewModel({
            row: row({
                payload: {
                    values: { guardian_full_name: "Jordan Test" },
                    signatures: { guardian: { signed_at: "2026-05-27T18:09:16.000Z" } },
                    meta: { document_id: "doc-1", intake_auto_operationalized: true, intake_needs_review: false },
                } as SubmissionInboxRow["payload"],
            }),
            formName: "Medication Authorization",
            submittedAtLabel: "May 27, 2026 6:09 PM",
            submissionCount: 2,
        });

        expect(model.evidence.formName).toBe("Medication Authorization");
        expect(model.evidence.submittedAtLabel).toContain("May 27");
        expect(model.evidence.hasSignature).toBe(true);
        expect(model.evidence.hasGeneratedDocument).toBe(true);
        expect(model.evidence.submissionCount).toBe(2);
    });

    it("does not expose raw meta keys in primary copy", () => {
        const model = buildIntakeQuickReviewViewModel({
            row: row({
                payload: {
                    meta: {
                        intake_needs_review: true,
                        intake_auto_operationalized: false,
                        intake_resolution_path: "matched_email",
                        intake_opportunity_match: "attached_existing",
                    },
                },
            }),
            formName: "Waitlist",
            submittedAtLabel: "May 27, 2026 6:09 PM",
        });

        const serialized = JSON.stringify(model);
        expect(serialized).not.toContain("intake_needs_review");
        expect(serialized).not.toContain("intake_resolution_path");
        expect(model.intakeSummary.operationalLine).toContain("Existing family update received");
    });

    it("flags confirm linkage when review required with links", () => {
        const model = buildIntakeQuickReviewViewModel({
            row: row({
                payload: { meta: { intake_needs_review: true, intake_resolution_path: "created_records" } },
            }),
            formName: "Waitlist",
            submittedAtLabel: "May 27, 2026 6:09 PM",
        });

        expect(model.showConfirmLinkage).toBe(true);
    });

    it("IC-5.6 — auto-operationalized lead with stale skipped path uses case context", () => {
        const model = buildIntakeQuickReviewViewModel({
            row: row({
                opportunity_id: null,
                payload: {
                    values: { guardian_full_name: "Jordan Test" },
                    meta: {
                        intake_resolution_path: "skipped_missing_config",
                        intake_needs_review: false,
                    },
                } as SubmissionInboxRow["payload"],
            }),
            formName: "Enrollment Lead — Demo",
            submittedAtLabel: "May 27, 2026 6:09 PM",
            caseContext: {
                opportunityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                statusBucket: "auto_operationalized",
                operationalizedState: "auto_operationalized",
                recommendedNextAction: "Open lead",
            },
        });

        expect(model.intakeSummary.operationalLine).toBe("New lead created · Auto-operationalized");
        expect(model.intakeSummary.statusLine).toBe("Auto-operationalized");
        expect(model.needsAction.clearMessage).toBe("No manual review required.");
        expect(model.needsAction.items).toHaveLength(0);
        expect(model.opportunityId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        expect(model.primaryOpenLabel).toBe("Open Lead");
    });

    it("IC-5.6 — review-required medication path still shows needs action", () => {
        const model = buildIntakeQuickReviewViewModel({
            row: row({
                customer_member_id: "cm1",
                payload: {
                    values: { guardian_full_name: "Jordan Test" },
                    meta: {
                        intake_needs_review: true,
                        intake_auto_operationalized: false,
                        intake_resolution_path: "created_records",
                        intake_review_decision: { reasons: ["child_member_auto_created"] },
                    },
                } as SubmissionInboxRow["payload"],
            }),
            formName: "Medication Authorization — Demo",
            submittedAtLabel: "May 27, 2026 6:09 PM",
            caseContext: {
                statusBucket: "review_required",
                operationalizedState: "none",
            },
        });

        expect(model.needsAction.items).toContain("Review required before enrollment continues");
        expect(model.needsAction.clearMessage).toBeNull();
        expect(model.intakeSummary.statusLine).toContain("Review required");
    });
});
