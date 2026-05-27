import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SubmissionQuickReviewModal } from "@/components/forms/workspace/SubmissionQuickReviewModal";

vi.mock("@/contexts/AdminAuthContext", () => ({
    useAdminAuth: () => ({ canMutate: true, role: "admin" }),
}));

const formId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const reviewRow = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    status: "submitted",
    created_at: "2026-05-01T09:00:00.000Z",
    submitted_at: "2026-05-27T18:09:16.000Z",
    form_definition_id: formId,
    person_id: "p1",
    customer_id: "c1",
    opportunity_id: "o1",
    payload: {
        values: { guardian_full_name: "Jordan Test" },
        meta: {
            intake_needs_review: true,
            intake_resolution_path: "created_records",
            intake_opportunity_match: "created",
        },
    },
};

const autoOpRow = {
    ...reviewRow,
    payload: {
        values: { guardian_full_name: "Jordan Test" },
        meta: {
            intake_auto_operationalized: true,
            intake_needs_review: false,
            intake_resolution_path: "created_records",
            intake_opportunity_match: "created",
        },
    },
};

describe("SubmissionQuickReviewModal IC-6", () => {
    it("renders intake summary sections with operator-first copy", () => {
        const html = renderToStaticMarkup(
            <SubmissionQuickReviewModal
                open
                onClose={() => {}}
                row={reviewRow}
                formName="Waitlist"
                viewerTz="UTC"
            />
        );

        expect(html).toContain('data-testid="submission-quick-review-modal"');
        expect(html).toContain('data-testid="quick-review-intake-summary"');
        expect(html).toContain('data-testid="quick-review-needs-action"');
        expect(html).toContain('data-testid="quick-review-next-step"');
        expect(html).toContain('data-testid="quick-review-evidence"');
        expect(html).toContain("Intake summary");
        expect(html).toContain("Waitlist form received");
        expect(html).toContain("Review required before enrollment continues");
        expect(html).not.toContain("intake_needs_review");
        expect(html).not.toContain("payload meta");
    });

    it("shows no manual review required for auto-operationalized intake", () => {
        const html = renderToStaticMarkup(
            <SubmissionQuickReviewModal
                open
                onClose={() => {}}
                row={autoOpRow}
                formName="Medication Authorization"
                viewerTz="UTC"
            />
        );

        expect(html).toContain('data-testid="quick-review-no-action"');
        expect(html).toContain("No manual review required.");
        expect(html).toContain("Auto-operationalized");
    });

    it("renders confirm linkage action for review-required linked intake", () => {
        const html = renderToStaticMarkup(
            <SubmissionQuickReviewModal
                open
                onClose={() => {}}
                row={reviewRow}
                formName="Waitlist"
                viewerTz="UTC"
            />
        );

        expect(html).toContain('data-testid="quick-review-confirm-linkage"');
        expect(html).toContain("Confirm family match");
        expect(html).toContain("Open intake file");
    });

    it("shows evidence block with form and timestamp", () => {
        const html = renderToStaticMarkup(
            <SubmissionQuickReviewModal
                open
                onClose={() => {}}
                row={{
                    ...autoOpRow,
                    payload: {
                        ...autoOpRow.payload,
                        signatures: { guardian: { signed_at: "2026-05-27T18:09:16.000Z" } },
                    },
                }}
                formName="Medication Authorization"
                viewerTz="UTC"
                submissionCount={2}
            />
        );

        expect(html).toContain("Evidence");
        expect(html).toContain("Form · Medication Authorization");
        expect(html).toContain("2 forms in this intake case");
        expect(html).toContain("Signed");
    });

    it("returns null when closed", () => {
        const html = renderToStaticMarkup(
            <SubmissionQuickReviewModal
                open={false}
                onClose={() => {}}
                row={reviewRow}
                formName="Waitlist"
                viewerTz="UTC"
            />
        );

        expect(html).toBe("");
    });
});
