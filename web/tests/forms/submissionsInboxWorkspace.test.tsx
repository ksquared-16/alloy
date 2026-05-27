import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SubmissionsInboxView } from "@/components/forms/workspace/SubmissionsInboxView";
import { submissionDetailHref } from "@/components/forms/workspace/SubmissionInboxRowView";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

const formId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function row(overrides: Partial<SubmissionInboxRow> = {}): SubmissionInboxRow {
    return {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "submitted",
        created_at: "2026-05-01T10:00:00.000Z",
        submitted_at: "2026-05-02T12:00:00.000Z",
        form_definition_id: formId,
        person_id: "11111111-1111-4111-8111-111111111111",
        payload: {
            meta: {
                intake_needs_review: true,
                intake_review_reason: "Auto-created child member",
            },
        },
        ...overrides,
    };
}

describe("SubmissionsInboxView OW-6", () => {
    it("renders grouped inbox lanes with review-first emphasis", () => {
        const html = renderToStaticMarkup(
            <SubmissionsInboxView
                rows={[
                    row(),
                    row({
                        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                        status: "draft",
                        submitted_at: null,
                        payload: undefined,
                    }),
                    row({
                        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                        person_id: null,
                        payload: { meta: {} },
                    }),
                ]}
                formsById={{ [formId]: "Enrollment form" }}
                viewerTz="UTC"
            />
        );

        expect(html).toContain('data-testid="submissions-inbox"');
        expect(html).toContain('data-testid="submission-inbox-lane-needs-review"');
        expect(html).toContain('data-testid="submission-inbox-lane-drafts"');
        expect(html).toContain('data-testid="submission-inbox-lane-needs-linking"');
        expect(html).toContain("Quick review");
        expect(html).toContain("Continue draft");
        expect(html).toContain("Enrollment form");
        expect(html).toContain("Auto-created child member");
        expect(html).not.toContain("<table");
        expect(html.indexOf("Needs review")).toBeLessThan(html.indexOf("Drafts"));
    });

    it("action links route to submission review page", () => {
        const submissionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        const href = submissionDetailHref(formId, submissionId);
        const html = renderToStaticMarkup(
            <SubmissionsInboxView
                rows={[row()]}
                formsById={{ [formId]: "Enrollment form" }}
                viewerTz="UTC"
            />
        );

        expect(html).toContain(`href="${href}"`);
        expect(html).toContain(`data-testid="submission-inbox-action-${submissionId}"`);
    });

    it("renders calm empty state when no rows", () => {
        const html = renderToStaticMarkup(
            <SubmissionsInboxView rows={[]} formsById={{}} viewerTz="UTC" emptyMessage="No submissions yet." />
        );

        expect(html).toContain("No submissions yet.");
    });

    it("shows lane empty copy when rows exist but lane is empty", () => {
        const html = renderToStaticMarkup(
            <SubmissionsInboxView
                rows={[
                    row({
                        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                        status: "draft",
                        submitted_at: null,
                        payload: undefined,
                    }),
                ]}
                formsById={{ [formId]: "Enrollment form" }}
                viewerTz="UTC"
            />
        );

        expect(html).toContain("No submissions need review right now.");
        expect(html).toContain("Submitted responses will appear here after families complete forms.");
        expect(html).toContain("Enrollment form");
    });
});
