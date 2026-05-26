import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SubmissionIntakeCaseFileContent } from "@/components/forms/review/SubmissionIntakeCaseFileContent";
import type { SubmissionIntakeCaseFileRow } from "@/components/forms/review/SubmissionIntakeCaseFileContent";
import { buildEntityConnectionRows } from "@/lib/forms/submissionOutcomeSummary";

vi.mock("@/components/forms/admin/CrmEntitySearchPicker", () => ({
    default: () => null,
}));

vi.mock("@/components/forms/engine/FormEngineRenderer", () => ({
    FormEngineRenderer: () => <div data-testid="form-engine-readonly">answers</div>,
}));

function sectionPositions(html: string): number[] {
    return CASE_FILE_SECTION_ORDER.map((id) => html.indexOf(`id="${id}"`)).filter((i) => i >= 0);
}

function baseRow(overrides: Partial<SubmissionIntakeCaseFileRow> = {}): SubmissionIntakeCaseFileRow {
    return {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        form_definition_version_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "submitted",
        payload: {
            meta: {
                intake_needs_review: true,
                intake_resolution_path: "created_person",
            },
            values: {},
        },
        person_id: null,
        customer_id: null,
        customer_member_id: null,
        opportunity_id: null,
        created_via_public_link_id: null,
        created_at: "2026-05-01T10:00:00.000Z",
        submitted_at: "2026-05-02T12:00:00.000Z",
        linked_documents: [],
        ...overrides,
    };
}

function renderCaseFile(overrides: Partial<React.ComponentProps<typeof SubmissionIntakeCaseFileContent>> = {}) {
    const row = baseRow();
    const entityRows = buildEntityConnectionRows(row);
    return renderToStaticMarkup(
        <SubmissionIntakeCaseFileContent
            row={row}
            schema={{ title: "Enrollment intake", version: 1, fields: [] }}
            viewerTimezone="UTC"
            canMutate
            lifecycle={{ headline: "Submitted — linkage needs review", notes: ["Intake flagged for operator review."] }}
            entityRows={entityRows}
            intakeSection={null}
            intakeNeedsAttention
            intakeReviewedAt={null}
            linkageCalloutVisible
            linkageCalloutReasons={["Intake asked for a human check before document generation."]}
            showLinkageWorkflowSection
            needsConfirmLinkage
            docGenBlocked={{ blocked: true, reason: "Confirm CRM linkage before generating documents." }}
            documentOutcome={{ headline: "No PDF generated yet", bullets: ["Generate when linkage is confirmed."] }}
            nextSteps={["Confirm or correct CRM links.", "Generate document when ready."]}
            bosSubmissionContext={null}
            launchContext={{}}
            hasLaunchContextDisplay={false}
            confirmBusy={false}
            confirmErr={null}
            onConfirmLinkage={() => {}}
            manualBusy={false}
            manualErr={null}
            onApplyManualLinks={() => {}}
            manualPerson=""
            onManualPersonChange={() => {}}
            manualCustomer=""
            onManualCustomerChange={() => {}}
            manualMember=""
            onManualMemberChange={() => {}}
            manualOpp=""
            onManualOppChange={() => {}}
            pickPerson={null}
            onPickPerson={() => {}}
            pickCustomer={null}
            onPickCustomer={() => {}}
            pickMember={null}
            onPickMember={() => {}}
            pickOpp={null}
            onPickOpp={() => {}}
            genBusy={false}
            genErr={null}
            genMsg={null}
            onGenerateDocument={() => {}}
            onOpenDrawer={() => {}}
            {...overrides}
        />
    );
}

describe("SubmissionIntakeCaseFileContent OW-6", () => {
    it("renders case-file header and layout", () => {
        const html = renderCaseFile();
        expect(html).toContain('data-testid="intake-case-file-layout"');
        expect(html).toContain('data-testid="submission-case-file-header"');
        expect(html).toContain("Intake review");
        expect(html).toContain("Enrollment intake");
    });

    it("renders needs attention before submitted form answers", () => {
        const html = renderCaseFile();
        const attention = html.indexOf('id="needs-attention"');
        const forms = html.indexOf('id="submitted-forms"');
        expect(attention).toBeGreaterThan(0);
        expect(forms).toBeGreaterThan(attention);
        expect(html).toContain("Needs attention");
    });

    it("keeps technical details in collapsed disclosures", () => {
        const html = renderCaseFile();
        expect(html).toContain('data-testid="forms-technical-detail-disclosure"');
        expect(html).toContain("Technical details");
        const reviewActions = html.indexOf('id="review-actions"');
        const technical = html.indexOf('data-testid="forms-technical-detail-disclosure"');
        expect(reviewActions).toBeGreaterThan(0);
        expect(technical).toBeGreaterThan(reviewActions);
    });

    it("shows documents empty state and preserves linkage actions", () => {
        const html = renderCaseFile();
        expect(html).toContain("No generated documents yet.");
        expect(html).toContain('data-testid="linkage-workflow-section"');
        expect(html).toContain('data-testid="confirm-linkage-primary"');
        expect(html).toContain('data-testid="apply-manual-links"');
        expect(html).toContain('data-testid="manual-link-person"');
    });
});
