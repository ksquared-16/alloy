import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormLifecycleWorkspaceLayout } from "@/components/forms/workspace/FormLifecycleWorkspaceLayout";
import { buildFormLifecycleSteps } from "@/lib/forms/formLifecyclePresentation";

vi.mock("@/contexts/AdminAuthContext", () => ({
    useAdminAuth: () => ({ canMutate: true }),
}));

vi.mock("@/app/admin/forms/FormSchemaWorkspace", () => ({
    default: () => <div data-testid="form-schema-workspace-mock">Schema workspace</div>,
}));

vi.mock("@/components/forms/workspace/FormIntakePreviewPanel", () => ({
    FormIntakePreviewPanel: () => <div data-testid="form-intake-preview-mock">Intake preview</div>,
}));

vi.mock("@/components/forms/admin/FormIntakeRuntimeOrchestrationPanel", () => ({
    FormIntakeRuntimeOrchestrationPanel: () => (
        <div data-testid="form-intake-runtime-orchestration-mock">Runtime orchestration</div>
    ),
}));

const formId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

describe("FormLifecycleWorkspaceLayout OW-3", () => {
    it("renders lifecycle band, primary actions, and workspace regions", () => {
        const html = renderToStaticMarkup(
            <FormLifecycleWorkspaceLayout
                formId={formId}
                detail={{
                    id: formId,
                    key: "waitlist",
                    name: "Waitlist",
                    kind: "intake",
                    is_active: true,
                    metadata: {},
                    versions: [
                        {
                            id: "11111111-1111-4111-8111-111111111111",
                            version_number: 1,
                            status: "published",
                            published_at: "2026-05-01T10:00:00.000Z",
                            created_at: "2026-05-01T09:00:00.000Z",
                            updated_at: "2026-05-01T10:00:00.000Z",
                        },
                        {
                            id: "22222222-2222-4222-8222-222222222222",
                            version_number: 2,
                            status: "draft",
                            published_at: null,
                            created_at: "2026-05-02T09:00:00.000Z",
                            updated_at: "2026-05-02T09:00:00.000Z",
                        },
                    ],
                }}
                viewerTz="UTC"
                canMutate
                publishSummary="Published · draft in progress"
                publishTone="success"
                purposeLine="Capture family interest"
                lifecycleSteps={buildFormLifecycleSteps({
                    hasDraft: true,
                    hasPublished: true,
                    activeLinkCount: 1,
                    submissionCount: 3,
                    submittedCount: 2,
                    documentGenerationConfigured: false,
                })}
                submissionCount={3}
                documentGenerationConfigured={false}
                links={[]}
                creating={false}
                createErr={null}
                createdOnce={null}
                copied={null}
                copyWarn={null}
                previewBusy={false}
                previewErr={null}
                hasPublished
                latestPublished={{
                    id: "11111111-1111-4111-8111-111111111111",
                    version_number: 1,
                    status: "published",
                    published_at: "2026-05-01T10:00:00.000Z",
                    created_at: "2026-05-01T09:00:00.000Z",
                    updated_at: "2026-05-01T10:00:00.000Z",
                }}
                operatorGuide={{
                    purpose: "Capture waitlist interest.",
                    whoCompletes: "Families complete this form.",
                    afterSubmission: "Review in intake inbox.",
                    connectedBullets: [{ id: "1", text: "CRM intake when configured." }],
                }}
                onPreview={() => {}}
                onCreateLink={() => {}}
                onCopy={() => {}}
                onVersionsUpdated={() => {}}
                selectedRuntimeLinkId={null}
                onSelectedRuntimeLinkChange={() => {}}
                createdOnceLinkId={null}
                openPublicEmbedUrl={null}
            />
        );

        expect(html).toContain('data-testid="form-lifecycle-rail"');
        expect(html).toContain('data-testid="form-action-preview"');
        expect(html).not.toContain('data-testid="form-action-create-link"');
        expect(html).toContain('data-testid="form-action-submissions"');
        expect(html).not.toContain("Create link");
        expect(html).toContain("Share form");
        expect(html).toContain("Draft in progress");
        expect(html).toContain("Submissions (3)");
        expect(html).toContain('data-testid="form-region-design"');
        expect(html).toContain('data-testid="form-region-operational-outcome"');
        expect(html).toContain('data-testid="form-region-runtime-orchestration"');
        expect(html).toContain("What happens after submit");
        expect(html).not.toContain('data-testid="form-region-distribute"');
        expect(html).toContain('data-testid="form-region-intake"');
        expect(html).toContain('data-testid="form-region-review"');
        expect(html).toContain('data-testid="form-schema-workspace-mock"');
        expect(html).toContain("Published · draft in progress");
        expect(html).toContain("Operator context");
        expect(html).not.toContain("Operator guide");
        expect(html).not.toContain("<table");
    });

    it("keeps technical details in collapsed disclosures", () => {
        const html = renderToStaticMarkup(
            <FormLifecycleWorkspaceLayout
                formId={formId}
                detail={{
                    id: formId,
                    key: "waitlist",
                    name: "Waitlist",
                    kind: "intake",
                    is_active: true,
                    metadata: {},
                    versions: [],
                }}
                viewerTz="UTC"
                canMutate={false}
                publishSummary="Not published"
                publishTone="neutral"
                purposeLine={null}
                lifecycleSteps={buildFormLifecycleSteps({
                    hasDraft: false,
                    hasPublished: false,
                    activeLinkCount: 0,
                    submissionCount: 0,
                    submittedCount: 0,
                    documentGenerationConfigured: false,
                })}
                submissionCount={0}
                documentGenerationConfigured={false}
                links={[]}
                creating={false}
                createErr={null}
                createdOnce={null}
                copied={null}
                copyWarn={null}
                previewBusy={false}
                previewErr={null}
                hasPublished={false}
                latestPublished={undefined}
                operatorGuide={{
                    purpose: "Purpose",
                    whoCompletes: "Who",
                    afterSubmission: "After",
                    connectedBullets: [],
                }}
                onPreview={() => {}}
                onCreateLink={() => {}}
                onCopy={() => {}}
                onVersionsUpdated={() => {}}
                selectedRuntimeLinkId={null}
                onSelectedRuntimeLinkChange={() => {}}
                createdOnceLinkId={null}
                openPublicEmbedUrl={null}
            />
        );

        expect(html).toContain("<details");
        expect(html).toContain("Form definition id");
    });
});
