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

        expect(model.intakeSummary.operationalLine).toContain("Auto-operationalized");
        expect(model.intakeSummary.statusLine).toBe("Auto-operationalized");
        expect(model.needsAction.clearMessage).toBe("No manual review required.");
        expect(model.needsAction.items).toHaveLength(0);
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
        expect(model.intakeSummary.operationalLine).toContain("Attached to existing family");
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
});
